import * as THREE from "three";
import { OrbitControls } from "three/controls/OrbitControls.js";
import { ImprovedNoise } from "three/libs/ImprovedNoise.js";

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

  perlin;

  constructor() {

    // パーリンノイズ
    this.perlin = new ImprovedNoise();

    // コンテナ
    this.container = document.getElementById("threejsContainer");

    // コンテナのサイズ
    this.sizes.width = this.container.clientWidth;
    this.sizes.height = this.container.clientHeight;

    // リサイズイベント
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
    this.camera.position.set(100, 100, 160);
    this.camera.position.length(157);

    // レンダラ
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    // デバイスピクセル比は上限2に制限(3以上のスマホ・タブレットでは処理が重すぎる)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    // ディレクショナルライト
    this.directionalLight = new THREE.DirectionalLight(0xffffff, 1.25);
    this.directionalLight.position.set(1, 1, 0);
    this.scene.add(this.directionalLight);

    // 平面
    const g = new THREE.PlaneGeometry(200, 200, 512, 512);

    // X軸を中心に-90度回転してXZ平面と平行にする
    g.rotateX(-1 * Math.PI / 2)

    // 頂点のUV座標
    const uv = g.attributes.uv;
    console.log(uv);
    // uvはFloat32BufferAttribute型
    // https://threejs.org/docs/#api/en/core/BufferAttribute
    //
    // 一次元のarrayに値が格納されているので(u, v)を直接取り出すのは難しいが、
    // Vector2, Vector3, Vector4, Colorクラスには.fromBufferAttribute(attribute, index)メソッドがあるので、
    // それを使うとインデックスを指定して(u, v)を取り出せる
    //
    // uv.countには(u, v)の個数が格納されている

    // 頂点の位置情報
    const pos = g.attributes.position;
    console.log(pos);
    // posはFloat32BufferAttribute型

    const noiseFrequency = 10;
    const tmpUv = new THREE.Vector2();
    for (let i = 0; i < uv.count; i++) {
      // i番目の(u, v)を取り出してtmpUvに複写する
      // パーリンノイズへの入力用に値を加工して利用
      tmpUv.fromBufferAttribute(uv, i);

      // tmpUvを大きくする方法
      // tmpUv.multiplyScalar(noiseFrequency);

      // tmpUvの要素を取り出して個別に乗算する方法
      const x = tmpUv.x * noiseFrequency;
      const y = tmpUv.y * noiseFrequency;

      // Y座標の値にどういうノイズを加えるかで波の形が変わる

      // ノイズの入力にX座標しか使っていないので、X座標方向に波打つ
      // pos.setY(i, this.perlin.noise(x, x, 2.7) * 30);

      // X軸方向に-90度倒しているためZ軸方向に波打つ
      // pos.setY(i, this.perlin.noise(y, y, 2.7) * 30);

      // X軸にもY軸にもランダムな波を打つ
      pos.setY(i, this.perlin.noise(x, y, 2.7) * 30);
    }

    // 法線ベクトルを計算し直す
    g.computeVertexNormals();

    const m = new THREE.MeshLambertMaterial({
      color: 0xa0adaf,
      side: THREE.DoubleSide,
      onBeforeCompile: (shader) => {
        // console.log(shader.vertexShader);
        // console.log(shader.fragmentShader);
      },
    });

    const ground = new THREE.Mesh(g, m);
    ground.layers.enable(1);
    this.scene.add(ground);

    let box = new THREE.Box3().setFromObject(ground);
    let boxSize = new THREE.Vector3();
    box.getSize(boxSize);
    let boxHelper = new THREE.Box3Helper(box);
    this.scene.add(boxHelper);

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


  onWindowResize = (event) => {
    this.sizes.width = this.container.clientWidth;
    this.sizes.height = this.container.clientHeight;

    this.camera.aspect = this.sizes.width / this.sizes.height;
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.sizes.width, this.sizes.height);
  }

}
