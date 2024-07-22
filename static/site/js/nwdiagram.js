
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



var ObjectSelection = function (parameters) {
  parameters = parameters || {};

  this.domElement = parameters.domElement || document;
  this.INTERSECTED = null;

  var self = this;

  var callbackSelected = parameters.selected;
  var callbackClicked = parameters.clicked;
  var mouse = { x: 0, y: 0 };

  this.domElement.addEventListener('mousemove', onDocumentMouseMove, false);
  function onDocumentMouseMove(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;
  }

  this.domElement.addEventListener('click', onDocumentMouseClick, false);
  function onDocumentMouseClick(event) {
    if (self.INTERSECTED) {
      if (typeof callbackClicked === 'function') {
        callbackClicked(self.INTERSECTED);
      }
    }
  }

  this.render = function (scene, camera) {
    var vector = new THREE.Vector3(mouse.x, mouse.y, 0.5);
    vector.unproject(camera);

    var raycaster = new THREE.Raycaster(camera.position, vector.sub(camera.position).normalize());

    var intersects = raycaster.intersectObject(scene, true);

    if (intersects.length > 0) {
      if (intersects[0].object.name == "grid_helper") {
      } else {
        if (this.INTERSECTED != intersects[0].object) {
          if (this.INTERSECTED) {
            this.INTERSECTED.material.color.setHex(this.INTERSECTED.currentHex);
          }

          this.INTERSECTED = intersects[0].object;
          this.INTERSECTED.currentHex = this.INTERSECTED.material.color.getHex();
          this.INTERSECTED.material.color.setHex(0xff0000);
          if (typeof callbackSelected === 'function') {
            callbackSelected(this.INTERSECTED);
          }
        }

      }

    } else {
      if (this.INTERSECTED) {
        this.INTERSECTED.material.color.setHex(this.INTERSECTED.currentHex);
      }
      this.INTERSECTED = null;
      if (typeof callbackSelected === 'function') {
        callbackSelected(this.INTERSECTED);
      }
    }
  };
};


