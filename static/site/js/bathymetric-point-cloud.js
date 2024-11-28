import * as THREE from "three";

import { MapControls } from "three/controls/MapControls.js";
import { TrackballControls } from "three/controls/TrackballControls.js";
// import { OrbitControls } from "three/controls/OrbitControls.js";

// lil-gui
import { GUI } from "three/libs/lil-gui.module.min.js";

// stats.js
import Stats from "three/libs/stats.module.js";

// rbush-4.0.1
// rbushは内部でquickselectを使用しているので、HTML側でimportmapを設定する
// import rbush from "rbush";

// 500mメッシュ海底地形データ
// J-EGG500:JODC-Expert Grid data for Geography
//
// https://www.jodc.go.jp/vpage/depth500_file_j.html
//
// このサイトで領域を選択してダウンロードできる


// タイル表示したい
// https://github.com/tentone/geo-three


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
  mapControls;
  zoomControls;
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
    distance: null,
  }


  params = {

    // 海底地形図の(lon, lat)をThree.jsのXZ座標のどの範囲に描画するか
    // 持っているGPSデータに応じて調整する
    xzGridSize: 800,  // 800を指定する場合は -400～400 の範囲に描画する

    // xzGridSizeにあわせるために、どのくらい緯度経度の値を拡大するか（自動計算）
    xzScale: 1,

    // 最も深い水深に合わせてY座標をどのくらい拡大するか（自動計算）
    yScale: 1,

    // 水深データのテキストファイルのURL
    depthMapPath: "./static/data/mesh500_kanto.txt",

    // テキストをパースしたデータを格納するMap()
    depthMapData: null,

    // ポイントクラウドのパーティクルサイズ
    pointSize: 1.0,

    // ポイントクラウドのパーティクルの数(readonly)
    pointCount: 0,

    // 500メートル間隔の緯度経度の差分
    // これに合わせてデータをスナップする
    latStep: 0.00451,
    lonStep: 0.00003,

    // 緯度経度の最大値、最小値、中央値（テキストデータから自動で読み取る）
    minLat: 0,
    maxLat: 0,
    minLon: 0,
    maxLon: 0,
    maxDepth: 0,

    // 緯度経度の中央値（自動計算）
    centerLat: 0,
    centerLon: 0,

    // ワールド座標に正規化した最大値、最小値（自動計算）
    minZ: 0,
    maxZ: 0,
    minX: 0,
    maxX: 0,
    minY: 0,
  }

  // 地形図のポイントクラウド（guiで表示を操作するためにインスタンス変数にする）
  pointMeshList;

  constructor(params = {}) {
    this.params = Object.assign(this.params, params);
    this.init();
  }


  init = async () => {
    // データを読み込む
    await Promise.all([
      this.loadText(this.params.depthMapPath),
    ]);

    if (this.params.depthMapData === null) {
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

    // scene, camera, renderer, controlsを初期化
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

    // ポイントクラウドを表示
    this.createPointCloud();

    // ポイントクラウドからメッシュを作成
    // this.createMeshFromPointCloud();

    // フレーム毎の処理
    this.render();
  }


  loadText = async (path) => {
    try {

      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`HTTP status: ${response.status}`);
      }

      // テキストデータを取得
      const text = await response.text();

      // テキストデータをパースしてdepthMapDataを作成
      this.params.depthMapData = this.parseText(text);

      // データをワールド座標に正規化
      this.normalizeDepthMapData();

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

    // 行ごとにパースしたデータを格納するMap()
    const dataMap = new Map();

    // 緯度経度の最大値、最小値を取得するための変数
    let minLat = 9999, minLon = 9999;
    let maxLat = -9999, maxLon = -9999;
    let maxDepth = -9999;

    // 500メートル間隔の緯度経度の差分
    const latStep = this.params.latStep;
    const lonStep = this.params.lonStep;

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

        // 緯度経度を最も近いグリッドポイントにスナップ
        lat = Math.round(lat / latStep) * latStep;
        lon = Math.round(lon / lonStep) * lonStep;

        // 最大値、最小値を調べる
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
        minLon = Math.min(minLon, lon);
        maxLon = Math.max(maxLon, lon);
        maxDepth = Math.max(maxDepth, depth);

        // データをMap()に格納
        const key = `${lat.toFixed(5)},${lon.toFixed(5)}`;
        if (!dataMap.has(key)) {
          dataMap.set(key, { lat: lat, lon: lon, depth: depth });
        } else {
          // 既にデータがある場合は、深さを平均化する
          const existing = dataMap.get(key);
          existing.depth = (existing.depth + depth) / 2;
          dataMap.set(key, existing);
        }

      }
    }

    // 何個のデータがあるか
    this.params.pointCount = dataMap.size;
    console.log(`point count: ${dataMap.size}`);

    // 最小値・最大値
    console.log(`minLat: ${minLat}\nmaxLat: ${maxLat}\nminLon: ${minLon}\nmaxLon: ${maxLon}`);
    console.log(`maxDepth: ${maxDepth}`);

    // 後から参照できるように保存しておく
    this.params.minLat = minLat;
    this.params.maxLat = maxLat;
    this.params.minLon = minLon;
    this.params.maxLon = maxLon;
    this.params.centerLat = (minLat + maxLat) / 2;
    this.params.centerLon = (minLon + maxLon) / 2;
    this.params.maxDepth = maxDepth;

    // 緯度の差分、経度の差分で大きい方を取得
    const diffSize = Math.max(maxLat - minLat, maxLon - minLon);

    // このdiffSizeがxzGridSizeになるように係数を計算
    this.params.xzScale = this.params.xzGridSize / diffSize;

    // 最も大きな水深がxzGridSizeになるように係数を計算
    this.params.yScale = this.params.xzGridSize / maxDepth

    return dataMap;
  }


  normalizeDepthMapData = () => {
    let minZ = 9999, minX = 9999;
    let maxZ = -9999, maxX = -9999;
    let minY = 9999;

    this.params.depthMapData.forEach((d, key) => {

      // lon, latをXZ座標に変換
      const [x, z] = this.normalizeCoordinates([d.lon, d.lat]);
      d.x = x;
      d.z = z;

      // depthをY座標に変換
      const y = this.normalizeDepth(d.depth);
      d.y = y;

      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
    });

    this.params.minZ = minZ;
    this.params.maxZ = maxZ;
    this.params.minX = minX;
    this.params.maxX = maxX;
    this.params.minY = minY;
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
      10000
    );
    this.camera.position.set(0, 1000, 0);

    // レイヤを設定
    this.camera.layers.enable(0); // enabled by default
    this.camera.layers.enable(1); // 1: scale

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
    this.mapControls = new MapControls(this.camera, this.renderer.domElement);
    this.mapControls.enableDamping = false;
    this.mapControls.enableZoom = false;
    this.mapControls.maxDistance = 1000;

    this.zoomControls = new TrackballControls(this.camera, this.renderer.domElement);
    this.zoomControls.noPan = true;
    this.zoomControls.noRotate = true;
    this.zoomControls.staticMoving = true;

    this.zoomControls.addEventListener('change', event => {
      const distance = this.getDistance();
      if (this.renderParams.distance !== distance) {
        this.renderParams.distance = distance;
        console.log(`distance: ${distance}`);
        const target = this.mapControls.target;
        console.log(`target: ${target.x}, ${target.y}, ${target.z}`);
      }
    });

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

    // 正規化したマウス座標を保存
    this.renderer.domElement.addEventListener("mousemove", (event) => {
      this.mousePosition.x = (event.clientX / this.sizes.width) * 2 - 1;
      this.mousePosition.y = -(event.clientY / this.sizes.height) * 2 + 1;
    }, false);

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
      .add(this.params, "pointSize")
      .name(navigator.language.startsWith("ja") ? "ポイントサイズ" : "pointSize")
      .min(0.1)
      .max(2.0)
      .step(0.1)
      .onChange((value) => {
        this.pointMeshList.forEach((pointMesh) => {
          pointMesh.material.size = value;
        });
      });

    gui
      .add(this.params, "pointCount")
      .name(navigator.language.startsWith("ja") ? "ポイント数" : "pointCount")
      .listen()
      .disable();

    // 初期状態で閉じた状態にする
    // gui.close();
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
      this.mapControls.update();
      const target = this.mapControls.target;
      this.zoomControls.target.set(target.x, target.y, target.z);
      this.zoomControls.update();

      // シーンをレンダリング
      this.renderer.render(this.scene, this.camera);

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
  };


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

      // テキストデータをパース
      this.params.depthMapData = this.parseText(text);

    } catch (error) {
      const errorMessage = `Error while loading ${path}: ${error}`;
      console.error(errorMessage);
    }
  }


  depthSteps = [
    10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 120, 140, 160, 200, 300
  ];

  depthColors = {
    "10": new THREE.Color(0x00ffff),   // シアン
    "20": new THREE.Color(0x00ffcc),   // アクアマリン
    "30": new THREE.Color(0x00ff99),   // ミントグリーン
    "40": new THREE.Color(0x00ff66),   // スプリンググリーン
    "50": new THREE.Color(0x00ff33),   // ライムグリーン
    "60": new THREE.Color(0x00ff00),   // グリーン
    "70": new THREE.Color(0x33ff00),   // ライトグリーン
    "80": new THREE.Color(0x66ff00),   // イエローグリーン
    "90": new THREE.Color(0x99ff00),   // チャートリューズ
    "100": new THREE.Color(0xccff00),  // イエロー
    "120": new THREE.Color(0xffff00),  // ゴールド
    "140": new THREE.Color(0xffcc00),  // オレンジ
    "160": new THREE.Color(0xff9900),  // ダークオレンジ
    "200": new THREE.Color(0xff6600),  // オレンジレッド
    "300": new THREE.Color(0xff3300),  // レッド
  }

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


  // 経度経度を中央寄せして正規化する
  normalizeCoordinates = ([lon, lat]) => {
    return [
      (lon - this.params.centerLon) * this.params.xzScale,
      (lat - this.params.centerLat) * this.params.xzScale * (-1)
    ];
  }

  // 元の座標系に戻す
  inverseNormalizeCoordinates = (x, z) => {
    return [
      x / this.params.xzScale + this.params.centerLon,
      z / this.params.xzScale * (-1) + this.params.centerLat
    ];
  }

  // 水深データを正規化する
  normalizeDepth = (depth) => {
    return depth * this.params.yScale * (-1);
  }

  // 元の座標系に戻す
  inverseNormalizeDepth = (depth) => {
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
      const depth = this.inverseNormalizeDepth(intersect.point.y);

      // 緯度経度を取得
      const x = intersect.point.x;
      const z = intersect.point.z;
      const [lon, lat] = this.inverseNormalizeCoordinates(x, z);

      this.depthContainer.textContent = `Depth: ${depth.toFixed(2)}m`;
      this.coordinatesContainer.textContent = `Lon: ${lon.toFixed(8)}, Lat: ${lat.toFixed(8)}`;

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

    // 座標を格納する配列
    const positions = [];

    // 色を格納する配列
    const colors = [];

    this.params.depthMapData.forEach((d) => {
      positions.push(new THREE.Vector3(d.x, d.y, d.z));
      const color = this.getDepthColor(d.depth);
      colors.push(color.r, color.g, color.b);

      // positions配列の何番目に入れたのか、をindexとして保持する
      // これを使って後ほどインデックスを作成する
      d.index = positions.length - 1;
    });

    // ポイントクラウドのジオメトリを作成
    const geometry = new THREE.BufferGeometry().setFromPoints(positions);

    // 頂点カラーを設定
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const pointMaterial = new THREE.PointsMaterial({
      size: this.params.pointSize,
      vertexColors: true,
    });

    const pointCloud = new THREE.Points(geometry, pointMaterial);

    this.scene.add(pointCloud);
    this.pointMeshList = [pointCloud];

    // インデックスを作成
    const indexList = [];
    this.params.depthMapData.forEach((d) => {
      const surroundingData = this.getSurroundingData(this.params.depthMapData, d.lat, d.lon, this.params.latStep, this.params.lonStep);

      const index = d.index;
      const rightIndex = surroundingData.right ? surroundingData.right.index : null;
      const downIndex = surroundingData.down ? surroundingData.down.index : null;
      if (rightIndex !== null && downIndex !== null) {
        indexList.push(index, rightIndex, downIndex);
      }
    });

    console.log(indexList);

    /*
    // インデックスを設定
    geometry.setIndex(indexList);

    // 法線ベクトルを計算
    geometry.computeVertexNormals();

      // マテリアルを生成
      const material = new THREE.MeshLambertMaterial({
        vertexColors: true, // 頂点カラーを使用
      });

      // メッシュを生成
      const terrainMesh = new THREE.Mesh(geometry, material);

      // シーンに追加
      this.scene.add(terrainMesh);
      */
  }

  // 特定の位置の上下左右のデータを取得する関数
  getSurroundingData = (sparseMatrix, lat, lon, latStep, lonStep) => {
    const surroundingData = {
      up: sparseMatrix.get(`${(lat + latStep).toFixed(5)},${lon.toFixed(5)}`) || null,
      down: sparseMatrix.get(`${(lat - latStep).toFixed(5)},${lon.toFixed(5)}`) || null,
      left: sparseMatrix.get(`${lat.toFixed(5)},${(lon - lonStep).toFixed(5)}`) || null,
      right: sparseMatrix.get(`${lat.toFixed(5)},${(lon + lonStep).toFixed(5)}`) || null
    };
    return surroundingData;
  }



  getDistance = () => {
    // TrackballControlsにはgetDistance()がない
    return this.camera.position.distanceTo(this.mapControls.target);
  }

  getZoom = () => {
    // OrbitControlsにはgetDistance()がある
    if (this.renderParams.distance === null) {
      this.renderParams.distance = this.zoomControls.getDistance();
    }
    return this.renderParams.distance / this.zoomControls.getDistance();
  }







}
