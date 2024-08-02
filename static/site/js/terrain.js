import * as THREE from "three"
import { OrbitControls } from "OrbitControls"

/*
<!-- three.js -->
<script type="importmap">
  {
    "imports": {
      "three": "/static/build/three.module.js",
      "OrbitControls": "/static/controls/OrbitControls.js"
    }
  }
</script>
*/
// import * as THREE from "../../build/three.module.js";
// import { OrbitControls } from "./controls/OrbitControls.js";


// import GUI from "https://cdn.jsdelivr.net/npm/lil-gui@0.15/+esm";

// Dot product of vectors
Math.dot = function(a, b) {
	return a.x * b.x + a.y * b.y
}

// Linear interpolation between a and b
Math.lerp = function(a, b, t) {
	return a + (b - a) * t
}

// Quintic function
// ax^5 + bx^4 + cx^3 + dx^2 + ex + f
Math.quintic = function(t) {
	return t * t * t * (t * (t * 6 - 15) + 10);
}

// Random unit vector generator
Math.unitVector = function() {
	const phi = 2 * Math.PI * Math.random();
	return {x : Math.cos(phi), y : Math.sin(phi)};
}


class Perlin {
	// Scale is a distance between grid nodes
	constructor(width, height, scale) {
		this.resize(width, height, scale)
	}

	// Array index of unit vector at (x, y) integer coordinates
	indexOf(x, y) {
		x = x >= 0 ? (x % this.width) : (this.width + (x % this.width));
		y = y >= 0 ? (y % this.height) : (this.height + (y % this.height));
		return y * this.width + x;
	}

	// Unit vector at (x, y) integer coordinates
	value(x, y) {
		return this.values[this.indexOf(x, y)];
	}

	// Perlin noise value at (x, y) real coordinates
	get(x, y) {
		// Rescale x and y according to the grid scale
		x /= this.scale;
		y /= this.scale;

		// Integer coordinates of the requested point
		const floor = {x : Math.floor(x), y : Math.floor(y)};

		// Unit vectors of the nearest grid nodes
		const v1 = this.value(floor.x,     floor.y);
		const v2 = this.value(floor.x + 1, floor.y);
		const v3 = this.value(floor.x,     floor.y + 1);
		const v4 = this.value(floor.x + 1, floor.y + 1);

		// Local coordinates of the requested point
		const local = {x : x - floor.x, y : y - floor.y};

		// Vectors that point to the requested point
		const p1 = {x : local.x,     y : local.y};
		const p2 = {x : local.x - 1, y : local.y};
		const p3 = {x : local.x,     y : local.y - 1};
		const p4 = {x : local.x - 1, y : local.y - 1};

		// Dot products of grid unit vectors and pointing vectors
		const d1 = Math.dot(v1, p1);
		const d2 = Math.dot(v2, p2);
		const d3 = Math.dot(v3, p3);
		const d4 = Math.dot(v4, p4);

		// Interpolate between dot products 1 and 2 by quintic(x)
		const ix1 = Math.lerp(d1, d2, Math.quintic(local.x));

		// Interpolate between dot products 3 and 4 by quintic(x)
		const ix2 = Math.lerp(d3, d4, Math.quintic(local.x));

		// Interpolate between two previous results by quintic(y)
		return Math.lerp(ix1, ix2, Math.quintic(local.y));
	}

	// Resize the grid and fill it with random unit vectors
	resize(width, height, scale) {
		this.width = width;
		this.height = height;
		this.scale = scale;
		this.values = new Array(width * height);

		for(let n = 0; n < this.values.length; ++n)
		{
			this.values[n] = Math.unitVector();
		}
	}
}


class Grid {
	constructor(width, height) {
		this.resize(width, height)
	}

	// Index of the value in (x, y) coordinates
	indexOf(x, y) {
		x = x >= 0 ? (x % this.width) : (this.width + (x % this.width))
		y = y >= 0 ? (y % this.height) : (this.height + (y % this.height))
		return y * this.width + x
	}

	get(x, y) {
		return this.values[this.indexOf(x, y)]
	}

	set(x, y, value) {
		this.values[this.indexOf(x, y)] = value
	}

