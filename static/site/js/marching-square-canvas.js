import * as THREE from "three";
// import { GUI } from "three/libs/lil-gui.module.min.js";


class Ball {

  // 重力を持った複数のボールが動き回るイメージ

  balls = [];
  numBalls;

  fieldWidth;
  fieldHeight;

  MIN_BALL_RADIUS = 30;
  MAX_BALL_RADIUS = 100;


  constructor(numBalls, fieldWidth, fieldHeight) {

    this.numBalls = numBalls;
    this.fieldWidth = fieldWidth;
    this.fieldHeight = fieldHeight;

    // ボールの初期位置、速度、半径を決める
    for (let i = 0; i < this.numBalls; i++) {
      const ball = {
        // 位置
        pos:
          new THREE.Vector2(
            Math.random() * this.fieldWidth,  // 0 ~ containerWidthの範囲でランダム値
            Math.random() * this.fieldHeight  // 0 ~ containerHeightの範囲でランダム値
          ),

        // 速度
        vel:
          new THREE.Vector2(
            (Math.random() * 2 - 1) * 5,  // -1 ~ 1の範囲でランダム値を取った後で5倍
            (Math.random() * 2 - 1) * 5,  // -1 ~ 1の範囲でランダム値を取った後で5倍
          ),

        // 半径
        rad:
          Math.random() * (this.MAX_BALL_RADIUS - this.MIN_BALL_RADIUS) + this.MIN_BALL_RADIUS
      }

      this.balls.push(ball);
    }

    // ボールの半径が決まったので体積（=重力）を計算しておく
    this.balls.forEach((ball) => {
      ball.vol = 4 * Math.PI * (ball.rad ** 3) / 3;

      // このままだと数字が大きすぎるので 1/1000 しておく
      ball.vol /= 1000;
    });
  }

  step() {

    this.balls.forEach((ball) => {
      // 位置を変更
      ball.pos.add(ball.vel);

      // Xがマイナスになったら反転
      if (ball.pos.x < 0) {
        ball.pos.x = 0;
        ball.vel.x = Math.abs(ball.vel.x);
      }

      // Yがマイナスになったら反転
      if (ball.pos.y < 0) {
        ball.pos.y = 0;
        ball.vel.y = Math.abs(ball.vel.y);
      }

      // XがcontainerWidthを超えたら反転
      if (ball.pos.x > this.fieldWidth) {
        ball.pos.x = this.fieldWidth;
        ball.vel.x = -Math.abs(ball.vel.x);
      }

      // YがcontainerHeightを超えたら反転
      if (ball.pos.y > this.fieldHeight) {
        ball.pos.y = this.fieldHeight;
        ball.vel.y = -Math.abs(ball.vel.y);
      }
    });

  }

