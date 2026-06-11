import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Zip } from "../Zip.js";
import { createZip, parseArgs } from "../zipcli.js";

const decoder = new TextDecoder();

test("parses output and password options", () => {
  assert.deepEqual(parseArgs(["-o", "out.zip", "-p", "secret", "input"]), {
    inputs: ["input"],
    output: "out.zip",
    password: "secret",
  });
  assert.throws(() => parseArgs(["-o"]), /requires a value/);
});

test("creates a password-protected ZIP from a directory", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zipcli-"));
  const source = join(dir, "source");
  const output = join(dir, "result.zip");
  await mkdir(join(source, "sub"), { recursive: true });
  await writeFile(join(source, "hello.txt"), "hello");
  await writeFile(join(source, "sub", "data.txt"), "data");

  const result = await createZip({ inputs: [source], output, password: "secret" });
  assert.equal(result.count, 2);
  const files = Zip.decompress(await readFile(output), "secret");
  assert.equal(decoder.decode(files["source/hello.txt"]), "hello");
  assert.equal(decoder.decode(files["source/sub/data.txt"]), "data");
});
