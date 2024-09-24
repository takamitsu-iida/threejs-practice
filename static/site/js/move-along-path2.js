import * as THREE from "three";
import { OrbitControls } from "three/controls/OrbitControls.js";

// utils/BufferGeometryUtils.js
import { mergeGeometries } from "three/libs/utils/BufferGeometryUtils.js";

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

  arrow;
  verticalLine;

  params = {
    path: "./static/data/depth_map_data_20240727_0717_stripped.csv",
    csvData: null,
    meanLat: 0.0,
    meanLon: 0.0,

    numPoints: 0,

    // ボートの位置を表す0.0 ～ 1.0の値
    fraction: 0.0,

    // ボートの位置のvec3配列
    boatPoints: null,

    // ボートの位置の接線ベクトルのvec3配列
    boatTangents: null,

    // 深度の位置のvec3配列
    depthPoints: null,
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

    // CSVデータを元にボートの軌跡となるパスを初期化
    this.initPath();

    // ボートを表示
    this.createArrow();

    // 垂直線を表示
    this.createVerticalLine();

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

      // console.log(this.params);

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

      // ボートの位置を更新
      this.updatePosition();

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

    const depthVector3List = csvData.map((data) => {

      // |       |             lat |             lon |        depth |
      // |:------|----------------:|----------------:|-------------:|
      // | mean  |     35.1641     |    139.608      |     16.4776  |

      // X軸 経度(lon) 大きくなるほど右に行くのでそのままでよい
      // Y軸 深度(depth) 水深は大きくなるほど下に行きたいのでマイナス方向にする
      // Z軸 緯度(lat) Three.jsのZ軸は下向きなので、マイナス方向にする

      const {lat, lon, depth} = data;

      // 移動や拡大縮小はジオメトリを操作したほうが簡単だけど、
      // ボートの位置とか向きを操作するので、先にデータを加工したほうがいい

      // 拡大：　そのまま利用すると緯度経度の差が小さすぎるので拡大する
      // 移動：　原点付近に寄せるために平均値を引く
      const scaleFactor = 10000;
      const latNormalized = (-lat + this.params.meanLat) * scaleFactor;
      const lonNormalized = (lon - this.params.meanLon) * scaleFactor;
      const depthNormalized = -depth;

      return new THREE.Vector3(lonNormalized, depthNormalized, latNormalized);
    });

    this.params.numPoints = depthVector3List.length;

    const depthCurve = new THREE.CatmullRomCurve3(depthVector3List);

    // これで取得してもいいけど、接線ベクトルが取得できない
    // const depthCurvePoints = depthCurve.getPoints(this.params.numPoints);

    const depthPoints = [];
    const boatPoints = [];
    const boatTangents = [];
    for (let i = 0; i < this.params.numPoints; i++) {
      // 0.0 ～ 1.0 の間で、等間隔に点を取得
      const fraction = i / this.params.numPoints;

      // そのfractionでのVector3を取得
      const point = depthCurve.getPointAt(fraction);
      depthPoints.push(point);

      // ボートの位置はY座標を0にしたもの
      boatPoints.push(new THREE.Vector3(point.x, 0, point.z));

      // そのfractionにおける接線ベクトルを取得
      const tangent = depthCurve.getTangent(fraction);

      // ボートは水面の上にいるので、Y方向を0にする
      tangent.y = 0;

      boatTangents.push(tangent);
    }

    // 外からアクセスできるように保存しておく
    this.params.depthPoints = depthPoints;
    this.params.boatPoints = boatPoints;
    this.params.boatTangents = boatTangents;

    // 水深用のジオメトリ
    const depthGeometry = new THREE.BufferGeometry().setFromPoints(depthPoints);

    // ボート用のジオメトリ
    const boatGeometry = new THREE.BufferGeometry().setFromPoints(boatPoints);

    // 原点に寄せて表示するためにジオメトリを移動、拡大する
    // depthGeometry.translate(-this.params.meanLon, 0, this.params.meanLat);
    // depthGeometry.scale(10000, 1, 10000);
    // boatGeometry.translate(-this.params.meanLon, 0, this.params.meanLat);
    // boatGeometry.scale(10000, 1, 10000);

    // マテリアル
    const depthMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00 });
    const boatMaterial = new THREE.LineBasicMaterial({ color: 0xa0a0a0 });

    // ライン
    const depthLine = new THREE.Line(depthGeometry, depthMaterial);
    const boatLine = new THREE.Line(boatGeometry, boatMaterial);

    this.scene.add(depthLine);
    this.scene.add(boatLine);
  }


  createArrow() {
    // 円錐と円柱を作成して結合する

    // 円錐
    const coneGeometry = new THREE.ConeGeometry(1, 2, 10);

    // 円柱
    const cylinderGeometry = new THREE.CylinderGeometry(0.4, 0.6, 3, 10);

    // 円柱の位置を上に調整
    coneGeometry.translate(0, 2.5, 0);

    // 結合する
    // .mergeGeometries ( geometries : Array, useGroups : Boolean ) : BufferGeometry
    const arrowGeometry = mergeGeometries([coneGeometry, cylinderGeometry]);

    // サイズを調整
    arrowGeometry.scale(0.5, 0.5, 0.5);

    // マテリアル
    const material = new THREE.MeshNormalMaterial();

    // メッシュ化
    this.arrow = new THREE.Mesh(arrowGeometry, material);

    this.arrow.position.set(0, 0, 0);

    // シーンに追加
    this.scene.add(this.arrow);
  }

  createVerticalLine() {
    const geometry = new THREE.BufferGeometry();

    const vertices = new Float32Array([
      0,  // start x
      0,  // start y
      0,  // start z

      0,    // end x
      -10,  // end y ★ geometry.attributes.position.array[4] でここを更新
      0     // end z
    ]);

    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

    const material = new THREE.LineBasicMaterial({ color: 0x00ff00 });

    this.verticalLine = new THREE.Line(geometry, material);

    this.scene.add(this.verticalLine);
  }



  UP = new THREE.Vector3(0, 1, 0);
  AXIS = new THREE.Vector3();

  updatePosition() {

    // 配列のインデックスを計算
    const index = Math.floor(this.params.fraction * (this.params.numPoints - 1));

    // 位置を取得
    const position = this.params.boatPoints[index];

    // 位置を更新
    this.arrow.position.copy(position);

    // 向きを更新
    const tangent = this.params.boatTangents[index];
    this.AXIS.crossVectors(this.UP, tangent).normalize();
    const radians = Math.acos(this.UP.dot(tangent));
    this.arrow.quaternion.setFromAxisAngle(this.AXIS, radians);

    // 水深を取得
    const depthPosition = this.params.depthPoints[index];

    // 垂直線の位置を更新
    this.verticalLine.position.copy(position);
    this.verticalLine.geometry.attributes.position.array[4] = depthPosition.y;
    this.verticalLine.geometry.attributes.position.needsUpdate = true;

    this.params.fraction += 0.001;
    if (this.params.fraction > 1) {
      this.params.fraction = 0.0;
    }

  }


}
