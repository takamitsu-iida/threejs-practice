import * as THREE from "three";

// マウス操作
import { OrbitControls } from 'three/controls/OrbitControls.js';

// CSS2DRendererを用いたラベル表示
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
        document.getElementById("threejsContainer").appendChild(WebGL.getWebGLErrorMessage());
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
    mouse.x = +(x / w) * 2 - 1;
    mouse.y = -(y / h) * 2 + 1;

  }

  // クリックイベントを登録
  this.domElement.addEventListener('click', onDocumentMouseClick, false);

  function onDocumentMouseClick(event) {
    event.preventDefault();
    event.stopPropagation();

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

    // 光線がオブジェクトにぶつかっていて、それが選択可能なものであれば、
    if (intersects.length > 0 && intersects[0].object.selectable) {

      // 前回と違うオブジェクトに光線が当たっているなら、
      if (this.INTERSECTED != intersects[0].object) {

        // 前回と違うオブジェクトに光線が当たっているなら、古いオブジェクトは元の色に戻す
        if (this.INTERSECTED) {
          this.INTERSECTED.material.color.setHex(this.INTERSECTED.currentHex);
          // this.INTERSECTED.material.wireframe = true;
        }

        // 新しいオブジェクトを選択して、
        this.INTERSECTED = intersects[0].object;

        // 現在の色をオブジェクト内に保存して、
        this.INTERSECTED.currentHex = this.INTERSECTED.material.color.getHex();

        // 色を変える
        this.INTERSECTED.material.color.setHex(0xff0000);
        // this.INTERSECTED.material.wireframe = true;

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
        // this.INTERSECTED.material.wireframe = false;
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
// 2024.07.25 CSS2DRenderer.jsを利用することにしたので使っていないが、
// こっちの方が性能がよければ復活させる
//
export let CanvasLabel = function (parameters) {

  if (!parameters || !parameters.hasOwnProperty("labelName")) {
    return null;
  }

  const labelName = parameters.labelName;
  const labelText = parameters.hasOwnProperty("labelText") ? parameters.labelText : "";
  const labelLayer = parameters.hasOwnProperty("labelLayer") ? parameters.labelLayer : 1; // 指定がない場合はレイヤ 1 に設定

  let canvas = document.createElement("canvas");

  function create() {
    const ctx = canvas.getContext("2d");

    // canvasのデフォルトフォントは "10px sans-serif" になっているのでフォントを大きくする
    const fontSize = 40;
    ctx.font = `${fontSize}pt Arial`;

    // measureTextで必要な幅を調べる
    const width = ctx.measureText(labelText).width;

    // canvasのサイズを必要な幅に設定
    canvas.setAttribute('width', width);

    // canvasの幅を変更したので、再度フォントの設定を行う
    ctx.font = `${fontSize}pt Arial`;
    ctx.fillStyle = 'rgba(255, 255, 255, 1)';
    ctx.textBaseline = 'top';
    ctx.fillText(labelText, 0, 0);

    // (width, height, depth)
    const geometry = new THREE.BoxGeometry(width, 100, 0);

    const material = new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(
        canvas,
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
    const label = new THREE.Mesh(geometry, material);

    // オブジェクトに名前を設定
    label.name = labelName;

    // ラベルはレイヤ 1 に設定
    label.layers.set(labelLayer);

    return label;
  }

  return create();
};



function makeTextSprite(message, parameters) {
  /*
    var spritey = makeTextSprite( " " + i + " ", { fontsize: 32, backgroundColor: {r:255, g:100, b:100, a:1} } );
    spritey.position = topo.vertex[i].vector3.clone().multiplyScalar(1.1);
    scene.add( spritey );
  */

  if (parameters === undefined) parameters = {};

  var fontface = parameters.hasOwnProperty("fontface") ? parameters["fontface"] : "Arial";
  var fontsize = parameters.hasOwnProperty("fontsize") ? parameters["fontsize"] : 18;
  var borderThickness = parameters.hasOwnProperty("borderThickness") ? parameters["borderThickness"] : 4;
  var borderColor = parameters.hasOwnProperty("borderColor") ? parameters["borderColor"] : { r: 0, g: 0, b: 0, a: 1.0 };
  var backgroundColor = parameters.hasOwnProperty("backgroundColor") ? parameters["backgroundColor"] : { r: 255, g: 255, b: 255, a: 1.0 };

  var spriteAlignment = THREE.SpriteAlignment.topLeft;

  var canvas = document.createElement('canvas');
  var context = canvas.getContext('2d');
  context.font = "Bold " + fontsize + "px " + fontface;

  // get size data (height depends only on font size)
  var metrics = context.measureText(message);
  var textWidth = metrics.width;

  // background color
  // context.fillStyle = "rgba(" + backgroundColor.r + "," + backgroundColor.g + "," + backgroundColor.b + "," + backgroundColor.a + ")";
  context.fillStyle = `rgba(${backgroundColor.r},${backgroundColor.g},${backgroundColor.b},${backgroundColor.a})`;

  // border color
  // context.strokeStyle = "rgba(" + borderColor.r + "," + borderColor.g + "," + borderColor.b + "," + borderColor.a + ")";
  context.strokeStyle = `rgba(${borderColor.r},${borderColor.g},${borderColor.b},${borderColor.a})`;

  context.lineWidth = borderThickness;

  roundRect(context, borderThickness / 2, borderThickness / 2, textWidth + borderThickness, fontsize * 1.4 + borderThickness, 6);
  // 1.4 is extra height factor for text below baseline: g,j,p,q.

  // text color
  context.fillStyle = "rgba(0, 0, 0, 1.0)";

  context.fillText(message, borderThickness, fontsize + borderThickness);

  // canvas contents will be used for a texture
  var texture = new THREE.Texture(canvas)
  texture.needsUpdate = true;

  var spriteMaterial = new THREE.SpriteMaterial({
    map: texture,
    useScreenCoordinates: false,
    alignment: spriteAlignment
  });

  var sprite = new THREE.Sprite(spriteMaterial);

  sprite.scale.set(100, 50, 1.0);

  return sprite;
}

// function for drawing rounded rectangles
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}


//
// グラフを表現するクラス
//
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
    {
      const found = this.nodes.find((node) => node.data.id === id);
      if (found) {
        return found;
      }
    }
    {
      const found = this.edges.find((edge) => edge.data.id === id);
      if (found) {
        return found;
      }
    }
    return null;
  }

}


export function createSampleGraph(options) {

  let id = 1;
  let nodeId = `node_${id}`;
  id += 1;

  const graph = new Graph();

  // ルートノードを追加
  const root = {
    group: 'nodes',
    data: {
      id: nodeId,
      label: `This is the root ${id}`
    },
    position: { x: 0, y: 0, z: 0 }
  };
  graph.addNode(root);

  const area = 300;
  const nodes = [root];
  const numSteps = 5;
  const numEdges = 5;
  let steps = 1;
  while (nodes.length !== 0 && steps < numSteps) {

    // nodesから先頭のノードを取り出す
    const sourceNode = nodes.shift();

    // numEdgesの数だけそこからノードを追加
    for (let i = 1; i <= numEdges; i++) {
      let targetNodeId = `node_${id}`;
      id += 1;
      const targetNode = {
        group: 'nodes',
        data: {
          id: targetNodeId,
        },
        position: {
          x: Math.floor(Math.random() * (area + area + 1) - area),
          y: Math.floor(Math.random() * (area + area + 1) - area),
          z: Math.floor(Math.random() * (area + area + 1) - area)
        }
      };
      graph.addNode(targetNode);

      // nodesにtargetNodeを追加し、targetNodeの先にもノードを追加していく
      nodes.push(targetNode);

      // エッジを追加
      graph.addEdge(
        {
          group: 'edges',
          data: {
            id: 'edge_' + sourceNode.data.id + '_' + targetNode.data.id,
            source: sourceNode.data.id,
            target: targetNode.data.id
          }
        }
      );
    }
    steps++;
  }

  return graph;
}


export function createSampleGraph2(options) {
  const clusters = [
    {
      clusterId: 1,
      numTier3: 20
    },
    {
      clusterId: 2,
      numTier3: 20
    },
    {
      clusterId: 3,
      numTier3: 20
    },
    {
      clusterId: 4,
      numTier3: 20
    },
    {
      clusterId: 5,
      numTier3: 20
    },
    {
      clusterId: 6,
      numTier3: 20
    },
    {
      clusterId: 7,
      numTier3: 20
    },
    {
      clusterId: 8,
      numTier3: 20
    },
    {
      clusterId: 9,
      numTier3: 20
    },
    {
      clusterId: 10,
      numTier3: 20
    },
  ];

  return new FiveStageClosGraph({ clusters: clusters }).circularLayout();
}


export class FiveStageClosGraph {

  clusters;
  /*
  クラスタオブジェクトの配列
  clusters = [
    {
      clusterId: 1,
      numTier3: 10
    }
  ];
  */

  tier3Radius = 200;
  tier3Interval = 30;

  tier2Radius = 160;
  tier2Height = 100;

  // Graphクラスのインスタンス
  graph;

  constructor(options) {
    this.options = options || {};

    this.clusters = options.hasOwnProperty("clusters") ? options.clusters : [];

    this.tier3Radius = options.hasOwnProperty("tier3Radius") ? options.tier3Radius : this.tier3Radius;
    this.tier3Interval = options.hasOwnProperty("tier3Interval") ? options.tier3Interval : this.tier3Interval;

    this.graph = new Graph();
  }


  circularLayout() {

    const numClusters = this.clusters.length;
    const tier3Theta = 2 * Math.PI / numClusters;

    this.clusters.forEach((cluster, index) => {
      const clusterId = cluster.clusterId;
      const numTier3 = cluster.numTier3;

      const theta = tier3Theta * index;
      console.log(tier3Theta);

      // tier3のノードを追加
      for (let i = 0; i < numTier3; i++) {
        const nodeId = `cluster${clusterId}_tier3_${i}`;
        const radius = this.tier3Radius + this.tier3Interval * i;
        const x = radius * Math.cos(theta);
        const y = 0;
        const z = radius * Math.sin(theta);

        const node = {
          group: 'nodes',
          data: {
            id: nodeId,
            label: nodeId
          },
          position: {x, y, z}
        };
        this.graph.addNode(node);
      }

      // tier2のノード 0系, 1系 を追加
      for (let i = 0; i < 2; i++) {

        const nodeId = `cluster${clusterId}_tier2_${i}`;
        const radius = this.tier2Radius;
        const deltaTheta = (2 * Math.PI /(numClusters * 2)) / 2;
        let tier2Theta = (i === 0) ? theta + deltaTheta : theta - deltaTheta;
        const x = radius * Math.cos(tier2Theta);
        const y = this.tier2Height;
        const z = radius * Math.sin(tier2Theta);

        const node = {
          group: 'nodes',
          data: {
            id: nodeId,
            label: nodeId
          },
          position: {x, y, z}
        };
        this.graph.addNode(node);

        // tier2とtier3をつなぐエッジを追加
        for (let j = 0; j < numTier3; j++) {
          const tier3NodeId = `cluster${clusterId}_tier3_${j}`;
          const edge = {
            group: 'edges',
            data: {
              id: `edge_${nodeId}_${tier3NodeId}`,
              source: nodeId,
              target: tier3NodeId
            }
          };
          this.graph.addEdge(edge);
        }


      }


    });
    return this.graph;
  }


}




class Node extends THREE.Group {

  // ノードを表現するメッシュ
  sphere;

  // 注目を集めるためのコーン型のメッシュ
  cone;

  // ラベル表示用のCSS2DObject
  label;

  // 元になったグラフのノードのデータ
  node;

  constructor(node, options) {

    super();

    options = options || {}

    // ノードのデータを保持しておく
    this.node = node;

    // グループに名前を設定
    this.name = `${this.node.data.id}_group`

    // 位置を設定
    this.position.set(this.node.position.x, this.node.position.y, this.node.position.z);

    //
    // ノード本体を表現する20面体を作成
    //
    {
      // ジオメトリを作成
      // 20面体は (radius : Float, detail : Integer) を指定して作成する
      // detailを3にするとほぼ球体になる
      const radius = options.hasOwnProperty("radius") ? options.radius : 10;
      const detail = options.hasOwnProperty("detail") ? options.detail : 2;
      const geometry = new THREE.IcosahedronGeometry(radius, detail);

      // マテリアルを作成

      // テスト用
      // MeshBasicMaterialは光源に反応せず平面的に描画する
      // const material = new THREE.MeshBasicMaterial({ color: Math.random() * 0xe0e0e0, opacity: 0.8 });
      // テスト用
      // MeshNormalMaterialはxyz軸の色に合わせて面の色も変化する(x=青、y=緑、z=赤)
      // 色の変化は光源によるものではなく、面の法線ベクトルによるもの
      // const material = new THREE.MeshNormalMaterial({transparent: true, opacity: 0.5});

      // MeshLambertMaterialは光源に反応する
      const material = new THREE.MeshLambertMaterial({ color: 0x00ff00, opacity: 1.0 });

      // メッシュを作成
      this.sphere = new THREE.Mesh(geometry, material);

      // 名前を設定
      this.sphere.name = node.data.id;

      // 選択可能にする
      this.sphere.selectable = true;

      // グループに追加
      this.add(this.sphere);
    }

    //
    // ラベルを作成(CSS2DObject)
    //
    {
      // DOM要素を作成
      const div = document.createElement('div');

      // CSSクラスを設定
      div.className = 'label';

      // CSSクラスを追加
      const labelFontSize = options.hasOwnProperty("labelFontSize") ? options.labelFontSize : "Medium";
      div.classList.add(labelFontSize.toLowerCase());

      // テキストを設定
      div.textContent = node.data.label || node.data.id;

      // CSS2DObjectを作成
      this.label = new CSS2DObject(div);

      // 名前を設定
      this.label.name = `${node.data.id}_label`;

      // 親になるノードからの相対で位置を設定
      this.label.position.set(0, 15, 0);

      // レイヤーを 1 に設定
      this.label.layers.set(1);

      // グループに追加
      this.add(this.label);
    }

    //
    // 注目を集めるためのConeGeometryを追加する
    //
    {
      // ConeGeometryを作成
      const coneRadius = options.hasOwnProperty("coneRadius") ? options.coneRadius : 5;
      const coneHeight = options.hasOwnProperty("coneHeight") ? options.coneHeight : 15;
      const coneSegments = options.hasOwnProperty("coneSegments") ? options.coneSegments : 32;
      const geometry = new THREE.ConeGeometry(coneRadius, coneHeight, coneSegments);

      // マテリアルを作成
      const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });

      // メッシュを作成
      this.cone = new THREE.Mesh(geometry, material);
      this.cone.name = `${node.data.id}_cone`;
      this.cone.rotateX(Math.PI);
      this.cone.position.set(0, 15, 0);
      this.cone.visible = false;
      this.add(this.cone);
    }
  }

}


