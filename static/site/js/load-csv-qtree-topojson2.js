import * as THREE from "three";
import { OrbitControls } from "three/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from 'three/libs/CSS2DRenderer.js';

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


const LANDMARKS = [
  { lon: 139.60695032, lat: 35.16900046, depth: -10, name: 'ヤギ瀬' },
  { lon: 139.61539000, lat: 35.16946800, depth: 0, name: 'みなとや' },
];


export class Main {

  // Three.jsを表示するコンテナのHTML要素
  container;

  // そのコンテナのサイズ
  sizes = {
    width: 0,
    height: 0
  }

  // 水深を表示するHTML要素
  depthContainer;

  // 緯度経度を表示するHTML要素
  coordinatesContainer;

  // 方位磁針を表示するHTML要素
  compassElement;

  // Three.jsの各種インスタンス
  scene;
  camera;
  renderer;
  controller;
  statsjs;

  // マウス座標を取得するためのraycaster
  raycaster;

  // マウス座標
  mousePosition;

  // CSS2DRenderer
  cssRenderer;

  // 水深のCSVデータを四分木に分割したインスタンス
  quadtree;

  // レンダリング用のパラメータ
  renderParams = {
    animationId: null,
    clock: new THREE.Clock(),
    delta: 0,
    interval: 1 / 30,  // = 30fps
  }

  params = {

    // 海底地形図の(lon, lat)をThree.jsのXZ座標のどの範囲に描画するか
    // 持っているGPSデータに応じて調整する
    xzGridSize: 200,  // 200を指定する場合は -100～100 の範囲に描画する

    // xzGridSizeにあわせるために、どのくらい緯度経度の値を拡大するか（自動計算）
    xzScale: 10000,  // これは仮の値、概ね10000くらいがいい感じ

    // 水深データのCSVファイルのURL
    depthMapPath: "./static/data/depth_map_data_edited.csv",

    // CSVテキストをパースしたデータ配列
    depthMapData: null,

    // それを正規化したデータの配列
    // TODO: 一つにまとめてもいいかも
    normalizedDepthMapData: null,

    // 三浦市のtopojsonファイルのURL
    topojsonPath: "./static/data/aburatsubo.json",

    // topojsonデータ
    topojsonData: null,

    // topojsonデータに含まれるobjectName（三浦市のデータなら"miura"）
    objectName: "miura",

    // ポイントクラウドを表示するか？
    showPointCloud: true,

    // ポイントクラウドのパーティクルサイズ
    pointSize: 0.2,

    // ワイヤーフレーム表示にする？
    wireframe: false,

    // コントローラの設定
    autoRotate: false,
    autoRotateSpeed: 1.0,

    // 緯度経度の最大値、最小値（CSVから自動で読み取る）
    minLat: 0,
    maxLat: 0,
    minLon: 0,
    maxLon: 0,

    // 正規化した緯度経度の最大値、最小値（自動計算）
    normalizedMinLat: 0,
    normalizedMaxLat: 0,
    normalizedMinLon: 0,
    normalizedMaxLon: 0,

    // 画面表示する四分木の深さ
    quadtreeDepth: 3,  // 4^3 = 64個のエリアに分割される

    // 四分木の分割パラメータ
    divideParam: 5,  // 見栄えに変化がないので5のままでよい（guiはdisableにしておく）

    // 四分木の領域に5個以上の点がある場合にさらに小さく四分木分割する
    maxPoints: 5,

    // ランドマークラベルの高さ
    labelY: 20,
  }

  // 地形図のポイントクラウド（guiで表示を操作するためにインスタンス変数にする）
  pointMesh;

  // 地形図のメッシュのリスト（guiで表示を操作するためにインスタンス変数にする）
  terrainMeshList = [];


  constructor(params = {}) {
    this.params = Object.assign(this.params, params);
    this.init();
  }


  init = async () => {
    // データを読み込む
    await Promise.all([
      this.loadCsv(this.params.depthMapPath),
      this.loadTopojson(this.params.topojsonPath)
    ]);

    if (this.params.depthMapData === null) {
      return;
    }

    if (this.params.topojsonData === null) {
      return;
    }

    // データをダウンロードしている間、ローディング画面を表示する
    // 瞬時にfetchできても0.5秒はローディング画面を表示する
    const loadingContainer = document.getElementById('loadingContainer');

    const interval = setInterval(() => {
      loadingContainer.classList.add('fadeout');
      clearInterval(interval);
    }, 500);

    // ローディング画面を非表示にする
    loadingContainer.addEventListener('transitionend', (event) => {
      event.target.remove();
    });

    // scene, camera, renderer, controllerを初期化
    this.initThreejs();

    // stats.jsを初期化
    this.initStatsjs();

    // lil-guiを初期化
    this.initGui();

    // 色の凡例を初期化
    this.initLegend();

    // コンテンツを初期化
    this.initContents();
  }


