import * as THREE from "three";

// マウス操作
import { OrbitControls } from 'three/controls/OrbitControls.js';

// CSS2Dを用いたラベル表示
// 参考 https://github.com/mrdoob/three.js/blob/master/examples/css2d_label.html
import { CSS2DRenderer, CSS2DObject } from 'three/libs/CSS2DRenderer.js';

// lil-gui
import { GUI } from "three/libs/lil-gui.module.min.js";

// stats.js
import Stats from 'three/libs/stats.module.js';

/*
  HTMLではこのように指定する

  <!-- three.js -->
  <script type="importmap">
    {
      "imports": {
        "three": "./static/build/three.module.js",
        "three/libs/": "./static/libs/",
        "three/controls/": "./static/controls/"
      }
    }
  </script>

  <script type="module">
    import WebGL from './static/libs/capabilities/WebGL.js';
    import { main } from "./static/site/js/nwdiagram.js";

    window.addEventListener("load", () => {
      if (WebGL.isWebGLAvailable()) {
        main();
      } else {
        document.getElementById("threejs_wrapper").appendChild(WebGL.getWebGLErrorMessage());
      }
    });
  </script>

以下のようなディレクトリ配置になるようにbuild、controls、libsディレクトリを作成し
three.jsのソースコードから必要なファイルをコピーする。

static
├── build
│   ├── three.module.js
│   └── three.module.min.js
├── controls
│   ├── OrbitControls.js
│   ├── TrackballControls.js
│   └── TransformControls.js
├── libs
│   ├── CSS2DRenderer.js
│   ├── CSS3DRenderer.js
│   ├── capabilities
│   │   ├── WebGL.js
│   │   └── WebGPU.js
│   ├── lil-gui.module.min.js
│   ├── stats.module.js
│   └── tween.module.js
└── site
    ├── css
    ├── img
    └── js
*/


export var ObjectSelection = function (parameters) {

  // 参照
  // 初めてのThree.js 第二版 P235
  // https://github.com/oreilly-japan/learning-three-js-2e-ja-support

  parameters = parameters || {};

  this.INTERSECTED = null;

  var self = this;
  var callbackSelected = parameters.selected;
  var callbackClicked = parameters.clicked;
  var mouse = new THREE.Vector2()

  // スクリーン上のDOM要素
  this.domElement = parameters.domElement || document;

  // マウスが動いたときのイベントを登録
  this.domElement.addEventListener('mousemove', onDocumentMouseMove, false);

  function onDocumentMouseMove(event) {
    // DOM要素(canvas)を取得する
    // これはeventから取得してもよいし、parametersで渡されたものを使ってもよい
    // const element = self.domElement;
    const element = event.currentTarget;

    // その要素の位置を取得
    const clientRect = element.getBoundingClientRect();

    // canvas要素の左上を起点とするマウス座標
    const x = event.clientX - clientRect.x;
    const y = event.clientY - clientRect.y;

    // canvas要素の幅、高さ (paddingが含まれるのでCSSで0にしておくこと)
    const w = element.clientWidth;
    const h = element.clientHeight;

    // マウス座標を(-1, 1)の範囲に変換
    mouse.x = +(x/w)*2 -1;
    mouse.y = -(y/h)*2 +1;
  }

  // クリックイベントを登録
  this.domElement.addEventListener('click', onDocumentMouseClick, false);

  function onDocumentMouseClick(event) {
    if (self.INTERSECTED) {
      if (typeof callbackClicked === 'function') {
        callbackClicked(self.INTERSECTED);
      }
    }
  }

  // 光線を飛ばすレイキャスター
  var raycaster = new THREE.Raycaster();

  // アニメーションの中でこのrender()関数を呼ぶことで、選択したオブジェクトの色を変える
  this.render = function (scene, camera) {

    // カメラからマウス座標に向かって光線を飛ばす
    raycaster.setFromCamera(mouse, camera);

    // オブジェクトに光線がぶつかっているか、判定する
    const intersects = raycaster.intersectObject(scene, true);

    // 光線がオブジェクトにぶつかっていれば、
    if (intersects.length > 0) {

      // 前回と違うオブジェクトに光線が当たっているなら、
      if (this.INTERSECTED != intersects[0].object) {

        // 前回と違うオブジェクトに光線が当たっているなら、古いオブジェクトは元の色に戻す
        if (this.INTERSECTED) {
          this.INTERSECTED.material.color.setHex(this.INTERSECTED.currentHex);
        }

        // 新しいオブジェクトを選択して、
        this.INTERSECTED = intersects[0].object;

        // その色を変える
        this.INTERSECTED.currentHex = this.INTERSECTED.material.color.getHex();
        this.INTERSECTED.material.color.setHex(0xff0000);

        // コールバック関数を渡されているならそれを実行する
        if (typeof callbackSelected === 'function') {
          callbackSelected(this.INTERSECTED);
        }
      }

    } else {
      // 光線がオブジェクトにぶつかっていないなら

      if (this.INTERSECTED) {
        // 古いオブジェクトは元の色に戻す
        this.INTERSECTED.material.color.setHex(this.INTERSECTED.currentHex);
      }

      this.INTERSECTED = null;

      if (typeof callbackSelected === 'function') {
        // 選択から外れたことをコールバック関数で知らせる
        callbackSelected(null);
      }

    }
  };
};

