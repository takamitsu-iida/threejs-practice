
# three.jsの練習

<br>

ただいまテスト中

https://takamitsu-iida.github.io/threejs-practice/index-nwdiagram.html


<br>

## ドキュメント

参考にしたもの。

[three.js](https://threejs.org/)

[examples(かなり古い)](http://stemkoski.github.io/Three.js/)

[terrain examples](https://threejs.org/examples/?q=terrain#webgl_geometry_terrain_raycast)

[terrain building with three.js](https://blog.mastermaps.com/2013/10/terrain-building-with-threejs.html)

[three.jsのPlaneGeometryで地形を作る](https://yomotsu.net/blog/2012/12/01/create-terrain-with-threejs.html)


<br>

## インストール

開発中はVSCodeの補完を働かせたい。

ローカルにコピーしたthree.jsを読むようにすると補完がかかる。

誰かに見せるときにはCDNを利用にするように書き換えたほうがいい。

three.jsをどこから読み込むか、によってHTML、JavaScriptの記述が変わる。

1. ローカルにthree.jsのソースコードを展開
2. ローカルに必要なものだけをコピーして参照
3. CDNを参照

プロジェクトのディレクトリ構成。

index.htmlはプロジェクト直下に配置。その他の静的コンテンツは/staticの下に配置する。

/static/buildにはthree.js本体を配置。

/static/controlsに各種コントローラを配置。実体は `three.js-master/examples/jsm/controls` からコピーしたもの。

```bash
.
├── README.md
├── index-nwdiagram.html
├── index-particles.html
├── index-terrain.html
├── index-u.html
├── static
│   ├── build
│   │   ├── three.module.js
│   │   └── three.module.min.js
│   ├── controls
│   │   ├── ArcballControls.js
│   │   ├── DragControls.js
│   │   ├── FirstPersonControls.js
│   │   ├── FlyControls.js
│   │   ├── MapControls.js
│   │   ├── OrbitControls.js
│   │   ├── PointerLockControls.js
│   │   ├── TrackballControls.js
│   │   └── TransformControls.js
│   └── site
│       ├── css
│       │   ├── practice.css
│       │   └── style.css
│       ├── img
│       │   ├── earth.jpg
│       │   ├── particle.png
│       │   └── space.jpg
│       └── js
│           ├── nwdiagram.js
│           ├── particles.js
│           ├── practice.js
│           └── terrain.js
└```

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
        "three": "/threejs/three.js-r145/build/three.module.js",
        "OrbitControls": /threejs/three.js-r145/examples/jsm/controls/OrbitControls.js"
      }
    }
  </script>
```

<br>

> [!NOTE]
>
> JSON形式で記述するimportmapの書式に注意。
> 最後にコンマをつけると書式エラーで何も表示されなくなってしまう。

<br>

- JavaScriptでのインポート指定

そのJavaScriptファイルからの相対パスで指定する。

```js
import * as THREE        from "three";
import { OrbitControls } from "OrbitControls";
```

<br>

### ２．ローカルに必要なものだけをコピーして参照

three.jsのdistフォルダと、examples/jsm/controlsを/staticにコピーして利用する。

こうしておけばgithub pagesでそのまま動作する。

<br>

> [!NOTE]
>
> 2024年7月追記、現在はこの方法にしている。

<br>

> [!NOTE]
>
> 2024年7月追記
>
> three.jsをバージョンr166に入れ替え。

<br>


- index.htmlでの指定

```html
    <!-- three.js -->
    <script type="importmap">
      {
        "imports": {
          "three": "/static/build/three.module.js",
          "OrbitControls": "/static/controls/OrbitControls.js",
          "TrackballControls": "/static/controls/TrackballControls.js"
        }
      }
    </script>
```

- JavaScriptでのインポート指定

```js
import * as THREE from "three";
import { TrackballControls } from "TrackballControls";
```

<br>

### ３．CDNを参照

配布するならCDNを参照するように書き換える。

- index.htmlでの指定

```html
  <script type="importmap">
    {
      "imports": {
        "three": "https://unpkg.com/three/build/three.module.js",
        "OrbitControls": "https://unpkg.com/three@0.145/examples/jsm/controls/OrbitControls.js"
      }
    }
  </script>
```

- JavaScriptでのインポート指定

```js
import * as THREE from "three";
import { OrbitControls } from "OrbitControls"
```
