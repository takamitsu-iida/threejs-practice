// 参照場所を変更する場合はHTMLのimportmapも修正すること
// vscodeでの補完を有効にするなら、このファイルからの相対参照にすること

// CDNを参照
/*
import * as THREE from "https://unpkg.com/three/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three@0.145/examples/jsm/controls/OrbitControls.js";
*/

// コピーしたソースコードを参照
/*
// import * as THREE        from "/threejs/three.js-r145/build/three.module.js";
// import { OrbitControls } from "/threejs/three.js-r145/examples/jsm/controls/OrbitControls.js";
import * as THREE        from "../../../threejs/three.js-r145/build/three.module.js";
import { OrbitControls } from "../../../threejs/three.js-r145/examples/jsm/controls/OrbitControls.js";
*/

// static配下にコピーしたものを参照
// import * as THREE        from "/static/build/three.module.js";
// import { OrbitControls } from "/static/controls/OrbitControls.js";
import * as THREE from "../../build/three.module.js";
import { OrbitControls } from "../../controls/OrbitControls.js";

// UIデバッグ
import GUI from "https://cdn.jsdelivr.net/npm/lil-gui@0.15/+esm";
const gui = new GUI();

// サイズ
const sizes = {
  width: window.innerWidth,
  height: window.innerHeight,
};

// グローバル変数
let scene;
let camera;
let renderer;
let controls;

// let pointLight;
// const clock = new THREE.Clock();

function init() {
  // シーン
  scene = new THREE.Scene();

  // カメラ
  camera = new THREE.PerspectiveCamera(
    100,                        // 視野角度
    sizes.width / sizes.height, // アスペクト比 width/height ブラウザのリサイズに注意
    0.1,                        // 開始距離
    1000                         // 終了距離
  );
  camera.position.set(0, 0, 10);

  // レンダラー
  renderer = new THREE.WebGLRenderer({
    alpha: true // 背景画像を表示するにはalphaをtrueにしてレンダラを透過させる
  });
  renderer.setSize(sizes.width, sizes.height); // サイズを合わせる
  renderer.setPixelRatio(window.devicePixelRatio); // 解像度を合わせる

  // レンダラーをHTMLの要素に加えてブラウザで処理
  document.body.appendChild(renderer.domElement);

  // グリッドヘルパー
  // const gridHelper = new THREE.GridHelper(500, 500);
  // scene.add(gridHelper);

  // マウス操作用のコントロール
  controls = new OrbitControls(camera, renderer.domElement);
  // controls.minDistance = 200;
  // controls.maxDistance = 400;

  // テクスチャを作成
  let texture = new THREE.TextureLoader().load("/static/site/img/earth.jpg");

  // ジオメトリを作成

  /*
  // SphereGeometry
  const ballGeometry = new THREE.SphereGeometry(100, 64, 32);

  // マテリアルを作成
  // MeshPhysicalMaterial
  // https://threejs.org/docs/index.html?q=meshph#api/en/materials/MeshPhysicalMaterial
  // 光源が必要
  let ballMaterial = new THREE.MeshPhysicalMaterial({
    map: texture,
  });

  // ジオメトリをメッシュ化
  const ball = new THREE.Mesh(ballGeometry, ballMaterial);
  scene.add(ball);

  // ポイント光源
  pointLight = new THREE.PointLight(0xffffff, 1);
  pointLight.position.set(-200, -200, -200);
  scene.add(pointLight);

  // ポイント光源ヘルパーを追加する
  let pointLightHelper = new THREE.PointLightHelper(pointLight, 30);
  scene.add(pointLightHelper);

  // 平行光源
  let directionalLight = new THREE.DirectionalLight(0xffffff, 2);
  directionalLight.position.set(100, 100, 100);
  scene.add(directionalLight);

  // 平行光源ヘルパー
  let directionalLightHelper = new THREE.DirectionalLightHelper(directionalLight, 30);
  scene.add(directionalLightHelper);
  */

  //
  // バッファジオメトリ
  //

  const bufferGeometry = new THREE.BufferGeometry();

  const positionArray = new Float32Array(9);
  positionArray[0] = 0;
  positionArray[1] = 0;
  positionArray[2] = 0;

  positionArray[3] = 0;
  positionArray[4] = 1;
  positionArray[5] = 0;

  positionArray[6] = 1;
  positionArray[7] = 0;
  positionArray[8] = 0;

  const positionAttribute = new THREE.BufferAttribute(positionArray, 3);

  bufferGeometry.setAttribute("position", positionAttribute);

  // 光源不要のマテリアル
  const material = new THREE.MeshBasicMaterial({
    wireframe: true,
  });

  const buffer = new THREE.Mesh(bufferGeometry, material);
  scene.add(buffer)


  // 平行光源
  let directionalLight = new THREE.DirectionalLight(0xffffff, 2);
  directionalLight.position.set(10, 10, 10);
  scene.add(directionalLight);

  animate();
}

function animate() {
  // const elapsedTime = clock.getElapsedTime();

  controls.update();

  // ポイント光源の位置を変更して周回させる
  /*
  pointLight.position.set(
    200 * Math.sin(Date.now() / 500),
    200 * Math.sin(Date.now() / 1000),
    200 * Math.cos(Date.now() / 500)
  )
  */

  // レンダリング
  renderer.render(scene, camera);

  // 再帰
  requestAnimationFrame(animate);
}

// ブラウザのリサイズ
function onWindowResize() {
  sizes.width = window.innerWidth;
  sizes.height = window.innerHeight;

  // レンダラーのサイズを更新
  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // カメラのアスペクト比を更新
  camera.aspect = sizes.width / sizes.height;
  camera.updateProjectionMatrix();
}

// リサイズのハンドラ
window.addEventListener("resize", onWindowResize);

// ページの読み込み後にinit()を実行
window.addEventListener("load", init);


/*
// テクスチャ設定
const textureLoader = new THREE.TextureLoader();
const particlesTexture = textureLoader.load("/static/site/img/particle.png")

//
// パーティクル
//

// ジオメトリを作成
const particlesGeometry = new THREE.BufferGeometry();
const count = 10000;

// (x, y, z)の値を持つので*3で配列を作る
const positionArray = new Float32Array(count * 3);
const colorArray = new Float32Array(count * 3);

// 座標をランダムに
for (let i = 0; i < count * 3; i++) {
  positionArray[i] = (Math.random() - 0.5) * 10;
  colorArray[i] = Math.random();
}

// ジオメトリの"position"アトリビュートに位置座標の配列をセットする
// (x, y, z)の3軸なので3をセット
particlesGeometry.setAttribute(
  "position", new THREE.BufferAttribute(positionArray, 3)
);

// ジオメトリの"color"アトリビュートに色配列をセットする
particlesGeometry.setAttribute(
  "color", new THREE.BufferAttribute(colorArray, 3)
);

// マテリアル
const pointMaterial = new THREE.PointsMaterial({
  size: 0.15,
  alphaMap: particlesTexture,
  transparent: true,
  depthWrite: false,
  vertexColors: true, // 頂点に色を付ける、パーティクルの場合はこれ
  blending: THREE.AdditiveBlending, // 重なったところを光らせる
});

// 単色を付けるならこれでよい
// pointMaterial.color.set("green");

// メッシュ化（ジオメトリ＋マテリアル）
// Pointsはパーティクル専用のメッシュ化
const particles = new THREE.Points(particlesGeometry, pointMaterial)

scene.add(particles)


// const clock = new THREE.Clock();




*/