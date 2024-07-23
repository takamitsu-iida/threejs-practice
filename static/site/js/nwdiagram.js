
import * as THREE from "three";
import { TrackballControls } from "TrackballControls";
/*
    <!-- three.js -->
    <script type="importmap">
      {
        "imports": {
          "three": "/static/build/three.module.js",
          "OrbitControls": "/static/controls/OrbitControls.js",
          "TrackballControls": "/static/controls/TrackballControls.js"
        }
      }
    </script>
*/

// import * as THREE from "../../build/three.module.js";
// import { OrbitControls } from "./controls/OrbitControls.js";
// import { TrackballControls } from "./controls/TrackballControls.js";

// lil-gui
// https://github.com/georgealways/lil-gui
import { GUI } from "https://cdn.jsdelivr.net/npm/lil-gui@0.19/+esm";



export var ObjectSelection = function (parameters) {

  // 参照
  // 初めてのThree.js 第二版
  // P235
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
    // DOM要素(canvas)を取得
    // eventから取得してもよいし、parametersで渡されたものを使ってもよい
    // const element = self.domElement;
    const element = event.currentTarget;

    // その要素の位置を取得
    const clientRect = element.getBoundingClientRect();

    // 要素上のマウス座標
    const x = event.clientX - clientRect.x;
    const y = event.clientY - clientRect.y;

    // 要素の幅、高さ (paddingが含まれるのでCSSで0にしておくこと)
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
    var intersects = raycaster.intersectObject(scene, true);

    if (intersects.length > 0) {

      // 光線がオブジェクトにぶつかっていれば、
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


export var Label = function(text, parameters) {
  parameters = parameters || {};

  var labelCanvas = document.createElement( "canvas" );

  function create() {
    var xc = labelCanvas.getContext("2d");
    var fontsize = "40pt";

    // set font size to measure the text
    xc.font = fontsize + " Arial";
    var len = xc.measureText(text).width;

    labelCanvas.setAttribute('width', len);

    // set font size again cause it will be reset
    // when setting a new width
    xc.font = fontsize + " Arial";
    xc.textBaseline = 'top';
    xc.fillText(text, 0, 0);

    var geometry = new THREE.BoxGeometry(len, 200, 0);
    var xm = new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(
        labelCanvas,
        THREE.UVMapping,
        THREE.ClampToEdgeWrapping,
        THREE.ClampToEdgeWrapping,
        THREE.LinearFilter,
        THREE.LinearFilter
      ),
      transparent: true
    });
    xm.map.needsUpdate = true;

    // set text canvas to cube geometry
    var labelObject = new THREE.Mesh(geometry, xm);
    return labelObject;
  }

  return create();
};



export class Graph {

