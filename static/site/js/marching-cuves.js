import * as THREE from "three";
import { OrbitControls } from "three/controls/OrbitControls.js";
import { SimplexNoise } from "three/libs/SimplexNoise.js";
import { GUI } from "three/libs/lil-gui.module.min.js";


// stats.js
import Stats from 'three/libs/stats.module.js';

/*
  頂点のインデックス

     4----------5
    /|         /|
   / |        / |
  7----------6  |
  |  0-------|--1
  | /        | /
  |/         |/
  3----------2

  エッジのインデックス

     o--- 4 ----o
    7|         5|
   / |        / |
  o---- 6 ---o  |
  |  o--- 0 -|--o
  | 3        | 1
  |/         |/
  o--- 2 ----o

     o--- ------o
    /|         /|
   / 8        / 9
  o----------o  |
  |  o-------|--o
 11 /        10 /
  |/         |/
  o--- ------o

*/


// 三角測量テーブル
// https://github.com/deep110/terrain-editor-js/blob/master/marching-cubes.js

// しきい値を超えた頂点のパターンをインデックスとして参照すると、どの辺をカットすべきかわかる表
// 一つの箱の中に三角形は最大5個作成される
// 3 * 5 = 15
// 左から順に3個ずつ取り出して三角形にしていく
// -1はそれ以降、処理対象の辺がないことを意味する

