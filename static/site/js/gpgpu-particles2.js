import * as THREE from "three";

// stats.js
import Stats from "three/libs/stats.module.js";

// 必要な追加モジュール
// three.js/examples/jsm/misc/GPUComputationRenderer.js
// three.js/examples/jsm/postprocessing/Pass.js

import { GPUComputationRenderer } from "three/libs/misc/GPUComputationRenderer.js";

// 参照元
// https://github.com/Kanahiro/three-gpu-particle



// TODO: wind.pngを消す


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


  gpuParticle;

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
      VIEW_WIDTH * 0.5 * (-1),
      VIEW_WIDTH * 0.5,
      VIEW_HEIGHT * 0.5,
      VIEW_HEIGHT * 0.5 * (-1),
      1000 * (-1),
      10000
    );
    this.camera.position.set(0, 0, 1);

    // レンダラ
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    // 通常はコンテナのサイズに合わせるが、ここでは固定にする
    // this.renderer.setSize(this.sizes.width, this.sizes.height);
    this.renderer.setSize(VIEW_WIDTH, VIEW_HEIGHT);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
        this.gpuParticle.render();
      }

      // 再描画
      this.renderer.render(this.scene, this.camera);
    }

    this.renderParams.delta %= this.renderParams.interval;
  }


  onWindowResize = (event) => {
    this.sizes.width = this.container.clientWidth;
    this.sizes.height = this.container.clientHeight;

    // this.camera.aspect = this.sizes.width / this.sizes.height;
    // this.camera.updateProjectionMatrix();

    // this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // this.renderer.setSize(this.sizes.width, this.sizes.height);
  }


  // パーティクルの初期化
  initParticles() {

    const velocityTexture = new THREE.TextureLoader().load('./static/site/img/wind.png');
    velocityTexture.magFilter = THREE.NearestFilter;

    this.gpuParticle = new GpuParticle(this.renderer, velocityTexture)

    const material = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      transparent: true,
      uniforms: {
        backgroundTexture: { value: velocityTexture },
        particleTexture: { value: this.gpuParticle.getParticleTexture() },
      },
      vertexShader: /*glsl*/`
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position =  projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /*glsl*/`
        uniform sampler2D backgroundTexture;
        uniform sampler2D particleTexture;
        varying vec2 vUv;
        void main() {
          vec4 backgroundColor = texture2D(backgroundTexture, vUv);
          vec4 particleColor = texture2D(particleTexture, vUv);
          gl_FragColor = vec4(mix(backgroundColor.rgb, particleColor.rgb, particleColor.a), 1.0);
        }
      `,
    });

    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(VIEW_WIDTH, VIEW_HEIGHT),
      material,
    );

    this.scene.add(mesh);
  }

}


class GpuParticle {

  vertexTexture;
  particleRenderer;

  // velocityTextureはwind.png
  constructor(renderer, velocityTexture, options = {}) {

    const width = options.width || VIEW_WIDTH;
    const height = options.height || VIEW_HEIGHT;

    this.vertexTexture = new VertexTexture(
      renderer,
      velocityTexture,
      {
        width,
        height,
        particleSpeed: options.particleSpeed || 2,
        particleCount: options.particleCount || 64,
        dropFactor: options.dropFactor || 50,
        repeat: options.repeat || false,
      }
    );

    this.particleRenderer = new ParticleRenderer(
      renderer,
      this.vertexTexture.getTexture(),
      {
        width,
        height,
        particleSize: options.particleSize || 3,
        trajectoryFactor: options.trajectoryFactor || 0.01,
      },
    );

  }

  setVelocityTexture(texture) {
    this.vertexTexture.updateVelocityTexture(texture);
  }

  setParticleSpeed(speed) {
    this.vertexTexture.updateParticleSpeed(speed);
  }

  getParticleTexture() {
    return this.particleRenderer.getTexture();
  }

  render() {
    this.vertexTexture.compute();
    this.particleRenderer.render();
  }

}


export class VertexTexture {

  // GPUComputationRendererのインスタンス
  gpuRenderer;

  // gpuRenderer.addVariable()の戻り値
  computationVariable;

  // gpuRenderer.createTexture()の戻り値
  vertexTexture;

  // 引数で渡された wind.png
  velocityTexture;


  constructor(renderer, velocityTexture, options = {}) {

    this.velocityTexture = velocityTexture;

    const {
      width,
      height,
      particleSpeed,
      particleCount,
      dropFactor,
      repeat,
    } = options;


    this.gpuRenderer = new GPUComputationRenderer(
      particleCount,
      particleCount,
      renderer,
    );

    this.vertexTexture = this.gpuRenderer.createTexture();

    // 頂点の位置をランダムに初期化
    // vec4の使い方は(x, y, age, velocity)と定義する
    for (let i = 0; i < this.vertexTexture.image.data.length / 4; i++) {
      this.vertexTexture.image.data[i * 4 + 0] = (Math.random() - 0.5) * width;  // x
      this.vertexTexture.image.data[i * 4 + 1] = (Math.random() - 0.5) * height; // y
      this.vertexTexture.image.data[i * 4 + 2] = Math.random() * dropFactor;     // age
      this.vertexTexture.image.data[i * 4 + 3] = 0;                              // velocity
    }

    this.computationVariable = this.gpuRenderer.addVariable(
      'computationTexture',
      /*glsl*/`
      precision highp float;

      uniform sampler2D velocityTexture;
      uniform float particleSpeed;
      uniform float dropFactor;
      uniform bool repeat;

      float rand(vec2 p){
          return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453);
      }

      vec3 getVelocity(vec2 pos) {
          float xPx = 1.0 / ${width}.0;
          float yPx = 1.0 / ${height}.0;
          vec2 centerUv = vec2(pos.x / ${width}.0 + 0.5, pos.y / ${height}.0 + 0.5);
          vec3 center = texture2D(velocityTexture, centerUv).rgb;
          vec3 left = texture2D(velocityTexture, centerUv - vec2(xPx, 0.0)).rgb;
          vec3 top = texture2D(velocityTexture, centerUv + vec2(0.0, yPx)).rgb;
          vec3 right = texture2D(velocityTexture, centerUv + vec2(xPx, 0.0)).rgb;
          vec3 bottom = texture2D(velocityTexture, centerUv - vec2(0.0, yPx)).rgb;

          vec3 avg = (center + left + top + right + bottom) * 0.2 - vec3(vec2(0.49803922), 0.0);

          return avg;
      }

      void main()	{

          vec2 uv = gl_FragCoord.xy / resolution.xy;
          vec4 position = texture2D(computationTexture, uv);

          float age = position.z;

          vec3 velocity = getVelocity(position.xy);
          if (age > dropFactor) {
            // reset particle position
            vec2 random = vec2((rand(position.xy) - 0.5) * ${width}.0, (rand(position.yx) - 0.5) * ${height}.0);
            gl_FragColor = vec4(random, 0.0, 0.0);
          } else {
            float absVelocity = length(velocity.xy);
            vec2 newPosition = position.xy + velocity.xy * particleSpeed;
            if (repeat) {
              if (newPosition.x < -0.5 * ${width}.0) {
                newPosition.x += 1.0 * ${width}.0;
              } else if (0.5 * ${width}.0 < newPosition.x) {
                newPosition.x -= 1.0 * ${width}.0;
              }
              if (newPosition.y < -0.5 * ${height}.0) {
                newPosition.y += 1.0 * ${height}.0;
              } else if (0.5 * ${height}.0 < newPosition.y) {
                newPosition.y -= 1.0 * ${height}.0;
              }
            }
            gl_FragColor = vec4(newPosition, age + rand(vec2(absVelocity, age)), absVelocity);
          }
      }
      `,
      this.vertexTexture,
    );

    this.computationVariable.material.uniforms = {
      velocityTexture: { value: this.velocityTexture },
      particleSpeed: { value: particleSpeed },
      dropFactor: { value: dropFactor },
      repeat: { value: repeat },
    };

    this.gpuRenderer.setVariableDependencies(this.computationVariable, [
      this.computationVariable,
    ]);

    this.gpuRenderer.init();
  }

  getTexture() {
    return this.gpuRenderer.getCurrentRenderTarget(this.computationVariable).texture;
  }

  updateVelocityTexture(texture) {
    this.computationVariable.material.uniforms.velocityTexture.value = texture;
  }

  updateParticleSpeed(speed) {
    this.computationVariable.material.uniforms.particleSpeed.value = speed;
  }

  updateDropFactor(dropFactor) {
    this.computationVariable.material.uniforms.dropFactor.value = dropFactor;
  }

  compute() {
    this.gpuRenderer.compute();
  }
}



class ParticleRenderer {

  renderer;

  vertexTexture;

  singleRenderTarget;

  currRenderTarget;
  prevRenderTarget;
  renderTargetSwap;

  camera;
  singleScene;
  singleMaterial;
  mixScene;
  mixMesh;

  constructor(renderer, vertexTexture, options = {}) {
    this.renderer = renderer;
    this.vertexTexture = vertexTexture;

    const { width, height, particleSize, trajectoryFactor } = options;

    this.singleRenderTarget = new THREE.WebGLRenderTarget(
      width,
      height,
      {
        magFilter: THREE.LinearFilter,
        minFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
      });

    this.currRenderTarget = new THREE.WebGLRenderTarget(
      width,
      height,
      {
        magFilter: THREE.LinearFilter,
        minFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
      });

    this.prevRenderTarget = new THREE.WebGLRenderTarget(
      width,
      height,
      {
        magFilter: THREE.LinearFilter,
        minFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
      }
    );

    this.renderTargetSwap = this.prevRenderTarget;

    this.singleScene = new THREE.Scene();

    this.camera = new THREE.OrthographicCamera(
      width / 2 * (-1),
      width / 2,
      height / 2,
      height / 2 * (-1),
      0,
    );

    const geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array(width * height * 3);
    const uv = new Float32Array(width * height * 2);
    let p = 0;
    for (var j = 0; j < height; j++) {
      for (var i = 0; i < width; i++) {
        uv[p++] = i / (width - 1);
        uv[p++] = j / (height - 1);
      }
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));

    this.singleMaterial = new THREE.ShaderMaterial({
      uniforms: {
        posTexture: { value: null },
        prevTexture: { value: null },
        particleSize: { value: particleSize },
      },
      vertexShader: /*glsl*/`
        uniform sampler2D posTexture;
        uniform float particleSize;
        varying vec2 vUv;
        varying vec4 vPos;

        void main() {
          vUv = uv;
          vPos = texture2D(posTexture, vUv); // xPost, yPost, age, velocity
          gl_PointSize = particleSize;
          gl_Position =  projectionMatrix * modelViewMatrix * vec4(vPos.xy, 0.0, 1.0);
        }
        `,
      fragmentShader: /*glsl*/`
        varying vec4 vPos;
        void main() {
          float f = length( gl_PointCoord - vec2( 0.5, 0.5 ) );
          if ( f > 0.3 ) { discard; }

          vec3 slowest = vec3(1.0, 1.0, 1.0);
          vec3 fastest = vec3(1.0, 1.0, 1.0);
          gl_FragColor = vec4(mix(slowest, fastest, vPos.w * 3.0), 1.0);
        }
      `,
    });

    const points = new THREE.Points(geometry, this.singleMaterial);
    this.singleScene.add(points);

    this.mixMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.ShaderMaterial({
        uniforms: {
          currTexture: { value: null },
          prevTexture: { value: null },
          trajectoryFactor: { value: trajectoryFactor },
        },
        vertexShader: /*glsl*/`
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
          }
          `,
        fragmentShader: /*glsl*/`
          uniform sampler2D currTexture;
          uniform sampler2D prevTexture;
          uniform float trajectoryFactor;
          varying vec2 vUv;

          void main() {
            vec4 curr = texture2D( currTexture, vUv );
            vec4 prev = texture2D( prevTexture, vUv ) - vec4(vec3(0.0), trajectoryFactor);
            gl_FragColor = curr + prev;
          }
        `,
      }),
    );

    this.mixScene = new THREE.Scene();

    this.mixScene.add(this.mixMesh);
  }

  updateVertexTexture(texture) {
    this.vertexTexture = texture;
  }

  getTexture() {
    return this.currRenderTarget.texture;
  }

  render() {
    // update vertices
    this.singleMaterial.uniforms.posTexture.value = this.vertexTexture;

    // render current vertices
    this.renderer.setRenderTarget(this.singleRenderTarget);
    this.renderer.render(this.singleScene, this.camera);
    this.renderer.setRenderTarget(null);

    // overlay two texture as a gradient: current vertieces and vertices 1-frame ago
    this.mixMesh.material.uniforms.currTexture.value = this.singleRenderTarget.texture;
    this.mixMesh.material.uniforms.prevTexture.value = this.prevRenderTarget.texture;

    this.renderer.setRenderTarget(this.currRenderTarget);
    this.renderer.render(this.mixScene, this.camera);
    this.renderer.setRenderTarget(null);

    // swap
    this.renderTargetSwap = this.currRenderTarget;
    this.currRenderTarget = this.prevRenderTarget;
    this.prevRenderTarget = this.renderTargetSwap;
  }
}
