import * as THREE from "three";
import { OrbitControls } from "three/controls/OrbitControls.js";

// lil-gui
import { GUI } from "three/libs/lil-gui.module.min.js";

// stats.js
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
    interval: 1 / 30,  // = 30fps
  }

  uniforms = {

    u_time: { value: 0.0 },

    // 周波数のスケール
    u_freq_scale: { value: 1.0 },
  }

  params = {
    // カーブを生成するTHREE.Curveを継承したクラスのインスタンス
    curve: null,

    // カーブを構成する点の数
    numPoints: 50,

  }


  constructor(params = {}) {
    this.params = Object.assign(this.params, params);

    // scene, camera, renderer, controllerを初期化
    this.initThreejs();

    // lil-guiを初期化
    this.initGui();

    // stats.jsを初期化
    this.initStatsjs();

    // ラインを作成
    this.initLine();
    this.initCurve();

    // フレーム毎の処理
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
    this.camera.position.set(0, 4, 4);

    // レンダラ
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    // コントローラ
    this.controller = new OrbitControls(this.camera, this.renderer.domElement);

    // グリッドヘルパー
    const gridHelper = new THREE.GridHelper(10, 10, new THREE.Color(0x505050), new THREE.Color(0x505050));
    gridHelper.position.set(0, -1, 0);
    this.scene.add(gridHelper);

    // 軸を表示
    //
    //   Y(green)
    //    |
    //    +---- X(red)
    //   /
    //  Z(blue)
    //
    const axesHelper = new THREE.AxesHelper(0.25);
    // axesHelper.position.set(0, 1, 0);
    this.scene.add(axesHelper);

  }


  initGui = () => {
    const guiContainer = document.getElementById("guiContainer");
    const gui = new GUI({
      container: guiContainer,
      width: 300,
    });

    gui
      .add(this.uniforms.u_freq_scale, "value")
      .min(1.0)
      .max(20.0)
      .step(2.0)
      .name(navigator.language.startsWith("ja") ? "周波数係数" : "Frequency Scale");

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

      // uniform変数の値を更新
      this.uniforms.u_time.value += 0.01;
      this.uniforms.u_time.value %= 1.0;

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
  };


  // カーブを作成する
  createCurve = () => {
    if (this.params.curve) {
      return;
    }

    // curveを作成
    const curve = new THREE.CubicBezierCurve3(
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(-0.5, 1.5, 0),
      new THREE.Vector3(0.5, -1.5, 0),
      new THREE.Vector3(1, 0, 0)
    );

    // curveは外から参照できるようにしておく
    this.params.curve = curve;
  }


  initLine = () => {
    // 共通に用いるシェーダーマテリアルを作成
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: this.vertexShader,
      fragmentShader: this.fragmentShader,
    });


    // ジオメトリを3個作成
    const source1 = new THREE.Vector3(-1, 0, 1.5);
    const destination1 = new THREE.Vector3(1, 0, 1.5);
    const geometry1 = new THREE.BufferGeometry().setFromPoints([source1, destination1]);

    const source2 = new THREE.Vector3(-1, 0, 2.0);
    const destination2 = new THREE.Vector3(1, 0, 2.0);
    const geometry2 = new THREE.BufferGeometry().setFromPoints([source2, destination2]);

    const source3 = new THREE.Vector3(-1, 0, 2.5);
    const destination3 = new THREE.Vector3(1, 0, 2.5);
    const geometry3 = new THREE.BufferGeometry().setFromPoints([source3, destination3]);

    // 0-1に正規化した長さ情報をアトリビュートで設定
    geometry1.setAttribute("length", new THREE.BufferAttribute(new Float32Array([0.0, 1.0]), 1));
    geometry2.setAttribute("length", new THREE.BufferAttribute(new Float32Array([0.0, 1.0]), 1));
    geometry3.setAttribute("length", new THREE.BufferAttribute(new Float32Array([0.0, 1.0]), 1));

    // geometry2は頂点にdirectionアトリビュートを追加して動きを逆向きにする
    // 数字は0.5よりも大きければ何でも良い
    geometry2.setAttribute("direction", new THREE.BufferAttribute(new Float32Array([1.0, 1.0]), 1));

    // geometry3は頂点ごとにdirectionアトリビュートを変えて動きを両方向にする
    // 0.5よりも小さいと正方向、0.5以上は逆方向になるので、両端をそれぞれ0.0, 1.0にする
    geometry3.setAttribute("direction", new THREE.BufferAttribute(new Float32Array([0.0, 1.0]), 1));

    // ラインをシーンに追加
    this.scene.add(new THREE.Line(geometry1, material));
    this.scene.add(new THREE.Line(geometry2, material));
    this.scene.add(new THREE.Line(geometry3, material));

  }


  initCurve = () => {

    this.createCurve();
    const curve = this.params.curve;
    const numPoints = this.params.numPoints

    // curve上の点を取得
    const points = curve.getPoints(numPoints);
    // numPoints + 1個の点が取得できる
    // console.log(points);

    const lengthAtPoints = curve.getLengths(numPoints);
    // numPoints + 1個の長さの配列
    // console.log(lengthAtPoints);

    // curveの全体の長さ
    const totalCurveLength = curve.getLength();

    // ジオメトリを３個作成
    const geometry1 = new THREE.BufferGeometry().setFromPoints(points);
    const geometry2 = geometry1.clone();
    const geometry3 = geometry1.clone();

    // 位置をZ軸方向にずらす
    geometry2.translate(0, 0, 0.5);
    geometry3.translate(0, 0, 1.0);

    // ジオメトリが持っている頂点の数(= numPoints + 1)
    const numVertices = geometry1.attributes.position.count;

    // 各頂点に正規化した長さ情報をアトリビュートで持たせる
    const lengthArray = new Float32Array(numVertices);
    for (let i = 0; i < numVertices; i++) {
      lengthArray[i] = lengthAtPoints[i] / totalCurveLength;
    }

    // lengthアトリビュートを追加
    geometry1.setAttribute("length", new THREE.BufferAttribute(lengthArray, 1));
    geometry2.setAttribute("length", new THREE.BufferAttribute(lengthArray, 1));
    geometry3.setAttribute("length", new THREE.BufferAttribute(lengthArray, 1));

    // geometry2はdirectionアトリビュートを追加して向きを逆にする
    const directionArray = new Float32Array(numVertices);
    for (let i = 0; i < numVertices; i++) {
      directionArray[i] = 1.0;
    }
    geometry2.setAttribute("direction", new THREE.BufferAttribute(directionArray, 1));

    // geometry3はdirectionアトリビュートを追加して半分だけ向きを逆にする
    const directionArray2 = directionArray.slice();
    for (let i = 0; i < numVertices / 2; i++) {
      directionArray2[i] = 0.0;
    }
    geometry3.setAttribute("direction", new THREE.BufferAttribute(directionArray2, 1));

    // シェーダーマテリアルを作成
    const shaderMaterial = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: this.vertexShader,
      fragmentShader: this.fragmentShader,
    });

    this.scene.add(new THREE.Line(geometry1, shaderMaterial));
    this.scene.add(new THREE.Line(geometry2, shaderMaterial));
    this.scene.add(new THREE.Line(geometry3, shaderMaterial));

  }


  vertexShader = /* glsl */`
    attribute float length;  // ジオメトリに設定したlengthアトリビュート
    varying float vLength;   // lengthアトリビュートをフラグメントシェーダーに渡す

    attribute float direction;  // ジオメトリに設定したdirectionアトリビュート
    varying float vDirection;  // directionアトリビュートをフラグメントシェーダーに渡す

    varying vec2 vUv;

    void main() {
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      vUv = uv;
      vLength = length;
      vDirection = direction;
    }
  `;


  fragmentShader = /* glsl */`
    uniform vec2 resolution;

    uniform float u_time;
    uniform float u_freq_scale;

    varying vec2 vUv;
    varying float vLength;
    varying float vDirection;

    void main() {
      float time = u_time;

      if(vDirection > 0.5) {
        time = -u_time;
      }

      vec3 moveColor = vec3(0.0, 1.0, 0.0);
      vec3 baseColor = vec3(0.6, 0.6, 0.6);

      float freq = (vLength - time) * 3.15 * u_freq_scale;
      float drawMove = step(0.0, sin(freq));  // sin()が0より大きいかどうかを判定
      vec3 color = mix(moveColor, baseColor, drawMove);

      gl_FragColor = vec4(color, 1.0);
      // gl_FragColor = vec4(color, drawMove);
    }
  `;

}