class Edge extends THREE.Group {

  // ラインを表現するメッシュ
  line;

  // 元になったグラフのエッジのデータ
  edge;

  // 位置を決めるためにsourceとtargetの情報をもらう
  constructor(edge, source, target, options) {

    super();

    options = options || {};

    // グラフのエッジのデータを保持しておく
    this.edge = edge;

    // グループに名前を設定
    this.name = `${this.edge.data.id}_group`

    // 線のジオメトリを作成
    const geometry = new THREE.BufferGeometry();

    // 2点間の座標をverticesに追加
    const vertices = [];
    vertices.push(source.position.x);
    vertices.push(source.position.y);
    vertices.push(source.position.z);

    vertices.push(target.position.x);
    vertices.push(target.position.y);
    vertices.push(target.position.z);

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));

    // マテリアルを作成
    const material = new THREE.LineBasicMaterial(
      {
        color: 0xffffff,
        linewidth: 1  // 多くのプラットフォームで無視される
      }
    );

    this.line = new THREE.LineSegments(geometry, material);
    this.line.scale.x = this.line.scale.y = this.line.scale.z = 1;
    this.line.originalScale = 1;
    this.line.name = edge.data.id;

    // 選択可能にする
    this.line.selectable = true;

    this.add(this.line);
  }
}



