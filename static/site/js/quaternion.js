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
  controller;

  boxLocal;
  boxWorld;
  omega = Math.PI / 600; // 回転させる角速度
  quaternionLocal;
  quaternionWorld;

  constructor() {

    // コンテナ
    this.container = document.getElementById("threejs_container");

    // コンテナのサイズ
    this.sizes.width = this.container.clientWidth;
    this.sizes.height = this.container.clientHeight;

    // シーン
    this.scene = new THREE.Scene();

    // カメラ
    this.camera = new THREE.PerspectiveCamera(
      75,
      this.sizes.width / this.sizes.height,
      1,
      1000
    );
    this.camera.position.set(0, 12, 40);

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
    const directionalLight = new THREE.DirectionalLight(0xffffff, 3);
    directionalLight.position.set(0, 15, 0);
    // 影を出すにはライトに設定が必要
    directionalLight.castShadow = true; // default false
    directionalLight.shadow.mapSize.width = 1024; // default 512
    directionalLight.shadow.mapSize.height = 1024; // default 512
    // 影をだせる範囲
    directionalLight.shadow.camera.near = 1; // default 0.5
    directionalLight.shadow.camera.far = 10; // default 500
    directionalLight.shadow.camera.top = 15;
    directionalLight.shadow.camera.bottom = -15;
    directionalLight.shadow.camera.left = -15;
    directionalLight.shadow.camera.right = 15;
    this.scene.add(directionalLight);

    // ディレクショナルライト用のカメラヘルパー
    // this.scene.add(new THREE.CameraHelper(directionalLight.shadow.camera));

    // スポットライト
    const spotLight = new THREE.SpotLight(0xffffff, 500);
    spotLight.name = 'Spot Light';
    spotLight.angle = Math.PI / 5;
    spotLight.penumbra = 0.3;
    spotLight.position.set(5, 30, 5);
    spotLight.castShadow = true;
    spotLight.shadow.camera.near = 8;
    spotLight.shadow.camera.far = 60;
    spotLight.shadow.mapSize.width = 1024;
    spotLight.shadow.mapSize.height = 1024;
    this.scene.add(spotLight);

    // スポットライト用カメラヘルパー
    // this.scene.add(new THREE.CameraHelper(spotLight.shadow.camera));

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

    // コントローラ
    this.controller = new OrbitControls(this.camera, this.renderer.domElement);

    // 影を作り出す立方体を一つ作成
    const boxGeometry = new THREE.BoxGeometry(6, 6, 6);// .toNonIndexed();

    // 頂点ごとにことなる色を付ける
    const colors = [];
    {
      const boxPosition = boxGeometry.getAttribute('position');
      const color = new THREE.Color();
      for (let i=0; i < boxPosition.count; i += 3) {
        color.setHex(0xffffff * Math.random());

        colors.push(color.r, color.g, color.b);
        colors.push(color.r, color.g, color.b);
        colors.push(color.r, color.g, color.b);

        colors.push(color.r, color.g, color.b);
        colors.push(color.r, color.g, color.b);
        colors.push(color.r, color.g, color.b);
      }
    }
    boxGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const boxMaterial = new THREE.MeshBasicMaterial({
      vertexColors: true, // 頂点に色を付ける場合はtrue
    });

    this.boxLocal = new THREE.Mesh(boxGeometry, boxMaterial);
    this.boxLocal.position.set(0, 10, 0);
    // 初期状態で45度傾ける
    this.boxLocal.rotation.set(0, 0, Math.PI / 4);
    this.boxLocal.castShadow = true; // default false
    this.boxLocal.receiveShadow = false; //default false
    this.scene.add(this.boxLocal);

    this.boxWorld = this.boxLocal.clone();
    this.boxWorld.position.set(0, 20, 0);
    this.scene.add(this.boxWorld);

    // 影を受け取るボックスを作成
    const groundGeometry = new THREE.BoxGeometry(10, 0.1, 10);
    const groundMaterial = new THREE.MeshPhongMaterial({
      color: 0xa0adaf,
      shininess: 150,
      specular: 0x111111
    });

    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.scale.multiplyScalar(10);
    ground.position.set(0, -2, 0);
    ground.castShadow = false;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // クォータニオンを作成
    this.quaternionLocal = new THREE.Quaternion();
    this.quaternionWorld = new THREE.Quaternion();

    // ローカル座標で回転する場合には、同じクォータニオンを使い回せば良い
    this.quaternionLocal.setFromAxisAngle(new THREE.Vector3(0, 1, 0).normalize(), this.omega);

    // resizeイベントのハンドラを登録
    window.addEventListener("resize", () => { this.onWindowResize(); }, false);

    // フレーム毎の処理(requestAnimationFrameで再帰的に呼び出される)
    this.render();
  }


  rotate() {
    // クォータニオンを掛け算して姿勢を変える
    this.boxLocal.quaternion.multiply(this.quaternionLocal);

    // ワールド座標系で回転させる場合、ベクトルをローカル座標系に変換しなければいけない
    // 姿勢行列を現在のオブジェクトから取り出す
    const m4 = new THREE.Matrix4().makeRotationFromEuler(this.boxWorld.rotation);

    // 姿勢行列の逆行列を計算
    const m4i = m4.invert();

    // Y軸(0, 1, 0)に逆行列をかけてローカル座標に変換
    const axis = new THREE.Vector3(0, 1, 0).applyMatrix4(m4i);

    // クォータニオンを設定する
    this.quaternionWorld.setFromAxisAngle(axis, this.omega);

    // 掛け算することで回転を加える
    this.boxWorld.quaternion.multiply(this.quaternionWorld);
  }


  render() {
    // 回転を加える
    this.rotate();

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
