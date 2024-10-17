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
    // 世界の鏡面地図のデータのパス
    specularMapPath: "./static/site/img/geo_specular.png",

    // イメージオブジェクト
    specularMapImage: null,

    // イメージのデータ配列
    specularMapData: null,

    // 画面上の半径
    radius: 128,

    // カメラの自動回転
    autoRotate: false,

    // カメラの自動回転スピード
    autoRotateSpeed: 2.0,
  }


  constructor(params = {}) {
    this.params = Object.assign(this.params, params);
    this.init();
  }

  async init() {

    // ローディング画面のエレメントを取得してイベントハンドラを登録
    const loadingContainer = document.getElementById('loadingContainer');
    loadingContainer.addEventListener('transitionend', (event) => {
      event.target.remove();
    });

    // loadImage()は非同期関数なので戻り値はpromise
    // そのpromiseをawaitして処理完了を待つ
    await this.loadImage();

    // ローディング画面を0.5秒後に消す
    const interval = setInterval(() => {
      loadingContainer.classList.add('fadeout');
      clearInterval(interval);
    }, 500);

    // scene, camera, renderer, controllerを初期化
    this.initThreejs();

    // stats.jsを初期化
    this.initStatsjs();

    // lil-guiを初期化
    this.initGui();

    // 経緯線を描画
    this.initGraticule(15);

    this.initPoints();

    // フレーム毎の処理(requestAnimationFrameで再帰的に呼び出される)
    this.render();
  }


  loadImage = async () => {

    // Image()オブジェクトを作成して画像をpathからダウンロードする
    const image = await new Promise((resolve) => {
      // <img>要素を作成
      const img = new Image();

      // <img src="path">を指定してロード開始
      img.src = this.params.specularMapPath;
      img.crossOrigin = "anonymous";

      // ロード完了時にこのimgを返却する
      img.onload = () => { resolve(img); };
    });

    // Image()オブジェクトを保存しておく（後ほどTHREE.jsのテクスチャに変換する）
    this.params.specularMapImage = image;

    // ダウンロードした画像の幅と高さを取得
    const imageWidth = image.width;
    const imageHeight = image.height;

    console.log(`imageWidth: ${imageWidth}, imageHeight: ${imageHeight}`);

    // canvasを取得
    const canvas = document.createElement("canvas");

    // canvasのサイズを指定のサイズに変更
    canvas.width = imageWidth;
    canvas.height = imageHeight;

    // 2dコンテキストを取得
    const ctx = canvas.getContext("2d");

    // 画像をcanvasに描画する
    // 引数が多いのでマニュアルを参照
    // https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage
    //
    // 描画時にリサイズすることもできるが、今回はリサイズせずに元画像の大きさで描画する
    ctx.drawImage(
      image,        // Image()オブジェクト
      0, 0,         // 元画像の描画開始位置、元画像に余白を入れる場合はここを変更
      imageWidth,   // 元画像の幅
      imageHeight,  // 元画像の高さ
    );

    // イメージをDOMに追加して目視で確認
    // document.body.appendChild(canvas);

    // 描画した画像のデータを取得
    let data = ctx.getImageData(0, 0, imageWidth, imageHeight).data;

    // Image()オブジェクトで取得した画像はY軸の向きが逆転しているので要注意
    //
    // +---->x
    // |
    // y

    // dataを行ごとに分割する
    const rows = [];
    for (let y = 0; y < imageHeight; y++) {
      const index = y * imageWidth * 4;
      rows.push(data.slice(index, index + imageWidth * 4));
    }

    // 行を逆順にして、この向きに変換する
    //
    // y
    // |
    // +---->x

    rows.reverse();

    // 1次元配列に戻す
    data = [];
    for (let y = 0; y < imageHeight; y++) {
      data.push(...rows[y]);
    }

    // 保存しておく
    this.params.specularMapData = data;
  };


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
      alpha: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
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

    // 半径
    const radius = this.params.radius;

    // 経緯線のマテリアル
    const material = new THREE.LineBasicMaterial({
      color: 0xcccccc,
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


  isLand = (longitude, latitude) => {
    // 地図上のピクセルを参照して、黒なら陸地と判定
    const imageData = this.params.specularMapData;

    const imageWidth = this.params.specularMapImage.width;
    const imageHeight = this.params.specularMapImage.height;

    // 緯度経度をピクセル座標に変換
    const x = Math.floor((longitude + 180) / 360 * imageWidth);
    const y = Math.floor((latitude + 90) / 180 * imageHeight);

    const pixelR = imageData[(y * imageWidth + x) * 4 + 0];
    const pixelG = imageData[(y * imageWidth + x) * 4 + 1];
    const pixelB = imageData[(y * imageWidth + x) * 4 + 2];
    // const pixelA = imageData[(y * imageWidth + x) * 4 + 3];

    // console.log(`x: ${x}, y: ${y}, R: ${pixelR}, G: ${pixelG}, B: ${pixelB}, A: ${pixelA}`);
    if (pixelR < 128 && pixelG < 128 && pixelB <128) {
      return true;
    }
    return false;
  }



  initPoints = () => {
    const DEG2RAD = Math.PI / 180;
    const rows = 180 * 2;
    const dotDensity = 1.0;

    // const geometry = new THREE.SphereGeometry(0.5, 8, 8);
    const geometry = new THREE.CircleGeometry(0.5, 8);

    const material = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
    });

    const points = [];
    for (let lat = -90; lat <= 90; lat += 180/rows) {
      const radius = Math.cos(Math.abs(lat) * DEG2RAD) * this.params.radius;
      const circumference = radius * Math.PI * 2;
      const dotsForLat = circumference * dotDensity;

      for (let x = 0; x < dotsForLat; x++) {
        const long = -180 + x*360/dotsForLat;
        if (this.isLand(long, lat)) {
          const point = this.geo_to_vec3(long, lat, this.params.radius);
          points.push(point);
        }
      }
    }

    console.log(`create ${points.length} points`);

    const pointCloud = new THREE.InstancedMesh(geometry, material, points.length);

    /*
    points.forEach((point, index) => {
      const matrix = new THREE.Matrix4();
      matrix.setPosition(point);
      pointCloud.setMatrixAt(index, matrix);
    });
    */

    // ダミーのオブジェクトを使って位置と向きを設定して、そのマトリックスを使う
    const dummy = new THREE.Object3D();

    points.forEach((point, index) => {
      dummy.position.copy(point);
      dummy.lookAt(0, 0, 0);
      dummy.updateMatrix();
      pointCloud.setMatrixAt(index, dummy.matrix);
    });

    this.scene.add(pointCloud);
  }


}
