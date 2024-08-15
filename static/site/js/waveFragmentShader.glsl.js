export const fragment = /* glsl */`

// フラグメントシェーダーは物体の色を決めるもの

// RawShaderMaterialを使うときのみ必要
// precision mediump float;

// 色は(R, G, B)の3次元
uniform vec3 uDepthColor;
uniform vec3 uSurfaceColor;
uniform float uColorOffset;
uniform float uColorMultiplier;

// テクスチャはsampler2D型
// uniform sampler2D uTexture;

// バーテックスシェーダーから渡される値
// varying vec2 vUv;
varying float vElevation;

void main() {

  //
  // 色をつける
  //

  // gl_FragColorは組み込み変数で、(R, G, B, A)で色を指定する
  // 引数の値は 0.0 から 1.0 に正規化されている
  // gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);

  // vElevationの値によってミックス度が変わる
  // vElevationが0.0だと第一引数、1.0だと第二引数が用いられる
  // vec3 color = mix(uDepthColor, uSurfaceColor, vElevation);
  // gl_FragColor = vec4(color, 1.0);


  float mixStrengthColor = (vElevation + uColorOffset) * uColorMultiplier;
  vec3 color = mix(uDepthColor, uSurfaceColor, mixStrengthColor);
  gl_FragColor = vec4(color, 1.0);

  // 色指定
  gl_FragColor = vec4(color, 1.0);

  //
  // テクスチャを張る
  //

  // テクスチャ画像はuniformでJavaScriptから、
  // UV座標はvaryingでバーテックスシェーダーからもらってくる
  // vec4 textureColor = texture2D(uTexture, vUv);
  // textureColor.rgb *= vElevation * 3.0 + 0.8;
  // gl_FragColor = textureColor;
}

`;