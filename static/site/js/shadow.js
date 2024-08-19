import * as THREE from "three";
import { OrbitControls } from "three/controls/OrbitControls.js";

export class Main {

  container;

  sizes = {
    width: 0,
    height: 0
  }

  scene;
  camera;
  renderer;

  directionalLight;
  controller;

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
      75,
      this.sizes.width / this.sizes.height,
      1,
      1000
    );
    this.camera.position.set(0, 15, 35);
    this.camera.target = new THREE.Vector3(0, 0, -5);

    // レンダラ
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    // デバイスピクセル比は上限2に制限(3以上のスマホ・タブレットでは処理が重すぎる)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // 影を出すにはレンダラに設定が必要
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // default THREE.PCFShadowMap
    this.container.appendChild(this.renderer.domElement);

    // 環境光
    this.scene.add(new THREE.AmbientLight(0x404040, 3));

    // ディレクショナルライト
    this.directionalLight = new THREE.DirectionalLight(0xffffff, 3);
    this.directionalLight.position.set(0, 10, 0);
    // 影を出すにはライトに設定が必要
    this.directionalLight.castShadow = true; // default false
    this.directionalLight.shadow.mapSize.width = 1024; // default 512
    this.directionalLight.shadow.mapSize.height = 1024; // default 512
    // 影をだせる範囲
    this.directionalLight.shadow.camera.near = 1; // default 0.5
    this.directionalLight.shadow.camera.far = 10; // default 500
    this.directionalLight.shadow.camera.top = 15;
    this.directionalLight.shadow.camera.bottom = -15;
    this.directionalLight.shadow.camera.left = -15;
    this.directionalLight.shadow.camera.right = 15;
    this.scene.add(this.directionalLight);

    // ディレクショナルライト用のカメラヘルパー
    this.scene.add(new THREE.CameraHelper(this.directionalLight.shadow.camera));

    // スポットライト
    const spotLight = new THREE.SpotLight(0xffffff, 500);
    spotLight.name = 'Spot Light';
    spotLight.angle = Math.PI / 5;
    spotLight.penumbra = 0.3;
    spotLight.position.set(10, 10, 5);
    spotLight.castShadow = true;
    spotLight.shadow.camera.near = 8;
    spotLight.shadow.camera.far = 30;
    spotLight.shadow.mapSize.width = 1024;
    spotLight.shadow.mapSize.height = 1024;
    this.scene.add(spotLight);

    // スポットライト用カメラヘルパー
    this.scene.add(new THREE.CameraHelper(spotLight.shadow.camera));

    // 影を作り出す球を一つ作成
    const sphereGeometry = new THREE.SphereGeometry(3, 32, 32);
    const sphereMaterial = new THREE.MeshPhongMaterial({
      color: 0xff0000,
      shininess: 150,
      specular: 0x222222
    });

    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphere.position.set(0, 6, 0);
    sphere.castShadow = true; // default false
    sphere.receiveShadow = false; //default
    this.scene.add(sphere);

    // 影を受け取るボックスを作成
    const boxGeometry = new THREE.BoxGeometry(10, 0.1, 10);
    const boxMaterial = new THREE.MeshPhongMaterial({
      color: 0xa0adaf,
      shininess: 150,
      specular: 0x111111
    });

    const ground = new THREE.Mesh(boxGeometry, boxMaterial);
    ground.scale.multiplyScalar(10);
    ground.castShadow = false;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // コントローラ
    this.controller = new OrbitControls(this.camera, this.renderer.domElement);
    this.controller.target.set(0, 2, 0);

    // 軸を表示
    //
    //   Y(green)
    //    |
    //    +---- X(red)
    //   /
    //  Z(blue)
    //
    const axesHelper = new THREE.AxesHelper(10000);
    this.scene.add(axesHelper);

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
