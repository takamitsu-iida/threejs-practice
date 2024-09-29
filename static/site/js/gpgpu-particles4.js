import * as THREE from "three";

import Stats from "three/libs/stats.module.js";

// 必要な追加モジュール
// three.js/examples/jsm/misc/GPUComputationRenderer.js
// three.js/examples/jsm/postprocessing/Pass.js
import { GPUComputationRenderer } from "three/libs/misc/GPUComputationRenderer.js";


// 画像サイズに合わせる場合
// const VIEW_WIDTH = 1440;
// const VIEW_HEIGHT = 720;

const VIEW_WIDTH = 640;
const VIEW_HEIGHT = 480;


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
    velocityImage: './static/site/img/wind2.png',
    particleSpeed: 10.0,
    numParticles: 1000,
    dropThreshold: 1000,  // 指定したフレーム数を経過するとランダムな位置に移動
  }

  // velocityImageを読み込んで解析した結果
  imageParams = {
    positions: [],
    colors: [],
    alphas: [],
  };

  textures = {
    wind2: null,
  };

  // シェーダーマテリアルに渡すuniforms
  uniforms = {
    // バックグランドのテクスチャをシェーダーに渡す
    background: { value: null },

    // パーティクルの位置情報が入ったテクスチャをシェーダーに渡す
    texturePosition: { value: null },
  }

  constructor(params = {}) {
    this.params = Object.assign(this.params, params);

    this.init();
  }


  init = async () => {

    // scene, camera, rendererを初期化
    this.initThreejs();

    // stats.jsを初期化
    this.initStatsjs();

    // ローディング画面
    const loadingContainer = document.getElementById('loadingContainer');
    loadingContainer.addEventListener('transitionend', (event) => {
      event.target.remove();
    });

    // awaitして画像の読み込みが終わるのを待つ
    const imageParams = await this.readImage(this.params.velocityImage, VIEW_WIDTH, VIEW_HEIGHT);
    this.imageParams = imageParams;

    // ローディング画面を消す
    const interval = setInterval(() => {
      loadingContainer.classList.add('fadeout');
      clearInterval(interval);
    }, 500);


    return;

    // 画像ファイルをロードする
    // this.initTexture();

    // GPUComputationRendererを初期化
    this.initComputationRenderer();

    // パーティクルを初期化
    this.initParticles();

    // フレーム毎の処理
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

    // カメラ
    this.camera = new THREE.OrthographicCamera(
      -VIEW_WIDTH * 0.5,   // left
      VIEW_WIDTH * 0.5,    // right
      VIEW_HEIGHT * 0.5,   // top
      -VIEW_HEIGHT * 0.5,  // bottom
      0,                   // near
      10                   // far
    );

    // カメラは(x, y)平面の原点に配置、z軸は手前に引く
    this.camera.position.set(0, 0, 1);

    // レンダラ
    // alpha: true はデフォルトのapha値が0.0になる。falseは1.0
    this.renderer = new THREE.WebGLRenderer({ alpha: false, antialias: true });

    // 通常サイズはコンテナに合わせるが、ここでは固定にする
    // this.renderer.setSize(this.sizes.width, this.sizes.height);
    this.renderer.setSize(VIEW_WIDTH, VIEW_HEIGHT);

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);
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

    this.renderParams.delta += this.renderParams.clock.getDelta();
    if (this.renderParams.delta < this.renderParams.interval) {
      return;
    }

    {
      // stats.jsを更新
      this.statsjs.update();

      // パーティクルの位置を更新
      this.updateParticles();

      // 再描画
      this.renderer.render(this.scene, this.camera);
    }

    this.renderParams.delta %= this.renderParams.interval;
  }


  onWindowResize = (event) => {
    this.sizes.width = this.container.clientWidth;
    this.sizes.height = this.container.clientHeight;

    // OrthographicCameraは画面サイズの影響を受けない
  }


  initTexture = () => {
    // ローディング画面を表示
    const loadingContainer = document.getElementById('loadingContainer');

    const loadingManager = new THREE.LoadingManager(() => {

      const interval = setInterval(() => {
        loadingContainer.classList.add('fadeout');
        clearInterval(interval);
      }, 500);

      loadingContainer.addEventListener('transitionend', (event) => {
        event.target.remove();
      });

    });

    const loader = new THREE.TextureLoader(loadingManager);

    loader.load('./static/site/img/wind2.png', (texture) => {
      // 拡大縮小時の補間方法を指定する
      // NearestFilterは最近傍補間、LinearFilterは線形補間
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = THREE.LinearFilter;
      this.textures['wind2'] = texture;

      console.log(texture);
      console.log(texture.image.width, texture.image.height);
    });

  }


  readImage = async (path, width, height, ratio = 1.0) => {

    const promise = new Promise((resolve) => {
      // <img>要素を作成
      const img = new Image();

      // <img src="path">を指定
      img.src = path;
      img.crossOrigin = "Anonymous";

      // ロード完了時の処理
      img.addEventListener('load', () => {

        // canvasを取得
        const canvas = document.createElement("canvas");

        // canvasのサイズを指定
        canvas.width = width;
        canvas.height = height;

        // 2dコンテキストを取得
        const ctx = canvas.getContext("2d");

        // ここでロード開始
        ctx.drawImage(img, 0, 0);

        // 画像をデータとして取得
        const data = ctx.getImageData(0, 0, width, height).data;

        const positions = [];
        const colors = [];
        const alphas = [];

        let count = 0;
        for (let y = 0; y < height; y += ratio) {
          for (let x = 0; x < width; x += ratio) {
            count++;
            const index = (y * width + x) * 4;
            const r = data[index + 0] / 255;
            const g = data[index + 1] / 255;
            const b = data[index + 2] / 255;
            const a = data[index + 3] / 255;

            const pX = x - width / 2;
            const pY = -(y - height / 2);
            const pZ = 0;

            positions.push(pX, pY, pZ);
            colors.push(r, g, b);
            alphas.push(a);
          }
        }

        resolve({ positions, colors, alphas });

      });

    });

    const result = await promise;

    return result;
  };



  // この２つは外からアクセスするので、インスタンス変数にしておく
  computationRenderer;
  positionVariable;

  // 速度の元になるテクスチャ、かつ背景画像になるテクスチャをインスタンス変数にしておく
  velocityTexture;


  initComputationRenderer = () => {

    // この画像が各パーティクルにおける速度・方向を決めることになる
    this.velocityTexture = this.textures['wind2'];

    //
    // GPUComputationRendererを初期化
    //

    const computationRenderer = new GPUComputationRenderer(
      this.params.numParticles,  // width
      1,                         // height
      this.renderer,             // renderer
    );

    // フレームごとにcompute()を実行する必要があるので、外部からアクセスできるようにしておく
    this.computationRenderer = computationRenderer;


    //
    // computationRenderer.createTexture();
    //

    // 想定しているテクスチャの構造
    //
    //   0  1  2  3  4  5  ... numParticles
    //  +--+--+--+--+--+--+--+
    //  |  |  |  |  |  |  |  |
    //  +--+--+--+--+--+--+--+

    // 位置情報を格納するテクスチャを作成して、
    const initialPositionTexture = computationRenderer.createTexture();

    // テクスチャに座標情報を埋め込む
    {
      const positionArray = initialPositionTexture.image.data;

      for (let i = 0; i < this.params.numParticles; i++) {
        // i番目のパーティクルに関して、

        // 配列のインデックスはvec4を格納するので4倍する
        const index = i * 4;

        positionArray[index + 0] = Math.random() * VIEW_WIDTH - VIEW_WIDTH / 2;    // X座標
        positionArray[index + 1] = Math.random() * VIEW_HEIGHT - VIEW_HEIGHT / 2;  // Y座標
        positionArray[index + 2] = Math.random() * this.params.dropThreshold;      // age
        positionArray[index + 3] = 0.0;                                            // velocity
      }
    }

    // 変数に紐づけるフラグメントシェーダー
    const texturePositionShader = /* glsl */`

      // 速度を計算する元画像テクスチャはuniformで受け取る
      uniform sampler2D velocityTexture;

      // パーティクルの移動速度をuniformで受け取る
      uniform float particleSpeed;

      // パーティクルの生存期間をuniformで受け取る
      uniform float dropThreshold;

      float rand(vec2 p) {
        return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453);
      }

      vec2 _getVelocityFromTexture(vec2 position) {
        vec2 uv = position / vec2(${VIEW_WIDTH}.0, ${VIEW_HEIGHT}.0);
        vec4 textureValue = texture2D(velocityTexture, uv);
        return vec2(textureValue.r / 255.0, textureValue.g / 255.0);
      }


      vec2 getVelocityFromTexture(vec2 pos) {
        // float xPx = 1.0 / ${VIEW_WIDTH}.0;
        // float yPx = 1.0 / ${VIEW_HEIGHT}.0;
        float xPx = 1.0 / 1440.0;
        float yPx = 1.0 / 720.0;

        vec2 centerUv = vec2(pos.x / resolution.x + 0.5, pos.y / resolution.y + 0.5);

        vec2 center = texture2D(velocityTexture, centerUv).rg;
        vec2 left = texture2D(velocityTexture, centerUv - vec2(xPx, 0.0)).rg;
        vec2 top = texture2D(velocityTexture, centerUv + vec2(0.0, yPx)).rg;
        vec2 right = texture2D(velocityTexture, centerUv + vec2(xPx, 0.0)).rg;
        vec2 bottom = texture2D(velocityTexture, centerUv - vec2(0.0, yPx)).rg;

        vec2 avg = (center + left + top + right + bottom) * 0.2;

        // avg = avg - vec2(0.49803922);
        // avg = avg - vec2(0.5);

        return avg;
      }



      void main() {

        // UV座標を取得
        vec2 uv = gl_FragCoord.xy / resolution.xy;

        // 位置情報をテクスチャ texturePosition から取得
        // texturePosition は addVariable() で登録した変数名

        // 関数texture2D(sampler2D, vec2)はUV座標vec2を元に情報を取り出す
        vec4 texturePositionValue = texture2D(texturePosition, uv);

        // 取り出したvec4の使い方は(x, y, age, velocity)と定義している

        // 現在のageを取得
        float age = texturePositionValue.z;

        // 新しい位置
        vec2 newPosition;

        // ageがdropThresholdを超過していたらランダムな位置に移動
        if (age > dropThreshold) {
          newPosition = vec2(
            rand(texturePositionValue.xy) * ${VIEW_WIDTH}.0 - ${VIEW_WIDTH}.0 / 2.0,
            rand(texturePositionValue.yx) * ${VIEW_HEIGHT}.0 - ${VIEW_HEIGHT}.0 / 2.0
          );
          gl_FragColor = vec4(newPosition, 0.0, 0.0);
          return;
        }

        // ageがdropThresholdを超過していない場合は、速度を取得して新しい場所に移動

        // 現在のXY座標を取得
        vec2 position = texturePositionValue.xy;


        // 現在の速度絶対値を取得
        float absVelocity = texturePositionValue.w;

        // ageを進める
        float newAge = age + rand(vec2(absVelocity, age));

        // 現在位置に対応する速度をテクスチャから取得
        vec2 velocityTextureValue = getVelocityFromTexture(position);

        newPosition = position + velocityTextureValue * particleSpeed;

        gl_FragColor = vec4(newPosition, newAge, length(velocityTextureValue));
        // gl_FragColor = vec4(velocityTextureValue, age, length(velocityTextureValue));

      }
    `;


    //
    // computationRenderer.addVariable();
    //

    // テクスチャと、それに対応するシェーダを指定して、変数 "texturePosition" を追加する
    // シェーダーの中で texture2D( texturePosition, uv ) のように参照できるようになる

    const positionVariable = computationRenderer.addVariable(
      "texturePosition",      // シェーダーの中で参照する名前
      texturePositionShader,  // シェーダーコード
      initialPositionTexture  // 最初に作ったテクスチャを渡す
    );

    // uniformを登録
    positionVariable.material.uniforms = {
      velocityTexture: { value: this.velocityTexture },
      particleSpeed: { value: this.params.particleSpeed },
      dropThreshold: { value: this.params.dropThreshold },
    };

    // 戻り値は getCurrentRenderTarget() でテクスチャを取り出すのに必要なのでインスタンス変数に保存しておく
    this.positionVariable = positionVariable;

    //
    // computationRenderer.setVariableDependencies();
    //

    // 追加した変数の依存関係を設定する

    // フラグメントシェーダーの中でテクスチャはtexturePositionだけなので、このように設定すればよい
    computationRenderer.setVariableDependencies(positionVariable, [positionVariable]);

    //
    // computationRenderer.init();
    //

    const error = computationRenderer.init();
    if (error !== null) {
      console.error(error);
      new Error(error);
    }

  }



  initParticles = () => {

    // パーティクルの数
    const numParticles = this.params.numParticles;

    // パーティクルの位置を格納する配列を初期化
    // positionアトリビュートに設定する
    const positions = new Float32Array(numParticles * 3);

    // パーティクルの位置は原点に設定(フレームごとにシェーダーで更新するので適当でよい)
    for (let i = 0; i < numParticles; i++) {
      // i番目のパーティクルに関して、位置情報を設定
      const index = i * 3;
      positions[index + 0] = 0.0;
      positions[index + 1] = 0.0;
      positions[index + 2] = 0.0;
    }

    // アトリビュート uv を設定するための配列を初期化
    //
    // ★★★ ここ超重要！ ★★★
    // UV座標を設定することで、GPUComputationRendererで作成した計算用テクスチャの情報を
    // 自分自身のUV座標で取り出すことができる

    //   0  1  2  3  4  5  ... numParticles
    //  +--+--+--+--+--+--+--+
    //  |  |  |  |  |  |  |  |
    //  +--+--+--+--+--+--+--+

    // U座標は、パーティクルの番号を 0.0 ~ 1.0 の範囲で正規化する
    // V座標は、常に0.0でよい

    const uvs = new Float32Array(numParticles * 2);

    for (let i = 0; i < numParticles; i++) {
      // i番目のパーティクルに関してUV座標を設定
      const index = i * 2;
      uvs[index + 0] = i / (numParticles - 1);  // iは0始まりなので、i / (numParticles - 1)で正規化
      uvs[index + 1] = 0.0;
    }

    // ジオメトリを作成
    const geometry = new THREE.BufferGeometry();

    // ジオメトリにpositionアトリビュートを設定する
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

    // ジオメトリにuvアトリビュートを設定する
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))

    // シェーダーマテリアルに渡すuniformsを設定
    this.uniforms.background.value = this.velocityTexture;
    this.uniforms.texturePosition.value = this.computationRenderer.getCurrentRenderTarget(this.positionVariable).texture;

    // シェーダーマテリアルを作成
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,

      uniforms: this.uniforms,

      // バーテックステクスチャはUV座標をフラグメントシェーダーに渡すだけ
      vertexShader: /*glsl*/`

        // 位置情報が書き込まれているテクスチャtexturePositionはuniformで渡す必要がある
        // フレームごとにcompute()して書き換わるので、その都度uniformも更新する
        uniform sampler2D texturePosition;

        void main() {
          // 位置をテクスチャから取得する
          vec2 pos = texture2D(texturePosition, uv).xy;

          // 取り出した位置を加算して出力
          gl_Position =  projectionMatrix * modelViewMatrix * vec4(position + vec3(pos, 0.0), 1.0);

          gl_PointSize = 5.0;
        }
      `,

      fragmentShader: /*glsl*/`
        void main() {
          gl_FragColor = vec4(0.0, 1.0, 0.0, 1.0);
        }
      `,
    });

    // メッシュ化して
    const mesh = new THREE.Points(geometry, material);

    // シーンに追加
    this.scene.add(mesh);
  }

  updateParticles = () => {
    this.computationRenderer.compute();
    this.uniforms.texturePosition.value = this.computationRenderer.getCurrentRenderTarget(this.positionVariable).texture;
  }

}
