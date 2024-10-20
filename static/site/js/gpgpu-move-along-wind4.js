import * as THREE from "three";

// lil-gui
import { GUI } from "three/libs/lil-gui.module.min.js";

// stats.js
import Stats from "three/libs/stats.module.js";

// GPUComputationRendereを使うのに必要なモジュール
// three.js/examples/jsm/misc/GPUComputationRenderer.js
// three.js/examples/jsm/postprocessing/Pass.js
import { GPUComputationRenderer } from "three/libs/misc/GPUComputationRenderer.js";


// やりたいことはこれだけど、ソースコードを読んでも難しすぎて分からないので、自分で理解可能なやり方で実装する
// https://qiita.com/Kanahiro/items/8927619c64831972c1d2

// 元になる画像はここから
// https://github.com/mapbox/webgl-wind

// 解説記事はここから
// https://blog.mapbox.com/how-i-built-a-wind-map-with-webgl-b63022b5537f


//
// NOTE: チラツキが解消できているので、この実装が一番よい
//


export class Main {

  container;

  scene;
  camera;
  renderer;

  statsjs;

  renderParams = {
    clock: new THREE.Clock(),
    delta: 0,
    interval: 1 / 30,  // = 30fps
  }

  params = {
    // 速度の元になる画像のパス
    velocityImagePath: './static/site/img/wind.png',

    // 画面に描画する幅
    viewWidth: 1024,

    // 高さは元画像のアスペクト比を維持して計算する
    viewHeight: 0,

    // 描画するパーティクルの数
    // データテクスチャを640 x 480で作成したので約30万個が上限
    numParticles: 50000,

    // パーティクルの移動速度、この数字は経験則的に調整する
    particleSpeed: 2.0,

    // 確率でパーティクルをランダムな位置に飛ばす閾値
    dropRate: 0.002,

    // 速度に応じて確率を上げるための係数
    dropRateBump: 0.01,

    // ★テクスチャを合成するので背景はメッシュ化しない
    // 背景画像のメッシュ
    // backgroundMesh: null,

    // バックグランドに速度の元になる画像を表示するかどうか
    showBackground: true,

    // 画面表示用のメッシュ
    disipalyMesh: null,

    // パーティクルのメッシュ
    particleMesh: null,

    // パーティクルを表示するかどうか
    showParticles: true,
  }

  velocityImageParams = {
    // ダウンロードしたImage()オブジェクト
    velocityImage: null,

    // params.velocityImagePath で指定した画像ファイルを解析した結果をこれら配列に保存する
    positions: [],
    colors: [],
    alphas: [],

    // 画像の幅と高さはロードしてから調べる
    imageWidth: 0,
    imageHeight: 0,

    // colorsを元にしてGPUComputationRendererでテクスチャに変換したもの
    textureVelocity: null,

    // 画面に背景画像として表示するためのテクスチャ
    texture: null,
  };

  // GPUComputeRendererのインスタンス
  // フレーム更新ごとにcompute()する
  computationRenderer;

  // パーティクル用のシェーダーマテリアルに渡すuniforms
  uniforms = {
    // パーティクルの位置情報が入ったテクスチャをシェーダーに渡す
    u_texture_position: { value: null },

    // グラデーションの色情報を格納した256x1のテクスチャをシェーダーに渡す
    u_color_ramp: { value: null },

    // パーティクルのサイズ
    u_point_size: { value: 1.0 },
  }

  // オフスクリーンでレンダリングするレンダーターゲット
  offScreenParams = {
    target: null,       // パーティクルを描画するレンダーターゲット

    // チラツキを防ぐために、レンダーターゲットを２つ用意して入れ替えて使う
    prevTarget: null,   // 一つ前のフレームのレンダーターゲット
    mixedTarget: null,  // 画面出力用テクスチャを作るレンダーターゲット

    scene: null,        // パーティクルを描画するシーン
    mixedScene: null,   // 一つ前のテクスチャと現在のテクスチャを合成するためのシーン
    mixedMesh: null,    // 一つ前のテクスチャと現在のテクスチャを合成したメッシュ

    // prevTargetとmixedTargetを入れ替える
    swap: () => {
      const temp = this.offScreenParams.mixedTarget;
      this.offScreenParams.mixedTarget = this.offScreenParams.prevTarget;
      this.offScreenParams.prevTarget = temp;
    },

    getCurrentTexture: () => {
      return this.offScreenParams.mixedTarget.texture;
    }
  }

  constructor(params = {}) {
    this.params = Object.assign(this.params, params);

    // 初期化にダウンロードを伴うので非同期関数を行う
    this.init();
  }


