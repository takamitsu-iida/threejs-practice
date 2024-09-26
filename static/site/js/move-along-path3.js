import * as THREE from "three";
import { OrbitControls } from "three/controls/OrbitControls.js";

// stats.js
import Stats from "three/libs/stats.module.js";

// 参照元
// https://codepen.io/lumm0x/pen/oNoxpaM?editors=0010


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
    delta: 0.0,
    interval: 1 / 30,  // = 30fps
  }

  params = {
    numParticles: 50,
    fractions: null,
    fractionStep: 0.002,
    curve: null,
    points: null,
  }


  constructor(params = {}) {
    this.params = Object.assign(this.params, params);

    this.initThreejs();

    this.initStatsjs();

    this.initParticles();

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

    // カメラ
    this.camera = new THREE.PerspectiveCamera(
      60,
      this.sizes.width / this.sizes.height,
      0.1,
      100
    );
    this.camera.position.set(2, 2, 2);

    // レンダラ
    // 複数のテクスチャを重ね合わせるためには、透過を有効にする必要がある
    this.renderer = new THREE.WebGLRenderer({ alpha: false, antialias: true });
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    // コントローラ
    this.controller = new OrbitControls(this.camera, this.renderer.domElement);

    // 軸を表示するヘルパーを初期化
    //
    //   Y(green)
    //    |
    //    +---- X(red)
    //   /
    //  Z(blue)
    //
    const axesHelper = new THREE.AxesHelper(1.0);
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

      // オブジェクトの更新
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
  }


  initParticles = () => {

    // curveを定義
    this.curve = new THREE.CubicBezierCurve3(
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(-0.5, 1.5, 0),
      new THREE.Vector3(0.5, -1.5, 0),
      new THREE.Vector3(1, 0, 0)
    );

    // ラインを作成してシーンに追加
    this.scene.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(this.curve.getPoints(50)),
        new THREE.LineBasicMaterial({ color: 0xa0a0a0 })
      )
    );

    // パーティクルをnumParticles個作成する
    const numParticles = this.params.numParticles;

    // パーティクルの位置
    const positions = new Float32Array(numParticles * 3);

    // カーブのgetPoint()を使って位置を決めるためのfractionをパーティクルの数だけ用意
    const fractions = new Float32Array(numParticles);

    for (let i = 0; i < numParticles; i++) {
      // i番目のパーティクルに関して、

      // 初期位置を原点に配置
      // フレームごとの更新でカーブ上を移動するので、適当に原点に配置しておく
      positions[i * 3 + 0] = 0.0;
      positions[i * 3 + 1] = 0.0;
      positions[i * 3 + 2] = 0.0;

      // fractionを0.0〜1.0の範囲で均等になるように初期化
      fractions[i] = i / numParticles;
    }

    // fractionsをparamsに保存して、外部から参照できるようにする
    this.params.fractions = fractions;

    // ジオメトリを作成して
    const geometry = new THREE.BufferGeometry();

    // positionアトリビュートを追加
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

    // シェーダーマテリアルを作成
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,

      uniforms: {
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2.0) },
        uSize: { value: 30.0 },
      },

      vertexShader: /* glsl */`
        uniform float uPixelRatio;
        uniform float uSize;

        void main() {
          vec4 modelPosition = modelMatrix * vec4(position, 1.);
        	vec4 viewPosition = viewMatrix * modelPosition;
          vec4 projectionPosition = projectionMatrix * viewPosition;
          gl_Position = projectionPosition;

          gl_PointSize = uSize * uPixelRatio;
          gl_PointSize *= (1.0 / -viewPosition.z);
        }
      `,

      fragmentShader: /* glsl */ `
        void main() {
          float _radius = 0.4;
          vec2 dist = gl_PointCoord - vec2(0.5);
          // float strength = 1.0 - smoothstep(_radius-(_radius*0.4), _radius+(_radius*0.3), length(dist));
          float strength = 1.0 - smoothstep(_radius-(_radius*0.4), _radius+(_radius*0.3), dot(dist, dist)*2.0);

          gl_FragColor = vec4(1.0, 1.0, 1.0, strength);
        }
      `,

    });

    // パーティクルを作成して
    this.points = new THREE.Points(geometry, material)

    // シーンに追加
    this.scene.add(this.points)
  }


  updateParticles = () => {
    const v = new THREE.Vector3();

    for (let i = 0; i < this.params.numParticles; i++) {
      // i番目のパーティクルに関して、

      // フレームごとにfractionを進める
      let fraction = this.params.fractions[i] + this.params.fractionStep;

      // fractionは0.0〜1.0の範囲なので、1.0を超えたら0.0に戻す
      while (fraction > 1.0) {
        fraction = 0.0;
      }

      // 更新したfractionを保存
      this.params.fractions[i] = fraction;

      // fractionに対応するカーブの位置を取得して
      this.curve.getPointAt(fraction, v);

      // それをpointsのgeometryに反映
      this.points.geometry.attributes.position.setXYZ(i, v.x, v.y, v.z);
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }


}
