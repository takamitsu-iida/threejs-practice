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
    path: "https://takamitsu-iida.github.io/aburatsubo-terrain-data/data/data.csv",
    csvData: null,

    autoRotate: true,
    autoRotateSpeed: 1.0,
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

    console.log(this.params.csvData);
    // {lat: xxx, lon: xxx, depth: xxx}

    // scene, camera, renderer, controllerを初期化
    this.initThreejs();

    // lil-guiを初期化
    this.initGui();

    // stats.jsを初期化
    this.initStatsjs();

    // CSVデータを元に点群を初期化
    this.initPointCloud();

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

      // 瞬時にfetchできても0.5秒はローディング画面を表示する
      const interval = setInterval(() => {
        loadingContainer.classList.add('fadeout');
        clearInterval(interval);
      }, 500);

      // ローディング画面を非表示にする
      loadingContainer.addEventListener('transitionend', (event) => {
        event.target.remove();
      });

      // テキストデータを取得
      const text = await response.text();

      // CSVデータをパース
      this.params.csvData = this.parseCsv(text);

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
    const lines = text.split('\n');
    const headers = lines[0].split(',');
    const data = [];

    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(',');
      if (row.length === headers.length) {
        const rowData = {};
        for (let j = 0; j < headers.length; j++) {
          rowData[headers[j].trim()] = row[j].trim();
        }
        data.push(rowData);
      }
    }

    return data;
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
      1001
    );
    this.camera.position.set(0, 0, 100);

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


  initPointCloud() {
    const csvData = this.params.csvData;

    const vertices = new Float32Array((csvData.length) * 3);

    csvData.forEach((obj, index) => {
      // |       |             lat |             lon |        depth |
      // |:------|----------------:|----------------:|-------------:|
      // | mean  |     35.1641     |    139.607      |     17.0863  |

      vertices[index * 3 + 0] = (parseFloat(obj.lon) - 139.607) * 10000;
      vertices[index * 3 + 1] = -1 * parseFloat(obj.depth);
      vertices[index * 3 + 2] = -1 * (parseFloat(obj.lat) - 35.1641) * 10000;
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

    // 点群のマテリアルを作成
    const pointsMaterial = new THREE.PointsMaterial({
      color: 0x99ccff,
      size: 0.1,
    });

    // 点群を作成
    const pointCloud = new THREE.Points(geometry, pointsMaterial);

    this.scene.add(pointCloud);

  }

}