  constructor(elements) {
    this.elements = [];

    let eles;
    if (elements === undefined || elements === null) {
      eles = [];
    } else if (typeof elements === "object") {
      elements = [elements];
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

  getElementById(id) {
    return this.elements.find((element) => element.data.id === id);
  }

  addNode(node) {
    if ("data" in node === false || "id" in node.data === false) {
      throw new Error("node.data.id is required");
    }
    if ("group" in node === false) {
      node["group"] = "nodes";
    }
    this.elements.push(node);
  }

  addEdge(edge) {
    if ("data" in edge === false || "id" in edge.data === false) {
      throw new Error("edge.data.id is required");
    }
    if ("group" in edge === false) {
      node["group"] = "edges"
    }
    this.elements.push(edge);
  }

  getNodes() {
    return this.elements.filter((element) => element.group === "nodes");
  }

  getEdges() {
    return this.elements.filter((element) => element.group === "edges");
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
      label: `This is the root node ${id}`
    }
  };

  graph.addNode(root);

  const nodes = [root];
  let steps = 1;
  let num_steps = 5;
  while(nodes.length !== 0 && steps < num_steps) {

    // nodesから先頭のノードを取り出す
    let source_node = nodes.shift();

    var num_edges = 5;
    for(let i=1; i <= num_edges; i++) {
      let target_node_id = `node_${id}`;
      id += 1;
      let target_node = {
        group: 'nodes',
        data: {
          id: target_node_id,
          label: `Node ${target_node_id}`
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



export var NetworkDiagram = function (options) {

  // 引数が渡されなかった場合は空のオブジェクトを代入
  options = options || {};

  // アロー関数内でthisを使うと混乱するのでselfに代入
  const self = this;

  // Graphクラスのインスタンス
  self.graph = options.graph;

  // オブジェクトを選択できるかどうか
  self.selection_enabled = options.selection || true;

  // ノードのラベルを表示するかどうか
  self.show_labels = options.show_labels || true;

  // SelectionObject()のインスタンス
  let object_selection;

  // UIデバッグ
  const gui = new GUI({ container: document.getElementById("gui_wrapper") });

  // カメラ位置をGUIで変更できるようにする
  const camera_params = {
    position: new THREE.Vector3(10000, 10000, 10000)
  }

  // サイズ
  const sizes = {
    width: window.innerWidth,
    height: window.innerHeight,
  };

  // シーン、カメラ、レンダラ
  let scene, camera, renderer;

  // マウス操作のコントロール
  let controls;

  // stats.js のインスタンス
  let stats;

  // ノードを表現するジオメトリ、これをもとにメッシュを作成する
  let node_geometry; // = new THREE.SphereGeometry(50);

  // ノードとエッジのジオメトリを格納したもの
  // render()時に更新を指示するために使う
  let geometries = [];

  // 情報表示
  let info_text_element = document.getElementById("info_text");
  let info_text = {};

  //
  // 初期化
  //
  function init() {

    // ここ、直したい
    const right_panel = document.getElementsByClassName("right_panel")[0];
    sizes.width = right_panel.clientWidth;
    sizes.height = right_panel.clientHeight;

    // シーンを初期化
    scene = new THREE.Scene();

    // カメラを初期化
    camera = new THREE.PerspectiveCamera(
      45,                         // 視野角度
      sizes.width / sizes.height, // アスペクト比 width/height
      1,                          // 開始距離
      100000                      // 終了距離
    );
    camera.position.set(camera_params.position.x, camera_params.position.y, camera_params.position.z);

    // レンダラーを初期化
    renderer = new THREE.WebGLRenderer({
      canvas: document.getElementById("threejs"),
      alpha: true,
      antialias: true
    });
    renderer.setSize(sizes.width, sizes.height);
    renderer.setPixelRatio(window.devicePixelRatio);

    // レンダラーをHTMLの要素に加えてブラウザでレンダリングできるようにする
    // document.body.appendChild(renderer.domElement);

    // グリッドヘルパー
    // const grid_helper = new THREE.GridHelper(10000, 10000);
    // grid_helper.name = "grid_helper";
    // scene.add(grid_helper);

    // ジオメトリを初期化
    // ノードを球体で表現
    node_geometry = new THREE.SphereGeometry(50);

    // マウス操作のコントロール

    // OrbitControls
    // controls = new OrbitControls(camera, renderer.domElement);
    // controls.enableDamping = true;

    // TrackballControls
    controls = new TrackballControls(camera, renderer.domElement);
    controls.rotateSpeed = 10;
    controls.zoomSpeed = 2.0;
    controls.panSpeed = 0.1;
    controls.noZoom = false;
    controls.noPan = false;
    controls.staticMoving = false;
    controls.dynamicDampingFactor = 0.3;
    controls.addEventListener('change', () => {
      // camera_paramsに変更を反映
      camera_params.position.copy( camera.position );
      // カメラ位置が変わったらレンダーを呼んで反映
      render();
    });

    // GUIでカメラ位置を変更できるようにする
    const camera_gui = gui.addFolder('camera');
    camera_gui.add(camera_params.position, 'x').min(-10000).max(10000).name('position x').listen().onChange((value) => { camera.position.x = value; });
    camera_gui.add(camera_params.position, 'y').min(-10000).max(10000).name('position y').listen().onChange((value) => { camera.position.y = value; });
    camera_gui.add(camera_params.position, 'z').min(-10000).max(10000).name('position z').listen().onChange((value) => { camera.position.z = value; })

    // stats.jsを初期化
    stats = new Stats();
    stats.dom.style.position = "relative";
    stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
    document.getElementById("stats_wrapper").appendChild(stats.dom);

    // ObjectSelectionを初期化
    // selectionが有効な場合はイベントハンドラを登録
    if (self.selection_enabled) {
      object_selection = new ObjectSelection({
        domElement: renderer.domElement,
        selected: function (obj) {
          // display info
          if (obj !== null) {
              const node = obj.node;
              if (!node) {
                return;
              }
              info_text.select = node.data.id;

              const world_position = obj.getWorldPosition(new THREE.Vector3());
              const projection = world_position.project(camera);
              const screen_x = Math.round((projection.x + 1) / 2 * sizes.width);
              const screen_y = Math.round(-(projection.y - 1) / 2 * sizes.height);
              console.log(`${node.data.id} (${screen_x}, ${screen_y})`);
          } else {
            delete info_text.select;
          }
        },
        clicked: function (obj) { }
      });
    }

    // ブラウザのリサイズイベントを登録
    function onWindowResize() {
      renderer.setSize(sizes.width, sizes.height);
      camera.aspect = sizes.width / sizes.height;
      camera.updateProjectionMatrix();
    }
    window.addEventListener("resize", onWindowResize);

  }


  //
  // Graphクラスのインスタンスを描画する
  //
  function draw_graph() {
    self.graph.getNodes().forEach(function (node) {
      draw_node(node);
    });

    self.graph.getEdges().forEach(function (edge) {
      draw_edge(edge.data.source, edge.data.target);
    });
  }


  function draw_node(node) {

    if (self.show_labels) {
      let label_object;
      if (node.data.label !== undefined) {
        label_object = new Label(node.data.label);
      } else {
        label_object = new Label(node.data.id);
      }
      node.data.label_object = label_object;
      scene.add(label_object);
    }

    let draw_object = new THREE.Mesh(node_geometry, new THREE.MeshBasicMaterial({ color: Math.random() * 0xe0e0e0, opacity: 0.8 }));

    const area = 5000;
    draw_object.position.x = Math.floor(Math.random() * (area + area + 1) - area);
    draw_object.position.y = Math.floor(Math.random() * (area + area + 1) - area);
    draw_object.position.z = Math.floor(Math.random() * (area + area + 1) - area);

    // three.jsのオブジェクトにグラフのノードを紐付ける
    draw_object.node = node;

    // 逆に、グラフのノードにthree.jsのオブジェクトを紐付ける
    node.data.draw_object = draw_object;

    // シーンに追加
    scene.add(draw_object);
  }


  function draw_edge(source_id, target_id) {

    let source = self.graph.getElementById(source_id);
    let target = self.graph.getElementById(target_id);

    let material = new THREE.LineBasicMaterial({ color: 0x606060 });

    let tmp_geo = new THREE.BufferGeometry();
    let vertices = [];
    vertices.push(source.data.draw_object.position.x);
    vertices.push(source.data.draw_object.position.y);
    vertices.push(source.data.draw_object.position.z);
    vertices.push(target.data.draw_object.position.x);
    vertices.push(target.data.draw_object.position.y);
    vertices.push(target.data.draw_object.position.z);
    tmp_geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometries.push(tmp_geo);

    let line = new THREE.LineSegments(tmp_geo, material);
    line.scale.x = line.scale.y = line.scale.z = 1;
    line.originalScale = 1;

    scene.add(line);
  }


  //
  // render
  //
  function render() {

    /*
    // ノードを移動させているなら、renderの中で更新する
    for (let i = 0; i < geometries.length; i++) {
      geometries[i].attributes.position.needsUpdate = true;
    }
    */


    // ラベル表示
    self.graph.getNodes().forEach(function (node) {
      const draw_object = node.data.draw_object;

      // show_labelsフラグがtrueの場合はラベルを表示
      if (self.show_labels) {
        const label_object = node.data.label_object;
        // node.data('label_object')がundefinedの場合はラベルを追加
        if (label_object === undefined) {
          const node_label = node.data.label || node.data.id;
          const label_object = new Label(node_label, draw_object);
          // ノードに保存しておいて、次回のrender()時に位置を更新する
          node.data.label_object = label_object;
          scene.add(label_object);
        } else {
          // すでにあるなら、位置を更新
          label_object.position.x = draw_object.position.x;
          label_object.position.y = draw_object.position.y - 100;
          label_object.position.z = draw_object.position.z;
          label_object.lookAt(camera.position);
        }
      } else {
        // show_labelsフラグがfalseの場合はラベルを削除
        if (node.data.label_object !== undefined) {
          scene.remove(node.data.label_object);
          node.data.label_object = undefined;
        }
      }
    });

    // render selection
    if (self.selection_enabled) {
      object_selection.render(scene, camera);
    }

    // render scene
    renderer.render(scene, camera);
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
    // render()内部で
    // renderer.render(scene, camera);
    // をコールしている
    render();

    // マウス操作で選択したオブジェクトの情報を表示
    print_info_text();

    // 再帰処理
    requestAnimationFrame(animate);
  }


  init();
  draw_graph();
  animate();
};

export let main = function() {

  const graph = create_graph();

  new NetworkDiagram({
    graph: graph,
    selection: true,
    show_labels: true,
  });

};