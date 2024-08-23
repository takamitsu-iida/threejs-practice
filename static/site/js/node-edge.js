import * as THREE from "three";
import { OrbitControls } from "three/controls/OrbitControls.js";





class Node extends THREE.Group {

  // 元になったグラフのノードのデータ
  node;

  // ノードを表現するメッシュ
  box;

  constructor(node, options) {

    super();

    options = options || {}

    // ノードのデータを保持しておく
    this.node = node;

    // グループに名前を設定
    this.name = `${this.node.data.id}_group`

    // 位置を設定
    this.position.set(node.position.x, node.position.y, node.position.z);

    //
    // ノード本体を表現する立方体を作成
    //
    {

      // ジオメトリを作成
      const geometry = new THREE.BoxGeometry(10, 3, 6);

      // マテリアルを作成
      const material = new THREE.MeshPhongMaterial({
        color: 0xaaee00,
        side: THREE.FrontSide,
        transparent: true,
        opacity: 0.6,
        wireframe: false
      });

      // メッシュを作成
      this.box = new THREE.Mesh(geometry, material);

      // 名前を設定
      this.box.name = node.data.id;

      // グループに追加
      this.add(this.box);
    }

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
    this.camera.position.set(-1, 0, 5);

    // レンダラ
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    // デバイスピクセル比は上限2に制限(3以上のスマホ・タブレットでは処理が重すぎる)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // 影を出すにはレンダラに設定が必要
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // default THREE.PCFShadowMap
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

    // this.scene.add(new THREE.AxesHelper(10000));

    // 環境光
    this.scene.add(new THREE.AmbientLight(0x404040, 3));

    // 影を受け取る平べったいボックスを作成
    const boxGeometry = new THREE.BoxGeometry(10, 0.01, 10);
    const boxMaterial = new THREE.MeshPhongMaterial({
      color: 0xa0adaf,
      shininess: 150,
      specular: 0x111111
    });
    const ground = new THREE.Mesh(boxGeometry, boxMaterial);
    ground.scale.multiplyScalar(10);
    ground.position.set(0, -1, 0);
    ground.castShadow = false;
    ground.receiveShadow = true;
    // this.scene.add(ground);

    const pointLightA = new THREE.PointLight(0xffffff, 0.6);
    pointLightA.position.set(10, 20, 10);
    this.scene.add(pointLightA);

    const pointLightB = new THREE.PointLight(0xffff00, 0.6);
    pointLightB.position.set(-5, -20, -7);
    this.scene.add(pointLightB);

    const material = new THREE.MeshPhongMaterial({
      color: 0xaaee00,
      side: THREE.FrontSide,
      transparent: true,
      opacity: 0.6,
      wireframe: false
    });

    const spherGeo = new THREE.SphereGeometry(1, 24, 24);
    const sphere = new THREE.Mesh(spherGeo, material);
    sphere.position.set(- 2, 0, 0);
    sphere.renderOrder = 1;
    this.scene.add(sphere);

    const icosaGeo = new THREE.IcosahedronGeometry(1, 4);
    const Icosahedron = new THREE.Mesh(icosaGeo, material);
    Icosahedron.position.set(2, 0, 0);
    Icosahedron.renderOrder = 1;
    this.scene.add(Icosahedron);

    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x008800 });
    const points = [new THREE.Vector3(-1, 0, 0), new THREE.Vector3(1, 0, 0)];
    const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(lineGeo, lineMaterial);
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
