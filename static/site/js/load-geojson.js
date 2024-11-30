import * as THREE from "three";
import { OrbitControls } from "three/controls/OrbitControls.js";

// lil-gui
import { GUI } from "three/libs/lil-gui.module.min.js";

// stats.js
import Stats from "three/libs/stats.module.js";

// 参考
// https://observablehq.com/@mbostock/geojson-in-three-js


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
    // 世界地図のデータのパス
    path: "./static/data/land-50m.json",

    // 読み込んだJSONデータ
    jsonData: null,

    // 画面上の半径
    radius: 128,

    // カメラの自動回転
    autoRotate: true,

    // カメラの自動回転スピード
    autoRotateSpeed: 2.0,
  }


  constructor(params = {}) {
    this.params = Object.assign(this.params, params);
    this.init();
  }

  async init() {
    // JSONデータを読み込む
    await this.loadJson(this.params.path);

    if (this.params.jsonData === null) {
      return;
    }

    // console.log(this.params.jsonData);

    // scene, camera, renderer, controllerを初期化
    this.initThreejs();

    // stats.jsを初期化
    this.initStatsjs();

    // lil-guiを初期化
    this.initGui();

    // 経緯線を初期化
    this.initGraticule();

    // 世界地図を初期化
    this.initGlobe();

    // フレーム毎の処理(requestAnimationFrameで再帰的に呼び出される)
    this.render();
  }


  async loadJson(path) {
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
      1,
      1000
    );

    // 東京の上空にカメラを設定
    const tokyo = [139.692, 35.689];
    const tokyoPosition = this.geo_to_vec3(tokyo[0], tokyo[1], this.params.radius * 2.5);
    this.camera.position.set(tokyoPosition.x, tokyoPosition.y, tokyoPosition.z);

    // レンダラ
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true
    });
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


  initGui = () => {
    const guiContainer = document.getElementById("guiContainer");

    const gui = new GUI({
      container: guiContainer,
      width: 300,
    });

    gui
      .add(this.params, "autoRotate")
      .name("rotation")
      .onFinishChange((value) => this.controller.autoRotate = value);

    gui
      .add(this.params, "autoRotateSpeed")
      .name("autoRotateSpeed")
      .min(1.0)
      .max(10.0)
      .step(0.1)
      .onChange((value) => this.controller.autoRotateSpeed = value);
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


  initGraticule = (interval = 15) => {
    // 縦の円弧、横の円弧を作成する

    // 半径
    const radius = this.params.radius;

    // 経緯線のマテリアル
    const material = new THREE.LineBasicMaterial({
      color: 0xcccccc,
    });

    const startAngle = 90 - interval;
    const endAngle = -90 + interval;

    // 縦の円弧を80度から-80度まで作るためのカーブ
    const verticalCurve = new THREE.EllipseCurve(
      0,                           // ax
      0,                           // aY
      radius,                      // xRadius
      radius,                      // yRadius
      startAngle * Math.PI / 180,  // aStartAngle
      endAngle * Math.PI / 180,    // aEndAngle
      true,                        // aClockwise
      0                            // aRotation
    );

    // カーブ上の点を50個取得
    const points = verticalCurve.getPoints(50);

    // 縦の円弧のジオメトリを作成
    const verticalGeometry = new THREE.BufferGeometry().setFromPoints(points);

    // 作成した縦の円弧をinterval度ずつ回転させて球状にする
    for (let roteteY = 0; roteteY < 360; roteteY += interval) {

      // クローンして回転させる
      const clonedGeometry = verticalGeometry.clone().rotateY(roteteY * Math.PI / 180);

      // メッシュ化してシーンに追加
      this.scene.add(new THREE.Line(clonedGeometry, material));
    }


    // 水平の円を作成するためのカーブ
    const horizontalCurve = new THREE.EllipseCurve(
      0,            // ax
      0,            // aY
      1,            // xRadius ★ここを変える
      1,            // yRadius ★ここを変える
      0,            // aStartAngle
      2 * Math.PI,  // aEndAngle
      false,        // aClockwise
      0             // aRotation
    );

    for (let theta = 0; theta < 180; theta += interval) {

      // 半径をthetaに応じて変化させる
      horizontalCurve.xRadius = horizontalCurve.yRadius = radius * Math.sin(theta * Math.PI / 180);

      const points = horizontalCurve.getPoints(50);

      const geometry = new THREE.BufferGeometry().setFromPoints(points);

      // 水平にするためにX軸で-90度回転
      geometry.rotateX(-90 * Math.PI / 180);

      // 上下に移動
      geometry.translate(0, radius * Math.cos(theta * Math.PI / 180), 0);

      // メッシュ化してシーンに追加
      this.scene.add(new THREE.Line(geometry, material));
    }
  }


  initGlobe = () => {
    const jsonData = this.params.jsonData;

    if (!jsonData.hasOwnProperty('objects')) {
      new Error('No objects property in jsonData');
    }

    if (!jsonData.objects.hasOwnProperty('land')) {
      new Error(`No land property in objects`);
    }

    const land = jsonData.objects.land;

    const multilineStringObject = topojson.mesh(jsonData, land);

    const geometry = this.createLineSegmentsGeometry(multilineStringObject);

    const material = new THREE.LineBasicMaterial({ color: 0xff0000 });

    const mesh = new THREE.LineSegments(geometry, material);

    this.scene.add(mesh);
  }


  geo_to_vec3 = (longitude, latitude, radius) => {
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


  createLineSegmentsGeometry = (multilineStringObject) => {
    const positions = [];
    const radius = this.params.radius;

    multilineStringObject.coordinates.forEach((lines) => {

      // linesは各要素が[longitude, latitude]になっている配列
      // [[lon1, lat1], [lon2, lat2], ...]

      // [lon, lat]の部分をTHREE.Vector3に変換する
      const vertecies = lines.map(coords => {
        const lon = coords[0];
        const lat = coords[1];
        return this.geo_to_vec3(lon, lat, radius);
      });

      // verticiesは[THREE.Vector3, THREE.Vector3, ...]の配列

      // THREE.LineSegmentsは2点を結ぶ線分を描画する
      // indexを省略する場合、(p0, p1), (p1, p2), (p2, p3), ... というように頂点を登録する
      // 頂点をp0, p1, p2... のように登録するならindexを[0, 1, 1, 2, 2, 3...]と指定する必要がある
      // 簡単なのは前者なので、ここでは前者を採用する
      for (let i = 0; i < vertecies.length - 1; i++) {
        positions.push(vertecies[i].x, vertecies[i].y, vertecies[i].z);
        positions.push(vertecies[i + 1].x, vertecies[i + 1].y, vertecies[i + 1].z);
      }
    });

    const geometry = new THREE.BufferGeometry();

    // Float32Arrayに変換してgeometryのposition属性に頂点座標をセットする
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));

    return geometry;
  }

}
