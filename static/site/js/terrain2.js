import * as THREE from "three";
import { OrbitControls } from "three/controls/OrbitControls.js";
import { ImprovedNoise } from 'three/libs/ImprovedNoise.js';

// lil-gui
import { GUI } from "three/libs/lil-gui.module.min.js";

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

  statsjs;

  renderParams = {
    clock: new THREE.Clock(),
    delta: 0,
    interval: 1 / 30,  // = 30fps
  }

  params = {
    width: 100,  // X方向の幅
    depth: 100,  // Z方向の奥行き

    segments: 100,  // グリッドの分割数
    roughness: 10,  // 地形の凹凸の高さを調整するパラメータ
    frequency: 10, // 波の頻度を調節するパラメータ

    // HSL
    hue: 0.3, // 色相を調整するパラメータ
    saturation: 1.0, // 彩度を調整するパラメータ
    lightness: 0.5, // 輝度を調整するパラメータ

  }

  // メッシュ
  terrainMesh;


  constructor(params={}) {
    this.params = Object.assign(this.params, params);

    // init scene, camera, renderer
    this.initThreejs();

    // lil-gui
    this.initGui();

    // stats.jsを初期化
    this.initStatsjs();

    // 地形を作成
    this.terrainMesh = this.generateTerrain();
    this.scene.add(this.terrainMesh);

    // リサイズイベントを登録
    window.addEventListener("resize", this.onWindowResize, false);

    // フレーム毎の処理(requestAnimationFrameで再帰的に呼び出される)
    this.render();
  }


  initThreejs() {
    // コンテナ
    this.container = document.getElementById("threejsContainer");

    // コンテナのサイズ
    this.sizes.width = this.container.clientWidth;
    this.sizes.height = this.container.clientHeight;

    // シーン
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xffffff);

    // カメラ
    this.camera = new THREE.PerspectiveCamera(
      75,
      this.sizes.width / this.sizes.height,
      1,
      1001
    );
    this.camera.position.set(100, 50, 100);

    // レンダラ
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.autoClear = false;
    this.container.appendChild(this.renderer.domElement);

    // ポイントライト
    this.scene.add(new THREE.PointLight(0xffffff, 3, 0, 0));

    // ディレクショナルライト
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(50, 50, 50).normalize();
    this.scene.add(light);

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
    const axesHelper = new THREE.AxesHelper(10000);
    this.scene.add(axesHelper);

  }

  initGui() {
    const guiContainer = document.getElementById("guiContainer");
    const gui = new GUI({
      container: guiContainer,
    });

    gui
      .add(this.params, "segments", 10, 200, 10)
      .name("segments")
      .onChange(() => {
        this.scene.remove(this.terrainMesh); // 現在の地形メッシュを削除
        this.terrainMesh = this.generateTerrain(); // 新しい地形メッシュを生成
        this.scene.add(this.terrainMesh); // 新しい地形メッシュをシーンに追加
      });

    gui
      .add(this.params, "roughness", 1, 50, 1)
      .name("roughness")
      .onChange(() => {
        this.updateTerrain();
      });

    gui
      .add(this.params, "frequency", 5, 20, 1)
      .name("frequency")
      .onChange(() => {
        this.updateTerrain();
      });

    gui
      .add(this.params, "hue", 0, 1, 0.01) // 色相のパラメータをGUIに追加
      .name("hue")
      .onChange(() => {
        this.updateTerrain();
      });

    gui
      .add(this.params, "saturation", 0, 1, 0.01) // 彩度のパラメータをGUIに追加
      .name("saturation")
      .onChange(() => {
        this.updateTerrain();
      });

    gui
      .add(this.params, "lightness", 0, 1, 0.01) // 輝度のパラメータをGUIに追加
      .name("lightness")
      .onChange(() => {
        this.updateTerrain();
      });


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

  generateTerrain() {

    // 幅（X軸方向）
    const width = this.params.width;

    // 奥行き（Z軸方向）
    const depth = this.params.depth;

    // 分割数
    const segments = this.params.segments;

    // 凹凸の高さのパラメータ
    const roughness = this.params.roughness;

    // 波の頻度のパラメータ
    const frequency = this.params.frequency;

    const geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array((segments + 1) * (segments + 1) * 3);
    const colors = new Float32Array((segments + 1) * (segments + 1) * 3);

    const hue = this.params.hue; // 色相のパラメータ
    const saturation = this.params.saturation; // 彩度のパラメータ
    const lightness = this.params.lightness; // 輝度のパラメータ

    /*

    分割数 segments としたとき、頂点は segments + 1 必要になる

    o---o---o
    |   |   |
    o---o---o
    |   |   |
    o---o---o

    */

    const noise = new ImprovedNoise();

    let vIndex = 0;
    let cIndex = 0;
    for (let i = 0; i <= segments; i++) {
      for (let j = 0; j <= segments; j++) {

        const x = (i / segments) * width;//  - width / 2;
        const z = (j / segments) * depth;//  - depth / 2;
        const y = noise.noise(x / frequency, z / frequency, 0) * roughness; // 高さにノイズを乗せる

        vertices[vIndex++] = x;
        vertices[vIndex++] = y;
        vertices[vIndex++] = z;

        const color = new THREE.Color();

        // H（Hue, 色相）: 色の種類を表します。0から1の範囲で指定され、0が赤、0.33が緑、0.66が青、1が再び赤に戻ります。
        // S（Saturation, 彩度）: 色の鮮やかさを表します。0がグレースケール、1が最も鮮やかな色です。
        // L（Lightness, 輝度）: 色の明るさを表します。0が黒、0.5が標準の明るさ、1が白です。

        // 高さに基づいて色を設定、低い部分は暗く、高い部分は明るく表示
        // color.setHSL(0.3, 1.0, (y + roughness) / (2 * roughness));
        color.setHSL(hue, saturation, (y + roughness) / (2 * roughness) * lightness);

        colors[cIndex++] = color.r;
        colors[cIndex++] = color.g;
        colors[cIndex++] = color.b;
      }
    }

    const indices = [];
    for (let i = 0; i < segments; i++) {
      for (let j = 0; j < segments; j++) {

        /*
          TL---TR
          |    |
          BL---BR
        */

        const TL = i * (segments + 1) + j;
        const TR = i * (segments + 1) + (j + 1);
        const BL = (i + 1) * (segments + 1) + j;
        const BR = (i + 1) * (segments + 1) + (j + 1);


        /*
          TL---TR
            \  |
               BR
        */
        indices.push(TL, TR, BR);


        /*
          TL
          |  \
          BL---BR
        */
        indices.push(TL, BR, BL);
      }
    }

    geometry.setIndex(indices);
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const material = new THREE.MeshPhongMaterial({
      side: THREE.DoubleSide,
      vertexColors: true,
      transparent: true,
      opacity: 1.0,
    });

    const mesh = new THREE.Mesh(geometry, material);

    return mesh;
  }



  updateTerrain() {
    const width = this.params.width;
    const depth = this.params.depth;

    const segments = this.params.segments;
    const roughness = this.params.roughness; // 凹凸のパラメータ
    const frequency = this.params.frequency; // 波の頻度のパラメータ
    const hue = this.params.hue; // 色相のパラメータ
    const saturation = this.params.saturation; // 彩度のパラメータ
    const lightness = this.params.lightness; // 輝度のパラメータ

    const vertices = this.terrainMesh.geometry.attributes.position.array;
    const colors = this.terrainMesh.geometry.attributes.color.array;

    const noise = new ImprovedNoise();

    let vIndex = 0;
    let cIndex = 0;
    for (let i = 0; i <= segments; i++) {
      for (let j = 0; j <= segments; j++) {
        const x = (i / segments) * width;
        const z = (j / segments) * depth;
        const y = noise.noise(x / frequency, z / frequency, 0) * roughness; // 高さにノイズを乗せる

        vertices[vIndex++] = x;
        vertices[vIndex++] = y;
        vertices[vIndex++] = z;

        const color = new THREE.Color();

        // 高さに基づいて色を設定、低い部分は暗く、高い部分は明るく表示
        color.setHSL(hue, saturation, (y + roughness) / (2 * roughness) * lightness);

        colors[cIndex++] = color.r;
        colors[cIndex++] = color.g;
        colors[cIndex++] = color.b;
      }
    }

    this.terrainMesh.geometry.attributes.position.needsUpdate = true;
    this.terrainMesh.geometry.attributes.color.needsUpdate = true;
  }


}
