import * as THREE from "three";
import { OrbitControls } from "three/controls/OrbitControls.js";

import Stats from "three/libs/stats.module.js";

import { GUI } from "three/libs/lil-gui.module.min.js";

// 必要な追加モジュール（libsに配置するファイル）
//   three.js/examples/jsm/misc/GPUComputationRenderer.js
//   three.js/examples/jsm/postprocessing/Pass.js
import { GPUComputationRenderer } from "three/libs/misc/GPUComputationRenderer.js";

/*

GPUComputationRenderer

変数の概念を使用する。

変数は各計算要素（テクセル）ごとに４つの浮動小数点（RGBA）を保持する

各変数には、その変数を取得するために実行されるべきフラグメントシェーダがある

必要な数の変数を使用して依存関係を作成することで、シェーダーは他の変数のテクスチャにアクセスできるようになる

レンダラーには変数ごとに２つのレンダリングターゲットがあり、ピンポンを実現する

変数の名前にはtextureをプレフィクスとして付けるのが慣例
例： texturePosition, textureVelocity など

計算サイズ(sizeX * sizeY)はシェーダーで自動的に解像度として定義される
例：#DEFINE resolution vec2(1024.0, 1024.0)

*/

// 参照元
// https://qiita.com/ukonpower/items/26411c4fa588cd2e772e
// https://github.com/ukonpower/glsl-graphics/tree/master/src/gl16/js


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
    particleNum: 1,
    particleLen: 50,
  }

  // GPUComputationRendererクラスのインスタンス
  // 毎フレーム computeRenderer.compute(); を実行するのでインスタンス変数に保存する
  computationRenderer;

  // compute()時に使うuniforms
  computationUniforms = {
    u_time: { value: 0.0 },
  }

  // 画面描画に使うシェーダーマテリアルに渡すuniformsオブジェクト
  uniforms = {
    // initComputationRenderer()の中でテクスチャをセットする
    u_texture_position: { value: null },
  };


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

    // GPUComputationRendererを初期化
    this.initComputationRenderer();

    // パーティクルを初期化
    this.initParticles();

    // フレーム処理
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
    this.renderer = new THREE.WebGLRenderer({ alpha: false, antialias: true });
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

    gui
      .add(this.params, "particleNum")
      .name(navigator.language.startsWith("ja") ? "ラインの数" : "number of lines")
      .min(1)
      .max(200)
      .step(1)
      .onChange((value) => {
        doLater(this.initContents, 100);
      });
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

      // カメラコントローラーの更新
      this.controller.update();

      // パーティクルの更新
      this.updateParticles();

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


  initComputationRenderer = () => {

    //
    // GPUComputationRendererを初期化
    //

    // width = particleLen,  height = particleNum として初期化する
    //
    //                              particleLen
    //        +--+--+--+--+--+--+--+
    // num .. |  |  |  |  |  |  |  |
    //        +--+--+--+--+--+--+--+
    // num 1  |  |  |  |  |  |  |  |
    //        +--+--+--+--+--+--+--+
    // num 0  |  |  |  |  |  |  |  |
    //        +--+--+--+--+--+--+--+

    // パーティクルの数 = パーティクルで描く線の数
    const particleNum = this.params.particleNum;

    // パーティクルで描く尻尾の長さ
    const particleLen = this.params.particleLen;

    const computationRenderer = new GPUComputationRenderer(
      particleLen,   // widthはパーティクルの尻尾の長さ
      particleNum,   // heightは線のように移動するパーティクルの本数
      this.renderer  // renderer
    );

    // フレームごとにcompute()を実行するので、インスタンス変数に保存しておく
    this.computationRenderer = computationRenderer;
    //
    // computeRenderer.createTexture();
    //

    // 位置用のテクスチャを作成して、
    const initialPositionTexture = this.computationRenderer.createTexture();

    // 各行ごと、すなわちラインごとに、
    for (let i = 0; i < particleNum; i++) {
      // i番目のラインに関して、-range/2 ～ range/2 の範囲でランダムな初期位置を設定
      const range = 10;
      const x = Math.random() * range - range / 2;
      const y = Math.random() * range - range / 2;
      const z = Math.random() * range - range / 2;

      // 各行の、各列の値を初期化
      for (let j = 0; j < particleLen; j++) {
        // 同じラインの頂点は全て同じ座標にして、初期状態では尻尾が存在しないようにする
        const index = (i * particleLen + j) * 4;
        initialPositionTexture.image.data[index + 0] = x;    // X座標
        initialPositionTexture.image.data[index + 1] = y;    // Y座標
        initialPositionTexture.image.data[index + 2] = z;    // Z座標
        initialPositionTexture.image.data[index + 3] = 1.0;  // W座標(使わないので1.0で固定)
      }
    }

    // console.log(initialPositionTexture);
    // これを出力すると、
    // initialPositionTextureはDataTextureクラスのインスタンスであることが分かる
    // 中にiamgeオブジェクトが入っていて、
    // width = 20, height = 1の場合
    // image: {data: Float32Array(80), width: 20, height: 1}
    // という形になる

    // もう一枚、速度用のテクスチャを作成
    const initialVelocityTexture = computationRenderer.createTexture();

    // console.log(initialVelocityTexture);
    // テクスチャをいくつ作成しても、同じ大きさで作られることが分かる

    // 初期速度0で初期化する
    for (let i = 0; i < initialVelocityTexture.image.data.length; i++) {
      initialVelocityTexture.image.data[i] = 0;
    }

    // 変数名にinitialと付けて作成したテクスチャはあくまで初期値にすぎず、
    // 実際には内部で2枚のテクスチャを交代交代で使っているので
    // このテクスチャ自体を保存しておいても意味がない。
    // 最新のテクスチャは毎回 getCurrentRenderTarget() で取り出す必要がある

    //
    // compute()したときに走るシェーダー
    //

    // 一番左のピクセルだけ計算して、残りはフレームごとにずらしてコピーする
    //  +--+--+--+--+--+--+--+
    //  |＊|  |  |  |  |  |  |
    //  +--+--+--+--+--+--+--+
    //     ->コピー


    const positionShader = /* glsl */`
      void main() {
        if (gl_FragCoord.x < 1.0) {
          // gl_FragCoordは(width, height)の座標系で表される当該ピクセルの位置
          // X座標が1.0未満、ということは一番左のピクセルということ

          // UV座標を計算して、
          vec2 uv = gl_FragCoord.xy / resolution.xy;

          // 位置情報をテクスチャから取り出す
          // texturePositionはuniformで渡していないが、この後addVariable()で変数を追加すると自動的に使えるようになる
          vec3 pos = texture2D( texturePosition, uv ).xyz;

          // 速度をテクスチャから取り出す
          // textureVelocityはuniformで渡していないが、この後addVariable()で変数を追加すると自動的に使えるようになる
          vec3 vel = texture2D( textureVelocity, uv ).xyz;

          // 速度に応じて位置を更新
          pos += vel * 0.01;

          // 計算した位置をテクスチャに保存する（この瞬間に全ピクセルの情報が一斉に更新される）
          gl_FragColor = vec4( pos, 1.0 );

        } else {
          // 先頭以外のピクセルは、左隣すなわちX座標が一つ小さいピクセルの値を使う
          // こうすることで移動の軌跡を作ることができる
          vec2 leftUv = (gl_FragCoord.xy - vec2(1.0, 0.0)) / resolution.xy;

          // 左隣のピクセルの位置を取り出して、それを自分の位置にする
          gl_FragColor = texture2D( texturePosition, leftUv );
        }
      }
    `;

    const velocityShader = NOISE_SHADER + /* glsl */`
      // 外部から得る時刻情報
      uniform float u_time;

      void main() {

        // 速度・向きの情報を必要とするのは先頭のピクセルだけなので、その他のピクセルは計算しない
        if (gl_FragCoord.x >= 1.0) {
          return;
        }

        // UV座標を計算して、
        vec2 uv = gl_FragCoord.xy / resolution.xy;

        // 位置と速度を取り出す
        vec3 pos = texture2D( texturePosition, uv ).xyz;
        vec3 vel = texture2D( textureVelocity, uv ).xyz;

        // パーリンノイズを使って、速度と向きを計算
        vel.xyz += 40.0 * vec3(
          snoise( vec4( 0.1 * pos.xyz, 7.225 + 0.5 * u_time ) ),
          snoise( vec4( 0.1 * pos.xyz, 3.553 + 0.5 * u_time ) ),
          snoise( vec4( 0.1 * pos.xyz, 1.259 + 0.5 * u_time ) )
        ) * 0.2;

        vel += -pos * length(pos) * 0.1;

        vel.xyz *= 0.9 + abs(sin(uv.y * 9.0)) * 0.03;

        // テクスチャに保存
        gl_FragColor = vec4( vel.xyz, 1.0 );
      }
    `;

    //
    // computeRenderer.addVariable();
    //

    // ここが重要

    // テクスチャと、それに対応するシェーダを指定して、変数 "texturePosition" を追加する
    // シェーダーの中で texture2D( texturePosition, uv ) のように参照できるようになる

    // addVariable()の戻り値はテクスチャを取り出すのに必要

    const positionVariable = this.computationRenderer.addVariable(
      "texturePosition",      // シェーダーの中で参照する名前
      positionShader,         // シェーダーコード
      initialPositionTexture  // 最初に作ったテクスチャを渡す
    );

    const velocityVariable = this.computationRenderer.addVariable(
      "textureVelocity",      // シェーダーの中で参照する名前
      velocityShader,         // シェーダーコード
      initialVelocityTexture  // 最初に作ったテクスチャを渡す
    );

    // シェーダー用いているuniformを登録する場合はここで設定する
    velocityVariable.material.uniforms = this.computationUniforms;

    //
    // computeRenderer.setVariableDependencies();
    //

    // 追加した変数の依存関係を設定する

    // シェーダーの中でtexturePositionとtextureVelocityの両方を参照しているので、このように設定する
    computationRenderer.setVariableDependencies(
      positionVariable,
      [positionVariable, velocityVariable]
    );

    computationRenderer.setVariableDependencies(
      velocityVariable,
      [positionVariable, velocityVariable]
    );

    //
    // computeRenderer.init();
    //

    const error = this.computationRenderer.init();
    if (error !== null) {
      console.error(error);
      new Error(error);
    }

    //
    // テクスチャを取り出してシェーダーマテリアルのuniformsに設定する
    //
    this.uniforms.u_texture_position.value = computationRenderer.getCurrentRenderTarget(positionVariable).texture;
  }


  initParticles = () => {

    //
    // パーティクルを表すメッシュの作成と表示
    //

    // バッファジオメトリを作成
    const geometry = new THREE.BufferGeometry();

    //
    // positionとuvとindicesを作成する
    //

    const particleNum = this.params.particleNum;
    const particleLen = this.params.particleLen;

    // 画面上に存在するパーティクル（頂点）の個数は particleNum * particleLen なので、
    // その数だけvec3を格納できるFloat32Arrayを準備する
    const vertices = new Float32Array(particleNum * particleLen * 3);

    // UVは、その数だけvec2を格納できるFloat32Arrayを準備する
    const uv = new Float32Array(particleNum * particleLen * 2);

    // indexは3個の頂点を指定して三角形のポリゴンを設定するので*3で確保する
    const indices = new Uint32Array(particleNum * particleLen * 3);

    for (let i = 0; i < particleNum; i++) {
      // 各行、すなわちi番目のラインごとに、

      for (let j = 0; j < this.params.particleLen; j++) {
        // 各列、すなわちパーティクルの尻尾ごとに、

        // いま何番目の頂点を処理しているかを表すindex
        // indexは 0 ~ particleNum * particleLen - 1 までの値を取る
        let index = i * particleLen + j;

        // 頂点のxyz座標を0で初期化
        vertices[index * 3 + 0] = 0;  // X座標
        vertices[index * 3 + 1] = 0;  // Y座標
        vertices[index * 3 + 2] = 0;  // Z座標

        // ★★★ ここ超重要！ ★★★

        // index番目の頂点に対応するUV座標を設定する

        // UV座標を設定することで、
        // GPUComputationRendererで作成した計算用テクスチャの情報を
        // 自分自身のUV座標で取り出すことができる

        // 左下が原点なので(0, 0)、右上が(1, 1)になるようにUV座標を設定する
        // 座標は0始まりなので、i / (particleLen - 1) としないと、一番右が1.0にならない

        uv[index * 2 + 0] = j / (particleLen - 1);
        uv[index * 2 + 1] = i / (particleNum - 1);

        // indexを作成してポリゴンを構成する

        // 三角形のポリゴンは、先頭の頂点とそれに続く尻尾で構成しなければならない
        // つまり行をまたいでポリゴンを作るとおかしなことになるので、一つの行で完結させる必要がある

        // 頂点1
        indices[index * 3 + 0] = index;

        // 頂点2 同じ行内の次の頂点を指定したいが、右に振り切れないように配慮する
        indices[index * 3 + 1] = Math.min(index + 1, i * this.params.particleLen + this.params.particleLen - 1);

        // 頂点3 これは頂点2と同じものを指定する。三角形のポリゴンにならないが、描画したいのは線なので問題ない
        indices[index * 3 + 2] = indices[index * 3 + 1];
      }
    }

    //
    // アトリビュート position と uv と index を設定する
    //

    // positionはバーテックスシェーダーで参照しているものの、
    // 計算で使うときには常時vec3(0.0)なので、設定しなくても表示できてしまう
    geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));

    // uvはバーテックスシェーダーで参照しているので必須
    geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));

    // indexを設定しないと、両端を繋いでしまうので必須
    geometry.setIndex(new THREE.BufferAttribute(indices, 3));

    // シェーダーマテリアルを作成
    const material = new THREE.ShaderMaterial({

      // wireframeで表示することで線がはっきり見える
      wireframe: true,

      // updateParticles() の中でフレームごとに値を更新する
      uniforms: this.uniforms,

      vertexShader: /* glsl */`

        // 位置情報が書き込まれているテクスチャtexturePositionは外からuniformで渡す必要がある
        uniform sampler2D u_texture_position;

        // バーテックスシェーダーで色を決めて、フラグメントシェーダーに渡す
        varying vec4 vColor;

        void main() {

          // 位置をテクスチャから取得
          vec3 pos = texture2D(u_texture_position, uv).xyz;

          // 位置をposにして更新
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);

          // 座標に応じて色を変えて、それをフラグメントシェーダーに渡す
          vColor = vec4(uv.x, uv.y, 1.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        varying vec4 vColor;
        void main() {
          gl_FragColor = vColor;
        }
      `,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();

    this.scene.add(mesh);
  }


  updateParticles = () => {
    // 時刻情報を渡して
    this.computationUniforms.u_time.value = this.renderParams.time;

    // 位置情報を計算する
    this.computationRenderer.compute();
  }

}


