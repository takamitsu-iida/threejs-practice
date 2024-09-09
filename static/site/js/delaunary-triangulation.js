import * as THREE from "three";
import { OrbitControls } from "three/controls/OrbitControls.js";
import { ImprovedNoise } from 'three/libs/ImprovedNoise.js';

// lil-gui
import { GUI } from "three/libs/lil-gui.module.min.js";

// stats.js
import Stats from "three/libs/stats.module.js";

// Delaunator
// https://github.com/mapbox/delaunator
// https://mapbox.github.io/delaunator/

// Delaunay triangulation
// https://en.wikipedia.org/wiki/Delaunay_triangulation

// 引用元
// https://hofk.de/main/discourse.threejs/2018/Triangulation/Triangulation.html

import Delaunator from "delaunatorjs";

/*
import Delaunator from "delaunatorjs";
を実現するには、ちょっと苦労がある。

https://github.com/mapbox/delaunator
ここからReleasesの最新版（2024年9月時点でv5.0.1）をダウンロードする。
この中にindex.jsがあるので、これを使う。

delaunatorは内部でrobust-predicatesのorient2dを使っているため、
orient2dが見つからないというエラーが発生する。

https://github.com/mourner/robust-predicates
ここからReleasesの最新版（2024年9月時点でv3.0.2）をダウンロードする。
この中のsrcフォルダのjavascriptファイルをコピーして使う。

HTMLではこのようなimportmapを使う。

<!-- three.js -->
<script type="importmap">
  {
    "imports": {
      "three": "./static/build/three.module.js",
      "three/libs/": "./static/libs/",
      "three/controls/": "./static/controls/",
      "robust-predicates": "./static/libs/robust-predicates-3.0.2/orient2d.js",
      "delaunatorjs": "./static/libs/delaunator-5.0.1/index.js"
    }
  }
</script>

*/

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
    wireframe: true,
  }

  // メッシュ
  terrainMesh;

  // perlin noise
  perlin = new ImprovedNoise();

  constructor() {

    // init scene, camera, renderer
    this.initThreejs();

    // lil-gui
    this.initGui();

    // stats.jsを初期化
    this.initStatsjs();

    // 地形を生成
    this.generateTerrain();

    // リサイズイベントを登録
    window.addEventListener("resize", () => { this.onWindowResize(); }, false);

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
    // this.scene.background = new THREE.Color(0xffffff);

    // カメラ
    this.camera = new THREE.PerspectiveCamera(
      75,
      this.sizes.width / this.sizes.height,
      1,
      1001
    );
    // this.camera.position.set(150, 150, 150);
    // x, y, zに同じ値を入れるならsetScalar()が使える
    this.camera.position.setScalar(150);

    // レンダラ
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    // ディレクショナルライト
    const light = new THREE.DirectionalLight(0xffffff, 1);
    // light.position.set(100, 100, 100);
    light.position.setScalar(100);
    this.scene.add(light);

    // 環境光
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));

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
      .add(this.params, "wireframe")
      .name("wireframe")
      .onChange(() => {
        this.terrainMesh.material.wireframe = this.params.wireframe;
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

  render() {
    // 再帰処理
    requestAnimationFrame(() => { this.render(); });

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

  onWindowResize() {
    this.sizes.width = this.container.clientWidth;
    this.sizes.height = this.container.clientHeight;

    this.camera.aspect = this.sizes.width / this.sizes.height;
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.sizes.width, this.sizes.height);
  }

  generateTerrain() {
    const pointSize = { x: 200, y: 200 };
    const pointsCount = 1000;
    const points3d = [];

    for (let i = 0; i < pointsCount; i++) {
      // .randFloatSpread ( range : Float ) : Float
      // Random float in the interval [- range / 2, range / 2].
      let x = THREE.MathUtils.randFloatSpread(pointSize.x);
      let z = THREE.MathUtils.randFloatSpread(pointSize.y);
      let y = this.perlin.noise(x / pointSize.x * 5, z / pointSize.y * 5, 3.0) * 50;

      points3d.push(new THREE.Vector3(x, y, z));
    }

    const geometry = new THREE.BufferGeometry();

    // setFromPoints()で頂点を設定
    geometry.setFromPoints(points3d);

    // 点群を表示
    var pointCloud = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: 0x99ccff,
        size: 1.5,
      })
    );

    this.scene.add(pointCloud);

    // Delaunay三角形分割
    const indexDelaunay = Delaunator.from(
      points3d.map(v => {
        return [v.x, v.z];
      })
    );

    // Delaunay三角形のインデックスをmeshIndexに代入してThree.jsのインデックスに変換
    const meshIndex = [];
    for (let i = 0; i < indexDelaunay.triangles.length; i++) {
      meshIndex.push(indexDelaunay.triangles[i]);
    }

    // 点群のジオメトリにインデックスを追加してポリゴン化
    geometry.setIndex(meshIndex);

    // 法線ベクトルを計算
    geometry.computeVertexNormals();

    // メッシュを生成
    this.terrainMesh = new THREE.Mesh(
      geometry, // re-use the existing geometry
      new THREE.MeshLambertMaterial({
        color: "purple",
        wireframe: this.params.wireframe,
      })
    );

    this.scene.add(this.terrainMesh);

  }

}
