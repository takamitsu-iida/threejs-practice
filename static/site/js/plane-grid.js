import * as THREE from "three";
import { OrbitControls } from "three/controls/OrbitControls.js";
import { ImprovedNoise } from "three/libs/ImprovedNoise.js";
import { GUI } from "three/libs/lil-gui.module.min.js";

const vertexShader = /* glsl */`

varying vec3 vPosition;

void main() {

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

// どの関数をつかうか
uniform int uAlgo;

float getContourColor1() {

  // この実装を参考にしたもの
  // https://madebyevan.com/shaders/grid/

  // 注意：　線は綺麗だが、線は正しい場所に引かれないので等高線としては使えない

  // 位置情報のうち、Y座標を高度として扱う
  float height = vPosition.y;

  // アンチエイリアスのグリッドラインを計算する
  float line = abs(fract(height - 0.5) - 0.5) / fwidth(height / uInterval) / uThickness;

  // 白黒逆転
  float color = 1.0 - min(line, 1.0);

  // ガンマ補正
  color = pow(color, 1.0 / 2.2);

  // デバッグ用、期待する場所に等圧線が来ているかを確認する
  // if (fract(height / uInterval) < 0.01) {
  //    return 0.5;
  // }

  return color;
}


float getContourColor2() {

  // 注意：　これを表示すると、処理すべきことが見えてくる

  // 位置情報のうち、Y座標を高度として扱う
  float height = vPosition.y;

  // そのピクセルにおける高度をインターバルで割る
  float grid = height / uInterval;

  // 小数点の部分だけを取り出すことで、一定間隔の高度で同じ処理結果が得られるようにする
  float f = fract(grid);

  // fを返却すると一定間隔で繰り返されるグラデーションのかかったシマシマ模様になる
  return f;
}


float getContourColor3() {

  // 注意　正しい場所に線が引かれ、見た目もそこそこ綺麗

  // 位置情報のうち、Y座標を高度として扱う
  float height = vPosition.y;

  // そのピクセルにおける高度をインターバルで割る
  float grid = height / uInterval;

  // 小数点の部分だけを取り出すことで、一定間隔の高度で同じ処理結果が得られるようにする
  float f = fract(grid);

  // ここが難しいところ。
  // 右隣のピクセル(x+1)、上隣(y+1)のピクセルとの間でアンチエイリアス処理を施す。
  float df = fwidth(grid);

  // しきい値wから、w*線の太さ、で終わる値に補完する
  // 同時にw未満の値は0に、w*線の太さを超えるものは1.0に正規化する
  float contour = smoothstep(df, df * uThickness, f);

  // 0.0 ～ 1.0にクランプする
  contour = clamp(contour, 0.0, 1.0);

  // 白黒逆転
  contour = 1.0 - contour;

  // デバッグ用、期待する場所に等圧線が来ているかを確認する
  // if (fract(grid) < 0.01) {
  //   return 0.5;
  // }

  return contour;
}


float getContourColor4() {

  // 正しい場所に線が引かれるが、高度変化が少ない場所では線が太くなってしまう

  // 位置情報のうち、Y座標を高度として扱う
  float height = vPosition.y;

  // そのピクセルにおける高度をインターバルで割る
  float grid = height / uInterval;

  // 小数点の部分だけを取り出すことで、一定間隔の高度で同じ処理結果が得られるようにする
  float f = fract(grid);

  // fを二値化する
  float contour = smoothstep(0.0, 0.1 * uThickness, f);

  // 白黒逆転
  contour = 1.0 - contour;

  // デバッグ用、期待する場所に等圧線が来ているかを確認する
  // if (fract(grid) < 0.01) {
  //  return 0.5;
  // }

  return contour;
}


float getContourColor5() {

  // 注意：　正しい場所に線が引かれ、見た目もそこそこ綺麗

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

  // 0.001より大きければ1.0に変更
  contour = 1.0 - step(contour, 0.001);

  // デバッグ用、期待する場所に等圧線が来ているかを確認する
  //if (fract(grid) < 0.01) {
  //  return 0.5;
  //}

  return contour;
}


float getContourColor6() {

  // 注意：　正しい場所に線が引かれるが、見た目が汚い

  // 位置情報のうち、Y座標を高度として扱う
  float height = vPosition.y;

  // 高度をインターバルで割る
  float grid = height / uInterval;

  // 小数点部を取り出すことで同じ処理が繰り返される
  float f = fract(grid);

  // 偏微分の和をとることで変化量を得る
  float df = fwidth(f);

  float contour = (f - df * uThickness) / df;

  // 0.0 ～ 1.0にクランプする
  contour = clamp(contour, 0.0, 1.0);

  // 白黒逆転
  contour = 1.0 - contour;

  // ガンマ補正
  contour = pow(contour, 1.0 / 2.2);

  // デバッグ用、期待する場所に等圧線が来ているかを確認する
  //if (fract(grid) < 0.01) {
  //  return 0.5;
  //}

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
  if (uAlgo == 6) {
    color = getContourColor6();
  }

  if (color == 0.0) {
    gl_FragColor = vec4(gl_FragColor.rgb, 1.0);
  } else {
    gl_FragColor = vec4(color, color, color, 1.0);
  }

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
    this.directionalLight = new THREE.DirectionalLight(0xffffff, 1.25);
    this.directionalLight.position.set(1, 1, 0);
    this.scene.add(this.directionalLight);

    // 平面
    const g = new THREE.PlaneGeometry(200, 200, 512, 512);

    // X軸を中心に-90度回転してXZ平面と平行にする
    g.rotateX(-1 * Math.PI / 2)

    // 頂点のUV座標
    const uv = g.attributes.uv;

    // uvはFloat32BufferAttribute型
    // https://threejs.org/docs/#api/en/core/BufferAttribute
    //
    // 一次元のarrayに値が格納されているので(u, v)を直接取り出すのは難しいが、
    // Vector2, Vector3, Vector4, Colorクラスには.fromBufferAttribute(attribute, index)メソッドがあるので、
    // それを使うとインデックスを指定して(u, v)を取り出せる
    //
    // uv.countには(u, v)の個数が格納されている

    // 頂点の位置情報
    // Float32BufferAttribute型
    const pos = g.attributes.position;

    const tmpUv = new THREE.Vector2();
    for (let i = 0; i < uv.count; i++) {
      // i番目の(u, v)を取り出してtmpUvに複写
      tmpUv.fromBufferAttribute(uv, i);

      // 値を大きくすると波の周波数が大きくなる
      tmpUv.multiplyScalar(10);

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

        // 等圧線を書く方式
        uAlgo: { value: 5 },

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

    // lil-gui
    const gui = new GUI({ width: 300 });
    gui
      .add(material.uniforms.uThickness, "value")
      .min(0.0)
      .max(5.0)
      .step(0.01)
      .name("uThickness");

    gui
      .add(material.uniforms.uInterval, "value")
      .min(1.0)
      .max(10.0)
      .step(0.1)
      .name("Interval");

    gui
      .add(material.uniforms.uAlgo, "value", [1, 2, 3, 4, 5, 6])
      .name("getContour");

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


  onWindowResize = (event) => {
    this.sizes.width = this.container.clientWidth;
    this.sizes.height = this.container.clientHeight;

    this.camera.aspect = this.sizes.width / this.sizes.height;
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.sizes.width, this.sizes.height);
  };

}
