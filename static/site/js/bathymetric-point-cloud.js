import * as THREE from "three";
import { MapControls } from "three/controls/MapControls.js";
import { TrackballControls } from "three/controls/TrackballControls.js";

// stats.js
import Stats from "three/libs/stats.module.js";

// lil-gui
import { GUI } from "three/libs/lil-gui.module.min.js";

// rbush-4.0.1 を使う場合
// rbushは内部でquickselectを使用しているので、HTML側でimportmapを設定する
// import rbush from "rbush";
/*
<script type="importmap">
  {
    "imports": {
      "quickselect": "./static/libs/quickselect-3.0.0/index.js",
      "kdbush": "./static/libs/kdbush-4.0.2/index.js"
    }
  }
</script>
*/

// kdbush-4.0.2
import KDBush from "kdbush";

// デローネ三角形
import Delaunator from "delaunatorjs";

/*
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

// 500mメッシュ海底地形データ
// J-EGG500:JODC-Expert Grid data for Geography
//
// https://www.jodc.go.jp/vpage/depth500_file_j.html
//
// このサイトで領域を選択してダウンロードできる

// タイルローディングで表示できないかな？
// https://github.com/tentone/geo-three


export class Main {

  // Three.jsを表示するコンテナのHTML DIV要素
  container;

  // そのコンテナのサイズ（自動調整）
  sizes = {
    width: 0,
    height: 0
  }

  // 水深を表示するHTML DIV要素
  depthContainer;

  // 緯度経度を表示するHTML DIV要素
  coordinatesContainer;

  // 方位磁針を表示するHTML要素
  compassElement;

  // Three.jsの各種インスタンス
  scene;
  camera;
  renderer;
  mapControls;
  trackballControls;
  statsjs;

  // マウス位置にあるオブジェクトを取得するためのraycaster
  raycaster = new THREE.Raycaster();

  // マウス座標
  mousePosition = new THREE.Vector2();

  // マウス座標（1フレーム前）
  previousMousePosition = new THREE.Vector2();

  // カメラの向き
  cameraDirection = new THREE.Vector3();

  // カメラの向き（1フレーム前）
  previousCameraDirection = new THREE.Vector3();

  // レンダリング用のパラメータ
  renderParams = {
    animationId: null,
    clock: new THREE.Clock(),
    delta: 0,
    interval: 1 / 30,  // = 30fps
  }

  // KDBushインスタンス
  kdbush = null;


  params = {

    // topojsonファイルのパス
    topojsonPath: "./static/data/japan.topojson",

    // topojsonデータ
    topojsonData: null,

    // topojsonデータのobjectName
    topojsonObjectName: "japan",

    // 地図の中心の緯度経度
    centerLon: 139.9,
    centerLat: 35.3,

    // 描画する地図のlatの範囲（関東地方くらい）
    latWidth: 2.18,  // 度 34.67083～36.84629

    // latWidthをThree.jsのz座標のどの範囲に対応付けるか
    // 800を指定する場合は -400～400 の範囲に描画する
    zWidth: 800,

    // zWidthに合わせるために、どのくらい緯度の値を拡大するか（自動計算）
    zScale: 1,

    // xScaleは表示対象物の緯度によって倍率が変わるので zScale * Math.cos(緯度) になる（自動計算）
    xScale: 1,

    // 水深をどのくらいの高さに描画するか
    // 300を指定する場合は 0 ～ -300 の範囲に描画する
    yWidth: 300,

    // 最も深い水深に合わせてY座標をどのくらい拡大するか（固定）
    // おおよそ最大で6000mの水深があるので、6000mをY座標の-300に対応付ける
    yScale: 300 / 6000,

    // 水深データのテキストファイルのURL
    depthMapPath: "./static/data/mesh500_kanto.txt",

    // テキストをパースしたデータを格納する配列
    depthMapDatas: {},

    // ポイントクラウドのパーティクルサイズ
    pointSize: 1.0,

    // ポイントクラウドのパーティクルの数(readonly)
    pointCount: 0,

    // 緯度経度をグリッド状に走査するときの単位ステップ（自動計算）
    // おおよそ500メートル間隔にする
    gridLatStep: 0,
    gridLonStep: 0,

    // グリッドを走査するときに、単位ステップを何倍するか
    // おおよそ500メートル x gridScale の範囲でデータを取得する
    // 元データが500メートル間隔なので、2.0にするとデータ数は半減する
    gridScale: 1.0,

    // ワイヤフレームとして表示するかどうか
    wireframe: false,
  }

  // Prefectureクラスのインスタンスを格納する配列
  prefectures = [];

  // 見えてるPrefectureクラスのインスタンスを格納する配列
  visiblePrefectures = [];

  // 地形図のポイントクラウド（guiで表示を操作するためにインスタンス変数にする）
  pointMeshList = [];

  // 地形図のメッシュ（guiで表示を操作するためにインスタンス変数にする）
  terrainMeshList = [];



  constructor(params = {}) {
    this.params = Object.assign(this.params, params);
    this.init();
  }



  init = async () => {

    // topojsonデータを読み込む
    await this.loadTopojson(this.params.topojsonPath);

    if (this.params.topojsonData === null) {
      return;
    }

    // scene, camera, renderer, controlsを初期化
    this.initThreejs();

    // stats.jsを初期化
    this.initStatsjs();

    // lil-guiを初期化
    this.initGui();

    // topojsonデータから地図を表示
    this.initMap();

    // 色の凡例を初期化
    this.initLegend();

    // コンテンツを初期化
    this.initContents();
  }


  initThreejs = () => {

    // Three.jsを表示するHTML DIV要素
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

    // シーン
    this.scene = new THREE.Scene();

    // カメラ
    this.camera = new THREE.PerspectiveCamera(
      60,
      this.sizes.width / this.sizes.height,
      1,
      10000
    );
    this.camera.position.set(0, this.params.zWidth / 4, 0);

    // レンダラ
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // コンテナにレンダラを追加
    this.container.appendChild(this.renderer.domElement);

    // コントローラ
    this.mapControls = new MapControls(this.camera, this.renderer.domElement);
    this.mapControls.enableDamping = true;
    this.mapControls.dampingFactor = 0.25;

    // カメラの視線が斜めになっているときにズームすると前後方向の回転動作が加わるので無効にする
    this.mapControls.enableZoom = false;

    // 回転角度を制限
    this.mapControls.minPolarAngle = 0;           // 上方向の制限
    this.mapControls.maxPolarAngle = Math.PI / 4; // 下方向の制限
    this.mapControls.minAzimuthAngle = 0;         // 左方向の制限　常時ノースアップ
    this.mapControls.maxAzimuthAngle = 0;         // 右方向の制限　常時ノースアップ

    // カメラの移動範囲を制限する
    this.mapControls.addEventListener('change', () => {
      const minX = -this.params.zWidth;
      const maxX = this.params.zWidth;
      const minZ = -this.params.zWidth;
      const maxZ = this.params.zWidth;

      const target = this.mapControls.target;
      target.x = Math.max(minX, Math.min(maxX, target.x));
      target.z = Math.max(minZ, Math.min(maxZ, target.z));
      this.mapControls.target = target;

      const position = this.camera.position;
      position.x = Math.max(minX, Math.min(maxX, position.x));
      position.z = Math.max(minZ, Math.min(maxZ, position.z));
      this.camera.position.set(position.x, position.y, position.z);
    });

    // mapControlsのendイベントにリスナーを追加
    this.mapControls.addEventListener('end', () => {
      this.updateVisiblePrefectures();
    });

    // ズーム動作はTrackballControlsで行う
    this.trackballControls = new TrackballControls(this.camera, this.renderer.domElement);
    this.trackballControls.noPan = true;
    this.trackballControls.noRotate = true;
    this.trackballControls.staticMoving = true;

    // ズームの範囲を制限
    this.trackballControls.minDistance = 200;   // 最小ズーム距離
    this.trackballControls.maxDistance = 1000;  // 最大ズーム距離

    this.trackballControls.addEventListener('end', () => {
      this.updateVisiblePrefectures();
    });

    // 軸を表示
    //
    //   Y(green)
    //    |
    //    +---- X(red)
    //   /
    //  Z(blue)
    //
    // const axesHelper = new THREE.AxesHelper(this.params.zWidth / 2);
    // this.scene.add(axesHelper);

    // 環境光
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));

    // resizeイベントでカメラのアスペクト比を更新
    window.addEventListener("resize", () => {
      this.sizes.width = this.container.clientWidth;
      this.sizes.height = this.container.clientHeight;

      this.camera.aspect = this.sizes.width / this.sizes.height;
      this.camera.updateProjectionMatrix();

      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.setSize(this.sizes.width, this.sizes.height);
    }, false);

    // mousemoveイベントで正規化したマウス座標を保存
    this.renderer.domElement.addEventListener("mousemove", (event) => {
      this.mousePosition.x = (event.clientX / this.sizes.width) * 2 - 1;
      this.mousePosition.y = -(event.clientY / this.sizes.height) * 2 + 1;
    }, false);

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


  initGui = () => {
    const guiContainer = document.getElementById("guiContainer");

    const gui = new GUI({
      container: guiContainer,
      width: 300,
    });

    gui
      .add(this.params, "pointSize")
      .name(navigator.language.startsWith("ja") ? "ポイントサイズ" : "pointSize")
      .min(0.1)
      .max(2.0)
      .step(0.1)
      .onFinishChange((value) => {
        this.pointMeshList.forEach((pointMesh) => {
          pointMesh.material.size = value;
        });
      });

    gui
      .add(this.params, "pointCount")
      .name(navigator.language.startsWith("ja") ? "ポイント数" : "pointCount")
      .listen()
      .disable();

    gui
      .add(this.params, "gridScale")
      .name(navigator.language.startsWith("ja") ? "グリッドスケール" : "gridScale")
      .listen()
      .min(1)
      .max(2)
      .step(0.1)
      .onFinishChange((value) => {
        this.initContents();
      });

    // 初期状態で閉じた状態にする
    // gui.close();
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
      this.mapControls.update();
      const target = this.mapControls.target;
      this.trackballControls.target.set(target.x, target.y, target.z);
      this.trackballControls.update();

      // シーンをレンダリング
      this.renderer.render(this.scene, this.camera);

      // 水深を表示
      // this.renderDepth();

      // 常時ノースアップで表示するので方位磁針は更新しなくてよい
      // this.renderCompass();
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


  initContents = () => {
    // アニメーションを停止
    this.stop();

    // シーン上のメッシュを削除する
    this.clearScene();

    // 全てを削除した状態で描画
    this.renderer.render(this.scene, this.camera);

    // ポイントクラウドを表示
    // this.createPointCloud();

    // フレーム毎の処理
    this.render();
  }


  async loadTopojson(path) {
    const loadingContainer = document.getElementById('loadingContainer');

    try {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`HTTP status: ${response.status}`);
      }

      // JSONデータを取得
      const jsonData = await response.json();

      if (!jsonData.hasOwnProperty('objects')) {
        new Error('No objects property in jsonData');
      }

      if (!jsonData.objects.hasOwnProperty(this.params.topojsonObjectName)) {
        new Error(`No ${this.params.topojsonObjectName} property in objects`);
      }

      // jsonデータを保存
      this.params.topojsonData = jsonData;

      // 初期状態で表示しているローディング画面を消す
      const loadingContainer = document.getElementById('loadingContainer');

      // 0.5秒後にフェードアウト
      const interval = setInterval(() => {
        loadingContainer.classList.add('fadeout');
        clearInterval(interval);
      }, 500);

      loadingContainer.addEventListener('transitionend', (event) => {
        event.target.remove();
      });

    } catch (error) {
      const errorMessage = `Error while loading data: ${error}`;
      console.error(errorMessage);
      let p = document.createElement('p');
      p.textContent = errorMessage;
      p.style.color = 'white';
      loadingContainer.appendChild(p);
    }

  }


  initMap = () => {

    // zWidthをlatWidthに合わせるためのスケールを計算
    this.params.zScale = this.params.zWidth / this.params.latWidth;

    // xScaleは地図の緯度によって倍率が変わり、zScale * Math.cos(centerLat) になる
    this.params.xScale = this.params.zScale * Math.cos(this.params.centerLat / 180 * Math.PI);

    // topojsonデータからPrefectureインスタンスを作成
    const prefectures = this.createPrefecturesFromTopojson(this.params.topojsonData, this.params.topojsonObjectName);

    // Prefectureインスタンスからメッシュを作成
    this.drawPrefectures(prefectures);

    // Prefectureインスタンスをインスタンス変数に保存
    this.prefectures = prefectures;

    // 初期状態で見えてるPrefectureインスタンスをインスタンス変数に保存
    this.updateVisiblePrefectures();

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
  inverseTranslateCoordinates = (x, z) => {
    return [
      x / this.params.xScale + this.params.centerLon,
      z / this.params.zScale * (-1) + this.params.centerLat
    ];
  }


  createPrefecturesFromTopojson = (jsonData, objectName) => {
    // Prefectureインスタンスを格納する配列
    const prefectures = [];

    // featureCollectionを取り出す
    const topoData = topojson.feature(jsonData, jsonData.objects[objectName]);
    const features = topoData.features;

    // console.log(features);
    // console.log(topojson.mesh(jsonData, jsonData.objects[objectName]));

    // topojsonのFeatureCollectionからFeatureを一つずつ取り出す
    // featureには一つの県の情報が格納されている
    features.forEach(feature => {
      prefectures.push(new Prefecture({
        feature: feature,
        translateCoordinates: this.translateCoordinates,
      }));
    });

    return prefectures;
  }


  drawPrefectures = (prefectures) => {
    prefectures.forEach(prefecture => {
      // メッシュをシーンに追加
      this.scene.add(prefecture.shapeMesh);

      // 線分をシーンに追加
      prefecture.lineSegments.forEach(line => {
        this.scene.add(line);
      });
    });
  }


  // 画面内に表示されているメッシュを調べるための視錐台のパラメータ
  frustumParams = {
    frustum: new THREE.Frustum(),
    cameraViewProjectionMatrix: new THREE.Matrix4(),
  }


  isInFrustum = (mesh) => {

    // 注意
    // カメラの位置が遠いと、視錐台の範囲が広がって true になりやすくなる

    // カメラの視錐台を取得
    const frustum = this.frustumParams.frustum;

    // 毎回、Matrix4を生成するのではなく、インスタンス変数を使い回す
    const cameraViewProjectionMatrix = this.frustumParams.cameraViewProjectionMatrix;

    // カメラのワールド行列を更新して位置と方向を最新化する
    this.camera.updateMatrixWorld();

    // カメラのワールド行列の逆行列を計算してビュー行列を正確に取得できるようにする
    this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert();

    // ビュー・プロジェクション行列を計算
    cameraViewProjectionMatrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);

    // 視錐台を設定
    frustum.setFromProjectionMatrix(cameraViewProjectionMatrix);

    // メッシュが視錐台内にあるかどうかを判定
    const inFrustum = frustum.intersectsObject(mesh);

    return inFrustum;
  }


  // 画面内に表示されている県を調べるメソッド
  updateVisiblePrefectures() {

    // 画面内に表示されている県のリストを取得
    const visiblePrefectures = this.prefectures.filter(prefecture => {
      return this.isInFrustum(prefecture.shapeMesh);
    });

    // 名前だけのリストを作成
    const visiblePrefectureNames = visiblePrefectures.map(prefecture => prefecture.nam);

    // データを同期する（新しい県はデータを取得、古い県はデータを削除）
    this.onUpdateVisiblePrefectures(visiblePrefectureNames);

  }


  onUpdateVisiblePrefectures = (visiblePrefectureNames) => {

    // データ取得が必要な県のリストを作成
    const needFetchPrefectures = Object.keys(this.prefectureNameToPath).filter(prefectureName => {
      return visiblePrefectureNames.includes(prefectureName) && !this.fetchedPrefectures[prefectureName] && !this.fetchInProgress[prefectureName];
    });

    if (needFetchPrefectures.length > 0) {
      console.log('needFetchPrefectures:', needFetchPrefectures);
      this.startFetchPrefectureData(needFetchPrefectures);
    }

    const needDeletePrefectures = Object.keys(this.prefectureNameToPath).filter(prefectureName => {
      return !visiblePrefectureNames.includes(prefectureName) && this.fetchedPrefectures[prefectureName];
    });

    if (needDeletePrefectures.length > 0) {
      console.log(`needDeletePrefectures: ${needDeletePrefectures}`);
      needDeletePrefectures.forEach(prefectureName => {
        delete this.fetchedPrefectures[prefectureName];
      });
    }

  }


  // 水深データを持つ県の名前とファイルパスの対応表
  prefectureNameToPath = {
    'Ibaraki Ken': './static/data/mesh500/ibaraki.txt',
    'Aichi Ken': './static/data/mesh500/aichi.txt',
    'Shizuoka Ken': './static/data/mesh500/shizuoka.txt',
    'Tokyo To': './static/data/mesh500/tokyo.txt',
    'Kanagawa Ken': './static/data/mesh500/kanagawa.txt',
    'Chiba Ken': './static/data/mesh500/chiba.txt',
  }


  // fetchした県の情報をキャッシュするオブジェクト
  fetchedPrefectures = {};

  // fetchの進行状態を管理するオブジェクト
  fetchInProgress = {};

  // 県の情報をfetchを開始するメソッド
  async startFetchPrefectureData(needFetchPrefectures) {
    const fetchPromises = needFetchPrefectures.map(async prefectureName => {
      this.fetchInProgress[prefectureName] = true;
      const path = this.prefectureNameToPath[prefectureName];

      try {
        const response = await fetch(path);
        if (!response.ok) {
          throw new Error(`HTTP status: ${response.status}`);
        }
        const data = await response.text();
        this.fetchedPrefectures[prefectureName] = data;
        this.onFetchComplete(prefectureName, data);
      } catch (error) {
        console.error(`${prefectureName}のデータのfetchに失敗しました:`, error);
      } finally {
        delete this.fetchInProgress[prefectureName];
      }
    });

    await Promise.all(fetchPromises);
  }

  onFetchComplete = (prefectureName, data) => {
    console.log(`${prefectureName}のデータのfetchが完了しました。`);
    // 必要な処理をここに追加
    console.log(`持っているデータ: ${Object.keys(this.fetchedPrefectures)}`);
  }


  loadText = async (path) => {
    const loadingContainer = document.getElementById('loadingContainer');

    try {

      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`HTTP status: ${response.status}`);
      }

      // テキストデータを取得
      const text = await response.text();

      // テキストデータをパースしてdepthMapDatas配列を作成
      this.parseText(text);

      // 読み取ったデータをThree.jsのワールド座標に変換
      this.translate();

      // kdbushでインデックス化
      this.initKDBush();

    } catch (error) {
      const errorMessage = `Error while loading ${path}: ${error}`;
      console.error(errorMessage);
      let p = document.createElement('p');
      p.textContent = errorMessage;
      p.style.color = 'white';
      loadingContainer.appendChild(p);
    }
  }


  parseText = (text) => {

    // データフォーマット
    // 種別（0または1）、緯度（単位：度）、経度（単位：度)、水深（単位：ｍ）
    // ・フォーマット[ I1、F10.5、F10.5、I6 ]
    // ・種別　　0： 計測水深または等深線から求めた水深、1： 補間処理により作成された水深
    // ・測地系は、世界測地系(WGS-84)を採用しています。

    // 行に分割
    const lines = text.split('\n');

    // データを格納する配列
    const datas = this.params.depthMapDatas;

    // 緯度経度の最大値、最小値を取得するための変数
    let minLat = 9999, minLon = 9999;
    let maxLat = -9999, maxLon = -9999;
    let maxDepth = -9999;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === '') {
        continue;
      }

      // 空白で区切られたテキストを分割
      const rows = line.split(/\s+/);

      if (rows.length === 4) {
        let lat = parseFloat(rows[1].trim());
        let lon = parseFloat(rows[2].trim());
        const depth = parseInt(rows[3].trim());

        // 最大の水深を調べる
        maxDepth = Math.max(maxDepth, depth);

        // 配列に格納する
        datas.push({ lon, lat, depth });
      }
    }

    // 何個のデータがあるか
    this.params.pointCount = datas.length;
    console.log(`point count: ${this.params.pointCount}`);

    // 最小値・最大値
    console.log(`minLat: ${minLat}\nmaxLat: ${maxLat}\nminLon: ${minLon}\nmaxLon: ${maxLon}`);
    console.log(`maxDepth: ${maxDepth}`);

    // 後から参照できるように保存しておく
    this.params.minLon = minLon;
    this.params.maxLon = maxLon;
    this.params.minLat = minLat;
    this.params.maxLat = maxLat;
    this.params.centerLon = (minLon + maxLon) / 2;
    this.params.centerLat = (minLat + maxLat) / 2;
    this.params.maxDepth = maxDepth;

    // 緯度の差分、経度の差分で大きい方を取得
    const diffSize = Math.max(maxLat - minLat, maxLon - minLon);

    // このdiffSizeがxzSizeになるように係数を計算
    this.params.xzScale = this.params.xzSize / diffSize;

    // 最も大きな水深がySizeになるように係数を計算
    this.params.yScale = this.params.yWidth / maxDepth;

    // 緯度1度あたりのメートル数は、どこでも111320m
    const metersPerDegreeLat = 111320;

    // 500メートル間隔の緯度の差分
    const latStep = 500 / metersPerDegreeLat;

    // 経度1度あたりのメートル数は、どの緯度にいるかによって変わるので
    // centerLatの緯度での1度あたりのメートル数を求める
    const metersPerDegreeLon = Math.cos(this.params.centerLat * Math.PI / 180) * metersPerDegreeLat;

    // 500メートル間隔の経度の差分
    const lonStep = 500 / metersPerDegreeLon;

    // 保存しておく
    this.params.gridLatStep = latStep;
    this.params.gridLonStep = lonStep;
  }


  translate = () => {
    let minX = 9999, minZ = 9999;
    let maxX = -9999, maxZ = -9999;
    let minY = 9999;

    // 全件取り出す
    this.params.depthMapDatas.forEach(d => {

      // lon, latをXZ座標に変換
      const [x, z] = this.translateCoordinates([d.lon, d.lat]);
      d.x = x;
      d.z = z;

      // depthをY座標に変換
      const y = this.translateDepth(d.depth);
      d.y = y;

      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
      minY = Math.min(minY, y);
    });

    this.params.minX = minX;
    this.params.maxX = maxX;
    this.params.minZ = minZ;
    this.params.maxZ = maxZ;
    this.params.minY = minY;
  }


  initKDBush = () => {
    this.kdbush = new KDBush(this.params.depthMapDatas.length);

    // データを投入
    this.params.depthMapDatas.forEach(d => {
      this.kdbush.add(d.lon, d.lat);
    });

    // インデックス化
    this.kdbush.finish();
  }


  getGridIndexList = (gridScale = 1.0) => {
    const indexList = [];

    // 緯度経度を左上から右下にかけて、latStep, lonStep間隔で走査する
    const lonStep = this.params.gridLonStep * gridScale;
    const latStep = this.params.gridLatStep * gridScale;

    for (let lat = this.params.minLat; lat <= this.params.maxLat; lat += latStep) {
      for (let lon = this.params.minLon; lon <= this.params.maxLon; lon += lonStep) {

        // 右下の領域にあるデータ（のインデックス）を取得
        const foundIds = this.kdbush.range(lon, lat, lon + lonStep, lat + latStep);

        // 陸地にはデータがないので、0件ならスキップ
        if (foundIds.length === 0) {
          continue;
        }

        // インデックスから実データの配列にするにはこう
        // const foundDatas = foundIds.map(i => this.params.depthMapDatas[i]);

        // 見つけたインデックスの配列を追加
        indexList.push(foundIds);
      }
    }

    return indexList;
  }





  __getFilesToLoad = (lon, lat) => {
    // 表示領域に基づいて必要なファイルを決定するロジックを実装
    const files = [];
    const lonIndex = Math.floor(lon);
    const latIndex = Math.floor(lat);
    files.push(`data/mesh/mesh_${latIndex}_${lonIndex}.txt`);
    return files;
  }


  __loadMeshFiles = async (lon, lat) => {
    // 表示領域に基づいて必要なファイルを決定
    const filesToLoad = this.getFilesToLoad(lon, lat);

    // ファイルをロードしてポイントクラウドを更新
    for (const file of filesToLoad) {
      await this.loadMeshData(file);
    }

    // ポイントクラウドを更新
    this.createPointCloud();
  }


  __loadMeshData = async (path) => {
    try {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`HTTP status: ${response.status}`);
      }

      // テキストデータを取得
      const text = await response.text();

      // テキストデータをパースして、depthMapDatas配列に追加
      this.parseText(text);

    } catch (error) {
      const errorMessage = `Error while loading ${path}: ${error}`;
      console.error(errorMessage);
    }
  }


  depthSteps = [
    10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 200, 500, 1000, 2000, 3000, 4000, 5000, 6000
  ];

  depthColors = {
    "10": new THREE.Color(0x00ffff),    // シアン
    "20": new THREE.Color(0x00ffcc),    // アクアマリン
    "30": new THREE.Color(0x00ff99),    // ミントグリーン
    "40": new THREE.Color(0x00ff66),    // スプリンググリーン
    "50": new THREE.Color(0x00ff33),    // ライムグリーン
    "60": new THREE.Color(0x00ff00),    // グリーン
    "70": new THREE.Color(0x33ff00),    // ライトグリーン
    "80": new THREE.Color(0x66ff00),    // イエローグリーン
    "90": new THREE.Color(0x99ff00),    // チャートリューズ
    "100": new THREE.Color(0xccff00),   // イエロー
    "200": new THREE.Color(0xffff00),   // ゴールド
    "500": new THREE.Color(0xffcc00),   // オレンジ
    "1000": new THREE.Color(0xff9900),  // ダークオレンジ
    "2000": new THREE.Color(0xff6600),  // オレンジレッド
    "3000": new THREE.Color(0xff3300),  // レッド
    "4000": new THREE.Color(0xff0000),  // ダークレッド
    "5000": new THREE.Color(0xcc0000),  // マルーン
    "6000": new THREE.Color(0x990000)   // ダークマルーン
  };


  getDepthColor(depth) {
    for (let i = 0; i < this.depthSteps.length; i++) {
      if (depth <= this.depthSteps[i]) {
        return this.depthColors[this.depthSteps[i]];
      }
    }
    return this.depthColors[this.depthSteps[this.depthSteps.length - 1]];
  }


  initLegend = () => {
    const legendContainer = document.getElementById('legendContainer');

    this.depthSteps.forEach((depth) => {

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



  // 水深をY座標に変換する
  translateDepth = (depth) => {
    return depth * this.params.yScale * (-1);
  }

  // Y座標から元の水深に戻す
  inverseTranslateDepth = (depth) => {
    return depth / this.params.yScale * (-1);
  }

  renderDepth = () => {
    // マウス位置が変わっていない場合は処理をスキップ
    if (this.mousePosition.equals(this.previousMousePosition)) {
      return;
    }

    // 前回のマウス位置を更新
    this.previousMousePosition.copy(this.mousePosition);

    // レイキャストを使用してマウスカーソルの位置を取得
    this.raycaster.setFromCamera(this.mousePosition, this.camera);

    // シーン全体を対象にレイキャストを行う
    const intersects = this.raycaster.intersectObject(this.scene, true);

    if (intersects.length > 0) {
      const intersect = intersects[0];

      // 水深データを取得
      const depth = this.inverseTranslateDepth(intersect.point.y);

      // 緯度経度を取得
      const x = intersect.point.x;
      const z = intersect.point.z;
      const [lon, lat] = this.inverseTranslateCoordinates(x, z);

      this.depthContainer.textContent = `Depth: ${depth.toFixed(0)}m`;
      this.coordinatesContainer.textContent = `Lon: ${lon.toFixed(5)}, Lat: ${lat.toFixed(5)}`;

    } else {
      this.depthContainer.textContent = '';
      this.coordinatesContainer.textContent = '';
    }
  }


  renderCompass = () => {
    // カメラの向きを取得
    this.camera.getWorldDirection(this.cameraDirection);

    // 1フレーム前とカメラの向きが変わっていない場合は処理をスキップ
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


  createPointCloud = () => {

    const gridScale = this.params.gridScale;

    // グリッド状に(lon, lat)を走査してデータを取り出す
    const gridIndexList = this.getGridIndexList(gridScale);

    const positions = [];
    const colors = [];

    let pointCount = 0;

    gridIndexList.forEach((indexList) => {
      if (indexList.length === 0) {
        return;
      }

      if (indexList.length === 1) {
        const d = this.params.depthMapDatas[indexList[0]];
        const p = new THREE.Vector3(d.x, d.y, d.z);
        positions.push(p);

        const c = this.getDepthColor(d.depth);
        colors.push(c.r, c.g, c.b);
        return;
      }

      // グリッド内のデータが複数ある場合は、平均値を求める
      const x = indexList.reduce((sum, index) => sum + this.params.depthMapDatas[index].x, 0) / indexList.length;
      const y = indexList.reduce((sum, index) => sum + this.params.depthMapDatas[index].y, 0) / indexList.length;
      const z = indexList.reduce((sum, index) => sum + this.params.depthMapDatas[index].z, 0) / indexList.length;
      const p = new THREE.Vector3(x, y, z);
      positions.push(p);

      const depth = indexList.reduce((sum, index) => sum + this.params.depthMapDatas[index].depth, 0) / indexList.length;
      const c = this.getDepthColor(depth);
      colors.push(c.r, c.g, c.b);

      pointCount++;

    });

    this.params.pointCount = pointCount;

    const geometry = new THREE.BufferGeometry().setFromPoints(positions);
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const pointMaterial = new THREE.PointsMaterial({
      size: this.params.pointSize,
      vertexColors: true,
    });

    const pointCloud = new THREE.Points(geometry, pointMaterial);
    this.scene.add(pointCloud);
    this.pointMeshList.push(pointCloud);

    //
    // XZ平面でデローネ三角形を形成する
    //
    const delaunay = Delaunator.from(
      positions.map(v => {
        return [v.x, v.z];
      })
    );

    const maxPointDistance = this.params.gridLonStep * gridScale * this.params.xzScale * 2.0 * Math.sqrt(2);

    // デローネ三角形のインデックスをmeshIndexに代入してThree.jsのインデックスに変換
    const meshIndex = [];
    for (let i = 0; i < delaunay.triangles.length; i += 3) {
      const a = delaunay.triangles[i + 0];
      const b = delaunay.triangles[i + 1];
      const c = delaunay.triangles[i + 2];

      const vertexA = positions[a];
      const vertexB = positions[b];
      const vertexC = positions[c];

      vertexA.y = vertexB.y = vertexC.y = 0;

      // 三角形の各辺の長さを計算
      const ab = vertexA.distanceTo(vertexB);
      const bc = vertexB.distanceTo(vertexC);
      const ca = vertexC.distanceTo(vertexA);

      // 各辺の長さがグリッドの長さよりも短い場合にのみ格納
      if (ab < maxPointDistance && bc < maxPointDistance && ca < maxPointDistance) {
        meshIndex.push(a, b, c);
      }

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
    this.terrainMeshList.push(terrainMesh);

  }


}


class Prefecture {

  // 県単位の地図を扱うのでクラスにする

  nam = "";
  name_ja = "";

  // THREE.Shapeの配列
  shapes = [];

  // THREE.Mesh
  shapeMesh;

  // Vector3の配列の配列
  linePoints = [];

  // THREE.LineSegmentsの配列
  lineSegments = [];

  params = {
    // Shapeの厚み
    depth: 0.1,

    // topojsonのfeature
    feature: null,

    // (lon, lat)座標を(x, z)に変換する関数
    // コンストラクタに渡すparamsで上書きする前提
    translateCoordinates: ([lon, lat]) => { return [lon, lat]; },
  }


  constructor(params) {
    this.params = Object.assign(this.params, params);

    const feature = params.feature;

    this.nam = feature.properties.nam;
    this.nam_ja = feature.properties.nam_ja;

    this.parseFeature(feature);

    this.createMesh();
  }


  parseFeature = (feature) => {

    // [lon, lat]を[x, z]に変換する関数
    const translateCoordinates = this.params.translateCoordinates;

    // GeometryがLineStringの場合
    if (feature.geometry.type === 'LineString') {
      const shape = new THREE.Shape();
      const points = [];

      const coordinates = feature.geometry.coordinates;

      let coords;
      coords = coordinates[0];
      coords = translateCoordinates(coords);

      // パスを開始
      shape.moveTo(
        coords[0],
        coords[1]
      );

      // 線分の始点
      let p0 = new THREE.Vector3(coords[0], coords[1], 0);

      for (let i = 1; i < coordinates.length; i++) {
        coords = coordinates[i];
        coords = translateCoordinates(coords);

        // 線分を追加
        shape.lineTo(
          coords[0],
          coords[1]
        );

        // 線分の終点
        let p1 = new THREE.Vector3(coords[0], coords[1], 0);

        points.push(p0, p1);
        p0 = p1;
      }

      // Shapeを追加
      this.shapes.push(shape);

      // pointsを追加
      this.linePoints.push(points);
    }

    // GeometryがPolygonの場合
    else if (feature.geometry.type === 'Polygon') {
      const shape = new THREE.Shape();
      const points = [];

      const coordinates = feature.geometry.coordinates[0];

      let coords;
      coords = coordinates[0];
      coords = translateCoordinates(coords);

      shape.moveTo(
        coords[0],
        coords[1]
      );

      let p0 = new THREE.Vector3(coords[0], coords[1], 0);

      for (let i = 1; i < coordinates.length; i++) {
        coords = coordinates[i];
        coords = translateCoordinates(coords);
        shape.lineTo(
          coords[0],
          coords[1]
        );

        let p1 = new THREE.Vector3(coords[0], coords[1], 0);

        points.push(p0, p1);
        p0 = p1;
      }

      this.shapes.push(shape);

      this.linePoints.push(points);
    }

    // GeometryがMultiPolygonの場合
    else if (feature.geometry.type === 'MultiPolygon') {
      feature.geometry.coordinates.forEach(polygon => {
        const shape = new THREE.Shape();
        const points = [];

        const coordinates = polygon[0];

        let coords;
        coords = coordinates[0];
        coords = translateCoordinates(coords);

        shape.moveTo(
          coords[0],
          coords[1]
        );

        let p0 = new THREE.Vector3(coords[0], coords[1], 0);

        for (let i = 1; i < coordinates.length; i++) {
          coords = coordinates[i];
          coords = translateCoordinates(coords);

          shape.lineTo(
            coords[0],
            coords[1]
          );

          let p1 = new THREE.Vector3(coords[0], coords[1], 0);

          points.push(p0, p1);
          p0 = p1;
        }

        this.shapes.push(shape);

        this.linePoints.push(points);
      });
    }

  }


  createMesh = () => {
    // ShapeGeometryを作成
    const geometry = new THREE.ShapeGeometry(this.shapes);

    // マテリアル、ここでは適当にMeshBasicMaterialを使う
    const material = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      side: THREE.DoubleSide
    });

    // XZ平面化
    // 回転の向きに注意！
    // Lat方向（Z軸方向）の座標をマイナスに正規化しているので、奥側に倒すように回転させる
    // つまり、画面には裏面が見えているので、マテリアルのsideはDoubleSideにして両面表示にする
    geometry.rotateX(Math.PI / 2);

    // メッシュ化
    const mesh = new THREE.Mesh(geometry, material);

    // メッシュをインスタンス変数に保存
    this.shapeMesh = mesh;

    // メッシュを選択可能にする
    mesh.selectable = true;

    // ユーザーデータを追加
    mesh.userData = {
      nam: this.nam,
      nam_ja: this.nam_ja,
    };

    // 線分を作成
    this.linePoints.forEach(points => {
      // LineSegmentsのgeometryを作成
      const geometry = new THREE.BufferGeometry().setFromPoints(points);

      geometry.rotateX(Math.PI / 2);

      const material = new THREE.LineBasicMaterial({ color: 0x000000 });
      const lineSegments = new THREE.LineSegments(geometry, material);

      // ラインセグメントは選択不可
      lineSegments.selectable = false;

      this.lineSegments.push(lineSegments);
    });
  }

}
