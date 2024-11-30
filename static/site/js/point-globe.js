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


  // 地球をグループ化しておく
  globe = new THREE.Group();


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

    // 地球を作成
    this.initGlobe();

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

    // 環境光をシーンに追加
    // 環境光がないと地球の夜の部分が真っ黒になってしまう
    // ただし、色に注意が必要
    // 0xffffffだと全体に強い光があたって影ができない
    this.scene.add(new THREE.AmbientLight(0xa0a0a0));

    // ディレクショナルライト
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.8);
    dirLight.position.set(-this.params.radius * 3, 0, this.params.radius * 1.5)
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


  initGlobe = () => {

    // 球体を作成
    this.initSphere();

    // 大気を表現するためのシェーダーを追加
    this.initAtmosphere();

    // 経緯線を描画
    this.initGraticule(15);

    // 陸地の点を描画
    this.initPoints();

    // Y軸を中心に回転させてタイムゾーンが正面に来るようにする
    // （カメラを東京上空にしたのでこれは不要）
    // this.setRoteteToTimezone();

    // シーンに追加
    this.scene.add(this.globe);
  }


  initSphere = () => {
    // 青い球体を作成
    const geometry = new THREE.SphereGeometry(this.params.radius, 64, 64);
    const material = new THREE.MeshStandardMaterial({
      color: 0x0000ff,
    });
    const sphere = new THREE.Mesh(geometry, material);

    // グループに追加
    this.globe.add(sphere);
  }


  initAtmosphere = () => {

    // 大気を表現するためのシェーダーを追加
    // https://franky-arkon-digital.medium.com/make-your-own-earth-in-three-js-8b875e281b1e
    let atmosGeometry = new THREE.SphereGeometry(this.params.radius * 1.2, 64, 64)

    let atmosMaterial = new THREE.ShaderMaterial({
      vertexShader: /*GLSL*/`
        varying vec3 vNormal;
        varying vec3 eyeVector;

        void main() {
          // modelMatrix transforms the coordinates local to the model into world space
          vec4 mvPos = modelViewMatrix * vec4( position, 1.0 );

          // normalMatrix is a matrix that is used to transform normals from object space to view space.
          vNormal = normalize( normalMatrix * normal );

          // vector pointing from camera to vertex in view space
          eyeVector = normalize(mvPos.xyz);

          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: /*GLSL*/`
        varying vec3 vNormal;
        varying vec3 eyeVector;

        uniform float atmosOpacity;
        uniform float atmosPowFactor;
        uniform float atmosMultiplier;

        void main() {
          // Starting from the rim to the center at the back, dotP would increase from 0 to 1
          float dotP = dot( vNormal, eyeVector );
          // This factor is to create the effect of a realistic thickening of the atmosphere coloring
          float factor = pow(dotP, atmosPowFactor) * atmosMultiplier;
          // Adding in a bit of dotP to the color to make it whiter while the color intensifies
          vec3 atmosColor = vec3(0.35 + dotP/4.5, 0.35 + dotP/4.5, 1.0);
          // use atmOpacity to control the overall intensity of the atmospheric color
          gl_FragColor = vec4(atmosColor, atmosOpacity) * factor;
        }
      `,
      uniforms: {
        atmosOpacity: { value: 0.7 },
        atmosPowFactor: { value: 4.1 },
        atmosMultiplier: { value: 9.5 },
      },
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
    })

    const atmos = new THREE.Mesh(atmosGeometry, atmosMaterial)

    this.globe.add(atmos)
  }


  initGraticule = (interval = 15) => {
    // 縦の円弧、横の円弧を作成する

    // 経緯線が見えるように、半径を少し大きくしておく（線の太さの半分）
    const radius = this.params.radius + 0.5;

    // 経緯線のマテリアル
    const material = new THREE.LineBasicMaterial({
      color: 0xcccccc,
      transparent: true,
      opacity: 0.4,
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
      // this.scene.add(new THREE.Line(clonedGeometry, material));

      // グループに追加
      this.globe.add(new THREE.Line(clonedGeometry, material));
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
      // this.scene.add(new THREE.Line(geometry, material));

      // グループに追加
      this.globe.add(new THREE.Line(geometry, material));
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


  setRoteteToTimezone = () => {
    const date = new Date();
    const timeZoneOffset = date.getTimezoneOffset() || -540;  // minutes
    const timeZoneMaxOffset = 60 * 12;
    const rotationOffsetY = Math.PI * (timeZoneOffset / timeZoneMaxOffset);
    console.log(`timeZoneOffset: ${timeZoneOffset}, rotationOffsetY: ${rotationOffsetY}`);
    this.globe.rotation.y = -rotationOffsetY;
  }


  setRoteteToCoordinate = (longitude, latitude) => {
    const point = this.geo_to_vec3(longitude, latitude, this.params.radius);
    const angle = Math.atan2(point.x, point.z);
    this.globe.rotation.y = -angle;
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
    if (pixelR < 128 && pixelG < 128 && pixelB < 128) {
      return true;
    }
    return false;
  }


  initPoints = () => {
    const DEG2RAD = Math.PI / 180;
    const rows = 180 * 2;
    const dotDensity = 1.0;

    // 六角形のジオメトリを作成
    const geometry = new THREE.CircleGeometry(0.5, 6);

    // マテリアルを作成
    const material = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
    });

    // 緯度経度のグリッドを走査して、陸地ならそこに円を作成する
    const points = [];
    for (let lat = -90; lat <= 90; lat += 180 / rows) {
      const radius = Math.cos(Math.abs(lat) * DEG2RAD) * this.params.radius;
      const circumference = radius * Math.PI * 2;
      const dotsForLat = circumference * dotDensity;

      for (let x = 0; x < dotsForLat; x++) {
        const long = -180 + x * 360 / dotsForLat;
        if (this.isLand(long, lat)) {
          const point = this.geo_to_vec3(long, lat, this.params.radius);
          points.push(point);
        }
      }
    }
    console.log(`create ${points.length} points`);

    // InstancedMeshを使ってひとつのメッシュをGPUで必要な数だけ複製する
    const instancedMesh = new THREE.InstancedMesh(geometry, material, points.length);

    // ダミーのオブジェクトを使って位置と向きを設定して、そのマトリックスを使う
    const dummy = new THREE.Object3D();

    // setMatrixAtで位置と向きを変える
    points.forEach((point, index) => {
      dummy.position.copy(point);
      dummy.lookAt(0, 0, 0);
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(index, dummy.matrix);
    });

    // this.scene.add(instancedMesh);
    this.globe.add(instancedMesh);
  }


}
