import * as THREE from "three";
import { OrbitControls } from "three/controls/OrbitControls.js";
import { Lut } from "three/libs/math/Lut.js";

// lil-gui
import { GUI } from "three/libs/lil-gui.module.min.js";

// stats.js
import Stats from 'three/libs/stats.module.js';


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


  constructor() {

    // コンテナ
    this.container = document.getElementById("threejsContainer");

    // コンテナのサイズ
    this.sizes.width = this.container.clientWidth;
    this.sizes.height = this.container.clientHeight;

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

    //
    // 色の凡例表示
    //

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

    // レンダラ
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    // デバイスピクセル比は上限2に制限(3以上のスマホ・タブレットでは処理が重すぎる)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.autoClear = false;
    this.container.appendChild(this.renderer.domElement);

    // ポイントライト
    this.scene.add(new THREE.PointLight(0xffffff, 3, 0, 0));

    // 平面
    const geometry = new THREE.PlaneGeometry(400, 400, 32, 32);

    // console.log(geometry.attributes);
    // 初期状態においてアトリビュートはpositionとuvしか存在しないことが分かる

    // 頂点の位置情報
    //
    // const position = geometry.attributes.position;
    // console.log(position);
    //
    // positionはFloat32BufferAttribute型
    // position.countには個数が格納されている

    // 頂点のUV座標
    //
    // const uv = geometry.attributes.uv;
    // console.log(uv);
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

    /*


    // ジオメトリの位置座標を加工して波打たせる
    const position = geometry.attributes.position;

    for (let i = 0; i < position.count; i++) {
      // 座標を変更
      const x = position.getX(i);
      const z = position.getZ(i);
      let y = Math.sin(x * 0.05) * this.params.maxY + Math.cos(z * 0.05) * this.params.maxY;
      position.setY(i, y);
    }

    // 法線ベクトルを計算し直す
    geometry.computeVertexNormals();

    // これをセットしておかないとレンダラは更新してくれない
    position.needsUpdate = true;

    //
    // ジオメトリにcolor属性を**追加する**
    //


    const c = new THREE.Color();
    const vertexColorList = [];
    let colorIndex = 0;
    for (let i = 0; i < position.count; i++) {
      const y = position.getY(i);
      c.copy(this.lut.getColor(y)).convertSRGBToLinear();

      vertexColorList[colorIndex + 0] = c.r;
      vertexColorList[colorIndex + 1] = c.g;
      vertexColorList[colorIndex + 2] = c.b;
      vertexColorList[colorIndex + 3] = 1;
      colorIndex = i * 4;
    }

    geometry.setAttribute("color", new THREE.Float32BufferAttribute(vertexColorList, 4));
    geometry.attributes.color.needsUpdate = true;

    */

    const material = new THREE.MeshBasicMaterial({
      wireframe: false,
      side: THREE.DoubleSide,
      vertexColors: true,
    });



    this.ground = new THREE.Mesh(geometry, material);
    this.scene.add(this.ground);

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

    // lil-gui
    this.initGui();

    // stats.jsを初期化
    this.initStatsjs();

    // リサイズイベントを登録
    window.addEventListener("resize", () => { this.onWindowResize(); }, false);

    // フレーム毎の処理(requestAnimationFrameで再帰的に呼び出される)
    this.render();
  }


  initGui() {
    const guiContainer = document.getElementById("guiContainer");
    const gui = new GUI({
      container: guiContainer,
    });

    gui
      .add(this.params, "colorMap", ['rainbow', 'cooltowarm', 'blackbody', 'grayscale'])
      .name("colorMap")
      .onChange((value) => {
        this.changeColorMap();
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


  changeColorMap() {
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
      this.renderer.render(this.uiScene, this.uiCamera);
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

}
