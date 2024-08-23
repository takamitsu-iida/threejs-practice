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
    this.camera.position.set(-1, 0, 10);

    // レンダラ
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    // デバイスピクセル比は上限2に制限(3以上のスマホ・タブレットでは処理が重すぎる)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor( 0xdedede);

    // 影を出すにはレンダラに設定が必要
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // default THREE.PCFShadowMap
    this.container.appendChild(this.renderer.domElement);

    // コントローラ
    this.controller = new OrbitControls(this.camera, this.renderer.domElement);
    this.controller.autoRotate = true;
    this.controller.autoRotateSpeed = 10.0;


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
    this.scene.add(new THREE.AmbientLight(0x404040, 1.0));

    const pointLightA = new THREE.PointLight(0xffffff, 3.0);
    pointLightA.position.set(10, 20, 10);
    this.scene.add(pointLightA);

    const pointLightB = new THREE.PointLight(0xffff00, 3.0);
    pointLightB.position.set(-5, -20, -7);
    this.scene.add(pointLightB);

    const icosaGeo = new THREE.IcosahedronGeometry(1, 4);

    // 重なった線が見えないマテリアル
    const material1 = new THREE.MeshPhongMaterial({
      color: "red",
      transparent: true,
      opacity: 0.5,
      depthTest: true  // オブジェクト内部の線を隠すための設定
    });

    const icosahedron1 = new THREE.Mesh(icosaGeo, material1);
    icosahedron1.position.set(-2, 0, 0);
    this.scene.add(icosahedron1);

    // 重なった線が見えるマテリアル
    const material2 = new THREE.MeshPhongMaterial({
      color: "blue",
      transparent: true,
      opacity: 0.5,
      depthTest: false  // デフォルトのまま
    });

    const icosahedron2 = new THREE.Mesh(icosaGeo, material2);
    icosahedron2.position.set(2, 0, 0);
    this.scene.add(icosahedron2);

    const lineMaterial = new THREE.LineBasicMaterial({
      color: "orange",
      transparent: true,
      depthWrite: false // オブジェクト内部の線を隠すための設定
    });

    const points = [
      new THREE.Vector3().copy(icosahedron1.position),
      new THREE.Vector3().copy(icosahedron2.position)
    ];
    const lineGeo = new THREE.BufferGeometry().setFromPoints(points);

    const line = new THREE.Line(lineGeo, lineMaterial);
    line.renderOrder = 1;  // オブジェクト内部の線を隠すための設定
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