  initContents = () => {
    // アニメーションを停止
    this.stop();

    // シーン上のメッシュを削除する
    this.clearScene();

    // 全てを削除した状態で描画
    this.renderer.render(this.scene, this.camera);

    // 緯度経度の値を正規化
    this.normalizeDepthMapData();

    // 正規化したデータを四分木に分割する
    this.initQuadTree();

    // 四分木を元に、デローネ三角形でメッシュを表示する
    this.initDelaunay();

    // topojsonデータからシェイプを作成
    const shapes = this.createShapesFromTopojson(this.params.topojsonData, this.params.objectName);

    // シェイプの配列からメッシュを作成
    this.createMeshFromShapes(shapes);

    // ランドマークを表示
    this.initLandmarks();

    // 縮尺を表示
    this.initScale();

    // フレーム毎の処理
    this.render();
  }


  loadCsv = async (path) => {
    try {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`HTTP status: ${response.status}`);
      }

      // テキストデータを取得
      const text = await response.text();

      // CSVのテキストデータをパース
      this.params.depthMapData = this.parseCsv(text);

    } catch (error) {
      const errorMessage = `Error while loading ${path}: ${error}`;
      console.error(errorMessage);
      let p = document.createElement('p');
      p.textContent = errorMessage;
      p.style.color = 'white';
      loadingContainer.appendChild(p);
    }
  }


  parseCsv = (text) => {
    // 行に分割
    const lines = text.split('\n');

    // 先頭行にヘッダがある前提
    const headers = lines[0].split(',');

    // 行ごとにパースしたデータを格納する配列
    const dataList = [];

    // 緯度経度の最大値、最小値を取得するための変数
    let minLat = 9999;
    let maxLat = -9999;
    let minLon = 9999;
    let maxLon = -9999;

    // 2行目以降をパース
    for (let i = 1; i < lines.length; i++) {
      const rows = lines[i].split(',');
      if (rows.length === headers.length) {
        const d = {};
        for (let j = 0; j < headers.length; j++) {
          d[headers[j].trim()] = parseFloat(rows[j].trim());
        }
        dataList.push(d);

        // 緯度経度の最大値、最小値を調べる
        minLat = Math.min(minLat, d.lat);
        maxLat = Math.max(maxLat, d.lat);
        minLon = Math.min(minLon, d.lon);
        maxLon = Math.max(maxLon, d.lon);
      }
    }

    // console.log(`minLat: ${minLat}\nmaxLat: ${maxLat}\nminLon: ${minLon}\nmaxLon: ${maxLon}`);

    // 後から参照できるように保存しておく
    this.params.minLat = minLat;
    this.params.maxLat = maxLat;
    this.params.minLon = minLon;
    this.params.maxLon = maxLon;

    // 緯度の差分、経度の差分で大きい方を取得
    const diffSize = Math.max(maxLat - minLat, maxLon - minLon);

    // このdiffSizeがxzGridSizeになるように係数を計算
    this.params.xzScale = this.params.xzGridSize / diffSize;

    return dataList;
  }


  normalizeDepthMapData = () => {

    // 緯度経度の中央値を調べる
    const lonCenter = (this.params.minLon + this.params.maxLon) / 2;
    const latCenter = (this.params.minLat + this.params.maxLat) / 2;

    // 拡大率
    const scale = this.params.xzScale;

    // 既存データを上書きで正規化した方が手っ取り早いが、
    // ここでは元のデータを残して新しい配列を作成する
    // データ量が少ないうちは問題ないが、データ量が多い場合はメモリを圧迫するので注意
    const normalizeDepthMapData = [];

    let normalizedMinLat = 9999;
    let normalizedMaxLat = -9999;
    let normalizedMinLon = 9999;
    let normalizedMaxLon = -9999;

    this.params.depthMapData.forEach((d) => {
      // 経度(lon)はX軸に対応する
      // センターに寄せて、スケールをかける
      const lon = (d.lon - lonCenter) * scale;

      // 緯度(lat)はZ軸に対応する
      // Three.jsのZ軸の向きと、地図の南北は逆になるのでマイナスをかける
      const lat = -1 * (d.lat - latCenter) * scale;

      // 深さ(depth)はY軸に対応する
      // 深さなので、マイナスをかける
      const depth = -1 * d.depth;

      normalizeDepthMapData.push({ lat: lat, lon: lon, depth: depth });

      normalizedMinLat = Math.min(normalizedMinLat, lat);
      normalizedMaxLat = Math.max(normalizedMaxLat, lat);
      normalizedMinLon = Math.min(normalizedMinLon, lon);
      normalizedMaxLon = Math.max(normalizedMaxLon, lon);
    });

    this.params.normalizedDepthMapData = normalizeDepthMapData;

    this.params.normalizedMinLat = normalizedMinLat;
    this.params.normalizedMaxLat = normalizedMaxLat;
    this.params.normalizedMinLon = normalizedMinLon;
    this.params.normalizedMaxLon = normalizedMaxLon;
    // console.log(`normalizedMinLat: ${this.params.normalizedMinLat}\nnormalizedMaxLat: ${this.params.normalizedMaxLat}\nnormalizedMinLon: ${this.params.normalizedMinLon}\nnormalizedMaxLon: ${this.params.normalizedMaxLon}`);

  }


  loadTopojson = async (path) => {
    try {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`HTTP status: ${response.status}`);
      }

      // topojsonデータを取得
      const topojsonData = await response.json();

      if (topojsonData.hasOwnProperty('transform')) {
        this.params.translate = topojsonData.transform.translate;
      } else {
        new Error('No transform property in jsonData');
      }

      if (!topojsonData.hasOwnProperty('objects')) {
        new Error('No objects property in jsonData');
      }

      if (!topojsonData.objects.hasOwnProperty(this.params.objectName)) {
        new Error(`No ${this.params.objectName} property in objects`);
      }

      // jsonデータを保存
      this.params.topojsonData = topojsonData;
    } catch (error) {
      const errorMessage = `Error while loading ${path}: ${error}`;
      console.error(errorMessage);
      let p = document.createElement('p');
      p.textContent = errorMessage;
      p.style.color = 'white';
      loadingContainer.appendChild(p);
    }
  }


  initThreejs = () => {

    // Three.jsを表示するHTML要素
    this.container = document.getElementById("threejsContainer");

    // そのコンテナのサイズ
    this.sizes.width = this.container.clientWidth;
    this.sizes.height = this.container.clientHeight;

    // 水深を表示するHTML要素
    this.depthContainer = document.getElementById("depthContainer");

    // 緯度経度を表示するHTML要素
    this.coordinatesContainer = document.getElementById("coordinatesContainer");

    // 方位磁針を表示する要素
    this.compassElement = document.getElementById('compass');

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
    this.camera.position.set(0, 100, 100);

    // レンダラ
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
    });

    this.renderer.setSize(this.sizes.width, this.sizes.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // 地図は大きいのでクリッピングを有効にして表示領域を制限する
    this.renderer.localClippingEnabled = true;

    // コンテナにレンダラを追加
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
    const xzGridSize = this.params.xzGridSize;
    const axesHelper = new THREE.AxesHelper(xzGridSize);
    this.scene.add(axesHelper);

    // 環境光
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));

    // ディレクショナルライト
    const light = new THREE.DirectionalLight(0xffffff, 0.8);
    light.position.set(-50, 0, 0);
    this.scene.add(light);

    // レイキャスター
    this.raycaster = new THREE.Raycaster();

    // マウス座標
    this.mousePosition = new THREE.Vector2();

    // 正規化したマウス座標を保存
    this.renderer.domElement.addEventListener("mousemove", (event) => {
      this.mousePosition.x = (event.clientX / this.sizes.width) * 2 - 1;
      this.mousePosition.y = -(event.clientY / this.sizes.height) * 2 + 1;
    }, false);

    // CSS2DRenderer
    this.cssRenderer = new CSS2DRenderer();
    this.cssRenderer.setSize(this.sizes.width, this.sizes.height);
    this.cssRenderer.domElement.style.position = 'absolute';
    this.cssRenderer.domElement.style.top = 0;
    this.cssRenderer.domElement.style.pointerEvents = 'none';
    this.container.appendChild(this.cssRenderer.domElement);
  }


  initGui = () => {
    const guiContainer = document.getElementById("guiContainer");
    const gui = new GUI({
      container: guiContainer,
      width: 300,
    });

    // 一度だけ実行するための関数
    const doLater = (job, tmo) => {

      // 処理が登録されているならタイマーをキャンセル
      var tid = doLater.TID[job];
      if (tid) {
        window.clearTimeout(tid);
      }

      // タイムアウト登録する
      doLater.TID[job] = window.setTimeout(() => {
        // 実行前にタイマーIDをクリア
        doLater.TID[job] = null;
        // 登録処理を実行
        job.call();
      }, tmo);
    }

    // 処理からタイマーIDへのハッシュ
    doLater.TID = {};

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
        this.terrainMeshList.forEach((terrainMesh) => {
          terrainMesh.material.wireframe = this.params.wireframe;
        });
      });

    gui
      .add(this.params, "showPointCloud")
      .name(navigator.language.startsWith("ja") ? "ポイントクラウド表示" : "showPointCloud")
      .onChange((value) => {
        this.pointMesh.visible = value;
      });

    gui
      .add(this.params, "pointSize")
      .name(navigator.language.startsWith("ja") ? "ポイントサイズ" : "pointSize")
      .min(0.1)
      .max(1.0)
      .step(0.1)
      .onChange((value) => {
        this.pointMesh.material.size = value;
      });

    gui
      .add(this.params, "maxPoints")
      .name(navigator.language.startsWith("ja") ? "四分木分割するしきい値点数" : "maxPoints")
      .min(4)
      .max(10)
      .step(1)
      .onFinishChange(() => {
        doLater(this.initContents, 100);
      });

    gui
      .add(this.params, "quadtreeDepth")
      .name(navigator.language.startsWith("ja") ? "表示する四分木の深さ" : "quadtreeDepth")
      .min(0)
      .max(5)
      .step(1)
      .onFinishChange(() => {
        doLater(this.initContents, 100);
      });


    // gui.close();  // 初期状態で閉じた状態にする
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
    this.renderParams.animationId = requestAnimationFrame(this.render);

    this.renderParams.delta += this.renderParams.clock.getDelta();
    if (this.renderParams.delta < this.renderParams.interval) {
      return;
    }

    {
      // stats.jsを更新
      this.statsjs.update();

      // カメラコントローラーを更新
      this.controller.update();

      // シーンをレンダリング
      this.renderer.render(this.scene, this.camera);

      // CSS2DRendererをレンダリング
      this.cssRenderer.render(this.scene, this.camera);

      // 水深を表示
      this.renderDepth();

      // 方位磁針を更新
      this.updateCompass();
    }

    this.renderParams.delta %= this.renderParams.interval;
  }


  stop = () => {
    if (this.renderParams.animationId) {
      cancelAnimationFrame(this.renderParams.animationId);
    }
    this.renderParams.animationId = null;
  }


  clearScene = () => {
    const objectsToRemove = [];

    this.scene.children.forEach((child) => {
      if (child.type === 'AxesHelper' || child.type === 'GridHelper' || String(child.type).indexOf('Light') >= 0) {
        return;
      }
      objectsToRemove.push(child);
    });

    objectsToRemove.forEach((object) => {
      this.scene.remove(object);
      if (object.geometry) {
        object.geometry.dispose();
      }
      if (object.material) {
        if (Array.isArray(object.material)) {
          object.material.forEach(material => material.dispose());
        } else {
          object.material.dispose();
        }
      }
    });
  }


  onWindowResize = (event) => {
    this.sizes.width = this.container.clientWidth;
    this.sizes.height = this.container.clientHeight;

    this.camera.aspect = this.sizes.width / this.sizes.height;
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.sizes.width, this.sizes.height);

    // CSS2DRendererもリサイズする
    this.cssRenderer.setSize(this.sizes.width, this.sizes.height);
  };


  initQuadTree = () => {

    const minLon = this.params.normalizedMinLon;
    const minLat = this.params.normalizedMinLat;
    const maxLon = this.params.normalizedMaxLon;
    const maxLat = this.params.normalizedMaxLat;

    // 四分木の分割パラメータを調整する
    const divideParam = this.params.divideParam;
    const maxDivision = Math.ceil(Math.max((maxLon - minLon) / divideParam, (maxLat - minLat) / divideParam));
    console.log(`maxdivision: ${maxDivision}`);
    Quadtree.MAX_DIVISION = maxDivision;

    // 領域内に含まれる最大の点の数、これを超えていたらさらに小さく分割する
    const maxPoints = this.params.maxPoints;
    Quadtree.MAX_POINTS = maxPoints;

    // X軸 = Longitude(経度)、Z軸 = Latitude(緯度)
    const bounds = {
      lon1: minLon,  // 最小のX(lon)
      lat1: minLat,  // 最小のZ(lat)
      lon2: maxLon,  // 最大のX(lon)
      lat2: maxLat   // 最大のZ(lat)
    }
    console.log(`quadtree bounds: ${JSON.stringify(bounds)}`);

    // ルート領域を作成
    const quadtree = new Quadtree(bounds);

    // normalizedDepthMapDataは配列で、各要素は以下のようなオブジェクト
    // [ {lat: 67.88624331335313, lon: -81.94761236723025, depth: -21.1785}, {...}, ... ]
    // ルート領域にデータを追加する
    this.params.normalizedDepthMapData.forEach((d) => {
      quadtree.insert(d);
    });

    // 何個に分割されたかを表示
    console.log(`quadtree division: ${quadtree.division}`);

    // 保存しておく
    this.quadtree = quadtree;
  }


  initDelaunay = () => {
    // 四分木で分割した領域の中央を一つの点とするポイントクラウドを作成する

    // 作成するメッシュのリスト
    const terrainMeshList = [];

    // この深さの四分木ノードを取得して表示する
    const quadtreeDepth = this.params.quadtreeDepth;

    // 指定されている深さの四分木ノードを取得して、
    const quadtreeNodesAtDepth = this.quadtree.getNodesAtDepth(quadtreeDepth);

    // その四分木ノードの中で、葉ノードを取得
    quadtreeNodesAtDepth.forEach((quadtreeNodeAtDepth) => {

      // リーフノードの一覧を取得
      const quadtreeLeafNodes = quadtreeNodeAtDepth.getLeafNodes();

      // Three.jsのVector3の配列
      const point3d = [];

      // 頂点カラーの配列
      const colors = [];

      quadtreeLeafNodes.forEach((quadtreeNode) => {
        // エリア内に点がない場合は無視する
        if (quadtreeNode.points.length < 1) {
          return;
        }

        // そのエリアの中央の座標を計算
        const bounds = quadtreeNode.bounds;
        const lon = (bounds.lon1 + bounds.lon2) / 2;
        const lat = (bounds.lat2 + bounds.lat2) / 2;

        // エリア内の点の深さの平均値を計算
        const depth = quadtreeNode.points.reduce((acc, cur) => acc + cur.depth, 0) / quadtreeNode.points.length;

        // Vector3を格納
        point3d.push(new THREE.Vector3(lon, depth, lat));

        // 深さに応じて頂点に色を付ける
        const color = this.getDepthColor(depth);
        colors.push(color.r, color.g, color.b);
      });

      if (point3d.length < 1) {
        return;
      }
      // console.log(`${point3d.length} points are created`);

      // ポイントクラウドのジオメトリを作成
      const geometry = new THREE.BufferGeometry().setFromPoints(point3d);

      // 頂点カラーを設定
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

      // マテリアルを作成
      const pointsMaterial = new THREE.PointsMaterial({
        color: 0x99ccff,
        size: this.params.pointSize,
      });

      // 点群を作成
      const pointMesh = new THREE.Points(geometry, pointsMaterial);

      // 表示するかどうか
      pointMesh.visible = this.params.showPointCloud;

      // シーンに追加
      this.scene.add(pointMesh);

      // インスタンス変数に保存（guiで表示を操作するため）
      this.pointMesh = pointMesh;

      // XZ平面でデローネ三角形を形成する
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
        vertexColors: true, // 頂点カラーを使用
        wireframe: this.params.wireframe,
      });

      // メッシュを生成
      const terrainMesh = new THREE.Mesh(geometry, material);

      // シーンに追加
      this.scene.add(terrainMesh);

      // 配列に保存
      terrainMeshList.push(terrainMesh);

    });

    // インスタンス変数に保存
    this.terrainMeshList = terrainMeshList;
  }


  getDepthColor(depth) {
    let color;
    if (depth < -60.0) {
      color = new THREE.Color(0x2e146a);
    } else if (depth < -55.0) {
      color = new THREE.Color(0x451e9f);
    } else if (depth < -50.0) {
      color = new THREE.Color(0x3b31c3);
    } else if (depth < -45.0) {
      color = new THREE.Color(0x1f47de);
    } else if (depth < -40.0) {
      color = new THREE.Color(0x045ef9);
    } else if (depth < -35.0) {
      color = new THREE.Color(0x0075fd);
    } else if (depth < -30.0) {
      color = new THREE.Color(0x008ffd);
    } else if (depth < -25.0) {
      color = new THREE.Color(0x01aafc);
    } else if (depth < -20.0) {
      color = new THREE.Color(0x01c5fc);
    } else if (depth < -16.0) {
      color = new THREE.Color(0x45ccb5);
    } else if (depth < -12.0) {
      color = new THREE.Color(0x90d366);
    } else if (depth < -10.0) {
      color = new THREE.Color(0xb4df56);
    } else if (depth < -8.0) {
      color = new THREE.Color(0xd9ed4c);
    } else if (depth < -6.0) {
      color = new THREE.Color(0xfdfb41);
    } else if (depth < -5.0) {
      color = new THREE.Color(0xfee437);
    } else if (depth < -4.0) {
      color = new THREE.Color(0xfecc2c);
    } else if (depth < -3.0) {
      color = new THREE.Color(0xfeb321);
    } else if (depth < -2.0) {
      color = new THREE.Color(0xff9b16);
    } else if (depth < -1.0) {
      color = new THREE.Color(0xff820b);
    } else if (depth < 0.0) {
      color = new THREE.Color(0xff7907);
    } else {
      color = new THREE.Color(0xffffff);
    }
    return color;
  }


  initLegend = () => {
    const legendContainer = document.getElementById('legendContainer');

    const depthSteps = [
      -1, -2, -3, -4, -5, -6, -8, -10, -12, -16, -20, -25, -30, -35, -40, -45, -50, -55, -60
    ];

    depthSteps.forEach((depth) => {
      const color = this.getDepthColor(depth);

      const legendItem = document.createElement('div');

      // CSSクラスを設定
      legendItem.className = 'legend-item';

      // 水深に応じたidを設定
      legendItem.id = `legend-${depth}`;

      const colorBox = document.createElement('div');
      colorBox.className = 'legend-color';
      colorBox.style.backgroundColor = `#${color.getHexString()}`;

      const label = document.createElement('span');
      label.textContent = `${depth}m`;

      legendItem.appendChild(colorBox);
      legendItem.appendChild(label);
      legendContainer.appendChild(legendItem);
    });
  }

  updateLegendHighlight = (depth) => {
    this.clearLegendHighlight();

    // TODO
    // 同じ配列をinitLegendで作成しているので、ここで再定義するのは避けたい
    const depthSteps = [
      -1, -2, -3, -4, -5, -6, -8, -10, -12, -16, -20, -25, -30, -35, -40, -45, -50, -55, -60
    ];

    // depthに最も近いdepthStepsの値を見つける
    let closestDepth = depthSteps[0];
    let minDiff = Math.abs(depth - closestDepth);
    for (let i = 1; i < depthSteps.length; i++) {
      const diff = Math.abs(depth - depthSteps[i]);
      if (diff < minDiff) {
        closestDepth = depthSteps[i];
        minDiff = diff;
      }
    }

    const legendItem = document.getElementById(`legend-${closestDepth}`);
    if (legendItem) {
      legendItem.classList.add('highlight');
    }
  }

  clearLegendHighlight = () => {
    const highlightedItems = document.querySelectorAll('.highlight');
    highlightedItems.forEach(item => item.classList.remove('highlight'));
  }


  createShapesFromTopojson = (jsonData, objectName) => {

    // Shapeを格納する配列
    const shapes = [];

    const topoData = topojson.feature(jsonData, jsonData.objects[objectName]);
    const features = topoData.features;

    // topojsonのFeatureCollectionからFeatureを一つずつ取り出す
    features.forEach(feature => {

      // GeometryがLineStringの場合
      if (feature.geometry.type === 'LineString') {
        const shape = new THREE.Shape();

        const coordinates = feature.geometry.coordinates;

        let coord = coordinates[0];
        coord = this.normalizeCoordinates(coord);

        // パスを開始
        shape.moveTo(
          coord[0],
          coord[1]
        );

        for (let i = 1; i < coordinates.length; i++) {
          coord = coordinates[i];
          coord = this.normalizeCoordinates(coord);

          // 線分を追加
          shape.lineTo(
            coord[0],
            coord[1]
          );
        }

        shapes.push(shape);
      }

      // GeometryがPolygonの場合
      else if (feature.geometry.type === 'Polygon') {
        const shape = new THREE.Shape();

        const coordinates = feature.geometry.coordinates[0];

        let coord = coordinates[0];
        coord = this.normalizeCoordinates(coord);

        shape.moveTo(
          coord[0],
          coord[1]
        );

        for (let i = 1; i < coordinates.length; i++) {
          coord = coordinates[i];
          coord = this.normalizeCoordinates(coord);
          shape.lineTo(
            coord[0],
            coord[1]
          );
        }

        shapes.push(shape);
      }

      // GeometryがMultiPolygonの場合
      else if (feature.geometry.type === 'MultiPolygon') {
        feature.geometry.coordinates.forEach(polygon => {
          const shape = new THREE.Shape();
          const coordinates = polygon[0];

          let coord = coordinates[0];
          coord = this.normalizeCoordinates(coord);

          shape.moveTo(
            coord[0],
            coord[1]
          );

          for (let i = 1; i < coordinates.length; i++) {
            coord = coordinates[i];
            coord = this.normalizeCoordinates(coord);
            shape.lineTo(
              coord[0],
              coord[1]
            );
          }

          shapes.push(shape);
        });
      }

    });

    return shapes;
  }


  // 経度経度を中央寄せして正規化する
  normalizeCoordinates = ([lon, lat]) => {
    const scale = this.params.xzScale;
    const latCenter = (this.params.maxLat + this.params.minLat) / 2;
    const lonCenter = (this.params.maxLon + this.params.minLon) / 2;
    return [
      (lon - lonCenter) * scale,
      (lat - latCenter) * scale
    ];
  }


  // 元の座標系に戻す
  inverseNormalizeCoordinates = (x, z) => {
    const scale = this.params.xzScale;
    const latCenter = (this.params.maxLat + this.params.minLat) / 2;
    const lonCenter = (this.params.maxLon + this.params.minLon) / 2;
    return [
      x / scale + lonCenter,
      z / scale + latCenter
    ];
  }


  createMeshFromShapes = (shapes) => {
    // ExtrudeGeometryに渡すdepthパラメータ（厚み）
    const depth = 1.0;

    // カスタムジオメトリを作成
    const geometry = new THREE.ExtrudeGeometry(shapes, {
      depth: depth,
      bevelEnabled: true,   // エッジを斜めにする
      bevelSize: 0.5,       // 斜めのサイズ
      bevelThickness: 0.5,  // 斜めの厚み
      bevelSegments: 1,     // 斜めのセグメント数
    });

    // XZ平面化
    geometry.rotateX(-Math.PI / 2);

    // 上下位置を調整（このあと下半分はクリッピングする）
    geometry.translate(0, -depth / 2, 0);

    // 地図領域は海底地形図の倍の大きさになるようにクリッピングする
    const clippingSize = this.params.xzGridSize;

    // マテリアル、ここでは適当にMeshStandardMaterialを使う
    const material = new THREE.MeshStandardMaterial({
      color: 0xf0f0f0,
      transparent: true,
      depthWrite: false,
      opacity: 0.9,

      // クリッピングして表示領域を制限する
      clippingPlanes: [
        new THREE.Plane(new THREE.Vector3(0, 0, 1), clippingSize),   // Z座標がxzGridSize以下を表示
        new THREE.Plane(new THREE.Vector3(0, 0, -1), clippingSize),  // Z座標が-xzGridSize以上を表示
        new THREE.Plane(new THREE.Vector3(-1, 0, 0), clippingSize),  // X座標がxzGridSize以下を表示
        new THREE.Plane(new THREE.Vector3(1, 0, 0), clippingSize),   // X座標が-xzGridSize以上を表示
        new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),              // Y座標が0以上を表示
      ],
    });

    // メッシュ化
    const mesh = new THREE.Mesh(geometry, material);

    // シーンに追加
    this.scene.add(mesh);
  }


  renderDepth = () => {
    // レイキャストを使用してマウスカーソルの位置を取得
    this.raycaster.setFromCamera(this.mousePosition, this.camera);

    // シーン全体を対象にレイキャストを行う
    // const intersects = this.raycaster.intersectObject(this.terrainMesh);
    const intersects = this.raycaster.intersectObject(this.scene, true);

    if (intersects.length > 0) {
      const intersect = intersects[0];

      // 水深データを取得
      const depth = intersect.point.y;

      // 緯度経度を取得
      const x = intersect.point.x;
      const z = intersect.point.z;
      const [lon, lat] = this.inverseNormalizeCoordinates(x, z);

      if (depth < 0) {
        this.depthContainer.textContent = `Depth: ${depth.toFixed(2)}m`;
        this.coordinatesContainer.textContent = `Lon: ${lon.toFixed(8)}, Lat: ${lat.toFixed(8)}`;

        // 凡例をハイライト
        this.updateLegendHighlight(depth);
      } else {
        this.depthContainer.textContent = '';
        this.coordinatesContainer.textContent = '';

        // ハイライトをクリア
        this.clearLegendHighlight();
      }
    } else {
      this.depthContainer.textContent = '';
      this.coordinatesContainer.textContent = '';

      // ハイライトをクリア
      this.clearLegendHighlight();
    }
  }


  updateCompass = () => {
    const cameraDirection = new THREE.Vector3();
    this.camera.getWorldDirection(cameraDirection);

    // カメラの方向を方位磁針の回転角度に変換
    const angle = Math.atan2(cameraDirection.x, cameraDirection.z);
    const degrees = THREE.MathUtils.radToDeg(angle) + 180;  // 0度が北を向くように調整

    // 方位磁針の回転を更新
    this.compassElement.style.transform = `rotate(${degrees}deg)`;
  }


  initLandmarks = () => {
    LANDMARKS.forEach((landmark) => {
      // 正規化した緯度経度を取得
      let [lon, lat] = this.normalizeCoordinates([landmark.lon, landmark.lat]);

      // Y座標はその場所の真上になるように設定
      const position = new THREE.Vector3(lon, this.params.labelY, lat);

      // ラベルを作成
      this.createLandmarkLabel(landmark.name, position);

      // ラインを作成
      const material = new THREE.LineBasicMaterial({ color: 0xffffff });
      const points = [];
      points.push(new THREE.Vector3(lon, landmark.depth, lat));
      points.push(new THREE.Vector3(lon, position.y, lat));
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geometry, material);
      this.scene.add(line);

    });
  }


  createLandmarkLabel = (name, position) => {
    const div = document.createElement('div');
    div.className = 'landmark-label';
    div.textContent = name;

    const cssObject = new CSS2DObject(div);
    cssObject.position.copy(position);
    this.scene.add(cssObject);
  }


  initScale = () => {
    const earthRadiusKm = 6371; // 地球の半径（km）
    const kmToRadians = 1 / (earthRadiusKm * Math.PI / 180); // 1kmをラジアンに変換
    const kmToDisplayLength = kmToRadians * this.params.xzScale;

    const start = new THREE.Vector3(0, 1.1, 0);
    const end = new THREE.Vector3(kmToDisplayLength, 1.1, 0);

    const material = new THREE.LineBasicMaterial({ color: 0xffffff });
    const points = [start, end];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geometry, material);
    this.scene.add(line);

    // 100mごとの目印を追加
    for (let i = 1; i <= 10; i++) {
      const markerPosition = new THREE.Vector3(i * kmToDisplayLength / 10, 1.1, 0);
      const markerGeometry = new THREE.BufferGeometry().setFromPoints([markerPosition, new THREE.Vector3(markerPosition.x, 2.1, markerPosition.z)]);
      const markerLine = new THREE.Line(markerGeometry, material);
      this.scene.add(markerLine);
    }

    // ラベルを追加
    const div = document.createElement('div');
    div.className = 'landmark-label';
    div.textContent = '1km';

    const cssObject = new CSS2DObject(div);
    cssObject.position.copy(end);
    cssObject.position.y = 6;
    this.scene.add(cssObject);
  }

}


