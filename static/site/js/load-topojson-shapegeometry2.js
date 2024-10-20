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
    jsonData: null,

    // ファイルのパス
    path: "./static/data/japan.topojson",

    // データのobjectName
    objectName: "japan",

    // translate
    translate: [0.0, 0.0],
  }

  // ObjectSelectionのインスタンス
  objectSelection;

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

    // ObjectSelectionを初期化
    this.initObjectSelection();

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
    this.camera = new THREE.OrthographicCamera(
      -this.sizes.width / 2,   // left
      this.sizes.width / 2,    // right
      this.sizes.height / 2,   // top
      -this.sizes.height / 2,  // bottom
      0,                       // near
      10                       // far
    );
    this.camera.position.set(0, 0, 1);

    // レンダラ
    this.renderer = new THREE.WebGLRenderer({ antialias: true });

    // 通常はコンテナにサイズを合わせるが、ここでは固定にする
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    document.getElementById("threejsContainer").appendChild(this.renderer.domElement);

    // コントローラ
    this.controller = new OrbitControls(this.camera, this.renderer.domElement);
    // this.controller.enableZoom = false; // ズームを無効化
    this.controller.enableRotate = false; // 回転を無効化
    // this.controller.enablePan = false; // パンを無効化

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


  // ObjectSelectionを初期化
  initObjectSelection = () => {

    this.objectSelection = new ObjectSelection({
      domElement: this.renderer.domElement,
      mouseover: (obj) => {
        if (obj === null) {
          document.getElementById("prefectureNameContainer").innerText = "";
        } else {
          document.getElementById("prefectureNameContainer").innerText = navigator.language.startsWith("ja") ? obj.userData.nam_ja : obj.userData.nam;
        }
      },
      // click: (obj) => { },
    });

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

      // ObjectSelectionのrender()を呼ぶ
      this.objectSelection.render(this.scene, this.camera);

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
      const mesh = prefecture.shapeMesh;

      // このメッシュのバウンディングボックスを計算
      const boundingBox = new THREE.Box3().setFromObject(mesh);

      // 全体のバウンディングボックスに結合
      overallBoundingBox.union(boundingBox);

      // メッシュをシーンに追加
      this.scene.add(mesh);

      // 線分をシーンに追加
      prefecture.lineSegments.forEach(line => {
        this.scene.add(line);
      });

    });

    // console.log(overallBoundingBox);

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



export class ObjectSelection {

  // 参照
  // 初めてのThree.js 第二版 P235
  // https://github.com/oreilly-japan/learning-three-js-2e-ja-support

  // コンストラクタに渡されるパラメータ
  params = {};

  // 光線が当たっているオブジェクトへの参照
  INTERSECTED = null;

  // マウスカーソルが上に乗ったときのコールバック関数
  callbackMouseover;

  // マウスをクリックしたときのコールバック関数
  callbackClick;

  // マウス位置
  mousePosition; // = new THREE.Vector2()

  // スクリーン上のDOM要素
  domElement;

  // 光線を飛ばすレイキャスター
  raycaster; // = new THREE.Raycaster();

  // 光線を飛ばす対象レイヤ
  layers; // = [];

  constructor(params={}) {
    this.params = Object.assign(this.params, params);

    // マウスカーソルが上に乗ったときのコールバック関数
    this.callbackMouseover = this.params.hasOwnProperty("mouseover") ? this.params.mouseover : null;

    // マウスをクリックしたときのコールバック関数
    this.callbackClick = this.params.hasOwnProperty("click") ? this.params.click : null;

    // 対象レイヤ
    this.layers = this.params.hasOwnProperty("layers") ? this.params.layers : [];

    // スクリーン上のDOM要素
    this.domElement = this.params.hasOwnProperty("domElement") ? this.params.domElement : document;

    // マウス位置
    this.mousePosition = new THREE.Vector2()

    // mousemoveイベントを登録
    this.domElement.addEventListener('mousemove', this.onMouseMove, false);

    // clickイベントを登録
    this.domElement.addEventListener('click', this.onMouseClick, false);

    // レイキャスターを作成
    this.raycaster = new THREE.Raycaster();

    // レイキャスターが対象にするレイヤーを指定
    this.layers.forEach((layer) => {
      this.raycaster.layers.enable(layer);
    });

  }

