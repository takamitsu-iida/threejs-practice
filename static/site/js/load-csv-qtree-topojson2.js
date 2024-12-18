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
  compassContainer;
  compassElement;

  // Three.jsの各種インスタンス
  scene;
  camera;
  renderer;
  controller;
  statsjs;

  // マウス座標にあるオブジェクトを取得するためのraycaster(renderDepthで利用)
  raycaster = new THREE.Raycaster();

  // マウス座標(renderDepthで利用、mousemoveイベントで値をセット)
  // THREE.Vector2();
  mousePosition;

  // 前フレーム時点でのマウス座標(renderDepthで利用)
  // THREE.Vector2();
  previousMousePosition;

  // カメラの向き(renderCompassで利用)
  cameraDirection;

  // 前フレーム時点でのカメラの向き(renderCompassで利用)
  previousCameraDirection;

  // ラベル表示用CSS2DRenderer
  cssRenderer;

  // 水深のCSVデータを四分木に分割したQuadtreeクラスのインスタンス
  quadtree;

  // レンダリング用のパラメータ
  renderParams = {
    animationId: null,
    clock: new THREE.Clock(),
    delta: 0,
    interval: 1 / 30,  // = 30fps
  }

  params = {

    // 海底地形図のlatをThree.jsのZ座標のどの範囲に描画するか
    // 400を指定する場合は -200～200 の範囲に描画する
    zSize: 400,

    // zSizeにあわせるために、どのくらい緯度の値を拡大するか（自動計算）
    zScale: 1,

    // zScaleにあわせて、X軸方向をどのくらい拡大するか（自動計算）
    // zScale * Math.cos(緯度) になる
    xScale: 1,

    // 水深をどのくらいの高さに描画するか
    // 100を指定する場合は 0 ～ -100 の範囲に描画する
    ySize: 100,

    // 最も深い水深に合わせてY座標をどのくらい拡大するか（自動計算）
    yScale: 1,

    // 水深データのCSVファイルのURL
    depthMapPath: "./static/data/depth_map_data_edited.csv",

    // CSVテキストをパースして作成するデータ配列
    // [ {lat: 35.16900046, lon: 139.60695032, depth: -10.0}, {...}, ... ]
    depthMapData: null,

    // 三浦市のtopojsonファイルのURL
    topojsonPath: "./static/data/aburatsubo.json",

    // topojsonデータ
    topojsonData: null,

    // topojsonデータに含まれるobjectName（三浦市のデータなら"miura"）
    topojsonObjectName: "miura",

    // topojsonを変換してGeoJSONデータにしたもの（いまは未使用）
    geojsonData: null,

    // ポイントクラウドを表示するか？
    showPointCloud: true,

    // ポイントクラウドのパーティクルサイズ
    pointSize: 0.2,

    // 画面表示しているポイントの数（自動計算）
    pointCount: 0,

    // CSVに何個のデータがあるか（CSV読み取り時に自動計算）
    totalPointCount: 0,

    // ワイヤーフレーム表示にする？
    wireframe: false,

    // コントローラの設定
    autoRotate: false,
    autoRotateSpeed: 1.0,

    // 緯度経度の最小値、最大値、中央値（CSVから自動で読み取る）
    minLon: 0,
    minLat: 0,
    maxLon: 0,
    maxLat: 0,
    centerLon: 0,
    centerLat: 0,

    // 水深の最大値（CSVから自動で読み取る）
    maxDepth: 0,

    // Three.jsのワールド座標に正規化した座標の最大値、最小値（自動計算）
    minX: 0,
    maxX: 0,
    minZ: 0,
    maxZ: 0,
    minY: 0,

    // 画面表示対象の四分木の深さ
    quadtreeDepth: 0,

    // どこまで深く四分木を分割するか
    maxQuadtreeDepth: 10,

    // 四分木の領域に何個の点があった場合に、さらに小さく四分木分割するか
    // この値を大きくすると、四分木の深さが浅くなり、描画するポイント数は減る
    // 総数5万ポイントくらいに抑えるように調整する
    maxAreaPoints: 6,

    // ランドマークのオブジェクト配列
    // [{ lon: 139.60695032, lat: 35.16200000, depth: -10, name_ja: 'ヤギ瀬', name: 'Yagise' },
    //  { lon: 139.61539000, lat: 35.16160000, depth: 0, name_ja: 'みなとや', name: 'Minatoya' },...]
    landmarks: [],

    // ランドマークを表示する？
    showLandmarks: true,

    // ランドマークラベルの高さ
    labelY: 20,

    // 縮尺を表示する？
    showScale: true,

    // コンパスを表示する？
    showCompass: true,
  }

  // 地形図のポイントクラウド（guiで表示を操作するためにインスタンス変数にする）
  pointMeshList = [];

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

    // 緯度経度の値をThree.jsのワールド座標に正規化する
    this.translate();

    // scene, camera, renderer, controllerを初期化
    this.initThreejs();

    // stats.jsを初期化
    this.initStatsjs();

    // lil-guiを初期化
    this.initGui();

    // topojsonデータから地図を表示
    this.initMap();

    // ランドマークを表示
    this.initLandmarks();

    // 色の凡例を初期化
    this.initLegend();

    // 縮尺を表示
    this.initScale();

    // 方位磁針を表示
    this.initCompass();

    // 地形図コンテンツを初期化
    this.initContents();
  }


  initContents = () => {
    // アニメーションを停止
    this.stop();

    // シーン上のメッシュを削除する
    this.clearScene();

    // メッシュを削除した状態で描画
    this.renderer.render(this.scene, this.camera);

    // 正規化したデータを四分木に分割する
    this.initQuadTree();

    // 四分木を元に、デローネ三角形でメッシュを表示する
    this.initDelaunay();

    // アニメーションを開始
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
    // CSVファイルの先頭行にヘッダが来る
    // lat,lon,depth
    // 35.157310485839844,139.5998077392578,21.178499221801758
    // 35.15732192993164,139.60012817382812,16.7810001373291

    // 行に分割
    const lines = text.split('\n');

    // 先頭行にヘッダがある前提
    const headers = lines[0].split(',');

    // 行ごとにパースしたデータを格納する配列
    const dataList = [];

    // 緯度経度の最大値、最小値を取得するための変数
    let minLat = Infinity, minLon = Infinity;
    let maxLat = -Infinity, maxLon = -Infinity;
    let maxDepth = -Infinity;

    // 1行目はヘッダなので、2行目以降をパース
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === '') {
        continue;
      }
      const rows = line.split(',');
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

        // 水深の最大値を調べる
        maxDepth = Math.max(maxDepth, d.depth);
      }
    }

    // 後から参照できるように保存しておく
    this.params.minLon = minLon;
    this.params.maxLon = maxLon;
    this.params.minLat = minLat;
    this.params.maxLat = maxLat;
    this.params.maxDepth = maxDepth;
    this.params.centerLon = (minLon + maxLon) / 2;
    this.params.centerLat = (minLat + maxLat) / 2;

    // 全部で何個のデータがあるか
    this.params.totalPointCount = dataList.length;

    // 緯度の差分を取得
    const diffLat = maxLat - minLat;

    // このdiffLatがzSizeになるように係数を計算
    this.params.zScale = this.params.zSize / diffLat;

    // 経度のスケールは緯度によって変わるので、中央の緯度で計算
    this.params.xScale = this.params.zScale * Math.cos(this.params.centerLat * Math.PI / 180);

    // 最も大きな水深がySizeになるように係数を計算
    this.params.yScale = this.params.ySize / maxDepth;

    return dataList;
  }


  // 経度がX軸、緯度がZ軸になるように経度経度をXZ座標に変換する
  // Three.jsのワールド座標はZ軸が手前に向いているので、-1倍して向きを反転する
  translateCoordinates = ([lon, lat]) => {
    return [
      (lon - this.params.centerLon) * this.params.xScale,
      (lat - this.params.centerLat) * this.params.zScale * (-1)
    ];
  }

  // XZ座標から(lon, lat)に戻す
  inverseTranslateCoordinates = ([x, z]) => {
    return [
      x / this.params.xScale + this.params.centerLon,
      z / this.params.zScale * (-1) + this.params.centerLat
    ];
  }

  // 水深をY座標に変換する
  translateDepth = (depth) => {
    return depth * this.params.yScale * (-1);
  }

  // Y座標から元の水深に戻す
  inverseTranslateDepth = (depth) => {
    return depth / this.params.yScale * (-1);
  }


  translate = () => {
    // ワールド座標の最大値、最小値
    let maxX = -Infinity, maxZ = -Infinity;
    let minX = Infinity, minZ = Infinity;
    let minY = Infinity;

    // params.depthMapDataにワールド座標を追加する
    this.params.depthMapData.forEach((d) => {

      // lon, latをXZ座標に変換
      const [x, z] = this.translateCoordinates([d.lon, d.lat]);
      d.x = x;
      d.z = z;

      // 深さ(depth)をY軸に変換
      const y = this.translateDepth(d.depth);
      d.y = y;

      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
      minY = Math.min(minY, y);
    });

    // 正規化した最小値、最大値を保存しておく
    this.params.minX = minX;
    this.params.maxX = maxX;
    this.params.minZ = minZ;
    this.params.maxZ = maxZ;
    this.params.minY = minY;
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

      if (!topojsonData.objects.hasOwnProperty(this.params.topojsonObjectName)) {
        new Error(`No ${this.params.topojsonObjectName} property in objects`);
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
    this.camera.position.set(0, 200, 200);

    // レイヤを設定
    this.camera.layers.enable(0); // enabled by default
    this.camera.layers.enable(1); // 1: landmark
    this.camera.layers.enable(2); // 2: scale

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
    const axesHelper = new THREE.AxesHelper(this.params.zSize);
    this.scene.add(axesHelper);

    // 環境光
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));

    // ディレクショナルライト
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.7);
    directionalLight.position.set(-this.params.zSize / 2, 0, 0);
    this.scene.add(directionalLight);

    // 正規化したマウス座標を保存
    this.mousePosition = new THREE.Vector2();
    this.previousMousePosition = new THREE.Vector2();
    this.renderer.domElement.addEventListener("mousemove", (event) => {
      this.mousePosition.x = (event.clientX / this.sizes.width) * 2 - 1;
      this.mousePosition.y = -(event.clientY / this.sizes.height) * 2 + 1;
    }, false);

    // ラベル表示に利用するCSS2DRendererを初期化
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
      .add(this.params, "pointSize")
      .name(navigator.language.startsWith("ja") ? "ポイントサイズ" : "pointSize")
      .min(0.1)
      .max(1.0)
      .step(0.1)
      .onChange((value) => {
        this.pointMeshList.forEach((pointMesh) => {
          pointMesh.material.size = value;
        });
      });

    gui
      .add(this.params, "maxAreaPoints")
      .name(navigator.language.startsWith("ja") ? "四分木分割するしきい値点数" : "maxAreaPoints")
      .min(4)
      .max(10)
      .step(1)
      .onFinishChange(() => {
        doLater(this.initContents, 100);
      });

    gui
      .add(this.params, "quadtreeDepth")
      .name(navigator.language.startsWith("ja") ? "表示対象の四分木の深さ" : "quadtreeDepth")
      .min(0)
      .max(6)
      .step(1)
      .onFinishChange(() => {
        doLater(this.initContents, 100);
      });

    const displayFolder = gui.addFolder(navigator.language.startsWith("ja") ? "表示切り替え" : "Display");

    const displayParams = {
      'wireframe': () => {
        this.params.wireframe = !this.params.wireframe;
        this.terrainMeshList.forEach((terrainMesh) => {
          terrainMesh.material.wireframe = this.params.wireframe;
        });
      },

      'pointCloud': () => {
        this.params.showPointCloud = !this.params.showPointCloud;
        this.pointMeshList.forEach((pointMesh) => {
          pointMesh.visible = this.params.showPointCloud;
        });
      },

      'landmark': () => {
        this.params.showLandmarks = !this.params.showLandmarks;
        this.camera.layers.toggle(1);
      },

      'scale': () => {
        this.params.showScale = !this.params.showScale;
        this.camera.layers.toggle(2);
      },
    };

    displayFolder
      .add(displayParams, "wireframe")
      .name(navigator.language.startsWith("ja") ? "ワイヤーフレーム表示" : "wireframe");

    displayFolder
      .add(displayParams, "pointCloud")
      .name(navigator.language.startsWith("ja") ? "ポイントクラウド表示" : "showPointCloud");

    displayFolder
      .add(displayParams, 'landmark')
      .name(navigator.language.startsWith("ja") ? "ランドマーク表示" : "show landmark");

    displayFolder
      .add(displayParams, 'scale')
      .name(navigator.language.startsWith("ja") ? "縮尺表示" : "show scale");

    // 画面が小さい場合は初期状態で閉じた状態にする
    if (window.matchMedia('(max-width: 640px)').matches) {
      gui.close();
    }

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
      this.renderCompass();
    }

    this.renderParams.delta %= this.renderParams.interval;
  }


  stop = () => {
    if (this.renderParams.animationId) {
      cancelAnimationFrame(this.renderParams.animationId);
    }
    this.renderParams.animationId = null;
  }


  __OLD__clearScene = () => {
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


  clearScene = () => {
    const removeObject = (object) => {
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
    };

    this.pointMeshList.forEach(object => {
      removeObject(object);
    });

    this.terrainMeshList.forEach(object => {
      removeObject(object);
    });
  }


  onWindowResize = (event) => {
    this.sizes.width = this.container.clientWidth;
    this.sizes.height = this.container.clientHeight;

    this.camera.aspect = this.sizes.width / this.sizes.height;
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.sizes.width, this.sizes.height);

    // CSS2DRendererにもサイズを反映する
    this.cssRenderer.setSize(this.sizes.width, this.sizes.height);
  };


  initQuadTree = () => {

    // 最大の分割数
    Quadtree.MAX_DIVISION = this.params.maxQuadtreeDepth;

    // 領域内に含まれる最大の点の数、これを超えていたらさらに小さく分割する
    Quadtree.MAX_AREA_POINTS = this.params.maxAreaPoints;

    // X軸 = Longitude(経度)、Z軸 = Latitude(緯度)
    const bounds = {
      x1: this.params.minX,  // 最小のX座標(lon)
      z1: this.params.minZ,  // 最小のZ座標(lat)
      x2: this.params.maxX,  // 最大のX座標(lon)
      z2: this.params.maxZ   // 最大のZ座標(lat)
    }

    // ルート領域を作成
    const quadtree = new Quadtree(bounds);

    // depthMapDataは配列で、各要素は以下のようなオブジェクト
    // [ {lat: 67.88624331335313, lon: -81.94761236723025, depth: -21.1785}, {...}, ... ]
    this.params.depthMapData.forEach((d) => {
      quadtree.insert(d);
    });

    // インスタンス変数に保存
    this.quadtree = quadtree;
  }


  initDelaunay = () => {

    // 作成するポイントクラウドのリスト
    const pointMeshList = [];

    // 作成するメッシュのリスト
    const terrainMeshList = [];

    // この深さの四分木ノードを取得して表示する
    const quadtreeDepth = this.params.quadtreeDepth;

    // 指定されている深さの四分木ノードを取得して、
    const quadtreeNodesAtDepth = this.quadtree.getNodesAtDepth(quadtreeDepth);

    // 作成するポイントクラウドのポイント数
    this.params.pointCount = 0;

    // その四分木ノードの中にあるリーフノードに関して、
    quadtreeNodesAtDepth.forEach((quadtreeNodeAtDepth) => {

      // リーフノードの一覧を取得
      const quadtreeLeafNodes = quadtreeNodeAtDepth.getLeafNodes();

      // 位置を保存するVector3の配列
      const positions = [];

      // 頂点カラーの配列
      const colors = [];

      quadtreeLeafNodes.forEach((quadtreeNode) => {

        if (quadtreeNode.points.length < 1) {
          // エリア内に点がない場合は無視する
          return;
        }

        if (quadtreeNode.points.length <= 2) {
          // エリア内に点が2個以下の場合は、その点を採用する
          for (let i = 0; i < quadtreeNode.points.length; i++) {
            const point = quadtreeNode.points[i];

            // 頂点の位置
            positions.push(new THREE.Vector3(point.x, point.y, point.z));

            // 頂点の色
            const color = this.getDepthColor(point.depth);
            colors.push(color.r, color.g, color.b);

            this.params.pointCount++;
          }
          return;
        }

        // それ以上の場合は、領域の中央値を採用してポイント数を削減する

        const bounds = quadtreeNode.bounds;
        const centerX = (bounds.x1 + bounds.x2) / 2;
        const centerZ = (bounds.z1 + bounds.z2) / 2;

        // エリア内の点の深さの平均値を計算する
        // const depth = quadtreeNode.points.reduce((acc, cur) => acc + cur.depth, 0) / quadtreeNode.points.length;

        // 逆距離加重法 IDW (Inverse Distance Weighting)を使って深さの平均値を計算する
        const depth = this.calcIDW(centerX, centerZ, quadtreeNode.points);

        // Y座標に変換
        const y = this.translateDepth(depth);

        // 頂点の位置
        positions.push(new THREE.Vector3(centerX, y, centerZ));

        // 頂点の色
        const c = this.getDepthColor(depth);

        // colors配列にRGBを格納
        colors.push(c.r, c.g, c.b);

        this.params.Count++;

      });

      // そのレベルの四分木ノードには頂点が存在しないこともある
      if (positions.length < 1) {
        return;
      }

      // ポイントクラウドのジオメトリを作成
      const geometry = new THREE.BufferGeometry().setFromPoints(positions);

      // 頂点カラーを設定
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

      // マテリアルを作成
      const pointsMaterial = new THREE.PointsMaterial({
        color: 0x99ccff,
        size: this.params.pointSize,
      });

      // 点群を作成
      const pointMesh = new THREE.Points(geometry, pointsMaterial);

      // 画面表示するかどうか
      pointMesh.visible = this.params.showPointCloud;

      // シーンに追加
      this.scene.add(pointMesh);

      // インスタンス変数に保存（guiで表示を操作するため）
      pointMeshList.push(pointMesh);

      // XZ平面でデローネ三角形を形成する
      const delaunay = Delaunator.from(
        positions.map(v => {
          return [v.x, v.z];
        })
      );

      // デローネ三角形のインデックスをmeshIndexに代入してThree.jsのインデックスに変換
      const meshIndex = [];
      for (let i = 0; i < delaunay.triangles.length; i += 3) {
        const a = delaunay.triangles[i + 0];
        const b = delaunay.triangles[i + 1];
        const c = delaunay.triangles[i + 2];
        meshIndex.push(a, b, c);
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

    // console.log(`${pointCount} points are created`);
    document.getElementById('debugContainer').textContent = `${this.params.pointCount.toLocaleString()} displayed points / ${this.params.totalPointCount.toLocaleString()} total points`;

    // インスタンス変数に保存
    this.pointMeshList = pointMeshList;
    this.terrainMeshList = terrainMeshList;
  }


  calcIDW = (x, z, points) => {
    // 逆距離加重法 IDW (Inverse Distance Weighting)
    // https://en.wikipedia.org/wiki/Inverse_distance_weighting

    // 逆距離の総和
    let sumInvDist = 0;

    // 逆距離の重み付き深さの総和
    let sumWeightedDepth = 0;

    // 逆距離の重み付き深さを計算
    points.forEach((point) => {
      const dist = Math.sqrt((x - point.x) ** 2 + (z - point.z) ** 2);
      const invDist = 1 / dist;
      sumInvDist += invDist;
      sumWeightedDepth += invDist * point.depth;
    });

    // 逆距離加重法 IDW (Inverse Distance Weighting)で深さを計算
    const depth = sumWeightedDepth / sumInvDist;

    return depth;
  }


  depthSteps = [
    1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 25, 30, 35, 40, 45, 50, 55, 60
  ];

  depthColors = {
    '1': new THREE.Color(0xff820b),
    '2': new THREE.Color(0xff9b16),
    '3': new THREE.Color(0xfeb321),
    '4': new THREE.Color(0xfecc2c),
    '5': new THREE.Color(0xfee437),
    '6': new THREE.Color(0xfdfb41),
    '8': new THREE.Color(0xd9ed4c),
    '10': new THREE.Color(0xb4df56),
    '12': new THREE.Color(0x90d366),
    '16': new THREE.Color(0x45ccb5),
    '20': new THREE.Color(0x01c5fc),
    '25': new THREE.Color(0x01aafc),
    '30': new THREE.Color(0x008ffd),
    '35': new THREE.Color(0x0075fd),
    '40': new THREE.Color(0x045ef9),
    '45': new THREE.Color(0x1f47de),
    '50': new THREE.Color(0x3b31c3),
    '55': new THREE.Color(0x451e9f),
    '60': new THREE.Color(0x2e146a),
  }


  getDepthColor = (depth) => {
    for (let i = 0; i < this.depthSteps.length; i++) {
      if (depth <= this.depthSteps[i]) {
        return this.depthColors[this.depthSteps[i]];
      }
    }
    return this.depthColors[this.depthSteps[this.depthSteps.length - 1]];
  }


  initLegend = () => {
    const legendContainer = document.getElementById('legendContainer');

    const depthSteps = this.depthSteps;

    for (let i = 0; i < depthSteps.length; i++) {
      const depth = depthSteps[i];

      // 水深に応じた色を取得
      const color = this.getDepthColor(depth);

      // divを作成
      const legendItem = document.createElement('div');

      // divにCSSクラス legend-item を設定
      legendItem.className = 'legend-item';

      // 水深に応じたidを設定して、あとから取り出せるようにする
      legendItem.id = `legend-${depth}`;

      const colorBox = document.createElement('div');
      colorBox.className = 'legend-color';
      colorBox.style.backgroundColor = `#${color.getHexString()}`;

      const label = document.createElement('span');
      label.textContent = `${depth}m`;

      legendItem.appendChild(colorBox);
      legendItem.appendChild(label);
      legendContainer.appendChild(legendItem);
    }
  }


  updateLegendHighlight = (depth) => {
    this.clearLegendHighlight();

    const depthSteps = this.depthSteps;

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


  initMap = () => {
    // topojsonデータからシェイプを作成
    const shapes = this.createShapesFromTopojson(this.params.topojsonData, this.params.topojsonObjectName);

    // シェイプの配列からメッシュを作成
    this.createMeshFromShapes(shapes);
  }


  createShapesFromTopojson = (topojsonData, objectName) => {

    // Shapeを格納する配列
    const shapes = [];

    // GeoJSONに変換
    const geojsonData = topojson.feature(topojsonData, topojsonData.objects[objectName]);

    // GeoJSONは別途利用するかもしれないのでparamsに保存しておく？
    // （現時点では使ってない）
    // this.params.geojsonData = geojsonData;

    // FeatureCollectionからFeatureを取り出す
    const features = geojsonData.features;

    // featureを一つずつ取り出す
    features.forEach(feature => {

      // featureのGeometryタイプがLineStringの場合
      if (feature.geometry.type === 'LineString') {
        const shape = new THREE.Shape();

        const coordinates = feature.geometry.coordinates;

        let coords;
        coords = coordinates[0];
        coords = this.translateCoordinates(coords);

        // パスを開始
        shape.moveTo(
          coords[0],
          coords[1]
        );

        for (let i = 1; i < coordinates.length; i++) {
          coords = coordinates[i];
          coords = this.translateCoordinates(coords);

          // 線分を追加
          shape.lineTo(
            coords[0],
            coords[1]
          );
        }

        shapes.push(shape);
      }

      // featureのGeometryタイプがPolygonの場合
      else if (feature.geometry.type === 'Polygon') {
        const shape = new THREE.Shape();

        const coordinates = feature.geometry.coordinates[0];

        let coords;
        coords = coordinates[0];
        coords = this.translateCoordinates(coords);

        shape.moveTo(
          coords[0],
          coords[1]
        );

        for (let i = 1; i < coordinates.length; i++) {
          coords = coordinates[i];
          coords = this.translateCoordinates(coords);
          shape.lineTo(
            coords[0],
            coords[1]
          );
        }

        shapes.push(shape);
      }

      // featureのGeometryタイプがMultiPolygonの場合
      else if (feature.geometry.type === 'MultiPolygon') {
        feature.geometry.coordinates.forEach(polygon => {
          const shape = new THREE.Shape();
          const coordinates = polygon[0];

          let coords;
          coords = coordinates[0];
          coords = this.translateCoordinates(coords);

          shape.moveTo(
            coords[0],
            coords[1]
          );

          for (let i = 1; i < coordinates.length; i++) {
            coords = coordinates[i];
            coords = this.translateCoordinates(coords);
            shape.lineTo(
              coords[0],
              coords[1]
            );
          }

          shapes.push(shape);
        });
      }

    });

    return shapes;
  }


  createMeshFromShapes = (shapes) => {
    // ExtrudeGeometryに渡すdepthパラメータ（厚み）
    const depth = 1.0;

    // ExtrudeGeometryで厚みを持たせる
    const geometry = new THREE.ExtrudeGeometry(shapes, {
      depth: depth,
      bevelEnabled: true,   // エッジを斜めにする
      bevelSize: 0.5,       // 斜めのサイズ
      bevelThickness: 0.5,  // 斜めの厚み
      bevelSegments: 1,     // 斜めのセグメント数
    });

    // XZ平面化
    // 回転の向きに注意！
    // Lat方向（Z軸方向）の座標をマイナスに正規化しているので、奥側に倒すように回転させる
    // つまり、画面には裏面が見えている
    geometry.rotateX(Math.PI / 2);

    // 地図は大きすぎるので海底地形図の倍の大きさになるようにクリッピングする
    const clippingSize = this.params.zSize;

    // マテリアル、ここでは適当にMeshStandardMaterialを使う
    const material = new THREE.MeshStandardMaterial({
      color: 0xf0f0f0,

      // 透明にしない
      // transparent: true,
      // depthWrite: false,
      // opacity: 0.9,

      // クリッピングして表示領域を制限する
      clippingPlanes: [
        new THREE.Plane(new THREE.Vector3(0, 0, 1), clippingSize * 2),   // Z座標がzSize * 2以下を表示
        new THREE.Plane(new THREE.Vector3(0, 0, -1), clippingSize * 2),  // Z座標が-zSize * 2以上を表示
        new THREE.Plane(new THREE.Vector3(-1, 0, 0), clippingSize),      // X座標がzSize以下を表示
        new THREE.Plane(new THREE.Vector3(1, 0, 0), clippingSize),       // X座標が-zSize以上を表示
        new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),                  // Y座標が0以上を表示
      ],
    });

    // メッシュ化
    const mesh = new THREE.Mesh(geometry, material);

    // シーンに追加
    this.scene.add(mesh);
  }


  renderDepth = () => {
    // 前フレーム時点でのマウス位置から変わっていないなら処理をスキップ
    if (this.mousePosition.equals(this.previousMousePosition)) {
      return;
    }

    // 前フレーム時点のマウス位置を更新
    this.previousMousePosition.copy(this.mousePosition);

    // レイキャストを使用してマウスカーソルの位置を取得
    this.raycaster.setFromCamera(this.mousePosition, this.camera);

    // 海底地形図のメッシュを対象にレイキャストを行う
    // const intersects = this.raycaster.intersectObject(this.terrainMesh);

    // シーン全体を対象にレイキャストを行う
    const intersects = this.raycaster.intersectObject(this.scene, true);

    if (intersects.length > 0) {
      const intersect = intersects[0];

      // Y座標の値から水深データを取得
      const depth = this.inverseTranslateDepth(intersect.point.y);

      // 緯度経度を取得
      const x = intersect.point.x;
      const z = intersect.point.z;
      const [lon, lat] = this.inverseTranslateCoordinates([x, z]);

      if (depth >= 0) {
        this.depthContainer.textContent = `Depth: ${depth.toFixed(1)}m`;
        this.coordinatesContainer.textContent = `${lon.toFixed(8)}, ${lat.toFixed(8)}`;

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


  initCompass = () => {
    // 方位磁針を表示するコンテナ要素
    this.compassContainer = document.getElementById('compassContainer');
    this.compassContainer.style.display = this.params.showCompass ? 'block' : 'none';

    // 方位磁針を表示する要素
    this.compassElement = document.getElementById('compass');

    // カメラの向きを保存するVector3
    this.cameraDirection = new THREE.Vector3();

    // 前フレーム時点のカメラの向きを保存するVector3
    this.previousCameraDirection = new THREE.Vector3();
  }


  renderCompass = () => {
    if (this.params.showCompass === false || !this.compassElement) {
      return;
    }

    // カメラの向きを取得
    this.camera.getWorldDirection(this.cameraDirection);

    // 前フレーム時点のカメラの向きと変更がなければ処理をスキップ
    if (this.cameraDirection.equals(this.previousCameraDirection)) {
      return;
    }

    // 前回のカメラの向きを更新
    this.previousCameraDirection.copy(this.cameraDirection);

    // カメラの方向を方位磁針の回転角度に変換
    const angle = Math.atan2(this.cameraDirection.x, this.cameraDirection.z);
    const degrees = THREE.MathUtils.radToDeg(angle) + 180;  // 0度が北を向くように調整

    // 方位磁針の回転を更新
    this.compassElement.style.transform = `rotate(${degrees}deg)`;
  }


  initLandmarks = () => {
    const LAYER = 1;  // ランドマークを表示するレイヤー

    this.params.landmarks.forEach((landmark) => {

      // 緯度経度をThree.jsのワールド座標に変換
      let [x, z] = this.translateCoordinates([landmark.lon, landmark.lat]);

      // Y座標はその場所の真上になるように設定
      const position = new THREE.Vector3(x, this.params.labelY, z);

      // CSS2DRendererを使用してラベルを作成
      const div = document.createElement('div');
      div.className = 'landmark-label';
      div.textContent = (navigator.language.startsWith('ja') && 'name_ja' in landmark) ? landmark.name_ja : landmark.name || '';
      const cssObject = new CSS2DObject(div);

      cssObject.position.copy(position);
      cssObject.layers.set(LAYER);
      // cssObject.center.x = 0;  // 1にすると右に寄る
      cssObject.center.y = 1;     // 1にすると上に寄る
      this.scene.add(cssObject);

      // ラインを作成
      const material = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      });
      const points = [];
      points.push(new THREE.Vector3(x, landmark.depth, z));
      points.push(new THREE.Vector3(x, position.y, z));
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geometry, material);

      // ラインを表示するレイヤーを設定
      line.layers.set(LAYER);

      // 初期状態で表示するかどうか
      if (this.params.showLandmarks) {
        this.camera.layers.enable(LAYER);
      } else {
        this.camera.layers.disable(LAYER);
      }

      this.scene.add(line);
    });
  }


  initScale = () => {
    const LAYER = 2;  // 縮尺を表示するレイヤー

    const EARTH_RADIUS_KM = 6371; // 地球の半径（km）
    const kmToRadians = 1 / (EARTH_RADIUS_KM * Math.PI / 180); // 1kmをラジアンに変換
    const kmToDisplayLength = kmToRadians * this.params.zScale;

    // ラインのマテリアル
    const material = new THREE.LineBasicMaterial({ color: 0xffffff });

    // 開始点は原点からちょっと浮かせる（地図が厚みを持っているため）
    const start = new THREE.Vector3(0, 1.1, 0);

    // 横線を追加
    {
      const end = new THREE.Vector3(kmToDisplayLength, 1.1, 0);
      const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
      const line = new THREE.Line(geometry, material);
      line.layers.set(LAYER);
      this.scene.add(line);

      // 100mごとの目印を追加
      for (let i = 1; i <= 10; i++) {
        const markerPosition1 = new THREE.Vector3(i * kmToDisplayLength / 10, 1.1, 0);
        const markerPosition2 = new THREE.Vector3(markerPosition1.x, markerPosition1.y + 1, markerPosition1.z)
        const markerGeometry = new THREE.BufferGeometry().setFromPoints([markerPosition1, markerPosition2]);
        const markerLine = new THREE.Line(markerGeometry, material);
        markerLine.layers.set(LAYER);
        this.scene.add(markerLine);
      }

      // ラベルを追加
      const div = document.createElement('div');
      div.className = 'scale-label';
      div.textContent = '1km';
      const cssObject = new CSS2DObject(div);

      cssObject.position.copy(end);
      cssObject.position.y = 4;
      cssObject.layers.set(LAYER);
      this.scene.add(cssObject);
    }


    // 縦線を追加
    {
      const end = new THREE.Vector3(0, 1.1, kmToDisplayLength);
      const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
      const line = new THREE.Line(geometry, material);
      line.layers.set(LAYER);
      this.scene.add(line);

      // 100mごとの目印を追加
      for (let i = 1; i <= 10; i++) {
        const markerPosition1 = new THREE.Vector3(0, 1.1, i * kmToDisplayLength / 10);
        const markerPosition2 = new THREE.Vector3(markerPosition1.x, markerPosition1.y + 1, markerPosition1.z)
        const markerGeometry = new THREE.BufferGeometry().setFromPoints([markerPosition1, markerPosition2]);
        const markerLine = new THREE.Line(markerGeometry, material);
        markerLine.layers.set(LAYER);
        this.scene.add(markerLine);
      }

      // ラベルを追加
      const div = document.createElement('div');
      div.className = 'scale-label';
      div.textContent = '1km';
      const cssObject = new CSS2DObject(div);
      cssObject.position.copy(end);
      cssObject.position.y = 4;
      cssObject.layers.set(LAYER);
      this.scene.add(cssObject);
    }

    if (this.params.showScale) {
      this.camera.layers.enable(LAYER);
    } else {
      this.camera.layers.disable(LAYER);
    }

  }

}


class QuadtreeNode {
  //
  // 四分木の領域を表すオブジェクト
  //

  // 前提条件
  // ポイントのオブジェクトにはキー {x, z} が含まれること
  // X軸 = Longitude(経度)、Z軸 = Latitude(緯度)

  // 前提条件
  // 領域を表すオブジェクトにはキー {x1, z1, x2, z2} が含まれること
  bounds;

  // 階層の深さ
  depth;

  // ポイントデータを格納する配列
  points;

  // 子の領域ノードの配列（子は４つ）
  children;

  // 親ノードへの参照
  parent;

  constructor(bounds, depth = 0, parent = null) {
    this.bounds = bounds;
    this.depth = depth;
    this.points = [];
    this.children = [];
    this.parent = parent;
  }

  isLeaf() {
    return this.children.length === 0;
  }

  subdivide() {
    const { x1, z1, x2, z2 } = this.bounds;
    const midX = (x1 + x2) / 2;
    const midZ = (z1 + z2) / 2;

    // このノードを四分木で分割する
    // children配列に以下の順に追加する
    //  +---+---+ x
    //  | 0 | 1 |
    //  +---+---+
    //  | 2 | 3 |
    //  +---+---+
    //  z

    this.children.push(new QuadtreeNode({ x1: x1, z1: z1, x2: midX, z2: midZ }, this.depth + 1, this));
    this.children.push(new QuadtreeNode({ x1: midX, z1: z1, x2: x2, z2: midZ }, this.depth + 1, this));
    this.children.push(new QuadtreeNode({ x1: x1, z1: midZ, x2: midX, z2: z2 }, this.depth + 1, this));
    this.children.push(new QuadtreeNode({ x1: midX, z1: midZ, x2: x2, z2: z2 }, this.depth + 1, this));
  }

  insert(point) {
    if (!this.contains(point)) {
      return false;
    }

    if (this.isLeaf()) {
      if (this.points.length < Quadtree.MAX_AREA_POINTS || this.depth >= Quadtree.MAX_DEPTH) {
        // ポイントから四分木ノードを辿れるように参照を設定
        point.quadtreeNode = this;
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
    const { x1, z1, x2, z2 } = this.bounds;
    return point.x >= x1 && point.x < x2 && point.z >= z1 && point.z < z2;
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
    const { x1, z1, x2, z2 } = this.bounds;
    return !(range.x1 > x2 || range.x2 < x1 || range.z1 > z2 || range.z2 < z1);
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
    const bounds = { x1: 0, z1: 0, x2: 100, z2: 100 };
    const quadtree = new Quadtree(bounds);

    const points = [
      { x: 10, z: 10 },
      { x: 20, z: 20 },
      { x: 30, z: 30 },
      { x: 40, z: 40 },
      { x: 50, z: 50 },
    ];

    points.forEach(point => quadtree.insert(point));

    const nodesAtDepth2 = quadtree.getNodesAtDepth(2);
    console.log(nodesAtDepth2);
  */

  static MAX_DIVISION = 10;
  static MAX_AREA_POINTS = 5;

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
