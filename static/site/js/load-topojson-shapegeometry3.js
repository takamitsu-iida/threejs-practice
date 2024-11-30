import * as THREE from "three";
// import { OrbitControls } from "three/controls/OrbitControls.js";
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

  container;

  sizes = {
    width: 600,
    height: 600,
  }

  scene;
  camera;
  renderer;
  mapControls;
  zoomControls;
  statsjs;

  // マウス座標
  mousePosition = new THREE.Vector2();

  // マウス座標（1フレーム前）
  previousMousePosition = new THREE.Vector2();

  renderParams = {
    clock: new THREE.Clock(),
    delta: 0,
    interval: 1 / 30,  // = 30fps

    distance: null,
  }

  params = {
    jsonData: null,

    // ファイルのパス
    path: "./static/data/japan.topojson",

    // データのobjectName
    objectName: "japan",

    // translate
    translate: [0.0, 0.0],

    // グリッドを走査するときの、グリッドのスケール
    // 500m x gridScale の範囲でデータを取得する
    gridScale: 2.0,

    // (lon, lat)をThree.jsのXZ座標のどの範囲に描画するか
    xzGridSize: 800,  // 800を指定する場合は -400～400 の範囲に描画する

    // xzGridSizeにあわせるために、どのくらい緯度経度の値を拡大するか（自動で計算する）
    xzScale: 1,



  }


  constructor(params = {}) {
    this.params = Object.assign(this.params, params);
    this.init();
  }


  async init() {
    // データを読み込む
    // その間、ローディング画面を表示する
    await this.loadTopojson(this.params.path);

    if (this.params.jsonData === null) {
      return;
    }

    // console.log(this.params.jsonData);

    // scene, camera, rendererを初期化
    this.initThreejs();

    // stats.jsを初期化
    this.initStatsjs();

    // topojsonデータからPrefectureインスタンスを作成
    const prefectures = this.createPrefecturesFromTopojson(this.params.jsonData, this.params.objectName);

    // Prefectureインスタンスからメッシュを作成
    this.drawPrefectures(prefectures);

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

      if (jsonData.hasOwnProperty('transform')) {
        this.params.translate = jsonData.transform.translate;
      } else {
        new Error('No transform property in jsonData');
      }

      if (!jsonData.hasOwnProperty('objects')) {
        new Error('No objects property in jsonData');
      }

      if (!jsonData.objects.hasOwnProperty(this.params.objectName)) {
        new Error(`No ${this.params.objectName} property in objects`);
      }

      // jsonデータを保存
      this.params.jsonData = jsonData;

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
    // コンテナ
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
    this.camera.position.set(0, 1000, 0);

    // レンダラ
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
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

    this.zoomControls.addEventListener('change', (event) => {
      const distance = this.getDistance();
      if (this.renderParams.distance !== distance) {
        this.renderParams.distance = distance;
        // console.log(`distance: ${distance}`);

        // distance が 0 のとき gridScale は 1、distance が 1000 のとき gridScale は 2 になるように線形補間
        // const gridScale = 1 + (distance / 1000);

        // distance に基づいて gridScale を階段状に設定
        let gridScale;
        if (distance < 500) {
          gridScale = 1.0;
        } else if (distance < 600) {
          gridScale = 1.2;
        } else if (distance < 700) {
          gridScale = 1.4;
        } else if (distance < 800) {
          gridScale = 1.6;
        } else if (distance < 900) {
          gridScale = 1.8;
        } else {
          gridScale = 2.0;
        }

        if (this.params.gridScale !== gridScale) {
          this.params.gridScale = gridScale;

          console.log(`gridScale: ${gridScale}`);
        }
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
    const axesHelper = new THREE.AxesHelper(this.params.xzGridSize);
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
      this.zoomControls.target.set(this.mapControls.target.x, this.mapControls.target.y, this.mapControls.target.z);
      this.zoomControls.update();

      // 再描画
      this.renderer.render(this.scene, this.camera);
    }

    this.renderParams.delta %= this.renderParams.interval;
  }


  createPrefecturesFromTopojson = (jsonData, objectName) => {
    // Prefectureインスタンスを格納する配列
    const prefectures = [];

    const topoData = topojson.feature(jsonData, jsonData.objects[objectName]);
    const features = topoData.features;

    // console.log(features);
    // console.log(topojson.mesh(jsonData, jsonData.objects[objectName]));

    // topojsonのFeatureCollectionからFeatureを一つずつ取り出す
    // featureには一つの県の情報が格納されている
    features.forEach(feature => {
      prefectures.push(new Prefecture({
        feature: feature,
        translate: this.params.translate,
      }));
    });

    return prefectures;
  }


  drawPrefectures = (prefectures) => {

    prefectures.forEach(prefecture => {
      const mesh = prefecture.shapeMesh;

      // メッシュをシーンに追加
      this.scene.add(mesh);

      // 線分をシーンに追加
      prefecture.lineSegments.forEach(line => {
        this.scene.add(line);
      });

    });

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


class Prefecture {

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
    depth: 0.1,
    feature: null,
    translate: [0.0, 0.0],
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

    // GeometryがLineStringの場合
    if (feature.geometry.type === 'LineString') {
      const shape = new THREE.Shape();
      const points = [];

      const coordinates = feature.geometry.coordinates;

      // パスを開始
      shape.moveTo(
        coordinates[0][0],
        coordinates[0][1]
      );

      // 線分の始点
      let p0 = new THREE.Vector3(coordinates[0][0], coordinates[0][1], 0);

      for (let i = 1; i < coordinates.length; i++) {
        // 線分を追加
        shape.lineTo(
          coordinates[i][0],
          coordinates[i][1]
        );

        // 線分の終点
        let p1 = new THREE.Vector3(coordinates[i][0], coordinates[i][1], 0);

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

      shape.moveTo(
        coordinates[0][0],
        coordinates[0][1]
      );

      let p0 = new THREE.Vector3(coordinates[0][0], coordinates[0][1], 0);

      for (let i = 1; i < coordinates.length; i++) {
        shape.lineTo(
          coordinates[i][0],
          coordinates[i][1]
        );

        let p1 = new THREE.Vector3(coordinates[i][0], coordinates[i][1], 0);

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

        shape.moveTo(
          coordinates[0][0],
          coordinates[0][1]
        );

        let p0 = new THREE.Vector3(coordinates[0][0], coordinates[0][1], 0);

        for (let i = 1; i < coordinates.length; i++) {
          shape.lineTo(
            coordinates[i][0],
            coordinates[i][1]
          );

          let p1 = new THREE.Vector3(coordinates[i][0], coordinates[i][1], 0);

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

    // 移動して原点に寄せる
    // 中心を原点に寄せるためには、もう少し左、もう少し下に移動する必要がある
    geometry.translate(-this.params.translate[0], -this.params.translate[1], 0);

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
      geometry.translate(-this.params.translate[0], -this.params.translate[1], 0);
      const material = new THREE.LineBasicMaterial({ color: 0x000000 });
      const lineSegments = new THREE.LineSegments(geometry, material);

      // ラインセグメントは選択不可
      lineSegments.selectable = false;

      this.lineSegments.push(lineSegments);
    });
  }

}
