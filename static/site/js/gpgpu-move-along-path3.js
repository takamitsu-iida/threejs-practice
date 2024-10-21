import * as THREE from "three";
import { OrbitControls } from "three/controls/OrbitControls.js";
import { GPUComputationRenderer } from "three/libs/misc/GPUComputationRenderer.js";

import { GUI } from "three/libs/lil-gui.module.min.js";

import Stats from "three/libs/stats.module.js";

//
// GPUComputationRenderer.compute()を使ってパーティクルを移動させる例
//

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
    animationId: null,
    clock: new THREE.Clock(),
    delta: 0,
    time: 0,
    interval: 1 / 40,  // = 60fps
  }

  params = {
    curveRadius: 2.0,
    curves: [],           // 作成したカーブを格納する配列
    numCurves: 100,       // カーブの数
    numParticles: 100,    // カーブあたりのパーティクルの数
    fractionStep: 0.001,  // curve.getPointAt(fraction) で指定するfractionのステップ
  }

  computationParams = {
    // カーブの位置情報を格納するテクスチャ
    textureCurvePosition: null,

    // パーティクルの位置を計算するGPUComputationRendererインスタンス
    // フレームごとにcompute()する
    computationRenderer: null,
  }

  uniforms = {
    // パーティクルの位置情報テクスチャ
    u_texture_particle_position: { value: null },

    // パーティクルのサイズ
    u_pixel_ratio: { value: Math.min(window.devicePixelRatio, 2.0) },
    u_size: { value: 30.0 },
  }


  constructor(params = {}) {

    this.params = Object.assign(this.params, params);

    // scene, camera, rendererを初期化
    this.initThreejs();

    // stats.jsを初期化
    this.initStatsjs();

    // lil-guiを初期化
    this.initGui();

    // コンテンツを初期化
    this.init();

  }


  init = () => {

    // アニメーションを停止
    this.stop();

    // シーンをクリア
    this.scene.clear();
    this.renderer.render(this.scene, this.camera);

    // パスを初期化
    this.initCurve();

    // カーブの位置情報を格納するテクスチャ textureCurvePosition を作成
    this.createCurvePositionTexture();

    // GPUComputationRendererを初期化
    this.initComputationRenderer();

    // パーティクルを初期化
    this.initParticles();

    // フレーム処理
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
    this.camera.position.set(5, 5, 5);

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


  initGui = () => {
    const guiContainer = document.getElementById("guiContainer");
    const gui = new GUI({
      container: guiContainer,
      width: 300,
    });

    // 一度だけ実行するための関数
    const doLater = (job, tmo) => {

      // 処理が登録されているならタイマーをキャンセル
      var tid = doLater.TID[job];
      if (tid) {
        window.clearTimeout(tid);
      }

      // タイムアウト登録する
      doLater.TID[job] = window.setTimeout(() => {
        // 実行前にタイマーIDをクリア
        doLater.TID[job] = null;
        // 登録処理を実行
        job.call();
      }, tmo);
    }

    // 処理からタイマーIDへのハッシュ
    doLater.TID = {};

    gui
      .add(this.params, "numCurves")
      .name("number of curves")
      .min(1)
      .max(200)
      .step(1)
      .onChange((value) => {
        doLater(this.init, 100);
      });

    gui
      .add(this.params, "numParticles")
      .name("number of particles")
      .min(1)
      .max(200)
      .step(1)
      .onChange((value) => {
        doLater(this.init, 100);
      });
  }



  render = () => {
    // 再帰処理
    this.renderParams.animationId = requestAnimationFrame(this.render);

    this.renderParams.delta += this.renderParams.clock.getDelta();
    if (this.renderParams.delta < this.renderParams.interval) {
      return;
    }

    {
      // stats.jsを更新
      this.statsjs.update();

      // カメラコントローラーの更新
      this.controller.update();

      // パーティクルの位置を更新
      this.updateParticles();

      // 再描画
      this.renderer.render(this.scene, this.camera);
    }

    this.renderParams.delta %= this.renderParams.interval;
  }


  stop = () => {
    if (this.renderParams.animationId) {
      cancelAnimationFrame(this.renderParams.animationId);
    }
    this.renderParams.animationId = null;
  }


  onWindowResize = (event) => {
    this.sizes.width = this.container.clientWidth;
    this.sizes.height = this.container.clientHeight;

    this.camera.aspect = this.sizes.width / this.sizes.height;
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.sizes.width, this.sizes.height);

    // uniformsで渡しているu_pixel_ratioも更新する
    this.uniforms.u_pixel_ratio.value = Math.min(window.devicePixelRatio, 2.0);
  }


  // カーブを作成して描画する
  initCurve = () => {

    this.params.curves = [];

    const thetaDelta = (Math.PI * 2) / this.params.numCurves;

    for (let i = 0; i < this.params.numCurves; i++) {

      const theta = thetaDelta * (i + 1);

      // curveを作成
      const curve = new THREE.CubicBezierCurve3(
        // 始点
        new THREE.Vector3().setFromSphericalCoords(this.params.curveRadius, 0.314, theta),
        // コントロールポイント1
        new THREE.Vector3().setFromSphericalCoords(this.params.curveRadius * 3.14, Math.PI / 4, theta),
        // コントロールポイント2
        new THREE.Vector3().setFromSphericalCoords(this.params.curveRadius * 3.14, 3 * Math.PI / 4, theta),
        // 終点
        new THREE.Vector3().setFromSphericalCoords(this.params.curveRadius, (Math.PI - 0.314), theta)
      );

      // ラインを作成してシーンに追加
      this.scene.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(curve.getPoints(50)),
          new THREE.LineBasicMaterial({ color: 0xa0a0a0 })
        )
      );

      // curveは外から参照できるようにしておく
      this.params.curves.push(curve);
    }

  }


  //
  // カーブの位置情報を格納するテクスチャを作成する
  //
  createCurvePositionTexture = () => {

    // fractionStepは間隔を示すので、ポイント数は1/fractionStep+1になる（+1するのを忘れないように！）
    const numFractions = Math.floor(1 / this.params.fractionStep) +1;

    // カーブの数
    const numCurves = this.params.numCurves;

    const computationRenderer = new GPUComputationRenderer(
      numFractions,  // width
      numCurves,     // height
      this.renderer  // renderer
    );

    // 0.0 ~ 1.0の範囲でfractionStepごとに位置情報を格納する
    //
    //                               numFractions
    //         +--+--+--+--+--+--+--+
    // curve 0 |  |  |  |  |  |  |  |
    //         +--+--+--+--+--+--+--+
    // curve 1 |  |  |  |  |  |  |  |
    //         +--+--+--+--+--+--+--+
    // curve 2 |  |  |  |  |  |  |  |
    //         +--+--+--+--+--+--+--+

    // 初期テクスチャを作成して、
    const texture = computationRenderer.createTexture();

    // 初期テクスチャにカーブの座標情報を埋め込む
    for (let i = 0; i < numCurves; i++) {
      // i番目のカーブに関して、
      const curve = this.params.curves[i];

      for (let j = 0; j < numFractions; j++) {
        // i番目のカーブのj番目のfractionに関して、
        let fraction = j * this.params.fractionStep;
        fraction = Math.min(fraction, 1.0);  // floatの誤差で1.0を超えないようにする

        // カーブ上のfractionに相当する場所の座標を取得
        const pointAt = curve.getPointAt(fraction);

        const index = (i * numFractions + j) * 4;
        texture.image.data[index + 0] = pointAt.x;  // X座標
        texture.image.data[index + 1] = pointAt.y;  // Y座標
        texture.image.data[index + 2] = pointAt.z;  // Z座標
        texture.image.data[index + 3] = 0.0;        // W座標(未使用)
      }
    }

    // 変数に紐づけるフラグメントシェーダー（空のシェーダーを作成）
    const shader = /* glsl */`
      void main() { }
    `;

    // テクスチャを変数に紐づける
    const variable = computationRenderer.addVariable(
      "textureCurvePosition",  // シェーダーの中で参照する名前（シェーダーで参照してないので何でもよい）
      shader,                  // シェーダーコード（空のシェーダー）
      texture                  // 初期テクスチャを渡す
    );

    // 依存関係を設定
    // computationRenderer.setVariableDependencies(variable, []);

    // 初期化
    computationRenderer.init();

    // テクスチャを取り出す
    this.computationParams.textureCurvePosition = computationRenderer.getCurrentRenderTarget(variable).texture;
  }

  //
  // パーティクルの位置を計算するGPUComputationRendererを作成する
  //
  initComputationRenderer = () => {

    // パーティクルの数だけピクセルが欲しいので、
    //   行 = numCurves
    //   列 = numParticles
    // でインスタンス化する
    const numParticles = this.params.numParticles;
    const numCurves = this.params.numCurves;

    const computationRenderer = new GPUComputationRenderer(
      numParticles,  // width
      numCurves,     // height
      this.renderer  // renderer
    );

    // 初期テクスチャを作成
    const texture = computationRenderer.createTexture();

    //                               numParticles
    //         +--+--+--+--+--+--+--+
    // curve 0 |  |  |  |  |  |  |  |
    //         +--+--+--+--+--+--+--+
    // curve 1 |  |  |  |  |  |  |  |
    //         +--+--+--+--+--+--+--+
    // curve 2 |  |  |  |  |  |  |  |
    //         +--+--+--+--+--+--+--+

    // 初期テクスチャにパーティクルの位置情報を埋め込む
    for (let i = 0; i < numCurves; i++) {
      // i番目のカーブに関して、

      for (let j = 0; j < numParticles; j++) {
        // i番目のカーブ上のj番目のパーティクルに関して、

        // そのパーティクルのfractionを設定する
        const fraction = j * (1 / this.params.numParticles);

        const index = (i * numParticles + j) * 4;
        texture.image.data[index + 0] = 0.0;       // X座標
        texture.image.data[index + 1] = 0.0;       // Y座標
        texture.image.data[index + 2] = 0.0;       // Z座標
        texture.image.data[index + 3] = fraction;  // W座標（そのパーティクルの現在のfraction値）
      }
    }

    // パーティクルの位置を更新するフラグメントシェーダー
    // パーティクルの位置情報を格納したtextureParticlePositionはuniformしなくても使える前提で良い
    // カーブの位置情報はuniformで渡す
    const shader = /* glsl */`

      uniform float u_fraction_step;

      uniform sampler2D u_texture_curve_position;

      void main() {
        // UV座標を計算
        vec2 uv = gl_FragCoord.xy / resolution.xy;

        // テクスチャの値を取り出す
        vec4 textureValue = texture2D( textureParticlePosition, uv );

        // パーティクルに割り当てられたfractionを取り出す（W座標に格納している）
        float fraction = textureValue.w;

        // fractionを進める
        fraction += u_fraction_step;

        // 1.0を超えたら0.0に戻す
        if (fraction > 1.0) {
          fraction = 0.0;
        }

        // 更新したfractionを保存する
        textureValue.w = fraction;

        // カーブの位置情報テクスチャを参照して自分自身の新しい位置を取得する
        vec2 curveUv = vec2(fraction, uv.y);  // カーブの位置情報テクスチャのU軸はfraction、V軸はカーブの番号を表している
        vec4 curvePosition = texture2D( u_texture_curve_position, vec2(fraction, uv.y) );

        // パーティクルの位置を保存する
        textureValue.xyz = curvePosition.xyz;

        // テクスチャに保存する
        gl_FragColor = textureValue;
      }
    `;

    // テクスチャを変数に紐づける
    const variable = computationRenderer.addVariable(
      "textureParticlePosition",  // シェーダーの中で参照する名前
      shader,                     // シェーダーコード
      texture                     // 最初に作ったテクスチャを渡す
    );

    // シェーダーで利用しているuniformを登録
    variable.material.uniforms = {
      u_fraction_step: { value: this.params.fractionStep },
      u_texture_curve_position: { value: this.computationParams.textureCurvePosition },
    };

    // 依存関係を設定
    computationRenderer.setVariableDependencies(variable, [variable]);

    // 初期化
    const error = computationRenderer.init();
    if (error !== null) {
      console.error(error);
      new Error("GPUComputationRenderer.init() failed.");
    }

    // フレームごとにcompute()するので、インスタンス変数に保存しておく
    this.computationParams.computationRenderer = computationRenderer;

    // テクスチャを取り出してthis.uniformsに登録
    this.uniforms.u_texture_particle_position.value = computationRenderer.getCurrentRenderTarget(variable).texture;
  }


  initParticles = () => {

    // パーティクルの総数は、カーブの数 * カーブあたりのパーティクルの数
    // この数だけジオメトリに頂点を作成する
    const numParticles = this.params.numCurves * this.params.numParticles;

    // パーティクルの位置を格納する配列を初期化
    const positions = new Float32Array(numParticles * 3);

    // パーティクルの位置は原点に設定(フレームごとにシェーダーで更新するので適当でよい)
    for (let i = 0; i < numParticles; i += 3) {
      positions[i * 3 + 0] = 0.0;
      positions[i * 3 + 1] = 0.0;
      positions[i * 3 + 2] = 0.0;
    }

    // アトリビュート uv を設定するための配列を初期化
    //
    // ★★★ ここ超重要！ ★★★
    // UV座標を設定することで、GPUComputationRendererで作成した計算用テクスチャの情報を
    // 自分自身のUV座標で取り出すことができる

    // テクスチャはこうなってる
    //
    //                               numParticles
    //         +--+--+--+--+--+--+--+
    // curve 0 |  |  |  |  |  |  |  |
    //         +--+--+--+--+--+--+--+
    // curve 1 |  |  |  |  |  |  |  |
    //         +--+--+--+--+--+--+--+
    // curve 2 |  |  |  |  |  |  |  |
    //         +--+--+--+--+--+--+--+

    const uvs = new Float32Array(numParticles * 2);

    for (let i = 0; i < this.params.numCurves; i++) {
      // i番目のカーブに関して、

      for (let j = 0; j < this.params.numParticles; j++) {
        // i番目のカーブ上の、j番目のパーティクルに関して、

        // U座標は0.0 ~ 1.0の範囲で、均等に配置する
        // V座標はカーブの番号（すなわちi）を0.0 ~ 1.0の範囲に正規化して指定する

        // 数字が0で始まる数は、-1しないと最後が1.0にならないので注意

        const index = (i * this.params.numParticles + j) * 2;
        uvs[index + 0] = j / (this.params.numParticles - 1);
        uvs[index + 1] = i / (this.params.numCurves - 1);
      }
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
        uniform sampler2D u_texture_particle_position;

        // パーティクルのサイズ
        uniform float u_pixel_ratio;
        uniform float u_size;

        void main() {
          // 位置をテクスチャから取得する
          vec3 pos = texture2D(u_texture_particle_position, uv).xyz;

          // 現在位置を取り出したposに更新する
          vec4 modelPosition = modelMatrix * vec4(pos, 1.0);
          vec4 viewPosition = viewMatrix * modelPosition;
          gl_Position = projectionMatrix * viewPosition;

          gl_PointSize = u_size * u_pixel_ratio;
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
    this.computationParams.computationRenderer.compute();
  }

}
