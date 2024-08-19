
# three.jsの練習

<br>

Github Pagesを使うためにPublicにしていますが、このリポジトリは個人的な学習のためのものです。

テスト中のページ（5-Stage CLOS ネットワークの3D作図）

https://takamitsu-iida.github.io/threejs-practice/index-nwdiagram.html

> [!NOTE]
>
> 搭載しているGPUの性能によっては重いです。
> 2015 EarlyモデルのMacbook Proでは60fps出せませんでした。

<br><br>

勉強用に作った例の一覧

https://takamitsu-iida.github.io/threejs-practice/index-examples.html


<br>

> [!NOTE]
>
> three.jsではWebGLを使いますので、グラフィックボードを持たないシンクライアントやWebGLをサポートしていないブラウザでは
>
> `Your graphics card does not seem to support WebGL`
>
> とだけ表示されます。

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
>
> Examplesのソースコードを読むと、とても勉強になる。

<br>

> [!NOTE]
>
> シェーダー用パーリンノイズ
>
> https://gist.github.com/patriciogonzalezvivo/670c22f3966e662d2f83


<br>

> [!NOTE]
>
> Anti-Aliased Grid Shader
>
> https://madebyevan.com/shaders/grid/
>
> このページも大変勉強になる。

<br>

シェーダーについて考えるときには、ピクセルごとに並列実行されることを意識したほうがよい。

たとえば等圧線を生成することを考えたとき、そのピクセルに相当するモデルの高さの情報が必要になる。
その情報はバーテックスシェーダーであれば知り得るが、
フラグメントシェーダーは知り得ないので、`varying` を使ってバーテックスシェーダーから渡してあげる必要がある。

バーテックスシェーダーは、位置情報を渡すだけであればこのようになる。

```GLSL
varying vec3 vPosition;

void main() {

  vec4 modelPosition = modelMatrix * vec4(position, 1.0);

  vec4 viewPosition = viewMatrix * modelPosition;

  vec4 projectionPosition = projectionMatrix * viewPosition;

  gl_Position = projectionPosition;

  // フラグメントシェーダーに位置情報を渡す
  vPosition = position;
}
```

フラグメントシェーダーは概ねこんな感じのコードになるはず。

```GLSL
uniform float uInterval; // 等圧線をひくインターバル
uniform float uThickness; // 等圧線の太さ

varying vec3 vPosition; // 位置情報はバーテックスシェーダーから引き取る

void main() {

    float step = vPosition.y / uInterval;
    float f  = fract(step);
    float df = fwidth(step);
    float color = smoothstep(df, df * uThickness, f);
    color = 1.0 - color;

    gl_FragColor = vec4(color, color, color, 1.0);
}
```

こういったサンプルのコードを見てもいまいち分かりづらいのは、組み込みの関数や既定の変数が存在するため。
十分に知識がないと、とかく難しく感じてしまう。

最低限押さえておきたい組み込み関数はこれら。

<br>

- radians()
- degrees()
- abs() 指定された値の絶対値を返す。
- sign(x) xが正なら+1.0、0.0なら0.0、負なら-1.0を返す
- floor()
- ceil()
- fract(x) 小数点部分、つまりx-floor(x)を返す。fractは分数の意かな？
- mod(x, y)
- min(x, y)
- max(x, y)
- clamp(x, a, b) xをaとbの間の値に制限する。つまりmin(max(x, a), b)を返す。
- mix(a, b, x) 線形補間 `a(1-x)+b*x` を返す。xが0のとき結果はa、xが1のとき結果はbになる。
- step(a, x) aをしきい値として0,1で二値化する。aはしきい値。xがaより小さければ0.0、大きければ1.0を返す。
- smoothstep(a, b, x) しきい値aで始まり、しきい値bで終わる緩やかな補完を返す
- fwidth(x) x方向の偏微分の絶対値と、y方向の偏微分の絶対値を加えた値、すなわち `abs(ddx(x)) + abs(ddy(x))` を返す。
- sin(), cos(), tan(), asin(), acos(), atan()
- pow(x, y) xのy乗を返す。
- exp(x) eのx乗を返す。
- log(x) xの自然対数を返す。
- exp2(x) 2のx乗を返す。
- log2(x) 底2のlogを返す。
- sqrt(x) xの平方根を返す。
- inverssqrt(x) 1/sqrt(x)を返す。

<br>

先程のコードにコメントを追加するとこうなる。

```GLSL
void main() {

    // そのピクセルにおける高度をインターバルで割る
    float step = vPosition.y / uInterval;

    // 小数点の部分だけを取り出すことで、一定間隔の高度で同じ処理結果が得られる
    float f  = fract(step);

    // このstep値を隣接ピクセルとの間で偏微分して、和を計算する
    // アンチエイリアス処理をするときの典型処理
    float df = fwidth(step);

    // 滑らかに二値化する
    // dfより小さければ0.0、df*uThicknessより大きければ1.0、その中間は滑らかに補完される
    float color = smoothstep(df, df * uThickness, f);

    // colorはほとんどの場所で1.0になり、等圧線が引かれる場所だけ0に近い値になる
    // 白黒を逆転する
    color = 1.0 - color;

    gl_FragColor = vec4(color, color, color, 1.0);
}
```

等圧線を引く方法は試行錯誤が必要。
実際にいくつか関数を作って試せるようにしたのがこれ。

https://takamitsu-iida.github.io/threejs-practice/index-plane-grid.html

uThicknessやIntervalを変えてみたときに期待通りに動いてくれるのは `getContour5()` ではあるののの、
なぜこういう結果を得られるのか、を知るには他の関数も重要。
特に `getContour2()` の結果をみると、納得できる部分が多い。

<br><br>

ストレージ修飾子

- attribute

頂点情報ごとに異なる情報がほしいときにattributeに値を入れて、バーテックスシェーダーに渡す。

典型的なのは位置情報。

```GLSL
attribute vec3 position;
```

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


<br><br>

シェーダーの出力先。

- バーテックスシェーダーは、**そのピクセルの位置が** どうなのかを`vec4 gl_Position`に格納する。

- フラグメントシェーダーは、**そのピクセルの色が** どうなのかを`vec4 gl_FragColor`に格納する。
