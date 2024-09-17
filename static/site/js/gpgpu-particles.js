import * as THREE from "three";
import { OrbitControls } from "three/controls/OrbitControls.js";

// stats.js
import Stats from "three/libs/stats.module.js";

// 必要な追加モジュール
// three.js/examples/jsm/misc/GPUComputationRenderer.js
// three.js/examples/jsm/postprocessing/Pass.js

import { GPUComputationRenderer } from "three/libs/misc/GPUComputationRenderer.js";

// 参照元
// https://qiita.com/Murasaqi/items/20accc9b5fb9845fc73a


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
    WIDTH: 500,
    PARTICLES: 500 * 500,



  }

  constructor(params) {
    this.params = Object.assign(this.params, params);

    // scene, camera, renderer, controllerを初期化
    this.initThreejs();

    // stats.jsを初期化
    this.initStatsjs();

    // gpgpuを始めるための初期化
    this.initComputeRenderer();

    // パーティクルの初期位置を決定
    this.initPosition();

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

    // カメラ
    this.camera = new THREE.PerspectiveCamera(
      60,
      this.sizes.width / this.sizes.height,
      1,
      10000
    );
    this.camera.position.set(0, 0, 200);

    // レンダラ
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000);
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
    const axesHelper = new THREE.AxesHelper(10000);
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

      //
      // gpgpuでの描画処理
      //

      // 計算用のテクスチャを更新
      this.gpuCompute.compute();

      // 計算した結果が格納されたテクスチャをレンダリング用のシェーダーに渡す
      this.particleUniforms.texturePosition.value = this.gpuCompute.getCurrentRenderTarget(this.positionVariable ).texture;
      this.particleUniforms.textureVelocity.value = this.gpuCompute.getCurrentRenderTarget(this.velocityVariable ).texture;

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

    // シェーダー側に渡すUniform変数を変更する
    this.particleUniforms.cameraConstant.value = this.getCameraConstant();
  }


  // 現在の位置情報を決定するためのシェーダー
  computeShaderPosition = /*glsl*/`
    #define delta ( 1.0 / 60.0 )

    void main() {
      vec2 uv = gl_FragCoord.xy / resolution.xy;
      vec4 tmpPos = texture2D( texturePosition, uv );
      vec3 pos = tmpPos.xyz;
      vec4 tmpVel = texture2D( textureVelocity, uv );

      // velが移動する方向(もう一つ下のcomputeShaderVelocityを参照)
      vec3 vel = tmpVel.xyz;

      // 移動する方向に速度を掛け合わせた数値を現在地に加える。
      pos += vel * delta;
      gl_FragColor = vec4( pos, 1.0 );
    }
  `;


  // 移動方向を計算するためのシェーダー
  computeShaderVelocity = /*glsl*/`
    #include <common>

    // 今回はなにもしてない。
    // ここでVelのx y zについて情報を上書きすると、それに応じて移動方向が変わる

    void main() {
      vec2 uv = gl_FragCoord.xy / resolution.xy;
      float idParticle = uv.y * resolution.x + uv.x;
      vec4 tmpVel = texture2D( textureVelocity, uv );
      vec3 vel = tmpVel.xyz;

      gl_FragColor = vec4( vel.xyz, 1.0 );
    }
  `;


  // シェーダーマテリアルで描画するための頂点シェーダー
  particleVertexShader = /*glsl*/`
    #include <common>
    uniform sampler2D texturePosition;
    uniform float cameraConstant;
    uniform float density;
    varying vec4 vColor;
    varying vec2 vUv;
    uniform float radius;

    void main() {
        vec4 posTemp = texture2D( texturePosition, uv );
        vec3 pos = posTemp.xyz;
        vColor = vec4( 1.0, 0.7, 1.0, 1.0 );

        // ポイントのサイズを決定
        vec4 mvPosition = modelViewMatrix * vec4( pos, 1.0 );
        gl_PointSize = 0.5 * cameraConstant / ( - mvPosition.z );

        // uv情報の引き渡し
        vUv = uv;

        // 変換して格納
        gl_Position = projectionMatrix * mvPosition;
    }
  `;


