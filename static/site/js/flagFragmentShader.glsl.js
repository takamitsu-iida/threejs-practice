export const fragment = /* glsl */`

// フラグメントシェーダーは物体の色を決めるもの

// RawShaderMaterialを使うときのみ必要
// precision mediump float;

// 色は(R, G, B)の3次元
uniform vec3 uColor;

// テクスチャはsampler2D型
uniform sampler2D uTexture;

// バーテックスシェーダーから渡される値
varying vec2 vUv;
varying float vElevation;

void main() {

  //
  // 単純に色をつける
  //

  // gl_FragColorは既にある変数
  // (R, G, B, A)で色を指定する
  // 引数の値は 0.0 から 1.0 に正規化されている
  // gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
  // gl_FragColor = vec4(uColor, 1.0);

  //
  // テクスチャを張る
  //

  // テクスチャ画像はuniformでJavaScriptから、
  // UV座標はvaryingでバーテックスシェーダーからもらってくる
  vec4 textureColor = texture2D(uTexture, vUv);

  // 影をつける
  textureColor.rgb *= vElevation * 3.0 + 0.8;

  // 色を設定
  gl_FragColor = textureColor;
}
`;