  calc(fromPosition) {
    let sum = 0;

    this.balls.forEach((ball) => {

      const distance = ball.pos.distanceTo(fromPosition);
      // if (distance < ball.rad * 3) {
        sum += ball.vol / (distance **2);
      // }

    });

    return sum;
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

  params = {
    gridSize: 10,
    gridNums: {x: 50, y: 50},

    threshold1:0.4,
    threshold2:0.8,

    isolineColor: '#ffffff',
    isolineAlpha: 1.0,

    ballColor: '#ff6600',
    ballAlpha: 0.3,
  }

  // Ballクラスのインスタンス
  ball;

  // 描画するキャンバスとコンテキスト
  canvas;
  ctx;

  // 描画関数のリスト
  marchingSquareFunctions = [];

  // グリッドは `${rowIndex}${colIndex}` をキーとしたオブジェクト
  grid = {};

  constructor(params) {

    params = params || {};
    this.params = Object.assign(this.params, params);

    // scene, camera, renderer, controllerを初期化
    // this.initThreejs();

    // キャンバスの大きさを決める
    this.sizes.width = this.params.gridSize * this.params.gridNums.x;
    this.sizes.height = this.params.gridSize * this.params.gridNums.y;

    // canvasエレメントを作成する
    this.canvas = document.createElement("canvas");
    this.canvas.width = this.sizes.width;
    this.canvas.height = this.sizes.height;

    // コンテナDIVにcanvasを加える
    const container = document.getElementById("msquareContainer");
    container.appendChild(this.canvas);

    // コンテキストを取得
    this.ctx = this.canvas.getContext("2d");
    this.ctx.fillStyle = '#f00';

    // 16個の関数が詰まったリスト作成する
    this.marchingSquareFunctions = this.createMarchingSquareFunctions(this.params.gridSize);

    // ボールをインスタンス化
    this.ball = new Ball(5, this.params.gridNums.x*this.params.gridSize, this.params.gridNums.y*this.params.gridSize);

    // グリッドを作成する
    for (let rowIndex=0; rowIndex < this.params.gridNums.y; rowIndex++) {
      for (let colIndex=0; colIndex < this.params.gridNums.x; colIndex++) {
        const gridPoint = {
          rowIndex: rowIndex,
          colIndex: colIndex,
          position: new THREE.Vector2(colIndex * this.params.gridSize, rowIndex * this.params.gridSize),
          potential: 0,
        };
        this.grid[`${rowIndex},${colIndex}`] = gridPoint;
      }
    }

    this.calcPotential();

    /*
    Object.values(this.grid).forEach((g) => {
      console.log(g.potential);
    });
    */

    // アニメーション開始
    this.startAnimating();

    // フレーム毎の処理(requestAnimationFrameで再帰的に呼び出される)
    // this.render();
  }


  calcPotential() {
    Object.values(this.grid).forEach((gridPoint) => {
      gridPoint.potential = this.ball.calc(gridPoint.position);
    });
  }


  clearContext() {
    this.ctx.clearRect(0, 0, this.sizes.width, this.sizes.height);
  }


  drawIsoline() {
    this.ctx.globalAlpha = this.isolineAlpha;
    this.ctx.strokeStyle = this.isolineColor;
    this.ctx.lineWidth = 1;

    // 行、列をたどりながら、線を引いていく
    for (let rowIndex=0; rowIndex < this.params.gridNums.y -1; rowIndex++) {
      for (let colIndex=0; colIndex < this.params.gridNums.x -1; colIndex++) {
        const p1 = this.grid[`${rowIndex},${colIndex}`];
        const p2 = this.grid[`${rowIndex},${colIndex + 1}`];
        const p4 = this.grid[`${rowIndex + 1},${colIndex}`];
        const p8 = this.grid[`${rowIndex + 1},${colIndex + 1}`];

        // それぞれのポイントがしきい値よりも大きければ1、小さければ0
        const index1 =
          ((p1.potential > this.params.threshold1) ? 1 : 0) +
          ((p2.potential > this.params.threshold1) ? 2 : 0) +
          ((p4.potential > this.params.threshold1) ? 4 : 0) +
          ((p8.potential > this.params.threshold1) ? 8 : 0);

        const func1 = this.marchingSquareFunctions[index1];
        func1(p1, p2, p4, p8, this.params.threshold1);

        // それぞれのポイントがしきい値よりも大きければ1、小さければ0
        const index2 =
          ((p1.potential > this.params.threshold2) ? 1 : 0) +
          ((p2.potential > this.params.threshold2) ? 2 : 0) +
          ((p4.potential > this.params.threshold2) ? 4 : 0) +
          ((p8.potential > this.params.threshold2) ? 8 : 0);

        const func2 = this.marchingSquareFunctions[index2];
        func2(p1, p2, p4, p8, this.params.threshold2);

      }
    }
  }


  drawBall() {

    this.ctx.globalAlpha = this.params.ballAlpha;
    this.ctx.fillStyle = this.params.ballColor;

    this.ball.balls.forEach((ball) => {
      this.ctx.beginPath();
      this.ctx.arc(ball.pos.x, ball.pos.y, ball.rad, 0, 2*Math.PI, false);
      this.ctx.fill();
    });

  }


  ratio(gridPointA, gridPointB, threshold) {
    const a = threshold - gridPointA.potential;
    const b = gridPointB.potential - threshold;

    return ( a / (a + b) );
  }

  createMarchingSquareFunctions() {

    const gridSize = this.params.gridSize;
    const ctx = this.ctx;

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
    };

    funcs[1] = (p1, p2, p4, p8, threshold) => {
      // *--o
      // |  |
      // o--o
      const x = p1.position.x;
      const y = p1.position.y;

      ctx.beginPath();
      // ctx.moveTo(x, y + gridSize / 2);
      // ctx.lineTo(x + gridSize / 2, y);

      ctx.moveTo(x, y + gridSize * this.ratio(p1, p4, threshold));
      ctx.lineTo(x + gridSize * this.ratio(p1, p2, threshold), y);

      ctx.stroke();
    };

    funcs[2] = (p1, p2, p4, p8, threshold) => {
      // o--*
      // |  |
      // o--o
      const x = p1.position.x;
      const y = p1.position.y;

      ctx.beginPath();
      // ctx.moveTo(x + gridSize / 2, y);
      // ctx.lineTo(x + gridSize, y + gridSize / 2);

      ctx.moveTo(x + gridSize * this.ratio(p1, p2, threshold), y);
      ctx.lineTo(x + gridSize, y + gridSize * this.ratio(p2, p8, threshold));

      ctx.stroke();
    };

    funcs[3] = (p1, p2, p4, p8, threshold) => {
      // p3 = p1 + p2
      // *--*
      // |  |
      // o--o
      const x = p1.position.x;
      const y = p1.position.y;

      ctx.beginPath();
      // ctx.moveTo(x, y + gridSize / 2);
      // ctx.lineTo(x + gridSize, y + gridSize / 2);

      ctx.moveTo(x, y + gridSize * this.ratio(p1, p4, threshold));
      ctx.lineTo(x + gridSize, y + gridSize * this.ratio(p2, p8, threshold));

      ctx.stroke();
    };

    funcs[4] = (p1, p2, p4, p8, threshold) => {
      // o--o
      // |  |
      // *--o
      const x = p1.position.x;
      const y = p1.position.y;

      ctx.beginPath();
      // ctx.moveTo(x, y + gridSize / 2);
      // ctx.lineTo(x + gridSize / 2, y + gridSize);

      ctx.moveTo(x, y + gridSize * this.ratio(p1, p4, threshold));
      ctx.lineTo(x + gridSize * this.ratio(p4, p8, threshold), y + gridSize);

      ctx.stroke();
    };

    funcs[5] = (p1, p2, p4, p8, threshold) => {
      // 5 = p1 + p4
      // *--o
      // |  |
      // *--o
      const x = p1.position.x;
      const y = p1.position.y;

      ctx.beginPath();
      // ctx.moveTo(x + gridSize / 2, y);
      // ctx.lineTo(x + gridSize / 2, y + gridSize);

      ctx.moveTo(x + gridSize * this.ratio(p1, p2, threshold), y);
      ctx.lineTo(x + gridSize * this.ratio(p4, p8, threshold), y + gridSize);

      ctx.stroke();
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

      ctx.beginPath();
      // ctx.moveTo(x + gridSize / 2, y + gridSize);
      // ctx.lineTo(x + gridSize, y + gridSize / 2);

      ctx.moveTo(x + gridSize * this.ratio(p4, p8, threshold), y + gridSize);
      ctx.lineTo(x + gridSize, y + gridSize * this.ratio(p2, p8, threshold));

      ctx.stroke();
    };

    funcs[8] = (p1, p2, p4, p8, threshold) => {
      // o--o
      // |  |
      // o--*
      const x = p1.position.x;
      const y = p1.position.y;

      ctx.beginPath();
      // ctx.moveTo(x + gridSize / 2, y + gridSize);
      // ctx.lineTo(x + gridSize, y + gridSize / 2);

      ctx.moveTo(x + gridSize * this.ratio(p4, p8, threshold), y + gridSize);
      ctx.lineTo(x + gridSize, y + gridSize * this.ratio(p2, p8, threshold));

      ctx.stroke();
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

      ctx.beginPath();
      // ctx.moveTo(x + gridSize / 2, y);
      // ctx.lineTo(x + gridSize / 2, y + gridSize);

      ctx.moveTo(x + gridSize * this.ratio(p1, p2, threshold), y);
      ctx.lineTo(x + gridSize * this.ratio(p4, p8, threshold), y + gridSize);

      ctx.stroke();
    };

    funcs[11] = (p1, p2, p4, p8, threshold) => {
      // 11 = p1 + p2 + p8
      // *--*
      // |  |
      // o--*
      const x = p1.position.x;
      const y = p1.position.y;

      ctx.beginPath();
      // ctx.moveTo(x, y + gridSize / 2);
      // ctx.lineTo(x + gridSize / 2, y  + gridSize);

      ctx.moveTo(x, y + gridSize * this.ratio(p1, p4, threshold));
      ctx.lineTo(x + gridSize * this.ratio(p4, p8, threshold), y + gridSize);

      ctx.stroke();
    };

    funcs[12] = (p1, p2, p4, p8, threshold) => {
      // 12 = p4 + p8
      // o--o
      // |  |
      // *--*
      const x = p1.position.x;
      const y = p1.position.y;

      ctx.beginPath();
      // ctx.moveTo(x, y + gridSize / 2);
      // ctx.lineTo(x + gridSize, y + gridSize / 2);

      ctx.moveTo(x, y + gridSize * this.ratio(p1, p4, threshold));
      ctx.lineTo(x + gridSize, y + gridSize * this.ratio(p2, p8, threshold));

      ctx.stroke();
    };

    funcs[13] = (p1, p2, p4, p8, threshold) => {
      // 13 = p1 + p4 + p8
      // *--o
      // |  |
      // *--*
      const x = p1.position.x;
      const y = p1.position.y;

      ctx.beginPath();
      // ctx.moveTo(x + gridSize / 2, y);
      // ctx.lineTo(x + gridSize, y + gridSize / 2);

      ctx.moveTo(x + gridSize * this.ratio(p1, p2, threshold), y);
      ctx.lineTo(x + gridSize, y + gridSize * this.ratio(p2, p8, threshold));

      ctx.stroke();
    };

    funcs[14] = (p1, p2, p4, p8, threshold) => {
      // 14 = p2 + p4 + p8
      // o--*
      // |  |
      // *--*
      const x = p1.position.x;
      const y = p1.position.y;

      ctx.beginPath();
      // ctx.moveTo(x, y + gridSize / 2);
      // ctx.lineTo(x + gridSize / 2, y);

      ctx.moveTo(x, y + gridSize * this.ratio(p1, p4, threshold));
      ctx.lineTo(x + gridSize * this.ratio(p1, p2, threshold), y);

      ctx.stroke();
    };

    funcs[15] = (p1, p2, p4, p8, threshold) => {
      // 15 = p1 + p2 + p4 + p8
      // *--*
      // |  |
      // *--*
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
    this.camera = new THREE.PerspectiveCamera(
      60,
      this.sizes.width / this.sizes.height,
      1,
      1001
    );
    this.camera.position.set(0, 5, 10);

    // レンダラ
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0xdedede);
    this.container.appendChild(this.renderer.domElement);

    // コントローラ
    this.controller = new OrbitControls(this.camera, this.renderer.domElement);
    this.controller.autoRotate = this.params.autoRotate;
    this.controller.autoRotateSpeed = this.params.autoRotateSpeed;

    // グリッドヘルパー
    // this.scene.add(new THREE.GridHelper(20, 20, new THREE.Color(0xffffff), new THREE.Color(0xffffff)));

    // 環境光
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.0));

  }


  animationParams = {
    fps: 25,
    fpsInterval: null,
    now: null,
    then: null,
    elapsed: null,
  }


  startAnimating() {
    this.animationParams.fpsInterval = 1000 / this.animationParams.fps;
    this.animationParams.then = Date.now();
    this.animate();
  }


  animate() {
    requestAnimationFrame(() => { this.animate(); });

    // fpsを間引く
    this.animationParams.now = Date.now();
    this.animationParams.elapsed = this.animationParams.now - this.animationParams.then;
    if (this.animationParams.elapsed > this.animationParams.fpsInterval) {
      this.animationParams.then = this.animationParams.now - (this.animationParams.elapsed % this.animationParams.fpsInterval);

      // 実際の処理
      {
        // クリアして
        this.clearContext();

        // ボールを移動して
        this.ball.step();

        // 重力を計算し直す
        this.calcPotential();

        // 等高線を引く
        this.drawIsoline();

        // ボールを描画
        this.drawBall();
      }

    }
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
