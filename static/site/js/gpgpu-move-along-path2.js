import * as THREE from "three";
import { OrbitControls } from "three/controls/OrbitControls.js";
import { GPUComputationRenderer } from "three/libs/misc/GPUComputationRenderer.js";

import Stats from "three/libs/stats.module.js";


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
    curveRadius: 2.0,
    curves: [],
    numCurves: 100,     // カーブの数
    numParticles: 100,  // カーブあたりのパーティクルの数
    fractionStep: 0.001,
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


  initComputeRenderer = () => {

    //
    // GPUComputationRendererを初期化
    //

    const numFractions = Math.floor(1 / this.params.fractionStep);
    const numCurves = this.params.numCurves;

    const computeRenderer = new GPUComputationRenderer(
      numFractions,  // width
      numCurves,     // height
      this.renderer  // renderer
    );

    // 0.0 ~ 1.0の範囲でfractionStepごとに位置情報を格納する
    //
    //                               numFractions
    //         +--+--+--+--+--+--+--+
    // curve 1 |  |  |  |  |  |  |  |
    //         +--+--+--+--+--+--+--+
    // curve 2 |  |  |  |  |  |  |  |
    //         +--+--+--+--+--+--+--+
    // curve 3 |  |  |  |  |  |  |  |
    //         +--+--+--+--+--+--+--+

    //
    // computeRenderer.createTexture();
    //

    // 位置情報を格納するテクスチャを作成して、
    const positionTexture = computeRenderer.createTexture();

    // テクスチャにカーブの座標情報を埋め込む
    {
      const positionArray = positionTexture.image.data;

      for (let i = 0; i < numCurves; i++) {

        // i番目のカーブに関して、
        const curve = this.params.curves[i];

        for (let j = 0; j < numFractions; j++) {
          // j番目のfractionに関して、
          const fraction = j * this.params.fractionStep;

          // カーブ上のfractionに相当する場所の座標を取得
          const pointAt = curve.getPointAt(fraction);

          const index = (i * numFractions + j) * 4;
          positionArray[index + 0] = pointAt.x;  // X座標
          positionArray[index + 1] = pointAt.y;  // Y座標
          positionArray[index + 2] = pointAt.z;  // Z座標
          positionArray[index + 3] = 0.0;        // W座標(未使用)
        }

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
    //                               numFractions
    //         +--+--+--+--+--+--+--+
    // curve 1 |  |  |  |  |  |  |  |
    //         +--+--+--+--+--+--+--+
    // curve 2 |  |  |  |  |  |  |  |
    //         +--+--+--+--+--+--+--+
    // curve 3 |  |  |  |  |  |  |  |
    //         +--+--+--+--+--+--+--+

    const uvs = new Float32Array(numParticles * 2);

    for (let i = 0; i < this.params.numCurves; i++) {
      // i番目のカーブに関して、

      for (let j = 0; j < this.params.numParticles; j++) {
        // i番目のカーブ上の、j番目のパーティクルに関して、

        // U座標は0.0 ~ 1.0の範囲で、均等に配置する
        // V座標はカーブの番号（すなわちi）を0.0 ~ 1.0の範囲に正規化して指定する

        const index = (i * this.params.numParticles + j) * 2;
        uvs[index + 0] = j / this.params.numParticles;  // カーブ上に均等に配置
        uvs[index + 1] = i / this.params.numCurves;     // カーブの番号を正規化
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
