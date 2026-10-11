/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
// Small shared sources the shore modules import, ported 1:1 so the folder stands alone:
//   src/util/Noise.js 1-110 (mulberry32, Noise2D, smoothstep, clamp, lerp)
//   src/world/terrain/TerrainNoise.js 5-12 (hash2)
//   src/materials/LODFade.js 45-50 (bandFade, CPU side)
//   src/world/WorldLayout.js 5-36 (WORLD)
//   src/world/terrain/IslandShape.js 79-117 (PATHS, polylineDistance)
//   src/world/terrain/TerrainShading.js 24-45 (srgb, rot2: WGSL constant builders)
import { Color, SRGBColorSpace, Vector2, Vector3 } from 'three';

export function mulberry32( seed:number ) {

	let a = seed >>> 0;
	return function () {

		a = ( a + 0x6D2B79F5 ) >>> 0;
		let t = a;
		t = Math.imul( t ^ ( t >>> 15 ), t | 1 );
		t ^= t + Math.imul( t ^ ( t >>> 7 ), t | 61 );
		return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;

	};

}

export type Rng = () => number;

export class Noise2D {

	perm:Uint8Array;
	grad:Float32Array;

	constructor( seed = 1 ) {

		const rand = mulberry32( seed );
		const p = new Uint8Array( 256 );
		for ( let i = 0; i < 256; i ++ ) p[ i ] = i;
		for ( let i = 255; i > 0; i -- ) {

			const j = Math.floor( rand() * ( i + 1 ) );
			const t = p[ i ]!; p[ i ] = p[ j ]!; p[ j ] = t;

		}

		this.perm = new Uint8Array( 512 );
		for ( let i = 0; i < 512; i ++ ) this.perm[ i ] = p[ i & 255 ]!;
		this.grad = new Float32Array( 512 );
		for ( let i = 0; i < 256; i ++ ) {

			const a = rand() * Math.PI * 2;
			this.grad[ i * 2 ] = Math.cos( a );
			this.grad[ i * 2 + 1 ] = Math.sin( a );

		}

	}

	// gradient noise, roughly in [-1, 1]
	noise( x:number, y:number ) {

		const xi = Math.floor( x ), yi = Math.floor( y );
		const xf = x - xi, yf = y - yi;
		const X = xi & 255, Y = yi & 255;
		const perm = this.perm, g = this.grad;
		const h00 = perm[ X + perm[ Y ]! ]!, h10 = perm[ X + 1 + perm[ Y ]! ]!;
		const h01 = perm[ X + perm[ Y + 1 ]! ]!, h11 = perm[ X + 1 + perm[ Y + 1 ]! ]!;
		const d00 = g[ h00 * 2 ]! * xf + g[ h00 * 2 + 1 ]! * yf;
		const d10 = g[ h10 * 2 ]! * ( xf - 1 ) + g[ h10 * 2 + 1 ]! * yf;
		const d01 = g[ h01 * 2 ]! * xf + g[ h01 * 2 + 1 ]! * ( yf - 1 );
		const d11 = g[ h11 * 2 ]! * ( xf - 1 ) + g[ h11 * 2 + 1 ]! * ( yf - 1 );
		const u = xf * xf * xf * ( xf * ( xf * 6 - 15 ) + 10 );
		const v = yf * yf * yf * ( yf * ( yf * 6 - 15 ) + 10 );
		const a = d00 + ( d10 - d00 ) * u;
		const b = d01 + ( d11 - d01 ) * u;
		return ( a + ( b - a ) * v ) * 1.414;

	}

	fbm( x:number, y:number, octaves = 5, lacunarity = 2.0, gain = 0.5 ) {

		let sum = 0, amp = 1, freq = 1, norm = 0;
		for ( let i = 0; i < octaves; i ++ ) {

			sum += this.noise( x * freq + i * 17.13, y * freq - i * 9.71 ) * amp;
			norm += amp;
			amp *= gain;
			freq *= lacunarity;

		}

		return sum / norm;

	}

	ridged( x:number, y:number, octaves = 5 ) {

		let sum = 0, amp = 0.5, freq = 1, prev = 1;
		for ( let i = 0; i < octaves; i ++ ) {

			let n = 1 - Math.abs( this.noise( x * freq + i * 31.7, y * freq + i * 11.3 ) );
			n *= n;
			sum += n * amp * prev;
			prev = n;
			amp *= 0.5;
			freq *= 2.03;

		}

		return sum;

	}

}

export const smoothstep = ( a:number, b:number, x:number ) => {

	const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );

};

export const clamp = ( x:number, a:number, b:number ) => Math.min( b, Math.max( a, x ) );
export const lerp = ( a:number, b:number, t:number ) => a + ( b - a ) * t;

// TerrainNoise.js hash2: integer hash -> [0, 1) (JS integer overflow is part of the generator)
export function hash2( i:number, j:number, s:number ) {

	let h = Math.imul( i, 374761393 ) + Math.imul( j, 668265263 ) + Math.imul( s, 1274126177 );
	h = Math.imul( h ^ ( h >>> 13 ), 1274126177 );
	h ^= h >>> 16;
	return ( h >>> 0 ) / 4294967296;

}

