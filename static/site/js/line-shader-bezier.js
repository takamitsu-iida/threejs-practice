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
    u_source: { value: new THREE.Vector3(-1, 0, 0) },
    u_destination: { value: new THREE.Vector3(1, 0, 0) },
    u_control1: { value: new THREE.Vector3(-0.5, 1, 0) },
    u_control2: { value: new THREE.Vector3(0.5, -1, 0) },
  }

  params = {
    // 曲線の粒度になる数値
    numPoints: 50,
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
    this.clearScene();

    // 削除した状態を描画
    this.renderer.render(this.scene, this.camera);

    // ラインを作成
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
      .add(this.params, "numPoints")
      .min(2).max(100).step(1)
      .name(navigator.language.startsWith("ja") ? "粒度" : "Num Points")
      .onFinishChange(() => {doLater(this.initContents, 100)});

    gui
      .add(this.uniforms.u_source.value, "x")
      .min(-1).max(1).step(0.1)
      .name(navigator.language.startsWith("ja") ? "開始点 X" : "Source X");

    gui
      .add(this.uniforms.u_source.value, "y")
      .min(-1).max(1).step(0.1)
      .name(navigator.language.startsWith("ja") ? "開始点 Y" : "Source Y");

    gui
      .add(this.uniforms.u_source.value, "z")
      .min(-1).max(1).step(0.1)
      .name(navigator.language.startsWith("ja") ? "開始点 Z" : "Source Z");

    gui
      .add(this.uniforms.u_destination.value, "x")
      .min(-1).max(1).step(0.1)
      .name(navigator.language.startsWith("ja") ? "終点 X" : "Destination X");

    gui
      .add(this.uniforms.u_destination.value, "y")
      .min(-1).max(1).step(0.1)
      .name(navigator.language.startsWith("ja") ? "終点 Y" : "Destination Y");

    gui
      .add(this.uniforms.u_destination.value, "z")
      .min(-1).max(1).step(0.1)
      .name(navigator.language.startsWith("ja") ? "終点 Z" : "Destination Z");

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

    // シェーダーマテリアルを作成
    const material = new THREE.ShaderMaterial({
      wireframe: true,  // wireframeで表示することで線がはっきり見える
      transparent: true,
      depthWrite: false,
      uniforms: this.uniforms,
      vertexShader: this.vertexShader,
      fragmentShader: this.fragmentShader,
    });

    // 曲線の粒度になる数値
    const numPoints = this.params.numPoints;

    const geometry = new THREE.BufferGeometry();

    // numPoints個の頂点を設定する
    const positions = new Float32Array(numPoints * 3);
    for (let i = 0; i < numPoints; i++) {
      const index = i * 3;
      positions[index + 0] = 0;
      positions[index + 1] = 0;
      positions[index + 2] = 0;
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    // 各頂点には0から1までの値fractionを設定する
    const fractions = new Float32Array(numPoints);
    for (let i = 0; i < numPoints; i++) {
      fractions[i] = i / (numPoints - 1);
    }

    geometry.setAttribute("fraction", new THREE.BufferAttribute(fractions, 1));

    // indexは3個の頂点を指定して三角形のポリゴンを設定するので*3で確保する
    const indices = new Uint32Array(numPoints * 3);
    for (let i = 0; i < numPoints; i++) {
      const index = i * 3;
      indices[index + 0] = i;
      indices[index + 1] = Math.min(i + 1, numPoints - 1);
      indices[index + 2] = Math.min(i + 1, numPoints - 1);
    }

    geometry.setIndex(new THREE.BufferAttribute(indices, 3));

    const mesh = new THREE.Mesh(geometry, material);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();

    // シーンに追加
    this.scene.add(mesh);
  }


  vertexShader = /* glsl */`
    attribute float fraction;  // ジオメトリに設定したfractionアトリビュート
    uniform vec3 u_source;
    uniform vec3 u_destination;
    uniform vec3 u_control1;
    uniform vec3 u_control2;

    varying float v_fraction;

    // ベジェ曲線を計算する関数
    vec3 bezier(vec3 source, vec3 control1, vec3 control2, vec3 destination, float t) {
      // 線形補間を使用してベジェ曲線の各点を計算
      vec3 point1 = mix(source, control1, t);
      vec3 point2 = mix(control1, control2, t);
      vec3 point3 = mix(control2, destination, t);

      vec3 point4 = mix(point1, point2, t);
      vec3 point5 = mix(point2, point3, t);

      // 最終的なベジェ曲線上の点を計算
      return mix(point4, point5, t);
    }

    void main() {
      vec3 pos = bezier(u_source, u_control1, u_control2, u_destination, fraction);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      v_fraction = fraction;
    }
  `;


  fragmentShader = /* glsl */`
    varying float v_fraction;
    void main() {
      // gl_FragColor = vec4(0.0, 1.0, 0.0, v_fraction);
      gl_FragColor = vec4(0.0, 1.0, 0.0, 1.0);
    }
  `;

}