export class Diagram {

  // アロー関数内でthisを使うと混乱するのでselfに代入
  self;

  // コンストラクタに渡された引数
  options;

  // Graphクラスのインスタンス
  graph;

  // ObjectSelectionのインスタンス
  objectSelection;

  // レンダラーのDOMを格納するdiv要素
  container;

  // サイズ
  // 初期化時にDIV要素(container)のサイズに変更する
  sizes = {
    width: 0,
    height: 0
  };

  // シーン、カメラ、レンダラ
  scene;
  camera
  renderer;

  // ラベル表示用のCSS2Dレンダラ
  labelRenderer;

  // ライト
  light1;
  light2;

  // マウス操作のコントロール
  controls;

  // stats.jsを格納するdiv要素とstats.jsのインスタンス
  statsjs;

  // 情報表示用のパラメータ
  infoParams = {
    element: document.getElementById("infoContainer"),
    selected: null
  };

  // ラベル表示用のパラメータ
  labelParams = {
    showLabels: true,
    labelFontSize: "Medium"  // "Small", "Medium", "Large"
  }


  constructor(options) {
    this.options = options || {};

    // optionsに渡された値を保存
    this.graph = this.options.hasOwnProperty("graph") ? this.options.graph : [];
    this.selectionEnabled = this.options.hasOwnProperty("selection") ? this.options.selection : true;
    this.labelParams.showLabels = this.options.hasOwnProperty("showLabels") ? this.options.showLabels : this.labelParams.showLabels;
    this.labelParams.labelFontSize = this.options.hasOwnProperty("labelFontSize") ? this.options.labelFontSize : this.labelParams.labelFontSize;

    this.init();
    this.initControls();
    this.initStats();
    this.initGui();
    this.initObjectSelection();
    this.initEventHandler();

    // Graphクラスの情報を元にシーンにノードとエッジを追加
    this.drawGraph(this.graph);

    this.animate();
  }