	resize(width, height) {
		this.width = width
		this.height = height
		this.values = new Array(width * height)
	}

	fill(value) {
		this.values.fill(value)
	}

	accumulate(generator, factor) {
		factor = factor || 1
		for(let y = 0; y < this.height; ++y) {
			for(let x = 0; x < this.width; ++x) {
				this.values[this.indexOf(x, y)] += generator.get(x, y) * factor
			}
		}
	}

	normalize() {
		let max = 0;
		for(let n = 0; n < this.values.length; ++n) {
			if(Math.abs(this.values[n]) > max) {
				max = Math.abs(this.values[n])
			}
		}
		if(max) {
			for(let n = 0; n < this.values.length; ++n) {
				this.values[n] /= max
			}
		}
	}
}




class TerrainGenerator {
	constructor(sizeX, sizeZ) {
		this.sizeX = sizeX
		this.sizeZ = sizeZ
	}

	generate(minHeight, maxHeight, flatness) {
		if (typeof maxHeight === 'undefined') {
			maxHeight = 1
		}
		if (typeof flatness!=='number' || flatness<=0) {
			flatness = 100
		}

		this.maxHeight = maxHeight
		this.heights = new Array((this.sizeX+1)*(this.sizeZ+1))
		this.heights.fill(0)

		// generate grid with values [-1, 1]
		const grid = new Grid(this.sizeX, this.sizeZ)
		grid.fill(0)

    // パーリンノイズを８回乗せる
		for(let n=0; n<8; ++n) {
			const factor = Math.pow(2, n)
			const perlin = new Perlin(12*factor, 8*factor, flatness/factor)
			grid.accumulate(perlin, 1/factor)
		}

    // 0～1の範囲に収まるように正規化
		grid.normalize()

    // y座標が0の場合、およびy座標が最大の場合、値を-1にする
		for (let i=0; i<(this.sizeX+1); ++i) {
			grid.set(i, 0, -1)
			grid.set(i, this.sizeZ-1, -1)
		}

    // x座標が0の場合、およびx座標が最大の場合、値を-1にする
		for (let j=0; j<(this.sizeZ+1); ++j) {
			grid.set(0, j, -1)
			grid.set(this.sizeX-1, j, -1)
		}

		// translate values to [minHeight, maxHeight]
		for (let i=0; i<(this.sizeX+1); ++i) {
			for (let j=0; j<(this.sizeZ+1); ++j) {
				const v01 = (grid.get(i, j) + 1) / 2  // [-1, 1] => [0, 1]
				this.heights[i*this.sizeZ+j] = v01 * (maxHeight - minHeight) + minHeight
			}
		}
	}

	getHeightAt(x, z) {
		// TODO: Interpolerate between the 4 closest points
		x = Math.round(x)
		z = Math.round(z)
		return this.heights[x*this.sizeZ+z]
	}

	getMaxHeight() {
		return this.maxHeight
	}

	getSizeX() {
		return this.sizeX
	}

	getSizeZ() {
		return this.sizeZ
	}
}




class TerrainDisplay {

	constructor(container) {
		this.container = container
		this.mesh = null
	}

