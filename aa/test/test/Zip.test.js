import assert from "node:assert/strict";
import test from "node:test";
import { Zip } from "../Zip.js";

const decoder = new TextDecoder();
const date = new Date(2024, 0, 2, 3, 4, 6);

test("compresses and decompresses multiple files", () => {
  const compressed = Zip.compress({
    "hello.txt": "Hello, ZIP!",
    "data.bin": Uint8Array.from([0, 1, 2, 255]),
    "日本語.txt": "こんにちは",
  }, { date });

  assert.ok(compressed instanceof Uint8Array);
  assert.equal(compressed[7] & 0x08, 0x08, "ZIP header marks names as UTF-8");
  const files = Zip.decompress(compressed);
  assert.deepEqual(Object.keys(files), ["hello.txt", "data.bin", "日本語.txt"]);
  assert.equal(decoder.decode(files["hello.txt"]), "Hello, ZIP!");
  assert.deepEqual(files["data.bin"], Uint8Array.from([0, 1, 2, 255]));
  assert.equal(decoder.decode(files["日本語.txt"]), "こんにちは");
});

test("supports Map, tuple entries, and stored files", () => {
  const fromMap = Zip.decompress(Zip.compress(new Map([["map.txt", "map"]]), { date }));
  assert.equal(decoder.decode(fromMap["map.txt"]), "map");

  const stored = Zip.decompress(Zip.compress([["raw.txt", "raw"]], { store: true, date }));
  assert.equal(decoder.decode(stored["raw.txt"]), "raw");
});

test("compresses and decompresses password-protected files", () => {
  const compressed = Zip.compress({ "secret.txt": "classified" }, {
    password: "secret-password",
    date,
  });

  assert.equal(compressed[6] & 1, 1, "ZIP header marks data as encrypted");
  const files = Zip.decompress(compressed, { password: "secret-password" });
  assert.equal(decoder.decode(files["secret.txt"]), "classified");
  assert.throws(() => Zip.decompress(compressed), /please set password/);
  assert.throws(
    () => Zip.decompress(compressed, "wrong-password"),
    /wrong crc|invalid|input buffer is broken|unknown BTYPE/,
  );
});

test("supports per-file passwords", () => {
  const compressed = Zip.compress([
    { name: "secret.txt", data: "secret", password: "file-password", date },
  ]);
  const files = Zip.decompress(compressed, "file-password");
  assert.equal(decoder.decode(files["secret.txt"]), "secret");
});

test("rejects invalid input", () => {
  assert.throws(() => Zip.compress(null), /files must be/);
  assert.throws(() => Zip.compress([{ data: "missing name" }]), /non-empty name/);
  assert.throws(() => Zip.compress({ "bad.txt": 123 }), /ZIP file data/);
  assert.throws(() => Zip.compress({ "bad.txt": "data" }, { password: "" }), /must not be empty/);
});
