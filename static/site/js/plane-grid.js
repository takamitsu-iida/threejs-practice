import * as THREE from "three";
import { OrbitControls } from "three/controls/OrbitControls.js";
import { ImprovedNoise } from "three/libs/ImprovedNoise.js";

const vertexShader = /* glsl */`

varying vec3 vPosition;

void main() {

  // 頂点の位置を加工しない場合の処理
  vec4 modelPosition = modelMatrix * vec4(position, 1.0);
  vec4 viewPosition = viewMatrix * modelPosition;
  vec4 projectionPosition = projectionMatrix * viewPosition;
  gl_Position = projectionPosition;

  // フラグメントシェーダーに位置情報を渡す
  vPosition = position;
}

`;


const fragmentShader = /* glsl */`

// 色は(R, G, B)の3次元
uniform vec3 uColor;

// 等圧線をひくインターバル
uniform float uInterval;

// 等圧線の太さ
uniform float uThickness;

// 位置情報はバーテックスシェーダーから引き取る
varying vec3 vPosition;


float getContourColor() {
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


void main() {

  // デバッグ用、単色で色付け
  // gl_FragColor = vec4(uColor, 1.0);

  // float color = getContourColor();
  // float color = getContourColor2();
  float color = getContourColor3();
  // float color = getContourColor4();

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
  directionalLight;
  controller;

  perlin;

  constructor() {

    // パーリンノイズ
    this.perlin = new ImprovedNoise();

    // コンテナ
    this.container = document.getElementById("threejs_container");

    // コンテナのサイズ
    this.sizes.width = this.container.clientWidth;
    this.sizes.height = this.container.clientHeight;

    // リサイズイベント
    window.addEventListener("resize", () => { this.onWindowResize(); }, false);

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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    // ディレクショナルライト
    this.directionalLight = new THREE.DirectionalLight(0xffffff, 1.25);
    this.directionalLight.position.set(1, 1, 0);
    this.scene.add(this.directionalLight);

    // 平面
    const g = new THREE.PlaneGeometry(200, 200, 512, 512);

    // X軸を中心に-90度回転してXZ平面と平行にする
    g.rotateX(-1 * Math.PI / 2)

    // 頂点のUV座標
    const uv = g.attributes.uv;
    console.log(uv);
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
    console.log(pos);
    // posはFloat32BufferAttribute型

    const tmpUv = new THREE.Vector2();
    for (let i = 0; i < uv.count; i++) {
      // i番目の(u, v)を取り出してtmpUvに複写
      tmpUv.fromBufferAttribute(uv, i);

      if (i === 1) {
        console.log(tmpUv);
      }

      // 値を大きくすると波の周波数が大きくなる
      tmpUv.multiplyScalar(10);

      if (i === 1) {
        console.log(tmpUv);
        console.log(this.perlin.noise(tmpUv.x, tmpUv.y, 2.7) * 30);
      }

      // pos.setY(i, this.perlin.noise(tmpUv.x, tmpUv.x, 2.7) * 30);
      // pos.setY(i, this.perlin.noise(tmpUv.y, tmpUv.y, 2.7) * 30);
      pos.setY(i, this.perlin.noise(tmpUv.x, tmpUv.y, 2.7) * 30);
    }

    // 法線ベクトルを計算し直す
    g.computeVertexNormals();

    const material = new THREE.ShaderMaterial({
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      transparent: true,
      side: THREE.DoubleSide,
      // グローバル変数
      uniforms: {
        // デバッグ用
        uColor: { value: new THREE.Color("#a0adaf") },

        // 等圧線をひくインターバル
        uInterval: { value: 1.0 },

        // 等圧線の太さ
        uThickness: { value: 1.0 },

      }
    });

    const ground = new THREE.Mesh(g, material);
    ground.layers.enable(1);
    this.scene.add(ground);

    let box = new THREE.Box3().setFromObject(ground);
    let boxSize = new THREE.Vector3();
    box.getSize(boxSize);
    let boxHelper = new THREE.Box3Helper(box);
    this.scene.add(boxHelper);

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

    // フレーム毎の処理(requestAnimationFrameで再帰的に呼び出される)
    this.render();
  }


  render() {
    // カメラコントローラーの更新
    this.controller.update();

    // 再描画
    this.renderer.render(this.scene, this.camera);

    // 再帰処理
    requestAnimationFrame(() => { this.render(); });
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
