import * as THREE from "three";
import { OrbitControls } from "three/controls/OrbitControls.js";

// lil-gui
import { GUI } from "three/libs/lil-gui.module.min.js";

// stats.js
import Stats from "three/libs/stats.module.js";

// Google Maps ThreeJS Overlay View and Utilities
// https://github.com/googlemaps/js-three?tab=readme-ov-file
import { ThreeJSOverlayView } from "@googlemaps/three";


export class Main {

  // Three.jsを表示するコンテナのHTML要素
  container;

  // そのコンテナのサイズ
  sizes = {
    width: 0,
    height: 0
  }


  // Three.jsの各種インスタンス
  scene;
  camera;
  renderer;
  controller;
  statsjs;

  // レンダリング用のパラメータ
  renderParams = {
    animationId: null,
    clock: new THREE.Clock(),
    delta: 0,
    interval: 1 / 30,  // = 30fps
  }

  params = {
  }


  constructor(params = {}) {
    this.params = Object.assign(this.params, params);
    this.init();
  }


  init = async () => {

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
    this.clearScene();

    // 全てを削除した状態で描画
    this.renderer.render(this.scene, this.camera);

    this.initMap();

    // フレーム毎の処理
    this.render();
  }





  initMap = async () => {
    const { Map } = await google.maps.importLibrary("maps");

    this.map = new Map(document.getElementById("map"), {
      center: { lat: -34.397, lng: 150.644 },
      zoom: 8,
    });



  }



  initThreejs = () => {

    // Three.jsを表示するHTML要素
    this.container = document.getElementById("threejsContainer");

    // そのコンテナのサイズ
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
    this.camera.position.set(0, 100, 100);

    // レンダラ
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
    });

    this.renderer.setSize(this.sizes.width, this.sizes.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // コンテナにレンダラを追加
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
    const xzGridSize = 100;
    const axesHelper = new THREE.AxesHelper(xzGridSize);
    this.scene.add(axesHelper);

    // 環境光
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
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


    // 画面が小さい場合は初期状態で閉じた状態にする
    if (window.matchMedia('(max-width: 640px)').matches) {
      gui.close();
    }

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

      // カメラコントローラーを更新
      this.controller.update();

      // シーンをレンダリング
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
      if (child.type === 'AxesHelper' || child.type === 'GridHelper' || String(child.type).indexOf('Light') >= 0) {
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
  };







}
