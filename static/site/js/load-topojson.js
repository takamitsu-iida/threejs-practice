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

    // topojsonデータからシェイプを作成
    const shapes = this.createShapesFromTopojson(this.params.jsonData, this.params.objectName);

    // シェイプの配列からメッシュを作成
    this.createMeshFromShapes(shapes);

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
    this.camera.position.set(0, 10, 0);

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
    this.scene.add(new THREE.AmbientLight(0xffffff, 3));

    // ライトの追加
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(0, 1, 1).normalize();
    this.scene.add(light);

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


  createShapesFromTopojson(jsonData, objectName) {

    // スケーリングファクターを設定
    const scaleFactor = 100;

    // Shapeを格納する配列
    const shapes = [];

    const topoData = topojson.feature(jsonData, jsonData.objects[objectName]);
    const features = topoData.features;

    // topojsonのFeatureCollectionからFeatureを一つずつ取り出す
    features.forEach(feature => {
      // console.log(feature);

      // Shapeを作成
      const shape = new THREE.Shape();

      // GeometryがLineStringの場合
      if (feature.geometry.type === 'LineString') {
        const coordinates = feature.geometry.coordinates;
        // パスを開始
        shape.moveTo(
          coordinates[0][0] * scaleFactor,
          coordinates[0][1] * scaleFactor
        );

        for (let i = 1; i < coordinates.length; i++) {
          // 線分を追加
          shape.lineTo(
            coordinates[i][0] * scaleFactor,
            coordinates[i][1] * scaleFactor
          );
        }
      }

      // GeometryがPolygonまたはMultiPolygonの場合
      else if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
        const coordinates = feature.geometry.type === 'Polygon' ?
          feature.geometry.coordinates[0] :
          feature.geometry.coordinates.flat(2); // MultiPolygonの場合は全ての座標を1次元配列に

        shape.moveTo(
          coordinates[0][0] * scaleFactor,
          coordinates[0][1] * scaleFactor
        );

        for (let i = 1; i < coordinates.length; i++) {
          shape.lineTo(
            coordinates[i][0] * scaleFactor,
            coordinates[i][1] * scaleFactor
          );
        }
      }

      shapes.push(shape);

    });

    return shapes;
  }


  createMeshFromShapes(shapes) {

    // ExtrudeGeometryに渡すdepthパラメータ（厚み）
    const depth = 0.1;

    // Shapeの配列からExtrudeGeometryを作成
    const geometry = new THREE.ExtrudeGeometry(shapes, {
      depth: depth,
      bevelEnabled: false,
    });

    geometry.computeBoundingBox();
    const boundingBox = geometry.boundingBox;
    console.log(boundingBox);

    // ジオメトリを90度回転
    geometry.rotateX(- Math.PI / 2);

    // 原点に寄せる
    geometry.center();
    // geometry.translate(boundingBox.max.x, 0, 0);


    const material = new THREE.MeshStandardMaterial({
      color: 0x00ff00,
      side: THREE.DoubleSide
    });

    // メッシュ化
    const mesh = new THREE.Mesh(geometry, material);

    // メッシュをY軸方向に移動
    mesh.position.y += depth / 2;

    // シーンに追加
    this.scene.add(mesh);
  }

}