class QuadtreeNode {

  bounds;  // { lon1, lat1, lon2, lat2 }
  depth;
  points;
  children;

  constructor(bounds, depth = 0) {
    this.bounds = bounds;
    this.depth = depth;
    this.points = [];
    this.children = [];
  }

  isLeaf() {
    return this.children.length === 0;
  }

  subdivide() {
    const { lon1, lat1, lon2, lat2 } = this.bounds;
    const midLon = (lon1 + lon2) / 2;
    const midLat = (lat1 + lat2) / 2;

    // このノードを四分木で分割する
    // childrenは以下の順になる
    //  +---+---+
    //  | 0 | 1 |
    //  +---+---+
    //  | 2 | 3 |
    //  +---+---+

    this.children.push(new QuadtreeNode({ lon1: lon1, lat1: lat1, lon2: midLon, lat2: midLat }, this.depth + 1));
    this.children.push(new QuadtreeNode({ lon1: midLon, lat1: lat1, lon2: lon2, lat2: midLat }, this.depth + 1));
    this.children.push(new QuadtreeNode({ lon1: lon1, lat1: midLat, lon2: midLon, lat2: lat2 }, this.depth + 1));
    this.children.push(new QuadtreeNode({ lon1: midLon, lat1: midLat, lon2: lon2, lat2: lat2 }, this.depth + 1));
  }

