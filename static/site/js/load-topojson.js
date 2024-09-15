import * as THREE from "three";
import { OrbitControls } from "three/controls/OrbitControls.js";

// lil-gui
import { GUI } from "three/libs/lil-gui.module.min.js";

// stats.js
import Stats from "three/libs/stats.module.js";


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
    jsonData: null,

    /*
    structure of topojson data
    {
      "type": "Topology",
      "objects": {
        "miura": {
    */
    path: "./static/data/aburatsubo.json",
    objectName: "miura",
    // path: "./static/data/world_map_web_merc.json",
    // objectName: "world_map",

    autoRotate: false,
    autoRotateSpeed: 1.0,
  }


  constructor(params) {
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

    console.log(this.params.jsonData);

    // scene, camera, renderer, controllerを初期化
    this.initThreejs();

    // lil-guiを初期化
    this.initGui();

    // stats.jsを初期化
    this.initStatsjs();

    // Topojsonをパース
    // this.parseTopojson();

    this.createMeshFromTopojson(this.params.jsonData);

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


  initThreejs() {
    // コンテナ
    this.container = document.getElementById("threejsContainer");

    // コンテナのサイズ
    this.sizes.width = this.container.clientWidth;
    this.sizes.height = this.container.clientHeight;

    // resizeイベントのハンドラを登録
    window.addEventListener("resize", () => { this.onWindowResize(); }, false);

    // シーン
    this.scene = new THREE.Scene();

    // カメラ
    this.camera = new THREE.PerspectiveCamera(
      60,
      this.sizes.width / this.sizes.height,
      1,
      1000
    );
    this.camera.position.set(139, 35, 100);

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

  }

  initGui() {
    const guiContainer = document.getElementById("guiContainer");
    const gui = new GUI({
      container: guiContainer,
    });

    gui
      .add(this.params, "autoRotate")
      .name("rotation")
      .onChange((value) => {
        this.controller.autoRotate = value;
      });

    gui
      .add(this.params, "autoRotateSpeed")
      .name("autoRotateSpeed")
      .min(1.0)
      .max(10.0)
      .step(0.1)
      .onChange((value) => {
        this.controller.autoRotateSpeed = value;
      });

  }


  initStatsjs() {
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


  render() {
    // 再帰処理
    requestAnimationFrame(() => { this.render(); });

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


  onWindowResize() {
    this.sizes.width = this.container.clientWidth;
    this.sizes.height = this.container.clientHeight;

    this.camera.aspect = this.sizes.width / this.sizes.height;
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.sizes.width, this.sizes.height);
  }


  // Topojsonをパースする関数
  _parseTopojson() {
    const jsonData = this.params.jsonData;

    const features = topojson.feature(jsonData, jsonData.objects[this.params.objectName]);

    console.log(features);

    const lineObjs = [];

    features.features.forEach((feature) => {

      const country = new Country(feature.geometry, feature.properties);

      const shape = country.createShape();
      this.scene.add(shape);
      // console.log(shape);

      // let line = country.createLine();
      // lineObjs.push(line);
      // this.scene.add(line);

    });

  }


  createShapeFromTopojson(jsonData) {

    const shape = new THREE.Shape();

    const features = topojson.feature(jsonData, jsonData.objects[this.params.objectName]);

    // topojsonのFeatureCollectionからFeatureを一つずつ取り出す
    features.features.forEach(feature => {

      // GeometryがLineStringの場合
      if (feature.geometry.type === 'LineString') {
        const coordinates = feature.geometry.coordinates;
        shape.moveTo(coordinates[0][0], coordinates[0][1]); // パスを開始
        for (let i = 1; i < coordinates.length; i++) {
          shape.lineTo(coordinates[i][0], coordinates[i][1]); // 線分を追加
        }
      }

      // GeometryがPolygonまたはMultiPolygonの場合
      else if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
        const coordinates = feature.geometry.type === 'Polygon' ?
          feature.geometry.coordinates[0] :
          feature.geometry.coordinates.flat(2); // MultiPolygonの場合は全ての座標を1次元配列に

        shape.moveTo(coordinates[0][0], coordinates[0][1]);

        for (let i = 1; i < coordinates.length; i++) {
          shape.lineTo(coordinates[i][0], coordinates[i][1]);
        }

        shape.closePath();
      }

    });

    return shape;
  }


  createMeshFromTopojson(jsonData) {
    // Shapeを作成
    const shape = this.createShapeFromTopojson(jsonData);

    console.log(shape);

    // ShapeからExtrudeGeometryを作成
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 10,
      bevelEnabled: false
    });
    const material = new THREE.MeshStandardMaterial({
      color: 0x00ff00,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geometry, material);

    // シーンに追加
    this.scene.add(mesh);

    console.log(mesh);
  }


}






class Country {

  geoCoords;
  properties;
  lineColor;
  shapeColor;

  constructor(geoCoords, properties, lineColor = 0xff0000, shapeColor = 0x00ff00) {
    this.geoCoords = geoCoords;
    this.properties = properties;
    this.lineColor = lineColor;
    this.shapeColor = shapeColor;
  }


  createShape() {
    let vecs2 = [];

    const shapearray = [];

    for (let P of this.geoCoords.coordinates) {
      if (this.geoCoords.type === "MultiPolygon") {
        P = P[0];
      }

      let p0 = new THREE.Vector2(P[0][0], P[0][1]);
      for (let i = 1; i < P.length; ++i) {
        let p1 = new THREE.Vector2(P[i][0], P[i][1]);
        vecs2.push(p0, p1);
        p0 = p1;
      }

      shapearray.push(new THREE.Shape(vecs2));
      vecs2 = [];
    }

    const material = new THREE.MeshBasicMaterial({
      color: this.shapeColor,
      side: THREE.DoubleSide,
    });

    const geometry = new THREE.ShapeGeometry(shapearray);
    const mesh = new THREE.Mesh(geometry, material);

    mesh.userData = this;

    return mesh;
  }


  createLine() {
    const geometry = new THREE.BufferGeometry();

    for (let P of this.geoCoords.coordinates) {
      if (this.geoCoords.type === "MultiPolygon") {
        P = P[0];
      }

      let p0 = new THREE.Vector3(P[0][0], P[0][1], 0);

      for (let i = 1; i < P.length; ++i) {
        const p1 = new THREE.Vector3(P[i][0], P[i][1], 0);
        geometry.vertices.push(p0, p1);
        p0 = p1;
      }
    }

    const material = new THREE.LineBasicMaterial({ color: this.lineColor });
    const lineSegments = new THREE.LineSegments(geometry, material);

    lineSegments.userData = this;

    return lineSegments;
  }


}