import * as THREE from "three";
import { TrackballControls } from "three/controls/TrackballControls.js";

function translate_geo_coorddinates(latitude, longitude, radius) {

  // 緯度
  const phi = (latitude * Math.PI) / 180;

  // 経度
  const theta = ((longitude - 180) * Math.PI) / 180;

  const x = -radius * Math.cos(phi) * Math.cos(theta);
  const y = radius * Math.sin(phi);
  const z = radius * Math.cos(phi) * Math.sin(theta);

  return new THREE.Vector3(x, y, z);
}


function geo_to_vec3(latitude, longitude, radius) {
  latitude = latitude * Math.PI / 180.0;
  longitude = -longitude * Math.PI / 180.0;
  return new THREE.Vector3(
    radius * Math.cos(latitude) * Math.cos(longitude),
    radius * Math.sin(latitude),
    radius * Math.cos(latitude) * Math.sin(longitude));
}


function create_orbit_points(start_position, end_position, num_segment) {
  num_segment = num_segment || 100;

  // 頂点を格納する配列を生成
  const vertices = [];

  const startVec = start_position.clone();
  const endVec = end_position.clone();

  // ２つのベクトルの回転軸
  const axis = startVec.clone().cross(endVec);
  axis.normalize();

  // ２つのベクトルが織りなす角度
  const angle = startVec.angleTo(endVec);

  // ２つの衛星を結ぶ弧を描くための頂点を打つ
  for (let i = 0; i < num_segment; i++) {
    // axisを軸としたクォータニオンを生成
    const q = new THREE.Quaternion();
    q.setFromAxisAngle(axis, (angle / num_segment) * i);

    // ベクトルを回転させる
    vertices.push(startVec.clone().applyQuaternion(q));
  }

  // 終了点を追加
  vertices.push(endVec);

  return vertices;
}


class Earth extends THREE.Group {

  // 地球
  ground;

  // 雲
  cloud;

  constructor() {

    super();

    // 地球の球体
    const geo_geometry = new THREE.SphereGeometry(100, 60, 60);

    // map
    // The color map.
    const geo_texture = new THREE.TextureLoader().load("./static/site/img/geo_ground.jpg");

    // bumpMap
    // The texture to create a bump map.
    // The black and white values map to the perceived depth in relation to the lights.
    // Bump doesn't actually affect the geometry of the object,
    // only the lighting.
    // If a normal map is defined this will be ignored.
    const geo_bump = new THREE.TextureLoader().load("./static/site/img/geo_bump.jpg");

    // bumpScale
    // How much the bump map affects the material. Typical ranges are 0-1. Default is 1.
    const bumpScale = 1.0;

    // specularMap
    // The specular map value affects both how much the specular surface highlight contributes and how much of the environment map affects the surface. Default is null.
    const geo_specular = new THREE.TextureLoader().load("./static/site/img/geo_specular.png");

    const args = {
      map: geo_texture,
      bumpMap: geo_bump,
      bumpScale: bumpScale,
      specularMap: geo_specular
    }
    const geo_material = new THREE.MeshPhongMaterial(args);

    this.ground = new THREE.Mesh(geo_geometry, geo_material);

    // 影を受け取る
    this.ground.receiveShadow = true;

    // グループに追加
    this.add(this.ground);

    // 雲
    const cloud_geometry = new THREE.SphereGeometry(102, 60, 60);

    const cloud_texture = new THREE.TextureLoader().load("./static/site/img/geo_cloud.jpg");

    const cloud_material = new THREE.MeshPhongMaterial({
      map: cloud_texture,
      transparent: true,
      blending: THREE.AdditiveBlending,
    });

    this.cloud = new THREE.Mesh(cloud_geometry, cloud_material);

    // 雲による影を地球に落としても視認できない
    // this.cloud.castShadow = true;

    // グループに追加
    this.add(this.cloud);

  }

  update() {
    this.cloud.rotation.y += 0.0005;
  }

}


class CityLine extends THREE.Group {

  _line;

  _geometry;

  _startTarget;

  _endTarget;

  constructor(_startTarget, _endTarget) {

    super();

    this._startTarget = _startTarget;

    this._endTarget = _endTarget;

    const points = create_orbit_points(
      this._startTarget.position,
      this._endTarget.position
    );

    this._geometry = new THREE.BufferGeometry();

    this._geometry.setFromPoints(points);

    const material = new THREE.LineBasicMaterial({
      linewidth: 1, // 多くの場合は1以外の値が反映されない
      color: 0x00ffff,
      transparent: true,
      opacity: 0.6,
    });

    this._line = new THREE.Line(this._geometry, material)

    this.add(this._line);
  }

  update() {

    const points = create_orbit_points(
      this._startTarget.position,
      this._endTarget.position
    );

    // 頂点を更新
    this._geometry.setFromPoints(points);
  }
}

class CityPoint extends THREE.Group {

  // 球
  sphere;

  // 点光源
  point_light;

  // デフォルトの色
  DEFAULT_COLOR = 0xff0000;

  // 色
  color = this.DEFAULT_COLOR;

  // 緯度
  latitude = 0;

  // 経度
  longitude = 0;

  // 地球の中心からそのポイントまでの距離
  // 地表からの高度ではないので要注意
  altitude = 110;

