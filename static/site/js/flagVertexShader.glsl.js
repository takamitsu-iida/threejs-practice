export const vertex = /* glsl */`

// バーテックスシェーダーは頂点を決めるもの

// 組み込み変数
// どこからどこを映すのかを決定する
// nearとfarを決める
// uniform mat4 projectionMatrix;

// 組み込み変数
// カメラの位置、向きを決定する
// uniform mat4 viewMatrix;

// 組み込み変数
// 物体そのもの
// uniform mat4 modelMatrix;

// 組み込み変数
// attributeはバーテックスシェーダーだけで用いる変数
// 物体の位置
// attribute vec3 position;

//
// JavaScript側から渡される変数
//
uniform vec2 uFrequency;
uniform float uTime;

// フラグメントシェーダーに渡したい変数
varying vec2 vUv;

varying float vElevation;


void main() {
  // gl_Positionは頂点座標を表す変数（既存）
  // gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);

  vec4 modelPosition = modelMatrix * vec4(position, 1.0);

  // modelPositionを変形させる
  // Z座標を時間とともに変化させて波打たせる
  // modelPosition.z += sin(modelPosition.x * uFrequency.x + uTime) * 0.1;
  // modelPosition.z += sin(modelPosition.y * uFrequency.y + uTime) * 0.1;

  // 方法その２
  float elevation =
    sin(modelPosition.x * uFrequency.x + uTime) * 0.1 +
    sin(modelPosition.y * uFrequency.y + uTime) * 0.1;

  modelPosition.z += elevation;

  vec4 viewPosition = viewMatrix * modelPosition;

  vec4 projectionPosition = projectionMatrix * viewPosition;

  gl_Position = projectionPosition;


  // フラグメントシェーダーにUV座標を渡す
  // uv変数はすでに用意されたもの
  vUv = uv;
  vElevation = elevation;
}

`;
