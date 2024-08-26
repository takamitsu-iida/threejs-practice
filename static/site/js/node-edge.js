import * as THREE from "three";
import { OrbitControls } from "three/controls/OrbitControls.js";
import { GUI } from "three/libs/lil-gui.module.min.js";


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

  params = {
    autoRotate: true,
    autoRotateSpeed: 3.0,
  }

  constructor() {

    // コンテナ
    this.container = document.getElementById("threejs_container");

    // コンテナのサイズ
    this.sizes.width = this.container.clientWidth;
    this.sizes.height = this.container.clientHeight;

    // resizeイベントのハンドラを登録
    window.addEventListener("resize", () => { this.onWindowResize(); }, false);

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
    this.renderer.setClearColor( 0xdedede);
    this.container.appendChild(this.renderer.domElement);

    // コントローラ
    this.controller = new OrbitControls(this.camera, this.renderer.domElement);
    this.controller.autoRotate = this.params.autoRotate;
    this.controller.autoRotateSpeed = this.params.autoRotateSpeed;

    // グリッドヘルパー
    this.scene.add(new THREE.GridHelper(20, 20, new THREE.Color(0xffffff), new THREE.Color(0xffffff) ));

    // 環境光
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.0));

    // 点光源 new THREE.PointLight(色, 光の強さ, 距離, 光の減衰率)
    const pointLightA = new THREE.PointLight(0xffffff, 10, 50, 1);
    pointLightA.position.set(5, 5, 5);
    this.scene.add(pointLightA);

    const pointLightB = new THREE.PointLight(0xffff00, 10, 50, 1);
    pointLightB.position.set(-5, -5, -5);
    this.scene.add(pointLightB);

    // lil-gui
    const gui = new GUI({ width: 300 });
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
      // depthTest: false  // デフォルト false
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

    // ジオメトリの指定に対応する色を決める
    /*
    const colors = new Float32Array([
      1.0, 0.0, 0.0,  // red
      0.0, 0.0, 1.0,  // blue
      1.0, 1.0, 0.0,  // yellow
      0.0, 1.0, 1.0,  // purple
    ]);
    */

    const node1Color = icosahedron1.material.color.clone();
    const node2Color = icosahedron2.material.color.clone();
    const colors = new Float32Array([
      node1Color.r, node1Color.g, node1Color.b,
      node1Color.r, node1Color.g, node1Color.b,
      node2Color.r, node2Color.g, node2Color.b,
      node2Color.r, node2Color.g, node2Color.b,
    ]);

    lineGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const lineMaterial = new THREE.LineBasicMaterial({
      // color: "orange",
      vertexColors: true, // ジオメトリの頂点の色を使う
      transparent: true,
      depthWrite: false // ★オブジェクト内部の線を隠すための設定
    });

    const line = new THREE.Line(lineGeo, lineMaterial);
    line.renderOrder = 1;  // ★オブジェクト内部の線を隠すための設定
    this.scene.add(line);

    // フレーム毎の処理(requestAnimationFrameで再帰的に呼び出される)
    this.render();
  }


  render() {
    // カメラコントローラーの更新
    this.controller.update();

    // 再描画
    this.renderer.render(this.scene, this.camera);

    // 再帰処理
    requestAnimationFrame(() => { this.render(); });
  }


  onWindowResize() {
    this.sizes.width = this.container.clientWidth;
    this.sizes.height = this.container.clientHeight;

    this.camera.aspect = this.sizes.width / this.sizes.height;
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.sizes.width, this.sizes.height);
  }

}
