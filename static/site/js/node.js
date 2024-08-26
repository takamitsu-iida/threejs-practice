import * as THREE from "three";
import { OrbitControls } from "three/controls/OrbitControls.js";
import { GUI } from "three/libs/lil-gui.module.min.js";


class NodeBase extends THREE.Group {

  // グラフのデータ
  node = {
    group: 'nodes',
    data: {},
    position: { x: 0, y: 0, z: 0 }
  }

  // オプション
  options = {
    // ノードの20面体の半径
    sphereRadius: 1,

    // ノードの20面体の詳細度
    sphereDetail: 3,

    // ノードの透明度
    sphereOpacity: 0.75,

    // ノードの色
    sphereColor: 0xf0f0f0,
  };

  // ノードを表現するメッシュ
  sphere;

  // 選択状態
  isSelected = false;

  constructor(node, options) {
    super();

    this.node = Object.assign(this.node, node || {});
    this.options = Object.assign(this.options, options || {});

    // 渡されたデータにidが欠落している場合はエラー
    if (this.node.data.hasOwnProperty('id') === false) {
      throw new Error("id must be specified");
    }

    // 位置を設定
    this.position.set(this.node.position.x, this.node.position.y, this.node.position.z);
  }

  createSphere() {

    // ジオメトリ
    const geometry = new THREE.IcosahedronGeometry(this.options.sphereRadius, this.options.sphereDetail);

    // マテリアル
    const material = new THREE.MeshPhongMaterial({
      color: this.options.sphereColor,
      transparent: true,
      opacity: this.options.sphereOpacity,
      shininess: 150,
      depthTest: true,  // ★オブジェクト内部の線を隠すための設定
    });

    // メッシュを作成
    this.sphere = new THREE.Mesh(geometry, material);

    // 名前を設定
    this.sphere.name = this.node.data.id;

    // 選択可能にする
    this.sphere.selectable = true;

    // 選択状態
    this.sphere.isSelected = false;

    // グループに追加
    this.add(this.sphere);

  }

  select(value) {
    if (value) {
      this.isSelected = true;
      this.startBlink();
    } else {
      this.isSelected = false;
      this.stopBlink();
    }
  }

  // ブリンクエフェクト
  blinkSphere;
  blinkInterval;

  startBlink() {
    if (!this.blinkSphere) {
      const geometry = this.sphere.geometry.clone();
      const material = this.sphere.material.clone();
      if (material.color) {
        material.color.setHex(0xffffff);
      }
      material.opacity = 1.0;
      this.blinkSphere = new THREE.Mesh(geometry, material);
      this.blinkSphere.visible = false;
      this.add(this.blinkSphere);
    }

    if (this.blinkInterval) {
      clearInterval(this.blinkInterval);
    }

    this.blinkInterval = setInterval(() => {
      this.blinkSphere.visible = !this.blinkSphere.visible;
    }, 500);
  }

  stopBlink() {
    if (this.blinkInterval) {
      clearInterval(this.blinkInterval);
    }
    this.blinkInterval = null;
    this.blinkSphere.visible = false;
  }
}


export class ColorNode extends NodeBase {

  constructor(node, options) {

    super(node, options);

    this.createSphere();
  }

}


export class LabelNode extends NodeBase {

  sprite;

  constructor(node, options) {
    super(node, options);
    this.createSprite();
    this.createSphere();
  }

  createSprite() {

    const textColor = { r: 0, g: 0, b: 0, a: 1 };

    const labelText = this.node.data.label || `${this.node.data.id}`;

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    const fontSize = 40;
    const fontFace = "Arial";
    context.font = `Bold ${fontSize}px ${fontFace}`;
    context.textAlign = "center";
    const textWidth = context.measureText(labelText).width;
    canvas.setAttribute('width', textWidth);

    // canvasの幅を変更したので、再度フォントの設定を行う
    context.font = `Bold ${fontSize}px ${fontFace}`;
    context.fillStyle = `rgba(${textColor.r},${textColor.g},${textColor.b},${textColor.a})`;
    context.fillText(labelText, 0, 100);

    const texture = new THREE.Texture(canvas);
    texture.needsUpdate = true;

    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
    });

    this.sprite = new THREE.Sprite(spriteMaterial);

    this.add(this.sprite);


  }


}



export class TextureNode extends NodeBase {

  // ノードのテクスチャ
  sphereTexture;

  // スプライト
  sprite;

  constructor(node, options) {

    super(node, options);

    this.sphereTexture = options.sphereTexture;
    if (!this.sphereTexture) {
      throw new Error("sphereTexture must be specified");;
    }

    this.createSprite();

    // 内部のスプライトが見えるように透過度を下げる
    // this.options.sphereOpacity = 0.1;
    this.createSphere();

  }


