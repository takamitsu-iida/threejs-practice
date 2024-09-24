import * as THREE from "three";

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


  gpuParticle;

  constructor(params) {
    this.params = Object.assign(this.params, params);

    // scene, camera, rendererを初期化
    this.initThreejs();

    // stats.jsを初期化
    this.initStatsjs();

    // パーティクルを初期化
    this.initParticles();

    // フレーム毎の処理
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
      -VIEW_WIDTH * 0.5,   // left
      VIEW_WIDTH * 0.5,    // right
      VIEW_HEIGHT * 0.5,   // top
      -VIEW_HEIGHT * 0.5,  // bottom
      0,                   // near
      10                   // far
    );
    this.camera.position.set(0, 0, 1);

    // レンダラ
    // 複数のテクスチャを重ね合わせるためには、透過を有効にする必要がある
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });

    // 通常サイズはコンテナに合わせるが、ここでは固定にする
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

  render = () => {
    // 再帰処理
    requestAnimationFrame(this.render);

    this.renderParams.delta += this.renderParams.clock.getDelta();
    if (this.renderParams.delta < this.renderParams.interval) {
      return;
    }

    {
      // stats.jsを更新
      this.statsjs.update();

      // gpuParticleの計算処理（オフスクリーンのテクスチャを更新）
      this.gpuParticle.render();

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

    // 画像ファイルを元にテクスチャを作成
    // この画像が各パーティクルにおける速度・方向を決めることになる
    const velocityTexture = new THREE.TextureLoader().load('./static/site/img/wind2.png');
    velocityTexture.magFilter = THREE.NearestFilter;

    // レンダラとこの画像を渡して、パーティクルを描画したテクスチャを作る
    this.gpuParticle = new GpuParticle(
      this.renderer,
      velocityTexture,
      {
        width: VIEW_WIDTH,
        height: VIEW_HEIGHT,
      },
    )

    // パーティクルを描画したテクスチャを取得する
    // このテクスチャはrender()を呼ぶたびに更新される
    const particleTexture = this.gpuParticle.getParticleTexture();

    // この2枚のテクスチャを合成して画面に表示する

    // プレーンジオメトリを作成
    const geometry = new THREE.PlaneGeometry(VIEW_WIDTH, VIEW_HEIGHT);

    // シェーダーマテリアルを作成
    const material = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      transparent: true,

      uniforms: {
        // バックグランドのテクスチャをシェーダーに渡す
        backgroundTexture: { value: velocityTexture },

        // パーティクルを描画したオフスクリーンテクスチャをシェーダーに渡す
        particleTexture: { value: particleTexture },
      },

      // バーテックステクスチャはUV座標をフラグメントシェーダーに渡すだけ
      vertexShader: /*glsl*/`
        varying vec2 vUv;
        void main() {
          gl_Position =  projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          vUv = uv;
        }
      `,

      // フラグメントシェーダーで2枚のテクスチャを合成する
      fragmentShader: /*glsl*/`
        // sampler2Dは2次元テクスチャを示す型で、テクスチャの受け渡しに使う
        uniform sampler2D backgroundTexture;
        uniform sampler2D particleTexture;

        // バーテックスシェーダから渡されたUV座標
        varying vec2 vUv;

        void debugDrawParticle() {
          // パーティクルだけが白、背景は黒
          vec4 particleColor = texture2D(particleTexture, vUv);
          gl_FragColor = vec4(particleColor.rgb, 1.0);
        }

        void debugDrawBackground() {
          vec4 backgroundColor = texture2D(backgroundTexture, vUv);
          gl_FragColor = vec4(backgroundColor.rgb, 1.0);
        }

        void main() {

          // 単純に順番に描画しても、後から描画したものしか見えない
          // debugDrawBackground();
          debugDrawParticle();
          return;

          // 関数 texture2D(sampler2D, vec2) はUV座標vec2の場所に対応した色情報を取り出す

          // このUV座標における背景テクスチャの色
          vec4 backgroundColor = texture2D(backgroundTexture, vUv);

          // このUV座標におけるパーティクルテクスチャの色
          vec4 particleColor = texture2D(particleTexture, vUv);

          // mix(x, y, a) は 線形補間 x(1-a)+ y*a を返す関数
          vec3 mixedColor = mix(backgroundColor.rgb, particleColor.rgb, particleColor.a);

          // 結果出力
          gl_FragColor = vec4(mixedColor, 1.0);
        }
      `,
    });

    // メッシュ化して
    const mesh = new THREE.Mesh(
      geometry,
      material,
    );

    // シーンに追加
    this.scene.add(mesh);
  }

}


class GpuParticle {

  // VertexTextureクラスのインスタンス
  // compute()を呼ぶと新しい頂点座標が計算される
  vertexTexture;

  // パーティクルをオフスクリーンで描画するレンダラ
  particleRenderer;

