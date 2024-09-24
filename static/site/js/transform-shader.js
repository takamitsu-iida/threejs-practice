import * as THREE from "three";
import { OrbitControls } from "three/controls/OrbitControls.js";

// lil-gui
import { GUI } from "three/libs/lil-gui.module.min.js";

// stats.js
import Stats from "three/libs/stats.module.js";


// 参照元
// https://misora.main.jp/blog/archives/213


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


  uniforms = {

    positionMoveX: { value: 0.0 },
    positionMoveY: { value: 0.0 },
    positionMoveZ: { value: 0.0 },

    scaleSizeX: { value: 1.0 },
    scaleSizeY: { value: 1.0 },
    scaleSizeZ: { value: 1.0 },

    rotationAngleX: { value: 0.0 },
    rotationAngleY: { value: 0.0 },
    rotationAngleZ: { value: 0.0 },

  }

  constructor() {

    // scene, camera, renderer, controllerを初期化
    this.initThreejs();

    // lil-guiを初期化
    this.initGui();

    // stats.jsを初期化
    this.initStatsjs();

    // ノードを作成
    this.initCube();

    // フレーム毎の処理(requestAnimationFrameで再帰的に呼び出される)
    this.render();
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
      1001
    );
    this.camera.position.set(0, 5, 10);

    // レンダラ
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    // コントローラ
    this.controller = new OrbitControls(this.camera, this.renderer.domElement);

    // グリッドヘルパー
    const gridHelper = new THREE.GridHelper(10, 10, new THREE.Color(0x505050), new THREE.Color(0x505050));
    gridHelper.position.set(0, -1, 0);
    this.scene.add(gridHelper);

    // 軸を表示
    //
    //   Y(green)
    //    |
    //    +---- X(red)
    //   /
    //  Z(blue)
    //
    const axesHelper = new THREE.AxesHelper(0.5);
    // axesHelper.position.set(0, 1, 0);
    this.scene.add(axesHelper);

  }

  initGui() {
    const guiContainer = document.getElementById("guiContainer");
    const gui = new GUI({
      container: guiContainer,
      width: 300,
    });

    gui
      .add(this.uniforms.positionMoveX, "value")
      .name("positionMoveX")
      .min(0)
      .max(2)
      .step(0.1);

    gui
      .add(this.uniforms.positionMoveY, "value")
      .name("positionMoveY")
      .min(0)
      .max(2)
      .step(0.1);

    gui
      .add(this.uniforms.positionMoveZ, "value")
      .name("positionMoveZ")
      .min(0)
      .max(2)
      .step(0.1);

    gui
      .add(this.uniforms.scaleSizeX, "value")
      .name("scaleSizeX")
      .min(0)
      .max(2)
      .step(0.1);

    gui
      .add(this.uniforms.scaleSizeY, "value")
      .name("scaleSizeY")
      .min(0)
      .max(2)
      .step(0.1);

    gui
      .add(this.uniforms.scaleSizeZ, "value")
      .name("scaleSizeZ")
      .min(0)
      .max(2)
      .step(0.1);

    gui
      .add(this.uniforms.rotationAngleX, "value")
      .name("rotationAngleX")
      .min(0)
      .max(Math.PI)
      .step(0.1);

    gui
      .add(this.uniforms.rotationAngleY, "value")
      .name("rotationAngleY")
      .min(0)
      .max(Math.PI)
      .step(0.1);

    gui
      .add(this.uniforms.rotationAngleZ, "value")
      .name("rotationAngleZ")
      .min(0)
      .max(Math.PI)
      .step(0.1);

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


  onWindowResize = (event) => {
    this.sizes.width = this.container.clientWidth;
    this.sizes.height = this.container.clientHeight;

    this.camera.aspect = this.sizes.width / this.sizes.height;
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.sizes.width, this.sizes.height);
  };


  initCube() {

    // 2x2x2の立方体のジオメトリを作成
    const geometry = new THREE.BoxGeometry(2, 2, 2);

    // ジオメトリにcolor属性を**追加する**
    const colorBuffer = new Float32Array(geometry.attributes.position.count * 3);

    let colorIndex = 0;
    for (let i = 0; i < geometry.attributes.position.count; i++) {
      colorIndex = i * 3;
      colorBuffer[colorIndex + 0] = 0;     // R
      colorBuffer[colorIndex + 1] = 0;     // G
      colorBuffer[colorIndex + 2] = 0xff;  // B
    }

    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colorBuffer, 3));


    // シェーダーマテリアルを作成
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,

      vertexShader: /* glsl */`

        uniform float positionMoveX;
        uniform float positionMoveY;
        uniform float positionMoveZ;

        uniform float scaleSizeX;
        uniform float scaleSizeY;
        uniform float scaleSizeZ;

        uniform float rotationAngleX;
        uniform float rotationAngleY;
        uniform float rotationAngleZ;

        varying vec2 vUv;
        varying vec3 vColor;

        vec3 rot3D(vec3 p, vec3 axis, float angle){
          return mix( dot(axis, p) * axis, p, cos(angle) ) + cross(axis, p) * sin(angle);
        }

        mat2 rot2D(float angle){
          float s = sin(angle);
          float c = cos(angle);
          return mat2(c,-s,s,c);
        }


        void main() {
          vUv = uv;
          vColor = color;

          //平行移動行列
          mat4 MoveMatrix = mat4(
            1, 0, 0, positionMoveX,
            0, 1, 0, positionMoveY,
            0, 0, 1, positionMoveZ,
            0, 0, 0, 1
          );

          //拡大縮小行列
          mat4 ScaleMatrix = mat4(
            scaleSizeX, 0, 0, 0,
            0, scaleSizeY, 0, 0,
            0, 0, scaleSizeZ, 0,
            0, 0, 0, 1
          );

          //X軸回転
          mat4 rotationMatrixX = mat4(
            1, 0, 0, 0,
            0, cos(rotationAngleX), -sin(rotationAngleX), 0,
            0, sin(rotationAngleX), cos(rotationAngleX), 0,
            0, 0, 0, 1
          );

          //Y軸回転
          mat4 rotationMatrixY = mat4(
            cos(rotationAngleY), 0, sin(rotationAngleY), 0,
            0, 1, 0, 0,
            -sin(rotationAngleY), 0, cos(rotationAngleY), 0,
            0, 0, 0, 1
          );

          //Z軸回転
          mat4 rotationMatrixZ = mat4(
            cos(rotationAngleZ), -sin(rotationAngleZ), 0, 0,
            sin(rotationAngleZ), cos(rotationAngleZ), 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1
          );

          // PostionChange Rotation * position * move * scale
          vec4 R_Position = rotationMatrixX * rotationMatrixY * rotationMatrixZ * vec4(position, 1.0) * MoveMatrix * ScaleMatrix;
          vec4 worldPosition = modelMatrix * R_Position;
          vec4 mvPosition =  viewMatrix * worldPosition;

          gl_Position = projectionMatrix * mvPosition;

        }

      `,

      fragmentShader: /* glsl */`

        varying vec2 vUv;
        varying vec3 vColor;

        void main()
        {
          vec3 color = vColor;
          gl_FragColor = vec4(color, 1.0);
        }

      `,

      vertexColors: true,
      blending: THREE.NormalBlending,
      transparent: true,
      wireframe: true,
    });


    // メッシュ化して
    const cube = new THREE.Mesh(geometry, material);

    // シーンに追加
    this.scene.add(cube);
  }


}
