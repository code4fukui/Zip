#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { inflateRawSync } from "node:zlib";
import { Zip } from "./Zip.js";

const DEFAULT_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const encoder = new TextEncoder();
const crcTable = new Uint32Array(256);
for (let i = 0; i < crcTable.length; i++) {
  let crc = i;
  for (let bit = 0; bit < 8; bit++) {
    crc = crc & 1 ? 0xedb88320 ^ crc >>> 1 : crc >>> 1;
  }
  crcTable[i] = crc >>> 0;
}

const read16 = (data, offset) => data[offset] | data[offset + 1] << 8;
const read32 = (data, offset) => (data[offset] | data[offset + 1] << 8 |
  data[offset + 2] << 16 | data[offset + 3] << 24) >>> 0;
const updateCrc = (crc, value) => (crcTable[(crc ^ value) & 0xff] ^ crc >>> 8) >>> 0;
const calculateCrc = (data) => {
  let crc = 0xffffffff;
  for (const value of data) crc = updateCrc(crc, value);
  return (crc ^ 0xffffffff) >>> 0;
};

const decryptEntry = (data, offset, password) => {
  const compressedSize = read32(data, offset + 18);
  const uncompressedSize = read32(data, offset + 22);
  const dataOffset = offset + 30 + read16(data, offset + 26) + read16(data, offset + 28);
  if (compressedSize < 12 || dataOffset + compressedSize > data.length) {
    throw new Error("invalid encrypted ZIP entry");
  }
  const keys = new Uint32Array([0x12345678, 0x23456789, 0x34567890]);
  const updateKeys = (value) => {
    keys[0] = updateCrc(keys[0], value);
    keys[1] = (Math.imul((keys[1] + (keys[0] & 0xff)) >>> 0, 134775813) + 1) >>> 0;
    keys[2] = updateCrc(keys[2], keys[1] >>> 24);
  };
  for (const value of encoder.encode(password)) updateKeys(value);
  const decrypted = new Uint8Array(compressedSize - 12);
  for (let i = 0; i < compressedSize; i++) {
    const value = (keys[2] | 2) >>> 0;
    const plain = data[dataOffset + i] ^ (Math.imul(value, value ^ 1) >>> 8 & 0xff);
    updateKeys(plain);
    if (i >= 12) decrypted[i - 12] = plain;
  }
  const method = read16(data, offset + 8);
  const output = method == 0
    ? decrypted
    : method == 8
    ? new Uint8Array(inflateRawSync(decrypted, { maxOutputLength: uncompressedSize }))
    : (() => { throw new Error(`unsupported compression method: ${method}`); })();
  return output.length == uncompressedSize && calculateCrc(output) == read32(data, offset + 14);
};

const passwordIsValid = (data, password) => {
  if (!Zip.checkPassword(data, password)) return false;
  let offset = 0;
  while (read32(data, offset) == 0x04034b50) {
    const flags = read16(data, offset + 6);
    if (flags & 8) throw new Error("-attack does not support ZIP data descriptors");
    if (flags & 1 && !decryptEntry(data, offset, password)) return false;
    offset += 30 + read16(data, offset + 26) + read16(data, offset + 28) +
      read32(data, offset + 18);
  }
  return true;
};

const usage = `Usage: unzipcli.js [-o directory] [-p password] <archive.zip>
       unzipcli.js -attack [-o directory] [-max length] [-chars characters] <archive.zip>

Options:
  -o <directory>  Output directory
  -p <password>   Password for an encrypted ZIP
  -attack         Try passwords from length 1 upward
  -max <length>   Maximum attack length (default: 4)
  -chars <chars>  Attack character set (default: a-z, A-Z, 0-9)
  -h, --help      Show this help`;

export const parseArgs = (args) => {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg == "-h" || arg == "--help") {
      options.help = true;
    } else if (arg == "-attack") {
      options.attack = true;
    } else if (["-o", "-p", "-max", "-chars"].includes(arg)) {
      const value = args[++i];
      if (value == null || value == "") throw new Error(`${arg} requires a value`);
      if (arg == "-o") options.output = value;
      else if (arg == "-p") options.password = value;
      else if (arg == "-max") options.maxLength = Number(value);
      else options.chars = value;
    } else if (arg.startsWith("-")) {
      throw new Error(`unknown option: ${arg}`);
    } else if (options.input) {
      throw new Error("only one ZIP archive can be specified");
    } else {
      options.input = arg;
    }
  }
  if (options.attack && options.password != null) {
    throw new Error("-attack and -p cannot be used together");
  }
  return options;
};