  //
  // Three.js初期化処理
  //
  init() {

    // アロー関数内でthisを使うと混乱するのでselfに代入しておく
    self = this;

    // コンテナ要素を取得
    this.container = document.getElementById("threejsContainer");

    // コンテナ要素にあわせてサイズを初期化
    this.sizes.width = this.container.clientWidth;
    this.sizes.height = this.container.clientHeight;

    // シーンを初期化
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);

    // カメラを初期化
    this.camera = new THREE.PerspectiveCamera(
      70,                                   // 視野角度 FOV
      this.sizes.width / this.sizes.height, // アスペクト比
      1,                                    // 開始距離
      10000                                 // 終了距離
    );
    this.camera.position.set(200, 200, 600);

    // ラベル用にlayer 1を有効化
    this.camera.layers.enable(1);
    if (this.labelParams.showLabels === false) {
      this.camera.layers.toggle(1);
    }

    // ライトを初期化
    this.light1 = new THREE.DirectionalLight(0xFFFFFF, 2.5);
    this.light1.position.set(1, 1, 1);
    this.scene.add(this.light1);

    this.light2 = new THREE.DirectionalLight(0xFFFFFF, 1.5);
    this.light2.position.set(-1, -1, 1);
    this.scene.add(this.light2);

    // レンダラーを初期化
    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true
    });
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.container.appendChild(this.renderer.domElement);

    // ラベル用のCSS2Dレンダラを初期化
    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(this.sizes.width, this.sizes.height);
    this.labelRenderer.domElement.style.position = 'absolute';
    this.labelRenderer.domElement.style.top = '0px';
    this.labelRenderer.domElement.style.pointerEvents = 'none';
    this.container.appendChild(this.labelRenderer.domElement);

    // 軸を表示
    //
    //   Y(green)
    //    |
    //    +---- X(red)
    //   /
    //  Z(blue)
    //
    const axesHelper = new THREE.AxesHelper(10000);
    this.scene.add(axesHelper);
  }


  // マウス操作のコントロールを初期化
  initControls() {
    // OrbitControls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.autoRotate = false;
    this.controls.autoRotateSpeed = 1.0;

    /*
    // TrackballControls
    // import { TrackballControls } from "three/controls/TrackballControls.js";
    this.controls = new TrackballControls(camera, renderer.domElement);
    this.controls.rotateSpeed = 10;
    this.controls.zoomSpeed = 2.0;
    this.controls.panSpeed = 0.1;
    this.controls.noZoom = false;
    this.controls.noPan = false;
    this.controls.staticMoving = false;
    this.controls.dynamicDampingFactor = 0.3;
    */
  }


  // stats.jsを初期化
  initStats() {
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


  // lil-guiを初期化
  initGui() {
    let container = document.getElementById("guiContainer");
    if (!container) {
      container = document.createElement("div");
      container.id = "guiContainer";
      this.container.appendChild(container);
    }

    const gui = new GUI({ container: container });

    // GUIでラベル表示のON/OFFを切り替える
    {
      const folder = gui.addFolder('Label');
      folder
        .add(this.labelParams, 'showLabels')
        .name('show node label')
        .onChange((value) => {
          // レイヤでラベルを表示するかどうかを切り替える
          self.camera.layers.toggle(1);

          // 非表示に変更したら、render()を呼んで画面上から消す
          if (self.camera.layers.test(1) === false) {
            self.labelRenderer.render(self.scene, self.camera);
          }
        });

      folder
        .add(this.labelParams, 'labelFontSize')
        .options(['Small', 'Medium', 'Large'])
        .name('font size')
        .onChange((value) => {
          // CSS2DObjectはDIVを元にしているので、CSSクラスを変更するだけでフォントサイズを変えられる
          document.querySelectorAll('.label').forEach((label) => {
            label.classList.remove('small', 'medium', 'large');
            label.classList.add(value.toLowerCase());
          });
        });
    }

    // GUIでOrbitControlsの設定を変更する
    {
      const folder = gui.addFolder('OrbitControls');
      folder
        .add(this.controls, 'autoRotate')
        .name('auto rotate')
    }

  }


  // ObjectSelectionを初期化
  initObjectSelection() {
    if (this.selectionEnabled === false) {
      return;
    }

    // ObjectSelectionを初期化
    this.objectSelection = new ObjectSelection({
      domElement: this.renderer.domElement,
      selected: function (obj) {
        if (obj === null) {
          // フォーカスが外れるとnullが渡される
          self.infoParams.selected = null;
        } else {
          // フォーカスが当たるとオブジェクトが渡される
          if (!obj.name) {
            return;
          }

          console.log(obj.name);
          const element = self.graph.getElementById(obj.name);
          if (!element) {
            return;
          }
          self.infoParams.selected = element.data.id;
        }
      },
      clicked: function (obj) {
        if (obj) {
          if (!obj.name) {
            return;
          }

          // 参考までに、
          // スクリーン座標を求めて表示する
          const element = self.graph.getElementById(obj.name);
          const worldPosition = obj.getWorldPosition(new THREE.Vector3());
          const projection = worldPosition.project(self.camera);
          const screenX = Math.round((projection.x + 1) / 2 * self.sizes.width);
          const screenY = Math.round(-(projection.y - 1) / 2 * self.sizes.height);
          console.log(`${element.data.id} (${screenX}, ${screenY})`);

          // ノードの場合は強調表示のコーンを表示/非表示する
          // クリックされているのはノード本体なので、親のグループを取得する
          if (obj.parent && obj.parent.constructor.name === "Node") {
            const cone = obj.parent.getObjectByName(`${element.data.id}_cone`);
            if (cone) {
              cone.visible = !cone.visible;
            }
          }

        }
      }
    });

  }

  // イベントハンドラを登録
  initEventHandler() {
    // テスト用
    // ボタンを押したらシーン上のグラフを全て削除
    document.getElementById("idButton1").addEventListener("click", function () {
      self.removeGraph();
    });

    // ブラウザのリサイズイベントを登録
    function onWindowResize() {
      // コンテナ要素のサイズに合わせてsizesを更新する
      this.sizes.width = self.container.clientWidth;
      this.sizes.height = self.container.clientHeight;

      this.camera.aspect = self.sizes.width / self.sizes.height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(self.sizes.width, self.sizes.height);
      this.labelRenderer.setSize(self.sizes.width, self.sizes.height);
    }

    window.addEventListener("resize", onWindowResize);
  }


  render() {

    // 線の両端のノードの位置が変更されたなら、renderの中でエッジの更新を指示する
    /*
    for (let i = 0; i < geometries.length; i++) {
      geometries[i].attributes.position.needsUpdate = true;
    }
    */

    // render ObjectSelection
    if (this.selectionEnabled) {
      this.objectSelection.render(this.scene, this.camera);
    }

    // render scene
    this.renderer.render(this.scene, this.camera);

    // render label
    this.labelRenderer.render(this.scene, this.camera);
  }


  animate() {

    // stats.jsを更新
    if (self.statsjs) {
      self.statsjs.update();
    }

    // マウスコントロールを更新
    if (self.controls) {
      self.controls.update();
    }

    // レンダリング
    self.render();

    // infoParamsに表示する情報があれば表示する
    self.printInfo();

    // 再帰処理
    requestAnimationFrame(self.animate);
  }


  printInfo() {
    if (this.infoParams.selected) {
      this.infoParams.element.innerHTML = `Selected: ${this.infoParams.selected}`;
    } else {
      this.infoParams.element.innerHTML = "";
    }
  }


  //
  // Graphクラスのインスタンスの情報をもとにノードとエッジをシーン上に作成する
  //
  drawGraph() {

    // ノードを作成
    this.graph.getNodes().forEach(function (node) {
      const n = new Node(node);
      self.scene.add(n);
    });

    // エッジを作成
    this.graph.getEdges().forEach(function (edge) {
      const sourceNodeId = edge.data.source;
      const sourceNode = self.graph.getElementById(sourceNodeId);

      const targetNodeId = edge.data.target;
      const targetNode = self.graph.getElementById(targetNodeId);

      if (sourceNode && targetNode) {
        const e = new Edge(edge, sourceNode, targetNode);
        self.scene.add(e);
      }
    });
  }

  //
  // シーン上のノードとエッジを削除する
  //
  removeGraph() {

    // シーン上のNodeオブジェクトを削除する
    self.graph.getNodes().forEach(node => {

      let nodeGroup = self.scene.getObjectByName(`${node.data.id}_group`);
      if (nodeGroup) {
        while (nodeGroup.children.length) {
          // ラベルを含む全ての子オブジェクトを削除
          const obj = nodeGroup.children[0];
          console.log(`remove ${obj.name}`);
          obj.parent.remove(obj);
        }
        self.scene.remove(nodeGroup);
      }
    });

    // シーン上のEdgeオブジェクトを取得して削除
    self.graph.getEdges().forEach(edge => {

      let edgeGroup = self.scene.getObjectByName(`${edge.data.id}_group`);
      if (edgeGroup) {
        while (edgeGroup.children.length) {
          const obj = edgeGroup.children[0];
          console.log(`remove ${obj.name}`);
          obj.parent.remove(obj);
        }
        self.scene.remove(edgeGroup);
      }
    });

    // シーンに残っているオブジェクトを表示する
    console.log(self.scene.children);
  }

}