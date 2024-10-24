import * as THREE from "three";
import { OrbitControls } from "three/controls/OrbitControls.js";

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


  // topojsonの構造は以下のようになっている
  // 重要な情報はparamsに保存しておく
  /*
  {
    "type": "Topology",
    "objects": {
      "miura": {}
    },
    "transform": {
      "translate": [139.602282, 35.128496]
    }
  */

  params = {
    jsonData: null,

    // 三浦市のデータのパス
    path: "./static/data/aburatsubo.json",

    // 三浦市のデータのobjectName
    objectName: "miura",

    // translate
    translate: [0.0, 0.0],
  }


  constructor(params={}) {
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

    // scene, camera, renderer, controllerを初期化
    this.initThreejs();

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

    // resizeイベントのハンドラを登録
    window.addEventListener("resize", this.onWindowResize, false);

    // シーン
    this.scene = new THREE.Scene();

    // カメラ
    this.camera = new THREE.PerspectiveCamera(
      60,
      this.sizes.width / this.sizes.height,
      0.1,
      10
    );
    this.camera.position.set(0, 0, 1);

    // レンダラ
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    // コントローラ
    this.controller = new OrbitControls(this.camera, this.renderer.domElement);

    // 軸を表示
    //
    //   Y(green)
    //    |
    //    +---- X(red)
    //   /
    //  Z(blue)
    //
    const axesHelper = new THREE.AxesHelper(50);
    this.scene.add(axesHelper);

    // 環境光
    this.scene.add(new THREE.AmbientLight(0xffffff, 3));

    // ライトの追加
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(0, 1, 1).normalize();
    this.scene.add(light);

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


  onWindowResize = (event) => {
    this.sizes.width = this.container.clientWidth;
    this.sizes.height = this.container.clientHeight;

    this.camera.aspect = this.sizes.width / this.sizes.height;
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.sizes.width, this.sizes.height);
  };


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
        // パスを開始
        shape.moveTo(
          coordinates[0][0],
          coordinates[0][1]
        );

        for (let i = 1; i < coordinates.length; i++) {
          // 線分を追加
          shape.lineTo(
            coordinates[i][0],
            coordinates[i][1]
          );
        }

        shapes.push(shape);
      }

      // GeometryがPolygonの場合
      else if (feature.geometry.type === 'Polygon') {
        const shape = new THREE.Shape();

        const coordinates = feature.geometry.coordinates[0];

        shape.moveTo(
          coordinates[0][0],
          coordinates[0][1]
        );

        for (let i = 1; i < coordinates.length; i++) {
          shape.lineTo(
            coordinates[i][0],
            coordinates[i][1]
          );
        }

        shapes.push(shape);
      }

      // GeometryがMultiPolygonの場合
      else if (feature.geometry.type === 'MultiPolygon') {
        feature.geometry.coordinates.forEach(polygon => {
          const shape = new THREE.Shape();
          const coordinates = polygon[0];

          shape.moveTo(
            coordinates[0][0],
            coordinates[0][1]
          );

          for (let i = 1; i < coordinates.length; i++) {
            shape.lineTo(
              coordinates[i][0],
              coordinates[i][1]
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
    const depth = 0.01;

    // Shapeの配列からExtrudeGeometryを作成
    const geometry = new THREE.ExtrudeGeometry(shapes, {
      depth: depth,
      bevelEnabled: false,
    });

    // ジオメトリの中心を原点に寄せる
    // geometry.center();

    // ジオメトリを移動して原点に寄せる
    // 中心を原点に寄せるためには、もう少し左、もう少し下に移動する必要がある
    geometry.translate(-this.params.translate[0], -this.params.translate[1], 0);

    // BoundingBoxを計算して中心を調べる
    geometry.computeBoundingBox();
    const boundingBox = geometry.boundingBox;
    const center = new THREE.Vector3();
    boundingBox.getCenter(center);

    // BoundingBoxの中心を原点に寄せる
    geometry.translate(-center.x, -center.y, 0);

    // ズームを調整（適当）
    this.camera.zoom = 10.0;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrix();

    // マテリアル、ここでは適当にMeshStandardMaterialを使う
    const material = new THREE.MeshStandardMaterial({
      color: 0x00ff00,
      side: THREE.DoubleSide
    });

    // メッシュ化
    const mesh = new THREE.Mesh(geometry, material);

    // シーンに追加
    this.scene.add(mesh);

  }

}