const validateAttackOptions = (chars, maxLength) => {
  if (chars.length == 0) throw new Error("attack character set must not be empty");
  if ([...new Set(chars)].length != [...chars].length) {
    throw new Error("attack character set must not contain duplicates");
  }
  if (!Number.isSafeInteger(maxLength) || maxLength < 1) {
    throw new Error("attack maximum length must be a positive integer");
  }
};

export const findPassword = async (data, options = {}) => {
  const chars = [...(options.chars ?? DEFAULT_CHARS)];
  const maxLength = options.maxLength ?? 4;
  const progressInterval = options.progressInterval ?? 3000;
  const onProgress = options.onProgress;
  validateAttackOptions(chars, maxLength);
  if (!Number.isFinite(progressInterval) || progressInterval < 0) {
    throw new Error("progress interval must be a non-negative number");
  }
  let attempts = 0;
  let lastProgress = Date.now();
  let lastYield = lastProgress;

  for (let length = 1; length <= maxLength; length++) {
    const indexes = Array(length).fill(0);
    while (true) {
      const password = indexes.map((index) => chars[index]).join("");
      attempts++;
      const now = Date.now();
      if (onProgress && now - lastProgress >= progressInterval) {
        onProgress({ attempts, password });
        lastProgress = now;
      }
      let valid = false;
      try {
        valid = passwordIsValid(data, password);
      } catch {
        // Header false positives can still contain invalid compressed data.
      }
      if (valid) {
        try {
          Zip.decompress(Uint8Array.from(data), password);
          return { password, attempts };
        } catch {
          // ZipCrypto's one-byte header check can produce false positives.
        }
      }
      if (now - lastYield >= 50) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        lastYield = Date.now();
      }

      let position = length - 1;
      while (position >= 0 && ++indexes[position] == chars.length) {
        indexes[position] = 0;
        position--;
      }
      if (position < 0) break;
    }
  }
  return { password: null, attempts };
};

const safeTargetPath = (outputPath, name) => {
  const normalized = name.replaceAll("\\", "/");
  const target = resolve(outputPath, normalized);
  if (target == outputPath || !target.startsWith(`${outputPath}${sep}`)) {
    throw new Error(`unsafe path in ZIP: ${name}`);
  }
  return target;
};

export const extractFiles = async (files, output) => {
  const outputPath = resolve(output);
  await mkdir(outputPath, { recursive: true });
  for (const [name, data] of Object.entries(files)) {
    const target = safeTargetPath(outputPath, name);
    await mkdir(resolve(target, ".."), { recursive: true });
    await writeFile(target, data);
  }
  return { outputPath, count: Object.keys(files).length };
};

export const extractZip = async ({
  input,
  output,
  password,
  attack,
  chars,
  maxLength,
  onProgress,
  progressInterval,
}) => {
  if (!input) throw new Error("no ZIP archive specified");
  const inputPath = resolve(input);
  const data = await readFile(inputPath);
  let actualPassword = password;
  let attempts = 0;

  if (attack) {
    const result = await findPassword(data, {
      chars,
      maxLength,
      onProgress,
      progressInterval,
    });
    if (result.password == null) {
      throw new Error(`password not found after ${result.attempts} attempts`);
    }
    actualPassword = result.password;
    attempts = result.attempts;
  }

  const files = Zip.decompress(Uint8Array.from(data), { password: actualPassword });
  const defaultName = basename(inputPath, extname(inputPath));
  const result = await extractFiles(files, output ?? defaultName);
  return { ...result, password: attack ? actualPassword : undefined, attempts };
};

export const main = async (args = process.argv.slice(2)) => {
  const options = parseArgs(args);
  if (options.help) {
    console.log(usage);
    return;
  }
  const result = await extractZip({
    ...options,
    progressInterval: 3000,
    onProgress: ({ attempts, password }) => {
      console.log(`Tried ${attempts} passwords; current: ${password}`);
    },
  });
  if (result.password != null) {
    console.log(`Password found: ${result.password} (${result.attempts} attempts)`);
  }
  console.log(`Extracted ${result.count} files to ${result.outputPath}`);
};

if (import.meta.url == pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`unzipcli.js: ${error.message}`);
    console.error(usage);
    process.exitCode = 1;
  });
}
