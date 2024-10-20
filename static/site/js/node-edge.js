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

  params = {
    autoRotate: true,
    autoRotateSpeed: 2.0,
  }

  constructor(params = {}) {
    this.params = Object.assign(this.params, params);

    this.initThreejs();

    this.initStatsjs();

    this.initGui();

    this.createNodes();

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

    // カメラ
    this.camera = new THREE.PerspectiveCamera(
      60,
      this.sizes.width / this.sizes.height,
      1,
      1001
    );
    this.camera.position.set(0, 5, 10);

    // レンダラ
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0xdedede);
    this.container.appendChild(this.renderer.domElement);

    // コントローラ
    this.controller = new OrbitControls(this.camera, this.renderer.domElement);
    this.controller.autoRotate = this.params.autoRotate;
    this.controller.autoRotateSpeed = this.params.autoRotateSpeed;

    // グリッドヘルパー
    this.scene.add(new THREE.GridHelper(20, 20, new THREE.Color(0xffffff), new THREE.Color(0xffffff)));

    // 環境光
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.0));

    // 点光源 new THREE.PointLight(色, 光の強さ, 距離, 光の減衰率)
    const pointLightA = new THREE.PointLight(0xffffff, 10, 50, 1);
    pointLightA.position.set(5, 5, 5);
    this.scene.add(pointLightA);

    const pointLightB = new THREE.PointLight(0xffff00, 10, 50, 1);
    pointLightB.position.set(-5, -5, -5);
    this.scene.add(pointLightB);
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
      .add(this.params, "autoRotate")
      .name("rotation")
      .onChange((value) => {
        this.controller.autoRotate = value;
      });
    gui
      .add(this.params, "autoRotateSpeed")
      .name("autoRotateSpeed")
      .min(1.0)
      .max(10.0)
      .step(0.1)
      .onChange((value) => {
        this.controller.autoRotateSpeed = value;
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

      // カメラコントローラーの更新
      this.controller.update();

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


  createNodes = () => {
    // ノードを表す球体を2個作成

    const icosaGeo = new THREE.IcosahedronGeometry(1, 4);

    // ノードと重なった線が **見えない** マテリアル
    const material1 = new THREE.MeshPhongMaterial({
      color: "red",
      transparent: true,
      opacity: 0.6,
      shininess: 150,
      depthTest: true  // ★オブジェクト内部の線を隠すための設定
    });

    // ノードと重なった線が **見える ** マテリアル
    const material2 = new THREE.MeshPhongMaterial({
      color: "blue",
      transparent: true,
      opacity: 0.6,
      shininess: 150,
      depthTest: false  // デフォルト true
    });

    // ノード１
    const icosahedron1 = new THREE.Mesh(icosaGeo, material1);
    icosahedron1.position.set(-2, 2, -2);
    this.scene.add(icosahedron1);

    // ノード２
    const icosahedron2 = new THREE.Mesh(icosaGeo, material2);
    icosahedron2.position.set(2, 2, 2);
    this.scene.add(icosahedron2);

    // ノード間を接続するエッジを作成
    const lineGeo = new THREE.BufferGeometry();

    // こんな感じで線をつくる
    //  o--+
    //     |
    //     +---o
    const node1Position = icosahedron1.position.clone();
    const node2Position = icosahedron2.position.clone();
    const node1MidPosition = node1Position.clone();
    node1MidPosition.x = 0;
    const node2MidPosition = node2Position.clone();
    node2MidPosition.x = 0;

    const points = [
      node1Position,
      node1MidPosition,
      node2MidPosition,
      node2Position
    ];
    lineGeo.setFromPoints(points);

    // ジオメトリの４つの頂点に色を設定する

    const node1Color = icosahedron1.material.color.clone();
    const node2Color = icosahedron2.material.color.clone();
    const colors = new Float32Array([
      node1Color.r, node1Color.g, node1Color.b, // ノード1の色
      node1Color.r, node1Color.g, node1Color.b, // ノード1の色
      node2Color.r, node2Color.g, node2Color.b, // ノード2の色
      node2Color.r, node2Color.g, node2Color.b, // ノード2の色
    ]);

    lineGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const lineMaterial = new THREE.LineBasicMaterial({
      // color: "orange",  // 色指定はせずに、
      vertexColors: true,  // ジオメトリの頂点の色を使う
      transparent: true,
      depthWrite: false  // ★オブジェクト内部の線を隠すための設定
    });

    const line = new THREE.Line(lineGeo, lineMaterial);
    line.renderOrder = 1;  // ★オブジェクト内部の線を隠すための設定
    this.scene.add(line);
  }


}
