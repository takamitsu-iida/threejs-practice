import * as THREE from "three";
import { OrbitControls } from "three/controls/OrbitControls.js";
import { GUI } from "three/libs/lil-gui.module.min.js";

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
  gui;

  params = {
    pointNum: 300
  }

  curve;
  line;
  pointCoordinates = [
    [-6, 1, 10],
    [-1, 1, 10],
    [3,  2,  4],
    [6, 15,  4],
    [6, 12,  4],
    [15, 10,-15],
    [15,  9,-16],
    [17,  6,-16],
    [10,  9,  7],
    [2,  9,  8],
    [-4,  8,  7],
    [-8,  7,  1],
    [-9,  7, -4],
    [-6,  6, -9],
    [0,  5,-10],
    [7,  5, -7],
    [7,  5,  0],
    [0,  5,  2],
    [-5,  4,  2],
    [-7,  4, -5],
    [-8,  3, -9],
    [-12,  3, -10],
    [-15,  2, -7],
    [-15,  2, -2],
    [-14,  1,  3],
    [-11,  1, 10],
    [-6,  1, 10]
  ];


  constructor() {

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
      201
    );
    this.camera.position.set(0, 10, 30);

    // レンダラ
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    // デバイスピクセル比は上限2に制限(3以上のスマホ・タブレットでは処理が重すぎる)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    // 環境光
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.5));

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
    this.scene.add(new THREE.AxesHelper(100));
    this.scene.add(new THREE.GridHelper(50, 50));

    //
    // 点をもとにカーブを描く
    //

    const pointVectors = []
    this.pointCoordinates.forEach(coords => {
      pointVectors.push(new THREE.Vector3(coords[0], coords[1], coords[2]));
    });

    this.curve = new THREE.CatmullRomCurve3(pointVectors);
    const points = this.curve.getPoints(this.params.pointNum);

    const geometry = new THREE.BufferGeometry();
    geometry.setFromPoints(points);

    const material = new THREE.LineBasicMaterial({
      color: "yellow"
    });

    this.line = new THREE.LineLoop(geometry, material);
    this.scene.add(this.line);


    // lil-gui
    const gui = new GUI({ width: 300 });
    gui
      .add(this.params, "pointNum")
      .min(this.pointCoordinates.length)
      .max(300)
      .step(1)
      .name("Number of points")
      .onChange(()=>{
        const points = this.curve.getPoints(this.params.pointNum);
        this.line.geometry.setFromPoints(points);
      });

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