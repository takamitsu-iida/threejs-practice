import * as THREE from "three";
import { OrbitControls } from "three/controls/OrbitControls.js";
import { GUI } from "three/libs/lil-gui.module.min.js";

// stats.js
import Stats from 'three/libs/stats.module.js';


class Field {

  // Ballクラスのインスタンスを格納する配列
  balls = [];

  // ボールの数
  numBalls;

  // ボールが動き回る範囲
  fieldWidth;
  fieldHeight;

  constructor(numBalls, fieldWidth, fieldHeight) {
    this.numBalls = numBalls;
    this.fieldWidth = fieldWidth;
    this.fieldHeight = fieldHeight;

    // Ballクラスをインスタンス化して格納する
    for (let i=0; i < numBalls; i++) {
      this.balls.push(new Ball(this.fieldWidth, this.fieldHeight));
    }

  }


  step() {

    this.balls.forEach((ball) => {

      // ボールの位置を変更
      ball.position.add(ball.velocity);

      // Xがマイナスになったら反転
      if (ball.position.x < 0 + ball.radius) {
        ball.position.x = 0 + ball.radius;
        ball.velocity.x = Math.abs(ball.velocity.x);
      }

      // Yがマイナスになったら反転
      if (ball.position.y < 0 + ball.radius) {
        ball.position.y = 0 + ball.radius;
        ball.velocity.y = Math.abs(ball.velocity.y);
      }

      // XがfieldWidthを超えたら反転
      if (ball.position.x > this.fieldWidth - ball.radius) {
        ball.position.x = this.fieldWidth - ball.radius;
        ball.velocity.x = -Math.abs(ball.velocity.x);
      }

      // YがfieldHeightを超えたら反転
      if (ball.position.y > this.fieldHeight - ball.radius) {
        ball.position.y = this.fieldHeight - ball.radius;
        ball.velocity.y = -Math.abs(ball.velocity.y);
      }

      ball.mesh.position.x = ball.position.x;
      ball.mesh.position.y = ball.position.y;
    });

  }

  calc(fromPosition) {
    let sum = 0;

    this.balls.forEach((ball) => {
      const distance = ball.position.distanceTo(fromPosition);
      sum += ball.volume / (distance ** 2);
    });

    return sum;
  }

}


class Ball {

  // 球体の半径の最小値、最大値
  MIN_BALL_RADIUS = 25;
  MAX_BALL_RADIUS = 80;

  // 位置
  position;

  // 移動速度
  velocity;

  // 半径
  radius;

  // 体積
  volume;

  // THREE.Mesh()
  mesh;

  // 球体の色
  color = 0xff6600;

  // 球体の透明度
  opacity = 0.6;

  constructor(fieldWidth=500, fieldHeight=500) {

    // ボールの初期位置を決める
    this.position = new THREE.Vector3(
      Math.random() * (fieldWidth - this.MAX_BALL_RADIUS * 2) + this.MIN_BALL_RADIUS,
      Math.random() * (fieldHeight - this.MAX_BALL_RADIUS * 2) + this.MIN_BALL_RADIUS,
      0
    );

    // 速度を決める
    this.velocity = new THREE.Vector3(
      (Math.random() * 2 - 1) * 3,  // -1 ~ 1の範囲でランダム値を取った後で3倍
      (Math.random() * 2 - 1) * 3,  // -1 ~ 1の範囲でランダム値を取った後で3倍
      0
    );

    // 半径を決める
    this.radius = Math.random() * (this.MAX_BALL_RADIUS - this.MIN_BALL_RADIUS) + this.MIN_BALL_RADIUS;

    // 体積を決める
    this.volume = 4 * Math.PI * (this.radius ** 3) / 3;

    // このままだと数字が大きすぎるので 1/1000 しておく
    this.volume /= 1000;

    // ジオメトリ
    const geometry = new THREE.IcosahedronGeometry(this.radius, 4);

    // マテリアル
    const material = new THREE.MeshBasicMaterial({
      color: this.color,
      transparent: true,
      opacity: this.opacity,
    });

    // メッシュ
    this.mesh = new THREE.Mesh(geometry, material);

    // 位置を設定
    this.mesh.position.x = this.position.x;
    this.mesh.position.y = this.position.y;
    this.mesh.position.z = this.radius;

  }
}


export class Grid {

  rowIndex = 0;

  colIndex = 0;

  position;  // Vector3

  // 電位
  potential = 0;

  color = 0xffff00;

