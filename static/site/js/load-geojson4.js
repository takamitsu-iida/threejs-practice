import * as THREE from "three";
import { OrbitControls } from "three/controls/OrbitControls.js";

// lil-gui
import { GUI } from "three/libs/lil-gui.module.min.js";

// stats.js
import Stats from "three/libs/stats.module.js";

// GPUComputationRendereを使うのに必要なモジュール(libsに配置する必要があるファイル)
// three.js/examples/jsm/misc/GPUComputationRenderer.js
// three.js/examples/jsm/postprocessing/Pass.js
import { GPUComputationRenderer } from "three/libs/misc/GPUComputationRenderer.js";

// 参考(ワイヤフレームの地球)
// https://observablehq.com/@mbostock/geojson-in-three-js

// 参考(首都の位置情報)
// https://note.com/kentoide/n/n16354c4b3458


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
    // 世界地図のGeoJSONデータのパス
    landPath: "./static/data/land-50m.json",

    // 読み込んだGeoJSONデータ
    landData: null,

    // 地球のテクスチャのパス
    geoTexturePath: "./static/site/img/geo_ground.jpg",

    // 地球のテクスチャ
    geoTexture: null,

    // 地球のバンプマップのパス
    geoBumpTexturePath: "./static/site/img/geo_bump.jpg",

    // バンプマップのテクスチャ
    geoBumpTexture: null,

    // バンプマップの強さ
    geoBumpScale: 0.1,

    // テクスチャを貼った地球のメッシュ
    geoTextureMesh: null,

    // テクスチャを貼った地球のメッシュを表示するかどうか
    showGeoTexture: true,

    // 画面上の半径
    radius: 128,

    // カメラの自動回転
    autoRotate: false,

    // カメラの自動回転スピード
    autoRotateSpeed: 2.0,

    // カーブの高度の最小値と最大値
    minAltitude: 48,
    maxAltitude: 112,

    // カーブを生成するCubicBezierCurve3()インスタンス
    curve: new THREE.CubicBezierCurve3(
      new THREE.Vector3(0, 0, 0), // start point
      new THREE.Vector3(0, 0, 0), // control point1
      new THREE.Vector3(0, 0, 0), // control point2
      new THREE.Vector3(0, 0, 0)  // end point
    ),

    // カーブを表現する点の間隔（解像度）
    fractionStep: 0.01,

    // 都市間を接続するカーブの座標を格納するデータテクスチャ
    // createCurvePositionTexture()で初期化する
    curveTexture: null,

    // 都市間を接続するカーブの本数
    // createCurvePositionTexture()の中で都市の数から自動計算する
    numCurves: 0,

    // パーティクルの数
    // 16384を超えないこと！
    // これを大きくすると、シェーダーのコンパイルに時間がかかる！
    particleNum: 512,

    // パーティクルを使って表現する線の長さ（1本の線におけるパーティクルの数）
    // これを1/fractionStep + 1にすると、いい具合になる
    particleLen: 100 + 1,
  }

  // パーティクルを動かすためのGPUComputationRenderer
  computationRenderer;

  // パーティクルを描画するシェーダーに渡すuniforms
  uniforms = {
    // createCurvePositionTexture()の中で値をセットする
    u_texture_curve: { value: null },

    // initComputationRenderer()の中で値をセットする
    u_texture_position: { value: null },
  }


  constructor(params = {}) {
    this.params = Object.assign(this.params, params);
    this.init();
  }


  async init() {

    // データのダウンロードを待ってから初期化
    await this.loadData();
    if (this.params.landData === null || this.params.geoTexture === null || this.params.geoBumpTexture === null) {
      return;
    }

    // scene, camera, renderer, controllerを初期化
    this.initThreejs();

    // stats.jsを初期化
    this.initStatsjs();

    // lil-guiを初期化
    this.initGui();

    // 世界地図を初期化
    this.initTextureGlobe();

    // 経緯線を初期化
    this.initGraticule();

    // 世界地図を初期化
    this.initWireframeGlobe();

    // 首都の場所に◯を表示
    this.initCapitalCities();

    // カーブのテクスチャを作成
    this.createCurvePositionTexture();

    // GPUComputationRendererを初期化
    this.initComputationRenderer();

    // パーティクルを描画
    this.initParticles();

    // フレーム毎の処理
    this.render();
  }


  async loadData() {
    const loadingContainer = document.getElementById('loadingContainer');

    try {
      // GeoJSONデータを取得
      let path = this.params.landPath;
      const process1 = fetch(path)
        .then((response) => {
          if (!response.ok) {
            throw new Error(`HTTP status: ${response.status} while downloading ${path}`);
          }
          return response.json();
        })
        .then((jsonData) => {
          this.params.landData = jsonData;
        });

      path = this.params.geoTexturePath;
      const process2 = fetch(path)
        .then((response) => {
          if (!response.ok) {
            throw new Error(`HTTP status: ${response.status} while downloading ${path}`);
          }
          return response.blob();
        })
        .then((blob) => {
          this.params.geoTexture = URL.createObjectURL(blob);
        });

      path = this.params.geoBumpTexturePath;
      const process3 = fetch(path)
        .then((response) => {
          if (!response.ok) {
            throw new Error(`HTTP status: ${response.status} while downloading ${path}`);
          }
          return response.blob();
        })
        .then((blob) => {
          this.params.geoBumpTexture = URL.createObjectURL(blob);
        });

      await Promise.all([process1, process2, process3]);

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
      const p = document.createElement('p');
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
    const tokyoCoords = [139.692, 35.689];
    const tokyoPosition = this.geo_to_vec3(tokyoCoords[0], tokyoCoords[1], this.params.radius);
    const tokyoSkyPosition = tokyoPosition.clone().normalize().multiplyScalar(this.params.radius * 2.5);
    this.camera.position.set(tokyoSkyPosition.x, tokyoSkyPosition.y, tokyoSkyPosition.z);

    // レンダラ
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    // コントローラ
    this.controller = new OrbitControls(this.camera, this.renderer.domElement);
    // this.controller.enableDamping = true
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
    const axesHelper = new THREE.AxesHelper(this.params.radius * 1.5);
    this.scene.add(axesHelper);

    // 環境光をシーンに追加
    // 環境光がないと地球の夜の部分が真っ黒になってしまう
    // ただし、色に注意が必要
    // 0xffffffだと全体に強い光があたって影ができない
    this.scene.add(new THREE.AmbientLight(0xa0a0a0));

    // ディレクショナルライト
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(tokyoSkyPosition.x, tokyoSkyPosition.y, tokyoSkyPosition.z);
    this.scene.add(dirLight)
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
    const gui = new GUI({ width: 300 });

    gui
      .add(this.params, "autoRotate")
      .name(navigator.language.startsWith("ja") ? "回転して表示" : "Auto Rotate")
      .onChange((value) => {
        this.controller.autoRotate = value;
      });

    gui
      .add(this.params, "autoRotateSpeed")
      .name(navigator.language.startsWith("ja") ? "回転速度" : "Auto Rotate Speed")
      .min(1.0)
      .max(10.0)
      .step(0.1)
      .onChange((value) => {
        this.controller.autoRotateSpeed = value;
      });

    gui
      .add(this.params, "showGeoTexture")
      .name(navigator.language.startsWith("ja") ? "テクスチャを表示" : "Show Texture")
      .onChange((value) => {
        this.params.geoTextureMesh.visible = value;
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

      // 位置を計算
      this.computationRenderer.compute();

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

    // 半径 bumpMapの影響を受けるために少し大きくする
    const radius = this.params.radius + 0.5;

    // 経緯線のマテリアル
    const material = new THREE.LineBasicMaterial({
      color: 0x909090,
      transparent: true,
      opacity: 0.5,
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


  initTextureGlobe = () => {
    const geoTexture = new THREE.TextureLoader().load(this.params.geoTexture);
    geoTexture.colorSpace = THREE.SRGBColorSpace

    const geoBumpTexture = new THREE.TextureLoader().load(this.params.geoBumpTexture);
    geoBumpTexture.colorSpace = THREE.SRGBColorSpace

    // 地球の球体
    const geometry = new THREE.SphereGeometry(this.params.radius, 60, 60);

    // マテリアル
    const material = new THREE.MeshStandardMaterial({
      map: geoTexture,
      bumpMap: geoBumpTexture,
      bumpScale: this.params.geoBumpScale,
      metalness: 0.1,
    });

    const mesh = new THREE.Mesh(geometry, material);

    // 影を受け取る
    // mesh.receiveShadow = true;

    // 影を投影する
    // mesh.castShadow = true;

    // 表示する？
    mesh.visible = this.params.showGeoTexture;

    // 作成したメッシュを保存する（表示・非表示をlil-guiで切り替えるため）
    this.params.geoTextureMesh = mesh;

    this.scene.add(mesh);
  }


  initWireframeGlobe = () => {
    const jsonData = this.params.landData;

    if (!jsonData.hasOwnProperty('objects')) {
      new Error('No objects property in jsonData');
    }

    if (!jsonData.objects.hasOwnProperty('land')) {
      new Error(`No land property in objects`);
    }

    const land = jsonData.objects.land;

    const multilineStringObject = topojson.mesh(jsonData, land);

    const geometry = this.createLineSegmentsGeometry(multilineStringObject);

    const material = new THREE.LineBasicMaterial({ color: 0xc0c0c0 });

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


  // this code is from d3-geo/src/interpolate.js
  interpolateFunction = (a, b) => {
    const radians = Math.PI / 180;
    const degrees = 180 / Math.PI;

    function asin(x) {
      return x > 1 ? Math.PI / 2 : x < -1 ? - Math.PI / 2 : Math.asin(x);
    }

    function haversin(x) {
      return (x = Math.sin(x / 2)) * x;
    }

    const x0 = a[0] * radians;
    const y0 = a[1] * radians;
    const x1 = b[0] * radians;
    const y1 = b[1] * radians;
    const cy0 = Math.cos(y0);
    const sy0 = Math.sin(y0);
    const cy1 = Math.cos(y1);
    const sy1 = Math.sin(y1);
    const kx0 = cy0 * Math.cos(x0);
    const ky0 = cy0 * Math.sin(x0);
    const kx1 = cy1 * Math.cos(x1);
    const ky1 = cy1 * Math.sin(x1);
    const d = 2 * asin(Math.sqrt(haversin(y1 - y0) + cy0 * cy1 * haversin(x1 - x0)));
    const k = Math.sin(d);

    var interpolate = d ? function (t) {
      const B = Math.sin(t *= d) / k;
      const A = Math.sin(d - t) / k;
      const x = A * kx0 + B * kx1;
      const y = A * ky0 + B * ky1;
      const z = A * sy0 + B * sy1;

      return [
        Math.atan2(y, x) * degrees,
        Math.atan2(z, Math.sqrt(x * x + y * y)) * degrees
      ];
    } : function () {
      return [x0 * degrees, y0 * degrees];
    };

    interpolate.distance = d;

    return interpolate;
  }


  setCurveParams = (startLongitude, startLatitute, endLongitude, endLatitute) => {
    const startVec3 = this.geo_to_vec3(startLongitude, startLatitute, this.params.radius);
    const endVec3 = this.geo_to_vec3(endLongitude, endLatitute, this.params.radius);

    let altitude = startVec3.distanceTo(endVec3) * 0.75;
    altitude = Math.max(this.params.minAltitude, altitude);
    altitude = Math.min(this.params.maxAltitude, altitude);

    const interpolate = this.interpolateFunction([startLongitude, startLatitute], [endLongitude, endLatitute]);
    const mid1 = interpolate(0.25);
    const mid2 = interpolate(0.75);
    const mid1Vec3 = this.geo_to_vec3(mid1[0], mid1[1], this.params.radius + altitude);
    const mid2Vec3 = this.geo_to_vec3(mid2[0], mid2[1], this.params.radius + altitude);

    // CubicBezierCurve3(start, mid1, mid2, end)
    this.params.curve.v0 = startVec3;
    this.params.curve.v1 = mid1Vec3;
    this.params.curve.v2 = mid2Vec3;
    this.params.curve.v3 = endVec3;
  }


  // 首都の位置に◯を表示
  initCapitalCities = () => {
    const geometry = new THREE.SphereGeometry(1.0, 8, 8);
    const material = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.8,
    });

    for (let i = 0; i < capitalCities.length; i++) {
      const city = capitalCities[i];
      const p = this.geo_to_vec3(city.x, city.y, this.params.radius);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(p.x, p.y, p.z);
      this.scene.add(mesh);
    }
  }


  createCurvePositionTexture = () => {

    // 想定しているテクスチャの構造
    //
    // カーブの番号
    //      +--+--+--+--+--+--+--+
    //  ... |  |  |  |  |  |  |  |
    //      +--+--+--+--+--+--+--+
    //    1 |  |  |  |  |  |  |  |
    //      +--+--+--+--+--+--+--+
    //    0 |  |  |  |  |  |  |  |
    //      +--+--+--+--+--+--+--+
    //       0  1  2  3  4  5  ... カーブの点の数（fractionStepから割り出す）
    //
    // widthとheightは上限が16384で、この値を超えるとエラーになる
    // capitalCities配列に格納されている首都は179あるので、
    // それらをメッシュで接続すると(179)*(179)/2で約16000本のカーブを作ることになる
    // これだと多すぎるので適当に首都を間引いて、16,384以下になるようにする

    // 首都の件数がnなら、n * (n-1) / 2がカーブの本数になる
    const numCurves = capitalCities.length * (capitalCities.length - 1) / 2;

    // このカーブの本数は後で使うので保存しておく
    this.params.numCurves = numCurves;

    // カーブの解像度fractionStepから、カーブを表現する点の数を計算する
    // fractionStepは間隔なので、1/fractionStep + 1が点の数になる（+1するのを忘れないように！）
    const numPoints = 1 / this.params.fractionStep +1;

    // 1. GPUComputationRendererを初期化
    const computationRenderer = new GPUComputationRenderer(
      numPoints,      // width
      numCurves,      // height
      this.renderer,  // renderer
    );

    // 2. 初期テクスチャを作成
    const initialTexture = computationRenderer.createTexture();

    // 3. 作成した初期テクスチャに位置情報を埋め込む
    let curveIndex = 0;
    for (let i = 0; i < capitalCities.length; i++) {
      for (let j = i + 1; j < capitalCities.length; j++) {

        // 開始点の緯度経度を取得
        const startCity = capitalCities[i];
        const startLongitude = startCity.x;
        const startLatitude = startCity.y;

        // 終了点の緯度経度を取得
        const endCity = capitalCities[j];
        const endLongitude = endCity.x;
        const endLatitude = endCity.y;

        // カーブのパラメータを設定して
        this.setCurveParams(startLongitude, startLatitude, endLongitude, endLatitude);

        // カーブ上の各ポイントの位置を取得
        let fraction = 0.0;
        for (let p = 0; p < numPoints; p++) {

          // fractionの位置に相当するカーブ上の座標を取得
          const point = this.params.curve.getPointAt(fraction);

          // テクスチャとして保存する用のインデックス
          const index = (curveIndex * numPoints + p) * 4;

          // テクスチャに位置情報を埋め込む
          initialTexture.image.data[index + 0] = point.x;
          initialTexture.image.data[index + 1] = point.y;
          initialTexture.image.data[index + 2] = point.z;
          initialTexture.image.data[index + 3] = 0.0;  // 未使用

          // fractionを進める
          fraction += this.params.fractionStep;

          // floatの誤差で1.0を超えないようにする
          fraction = Math.min(1.0, fraction);
        }

        curveIndex++;
      }
    }
    // console.log(`curveIndex: ${curveIndex}`);

    // 4. 変数に紐づけるフラグメントシェーダーを作成する
    const shader = 'void main() {}';  // compute()しないので空でよい

    // 5. computationRenderer.addVariable();
    const variable = computationRenderer.addVariable(
      "texture",      // シェーダーの中で参照する名前（未使用なので何でも良い）
      shader,         // シェーダーコード
      initialTexture  // 最初に作ったテクスチャを渡す
    );

    // 6. computationRenderer.setVariableDependencies();
    computationRenderer.setVariableDependencies(variable, [variable]);

    // 7. computationRenderer.init();
    computationRenderer.init();

    // 8. テクスチャを取り出して保存しておく
    this.params.curveTexture = computationRenderer.getCurrentRenderTarget(variable).texture;

    // パーティクルを描画するときにこのテクスチャを参照するのでuniformsに値をセットしておく
    this.uniforms.u_texture_curve.value = this.params.curveTexture;
  }


  initComputationRenderer = () => {

    // 想定しているテクスチャの構造
    //
    //         0  1  2  3  4  5  99
    //        +--+--+--+--+--+--+--+
    // line 0 |  |  |  |  |  |  |  |
    //        +--+--+--+--+--+--+--+
    //      1 |  |  |  |  |  |  |  |
    //        +--+--+--+--+--+--+--+
    //   ...  |  |  |  |  |  |  |  |
    //        +--+--+--+--+--+--+--+
    //
    // widthとheightは上限が16384で、この値を超えるとエラーになる

    //
    // GPUComputationRendererを初期化
    //

    const computationRenderer = new GPUComputationRenderer(
      this.params.particleLen,  // width  尻尾の長さ
      this.params.particleNum,  // height  パーティクルの数（線の本数）
      this.renderer,            // renderer
    );

    // フレームごとにcompute()を実行する必要があるので、インスタンス変数に保存しておく
    this.computationRenderer = computationRenderer;

    //
    // computationRenderer.createTexture();
    //

    // パーティクルの位置を格納する初期テクスチャを作成して、
    const initialTexture = computationRenderer.createTexture();

    // テクスチャに情報を埋め込む、
    for (let i = 0; i < this.params.particleNum; i++) {
      // 先頭パーティクルをランダムな位置（ランダムなカーブ）に飛ばす
      const curveIndex = Math.floor(Math.random() * (this.params.numCurves - 1));
      const countDown = Math.floor(Math.random() * 90);

      for (let j = 0; j < this.params.particleNum; j++) {
        const index = (i * this.params.particleNum + j) * 4;
        initialTexture.image.data[index + 0] = curveIndex;  // 何番目のカーブにいるか
        initialTexture.image.data[index + 1] = 1.0;         // 何番目のfractionにいるか
        initialTexture.image.data[index + 2] = 0.0;         // 順向きは0.0、逆向きは1.0
        initialTexture.image.data[index + 3] = countDown;   // 新しい場所に飛ぶまでのカウントダウン
      }
    }

    //
    // 変数に紐づけるフラグメントシェーダー
    //

    // 一番左のピクセルだけ計算して、残りはフレームごとにずらしてコピーする
    //  +--+--+--+--+--+--+--+
    //  |＊|  |  |  |  |  |  |
    //  +--+--+--+--+--+--+--+
    //     ->コピー

    const fragmentShader = /* glsl */`

      // ランダムのシード（JavaScriptでMath.random()を実行して渡す）
      uniform float u_rand_seed;

      // 疑似ランダム関数
      // https://blog.mapbox.com/how-i-built-a-wind-map-with-webgl-b63022b5537f
      // https://stackoverflow.com/questions/4200224/random-noise-functions-for-glsl
      float rand(vec2 p) {
        return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
      }

      void main() {

        // UV座標を計算して
        vec2 uv = gl_FragCoord.xy / resolution.xy;

        // テクスチャから情報を取り出す(texturePositionという名前はこの後、変数の定義で作成する)
        vec4 textureValue = texture2D( texturePosition, uv );

        if (gl_FragCoord.x < 1.0) {
          // X座標が1.0未満、ということはデータテクスチャにおける左端ということ

          // どのカーブ上にいるかを取得
          float curveIndex = textureValue.x;

          // そのライン上のどのあたりにいるかを取得
          float fraction = textureValue.y;

          // 逆向きに進むかどうかを取得
          float direction = textureValue.z;

          // 新しい場所に飛ぶまでの待ち時間を取得
          float countDown = textureValue.w;

          if (direction == 0.0) {
            // 順方向に進む場合
            fraction += ${this.params.fractionStep};
            fraction = min(fraction, 1.0);
            // 最終地点に到着していたら新しい場所に飛ぶまでのカウントダウンを減らす
            if (fraction == 1.0) {
              countDown -= 1.0;
            }
          } else {
            // 逆方向の場合
            fraction -= ${this.params.fractionStep};
            fraction = max(fraction, 0.0);
            // 最終地点に到着していたら新しい場所に飛ぶまでのカウントダウンを減らす
            if (fraction == 0.0) {
              countDown -= 1.0;
            }
          }

          if (countDown <= 0.0) {
            // 新しいカーブに飛ぶ
            curveIndex = floor(rand(uv * u_rand_seed) * (${this.params.numCurves}.0 - 1.0));
            if (curveIndex == textureValue.x) {
              curveIndex += 1.0;
              if (curveIndex >= ${this.params.numCurves}.0 - 1.0) {
                curveIndex = 0.0;
              }
            }

            direction = step(0.5, rand(uv * u_rand_seed));
            fraction = direction;
            countDown = ${this.params.particleLen}.0 + rand(uv * u_rand_seed) * 90.0;
          }

          // 更新した値を書き込む
          gl_FragColor = vec4(curveIndex, fraction, direction, countDown);

        } else {

          // 一番左のピクセルの情報を取り出す
          vec4 leftMostValue = texture2D( texturePosition, vec2(0.0, uv.y) );

          // カーブの番号が違っていたら、一番左のピクセルは新しい場所に飛んだ、ということ
          if (leftMostValue.x != textureValue.x) {
            // 一番左のピクセルの値をそのままコピー
            gl_FragColor = leftMostValue;
          } else {
            // 自分の左隣のピクセルの値をそのままコピー
            vec2 leftUv = (gl_FragCoord.xy - vec2(1.0, 0.0)) / resolution.xy;
            vec4 leftValue = texture2D( texturePosition, leftUv );
            gl_FragColor = leftValue;
          }

        }
      }
    `;

    //
    // computationRenderer.addVariable();
    //

    // テクスチャと、それに対応するシェーダを指定して、変数 "texturePosition" を追加する
    // これによりシェーダーの中で texture2D( texturePosition, uv ) のように参照できるようになる
    // addVariable()の戻り値は getCurrentRenderTarget() でテクスチャを取り出すときに必要
    const variable = computationRenderer.addVariable(
      "texturePosition",  // シェーダーの中で参照する名前
      fragmentShader,     // シェーダーコード
      initialTexture      // 最初に作ったテクスチャを渡す
    );

    // フラグメントシェーダーに渡すuniformを設定する
    variable.material.uniforms = {
      // ランダムのシード
      u_rand_seed: { value: Math.random() },
    };

    //
    // computationRenderer.setVariableDependencies();
    //

    // 追加した変数の依存関係を設定する
    computationRenderer.setVariableDependencies(variable, [variable]);

    //
    // computationRenderer.init();
    //

    const error = computationRenderer.init();
    if (error !== null) {
      console.error(error);
      new Error(error);
    }

    // テクスチャオブジェクトを取得して
    // パーティクルを描画するシェーダーマテリアルのuniformsに設定する
    // compute()するたびにテクスチャのデータを更新する
    this.uniforms.u_texture_position.value = computationRenderer.getCurrentRenderTarget(variable).texture;

  }


  initParticles = () => {

    //
    // パーティクルを表すメッシュを作成する
    //

    // バッファジオメトリを作成
    const geometry = new THREE.BufferGeometry();

    // positionとuvとindicesを作成する

    // 画面上に存在するパーティクル（頂点）の個数は particleNum * particleLen なので、
    // その数だけvec3を格納できるFloat32Arrayを準備する
    const positions = new Float32Array(this.params.particleNum * this.params.particleLen * 3);

    // UVは、その数だけvec2を格納できるFloat32Arrayを準備する
    const uv = new Float32Array(this.params.particleNum * this.params.particleLen * 2);

    // indexは3個の頂点を指定して三角形のポリゴンを設定するので*3で確保する
    const indices = new Uint32Array(this.params.particleNum * this.params.particleLen * 3);

    // 各行、すなわちパーティクルごとに、
    for (let i = 0; i < this.params.particleNum; i++) {

      // 各列、すなわちパーティクルの尻尾ごとに、
      for (let j = 0; j < this.params.particleLen; j++) {

        // いま何番目の頂点を処理しているかを表すindex
        const index = i * this.params.particleLen + j;

        // 頂点のxyz座標を0で初期化
        positions[index * 3 + 0] = 0;  // X座標
        positions[index * 3 + 1] = 0;  // Y座標
        positions[index * 3 + 2] = 0;  // Z座標

        // ★★★ ここ超重要！ ★★★

        // index番目の頂点に対応するUV座標を設定する

        // UV座標を設定することで、
        // GPUComputationRendererで作成した計算用テクスチャの情報を
        // 自分自身のUV座標で取り出すことができる

        // 左下が原点なので(0, 0)、右上が(1, 1)になるようにUV座標を設定する
        // 座標は0始まりなので、i / (particleLen - 1) としないと、一番右が1.0にならない

        uv[index * 2 + 0] = j / (this.params.particleLen - 1);
        uv[index * 2 + 1] = i / (this.params.particleNum - 1);

        // indexを作成してポリゴンを構成する
        // ポリゴンは先頭の頂点とそれに続く尻尾で構成しなければならない
        // 行をまたいでポリゴンを作るとおかしなことになるので、一つの行で完結させる必要がある

        // 頂点1
        indices[index * 3 + 0] = index;

        // 頂点2 同じ行内の次の頂点を指定したいが、右に振り切れないように配慮する
        if (j < this.params.particleLen - 1) {
          indices[index * 3 + 1] = index + 1;
        } else {
          indices[index * 3 + 1] = index;
        }

        // 頂点3 これは頂点2と同じものを指定する。三角形のポリゴンにならないが、描画したいのは線なので問題ない
        indices[index * 3 + 2] = indices[index * 3 + 1];
      }
    }

    //
    // アトリビュートを設定する
    //

    // positionは使ってないので実は設置しなくても表示できてしまう
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    // uvはバーテックスシェーダーで参照しているので必須
    geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));

    // indexを設定しないと、両端を繋いでしまうので必須
    geometry.setIndex(new THREE.BufferAttribute(indices, 3));

    // シェーダーマテリアルを作成
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,

      wireframe: true,

      vertexColors: true,

      transparent: true,

      // 高い確率で同じカーブに飛ぶので、その線が白くなってしまう
      // blending: THREE.AdditiveBlending,

      vertexShader: /* glsl */`

        uniform sampler2D u_texture_position;
        uniform sampler2D u_texture_curve;

        varying vec3 vColor;
        varying vec2 vUv;

        void main() {
          // 位置情報をテクスチャから取得
          vec4 textureValue = texture2D(u_texture_position, uv);

          // どのライン上の、どの場所にいるか、を取得
          float curveIndex = textureValue.x;
          float fraction = textureValue.y;

          // カーブの座標を格納したテクスチャを参照するためのuvを計算
          vec2 curveUv = vec2(fraction, curveIndex / (${this.params.numCurves}.0 - 1.0));

          // そのラインの位置情報を取得
          vec4 curveValue = texture2D(u_texture_curve, curveUv);

          // 座標を取得
          vec3 pos = curveValue.xyz;

          // 現在位置をその値で更新
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);

          // フラグメントシェーダーに渡す
          vUv = uv;
          vColor = vec3(0.5 + curveUv.y / 10.0, 0.5 + curveUv.y / 2.0, 0.5 + curveUv.y / 10.0);
        }
      `,

      fragmentShader: /* glsl */`
        varying vec2 vUv;
        varying vec3 vColor;

        void main() {
          gl_FragColor = vec4(vColor, 0.3);
        }
      `,

    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();

    this.scene.add(mesh);
  }

}


//
// 以下、世界の首都の緯度経度データ
// https://note.com/kentoide/n/n16354c4b3458
//
// 数が多すぎるので、適当に間引いて n * (n-1) / 2 < 16384 になるようにする

const _capitalCities = [
  {
    "cptl_name": "Tokyo",
    "x": 139.7494616,
    "y": 35.6869628
  },
  {
    "cptl_name": "WashingtonD.C.",
    "x": -77.0113644,
    "y": 38.9014952
  },
  {
    "cptl_name": "Beijing",
    "x": 116.3942009,
    "y": 39.90172031
  },
];

const capitalCities = [
  {
    "OBJECTID": 1,
    "cptl_name": "Vatican City",
    "ctry_name": "Vatican",
    "adm0_a3": "VAT",
    "iso_a2": "VA",
    "ja_cptl": "バチカン",
    "ja_ctry": "バチカン市国",
    "x": 12.4533865,
    "y": 41.9032822
  },

  /*
  {
    "OBJECTID": 2,
    "cptl_name": "Alofi",
    "ctry_name": "Niue",
    "adm0_a3": "NIU",
    "iso_a2": "NZ",
    "ja_cptl": "アロフィ",
    "ja_ctry": "ニウエ",
    "x": -169.9136254,
    "y": -19.0659877
  },
  {
    "OBJECTID": 3,
    "cptl_name": "San Marino",
    "ctry_name": "San Marino",
    "adm0_a3": "SMR",
    "iso_a2": "SM",
    "ja_cptl": "サンマリノ",
    "ja_ctry": "サンマリノ",
    "x": 12.4417702,
    "y": 43.9360958
  },
  {
    "OBJECTID": 4,
    "cptl_name": "Vaduz",
    "ctry_name": "Liechtenstein",
    "adm0_a3": "LIE",
    "iso_a2": "LI",
    "ja_cptl": "ファドーツ",
    "ja_ctry": "リヒテンシュタイン",
    "x": 9.5166695,
    "y": 47.1337238
  },
  */

  {
    "OBJECTID": 5,
    "cptl_name": "Luxembourg",
    "ctry_name": "Luxembourg",
    "adm0_a3": "LUX",
    "iso_a2": "LU",
    "ja_cptl": "ルクセンブルク",
    "ja_ctry": "ルクセンブルク",
    "x": 6.1300028,
    "y": 49.6116604
  },

  /*
  {
    "OBJECTID": 6,
    "cptl_name": "Palikir",
    "ctry_name": "Federated States of Micronesia",
    "adm0_a3": "FSM",
    "iso_a2": "FM",
    "ja_cptl": "パリキール",
    "ja_ctry": "ミクロネシア",
    "x": 158.1499743,
    "y": 6.9166437
  },
  {
    "OBJECTID": 7,
    "cptl_name": "Majuro",
    "ctry_name": "Marshall Islands",
    "adm0_a3": "MHL",
    "iso_a2": "MH",
    "ja_cptl": "マジュロ",
    "ja_ctry": "マーシャル諸島",
    "x": 171.3800002,
    "y": 7.1030043
  },
  {
    "OBJECTID": 8,
    "cptl_name": "Funafuti",
    "ctry_name": "Tuvalu",
    "adm0_a3": "TUV",
    "iso_a2": "TV",
    "ja_cptl": "フナフティ",
    "ja_ctry": "ツバル",
    "x": 179.2166471,
    "y": -8.516652
  },
  {
    "OBJECTID": 9,
    "cptl_name": "Melekeok",
    "ctry_name": "Palau",
    "adm0_a3": "PLW",
    "iso_a2": "PW",
    "ja_cptl": "マルキョク",
    "ja_ctry": "パラオ",
    "x": 134.6265485,
    "y": 7.4873962
  },
  {
    "OBJECTID": 10,
    "cptl_name": "Monaco",
    "ctry_name": "Monaco",
    "adm0_a3": "MCO",
    "iso_a2": "MC",
    "ja_cptl": "モナコ",
    "ja_ctry": "モナコ",
    "x": 7.4069132,
    "y": 43.7396457
  },
  {
    "OBJECTID": 11,
    "cptl_name": "Tarawa",
    "ctry_name": "Kiribati",
    "adm0_a3": "KIR",
    "iso_a2": "KI",
    "ja_cptl": "タラワ",
    "ja_ctry": "キリバス",
    "x": 173.0175708,
    "y": 1.3381875
  },
  {
    "OBJECTID": 12,
    "cptl_name": "Moroni",
    "ctry_name": "Comoros",
    "adm0_a3": "COM",
    "iso_a2": "KM",
    "ja_cptl": "モロニ",
    "ja_ctry": "コモロ",
    "x": 43.2402441,
    "y": -11.7041577
  },
  {
    "OBJECTID": 13,
    "cptl_name": "Andorra",
    "ctry_name": "Andorra",
    "adm0_a3": "AND",
    "iso_a2": "AD",
    "ja_cptl": "アンドララベリャ",
    "ja_ctry": "アンドラ",
    "x": 1.516486,
    "y": 42.5000014
  },
  {
    "OBJECTID": 14,
    "cptl_name": "Avarua",
    "ctry_name": "Cook Islands",
    "adm0_a3": "COK",
    "iso_a2": "CK",
    "ja_cptl": "アバルア",
    "ja_ctry": "クック諸島",
    "x": -159.7854367,
    "y": -21.1962256
  },
  {
    "OBJECTID": 15,
    "cptl_name": "Port-of-Spain",
    "ctry_name": "Trinidad and Tobago",
    "adm0_a3": "TTO",
    "iso_a2": "TT",
    "ja_cptl": "ポートオブスペイン",
    "ja_ctry": "トリニダードトバゴ",
    "x": -61.5170309,
    "y": 10.6519971
  },
  {
    "OBJECTID": 16,
    "cptl_name": "Kigali",
    "ctry_name": "Rwanda",
    "adm0_a3": "RWA",
    "iso_a2": "RW",
    "ja_cptl": "キガリ",
    "ja_ctry": "ルワンダ",
    "x": 30.0585859,
    "y": -1.9516442
  },
  {
    "OBJECTID": 17,
    "cptl_name": "Mbabane",
    "ctry_name": "eSwatini",
    "adm0_a3": "SWZ",
    "iso_a2": "SZ",
    "ja_cptl": "ムババーネ",
    "ja_ctry": "エスワティニ",
    "x": 31.1333345,
    "y": -26.3166508
  },
  {
    "OBJECTID": 18,
    "cptl_name": "Juba",
    "ctry_name": "South Sudan",
    "adm0_a3": "SSD",
    "iso_a2": "SS",
    "ja_cptl": "ジュバ",
    "ja_ctry": "南スーダン",
    "x": 31.5800256,
    "y": 4.8299752
  },
  */

  {
    "OBJECTID": 19,
    "cptl_name": "Ljubljana",
    "ctry_name": "Slovenia",
    "adm0_a3": "SVN",
    "iso_a2": "SI",
    "ja_cptl": "リュブリャナ",
    "ja_ctry": "スロベニア",
    "x": 14.514969,
    "y": 46.0552883
  },
  {
    "OBJECTID": 20,
    "cptl_name": "Bratislava",
    "ctry_name": "Slovakia",
    "adm0_a3": "SVK",
    "iso_a2": "SK",
    "ja_cptl": "ブラチスラバ",
    "ja_ctry": "スロバキア",
    "x": 17.1169808,
    "y": 48.1500183
  },
  {
    "OBJECTID": 21,
    "cptl_name": "Doha",
    "ctry_name": "Qatar",
    "adm0_a3": "QAT",
    "iso_a2": "QA",
    "ja_cptl": "ドーハ",
    "ja_ctry": "カタール",
    "x": 51.5329679,
    "y": 25.286556
  },
  {
    "OBJECTID": 22,
    "cptl_name": "Podgorica",
    "ctry_name": "Montenegro",
    "adm0_a3": "MNE",
    "iso_a2": "ME",
    "ja_cptl": "ポドゴリツァ",
    "ja_ctry": "モンテネグロ",
    "x": 19.2663069,
    "y": 42.4659725
  },
  {
    "OBJECTID": 23,
    "cptl_name": "Bern",
    "ctry_name": "Switzerland",
    "adm0_a3": "CHE",
    "iso_a2": "CH",
    "ja_cptl": "ベルン",
    "ja_ctry": "スイス",
    "x": 7.4669755,
    "y": 46.9166828
  },
  {
    "OBJECTID": 24,
    "cptl_name": "Pristina",
    "ctry_name": "Kosovo",
    "adm0_a3": "KOS",
    "iso_a2": -99,
    "ja_cptl": "プリシュティナ",
    "ja_ctry": "コソボ",
    "x": 21.1659843,
    "y": 42.6667096
  },
  {
    "OBJECTID": 25,
    "cptl_name": "Roseau",
    "ctry_name": "Dominica",
    "adm0_a3": "DMA",
    "iso_a2": "DM",
    "ja_cptl": "ロゾー",
    "ja_ctry": "ドミニカ",
    "x": -61.387013,
    "y": 15.3010156
  },

  /*
  {
    "OBJECTID": 26,
    "cptl_name": "Djibouti",
    "ctry_name": "Djibouti",
    "adm0_a3": "DJI",
    "iso_a2": "DJ",
    "ja_cptl": "ジブチ",
    "ja_ctry": "ジブチ",
    "x": 43.1480017,
    "y": 11.5950145
  },
  {
    "OBJECTID": 27,
    "cptl_name": "Banjul",
    "ctry_name": "The Gambia",
    "adm0_a3": "GMB",
    "iso_a2": "GM",
    "ja_cptl": "バンジュール",
    "ja_ctry": "ガンビア",
    "x": -16.5917015,
    "y": 13.4538765
  },
  {
    "OBJECTID": 28,
    "cptl_name": "Skopje",
    "ctry_name": "North Macedonia",
    "adm0_a3": "MKD",
    "iso_a2": "MK",
    "ja_cptl": "スコピエ",
    "ja_ctry": "北マケドニア",
    "x": 21.4334615,
    "y": 42.0000061
  },
  {
    "OBJECTID": 29,
    "cptl_name": "Bridgetown",
    "ctry_name": "Barbados",
    "adm0_a3": "BRB",
    "iso_a2": "BB",
    "ja_cptl": "ブリッジタウン",
    "ja_ctry": "バルバドス",
    "x": -59.6165267,
    "y": 13.1020026
  },
  {
    "OBJECTID": 30,
    "cptl_name": "Bujumbura",
    "ctry_name": "Burundi",
    "adm0_a3": "BDI",
    "iso_a2": "BI",
    "ja_cptl": "ブジュンブラ",
    "ja_ctry": "ブルンジ",
    "x": 29.3600061,
    "y": -3.3760872
  },
  {
    "OBJECTID": 31,
    "cptl_name": "Kingstown",
    "ctry_name": "Saint Vincent and the Grenadines",
    "adm0_a3": "VCT",
    "iso_a2": "VC",
    "ja_cptl": "キングスタウン",
    "ja_ctry": "セントビンセント及びグレナディーン諸島",
    "x": -61.2120624,
    "y": 13.1482788
  },
  {
    "OBJECTID": 32,
    "cptl_name": "Castries",
    "ctry_name": "Saint Lucia",
    "adm0_a3": "LCA",
    "iso_a2": "LC",
    "ja_cptl": "カストリーズ",
    "ja_ctry": "セントルシア",
    "x": -61.0000082,
    "y": 14.0019735
  },
  {
    "OBJECTID": 33,
    "cptl_name": "Basseterre",
    "ctry_name": "Saint Kitts and Nevis",
    "adm0_a3": "KNA",
    "iso_a2": "KN",
    "ja_cptl": "バセテール",
    "ja_ctry": "セントクリストファー・ネービス",
    "x": -62.7170093,
    "y": 17.3020305
  },
  {
    "OBJECTID": 34,
    "cptl_name": "Port Louis",
    "ctry_name": "Mauritius",
    "adm0_a3": "MUS",
    "iso_a2": "MU",
    "ja_cptl": "ポートルイス",
    "ja_ctry": "モーリシャス",
    "x": 57.4999939,
    "y": -20.1666386
  },
  {
    "OBJECTID": 35,
    "cptl_name": "Saint George's",
    "ctry_name": "Grenada",
    "adm0_a3": "GRD",
    "iso_a2": "GD",
    "ja_cptl": "セントジョージズ",
    "ja_ctry": "グレナダ",
    "x": -61.7416432,
    "y": 12.0526334
  },
  {
    "OBJECTID": 36,
    "cptl_name": "Manama",
    "ctry_name": "Bahrain",
    "adm0_a3": "BHR",
    "iso_a2": "BH",
    "ja_cptl": "マナーマ",
    "ja_ctry": "バーレーン",
    "x": 50.5830517,
    "y": 26.2361363
  },
  {
    "OBJECTID": 37,
    "cptl_name": "Saint John's",
    "ctry_name": "Antigua and Barbuda",
    "adm0_a3": "ATG",
    "iso_a2": "AG",
    "ja_cptl": "セントジョンズ",
    "ja_ctry": "アンティグア・バーブーダ",
    "x": -61.8500338,
    "y": 17.1180365
  },
  {
    "OBJECTID": 38,
    "cptl_name": "Montevideo",
    "ctry_name": "Uruguay",
    "adm0_a3": "URY",
    "iso_a2": "UY",
    "ja_cptl": "モンテビデオ",
    "ja_ctry": "ウルグアイ",
    "x": -56.1729981,
    "y": -34.8560957
  },
  {
    "OBJECTID": 39,
    "cptl_name": "Lom?",
    "ctry_name": "Togo",
    "adm0_a3": "TGO",
    "iso_a2": "TG",
    "ja_cptl": "ロメ",
    "ja_ctry": "トーゴ",
    "x": 1.2208113,
    "y": 6.1338829
  },
  {
    "OBJECTID": 40,
    "cptl_name": "Tunis",
    "ctry_name": "Tunisia",
    "adm0_a3": "TUN",
    "iso_a2": "TN",
    "ja_cptl": "チュニス",
    "ja_ctry": "チュニジア",
    "x": 10.1796781,
    "y": 36.8027781
  },
  */

  {
    "OBJECTID": 41,
    "cptl_name": "Abu Dhabi",
    "ctry_name": "United Arab Emirates",
    "adm0_a3": "ARE",
    "iso_a2": "AE",
    "ja_cptl": "アブダビ",
    "ja_ctry": "アラブ首長国連邦",
    "x": 54.3665934,
    "y": 24.4666836
  },
  /*
  {
    "OBJECTID": 42,
    "cptl_name": "Ashgabat",
    "ctry_name": "Turkmenistan",
    "adm0_a3": "TKM",
    "iso_a2": "TM",
    "ja_cptl": "アシガバット",
    "ja_ctry": "トルクメニスタン",
    "x": 58.3832991,
    "y": 37.9499949
  },
  {
    "OBJECTID": 43,
    "cptl_name": "Lusaka",
    "ctry_name": "Zambia",
    "adm0_a3": "ZMB",
    "iso_a2": "ZM",
    "ja_cptl": "ルサカ",
    "ja_ctry": "ザンビア",
    "x": 28.2813817,
    "y": -15.4146984
  },
  {
    "OBJECTID": 44,
    "cptl_name": "Harare",
    "ctry_name": "Zimbabwe",
    "adm0_a3": "ZWE",
    "iso_a2": "ZW",
    "ja_cptl": "ハラレ",
    "ja_ctry": "ジンバブエ",
    "x": 31.0427636,
    "y": -17.8158438
  },
  {
    "OBJECTID": 45,
    "cptl_name": "Dili",
    "ctry_name": "East Timor",
    "adm0_a3": "TLS",
    "iso_a2": "TL",
    "ja_cptl": "ディリ",
    "ja_ctry": "東ティモール",
    "x": 125.5794559,
    "y": -8.5593884
  },
  {
    "OBJECTID": 46,
    "cptl_name": "Port Vila",
    "ctry_name": "Vanuatu",
    "adm0_a3": "VUT",
    "iso_a2": "VU",
    "ja_cptl": "ポートビラ",
    "ja_ctry": "バヌアツ",
    "x": 168.3166406,
    "y": -17.7333504
  },
  {
    "OBJECTID": 47,
    "cptl_name": "Tegucigalpa",
    "ctry_name": "Honduras",
    "adm0_a3": "HND",
    "iso_a2": "HN",
    "ja_cptl": "テグシガルパ",
    "ja_ctry": "ホンジュラス",
    "x": -87.2194752,
    "y": 14.1039908
  },
  {
    "OBJECTID": 48,
    "cptl_name": "Georgetown",
    "ctry_name": "Guyana",
    "adm0_a3": "GUY",
    "iso_a2": "GY",
    "ja_cptl": "ジョージタウン",
    "ja_ctry": "ガイアナ",
    "x": -58.1670286,
    "y": 6.8019737
  },
  {
    "OBJECTID": 49,
    "cptl_name": "Reykjav?k",
    "ctry_name": "Iceland",
    "adm0_a3": "ISL",
    "iso_a2": "IS",
    "ja_cptl": "レイキャビク",
    "ja_ctry": "アイスランド",
    "x": -21.9500145,
    "y": 64.1500236
  },
  {
    "OBJECTID": 50,
    "cptl_name": "Port-au-Prince",
    "ctry_name": "Haiti",
    "adm0_a3": "HTI",
    "iso_a2": "HT",
    "ja_cptl": "ポルトープランス",
    "ja_ctry": "ハイチ",
    "x": -72.3379804,
    "y": 18.5429705
  },
  {
    "OBJECTID": 51,
    "cptl_name": "Kampala",
    "ctry_name": "Uganda",
    "adm0_a3": "UGA",
    "iso_a2": "UG",
    "ja_cptl": "カンパラ",
    "ja_ctry": "ウガンダ",
    "x": 32.5813777,
    "y": 0.3186048
  },
  {
    "OBJECTID": 52,
    "cptl_name": "Paramaribo",
    "ctry_name": "Suriname",
    "adm0_a3": "SUR",
    "iso_a2": "SR",
    "ja_cptl": "パラマリポ",
    "ja_ctry": "スリナム",
    "x": -55.1670309,
    "y": 5.8350301
  },
  {
    "OBJECTID": 53,
    "cptl_name": "Niamey",
    "ctry_name": "Niger",
    "adm0_a3": "NER",
    "iso_a2": "NE",
    "ja_cptl": "ニアメ",
    "ja_ctry": "ニジェール",
    "x": 2.1147102,
    "y": 13.5186518
  },
  {
    "OBJECTID": 54,
    "cptl_name": "Dushanbe",
    "ctry_name": "Tajikistan",
    "adm0_a3": "TJK",
    "iso_a2": "TJ",
    "ja_cptl": "ドゥシャンベ",
    "ja_ctry": "タジキスタン",
    "x": 68.7738794,
    "y": 38.5600352
  },
  {
    "OBJECTID": 55,
    "cptl_name": "Asunci?n",
    "ctry_name": "Paraguay",
    "adm0_a3": "PRY",
    "iso_a2": "PY",
    "ja_cptl": "アスンシオン",
    "ja_ctry": "パラグアイ",
    "x": -57.643451,
    "y": -25.2944571
  },
  {
    "OBJECTID": 56,
    "cptl_name": "Managua",
    "ctry_name": "Nicaragua",
    "adm0_a3": "NIC",
    "iso_a2": "NI",
    "ja_cptl": "マナグア",
    "ja_ctry": "ニカラグア",
    "x": -86.2704375,
    "y": 12.1549624
  },
  {
    "OBJECTID": 57,
    "cptl_name": "Freetown",
    "ctry_name": "Sierra Leone",
    "adm0_a3": "SLE",
    "iso_a2": "SL",
    "ja_cptl": "フリータウン",
    "ja_ctry": "シエラレオネ",
    "x": -13.2361616,
    "y": 8.4719573
  },
  */

  {
    "OBJECTID": 58,
    "cptl_name": "Islamabad",
    "ctry_name": "Pakistan",
    "adm0_a3": "PAK",
    "iso_a2": "PK",
    "ja_cptl": "イスラマバード",
    "ja_ctry": "パキスタン",
    "x": 73.08063018,
    "y": 33.68936848
  },
  {
    "OBJECTID": 59,
    "cptl_name": "Kathmandu",
    "ctry_name": "Nepal",
    "adm0_a3": "NPL",
    "iso_a2": "NP",
    "ja_cptl": "カトマンズ",
    "ja_ctry": "ネパール",
    "x": 85.3146964,
    "y": 27.7186378
  },
  {
    "OBJECTID": 60,
    "cptl_name": "Pretoria",
    "ctry_name": "South Africa",
    "adm0_a3": "ZAF",
    "iso_a2": "ZA",
    "ja_cptl": "プレトリア",
    "ja_ctry": "南アフリカ共和国",
    "x": 28.2274832,
    "y": -25.7049747
  },
  {
    "OBJECTID": 61,
    "cptl_name": "Port Moresby",
    "ctry_name": "Papua New Guinea",
    "adm0_a3": "PNG",
    "iso_a2": "PG",
    "ja_cptl": "ポートモレスビー",
    "ja_ctry": "パプアニューギニア",
    "x": 147.1925036,
    "y": -9.4647078
  },

  /*
  {
    "OBJECTID": 62,
    "cptl_name": "Honiara",
    "ctry_name": "Solomon Islands",
    "adm0_a3": "SLB",
    "iso_a2": "SB",
    "ja_cptl": "ホニアラ",
    "ja_ctry": "ソロモン諸島",
    "x": 159.9497657,
    "y": -9.4379943
  },
  {
    "OBJECTID": 63,
    "cptl_name": "Panama City",
    "ctry_name": "Panama",
    "adm0_a3": "PAN",
    "iso_a2": "PA",
    "ja_cptl": "パナマシティ",
    "ja_ctry": "パナマ",
    "x": -79.534983,
    "y": 8.969963
  },
  {
    "OBJECTID": 64,
    "cptl_name": "Rabat",
    "ctry_name": "Morocco",
    "adm0_a3": "MAR",
    "iso_a2": "MA",
    "ja_cptl": "ラバト",
    "ja_ctry": "モロッコ",
    "x": -6.8364082,
    "y": 34.0253073
  },
  {
    "OBJECTID": 65,
    "cptl_name": "Chi?in?u",
    "ctry_name": "Moldova",
    "adm0_a3": "MDA",
    "iso_a2": "MD",
    "ja_cptl": "キシナウ",
    "ja_ctry": "モルドバ",
    "x": 28.8577111,
    "y": 47.0050236
  },
  {
    "OBJECTID": 66,
    "cptl_name": "Maputo",
    "ctry_name": "Mozambique",
    "adm0_a3": "MOZ",
    "iso_a2": "MZ",
    "ja_cptl": "マプト",
    "ja_ctry": "モザンビーク",
    "x": 32.5872171,
    "y": -25.9533316
  },
  {
    "OBJECTID": 67,
    "cptl_name": "Mogadishu",
    "ctry_name": "Somalia",
    "adm0_a3": "SOM",
    "iso_a2": "SO",
    "ja_cptl": "モガディシュ",
    "ja_ctry": "ソマリア",
    "x": 45.3647318,
    "y": 2.0686272
  },
  {
    "OBJECTID": 68,
    "cptl_name": "Muscat",
    "ctry_name": "Oman",
    "adm0_a3": "OMN",
    "iso_a2": "OM",
    "ja_cptl": "マスカット",
    "ja_ctry": "オマーン",
    "x": 58.5933121,
    "y": 23.6133248
  },
  {
    "OBJECTID": 69,
    "cptl_name": "Sri Jayawardenepura Kotte",
    "ctry_name": "Sri Lanka",
    "adm0_a3": "LKA",
    "iso_a2": "LK",
    "ja_cptl": "スリジャヤワルダナプラコッテ",
    "ja_ctry": "スリランカ",
    "x": 79.89784844,
    "y": 6.885989744
  },
  {
    "OBJECTID": 70,
    "cptl_name": "Ulaanbaatar",
    "ctry_name": "Mongolia",
    "adm0_a3": "MNG",
    "iso_a2": "MN",
    "ja_cptl": "ウランバートル",
    "ja_ctry": "モンゴル",
    "x": 106.9146699,
    "y": 47.9186193
  },
  {
    "OBJECTID": 71,
    "cptl_name": "Windhoek",
    "ctry_name": "Namibia",
    "adm0_a3": "NAM",
    "iso_a2": "NA",
    "ja_cptl": "ウィントフック",
    "ja_ctry": "ナミビア",
    "x": 17.0835461,
    "y": -22.5700061
  },
  {
    "OBJECTID": 72,
    "cptl_name": "Abuja",
    "ctry_name": "Nigeria",
    "adm0_a3": "NGA",
    "iso_a2": "NG",
    "ja_cptl": "アブジャ",
    "ja_ctry": "ナイジェリア",
    "x": 7.5313821,
    "y": 9.085279
  },
  {
    "OBJECTID": 73,
    "cptl_name": "Bissau",
    "ctry_name": "Guinea Bissau",
    "adm0_a3": "GNB",
    "iso_a2": "GW",
    "ja_cptl": "ビサウ",
    "ja_ctry": "ギニアビサウ",
    "x": -15.5983608,
    "y": 11.8650238
  },
  {
    "OBJECTID": 74,
    "cptl_name": "Amman",
    "ctry_name": "Jordan",
    "adm0_a3": "JOR",
    "iso_a2": "JO",
    "ja_cptl": "アンマン",
    "ja_ctry": "ヨルダン",
    "x": 35.9313541,
    "y": 31.9519711
  },
  {
    "OBJECTID": 75,
    "cptl_name": "Vilnius",
    "ctry_name": "Lithuania",
    "adm0_a3": "LTU",
    "iso_a2": "LT",
    "ja_cptl": "ビリニュス",
    "ja_ctry": "リトアニア",
    "x": 25.3166353,
    "y": 54.6833663
  },
  {
    "OBJECTID": 76,
    "cptl_name": "Riga",
    "ctry_name": "Latvia",
    "adm0_a3": "LVA",
    "iso_a2": "LV",
    "ja_cptl": "リガ",
    "ja_ctry": "ラトビア",
    "x": 24.0999654,
    "y": 56.9500238
  },
  {
    "OBJECTID": 77,
    "cptl_name": "Bishkek",
    "ctry_name": "Kyrgyzstan",
    "adm0_a3": "KGZ",
    "iso_a2": "KG",
    "ja_cptl": "ビシュケク",
    "ja_ctry": "キルギス",
    "x": 74.5832584,
    "y": 42.8750253
  },
  {
    "OBJECTID": 78,
    "cptl_name": "Maseru",
    "ctry_name": "Lesotho",
    "adm0_a3": "LSO",
    "iso_a2": "LS",
    "ja_cptl": "マセル",
    "ja_ctry": "レソト",
    "x": 27.4832731,
    "y": -29.3166744
  },
  {
    "OBJECTID": 79,
    "cptl_name": "Antananarivo",
    "ctry_name": "Madagascar",
    "adm0_a3": "MDG",
    "iso_a2": "MG",
    "ja_cptl": "アンタナナリボ",
    "ja_ctry": "マダガスカル",
    "x": 47.514678,
    "y": -18.9146915
  },
  {
    "OBJECTID": 80,
    "cptl_name": "Quito",
    "ctry_name": "Ecuador",
    "adm0_a3": "ECU",
    "iso_a2": "EC",
    "ja_cptl": "キト",
    "ja_ctry": "エクアドル",
    "x": -78.501997,
    "y": -0.2130423
  },
  */

  {
    "OBJECTID": 81,
    "cptl_name": "San Jos?",
    "ctry_name": "Costa Rica",
    "adm0_a3": "CRI",
    "iso_a2": "CR",
    "ja_cptl": "サンホセ",
    "ja_ctry": "コスタリカ",
    "x": -84.0859972,
    "y": 9.9369583
  },
  {
    "OBJECTID": 82,
    "cptl_name": "San Salvador",
    "ctry_name": "El Salvador",
    "adm0_a3": "SLV",
    "iso_a2": "SV",
    "ja_cptl": "サンサルバドル",
    "ja_ctry": "エルサルバドル",
    "x": -89.2049871,
    "y": 13.7119475
  },
  {
    "OBJECTID": 83,
    "cptl_name": "Kingston",
    "ctry_name": "Jamaica",
    "adm0_a3": "JAM",
    "iso_a2": "JM",
    "ja_cptl": "キングストン",
    "ja_ctry": "ジャマイカ",
    "x": -76.7674337,
    "y": 17.9770766
  },
  {
    "OBJECTID": 84,
    "cptl_name": "Ndjamena",
    "ctry_name": "Chad",
    "adm0_a3": "TCD",
    "iso_a2": "TD",
    "ja_cptl": "ンジャメナ",
    "ja_ctry": "チャド",
    "x": 15.0472025,
    "y": 12.1150424
  },
  {
    "OBJECTID": 85,
    "cptl_name": "Malabo",
    "ctry_name": "Equatorial Guinea",
    "adm0_a3": "GNQ",
    "iso_a2": "GQ",
    "ja_cptl": "マラボ",
    "ja_ctry": "赤道ギニア",
    "x": 8.7832775,
    "y": 3.7500153
  },

  /*
  {
    "OBJECTID": 86,
    "cptl_name": "Asmara",
    "ctry_name": "Eritrea",
    "adm0_a3": "ERI",
    "iso_a2": "ER",
    "ja_cptl": "アスマラ",
    "ja_ctry": "エリトリア",
    "x": 38.9333235,
    "y": 15.3333393
  },
  {
    "OBJECTID": 87,
    "cptl_name": "Zagreb",
    "ctry_name": "Croatia",
    "adm0_a3": "HRV",
    "iso_a2": "HR",
    "ja_cptl": "ザグレブ",
    "ja_ctry": "クロアチア",
    "x": 15.9999947,
    "y": 45.8000067
  },
  {
    "OBJECTID": 88,
    "cptl_name": "Tallinn",
    "ctry_name": "Estonia",
    "adm0_a3": "EST",
    "iso_a2": "EE",
    "ja_cptl": "タリン",
    "ja_ctry": "エストニア",
    "x": 24.7280407,
    "y": 59.4338774
  },
  {
    "OBJECTID": 89,
    "cptl_name": "Lilongwe",
    "ctry_name": "Malawi",
    "adm0_a3": "MWI",
    "iso_a2": "MW",
    "ja_cptl": "リロングウェ",
    "ja_ctry": "マラウイ",
    "x": 33.783302,
    "y": -13.9832951
  },
  {
    "OBJECTID": 90,
    "cptl_name": "Guatemala",
    "ctry_name": "Guatemala",
    "adm0_a3": "GTM",
    "iso_a2": "GT",
    "ja_cptl": "グアテマラシティ",
    "ja_ctry": "グアテマラ",
    "x": -90.5289114,
    "y": 14.6230805
  },
  {
    "OBJECTID": 91,
    "cptl_name": "Libreville",
    "ctry_name": "Gabon",
    "adm0_a3": "GAB",
    "iso_a2": "GA",
    "ja_cptl": "リーブルビル",
    "ja_ctry": "ガボン",
    "x": 9.457965,
    "y": 0.3853886
  },
  {
    "OBJECTID": 92,
    "cptl_name": "Suva",
    "ctry_name": "Fiji",
    "adm0_a3": "FJI",
    "iso_a2": "FJ",
    "ja_cptl": "スバ",
    "ja_ctry": "フィジー",
    "x": 178.4417073,
    "y": -18.1330159
  },
  {
    "OBJECTID": 93,
    "cptl_name": "Nouakchott",
    "ctry_name": "Mauritania",
    "adm0_a3": "MRT",
    "iso_a2": "MR",
    "ja_cptl": "ヌアクショット",
    "ja_ctry": "モーリタニア",
    "x": -15.9753404,
    "y": 18.086427
  },
  {
    "OBJECTID": 94,
    "cptl_name": "Bamako",
    "ctry_name": "Mali",
    "adm0_a3": "MLI",
    "iso_a2": "ML",
    "ja_cptl": "バマコ",
    "ja_ctry": "マリ",
    "x": -8.001985,
    "y": 12.6519605
  },
  {
    "OBJECTID": 95,
    "cptl_name": "Beirut",
    "ctry_name": "Lebanon",
    "adm0_a3": "LBN",
    "iso_a2": "LB",
    "ja_cptl": "ベイルート",
    "ja_ctry": "レバノン",
    "x": 35.5077624,
    "y": 33.873921
  },
  {
    "OBJECTID": 96,
    "cptl_name": "Tbilisi",
    "ctry_name": "Georgia",
    "adm0_a3": "GEO",
    "iso_a2": "GE",
    "ja_cptl": "トビリシ",
    "ja_ctry": "ジョージア",
    "x": 44.7888496,
    "y": 41.7269558
  },
  {
    "OBJECTID": 97,
    "cptl_name": "Astana",
    "ctry_name": "Kazakhstan",
    "adm0_a3": "KAZ",
    "iso_a2": "KZ",
    "ja_cptl": "アスタナ",
    "ja_ctry": "カザフスタン",
    "x": 71.4277742,
    "y": 51.1811253
  },
  {
    "OBJECTID": 98,
    "cptl_name": "Vientiane",
    "ctry_name": "Laos",
    "adm0_a3": "LAO",
    "iso_a2": "LA",
    "ja_cptl": "ビエンチャン",
    "ja_ctry": "ラオス",
    "x": 102.59998,
    "y": 17.9666927
  },
  {
    "OBJECTID": 99,
    "cptl_name": "Brazzaville",
    "ctry_name": "Congo (Brazzaville)",
    "adm0_a3": "COG",
    "iso_a2": "CG",
    "ja_cptl": "ブラザビル",
    "ja_ctry": "コンゴ共和国",
    "x": 15.2827436,
    "y": -4.2572399
  },
  */

  {
    "OBJECTID": 100,
    "cptl_name": "Conakry",
    "ctry_name": "Guinea",
    "adm0_a3": "GIN",
    "iso_a2": "GN",
    "ja_cptl": "コナクリ",
    "ja_ctry": "ギニア",
    "x": -13.6821809,
    "y": 9.5334687
  },
  {
    "OBJECTID": 101,
    "cptl_name": "Yamoussoukro",
    "ctry_name": "Ivory Coast",
    "adm0_a3": "CIV",
    "iso_a2": "CI",
    "ja_cptl": "ヤムスクロ",
    "ja_ctry": "コートジボワール",
    "x": -5.2755026,
    "y": 6.818381
  },
  {
    "OBJECTID": 102,
    "cptl_name": "Ottawa",
    "ctry_name": "Canada",
    "adm0_a3": "CAN",
    "iso_a2": "CA",
    "ja_cptl": "オタワ",
    "ja_ctry": "カナダ",
    "x": -75.7019612,
    "y": 45.4186427
  },
  {
    "OBJECTID": 103,
    "cptl_name": "Belgrade",
    "ctry_name": "Serbia",
    "adm0_a3": "SRB",
    "iso_a2": "RS",
    "ja_cptl": "ベオグラード",
    "ja_ctry": "セルビア",
    "x": 20.4660448,
    "y": 44.8205913
  },
  {
    "OBJECTID": 104,
    "cptl_name": "Bandar Seri Begawan",
    "ctry_name": "Brunei",
    "adm0_a3": "BRN",
    "iso_a2": "BN",
    "ja_cptl": "バンダルスリブガワン",
    "ja_ctry": "ブルネイ",
    "x": 114.9332841,
    "y": 4.8833311
  },
  {
    "OBJECTID": 105,
    "cptl_name": "Belmopan",
    "ctry_name": "Belize",
    "adm0_a3": "BLZ",
    "iso_a2": "BZ",
    "ja_cptl": "ベルモパン",
    "ja_ctry": "ベリーズ",
    "x": -88.767073,
    "y": 17.2520335
  },
  {
    "OBJECTID": 106,
    "cptl_name": "Bangui",
    "ctry_name": "Central African Republic",
    "adm0_a3": "CAF",
    "iso_a2": "CF",
    "ja_cptl": "バンギ",
    "ja_ctry": "中央アフリカ",
    "x": 18.5582881,
    "y": 4.3666443
  },
  {
    "OBJECTID": 107,
    "cptl_name": "Yaounde",
    "ctry_name": "Cameroon",
    "adm0_a3": "CMR",
    "iso_a2": "CM",
    "ja_cptl": "ヤウンデ",
    "ja_ctry": "カメルーン",
    "x": 11.5147049,
    "y": 3.8686465
  },

  /*
  {
    "OBJECTID": 108,
    "cptl_name": "Tirana",
    "ctry_name": "Albania",
    "adm0_a3": "ALB",
    "iso_a2": "AL",
    "ja_cptl": "ティラナ",
    "ja_ctry": "アルバニア",
    "x": 19.818883,
    "y": 41.3275407
  },
  {
    "OBJECTID": 109,
    "cptl_name": "Yerevan",
    "ctry_name": "Armenia",
    "adm0_a3": "ARM",
    "iso_a2": "AM",
    "ja_cptl": "エレバン",
    "ja_ctry": "アルメニア",
    "x": 44.5116055,
    "y": 40.1830966
  },
  {
    "OBJECTID": 110,
    "cptl_name": "Baku",
    "ctry_name": "Azerbaijan",
    "adm0_a3": "AZE",
    "iso_a2": "AZ",
    "ja_cptl": "バクー",
    "ja_ctry": "アゼルバイジャン",
    "x": 49.8602713,
    "y": 40.3972179
  },
  */

  {
    "OBJECTID": 111,
    "cptl_name": "Phnom Penh",
    "ctry_name": "Cambodia",
    "adm0_a3": "KHM",
    "iso_a2": "KH",
    "ja_cptl": "プノンペン",
    "ja_ctry": "カンボジア",
    "x": 104.9146886,
    "y": 11.551976
  },
  {
    "OBJECTID": 112,
    "cptl_name": "La Paz",
    "ctry_name": "Bolivia",
    "adm0_a3": "BOL",
    "iso_a2": "BO",
    "ja_cptl": "ラパス",
    "ja_ctry": "ボリビア",
    "x": -68.151931,
    "y": -16.4960278
  },
  {
    "OBJECTID": 113,
    "cptl_name": "Porto-Novo",
    "ctry_name": "Benin",
    "adm0_a3": "BEN",
    "iso_a2": "BJ",
    "ja_cptl": "ポルトノボ",
    "ja_ctry": "ベナン",
    "x": 2.615622773,
    "y": 6.487947861
  },
  {
    "OBJECTID": 114,
    "cptl_name": "Sofia",
    "ctry_name": "Bulgaria",
    "adm0_a3": "BGR",
    "iso_a2": "BG",
    "ja_cptl": "ソフィア",
    "ja_ctry": "ブルガリア",
    "x": 23.3147082,
    "y": 42.6852953
  },
  {
    "OBJECTID": 115,
    "cptl_name": "Minsk",
    "ctry_name": "Belarus",
    "adm0_a3": "BLR",
    "iso_a2": "BY",
    "ja_cptl": "ミンスク",
    "ja_ctry": "ベラルーシ",
    "x": 27.5646813,
    "y": 53.9019233
  },
  {
    "OBJECTID": 116,
    "cptl_name": "Thimphu",
    "ctry_name": "Bhutan",
    "adm0_a3": "BTN",
    "iso_a2": "BT",
    "ja_cptl": "ティンプー",
    "ja_ctry": "ブータン",
    "x": 89.639014,
    "y": 27.4729859
  },
  {
    "OBJECTID": 117,
    "cptl_name": "Gaborone",
    "ctry_name": "Botswana",
    "adm0_a3": "BWA",
    "iso_a2": "BW",
    "ja_cptl": "ハボローネ",
    "ja_ctry": "ボツワナ",
    "x": 25.9119478,
    "y": -24.6463135
  },
  {
    "OBJECTID": 118,
    "cptl_name": "Canberra",
    "ctry_name": "Australia",
    "adm0_a3": "AUS",
    "iso_a2": "AU",
    "ja_cptl": "キャンベラ",
    "ja_ctry": "オーストラリア",
    "x": 149.1290262,
    "y": -35.2830285
  },

  /*
  {
    "OBJECTID": 119,
    "cptl_name": "Ouagadougou",
    "ctry_name": "Burkina Faso",
    "adm0_a3": "BFA",
    "iso_a2": "BF",
    "ja_cptl": "ワガドゥグー",
    "ja_ctry": "ブルキナファソ",
    "x": -1.5266696,
    "y": 12.3722618
  },
  {
    "OBJECTID": 120,
    "cptl_name": "Sarajevo",
    "ctry_name": "Bosnia and Herzegovina",
    "adm0_a3": "BIH",
    "iso_a2": "BA",
    "ja_cptl": "サラエボ",
    "ja_ctry": "ボスニアヘルツェゴビナ",
    "x": 18.3830017,
    "y": 43.8500224
  },
  */

  {
    "OBJECTID": 121,
    "cptl_name": "Naypyidaw",
    "ctry_name": "Myanmar",
    "adm0_a3": "MMR",
    "iso_a2": "MM",
    "ja_cptl": "ネーピードー",
    "ja_ctry": "ミャンマー",
    "x": 96.1166727,
    "y": 19.7685029
  },
  {
    "OBJECTID": 122,
    "cptl_name": "Nukualofa",
    "ctry_name": "Tonga",
    "adm0_a3": "TON",
    "iso_a2": "TO",
    "ja_cptl": "ヌクアロファ",
    "ja_ctry": "トンガ",
    "x": -175.2205645,
    "y": -21.1385124
  },
  {
    "OBJECTID": 123,
    "cptl_name": "Victoria",
    "ctry_name": "Seychelles",
    "adm0_a3": "SYC",
    "iso_a2": "SC",
    "ja_cptl": "ビクトリア",
    "ja_ctry": "セーシェル",
    "x": 55.4499898,
    "y": -4.6166317
  },

  /*
  {
    "OBJECTID": 124,
    "cptl_name": "S?o Tom?",
    "ctry_name": "Sao Tome and Principe",
    "adm0_a3": "STP",
    "iso_a2": "ST",
    "ja_cptl": "サントメ",
    "ja_ctry": "サントメ・プリンシペ",
    "x": 6.7333252,
    "y": 0.3334021
  },
  {
    "OBJECTID": 125,
    "cptl_name": "Apia",
    "ctry_name": "Samoa",
    "adm0_a3": "WSM",
    "iso_a2": "WS",
    "ja_cptl": "アピア",
    "ja_ctry": "サモア",
    "x": -171.7386416,
    "y": -13.841545
  },
  {
    "OBJECTID": 126,
    "cptl_name": "Valletta",
    "ctry_name": "Malta",
    "adm0_a3": "MLT",
    "iso_a2": "MT",
    "ja_cptl": "バレッタ",
    "ja_ctry": "マルタ",
    "x": 14.5147107,
    "y": 35.8997325
  },
  {
    "OBJECTID": 127,
    "cptl_name": "Mal?",
    "ctry_name": "Maldives",
    "adm0_a3": "MDV",
    "iso_a2": "MV",
    "ja_cptl": "マレ",
    "ja_ctry": "モルディブ",
    "x": 73.4999475,
    "y": 4.1667082
  },
  */

  {
    "OBJECTID": 128,
    "cptl_name": "Jerusalem",
    "ctry_name": "Israel",
    "adm0_a3": "ISR",
    "iso_a2": "IL",
    "ja_cptl": "エルサレム",
    "ja_ctry": "イスラエル",
    "x": 35.2066259,
    "y": 31.7784078
  },

  /*
  {
    "OBJECTID": 129,
    "cptl_name": "Praia",
    "ctry_name": "Cape Verde",
    "adm0_a3": "CPV",
    "iso_a2": "CV",
    "ja_cptl": "プライア",
    "ja_ctry": "カーボベルデ",
    "x": -23.5166889,
    "y": 14.916698
  },
  {
    "OBJECTID": 130,
    "cptl_name": "Nassau",
    "ctry_name": "The Bahamas",
    "adm0_a3": "BHS",
    "iso_a2": "BS",
    "ja_cptl": "ナッソー",
    "ja_ctry": "バハマ",
    "x": -77.3500438,
    "y": 25.0833901
  },
  {
    "OBJECTID": 131,
    "cptl_name": "Nicosia",
    "ctry_name": "Cyprus",
    "adm0_a3": "CYP",
    "iso_a2": "CY",
    "ja_cptl": "ニコシア",
    "ja_ctry": "キプロス",
    "x": 33.3666349,
    "y": 35.1666765
  },
  */

  {
    "OBJECTID": 132,
    "cptl_name": "Wellington",
    "ctry_name": "New Zealand",
    "adm0_a3": "NZL",
    "iso_a2": "NZ",
    "ja_cptl": "ウェリントン",
    "ja_ctry": "ニュージーランド",
    "x": 174.7832659,
    "y": -41.2999879
  },
  {
    "OBJECTID": 133,
    "cptl_name": "Hanoi",
    "ctry_name": "Vietnam",
    "adm0_a3": "VNM",
    "iso_a2": "VN",
    "ja_cptl": "ハノイ",
    "ja_ctry": "ベトナム",
    "x": 105.8480683,
    "y": 21.0352731
  },
  {
    "OBJECTID": 134,
    "cptl_name": "Ankara",
    "ctry_name": "Turkey",
    "adm0_a3": "TUR",
    "iso_a2": "TR",
    "ja_cptl": "アンカラ",
    "ja_ctry": "トルコ",
    "x": 32.8624458,
    "y": 39.9291844
  },
  {
    "OBJECTID": 135,
    "cptl_name": "Budapest",
    "ctry_name": "Hungary",
    "adm0_a3": "HUN",
    "iso_a2": "HU",
    "ja_cptl": "ブダペスト",
    "ja_ctry": "ハンガリー",
    "x": 19.0813748,
    "y": 47.5019522
  },
  {
    "OBJECTID": 136,
    "cptl_name": "Sanaa",
    "ctry_name": "Yemen",
    "adm0_a3": "YEM",
    "iso_a2": "YE",
    "ja_cptl": "サヌア",
    "ja_ctry": "イエメン",
    "x": 44.2046475,
    "y": 15.3566792
  },
  {
    "OBJECTID": 137,
    "cptl_name": "Bucharest",
    "ctry_name": "Romania",
    "adm0_a3": "ROU",
    "iso_a2": "RO",
    "ja_cptl": "ブカレスト",
    "ja_ctry": "ルーマニア",
    "x": 26.0980008,
    "y": 44.4353177
  },
  {
    "OBJECTID": 138,
    "cptl_name": "Damascus",
    "ctry_name": "Syria",
    "adm0_a3": "SYR",
    "iso_a2": "SY",
    "ja_cptl": "ダマスカス",
    "ja_ctry": "シリア",
    "x": 36.29805,
    "y": 33.5019799
  },
  {
    "OBJECTID": 139,
    "cptl_name": "Lisbon",
    "ctry_name": "Portugal",
    "adm0_a3": "PRT",
    "iso_a2": "PT",
    "ja_cptl": "リスボン",
    "ja_ctry": "ポルトガル",
    "x": -9.1468122,
    "y": 38.7246687
  },
  {
    "OBJECTID": 140,
    "cptl_name": "Khartoum",
    "ctry_name": "Sudan",
    "adm0_a3": "SDN",
    "iso_a2": "SD",
    "ja_cptl": "ハルツーム",
    "ja_ctry": "スーダン",
    "x": 32.5322334,
    "y": 15.5900241
  },
  {
    "OBJECTID": 141,
    "cptl_name": "Oslo",
    "ctry_name": "Norway",
    "adm0_a3": "NOR",
    "iso_a2": "NO",
    "ja_cptl": "オスロ",
    "ja_ctry": "ノルウェー",
    "x": 10.7480333,
    "y": 59.9186361
  },
  {
    "OBJECTID": 142,
    "cptl_name": "Warsaw",
    "ctry_name": "Poland",
    "adm0_a3": "POL",
    "iso_a2": "PL",
    "ja_cptl": "ワルシャワ",
    "ja_ctry": "ポーランド",
    "x": 21.00534674,
    "y": 52.23087197
  },
  {
    "OBJECTID": 143,
    "cptl_name": "Pyongyang",
    "ctry_name": "North Korea",
    "adm0_a3": "PRK",
    "iso_a2": "KP",
    "ja_cptl": "ピョンヤン",
    "ja_ctry": "朝鮮民主主義人民共和国",
    "x": 125.7527449,
    "y": 39.0213846
  },
  {
    "OBJECTID": 144,
    "cptl_name": "Dar es Salaam",
    "ctry_name": "Tanzania",
    "adm0_a3": "TZA",
    "iso_a2": "TZ",
    "ja_cptl": "ダルエスサラーム",
    "ja_ctry": "タンザニア",
    "x": 39.266396,
    "y": -6.7980667
  },
  {
    "OBJECTID": 145,
    "cptl_name": "Dublin",
    "ctry_name": "Ireland",
    "adm0_a3": "IRL",
    "iso_a2": "IE",
    "ja_cptl": "ダブリン",
    "ja_ctry": "アイルランド",
    "x": -6.256979517,
    "y": 53.34673125
  },
  {
    "OBJECTID": 146,
    "cptl_name": "Monrovia",
    "ctry_name": "Liberia",
    "adm0_a3": "LBR",
    "iso_a2": "LR",
    "ja_cptl": "モンロビア",
    "ja_ctry": "リベリア",
    "x": -10.7996604,
    "y": 6.3145816
  },
  {
    "OBJECTID": 147,
    "cptl_name": "Kuala Lumpur",
    "ctry_name": "Malaysia",
    "adm0_a3": "MYS",
    "iso_a2": "MY",
    "ja_cptl": "クアラルンプール",
    "ja_ctry": "マレーシア",
    "x": 101.6980374,
    "y": 3.1686117
  },
  {
    "OBJECTID": 148,
    "cptl_name": "Havana",
    "ctry_name": "Cuba",
    "adm0_a3": "CUB",
    "iso_a2": "CU",
    "ja_cptl": "ハバナ",
    "ja_ctry": "キューバ",
    "x": -82.366128,
    "y": 23.1339047
  },
  {
    "OBJECTID": 149,
    "cptl_name": "Prague",
    "ctry_name": "Czechia",
    "adm0_a3": "CZE",
    "iso_a2": "CZ",
    "ja_cptl": "プラハ",
    "ja_ctry": "チェコ",
    "x": 14.4640339,
    "y": 50.0852829
  },
  {
    "OBJECTID": 150,
    "cptl_name": "Kuwait City",
    "ctry_name": "Kuwait",
    "adm0_a3": "KWT",
    "iso_a2": "KW",
    "ja_cptl": "クウェート",
    "ja_ctry": "クウェート",
    "x": 47.9763553,
    "y": 29.3716635
  },
  {
    "OBJECTID": 151,
    "cptl_name": "Santo Domingo",
    "ctry_name": "Dominican Republic",
    "adm0_a3": "DOM",
    "iso_a2": "DO",
    "ja_cptl": "サントドミンゴ",
    "ja_ctry": "ドミニカ共和国",
    "x": -69.9020309,
    "y": 18.4720187
  },
  {
    "OBJECTID": 152,
    "cptl_name": "Accra",
    "ctry_name": "Ghana",
    "adm0_a3": "GHA",
    "iso_a2": "GH",
    "ja_cptl": "アクラ",
    "ja_ctry": "ガーナ",
    "x": -0.2186616,
    "y": 5.5519805
  },
  {
    "OBJECTID": 153,
    "cptl_name": "Tripoli",
    "ctry_name": "Libya",
    "adm0_a3": "LBY",
    "iso_a2": "LY",
    "ja_cptl": "トリポリ",
    "ja_ctry": "リビア",
    "x": 13.1800118,
    "y": 32.8925
  },
  {
    "OBJECTID": 154,
    "cptl_name": "Helsinki",
    "ctry_name": "Finland",
    "adm0_a3": "FIN",
    "iso_a2": "FI",
    "ja_cptl": "ヘルシンキ",
    "ja_ctry": "フィンランド",
    "x": 24.93245691,
    "y": 60.16380385
  },
  {
    "OBJECTID": 155,
    "cptl_name": "K?benhavn",
    "ctry_name": "Denmark",
    "adm0_a3": "DNK",
    "iso_a2": "DK",
    "ja_cptl": "コペンハーゲン",
    "ja_ctry": "デンマーク",
    "x": 12.5615399,
    "y": 55.68051
  },
  {
    "OBJECTID": 156,
    "cptl_name": "Bras?lia",
    "ctry_name": "Brazil",
    "adm0_a3": "BRA",
    "iso_a2": "BR",
    "ja_cptl": "ブラジリア",
    "ja_ctry": "ブラジル",
    "x": -47.9179981,
    "y": -15.7813944
  },
  {
    "OBJECTID": 157,
    "cptl_name": "Brussels",
    "ctry_name": "Belgium",
    "adm0_a3": "BEL",
    "iso_a2": "BE",
    "ja_cptl": "ブリュッセル",
    "ja_ctry": "ベルギー",
    "x": 4.3313707,
    "y": 50.8352629
  },
  {
    "OBJECTID": 158,
    "cptl_name": "Dhaka",
    "ctry_name": "Bangladesh",
    "adm0_a3": "BGD",
    "iso_a2": "BD",
    "ja_cptl": "ダッカ",
    "ja_ctry": "バングラデシュ",
    "x": 90.4066336,
    "y": 23.7250056
  },
  {
    "OBJECTID": 159,
    "cptl_name": "Luanda",
    "ctry_name": "Angola",
    "adm0_a3": "AGO",
    "iso_a2": "AO",
    "ja_cptl": "ルアンダ",
    "ja_ctry": "アンゴラ",
    "x": 13.2324812,
    "y": -8.8363403
  },
  {
    "OBJECTID": 160,
    "cptl_name": "Algiers",
    "ctry_name": "Algeria",
    "adm0_a3": "DZA",
    "iso_a2": "DZ",
    "ja_cptl": "アルジェ",
    "ja_ctry": "アルジェリア",
    "x": 3.0486067,
    "y": 36.7650107
  },
  {
    "OBJECTID": 161,
    "cptl_name": "Caracas",
    "ctry_name": "Venezuela",
    "adm0_a3": "VEN",
    "iso_a2": "VE",
    "ja_cptl": "カラカス",
    "ja_ctry": "ベネズエラ",
    "x": -66.9189831,
    "y": 10.5029444
  },
  {
    "OBJECTID": 162,
    "cptl_name": "Kiev",
    "ctry_name": "Ukraine",
    "adm0_a3": "UKR",
    "iso_a2": "UA",
    "ja_cptl": "キーウ",
    "ja_ctry": "ウクライナ",
    "x": 30.5146821,
    "y": 50.4353132
  },
  {
    "OBJECTID": 163,
    "cptl_name": "Tashkent",
    "ctry_name": "Uzbekistan",
    "adm0_a3": "UZB",
    "iso_a2": "UZ",
    "ja_cptl": "タシケント",
    "ja_ctry": "ウズベキスタン",
    "x": 69.292987,
    "y": 41.3136477
  },
  {
    "OBJECTID": 164,
    "cptl_name": "Madrid",
    "ctry_name": "Spain",
    "adm0_a3": "ESP",
    "iso_a2": "ES",
    "ja_cptl": "マドリード",
    "ja_ctry": "スペイン",
    "x": -3.6852975,
    "y": 40.4019721
  },
  {
    "OBJECTID": 165,
    "cptl_name": "Stockholm",
    "ctry_name": "Sweden",
    "adm0_a3": "SWE",
    "iso_a2": "SE",
    "ja_cptl": "ストックホルム",
    "ja_ctry": "スウェーデン",
    "x": 18.06630017,
    "y": 59.3241272
  },
  {
    "OBJECTID": 166,
    "cptl_name": "Bangkok",
    "ctry_name": "Thailand",
    "adm0_a3": "THA",
    "iso_a2": "TH",
    "ja_cptl": "バンコク",
    "ja_ctry": "タイ",
    "x": 100.5146988,
    "y": 13.7519451
  },
  {
    "OBJECTID": 167,
    "cptl_name": "Lima",
    "ctry_name": "Peru",
    "adm0_a3": "PER",
    "iso_a2": "PE",
    "ja_cptl": "リマ",
    "ja_ctry": "ペルー",
    "x": -77.052008,
    "y": -12.0460668
  },
  {
    "OBJECTID": 168,
    "cptl_name": "Dakar",
    "ctry_name": "Senegal",
    "adm0_a3": "SEN",
    "iso_a2": "SN",
    "ja_cptl": "ダカール",
    "ja_ctry": "セネガル",
    "x": -17.475076,
    "y": 14.7177776
  },
  {
    "OBJECTID": 169,
    "cptl_name": "Amsterdam",
    "ctry_name": "Netherlands",
    "adm0_a3": "NLD",
    "iso_a2": "NL",
    "ja_cptl": "アムステルダム",
    "ja_ctry": "オランダ",
    "x": 4.9146943,
    "y": 52.3519145
  },
  {
    "OBJECTID": 170,
    "cptl_name": "Seoul",
    "ctry_name": "South Korea",
    "adm0_a3": "KOR",
    "iso_a2": "KR",
    "ja_cptl": "ソウル",
    "ja_ctry": "大韓民国",
    "x": 126.9977851,
    "y": 37.568295
  },
  {
    "OBJECTID": 171,
    "cptl_name": "Manila",
    "ctry_name": "Philippines",
    "adm0_a3": "PHL",
    "iso_a2": "PH",
    "ja_cptl": "マニラ",
    "ja_ctry": "フィリピン",
    "x": 120.9802713,
    "y": 14.6061048
  },
  {
    "OBJECTID": 172,
    "cptl_name": "Berlin",
    "ctry_name": "Germany",
    "adm0_a3": "DEU",
    "iso_a2": "DE",
    "ja_cptl": "ベルリン",
    "ja_ctry": "ドイツ",
    "x": 13.3996028,
    "y": 52.5237645
  },
  {
    "OBJECTID": 173,
    "cptl_name": "Kinshasa",
    "ctry_name": "Congo (Kinshasa)",
    "adm0_a3": "COD",
    "iso_a2": "CD",
    "ja_cptl": "キンシャサ",
    "ja_ctry": "コンゴ民主共和国",
    "x": 15.313026,
    "y": -4.3277782
  },
  {
    "OBJECTID": 174,
    "cptl_name": "New Delhi",
    "ctry_name": "India",
    "adm0_a3": "IND",
    "iso_a2": "IN",
    "ja_cptl": "デリー",
    "ja_ctry": "インド",
    "x": 77.19998,
    "y": 28.600023
  },
  {
    "OBJECTID": 175,
    "cptl_name": "Athens",
    "ctry_name": "Greece",
    "adm0_a3": "GRC",
    "iso_a2": "GR",
    "ja_cptl": "アテネ",
    "ja_ctry": "ギリシャ",
    "x": 23.7313752,
    "y": 37.9852721
  },
  {
    "OBJECTID": 176,
    "cptl_name": "Baghdad",
    "ctry_name": "Iraq",
    "adm0_a3": "IRQ",
    "iso_a2": "IQ",
    "ja_cptl": "バグダッド",
    "ja_ctry": "イラク",
    "x": 44.3919229,
    "y": 33.3405944
  },
  {
    "OBJECTID": 177,
    "cptl_name": "Addis Ababa",
    "ctry_name": "Ethiopia",
    "adm0_a3": "ETH",
    "iso_a2": "ET",
    "ja_cptl": "アディスアベバ",
    "ja_ctry": "エチオピア",
    "x": 38.6980586,
    "y": 9.0352562
  },
  {
    "OBJECTID": 178,
    "cptl_name": "Tehran",
    "ctry_name": "Iran",
    "adm0_a3": "IRN",
    "iso_a2": "IR",
    "ja_cptl": "テヘラン",
    "ja_ctry": "イラン",
    "x": 51.4223982,
    "y": 35.6738886
  },
  {
    "OBJECTID": 179,
    "cptl_name": "Buenos Aires",
    "ctry_name": "Argentina",
    "adm0_a3": "ARG",
    "iso_a2": "AR",
    "ja_cptl": "ブエノスアイレス",
    "ja_ctry": "アルゼンチン",
    "x": -58.43251269,
    "y": -34.61071459
  },
  {
    "OBJECTID": 180,
    "cptl_name": "Kabul",
    "ctry_name": "Afghanistan",
    "adm0_a3": "AFG",
    "iso_a2": "AF",
    "ja_cptl": "カブール",
    "ja_ctry": "アフガニスタン",
    "x": 69.1813142,
    "y": 34.5186361
  },
  {
    "OBJECTID": 181,
    "cptl_name": "Vienna",
    "ctry_name": "Austria",
    "adm0_a3": "AUT",
    "iso_a2": "AT",
    "ja_cptl": "ウィーン",
    "ja_ctry": "オーストリア",
    "x": 16.3646931,
    "y": 48.2019611
  },
  {
    "OBJECTID": 182,
    "cptl_name": "WashingtonD.C.",
    "ctry_name": "United States of America",
    "adm0_a3": "USA",
    "iso_a2": "US",
    "ja_cptl": "ワシントンD.C.",
    "ja_ctry": "アメリカ合衆国",
    "x": -77.0113644,
    "y": 38.9014952
  },
  {
    "OBJECTID": 183,
    "cptl_name": "London",
    "ctry_name": "United Kingdom",
    "adm0_a3": "GBR",
    "iso_a2": "GB",
    "ja_cptl": "ロンドン",
    "ja_ctry": "イギリス",
    "x": -0.1186677,
    "y": 51.5019406
  },
  {
    "OBJECTID": 184,
    "cptl_name": "Riyadh",
    "ctry_name": "Saudi Arabia",
    "adm0_a3": "SAU",
    "iso_a2": "SA",
    "ja_cptl": "リヤド",
    "ja_ctry": "サウジアラビア",
    "x": 46.7707958,
    "y": 24.642779
  },
  {
    "OBJECTID": 185,
    "cptl_name": "Moscow",
    "ctry_name": "Russia",
    "adm0_a3": "RUS",
    "iso_a2": "RU",
    "ja_cptl": "モスクワ",
    "ja_ctry": "ロシア連邦",
    "x": 37.613577,
    "y": 55.75411
  },
  {
    "OBJECTID": 186,
    "cptl_name": "Mexico City",
    "ctry_name": "Mexico",
    "adm0_a3": "MEX",
    "iso_a2": "MX",
    "ja_cptl": "メキシコシティ",
    "ja_ctry": "メキシコ",
    "x": -99.1329341,
    "y": 19.4443883
  },
  {
    "OBJECTID": 187,
    "cptl_name": "Rome",
    "ctry_name": "Italy",
    "adm0_a3": "ITA",
    "iso_a2": "IT",
    "ja_cptl": "ローマ",
    "ja_ctry": "イタリア",
    "x": 12.4813126,
    "y": 41.8979015
  },
  {
    "OBJECTID": 188,
    "cptl_name": "Beijing",
    "ctry_name": "China",
    "adm0_a3": "CHN",
    "iso_a2": "CN",
    "ja_cptl": "ペキン",
    "ja_ctry": "中華人民共和国",
    "x": 116.3942009,
    "y": 39.90172031
  },
  {
    "OBJECTID": 189,
    "cptl_name": "Nairobi",
    "ctry_name": "Kenya",
    "adm0_a3": "KEN",
    "iso_a2": "KE",
    "ja_cptl": "ナイロビ",
    "ja_ctry": "ケニア",
    "x": 36.814711,
    "y": -1.2814009
  },
  {
    "OBJECTID": 190,
    "cptl_name": "Jakarta",
    "ctry_name": "Indonesia",
    "adm0_a3": "IDN",
    "iso_a2": "ID",
    "ja_cptl": "ジャカルタ",
    "ja_ctry": "インドネシア",
    "x": 106.8274918,
    "y": -6.1724718
  },
  {
    "OBJECTID": 191,
    "cptl_name": "Bogota",
    "ctry_name": "Colombia",
    "adm0_a3": "COL",
    "iso_a2": "CO",
    "ja_cptl": "ボゴタ",
    "ja_ctry": "コロンビア",
    "x": -74.0852898,
    "y": 4.5983694
  },
  {
    "OBJECTID": 192,
    "cptl_name": "Cairo",
    "ctry_name": "Egypt",
    "adm0_a3": "EGY",
    "iso_a2": "EG",
    "ja_cptl": "カイロ",
    "ja_ctry": "エジプト",
    "x": 31.2480224,
    "y": 30.0519062
  },
  {
    "OBJECTID": 193,
    "cptl_name": "Tokyo",
    "ctry_name": "Japan",
    "adm0_a3": "JPN",
    "iso_a2": "JP",
    "ja_cptl": "東京",
    "ja_ctry": "日本国",
    "x": 139.7494616,
    "y": 35.6869628
  },
  {
    "OBJECTID": 194,
    "cptl_name": "Paris",
    "ctry_name": "France",
    "adm0_a3": "FRA",
    "iso_a2": "FR",
    "ja_cptl": "パリ",
    "ja_ctry": "フランス",
    "x": 2.352992462,
    "y": 48.85809232
  },
  {
    "OBJECTID": 195,
    "cptl_name": "Santiago",
    "ctry_name": "Chile",
    "adm0_a3": "CHL",
    "iso_a2": "CL",
    "ja_cptl": "サンティアゴ",
    "ja_ctry": "チリ",
    "x": -70.6689867,
    "y": -33.448068
  },
  {
    "OBJECTID": 196,
    "cptl_name": "Singapore",
    "ctry_name": "Singapore",
    "adm0_a3": "SGP",
    "iso_a2": "SG",
    "ja_cptl": "シンガポール",
    "ja_ctry": "シンガポール",
    "x": 103.8538748,
    "y": 1.2949793
  },
  {
    "OBJECTID": 197,
    "cptl_name": "Yaren",
    "ctry_name": "Nauru",
    "adm0_a3": "NRU",
    "iso_a2": "NR",
    "ja_cptl": "ヤレン",
    "ja_ctry": "ナウル",
    "x": 166.9210079,
    "y": -0.544730303
  }
]
