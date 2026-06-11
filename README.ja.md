# Zip

[English](README.md) | [日本語](README.ja.md)

ブラウザ、Deno、Node.jsで利用できるZIPアーカイブの圧縮・展開ライブラリです。
[taisukef/zlib.js](https://github.com/taisukef/zlib.js/tree/develop/es)のESモジュールをベースにしています。

```js
import { Zip } from "https://code4fukui.github.io/Zip/Zip.js";

const compressed = Zip.compress({
  "hello.txt": "Hello, ZIP!",
  "data.bin": Uint8Array.from([1, 2, 3]),
});

const files = Zip.decompress(compressed);
console.log(new TextDecoder().decode(files["hello.txt"]));
```

パスワード付きZIPアーカイブには従来のZipCrypto形式を使用します。

```js
const encrypted = Zip.compress({ "secret.txt": "secret" }, {
  password: "password",
});
const secretFiles = Zip.decompress(encrypted, { password: "password" });
```

`Zip.compress()`はオブジェクト、`Map`、または`{ name, data }` / `[name, data]`形式の配列を受け取ります。文字列データはUTF-8でエンコードされます。Deflate圧縮せずに格納する場合は`{ store: true }`を指定します。

`Zip.decompress()`はファイル名をキー、`Uint8Array`を値とするオブジェクトを返します。

## ライセンス

このプロジェクトは[MIT License](LICENSE)で公開しています。著作権表示とライセンス表示を保持することで、自由な利用、改変、再配布、商用利用が可能です。

このプロジェクトには、imayaによる[zlib.js](https://github.com/imaya/zlib.js)由来のコードが含まれています。zlib.jsもMIT Licenseで公開されており、由来するソースファイル内に元のライセンス表示を保持しています。
