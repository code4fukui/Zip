import { zip } from "./lib/zip.js";
import { unzip } from "./lib/unzip.js";

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

const markUtf8Filenames = (data) => {
  let offset = 0;
  while (read32(data, offset) == 0x04034b50) {
    const flags = read16(data, offset + 6) | 0x0800;
    data[offset + 6] = flags & 0xff;
    data[offset + 7] = flags >>> 8;
    offset += 30 + read16(data, offset + 26) + read16(data, offset + 28) +
      read32(data, offset + 18);
  }
  while (read32(data, offset) == 0x02014b50) {
    const flags = read16(data, offset + 8) | 0x0800;
    data[offset + 8] = flags & 0xff;
    data[offset + 9] = flags >>> 8;
    offset += 46 + read16(data, offset + 28) + read16(data, offset + 30) +
      read16(data, offset + 32);
  }
  return data;
};

const toBytes = (value) => {
  if (typeof value == "string") return encoder.encode(value);
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (Array.isArray(value)) return Uint8Array.from(value);
  throw new TypeError("ZIP file data must be a string, byte array, or ArrayBuffer");
};

const toPassword = (password) => {
  if (password == null) return undefined;
  const bytes = toBytes(password);
  if (bytes.length == 0) throw new TypeError("password must not be empty");
  return bytes;
};

const passwordMatchesEntry = (data, offset, password) => {
  const flags = read16(data, offset + 6);
  const headerOffset = offset + 30 + read16(data, offset + 26) + read16(data, offset + 28);
  if (headerOffset + 12 > data.length) throw new Error("invalid ZIP encryption header");
  const keys = new Uint32Array([0x12345678, 0x23456789, 0x34567890]);
  const updateCrc = (crc, value) =>
    (crcTable[(crc ^ value) & 0xff] ^ crc >>> 8) >>> 0;
  const updateKeys = (value) => {
    keys[0] = updateCrc(keys[0], value);
    keys[1] = (Math.imul((keys[1] + (keys[0] & 0xff)) >>> 0, 134775813) + 1) >>> 0;
    keys[2] = updateCrc(keys[2], keys[1] >>> 24);
  };
  for (const value of password) updateKeys(value);
  let last = 0;
  for (let i = 0; i < 12; i++) {
    const value = (keys[2] | 2) >>> 0;
    last = data[headerOffset + i] ^ (Math.imul(value, value ^ 1) >>> 8 & 0xff);
    updateKeys(last);
  }
  const expected = flags & 8
    ? read16(data, offset + 10) >>> 8
    : read32(data, offset + 14) >>> 24;
  return last == expected;
};

const checkPassword = (data, password) => {
  let offset = 0;
  let encrypted = 0;
  while (read32(data, offset) == 0x04034b50) {
    const flags = read16(data, offset + 6);
    if (flags & 1) {
      encrypted++;
      if (!passwordMatchesEntry(data, offset, password)) return { encrypted, valid: false };
    }
    offset += 30 + read16(data, offset + 26) + read16(data, offset + 28) +
      read32(data, offset + 18);
  }
  return { encrypted, valid: encrypted > 0 };
};

const normalizeFiles = (files) => {
  if (files instanceof Map) return [...files].map(([name, data]) => ({ name, data }));
  if (!Array.isArray(files)) {
    if (files && typeof files == "object") {
      return Object.entries(files).map(([name, data]) => ({ name, data }));
    }
    throw new TypeError("files must be an object, Map, or array");
  }
  return files.map((file) => {
    if (Array.isArray(file) && file.length == 2) {
      return { name: file[0], data: file[1] };
    }
    if (file && typeof file == "object") {
      return {
        ...file,
        name: file.name ?? file.filename,
        data: file.data ?? file.buffer,
      };
    }
    throw new TypeError("each file must be [name, data] or an object");
  });
};

export class Zip {
  static checkPassword(data, password) {
    const result = checkPassword(toBytes(data), toPassword(password));
    if (result.encrypted == 0) throw new Error("ZIP archive is not password-protected");
    return result.valid;
  }

  static compress(files, options = {}) {
    const archive = zip({
      comment: options.comment == null ? undefined : toBytes(options.comment),
    });
    const password = toPassword(options.password);
    if (password) archive.setPassword(password);
    const defaultMethod = options.store ? 0 : 8;

    for (const file of normalizeFiles(files)) {
      if (typeof file.name != "string" || file.name.length == 0) {
        throw new TypeError("each ZIP file must have a non-empty name");
      }
      const compressionMethod = file.store ? 0 : defaultMethod;
      archive.addFile(toBytes(file.data), {
        filename: encoder.encode(file.name),
        compressionMethod,
        compress: compressionMethod == 8,
        date: file.date ?? options.date,
        comment: file.comment == null ? undefined : toBytes(file.comment),
        password: toPassword(file.password),
      });
    }
    return markUtf8Filenames(archive.compress());
  }

  static decompress(data, options = {}) {
    if (typeof options == "string" || ArrayBuffer.isView(options) ||
      options instanceof ArrayBuffer || Array.isArray(options)) {
      options = { password: options };
    }
    data = toBytes(data);
    const password = toPassword(options.password);
    if (password && !checkPassword(data, password).valid) throw new Error("wrong password");
    const archive = unzip(data, {
      password,
      verify: true,
    });
    return Object.fromEntries(
      archive.getFilenames().map((name) => [name, archive.decompress(name)]),
    );
  }
}