  init = async () => {

    // ローディング画面のエレメントを取得してイベントハンドラを登録
    const loadingContainer = document.getElementById('loadingContainer');
    loadingContainer.addEventListener('transitionend', (event) => {
      event.target.remove();
    });

    // loadImage()は非同期関数なので戻り値はpromise
    // そのpromiseをawaitして処理完了を待つ
    await this.loadImage();

    // 変換後の画像情報を確認
    // console.log(this.imageParams);

    // ローディング画面を0.5秒後に消す
    const interval = setInterval(() => {
      loadingContainer.classList.add('fadeout');
      clearInterval(interval);
    }, 500);

    // 背景のテクスチャを作成する
    this.initBackgroundTexture();

    // scene, camera, rendererを初期化
    this.initThreejs();

    // stats.jsを初期化
    this.initStatsjs();

    // lil-guiを初期化
    this.initGui();

    // GPUComputationRendererを使ってパーティクルの色を決めるためのテクスチャを作成
    this.createColorRampTexture();

    // GPUComputationRendererを使って速度計算用のテクスチャを作成
    this.createVelocityTexture();

    // GPUComputationRendererを初期化
    this.initComputationRenderer();

    // パーティクルを初期化
    this.initParticles();

    // フレーム毎の処理
    this.render();
  }


  loadImage = async () => {

    // Image()オブジェクトを作成して画像をpathからダウンロードする
    const image = await new Promise((resolve) => {
      // <img>要素を作成
      const img = new Image();

      // <img src="path">を指定してロード開始
      img.src = this.params.velocityImagePath;
      img.crossOrigin = "anonymous";

      // ロード完了時にこのimgを返却する
      img.onload = () => { resolve(img); };
    });

    // Image()オブジェクトを保存しておく（後ほどTHREE.jsのテクスチャに変換する）
    this.velocityImageParams.velocityImage = image;

    // ダウンロードした画像の幅と高さを取得
    const imageWidth = image.width;
    const imageHeight = image.height;

    // 画像の大きさを保存しておく
    this.velocityImageParams.imageWidth = imageWidth;
    this.velocityImageParams.imageHeight = imageHeight;

    // 画面に表示する幅をもとに、
    const width = this.params.viewWidth;

    // アスペクト比を維持して高さを計算する
    const height = Math.floor(imageHeight * (width / imageWidth));

    // この高さの情報は後で使うので保存しておく
    this.params.viewHeight = height;

    // canvasを取得
    const canvas = document.createElement("canvas");

    // canvasのサイズを指定のサイズに変更
    canvas.width = width;
    canvas.height = height;

    // 2dコンテキストを取得
    const ctx = canvas.getContext("2d");

    // 画像をcanvasに描画する
    // 引数が多いのでマニュアルを参照
    // https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage
    //
    // 描画時にリサイズすることもできるが、今回はリサイズせずに元画像の大きさで描画する
    ctx.drawImage(
      image,        // Image()オブジェクト
      0, 0,         // 元画像の描画開始位置、元画像に余白を入れる場合はここを変更
      imageWidth,   // 元画像の幅
      imageHeight,  // 元画像の高さ
    );

    // イメージをDOMに追加して目視で確認
    // document.body.appendChild(canvas);

    // 描画した画像のデータを取得
    const data = ctx.getImageData(0, 0, imageWidth, imageHeight).data;

    // Image()オブジェクトで取得した画像はY軸の向きが逆転している
    //
    // +---->x
    // |
    // y

    // dataを行ごとに分割する
    const rows = [];
    for (let y = 0; y < imageHeight; y++) {
      const index = y * imageWidth * 4;
      rows.push(data.slice(index, index + imageWidth * 4));
    }

    // 行を逆順にして、この向きに変換する
    //
    // Y
    // |
    // +---->x

    rows.reverse();

    // 位置と色の情報を取得する
    const positions = [];  // 使わない
    const colors = [];     // 使う
    const alphas = [];     // 使わない

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      for (let j = 0; j < row.length; j += 4) {
        const r = row[j + 0] / 255;  // 0 ~ 1に正規化
        const g = row[j + 1] / 255;  // 0 ~ 1に正規化
        const b = row[j + 2] / 255;  // 0 ~ 1に正規化
        const a = row[j + 3] / 255;  // 0 ~ 1に正規化
        colors.push(r, g, b);
        alphas.push(a);

        const pX = j - imageWidth / 2;   // 画像の中心を原点にする
        const pY = i - imageHeight / 2;  // 画像の中心を原点にする
        const pZ = 0;                    // 2DなのでZは0
        positions.push(pX, pY, pZ);
      }
    }