  insert(point) {
    if (!this.contains(point)) {
      return false;
    }

    if (this.isLeaf()) {
      if (this.points.length < Quadtree.MAX_POINTS || this.depth >= Quadtree.MAX_DEPTH) {
        this.points.push(point);
        return true;
      } else {
        this.subdivide();
        this.points.forEach(p => this.insertIntoChildren(p));
        this.points = [];
      }
    }

    return this.insertIntoChildren(point);
  }

  insertIntoChildren(point) {
    for (const child of this.children) {
      if (child.insert(point)) {
        return true;
      }
    }
    return false;
  }

  contains(point) {
    const { lon1, lat1, lon2, lat2 } = this.bounds;
    return point.lon >= lon1 && point.lon < lon2 && point.lat >= lat1 && point.lat < lat2;
  }

  query(range, found = []) {
    if (!this.intersects(range)) {
      return found;
    }

    for (const point of this.points) {
      if (range.contains(point)) {
        found.push(point);
      }
    }

    if (!this.isLeaf()) {
      for (const child of this.children) {
        child.query(range, found);
      }
    }

    return found;
  }

  intersects(range) {
    const { lon1, lat1, lon2, lat2 } = this.bounds;
    return !(range.lon1 > lon2 || range.lon2 < lon1 || range.lat1 > lat2 || range.lat2 < lat1);
  }

