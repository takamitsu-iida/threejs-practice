
import * as THREE from "three";
import { OrbitControls } from "three/controls/OrbitControls.js";

// lil-gui
import { GUI } from "three/libs/lil-gui.module.min.js";

// GLSLをJavaScriptの文字列として取得する
import { vertex } from "./waveVertexShader.glsl.js";
import { fragment } from "./waveFragmentShader.glsl.js";

export class Main {

  params;
  isHomepage;

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

  constructor(params) {

    this.params = params || {};
    this.isHomepage = ("homepage" in this.params) ? this.params.homepage : false;

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
    this.camera.position.set(0, 0.2, 0);
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
    if (this.isHomepage === false) {
      this.controller = new OrbitControls(this.camera, this.renderer.domElement);
      this.controller.enableDamping = true;
    }

    // クロック
    this.clock = new THREE.Clock();

    // ジオメトリ
    const geometry = new THREE.PlaneGeometry(8, 8, 512, 512);

    // UV座標をジオメトリから取得することもできるが、
    // バーテックスシェーダーも保持している
    // const uuV = geometry.attributes.uv;

    // 背景にテクスチャを貼り付ける
    const textureLoader = new THREE.TextureLoader();
    const skyTexture = textureLoader.load("./static/site/img/sky.jpg");
    this.scene.background = skyTexture;

    // 色
    const colorObject = {};
    colorObject.depthColor = "#2d81ae";
    colorObject.surfaceColor = "#66c1f9";

    // マテリアル
    this.material = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      side: THREE.DoubleSide,
      // グローバル変数
      uniforms: {
        uWaveLength: { value: 0.38 },
        uWaveSpeed: { value: 0.75 },
        uFreqency: { value: new THREE.Vector2(6.6, 3.5) },
        uSmallWaveElevation: { value: 0.15 },
        uSmallWaveFrequency: { value: 3.0 },
        uSmallWaveSpeed: { value: 0.2 },
        // 経過時間 float
        uTime: { value: 0 },
        // 色は3次元
        uDepthColor: { value: new THREE.Color(colorObject.depthColor) },
        uSurfaceColor: { value: new THREE.Color(colorObject.surfaceColor) },
        uColorOffset: { value: 0.03 },
        uColorMultiplier: { value: 9.0 },
        // uTexture: { value: flagTexture },
      }
    });

    // lil-gui
    const gui = new GUI({ width: 300 });
    gui
      .add(this.material.uniforms.uWaveLength, "value")
      .min(0)
      .max(1)
      .step(0.01)
      .name("wave length");

    gui
      .add(this.material.uniforms.uWaveSpeed, "value")
      .min(0)
      .max(4)
      .step(0.01)
      .name("wave speed");

    gui
      .add(this.material.uniforms.uFreqency.value, "x")
      .min(0)
      .max(10)
      .step(0.01)
      .name("freq x");

    gui
      .add(this.material.uniforms.uFreqency.value, "y")
      .min(0)
      .max(10)
      .step(0.01)
      .name("freq y");

    gui
      .addColor(colorObject, "depthColor")
      .name("depth color")
      .onChange(() => {
        this.material.uniforms.uDepthColor.value.set(colorObject.depthColor);
      });

    gui
      .addColor(colorObject, "surfaceColor")
      .name("surface color")
      .onChange(() => {
        this.material.uniforms.uSurfaceColor.value.set(colorObject.surfaceColor);
      });

    gui
      .add(this.material.uniforms.uColorOffset, "value")
      .min(0)
      .max(0.5)
      .step(0.001)
      .name("uColorOffset");

    gui
      .add(this.material.uniforms.uColorMultiplier, "value")
      .min(0)
      .max(10)
      .step(0.001)
      .name("uColorMultiplier");

    gui
      .add(this.material.uniforms.uSmallWaveElevation, "value")
      .min(0)
      .max(1)
      .step(0.001)
      .name("uSmallWaveElevation");

    gui
      .add(this.material.uniforms.uSmallWaveFrequency, "value")
      .min(0)
      .max(30)
      .step(0.001)
      .name("uSmallWaveFrequency");

    gui
      .add(this.material.uniforms.uSmallWaveSpeed, "value")
      .min(0)
      .max(4)
      .step(0.001)
      .name("uSmallWaveSpeed");

    if (this.isHomepage) {
      gui.show(false);
    }

    // メッシュ化
    const mesh = new THREE.Mesh(geometry, this.material);

    // X軸に沿って90度回転
    mesh.rotation.x = -1 * Math.PI / 2;

    this.scene.add(mesh);

    // resizeイベントのハンドラを登録
    window.addEventListener("resize", this.onWindowResize, false);

    // フレーム毎の処理(requestAnimationFrameで再帰的に呼び出される)
    this.animate();
  }


  animate() {
    // 時間取得
    const elapsedTime = this.clock.getElapsedTime();
    this.material.uniforms.uTime.value = elapsedTime;

    // XZ平面上でカメラを周回させる
    this.camera.position.x = Math.sin(elapsedTime * 0.17) * 3.0;
    this.camera.position.z = Math.cos(elapsedTime * 0.17) * 3.0;

    this.camera.lookAt(Math.sin(elapsedTime)*0.2, Math.cos(elapsedTime)*0.2, Math.sin(elapsedTime)*0.2);

    // カメラコントローラーの更新
    if (this.isHomepage === false) {
      this.controller.update();
    }

    // 再描画
    this.renderer.render(this.scene, this.camera);

    // 再帰処理
    requestAnimationFrame(() => { this.animate(); });
  }


  onWindowResize = (event) => {
    this.sizes.width = this.container.clientWidth;
    this.sizes.height = this.container.clientHeight;

    this.camera.aspect = this.sizes.width / this.sizes.height;
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.sizes.width, this.sizes.height);
  };

}
