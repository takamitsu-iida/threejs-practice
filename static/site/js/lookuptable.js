import * as THREE from "three";
import { OrbitControls } from "three/controls/OrbitControls.js";
import { Lut } from "three/libs/math/Lut.js";

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

  statsjs;
  controller;

  // 色の凡例を表示すするシーンとカメラ
  uiScene;
  uiCamera;

  // lookuptable.js
  lut;

  // 色の凡例を表示するスプライト
  sprite;

  // 地面を表現するメッシュ化されたオブジェクト
  ground;

  renderParams = {
    clock: new THREE.Clock(),
    delta: 0,
    interval: 1 / 30,  // = 30fps
  }

  params = {
    // 'rainbow', 'cooltowarm', 'blackbody', 'grayscale'
    colorMap: 'blackbody',
    maxY: 20,
    minY: -20,
  }


  constructor(params = {}) {

    this.params = Object.assign(this.params, params);

    this.initThreejs();

    this.initUiScene();

    this.initGround();

    this.initGui();

    this.initStatsjs();

    this.render();

  }


  initThreejs = () => {
    // コンテナ
    this.container = document.getElementById("threejsContainer");

    // コンテナのサイズ
    this.sizes.width = this.container.clientWidth;
    this.sizes.height = this.container.clientHeight;

    // リサイズイベントを登録
    window.addEventListener("resize", this.onWindowResize, false);

    // シーン
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xffffff);

    // カメラ
    this.camera = new THREE.PerspectiveCamera(
      60,
      this.sizes.width / this.sizes.height,
      1,
      1001
    );
    this.camera.position.set(300, 300, 300);

    // レンダラ
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    // デバイスピクセル比は上限2に制限(3以上のスマホ・タブレットでは処理が重すぎる)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.autoClear = false;
    this.container.appendChild(this.renderer.domElement);

    // コントローラ
    this.controller = new OrbitControls(this.camera, this.renderer.domElement);
    this.controller.maxDistance = 900; // ズームアウトの上限

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


  initUiScene = () => {

    // 色の凡例を表示するシーンとカメラ
    this.uiScene = new THREE.Scene();

    // 平行投影カメラ
    this.uiCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2);
    this.uiCamera.position.set(0.8, 0, 1.0);

    // lookuptable.js
    this.lut = new Lut();
    this.lut.setColorMap(this.params.colorMap);
    this.lut.setMax(this.params.maxY * 2);
    this.lut.setMin(this.params.minY * 2);

    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(this.lut.createCanvas())
    }));

    this.sprite.material.map.colorSpace = THREE.SRGBColorSpace;
    this.sprite.scale.x = 0.125;
    this.uiScene.add(this.sprite);
  }


  initGround = () => {

    // 平面
    const geometry = new THREE.PlaneGeometry(400, 400, 32, 32);

    // console.log(geometry.attributes);
    // 初期状態においてアトリビュートはpositionとuvしか存在しないことが分かる

    // 頂点の位置情報
    //
    // console.log(geometry.attributes.position);
    //
    // positionはFloat32BufferAttribute型
    // position.countには個数が格納されている

    // 頂点のUV座標
    //
    // console.log(geometry.attributes.uv);
    //
    // uvはFloat32BufferAttribute型
    // https://threejs.org/docs/#api/en/core/BufferAttribute
    //
    // 一次元のarrayに値が格納されているので(u, v)を直接取り出すのは難しいが、
    // Vector2, Vector3, Vector4, Colorクラスには.fromBufferAttribute(attribute, index)メソッドがあるので、
    // それを使うとインデックスを指定して(u, v)を取り出せる
    //
    // uv.countには(u, v)の個数が格納されている

    // X軸を中心に-90度回転してXZ平面と平行にする
    geometry.rotateX(-Math.PI / 2)

    // ジオメトリの位置座標を加工して波打たせる
    for (let i = 0; i < geometry.attributes.position.count; i++) {
      const x = geometry.attributes.position.getX(i);
      const y = geometry.attributes.position.getY(i);
      const z = geometry.attributes.position.getZ(i);

      const nextY = y + Math.sin(x * 0.05) * this.params.maxY + Math.cos(z * 0.05) * this.params.maxY;

      geometry.attributes.position.setX(i, x);
      geometry.attributes.position.setY(i, nextY);
      geometry.attributes.position.setZ(i, z);
    }

    // 法線ベクトルを計算し直す
    geometry.computeVertexNormals();

    // これをセットしておかないとレンダラは更新してくれない
    geometry.attributes.position.needsUpdate = true;

    //
    // ジオメトリにcolor属性を**追加する**
    //

    const c = new THREE.Color();

    // alphaを使う前提で x4
    const colorBuffer = new Float32Array(geometry.attributes.position.count * 4);

    let colorIndex = 0;
    for (let i = 0; i < geometry.attributes.position.count; i++) {
      colorIndex = i * 4;

      const y = geometry.attributes.position.getY(i);

      c.copy(this.lut.getColor(y)).convertSRGBToLinear();

      colorBuffer[colorIndex + 0] = c.r;
      colorBuffer[colorIndex + 1] = c.g;
      colorBuffer[colorIndex + 2] = c.b;
      colorBuffer[colorIndex + 3] = 1;
    }

    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colorBuffer, 4));

    geometry.attributes.color.needsUpdate = true;

    const material = new THREE.MeshBasicMaterial({
      wireframe: false,
      side: THREE.DoubleSide,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
    });

    this.ground = new THREE.Mesh(geometry, material);
    this.scene.add(this.ground);

  }


  initGui = () => {
    const guiContainer = document.getElementById("guiContainer");

    const gui = new GUI({
      container: guiContainer,
      width: 300,
    });

    gui
      .add(this.params, "colorMap", ['rainbow', 'cooltowarm', 'blackbody', 'grayscale'])
      .name("colorMap")
      .onFinishChange(() => this.changeColorMap());
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


  changeColorMap = () => {
    this.lut.setColorMap(this.params.colorMap);
    this.lut.setMax(this.params.maxY * 2);
    this.lut.setMin(this.params.minY * 2);

    const map = this.sprite.material.map;
    this.lut.updateCanvas(map.image);
    map.needsUpdate = true;

    // ジオメトリの位置情報を取得
    const position = this.ground.geometry.attributes.position;

    // 空っぽの色
    const c = new THREE.Color();

    // 各頂点の色を変えていく
    for (let i = 0; i < position.count; i++) {
      const y = position.getY(i);
      c.copy(this.lut.getColor(y)).convertSRGBToLinear();
      this.ground.geometry.attributes.color.array[i * 4 + 0] = c.r;
      this.ground.geometry.attributes.color.array[i * 4 + 1] = c.g;
      this.ground.geometry.attributes.color.array[i * 4 + 2] = c.b;
    }
    this.ground.geometry.attributes.color.needsUpdate = true;
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
      this.renderer.render(this.uiScene, this.uiCamera);
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

}
