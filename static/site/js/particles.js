import * as THREE from "three";
import { OrbitControls } from "three/controls/OrbitControls.js";


export class Main {

  // <div id="threejs_container"></div>
  container;

  // 初期化時にDIV要素(container)のサイズに変更する
  sizes = {
    width: 0,
    height: 0
  };

  // シーン
  scene;

  // カメラ
  camera;

  // レンダラ
  render;

  // マウス操作のコントローラ
  controller;

  constructor() {

    // コンテナ
    this.container = document.getElementById("threejs_container");

    // コンテナ要素にあわせてサイズを初期化
    this.sizes.width = this.container.clientWidth;
    this.sizes.height = this.container.clientHeight;

    // シーン
    this.scene = new THREE.Scene();

    // カメラ
    this.camera = new THREE.PerspectiveCamera(
      100,                                  // 視野角度
      this.sizes.width / this.sizes.height, // アスペクト比 width/height ブラウザのリサイズに注意
      0.1,                                  // 開始距離
      100                                   // 終了距離
    );
    this.camera.position.set(1, 1, 2);

    // レンダラ
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    // デバイスピクセル比は上限2に制限(3以上のスマホ・タブレットでは処理が重すぎる)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.container.appendChild(this.renderer.domElement);

    // グリッドヘルパーを追加
    this.scene.add(new THREE.GridHelper(100, 100));

    // マウス操作のコントローラ
    this.controller = new OrbitControls(this.camera, this.renderer.domElement);
    this.controller.enableDamping = true;
    this.controller.enablePan = false;

    //
    // パーティクル
    //

    // ジオメトリを作成
    const particlesGeometry = new THREE.BufferGeometry();
    const count = 10000;

    // (x, y, z)の値を持つので*3で配列を作る
    const positionArray = new Float32Array(count * 3);
    const colorArray = new Float32Array(count * 3);

    // 座標をランダムに
    for (let i = 0; i < count * 3; i++) {
      positionArray[i] = (Math.random() - 0.5) * 10;
      colorArray[i] = Math.random();
    }

    // ジオメトリの"position"アトリビュートに位置座標の配列をセットする
    // (x, y, z)の3軸なので3をセット
    particlesGeometry.setAttribute(
      "position", new THREE.BufferAttribute(positionArray, 3)
    );

    // ジオメトリの"color"アトリビュートに色配列をセットする
    particlesGeometry.setAttribute(
      "color", new THREE.BufferAttribute(colorArray, 3)
    );

    // テクスチャを取得
    const textureLoader = new THREE.TextureLoader();
    const particlesTexture = textureLoader.load("./static/site/img/particle.png")

    // マテリアル
    const pointMaterial = new THREE.PointsMaterial({
      size: 0.15,
      alphaMap: particlesTexture,
      transparent: true,
      depthWrite: false,
      vertexColors: true, // 頂点に色を付ける、パーティクルの場合はこれ
      blending: THREE.AdditiveBlending, // 重なったところを光らせる
    });

    // 単色を付けるならこれでよい
    // pointMaterial.color.set("green");

    // メッシュ化（ジオメトリ＋マテリアル）
    // Pointsはパーティクル専用のメッシュ化
    const particles = new THREE.Points(particlesGeometry, pointMaterial)

    this.scene.add(particles)

    // resizeイベントのハンドラを登録
    window.addEventListener("resize", () => {
      this.sizes.width = this.container.clientWidth;
      this.sizes.height = this.container.clientHeight;

      this.camera.aspect = this.sizes.width / this.sizes.height;
      this.camera.updateProjectionMatrix();

      this.renderer.setSize(this.sizes.width, this.sizes.height);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    });

    this.animate();
  }


  animate() {
    this.controller.update();

    this.renderer.render(this.scene, this.camera);

    requestAnimationFrame(() => { this.animate(); });
  }

}