//
// 2024.07.25 CSS2DRenderer.jsを利用することにしたので使っていないが、こっちの方が性能がよければ復活させる
//
export let CanvasLabel = function(parameters) {

  /*
  使い方

  const label_text = "This is a label";
  const label_name = "label_1";
  const label_object = new CanvasLabel({label_text: label_text, label_name: label_name });

  // node_objectの位置に合わせる
  label_object.position.x = node_object.position.x;
  label_object.position.y = node_object.position.y + 20;
  label_object.position.z = node_object.position.z;
  label_object.lookAt(camera.position);

  */

  if (parameters === undefined) {
    return null;
  }

  const label_text = parameters.label_text;
  const label_name = parameters.label_name;
  const label_layer = parameters.label_layer || 1; // 指定がない場合はレイヤ 1 に設定

  let label_canvas = document.createElement( "canvas" );

  function create() {
    const ctx = label_canvas.getContext("2d");

    // canvasのデフォルトフォントは "10px sans-serif" になっているのでフォントを大きくする

    // measureTextで必要な幅を調べる
    const font_size = 40;
    ctx.font = `${font_size}pt Arial`;
    const len = ctx.measureText(label_text).width;

    // canvasのサイズを必要な幅に設定
    label_canvas.setAttribute('width', len);

    // canvasの幅を変更したので、再度フォントの設定を行う
    ctx.font = `${font_size}pt Arial`;
    ctx.fillStyle = 'rgba(255, 255, 255, 1)';
    ctx.textBaseline = 'top';
    ctx.fillText(label_text, 0, 0);

    // (width, height, depth)
    const geometry = new THREE.BoxGeometry(len, 100, 0);

    const material = new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(
        label_canvas,
        THREE.UVMapping,
        THREE.ClampToEdgeWrapping,
        THREE.ClampToEdgeWrapping,
        THREE.LinearFilter,
        THREE.LinearFilter
      ),
      transparent: true,
      opacity: 0.6
    });
    material.map.needsUpdate = true;

    // set text canvas to cube geometry
    var labelObject = new THREE.Mesh(geometry, material);

    // オブジェクトに名前を設定
    labelObject.name = label_name;

    // ラベルはレイヤ 1 に設定
    labelObject.layers.set(label_layer);

    return labelObject;
  }

  return create();
};



export class Graph {

  constructor(elements) {
    this.nodes = [];
    this.edges = [];

    let eles;
    if (elements === undefined || elements === null) {
      eles = [];
    } else if (typeof elements === "object") {
      eles = [elements];
    }

    eles.forEach((ele) => {
      if ("data" in ele === false || "id" in ele.data === false) {
        throw new Error("element.data.id is required");
      }
      if ("source" in ele.data && "target" in ele.data) {
        this.addEdge(ele);
      } else {
        this.addNode(ele);
      }
    });
  }

