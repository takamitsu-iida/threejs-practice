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
    this.container = document.getElementById("threejs_container");

    // コンテナのサイズ
    this.sizes.width = this.container.clientWidth;
    this.sizes.height = this.container.clientHeight;

    // リサイズイベント
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
    this.camera.position.set(100, 100, 160);
    this.camera.position.length(157);

    // レンダラ
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    // 環境光
    this.scene.add(new THREE.AmbientLight(0x404040, 0.25));

    // ディレクショナルライト
    this.directionalLight = new THREE.DirectionalLight(0xffffff, 1.25);
    this.directionalLight.position.set(1, 1, 0);
    this.scene.add(this.directionalLight);

    // 平面
    const g = new THREE.PlaneGeometry(200, 200, 1000, 1000);
    g.rotateX(-Math.PI / 2)
    const uv = g.attributes.uv;
    const pos = g.attributes.position;
    const vUv = new THREE.Vector2();
    for (let i = 0; i < uv.count; i++) {
      vUv.fromBufferAttribute(uv, i);
      vUv.multiplyScalar(10);
      pos.setY(i, this.perlin.noise(vUv.x, vUv.y, 2.7) * 30);
    }
    g.computeVertexNormals();

    const m = new THREE.MeshLambertMaterial({
      color: 0xa0adaf,
      side: THREE.DoubleSide,
      wireframe: false,
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


  onWindowResize() {
    this.sizes.width = this.container.clientWidth;
    this.sizes.height = this.container.clientHeight;

    this.camera.aspect = this.sizes.width / this.sizes.height;
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.sizes.width, this.sizes.height);
  }

}