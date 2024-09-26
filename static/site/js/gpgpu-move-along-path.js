import * as THREE from "three";
import { OrbitControls } from "three/controls/OrbitControls.js";

// stats.js
import Stats from "three/libs/stats.module.js";

// 必要な追加モジュール
// three.js/examples/jsm/misc/GPUComputationRenderer.js
// three.js/examples/jsm/postprocessing/Pass.js
import { GPUComputationRenderer } from "three/libs/misc/GPUComputationRenderer.js";

/*

GPUComputationRenderer

変数の概念を使用する。

変数は各計算要素（テクセル）ごとに４つの浮動小数点（RGBA）を保持する

各変数には、その変数を取得するために実行されるべきフラグメントシェーダがある

必要な数の変数を使用して依存関係を作成することで、シェーダーは他の変数のテクスチャにアクセスできるようになる

レンダラーには変数ごとに２つのレンダリングターゲットがあり、ピンポンを実現する

変数の名前にはtextureをプレフィクスとして付けるのが慣例
例： texturePosition, textureVelocity など

計算サイズ(sizeX * sizeY)はシェーダーで自動的に解像度として定義される
例：#DEFINE resolution vec2(1024.0, 1024.0)

*/


export class Main {

  container;

  sizes = {
    width: 0,
    height: 0
  }

  scene;
  camera;
  renderer;
  controller;

  statsjs;

  renderParams = {
    clock: new THREE.Clock(),
    delta: 0,
    time: 0,
    interval: 1 / 30,  // = 30fps
  }

  params = {
    curve: null,
    numParticles: 50,
    fractionStep: 0.002,
  }

  uniforms = {
    // カーブ上の位置を計算するためのfractionでフレームごとに更新する
    fraction: { value: 0.0 },

    // GPGPUで計算した位置情報を格納するテクスチャ
    texturePosition: { value: null },

    // パーティクルのサイズ
    uPixelRatio: { value: Math.min(window.devicePixelRatio, 2.0) },
    uSize: { value: 30.0 },
  }


  constructor(params = {}) {

    this.params = Object.assign(this.params, params);

    // scene, camera, rendererを初期化
    this.initThreejs();

    // stats.jsを初期化
    this.initStatsjs();

    // パスを初期化
    this.initCurve();

    // GPUComputationRendererを初期化
    this.initComputeRenderer();

    // パーティクルを初期化
    this.initParticles();

    // フレーム毎の処理(requestAnimationFrameで再帰的に呼び出される)
    this.render();

  }


  initThreejs = () => {
    // コンテナ
    this.container = document.getElementById("threejsContainer");

    // コンテナのサイズ
    this.sizes.width = this.container.clientWidth;
    this.sizes.height = this.container.clientHeight;

    // resizeイベントのハンドラを登録
    window.addEventListener("resize", this.onWindowResize, false);

    // シーン
    this.scene = new THREE.Scene();

    // カメラを初期化
    this.camera = new THREE.PerspectiveCamera(
      60,                                   // 視野角度 FOV
      this.sizes.width / this.sizes.height, // アスペクト比
      0.1,                                  // 開始距離
      100                                   // 終了距離
    );
    this.camera.position.set(2, 2, 2);

    // レンダラ
    this.renderer = new THREE.WebGLRenderer({ alpha: false, antialias: true });
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    // コントローラ
    this.controller = new OrbitControls(this.camera, this.renderer.domElement);

    // 軸を表示
    //
    //   Y(green)
    //    |
    //    +---- X(red)
    //   /
    //  Z(blue)
    //
    const axesHelper = new THREE.AxesHelper(10);
    this.scene.add(axesHelper);
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

      // カメラコントローラーの更新
      this.controller.update();

      // パーティクルの更新
      this.updateParticles();

      // 再描画
      this.renderer.render(this.scene, this.camera);
    }