// シェーダーマテリアルで描画するためのフラグメントシェーダー
  particleFragmentShader = /*glsl*/`
    // VertexShaderから受け取った色を格納するだけ。
    varying vec4 vColor;
    void main() {
      // 丸い形に色をぬるための計算
      float f = length( gl_PointCoord - vec2( 0.5, 0.5 ) );
      if ( f > 0.1 ) {
          discard;
      }
      gl_FragColor = vColor;
    }
  `;


  // pgpguに必要なオブジェクト
  gpuCompute;
  velocityVariable;
  positionVariable;
  positionUniforms;
  velocityUniforms;
  particleUniforms;
  effectController;

  initComputeRenderer() {
    const WIDTH = this.params.WIDTH;

    // gpgpuオブジェクトのインスタンスを格納
    this.gpuCompute = new GPUComputationRenderer(WIDTH, WIDTH, this.renderer);

    // パーティクルの位置情報と、移動方向を保存するテクスチャを2つ用意
    let dtPosition = this.gpuCompute.createTexture();
    let dtVelocity = this.gpuCompute.createTexture();

    // テクスチャにGPUで計算するために初期情報を埋めていく
    this.fillTextures(dtPosition, dtVelocity);

    // シェーダーをアタッチ
    this.velocityVariable = this.gpuCompute.addVariable("textureVelocity", this.computeShaderVelocity, dtVelocity);
    this.positionVariable = this.gpuCompute.addVariable("texturePosition", this.computeShaderPosition, dtPosition);

    // シェーダー間でテクスチャを参照できるようにするための処理
    this.gpuCompute.setVariableDependencies(this.velocityVariable, [this.positionVariable, this.velocityVariable]);
    this.gpuCompute.setVariableDependencies(this.positionVariable, [this.positionVariable, this.velocityVariable]);

    // オフスクリーンレンダリング用のWebGLRenderTargetを作成する
    var error = this.gpuCompute.init();
    if (error !== null) {
      new Error(`[ERROR] ${error}`);
    }

    // 以下、フレームごとにこれを実行して参照用と格納用のテクスチャを切り替える
    // gpuCompute.compute();

  }


  // テクスチャに初期情報を埋める関数
  fillTextures(texturePosition, textureVelocity) {

    // textureのイメージデータをいったん取り出す
    let posArray = texturePosition.image.data;
    let velArray = textureVelocity.image.data;

    // パーティクルの初期の位置は、ランダムなXZに平面おく。
    // 板状の正方形が描かれる

    for (let k = 0, kl = posArray.length; k < kl; k += 4) {
      // Position
      let x, y, z;
      x = Math.random() * 500 - 250;
      z = Math.random() * 500 - 250;
      y = 0;

      // posArrayの実態は一次元配列なので
      // x,y,z,wの順番に埋めていく。
      // wは今回は使用しないが、配列の順番などを埋めておくといろいろ使えて便利
      posArray[k + 0] = x;
      posArray[k + 1] = y;
      posArray[k + 2] = z;
      posArray[k + 3] = 0;

      // 移動する方向はとりあえずランダムに決めてみる。
      // これでランダムな方向にとぶパーティクルが出来上がるはず。
      velArray[k + 0] = Math.random() * 2 - 1;
      velArray[k + 1] = Math.random() * 2 - 1;
      velArray[k + 2] = Math.random() * 2 - 1;
      velArray[k + 3] = Math.random() * 2 - 1;
    }
  }


  initPosition() {

    const WIDTH = this.params.WIDTH;
    const PARTICLES = this.params.PARTICLES;

    // 最終的に計算された結果を反映するためのオブジェクト。
    // 位置情報はShader側(texturePosition, textureVelocity)
    // で決定されるので、以下のように適当にうめちゃってOK
    const geometry = new THREE.BufferGeometry();

    let positions = new Float32Array(PARTICLES * 3);
    let p = 0;
    for (let i = 0; i < PARTICLES; i++) {
      positions[p++] = 0;
      positions[p++] = 0;
      positions[p++] = 0;
    }

    // uv情報の決定。テクスチャから情報を取り出すときに必要
    var uvs = new Float32Array(PARTICLES * 2);
    p = 0;
    for (let j = 0; j < WIDTH; j++) {
      for (let i = 0; i < WIDTH; i++) {
        uvs[p++] = i / (WIDTH - 1);
        uvs[p++] = j / (WIDTH - 1);
      }
    }

    // attributeをgeometryに登録する
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

    // uniform変数をオブジェクトで定義
    // 今回はカメラをマウスでいじれるように、計算に必要な情報もわたす。
    this.particleUniforms = {
      texturePosition: { value: null },
      textureVelocity: { value: null },
      cameraConstant: { value: this.getCameraConstant() },
    };


    // シェーダーマテリアルを作成
    // これはパーティクルそのものの描写に必要なシェーダー
    const material = new THREE.ShaderMaterial({
      uniforms: this.particleUniforms,
      vertexShader: this.particleVertexShader,
      fragmentShader: this.particleFragmentShader,
    });

    material.extensions.drawBuffers = true;

    const particles = new THREE.Points(geometry, material);

    particles.matrixAutoUpdate = false;
    particles.updateMatrix();

    // シーンに追加
    this.scene.add(particles);
  }


  // カメラオブジェクトからシェーダーに渡したい情報を引っ張ってくる関数
  // カメラからパーティクルがどれだけ離れてるかを計算し、パーティクルの大きさを決定するため。
  getCameraConstant() {
    const DEG2RAD = Math.PI / 180;
    // const RAD2DEG = 180 / Math.PI;
    return this.sizes.height / (Math.tan(DEG2RAD * 0.5 * this.camera.fov) / this.camera.zoom);
  }

}
