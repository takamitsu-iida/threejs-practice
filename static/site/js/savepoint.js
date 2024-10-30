import * as THREE from "three";
import { OrbitControls } from "three/controls/OrbitControls.js";

import Stats from "three/libs/stats.module.js";

import { GUI } from "three/libs/lil-gui.module.min.js";


// 参考
// https://ics.media/entry/11401/
// https://github.com/ics-creative/160304_threejs_save_point


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
    time: 0,
    interval: 1 / 30,  // = 30fps
  }

  params = {

  }

  // SavePointクラスのインスタンス
  savePoint;


  constructor(params = {}) {
    this.params = Object.assign(this.params, params);

    // scene, camera, rendererを初期化
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

    // 地面を描画
    this.initGround();

    // SavePointクラスのインスタンスを生成
    this.savePoint = new SavePoint();

    // シーンに追加
    this.scene.add(this.savePoint);

    // フレーム毎の処理を開始
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
      70,                                   // 視野角度 FOV
      this.sizes.width / this.sizes.height, // アスペクト比
      1,                                    // 開始距離
      1000                                  // 終了距離
    );
    this.camera.position.set(0, 0, 12);

    // レンダラ
    this.renderer = new THREE.WebGLRenderer({
      alpha: false,
      antialias: true
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    // コントローラ
    this.controller = new OrbitControls(this.camera, this.renderer.domElement);

    // 軸を表示
    //
    //   Y(green)
    //    |
    //    +---- X(red)
    //   /
    //  Z(blue)
    //
    const axesHelper = new THREE.AxesHelper(10);
    this.scene.add(axesHelper);

    // 環境光をシーンに追加
    this.scene.add(new THREE.AmbientLight(0xa0a0a0));

    // ポイントライトをシーンに追加
    const pointLight = new THREE.PointLight(0x555555, 1.6, 50);
    pointLight.position.set(0.577, 0.577, 0.577);
    pointLight.castShadow = true;
    this.scene.add(pointLight);

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

    // 一度だけ実行するための関数
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

  }


  render = () => {
    // 再帰処理
    this.renderParams.animationId = requestAnimationFrame(this.render);

    const delta = this.renderParams.clock.getDelta();
    this.renderParams.time += delta;
    this.renderParams.delta += delta;
    if (this.renderParams.delta < this.renderParams.interval) {
      return;
    }

    {
      // stats.jsを更新
      this.statsjs.update();

      // カメラコントローラーを更新
      this.controller.update();

      // fpsが揺れても表示が飛ばないように速度を調整
      const speedRate = Math.round(delta / this.renderParams.interval);

      // SavePointクラスのupdateメソッドを呼び出す
      this.savePoint.update(speedRate);

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
  }


  initGround = () => {
    // テクスチャを読み込む
    const texture = new THREE.TextureLoader().load("./static/site/img/savepoint_tile.png");
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(128, 128);

    // アンチエリアスを無効にする
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;

    // 100x100の板を作成
    const geometry = new THREE.PlaneGeometry(100, 100, 1, 1);

    const material = new THREE.MeshPhongMaterial({
      map: texture,
      bumpMap: texture,
      bumpScale: 1.0,
      shininess: 3,
      specularMap: texture,
      side: THREE.BackSide,
    });

    // メッシュ化して
    const plane = new THREE.Mesh(geometry, material);

    // 90度回転して床にして
    plane.rotation.x = (90 * Math.PI) / 180;

    // シーンに追加
    this.scene.add(plane);
  }


  initSavePoint = () => {

    const savePoint = new SavePoint();
    this.scene.add(savePoint);


  }

}



class SavePoint extends THREE.Object3D {

  // 光の柱
  pillar1;
  pillar2;

  // 渦
  swirl;

  // パーティクルエミッター
  particleEmitter;

  constructor() {
    super();

    // 光の柱 1
    const pillar1 = new Pillar(3, 3, 10);
    this.add(pillar1);
    this.pillar1 = pillar1;

    // 光の柱 2
    const pillar2 = new Pillar(8, 5, 2.5);
    this.add(pillar2);
    this.pillar2 = pillar2;

    // 渦
    const swirl = new Swirl();
    this.swirl = swirl;
    this.add(swirl);

    // パーティクルエミッター
    const particleEmitter = new ParticleEmitter();
    this.particleEmitter = particleEmitter;
    this.add(particleEmitter);

    // 地面の光
    const groundTexture = new THREE.TextureLoader().load("static/site/img/savepoint_ground.png");

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 10, 32, 32),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        map: groundTexture,
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    ground.scale.multiplyScalar(1.35);
    ground.rotation.x = (90 * Math.PI) / 180;
    ground.position.set(0, 0.02, 0);
    this.add(ground);

  }

  update = (speedRate) => {
    this.pillar1.update(speedRate);
    this.pillar2.update(speedRate);
    this.particleEmitter.update(speedRate);
    this.swirl.update(speedRate);
  }

}



