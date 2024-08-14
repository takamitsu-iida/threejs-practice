export const vertex = /* glsl */`

// 既存
uniform mat4 projectionMatrix;

// 既存
uniform mat4 viewMatrix;

// 既存
uniform mat4 modelMatrix;

// 既存
attribute vec3 position;

void main() {
  // 頂点座標を決める
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}

`;
