import * as THREE from "three";
import { OrbitControls } from "three/controls/OrbitControls.js";
// import { GUI } from "three/libs/lil-gui.module.min.js";

// stats.js
import Stats from 'three/libs/stats.module.js';


class Ball {

  // 重力を持った複数のボールが動き回るイメージ

  balls = []; // オブジェクトの配列
  numBalls;

  // 球体の色と透明度
  color = 0xff6600;
  opacity = 0.6;

  // ボールが動き回る範囲
  fieldWidth;
  fieldHeight;

  MIN_BALL_RADIUS = 30;
  MAX_BALL_RADIUS = 100;

  constructor(numBalls, containerWidth, containerHeight) {

    this.numBalls = numBalls;
    this.fieldWidth = containerWidth;
    this.fieldHeight = containerHeight;

    // ボールの初期位置、速度、半径を決める
    for (let i = 0; i < this.numBalls; i++) {
      const ball = {
        // 位置
        pos:
          new THREE.Vector3(
            Math.random() * this.fieldWidth,  // 0 ~ containerWidthの範囲でランダム値
            Math.random() * this.fieldHeight,  // 0 ~ containerHeightの範囲でランダム値
            0
          ),

        // 速度
        vel:
          new THREE.Vector3(
            (Math.random() * 2 - 1) * 3,  // -1 ~ 1の範囲でランダム値を取った後で3倍
            (Math.random() * 2 - 1) * 3,  // -1 ~ 1の範囲でランダム値を取った後で3倍
            0
          ),

        // 半径
        rad:
          Math.random() * (this.MAX_BALL_RADIUS - this.MIN_BALL_RADIUS) + this.MIN_BALL_RADIUS,

        // 体積
        vol: 0,
      }

      this.balls.push(ball);
    }

    // ボールの半径が決まったので体積（=重力）を計算しておく
    this.balls.forEach((ball) => {
      ball.vol = 4 * Math.PI * (ball.rad ** 3) / 3;

      // このままだと数字が大きすぎるので 1/1000 しておく
      ball.vol /= 1000;
    });

    // Three.jsの球体を作成しておく
    this.balls.forEach((ball) => {
      // ジオメトリ
      const geometry = new THREE.IcosahedronGeometry(ball.rad, 5);

      // マテリアル
      const material = new THREE.MeshBasicMaterial({
        color: this.color,
        transparent: true,
        opacity: this.opacity,
      });

      // メッシュ
      ball.mesh = new THREE.Mesh(geometry, material);

      // 位置を設定
      ball.mesh.position.x = ball.pos.x;
      ball.mesh.position.y = ball.pos.y;
      ball.mesh.position.z = ball.rad;

    });

  }


  step() {

    this.balls.forEach((ball) => {
      // 位置を変更
      ball.pos.add(ball.vel);

      // Xがマイナスになったら反転
      if (ball.pos.x < 0 + ball.rad) {
        ball.pos.x = 0 + ball.rad;
        ball.vel.x = Math.abs(ball.vel.x);
      }

      // Yがマイナスになったら反転
      if (ball.pos.y < 0 + ball.rad) {
        ball.pos.y = 0 + ball.rad;
        ball.vel.y = Math.abs(ball.vel.y);
      }

      // XがfieldWidthを超えたら反転
      if (ball.pos.x > this.fieldWidth - ball.rad) {
        ball.pos.x = this.fieldWidth - ball.rad;
        ball.vel.x = -Math.abs(ball.vel.x);
      }

      // YがcontainerHeightを超えたら反転
      if (ball.pos.y > this.fieldHeight - ball.rad) {
        ball.pos.y = this.fieldHeight - ball.rad;
        ball.vel.y = -Math.abs(ball.vel.y);
      }

      ball.mesh.position.x = ball.pos.x;
      ball.mesh.position.y = ball.pos.y;

    });

  }

  calc(fromPosition) {
    let sum = 0;

    this.balls.forEach((ball) => {
      const distance = ball.pos.distanceTo(fromPosition);

      sum += ball.vol / (distance ** 2);
    });

    return sum;
  }

}


export class Grid {

  rowIndex = 0;

  colIndex = 0;

  position;  // Vector3

  potential = 0;

  color = 0xffffff;

  // isoline
  line;

