import * as THREE from "three";
import { OrbitControls } from "three/controls/OrbitControls.js";

import Stats from "three/libs/stats.module.js";

import { GUI } from "three/libs/lil-gui.module.min.js";

// 必要な追加モジュール（libsに配置するファイル）
//   three.js/examples/jsm/misc/GPUComputationRenderer.js
//   three.js/examples/jsm/postprocessing/Pass.js
import { GPUComputationRenderer } from "three/libs/misc/GPUComputationRenderer.js";


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
    // 曲線の粒度
    numPoints: 50,

    // ラインの数
    numLines: 10,
  }

  // ラインを描画するシェーダーマテリアル用のuniforms
  uniforms = {
    u_texture_line: { value: null },
  }

  // GPUComputationRenderer用のuniforms
  computationUniforms = {
    u_freq_scale: { value: 0.5 },
  }

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

    // ラインを初期化
    this.initLines();

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
      60,                                   // 視野角度 FOV
      this.sizes.width / this.sizes.height, // アスペクト比
      0.1,                                  // 開始距離
      100                                   // 終了距離
    );
    this.camera.position.set(7, 7, 7);

    // レンダラ
    this.renderer = new THREE.WebGLRenderer({ alpha: false, antialias: true });
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    // コントローラ
    this.controller = new OrbitControls(this.camera, this.renderer.domElement);

    // グリッドヘルパー
    const gridHelper = new THREE.GridHelper(10, 10, new THREE.Color(0x505050), new THREE.Color(0x505050));
    this.scene.add(gridHelper);

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
      .add(this.params, "numLines")
      .min(1)
      .max(500)
      .step(10)
      .name(navigator.language.startsWith("ja") ? "ラインの数" : "Number of Lines")
      .onFinishChange(() => {
        doLater(this.initContents, 100);
      });

    gui
      .add(this.computationUniforms.u_freq_scale, "value")
      .min(0.1)
      .max(1.0)
      .step(0.1)
      .name(navigator.language.startsWith("ja") ? "周波数係数" : "Frequency");

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

      // カメラコントローラーの更新
      this.controller.update();

      // GPGU計算
      this.computationRenderer.compute();

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
      if (child.type === 'AxesHelper' || child.type === 'GridHelper' || child.type === 'Light') {
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

    // uniformsで渡しているuPixelRatioも更新する
    this.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 2.0);
  }


  initComputationRenderer = () => {

    //
    // GPUComputationRendererを初期化
    //

    // widthには source, destination, t を格納したいので3
    //
    //         0  1  2
    //        +--+--+--+
    // num .. |  |  |  |
    //        +--+--+--+
    // num 1  |  |  |  |
    //        +--+--+--+
    // num 0  |  |  |  |
    //        +--+--+--+

    // ラインの数
    const numLines = this.params.numLines;

    const computationRenderer = new GPUComputationRenderer(
      3,             // widthは3で固定
      numLines,      // heightはラインの数
      this.renderer  // renderer
    );

    // フレームごとにcompute()を実行するので、インスタンス変数に保存しておく
    this.computationRenderer = computationRenderer;

    //
    // computeRenderer.createTexture();
    //

    // 初期テクスチャを作成して、
    const initialTexture = this.computationRenderer.createTexture();

    // 各行ごと、すなわちラインごとに、
    for (let i = 0; i < numLines; i++) {
      // i番目のラインに関して、-range/2 ～ range/2 の範囲でランダムな初期位置を設定
      const range = 10;
      const sourceX = Math.random() * range - range / 2;
      const sourceZ = Math.random() * range - range / 2;
      const destinationX = Math.random() * range - range / 2;
      const destinationZ = Math.random() * range - range / 2;

      // 各行における、各列の値を初期化する

      // source
      let j = 0;
      initialTexture.image.data[(i * 3  + j) * 4 + 0] = sourceX;        // X = 始点のX座標
      initialTexture.image.data[(i * 3  + j) * 4 + 1] = 0;              // Y = 始点のY座標
      initialTexture.image.data[(i * 3  + j) * 4 + 2] = sourceZ;        // Z = 始点のZ座標
      initialTexture.image.data[(i * 3  + j) * 4 + 3] = 0;              // W(未使用)

      // destination
      j = 1;
      initialTexture.image.data[(i * 3  + j) * 4 + 0] = destinationX;   // X = 終点のX座標
      initialTexture.image.data[(i * 3  + j) * 4 + 1] = 0;              // Y = 終点のY座標
      initialTexture.image.data[(i * 3  + j) * 4 + 2] = destinationZ;   // Z = 終点のZ座標
      initialTexture.image.data[(i * 3  + j) * 4 + 3] = 0;              // W(未使用)

      // t
      j = 2;
      initialTexture.image.data[(i * 3  + j) * 4 + 0] = Math.random();  // X = t
      initialTexture.image.data[(i * 3  + j) * 4 + 1] = 0;              // Y(未使用)
      initialTexture.image.data[(i * 3  + j) * 4 + 2] = 0;              // Z(未使用)
      initialTexture.image.data[(i * 3  + j) * 4 + 3] = 0;              // W(未使用)
    }

    //
    // compute()したときに走るシェーダー
    //

    const shader = /* glsl */`
      uniform float u_freq_scale;

      float rand(vec2 co) {
        return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
      }

      void main() {

        // 一番左のピクセルのUV座標
        vec2 uv0 = vec2(0.0 / resolution.x, gl_FragCoord.y / resolution.y);

        // 左から2番目のピクセルのUV座標
        vec2 uv1 = vec2(1.0 / resolution.x, gl_FragCoord.y / resolution.y);

        // 左から3番目のピクセルのUV座標
        vec2 uv2 = vec2(2.0 / resolution.x, gl_FragCoord.y / resolution.y);

        // 現在のtを取り出す（tは左から3番目のピクセルに格納されている）
        float t = texture2D( textureLine, uv2 ).x;

        // tがしきい値に達していたら、次の目的地に向かうために値を刷新する
        // しきい値を1.0にすると、ラインの先頭が目的地に到達すると次の目的地に向かうようになる
        // 2.0にすると、ラインの尻尾が目的地に到達してから次の目的地をランダムに設定するようになる
        if (t >= 2.0) {
          if (gl_FragCoord.x < 1.0) {
            // 当該ピクセルが一番左、つまり始点の場合、現在の終点に置き換える
            gl_FragColor = texture2D( textureLine, uv1 );
          } else if (gl_FragCoord.x < 2.0) {
            // 当該ピクセルが2番目、つまり終点の場合、ランダムな場所を新たに設定する
            // なるべく現在の終点から離れた場所にする
            vec4 currentDestination = texture2D( textureLine, uv1 );
            float x, z;
            do {
              // ランダムな座標を生成
              x = rand(vec2(currentDestination.x, currentDestination.z)) * 10.0 - 5.0;
              z = rand(vec2(currentDestination.z, currentDestination.x)) * 10.0 - 5.0;
            } while (distance(currentDestination.xyz, vec3(x, 0.0, z)) < sqrt(18.0)); // 一定の距離以上離れていることを確認
            gl_FragColor = vec4(x, 0.0, z, 0.0);
          } else if (gl_FragCoord.x < 3.0) {
            // 当該ピクセルが3番目、つまりtの場合、tは0に戻す
            gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
          }
        } else {
          if (gl_FragCoord.x >= 2.0) {
            // tを0.01進めて保存
            t += 0.01 * u_freq_scale;
            gl_FragColor = vec4( t, 0.0, 0.0, 0.0 );
          } else {
            gl_FragColor = texture2D( textureLine, gl_FragCoord.xy / resolution.xy );
          }
        }
      }
    `;

    //
    // computeRenderer.addVariable();
    //

    // ここが重要

    // テクスチャと、それに対応するシェーダを指定して、変数 "textureLine" を追加する
    // addVariable()の戻り値はテクスチャを取り出すのに必要

    const variable = this.computationRenderer.addVariable(
      "textureLine",          // シェーダーの中で参照する名前
      shader,                 // シェーダーコード
      initialTexture          // 最初に作ったテクスチャを渡す
    );

    // シェーダー用いているuniformを登録する場合はここで設定する
    variable.material.uniforms = this.computationUniforms;

    //
    // computeRenderer.setVariableDependencies();
    //

    // 追加した変数の依存関係を設定する
    computationRenderer.setVariableDependencies(variable, [variable]);

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
    this.uniforms.u_texture_line.value = computationRenderer.getCurrentRenderTarget(variable).texture;
  }



  initLines = () => {

    // シェーダーマテリアルは共通で使う
    const material = new THREE.ShaderMaterial({
      wireframe: true,  // wireframeで表示することで線がはっきり見える
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: this.uniforms,
      vertexShader: this.vertexShader,
      fragmentShader: this.fragmentShader,
    });

    // ラインの数
    const numLines = this.params.numLines;

    // 曲線の粒度
    const numPoints = this.params.numPoints;

    // ラインの数だけメッシュを作成する
    for (let i = 0; i < numLines; i++) {
      const geometry = new THREE.BufferGeometry();

      // numPoints個の頂点の座標を設定する（ゼロで初期化）
      const positions = new Float32Array(numPoints * 3);
      for (let i = 0; i < numPoints; i++) {
        positions[i * 3 + 0] = 0;
        positions[i * 3 + 1] = 0;
        positions[i * 3 + 2] = 0;
      }
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

      // アトリビュート uv を設定するための配列を初期化
      const uvs = new Float32Array(numPoints * 2);
      for (let j = 0; j < numPoints; j++) {
        uvs[j * 2 + 0] = 0.0;                 // UV座標のU (参照しない)
        uvs[j * 2 + 1] = i / (numLines - 1);  // UV座標のV (ライン番号が分かるようにiを設定)
      }
      geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));

      // 各頂点には0から1までの値fractionを設定する
      const fractions = new Float32Array(numPoints);
      for (let j = 0; j < numPoints; j++) {
        fractions[j] = j / (numPoints - 1);
      }
      geometry.setAttribute("fraction", new THREE.BufferAttribute(fractions, 1));

      // indexは3個の頂点を指定して三角形のポリゴンを設定するので*3で確保する
      const indices = new Uint32Array(numPoints * 3);
      for (let j = 0; j < numPoints; j++) {
        indices[j * 3 + 0] = j;
        indices[j * 3 + 1] = Math.min(j + 1, numPoints - 1);
        indices[j * 3 + 2] = Math.min(j + 1, numPoints - 1);
      }
      geometry.setIndex(new THREE.BufferAttribute(indices, 3));

      const mesh = new THREE.Mesh(geometry, material);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();

      // シーンに追加
      this.scene.add(mesh);
    }
  }

  vertexShader = /* glsl */`
    attribute float fraction;  // ジオメトリに設定したfractionアトリビュート
    uniform sampler2D u_texture_line;  // テクスチャ

    varying float v_time;
    varying float v_fraction;

    // ベジェ曲線を計算する関数
    vec3 bezier(vec3 source, vec3 control1, vec3 control2, vec3 destination, float t) {
      // 線形補間を使用してベジェ曲線の各点を計算
      vec3 point1 = mix(source, control1, t);
      vec3 point2 = mix(control1, control2, t);
      vec3 point3 = mix(control2, destination, t);

      vec3 point4 = mix(point1, point2, t);
      vec3 point5 = mix(point2, point3, t);

      // 最終的なベジェ曲線上の点を計算
      return mix(point4, point5, t);
    }

    void main() {
      // テクスチャから値を取り出す
      vec2 uv0 = vec2(0.0 / 2.0, uv.y);
      vec2 uv1 = vec2(1.0 / 2.0, uv.y);
      vec2 uv2 = vec2(2.0 / 2.0, uv.y);

      vec3 source = texture2D(u_texture_line, uv0).xyz;
      vec3 destination = texture2D(u_texture_line, uv1).xyz;
      float t = texture2D(u_texture_line, uv2).x;

      // 制御点を計算
      float altitude = distance(source, destination) / 1.618;
      vec3 control1 = mix(source, destination, 0.25) + vec3(0.0, altitude, 0.0);
      vec3 control2 = mix(source, destination, 0.75) + vec3(0.0, altitude, 0.0);

      // fractionにおけるベジエ曲線上の座標を計算
      vec3 pos = bezier(source, control1, control2, destination, fraction);

      // モデルビュー行列と射影行列を掛けて、最終的な位置を計算
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);

      v_time = t;
      v_fraction = fraction;
    }
  `;


  fragmentShader = /* glsl */`
    varying float v_time;
    varying float v_fraction;

    void main() {
      vec3 moveColor = vec3(0.0, 1.0, 0.0);
      vec3 baseColor = vec3(0.0, 0.0, 0.0);

      float freq = (v_fraction - v_time) * 3.1415;
      float drawMove = step(0.0, sin(freq));  // sin()が0より大きいかどうかを判定
      vec3 color = mix(moveColor, baseColor, drawMove);

      gl_FragColor = vec4(color, 0.8);
    }
  `;

}
