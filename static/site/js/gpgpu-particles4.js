import * as THREE from "three";

import Stats from "three/libs/stats.module.js";

// 必要な追加モジュール
// three.js/examples/jsm/misc/GPUComputationRenderer.js
// three.js/examples/jsm/postprocessing/Pass.js
import { GPUComputationRenderer } from "three/libs/misc/GPUComputationRenderer.js";


// やりたいことはこれだけど、ソースコードを読んでも難しすぎて分からないので、簡単なやり方で実装する
// https://qiita.com/Kanahiro/items/8927619c64831972c1d2


export class Main {

  container;

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
    velocityImagePath: './static/site/img/wind2.png',  // 速度の元になる画像のパス
    velocityImage: null,  // 画像をダウンロードしたImage()オブジェクト

    width: 1024,    // 描画する幅
    height: 0,     // アスペクト比を維持して元画像をリサイズして自動調整する

    particleSpeed: 20.0,  // パーティクルの移動速度、経験則的に調整する
    numParticles: 2000,   // 描画するパーティクルの数
    dropThreshold: 100,  // 一定期間でパーティクルをリセットするための閾値
  }


  velocityImageParams = {
    // params.velocityImagePath で指定した画像ファイルを解析した結果を配列に保存
    positions: [],
    colors: [],
    alphas: [],

    // さらにGPUComputationRendererを使ってテクスチャに変換したものを保存
    textureVelocity: null,
  };


  computationParams = {
    computationRenderer: null,
    positionVariable: null,
  }

  // パーティクル用のシェーダーマテリアルに渡すuniforms
  uniforms = {
    // パーティクルの位置情報が入ったテクスチャをシェーダーに渡す
    texturePosition: { value: null },
  }


  constructor(params = {}) {
    this.params = Object.assign(this.params, params);

    // 初期化にダウンロードを伴うので非同期関数を行う
    this.init();
  }


  init = async () => {

    // ローディング画面のエレメントを取得してイベントハンドラを登録
    const loadingContainer = document.getElementById('loadingContainer');
    loadingContainer.addEventListener('transitionend', (event) => {
      event.target.remove();
    });

    // loadImage()は非同期関数なので戻り値はpromise
    // そのpromiseをawaitして処理完了を待つ
    await this.loadImage(this.params.velocityImagePath, this.params.width);

    // 変換後の画像情報を確認
    // console.log(this.imageParams);

    // ローディング画面を0.5秒後に消す
    const interval = setInterval(() => {
      loadingContainer.classList.add('fadeout');
      clearInterval(interval);
    }, 500);

    // scene, camera, rendererを初期化
    this.initThreejs();

    // stats.jsを初期化
    this.initStatsjs();

    // GPUComputationRendererを使って速度計算用のテクスチャを作成
    this.createVelocityTexture();

    // GPUComputationRendererを初期化
    this.initComputationRenderer();

    // 背景を初期化
    this.initBackground();

    // パーティクルを初期化
    this.initParticles();

    // フレーム毎の処理
    this.render();
  }


  loadImage = async () => {

    // Image()オブジェクトを作成して画像をpathからダウンロードする
    const image = await new Promise((resolve) => {
      // <img>要素を作成
      const img = new Image();

      // <img src="path">を指定してロード開始
      img.src = this.params.velocityImagePath;
      img.crossOrigin = "anonymous";

      // ロード完了時にこのimgを返却する
      img.onload = () => { resolve(img); };
    });

    // Image()オブジェクトを保存しておく（後ほどTHREE.jsのテクスチャに変換するため）
    this.params.velocityImage = image;

    // ダウンロードした画像の幅と高さを取得
    const imageWidth = image.width;
    const imageHeight = image.height;
    // console.log(imageWidth, imageHeight);

    // リサイズ後の幅を指定
    const width = this.params.width;

    // アスペクト比を維持してリサイズするために高さを計算する
    const height = Math.floor(imageHeight * (width / imageWidth));

    // この高さの情報は後で使うので保存しておく
    this.params.height = height;

    // canvasを取得
    const canvas = document.createElement("canvas");

    // canvasのサイズを指定のサイズに変更
    canvas.width = width;
    canvas.height = height;

    // 2dコンテキストを取得
    const ctx = canvas.getContext("2d");

    // 画像をcanvasに描画する
    // 引数が多いのでマニュアルを参照
    // https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage
    ctx.drawImage(
      image,        // Image()オブジェクト
      0, 0,         // 元画像の描画開始位置、元画像に余白を入れる場合はここを変更
      imageWidth,   // 元画像の幅
      imageHeight,  // 元画像の高さ
      0, 0,         // 描画先キャンバスの左上座標
      width,        // 描画する幅
      height        // 描画する高さ
    );

    // リサイズ後のイメージをDOMに追加して目視で確認
    // document.body.appendChild(canvas);

    // 描画した画像をデータとして取得
    const data = ctx.getImageData(0, 0, width, height).data;

    // 位置と色の情報を取得する（アルファ値は使わないけど、ついでに取得する）
    const positions = [];
    let colors = [];
    const alphas = [];

    // ここでひと手間必要
    // Y軸の向きが逆転しているので、反転が必要

    // +---->x
    // |
    // y

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // RGBAが格納されているのでdataから4つずつ取り出す
        const index = (y * width + x) * 4;

        const r = data[index + 0] / 255;
        const g = data[index + 1] / 255;
        const b = data[index + 2] / 255;
        const a = data[index + 3] / 255;

        // ★重要★
        // ここで画像の中心を原点に正規化しているので、シェーダーでUV座標を使う場合は注意すること
        const pX = x - width / 2;      // 画像の中心を原点にする
        const pY = -(y - height / 2);  // 画像の中心を原点にして、上下方向を反転
        const pZ = 0;                  // 2DなのでZは0

        positions.push(pX, pY, pZ);
        colors.push([r, g, b]);
        alphas.push(a);
      }
    }
    colors.reverse();
    colors = colors.flat();

    // 画像から取り出した情報を保存しておく
    this.velocityImageParams.positions = positions;
    this.velocityImageParams.colors = colors;
    this.velocityImageParams.alphas = alphas;
  };


  initThreejs = () => {
    // シーン
    this.scene = new THREE.Scene();

    // カメラ
    this.camera = new THREE.OrthographicCamera(
      -this.params.width / 2,   // left
      this.params.width / 2,    // right
      this.params.height / 2,   // top
      -this.params.height / 2,  // bottom
      0,                        // near
      10                        // far
    );

    // カメラは(x, y)平面の原点に配置、z軸は手前に引く
    this.camera.position.set(0, 0, 1);

    // レンダラ
    // alpha: true はデフォルトのapha値が0.0になる。falseは1.0
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    // this.renderer.setClearColor(0xffffff, 1);  // 背景色

    // 通常はコンテナにサイズを合わせるが、ここでは固定にする
    this.renderer.setSize(this.params.width, this.params.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    document.getElementById("threejsContainer").appendChild(this.renderer.domElement);
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


  createVelocityTexture = () => {
    //
    // GPUComputationRendererを初期化
    //
    const computationRenderer = new GPUComputationRenderer(
      this.params.width,   // width
      this.params.height,  // height
      this.renderer,       // renderer
    );

    //
    // テクスチャを作成
    //
    const initialVelocityTexture = computationRenderer.createTexture();

    // 想定しているテクスチャの構造
    //
    //        0  1  2  3  4  5  ... width
    //       +--+--+--+--+--+--+--+
    //     0 |  |  |  |  |  |  |  |
    //       +--+--+--+--+--+--+--+
    //     1 |  |  |  |  |  |  |  |
    //       +--+--+--+--+--+--+--+
    //   ... |  |  |  |  |  |  |  |
    //       +--+--+--+--+--+--+--+
    // height

    // このテクスチャに色情報を埋め込む
    {
      const width = this.params.width;
      const height = this.params.height;

      const velocityArray = initialVelocityTexture.image.data;

      for (let y = 0; y < height; y++) {
        // Y座標がy番目のピクセルに関して、
        for (let x = 0; x < width; x++) {
          // X座標がx番目のピクセルに関して、

          // colors配列はRGBの順番で格納されているので3倍する
          const velocityIndex = (y * width + x) * 3;

          // テクスチャの配列はvec4を格納するので4倍する
          const index = (y * width + x) * 4;

          velocityArray[index + 0] = this.velocityImageParams.colors[velocityIndex + 0] - 0.5;  // R
          velocityArray[index + 1] = this.velocityImageParams.colors[velocityIndex + 1] - 0.5;  // G
          velocityArray[index + 2] = this.velocityImageParams.colors[velocityIndex + 2] - 0.5;  // B
          velocityArray[index + 3] = 0.0;  // 未使用
        }
      }
    }

    // 変数に紐づけるフラグメントシェーダー
    const textureVelocityShader = /* glsl */`
      void main() {
        gl_FragColor = gl_FragColor;
      }
    `;

    //
    // computationRenderer.addVariable();
    //
    const velocityVariable = computationRenderer.addVariable(
      "textureVelocity",      // シェーダーの中で参照する名前
      textureVelocityShader,  // シェーダーコード
      initialVelocityTexture  // 最初に作ったテクスチャを渡す
    );

    //
    // computationRenderer.setVariableDependencies();
    //
    computationRenderer.setVariableDependencies(velocityVariable, [velocityVariable]);

    //
    // computationRenderer.init();
    //
    const error = computationRenderer.init();
    if (error !== null) {
      console.error(error);
      new Error(error);
    }

    // テクスチャを取り出して保存しておく
    // これは一度取り出したら変更されることはない
    this.velocityImageParams.textureVelocity = computationRenderer.getCurrentRenderTarget(velocityVariable).texture;
  }


  initComputationRenderer = () => {

    //
    // GPUComputationRendererを初期化
    //

    const computationRenderer = new GPUComputationRenderer(
      this.params.numParticles,  // width
      1,                         // height
      this.renderer,             // renderer
    );

    // フレームごとにcompute()を実行する必要があるので、外部からアクセスできるようにしておく
    this.computationParams.computationRenderer = computationRenderer;

    //
    // computationRenderer.createTexture();
    //

    // 想定しているテクスチャの構造
    //
    //   0  1  2  3  4  5  ... numParticles
    //  +--+--+--+--+--+--+--+
    //  |  |  |  |  |  |  |  |
    //  +--+--+--+--+--+--+--+

    // パーティクルの位置情報を格納するテクスチャを作成して、
    const initialPositionTexture = computationRenderer.createTexture();

    // テクスチャに座標情報を埋め込む
    {
      const w = this.params.width;
      const h = this.params.height;

      const positionArray = initialPositionTexture.image.data;

      for (let i = 0; i < this.params.numParticles; i++) {
        // i番目のパーティクルに関して、

        // 配列のインデックスはvec4を格納するので4倍する
        const index = i * 4;

        positionArray[index + 0] = Math.random() * w - w / 2;                  // X座標
        positionArray[index + 1] = Math.random() * h - h / 2;                  // Y座標
        positionArray[index + 2] = Math.random() * this.params.dropThreshold;  // age
        positionArray[index + 3] = 0.0;                                        // absVelocity
      }
    }

    // 変数に紐づけるフラグメントシェーダー
    // addVariable() で登録する texturePosition はuniformで渡さなくても参照できる
    const texturePositionShader = /* glsl */`

      // 速度情報が書き込まれているテクスチャをuniformで受け取る
      uniform sampler2D textureVelocity;

      // パーティクルの移動速度をuniformで受け取る
      uniform float particleSpeed;

      // パーティクルの生存期間をuniformで受け取る
      uniform float dropThreshold;

      float rand(vec2 p) {
        return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453);
      }

      vec2 getVelocityFromTexture(vec2 uv) {
        float xPx = 1.0 / ${this.params.width}.0;
        float yPx = 1.0 / ${this.params.height}.0;

        vec2 center = texture2D(textureVelocity, uv).rg;
        vec2 left = texture2D(textureVelocity, uv - vec2(xPx, 0.0)).rg;
        vec2 top = texture2D(textureVelocity, uv + vec2(0.0, yPx)).rg;
        vec2 right = texture2D(textureVelocity, uv + vec2(xPx, 0.0)).rg;
        vec2 bottom = texture2D(textureVelocity, uv - vec2(0.0, yPx)).rg;

        vec2 avg = (center + left + top + right + bottom) * 0.2;

        return avg;
      }


      void main() {

        // UV座標を取得
        vec2 uv = gl_FragCoord.xy / resolution.xy;

        // 関数texture2D(sampler2D, vec2)はUV座標vec2を元に情報を取り出す
        // 取り出したvec4の使い方は(x, y, age, absVelocity)と定義している
        vec4 texturePositionValue = texture2D(texturePosition, uv);

        // 現在のageを取得
        float age = texturePositionValue.z;

        // 新しい位置
        vec2 newPosition;

        // ageがdropThresholdを超過していたらランダムな位置に移動
        if (age > dropThreshold) {
          newPosition = vec2(
            rand(texturePositionValue.xy) * ${this.params.width}.0 - ${this.params.width}.0 / 2.0,
            rand(texturePositionValue.yx) * ${this.params.height}.0 - ${this.params.height}.0 / 2.0
          );
          gl_FragColor = vec4(newPosition, 0.0, 0.0);
          return;
        }

        // ageがdropThresholdを超過していない場合は、速度を取得して新しい場所に移動

        // 現在の速度の絶対値を取得
        float absVelocity = texturePositionValue.w;

        // ageを進める
        float newAge = age + rand(vec2(absVelocity, absVelocity));

        // 現在のスクリーン上のXY座標を取得
        vec2 position = texturePositionValue.xy;

        // 現在のXY座標を元に速度用テクスチャにおけるUV座標を取得
        // X座標の範囲は-width/2 ~ width/2 なので、右にwidth/2加算する
        // Y座標も同様
        float velocityU = (position.x + ${this.params.width}.0 / 2.0) / ${this.params.width}.0;
        float velocityV = (position.y + ${this.params.height}.0 / 2.0) / ${this.params.height}.0;
        vec2 velocityUv = vec2(velocityU, velocityV);

        // 現在位置に対応する速度をテクスチャから取得
        vec2 velocity = getVelocityFromTexture(velocityUv);

        // 新しい位置を計算
        newPosition = position + velocity * particleSpeed;

        if (newPosition.x < -${this.params.width}.0 / 2.0) newPosition.x = ${this.params.width}.0 / 2.0;
        if (newPosition.x > ${this.params.width}.0 / 2.0) newPosition.x = -${this.params.width}.0 / 2.0;
        if (newPosition.y < -${this.params.height}.0 / 2.0) newPosition.y = ${this.params.height}.0 / 2.0;
        if (newPosition.y > ${this.params.height}.0 / 2.0) newPosition.y = -${this.params.height}.0 / 2.0;

        gl_FragColor = vec4(newPosition, newAge, length(velocity));
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

    // addVariable()の戻り値は getCurrentRenderTarget() でテクスチャを取り出すのに必要なのでインスタンス変数に保存しておく
    this.computationParams.positionVariable = positionVariable;

    // uniformを登録
    positionVariable.material.uniforms = {
      textureVelocity: { value: this.velocityImageParams.textureVelocity },
      particleSpeed: { value: this.params.particleSpeed },
      dropThreshold: { value: this.params.dropThreshold },
    };

    //
    // computationRenderer.setVariableDependencies();
    //

    // 追加した変数の依存関係を設定する
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


  initBackground = () => {
    const geometry = new THREE.PlaneGeometry(this.params.width, this.params.height);

    const texture = new THREE.Texture(this.params.velocityImage);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.needsUpdate = true;

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geometry, material);
    // mesh.rotation.x = - Math.PI / 2;
    // mesh.position.x = this.params.width / 2;
    // mesh.position.y = -this.params.height / 2;
    // mesh.scale.set(this.params.width, this.params.height, 1);

    this.scene.add(mesh);
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
    // compute()するたびにテクスチャは更新される
    this.uniforms.texturePosition.value = this.computationParams.computationRenderer.getCurrentRenderTarget(this.computationParams.positionVariable).texture;

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

          gl_PointSize = 3.0;
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
    this.computationParams.computationRenderer.compute();
  }

}
