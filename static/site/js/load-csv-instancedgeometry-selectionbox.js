import * as THREE from "three";
import { OrbitControls } from "three/controls/OrbitControls.js";

// lil-gui
import { GUI } from "three/libs/lil-gui.module.min.js";

// stats.js
import Stats from "three/libs/stats.module.js";

//
import { SelectionBox } from "three/libs/interactive/SelectionBox.js";
import { SelectionHelper } from "three/libs/interactive/SelectionHelper.js";

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
    path: "./static/data/depth_map_data.csv",
    csvData: null,

    autoRotate: false,
    autoRotateSpeed: 1.0,
  }

  pointCloud;

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
        this.normalizeData(rowData);
        data.push(rowData);
      }
    }

    return data;
  }


  normalizeData(rowData) {

    // |       |             lat |             lon |        depth |
    // |:------|----------------:|----------------:|-------------:|
    // | mean  |     35.1641     |    139.607      |     17.0863  |

    // 小数点以下を消すなら、このスケールになるんだけど、とんでもなくでかい数字になるので
    // const scale = 100000000000000;

    // このくらいがちょうど良さそう
    const scale = 10000;

    rowData.lat = -1 * (parseFloat(rowData.lat) - 35.1641) * scale;
    rowData.lon = (parseFloat(rowData.lon) - 139.607) * scale;
    rowData.depth = -1 * parseFloat(rowData.depth);

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
    // 一時停止
    // this.controller.enabled = false;

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

    this.scene.add(new THREE.AmbientLight(0xffffff));

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

    // データを取り出す
    const dataList = this.params.csvData;

    // データの入れ物
    const positionArray = new Float32Array(dataList.length * 3);
    const colorArray = new Float32Array(dataList.length * 3);
    const removedArray = new Float32Array(dataList.length);

    dataList.forEach((obj, index) => {

      // 位置情報
      positionArray[index * 3 + 0] = obj.lon;    // 経度
      positionArray[index * 3 + 1] = obj.depth;  // 水深
      positionArray[index * 3 + 2] = obj.lat;    // 緯度

      // 色
      colorArray[index * 3 + 0] = 0.6;
      colorArray[index * 3 + 1] = 0.8;
      colorArray[index * 3 + 2] = 1.0;

      // 削除フラグ
      removedArray[index] = 0.0;

    });

    // THREE.InstancedBufferGeometry を使ってポイントクラウドを描画する
    // ポイントクラウドのように同じ図形を多数描画する場合、
    // GPUに対して同じ図形を描画せよ、と指示することで高速化できる
    const geometry = new THREE.InstancedBufferGeometry();

    // 元になる立方体のジオメトリを一つ作成
    const originBox = new THREE.BoxGeometry(0.1, 0.1, 0.1);

    // シェーダーで必要になるパラメータを追加しておく
    geometry.setAttribute("position", originBox.attributes.position.clone());
    geometry.setAttribute("normal", originBox.attributes.normal.clone());
    geometry.setAttribute("uv", originBox.attributes.uv.clone());
    geometry.setIndex(originBox.index.clone());

    // 個々に設定するアトリビュートを追加
    geometry.setAttribute("instancePosition", new THREE.InstancedBufferAttribute(positionArray, 3));
    geometry.setAttribute("instanceColor", new THREE.InstancedBufferAttribute(colorArray, 3));
    geometry.setAttribute("removed", new THREE.InstancedBufferAttribute(removedArray, 1));

    const vertex = /* glsl */ `
      attribute vec3 instancePosition;
      attribute vec3 instanceColor;
      attribute float removed;

      varying vec3 vColor;

      void main() {
        if (removed > 0.5) {
          gl_Position = vec4(0.0, 0.0, 0.0, 0.0);
          return;
        }

        // vec4 modelPosition = modelMatrix * vec4(position, 1.0);
        vec4 modelPosition = modelMatrix * vec4(position + instancePosition, 1.0);
        vec4 viewPosition = viewMatrix * modelPosition;
        vec4 projectionPosition = projectionMatrix * viewPosition;

        gl_Position = projectionPosition;

        vColor = instanceColor;
      }
    `;

    const fragment = /* glsl */ `
      varying vec3 vColor;

      void main() {
        gl_FragColor = vec4(vColor, 1.0);
      }
    `;

    const material = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: {},
      vertexColors: false,
      transparent: false,
      depthTest: false,
    });

    this.pointCloud = new THREE.Mesh(geometry, material);
    this.scene.add(this.pointCloud);

    // アトリビュートの更新を通知
    geometry.attributes.instancePosition.needsUpdate = true;
    geometry.attributes.instanceColor.needsUpdate = true;

  }

  /*
  initSelection() {
    const raycaster = new THREE.Raycaster();

    // レイが交差する対象
    let intersects = [];

    // マウス位置
    const mousePosition = new THREE.Vector2()

    const onMouseMove = (event) => {
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
      mousePosition.x = +(x / w) * 2 - 1;
      mousePosition.y = -(y / h) * 2 + 1;

      // マウス座標に向かってレイを飛ばす
      raycaster.setFromCamera(mousePosition, this.camera);
      intersects = raycaster.intersectObject(this.pointCloud, true);
      if (intersects.length > 0) {

        console.log(intersects[0]);

        const { x, y, z } = intersects[0].point;
        // console.log(`intersecting at (x: ${x}, y: ${y}, z: ${z})`);
        // console.log(`index: ${intersects[0].index}`);

        colorPoint(intersects[0].index);


      }

    };

    this.renderer.domElement.addEventListener("mousemove", (event) => { onMouseMove(event); });


    const colorPoint = (index) => {
      this.pointCloud.geometry.attributes.color.setXYZ(index, 0, 1, 0);
      this.pointCloud.geometry.attributes.color.needsUpdate = true;
    };


    const onPointerUp = (event) => {
      // OrbitControlsを有効にする
      this.controller.enabled = true;
    };

    // Selectionを有効にするボタン
    const enableButton = document.getElementById('enableSelectionBox');
    enableButton.addEventListener('click', () => {
      document.addEventListener('pointerdown', onPointerDown);
      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
      // OrbitControlsを無効にする
      this.controller.enabled = false;
    });

    // Selectionを無効にするボタンを追加
    const disableButton = document.getElementById('disableSelectionBox');
    disableButton.addEventListener('click', () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      // OrbitControlsを有効にする
      this.controller.enabled = true;
    });
  }
  */



}