var Label = function(text, parameters) {
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



var CreateGraph = function (options) {

  let cy;

  function init() {
    cytoscape.warnings(false);
    cy = window.cy = cytoscape({
      container: document.getElementById('cy'),
      minZoom: 0.5,
      maxZoom: 3,
      wheelSensitivity: 0.2,

      boxSelectionEnabled: false,
      autounselectify: true,
      hideEdgesOnViewport: false, // hide edges during dragging ?
      textureOnViewport: false,

      layout: { 'name': "preset" },
      style: [],
      elements: []
    });
    cytoscape.warnings(true);
  }


  function create_graph() {

    let id = 1;
    let node_id = `node_${id}`;
    id += 1;

    cy.add(
      {
        group: 'nodes',
        data: {
          id: node_id,
          label: `This is the root node ${id}`
        }
      }
    );

    const root_node = cy.getElementById(node_id);

    let nodes = [];
    nodes.push(root_node);

    let steps = 1;
    let num_steps = 10;
    while(nodes.length !== 0 && steps < num_steps) {

      // nodesから先頭のノードを取り出す
      let source_node = nodes.shift();

      var num_edges = 10;
      for(let i=1; i <= num_edges; i++) {
        let target_node_id = `node_${id}`;
        id += 1;
        cy.add(
        {
          group: 'nodes',
          data: {
            id: target_node_id,
            label: `This is node ${target_node_id}`
          }
        });
        let target_node = cy.getElementById(target_node_id);

        // nodesにtarget_nodeを追加し、target_nodeの先にもノードを追加していく
        nodes.push(target_node);

        // エッジを追加
        cy.add(
          {
            group: 'edges',
            data: {
              id: 'edge_' + source_node.id() + '_' + target_node.id(),
              source: source_node.id(),
              target: target_node.id()
            }
          }
        );
      }
      steps++;
    }
  }


  init();
  create_graph();

  return cy;
}



var NetworkDiagram = function (options) {

  // 引数が渡されなかった場合は空のオブジェクトを代入
  options = options || {};

  // アロー関数内でthisを使うと混乱するのでselfに代入
  const self = this;

  // cytoscape.jsのインスタンス
  self.cy = options.cy;

  // オブジェクトを選択できるかどうか
  self.selection_enabled = options.selection || true;

  // ノードのラベルを表示するかどうか
  self.show_labels = options.show_labels || true;

  // SelectionObject()のインスタンス
  let object_selection;

  // UIデバッグ
  const gui = new GUI();

  // サイズ
  const sizes = {
    width: window.innerWidth,
    height: window.innerHeight,
  };

  // シーン、カメラ、レンダラ
  let scene, camera, renderer;

  // マウス操作のコントロール
  let controls;

  // ノードを表現するジオメトリ、これをもとにメッシュを作成する
  let node_geometry; // = new THREE.SphereGeometry(50);

  // ノードとエッジのジオメトリを格納したもの
  // render()時に更新を指示するために使う
  let geometries = [];

  // 情報表示
  let info_text = {};

  //
  // 初期化
  //
  function init() {

    // シーンを初期化
    scene = new THREE.Scene();

    // カメラを初期化
    camera = new THREE.PerspectiveCamera(
      45,                         // 視野角度
      sizes.width / sizes.height, // アスペクト比 width/height
      1,                          // 開始距離
      100000                      // 終了距離
    );
    camera.position.x = 10000;
    camera.position.y = 10000;
    camera.position.z = 10000;

    // レンダラーを初期化
    renderer = new THREE.WebGLRenderer({
      canvas: document.querySelector("#threejs"),
      alpha: true,
      antialias: true
    });
    // 画面サイズいっぱいにレンダラを設定
    renderer.setSize(sizes.width, sizes.height);
    renderer.setPixelRatio(window.devicePixelRatio);
    // レンダラーをHTMLの要素に加えてブラウザでレンダリングできるようにする
    document.body.appendChild(renderer.domElement);

    // グリッドヘルパー
    // const grid_helper = new THREE.GridHelper(10000, 10000);
    // grid_helper.name = "grid_helper";
    // scene.add(grid_helper);

    // ジオメトリを初期化
    // ノードを球体で表現
    node_geometry = new THREE.SphereGeometry(50);

    // マウス操作のコントロール OrbitControls
    // controls = new OrbitControls(camera, renderer.domElement);
    // controls.enableDamping = true;

    controls = new TrackballControls(camera, renderer.domElement);
    controls.rotateSpeed = 10;
    controls.zoomSpeed = 2.0;
    controls.panSpeed = 0.1;
    controls.noZoom = false;
    controls.noPan = false;
    controls.staticMoving = false;
    controls.dynamicDampingFactor = 0.3;
    controls.addEventListener('change', render);

    // selectionが有効な場合はイベントハンドラを登録
    if (self.selection_enabled) {
      object_selection = new ObjectSelection({
        domElement: renderer.domElement,
        selected: function (obj) {
          // display info
          if (obj !== null) {
              info_text.select = "Object " + obj.id;
              // console.log(obj);
              const world_position = obj.getWorldPosition(new THREE.Vector3());
              const projection = world_position.project(camera);
              const screen_x = Math.round((projection.x + 1) / 2 * window.innerWidth);
              const screen_y = Math.round(-(projection.y - 1) / 2 * window.innerHeight);
              console.log(`${obj.id} (${screen_x}, ${screen_y})`);
          } else {
            delete info_text.select;
          }
        },
        clicked: function (obj) { }
      });
    }

    // info_textを表示する要素を追加
    let info = document.createElement("div");
    let id_attr = document.createAttribute("id");
    id_attr.nodeValue = "info_text";
    info.setAttributeNode(id_attr);
    document.body.appendChild(info);

    // ブラウザのリサイズイベントを登録
    function onWindowResize() {
      renderer.setSize(sizes.width, sizes.height);
      camera.aspect = sizes.width / sizes.height;
      camera.updateProjectionMatrix();
    }
    window.addEventListener("resize", onWindowResize);
  }


  //
  // draw cytoscape.js graph
  //
  function draw_graph() {
    cy.nodes().forEach(function (node) {
      draw_node(node);
    });

    cy.edges().forEach(function (edge) {
      draw_edge(edge.source(), edge.target());
    });
  }


  function draw_node(node) {

    if (self.show_labels) {
      let label_object;
      if (node.data('label') !== undefined) {
        label_object = new Label(node.data('label'));
      } else {
        label_object = new Label(node.id());
      }
      node.data('label_object', label_object);
      scene.add(label_object);
    }

    let draw_object = new THREE.Mesh(node_geometry, new THREE.MeshBasicMaterial({ color: Math.random() * 0xe0e0e0, opacity: 0.8 }));

    const area = 5000;
    draw_object.position.x = Math.floor(Math.random() * (area + area + 1) - area);
    draw_object.position.y = Math.floor(Math.random() * (area + area + 1) - area);
    draw_object.position.z = Math.floor(Math.random() * (area + area + 1) - area);

    node.data('draw_object', draw_object);

    scene.add(draw_object);
  }


  function draw_edge(source, target) {

    let material = new THREE.LineBasicMaterial({ color: 0x606060 });

    let tmp_geo = new THREE.BufferGeometry();
    let vertices = [];
    vertices.push(source.data('draw_object').position.x);
    vertices.push(source.data('draw_object').position.y);
    vertices.push(source.data('draw_object').position.z);
    vertices.push(target.data('draw_object').position.x);
    vertices.push(target.data('draw_object').position.y);
    vertices.push(target.data('draw_object').position.z);
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
    cy.nodes().forEach(function (node) {
      const draw_object = node.data('draw_object');

      // show_labelsフラグがtrueの場合はラベルを表示
      if (self.show_labels) {
        const label_object = node.data('label_object');
        // node.data('label_object')がundefinedの場合はラベルを追加
        if (label_object === undefined) {
          const node_label = node.data('label') || node.id();
          const label_object = new Label(node_label, draw_object);
          // ノードに保存しておいて、次回のrender()時に位置を更新する
          node.data('label_object', label_object);
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
        if (node.data('label_object') !== undefined) {
          scene.remove(node.data('label_object'));
          node.data('label_object', undefined);
        }
      }
    });

    /*

    const nodes = cy.nodes();
    if (self.show_labels) {
      for (let i = 0; i < nodes.length; i++) {
        let node = nodes[i];
        if (node.data('label_object') !== undefined) {
          node.data('label_object').position.x = node.data('draw_object').position.x;
          node.data('label_object').position.y = node.data('draw_object').position.y - 100;
          node.data('label_object').position.z = node.data('draw_object').position.z;
          node.data('label_object').lookAt(camera.position);
        } else {
          var label_object;
          if (node.data('label') !== undefined) {
            label_object = new Label(node.data('label'), node.data('draw_object'));
          } else {
            label_object = new Label(node.id(), node.data.draw_object);
          }
          node.data.label_object = label_object;
          scene.add(node.data.label_object);
        }
      }
    } else {
      for (let i=0; i < nodes.length; i++) {
        let node = nodes[i];
        if (node.data('label_object') !== undefined) {
          scene.remove(node.data('label_object'));
          node.data('label_object', undefined);
        }
      }

    }

    */

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
    document.getElementById("info_text").innerHTML = str;
  }


  function animate() {
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


const cy = CreateGraph();

new NetworkDiagram({
  cy: cy,
  selection: true,
  show_labels: true,
});
