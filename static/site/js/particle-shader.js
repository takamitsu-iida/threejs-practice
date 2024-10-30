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
    animationId: null,
    clock: new THREE.Clock(),
    delta: 0,
    interval: 1 / 30,  // = 30fps
  }

  uniforms = {
    // initThreejs()でレンダラとカメラを設定する際に値を設定
    u_pixel_ratio: { value: 0.0 },
    u_camera_constant: { value: 0.0 },

    u_particle_size: { value: 10.0 },
  }

  params = {
    // パーティクルの数
    numParticles: 10,


  }


  constructor(params = {}) {
    this.params = Object.assign(this.params, params);

    // scene, camera, renderer, controllerを初期化
    this.initThreejs();

    // stats.jsを初期化
    this.initStatsjs();

    // lil-guiを初期化
    this.initGui();

    // コンテンツを初期化
    this.initContents();
  }


  initContents = () => {
    // アニメーションを停止
    this.stop();

    // シーン上のメッシュを削除する
    // this.scene.clear();
    this.clearScene();

    // 削除した状態を描画
    this.renderer.render(this.scene, this.camera);

    // パーティクルを作成
    this.initParticles();

    // フレーム毎の処理
    this.render();
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

    // カメラを初期化
    this.camera = new THREE.PerspectiveCamera(
      60,                                   // 視野角度 FOV
      this.sizes.width / this.sizes.height, // アスペクト比
      0.1,                                  // 開始距離
      100                                   // 終了距離
    );
    this.camera.position.set(0, 4, 4);

    // カメラの情報をシェーダーに渡す
    this.uniforms.u_camera_constant.value = this.getCameraConstant();

    // レンダラ
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    // レンダラに設定したピクセルレシオ値をシェーダーに渡す
    this.uniforms.u_pixel_ratio.value = this.renderer.getPixelRatio();

    // コントローラ
    this.controller = new OrbitControls(this.camera, this.renderer.domElement);

    // グリッドヘルパー
    const gridHelper = new THREE.GridHelper(10, 10, new THREE.Color(0x505050), new THREE.Color(0x505050));
    this.scene.add(gridHelper);

    // 軸を表示
    //
    //   Y(green)
    //    |
    //    +---- X(red)
    //   /
    //  Z(blue)
    //
    const axesHelper = new THREE.AxesHelper(0.25);
    this.scene.add(axesHelper);

  }


  initGui = () => {
    const guiContainer = document.getElementById("guiContainer");
    const gui = new GUI({
      container: guiContainer,
      width: 300,
    });

    const doLater = (job, tmo) => {

      // 処理が登録されているならタイマーをキャンセル
      var tid = doLater.TID[job];
      if (tid) {
        window.clearTimeout(tid);
      }

      // タイムアウト登録する
      doLater.TID[job] = window.setTimeout(() => {
        // 実行前にタイマーIDをクリア
        doLater.TID[job] = null;
        // 登録処理を実行
        job.call();
      }, tmo);
    }

    // 処理からタイマーIDへのハッシュ
    doLater.TID = {};

    gui
      .add(this.uniforms.u_particle_size, "value")
      .name("Particle Size")
      .min(1)
      .max(100)
      .step(1);

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


  render = () => {
    // 再帰処理
    this.renderParams.animationId = requestAnimationFrame(this.render);

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


  stop = () => {
    if (this.renderParams.animationId) {
      cancelAnimationFrame(this.renderParams.animationId);
    }
    this.renderParams.animationId = null;
  }


  clearScene = () => {
    const objectsToRemove = [];

    this.scene.children.forEach((child) => {
      if (child.type === 'AxesHelper' || child.type === 'GridHelper' || String(child.type).indexOf('Light') >= 0 ) {
        return;
      }
      objectsToRemove.push(child);
    });

    objectsToRemove.forEach((object) => {
      this.scene.remove(object);
      if (object.geometry) {
        object.geometry.dispose();
      }
      if (object.material) {
        if (Array.isArray(object.material)) {
          object.material.forEach(material => material.dispose());
        } else {
          object.material.dispose();
        }
      }
    });
  }


  onWindowResize = (event) => {
    this.sizes.width = this.container.clientWidth;
    this.sizes.height = this.container.clientHeight;

    this.camera.aspect = this.sizes.width / this.sizes.height;
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.sizes.width, this.sizes.height);

    // シェーダー側に渡すUniform変数を変更する
    this.uniforms.u_pixel_ratio.value = this.renderer.getPixelRatio();
    this.uniforms.u_camera_constant.value = this.getCameraConstant();
  };


  initParticles = () => {
    this.createParticle_1();
    this.createParticle_2();
    this.createParticle_3();
  }


  createParticle_1 = (y=0.5) => {
    const numParticles = this.params.numParticles;

    const geometry = new THREE.BufferGeometry();

    const positions = new Float32Array(numParticles * 3);

    for (let i = 0; i < numParticles; i++) {
      positions[i * 3 + 0] = 0;        // X
      positions[i * 3 + 1] = y;        // Y
      positions[i * 3 + 2] = i * 0.2;  // Z
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,

      vertexShader: /* glsl */`
        uniform float u_camera_constant;
        uniform float u_pixel_ratio;
        uniform float u_particle_size;

        void main() {
          vec4 modelPosition = modelMatrix * vec4(position, 1.0);
          vec4 viewPosition = viewMatrix * modelPosition;
          gl_Position = projectionMatrix * viewPosition;

          // ポイントのサイズを決定
          gl_PointSize = u_particle_size * u_pixel_ratio;
          vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
          gl_PointSize += 0.05 * u_camera_constant / ( - mvPosition.z );
        }
      `,
      fragmentShader: /* glsl */`
        void main() {
          vec2 dist = gl_PointCoord - vec2(0.5);
          float len = length( dist );
          if ( len > 0.1 ) {
            discard;
          }
          gl_FragColor = vec4( 0.0, 0.0, 1.0, 1.0 );
        }
      `,
    });

    const particles = new THREE.Points(geometry, material);

    // シーンに追加
    this.scene.add(particles);
  }


  createParticle_2 = (y=1) => {
    const numParticles = this.params.numParticles;

    const geometry = new THREE.BufferGeometry();

    const positions = new Float32Array(numParticles * 3);

    for (let i = 0; i < numParticles; i++) {
      positions[i * 3 + 0] = 0;        // X
      positions[i * 3 + 1] = y;        // Y
      positions[i * 3 + 2] = i * 0.2;  // Z
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const material = new THREE.ShaderMaterial({
      transparent: true,  // ★フラグメントシェーダーでalphaを操作するので必要
      depthWrite: false,

      uniforms: this.uniforms,

      vertexShader: /* glsl */`
        uniform float u_pixel_ratio;
        uniform float u_particle_size;
        void main() {
          vec4 modelPosition = modelMatrix * vec4(position, 1.0);
          vec4 viewPosition = viewMatrix * modelPosition;
          gl_Position = projectionMatrix * viewPosition;

          gl_PointSize = 3.0 * u_particle_size * u_pixel_ratio;
          gl_PointSize *= (1.0 / -viewPosition.z);
        }
      `,

      fragmentShader: /* glsl */`
        void main() {
          float _radius = 0.4;
          vec2 dist = gl_PointCoord - vec2(0.5);
          float strength = 1.0 - smoothstep(_radius-(_radius*0.4), _radius+(_radius*0.3), dot(dist, dist)*2.0);
          gl_FragColor = vec4(0.0, 1.0, 0.0, strength);
        }
      `,
    });

    const particles = new THREE.Points(geometry, material);

    // シーンに追加
    this.scene.add(particles);

    // ./static/site/img/Router.48.png

  }

  createParticle_3 = (y=1.5) => {

    const numParticles = this.params.numParticles;

    const geometry = new THREE.BufferGeometry();

    const positions = new Float32Array(numParticles * 3);

    for (let i = 0; i < numParticles; i++) {
      positions[i * 3 + 0] = 0;        // X
      positions[i * 3 + 1] = y;        // Y
      positions[i * 3 + 2] = i * 0.2;  // Z
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    this.scene.add(new THREE.Points(geometry, new THREE.PointsMaterial({
      size: 0.15,
      map: new THREE.TextureLoader().load("./static/site/img/particle.png"),
      blending: THREE.AdditiveBlending,
    })));


  }



  // カメラオブジェクトからシェーダーに渡したい情報を引っ張ってくる関数
  // カメラからパーティクルがどれだけ離れてるかを計算し、パーティクルの大きさを決定するため。
  getCameraConstant = () => {
    const DEG2RAD = Math.PI / 180;
    return this.sizes.height / (Math.tan(DEG2RAD * 0.5 * this.camera.fov) / this.camera.zoom);
  }


}
