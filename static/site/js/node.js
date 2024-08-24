import * as THREE from "three";
import { OrbitControls } from "three/controls/OrbitControls.js";
import { GUI } from "three/libs/lil-gui.module.min.js";


export class Node extends THREE.Group {

  // ノードを表現するメッシュ
  sphere;

  // ノードの透明度（Tierによって変える）
  sphereOpacity = 0.75;
  sphereColor = 0xf0f0f0;

  // 注目を集めるためのコーン型のメッシュ、選択中のみ表示する
  cone;

  // ラベル表示用のCSS2DObject
  label;

  // 元になったグラフのノードのデータ
  node;

  // 選択状態
  isSelected = false;

  constructor(options) {
    super();

    options = options || {};

    // ノードを表す20面体を作成
    {
      const radius = options.hasOwnProperty("radius") ? options.radius : 1;
      const detail = options.hasOwnProperty("detail") ? options.detail : 3;
      const geometry = new THREE.IcosahedronGeometry(radius, detail);

      const material = new THREE.MeshPhongMaterial({
        color: this.sphereColor,
        transparent: true,
        opacity: this.sphereOpacity,
        shininess: 150,
        depthTest: true,  // ★オブジェクト内部の線を隠すための設定
      });

      // メッシュを作成
      this.sphere = new THREE.Mesh(geometry, material);

      // 名前を設定
      this.sphere.name = node.data.id;

      // 選択可能にする
      this.sphere.selectable = true;

      // 選択状態
      this.sphere.selected = false;

      // グループに追加
      this.add(this.sphere);
    }

  }


  select(value) {
    if (value) {
      this.isSelected = true;
      this.startBlink();
    } else {
      this.isSelected = false;
      this.stopBlink();
    }
  }

  // ブリンクエフェクト
  // 色で制御するとマウスオーバーの色制御と競合するのでopacityを制御する
  blinkOpacity = 0.4;
  blinkInterval;

  startBlink() {
    this.blinkInterval = setInterval(() => {
      if (this.sphere.material.opacity === this.blinkOpacity) {
        this.sphere.material.opacity = this.sphereOpacity;
      } else {
        this.sphere.material.opacity = this.blinkOpacity;
      }
    }, 500);
  }

  stopBlink() {
    clearInterval(this.blinkInterval);
    this.blinkInterval = null;
    this.sphere.material.opacity = this.sphereOpacity;
  }
}



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
    autoRotate: false,
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
    this.scene.add(new THREE.AmbientLight(0x404040, 1.0));

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

    // ノードを表す球体を作成

    const icosaGeo = new THREE.IcosahedronGeometry(1, 4);

    const material1 = new THREE.MeshPhongMaterial({
      color: "red",
      transparent: true,
      opacity: 0.6,
      shininess: 150,
      depthTest: true
    });

    // ノード１
    const icosahedron1 = new THREE.Mesh(icosaGeo, material1);
    icosahedron1.position.set(0, 2, 0);
    this.scene.add(icosahedron1);

    //
    // ノード３はグループ化して作成する
    //
    const node3 = new THREE.Group();
    node3.position.set(2, 2, 0);

    const texture = new THREE.TextureLoader().load('./static/site/img/Router.48.png');
    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      depthTest: true
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(1.0, 1.0, 1.0);
    node3.add(sprite);

    const material3 = new THREE.MeshPhongMaterial({
      color: 0xaaee00,
      transparent: true,
      opacity: 0.1,
      shininess: 150,
      depthTest: true  // オブジェクト内部の線を隠すための設定
    });

    const icosahedron3 = new THREE.Mesh(icosaGeo, material3);
    node3.add(icosahedron3);

    this.scene.add(node3);

    const node3Position = node3.position.clone();

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
