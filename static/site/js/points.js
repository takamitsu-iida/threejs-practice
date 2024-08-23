import * as THREE from "three";
import { OrbitControls } from "three/controls/OrbitControls.js";
import { GUI } from "three/libs/lil-gui.module.min.js";


// https://codepen.io/prisoner849/pen/WNaLywN?editors=0010

export class Main {

  // <div id="threejs_container"></div>
  container;

  // 初期化時にDIV要素(container)のサイズに変更する
  sizes = {
    width: 0,
    height: 0
  };

  // シーン
  scene;

  // カメラ
  camera;

  // レンダラ
  render;

  // マウス操作のコントローラ
  controller;

  // lil-gui
  gui;

  geometry;
  material;

  // 可視化対象のポイントクラウド
  pointCloud; // = new THREE.Points(geometry, material)

  // ポイント数上限
  MAX_POINTS = 2000;

  // 動作パラメータ
  params = {
    pointNum: 1000,
    pointSize: 0.1,
    rotateDirection: "random",
    rotateSpeed: 0.001,
  }

  // 全てのポイントの位置情報をVector3型で格納しておく行列
  pointPositions; // = new Array(this.MAX_POINTS)

  // 全てのポイントの法線情報をVector3型で格納しておく行列
  pointNormals; // = new Array(this.MAX_POINTS)

  axisX = new THREE.Vector3(1, 0, 0);
  axisY = new THREE.Vector3(0, 1, 0);
  axisZ = new THREE.Vector3(0, 0, 1);
  axisXYZ = new THREE.Vector3(1, 1, 1).normalize();

  constructor(params) {
    params = params || {}
    this.params.pointNum = 'pointNum' in params ? params.pointNum : this.params.pointNum;
    this.params.pointSize = 'pointSize' in params ? params.pointSize : this.params.pointSize;

    // コンテナ
    this.container = document.getElementById("threejs_container");

    // コンテナ要素にあわせてサイズを初期化
    this.sizes.width = this.container.clientWidth;
    this.sizes.height = this.container.clientHeight;

    // シーン
    this.scene = new THREE.Scene();

    // カメラ
    this.camera = new THREE.PerspectiveCamera(
      60,                                   // 視野角度
      this.sizes.width / this.sizes.height, // アスペクト比 width/height ブラウザのリサイズに注意
      0.1,                                  // 開始距離
      100                                   // 終了距離
    );
    this.camera.position.set(0, 0, 20);

    // レンダラ
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    // デバイスピクセル比は上限2に制限(3以上のスマホ・タブレットでは処理が重すぎる)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x333333);
    this.container.appendChild(this.renderer.domElement);

    // マウス操作のコントローラ
    this.controller = new OrbitControls(this.camera, this.renderer.domElement);
    this.controller.enableDamping = true;
    this.controller.enablePan = false;

    // グリッドヘルパーを追加
    this.scene.add(new THREE.GridHelper(25, 25));

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
      .add(this.params, 'pointSize')
      .min(0.01)
      .max(0.2)
      .name("point size")
      .onChange(size => {
        this.material.size = size;
      })

    gui
      .add(this.params, 'rotateDirection')
      .options(['random', 'X', 'Y', 'Z', 'XYZ'])
      .name('rotate direction')

    gui
      .add(this.params, 'rotateSpeed')
      .min(0.001)
      .max(0.005)
      .name("rotate speed");

    //
    // パーティクル（ポイントクラウド）
    //

    // ポイントの法線情報を格納する配列を作成
    this.pointNormals = [];

    // ポイントの位置情報を格納する配列を作成
    // 新規Arrayをmap()して新しい配列に作り変える
    this.pointPositions = new Array(this.MAX_POINTS).fill().map(() => {

      // ポイントの位置座標となるVector3を新規に作成
      const p = new THREE.Vector3();

      // pを単位球の表面にランダムに配置
      p.randomDirection();

      // 10倍して半径10の球にする
      p.multiplyScalar(10.0);

      // このポイントの法線ベクトルを作成する
      const normalVector = new THREE.Vector3();

      // 向きはランダムで、半径1の球のどこかを指す
      normalVector.randomDirection();

      // https://threejs.org/docs/#api/en/math/Vector3.randomDirection
      // randomDirection () : this
      // Sets this vector to a uniformly random point on a unit sphere.

      // 作成した法線は保存しておく
      this.pointNormals.push(normalVector);

      return p;
    });

    // ジオメトリを作成
    this.geometry = new THREE.BufferGeometry();

    // 作成したポイントの位置情報をジオメトリに反映
    this.geometry.setFromPoints(this.pointPositions);

    // マテリアルを作成
    this.material = new THREE.PointsMaterial({
      size: this.params.pointSize,
      color: "yellow",
    });

    // メッシュ化
    this.pointCloud = new THREE.Points(this.geometry, this.material)
    this.scene.add(this.pointCloud);

    // resizeイベントのハンドラを登録
    window.addEventListener("resize", () => {
      this.sizes.width = this.container.clientWidth;
      this.sizes.height = this.container.clientHeight;

      this.camera.aspect = this.sizes.width / this.sizes.height;
      this.camera.updateProjectionMatrix();

      this.renderer.setSize(this.sizes.width, this.sizes.height);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    });

    this.animate();
  }


  spin() {
    if (!this.params.rotateDirection) {
      return;
    }

    const radian = this.params.rotateSpeed;
    this.pointPositions.forEach((p, index) => {

      if (this.params.rotateDirection === "random") {
        // pointNormalsに保存して法線情報を取り出して、それを回転用の軸に使う
        // ポイントごとにランダムに設定されているので、各ポイントばらばらの方向に回転する
        const normal = this.pointNormals[index];

        // https://threejs.org/docs/#api/en/math/Vector3.applyAxisAngle
        // 0.001ラジアン回転する
        p.applyAxisAngle(normal, radian);
      } else if (this.params.rotateDirection === "X") {
        p.applyAxisAngle(this.axisX, radian);
      } else if (this.params.rotateDirection === "Y") {
        p.applyAxisAngle(this.axisY, radian);
      } else if (this.params.rotateDirection === "Z") {
        p.applyAxisAngle(this.axisZ, radian);
      } else if (this.params.rotateDirection === "XYZ") {
        p.applyAxisAngle(this.axisXYZ, radian);
      }

      this.geometry.attributes.position.setXYZ(index, p.x, p.y, p.z);

    });
    this.geometry.attributes.position.needsUpdate = true;
  }


  animate() {
    this.controller.update();

    this.spin();

    this.renderer.render(this.scene, this.camera);

    requestAnimationFrame(() => { this.animate(); });
  }

}