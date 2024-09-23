import * as THREE from "three";
import { OrbitControls } from "three/controls/OrbitControls.js";

// stats.js
import Stats from "three/libs/stats.module.js";

// 必要な追加モジュール
// three.js/examples/jsm/misc/GPUComputationRenderer.js
// three.js/examples/jsm/postprocessing/Pass.js
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
    clock: new THREE.Clock(),
    delta: 0,
    time: 0,
    interval: 1 / 30,  // = 30fps
  }

  params = {
    particleNum: 1,
    particleLen: 50,
  }

  constructor(params) {
    this.params = Object.assign(this.params, params);

    // scene, camera, rendererを初期化
    this.initThreejs();

    // stats.jsを初期化
    this.initStatsjs();

    // パーティクルを初期化
    this.initParticles();

    // フレーム毎の処理(requestAnimationFrameで再帰的に呼び出される)
    this.render();
  }


  initThreejs() {
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


  render = () => {
    // 再帰処理
    requestAnimationFrame(this.render);

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


  onWindowResize = (event) => {
    this.sizes.width = this.container.clientWidth;
    this.sizes.height = this.container.clientHeight;

    this.camera.aspect = this.sizes.width / this.sizes.height;
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.sizes.width, this.sizes.height);
  }


  // GPUComputationRendererクラスのインスタンス
  // 毎フレーム computeRenderer.compute(); を実行するので、
  // 外部からアクセスできるようにしておく
  computeRenderer;

  // テクスチャを位置用と速度用で2個使うので、それらのパラメータを保存しておく
  computeParams = {

    // 位置情報用のパラメータ
    position: {
      // addVariable()の戻り値を保存しておく
      // 計算後のテクスチャを取り出すのに使う
      variable: null,

      // 変数に紐づけられたシェーダーに渡すuniform
      // 時刻情報を渡したいときに外部から uniforms.time.value = 0.0 などとして設定する
      uniforms: null,
    },

    // 速度情報用のパラメータ
    velocity: {
       variable: null,  // addVariable()の戻り値を保存しておく
       uniforms: null,  // 変数を取り出すときに使うシェーダーに渡すuniform
    }

  }

  // 画面描画に使うシェーダーマテリアルに渡すuniformsオブジェクト
  // 位置情報を格納したテクスチャはフレームごとに更新されるのでそれを渡す
  uniforms = {
    texturePosition: { value: null },
  };


  // パーティクルの初期化
  initParticles() {

    //
    // GPUComputationRendererを初期化
    //

    // width = particleLen,  height = particleNum として初期化する
    // パーティクルの数だけ、ピクセルが存在することになる
    // ここでいうパーティクルは、後ほど作るメッシュの頂点のこと

    //
    //                           length
    //        +--+--+--+--+--+--+--+
    // num 0  |  |  |  |  |  |  |  |
    //        +--+--+--+--+--+--+--+
    // num 1  |  |  |  |  |  |  |  |
    //        +--+--+--+--+--+--+--+
    // num 2  |  |  |  |  |  |  |  |
    //        +--+--+--+--+--+--+--+

    this.computeRenderer = new GPUComputationRenderer(
      this.params.particleLen,  // widthはパーティクルの尻尾の長さ
      this.params.particleNum,  // heightは線のように移動するパーティクルの本数
      this.renderer             // renderer
    );

    //
    // computeRenderer.createTexture();
    //

    // 位置用のテクスチャを作成して、
    let initialPositionTexture = this.computeRenderer.createTexture();

    // 値を初期化する
    // ランダムな場所にパーティクルを配置する
    {
      let initPositionArray = initialPositionTexture.image.data;

      // パーティクルを分布させる範囲
      // -range/2 ～ range/2 の範囲でランダムな初期位置を設定
      const range = 10;

      // 各行ごと、すなわちパーティクルごとに初期化
      for (let i = 0; i < initPositionArray.length; i += this.params.particleLen * 4) {
        const x = Math.random() * range - range / 2;
        const y = Math.random() * range - range / 2;
        const z = Math.random() * range - range / 2;

        // 各行の、各列の値を初期化
        for (let j = 0; j < this.params.particleLen * 4; j += 4) {
          // 初期状態では尻尾が存在しないように、全ての列に同じ座標を入れておく
          initPositionArray[i + j + 0] = x;
          initPositionArray[i + j + 1] = y;
          initPositionArray[i + j + 2] = z;
          initPositionArray[i + j + 3] = 1.0;
        }
      }
    }

    // console.log(initialPositionTexture);
    // これを出力すると、
    // initialPositionTextureはDataTextureクラスのインスタンスであることが分かる
    // 中にiamgeオブジェクトが入っていて、
    // width = 20, height = 1の場合
    // image: {data: Float32Array(80), width: 20, height: 1}
    // という形になる


    // 速度用のテクスチャを作成して、
    let initialVelocityTexture = this.computeRenderer.createTexture();

    // console.log(initialVelocityTexture);
    // テクスチャをいくつ作成しても、同じ大きさで作られることが分かる

    // 初期速度0で初期化する
    // 速度の計算は先頭ピクセルだけなので全ピクセルを初期化しなくてもいいけど念の為ゼロ埋め
    {
      let initVelocityArray = initialVelocityTexture.image.data;
      for (let i = 0; i < initVelocityArray.length; i++) {
        initVelocityArray[i] = 0;
      }
    }

    // 変数名にinitialと付けて作成したテクスチャはあくまで初期値にすぎず、
    // 実際には内部で2枚のテクスチャを交代交代で使っているので
    // このテクスチャ自体を保存しておいても意味がない。
    // 最新のテクスチャは毎回 getCurrentRenderTarget() で取り出す必要がある

    //
    // 変数に紐づけるシェーダー
    //
    const positionShader = /* glsl */`

        // 一番左のピクセルだけ計算して、残りはフレームごとにずらしてコピーする
        //  +--+--+--+--+--+--+--+
        //  |＊|  |  |  |  |  |  |
        //  +--+--+--+--+--+--+--+
        //     ->コピー

      void main() {

        vec2 uv;
        vec3 pos;

        if (gl_FragCoord.x < 1.0) {

          // gl_FragCoordは画面上のピクセルの座標を表す
          // X座標が1.0未満、ということは画面の一番左のピクセルだけ計算するということ

          // UV座標を計算して、
          uv = gl_FragCoord.xy / resolution.xy;

          // 位置情報をテクスチャから取り出す
          pos = texture2D( texturePosition, uv ).xyz;

          // texturePositionというテクスチャはuniformで渡していないが、
          // addVariable()で変数を追加すると自動的に使えるようになる
          // textureVelocityも同様にaddVariable()で追加することで自動的に使えるようになる

          // 速度速度を取り出す
          vec3 vel = texture2D( textureVelocity, uv ).xyz;

          // 速度に応じて位置を更新
          pos += vel * 0.01;

        } else {

          // 先頭以外のピクセルは、左隣すなわちX座標が一つ小さいピクセルの値を使う
          // こうすることで移動の軌跡を作ることができる
          uv = (gl_FragCoord.xy - vec2(1.0, 0.0)) / resolution.xy;

          // 左隣のピクセルの位置を取り出して、それを自分の位置にする
          // 全ピクセルが同じプログラムを同時に実行するので、この値はまだ更新されていない
          pos = texture2D( texturePosition, uv ).xyz;

        }

        // 計算した位置をテクスチャに保存する
        // この瞬間に全ピクセルの情報が一斉に更新される
        gl_FragColor = vec4(pos, 1.0);

      }
    `;

    const velocityShader = noiseShader + /* glsl */`

      // 外部から時刻情報を渡すためのuniform
      uniform float time;

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
          snoise( vec4( 0.1 * pos.xyz, 7.225 + 0.5 * time ) ),
          snoise( vec4( 0.1 * pos.xyz, 3.553 + 0.5 * time ) ),
          snoise( vec4( 0.1 * pos.xyz, 1.259 + 0.5 * time ) )
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

    // 戻り値は getCurrentRenderTarget() でテクスチャを取り出すのに必要なので、
    // 外から参照できる場所に保存しておく

    this.computeParams.position.variable = this.computeRenderer.addVariable(
      "texturePosition",      // シェーダーの中で参照する名前
      positionShader,         // シェーダーコード
      initialPositionTexture  // 最初に作ったテクスチャを渡す
    );

    this.computeParams.velocity.variable = this.computeRenderer.addVariable(
      "textureVelocity",      // シェーダーの中で参照する名前
      velocityShader,         // シェーダーコード
      initialVelocityTexture  // 最初に作ったテクスチャを渡す
    );

    //
    // computeRenderer.setVariableDependencies();
    //

    // 追加した変数の依存関係を設定する

    // シェーダーの中でtexturePositionとtextureVelocityの両方を参照しているので、このように設定する
    this.computeRenderer.setVariableDependencies(
      this.computeParams.position.variable,
      [this.computeParams.position.variable, this.computeParams.velocity.variable]
    );

    this.computeRenderer.setVariableDependencies(
      this.computeParams.velocity.variable,
      [this.computeParams.position.variable, this.computeParams.velocity.variable]
    );

    // シェーダーに渡すuniformsオブジェクトを取り出して、値を代入しやすくする
    // もちろん this.computeParams.position.variable.material.uniform = ... と書いてもいいけど、長いので
    this.computeParams.position.uniforms = this.computeParams.position.variable.material.uniforms;
    this.computeParams.velocity.uniforms = this.computeParams.velocity.variable.material.uniforms;

    // uniformsにtime変数を追加
    this.computeParams.velocity.uniforms.time = { value: 0.0 };

    //
    // computeRenderer.init();
    //

    const error = this.computeRenderer.init();
    if (error !== null) {
      console.error(error);
      new Error(error);
    }

    //
    // パーティクルを表すメッシュの作成と表示
    //

    // バッファジオメトリを作成
    const geometry = new THREE.BufferGeometry();

    // positionとuvとindicesを作成する

    // 画面上に存在するパーティクル（頂点）の個数は particleNum * particleLen なので、
    // その数だけvec3を格納できるFloat32Arrayを準備する
    const vertices = new Float32Array(this.params.particleNum * this.params.particleLen * 3);

    // UVは、その数だけvec2を格納できるFloat32Arrayを準備する
    const uv = new Float32Array(this.params.particleNum * this.params.particleLen * 2);

    // indexは3個の頂点を指定して三角形のポリゴンを設定するので*3で確保する
    const indices = new Uint32Array(this.params.particleNum * this.params.particleLen * 3);

    // 各行、すなわちパーティクルごとに、
    for (let i = 0; i < this.params.particleNum; i++) {

      // 各列、すなわちパーティクルの尻尾ごとに、
      for (let j = 0; j < this.params.particleLen; j++) {

        // いま何番目の頂点を処理しているかを表すindex
        // indexは 0 ~ particleNum * particleLen - 1 までの値を取る
        let index = i * this.params.particleLen + j;

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

        // index = 0 のとき、i = 0, j = 0 なので、uv[0] = 0, uv[1] = 0 になる
        // index = 1 のとき、i = 0, j = 1 なので、uv[2] = 0, uv[3] = 1 / (particleLen - 1) になる
        // index = 2 のとき、i = 0, j = 2 なので、uv[4] = 0, uv[5] = 2 / (particleLen - 1) になる

        uv[index * 2 + 0] = j / (this.params.particleLen -1);
        uv[index * 2 + 1] = i / (this.params.particleNum -1);


        // indexを作成してポリゴンを構成する

        // 三角形のポリゴンは、先頭の頂点とそれに続く尻尾で構成しなければならない
        // つまり行をまたいでポリゴンを作るとおかしなことになるので、一つの行で完結させる必要がある

        // 頂点1
        indices[index * 3 + 0] = index;

        // 頂点2 同じ行内の次の頂点を指定したいが、右に振り切れないように配慮する
        indices[index * 3 + 1] = Math.min(index + 1, i * this.params.particleLen + this.params.particleLen - 1);

        // 頂点3 これは頂点2と同じものを指定する。三角形のポリゴンにならないが、描画したいのは線なので問題ない
        indices[index * 3 + 2] = Math.min(index + 1, i * this.params.particleLen + this.params.particleLen - 1);

        // 結果的に尻尾の最後の方はうまく表示されてないと思うが、すぐに消えて見えなくなるので気にしない

      }
    }

    //
    // アトリビュート position と uv と inddex を設定する
    //

    // positionはバーテックスシェーダーで参照しているものの、
    // 計算で使うときには常時vec3(0.0)なので設定しなくても表示できてしまう
    geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));

    // uvはバーテックスシェーダーで参照しているので必須
    geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));

    // indexを設定しないと、両端を繋いでしまうので必須
    geometry.setIndex(new THREE.BufferAttribute(indices, 3));

    // シェーダーマテリアルを作成
    let material = new THREE.ShaderMaterial({
      // updateParticles() の中でフレームごとに値を更新する
      uniforms: this.uniforms,

      vertexShader: /* glsl */`

        // 位置情報が書き込まれているテクスチャtexturePositionは外からuniformで渡す必要がある
        uniform sampler2D texturePosition;

        // バーテックスシェーダーで色を決めて、フラグメントシェーダーに渡す
        varying vec4 vColor;

        void main() {

          // 位置をテクスチャから取得
          vec3 pos = texture2D(texturePosition, uv).xyz;

          // 現在位置にposを加えて位置を更新
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position + pos, 1.0 );

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

    // wireframeで表示することで線がはっきり見える
    material.wireframe = true;

    const mesh = new THREE.Mesh(geometry, material);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();

    this.scene.add(mesh);
  }


  updateParticles() {

    // 時刻情報を渡して
    this.computeParams.velocity.uniforms.time.value = this.renderParams.time;

    // 位置情報を計算する
    this.computeRenderer.compute();

    // 位置情報が格納されているtexturePositionをuniformsでバーテックスシェーダーに渡す
    this.uniforms.texturePosition.value = this.computeRenderer.getCurrentRenderTarget(this.computeParams.position.variable).texture;

  }

}


//
// 以下、シェーダーで使うノイズ関数
//

const noiseShader = /* glsl */`

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
