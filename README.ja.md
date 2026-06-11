# Zip

[English](README.md) | [日本語](README.ja.md)

ブラウザ、Deno、Node.jsで利用できるZIPアーカイブの圧縮・展開ライブラリです。
[taisukef/zlib.js](https://github.com/taisukef/zlib.js/tree/develop/es)のESモジュールをベースにしています。

```js
import { Zip } from "./Zip.js";

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

## CLI

`zipcli.js`でファイルやディレクトリを圧縮できます。

```sh
./zipcli.js -o archive.zip file.txt directory
./zipcli.js -o secret.zip -p password directory
```

ディレクトリは再帰的に追加されます。`-o`を省略した場合、入力が1件なら`<入力名>.zip`、複数なら`archive.zip`へ出力します。

`unzipcli.js`でZIPアーカイブを展開できます。

```sh
./unzipcli.js -o output archive.zip
./unzipcli.js -o output -p password secret.zip
```

短いパスワードを1文字から順に総当たりできます。

```sh
./unzipcli.js -attack -max 4 -chars abcdef0123456789 secret.zip
```

総当たり中は3秒ごとに試行件数と現在のパスワード候補を表示します。既定の文字セットは`a-z`、`A-Z`、`0-9`で、最大長は4文字です。

## ライセンス

このプロジェクトは[MIT License](LICENSE)で公開しています。著作権表示とライセンス表示を保持することで、自由な利用、改変、再配布、商用利用が可能です。

このプロジェクトには、imayaによる[zlib.js](https://github.com/imaya/zlib.js)由来のコードが含まれています。zlib.jsもMIT Licenseで公開されており、由来するソースファイル内に元のライセンス表示を保持しています。
