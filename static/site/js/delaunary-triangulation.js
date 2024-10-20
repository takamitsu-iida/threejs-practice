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

    terrainSize: { x: 200, y: 200 },
    pointsCount: 1000,
  }

  // メッシュ
  pointCloud;
  terrainMesh;

  // perlin noise
  perlin = new ImprovedNoise();

  constructor(params={}) {
    this.params = Object.assign(this.params, params);

    // init scene, camera, renderer
    this.initThreejs();

    // lil-gui
    this.initGui();

    // stats.jsを初期化
    this.initStatsjs();

    // 地形を生成
    this.generateTerrain();

    // XZ平面にグリッドを表示
    // this.gridMarker(this.terrainMesh);


    // フレーム毎の処理(requestAnimationFrameで再帰的に呼び出される)
    this.render();
  }


  initThreejs = () => {
    // コンテナ
    this.container = document.getElementById("threejsContainer");

    // コンテナのサイズ
    this.sizes.width = this.container.clientWidth;
    this.sizes.height = this.container.clientHeight;

    // リサイズイベントを登録
    window.addEventListener("resize", this.onWindowResize, false);

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


  initGui = () => {
    const guiContainer = document.getElementById("guiContainer");
    const gui = new GUI({
      container: guiContainer,
      width: 300,
    });

    gui
      .add(this.params, "wireframe")
      .name("wireframe")
      .onChange(() => {
        this.terrainMesh.material.wireframe = this.params.wireframe;
      });

    gui
      .add(this.params, "pointsCount", 3, 10000, 10)
      .name("pointsCount")
      .onChange((value) => {
        if (this.pointCloud.geometry.attributes.position.count === value) {
          return;
        }
        this.scene.remove(this.pointCloud);
        this.scene.remove(this.terrainMesh);
        this.generateTerrain();
      });
  }


  initStatsjs = () => {
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


  generateTerrain = () => {
    const terrainSize = this.params.terrainSize;
    const pointsCount = this.params.pointsCount;
    const points3d = [];

    // ランダムに配置した点群データを作成
    for (let i = 0; i < pointsCount; i++) {
      // .randFloatSpread ( range : Float ) : Float
      // Random float in the interval [- range / 2, range / 2].
      let x = THREE.MathUtils.randFloatSpread(terrainSize.x);
      let z = THREE.MathUtils.randFloatSpread(terrainSize.y);
      let y = this.perlin.noise(x / terrainSize.x * 5, z / terrainSize.y * 5, 3.0) * 50;

      points3d.push(new THREE.Vector3(x, y, z));
    }

    const geometry = new THREE.BufferGeometry();

    // setFromPoints()で頂点を設定
    geometry.setFromPoints(points3d);

    // 点群のマテリアルを作成
    const pointsMaterial = new THREE.PointsMaterial({
      color: 0x99ccff,
      size: 1.0,
    });

    // 点群を作成
    this.pointCloud = new THREE.Points(geometry, pointsMaterial);

    this.scene.add(this.pointCloud);

    // Delaunay三角形分割
    const delaunay = Delaunator.from(
      points3d.map(v => {
        return [v.x, v.z];
      })
    );

    // Delaunay三角形のインデックスをmeshIndexに代入してThree.jsのインデックスに変換
    const meshIndex = [];
    for (let i = 0; i < delaunay.triangles.length; i++) {
      meshIndex.push(delaunay.triangles[i]);
    }

    // おおよそ6倍になる
    // console.log(meshIndex);

    // 点群のジオメトリにインデックスを追加してポリゴン化
    geometry.setIndex(meshIndex);

    // 法線ベクトルを計算
    geometry.computeVertexNormals();

    // マテリアルを生成
    const material = new THREE.MeshLambertMaterial({
      color: "silver",
      wireframe: this.params.wireframe,
    });

    // メッシュを生成
    this.terrainMesh = new THREE.Mesh(geometry, material);

    this.scene.add(this.terrainMesh);
  }


  gridMarker = (mesh) => {

    // メッシュの境界を特定
    const boundingBox = new THREE.Box3().setFromObject(mesh);
    const minX = Math.floor(boundingBox.min.x);
    const maxX = Math.floor(boundingBox.max.x);
    const minZ = Math.floor(boundingBox.min.z);
    const maxZ = Math.floor(boundingBox.max.z);

    const gridUnit = 5;

    // Raycasterを作成
    const raycaster = new THREE.Raycaster();

    // レイを飛ばす元の座標
    const targetVec = new THREE.Vector3();

    // レイを飛ばす向きを表す単位ベクトル、この場合は上空から地面に向かう方向
    const dirVec = new THREE.Vector3(0, -1, 0);

    const markerGeometry = new THREE.BufferGeometry();
    const markerPoints = [];

    for (let x = minX * 2; x < maxX * 2; x += gridUnit) {
      for (let z = minZ * 2; z < maxZ * 2; z += gridUnit) {

        // レイを飛ばす始点
        targetVec.set(x, 1000, z);

        // 上空から地面方向に向かってレイを飛ばす
        raycaster.set(targetVec, dirVec);

        // メッシュとの交差判定
        const intersects = raycaster.intersectObjects([mesh]);

        if (intersects.length > 0) {
          const intersect = intersects[0];
          markerPoints.push(new THREE.Vector3(x, intersect.point.y, z));
        } else {
          markerPoints.push(new THREE.Vector3(x, 0, z));
          // console.log(`交点なし: ${x}, ${z}`);
        }

      }
    }

    // setFromPoints()で頂点を設定
    markerGeometry.setFromPoints(markerPoints);

    // 点群のマテリアルを作成
    const markerMaterial = new THREE.PointsMaterial({
      color: 0xff0000,
      size: 1.0,
    });

    const markerPointCloud = new THREE.Points(markerGeometry, markerMaterial);

    this.scene.add(markerPointCloud);

  }

}