class Pillar extends THREE.Object3D {

  // カウンター
  counter = 0;

  // 当てるテクスチャ
  texture;

  // 光の柱
  cylinder;

  constructor(topRadius, bottomRadius, height) {
    super();

    // テクスチャをロードする
    const texture = new THREE.TextureLoader().load("./static/site/img/savepoint_pillar.png");
    texture.wrapS = THREE.RepeatWrapping;
    texture.repeat.set(10, 1);
    this.texture = texture;

    // シリンダージオメトリを作成
    const geometry = new THREE.CylinderGeometry(
      topRadius,     // 上面の半径
      bottomRadius,  // 下面の半径
      height,        // 高さ
      20,            // 半径方向の分割数
      1,             // 高さ方向の分割数
      true           // 上面と下面を塗りつぶすかどうか
    );

    // マテリアルを作成
    const material = new THREE.MeshBasicMaterial({
      color: 0x007eff,
      map: this.texture,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });

    const cylinder = new THREE.Mesh(geometry, material);

    // 地面の高さに合わせる
    cylinder.position.set(0, height / 2, 0);

    this.add(cylinder);

    this.cylinder = cylinder;
  }

  update(speedRate) {
    this.counter += speedRate;

    const angle = (this.counter * Math.PI) / 180;

    // テクスチャを上下させる
    this.texture.offset.y = 0.1 + 0.2 * Math.sin(angle * 3);

    // テクスチャを回転させる
    this.texture.offset.x = angle;
  }
}


export default class Swirl extends THREE.Object3D {

  counter = 0;

  // マテリアルにあてるテクスチャー
  texture;

  constructor() {
    super();

    // テクスチャ
    const texture = new THREE.TextureLoader().load("./static/site/img/savepoint_swirl.png");
    texture.offset.y = -0.25;
    texture.wrapS = THREE.RepeatWrapping;
    this.texture = texture;

    // トーラスジオメトリを作成
    const geometry = new THREE.TorusGeometry(6, 3, 2, 100);

    // マテリアルを作成
    const material = new THREE.MeshBasicMaterial({
      color: 0x007eff,
      map: this.texture,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const torus = new THREE.Mesh(geometry, material);
    torus.position.y = 0.01;
    torus.rotation.x = (90 * Math.PI) / 180;
    this.add(torus);
  }

  update(speedRate) {
    this.counter += speedRate;
    const angle = (this.counter * Math.PI) / 180;
    this.texture.offset.x = -angle * 0.2;
  }
}


class ParticleEmitter extends THREE.Object3D {

  counter = 0;

  // パーティクルを格納する配列
  pool = [];

  /// 生成するパーティクルの数
  particleNum = 50;

  // パーティクルを発生させる間隔
  interval = 2;

  constructor() {
    super();
  }

  update(speedRate) {
    this.counter += speedRate;

    this.pool.forEach((particle, index) => {
      particle.update(speedRate);
    });

    if (Math.round(this.counter) % this.interval === 0) {
      this.addParticle();
    }
  }

  addParticle() {
    if (this.pool.length >= this.particleNum) {
      return;
    }
    const particle = new Particle();
    this.pool.push(particle);
    this.add(particle);
  }
}


class Particle extends THREE.Sprite {

  counter = 0;

  // パーティクルの速度
  velocity = new THREE.Vector3();

  constructor() {

    const material = new THREE.SpriteMaterial({
      color: 0x007eff,
      map: new THREE.TextureLoader().load("./static/site/img/savepoint_particle.png"),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    super(material.clone());

    // 初期化してランダムな場所に飛ばす
    this.reset();
  }

  reset() {
    const radian = Math.random() * Math.PI * 2;
    const x = Math.cos(radian) * 2;
    const z = Math.sin(radian) * 2;
    this.position.set(x, 0, z);
    this.scale.set(1, 1, 1);

    const vx = Math.random() * (0.015 - (-0.015)) + (-0.015);
    const vy = Math.random() * (0.1 - 0.05) + 0.05;
    const vz = Math.random() * (0.015 - (-0.015)) + (-0.015);
    this.velocity.set(vx, vy, vz);
    this.material.opacity = 1;
  }

  update(speedRate) {
    this.counter += speedRate;
    this.position.add(this.velocity.clone());
    this.material.opacity -= 0.009;

    const rad = Math.sin((this.counter * 30 * Math.PI) / 180);
    const scale = 0.75 + rad;
    this.scale.set(scale, scale, scale);

    if (this.material.opacity <= 0) {
      this.reset();
    }
  }
}
