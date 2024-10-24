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
    animationId: null,
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
    // カーブを構成する点の数
    numPoints: 50,

    // チューブの断面の半径
    radius: 0.02,

    // チューブの断面の分割数
    radialSegments: 8,
  }


  constructor(params = {}) {
    this.params = Object.assign(this.params, params);

    // scene, camera, renderer, controllerを初期化
    this.initThreejs();

    // stats.jsを初期化
    this.initStatsjs();

    // lil-guiを初期化
    this.initGui();

    // コンテンツを初期化
    this.initContents();
  }


  initContents = () => {
    // アニメーションを停止
    this.stop();

    // シーン上のメッシュを削除する
    // this.scene.clear();
    this.clearScene();

    // 削除した状態を描画
    this.renderer.render(this.scene, this.camera);

    // ラインを作成
    this.initCurve();
    this.initLine();

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
      .add(this.uniforms.u_freq_scale, "value")
      .min(1.0)
      .max(20.0)
      .step(2.0)
      .name(navigator.language.startsWith("ja") ? "周波数係数" : "Frequency Scale");

    gui
      .add(this.params, "numPoints")
      .min(2)
      .max(100)
      .step(1)
      .name(navigator.language.startsWith("ja") ? "線を構成する点の数" : "Number of Points")
      .onChange(() => {
        doLater(this.initContents, 100);
      });

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

      // uniform変数の値を更新
      this.uniforms.u_time.value += 0.01;
      this.uniforms.u_time.value %= 1.0;

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


  clearScene = () => {
    const objectsToRemove = [];

    this.scene.children.forEach((child) => {
      if (child.type === 'AxesHelper' || child.type === 'GridHelper' || child.type === 'Light' ) {
        return;
      }
      objectsToRemove.push(child);
    });

    objectsToRemove.forEach((object) => {
      this.scene.remove(object);
      if (object.geometry) {
        object.geometry.dispose();
      }
      if (object.material) {
        if (Array.isArray(object.material)) {
          object.material.forEach(material => material.dispose());
        } else {
          object.material.dispose();
        }
      }
    });
  }


  onWindowResize = (event) => {
    this.sizes.width = this.container.clientWidth;
    this.sizes.height = this.container.clientHeight;

    this.camera.aspect = this.sizes.width / this.sizes.height;
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.sizes.width, this.sizes.height);
  };


  initCurve = () => {

    // 共通に使うシェーダーマテリアルを作成
    const shaderMaterial = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: this.vertexShader,
      fragmentShader: this.fragmentShader,
    });

    // 曲線のCurveインスタンスを作成
    const cubicCurve = new THREE.CubicBezierCurve3(
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(-0.5, 1.5, 0),
      new THREE.Vector3(0.5, -1.5, 0),
      new THREE.Vector3(1, 0, 0)
    );

    // 曲線を表現する粒度を表す点の数
    const numPoints = this.params.numPoints

    // 曲線の各ポイントでの長さを取得
    const lengthAtPoints = cubicCurve.getLengths(numPoints);

    // curveの全体の長さ
    const totalCurveLength = cubicCurve.getLength();

    // チューブの断面の半径
    const radius = this.params.radius;

    // チューブの断面の分割数
    const radialSegments = this.params.radialSegments;

    const geometry1 = new THREE.TubeGeometry(
      cubicCurve,      // Curve - A 3D path that inherits from the Curve base class. Default is a quadratic bezier curve.
      numPoints,       // tubularSegments — Integer - The number of segments that make up the tube. Default is 64.
      radius,          // radius — Float - The radius of the tube. Default is 1.
      radialSegments,  // radialSegments — Integer - The number of segments that make up the cross-section. Default is 8.
      false            // closed — Boolean Is the tube open or closed. Default is false.
    );

    // geometry1をコピーしてgeometry2, geometry3を作成
    const geometry2 = geometry1.clone();
    const geometry3 = geometry1.clone();

    const numVertices = geometry1.attributes.position.count;

    // 各頂点に正規化した長さ情報をアトリビュートで持たせる
    let lengthArray = new Float32Array(numVertices);
    const scale = lengthArray.length / lengthAtPoints.length;
    for (let i = 0; i < lengthAtPoints.length; i++) {
      for (let j = 0; j < scale; j++) {
        lengthArray[i * scale + j] = lengthAtPoints[i] / totalCurveLength
      }
    }
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

    // 位置をZ軸方向にずらす
    geometry1.translate(0, 0, -1.5);
    geometry2.translate(0, 0, -1.0);
    geometry3.translate(0, 0, -0.5);

    // シーンに追加
    this.scene.add(new THREE.Mesh(geometry1, shaderMaterial));
    this.scene.add(new THREE.Mesh(geometry2, shaderMaterial));
    this.scene.add(new THREE.Mesh(geometry3, shaderMaterial));
  }


  // THREE.LineCurve3を使えば、直線も同様に描画できる
  initLine = () => {

    // 共通に使うシェーダーマテリアルを作成
    const shaderMaterial = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: this.vertexShader,
      fragmentShader: this.fragmentShader,
    });

    // 直線のCurveインスタンスを作成
    const lineCurve = new THREE.LineCurve3(
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(1, 0, 0)
    );

    // 点の数は始点と終点の2点だけでよいが、両側から描画する場合は増やした方が良い
    // const numPoints = 2;
    const numPoints = this.params.numPoints

    // 各ポイントでの長さを取得
    const lengthAtPoints = lineCurve.getLengths(numPoints);

    // 全体の長さ
    const totalCurveLength = lineCurve.getLength();

    // チューブの断面の半径
    const radius = this.params.radius;

    // チューブの断面の分割数
    const radialSegments = this.params.radialSegments;

    const geometry1 = new THREE.TubeGeometry(
      lineCurve,  // Curve - A 3D path that inherits from the Curve base class. Default is a quadratic bezier curve.
      numPoints,   // tubularSegments — Integer - The number of segments that make up the tube. Default is 64.
      radius,          // radius — Float - The radius of the tube. Default is 1.
      radialSegments,  // radialSegments — Integer - The number of segments that make up the cross-section. Default is 8.
      false        // closed — Boolean Is the tube open or closed. Default is false.
    );

    // geometry1をコピーしてgeometry2, geometry3を作成
    const geometry2 = geometry1.clone();
    const geometry3 = geometry1.clone();
    const geometry4 = geometry1.clone();

    const numVertices = geometry1.attributes.position.count;

    // 各頂点に正規化した長さ情報をアトリビュートで持たせる
    let lengthArray = new Float32Array(numVertices);
    const scale = lengthArray.length / lengthAtPoints.length;
    for (let i = 0; i < lengthAtPoints.length; i++) {
      for (let j = 0; j < scale; j++) {
        lengthArray[i * scale + j] = lengthAtPoints[i] / totalCurveLength
      }
    }
    geometry1.setAttribute("length", new THREE.BufferAttribute(lengthArray, 1));
    geometry2.setAttribute("length", new THREE.BufferAttribute(lengthArray, 1));
    geometry3.setAttribute("length", new THREE.BufferAttribute(lengthArray, 1));
    geometry4.setAttribute("length", new THREE.BufferAttribute(lengthArray, 1));

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

    // geometry4はdirectionアトリビュートを追加して特定の頂点だけ向きを逆にする
    const directionArray3 = directionArray.slice();
    for (let i = 0; i < numVertices; i++) {
      if (i % 8 < 4) {
        directionArray3[i] = 0.0;
      }
    }
    geometry4.setAttribute("direction", new THREE.BufferAttribute(directionArray3, 1));

    // 位置をZ軸方向にずらす
    geometry1.translate(0, 0, 0.5);
    geometry2.translate(0, 0, 1.0);
    geometry3.translate(0, 0, 1.5);
    geometry4.translate(0, 0, 2.0);

    // シーンに追加
    this.scene.add(new THREE.Mesh(geometry1, shaderMaterial));
    this.scene.add(new THREE.Mesh(geometry2, shaderMaterial));
    this.scene.add(new THREE.Mesh(geometry3, shaderMaterial));
    this.scene.add(new THREE.Mesh(geometry4, shaderMaterial));
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
