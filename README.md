# Three.jsの練習帳

<br>

Github Pagesを使うために公開範囲をPublicにしていますが、このリポジトリは個人の学習のためのものです。

当面の目標は２つ。

## 目標１．ネットワーク構成図の３次元表現

大規模なネットワーク構成になると、
どうしても図としての表現が困難になってくるのと、
JavaScriptだけで描画すると重たくなってしまうのを解決したい。

試しに5-Stage CLOS ネットワークを3D作図したものがこれです。

https://takamitsu-iida.github.io/threejs-practice/index-nwdiagram.html

- (clusters, routers/cluster) = (10, 20) の場合、ルータ224台、エッジ440本
- (clusters, routers/cluster) = (20, 30) の場合、ルータ664台、エッジ1,280本
- (clusters, routers/cluster) = (30, 30) の場合、ルータ964台、エッジ1,920本

<br>

実用するなら見やすいレイアウトを追求しないといけませんが、たとえ見づらくてもアートっぽい雰囲気を感じられればそれでいいかな、という気になります。

<br>

> [!NOTE]
>
> グラフィックボードを持たないシンクライアントやWebGLをサポートしていないブラウザでは
>
> `Your graphics card does not seem to support WebGL`
>
> としか表示されません。
>
> 搭載しているGPUの性能によっては重い処理になります。
> 2015 EarlyモデルのMacbook Proでは60fps出せませんでした。


<br><br>

## 目標２．海底地形図作成

魚群探知機から抽出した水深のCSVデータを加工して3Dで海底地形図を表示したい。

まだ実力が足りないので、
まずはポイントクラウドを表示してみて、
デローネ三角形でポリゴンにしたらどうなるかを実験してみたいところ。

試しにCSVファイルを読み込んでポイントクラウドにしたものがこれです。

https://takamitsu-iida.github.io/threejs-practice/index-load-csv.html

用いたCSVのデータは14万ポイント。

ある程度はPythonで処理して異常値を弾いたつもりですが、まだまだおかしなデータが含まれてる感じがします。

|       |             lat |             lon |        depth |
|:------|----------------:|----------------:|-------------:|
| count | 140954          | 140954          | 140954       |
| mean  |     35.1641     |    139.607      |     17.0863  |
| std   |      0.00250586 |      0.00442229 |      9.78628 |
| min   |     35.1572     |    139.554      |      1.082   |
| 25%   |     35.1627     |    139.604      |      9.075   |
| 50%   |     35.1639     |    139.607      |     15.4025  |
| 75%   |     35.165      |    139.61       |     22.875   |
| max   |     35.1797     |    139.622      |     47.539   |


<br><br><br>

# 作例一覧

勉強用に作ったものを一覧化したものです。

https://takamitsu-iida.github.io/threejs-practice/index-examples.html

参照元は本家Three.jsであったり、Udemyであったり、ネット上の記事であったりとマチマチですが、
後で自分が参照するときに困らないようにソースコードはできるだけ同じような書き方に変えています。


<br>

# 参考文献

