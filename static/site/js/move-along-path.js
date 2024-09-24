import * as THREE from "three";
import { OrbitControls } from "three/controls/OrbitControls.js";

// stats.js
import Stats from "three/libs/stats.module.js";

// utils/BufferGeometryUtils.js
import { mergeGeometries } from "three/libs/utils/BufferGeometryUtils.js";

// 参照元
// https://observablehq.com/@rveciana/three-js-object-moving-object-along-path


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

  params = {
  }


  constructor(params={}) {
    this.params = Object.assign(this.params, params);

    // scene, camera, rendererを初期化
    this.initThreejs();

    // stats.jsを初期化
    this.initStatsjs();

    // 矢印オブジェクトを初期化
    this.initMoveAlongPath();

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

    // カメラ
    this.camera = new THREE.PerspectiveCamera(
      60,
      this.sizes.width / this.sizes.height,
      1,
      1001
    );
    this.camera.position.set(0, 5, 0);

    // レンダラ
    // 複数のテクスチャを重ね合わせるためには、透過を有効にする必要がある
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    // コントローラ
    this.controller = new OrbitControls(this.camera, this.renderer.domElement);

    // 軸を表示するヘルパーを初期化
    //
    //   Y(green)
    //    |
    //    +---- X(red)
    //   /
    //  Z(blue)
    //
    const axesHelper = new THREE.AxesHelper(0.5);
    this.scene.add(axesHelper);

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

      // オブジェクトの更新
      this.updateArrow();

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
  }


  initMoveAlongPath = () => {

    this.arrow = this.createArrow();

    this.scene.add(this.arrow);

    this.curvePath = this.createCurvePath();

    const line = this.createLineFromPath(this.curvePath);
    this.scene.add(line);

  }


  fraction = 0.0;
  arrow;
  curvePath;
  up = new THREE.Vector3(0, 1, 0);
  axis = new THREE.Vector3();
  radians = 0;

  updateArrow = () => {

    // 位置を更新
    const position = this.curvePath.getPointAt(this.fraction);
    this.arrow.position.copy(position);

    // 向きを更新
    const tangent = this.curvePath.getTangentAt(this.fraction);
    this.axis.crossVectors(this.up, tangent).normalize();
    this.radians = Math.acos(this.up.dot(tangent));
    this.arrow.quaternion.setFromAxisAngle(this.axis, this.radians);

    this.fraction += 0.001;
    if (this.fraction > 1) {
      this.fraction = 0;
    }

  }


  createArrow = () => {
    // 円錐と円柱を作成して結合する

    // 円錐
    const coneGeometry = new THREE.ConeGeometry(1, 2, 10);

    // 円柱
    const cylinderGeometry = new THREE.CylinderGeometry(0.4, 0.6, 3, 10);

    // 円柱の位置を上に調整
    coneGeometry.translate(0, 2.5, 0);

    // 結合する
    // .mergeGeometries ( geometries : Array, useGroups : Boolean ) : BufferGeometry
    const arrowGeometry = mergeGeometries([coneGeometry, cylinderGeometry]);

    // サイズを調整
    arrowGeometry.scale(0.05, 0.05, 0.05);

    // マテリアル
    const material = new THREE.MeshNormalMaterial();

    // メッシュ化
    const arrow = new THREE.Mesh(arrowGeometry, material);

    return arrow;
  }


  createCurvePath = () => {
    const path = new THREE.CurvePath();

    let bezierLine;

    bezierLine = new THREE.CubicBezierCurve3(
      new THREE.Vector3( 0.0, 0.0, 1.0 ),  // start
      new THREE.Vector3( 0.5, 0.0, 1.5 ),  // control point 1
      new THREE.Vector3( 1.5, 0.0, 0.5 ),  // control point 2
      new THREE.Vector3( 1.0, 0.0, 0.0 ),  // end
    );
    path.add(bezierLine);

    bezierLine = new THREE.CubicBezierCurve3(
      new THREE.Vector3( 1.0, 0.0, 0.0 ),   // start
      new THREE.Vector3( 1.5, 0.0, -1.5 ),  // control point 1
      new THREE.Vector3( 0.5, 0.0, -1.5 ),  // control point 2
      new THREE.Vector3( 0.0, 0.0, -1.0 ),  // end
    );
    path.add(bezierLine);

    bezierLine = new THREE.CubicBezierCurve3(
      new THREE.Vector3( 0.0, 0.0, -1.0 ),   // start
      new THREE.Vector3( -0.5, 0.0, -1.5 ),  // control point 1
      new THREE.Vector3( -1.5, 0.0, -0.5 ),  // control point 2
      new THREE.Vector3( -1.0, 0.0, 0.0 ),   // end
    );
    path.add(bezierLine);

    bezierLine = new THREE.CubicBezierCurve3(
      new THREE.Vector3( -1.0, 0.0, 0.0 ),  // start
      new THREE.Vector3( -1.5, 0.0, 0.5 ),  // control point 1
      new THREE.Vector3( -0.5, 0.0, 1.5 ),  // control point 2
      new THREE.Vector3( 0.0, 0.0, 1.0 ),   // end
    );
    path.add(bezierLine);

    return path;
  }


  createLineFromPath = (path) => {
    // const path = this.createPath();

    const numPoints = 10;

    // pathはcurvesの配列で構成されているので、それら曲線を展開してそれぞれから点を取得、一つの配列に格納する
    const points = path.curves.reduce((accumulator, currentValue) => {
      return [...accumulator, ...currentValue.getPoints(numPoints)];
    }, []);

    console.log(points);

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0x0000ff });

    return new THREE.Line(geometry, material);
  }

}