  line;  // Mesh

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
    threshold: 0.4,
  }

  // Fieldクラスのインスタンス
  field;

  // 描画関数のリスト
  marchingSquareFunctions = [];

  // gridsは `${rowIndex},${colIndex}` をキーとしたオブジェクト
  grids = {};

  constructor(params) {

    params = params || {};
    this.params = Object.assign(this.params, params);

    // scene, camera, renderer, controllerを初期化
    this.initThreejs();

    // stats.jsを初期化
    this.initStatsjs();

    // 16個の関数を格納したリスト作成する
    this.marchingSquareFunctions = this.createMarchingSquareFunctions();

    // Fieldをインスタンス化
    const fieldWidth = this.params.gridNums.x * this.params.gridSize;
    const fieldHeight = this.params.gridNums.y * this.params.gridSize;
    this.field = new Field(6, fieldWidth, fieldHeight);

    // グリッドを作成する
    for (let rowIndex = 0; rowIndex < this.params.gridNums.y; rowIndex++) {
      for (let colIndex = 0; colIndex < this.params.gridNums.x; colIndex++) {

        // Gridクラスをインスタンス化して
        const grid = new Grid(
          rowIndex,
          colIndex,
          new THREE.Vector3(colIndex * this.params.gridSize, rowIndex * this.params.gridSize, 0)
        );

        // gridsに格納する
        this.grids[`${rowIndex},${colIndex}`] = grid;
      }
    }

    // grid内で準備したThree.jsのlineをシーンに加える
    Object.values(this.grids).forEach((grid) => {
      this.scene.add(grid.line);
    });

    // Fieldの境界線を描画
    this.drawBoundary();

    // ボールを描画
    this.drawBall();

    // 電位を計算
    this.calcPotential();

    /*
    Object.values(this.grids).forEach((g) => {
      console.log(g);
    });
    */

    // フレーム毎の処理(requestAnimationFrameで再帰的に呼び出される)
    this.render();
  }


  calcPotential() {
    Object.values(this.grids).forEach((g) => {
      g.potential = this.field.calc(g.position);
    });
  }


  drawBoundary() {
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


  drawBall() {
    this.field.balls.forEach((ball) => {
      this.scene.add(ball.mesh);
    });
  }


  drawIsoline() {

    // グリッドの行、列をたどりながら、線を描画していく
    for (let rowIndex = 0; rowIndex < this.params.gridNums.y - 1; rowIndex++) {
      for (let colIndex = 0; colIndex < this.params.gridNums.x - 1; colIndex++) {
        const p1 = this.grids[`${rowIndex},${colIndex}`];
        const p2 = this.grids[`${rowIndex},${colIndex + 1}`];
        const p4 = this.grids[`${rowIndex + 1},${colIndex}`];
        const p8 = this.grids[`${rowIndex + 1},${colIndex + 1}`];

        // それぞれのポイントがしきい値を超えているか？
        const index =
          ((p1.potential > this.params.threshold) ? 1 : 0) +
          ((p2.potential > this.params.threshold) ? 2 : 0) +
          ((p4.potential > this.params.threshold) ? 4 : 0) +
          ((p8.potential > this.params.threshold) ? 8 : 0);

        // 実行すべき関数を取り出す
        const func = this.marchingSquareFunctions[index];

        // 取り出した関数で描画する
        func(p1, p2, p4, p8, this.params.threshold);

      }
    }
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

    p1 = 1 or 0
    p2 = 2 or 0
    p4 = 4 or 0
    p8 = 8 or 0
    の値を持つ。
    p1 + p2 + p3 + p4の値は 0~15 の数値になり、
    この数字からどの頂点が非ゼロなのかを判定できる。
    この数字をインデックスとした配列を作り、頂点の状態に応じた処理関数を格納する。

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

    // シーン
    this.scene = new THREE.Scene();

    // カメラ
    // 遠近感は不要なのでOrthographcCameraを利用
    const fieldWidth = (this.params.gridNums.x -1) * this.params.gridSize;
    const fieldHeight = (this.params.gridNums.y -1) * this.params.gridSize;

    this.camera = new THREE.OrthographicCamera(
      0,            // left
      fieldWidth,   // right
      0,            // top
      fieldHeight,  // bottom
      1,            // near
      1001          // far
    );

    this.camera.position.z = 10;
    // this.camera.zoom = 0.9;
    // this.camera.updateProjectionMatrix();

    // レンダラ
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);
    this.renderer.setClearColor(0xdedede);

    // コントローラ
    this.controller = new OrbitControls(this.camera, this.renderer.domElement);
    this.controller.enableRotate = false;  // 平面を表示するだけなので回転不要

    // lil-gui
    const guiContainer = document.getElementById("guiContainer");
    const gui = new GUI({
      container: guiContainer,
    });
    gui
      .add(this.params, "threshold")
      .min(0.1)
      .max(0.6)
      .step(0.01)
      .name("threshold");

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

      // フィールド上のボールを移動して
      this.field.step();

      // 各グリッドにおける電位を計算し直す
      this.calcPotential();

      // 電位の等高線を引く
      this.drawIsoline();

      // 再描画
      this.renderer.render(this.scene, this.camera);
    }

    this.renderParams.delta %= this.renderParams.interval;
  }

}