  createSprite() {
    const spriteMaterial = new THREE.SpriteMaterial({
      map: this.sphereTexture,
      depthTest: true,
    });

    this.sprite = new THREE.Sprite(spriteMaterial);
    this.sprite.scale.set(1.0, 1.0, 1.0);
    this.add(this.sprite);
  }

}


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

  params = {
    autoRotate: false,
    autoRotateSpeed: 3.0,
    select: false,
  }

  // テクスチャを格納
  textures = {
    Router48: null,
  };

  // 作成したノードを格納するリスト
  nodes = [];

  constructor() {

    this.initTexture();

    this.initThreejs();

    //
    // ノードを表す球体を作成
    //

    let id = 1;
    let X = -4;

    // ノード１
    {
      const data = {
        group: 'nodes',
        data: { id: id },
        position: { x: X, y: 2, z: 0 }
      };

      const options = {
        sphereColor: "red",
      }

      const node = new ColorNode(data, options);
      this.scene.add(node);

      this.nodes.push(node);
    }

    id += 1;
    X += 3;

    // ノード２
    {
      const data = {
        group: 'nodes',
        data: { id: id },
        position: { x: X, y: 2, z: 0 }
      };

      const options = {
        sphereColor: "blue",
      }

      const node = new ColorNode(data, options);
      this.scene.add(node);

      this.nodes.push(node);
    }

    id += 1;
    X += 3;

    // ノード３
    {
      const data = {
        group: 'nodes',
        data: { id: id },
        position: { x: X, y: 2, z: 0 }
      };

      const options = {
        sphereColor: "yellow",
        sphereTexture: this.textures.Router48,
      }

      const node = new TextureNode(data, options);
      this.scene.add(node);

      this.nodes.push(node);
    }

    id += 1;
    X += 3;

    // ノード４
    {
      const data = {
        group: 'nodes',
        data: { id: id, label: `node ${id}` },
        position: { x: X, y: 2, z: 0 }
      };

      const options = {
        sphereColor: "green",
      }

      const node = new LabelNode(data, options);
      this.scene.add(node);

      this.nodes.push(node);
    }

    /*
    // ラインを引く
    const lineGeo = new THREE.BufferGeometry();

    const nodeLeftPosition = this.nodes[0].position.clone();
    const nodeRightPosition = this.nodes[this.nodes.length -1].position.clone();
    const points = [
      nodeLeftPosition,
      nodeRightPosition,
    ];
    lineGeo.setFromPoints(points);

    const lineMaterial = new THREE.LineBasicMaterial({
      color: "black",
      // vertexColors: true, // ジオメトリの頂点の色を使う
      transparent: true,
      depthWrite: false // ★オブジェクト内部の線を隠すための設定
    });

    const line = new THREE.Line(lineGeo, lineMaterial);
    line.renderOrder = 1;  // ★オブジェクト内部の線を隠すための設定
    this.scene.add(line);
    */

    // フレーム毎の処理(requestAnimationFrameで再帰的に呼び出される)
    this.render();
  }


  initTexture() {
    const loadingContainer = document.getElementById('loading_container');
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
    this.textures['Router48'] = loader.load('./static/site/img/Router.48.png');
  }


  initThreejs() {
    // コンテナ
    this.container = document.getElementById("threejs_container");

    // コンテナのサイズ
    this.sizes.width = this.container.clientWidth;
    this.sizes.height = this.container.clientHeight;

    // resizeイベントのハンドラを登録
    window.addEventListener("resize", () => { this.onWindowResize(); }, false);

    // シーン
    this.scene = new THREE.Scene();

    // カメラ
    this.camera = new THREE.PerspectiveCamera(
      60,
      this.sizes.width / this.sizes.height,
      1,
      1001
    );
    this.camera.position.set(0, 5, 10);

    // レンダラ
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0xdedede);
    this.container.appendChild(this.renderer.domElement);

    // コントローラ
    this.controller = new OrbitControls(this.camera, this.renderer.domElement);
    this.controller.autoRotate = this.params.autoRotate;
    this.controller.autoRotateSpeed = this.params.autoRotateSpeed;

    // グリッドヘルパー
    this.scene.add(new THREE.GridHelper(20, 20, new THREE.Color(0xffffff), new THREE.Color(0xffffff)));

    // 環境光
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.0));

    // 点光源 new THREE.PointLight(色, 光の強さ, 距離, 光の減衰率)
    const pointLightA = new THREE.PointLight(0xffffff, 10, 50, 1);
    pointLightA.position.set(5, 5, 5);
    this.scene.add(pointLightA);

    const pointLightB = new THREE.PointLight(0xffff00, 10, 50, 1);
    pointLightB.position.set(-5, -5, -5);
    this.scene.add(pointLightB);

    // lil-gui
    const gui = new GUI({ width: 300 });
    gui
      .add(this.params, "autoRotate")
      .name("autoRotate")
      .onChange((value) => {
        this.controller.autoRotate = value;
      });

    gui
      .add(this.params, "autoRotateSpeed")
      .name("autoRotateSpeed")
      .min(1.0)
      .max(10.0)
      .step(0.1)
      .onChange((value) => {
        this.controller.autoRotateSpeed = value;
      });

    gui
      .add(this.params, "select")
      .name("select")
      .onChange((value) => {
        this.nodes.forEach((node) => {
          node.select(value);
        });
      });

  }


  render() {
    // カメラコントローラーの更新
    this.controller.update();

    // 再描画
    this.renderer.render(this.scene, this.camera);

    // 再帰処理
    requestAnimationFrame(() => { this.render(); });
  }


  onWindowResize() {
    this.sizes.width = this.container.clientWidth;
    this.sizes.height = this.container.clientHeight;

    this.camera.aspect = this.sizes.width / this.sizes.height;
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.sizes.width, this.sizes.height);
  }

}
