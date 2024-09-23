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

  params = {
    path: "./static/data/depth_map_data_20240727_0717_stripped.csv",
    csvData: null,
    meanLat: 0.0,
    meanLon: 0.0,

    numPoints: 2000,
  }


  constructor(params) {
    this.params = Object.assign(this.params, params);
    this.init();
  }


  async init() {
    // データを読み込む
    // その間、ローディング画面を表示する
    await this.loadCsv(this.params.path);

    if (this.params.csvData === null) {
      return;
    }

    // console.log(this.params.csvData);
    // {lat: xxx, lon: xxx, depth: xxx}

    // scene, camera, renderer, controllerを初期化
    this.initThreejs();

    // stats.jsを初期化
    this.initStatsjs();

    // CSVデータをパスを初期化
    this.initPath();

    // フレーム毎の処理(requestAnimationFrameで再帰的に呼び出される)
    this.render();
  }


  async loadCsv(path) {
    const loadingContainer = document.getElementById('loadingContainer');

    try {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`HTTP status: ${response.status}`);
      }

      // テキストデータを取得
      const text = await response.text();

      // CSVデータをパースして、this.params.csvDataに保存
      this.parseCsv(text);

      console.log(this.params);

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
      const errorMessage = `Error while loading CSV: ${error}`;
      console.error(errorMessage);
      let p = document.createElement('p');
      p.textContent = errorMessage;
      p.style.color = 'white';
      loadingContainer.appendChild(p);
    }

  }


  // CSVデータをパースする関数
  parseCsv(text) {
    const headers = ['lat', 'lon', 'depth'];

    let sumLat = 0.0;
    let sumLon = 0.0;

    const lines = text.split('\n');
    const data = [];
    for (let i = 0; i < lines.length; i++) {
      const row = lines[i].split(',');
      if (row.length > headers.length) {
        const rowData = {};
        for (let j = 0; j < headers.length; j++) {
          rowData[headers[j]] = parseFloat(row[j].trim());
        }
        sumLat += rowData.lat;
        sumLon += rowData.lon;
        data.push(rowData);
      }
    }

    this.params.csvData = data;
    this.params.meanLat = sumLat / data.length;
    this.params.meanLon = sumLon / data.length;
  }


  initThreejs() {
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
      1,
      1000
    );
    this.camera.position.set(0, 100, 0);

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
    const axesHelper = new THREE.AxesHelper(100000000);
    this.scene.add(axesHelper);

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


  onWindowResize = (event) => {
    this.sizes.width = this.container.clientWidth;
    this.sizes.height = this.container.clientHeight;

    this.camera.aspect = this.sizes.width / this.sizes.height;
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.sizes.width, this.sizes.height);
  };


  initPath() {
    const csvData = this.params.csvData;
    // console.log(csvData);

    const depthPoints = csvData.map((data) => {

      // |       |             lat |             lon |        depth |
      // |:------|----------------:|----------------:|-------------:|
      // | mean  |     35.1641     |    139.608      |     16.4776  |

      // X軸 経度(lon) 大きくなるほど右に行くのでそのままでよい
      // Y軸 深度(depth) 水深は大きくなるほど下に行きたいのでマイナス方向にする
      // Z軸 緯度(lat) Three.jsのZ軸は下向きなので、マイナス方向にする

      const {lat, lon, depth} = data;
      return new THREE.Vector3(lon, -depth, -lat);
    });
    // console.log(points);

    const boatPoints = csvData.map((data) => {
      const {lat, lon} = data;
      return new THREE.Vector3(lon, 0, -lat);
    });

    const depthCurve = new THREE.CatmullRomCurve3(depthPoints);
    const depthCurvePoints = depthCurve.getPoints(this.params.numPoints);
    const depthGeometry = new THREE.BufferGeometry().setFromPoints(depthCurvePoints);

    const boatCurvePoints = depthCurvePoints.map((point) => {
      return new THREE.Vector3(point.x, 0, point.z);
    });

    const boatGeometry = new THREE.BufferGeometry().setFromPoints(boatCurvePoints);

    // 原点に寄せるためにジオメトリを移動、拡大する
    depthGeometry.translate(-this.params.meanLon, 0, this.params.meanLat);
    depthGeometry.scale(10000, 1, 10000);

    boatGeometry.translate(-this.params.meanLon, 0, this.params.meanLat);
    boatGeometry.scale(10000, 1, 10000);

    // マテリアル
    const depthMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00 });
    const boatMaterial = new THREE.LineBasicMaterial({ color: 0xa0a0a0 });

    // ライン
    const depthLine = new THREE.Line(depthGeometry, depthMaterial);
    const boatLine = new THREE.Line(boatGeometry, boatMaterial);

    this.scene.add(depthLine);
    this.scene.add(boatLine);
  }

}