  // rendererは画面表示用のレンダラ
  // velocityTextureはwind2.pngをテクスチャにしたもので、パーティクルの速度・方向を決めるもの
  // RGBA値のうち、意味のある値が入っているのはRとGだけ
  // Rの0-255でx方向の風速を、Gでy方向の風速をそれぞれ表現
  // 0は-1, 255は1
  // BはGと同じ値
  // 画像で赤っぽいところは右方向への風が、青っぽいところには上方向への風が吹いている
  constructor(renderer, velocityTexture, options = {}) {

    // オフスクリーンレンダリング用のWebGLRenderTargetやDataTextureを作成するために使う
    const width = options.width || 1024;
    const height = options.height || 1024;

    this.vertexTexture = new VertexTexture(
      renderer,
      velocityTexture,
      {
        width,
        height,
        particleSpeed: options.particleSpeed || 16,
        particleCount: options.particleCount || 4,
        dropFactor: options.dropFactor || 200,
        repeat: options.repeat || true,
      }
    );

    this.particleRenderer = new ParticleRenderer(
      renderer,
      this.vertexTexture.getTexture(),
      {
        width,
        height,
        particleSize: options.particleSize || 5,
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
    // 計算して
    this.vertexTexture.compute();

    // オフスクリーンでレンダリング
    this.particleRenderer.render();
  }

}


// パーティクルの位置を計算するクラス
export class VertexTexture {

  // GPUComputationRendererのインスタンス
  gpuRenderer;

  // gpuRenderer.addVariable()の戻り値
  computationVariable;

  // gpuRenderer.createTexture()の戻り値
  vertexTexture;

  // wind2.png をテクスチャにしたもの
  velocityTexture;


  // rendererは画面表示用のレンダラ
  // velocityTextureはwind2.pngをテクスチャにしたもので、パーティクルの速度・方向を決める
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

    console.log(`width=${width}, height=${height}, particleSpeed=${particleSpeed}, particleCount=${particleCount}, dropFactor=${dropFactor}, repeat=${repeat}`);

    this.gpuRenderer = new GPUComputationRenderer(
      particleCount,  // width, Default 64
      particleCount,  // height, Default 64
      renderer,
    );

    // テクスチャを作成
    // width * height個のvec4がフラットな配列として作られると思えばいい
    // Float32Arrayの長さは width * heigt * 4 になる
    this.vertexTexture = this.gpuRenderer.createTexture();

    // テクスチャを初期化
    // 頂点の位置をランダムに設定してテクスチャに保存
    // テクスチャに保存するvec4の使い方は(x, y, age, abs(velocity))と定義する
    const imageDataArray = this.vertexTexture.image.data;
    for (let i = 0; i < imageDataArray.length; i += 4) {
      imageDataArray[i + 0] = (Math.random() - 0.5) * width;  // x
      imageDataArray[i + 1] = (Math.random() - 0.5) * height; // y
      imageDataArray[i + 2] = Math.random() * dropFactor;     // age
      imageDataArray[i + 3] = 0;                              // velocity
    }

    // console.log(this.vertexTexture.image.data);

    // 変数を定義する
    // 変数にはそれを取得するためのフラグメントシェーダーを紐づける
    this.computationVariable = this.gpuRenderer.addVariable(

      // 変数名
      'computationTexture',

      // フラグメントシェーダーを使ってテクスチャからデータを取り出す
      /*glsl*/`
      precision highp float;

      // sampler2Dは2次元テクスチャを示す型
      uniform sampler2D velocityTexture;

      uniform float particleSpeed;
      uniform float dropFactor;
      uniform bool repeat;

      // float rand(vec2 p){
      //    return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453);
      // }

      highp float rand(vec2 co) {
        highp float a = 12.9898;
        highp float b = 78.233;
        highp float c = 43758.5453;
        highp float dt= dot(co.xy ,vec2(a,b));
        highp float sn= mod(dt,3.14);
        return fract(sin(sn) * c);
      }

      vec3 getVelocity(vec2 pos) {

        // vec4 texValue = texture2D(velocityTexture, pos.xy);
        // return vec3(texValue.r, texValue.g, 0.0) - vec3(vec2(0.49803922), 0.0);
        // vec2 distVec = vec2(texValue.r, texValue.g) * 2.0 - vec2(1.0);
        // return vec3(distVec, 0.5);

        float xPx = 1.0 / ${width}.0;
        float yPx = 1.0 / ${height}.0;

        // なんで0.5足すんだろう？
        // vec2 centerUv = vec2(pos.x / ${width}.0 + 0.5, pos.y / ${height}.0 + 0.5);
        vec2 centerUv = vec2(pos.x / ${width}.0 , pos.y / ${height}.0 );

        // 関数texture2D(sampler2D, vec2)はUV座標vec2を元にRGBA情報を取り出す
        vec3 centerRGB = texture2D(velocityTexture, centerUv).rgb;

        vec3 leftRGB = texture2D(velocityTexture, centerUv - vec2(xPx, 0.0)).rgb;
        vec3 topRGB = texture2D(velocityTexture, centerUv + vec2(0.0, yPx)).rgb;
        vec3 rightRGB = texture2D(velocityTexture, centerUv + vec2(xPx, 0.0)).rgb;
        vec3 bottomRGB = texture2D(velocityTexture, centerUv - vec2(0.0, yPx)).rgb;

        vec3 avg = (centerRGB + leftRGB + topRGB + rightRGB + bottomRGB) * 0.2 - vec3(vec2(0.49803922), 0.0);

        return avg;
      }

      void main()	{

        // UV座標を取得
        vec2 uv = gl_FragCoord.xy / resolution.xy;

        // 関数texture2D(sampler2D, vec2)はUV座標vec2を元に情報を取り出す
        vec4 textureValue = texture2D(computationTexture, uv);

        // このvec4の使い方は(x, y, age, velocity)と定義したので、zはageになる
        float age = textureValue.z;
        age += 1.0;

        // 一定時間を経過したらランダムな位置に移動
        if (age > dropFactor) {
          vec2 random = vec2((rand(textureValue.xy) - 0.5) * ${width}.0, (rand(textureValue.yx) - 0.5) * ${height}.0);
          gl_FragColor = vec4(random, 0.0, 0.0);
          return;
        }

        // 速度を計算
        vec3 velocity = getVelocity(textureValue.xy);

        // 速度の大きさを計算
        float absVelocity = length(velocity.xy);

        vec2 newPosition = textureValue.xy + velocity.xy * particleSpeed;

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

        // (x, y, age, velocity)を保存
        gl_FragColor = vec4(newPosition, age, absVelocity);

      }
      `,
      // このテクスチャからデータを読む
      this.vertexTexture,
    );

    console.log(this.computationVariable);

    // uniformを登録
    this.computationVariable.material.uniforms = {
      velocityTexture: { value: velocityTexture },
      particleSpeed: { value: particleSpeed },
      dropFactor: { value: dropFactor },
      repeat: { value: repeat },
    };

    // 変数の依存関係を設定、別のテクスチャから値を取りたいならここで複数並べる
    this.gpuRenderer.setVariableDependencies(this.computationVariable, [this.computationVariable]);

    const error = this.gpuRenderer.init();
    if (error !== null) {
      console.error(error);
    }

    console.log(this.vertexTexture);

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

    const {
      width,
      height,
      particleSize,
      trajectoryFactor
    } = options;

    console.log(`width=${width}, height=${height}, particleSize=${particleSize}, trajectoryFactor=${trajectoryFactor}`);

    // オフスクリーンレンダリング用のターゲットを３個作成

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

    // currとprevを入れ替えるための一時変数
    this.renderTargetSwap = this.prevRenderTarget;

    // 描画先のシーンとカメラ
    this.singleScene = new THREE.Scene();

    this.camera = new THREE.OrthographicCamera(
      - width / 2,
      width / 2,
      height / 2,
      -height / 2,
      0,
      10
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
        // sampler2Dは2次元テクスチャを示す型
        uniform sampler2D posTexture;
        uniform float particleSize;

        varying vec4 vPos;

        void main() {

          // 関数texture2D(sampler2D, vec2)はUV座標vec2を元に色情報を取り出す
          // xPost, yPost, age, velocity
          vPos = texture2D(posTexture, uv);

          gl_PointSize = particleSize;
          gl_Position =  projectionMatrix * modelViewMatrix * vec4(vPos.xy, 0.0, 1.0);
        }
      `,

      fragmentShader: /*glsl*/`
        varying vec4 vPos;

        void main() {
          float f = length( gl_PointCoord - vec2( 0.5, 0.5 ) );
          if ( f > 0.3 ) { discard; }

          vec3 slowest = vec3(0.0, 0.0, 0.0);
          // vec3 slowest = vec3(1.0, 1.0, 1.0);
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
          // sampler2Dは2次元テクスチャを示す型
          uniform sampler2D currTexture;
          uniform sampler2D prevTexture;

          uniform float trajectoryFactor;
          varying vec2 vUv;

          void main() {
            // 関数texture2D(sampler2D, vec2)はUV座標vec2を元に色情報を取り出す
            vec4 curr = texture2D(currTexture, vUv);
            vec4 prev = texture2D(prevTexture, vUv) - vec4(vec3(0.0), trajectoryFactor);
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

    // swap curr and prev
    this.renderTargetSwap = this.currRenderTarget;
    this.currRenderTarget = this.prevRenderTarget;
    this.prevRenderTarget = this.renderTargetSwap;
  }
}
