import * as THREE from "three";
import { OrbitControls } from "three/controls/OrbitControls.js";

// stats.js
import Stats from "three/libs/stats.module.js";

// 必要な追加モジュール
// three.js/examples/jsm/misc/GPUComputationRenderer.js
// three.js/examples/jsm/postprocessing/Pass.js

import { GPUComputationRenderer, Variable } from "three/libs/misc/GPUComputationRenderer.js";

// 参照元
// https://github.com/Kanahiro/three-gpu-particle


const VIEW_WIDTH = 800;
const VIEW_HEIGHT = 400;


export class Main {

  container;

  sizes = {
    width: 0,
    height: 0
  }

  scene;
  camera;
  renderer;

  statsjs;

  renderParams = {
    clock: new THREE.Clock(),
    delta: 0,
    interval: 1 / 30,  // = 30fps
  }

  params = {
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

    // カメラ
    this.camera = new THREE.OrthographicCamera(
      -1 * VIEW_WIDTH * 0.5,
      VIEW_WIDTH * 0.5,
      VIEW_HEIGHT * 0.5,
      -1 * VIEW_HEIGHT * 0.5,
      -1 * 1000,
      10000
    );
    this.camera.position.set(0, 0, 1);

    // レンダラ
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000);
    this.container.appendChild(this.renderer.domElement);

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

      //
      // gpgpuでの描画処理
      //
      {



      }

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



}