    // 画像から取り出した情報を保存しておく
    this.velocityImageParams.positions = positions;
    this.velocityImageParams.colors = colors;
    this.velocityImageParams.alphas = alphas;
  };



  initThreejs = () => {
    // シーン
    this.scene = new THREE.Scene();

    // カメラ
    this.camera = new THREE.OrthographicCamera(
      -this.params.viewWidth / 2,   // left
      this.params.viewWidth / 2,    // right
      this.params.viewHeight / 2,   // top
      -this.params.viewHeight / 2,  // bottom
      0,                            // near
      10                            // far
    );

    // カメラは(x, y)平面の原点に配置、z軸は手前に引く
    this.camera.position.set(0, 0, 1);

    // レンダラ
    // alpha: true はデフォルトのapha値が0.0になる。falseは1.0
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });

    // 通常はコンテナにサイズを合わせるが、ここでは固定にする
    this.renderer.setSize(this.params.viewWidth, this.params.viewHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    document.getElementById("threejsContainer").appendChild(this.renderer.domElement);

    // ★オフスクリーンでレンダリングするためのターゲットを３個作成する

    // パーティクルを描画するレンダーターゲット
    this.offScreenParams.target = new THREE.WebGLRenderTarget(
      this.params.viewWidth,
      this.params.viewHeight,
      {
        magFilter: THREE.LinearFilter,
        minFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
      }
    );

    // prevTargetとmixedTargetの役割は同じで、交代交代に使う
    // 自分が作ったテクスチャを自分で使うとエラーになるので、その対策も兼ねている

    // 一つ前のフレームとparticlesを合成する
    this.offScreenParams.prevTarget = new THREE.WebGLRenderTarget(
      this.params.viewWidth,
      this.params.viewHeight,
      {
        magFilter: THREE.LinearFilter,
        minFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
      }
    );

    // 一つ前のフレームとparticlesを合成する
    this.offScreenParams.mixedTarget = new THREE.WebGLRenderTarget(
      this.params.viewWidth,
      this.params.viewHeight,
      {
        magFilter: THREE.LinearFilter,
        minFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
      }
    );

    // オフスクリーン用のシーン（パーティクル描画用）
    this.offScreenParams.scene = new THREE.Scene();

    // オフスクリーン用のシーン（テクスチャ合成用）
    this.offScreenParams.mixedScene = new THREE.Scene();

    // オフスクリーンで作成したテクスチャを画面表示する板ポリゴンのジオメトリ
    const geometry = new THREE.PlaneGeometry(this.params.viewWidth, this.params.viewHeight);

    // 板ポリゴンに貼り付けるマテリアル
    const material = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      transparent: true,
      uniforms: {
        u_show_background: { value: this.params.showBackground },
        u_background_texture: { value: this.velocityImageParams.texture },
        u_particle_texture: { value: this.offScreenParams.getCurrentTexture() },
      },
      vertexShader: /* GLSL */`
        varying vec2 vUv;
        void main() {
          gl_Position =  projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          vUv = uv;
        }
      `,
      fragmentShader: /* GLSL */`
        uniform bool u_show_background;
        uniform sampler2D u_background_texture;
        uniform sampler2D u_particle_texture;
        varying vec2 vUv;
        void main() {
          vec4 backgroundColor = texture2D(u_background_texture, vUv);
          vec4 particleColor = texture2D(u_particle_texture, vUv);
          if (u_show_background) {
            gl_FragColor = vec4(mix(backgroundColor.rgb, particleColor.rgb, particleColor.a), 1.0);
          } else {
            gl_FragColor = particleColor;
          }
        }
      `,
    });

    // オフスクリーンで作成したテクスチャを画面表示するメッシュ
    const mesh = new THREE.Mesh(geometry, material);

    // シーンに追加
    this.scene.add(mesh);

    // 保存しておく（uniformsの値を変更するため）
    this.params.disipalyMesh = mesh;
  }


  initStatsjs = () => {
    let container = document.getElementById("statsjsContainer");
    if (!container) {
      container = document.createElement("div");
      container.id = "statsjsContainer";
      this.container.appendChild(container);
    }

    this.statsjs = new Stats();
    this.statsjs.dom.style.position = "relative";
    this.statsjs.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
    container.appendChild(this.statsjs.dom);
  }


  initGui = () => {
    const guiContainer = document.getElementById("guiContainer");
    const gui = new GUI({
      container: guiContainer,
      width: 300,
    });

    gui
      .add(this.uniforms.u_point_size, "value")
      .name("particle size")
      .min(1.0)
      .max(3.0)
      .step(0.1);

    gui
      .add(this.params, "showBackground")
      .name("show background")
      .onChange((value) => {
        this.params.disipalyMesh.material.uniforms.u_show_background.value = value;
      });

    gui
      .add(this.params, "showParticles")
      .name("show particles")
      .onChange((value) => {
        this.params.particleMesh.visible = value;
      });

  }


  render = () => {
    // 再帰処理
    requestAnimationFrame(this.render);

    this.renderParams.delta += this.renderParams.clock.getDelta();
    if (this.renderParams.delta < this.renderParams.interval) {
      return;
    }

    {
      // stats.jsを更新
      this.statsjs.update();

      // パーティクルの位置を更新
      this.updateParticles();

      // ★オフスクリーン用のレンダーターゲットにパーティクルを描画
      this.renderer.setRenderTarget(this.offScreenParams.target);
      this.renderer.render(this.offScreenParams.scene, this.camera);
      this.renderer.setRenderTarget(null);

      // ★一つ前のフレームのテクスチャと、いまのテクスチャを重ね合わせる

      // ★uniformsにテクスチャをセットして、
      this.offScreenParams.mixedMesh.material.uniforms.u_current_texture.value = this.offScreenParams.target.texture;
      this.offScreenParams.mixedMesh.material.uniforms.u_previous_texture.value = this.offScreenParams.prevTarget.texture;

      // ★オフスクリーンで合成する
      this.renderer.setRenderTarget(this.offScreenParams.mixedTarget);
      this.renderer.render(this.offScreenParams.mixedScene, this.camera);
      this.renderer.setRenderTarget(null);

      // ★スワップする
      this.offScreenParams.swap();

      // 再描画
      this.renderer.render(this.scene, this.camera);
    }

    this.renderParams.delta %= this.renderParams.interval;
  }


  createColorRampArray() {
    const colors = {
      0.0: '#3288bd',
      0.1: '#66c2a5',
      0.2: '#abdda4',
      0.3: '#e6f598',
      0.4: '#fee08b',
      0.5: '#fdae61',
      0.6: '#f46d43',
      1.0: '#d53e4f'
    };

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // 256 x 1でグラデーションを作成
    canvas.width = 256;
    canvas.height = 1;

    const gradient = ctx.createLinearGradient(0, 0, 256, 0);
    for (const stop in colors) {
      gradient.addColorStop(+stop, colors[stop]);
    }

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 1);

    return new Uint8Array(ctx.getImageData(0, 0, 256, 1).data);
  }


  createColorRampTexture = () => {
    // 256 x 1 のテクスチャを作成
    const width = 256;

    const computationRenderer = new GPUComputationRenderer(width, 1, this.renderer);
    const initialTexture = computationRenderer.createTexture();

    // colors は 256 x 4(RGBA) = 1024 のUint8Array
    const colors = this.createColorRampArray();

    for (let i = 0; i < width; i++) {
      const index = i * 4;
      initialTexture.image.data[index + 0] = colors[index + 0] / 255;  // R
      initialTexture.image.data[index + 1] = colors[index + 1] / 255;  // G
      initialTexture.image.data[index + 2] = colors[index + 2] / 255;  // B
      initialTexture.image.data[index + 3] = colors[index + 3] / 255;  // A
    }

    const shader = 'void main() { }';  // compute()しないので空でよい
    const variable = computationRenderer.addVariable("textureColorRamp",shader,initialTexture);
    computationRenderer.setVariableDependencies(variable, [variable]);
    computationRenderer.init();

    // テクスチャを取り出してuniformsに保存
    this.uniforms.u_color_ramp.value = computationRenderer.getCurrentRenderTarget(variable).texture;
  }


  createVelocityTexture = () => {

    // 1. GPUComputationRendererを初期化

    const computationRenderer = new GPUComputationRenderer(
      this.velocityImageParams.imageWidth,   // width
      this.velocityImageParams.imageHeight,  // height
      this.renderer,                         // renderer
    );

    // 2. テクスチャを作成

    const initialTexture = computationRenderer.createTexture();

    // 想定しているテクスチャの構造（Three.jsのスクリーン座標と同じ構造）
    //
    // height
    //       +--+--+--+--+--+--+--+
    //   ... |  |  |  |  |  |  |  |
    //       +--+--+--+--+--+--+--+
    //     1 |  |  |  |  |  |  |  |
    //       +--+--+--+--+--+--+--+
    //     0 |  |  |  |  |  |  |  |
    //       +--+--+--+--+--+--+--+
    //        0  1  2  3  4  5  ... width
    //

    // 3. 作成したテクスチャに色情報を埋め込む
    {
      const width = this.velocityImageParams.imageWidth;
      const height = this.velocityImageParams.imageHeight;

      const colors = this.velocityImageParams.colors;

      for (let y = 0; y < height; y++) {
        // Y座標がy番目のピクセルに関して、
        for (let x = 0; x < width; x++) {
          // X座標がx番目のピクセルに関して、

          // colors配列はRGBの順番で格納されているので3倍する
          const velocityIndex = (y * width + x) * 3;

          // テクスチャの配列はvec4を格納するので4倍する
          const index = (y * width + x) * 4;

          initialTexture.image.data[index + 0] = colors[velocityIndex + 0] - 0.5;  // R
          initialTexture.image.data[index + 1] = colors[velocityIndex + 1] - 0.5;  // G
          initialTexture.image.data[index + 2] = 0.0;                              // 未使用
          initialTexture.image.data[index + 3] = 0.0;                              // 未使用
        }
      }
    }

    // 4. 変数に紐づけるフラグメントシェーダーを作成する
    const shader = 'void main() {}';  // compute()しないので空でよい

    // 5. computationRenderer.addVariable();
    const velocityVariable = computationRenderer.addVariable(
      "textureVelocity",  // シェーダーの中で参照する名前（未使用なので何でも良い）
      shader,             // シェーダーコード
      initialTexture      // 最初に作ったテクスチャを渡す
    );

    // 6. computationRenderer.setVariableDependencies();
    computationRenderer.setVariableDependencies(velocityVariable, [velocityVariable]);

    // 7. computationRenderer.init();
    computationRenderer.init();

    // 8. テクスチャを取り出して保存しておく
    this.velocityImageParams.textureVelocity = computationRenderer.getCurrentRenderTarget(velocityVariable).texture;
  }


  initComputationRenderer = () => {

    //
    // GPUComputationRendererを初期化
    //

    const computationRenderer = new GPUComputationRenderer(
      640,            // width
      480,            // height
      this.renderer,  // renderer
    );

    // widthとheightは上限が16384で、この値を超えるとエラーになる
    // したがってnumParticles x 1 のテクスチャで作ると扱えるパーティクルの数は16384個に制限される
    // そこで640x480のテクスチャを使って、より多くのパーティクルを扱えるようにする
    // 約30万個のパーティクルを扱える

    // フレームごとにcompute()を実行する必要があるので、インスタンス変数に保存しておく
    this.computationRenderer = computationRenderer;

    //
    // computationRenderer.createTexture();
    //

    // 想定しているテクスチャの構造
    //
    //         0  1  2  3  4  5  639
    //        +--+--+--+--+--+--+--+
    //      0 |  |  |  |  |  |  |  |
    //        +--+--+--+--+--+--+--+
    //    640 |  |  |  |  |  |  |  |
    //        +--+--+--+--+--+--+--+
    //   ...  |  |  |  |  |  |  |  |
    //        +--+--+--+--+--+--+--+

    // パーティクルの位置と速度の情報を格納するテクスチャを作成して、
    const initialPositionTexture = computationRenderer.createTexture();

    // テクスチャに情報を埋め込む、
    {
      const width = this.params.viewWidth;
      const height = this.params.viewHeight;

      const positionArray = initialPositionTexture.image.data;

      for (let i = 0; i < this.params.numParticles; i++) {
        // 配列のインデックスはvec4を格納するので4倍する
        const index = i * 4;

        // 初期状態はランダムな場所に配置する
        positionArray[index + 0] = Math.random() * width - width / 2;     // X座標
        positionArray[index + 1] = Math.random() * height - height / 2;   // Y座標
        positionArray[index + 2] = 0.0                                    // 速度X
        positionArray[index + 3] = 0.0;                                   // 速度Y
      }
    }

    // 変数に紐づけるフラグメントシェーダー
    const texturePositionShader = /* glsl */`

      // 速度情報が書き込まれているテクスチャをuniformで受け取る
      uniform sampler2D u_texture_velocity;

      // パーティクルの移動速度をuniformで受け取る
      uniform float u_particle_speed;

      // パーティクルをランダムな位置に飛ばす確率をuniformで受け取る
      uniform float u_drop_rate;
      uniform float u_drop_rate_bump;

      // ランダムのシード（JavaScriptでMath.random()を実行して渡す）
      uniform float u_rand_seed;

      // 疑似ランダム関数
      // https://blog.mapbox.com/how-i-built-a-wind-map-with-webgl-b63022b5537f
      // https://stackoverflow.com/questions/4200224/random-noise-functions-for-glsl
      float rand(vec2 p) {
        return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
      }

      vec2 getVelocityFromTexture(vec2 position) {

        // スクリーン上のXY座標を元に、速度用テクスチャにおけるUV座標を計算する
        // X座標の範囲は-width/2 ~ width/2 なので、右にwidth/2加算する
        // Y座標も同様
        float u = (position.x + ${this.params.viewWidth}.0 / 2.0) / (${this.params.viewWidth}.0 - 1.0);
        float v = (position.y + ${this.params.viewHeight}.0 / 2.0) / (${this.params.viewHeight}.0 - 1.0);
        vec2 uv = vec2(u, v);

        // このピクセルの速度を取得 RがX方向、GがY方向
        vec2 center = texture2D(u_texture_velocity, uv).rg;

        // 速度用テクスチャは画素数が粗いので近傍の速度を取得して補間する
        float xGrid = 1.0 / ${this.params.viewWidth}.0;
        float yGrid = 1.0 / ${this.params.viewHeight}.0;

        vec2 l = texture2D(u_texture_velocity, uv - vec2(xGrid, 0.0)).rg;   // Uを一つ左に移動
        vec2 r = texture2D(u_texture_velocity, uv + vec2(xGrid, 0.0)).rg;   // Uを一つ右に移動
        vec2 t = texture2D(u_texture_velocity, uv + vec2(0.0, yGrid)).rg;   // Vを一つ上に移動
        vec2 b = texture2D(u_texture_velocity, uv - vec2(0.0, yGrid)).rg;   // Vを一つ下に移動

        // mix()を使って補間する、もしくは
        // vec2 f = fract(uv * vec2(${this.params.viewWidth}.0, ${this.params.viewHeight}.0));
        // vec2 vel = mix(mix(l, r, f.x), mix(t, b, f.x), f.y);

        // 単純に上下左右の平均を取る
        vec2 vel = (center + l + t + r + b) / 5.0;

        // 極付近のX方向はメルカトル図法の影響で速度が早いはずなので、補正をかける
        float distortion = cos(radians(v * 180.0 - 90.0));
        vel.x = (vel.x / distortion);

        return vel;
      }


      void main() {

        // UV座標を取得
        vec2 uv = gl_FragCoord.xy / resolution.xy;

        // 取り出したvec4の使い方は(x, y, vel.x, vel.y)と定義
        vec4 texturePositionValue = texture2D(texturePosition, uv);

        // texturePositionに保存してあるXY座標を取り出す
        vec2 currentPosition = texturePositionValue.xy;

        // 現在位置における風のベクトルを速度用テクスチャから取得
        vec2 velocity = getVelocityFromTexture(currentPosition);

        // 新しい位置を計算
        vec2 newPosition = currentPosition + velocity * u_particle_speed;

        // 画面の上下左右を超えた場合の処理
        // newPositionが0.0 ~ 1.0に正規化されてる値ならfract(1.0 + newPosition)ですむのだが・・・
        if (newPosition.x < -${this.params.viewWidth}.0 / 2.0) newPosition.x = ${this.params.viewWidth}.0 / 2.0;
        if (newPosition.x > ${this.params.viewWidth}.0 / 2.0) newPosition.x = -${this.params.viewWidth}.0 / 2.0;
        if (newPosition.y < -${this.params.viewHeight}.0 / 2.0) newPosition.y = ${this.params.viewHeight}.0 / 2.0;
        if (newPosition.y > ${this.params.viewHeight}.0 / 2.0) newPosition.y = -${this.params.viewHeight}.0 / 2.0;

        // ランダムな位置に飛ばす確率を計算
        // 速度が早いほど飛びやすくなる
        float dropRate = u_drop_rate + length(velocity) * u_drop_rate_bump;

        // ランダムに生成した値が1.0-dropRateの範囲に収まっていれば0.0、それ以外は1.0
        // つまりほとんどの場合は0.0で、稀に1.0になる
        float drop = step(1.0 - dropRate, rand(newPosition.xy));

        // ランダムな座標を計算
        vec2 randomPosition = vec2(
          rand(uv * u_rand_seed + 1.3) * ${this.params.viewWidth}.0 - ${this.params.viewWidth}.0 / 2.0,
          rand(uv * u_rand_seed + 2.1) * ${this.params.viewHeight}.0 - ${this.params.viewHeight}.0 / 2.0
        );

        // dropが1.0ならランダムな位置に飛ぶ
        newPosition = mix(newPosition, randomPosition, drop);

        // 同じ位置にとどまってしまう場合はランダムな位置に飛ばす
        float d = distance(currentPosition, newPosition);
        if (d < 0.00001) {
          newPosition = randomPosition;
        }

        // 新しい位置情報を書き込む
        gl_FragColor = vec4(newPosition, velocity);
      }
    `;

    //
    // computationRenderer.addVariable();
    //

    // テクスチャと、それに対応するシェーダを指定して、変数 "texturePosition" を追加する
    // シェーダーの中で texture2D( texturePosition, uv ) のように参照できるようになる
    // addVariable()の戻り値は getCurrentRenderTarget() でテクスチャを取り出すときに必要
    const positionVariable = computationRenderer.addVariable(
      "texturePosition",      // シェーダーの中で参照する名前
      texturePositionShader,  // シェーダーコード
      initialPositionTexture  // 最初に作ったテクスチャを渡す
    );

    // フラグメントシェーダーに渡すuniformを設定する
    positionVariable.material.uniforms = {
      // 速度情報が書き込まれているテクスチャ
      u_texture_velocity: { value: this.velocityImageParams.textureVelocity },

      // パーティクルの移動速度
      u_particle_speed: { value: this.params.particleSpeed },

      // パーティクルをランダムな位置に飛ばす確率
      u_drop_rate: { value: this.params.dropRate },

      // パーティクルをランダムな位置に飛ばす確率の増加量
      u_drop_rate_bump: { value: this.params.dropRateBump },

      // ランダムのシード
      u_rand_seed: { value: Math.random() },
    };

    //
    // computationRenderer.setVariableDependencies();
    //

    // 追加した変数の依存関係を設定する
    computationRenderer.setVariableDependencies(positionVariable, [positionVariable]);

    //
    // computationRenderer.init();
    //

    const error = computationRenderer.init();
    if (error !== null) {
      console.error(error);
      new Error(error);
    }

    // テクスチャオブジェクトを取得するして
    // パーティクルを描画するシェーダーマテリアルのuniformsに設定する
    // compute()するたびにテクスチャのデータは更新される
    this.uniforms.u_texture_position.value = computationRenderer.getCurrentRenderTarget(positionVariable).texture;

  }


  // これは未使用
  initBackground = () => {
    // 平面のジオメトリを作成
    const geometry = new THREE.PlaneGeometry(this.params.viewWidth, this.params.viewHeight);

    // ダウンロードしておいたImage()オブジェクトを使ってテクスチャを作成
    const texture = new THREE.Texture(this.velocityImageParams.velocityImage);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.needsUpdate = true;

    // マテリアルを作成
    const material = new THREE.MeshBasicMaterial({
      map: texture,
    });

    // メッシュ化
    const mesh = new THREE.Mesh(geometry, material);

    // カメラがOrthographicCameraなので、平面の向きを調整しなくてよい
    // mesh.rotation.x = - Math.PI / 2;
    // mesh.position.x = this.params.width / 2;
    // mesh.position.y = -this.params.height / 2;
    // mesh.scale.set(this.params.width, this.params.height, 1);

    // メッシュをparamsに保存しておく
    this.params.backgroundMesh = mesh;

    // シーンに追加
    this.scene.add(mesh);
  }


  initBackgroundTexture = () => {
    // ダウンロードしておいたImage()オブジェクトを使ってテクスチャを作成
    const texture = new THREE.Texture(this.velocityImageParams.velocityImage);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.needsUpdate = true;

    // テクスチャを保存
    this.velocityImageParams.texture = texture;
  }


  initParticles = () => {

    // パーティクルの数
    const numParticles = this.params.numParticles;

    // positionアトリビュート用の配列
    const positions = new Float32Array(numParticles * 3);

    // パーティクルの位置は原点に設定(フレームごとにシェーダーで更新するので適当でよい)
    for (let i = 0; i < numParticles; i++) {
      // i番目のパーティクルに関して、位置情報を設定
      const index = i * 3;
      positions[index + 0] = 0.0;  // X座標 0.0は画像の中央
      positions[index + 1] = 0.0;  // Y座標 0.0は画像の中央
      positions[index + 2] = 0.0;  // Z座標（未使用）
    }

    // アトリビュート uv を設定するための配列を初期化
    //
    // ★★★ ここ超重要！ ★★★
    // UV座標を設定することで、GPUComputationRendererで作成した計算用テクスチャの情報を
    // 自分自身のUV座標で取り出すことができる

    // 想定しているテクスチャの構造
    //
    //         0  1  2  3  4  5  639
    //        +--+--+--+--+--+--+--+
    //      0 |  |  |  |  |  |  |  |
    //        +--+--+--+--+--+--+--+
    //    640 |  |  |  |  |  |  |  |
    //        +--+--+--+--+--+--+--+
    //   ...  |  |  |  |  |  |  |  |
    //        +--+--+--+--+--+--+--+
    //
    // 先頭から何番目のパーティクルか、に応じてUV座標を 0.0 ~ 1.0 の範囲で正規化する

    // uvアトリビュート用の配列
    const uvs = new Float32Array(numParticles * 2);

    for (let i = 0; i < numParticles; i++) {
      // i番目のパーティクルに関して、

      // テクスチャの横幅が640なので、640で割った商が行、余りが列
      const col = i % 640;
      const row = Math.floor(i / 640);

      const index = i * 2;
      uvs[index + 0] = col / (640 - 1);  // 0.0 ~ 1.0に正規化
      uvs[index + 1] = row / (640 - 1);  // 0.0 ~ 1.0に正規化
    }

    // バッファジオメトリを作成
    const geometry = new THREE.BufferGeometry();

    // バッファジオメトリにpositionアトリビュートを設定する
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

    // バッファジオメトリにuvアトリビュートを設定する
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))

    // シェーダーマテリアルを作成
    const material = new THREE.ShaderMaterial({
      transparent: true,

      uniforms: this.uniforms,

      vertexShader: /*glsl*/`

        // 位置情報が書き込まれているテクスチャ texturePosition はuniformで渡される
        uniform sampler2D u_texture_position;

        uniform float u_point_size;

        // 速度情報をフラグメントシェーダーに渡す
        varying vec2 vVelocity;

        void main() {
          // 自身のUV座標に対応するテクスチャの値を
          vec4 texturePositionValue = texture2D(u_texture_position, uv);

          // 位置はXY
          vec2 pos = texturePositionValue.xy;

          // 位置を取り出した値に更新してgl_Positionに保存
          gl_Position =  projectionMatrix * modelViewMatrix * vec4(pos, 0.0, 1.0);

          // 速度の情報をvaryingでフラグメントシェーダーに渡す
          vVelocity = texturePositionValue.zw;

          // パーティクルの大きさ
          gl_PointSize = u_point_size;
        }
      `,

      fragmentShader: /*glsl*/`

        // 色が書き込まれている256x1のテクスチャをuniformで受け取る
        uniform sampler2D u_color_ramp;

        varying vec2 vVelocity;

        void main() {

          // 0.0 ~ 1.0に正規化した速度を取得
          float speed = clamp(length(vVelocity), 0.0, 1.0);

          // u_color_rampは256x1の構造なのでUV座標がvec2(speed, 0.0)の場所の色を取得
          vec4 color = texture2D(u_color_ramp, vec2(speed, 0.0));
          gl_FragColor = color;

          // 単色ならこれ
          // gl_FragColor = vec4(0.0, 1.0, 0.0, 1.0);
        }
      `,
    });

    // メッシュ化
    const mesh = new THREE.Points(geometry, material);

    // メッシュをparamsに保存しておく(lil-guiで表示のON/OFFを切り替えるため)
    this.params.particleMesh = mesh;

    // ★ パーティクルのメッシュをオフスクリーン用のシーンに追加
    this.offScreenParams.scene.add(mesh);


    // ★ 一つ前のテクスチャといまのテクスチャを合成したメッシュを作る
    const mixedMesh = new THREE.Mesh(
      // プレーンジオメトリと、
      new THREE.PlaneGeometry(this.params.viewWidth, this.params.viewHeight),
      // シェーダーマテリアルでメッシュを作成
      new THREE.ShaderMaterial({
        uniforms: {
          u_current_texture: { value: null },
          u_previous_texture: { value: null },
        },

        vertexShader: /*glsl*/`
          varying vec2 vUv;
          void main() {
            gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
            vUv = uv;
          }
        `,

        fragmentShader: /*glsl*/`
          precision mediump float;

          uniform sampler2D u_current_texture;
          uniform sampler2D u_previous_texture;
          varying vec2 vUv;

          float when_gt(float x, float y) {
            return max(sign(x-y), 0.0);
          }

          void test1() {
            vec4 curr = texture2D(u_current_texture, vUv);
            vec4 prev = texture2D(u_previous_texture, vUv) - vec4(vec3(0.0), 0.02);
            vec4 mixed = curr + prev;
            gl_FragColor = mixed;
          }

          void test2() {
            vec4 curr = texture2D(u_current_texture, vUv);
            vec4 prev = texture2D(u_previous_texture, vUv);
            prev *= 0.99;
            vec4 mixed = curr + prev;
            // mixed = vec4(mix(curr.rgb, prev.rgb, prev.a), prev.a);
            // mixed = mix(curr, prev, 0.8);
            // mixed = vec4(vec3(0.0, 1.0, 0.0), mixed.a);
            gl_FragColor = mixed;
          }

          void test3() {
            // https://discourse.threejs.org/t/shader-material-blending/9087
            vec4 curr = texture2D(u_current_texture, vUv);
            vec4 prev = texture2D(u_previous_texture, vUv) * 0.99;
            float threshold = 0.5;
            prev.r *= when_gt(prev.r, threshold);
            prev.g *= when_gt(prev.g, threshold);
            prev.b *= when_gt(prev.b, threshold);
            prev.a *= when_gt(prev.a, threshold);
            gl_FragColor = curr + prev;
          }

          void test4() {
            vec4 curr = texture2D(u_current_texture, vUv);
            vec4 prev = texture2D(u_previous_texture, vUv);

            prev -= vec4(vec3(0.0), 0.01);

            vec4 mixed = curr + prev;

            if (mixed.r >= 1.0 || mixed.g >= 1.0 || mixed.b >= 1.0) {
              mixed /= 2.0;
            }

            gl_FragColor = mixed;
          }

          void test5() {
            vec4 curr = texture2D(u_current_texture, vUv);
            vec4 prev = texture2D(u_previous_texture, vUv);

            // 過去のフレームの色を少し暗くする
            prev -= vec4(vec3(0.0), 0.01);

            // これでもよい
            // vec4 mixed = curr * curr.a + prev * (1.0 - curr.a);

            // curr.aを二値化して、prevかcurrのどちらかを描画する
            vec4 mixed = mix(prev, curr, step(0.5, curr.a));

            gl_FragColor = mixed;
          }

          void main() {
            test5();
          }
        `,
      })
    );

    // ★テクスチャを合成したメッシュはオフスクリーン用のシーンに追加
    this.offScreenParams.mixedScene.add(mixedMesh);

    // ★保存しておく（uniformsで渡すテクスチャを毎フレームセットするため）
    this.offScreenParams.mixedMesh = mixedMesh;
  }

  updateParticles = () => {
    // パーティクルの位置を更新するためにGPUComputationRendererを使って計算する
    // 計算結果はuniformsで渡したテクスチャの中に保存される（テクスチャのインスタンスは変わらない）
    this.computationRenderer.compute();
  }

}
