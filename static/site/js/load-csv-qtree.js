import * as THREE from "three";
import { OrbitControls } from "three/controls/OrbitControls.js";

// lil-gui
import { GUI } from "three/libs/lil-gui.module.min.js";

// stats.js
import Stats from "three/libs/stats.module.js";

// デローネ三角形
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
    path: "./static/data/depth_map_data.csv",
    csvData: null,

    wireframe: false,
    autoRotate: true,
    autoRotateSpeed: 1.0,

    minLat: 0,
    maxLat: 0,
    minLon: 0,
    maxLon: 0,

    // 四分木に分割した領域の配列
    areas: null,
  }

  // デローネ三角形で作成する地形図のメッシュ（guiで表示を操作するためにインスタンス変数にする）
  terrainMesh;


  constructor(params = {}) {
    this.params = Object.assign(this.params, params);
    this.init();
  }


  init = async () => {
    // データを読み込む
    // その間、ローディング画面を表示する
    await this.loadCsv(this.params.path);

    if (this.params.csvData === null) {
      return;
    }

    // console.log(this.params.csvData);
    // {lat: xxx, lon: xxx, depth: xxx}

    // quad treeに分割する
    this.initQuadTree();

    // scene, camera, renderer, controllerを初期化
    this.initThreejs();

    // lil-guiを初期化
    this.initGui();

    // stats.jsを初期化
    this.initStatsjs();

    // 四分木に分割したデータareasを元にデローネ三角形を形成する
    this.initDelaunay();

    // フレーム毎の処理(requestAnimationFrameで再帰的に呼び出される)
    this.render();
  }


  loadCsv = async (path) => {
    const loadingContainer = document.getElementById('loadingContainer');

    try {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`HTTP status: ${response.status}`);
      }

      // テキストデータを取得
      const text = await response.text();

      // CSVデータをパース
      this.params.csvData = this.parseCsv(text);

      // 瞬時にfetchできても0.5秒はローディング画面を表示する
      const interval = setInterval(() => {
        loadingContainer.classList.add('fadeout');
        clearInterval(interval);
      }, 500);

      // ローディング画面を非表示にする
      loadingContainer.addEventListener('transitionend', (event) => {
        event.target.remove();
      });

    } catch (error) {
      const errorMessage = `Error while loading CSV: ${error}`;
      console.error(errorMessage);
      let p = document.createElement('p');
      p.textContent = errorMessage;
      p.style.color = 'white';
      loadingContainer.appendChild(p);
    }

  }


  // CSVデータをパースする関数
  parseCsv = (text) => {
    const lines = text.split('\n');
    const headers = lines[0].split(',');
    const data = [];

    let minLat = 9999;
    let maxLat = -9999;
    let minLon = 9999;
    let maxLon = -9999;

    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(',');
      if (row.length === headers.length) {
        const rowData = {};
        for (let j = 0; j < headers.length; j++) {
          rowData[headers[j].trim()] = row[j].trim();
        }
        this.normalizeData(rowData);
        data.push(rowData);

        // 緯度経度の最大値、最小値を取得
        if (rowData.lat < minLat) {
          minLat = rowData.lat;
        }
        if (rowData.lat > maxLat) {
          maxLat = rowData.lat;
        }
        if (rowData.lon < minLon) {
          minLon = rowData.lon;
        }
        if (rowData.lon > maxLon) {
          maxLon = rowData.lon;
        }
      }
    }

    console.log(`minLat: ${minLat}\nmaxLat: ${maxLat}\nminLon: ${minLon}\nmaxLon: ${maxLon}`);

    this.params.minLat = minLat;
    this.params.maxLat = maxLat;
    this.params.minLon = minLon;
    this.params.maxLon = maxLon;

    return data;
  }


  normalizeData = (rowData) => {

    // |       |             lat |             lon |        depth |
    // |:------|----------------:|----------------:|-------------:|
    // | mean  |     35.1641     |    139.608      |     16.4776  |

    // 小数点以下を消すなら、このスケールになるんだけど、とんでもなくでかい数字になるので
    // const scale = 100000000000000;

    // このくらいがちょうど良さそう
    const scale = 10000;

    const latMean = 35.1641;
    const lonMean = 139.608;

    rowData.lat = -1 * (parseFloat(rowData.lat) - latMean) * scale;
    rowData.lon = (parseFloat(rowData.lon) - lonMean) * scale;
    rowData.depth = -1 * parseFloat(rowData.depth);

  }


  initThreejs = () => {
    // コンテナ
    this.container = document.getElementById("threejsContainer");

    // コンテナのサイズ
    this.sizes.width = this.container.clientWidth;
    this.sizes.height = this.container.clientHeight;

    // resizeイベントのハンドラを登録
    window.addEventListener("resize", this.onWindowResize, false);

    // シーン
    this.scene = new THREE.Scene();

    // カメラ
    this.camera = new THREE.PerspectiveCamera(
      60,
      this.sizes.width / this.sizes.height,
      1,
      1000
    );
    this.camera.position.set(0, 0, 100);

    // レンダラ
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    // コントローラ
    this.controller = new OrbitControls(this.camera, this.renderer.domElement);
    this.controller.autoRotate = this.params.autoRotate;
    this.controller.autoRotateSpeed = this.params.autoRotateSpeed;

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

    // 環境光
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));

    // ディレクショナルライト
    const light = new THREE.DirectionalLight(0xffffff, 0.8);
    light.position.set(-50, 50, 50);
    this.scene.add(light);

  }


  initGui = () => {
    const guiContainer = document.getElementById("guiContainer");
    const gui = new GUI({
      container: guiContainer,
      width: 300,
    });

    gui
      .add(this.params, "autoRotate")
      .name(navigator.language.startsWith("ja") ? "自動回転" : "rotation")
      .onChange((value) => {
        this.controller.autoRotate = value;
      });

    gui
      .add(this.params, "autoRotateSpeed")
      .name(navigator.language.startsWith("ja") ? "回転スピード" : "autoRotateSpeed")
      .min(1.0)
      .max(10.0)
      .step(0.1)
      .onChange((value) => {
        this.controller.autoRotateSpeed = value;
      });

    gui
      .add(this.params, "wireframe")
      .name(navigator.language.startsWith("ja") ? "ワイヤーフレーム表示" : "wireframe")
      .onChange(() => {
        this.terrainMesh.material.wireframe = this.params.wireframe;
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


  quadtree = (area, maxpoints, maxdivision) => {
    if (area.points.length <= maxpoints || area.depth >= maxdivision) {
      return [area];
    }

    const midX = (area.minLon + area.maxLon) / 2;
    const midZ = (area.minLat + area.maxLat) / 2;

    const areas = [
      new Area(area.minLon, area.minLat, midX, midZ, area.depth + 1),
      new Area(midX, area.minLat, area.maxLon, midZ, area.depth + 1),
      new Area(area.minLon, midZ, midX, area.maxLat, area.depth + 1),
      new Area(midX, midZ, area.maxLon, area.maxLat, area.depth + 1)
    ];

    for (const point of area.points) {
      for (const subArea of areas) {
        if (point.lat >= subArea.minLat && point.lat < subArea.maxLat && point.lon >= subArea.minLon && point.lon < subArea.maxLon) {
          subArea.append(point);
          break;
        }
      }
    }

    let result = [];
    for (const subArea of areas) {
      result = result.concat(this.quadtree(subArea, maxpoints, maxdivision));
    }

    return result;
  }


  initQuadTree = () => {
    if (this.params.areas !== null) {
      return;
    }

    // X軸 = Longitude(経度)
    const minLon = this.params.minLon;  // -93.15585150687866
    const maxLon = this.params.maxLon;  // 137.8217825273964

    // Z軸 = Latitude(緯度)
    const minLat = this.params.minLat;  // -96.32579062369473
    const maxLat = this.params.maxLat;  // 68.51506401226004

    // 5で割るのは適当に選んだ
    const maxdivision = Math.ceil(Math.max((maxLon - minLon) / 5, (maxLat - minLat) / 5));
    console.log(`maxdivision: ${maxdivision}`);

    const maxpoints = 5;

    // 対象とする領域を生成
    const initial = new Area(minLon, minLat, maxLon, maxLat, 0);

    const data = this.params.csvData;
    // dataは配列で、各要素は以下のようなオブジェクト
    // [ {lat: 67.88624331335313, lon: -81.94761236723025, depth: -21.1785}, {...}, ... ]
    // 初期領域にデータを追加する
    for (const d of data) {
      initial.append(d);
    }

    // 四分木に分割する
    const areas = this.quadtree(initial, maxpoints, maxdivision);
    console.log(`initial area is divided into ${areas.length} areas`);

    // 保存しておく
    this.params.areas = areas;
  }


  initDelaunay = () => {

    // 四分木で分割した領域を一つの点とするポイントクラウドを作成する
    const areas = this.params.areas;

    const point3d = [];
    areas.forEach((area) => {
      if (area.points.length === 0) {
        return;
      }
      const lon = (area.minLon + area.maxLon) / 2;
      const lat = (area.minLat + area.maxLat) / 2;
      const depth = area.points.reduce((acc, cur) => acc + cur.depth, 0) / area.points.length;
      point3d.push(new THREE.Vector3(lon, depth, lat));
    });

    console.log(`${point3d.length} points are created`);

    // ポイントクラウドのジオメトリを作成
    const geometry = new THREE.BufferGeometry().setFromPoints(point3d);

    // マテリアルを作成
    const pointMaterial = new THREE.PointsMaterial({
      color: 0x99ccff,
      size: 0.2,
    });

    // 点群を作成
    const pointCloud = new THREE.Points(geometry, pointMaterial);

    // シーンに追加
    this.scene.add(pointCloud);

    // デローネ三角形を形成する
    const delaunay = Delaunator.from(
      point3d.map(v => {
        return [v.x, v.z];
      })
    );

    // デローネ三角形のインデックスをmeshIndexに代入してThree.jsのインデックスに変換
    const meshIndex = [];
    for (let i = 0; i < delaunay.triangles.length; i++) {
      meshIndex.push(delaunay.triangles[i]);
    }

    // 点群のジオメトリにインデックスを追加してポリゴン化
    geometry.setIndex(meshIndex);

    // 法線ベクトルを計算
    geometry.computeVertexNormals();

    // マテリアルを生成
    const material = new THREE.MeshLambertMaterial({
      color: 0x00ff00,
      wireframe: this.params.wireframe,
    });

    // メッシュを生成
    const terrainMesh = new THREE.Mesh(geometry, material);

    // シーンに追加
    this.scene.add(terrainMesh);

    // インスタンス変数に保存
    this.terrainMesh = terrainMesh;
  }


}



class Area {
  // Lon = X軸
  minLon;
  maxLon;

  // Lat = Z軸
  minLat;
  maxLat;

  // 四分木の深さ
  depth;

  // この領域に含まれる点の配列
  // [{lat: xxx, lon: xxx, depth: xxx}, ...]
  points = [];

  constructor(minLon, minLat, maxLon, maxLat, depth) {
    this.minLon = minLon;
    this.minLat = minLat;
    this.maxLon = maxLon;
    this.maxLat = maxLat;
    this.depth = depth;
  }

  append(point) {
    this.points.push(point);
  }
}