    this.renderParams.delta %= this.renderParams.interval;
  }


  onWindowResize = (event) => {
    this.sizes.width = this.container.clientWidth;
    this.sizes.height = this.container.clientHeight;

    this.camera.aspect = this.sizes.width / this.sizes.height;
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.sizes.width, this.sizes.height);

    // uniformsで渡しているuPixelRatioも更新する
    this.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 2.0);
  }


  // カーブを作成して描画する
  initCurve = () => {

    // curveを作成
    const curve = new THREE.CubicBezierCurve3(
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(-0.5, 1.5, 0),
      new THREE.Vector3(0.5, -1.5, 0),
      new THREE.Vector3(1, 0, 0)
    );

    // ラインを作成してシーンに追加
    this.scene.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(curve.getPoints(50)),
        new THREE.LineBasicMaterial({ color: 0xa0a0a0 })
      )
    );

    // curveは外から参照できるようにしておく
    this.params.curve = curve;

  }


  initComputeRenderer = () => {

    //
    // GPUComputationRendererを初期化
    //

    const numFractions = Math.floor(1 / this.params.fractionStep);

    const computeRenderer = new GPUComputationRenderer(
      numFractions,  // width
      1,             // height
      this.renderer  // renderer
    );

    // 0.0 ~ 1.0の範囲でfractionStepごとに位置情報を格納する
    //
    //                         numFractions
    //  +--+--+--+--+--+--+--+
    //  |  |  |  |  |  |  |  |
    //  +--+--+--+--+--+--+--+

    //
    // computeRenderer.createTexture();
    //

    // 位置情報を格納するテクスチャを作成して、
    const positionTexture = computeRenderer.createTexture();

    // テクスチャにカーブの座標情報を埋め込む
    {
      const positionArray = positionTexture.image.data;

      let fraction = 0.0;
      for (let i = 0; i < positionArray.length; i += 4) {
        const point = this.params.curve.getPointAt(fraction);

        // vec4に格納するので、4つずつ値を入れていく
        positionArray[i + 0] = point.x;  // X座標
        positionArray[i + 1] = point.y;  // Y座標
        positionArray[i + 2] = point.z;  // Z座標
        positionArray[i + 3] = 0.0;      // W座標(未使用)

        fraction += this.params.fractionStep;
      }
    }

    // console.log(positionTexture);

    //
    // 変数に紐づけるシェーダー
    // 今回は一度位置情報を決めたら変更しないので、空のシェーダーを作成
    const positionShader = /* glsl */`
      void main() { }
    `;

    //
    // computeRenderer.addVariable();
    //

    // ここ重要

    // テクスチャと、それに対応するシェーダを指定して、変数 "texturePosition" を追加する
    // シェーダーの中で texture2D( texturePosition, uv ) のように参照できるようになる

    const positionVariable = computeRenderer.addVariable(
      "texturePosition",  // シェーダーの中で参照する名前
      positionShader,     // シェーダーコード
      positionTexture     // 最初に作ったテクスチャを渡す
    );

    // console.log(positionVariable);

    // 戻り値は getCurrentRenderTarget() でテクスチャを取り出すのに必要なので、
    // 通常の使い方であれば外から参照できる場所に保存する必要がある
    // 今回は一度テクスチャを作ったら更新しないので、特に保存する必要はない
    // this.params.positionVariable = positionVariable;

    //
    // computeRenderer.setVariableDependencies();
    //

    // 追加した変数の依存関係を設定する

    // シェーダーの中で使うのはtexturePositionだけなので、このように設定すればよい
    computeRenderer.setVariableDependencies(positionVariable, [positionVariable]);

    //
    // computeRenderer.init();
    //

    const error = computeRenderer.init();
    if (error !== null) {
      console.error(error);
      new Error(error);
    }

    //
    // テクスチャを取り出してシェーダーマテリアルのuniformsに設定する
    //

    this.uniforms.texturePosition.value = computeRenderer.getCurrentRenderTarget(positionVariable).texture;

  }



  initParticles = () => {

    // パーティクルの数
    const numParticles = this.params.numParticles;

    // パーティクルの位置を格納する配列を初期化
    // positionアトリビュートに設定する
    const positions = new Float32Array(numParticles * 3);

    // パーティクルの位置は原点に設定(フレームごとにシェーダーで更新するので適当でよい)
    for (let i = 0; i < numParticles; i++) {
      positions[i * 3 + 0] = 0.0;
      positions[i * 3 + 1] = 0.0;
      positions[i * 3 + 2] = 0.0;
    }

    // アトリビュート uv を設定するための配列を初期化
    //
    // ★★★ ここ超重要！ ★★★
    // UV座標を設定することで、GPUComputationRendererで作成した計算用テクスチャの情報を
    // 自分自身のUV座標で取り出すことができる
    //
    // カーブ上にパーティクルを均等に配置したいので、
    // ここでは(i / particleNum, 0)を設定する
    // uniformsでfractionを渡すので、UV座標にfractionを加算することで、位置を変えていく

    const uvs = new Float32Array(numParticles * 2);
    for (let i = 0; i < numParticles; i++) {
      uvs[i * 2 + 0] = i / numParticles;
      uvs[i * 2 + 1] = 0.0;
    }

    // ジオメトリを作成
    const geometry = new THREE.BufferGeometry();

    // positionとuvを設定する
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))

    // シェーダーマテリアルを作成
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,

      uniforms: this.uniforms,

      vertexShader: /* glsl */`

        // 位置情報が書き込まれているテクスチャtexturePosition
        // これは外からuniformで渡す必要がある
        uniform sampler2D texturePosition;

        // パーティクルのサイズ
        uniform float uPixelRatio;
        uniform float uSize;

        // カーブ上の位置を決めるfraction
        uniform float fraction;

        void main() {

          // fractionをUV座標のxに加算
          float x = uv.x + fraction;

          // これが1.0を超えるようなら、1.0を引いてループさせる
          if (x > 1.0) {
            x -= 1.0;
          }

          // 更新後のUV座標
          vec2 nextUv = vec2(x, uv.y);

          // 位置をテクスチャから取得する
          vec3 pos = texture2D(texturePosition, nextUv).xyz;

          // 現在位置にposを加えて位置を更新
          vec4 modelPosition = modelMatrix * vec4(position + pos, 1.0);
          vec4 viewPosition = viewMatrix * modelPosition;
          gl_Position = projectionMatrix * viewPosition;

          gl_PointSize = uSize * uPixelRatio;
          gl_PointSize *= (1.0 / -viewPosition.z);
        }

      `,
      fragmentShader: /* glsl */`
        void main() {
          float _radius = 0.4;
          vec2 dist = gl_PointCoord - vec2(0.5);
          // float strength = 1.0 - smoothstep(_radius-(_radius*0.4), _radius+(_radius*0.3), length(dist));
          float strength = 1.0 - smoothstep(_radius-(_radius*0.4), _radius+(_radius*0.3), dot(dist, dist)*2.0);

          gl_FragColor = vec4(1.0, 1.0, 1.0, strength);
        }
      `,
    });

    // パーティクルをメッシュ化して
    const mesh = new THREE.Points(geometry, material)

    // シーンに追加
    this.scene.add(mesh);

  }


  updateParticles = () => {
    this.uniforms.fraction.value += this.params.fractionStep;
    if (this.uniforms.fraction.value > 1.0) {
      this.uniforms.fraction.value = 0.0;
    }
  }

}
