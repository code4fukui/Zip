#!/usr/bin/env node

import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { Zip } from "./Zip.js";

const usage = `Usage: zipcli.js [-o output.zip] [-p password] <file|directory>...

Options:
  -o <file>      Output ZIP file
  -p <password>  Encrypt files using ZipCrypto
  -h, --help     Show this help`;

export const parseArgs = (args) => {
  const options = { inputs: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg == "-h" || arg == "--help") {
      options.help = true;
    } else if (arg == "-o" || arg == "-p") {
      const value = args[++i];
      if (value == null || value == "") throw new Error(`${arg} requires a value`);
      if (arg == "-o") options.output = value;
      else options.password = value;
    } else if (arg.startsWith("-")) {
      throw new Error(`unknown option: ${arg}`);
    } else {
      options.inputs.push(arg);
    }
  }
  return options;
};

const archiveName = (path) => path.split(sep).join("/");

const collectDirectory = async (root, path, files, excludedPath) => {
  const entries = await readdir(path, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const fullPath = resolve(path, entry.name);
    if (fullPath == excludedPath) continue;
    if (entry.isDirectory()) {
      await collectDirectory(root, fullPath, files, excludedPath);
    } else if (entry.isFile()) {
      files.push({
        name: archiveName(`${basename(root)}/${relative(root, fullPath)}`),
        data: await readFile(fullPath),
        date: (await stat(fullPath)).mtime,
      });
    }
  }
};

export const createZip = async ({ inputs, output, password }) => {
  if (inputs.length == 0) throw new Error("no input files");
  const outputPath = resolve(output ?? (inputs.length == 1
    ? `${basename(resolve(inputs[0]))}.zip`
    : "archive.zip"));
  const files = [];

  for (const input of inputs) {
    const inputPath = resolve(input);
    const info = await stat(inputPath);
    if (info.isDirectory()) {
      await collectDirectory(inputPath, inputPath, files, outputPath);
    } else if (info.isFile()) {
      if (inputPath == outputPath) throw new Error("output file cannot also be an input");
      files.push({ name: basename(inputPath), data: await readFile(inputPath), date: info.mtime });
    } else {
      throw new Error(`unsupported input: ${input}`);
    }
  }

  if (files.length == 0) throw new Error("no files to compress");
  await writeFile(outputPath, Zip.compress(files, { password }));
  return { outputPath, count: files.length };
};

export const main = async (args = process.argv.slice(2)) => {
  const options = parseArgs(args);
  if (options.help) {
    console.log(usage);
    return;
  }
  const result = await createZip(options);
  console.log(`Created ${result.outputPath} (${result.count} files)`);
};

if (import.meta.url == pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`zipcli.js: ${error.message}`);
    console.error(usage);
    process.exitCode = 1;
  });
}
