import * as THREE from "three";
import { OrbitControls } from "three/controls/OrbitControls.js";

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

  renderParams = {
    clock: new THREE.Clock(),
    delta: 0,
    interval: 1 / 30,  // = 30fps
  }

  // 地面を表現するメッシュ化されたオブジェクト
  ground;

  constructor() {

    this.initThreejs();

    this.initStatsjs();

    this.createGround();

    this.render();
  }


  initThreejs = () => {
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

    // レンダラ
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    // デバイスピクセル比は上限2に制限(3以上のスマホ・タブレットでは処理が重すぎる)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    // ディレクショナルライト
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.25);
    directionalLight.position.set(1, 1, 0);
    this.scene.add(directionalLight);

    // コントローラ
    this.controller = new OrbitControls(this.camera, this.renderer.domElement);
    this.controller.maxDistance = 1000; // ズーム上限
    this.controller.maxPolarAngle = (Math.PI * 0.8) / 2; // 角度上限
    this.controller.minPolarAngle = 0; // 角度下限

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

  }


  initStatsjs() {
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


  updatePosition() {
    // 経過時間を取得
    const elapsedTime = this.renderParams.clock.getElapsedTime();

    // ジオメトリの位置情報を取得
    const position = this.ground.geometry.attributes.position;

    for (let i=0; i < position.count; i++) {
      // 座標の値
      const x = position.getX(i);
      const z = position.getZ(i);
      const nextY = Math.sin(x * 0.02 + z * 0.02 + elapsedTime) * 20;
      position.setY(i, nextY);
    }

    // これをセットしておかないとレンダラは更新してくれない
    position.needsUpdate = true;
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

      // ジオメトリを加工する
      this.updatePosition();

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


  createGround = () => {
    // 平面
    const geometry = new THREE.PlaneGeometry(400, 400, 32, 32);

    // console.log(geometry.attributes);
    // 初期状態においてアトリビュートはpositionとuvしか存在しないことが分かる

    // 頂点の位置情報
    //
    // const position = geometry.attributes.position;
    // console.log(position);
    //
    // positionはFloat32BufferAttribute型
    // position.countには個数が格納されている

    // 頂点のUV座標
    //
    // const uv = geometry.attributes.uv;
    // console.log(uv);
    //
    // uvはFloat32BufferAttribute型
    // https://threejs.org/docs/#api/en/core/BufferAttribute
    //
    // 一次元のarrayに値が格納されているので(u, v)を直接取り出すのは難しいが、
    // Vector2, Vector3, Vector4, Colorクラスには.fromBufferAttribute(attribute, index)メソッドがあるので、
    // それを使うとインデックスを指定して(u, v)を取り出せる
    //
    // uv.countには(u, v)の個数が格納されている

    // X軸を中心に-90度回転してXZ平面と平行にする
    geometry.rotateX(-Math.PI / 2)

    const material = new THREE.MeshBasicMaterial({
      wireframe: true,
    });

    this.ground = new THREE.Mesh(geometry, material);
    this.scene.add(this.ground);
  }

}
