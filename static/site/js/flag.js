
import * as THREE from "three";
import { OrbitControls } from "three/controls/OrbitControls.js";

// lil-gui
import { GUI } from "three/libs/lil-gui.module.min.js";

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
  controller;
  clock;

  material;

  constructor() {

    // コンテナ
    this.container = document.getElementById("threejsContainer");

    // コンテナのサイズ
    this.sizes.width = this.container.clientWidth;
    this.sizes.height = this.container.clientHeight;

    // シーン
    this.scene = new THREE.Scene();

    // カメラ
    this.camera = new THREE.PerspectiveCamera(
      75,
      this.sizes.width / this.sizes.height,
      0.1,
      101
    );
    this.camera.position.set(0, 0, 1.5);
    this.scene.add(this.camera);

    // レンダラ
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    // デバイスピクセル比は上限2に制限(3以上のスマホ・タブレットでは処理が重すぎる)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    // 環境光
    this.scene.add(new THREE.AmbientLight(0x404040, 0.25));

    // コントローラ
    this.controller = new OrbitControls(this.camera, this.renderer.domElement);
    this.controller.enableDamping = true;

    // クロック
    this.clock = new THREE.Clock();

    // ジオメトリ
    const geometry = new THREE.PlaneGeometry(1, 1, 32, 32);

    // UV座標をジオメトリから取得することもできるが、
    // バーテックスシェーダーも保持している
    // const uuV = geometry.attributes.uv;

    // テクスチャ
    const textureLoader = new THREE.TextureLoader();
    const flagTexture = textureLoader.load("./static/site/img/jp-flag.png");

    // マテリアル
    // this.material = new THREE.RawShaderMaterial({
    this.material = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      side: THREE.DoubleSide,
      // グローバル変数
      uniforms: {
        // (x方向の周波数, y方向の周波数)
        uFrequency: { value: new THREE.Vector2(10, 5) },
        uTime: { value: 0 },
        uColor: { value: new THREE.Color("pink") },
        uTexture: { value: flagTexture },
      }
    });

    // lil-gui
    const gui = new GUI({ width: 300 });
    gui
      .add(this.material.uniforms.uFrequency.value, "x")
      .min(0)
      .max(20)
      .step(0.01)
      .name("freq x");
    gui
      .add(this.material.uniforms.uFrequency.value, "y")
      .min(0)
      .max(20)
      .step(0.01)
      .name("freq y");

    // メッシュ化
    const mesh = new THREE.Mesh(geometry, this.material);

    // 横長にする
    mesh.scale.y = 2/3;

    this.scene.add(mesh);

    // resizeイベントのハンドラを登録
    window.addEventListener("resize", () => { this.onWindowResize(); }, false);

    // フレーム毎の処理(requestAnimationFrameで再帰的に呼び出される)
    this.animate();
  }


  animate() {
    // 時間取得
    const elapsedTime = this.clock.getElapsedTime();
    this.material.uniforms.uTime.value = elapsedTime

    // カメラコントローラーの更新
    this.controller.update();

    // 再描画
    this.renderer.render(this.scene, this.camera);

    // 再帰処理
    requestAnimationFrame(() => { this.animate(); });
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
