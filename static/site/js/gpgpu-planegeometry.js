import * as THREE from "three";
import { OrbitControls } from "three/controls/OrbitControls.js";

// stats.js
import Stats from "three/libs/stats.module.js";

// 必要な追加モジュール（libs以下に配置するファイル）
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
    // 風のテクスチャのサイズ
    windTextureWidth: 32,
    windTextureHeight: 1,

    // 描画する線の数、この数でinitComputationRenderer()で計算するテクスチャの高さを決める
    numLines: 10,

    // プレーンジオメトリのwidthSegments, heightSegmentsは1で固定
    widthSegments: 31,
  }

  // GPUComputationRendererクラスのインスタンス
  // 毎フレーム computeRenderer.compute(); を実行する
  computationRenderer;

  // 位置情報を格納するテクスチャに渡すuniformsオブジェクト
  // 毎フレーム u_timeを更新する
  computationUniforms = {
    u_time: { value: 0.0 },
  }

  // 画面描画に使うシェーダーマテリアルに渡すuniformsオブジェクト
  uniforms = {
    // initComputationRenderer()の中でテクスチャをセットする
    u_texture_position: { value: null },

    // プレーンジオメトリに貼り付ける風を表現するテクスチャ
    // initWindTexture()の中でテクスチャをセットする
    u_texture_wind: { value: null },
  };


  constructor(params = {}) {

    this.params = Object.assign(this.params, params);

    // scene, camera, rendererを初期化
    this.initThreejs();

    // stats.jsを初期化
    this.initStatsjs();

    // 風のテクスチャを初期化
    this.initWindTexture();

    // GPUComputationRendererを初期化
    this.initComputationRenderer();

    // ラインを初期化
    this.initLines();

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

      // ラインを更新
      this.updateLines();

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


  initWindTexture = () => {
    if (this.params.windTexture) {
      return;
    }

    const colors = {
      0.0: '#ffffff00',  // 'rgba(255,255,255,0)'
      0.5: '#ffffff10',  // 'rgba(255,255,255,128)'
      1.0: '#ffffff00'   // 'rgba(255,255,255,0)'
    };

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const width = this.params.windTextureWidth;
    const height = this.params.windTextureHeight;

    canvas.width = width;
    canvas.height = height;

    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    for (const stop in colors) {
      gradient.addColorStop(+stop, colors[stop]);
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const texture = new THREE.CanvasTexture(canvas);

    // uniformsに保存しておく
    this.uniforms.u_texture_wind.value = texture;
  }


  initComputationRenderer = () => {

    //
    // GPUComputationRendererを初期化
    //

    // PlaneGeometryの頂点数を求める
    // widthSegmentsは間隔の数なので、PlaneGeometryの頂点の数は (widthSegments + 1) * 2 になる
    const numVertices = (this.params.widthSegments + 1) * 2;

    // ラインの数
    const numLines = this.params.numLines;

    // width = numVertices,  height = numLines として初期化する
    //
    //                             numVertices
    //        +--+--+--+--+--+--+--+
    // Line . |  |  |  |  |  |  |  |
    //        +--+--+--+--+--+--+--+
    // Line 1 |  |  |  |  |  |  |  |
    //        +--+--+--+--+--+--+--+
    // Line 0 |  |  |  |  |  |  |  |
    //        +--+--+--+--+--+--+--+

    const computationRenderer = new GPUComputationRenderer(
      numVertices,   // widthは線の尻尾の長さに相当
      numLines,      // heightは線の本数
      this.renderer  // renderer
    );

    // フレームごとにcompute()を実行するので、インスタンス変数に保存しておく
    this.computationRenderer = computationRenderer;

    //
    // computationRenderer.createTexture();
    //

    // 位置情報を格納する初期テクスチャを作成
    const initialPositionTexture = computationRenderer.createTexture();

    // 初期テクスチャにラインの初期位置を埋め込む
    for (let i = 0; i < numLines; i++) {
      // i番目のラインに関して、-range/2 ～ range/2 の範囲でランダムな初期位置を設定
      const range = 10;
      const x = Math.random() * range - range / 2;
      const y = Math.random() * range - range / 2;
      const z = Math.random() * range - range / 2;

      for (let j = 0; j < numVertices; j++) {
        // 同じラインの頂点は全て同じ座標にして、初期状態では尻尾が存在しないようにする
        const index = (i * numVertices + j) * 4;
        initialPositionTexture.image.data[index + 0] = x;      // X座標
        initialPositionTexture.image.data[index + 1] = y;      // Y座標
        initialPositionTexture.image.data[index + 2] = z;      // Z座標
        initialPositionTexture.image.data[index + 3] = j % 2;  // W座標は頂点が奇数か偶数かを表す
      }
    }

    // もう一枚、速度用の初期テクスチャを作成
    const initialVelocityTexture = computationRenderer.createTexture();

    // 初期速度0で初期化する
    for (let i = 0; i < initialVelocityTexture.image.data.length; i++) {
      initialVelocityTexture.image.data[i] = 0;
    }

    //
    // compute()したときに走るシェーダー
    //

    // 一番左のピクセルだけ位置を計算して、残りはフレームごとにずらしてコピーする
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
          vec4 textureValue = texture2D( texturePosition, uv );

          // 位置情報はxyzに、頂点が奇数か偶数かを表す情報はwに入っている
          vec3 pos = texture2D( texturePosition, uv ).xyz;
          float w = textureValue.w;

          // 速度をテクスチャから取り出す
          // textureVelocityはuniformで渡していないが、この後addVariable()で変数を追加すると自動的に使えるようになる
          vec3 vel = texture2D( textureVelocity, uv ).xyz;

          // 速度に応じて位置を更新
          pos += vel * 0.001;

          // 計算した位置をテクスチャに保存する（この瞬間に全ピクセルの情報が一斉に更新される）
          gl_FragColor = vec4( pos, w );

        } else {
          // 先頭以外のピクセルは、左隣すなわちX座標が一つ小さいピクセルの値を使う
          // こうすることで移動の軌跡を作ることができる
          vec2 leftUv = (gl_FragCoord.xy - vec2(1.0, 0.0)) / resolution.xy;

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
    // computationRenderer.addVariable();
    //

    // テクスチャと、それに対応するシェーダを指定して、変数 "texturePosition" を追加する
    // シェーダーの中で texture2D( texturePosition, uv ) のように参照できるようになる
    const positionVariable = computationRenderer.addVariable(
      "texturePosition",  // シェーダーの中で参照する名前
      positionShader,             // compute()実行時のシェーダーコード
      initialPositionTexture      // 最初に作ったテクスチャを渡す
    );

    const velocityVariable = computationRenderer.addVariable(
      "textureVelocity",          // シェーダーの中で参照する名前
      velocityShader,             // compute()実行時のシェーダーコード
      initialVelocityTexture      // 最初に作ったテクスチャを渡す
    );

    // uniformを登録する場合はここで設定する
    velocityVariable.material.uniforms = this.computationUniforms;

    // addVariable()の戻り値は getCurrentRenderTarget() でテクスチャを取り出すのに必要
    // 場合によっては、この変数をインスタンス変数として保持しておくと便利

    //
    // computationRenderer.setVariableDependencies();
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
    // computationRenderer.init();
    //

    const error = computationRenderer.init();
    if (error !== null) {
      console.error(error);
      new Error(error);
    }

    //
    // テクスチャを取り出してシェーダーマテリアルのuniformsに設定する
    //
    this.uniforms.u_texture_position.value = computationRenderer.getCurrentRenderTarget(positionVariable).texture;
  }


  initLines = () => {

    //
    // 風を表現するメッシュを作成する
    //

    // numLinesの数だけPlaneGeometryを作成する
    const numLines = this.params.numLines;
    const geometries = [];
    for (let i = 0; i < numLines; i++) {
      // i番目のラインに関して、

      // PlaneGeometryを作成
      const geometry = new THREE.PlaneGeometry(1, 1, this.params.widthSegments, 1);

      // ジオメトリの頂点数を取得、これは (this.params.widthSegments + 1) * 2 になる
      const numVertices = geometry.attributes.position.count;
      // console.log(numVertices);

      // gpguでのuv座標を格納する配列を作成
      const gpgpuUvs = new Float32Array(numVertices * 2);

      // 頂点の数だけgpguでのuv座標を設定
      for (let j = 0; j < numVertices; j++) {
        gpgpuUvs[j * 2 + 0] = j / (numVertices - 1);  // U方向は頂点の番号
        gpgpuUvs[j * 2 + 1] = i / (numLines - 1);     // V方向はラインの番号
      }

      // gpgpuUvアトリビュートを設定
      geometry.setAttribute("gpgpuUv", new THREE.BufferAttribute(gpgpuUvs, 2));

      // ジオメトリを配列に保存
      geometries.push(geometry);
    }

    // 全てのラインで共通に用いるシェーダーマテリアル
    const material = new THREE.ShaderMaterial({

      // uniformsはインスタンス変数として持っているので、それを使う
      uniforms: this.uniforms,

      // 両面を表示
      side: THREE.DoubleSide,

      // 透過設定
      transparent: true,

      // 向こう側が見えるようにする（transparent: trueの場合はこれもあわせて設定する）
      depthWrite: false,

      vertexShader: /* glsl */`
        uniform sampler2D u_texture_position;  // 位置情報が書き込まれているテクスチャ
        attribute vec2 gpgpuUv;  // 頂点に付与したgpgpuUvアトリビュート
        varying vec2 vUv;  // フラグメントシェーダーに渡すuv座標
        void main() {
          // 位置をテクスチャから取得
          vec4 textureValue = texture2D(u_texture_position, gpgpuUv);

          // 位置はxyzに、頂点が奇数か偶数かを表す情報はwに入っている
          vec3 pos = textureValue.xyz;
          float w = textureValue.w;

          // 奇数の頂点は座標を+する
          if (w > 0.5) {
            pos += vec3(.5);
          }

          // 位置をposに更新
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);

          // フラグメントシェーダーにuvを渡す
          vUv = uv;
        }
      `,

      fragmentShader: /* glsl */`
        uniform sampler2D u_texture_wind;  // 風のテクスチャ
        varying vec2 vUv;
        void main() {
          gl_FragColor = texture2D(u_texture_wind, vUv);
        }
      `,
    });

    // メッシュを作成してシーンに追加
    geometries.forEach(geometry => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.scene.add(mesh);
    });

  }


  updateLines = () => {
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