const triangulationTable = [

  /* 0 */[-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 1 */[0, 8, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 2 */[0, 1, 9, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 3 */[1, 8, 3, 9, 8, 1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 4 */[1, 2, 10, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 5 */[0, 8, 3, 1, 2, 10, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 6 */[9, 2, 10, 0, 2, 9, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 7 */[2, 8, 3, 2, 10, 8, 10, 9, 8, -1, -1, -1, -1, -1, -1, -1],
  /* 8 */[3, 11, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 9 */[0, 11, 2, 8, 11, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],

  /* 10 */[1, 9, 0, 2, 3, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 11 */[1, 11, 2, 1, 9, 11, 9, 8, 11, -1, -1, -1, -1, -1, -1, -1],
  /* 12 */[3, 10, 1, 11, 10, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 13 */[0, 10, 1, 0, 8, 10, 8, 11, 10, -1, -1, -1, -1, -1, -1, -1],
  /* 14 */[3, 9, 0, 3, 11, 9, 11, 10, 9, -1, -1, -1, -1, -1, -1, -1],
  /* 15 */[9, 8, 10, 10, 8, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 16 */[4, 7, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 17 */[4, 3, 0, 7, 3, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 18 */[0, 1, 9, 8, 4, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 19 */[4, 1, 9, 4, 7, 1, 7, 3, 1, -1, -1, -1, -1, -1, -1, -1],

  /* 20 */[1, 2, 10, 8, 4, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 21 */[3, 4, 7, 3, 0, 4, 1, 2, 10, -1, -1, -1, -1, -1, -1, -1],
  /* 22 */[9, 2, 10, 9, 0, 2, 8, 4, 7, -1, -1, -1, -1, -1, -1, -1],
  /* 23 */[2, 10, 9, 2, 9, 7, 2, 7, 3, 7, 9, 4, -1, -1, -1, -1],
  /* 24 */[8, 4, 7, 3, 11, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 25 */[11, 4, 7, 11, 2, 4, 2, 0, 4, -1, -1, -1, -1, -1, -1, -1],
  /* 26 */[9, 0, 1, 8, 4, 7, 2, 3, 11, -1, -1, -1, -1, -1, -1, -1],
  /* 27 */[4, 7, 11, 9, 4, 11, 9, 11, 2, 9, 2, 1, -1, -1, -1, -1],
  /* 28 */[3, 10, 1, 3, 11, 10, 7, 8, 4, -1, -1, -1, -1, -1, -1, -1],
  /* 29 */[1, 11, 10, 1, 4, 11, 1, 0, 4, 7, 11, 4, -1, -1, -1, -1],

  /* 30 */[4, 7, 8, 9, 0, 11, 9, 11, 10, 11, 0, 3, -1, -1, -1, -1],
  /* 31 */[4, 7, 11, 4, 11, 9, 9, 11, 10, -1, -1, -1, -1, -1, -1, -1],
  /* 32 */[9, 5, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 33 */[9, 5, 4, 0, 8, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 34 */[0, 5, 4, 1, 5, 0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 35 */[8, 5, 4, 8, 3, 5, 3, 1, 5, -1, -1, -1, -1, -1, -1, -1],
  /* 36 */[1, 2, 10, 9, 5, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 37 */[3, 0, 8, 1, 2, 10, 4, 9, 5, -1, -1, -1, -1, -1, -1, -1],
  /* 38 */[5, 2, 10, 5, 4, 2, 4, 0, 2, -1, -1, -1, -1, -1, -1, -1],
  /* 39 */[2, 10, 5, 3, 2, 5, 3, 5, 4, 3, 4, 8, -1, -1, -1, -1],

  /* 40 */[9, 5, 4, 2, 3, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 41 */[0, 11, 2, 0, 8, 11, 4, 9, 5, -1, -1, -1, -1, -1, -1, -1],
  /* 42 */[0, 5, 4, 0, 1, 5, 2, 3, 11, -1, -1, -1, -1, -1, -1, -1],
  /* 43 */[2, 1, 5, 2, 5, 8, 2, 8, 11, 4, 8, 5, -1, -1, -1, -1],
  /* 44 */[10, 3, 11, 10, 1, 3, 9, 5, 4, -1, -1, -1, -1, -1, -1, -1],
  /* 45 */[4, 9, 5, 0, 8, 1, 8, 10, 1, 8, 11, 10, -1, -1, -1, -1],
  /* 46 */[5, 4, 0, 5, 0, 11, 5, 11, 10, 11, 0, 3, -1, -1, -1, -1],
  /* 47 */[5, 4, 8, 5, 8, 10, 10, 8, 11, -1, -1, -1, -1, -1, -1, -1],
  /* 48 */[9, 7, 8, 5, 7, 9, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 49 */[9, 3, 0, 9, 5, 3, 5, 7, 3, -1, -1, -1, -1, -1, -1, -1],

  /* 50 */[0, 7, 8, 0, 1, 7, 1, 5, 7, -1, -1, -1, -1, -1, -1, -1],
  /* 51 */[1, 5, 3, 3, 5, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 52 */[9, 7, 8, 9, 5, 7, 10, 1, 2, -1, -1, -1, -1, -1, -1, -1],
  /* 53 */[10, 1, 2, 9, 5, 0, 5, 3, 0, 5, 7, 3, -1, -1, -1, -1],
  /* 54 */[8, 0, 2, 8, 2, 5, 8, 5, 7, 10, 5, 2, -1, -1, -1, -1],
  /* 55 */[2, 10, 5, 2, 5, 3, 3, 5, 7, -1, -1, -1, -1, -1, -1, -1],
  /* 56 */[7, 9, 5, 7, 8, 9, 3, 11, 2, -1, -1, -1, -1, -1, -1, -1],
  /* 57 */[9, 5, 7, 9, 7, 2, 9, 2, 0, 2, 7, 11, -1, -1, -1, -1],
  /* 58 */[2, 3, 11, 0, 1, 8, 1, 7, 8, 1, 5, 7, -1, -1, -1, -1],
  /* 59 */[11, 2, 1, 11, 1, 7, 7, 1, 5, -1, -1, -1, -1, -1, -1, -1],

  /* 60 */[9, 5, 8, 8, 5, 7, 10, 1, 3, 10, 3, 11, -1, -1, -1, -1],
  /* 61 */[5, 7, 0, 5, 0, 9, 7, 11, 0, 1, 0, 10, 11, 10, 0, -1],
  /* 62 */[11, 10, 0, 11, 0, 3, 10, 5, 0, 8, 0, 7, 5, 7, 0, -1],
  /* 63 */[11, 10, 5, 7, 11, 5, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 64 */[10, 6, 5, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 65 */[0, 8, 3, 5, 10, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 66 */[9, 0, 1, 5, 10, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 67 */[1, 8, 3, 1, 9, 8, 5, 10, 6, -1, -1, -1, -1, -1, -1, -1],
  /* 68 */[1, 6, 5, 2, 6, 1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 69 */[1, 6, 5, 1, 2, 6, 3, 0, 8, -1, -1, -1, -1, -1, -1, -1],

  /* 70 */[9, 6, 5, 9, 0, 6, 0, 2, 6, -1, -1, -1, -1, -1, -1, -1],
  /* 71 */[5, 9, 8, 5, 8, 2, 5, 2, 6, 3, 2, 8, -1, -1, -1, -1],
  /* 72 */[2, 3, 11, 10, 6, 5, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 73 */[11, 0, 8, 11, 2, 0, 10, 6, 5, -1, -1, -1, -1, -1, -1, -1],
  /* 74 */[0, 1, 9, 2, 3, 11, 5, 10, 6, -1, -1, -1, -1, -1, -1, -1],
  /* 75 */[5, 10, 6, 1, 9, 2, 9, 11, 2, 9, 8, 11, -1, -1, -1, -1],
  /* 76 */[6, 3, 11, 6, 5, 3, 5, 1, 3, -1, -1, -1, -1, -1, -1, -1],
  /* 77 */[0, 8, 11, 0, 11, 5, 0, 5, 1, 5, 11, 6, -1, -1, -1, -1],
  /* 78 */[3, 11, 6, 0, 3, 6, 0, 6, 5, 0, 5, 9, -1, -1, -1, -1],
  /* 79 */[6, 5, 9, 6, 9, 11, 11, 9, 8, -1, -1, -1, -1, -1, -1, -1],

  /* 80 */[5, 10, 6, 4, 7, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 81 */[4, 3, 0, 4, 7, 3, 6, 5, 10, -1, -1, -1, -1, -1, -1, -1],
  /* 82 */[1, 9, 0, 5, 10, 6, 8, 4, 7, -1, -1, -1, -1, -1, -1, -1],
  /* 83 */[10, 6, 5, 1, 9, 7, 1, 7, 3, 7, 9, 4, -1, -1, -1, -1],
  /* 84 */[6, 1, 2, 6, 5, 1, 4, 7, 8, -1, -1, -1, -1, -1, -1, -1],
  /* 85 */[1, 2, 5, 5, 2, 6, 3, 0, 4, 3, 4, 7, -1, -1, -1, -1],
  /* 86 */[8, 4, 7, 9, 0, 5, 0, 6, 5, 0, 2, 6, -1, -1, -1, -1],
  /* 87 */[7, 3, 9, 7, 9, 4, 3, 2, 9, 5, 9, 6, 2, 6, 9, -1],
  /* 88 */[3, 11, 2, 7, 8, 4, 10, 6, 5, -1, -1, -1, -1, -1, -1, -1],
  /* 89 */[5, 10, 6, 4, 7, 2, 4, 2, 0, 2, 7, 11, -1, -1, -1, -1],

  /* 90 */[0, 1, 9, 4, 7, 8, 2, 3, 11, 5, 10, 6, -1, -1, -1, -1],
  /* 91 */[9, 2, 1, 9, 11, 2, 9, 4, 11, 7, 11, 4, 5, 10, 6, -1],
  /* 92 */[8, 4, 7, 3, 11, 5, 3, 5, 1, 5, 11, 6, -1, -1, -1, -1],
  /* 93 */[5, 1, 11, 5, 11, 6, 1, 0, 11, 7, 11, 4, 0, 4, 11, -1],
  /* 94 */[0, 5, 9, 0, 6, 5, 0, 3, 6, 11, 6, 3, 8, 4, 7, -1],
  /* 95 */[6, 5, 9, 6, 9, 11, 4, 7, 9, 7, 11, 9, -1, -1, -1, -1],
  /* 96 */[10, 4, 9, 6, 4, 10, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 97 */[4, 10, 6, 4, 9, 10, 0, 8, 3, -1, -1, -1, -1, -1, -1, -1],
  /* 98 */[10, 0, 1, 10, 6, 0, 6, 4, 0, -1, -1, -1, -1, -1, -1, -1],
  /* 99 */[8, 3, 1, 8, 1, 6, 8, 6, 4, 6, 1, 10, -1, -1, -1, -1],

  /* 100 */[1, 4, 9, 1, 2, 4, 2, 6, 4, -1, -1, -1, -1, -1, -1, -1],
  /* 101 */[3, 0, 8, 1, 2, 9, 2, 4, 9, 2, 6, 4, -1, -1, -1, -1],
  /* 102 */[0, 2, 4, 4, 2, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 103 */[8, 3, 2, 8, 2, 4, 4, 2, 6, -1, -1, -1, -1, -1, -1, -1],
  /* 104 */[10, 4, 9, 10, 6, 4, 11, 2, 3, -1, -1, -1, -1, -1, -1, -1],
  /* 105 */[0, 8, 2, 2, 8, 11, 4, 9, 10, 4, 10, 6, -1, -1, -1, -1],
  /* 106 */[3, 11, 2, 0, 1, 6, 0, 6, 4, 6, 1, 10, -1, -1, -1, -1],
  /* 107 */[6, 4, 1, 6, 1, 10, 4, 8, 1, 2, 1, 11, 8, 11, 1, -1],
  /* 108 */[9, 6, 4, 9, 3, 6, 9, 1, 3, 11, 6, 3, -1, -1, -1, -1],
  /* 109 */[8, 11, 1, 8, 1, 0, 11, 6, 1, 9, 1, 4, 6, 4, 1, -1],

  /* 110 */[3, 11, 6, 3, 6, 0, 0, 6, 4, -1, -1, -1, -1, -1, -1, -1],
  /* 111 */[6, 4, 8, 11, 6, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 112 */[7, 10, 6, 7, 8, 10, 8, 9, 10, -1, -1, -1, -1, -1, -1, -1],
  /* 113 */[0, 7, 3, 0, 10, 7, 0, 9, 10, 6, 7, 10, -1, -1, -1, -1],
  /* 114 */[10, 6, 7, 1, 10, 7, 1, 7, 8, 1, 8, 0, -1, -1, -1, -1],
  /* 115 */[10, 6, 7, 10, 7, 1, 1, 7, 3, -1, -1, -1, -1, -1, -1, -1],
  /* 116 */[1, 2, 6, 1, 6, 8, 1, 8, 9, 8, 6, 7, -1, -1, -1, -1],
  /* 117 */[2, 6, 9, 2, 9, 1, 6, 7, 9, 0, 9, 3, 7, 3, 9, -1],
  /* 118 */[7, 8, 0, 7, 0, 6, 6, 0, 2, -1, -1, -1, -1, -1, -1, -1],
  /* 119 */[7, 3, 2, 6, 7, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],

  /* 120 */[2, 3, 11, 10, 6, 8, 10, 8, 9, 8, 6, 7, -1, -1, -1, -1],
  /* 121 */[2, 0, 7, 2, 7, 11, 0, 9, 7, 6, 7, 10, 9, 10, 7, -1],
  /* 122 */[1, 8, 0, 1, 7, 8, 1, 10, 7, 6, 7, 10, 2, 3, 11, -1],
  /* 123 */[11, 2, 1, 11, 1, 7, 10, 6, 1, 6, 7, 1, -1, -1, -1, -1],
  /* 124 */[8, 9, 6, 8, 6, 7, 9, 1, 6, 11, 6, 3, 1, 3, 6, -1],
  /* 125 */[0, 9, 1, 11, 6, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 126 */[7, 8, 0, 7, 0, 6, 3, 11, 0, 11, 6, 0, -1, -1, -1, -1],
  /* 127 */[7, 11, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 128 */[7, 6, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 129 */[3, 0, 8, 11, 7, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],

  /* 130 */[0, 1, 9, 11, 7, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 131 */[8, 1, 9, 8, 3, 1, 11, 7, 6, -1, -1, -1, -1, -1, -1, -1],
  /* 132 */[10, 1, 2, 6, 11, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 133 */[1, 2, 10, 3, 0, 8, 6, 11, 7, -1, -1, -1, -1, -1, -1, -1],
  /* 134 */[2, 9, 0, 2, 10, 9, 6, 11, 7, -1, -1, -1, -1, -1, -1, -1],
  /* 135 */[6, 11, 7, 2, 10, 3, 10, 8, 3, 10, 9, 8, -1, -1, -1, -1],
  /* 136 */[7, 2, 3, 6, 2, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 137 */[7, 0, 8, 7, 6, 0, 6, 2, 0, -1, -1, -1, -1, -1, -1, -1],
  /* 138 */[2, 7, 6, 2, 3, 7, 0, 1, 9, -1, -1, -1, -1, -1, -1, -1],
  /* 139 */[1, 6, 2, 1, 8, 6, 1, 9, 8, 8, 7, 6, -1, -1, -1, -1],

  /* 140 */[10, 7, 6, 10, 1, 7, 1, 3, 7, -1, -1, -1, -1, -1, -1, -1],
  /* 141 */[10, 7, 6, 1, 7, 10, 1, 8, 7, 1, 0, 8, -1, -1, -1, -1],
  /* 142 */[0, 3, 7, 0, 7, 10, 0, 10, 9, 6, 10, 7, -1, -1, -1, -1],
  /* 143 */[7, 6, 10, 7, 10, 8, 8, 10, 9, -1, -1, -1, -1, -1, -1, -1],
  /* 144 */[6, 8, 4, 11, 8, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 145 */[3, 6, 11, 3, 0, 6, 0, 4, 6, -1, -1, -1, -1, -1, -1, -1],
  /* 146 */[8, 6, 11, 8, 4, 6, 9, 0, 1, -1, -1, -1, -1, -1, -1, -1],
  /* 147 */[9, 4, 6, 9, 6, 3, 9, 3, 1, 11, 3, 6, -1, -1, -1, -1],
  /* 148 */[6, 8, 4, 6, 11, 8, 2, 10, 1, -1, -1, -1, -1, -1, -1, -1],
  /* 149 */[1, 2, 10, 3, 0, 11, 0, 6, 11, 0, 4, 6, -1, -1, -1, -1],

  /* 150 */[4, 11, 8, 4, 6, 11, 0, 2, 9, 2, 10, 9, -1, -1, -1, -1],
  /* 151 */[10, 9, 3, 10, 3, 2, 9, 4, 3, 11, 3, 6, 4, 6, 3, -1],
  /* 152 */[8, 2, 3, 8, 4, 2, 4, 6, 2, -1, -1, -1, -1, -1, -1, -1],
  /* 153 */[0, 4, 2, 4, 6, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 154 */[1, 9, 0, 2, 3, 4, 2, 4, 6, 4, 3, 8, -1, -1, -1, -1],
  /* 155 */[1, 9, 4, 1, 4, 2, 2, 4, 6, -1, -1, -1, -1, -1, -1, -1],
  /* 156 */[8, 1, 3, 8, 6, 1, 8, 4, 6, 6, 10, 1, -1, -1, -1, -1],
  /* 157 */[10, 1, 0, 10, 0, 6, 6, 0, 4, -1, -1, -1, -1, -1, -1, -1],
  /* 158 */[4, 6, 3, 4, 3, 8, 6, 10, 3, 0, 3, 9, 10, 9, 3, -1],
  /* 159 */[10, 9, 4, 6, 10, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],

  /* 160 */[4, 9, 5, 7, 6, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 161 */[0, 8, 3, 4, 9, 5, 11, 7, 6, -1, -1, -1, -1, -1, -1, -1],
  /* 162 */[5, 0, 1, 5, 4, 0, 7, 6, 11, -1, -1, -1, -1, -1, -1, -1],
  /* 163 */[11, 7, 6, 8, 3, 4, 3, 5, 4, 3, 1, 5, -1, -1, -1, -1],
  /* 164 */[9, 5, 4, 10, 1, 2, 7, 6, 11, -1, -1, -1, -1, -1, -1, -1],
  /* 165 */[6, 11, 7, 1, 2, 10, 0, 8, 3, 4, 9, 5, -1, -1, -1, -1],
  /* 166 */[7, 6, 11, 5, 4, 10, 4, 2, 10, 4, 0, 2, -1, -1, -1, -1],
  /* 167 */[3, 4, 8, 3, 5, 4, 3, 2, 5, 10, 5, 2, 11, 7, 6, -1],
  /* 168 */[7, 2, 3, 7, 6, 2, 5, 4, 9, -1, -1, -1, -1, -1, -1, -1],
  /* 169 */[9, 5, 4, 0, 8, 6, 0, 6, 2, 6, 8, 7, -1, -1, -1, -1],

  /* 170 */[3, 6, 2, 3, 7, 6, 1, 5, 0, 5, 4, 0, -1, -1, -1, -1],
  /* 171 */[6, 2, 8, 6, 8, 7, 2, 1, 8, 4, 8, 5, 1, 5, 8, -1],
  /* 172 */[9, 5, 4, 10, 1, 6, 1, 7, 6, 1, 3, 7, -1, -1, -1, -1],
  /* 173 */[1, 6, 10, 1, 7, 6, 1, 0, 7, 8, 7, 0, 9, 5, 4, -1],
  /* 174 */[4, 0, 10, 4, 10, 5, 0, 3, 10, 6, 10, 7, 3, 7, 10, -1],
  /* 175 */[7, 6, 10, 7, 10, 8, 5, 4, 10, 4, 8, 10, -1, -1, -1, -1],
  /* 176 */[6, 9, 5, 6, 11, 9, 11, 8, 9, -1, -1, -1, -1, -1, -1, -1],
  /* 177 */[3, 6, 11, 0, 6, 3, 0, 5, 6, 0, 9, 5, -1, -1, -1, -1],
  /* 178 */[0, 11, 8, 0, 5, 11, 0, 1, 5, 5, 6, 11, -1, -1, -1, -1],
  /* 179 */[6, 11, 3, 6, 3, 5, 5, 3, 1, -1, -1, -1, -1, -1, -1, -1],

  /* 180 */[1, 2, 10, 9, 5, 11, 9, 11, 8, 11, 5, 6, -1, -1, -1, -1],
  /* 181 */[0, 11, 3, 0, 6, 11, 0, 9, 6, 5, 6, 9, 1, 2, 10, -1],
  /* 182 */[11, 8, 5, 11, 5, 6, 8, 0, 5, 10, 5, 2, 0, 2, 5, -1],
  /* 183 */[6, 11, 3, 6, 3, 5, 2, 10, 3, 10, 5, 3, -1, -1, -1, -1],
  /* 184 */[5, 8, 9, 5, 2, 8, 5, 6, 2, 3, 8, 2, -1, -1, -1, -1],
  /* 185 */[9, 5, 6, 9, 6, 0, 0, 6, 2, -1, -1, -1, -1, -1, -1, -1],
  /* 186 */[1, 5, 8, 1, 8, 0, 5, 6, 8, 3, 8, 2, 6, 2, 8, -1],
  /* 187 */[1, 5, 6, 2, 1, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 188 */[1, 3, 6, 1, 6, 10, 3, 8, 6, 5, 6, 9, 8, 9, 6, -1],
  /* 189 */[10, 1, 0, 10, 0, 6, 9, 5, 0, 5, 6, 0, -1, -1, -1, -1],

  /* 190 */[0, 3, 8, 5, 6, 10, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 191 */[10, 5, 6, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 192 */[11, 5, 10, 7, 5, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 193 */[11, 5, 10, 11, 7, 5, 8, 3, 0, -1, -1, -1, -1, -1, -1, -1],
  /* 194 */[5, 11, 7, 5, 10, 11, 1, 9, 0, -1, -1, -1, -1, -1, -1, -1],
  /* 195 */[10, 7, 5, 10, 11, 7, 9, 8, 1, 8, 3, 1, -1, -1, -1, -1],
  /* 196 */[11, 1, 2, 11, 7, 1, 7, 5, 1, -1, -1, -1, -1, -1, -1, -1],
  /* 197 */[0, 8, 3, 1, 2, 7, 1, 7, 5, 7, 2, 11, -1, -1, -1, -1],
  /* 198 */[9, 7, 5, 9, 2, 7, 9, 0, 2, 2, 11, 7, -1, -1, -1, -1],
  /* 199 */[7, 5, 2, 7, 2, 11, 5, 9, 2, 3, 2, 8, 9, 8, 2, -1],

  /* 200 */[2, 5, 10, 2, 3, 5, 3, 7, 5, -1, -1, -1, -1, -1, -1, -1],
  /* 201 */[8, 2, 0, 8, 5, 2, 8, 7, 5, 10, 2, 5, -1, -1, -1, -1],
  /* 202 */[9, 0, 1, 5, 10, 3, 5, 3, 7, 3, 10, 2, -1, -1, -1, -1],
  /* 203 */[9, 8, 2, 9, 2, 1, 8, 7, 2, 10, 2, 5, 7, 5, 2, -1],
  /* 204 */[1, 3, 5, 3, 7, 5, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 205 */[0, 8, 7, 0, 7, 1, 1, 7, 5, -1, -1, -1, -1, -1, -1, -1],
  /* 206 */[9, 0, 3, 9, 3, 5, 5, 3, 7, -1, -1, -1, -1, -1, -1, -1],
  /* 207 */[9, 8, 7, 5, 9, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 208 */[5, 8, 4, 5, 10, 8, 10, 11, 8, -1, -1, -1, -1, -1, -1, -1],
  /* 209 */[5, 0, 4, 5, 11, 0, 5, 10, 11, 11, 3, 0, -1, -1, -1, -1],

  /* 210 */[0, 1, 9, 8, 4, 10, 8, 10, 11, 10, 4, 5, -1, -1, -1, -1],
  /* 211 */[10, 11, 4, 10, 4, 5, 11, 3, 4, 9, 4, 1, 3, 1, 4, -1],
  /* 212 */[2, 5, 1, 2, 8, 5, 2, 11, 8, 4, 5, 8, -1, -1, -1, -1],
  /* 213 */[0, 4, 11, 0, 11, 3, 4, 5, 11, 2, 11, 1, 5, 1, 11, -1],
  /* 214 */[0, 2, 5, 0, 5, 9, 2, 11, 5, 4, 5, 8, 11, 8, 5, -1],
  /* 215 */[9, 4, 5, 2, 11, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 216 */[2, 5, 10, 3, 5, 2, 3, 4, 5, 3, 8, 4, -1, -1, -1, -1],
  /* 217 */[5, 10, 2, 5, 2, 4, 4, 2, 0, -1, -1, -1, -1, -1, -1, -1],
  /* 218 */[3, 10, 2, 3, 5, 10, 3, 8, 5, 4, 5, 8, 0, 1, 9, -1],
  /* 219 */[5, 10, 2, 5, 2, 4, 1, 9, 2, 9, 4, 2, -1, -1, -1, -1],

  /* 220 */[8, 4, 5, 8, 5, 3, 3, 5, 1, -1, -1, -1, -1, -1, -1, -1],
  /* 221 */[0, 4, 5, 1, 0, 5, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 222 */[8, 4, 5, 8, 5, 3, 9, 0, 5, 0, 3, 5, -1, -1, -1, -1],
  /* 223 */[9, 4, 5, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 224 */[4, 11, 7, 4, 9, 11, 9, 10, 11, -1, -1, -1, -1, -1, -1, -1],
  /* 225 */[0, 8, 3, 4, 9, 7, 9, 11, 7, 9, 10, 11, -1, -1, -1, -1],
  /* 226 */[1, 10, 11, 1, 11, 4, 1, 4, 0, 7, 4, 11, -1, -1, -1, -1],
  /* 227 */[3, 1, 4, 3, 4, 8, 1, 10, 4, 7, 4, 11, 10, 11, 4, -1],
  /* 228 */[4, 11, 7, 9, 11, 4, 9, 2, 11, 9, 1, 2, -1, -1, -1, -1],
  /* 229 */[9, 7, 4, 9, 11, 7, 9, 1, 11, 2, 11, 1, 0, 8, 3, -1],

  /* 230 */[11, 7, 4, 11, 4, 2, 2, 4, 0, -1, -1, -1, -1, -1, -1, -1],
  /* 231 */[11, 7, 4, 11, 4, 2, 8, 3, 4, 3, 2, 4, -1, -1, -1, -1],
  /* 232 */[2, 9, 10, 2, 7, 9, 2, 3, 7, 7, 4, 9, -1, -1, -1, -1],
  /* 233 */[9, 10, 7, 9, 7, 4, 10, 2, 7, 8, 7, 0, 2, 0, 7, -1],
  /* 234 */[3, 7, 10, 3, 10, 2, 7, 4, 10, 1, 10, 0, 4, 0, 10, -1],
  /* 235 */[1, 10, 2, 8, 7, 4, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 236 */[4, 9, 1, 4, 1, 7, 7, 1, 3, -1, -1, -1, -1, -1, -1, -1],
  /* 237 */[4, 9, 1, 4, 1, 7, 0, 8, 1, 8, 7, 1, -1, -1, -1, -1],
  /* 238 */[4, 0, 3, 7, 4, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 239 */[4, 8, 7, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],

  /* 240 */[9, 10, 8, 10, 11, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 241 */[3, 0, 9, 3, 9, 11, 11, 9, 10, -1, -1, -1, -1, -1, -1, -1],
  /* 242 */[0, 1, 10, 0, 10, 8, 8, 10, 11, -1, -1, -1, -1, -1, -1, -1],
  /* 243 */[3, 1, 10, 11, 3, 10, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 244 */[1, 2, 11, 1, 11, 9, 9, 11, 8, -1, -1, -1, -1, -1, -1, -1],
  /* 245 */[3, 0, 9, 3, 9, 11, 1, 2, 9, 2, 11, 9, -1, -1, -1, -1],
  /* 246 */[0, 2, 11, 8, 0, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 247 */[3, 2, 11, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 248 */[2, 3, 8, 2, 8, 10, 10, 8, 9, -1, -1, -1, -1, -1, -1, -1],
  /* 249 */[9, 10, 2, 0, 9, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],

  /* 250 */[2, 3, 8, 2, 8, 10, 0, 1, 8, 1, 10, 8, -1, -1, -1, -1],
  /* 251 */[1, 10, 2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 252 */[1, 3, 8, 9, 1, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 253 */[0, 9, 1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 254 */[0, 3, 8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  /* 255 */[-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
];


// エッジテーブル
// https://github.com/deep110/terrain-editor-js/blob/master/marching-cubes.js#L260

const edgeTable = [
  //
  // 配列のインデックスを2進数で表記したとき、各桁は頂点を表している。
  // 1が立っている頂点はしきい値を超えている。
  //
  // 格納されている値を2進数で表記したとき、各桁はエッジを表している。
  // 1が立っているエッジで等圧面が交わることを表している。
  // この表を参照することで、どのエッジで交わるのかはわかるものの、
  // 実際に3角形のポリゴンを生成するにはどの3点の組み合わせを用いるのか、を知る必要がある。
  // それにはtriangulationTableを参照する必要がある。
  //
  /*                        1           */
  /*                 765432109876543210 */
  /*  0 = 0000 0000 */0b0000000000000000,
  /*  1 = 0000 0001 */0b0000000100001001, // 0x109 e0, e3, e8
  /*  2 = 0000 0010 */0b0000001000000011, // 0x203 e0, e1, e9
  /*  3 = 0000 0011 */0b0000001100001010, // 0x30a e1, e3, e8, e9
  /*  4 = 0000 0100 */0b0000010000000110, // 0x406 e1, e2, e10
  /*  5 = 0000 0101 */0b0000010100001111, // 0x50f e0, e1, e2, e3, e10
  /*  6 = 0000 0110 */0b0000011000000101, // 0x605 e0, e2, e9, e10
  /*  7 = 0000 0111 */0b0000011100001100, // 0x70c e2, e3, e8, e9, e10
  /*  8 = 0000 1000 */0b0000100000001100, // 0x80c e2, e3, e11
  /*  9 = 0000 1001 */0b0000100100000101, // 0x905 e0, e2, e8, e11
  /* 10 = 0000 1010 */0b0000101000001111, // 0xa0f e0, e1, e2, e3, e9, e11
  /* 11 = 0000 1011 */0b0000101100000110, // 0xb06 e1, e2, e8, e9, e11
  /* 12 = 0000 1100 */0b0000110000001010, // 0xc0a e1, e3, e9, e10
  /* 13 = 0000 1101 */0b0000110100000011, // 0xd03 e0, e1, e8, e10, e11
  /* 14 = 0000 1110 */0b0000111000001001, // 0xe09 e0, e3, e8, e9, e10
  /* 15 = 0000 1111 */0b0000111100000000, // 0xf00 e8, e9, e10, e11
  0x190, 0x99, 0x393, 0x29a, 0x596, 0x49f, 0x795, 0x69c,
  0x99c, 0x895, 0xb9f, 0xa96, 0xd9a, 0xc93, 0xf99, 0xe90,
  0x230, 0x339, 0x33, 0x13a, 0x636, 0x73f, 0x435, 0x53c,
  0xa3c, 0xb35, 0x83f, 0x936, 0xe3a, 0xf33, 0xc39, 0xd30,
  0x3a0, 0x2a9, 0x1a3, 0xaa, 0x7a6, 0x6af, 0x5a5, 0x4ac,
  0xbac, 0xaa5, 0x9af, 0x8a6, 0xfaa, 0xea3, 0xda9, 0xca0,
  0x460, 0x569, 0x663, 0x76a, 0x66, 0x16f, 0x265, 0x36c,
  0xc6c, 0xd65, 0xe6f, 0xf66, 0x86a, 0x963, 0xa69, 0xb60,
  0x5f0, 0x4f9, 0x7f3, 0x6fa, 0x1f6, 0xff, 0x3f5, 0x2fc,
  0xdfc, 0xcf5, 0xfff, 0xef6, 0x9fa, 0x8f3, 0xbf9, 0xaf0,
  0x650, 0x759, 0x453, 0x55a, 0x256, 0x35f, 0x55, 0x15c,
  0xe5c, 0xf55, 0xc5f, 0xd56, 0xa5a, 0xb53, 0x859, 0x950,
  0x7c0, 0x6c9, 0x5c3, 0x4ca, 0x3c6, 0x2cf, 0x1c5, 0xcc,
  0xfcc, 0xec5, 0xdcf, 0xcc6, 0xbca, 0xac3, 0x9c9, 0x8c0,
  0x8c0, 0x9c9, 0xac3, 0xbca, 0xcc6, 0xdcf, 0xec5, 0xfcc,
  0xcc, 0x1c5, 0x2cf, 0x3c6, 0x4ca, 0x5c3, 0x6c9, 0x7c0,
  0x950, 0x859, 0xb53, 0xa5a, 0xd56, 0xc5f, 0xf55, 0xe5c,
  0x15c, 0x55, 0x35f, 0x256, 0x55a, 0x453, 0x759, 0x650,
  0xaf0, 0xbf9, 0x8f3, 0x9fa, 0xef6, 0xfff, 0xcf5, 0xdfc,
  0x2fc, 0x3f5, 0xff, 0x1f6, 0x6fa, 0x7f3, 0x4f9, 0x5f0,
  0xb60, 0xa69, 0x963, 0x86a, 0xf66, 0xe6f, 0xd65, 0xc6c,
  0x36c, 0x265, 0x16f, 0x66, 0x76a, 0x663, 0x569, 0x460,
  0xca0, 0xda9, 0xea3, 0xfaa, 0x8a6, 0x9af, 0xaa5, 0xbac,
  0x4ac, 0x5a5, 0x6af, 0x7a6, 0xaa, 0x1a3, 0x2a9, 0x3a0,
  0xd30, 0xc39, 0xf33, 0xe3a, 0x936, 0x83f, 0xb35, 0xa3c,
  0x53c, 0x435, 0x73f, 0x636, 0x13a, 0x33, 0x339, 0x230,
  0xe90, 0xf99, 0xc93, 0xd9a, 0xa96, 0xb9f, 0x895, 0x99c,
  0x69c, 0x795, 0x49f, 0x596, 0x29a, 0x393, 0x99, 0x190,
  0xf00, 0xe09, 0xd03, 0xc0a, 0xb06, 0xa0f, 0x905, 0x80c,
  0x70c, 0x605, 0x50f, 0x406, 0x30a, 0x203, 0x109, 0x0,
];


class MarchingCubes {

  xMax;
  yMax;
  zMax;
  sampleSize;

  vertices; // Float32Array
  edges;

  constructor(xMax, yMax, zMax, sampleSize = 1) {
    this.xMax = xMax;
    this.yMax = yMax;
    this.zMax = zMax;
    this.sampleSize = sampleSize;

    this.vertices = new Float32Array(this.xMax * this.yMax * this.zMax * 8 * 12 * 3);
    this.edges = [];
    for (let i = 0; i < 12; i++) {
      this.edges.push(new Float32Array(3));
    }

  }


  generateMesh(geometry, surfaceLevel, terrain) {

    let fI, fJ, fK;

    let x, y, z;

    let vIdx = 0;

    for (let i = -this.xMax; i < this.xMax; i++) {

      // 右にxMAX移動した場所を指すので、0～2*xMAXの範囲を移動する
      fI = i + this.xMax;

      // X座標
      x = i * this.sampleSize;

      for (let j = -this.yMax + 1; j < this.yMax - 1; j++) {

        // 上にyMAX移動した場所を指すので、0～2*yMAXの範囲を移動する
        fJ = j + this.yMax;

        // Y座標
        y = j * this.sampleSize;

        for (let k = -this.zMax; k < this.zMax; k++) {

          // 手前にzMAX移動した場所を指すので、0～2*zMaxの範囲を移動する
          fK = k + this.zMax;

          // Z座標
          z = k * this.sampleSize;

          const v0 = terrain.getField(fI, fJ, fK);             // 起点を左奥として
          const v1 = terrain.getField(fI + 1, fJ, fK);         // 時計回りに
          const v2 = terrain.getField(fI + 1, fJ, fK + 1);     // 平面を
          const v3 = terrain.getField(fI, fJ, fK + 1);         // 回る

          const v4 = terrain.getField(fI, fJ + 1, fK);         // 上に移動して
          const v5 = terrain.getField(fI + 1, fJ + 1, fK);     // 時計回りに
          const v6 = terrain.getField(fI + 1, fJ + 1, fK + 1); // 平面を
          const v7 = terrain.getField(fI, fJ + 1, fK + 1)      // 回る

          let cubeIndex = this.#getCubeIndex(surfaceLevel, v0, v1, v2, v3, v4, v5, v6, v7);

          let edgeIndex = edgeTable[cubeIndex];
          if (edgeIndex == 0) {
            continue;
          }
          let mu = this.sampleSize / 2;
          if (edgeIndex & 1) {
            mu = (surfaceLevel - v0) / (v1 - v0);
            this.#setFloatArray(this.edges[0], this.#lerp(x, x + this.sampleSize, mu), y, z);
          }
          if (edgeIndex & 2) {
            mu = (surfaceLevel - v1) / (v2 - v1);
            this.#setFloatArray(this.edges[1], x + this.sampleSize, y, this.#lerp(z, z + this.sampleSize, mu));
          }
          if (edgeIndex & 4) {
            mu = (surfaceLevel - v3) / (v2 - v3);
            this.#setFloatArray(this.edges[2], this.#lerp(x, x + this.sampleSize, mu), y, z + this.sampleSize);
          }
          if (edgeIndex & 8) {
            mu = (surfaceLevel - v0) / (v3 - v0);
            this.#setFloatArray(this.edges[3], x, y, this.#lerp(z, z + this.sampleSize, mu));
          }
          if (edgeIndex & 16) {
            mu = (surfaceLevel - v4) / (v5 - v4);
            this.#setFloatArray(this.edges[4], this.#lerp(x, x + this.sampleSize, mu), y + this.sampleSize, z);
          }
          if (edgeIndex & 32) {
            mu = (surfaceLevel - v5) / (v6 - v5);
            this.#setFloatArray(this.edges[5], x + this.sampleSize, y + this.sampleSize, this.#lerp(z, z + this.sampleSize, mu));
          }
          if (edgeIndex & 64) {
            mu = (surfaceLevel - v7) / (v6 - v7);
            this.#setFloatArray(this.edges[6], this.#lerp(x, x + this.sampleSize, mu), y + this.sampleSize, z + this.sampleSize);
          }
          if (edgeIndex & 128) {
            mu = (surfaceLevel - v4) / (v7 - v4);
            this.#setFloatArray(this.edges[7], x, y + this.sampleSize, this.#lerp(z, z + this.sampleSize, mu));
          }
          if (edgeIndex & 256) {
            mu = (surfaceLevel - v0) / (v4 - v0);
            this.#setFloatArray(this.edges[8], x, this.#lerp(y, y + this.sampleSize, mu), z);
          }
          if (edgeIndex & 512) {
            mu = (surfaceLevel - v1) / (v5 - v1);
            this.#setFloatArray(this.edges[9], x + this.sampleSize, this.#lerp(y, y + this.sampleSize, mu), z);
          }
          if (edgeIndex & 1024) {
            mu = (surfaceLevel - v2) / (v6 - v2);
            this.#setFloatArray(this.edges[10], x + this.sampleSize, this.#lerp(y, y + this.sampleSize, mu), z + this.sampleSize);
          }
          if (edgeIndex & 2048) {
            mu = (surfaceLevel - v3) / (v7 - v3);
            this.#setFloatArray(this.edges[11], x, this.#lerp(y, y + this.sampleSize, mu), z + this.sampleSize);
          }

          const triLen = triangulationTable[cubeIndex];
          for (let i = 0; i < triLen.length; i++) {
            if (triLen[i] === -1) {
              break;
            }
            const e = this.edges[triLen[i]];
            this.vertices[vIdx] = e[0];
            this.vertices[vIdx + 1] = e[1];
            this.vertices[vIdx + 2] = e[2];
            vIdx += 3;
          }
        }
      }
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(this.vertices.slice(0, vIdx), 3));
    geometry.computeVertexNormals();

    // tell three.js that mesh has been updated
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.normal.needsUpdate = true;
  }

  #getCubeIndex(isoLevel, a, b, c, d, e, f, g, h) {
    let cubeIndex = 0;

    if (a < isoLevel) cubeIndex |= 1;
    if (b < isoLevel) cubeIndex |= 2;
    if (c < isoLevel) cubeIndex |= 4;
    if (d < isoLevel) cubeIndex |= 8;
    if (e < isoLevel) cubeIndex |= 16;
    if (f < isoLevel) cubeIndex |= 32;
    if (g < isoLevel) cubeIndex |= 64;
    if (h < isoLevel) cubeIndex |= 128;

    return cubeIndex;
  }

  #setFloatArray(arr, a, b, c) {
    arr[0] = a;
    arr[1] = b;
    arr[2] = c;
  }

  #lerp(start, end, amt) {
    return (1 - amt) * start + amt * end;
  }
}



const ISO_LEVEL = 0;
const WIDTH = 60;
const HEIGHT = WIDTH;
const DEPTH = WIDTH;

class Terrain {

  xMax;
  yMax;
  zMax;
  sampleSize;

  xMax2;
  yMax2;
  zMax2;

  fieldBuffer;

  geometry;
  material;
  mesh;

  // MarchingCubesクラスオブジェクト
  marchingCubes;

  constructor(width, height, depth, sampleSize) {

    this.xMax = Math.floor(width / (2 * sampleSize));
    this.yMax = Math.floor(height / (2 * sampleSize));
    this.zMax = Math.floor(depth / (2 * sampleSize));
    this.sampleSize = sampleSize;

    console.log(`width=${width}, sampleSize=${sampleSize}, xMax=${this.xMax}`);

    this.xMax2 = 2 * this.xMax;
    this.yMax2 = 2 * this.yMax;
    this.zMax2 = 2 * this.zMax;

    this.fieldBuffer = new Float32Array((this.xMax + 1) * (this.yMax + 1) * (this.zMax + 1) * 8);

    this.geometry = new THREE.BufferGeometry();
    this.material = new THREE.MeshStandardMaterial({ color: 0xffffff });
    this.mesh = new THREE.Mesh(this.geometry, this.material);

    // marching cuves
    this.marchingCubes = new MarchingCubes(this.xMax, this.yMax, this.zMax, sampleSize);

    // generate mesh geometry
    this.generateHeightField();

    // メッシュを作成
    this.marchingCubes.generateMesh(this.geometry, ISO_LEVEL, this);
  }

  setField(i, j, k, amt) {
    this.fieldBuffer[i * this.xMax2 * this.zMax2 + k * this.zMax2 + j] = amt;
  }

  getField(i, j, k) {
    return this.fieldBuffer[i * this.xMax2 * this.zMax2 + k * this.zMax2 + j];
  }

  getMesh() {
    return this.mesh;
  }

  generateHeightField() {
    for (let i = -this.xMax; i < this.xMax + 1; i++) {
      let x = i * this.sampleSize;
      for (let j = -this.yMax; j < this.yMax + 1; j++) {
        let y = j * this.sampleSize;
        for (let k = -this.zMax; k < this.zMax + 1; k++) {
          let z = k * this.sampleSize;
          this.setField(i + this.xMax, j + this.yMax, k + this.zMax, this.#heightValue(x, y, z));
        }
      }
    }
  }


  // noise values
  numOctaves = 4;
  lacunarity = 2;
  persistence = 0.5;
  noiseScale = 2;
  noiseWeight = 7;
  floorOffset = 5;
  weightMultiplier = 3.6;

  // ノイズ
  simplex = new SimplexNoise();

  #heightValue(x, y, z) {
    let offsetNoise = 1;
    let noise = 0;

    let frequency = this.noiseScale / 100;
    let amplitude = 1;
    let weight = 1;
    for (var j = 0; j < this.numOctaves; j++) {
      let n = this.simplex.noise3d(
        (x + offsetNoise) * frequency,
        (y + offsetNoise) * frequency,
        (z + offsetNoise) * frequency,
      );
      let v = 1 - Math.abs(n);
      v = v * v * weight;
      weight = Math.max(Math.min(v * this.weightMultiplier, 1), 0);
      noise += v * amplitude;
      amplitude *= this.persistence;
      frequency *= this.lacunarity;
    }

    let finalVal = -(y + this.floorOffset) + noise * this.noiseWeight;

    return -finalVal;
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
  statsjs;

  renderParams = {
    clock: new THREE.Clock(),
    delta: 0,
    interval: 1 / 30,  // = 30fps
  }

  params = {
    gridSize: 10,
    gridNums: { x: 50, y: 50 },
    threshold: 0.4,
  }


  constructor(params) {

    params = params || {};
    this.params = Object.assign(this.params, params);

    // scene, camera, renderer, controllerを初期化
    this.initThreejs();

    // stats.jsを初期化
    this.initStatsjs();

    // Terrainクラスをインスタンス化して、
    const terrain = new Terrain(WIDTH, HEIGHT, DEPTH, 10);

    // メッシュをシーンに追加
    const mesh = terrain.getMesh();
    this.scene.add(mesh);

    // リサイズイベント
    window.addEventListener("resize", () => { this.onWindowResize(); }, false);

    // フレーム毎の処理(requestAnimationFrameで再帰的に呼び出される)
    this.render();
  }


  initThreejs() {
    // コンテナ
    this.container = document.getElementById("threejsContainer");

    // コンテナのサイズ
    this.sizes.width = this.container.clientWidth;
    this.sizes.height = this.container.clientHeight;

    // シーン
    this.scene = new THREE.Scene();

    // 背景色
    this.scene.background = new THREE.Color("#3a3a3a");

    // カメラ
    this.camera = new THREE.PerspectiveCamera(
      60,
      this.sizes.width / this.sizes.height,
      1,
      1001
    );
    this.camera.position.set(15, 20, 20);

    // レンダラ
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.sizes.width, this.sizes.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    // コントローラ
    this.controller = new OrbitControls(this.camera, this.renderer.domElement);

    // 更新するものがないなら、this.render()は呼ばずに、こうするだけでよい
    // this.controller.addEventListener('change', () => { this.renderer.render(this.scene, this.camera); });

    // グリッドヘルパー
    this.scene.add(new THREE.GridHelper(60, 60, new THREE.Color(0xffffff), new THREE.Color(0xffffff)));

    // ディレクショナルライト
    const directionalLight = new THREE.DirectionalLight(0xFFFFFF, 0.5);
    directionalLight.position.set(-5, 2, 10);
    this.scene.add(directionalLight);

    // 環境光
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));

    // lil-gui
    const guiContainer = document.getElementById("guiContainer");
    const gui = new GUI({
      container: guiContainer,
    });

    gui
      .add(this.params, "threshold")
      .min(0.1)
      .max(0.6)
      .step(0.01)
      .name("threshold");
  }


  initStatsjs() {
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


  render() {
    // 再帰処理
    requestAnimationFrame(() => { this.render(); });

    this.renderParams.delta += this.renderParams.clock.getDelta();
    if (this.renderParams.delta < this.renderParams.interval) {
      return;
    }

    {
      // stats.jsを更新
      this.statsjs.update();

      // カメラコントローラーの更新
      this.controller.update();



      // 再描画
      this.renderer.render(this.scene, this.camera);
    }

    this.renderParams.delta %= this.renderParams.interval;
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