  addNode(node) {
    if ("data" in node === false || "id" in node.data === false) {
      throw new Error("node.data.id is required");
    }
    if ("group" in node === false) {
      node["group"] = "nodes";
    }
    this.nodes.push(node);
  }

  addEdge(edge) {
    if ("data" in edge === false || "id" in edge.data === false) {
      throw new Error("edge.data.id is required");
    }
    if ("group" in edge === false) {
      node["group"] = "edges"
    }

    this.edges.push(edge);
  }

  getNodes() {
    return this.nodes;
  }

  getEdges() {
    return this.edges;
  }

  getElements() {
    return this.nodes.concat(this.edges);
  }

  getElementById(id) {
    const found_node = this.nodes.find((node) => node.data.id === id);
    if (found_node) {
      return found_node;
    }
    const found_edge = this.edges.find((edge) => edge.data.id === id);
    if (found_edge) {
      return found_edge;
    }
    return undefined;
  }

}


function create_graph(options) {

  let id = 1;
  let node_id = `node_${id}`;
  id += 1;

  const graph = new Graph();

  // ルートノードを追加
  const root = {
    group: 'nodes',
    data: {
      id: node_id,
      label: `This is the root ${id}`
    },
    position: { x: 0, y: 0, z: 0 }
  };
  graph.addNode(root);

  const area = 300;
  const nodes = [root];
  const num_steps = 5;
  const num_edges = 5;
  let steps = 1;
  while(nodes.length !== 0 && steps < num_steps) {

    // nodesから先頭のノードを取り出す
    const source_node = nodes.shift();

    // num_edgesの数だけそこからノードを追加
    for(let i=1; i <= num_edges; i++) {
      let target_node_id = `node_${id}`;
      id += 1;
      const target_node = {
        group: 'nodes',
        data: {
          id: target_node_id,
        },
        position: {
          x: Math.floor(Math.random() * (area + area + 1) - area),
          y: Math.floor(Math.random() * (area + area + 1) - area),
          z: Math.floor(Math.random() * (area + area + 1) - area)
        }
      };
      graph.addNode(target_node);

      // nodesにtarget_nodeを追加し、target_nodeの先にもノードを追加していく
      nodes.push(target_node);

      // エッジを追加
      graph.addEdge(
        {
          group: 'edges',
          data: {
            id: 'edge_' + source_node.data.id + '_' + target_node.data.id,
            source: source_node.data.id,
            target: target_node.data.id
          }
        }
      );
    }
    steps++;
  }

  return graph;
}