//
// 以下、シェーダーで使うノイズ関数
//

const NOISE_SHADER = /* glsl */`

  // Description : Array and textureless GLSL 2D/3D/4D simplex
  //               noise functions.
  //      Author : Ian McEwan, Ashima Arts.
  //  Maintainer : stegu
  //     Lastmod : 20110822 (ijm)
  //     License : Copyright (C) 2011 Ashima Arts. All rights reserved.
  //               Distributed under the MIT License. See LICENSE file.
  //               https://github.com/ashima/webgl-noise
  //               https://github.com/stegu/webgl-noise
  //

  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  float mod289(float x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  float permute(float x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  float taylorInvSqrt(float r) { return 1.79284291400159 - 0.85373472095314 * r; }
  vec4 grad4(float j, vec4 ip) {
    const vec4 ones = vec4(1.0, 1.0, 1.0, -1.0);
    vec4 p,s;
    p.xyz = floor( fract (vec3(j) * ip.xyz) * 7.0) * ip.z - 1.0;
    p.w = 1.5 - dot(abs(p.xyz), ones.xyz);
    s = vec4(lessThan(p, vec4(0.0)));
    p.xyz = p.xyz + (s.xyz*2.0 - 1.0) * s.www;
    return p;
  }

  // (sqrt(5) - 1)/4 = F4, used once below
  #define F4 0.309016994374947451

  float snoise(vec4 v) {
    const vec4  C = vec4(
      0.138196601125011,  // (5 - sqrt(5))/20  G4
      0.276393202250021,  // 2 * G4
      0.414589803375032,  // 3 * G4
      -0.447213595499958  // -1 + 4 * G4
    );

    // First corner
    vec4 i  = floor(v + dot(v, vec4(F4)) );
    vec4 x0 = v -   i + dot(i, C.xxxx);

    // Other corners

    // Rank sorting originally contributed by Bill Licea-Kane, AMD (formerly ATI)
    vec4 i0;
    vec3 isX = step( x0.yzw, x0.xxx );
    vec3 isYZ = step( x0.zww, x0.yyz );
    //  i0.x = dot( isX, vec3( 1.0 ) );
    i0.x = isX.x + isX.y + isX.z;
    i0.yzw = 1.0 - isX;
    //  i0.y += dot( isYZ.xy, vec2( 1.0 ) );
    i0.y += isYZ.x + isYZ.y;
    i0.zw += 1.0 - isYZ.xy;
    i0.z += isYZ.z;
    i0.w += 1.0 - isYZ.z;

    // i0 now contains the unique values 0,1,2,3 in each channel
    vec4 i3 = clamp( i0, 0.0, 1.0 );
    vec4 i2 = clamp( i0-1.0, 0.0, 1.0 );
    vec4 i1 = clamp( i0-2.0, 0.0, 1.0 );

    //  x0 = x0 - 0.0 + 0.0 * C.xxxx
    //  x1 = x0 - i1  + 1.0 * C.xxxx
    //  x2 = x0 - i2  + 2.0 * C.xxxx
    //  x3 = x0 - i3  + 3.0 * C.xxxx
    //  x4 = x0 - 1.0 + 4.0 * C.xxxx
    vec4 x1 = x0 - i1 + C.xxxx;
    vec4 x2 = x0 - i2 + C.yyyy;
    vec4 x3 = x0 - i3 + C.zzzz;
    vec4 x4 = x0 + C.wwww;

    // Permutations
    i = mod289(i);
    float j0 = permute( permute( permute( permute(i.w) + i.z) + i.y) + i.x);
    vec4 j1 = permute( permute( permute( permute(i.w + vec4(i1.w, i2.w, i3.w, 1.0 )) + i.z + vec4(i1.z, i2.z, i3.z, 1.0 )) + i.y + vec4(i1.y, i2.y, i3.y, 1.0 )) + i.x + vec4(i1.x, i2.x, i3.x, 1.0 ));

    // Gradients: 7x7x6 points over a cube, mapped onto a 4-cross polytope
    // 7*7*6 = 294, which is close to the ring size 17*17 = 289.
    vec4 ip = vec4(1.0/294.0, 1.0/49.0, 1.0/7.0, 0.0) ;

    vec4 p0 = grad4(j0,   ip);
    vec4 p1 = grad4(j1.x, ip);
    vec4 p2 = grad4(j1.y, ip);
    vec4 p3 = grad4(j1.z, ip);
    vec4 p4 = grad4(j1.w, ip);

    // Normalise gradients
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;
    p4 *= taylorInvSqrt(dot(p4,p4));

    // Mix contributions from the five corners
    vec3 m0 = max(0.6 - vec3(dot(x0,x0), dot(x1,x1), dot(x2,x2)), 0.0);
    vec2 m1 = max(0.6 - vec2(dot(x3,x3), dot(x4,x4)            ), 0.0);
    m0 = m0 * m0;
    m1 = m1 * m1;
    return 49.0 * ( dot(m0*m0, vec3( dot( p0, x0 ), dot( p1, x1 ), dot( p2, x2 ))) + dot(m1*m1, vec2( dot( p3, x3 ), dot( p4, x4 ) ) ) ) ;
  }
`;
