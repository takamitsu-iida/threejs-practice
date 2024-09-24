import * as THREE from "three";
import { OrbitControls } from "three/controls/OrbitControls.js";
import { ImprovedNoise } from "three/libs/ImprovedNoise.js";

// lil-gui
import { GUI } from "three/libs/lil-gui.module.min.js";

// stats.js
import Stats from "three/libs/stats.module.js";


const fragmentShader = /* glsl */`

// 色は(R, G, B)の3次元
uniform vec3 uColor;

// 等圧線をひくインターバル
uniform float uInterval;

// 等圧線の太さ
uniform float uThickness;

// 位置情報はバーテックスシェーダーから引き取る
varying vec3 vPosition;

// どの関数をつかう？
uniform int uAlgo;


float getContourColor1() {
  // 位置情報のうち、Y座標を高度として扱う
  float height = vPosition.y;

  // アンチエイリアスのグリッドラインを計算する
  // float line = abs(fract(height - 0.5) - 0.5) / fwidth(height);
  float line = fract(height) / fwidth(height);

  line = line / uThickness;

  // 白黒逆転
  float color = 1.0 - min(line, 1.0);

  // ガンマ補正
  // color = pow(color, 1.0 / 2.2);

  return color;
}


float getContourColor2() {

  // 位置情報のうち、Y座標を高度として扱う
  float height = vPosition.y;

  // そのピクセルにおける高度をインターバルで割る
  float step = height / uInterval;

  // 小数点の部分だけを取り出すことで、一定間隔の高度で同じ処理結果が得られるようにする
  float f = fract(step);

  // fが取りうる値は 0.0 ～ 0.999... なので
  // これをそのまま返却すると  // 一定間隔で繰り返される
  // グラデーションのかかったシマシマ模様になる

  return f;
}


float getContourColor3() {

  // 位置情報のうち、Y座標を高度として扱う
  float height = vPosition.y;

  // そのピクセルにおける高度をインターバルで割る
  float step = height / uInterval;

  // 小数点の部分だけを取り出すことで、一定間隔の高度で同じ処理結果が得られるようにする
  // fが取りうる値は 0.0 ～ 0.999...
  float f = fract(step);

  // ここが難しいところ。
  // 右隣のピクセル(x+1)、上隣(y+1)のピクセルとの間でアンチエイリアス処理を施す。
  float w = fwidth(step);
  // float w = fwidth(height);


  // しきい値wから、w*線の太さ、で終わる値に補完する
  // 同時にw未満の値は0に、w*線の太さを超えるものは1.0に正規化する
  float ss = smoothstep(w, w * uThickness, f);

  // 白黒逆転
  float color = 1.0 - ss;

  return color;
}


float getContourColor4() {

  // 位置情報のうち、Y座標を高度として扱う
  float height = vPosition.y;

  // そのピクセルにおける高度をインターバルで割る
  float step_i = floor(height / uInterval);
  float step_f = mod(height, uInterval);

  // step_fを二値化する
  float contour = smoothstep(0.0, 0.1 * uThickness, step_f);

  // 白黒逆転
  contour = 1.0 - contour;

  return contour;
}


float getContourColor5() {
  // 位置情報のうち、Y座標を高度として扱う
  float height = vPosition.y;

  // そのピクセルにおける高度をインターバルで割る
  float step_i = floor(height / uInterval);
  float step_f = mod(height, uInterval);
  float step_df = fwidth(step_f);

  // step_fを滑らかに二値化する
  float contour = smoothstep(-uThickness*step_df, uThickness*step_df, step_f);

  // 白黒逆転
  contour = 1.0 - contour;

  return contour;
}



void main() {

  // デバッグ用、単色で色付け
  // gl_FragColor = vec4(uColor, 1.0);

  float color;
  if (uAlgo == 1) {
    color = getContourColor1();
  }
  if (uAlgo == 2) {
    color = getContourColor2();
  }
  if (uAlgo == 3) {
    color = getContourColor3();
  }
  if (uAlgo == 4) {
    color = getContourColor4();
  }
  if (uAlgo == 5) {
    color = getContourColor5();
  }

  gl_FragColor = vec4(color, color, color, 1.0);

}

`;


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

  // パーリンノイズ
  perlin = new ImprovedNoise();

    // シェーダーに渡すグローバル変数
    uniforms = {

      // 等圧線をひくインターバル
      uInterval: { value: 1.0 },

      // 等圧線の太さ
      uThickness: { value: 1.0 },

      uBoxMin: { value: new THREE.Vector3() },
      uBoxMax: { value: new THREE.Vector3() }

    };


  constructor() {

    this.initThreejs();

    this.initGui();

    this.initStatsjs();

    this.createGround();

    this.render();
  }


  initThreejs = () => {
    // コンテナ
    this.container = document.getElementById("threejsContainer");

    // コンテナのサイズ
    this.sizes.width = this.container.clientWidth;
    this.sizes.height = this.container.clientHeight;

    // リサイズイベント
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
    this.camera.position.set(100, 100, 160);
    this.camera.position.length(157);

    // レンダラ
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    // デバイスピクセル比は上限2に制限(3以上のスマホ・タブレットでは処理が重すぎる)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    // ディレクショナルライト
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.25);
    directionalLight.position.set(1, 1, 0);
    this.scene.add(directionalLight);

    // コントローラ
    this.controller = new OrbitControls(this.camera, this.renderer.domElement);
    this.controller.target.set(0, 2, 0);

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


  initGui = () => {
    const gui = new GUI({ width: 300 });

    gui
      .add(this.uniforms.uThickness, "value")
      .min(0.0)
      .max(5.0)
      .step(0.01)
      .name("uThickness");

    gui
      .add(this.uniforms.uInterval, "value")
      .min(1.0)
      .max(10.0)
      .step(0.1)
      .name("Interval");

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


  createGround = () => {
    // 平面
    const g = new THREE.PlaneGeometry(200, 200, 512, 512);

    // X軸を中心に-90度回転してXZ平面と平行にする
    g.rotateX(-1 * Math.PI / 2)

    // 頂点のUV座標
    const uv = g.attributes.uv;
    // console.log(uv);
    // uvはFloat32BufferAttribute型
    // https://threejs.org/docs/#api/en/core/BufferAttribute
    //
    // 一次元のarrayに値が格納されているので(u, v)を直接取り出すのは難しいが、
    // Vector2, Vector3, Vector4, Colorクラスには.fromBufferAttribute(attribute, index)メソッドがあるので、
    // それを使うとインデックスを指定して(u, v)を取り出せる
    //
    // uv.countには(u, v)の個数が格納されている

    // 頂点の位置情報
    const pos = g.attributes.position;
    // console.log(pos);
    // posはFloat32BufferAttribute型

    const tmpUv = new THREE.Vector2();
    for (let i = 0; i < uv.count; i++) {
      // i番目の(u, v)を取り出してtmpUvに複写
      tmpUv.fromBufferAttribute(uv, i);

      // 値を大きくすると波の周波数が大きくなる
      tmpUv.multiplyScalar(10);

      pos.setY(i, this.perlin.noise(tmpUv.x, tmpUv.y, 2.7) * 30);
    }

    // 法線ベクトルを計算し直す
    g.computeVertexNormals();


    const material = new THREE.MeshLambertMaterial({
      color: 0xa0adaf,
      transparent: true,
      side: THREE.DoubleSide,
      // 組み込みのシェーダーを書き換える
      onBeforeCompile: (shader) => {

        shader.uniforms.uInterval = this.uniforms.uInterval;
        shader.uniforms.uThickness = this.uniforms.uThickness;
        shader.uniforms.uBoxMin = this.uniforms.uBoxMin;
        shader.uniforms.uBoxMax = this.uniforms.uBoxMax;

        shader.vertexShader = `
          varying vec3 vPosition;
          ${shader.vertexShader}
        `.replace(
            `#include <fog_vertex>`,
            `#include <fog_vertex>
              vPosition = transformed;
            `
        );

        shader.fragmentShader = `
          uniform float uInterval;
          uniform float uThickness;
          uniform vec3 uBoxMin;
          uniform vec3 uBoxMax;
          varying vec3 vPosition;
          ${shader.fragmentShader}
        `.replace(
          `#include <dithering_fragment>`,
          `#include <dithering_fragment>

          // 位置情報のうち、Y座標を高度として扱う
          float height = vPosition.y;

          // そのピクセルにおける高度をインターバルで割る
          float grid = height / uInterval;

          // 小数点部を取り出すことで同じ処理が繰り返される
          float f = fract(grid);

          // 偏微分の和をとることで変化量を得る
          float df = fwidth(grid);

          // fを滑らかに二値化する
          float contour = abs(smoothstep(-df * uThickness, df * uThickness, f));

          // 0.0 ～ 1.0にクランプする
          contour = clamp(contour, 0.0, 1.0);

          // 白黒逆転
          contour = 1.0 - contour;

          // ガンマ補正
          contour = pow(contour, 1.0 / 2.2);

          // 0.01より大きければ1.0に変更
          contour = 1.0 - step(contour, 0.01);

          vec3 color = gl_FragColor.rgb;
          vec3 lineColor = vec3(contour, contour, contour);
          color = color + lineColor;

          gl_FragColor = vec4(color, opacity);
          `

        );
        console.log(shader.fragmentShader);

      },
    });

    const ground = new THREE.Mesh(g, material);
    ground.layers.enable(1);
    this.scene.add(ground);

    let box = new THREE.Box3().setFromObject(ground);
    let boxSize = new THREE.Vector3();
    box.getSize(boxSize);
    let boxHelper = new THREE.Box3Helper(box);
    this.scene.add(boxHelper);

    this.uniforms.uBoxMin.value.copy(box.min);
    this.uniforms.uBoxMax.value.copy(box.max);

  }

}