export let NetworkDiagram = function (options) {

  // 引数 options が渡されなかった場合は空のオブジェクトを代入
  options = options || {};

  // アロー関数内でthisを使うと混乱するのでselfに代入
  const self = this;

  // Graphクラスのインスタンス
  self.graph = options.graph;

  // オブジェクトを選択できるかどうか
  self.selection_enabled = options.selection || true;

  // ノードのラベルを表示するかどうか
  const label_params = {
    show_labels: options.show_labels || true,
    font_size: options.font_size || "Medium"  // "Small", "Medium", "Large"
  }

  // ObjectSelectionのインスタンス
  let object_selection;

  // lil-gui
  const gui_wrapper = document.getElementById("gui_wrapper");
  let gui;

  // レンダラーのDOMを格納するdiv要素
  const threejs_wrapper = document.getElementById("threejs_wrapper");

  // サイズ
  const sizes = {
    // 画面いっぱいに表示する場合
    // width: window.innerWidth,
    // height: window.innerHeight,

    // div要素のサイズに合わせる場合
    width: threejs_wrapper.clientWidth,
    height: threejs_wrapper.clientHeight
  };

  // シーン、カメラ、レンダラ
  let scene, camera, renderer;

  // ラベル表示用のCSS2Dレンダラ
  let label_renderer;

  // ライト、MeshBasicMaterialを使うならライトは不要
  let light1, light2;

  // マウス操作のコントロール
  let controls;

  // stats.jsを格納するdiv要素とstats.jsのインスタンス
  const stats_wrapper = document.getElementById("stats_wrapper");
  let stats;

  // ノードを表現するジオメトリ、これをもとにメッシュを作成する
  let node_geometry;

  // エッジのジオメトリを格納したもの
  // ノードの位置を変えたときに、対応するエッジの位置も変えるのに必要
  // ただ、ノードの位置は変えないのでいまのところは使っていない
  let edge_geometries = [];

  // 情報表示用のDOMエレメントとテキストを格納するオブジェクト
  let info_text_element = document.getElementById("info_text");
  let info_text = {};

  //
  // 初期化
  //
  function init() {

    // シーンを初期化
    scene = new THREE.Scene();
    scene.background = new THREE.Color( 0x000000 );

    // カメラを初期化
    camera = new THREE.PerspectiveCamera(
      70,                         // 視野角度 FOV
      sizes.width / sizes.height, // アスペクト比
      1,                          // 開始距離
      10000                       // 終了距離
    );
    camera.position.set(200, 200, 600);

    // ラベル用にlayer 1を有効化
    camera.layers.enable(1);

    // ライトを初期化
    light1 = new THREE.DirectionalLight(0xFFFFFF, 2.5);
    light1.position.set(1, 1, 1);
    scene.add(light1);

    light2 = new THREE.DirectionalLight(0xFFFFFF, 1.5);
    light2.position.set(-1, -1, 1);
    scene.add(light2);

    // レンダラーを初期化
    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true
    });
    renderer.setSize(sizes.width, sizes.height);
    renderer.setPixelRatio(window.devicePixelRatio);
    threejs_wrapper.appendChild(renderer.domElement);

    // ラベル用のCSS2Dレンダラを初期化
    label_renderer = new CSS2DRenderer();
    label_renderer.setSize(sizes.width, sizes.height);
    label_renderer.domElement.style.position = 'absolute';
    label_renderer.domElement.style.top = '0px';
    label_renderer.domElement.style.pointerEvents = 'none';
    threejs_wrapper.appendChild(label_renderer.domElement);

    // 軸を表示
    //
    //   Y(green)
    //    |
    //    +---- X(red)
    //   /
    //  Z(blue)
    //
    const axesHelper = new THREE.AxesHelper(10000);
    scene.add(axesHelper);

    // ノードのジオメトリ
    // 20面体
    // (radius : Float, detail : Integer)を指定する
    // detailを3にするとほぼ球体になる
    node_geometry = new THREE.IcosahedronGeometry(10, 2);

    // OrbitControls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = false;
    controls.autoRotateSpeed = 1.0;

    /*
    // TrackballControls
    // import { TrackballControls } from "three/controls/TrackballControls.js";
    controls = new TrackballControls(camera, renderer.domElement);
    controls.rotateSpeed = 10;
    controls.zoomSpeed = 2.0;
    controls.panSpeed = 0.1;
    controls.noZoom = false;
    controls.noPan = false;
    controls.staticMoving = false;
    controls.dynamicDampingFactor = 0.3;
    */

    if (gui_wrapper) {
      gui = new GUI({ container: gui_wrapper });

      // GUIでラベル表示のON/OFFを切り替える
      const label_gui = gui.addFolder('Label');
      label_gui
        .add(label_params, 'show_labels')
        .name('show node label')
        .onChange((value) => {
          // レイヤでラベルを表示するかどうかを切り替える
          camera.layers.toggle(1);

          // 非表示に変更したら、render()を呼んで画面上から消す
          if (camera.layers.test(1) === false) {
            label_renderer.render(scene, camera);
          }
        });

      label_gui
        .add(label_params, 'font_size')
        .options(['Small', 'Medium', 'Large'])
        .name('font size')
        .onChange((value) => {
          document.querySelectorAll('.label').forEach((label) => {
            label.classList.remove('small', 'medium', 'large');
            label.classList.add(value.toLowerCase());
          });
        });

      const orbit_gui = gui.addFolder('OrbitControls');
      orbit_gui
        .add(controls, 'autoRotate')
        .name('auto rotate')
    }

    // stats.jsを初期化
    if (stats_wrapper) {
      stats = new Stats();
      stats.dom.style.position = "relative";
      stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
      stats_wrapper.appendChild(stats.dom);
    }

    // ObjectSelectionを初期化
    // selectionが有効な場合はイベントハンドラを登録
    if (self.selection_enabled) {
      object_selection = new ObjectSelection({
        domElement: renderer.domElement,
        selected: function (obj) {
          // display info
          if (obj !== null) {
              const element_id = obj.name;
              if (!element_id) {
                return;
              }
              const element = self.graph.getElementById(element_id);
              if (!element) {
                return;
              }
              info_text.select = element.data.id;

              const world_position = obj.getWorldPosition(new THREE.Vector3());
              const projection = world_position.project(camera);
              const screen_x = Math.round((projection.x + 1) / 2 * sizes.width);
              const screen_y = Math.round(-(projection.y - 1) / 2 * sizes.height);
              console.log(`${element.data.id} (${screen_x}, ${screen_y})`);
          } else {
            delete info_text.select;
          }
        },
        clicked: function (obj) { }
      });
    }

    // テスト用
    // ボタンを押したらシーン上のグラフを全て削除
    document.getElementById("idButton1").addEventListener("click", function() {
      dispose();
    });

    // ブラウザのリサイズイベントを登録
    function onWindowResize() {
      // div要素のサイズに合わせてsizesを更新する
      sizes.width = threejs_wrapper.clientWidth;
      sizes.height = threejs_wrapper.clientHeight;

      camera.aspect = sizes.width / sizes.height;
      camera.updateProjectionMatrix();
      renderer.setSize(sizes.width, sizes.height);
      label_renderer.setSize(sizes.width, sizes.height);
    }
    window.addEventListener("resize", onWindowResize);
  }


  function dispose() {

    // シーン上のノードオブジェクトを削除する
    self.graph.getNodes().forEach(node => {

      let node_mesh = scene.getObjectByName(node.data.id);
      if (node_mesh) {

        while (node_mesh.children.length) {
          // ラベルを含む全ての子オブジェクトを削除
          const obj = node_mesh.children[0];
          console.log(`remove ${obj.name}`);
          obj.parent.remove(obj);
        }

        // console.log(`remove ${node_mesh.name}`);
        scene.remove(node_mesh);
        node_mesh.material.dispose();
        node_mesh.geometry.dispose();
      }

    });

    // シーン上のラインオブジェクトを取得して削除
    self.graph.getEdges().forEach(edge => {

      let line_mesh = scene.getObjectByName(edge.data.id);
      if (line_mesh) {
        // console.log(`remove ${line_mesh.name}`);
        scene.remove(line_mesh);
        line_mesh.material.dispose();
        line_mesh.geometry.dispose();
      }
    });

    edge_geometries = [];

    // シーンに残っているオブジェクトを表示する
    console.log(scene.children);
  }

  //
  // Graphクラスのインスタンスを描画する
  //
  function draw_graph() {
    self.graph.getNodes().forEach(function (node) {
      draw_node(node);
    });

    self.graph.getEdges().forEach(function (edge) {
      draw_edge(edge);
    });
  }


  function draw_node(node) {

    // MeshBasicMaterialは光源に反応せず平面的に
    // const material = new THREE.MeshBasicMaterial({ color: Math.random() * 0xe0e0e0, opacity: 0.8 });

    // MeshNormalMaterialはxyz軸の色に合わせて面の色も変化する(x=青、y=緑、z=赤)
    // 色の変化は光源によるものではなく、面の法線ベクトルによるもの
    // 色は指定できない
    // const material = new THREE.MeshNormalMaterial({transparent: true, opacity: 0.5});

    // MeshLambertMaterialは光源に反応する
    const material = new THREE.MeshLambertMaterial({ color: 0x00ff00, opacity: 0.8 });

    // メッシュ化
    let node_mesh = new THREE.Mesh(node_geometry, material);

    // 位置を設定
    node_mesh.position.set(node.position.x, node.position.y, node.position.z);

    // 名前を設定
    // scene.getObjectByName(node.data.id)でシーン上のオブジェクトが取得できる
    node_mesh.name = node.data.id

    // シーンに追加
    scene.add(node_mesh);

    // このノードに対応するラベル(CSS2DObject)を作成する
    let div = document.createElement('div');
    // CSSクラスを設定
    div.className = 'label';
    // CSSクラスを追加
    div.classList.add(label_params.font_size.toLowerCase());
    // テキストを設定
    div.textContent = node.data.label || node.data.id;
    const label_object = new CSS2DObject(div);
    label_object.name = `${node.data.id}_label`;
    // この座標は親になるノードからの相対位置
    label_object.position.set(0, 15, 0);
    // レイヤー 1 を設定
    label_object.layers.set(1);
    // シーンに加える必要はなく、
    // scene.add(label_object);
    // ノードの子にすればよい
    node_mesh.add(label_object);

    // node_meshからlabel_objectを辿れるように参照を保存（childに追加しているので必要ないかも）
    node_mesh.label_object = label_object;
  }


  function draw_edge(edge) {

    const source_id = edge.data.source;
    const target_id = edge.data.target;

    const source_mesh = scene.getObjectByName(source_id);
    const target_mesh = scene.getObjectByName(target_id);

    const line_geometry = new THREE.BufferGeometry();

    // 2点間の座標をverticesに追加
    const vertices = [];
    vertices.push(source_mesh.position.x);
    vertices.push(source_mesh.position.y);
    vertices.push(source_mesh.position.z);

    vertices.push(target_mesh.position.x);
    vertices.push(target_mesh.position.y);
    vertices.push(target_mesh.position.z);

    line_geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

    // edge_geometriesに追加しておく
    edge_geometries.push(line_geometry);

    const material = new THREE.LineBasicMaterial(
      {
        color: 0xffffff,
        linewidth: 1  // 多くのプラットフォームで無視される
      }
    );

    const line = new THREE.LineSegments(line_geometry, material);
    line.scale.x = line.scale.y = line.scale.z = 1;
    line.originalScale = 1;

    // lineに名前を設定
    // scene.getObjectByName(edge.data.id)でシーン上のオブジェクトが取得できる
    line.name = edge.data.id;

    scene.add(line);
  }


  function render() {

    /*
    // 線の位置の変更が必要なら、renderの中で更新を指示する
    for (let i = 0; i < geometries.length; i++) {
      geometries[i].attributes.position.needsUpdate = true;
    }
    */

    // ラベルをノードの子にしていない場合、ラベルの位置を個別に更新しなければいけない
    /*
    if (label_params.show_labels) {
      self.graph.getNodes().forEach(function (node) {
        // ノードに対応するオブジェクトを取得して、
        const node_mesh = scene.getObjectByName(node.data.id);
        const label_object = node_mesh.label_object

        // ノードの位置にラベルを移動
        label_object.position.x = node_mesh.position.x;
        label_object.position.y = node_mesh.position.y + 20;
        label_object.position.z = node_mesh.position.z;
      });
      label_renderer.render(scene, camera);
    }
    */

    // render selection
    if (self.selection_enabled) {
      object_selection.render(scene, camera);
    }

    // render scene
    renderer.render(scene, camera);

    // render label
    label_renderer.render(scene, camera);
  }


  function print_info_text() {
    var str = '';
    for(var index in info_text) {
      if(str !== '' && info_text[index] !== '') {
        str += " - ";
      }
      str += info_text[index];
    }
    info_text_element.innerHTML = str;
  }


  function animate() {
    // stats.jsを更新
    stats.update();

    // マウスコントロールを更新
    controls.update();

    // レンダラーを更新する際に、パラメータ変更にあわせて再描画したいので、render()を呼び出す
    // render()の中で renderer.render(scene, camera); をコールしている
    render();

    // マウス操作で選択したオブジェクトの情報を表示
    print_info_text();

    // 再帰処理
    requestAnimationFrame(animate);
  }


  this.draw = function() {
    init();
    draw_graph();
    animate();
  };

};


export let main = function() {

  // グラフを作成して、
  const graph = create_graph();

  // NetworkDiagramのインスタンスを作成
  const diagram = new NetworkDiagram({
    graph: graph,
    selection: true,
    show_labels: true,
    font_size: "Medium"
  });

  // 描画
  diagram.draw();

};