	display(camera, terrainGenerator) {
		if (this.mesh) {
			this.container.remove(this.mesh)
			this.mesh = null
		}

		let allVertices = []
		let allColors = []

		// display terrain
		for (let i=0; i<terrainGenerator.getSizeX()-1; ++i) {
			for (let j=0; j<terrainGenerator.getSizeZ()-1; ++j) {

				// POSITIONS
				const heightTL = terrainGenerator.getHeightAt(i,   j)
				const heightTR = terrainGenerator.getHeightAt(i+1, j)
				const heightBR = terrainGenerator.getHeightAt(i+1, j+1)
				const heightBL = terrainGenerator.getHeightAt(i,   j+1)

				const tl = new THREE.Vector3(i, heightTL, j)
				const tr = new THREE.Vector3(i+1, heightTR, j)
				const br = new THREE.Vector3(i+1, heightBR, j+1)
				const bl = new THREE.Vector3(i, heightBL, j+1)

        // 三角形を二つ登録する
        for (const t of [[tl, bl, br], [br, tr, tl]]) {

          /*
          反時計回りでも、時計回りでもどっちでもよい

          TL---TR
          |    |
          BL---BR

          TL-BL-BRの直角三角形
          TL
          |
          BL---BR

          BR-TR-TLの直角三角形
          TL---TR
               |
               BR
          */

          allVertices.push(
						t[0].x, t[0].y, t[0].z,
						t[1].x, t[1].y, t[1].z,
						t[2].x, t[2].y, t[2].z
					)

					// COLORS
					// bottom: 0.16 0.41 0.16
					// top:    0.82 0.82 0.29
					function makeColor2(rel) {
						const dark = new THREE.Color(0.16, 0.41, 0.16)
						const light = new THREE.Color(0.92, 0.92, 0.50)
						return light.clone().sub(dark).multiplyScalar(rel).add(dark)
					}
					function makeColor(rel) {
						const a = [0.16, 0.41, 0.16]   // rgb(41,105,41)
						const b = [0.92, 0.92, 0.50]   // rgb(236,236,128)
						return [a[0]+(b[0]-a[0])*rel, a[1]+(b[1]-a[1])*rel, a[2]+(b[2]-a[2])*rel]
					}
					const colors = [
						makeColor2(t[0].y / terrainGenerator.getMaxHeight()),
						makeColor2(t[1].y / terrainGenerator.getMaxHeight()),
						makeColor2(t[2].y / terrainGenerator.getMaxHeight())
					]
					allColors.push(colors[0].r, colors[0].g, colors[0].b, colors[1].r, colors[1].g, colors[1].b, colors[2].r, colors[2].g, colors[2].b)
				}
			}
		}

		const geometry = new THREE.BufferGeometry()

    // 位置を設定
		geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(allVertices), 3))

    // 法線方向を計算する
    geometry.computeVertexNormals()

    // 色を設定
		geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(allColors), 3))

    // メッシュ化
    this.mesh = new THREE.Mesh(geometry, new THREE.MeshPhongMaterial({
			reflectivity: 0,
			// vertexColors: THREE.VertexColors,
		}))

		this.container.add(this.mesh)
	}
}


const TERRAIN_CX = 100
const TERRAIN_CZ = 100



// シーン
const scene = new THREE.Scene()

// カメラ
const camera = new THREE.PerspectiveCamera(50, window.innerWidth/window.innerHeight, 0.1, 10000)
camera.position.set(200, 100, 200)
camera.updateProjectionMatrix()

// レンダラー
const canvas = document.getElementsByTagName('canvas')[0]
const renderer = new THREE.WebGLRenderer({canvas, alpha: true, antialias: true})
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(window.devicePixelRatio? window.devicePixelRatio : 1)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap

// ヘミスフィアライト
const hemisphereLight = new THREE.HemisphereLight(0xaaaaaa, 0x000000, 0.6)
scene.add(hemisphereLight)

// シャドーライト
const shadowLight = new THREE.DirectionalLight(0xeeeeee, 1.0)
shadowLight.position.set(0, 20, -100)
scene.add(shadowLight)

const setupCamera = () => {
	renderer.setSize(window.innerWidth, window.innerHeight)
	camera.aspect = window.innerWidth / window.innerHeight
	camera.updateProjectionMatrix()
}

setupCamera()
window.addEventListener('resize', setupCamera, false)

const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true;

// TERRAIN
const terrainGenerator = new TerrainGenerator(TERRAIN_CX, TERRAIN_CZ)

//terrainGenerator.generate(-4, 50,  50) // super mountainous
//terrainGenerator.generate( 0, 10, 100) // boring flat terrain
terrainGenerator.generate(-4, 20, 100) // some lakes, some hills

const world = new THREE.Group()

const terrainDisplay = new TerrainDisplay(world)

world.position.set(-TERRAIN_CX/2, 0, -TERRAIN_CZ/2)
scene.add(world)

/*
setTimeout(() => {
	terrainDisplay.display(camera, terrainGenerator)
}, 500)
*/

terrainDisplay.display(camera, terrainGenerator)


function loop() {
  controls.update();
	renderer.render(scene, camera)
	requestAnimationFrame(loop)
}

loop()