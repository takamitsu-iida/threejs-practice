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
    // 世界地図のGeoJSONデータのパス
    landPath: "./static/data/land-50m.json",

    // 読み込んだGeoJSONデータ
    landData: null,

    // 地球のテクスチャのパス
    geoTexturePath: "./static/site/img/geo_ground.jpg",
    geoTexture: null,

    // 地球のバンプマップのパス
    geoBumpTexturePath: "./static/site/img/geo_bump.jpg",
    geoBumpTexture: null,
    geoBumpScale: 0.05,

    // 画面上の半径
    radius: 128,

    // カメラの自動回転
    autoRotate: false,

    // カメラの自動回転スピード
    autoRotateSpeed: 2.0,

    minAltitude: 8,
    maxAltitude: 64,

    curvePoints: 100,
    curve: new THREE.CubicBezierCurve3(
      new THREE.Vector3(0, 0, 0), // start point
      new THREE.Vector3(0, 0, 0), // control point1
      new THREE.Vector3(0, 0, 0), // control point2
      new THREE.Vector3(0, 0, 0)  // end point
    ),

    material: new THREE.MeshBasicMaterial({
      blending: THREE.AdditiveBlending,
      opacity: 0.6,
      transparent: true,
      color: 0xe43c59,
    }),

  }

  // 主要都市緯度経度一覧
  cities = {
    Tokyo: [139.692, 35.689],
    London: [-0.091840, 51.512791],
    LosAngeles: [-118.243683, 34.052235],
    Singapore: [103.850067, 1.289670],
    Beijing: [116.397232, 39.907501],
    Sydney: [151.209900, -33.865143],
    NewYork: [-74.0060, 40.7128],
    Paris: [2.3522, 48.8566],
    Berlin: [13.4050, 52.5200],
    Rome: [12.4964, 41.9028],
    Moscow: [37.6176, 55.7558],
    Cairo: [31.2357, 30.0444],
    Istanbul: [28.9784, 41.0082],
    Dubai: [55.2708, 25.2048],
    Mumbai: [72.8777, 19.0760],
    SaoPaulo: [-46.6333, -23.5505],
    BuenosAires: [-58.4173, -34.6118],
    MexicoCity: [-99.1332, 19.4326],
    Toronto: [-79.3832, 43.6532],
    Vancouver: [-123.1216, 49.2827],
    Seoul: [126.9780, 37.5665],
    Bangkok: [100.5018, 13.7563],
    Jakarta: [106.8650, -6.2088],
    Manila: [120.9842, 14.5995],
    Taipei: [121.5654, 25.0330],
    HongKong: [114.1694, 22.3193],
    KualaLumpur: [101.6869, 3.1390],
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

    // 主要都市間の線を初期化
    this.initLines();

    // フレーム毎の処理(requestAnimationFrameで再帰的に呼び出される)
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
      alpha: false
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
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
    // lil-gui
    const gui = new GUI({ width: 300 });
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
    mesh.receiveShadow = true;

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


  createCurveGeometry = (startLongitude, startLatitute, endLongitude, endLatitute) => {
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
    const curve = this.params.curve;
    curve.v0 = startVec3;
    curve.v1 = mid1Vec3;
    curve.v2 = mid2Vec3;
    curve.v3 = endVec3;

    // curve.getPoints(100)で100個の点を取得
    const points = curve.getPoints(this.params.curvePoints);

    return new THREE.BufferGeometry().setFromPoints(points);
  }


  initLines = () => {
    const cities = this.cities;
    const keys = Object.keys(cities);

    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const start = keys[i];
        const end = keys[j];
        const startCoords = cities[start];
        const endCoords = cities[end];

        const geometry = this.createCurveGeometry(startCoords[0], startCoords[1], endCoords[0], endCoords[1]);
        const line = new THREE.Line(geometry, this.params.material);

        this.scene.add(line);
      }
    }

  }

}