  onMouseMove = (event) => {
    event.preventDefault();
    event.stopPropagation();

    // DOM要素(canvas)を取得する
    // これはeventから取得してもよいし、paramsで渡されたものを使ってもよい
    // const element = this.domElement;
    const element = event.currentTarget;

    // その要素の位置を取得
    const clientRect = element.getBoundingClientRect();

    // canvas要素の左上を起点とするマウス座標
    const x = event.clientX - clientRect.x;
    const y = event.clientY - clientRect.y;

    // canvas要素の幅、高さ (paddingが含まれるのでCSSで0にしておくこと)
    const w = element.clientWidth;
    const h = element.clientHeight;

    // マウス座標を(-1, 1)の範囲に変換
    this.mousePosition.x = +(x / w) * 2 - 1;
    this.mousePosition.y = -(y / h) * 2 + 1;
  }

  onMouseClick = (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (this.INTERSECTED) {
      if (typeof this.callbackClick === 'function') {
        this.callbackClick(this.INTERSECTED);
      }
    }
  }

  getIntersectedObject = (intersects) => {
    if (intersects.length === 0) {
      return null;
    }
    for (let i=0; i<intersects.length; i++) {
      if (intersects[i].object.selectable) {
        return intersects[i].object;
      }
    }
    return null;
  }


  // フレーム更新ごとにこのrender()関数を呼ぶこと
  render = (scene, camera) => {

    // カメラからマウス座標に向かって光線を飛ばす
    this.raycaster.setFromCamera(this.mousePosition, camera);

    // オブジェクトに光線がぶつかっているか、判定する
    const intersects = this.raycaster.intersectObject(scene, true);

    // 光線がオブジェクトにぶつかっているなら
    const intersectedObject = this.getIntersectedObject(intersects);

    if (intersectedObject) {

      // 前回と違うオブジェクトに光線が当たっているなら、
      if (this.INTERSECTED != intersectedObject) {

        // 前回のオブジェクトは元の色に戻す
        if (this.INTERSECTED) {
          if (this.INTERSECTED.material.color) {
            this.INTERSECTED.material.color.setHex(this.INTERSECTED.currentHex);
            this.INTERSECTED.material.needsUpdate = true;
          }
        }

        // 新しいオブジェクトを選択して、
        this.INTERSECTED = intersectedObject;

        // そのオブジェクトに色の属性があるなら、
        if (this.INTERSECTED.material.color) {
          // 現在の色をオブジェクト内に保存して、
          this.INTERSECTED.currentHex = this.INTERSECTED.material.color.getHex();

          // 色を変える
          this.INTERSECTED.material.color.setHex(0xff0000);
          this.INTERSECTED.material.needsUpdate = true;
        }

        // コールバック関数を渡されているならそれを実行する
        if (typeof this.callbackMouseover === 'function') {
          this.callbackMouseover(this.INTERSECTED);
        }
      }

    } else {
      // 光線がオブジェクトにぶつかっていないなら

      // 古いオブジェクトは元の色に戻す
      if (this.INTERSECTED) {
        if (this.INTERSECTED.material.color) {
          this.INTERSECTED.material.color.setHex(this.INTERSECTED.currentHex);
          this.INTERSECTED.material.needsUpdate = true;
        }
      }

      // 選択を外して
      this.INTERSECTED = null;

      // 選択から外れたことをコールバック関数で知らせる
      if (typeof this.callbackMouseover === 'function') {
        this.callbackMouseover(null);
      }

    }
  };
}