// LODFade.js bandFade: fade factor across a distance band [start, end] (0 before, 1 after)
export function bandFade( dist:number, start:number, end:number ) {

	const t = ( dist - start ) / Math.max( end - start, 1e-6 );
	return t <= 0 ? 0 : t >= 1 ? 1 : t * t * ( 3 - 2 * t );

}

// WorldLayout.js WORLD: shared world layout. Metres, y up, sea level y = 0; ocean to +z, island to -z.
export const WORLD = {
	terrainSize: 2048,
	terrainRes: 2048,
	beach: { xMin: - 150, xMax: 170 },
	pier: { x: 55, zStart: - 64, zEnd: 40, deckHeight: 2.3, width: 2.6, headWidth: 14, headDepth: 7 },
	boatDock: { position: new Vector3( 64.5, 0, 36.5 ), heading: 0 },
	village: { center: new Vector3( 40, 0, - 118 ), radius: 95 },
	reef: { center: new Vector3( - 78, 0, 58 ), radius: 58 },
	spawn: { position: new Vector3( 18, 0, - 60 ), yaw: Math.PI },
	start: { position: new Vector3( 53.6, 0, - 77 ), yaw: Math.PI },
	swellDir: new Vector2( - 0.12, - 1 ).normalize(),
};

export type XZ = readonly [number, number];
export interface IslandPath { w:number; pts:readonly XZ[] }

// IslandShape.js PATHS: the footpaths (width, polyline)
export const PATHS:readonly IslandPath[] = [
	{ w: 1.1, pts: [ [ 21, - 56 ], [ 20, - 68 ], [ 18.5, - 80 ], [ 16.5, - 92 ], [ 15.5, - 100 ], [ 20, - 102.5 ], [ 28, - 104.5 ], [ 35.5, - 108.5 ] ] },
	{ w: 0.6, pts: [ [ 42, - 116.5 ], [ 45.5, - 126 ], [ 48, - 138 ], [ 49, - 150 ], [ 49.5, - 162 ], [ 47, - 175 ], [ 41, - 188 ], [ 36, - 199 ], [ 31, - 212 ], [ 33, - 224 ], [ 26, - 236 ], [ 20, - 247 ], [ 24, - 258 ], [ 16, - 270 ], [ 11, - 283 ], [ 15, - 296 ], [ 8, - 309 ], [ 4, - 322 ] ] },
	{ w: 0.9, pts: [ [ 88, - 62 ], [ 80, - 72 ], [ 70, - 80 ], [ 60, - 86 ], [ 54.5, - 90 ] ] },
	{ w: 0.8, pts: [ [ 18, - 62 ], [ 5, - 68 ], [ - 12, - 73 ], [ - 30, - 77 ], [ - 50, - 80 ], [ - 72, - 84 ] ] },
];

// distance from (x, z) to a polyline; returns [distance, arc length position of the closest point]
export function polylineDistance( pts:readonly XZ[], x:number, z:number ):[number, number] {

	let best = Infinity, acc = 0, bestArc = 0;
	for ( let k = 0; k < pts.length - 1; k ++ ) {

		const a = pts[ k ]!, b = pts[ k + 1 ]!;
		const abx = b[ 0 ] - a[ 0 ], abz = b[ 1 ] - a[ 1 ];
		const len2 = abx * abx + abz * abz;
		let t = ( ( x - a[ 0 ] ) * abx + ( z - a[ 1 ] ) * abz ) / len2;
		t = t < 0 ? 0 : t > 1 ? 1 : t;
		const dx = x - ( a[ 0 ] + abx * t ), dz = z - ( a[ 1 ] + abz * t );
		const d = dx * dx + dz * dz;
		const len = Math.sqrt( len2 );
		if ( d < best ) {

			best = d;
			bestArc = acc + t * len;

		}

		acc += len;

	}

	return [ Math.sqrt( best ), bestArc ];

}

// TerrainShading.js srgb: sRGB triplet -> linear vec3 constant (WGSL source)
export const srgb = ( r:number, g:number, b:number ) => {

	const c = new Color().setRGB( r, g, b, SRGBColorSpace );
	return `vec3f( ${ f( c.r ) }, ${ f( c.g ) }, ${ f( c.b ) } )`;

};

// TerrainShading.js rot2: 2D rotation of a vec2 WGSL expression by a constant angle
export const rot2 = ( v:string, a:number ) => {

	const c = Math.cos( a ), s = Math.sin( a );
	return `( mat2x2f( ${ f( c ) }, ${ f( s ) }, ${ f( - s ) }, ${ f( c ) } ) * ( ${ v } ) )`;

};

function f( x:number ) {

	const s = Number( x ).toPrecision( 9 );
	return s.includes( '.' ) || s.includes( 'e' ) ? s : s + '.0';

}