  constructor(rowIndex, colIndex, pos) {
    this.rowIndex = rowIndex;
    this.colIndex = colIndex;
    this.position = pos;

    const startPoint = this.position.clone();
    const endPoint = this.position.clone();

    const geometry = new THREE.BufferGeometry().setFromPoints([startPoint, endPoint]);
    const material = new THREE.LineBasicMaterial({ color: this.color });
    this.line = new THREE.Line(geometry, material);
    this.line.visible = false;
  }

}


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
    gridSize: 10,
    gridNums: { x: 50, y: 50 },

    threshold1: 0.4,
    threshold2: 0.8,
  }

  // Ballクラスのインスタンス
  ball;

  // 描画関数のリスト
  marchingSquareFunctions = [];

  // グリッドは `${rowIndex}${colIndex}` をキーとしたオブジェクト
  grids = {};

  constructor(params) {

    params = params || {};
    this.params = Object.assign(this.params, params);

    // scene, camera, renderer, controllerを初期化
    this.initThreejs();

    // stats.jsを初期化
    this.initStatsjs();

    // 16個の関数が詰まったリスト作成する
    this.marchingSquareFunctions = this.createMarchingSquareFunctions(this.params.gridSize);

    // ボールをインスタンス化
    this.ball = new Ball(5, this.params.gridNums.x * this.params.gridSize, this.params.gridNums.y * this.params.gridSize);

    // グリッドを作成する
    for (let rowIndex = 0; rowIndex < this.params.gridNums.y; rowIndex++) {
      for (let colIndex = 0; colIndex < this.params.gridNums.x; colIndex++) {

        const grid = new Grid(
          rowIndex,
          colIndex,
          new THREE.Vector3(colIndex * this.params.gridSize, rowIndex * this.params.gridSize, 0)
        );

        this.scene.add(grid.line);

        this.grids[`${rowIndex},${colIndex}`] = grid;
      }
    }

    this.drawField();
    this.drawBall();

    /*
    this.calcPotential();

    Object.values(this.grids).forEach((g) => {
      console.log(g.potential());
    });
    */

    // フレーム毎の処理(requestAnimationFrameで再帰的に呼び出される)
    this.render();
  }


  calcPotential() {
    Object.values(this.grids).forEach((g) => {
      g.potential = this.ball.calc(g.position);
    });
  }

  drawField() {
    // 計算の都合上、グリッドの一番右、一番下は（隣がないので）等圧線が描画されない
    const w = (this.params.gridNums.x -1) * this.params.gridSize;
    const h = (this.params.gridNums.y -1) * this.params.gridSize;

    const geometry = new THREE.PlaneGeometry(w, h, 1, 1);

    const material = new THREE.MeshBasicMaterial({
      color: 0x0a0a0a,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.2
    });

    const mesh = new THREE.Mesh(geometry, material);

    mesh.position.x = w / 2;
    mesh.position.y = h / 2;
    mesh.position.z = -1;

    this.scene.add(mesh);
  }


  drawIsoline() {

    // 行、列をたどりながら、線を引いていく
    for (let rowIndex = 0; rowIndex < this.params.gridNums.y - 1; rowIndex++) {
      for (let colIndex = 0; colIndex < this.params.gridNums.x - 1; colIndex++) {
        const p1 = this.grids[`${rowIndex},${colIndex}`];
        const p2 = this.grids[`${rowIndex},${colIndex + 1}`];
        const p4 = this.grids[`${rowIndex + 1},${colIndex}`];
        const p8 = this.grids[`${rowIndex + 1},${colIndex + 1}`];

        // それぞれのポイントがしきい値よりも大きければ1、小さければ0
        const index1 =
          ((p1.potential > this.params.threshold1) ? 1 : 0) +
          ((p2.potential > this.params.threshold1) ? 2 : 0) +
          ((p4.potential > this.params.threshold1) ? 4 : 0) +
          ((p8.potential > this.params.threshold1) ? 8 : 0);

        const func1 = this.marchingSquareFunctions[index1];

        func1(p1, p2, p4, p8, this.params.threshold1);

      }
    }
  }


  drawBall() {
    this.ball.balls.forEach((ball) => {
      this.scene.add(ball.mesh);
    });
  }


  ratio(gridA, gridB, threshold) {
    const a = threshold - gridA.potential;
    const b = gridB.potential - threshold;

    return (a / (a + b));
  }

  createMarchingSquareFunctions() {

    const gridSize = this.params.gridSize;

    /*

    p1---p2
    |    |
    p4---p8

    各頂点が1 or 0を取る。
    p1 + p2 + p3 + p4の値は 0~15 の数値を持つ。
    この数字からどの頂点が1なのかを判定できるので、この数字をインデックスとした配列を作成する。

    */

    // 0~15まで、トータル16個の関数を作りfuncsに格納する
    const funcs = [];

    funcs[0] = (p1, p2, p4, p8, threshold) => {
      // o--o
      // |  |
      // o--o
      p1.line.visible = false;
    };

    funcs[1] = (p1, p2, p4, p8, threshold) => {
      // *--o
      // |  |
      // o--o
      const x = p1.position.x;
      const y = p1.position.y;

      // line start
      p1.line.geometry.attributes.position.array[0] = x;
      p1.line.geometry.attributes.position.array[1] = y + gridSize * this.ratio(p1, p4, threshold);
      p1.line.geometry.attributes.position.array[2] = 0;

      // line end
      p1.line.geometry.attributes.position.array[3] = x + gridSize * this.ratio(p1, p2, threshold);
      p1.line.geometry.attributes.position.array[4] = y;
      p1.line.geometry.attributes.position.array[5] = 0;

      p1.line.visible = true;
      p1.line.geometry.attributes.position.needsUpdate = true;
    };

    funcs[2] = (p1, p2, p4, p8, threshold) => {
      // o--*
      // |  |
      // o--o
      const x = p1.position.x;
      const y = p1.position.y;

      // line start
      p1.line.geometry.attributes.position.array[0] = x + gridSize * this.ratio(p1, p2, threshold);
      p1.line.geometry.attributes.position.array[1] = y;
      p1.line.geometry.attributes.position.array[2] = 0;

      // line end
      p1.line.geometry.attributes.position.array[3] = x + gridSize;
      p1.line.geometry.attributes.position.array[4] = y + gridSize * this.ratio(p2, p8, threshold);
      p1.line.geometry.attributes.position.array[5] = 0;

      p1.line.visible = true;
      p1.line.geometry.attributes.position.needsUpdate = true;
    };

    funcs[3] = (p1, p2, p4, p8, threshold) => {
      // p3 = p1 + p2
      // *--*
      // |  |
      // o--o
      const x = p1.position.x;
      const y = p1.position.y;

      // line start
      p1.line.geometry.attributes.position.array[0] = x;
      p1.line.geometry.attributes.position.array[1] = y + gridSize * this.ratio(p1, p4, threshold)
      p1.line.geometry.attributes.position.array[2] = 0;

      // line end
      p1.line.geometry.attributes.position.array[3] = x + gridSize;
      p1.line.geometry.attributes.position.array[4] = y + gridSize * this.ratio(p2, p8, threshold);
      p1.line.geometry.attributes.position.array[5] = 0;

      p1.line.visible = true;
      p1.line.geometry.attributes.position.needsUpdate = true;
    };

    funcs[4] = (p1, p2, p4, p8, threshold) => {
      // o--o
      // |  |
      // *--o
      const x = p1.position.x;
      const y = p1.position.y;

      // line start
      p1.line.geometry.attributes.position.array[0] = x;
      p1.line.geometry.attributes.position.array[1] = y + gridSize * this.ratio(p1, p4, threshold);
      p1.line.geometry.attributes.position.array[2] = 0;

      // line end
      p1.line.geometry.attributes.position.array[3] = x + gridSize * this.ratio(p4, p8, threshold)
      p1.line.geometry.attributes.position.array[4] = y + gridSize;
      p1.line.geometry.attributes.position.array[5] = 0;

      p1.line.visible = true;
      p1.line.geometry.attributes.position.needsUpdate = true;
    };

    funcs[5] = (p1, p2, p4, p8, threshold) => {
      // 5 = p1 + p4
      // *--o
      // |  |
      // *--o
      const x = p1.position.x;
      const y = p1.position.y;

      // line start
      p1.line.geometry.attributes.position.array[0] = x + gridSize * this.ratio(p1, p2, threshold);
      p1.line.geometry.attributes.position.array[1] = y;
      p1.line.geometry.attributes.position.array[2] = 0;

      // line end
      p1.line.geometry.attributes.position.array[3] = x + gridSize * this.ratio(p4, p8, threshold);
      p1.line.geometry.attributes.position.array[4] = y + gridSize;
      p1.line.geometry.attributes.position.array[5] = 0;

      p1.line.visible = true;
      p1.line.geometry.attributes.position.needsUpdate = true;
    };

    funcs[6] = (p1, p2, p4, p8, threshold) => {
      // 6 = p2 + p4
      // o--*
      // |  |
      // *--o

      // この場合は線が一本にならず、隣接グリッドと整合を取りづらい
      // レアケースとみなして、何も描画しない
    };

    funcs[7] = (p1, p2, p4, p8, threshold) => {
      // 7 = p1 + p2 + p4
      // *--*
      // |  |
      // *--o
      const x = p1.position.x;
      const y = p1.position.y;

      // line start
      p1.line.geometry.attributes.position.array[0] = x + gridSize * this.ratio(p4, p8, threshold)
      p1.line.geometry.attributes.position.array[1] = y + gridSize
      p1.line.geometry.attributes.position.array[2] = 0;

      // line end
      p1.line.geometry.attributes.position.array[3] = x + gridSize;
      p1.line.geometry.attributes.position.array[4] = y + gridSize * this.ratio(p2, p8, threshold);
      p1.line.geometry.attributes.position.array[5] = 0;

      p1.line.visible = true;
      p1.line.geometry.attributes.position.needsUpdate = true;
    };

    funcs[8] = (p1, p2, p4, p8, threshold) => {
      // o--o
      // |  |
      // o--*
      const x = p1.position.x;
      const y = p1.position.y;

      // line start
      p1.line.geometry.attributes.position.array[0] = x + gridSize * this.ratio(p4, p8, threshold);
      p1.line.geometry.attributes.position.array[1] = y + gridSize;
      p1.line.geometry.attributes.position.array[2] = 0;

      // line end
      p1.line.geometry.attributes.position.array[3] = x + gridSize;
      p1.line.geometry.attributes.position.array[4] = y + gridSize * this.ratio(p2, p8, threshold);
      p1.line.geometry.attributes.position.array[5] = 0;

      p1.line.visible = true;
      p1.line.geometry.attributes.position.needsUpdate = true;
    };

    funcs[9] = (p1, p2, p4, p8, threshold) => {
      // 9 = p1 + p8
      // *--o
      // |  |
      // o--*

      // この場合は線が一本にならず、隣接グリッドと整合を取りづらい
      // レアケースとみなして、何も描画しない
    };

    funcs[10] = (p1, p2, p4, p8, threshold) => {
      // 10 = p2 + p8
      // o--*
      // |  |
      // o--*
      const x = p1.position.x;
      const y = p1.position.y;

      // line start
      p1.line.geometry.attributes.position.array[0] = x + gridSize * this.ratio(p1, p2, threshold);
      p1.line.geometry.attributes.position.array[1] = y;
      p1.line.geometry.attributes.position.array[2] = 0;

      // line end
      p1.line.geometry.attributes.position.array[3] = x + gridSize * this.ratio(p4, p8, threshold);
      p1.line.geometry.attributes.position.array[4] = y + gridSize;
      p1.line.geometry.attributes.position.array[5] = 0;

      p1.line.visible = true;
      p1.line.geometry.attributes.position.needsUpdate = true;
    };

    funcs[11] = (p1, p2, p4, p8, threshold) => {
      // 11 = p1 + p2 + p8
      // *--*
      // |  |
      // o--*
      const x = p1.position.x;
      const y = p1.position.y;

      // line start
      p1.line.geometry.attributes.position.array[0] = x;
      p1.line.geometry.attributes.position.array[1] = y + gridSize * this.ratio(p1, p4, threshold);
      p1.line.geometry.attributes.position.array[2] = 0;

      // line end
      p1.line.geometry.attributes.position.array[3] = x + gridSize * this.ratio(p4, p8, threshold);
      p1.line.geometry.attributes.position.array[4] = y + gridSize;
      p1.line.geometry.attributes.position.array[5] = 0;

      p1.line.visible = true;
      p1.line.geometry.attributes.position.needsUpdate = true;
    };

    funcs[12] = (p1, p2, p4, p8, threshold) => {
      // 12 = p4 + p8
      // o--o
      // |  |
      // *--*
      const x = p1.position.x;
      const y = p1.position.y;

      // line start
      p1.line.geometry.attributes.position.array[0] = x;
      p1.line.geometry.attributes.position.array[1] = y + gridSize * this.ratio(p1, p4, threshold);
      p1.line.geometry.attributes.position.array[2] = 0;

      // line end
      p1.line.geometry.attributes.position.array[3] = x + gridSize;
      p1.line.geometry.attributes.position.array[4] = y + gridSize * this.ratio(p2, p8, threshold)
      p1.line.geometry.attributes.position.array[5] = 0;

      p1.line.visible = true;
      p1.line.geometry.attributes.position.needsUpdate = true;
    };

    funcs[13] = (p1, p2, p4, p8, threshold) => {
      // 13 = p1 + p4 + p8
      // *--o
      // |  |
      // *--*
      const x = p1.position.x;
      const y = p1.position.y;

      // line start
      p1.line.geometry.attributes.position.array[0] = x + gridSize * this.ratio(p1, p2, threshold);
      p1.line.geometry.attributes.position.array[1] = y;
      p1.line.geometry.attributes.position.array[2] = 0;

      // line end
      p1.line.geometry.attributes.position.array[3] = x + gridSize;
      p1.line.geometry.attributes.position.array[4] = y + gridSize * this.ratio(p2, p8, threshold);
      p1.line.geometry.attributes.position.array[5] = 0;

      p1.line.visible = true;
      p1.line.geometry.attributes.position.needsUpdate = true;
    };

    funcs[14] = (p1, p2, p4, p8, threshold) => {
      // 14 = p2 + p4 + p8
      // o--*
      // |  |
      // *--*
      const x = p1.position.x;
      const y = p1.position.y;

      // line start
      p1.line.geometry.attributes.position.array[0] = x;
      p1.line.geometry.attributes.position.array[1] = y + gridSize * this.ratio(p1, p4, threshold);
      p1.line.geometry.attributes.position.array[2] = 0;

      // line end
      p1.line.geometry.attributes.position.array[3] = x + gridSize * this.ratio(p1, p2, threshold);
      p1.line.geometry.attributes.position.array[4] = y;
      p1.line.geometry.attributes.position.array[5] = 0;

      p1.line.visible = true;
      p1.line.geometry.attributes.position.needsUpdate = true;
    };

    funcs[15] = (p1, p2, p4, p8, threshold) => {
      // 15 = p1 + p2 + p4 + p8
      // *--*
      // |  |
      // *--*
      p1.line.visible = false;
    };

    return funcs;
  }


  initThreejs() {
    // コンテナ
    this.container = document.getElementById("threejsContainer");

    // コンテナのサイズ
    this.sizes.width = this.container.clientWidth;
    this.sizes.height = this.container.clientHeight;

    // resizeイベントのハンドラを登録
    window.addEventListener("resize", () => { this.onWindowResize(); }, false);

    // シーン
    this.scene = new THREE.Scene();

    // カメラ
    // 遠近感は不要なのでOrthographcCameraを利用
    this.camera = new THREE.OrthographicCamera(
      -10,                                                        // left
      ((this.params.gridNums.x) * this.params.gridSize) * 1.1,  // right
      -10,                                                        // top
      ((this.params.gridNums.y) * this.params.gridSize) * 1.1,  // bottom
      1,                                                        // near
      1001                                                      // far
    );
    this.camera.position.z = 10;

    // レンダラ
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    this.renderer.setClearColor(0xdedede);

    // コントローラ
    this.controller = new OrbitControls(this.camera, this.renderer.domElement);
    this.controller.enableRotate = false;  // 平面を表示するだけなので回転不要

    // グリッドヘルパー
    // this.scene.add(new THREE.GridHelper(10000, 10000, new THREE.Color(0xffffff), new THREE.Color(0xffffff)));

    // 軸を表示
    //
    //   Y(green)
    //    |
    //    +---- X(red)
    //   /
    //  Z(blue)
    //
    // this.scene.add(new THREE.AxesHelper(10000));

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


  render() {

    // 再帰処理
    requestAnimationFrame(() => { this.render(); });

    this.renderParams.delta += this.renderParams.clock.getDelta();
    if (this.renderParams.delta < this.renderParams.interval) {
      return;
    }

    {
      // stats.jsを更新
      this.statsjs.update();

      // カメラコントローラーの更新
      this.controller.update();

      // ボールを移動して
      this.ball.step();

      // 重力を計算し直す
      this.calcPotential();

      // 等高線を引く
      this.drawIsoline();

      // 再描画
      this.renderer.render(this.scene, this.camera);
    }

    this.renderParams.delta = this.renderParams.delta % this.renderParams.interval;
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
