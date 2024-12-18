import * as THREE from "three";
import { MapControls } from "three/controls/MapControls.js";
import { TrackballControls } from "three/controls/TrackballControls.js";

// stats.js
import Stats from "three/libs/stats.module.js";

// 日本地図のtopojsonデータはここから取得
// https://github.com/dataofjapan/land
//
// japan.topojson
//
// ファイルサイズは445KB
// {
//   "type": "Topology",
//   "objects": {
//     "japan": {
//       "type": "GeometryCollection",
//       "geometries": [


export class Main {

  // 画面に表示するThree.jsコンテナのHTML DIV要素
  container;

  // コンテナサイズ
  sizes = {
    width: 600,
    height: 600,
  }

  scene;
  camera;
  renderer;
  mapControls;
  trackballControls;
  statsjs;


  renderParams = {
    clock: new THREE.Clock(),
    delta: 0,
    interval: 1 / 30,  // = 30fps
  }


  params = {

    // topojsonファイルのパス
    topojsonPath: "./static/data/japan.topojson",

    // topojsonデータ
    topojsonData: null,

    // topojsonデータのobjectName
    topojsonObjectName: "japan",

    // 地図の中心の緯度経度（三浦半島の南の海上）
    centerLon: 139.7,
    centerLat: 34.9,

    // 描画する地図のlatの範囲（関東地方くらい）
    latWidth: 2.18,  // 度 34.67083～36.84629

    // latWidthをThree.jsのz座標のどの範囲に対応付けるか
    // 800を指定する場合は -400～400 の範囲に描画する
    zWidth: 800,

    // zWidthに合わせるために、どのくらい緯度の値を拡大するか（自動計算）
    zScale: 1,

    // xScaleは表示対象物の緯度によって倍率が変わるので zScale * Math.cos(緯度) になる（自動計算）
    xScale: 1,
  }


  // Prefectureクラスのインスタンスを格納する配列
  prefectures = [];

  // 見えてるPrefectureクラスのインスタンスを格納する配列
  visiblePrefectures = [];


  constructor(params = {}) {
    this.params = Object.assign(this.params, params);
    this.init();
  }


  async init() {
    // データを読み込む
    // その間、ローディング画面を表示する
    await this.loadTopojson(this.params.topojsonPath);

    if (this.params.topojsonData === null) {
      return;
    }

    // console.log(this.params.jsonData);

    // scene, camera, rendererを初期化
    this.initThreejs();

    // stats.jsを初期化
    this.initStatsjs();

    // topojsonデータから地図を表示
    this.initMap();

    // フレーム毎の処理(requestAnimationFrameで再帰的に呼び出される)
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
      const errorMessage = `Error while loading data: ${error}`;
      console.error(errorMessage);
      let p = document.createElement('p');
      p.textContent = errorMessage;
      p.style.color = 'white';
      loadingContainer.appendChild(p);
    }

  }


  initThreejs = () => {
    // Three.jsを表示するHTML要素を取得
    this.container = document.getElementById("threejsContainer");

    // コンテナのサイズ
    this.sizes.width = this.container.clientWidth;
    this.sizes.height = this.container.clientHeight;

    // シーン
    this.scene = new THREE.Scene();

    // カメラ
    this.camera = new THREE.PerspectiveCamera(
      60,
      this.sizes.width / this.sizes.height,
      1,
      10000
    );
    this.camera.position.set(0, this.params.zWidth / 2, 0);

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

      // カメラコントローラーを更新
      this.mapControls.update();
      this.trackballControls.target.set(this.mapControls.target.x, this.mapControls.target.y, this.mapControls.target.z);
      this.trackballControls.update();

      // 再描画
      this.renderer.render(this.scene, this.camera);
    }

    this.renderParams.delta %= this.renderParams.interval;
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

    // 見えてるPrefectureインスタンスをインスタンス変数に保存
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

    // 画面内に表示されている県のリスト
    const visiblePrefectures = this.prefectures.filter(prefecture => this.isInFrustum(prefecture.shapeMesh));

    const deleted = this.visiblePrefectures.filter(prefecture => !visiblePrefectures.includes(prefecture));
    const added = visiblePrefectures.filter(prefecture => !this.visiblePrefectures.includes(prefecture));
    this.visiblePrefectures = visiblePrefectures;

    this.onDeleteVisiblePrefectures(deleted);
    this.onAddVisiblePrefectures(added);

  }


  onDeleteVisiblePrefectures = (prefectures) => {
    prefectures.forEach(prefecture => {
      // 画面から消えた県の処理
      console.log(`Deleted: ${prefecture.nam_ja}`);

      const element = document.getElementById(`prefecture-${prefecture.nam}`);
      if (element) {
        document.getElementById("prefectureNameContainer").removeChild(element);
      }

    });
  }


  onAddVisiblePrefectures = (prefectures) => {
    prefectures.forEach(prefecture => {
      // 画面に表示された県の処理
      console.log(`Added: ${prefecture.nam_ja}`);

      const element = document.createElement('div');
      element.id = `prefecture-${prefecture.nam}`;
      element.textContent = prefecture.nam_ja;
      document.getElementById("prefectureNameContainer").appendChild(element);
    });
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