  getNodesAtDepth(targetDepth, nodes = []) {
    if (this.depth === targetDepth) {
      nodes.push(this);
    } else if (this.depth < targetDepth && !this.isLeaf()) {
      for (const child of this.children) {
        child.getNodesAtDepth(targetDepth, nodes);
      }
    }
    return nodes;
  }

  getLeafNodes(nodes = []) {
    if (this.isLeaf()) {
      nodes.push(this);
    } else {
      for (const child of this.children) {
        child.getLeafNodes(nodes);
      }
    }
    return nodes;
  }

}


class Quadtree {
  /*
    使い方
    const bounds = { lon1: 0, lat1: 0, lon2: 100, lat2: 100 };
    const quadtree = new Quadtree(bounds);

    const points = [
      { lon: 10, lat: 10 },
      { lon: 20, lat: 20 },
      { lon: 30, lat: 30 },
      { lon: 40, lat: 40 },
      { lon: 50, lat: 50 },
    ];

    points.forEach(point => quadtree.insert(point));

    const nodesAtDepth2 = quadtree.getNodesAtDepth(2);
    console.log(nodesAtDepth2);
  */

  static MAX_DIVISION = 10;
  static MAX_POINTS = 5;

  constructor(bounds) {
    this.root = new QuadtreeNode(bounds);
  }

  insert(point) {
    this.root.insert(point);
  }

  query(range) {
    return this.root.query(range);
  }

  getNodesAtDepth(depth) {
    return this.root.getNodesAtDepth(depth);
  }

  getLeafNodes() {
    return this.root.getLeafNodes();
  }

}
