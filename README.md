
# three.jsの練習

<br>

## ドキュメント

[three.js](https://threejs.org/){:target="_blank"}

[examples(かなり古い)](http://stemkoski.github.io/Three.js/){:target="_blank"}

[terrain examples](https://threejs.org/examples/?q=terrain#webgl_geometry_terrain_raycast){:target="_blank"}

[terrain building with three.js](https://blog.mastermaps.com/2013/10/terrain-building-with-threejs.html){:target="_blank"}

[three.jsのPlaneGeometryで地形を作る](https://yomotsu.net/blog/2012/12/01/create-terrain-with-threejs.html){:target="_blank"}


<br>

## インストール

開発中はVSCodeの補完を働かせたい。
ローカルにコピーしたthree.jsを、そのJavaScriptファイルからの相対パスで参照することで補完が機能する。

誰かに見せるときにはCDNを利用にするように書き換えたほうがいい。

three.jsをどこから読み込むか、によってHTML、JavaScriptの記述が変わる。

1. ローカルにthree.jsのソースコードを展開
2. ローカルに必要なものだけをコピーして参照
3. CDNを参照

プロジェクトのディレクトリ構成。

index.htmlはプロジェクト直下に配置。その他の静的コンテンツは/staticの下に配置する。

```bash
.
├── README.md
├── index-particles.html
├── index-terrain.html
├── index-u.html
├── static
│   ├── build
│   ├── controls
│   └── site
└── threejs
    ├── three.js-r145
    └── three.js-r145.zip
```

<br>

### １．ローカルにthree.jsのソースコードを展開

three.jsのバージョンを切り替えて試行するならこの方法がよい。

- プロジェクト内にthreejsフォルダを作成して、three.jsをダウンロードして解凍

- .gitignoreでthreejsフォルダを無視するように設定

- index.htmlでの指定

```html
  <script type="importmap">
    {
      "imports": {
        "three": "/threejs/three.js-r145/build/three.module.js"
      }
    }
  </script>
```

- JavaScriptでのインポート指定

そのJavaScriptファイルからの相対パスで指定する。

```js
import * as THREE        from "../../../threejs/three.js-r145/build/three.module.js";
import { OrbitControls } from "../../../threejs/three.js-r145/examples/jsm/controls/OrbitControls.js";
```

<br>

### ２．ローカルに必要なものだけをコピーして参照

three.jsのdistフォルダと、examples/jsm/controlsをコピーして利用する。
こうしておけばgithub pagesでそのまま動作する。

- index.htmlでの指定

```html
  <script type="importmap">
    {
      "imports": {
        "three": "/static/build/three.module.js"
      }
    }
  </script>
```

- JavaScriptでのインポート指定

```js
import * as THREE        from "../../build/three.module.js";
import { OrbitControls } from "../../controls/OrbitControls.js";
```

<br>

### ３．CDNを参照

配布するならCDNを参照するように書き換える。

- index.htmlでの指定

```html
  <script type="importmap">
    {
      "imports": {
        "three": "https://unpkg.com/three/build/three.module.js"
      }
    }
  </script>
```

- JavaScriptでのインポート指定

```js
import * as THREE from "https://unpkg.com/three/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three@0.145/examples/jsm/controls/OrbitControls.js";
```
