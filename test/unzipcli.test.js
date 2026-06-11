import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Zip } from "../Zip.js";
import { extractFiles, extractZip, findPassword, parseArgs } from "../unzipcli.js";

test("parses extraction and attack options", () => {
  assert.deepEqual(parseArgs([
    "-attack", "-o", "out", "-max", "3", "-chars", "ab", "data.zip",
  ]), {
    attack: true,
    output: "out",
    maxLength: 3,
    chars: "ab",
    input: "data.zip",
  });
  assert.throws(() => parseArgs(["-attack", "-p", "secret", "data.zip"]), /cannot/);
});

test("finds a password from length one upward", async () => {
  const data = Zip.compress({ "secret.txt": "secret" }, { password: "ba" });
  assert.deepEqual(await findPassword(data, { chars: "ab", maxLength: 2 }), {
    password: "ba",
    attempts: 5,
  });
  assert.deepEqual(await findPassword(data, { chars: "a", maxLength: 2 }), {
    password: null,
    attempts: 2,
  });
});

test("reports attack progress with attempts and current password", async () => {
  const data = Zip.compress({ "secret.txt": "secret" }, { password: "b" });
  const progress = [];
  await findPassword(data, {
    chars: "ab",
    maxLength: 1,
    progressInterval: 0,
    onProgress: (status) => progress.push(status),
  });
  assert.deepEqual(progress, [
    { attempts: 1, password: "a" },
    { attempts: 2, password: "b" },
  ]);
});

test("extracts a password-protected ZIP after attack", async () => {
  const dir = await mkdtemp(join(tmpdir(), "unzipcli-"));
  const archive = join(dir, "secret.zip");
  const output = join(dir, "output");
  await writeFile(archive, Zip.compress({ "sub/data.txt": "classified" }, { password: "b" }));

  const result = await extractZip({
    input: archive,
    output,
    attack: true,
    chars: "ab",
    maxLength: 1,
  });
  assert.equal(result.password, "b");
  assert.equal((await readFile(join(output, "sub/data.txt"), "utf8")), "classified");
});

test("rejects paths outside the output directory", async () => {
  const dir = await mkdtemp(join(tmpdir(), "unzipcli-path-"));
  await assert.rejects(() => extractFiles({ "../outside.txt": new Uint8Array() }, dir), /unsafe path/);
});