[three.js](https://threejs.org/)

[examples(かなり古い)](http://stemkoski.github.io/Three.js/)

[terrain building with three.js](https://blog.mastermaps.com/2013/10/terrain-building-with-threejs.html)

[Terrain Generation and Editing using Marching Cubes](https://deep110.github.io/posts/blogs/2022-06-25-terrain-editor-marching-cubes.html)

[three.jsのPlaneGeometryで地形を作る](https://yomotsu.net/blog/2012/12/01/create-terrain-with-threejs.html)

[WebGL開発に役立つ重要な三角関数の数式・概念まとめ（Three.js編）](https://ics.media/entry/10657/)

[Basic examples from https://discourse.threejs.org](https://hofk.de/main/discourse.threejs/2023/index2023.html)


<br>

# 実行環境

ブラウザ上で動くのでどんなPCでも動くと思いきや、そうでもないようです。

WindowsのChromeでは動いているのに、MacOSでは以下のメッセージがコンソールに出力されて何も描画されないことがありました。

```
[.WebGL-0x12004ecc700] GL_INVALID_OPERATION:
 Vertex buffer is not big enough for the draw callUnderstand this warning
```

ジオメトリの頂点を直接操作したときにこのメッセージが出ることが多いようですが、
プログラム側に何かしら問題があるはずなので、なるべく早い段階でMacOSでも期待通りの動作をするか、
を確認した方がよさそうです。

あらかた完成してから、MacOSでは動かない、となると、トラブルシューティングが大変になってしまうので。

<br>

# 環境構築メモ

three.jsをどこから読み込むか、によってHTML、JavaScriptの記述が変わります。

方法１．ローカルにthree.jsのソースコードをまるごと展開

方法２．ローカルに必要なものだけをコピーして参照

方法３．CDNを参照


開発中はvscodeの補完が働かないと難儀します。
ローカルにコピーしたthree.jsを読むようにすると補完がかかりますので、方法１ or 方法２で開発するとよいでしょう。

このリポジトリでは次のようなディレクトリ構成にしています。

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

github pagesで表示するHTMLはプロジェクト直下に配置しています（/docsにはしていません）。

静的コンテンツは./staticの下に配置します。

./static/buildにはthree.js本体を配置。

./static/controlsに各種コントローラを配置。実体は `three.js-master/examples/jsm/controls` からコピーしたものです。

./static/libsにはThree.jsに関連したアドオンやライブラリをコピーしておきます。

libsフォルダには必要なものを必要なときにコピーしているので、混沌としがちです。
これ、どこからコピーしたんだっけ？という状況にすでになっています。

<br>

## 方法１．ローカルにthree.jsのソースコードを展開

three.jsのバージョンを切り替えて試行するならこの方法がよいと思います。

- プロジェクト内にthreejsフォルダを作成して、three.jsをダウンロードして解凍

- .gitignoreでthreejsフォルダを無視するように設定

- index.htmlで次のように指定

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
> HTML内に記述するimportmapの書式には十分注意しないといけません。
> 最後の行にコンマをつけると書式エラーになって何も表示されなくなりますので、 特に注意が必要です。

<br>

- JavaScriptで次のようにインポート指定

```js
import * as THREE from "three";
import { OrbitControls } from "OrbitControls";
```

<br>

## 方法２．ローカルに必要なものだけをコピーして参照

<br>

> [!NOTE]
>
> 2024年7月追記、現在はこの方法にしています。

<br>

> [!NOTE]
>
> 2024年8月追記
>
> three.jsをバージョンr168に入れ替えました。

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

## 方法３．CDNを参照

配布するならCDNを参照するように書き換えた方がいいでしょう。

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

##  アニメーションGIFに保存する方法

これ（↓）を使えばアニメーションGIFを作成できるものの、とてつもなく重いので別の手段を考えたほうがいいでしょう。

https://github.com/spite/ccapture.js

使い方

```JavaScript
    // ccapture.js
    {
      const startButton = document.getElementById("idButtonCaptureStart");
      if (startButton) {
        startButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          const options = {
            verbose: false,
            display: true,
            framerate: 30,
            format: 'gif',
            workersPath: './static/libs/ccapture.js-1.0.9/',
            timeLimit: 5,
            onProgress: (p) => {
              console.log(p);
              if (p === 1) {
                console.log("FINISHED!");
                document.getElementById("idButtonCaptureStart").disabled = false;
                this.capture = null;
              }
            }
          };
          document.getElementById("idButtonCaptureStart").disabled = true;
          this.capture = new CCapture(options);
          this.capture.start();
        });
      }
    }
```

<br>

## VSCodeの拡張機能

シェーダーを書くことになるので、拡張機能を導入します。

- Shader languages support for VS Code

- Comment tagged templates

こんな感じでGSLSをJavaScriptの文字列として書いたとしても、シンタックスハイライトがかかるようになります。

```JavaScript
const shader = /* glsl */`...`;
```

<br>

## 物体の回転について

rotationプロパティを使うか、quaternionプロパティを使うことで物体の姿勢角度を設定できますが、これはあくまでローカル座標系での話しです。

ワールド座標系の任意の軸に沿って姿勢を制御するのは少々難しいです。

<br>

### quaternion

クォータニオンは２次元における複素数を３次元に拡張したようなもので、回転や向きを制御するのに適しています。

初期状態の姿勢が変わっていなければ気にしなくてよいのですが、
初期状態で傾きがつけられていると期待と違う回転になりがちです。

たとえば、これ。

https://takamitsu-iida.github.io/threejs-practice/index-quaternion.html

初期状態で45度傾けられた立方体が２つあり、
Y軸 (0, 1, 0) に沿って回転させようとしたとき、期待値はおそらく上の立方体の動きでしょう。

この動作を実現するのは少々難しい計算が必要です。

ワールド座標とローカル座標は次の式で変換が可能です。

**ワールド座標系ベクトル = モデルマトリックス ✕ ローカル座標系ベクトル**

ということは、

**ローカル座標系ベクトル = モデルマトリックスの逆行列 ✕ ワールド座標系ベクトル**

の計算をすることで、ワールド座標系→ローカル座標系の変換も可能です。

回転させたいワールド座標系の軸に対して、このような変換をかける手順を組めばよいのですが、
言葉で説明するよりもソースコードを見たほうが理解できます。


<br><br><br>

# シェーダー

<br>

## GLSL

> [!NOTE]
>
> The Book of Shaders
>
> https://thebookofshaders.com/?lan=jp
>
> 最初にこれを読んでからUdemyの講座を受講すると理解が深まります。
>
> ここにあるExamplesのソースコードを読むと、とても勉強になります。

<br>

> [!NOTE]
>
> シェーダー用パーリンノイズはここから引用するとよいでしょう。
>
> https://gist.github.com/patriciogonzalezvivo/670c22f3966e662d2f83


<br>

> [!NOTE]
>
> Anti-Aliased Grid Shader
>
> https://madebyevan.com/shaders/grid/
>
> このページも大変勉強になります。

<br>

シェーダーについて考えるときには、**ピクセルごとに並列実行される** ということを意識して、
そのピクセルの位置、色がどうなのか、を決定していきます。

たとえば等圧線を生成することを考えてみます。

そのピクセルに相当するモデルの高さの情報（Y座標）が必要になりますが、その情報はバーテックスシェーダーしか知り得ません。
ですので、`varying` を使ってバーテックスシェーダーからフラグメントシェーダーに渡してあげる必要があります。

位置情報を `varying` で渡すだけの単純なバーテックスシェーダーは以下のようになります。

`varying`する変数は先頭にvを付けるのが慣例らしいので、`vPosition` という変数を定義して、
組み込み変数の`position`を代入しています。

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

等圧線を生成するフラグメントシェーダーは概ねこんな感じのコードになるはずです。

```GLSL
uniform float uInterval; // 等圧線をひくインターバル
uniform float uThickness; // 等圧線の太さ

varying vec3 vPosition; // 位置情報はバーテックスシェーダーから引き取る

void main() {

    float grid = vPosition.y / uInterval;
    float f  = fract(grid);
    float df = fwidth(grid);
    float contour = smoothstep(df, df * uThickness, f);
    contour = 1.0 - contour;

    gl_FragColor = vec4(contour, contour, contour, 1.0);
}
```

こういったサンプルコードを見たときに**分かりづらく感じる**のは、
組み込みの関数や既定の変数が存在するためで、十分に知識がないと、とかく難しく感じてしまいます。

最低限押さえておきたい組み込み関数はこれら。

<br>

- radians()
- degrees()
- abs() 指定された値の絶対値を返す。
- sign(x) xが正なら+1.0、0.0なら0.0、負なら-1.0を返す
- floor()
- ceil()
- fract(x) 小数点部分、つまりx-floor(x)を返す。fractは分数の意味する。
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

先程のフラグメントシェーダーにコメントを追加するとこうなります。

```GLSL
void main() {

    // そのピクセルにおける高度をインターバルで割る
    float grid = vPosition.y / uInterval;

    // fract関数で小数点の部分だけを取り出す
    // これにより一定間隔で同じ処理結果が得られる
    float f  = fract(grid);

    // grid値を隣接ピクセルとの間で偏微分して和を計算する
    float df = fwidth(step);

    // 滑らかに二値化する
    // dfより小さければ0.0、df*uThicknessより大きければ1.0、その中間は滑らかに補完される
    float contour = smoothstep(df, df * uThickness, f);

    // contourはほとんどの場所で1.0になり、等圧線が引かれる場所だけ0に近い値になる
    // 白黒を逆転する
    contour = 1.0 - contour;

    gl_FragColor = vec4(contour, contour, contour, 1.0);
}
```

等圧線を引く方法は試行錯誤が必要です。

実際にいくつか関数を作って試せるようにしたのがこれ。

https://takamitsu-iida.github.io/threejs-practice/index-plane-grid.html

uThicknessやIntervalを変えてみたときに期待通りに動いてくれるのは `getContour5()` ではあるののの、
なぜこういう結果を得られるのか、を理解するには他の関数も重要です。

特に `getContour2()` の結果をみると、納得できる部分が多いです。

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

- バーテックスシェーダーは、**そのピクセルの位置が** どうなのかを`vec4 gl_Position`に格納します。

- フラグメントシェーダーは、**そのピクセルの色が** どうなのかを`vec4 gl_FragColor`に格納します。
