# Zip

[English](README.md) | [日本語](README.ja.md)

ZIP archive compression and decompression for browsers, Deno, and Node.js.
Based on the ES modules in [taisukef/zlib.js](https://github.com/taisukef/zlib.js/tree/develop/es).

```js
import { Zip } from "https://code4fukui.github.io/Zip/Zip.js";

const compressed = Zip.compress({
  "hello.txt": "Hello, ZIP!",
  "data.bin": Uint8Array.from([1, 2, 3]),
});

const files = Zip.decompress(compressed);
console.log(new TextDecoder().decode(files["hello.txt"]));
```

Password-protected ZIP archives use the traditional ZipCrypto format:

```js
const encrypted = Zip.compress({ "secret.txt": "secret" }, {
  password: "password",
});
const secretFiles = Zip.decompress(encrypted, { password: "password" });
```

`Zip.compress()` accepts an object, a `Map`, or an array of `{ name, data }` / `[name, data]` entries. String data is encoded as UTF-8. Use `{ store: true }` to create an archive without deflate compression.

`Zip.decompress()` returns an object whose keys are file names and whose values are `Uint8Array` instances.

## License

This project is available under the [MIT License](LICENSE). You may freely use, modify, redistribute, and use it commercially, provided that the copyright and license notices are retained.

This project includes code derived from [zlib.js](https://github.com/imaya/zlib.js) by imaya, which is also licensed under the MIT License. Its original license notices are retained in the derived source files.
