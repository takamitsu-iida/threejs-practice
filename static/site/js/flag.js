
import * as THREE from "three";
import { OrbitControls } from "three/controls/OrbitControls.js";

// GLSLをJavaScriptの文字列として取得する
import { vertex } from "./flagVertexShader.glsl.js";
import { fragment } from "./flagFragmentShader.glsl.js";

export class Main {

  container;

  sizes = {
    width: 0,
    height: 0
  };

  scene;
  camera;
  renderer;

  directionalLight;

  controller;

  clock;
  elapsedTime;

  constructor() {

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
      75,
      this.sizes.width / this.sizes.height,
      1,
      101
    );
    this.camera.position.set(0.25, -0.25, 1);
    this.scene.add(this.camera);

    // レンダラ
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    // 環境光
    this.scene.add(new THREE.AmbientLight(0x404040, 0.25));

    // コントローラ
    this.controller = new OrbitControls(this.camera, this.renderer.domElement);
    this.controller.enableDamping = true;

    // クロック
    this.clock = new THREE.Clock();

    // テクスチャローダー
    const textureLoader = new THREE.TextureLoader();

    // ジオメトリ
    const geometry = new THREE.PlaneGeometry(1, 1, 32, 32);

    // マテリアル
    const material = new THREE.RawShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
    });

    // メッシュ化
    const mesh = new THREE.Mesh(geometry, material);
    this.scene.add(mesh);

    // フレーム毎の処理(requestAnimationFrameで再帰的に呼び出される)
    this.render();
  }


  render() {
    //時間取得
    this.elapsedTime = this.clock.getElapsedTime();

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
