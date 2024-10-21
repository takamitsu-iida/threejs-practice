import * as THREE from "three";
import { OrbitControls } from "three/controls/OrbitControls.js";

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


const geo_to_vec3 = (longitude, latitude, radius) => {
  // x = rcos(latitude)cos(longitude)
  // y = rsin(latitude)
  // z = −rcos(latitude)sin(longitude)

  // 経度と緯度をラジアンに変換
  latitude = latitude * Math.PI / 180.0;
  longitude = longitude * Math.PI / 180.0;

  return new THREE.Vector3(
    radius * Math.cos(latitude) * Math.cos(longitude),
    radius * Math.sin(latitude),
    -radius * Math.cos(latitude) * Math.sin(longitude));
}


export class Main {

  container;

  sizes = {
    width: 600,
    height: 600,
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
    radius: 128,

    jsonData: null,

    // ファイルのパス
    path: "./static/data/japan.topojson",

    // データのobjectName
    objectName: "japan",

    // translate
    translate: [0.0, 0.0],
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
      1000
    );

    // 東京の上空にカメラを設定
    const tokyo = [139.692, 35.689];
    const tokyoPosition = geo_to_vec3(tokyo[0], tokyo[1], this.params.radius * 2.5);
    this.camera.position.set(tokyoPosition.x, tokyoPosition.y, tokyoPosition.z);

    // レンダラ
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    // コントローラ
    this.controller = new OrbitControls(this.camera, this.renderer.domElement);
    // this.controller.enableZoom = false; // ズームを無効化
    // this.controller.enableRotate = false; // 回転を無効化
    // this.controller.enablePan = false; // パンを無効化

    // 軸を表示
    //
    //   Y(green)
    //    |
    //    +---- X(red)
    //   /
    //  Z(blue)
    //
    const axesHelper = new THREE.AxesHelper(this.params.radius);
    this.scene.add(axesHelper);

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

    // 全体のバウンディングボックス
    const overallBoundingBox = new THREE.Box3();

    prefectures.forEach(prefecture => {
      const mesh = prefecture.mesh;

      // このメッシュのバウンディングボックスを計算
      const boundingBox = new THREE.Box3().setFromObject(mesh);

      // 全体のバウンディングボックスに結合
      overallBoundingBox.union(boundingBox);

      // メッシュをシーンに追加
      this.scene.add(mesh);
    });

    // console.log(overallBoundingBox);

    /*
    // カメラの位置を調整
    const center = new THREE.Vector3();
    overallBoundingBox.getCenter(center);
    this.camera.position.set(center.x, center.y, this.camera.position.z);
    this.camera.lookAt(center.x, center.y, this.controller.target.z);

    // ズームを調整
    this.camera.zoom = Math.min(
      this.sizes.width / (overallBoundingBox.max.x - overallBoundingBox.min.x),
      this.sizes.height / (overallBoundingBox.max.y - overallBoundingBox.min.y)
    ) * 1.2;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrix();

    // コントローラのターゲットを調整
    this.controller.target.set(center.x, center.y, this.controller.target.z);
    this.controller.update();
    */

  }

}


class Prefecture {

  nam = "";
  name_ja = "";

  mesh;

  params = {
    // 画面上の半径
    radius: 128,

    // TopoJSONのfeature
    feature: null,
  }


  constructor(params) {
    this.params = Object.assign(this.params, params);

    const feature = params.feature;

    this.nam = feature.properties.nam;
    this.nam_ja = feature.properties.nam_ja;

    const geometry = this.createLineSegmentsGeometry(feature);

    const material = new THREE.LineBasicMaterial({ color: 0xff0000 });

    const mesh = new THREE.LineSegments(geometry, material);

    this.mesh = mesh;
  }


  createLineSegmentsGeometry = (feature) => {

    // LineSegmentsの頂点座標を格納する配列
    const positions = [];

    // 画面上の球体の半径
    const radius = this.params.radius;

    // GeometryがLineStringの場合
    if (feature.geometry.type === 'LineString') {

      const coordinates = feature.geometry.coordinates;

      // coordinatesは[[lon, lat], [lon, lat], ...]の配列
      // [lon, lat]の部分をTHREE.Vector3に変換する
      const vertecies = coordinates.map(coords => {
        const lon = coords[0];
        const lat = coords[1];
        return geo_to_vec3(lon, lat, radius);
      });

      // THREE.LineSegmentsは2点を結ぶ線分を描画する
      // indexを省略する場合、(p0, p1), (p1, p2), (p2, p3), ... というように頂点を登録する
      // 頂点をp0, p1, p2... のように登録するならindexを[0, 1, 1, 2, 2, 3...]と指定する必要がある
      // 簡単なのは前者なので、ここでは前者を採用する
      for (let i = 0; i < vertecies.length - 1; i++) {
        positions.push(vertecies[i].x, vertecies[i].y, vertecies[i].z);
        positions.push(vertecies[i + 1].x, vertecies[i + 1].y, vertecies[i + 1].z);
      }
    }

    // GeometryがPolygonの場合
    else if (feature.geometry.type === 'Polygon') {

      const coordinates = feature.geometry.coordinates[0];

      const vertecies = coordinates.map(coords => {
        const lon = coords[0];
        const lat = coords[1];
        return geo_to_vec3(lon, lat, radius);
      });

      for (let i = 0; i < vertecies.length - 1; i++) {
        positions.push(vertecies[i].x, vertecies[i].y, vertecies[i].z);
        positions.push(vertecies[i + 1].x, vertecies[i + 1].y, vertecies[i + 1].z);
      }
    }

    // GeometryがMultiPolygonの場合
    else if (feature.geometry.type === 'MultiPolygon') {
      feature.geometry.coordinates.forEach(polygon => {

        const coordinates = polygon[0];

        const vertecies = coordinates.map(coords => {
          const lon = coords[0];
          const lat = coords[1];
          return geo_to_vec3(lon, lat, radius);
        });


        for (let i = 0; i < vertecies.length - 1; i++) {
          positions.push(vertecies[i].x, vertecies[i].y, vertecies[i].z);
          positions.push(vertecies[i + 1].x, vertecies[i + 1].y, vertecies[i + 1].z);
        }

      });
    }

    // LineSegmentsのgeometryを作成
    const geometry = new THREE.BufferGeometry();

    // Float32Arrayに変換してgeometryのposition属性に頂点座標をセットする
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));

    return geometry;
  }

}