  constructor(color, coordinates) {

    super();

    this.color = color || this.DEFAULT_COLOR;

    this.latitude = coordinates[0];

    this.longitude = coordinates[1];

    // ジオメトリ
    const geometry = new THREE.SphereGeometry(2, 10, 10);

    // マテリアル
    const material = new THREE.MeshLambertMaterial({ color });

    // メッシュ化
    this.sphere = new THREE.Mesh(geometry, material);

    // 影を落とす
    this.sphere.castShadow = true;

    // グループに追加
    this.add(this.sphere);

    // 点光源を作成してグループに追加
    // new THREE.PointLight(色, 光の強さ, 距離, 光の減衰率)
    // 光の強さは調整が必要
    this.point_light = new THREE.PointLight(this.color, 200.0, 0);

    this.updatePosition();

    // グループに追加
    this.add(this.point_light);

  }

  updatePosition() {
    // const position = translate_geo_coorddinates(this.latitude, this.longitude, this.altitude);
    const position = geo_to_vec3(this.latitude, this.longitude, this.altitude);
    this.position.x = position.x;
    this.position.y = position.y;
    this.position.z = position.z;
  }

}


export class Main {

  container;

  // 初期化時にDIV要素(container)のサイズに変更する
  sizes = {
    width: 0,
    height: 0
  };

  scene;
  camera;
  renderer;
  controller;

  earth;
  satellite;

  // 主要都市緯度経度一覧
  cities = [
    [51.2838, 0], // イギリス
    [39, -116], // 北京
    [34, 118], // ロサンゼルス
    [-33, 151], // シドニー
    [-23, -46], // サンパウロ
    [1, 103], // シンガポール
    [90, 0], // 北極
    [-90, 0], // 南極
  ];

  constructor() {

    // コンテナ
    this.container = document.getElementById("threejs_container");

    // コンテナ要素にあわせてサイズを初期化
    this.sizes.width = this.container.clientWidth;
    this.sizes.height = this.container.clientHeight;

    // シーン
    this.scene = new THREE.Scene();

    // カメラ
    this.camera = new THREE.PerspectiveCamera(
      45,
      this.sizes.width / this.sizes.height,
      1,
      2000
    );
    this.camera.position.set(-250, 0, 250);
    this.camera.lookAt(new THREE.Vector3(0, 0, 0));

    // レンダラ
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    // デバイスピクセル比は上限2に制限(3以上のスマホ・タブレットでは処理が重すぎる)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.autoClear = false;
    this.renderer.setClearColor(0x000000, 0.0);
    this.renderer.shadowMap.enabled = true;

    this.container.appendChild(this.renderer.domElement);

    // コントローラ
    this.controller = new TrackballControls(this.camera, this.renderer.domElement);
    this.controller.noPan = true;
    this.controller.minDistance = 200;
    this.controller.maxDistance = 1000;
    this.controller.dynamicDampingFactor = 0.05;

    // 地球
    this.earth = new Earth();
    this.scene.add(this.earth);

    // 環境光をシーンに追加
    // 環境光がないと地球の夜の部分が真っ黒になってしまう
    // ただし、色に注意が必要
    // 0xffffffだと全体に強い光があたって影ができない
    this.scene.add(new THREE.AmbientLight(0x404040));

    // スポットライト
    // 地球のサイズは大きいので、光の強度を上げないと影ができない
    const spot_light = new THREE.SpotLight(0xffffff, 100000.0);
    spot_light.position.set(-400, 0, 0);
    spot_light.angle = Math.PI / 8;
    spot_light.castShadow = true;
    spot_light.distance = 0;
    this.scene.add(spot_light);

    spot_light.shadow.mapSize.width = 512; // default 512
    spot_light.shadow.mapSize.height = 512; // default 512
    spot_light.shadow.camera.near = 0.5; // default 0.5
    spot_light.shadow.camera.far = 500; // default 500
    spot_light.shadow.focus = 1; // default

    // const helper = new THREE.SpotLightHelper(spot_light);
    // this.scene.add(helper);

    // 背景
    const geometry2 = new THREE.SphereGeometry(1000, 60, 40);
    geometry2.scale(-1, 1, 1);
    const material2 = new THREE.MeshBasicMaterial({
      map: new THREE.TextureLoader().load("./static/site/img/geo_star.jpg"),
    });
    const background = new THREE.Mesh(geometry2, material2);
    this.scene.add(background);

    // 日本
    this.japan = new CityPoint(0xffff00, [35.658651, 139.742689]);
    // apply_gps_position(this.japan, this.japan.getCoords());
    this.scene.add(this.japan);

    // 主要都市をプロットして線をひく
    this.cities.forEach((coords) => {

      // 都市をプロット
      const cityPoint = new CityPoint(0xff00ff, coords);
      this.scene.add(cityPoint);

      // 線をひく
      const cityLine = new CityLine(this.japan, cityPoint, 100);
      this.scene.add(cityLine);
    });

    // 衛星
    this.satellite = new CityPoint(0xff0000, [0, 0]);
    this.scene.add(this.satellite);

    // resizeイベントのハンドラを登録
    window.addEventListener("resize", () => {
      this.sizes.width = this.container.clientWidth;
      this.sizes.height = this.container.clientHeight;

      this.camera.aspect = this.sizes.width / this.sizes.height;
      this.camera.updateProjectionMatrix();

      this.renderer.setSize(this.sizes.width, this.sizes.height);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    });

    // フレーム毎の処理(requestAnimationFrameで再帰的に呼び出される)
    this.render();

  }


  render() {

    // 地球を更新
    this.earth.update();

    // 人工衛星の経度を更新
    this.satellite.longitude = Date.now() / 100;
    this.satellite.updatePosition();

    // カメラコントローラーの更新
    this.controller.update();

    this.renderer.render(this.scene, this.camera);

    requestAnimationFrame(() => { this.render(); });
  }

}
