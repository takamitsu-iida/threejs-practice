
# three.jsの練習

<br>

Github Pagesを使うためにPublicにしていますが、このリポジトリは個人的な学習のためのものです。

テスト中のページ（5-Stage CLOS ネットワークの3D作図）

https://takamitsu-iida.github.io/threejs-practice/index-nwdiagram.html


<br>

参考にした例の一覧

https://takamitsu-iida.github.io/threejs-practice/index-examples.html


<br>

three.jsではWebGLを使いますので、グラフィックボードを持たないシンクライアントやWebGLをサポートしていないブラウザでは、

```
Your graphics card does not seem to support WebGL
```

とだけ表示されます。

<br>

## ドキュメント

参考にしたもの。

[three.js](https://threejs.org/)

[examples(かなり古い)](http://stemkoski.github.io/Three.js/)

[terrain building with three.js](https://blog.mastermaps.com/2013/10/terrain-building-with-threejs.html)

[three.jsのPlaneGeometryで地形を作る](https://yomotsu.net/blog/2012/12/01/create-terrain-with-threejs.html)

[WebGL開発に役立つ重要な三角関数の数式・概念まとめ（Three.js編）](https://ics.media/entry/10657/)

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

```bash
├── README.md
├── index-nwdiagram.html
└── static
    ├── build
    │   ├── three.module.js
    │   └── three.module.min.js
    ├── controls
    │   ├── OrbitControls.js
    │   ├── TrackballControls.js
    │   └── TransformControls.js
    ├── libs
    │   ├── CSS2DRenderer.js
    │   ├── CSS3DRenderer.js
    │   ├── capabilities
    │   │   ├── WebGL.js
    │   │   └── WebGPU.js
    │   ├── lil-gui.module.min.js
    │   ├── stats.module.js
    │   └── tween.module.js
    └── site
        ├── css
        │   └── style.css
        ├── img
        │   ├── earth.jpg
        │   ├── favicon.ico
        │   ├── particle.png
        │   └── space.jpg
        └── js
            ├── nwdiagram.js
            ├── particles.js
            ├── practice.js
            └── terrain.js
```

github pagesで表示するHTMLはプロジェクト直下に配置。

その他の静的コンテンツは./staticの下に配置する。

./static/buildにはthree.js本体を配置。

./static/controlsに各種コントローラを配置。実体は `three.js-master/examples/jsm/controls` からコピーしたもの。

./static/libsにはThree.jsに関連したアドオンやライブラリをコピーしておく。

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
        "three": "./threejs/three.js-r145/build/three.module.js",
        "OrbitControls": ./threejs/three.js-r145/examples/jsm/controls/OrbitControls.js"
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

- HTMLでの指定

```html
  <!-- three.js -->
  <script type="importmap">
    {
      "imports": {
        "three": "./static/build/three.module.js",
        "three/libs/": "./static/libs/",
        "three/controls/": "./static/controls/"
      }
    }
  </script>

  <script type="module">
    import WebGL from './static/libs/capabilities/WebGL.js';
    import { main } from "./static/site/js/nwdiagram.js";

    window.addEventListener("load", () => {
      if (WebGL.isWebGLAvailable()) {
        main();
      } else {
        document.getElementById("threejs_wrapper").appendChild(WebGL.getWebGLErrorMessage());
      }
    });
  </script>
```

- JavaScriptでのインポート指定

```js
import * as THREE from "three";
import { OrbitControls } from 'three/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/libs/CSS2DRenderer.js';
import { GUI } from "three/libs/lil-gui.module.min.js";
import Stats from 'three/libs/stats.module.js';
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


<br>

## アニメーションGIFに保存

https://github.com/spite/ccapture.js


<br>

## VSCodeの拡張機能

Shader languages support for VS Code

Comment tagged templates

こんな感じでGSLSをJavaScriptの文字列として書いたときに、シンタックスハイライトがかかるようになる。

```JavaScript
const shader = /* glsl */`...`;
```


<br>

## GLSL


> [!NOTE]
>
> The Book of Shaders
>
> https://thebookofshaders.com/?lan=jp
>
> 最初にこれを読んでからUdemyの講座を閲覧すると理解が深まる。


<br>

> [!NOTE]
>
> シェーダー用パーリンノイズ
>
> https://gist.github.com/patriciogonzalezvivo/670c22f3966e662d2f83


★★★

> [!NOTE]
>
> Anrti-Aliased Grid Shader
>
> https://madebyevan.com/shaders/grid/
>




<br>

ストレージ修飾子

- attribute

頂点情報を入れる。バーテックスシェーダーで用いる。

- uniform

グローバル変数を入れる。JavaScript側からシェーダーに変数を渡す。

valueキーを持った辞書型を定義して、シェーダーに渡す。キーの先頭は `u` をつけるのが慣例。

```JavaScript
const uniforms = {
    uA : { value: 0.0 }
}

const material = new THREE.ShaderMaterial( {
  uniforms : uniforms
}
```

- varying

バーテックスシェーダーからフラグメントシェーダーに変数を渡す。

テクスチャを使うときのUV座標はジオメトリから取得してグローバル変数で渡してもよいが、
バーテックスシェーダーが組み込みで持っているuv変数をvaryingで渡してあげた方がよい。


出力先

シェーダーは `void main() {}` を実行するので、戻り値は存在しない。

バーテックスシェーダーの処理結果は `vec4 gl_Position` に格納する。

フラグメントシェーダーの処理結果は `vec4 gl_FragColor` に格納する。
