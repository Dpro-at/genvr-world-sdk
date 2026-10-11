/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
// Source: src/world/vegetation/PlantGeometry.js 357-448 (fern, banana), 871-896 (merged understory and
// banana meshes) and 899-1282 (broadleaf: tube, petiole, blade, monstera, elephant ear, heliconia, bird
// of paradise, merged broadleaf meshes). Private source helpers (mulberry32, smooth, addFrond) are
// copied verbatim here because palm-geometry.ts keeps them private.
import * as THREE from 'three';
import { GeoBuilder, type Four } from './geometry-builder.js';
import { PART, buildYoungPalm } from './palm-geometry.js';

export { PART };

/** Source util/Noise.js mulberry32. */
function mulberry32( seed:number ) {

	let a = seed >>> 0;
	return function () {

		a = ( a + 0x6D2B79F5 ) >>> 0;
		let t = a;
		t = Math.imul( t ^ ( t >>> 15 ), t | 1 );
		t ^= t + Math.imul( t ^ ( t >>> 7 ), t | 61 );
		return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;

	};

}

const smooth = ( a:number, b:number, x:number ) => {

	const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );

};

const _up = new THREE.Vector3( 0, 1, 0 );
const _v0 = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();

export interface Built { geometry:THREE.BufferGeometry; triangles:number }
export interface MergedBuilt<K extends string> extends Built { perKind:Record<K, number> }

interface FrondOptions {origin:THREE.Vector3;azimuth:number;elevation:number;bend:number;twist?:number;length:number;segs?:number;cross?:number;leafLen:(s:number)=>number;leafAngle:(s:number)=>number;droop:(s:number)=>number;curl?:number;part?:number;age?:number;seed?:number;phase?:number;flutter?:number;minWidth?:number;bendPow?:number;stemU?:number;roll?:number;sBase?:number}

// Pinnate frond / leaf (source addFrond, PlantGeometry.js 80-176): two wings hanging off a curved rachis.
function addFrond( b:GeoBuilder, o:FrondOptions ) {

	const {
		origin, azimuth, elevation, bend, twist = 0, length,
		segs = 8, cross = 2,
		leafLen, leafAngle, droop, curl = 0.2,
		part = PART.FROND, age = 0, seed = 0, phase = 0, flutter = 1, minWidth = 0.035,
		bendPow = 1.4, stemU = 1, roll = 0, sBase = 0,
	} = o;

	const pts = [];
	const p = origin.clone();
	for ( let k = 0; k <= segs; k ++ ) {

		pts.push( p.clone() );
		const sm = ( k + 0.5 ) / segs;
		const el = elevation - bend * Math.pow( sm, bendPow );
		const az = azimuth + twist * sm;
		_v0.set( Math.cos( el ) * Math.cos( az ), Math.sin( el ), Math.cos( el ) * Math.sin( az ) );
		p.addScaledVector( _v0, length / segs );

	}

	const azPerp = new THREE.Vector3( - Math.sin( azimuth ), 0, Math.cos( azimuth ) );
	const T = new THREE.Vector3(), S = new THREE.Vector3(), Nup = new THREE.Vector3(), side = new THREE.Vector3(), ld = new THREE.Vector3();

	for ( const sigma of [ - 1, 1 ] ) {

		const grid = [];
		for ( let k = 0; k <= segs; k ++ ) {

			const s = k / segs;
			T.subVectors( pts[ Math.min( segs, k + 1 ) ]!, pts[ Math.max( 0, k - 1 ) ]! ).normalize();
			S.crossVectors( T, _up );
			if ( S.lengthSq() < 0.04 ) S.copy( azPerp );
			S.normalize();
			Nup.crossVectors( S, T ).normalize();
			const Ll = Math.max( leafLen( s ), minWidth );
			const al = leafAngle( s );
			const be = droop( s ) + sigma * roll * s * s;
			side.copy( S ).multiplyScalar( sigma * Math.cos( be ) ).addScaledVector( Nup, - Math.sin( be ) );
			ld.copy( T ).multiplyScalar( Math.cos( al ) ).addScaledVector( side, Math.sin( al ) ).normalize();
			const row = [];
			for ( let j = 0; j <= cross; j ++ ) {

				const t = j / cross;
				const q = pts[ k ]!.clone().addScaledVector( ld, Ll * t ).addScaledVector( Nup, - Ll * curl * t * t );
				row.push( { q, s, t, Ll, nup: Nup.clone() } );

			}

			grid.push( row );

		}

		const idx = [];
		for ( let k = 0; k <= segs; k ++ ) {

			const r = [];
			for ( let j = 0; j <= cross; j ++ ) {

				const g = grid[ k ]![ j ]!;
				const ka = Math.max( 0, k - 1 ), kb = Math.min( segs, k + 1 );
				const ja = Math.max( 0, j - 1 ), jb = Math.min( cross, j + 1 );
				_v1.subVectors( grid[ kb ]![ j ]!.q, grid[ ka ]![ j ]!.q );
				_v2.subVectors( grid[ k ]![ jb ]!.q, grid[ k ]![ ja ]!.q );
				_v3.crossVectors( _v1, _v2 );
				if ( _v3.lengthSq() < 1e-12 ) _v3.copy( g.nup );
				_v3.normalize();
				if ( _v3.dot( g.nup ) < 0 ) _v3.negate();
				const fl = g.t * smooth( 0.05, 0.3, g.s ) * flutter;
				r.push( b.vertex( g.q, _v3, g.s, g.t, [ stemU, sBase + ( 1 - sBase ) * g.s, fl, phase ], [ part, age, g.Ll, seed ] ) );

			}

			idx.push( r );

		}

		for ( let k = 0; k < segs; k ++ ) {

			for ( let j = 0; j < cross; j ++ ) {

				const a = idx[ k ]![ j ]!, bb = idx[ k + 1 ]![ j ]!, c = idx[ k + 1 ]![ j + 1 ]!, d = idx[ k ]![ j + 1 ]!;
				if ( sigma > 0 ) b.quad( a, d, c, bb );
				else b.quad( a, bb, c, d );

			}

		}

	}

}

// Fern: fountain of arching pinnate fronds.
export function buildFern( seed = 3, b = new GeoBuilder() ):Built {

	const rand = mulberry32( seed );
	const n = 9;
	for ( let i = 0; i < n; i ++ ) {

		const a = i / ( n - 1 );
		const az = i * 2.39996 + rand() * 0.5;
		const Lf = ( 0.75 + 0.5 * a ) * ( 0.85 + 0.3 * rand() );
		addFrond( b, {
			origin: new THREE.Vector3( 0, 0.05, 0 ), azimuth: az,
			elevation: 1.3 - 0.55 * a + ( rand() - 0.5 ) * 0.2, bend: 1.3 + 0.8 * a, twist: ( rand() - 0.5 ) * 0.5, length: Lf,
			segs: 4, cross: 1, bendPow: 1.2,
			leafLen: ( s ) => 0.2 * Lf * ( smooth( 0.02, 0.2, s ) * ( 1 - 0.8 * smooth( 0.35, 1, s ) ) ),
			leafAngle: () => 1.35,
			droop: ( s ) => 0.12 + 0.2 * s,
			curl: 0.08, part: PART.FERN, age: 0, seed: rand(), phase: rand(), minWidth: 0.012, flutter: 0.6,
		} );

	}

	return { geometry: b.build( 1.6, new THREE.Vector3( 0, 0.4, 0 ) ), triangles: b.triangles };

}

// Banana clump (Musa): a main pseudostem, a shorter second stem and a few suckers at its foot, all
// crown geometry in the plant's local frame (instance H ~ 0; heights are in the mesh). Leaves arch
// out and droop; the oldest hang dead against the stem. Pseudostems are uv.x < 0 on the banana part.
export function buildBanana( seed = 9, b = new GeoBuilder() ):Built {

	const rand = mulberry32( seed );
	const stems = [
		{ h: 2.1 + rand() * 0.5, r: 0.12, leaves: 8, dead: 3, off: 0, sucker: false },
		{ h: 1.3 + rand() * 0.4, r: 0.085, leaves: 6, dead: 1, off: 0.32, sucker: false },
		{ h: 0.55 + rand() * 0.25, r: 0.05, leaves: 3, dead: 0, off: 0.3, sucker: true },
		{ h: 0.35 + rand() * 0.2, r: 0.04, leaves: 3, dead: 0, off: 0.28, sucker: true },
	];
	const dirH = new THREE.Vector3();
	let az0 = rand() * Math.PI * 2;
	for ( const st of stems ) {

		az0 += 2.1 + rand() * 0.8;
		const base = new THREE.Vector3( Math.cos( az0 ) * st.off, 0, Math.sin( az0 ) * st.off );
		// a little lean (away from the clump centre for the side stems)
		const leanA = st.off > 0 ? az0 : rand() * Math.PI * 2;
		const lean = new THREE.Vector3( Math.cos( leanA ), 0, Math.sin( leanA ) ).multiplyScalar( ( st.off > 0 ? 0.1 : 0.04 ) + rand() * 0.05 );
		const pts:THREE.Vector3[] = [];
		for ( let k = 0; k <= 3; k ++ ) {

			const f = k / 3;
			pts.push( base.clone().add( new THREE.Vector3( 0, st.h * f, 0 ) ).addScaledVector( lean, st.h * f * f ) );

		}

		const top = pts[ 3 ]!;
		const sTop = Math.min( 0.55, 0.2 + st.h * 0.15 );
		const sd = rand();
		addTube( b, pts, { radius: ( f ) => st.r * ( 1 - 0.35 * f ) * ( 1 + 0.25 * Math.exp( - f * 7 ) ), radial: st.sucker ? 4 : 6, part: PART.BANANA, age: 0, seed: sd, phase: rand(), s0: 0, s1: sTop } );
		const n = st.leaves + st.dead;
		for ( let i = 0; i < n; i ++ ) {

			const dead = i >= st.leaves;
			const a = i / Math.max( 1, st.leaves - 1 );
			const az = i * 2.39996 + rand() * 0.6;
			dirH.set( Math.cos( az ), 0, Math.sin( az ) );
			const scale = st.sucker ? 0.35 + rand() * 0.15 : st.h / 2.4;
			const Lf = ( 1.9 + 0.8 * rand() ) * scale * ( dead ? 0.85 : 1 );
			const W = ( st.sucker ? 0.14 : 0.3 + 0.08 * rand() ) * ( st.sucker ? 1 : Math.max( 0.6, scale ) );
			const origin = top.clone().add( new THREE.Vector3( dirH.x * st.r * 0.5, - ( dead ? 0.15 + rand() * 0.35 : a * 0.2 ) * st.h, dirH.z * st.r * 0.5 ) );
			addFrond( b, {
				origin, azimuth: az,
				// young leaves stand up, mature ones arch out and droop; dead ones hang down the stem
				elevation: dead ? - 0.9 - rand() * 0.5 : ( st.sucker ? 1.25 : 1.2 - 0.85 * a ) + ( rand() - 0.5 ) * 0.25,
				bend: dead ? 0.35 : ( st.sucker ? 0.5 : 1.0 + 1.3 * a + rand() * 0.4 ), twist: ( rand() - 0.5 ) * 0.5, length: Lf,
				segs: dead ? 3 : ( st.sucker ? 3 : 5 ), cross: 1, bendPow: 1.6, roll: ( rand() - 0.5 ) * 0.8,
				leafLen: ( s ) => W * Math.pow( Math.max( 0, Math.sin( Math.PI * Math.min( 1, Math.max( 0, ( s - 0.1 ) / 0.9 ) ) ) ), 0.5 ) * ( dead ? 0.6 : 1 ),
				leafAngle: () => 1.45,
				droop: ( s ) => ( dead ? 0.9 : 0.2 + 0.45 * s + 0.2 * a ),
				curl: dead ? 0.5 : 0.15, part: PART.BANANA, age: dead ? 0.92 + rand() * 0.06 : a * 0.45 + rand() * 0.15, seed: rand(), phase: rand(),
				minWidth: 0.03, flutter: dead ? 0.3 : 0.8, sBase: sTop,
			} );

		}

	}

	return { geometry: b.build( 4, new THREE.Vector3( 0, 1.5, 0 ) ), triangles: b.triangles };

}

// Merged understory geometry (one draw call): young palm (kind 1), fern (kind 3); the vertex shader
// keeps the plant whose kind matches the instance (floor of its seed). Banana clumps have their own mesh.
export const UNDERSTORY = { YOUNG: 1, BANANA: 2, FERN: 3, BANANA_B: 4 };
export function buildUnderstory():MergedBuilt<'young' | 'fern'> {

	const b = new GeoBuilder();
	const tris = { young: 0, fern: 0 };
	let t0 = 0;
	b.kind = UNDERSTORY.YOUNG; buildYoungPalm( 5, b ); tris.young = b.triangles - t0; t0 = b.triangles;
	b.kind = UNDERSTORY.FERN; buildFern( 3, b ); tris.fern = b.triangles - t0;
	return { geometry: b.build( 4, new THREE.Vector3( 0, 1.5, 0 ) ), triangles: b.triangles, perKind: tris };

}

// Banana clumps: two variants (kinds 2 and 4) in one mesh.
export function buildBananas():MergedBuilt<'banana' | 'bananaB'> {

	const b = new GeoBuilder();
	const tris = { banana: 0, bananaB: 0 };
	let t0 = 0;
	b.kind = UNDERSTORY.BANANA; buildBanana( 9, b ); tris.banana = b.triangles - t0; t0 = b.triangles;
	b.kind = UNDERSTORY.BANANA_B; buildBanana( 23, b ); tris.bananaB = b.triangles - t0;
	return { geometry: b.build( 4, new THREE.Vector3( 0, 1.5, 0 ) ), triangles: b.triangles, perKind: tris };

}

// Broadleaf understory ------------------------------------------------------------------------
//
// A broad leaf is a petiole (thin tube, uv.x < 0) ending in a blade: a grid along the midrib
// (uv.x = y, 0 at the back of the basal lobes .. 1 at the tip) and across it (uv.y = x in units of
// the half-width W, aMat.z). The outline, slits, holes, tears and veins are cut / painted in the
// fragment shader. Wind: aVeg.y = s (0 at the plant base .. 1 at the leaf tip).

interface TubeOptions {radius:(f:number)=>number;radial?:number;part:number;age?:number;seed?:number;phase?:number;s0?:number;s1?:number;W?:number}

// tube along a polyline (petioles, heliconia stems); uv.x in [-1, -0.5] marks it as stem
function addTube( b:GeoBuilder, pts:readonly THREE.Vector3[], { radius, radial = 4, part, age = 0, seed = 0, phase = 0, s0 = 0, s1 = 0.5, W = 0.1 }:TubeOptions ) {

	const start = b.count;
	const n = pts.length;
	const T = new THREE.Vector3(), X = new THREE.Vector3(), Y = new THREE.Vector3();
	for ( let i = 0; i < n; i ++ ) {

		T.subVectors( pts[ Math.min( n - 1, i + 1 ) ]!, pts[ Math.max( 0, i - 1 ) ]! ).normalize();
		X.crossVectors( T, _up );
		if ( X.lengthSq() < 1e-4 ) X.set( 1, 0, 0 );
		X.normalize();
		Y.crossVectors( X, T ).normalize();
		const f = i / ( n - 1 );
		const r = radius( f );
		for ( let j = 0; j <= radial; j ++ ) {

			const a = ( j / radial ) * Math.PI * 2;
			_v1.copy( X ).multiplyScalar( Math.cos( a ) ).addScaledVector( Y, Math.sin( a ) );
			_v0.copy( pts[ i ]! ).addScaledVector( _v1, r );
			b.vertex( _v0, _v1, - 1 + 0.5 * f, j / radial, [ 1, s0 + ( s1 - s0 ) * f, 0, phase ], [ part, age, W, seed ] );

		}

	}

	for ( let i = 0; i < n - 1; i ++ ) {

		for ( let j = 0; j < radial; j ++ ) {

			const a = start + i * ( radial + 1 ) + j, c = a + radial + 1;
			b.quad( a, a + 1, c + 1, c );

		}

	}

}

// petiole: arches from `origin` (elevation el0) to el1, horizontal direction `dirH`; returns the points
function petiolePoints( origin:THREE.Vector3, dirH:THREE.Vector3, length:number, el0:number, el1:number, segs = 6 ) {

	const pts = [ origin.clone() ];
	const p = origin.clone();
	for ( let k = 0; k < segs; k ++ ) {

		const f = ( k + 0.5 ) / segs;
		const el = el0 + ( el1 - el0 ) * f * f;
		_v0.copy( dirH ).multiplyScalar( Math.cos( el ) ).addScaledVector( _up, Math.sin( el ) );
		p.addScaledVector( _v0, length / segs );
		pts.push( p.clone() );

	}

	return pts;

}

interface BladeOptions {attach:THREE.Vector3;dirH:THREE.Vector3;pitch:number;bend:number;L:number;W:number;yBack?:number;env:(y:number)=>number;cup?:number;roll?:number;wave?:number;segsY?:number;segsX?:number;part:number;age?:number;seed?:number;phase?:number;s0?:number;flutter?:number}

// Blade: attach point, horizontal azimuth `dirH`, pitch at the attach (0 level, negative tip down),
// `bend` (further down toward the tip), `yBack` (share behind the attach), `env( y )` outline envelope
// (half-width / W), `cup` (edges up/down as a share of W), `roll` (sideways tilt), `wave` (margin).
function addBlade( b:GeoBuilder, o:BladeOptions ) {

	const {
		attach, dirH, pitch, bend, L, W, yBack = 0, env, cup = 0, roll = 0, wave = 0,
		segsY = 8, segsX = 2, part, age = 0, seed = 0, phase = 0, s0 = 0.5, flutter = 0.6,
	} = o;

	const S = new THREE.Vector3( - dirH.z, 0, dirH.x ).normalize(); // side axis (level)
	const rollQ = new THREE.Quaternion();
	const T = new THREE.Vector3(), N = new THREE.Vector3(), Sr = new THREE.Vector3();
	const grid = [];
	// midrib: straight behind the attach, bending down in front of it
	const mid = [];
	const back = attach.clone().addScaledVector( _v0.copy( dirH ).multiplyScalar( Math.cos( pitch ) ).addScaledVector( _up, Math.sin( pitch ) ), - yBack * L );
	const p = back.clone();
	for ( let k = 0; k <= segsY; k ++ ) {

		const y = k / segsY;
		const f = Math.max( 0, ( y - yBack ) / ( 1 - yBack ) );
		const el = pitch - bend * Math.pow( f, 1.4 );
		T.copy( dirH ).multiplyScalar( Math.cos( el ) ).addScaledVector( _up, Math.sin( el ) ).normalize();
		rollQ.setFromAxisAngle( T, roll * ( 0.4 + 0.6 * f ) );
		Sr.copy( S ).applyQuaternion( rollQ );
		N.crossVectors( Sr, T ).normalize();
		mid.push( { p: p.clone(), T: T.clone(), S: Sr.clone(), N: N.clone(), y } );
		if ( k < segsY ) p.addScaledVector( T, L / segsY );

	}

	for ( let k = 0; k <= segsY; k ++ ) {

		const m = mid[ k ]!;
		const e = Math.max( env( m.y ), 0.02 );
		const row = [];
		for ( let j = - segsX; j <= segsX; j ++ ) {

			const x = j / segsX; // -1 .. 1 of the envelope
			const xa = Math.abs( x );
			const wv = wave * Math.sin( m.y * 23 + seed * 40 + ( x > 0 ? 1.7 : 0 ) ) * xa;
			const q = m.p.clone().addScaledVector( m.S, x * e * W ).addScaledVector( m.N, ( cup * xa * xa + wv ) * e * W );
			row.push( { q, x: x * e, y: m.y, n: m.N } );

		}

		grid.push( row );

	}

	const nx = 2 * segsX;
	const idx = [];
	for ( let k = 0; k <= segsY; k ++ ) {

		const r = [];
		for ( let j = 0; j <= nx; j ++ ) {

			const g = grid[ k ]![ j ]!;
			const ka = Math.max( 0, k - 1 ), kb = Math.min( segsY, k + 1 );
			const ja = Math.max( 0, j - 1 ), jb = Math.min( nx, j + 1 );
			_v1.subVectors( grid[ kb ]![ j ]!.q, grid[ ka ]![ j ]!.q );
			_v2.subVectors( grid[ k ]![ jb ]!.q, grid[ k ]![ ja ]!.q );
			_v3.crossVectors( _v2, _v1 );
			if ( _v3.lengthSq() < 1e-12 ) _v3.copy( g.n );
			_v3.normalize();
			if ( _v3.dot( g.n ) < 0 ) _v3.negate();
			const fl = flutter * Math.abs( g.x ) * smooth( 0.0, 0.6, g.y );
			const veg:Four = [ 1, s0 + ( 1 - s0 ) * g.y, fl, phase ];
			r.push( b.vertex( g.q, _v3, g.y, g.x, veg, [ part, age, W, seed ] ) );

		}

		idx.push( r );

	}

	for ( let k = 0; k < segsY; k ++ ) {

		for ( let j = 0; j < nx; j ++ ) b.quad( idx[ k ]![ j ]!, idx[ k ]![ j + 1 ]!, idx[ k + 1 ]![ j + 1 ]!, idx[ k + 1 ]![ j ]! );

	}

}

// outline envelopes (half-width / W at y); the shader cuts the exact outline inside them
const heartEnv = ( yBack:number ) => ( y:number ) => y < yBack ? 0.75 + 0.3 * ( y / yBack ) : Math.pow( Math.sin( Math.PI * Math.min( 1, 0.5 + 0.5 * ( y - yBack ) / ( 1 - yBack ) ) ), 0.75 ) * 1.02 + 0.02;
const paddleEnv = ( y:number ) => Math.pow( Math.max( 0, Math.sin( Math.PI * Math.min( 1, y * 1.02 ) ) ), 0.55 ) * 1.02 + 0.02;

// Monstera deliciosa clump: long arching petioles, big heart-shaped blades (mature), 1-2 small
// juvenile leaves, one old yellowing leaf.
export function buildMonstera( seed = 41, b = new GeoBuilder() ):Built {

	const rand = mulberry32( seed );
	const n = 8;
	const dirH = new THREE.Vector3();
	for ( let i = 0; i < n; i ++ ) {

		const az = i * 2.39996 + rand() * 0.5;
		dirH.set( Math.cos( az ), 0, Math.sin( az ) );
		// age: juvenile (entire, small, pale) .. mature .. old (yellowing, drooping)
		const age = i === 1 || i === 5 ? 0.1 : i === 6 ? 0.95 : 0.4 + rand() * 0.4;
		const mature = age > 0.3;
		const Lp = ( mature ? 0.65 + rand() * 0.45 : 0.35 + rand() * 0.2 ) * ( age > 0.9 ? 0.8 : 1 );
		const origin = new THREE.Vector3( dirH.x * 0.06, 0.02, dirH.z * 0.06 );
		const pts = petiolePoints( origin, dirH, Lp, 1.35 - rand() * 0.2, ( age > 0.9 ? 0.0 : 0.55 ) + rand() * 0.25, 6 );
		const L = mature ? 0.55 + rand() * 0.35 : 0.28 + rand() * 0.1;
		const W = L * 0.47;
		const ph = rand();
		addTube( b, pts, { radius: ( f ) => 0.016 - 0.005 * f, part: PART.MONSTERA, age, seed: rand(), phase: ph, s0: 0, s1: 0.45 } );
		addBlade( b, {
			attach: pts[ pts.length - 1 ]!, dirH, pitch: ( age > 0.9 ? - 0.9 : - 0.15 - rand() * 0.35 ), bend: 0.35 + rand() * 0.35,
			L, W, yBack: 0.16, env: heartEnv( 0.16 ), cup: 0.12, roll: ( rand() - 0.5 ) * 0.5, wave: 0.03,
			segsY: 10, segsX: 4, part: PART.MONSTERA, age, seed: rand(), phase: ph, s0: 0.45, flutter: 0.35,
		} );

	}

	return { geometry: b.build( 2.2, new THREE.Vector3( 0, 0.6, 0 ) ), triangles: b.triangles };

}

// Elephant ear (Colocasia): tall upright petioles, huge peltate heart / arrow blades hanging tip down.
export function buildElephantEar( seed = 43, b = new GeoBuilder() ):Built {

	const rand = mulberry32( seed );
	const n = 8;
	const dirH = new THREE.Vector3();
	for ( let i = 0; i < n; i ++ ) {

		const az = i * 2.39996 + rand() * 0.4;
		dirH.set( Math.cos( az ), 0, Math.sin( az ) );
		const age = i === 6 ? 0.95 : i === 7 ? 0.1 : 0.2 + rand() * 0.5;
		const Lp = ( 0.8 + rand() * 0.6 ) * ( age > 0.9 ? 0.75 : 1 );
		const origin = new THREE.Vector3( dirH.x * 0.05, 0.02, dirH.z * 0.05 );
		const pts = petiolePoints( origin, dirH, Lp, 1.45, ( age > 0.9 ? 0.5 : 1.05 ) + rand() * 0.25, 6 );
		const L = ( 0.75 + rand() * 0.5 ) * ( age < 0.15 ? 0.6 : 1 );
		const W = L * 0.42;
		const ph = rand();
		addTube( b, pts, { radius: ( f ) => 0.03 - 0.014 * f, radial: 5, part: PART.ELEPHANT, age, seed: rand(), phase: ph, s0: 0, s1: 0.5 } );
		addBlade( b, {
			attach: pts[ pts.length - 1 ]!, dirH, pitch: - 0.45 - rand() * 0.45 - ( age > 0.9 ? 0.5 : 0 ), bend: 0.3 + rand() * 0.25,
			L, W, yBack: 0.3, env: heartEnv( 0.3 ), cup: - 0.1, roll: ( rand() - 0.5 ) * 0.4, wave: 0.05,
			segsY: 9, segsX: 3, part: PART.ELEPHANT, age, seed: rand(), phase: ph, s0: 0.5, flutter: 0.3,
		} );

	}

	return { geometry: b.build( 2.4, new THREE.Vector3( 0, 0.8, 0 ) ), triangles: b.triangles };

}

// Heliconia (bihai type) clump: pseudostems with paddle leaves in one plane, some carrying an
// upright inflorescence of alternating bracts.
export function buildHeliconia( seed = 47, b = new GeoBuilder() ):Built {

	const rand = mulberry32( seed );
	const stems = 5;
	const dirH = new THREE.Vector3();
	for ( let i = 0; i < stems; i ++ ) {

		const a = i * 2.39996 + rand() * 0.6;
		const r0 = 0.05 + rand() * 0.22;
		const base = new THREE.Vector3( Math.cos( a ) * r0, 0, Math.sin( a ) * r0 );
		const h = 1.1 + rand() * 1.0;
		const lean = new THREE.Vector3( Math.cos( a ), 0, Math.sin( a ) ).multiplyScalar( 0.08 + rand() * 0.1 );
		const top = base.clone().add( new THREE.Vector3( 0, h, 0 ) ).addScaledVector( lean, h );
		const ph = rand();
		const sd = rand();
		const pts = [];
		for ( let k = 0; k <= 4; k ++ ) pts.push( base.clone().lerp( top, k / 4 ) );
		addTube( b, pts, { radius: ( f ) => 0.028 - 0.012 * f, radial: 5, part: PART.HELICONIA, age: 0.3, seed: sd, phase: ph, s0: 0, s1: 0.55 } );
		// distichous leaves: alternate sides of one plane per stem
		const plane = rand() * Math.PI;
		const nl = 3 + Math.floor( rand() * 2 );
		for ( let k = 0; k < nl; k ++ ) {

			const side = k % 2 ? 1 : - 1;
			const az = plane + ( side > 0 ? 0 : Math.PI ) + ( rand() - 0.5 ) * 0.3;
			dirH.set( Math.cos( az ), 0, Math.sin( az ) );
			const at = base.clone().lerp( top, 0.45 + 0.5 * ( k / nl ) );
			const age = k === 0 && rand() < 0.5 ? 0.95 : 0.2 + rand() * 0.4;
			const Lp = 0.15 + rand() * 0.15;
			const lp = petiolePoints( at, dirH, Lp, 1.2, 1.0, 3 );
			addTube( b, lp, { radius: () => 0.01, radial: 3, part: PART.HELICONIA, age, seed: sd, phase: ph, s0: 0.5, s1: 0.6 } );
			const L = 0.8 + rand() * 0.5;
			addBlade( b, {
				attach: lp[ lp.length - 1 ]!, dirH, pitch: ( age > 0.9 ? - 0.4 : 0.85 + rand() * 0.3 ), bend: ( age > 0.9 ? 1.4 : 0.9 + rand() * 0.5 ),
				L, W: L * 0.15, yBack: 0, env: paddleEnv, cup: 0.25, roll: ( rand() - 0.5 ) * 0.6, wave: 0.02,
				segsY: 7, segsX: 1, part: PART.HELICONIA, age, seed: rand(), phase: ph, s0: 0.6, flutter: 0.6,
			} );

		}

		// inflorescence on some stems: an upright zig-zag of boat-shaped bracts above the leaves
		if ( rand() < 0.6 ) {

			const nb = 6 + Math.floor( rand() * 3 );
			const H0 = top.clone();
			const Lax = 0.45 + rand() * 0.15;
			const baz = plane + Math.PI * 0.5;
			for ( let k = 0; k < nb; k ++ ) {

				const f = k / ( nb - 1 );
				const at = H0.clone().add( new THREE.Vector3( 0, Lax * f * 0.9 + 0.04, 0 ) );
				const az = baz + ( k % 2 ? 0 : Math.PI );
				dirH.set( Math.cos( az ), 0, Math.sin( az ) );
				const L = 0.22 * ( 1 - 0.45 * f );
				addBlade( b, {
					attach: at, dirH, pitch: 0.5, bend: - 0.35, L, W: L * 0.3, yBack: 0, env: ( y ) => Math.sin( Math.PI * Math.min( 1, 0.15 + y * 0.9 ) ) * 1.02 + 0.05,
					cup: 1.2, segsY: 3, segsX: 1, part: PART.BRACT, age: f, seed: rand(), phase: ph, s0: 0.62, flutter: 0.05,
				} );

			}

			const ax = [ H0.clone(), H0.clone().add( new THREE.Vector3( 0, Lax, 0 ) ) ];
			addTube( b, ax, { radius: () => 0.009, radial: 3, part: PART.BRACT, age: 0, seed: sd, phase: ph, s0: 0.6, s1: 0.65 } );

		}

	}

	return { geometry: b.build( 2.8, new THREE.Vector3( 0, 1.2, 0 ) ), triangles: b.triangles };

}

// Bird of paradise (Strelitzia reginae): a fan of stiff upright paddle leaves on long petioles,
// flowers on stalks among them: a level beak (spathe), sepals and a tongue standing out of it.
export function buildStrelitzia( seed = 53, b = new GeoBuilder() ):Built {

	const rand = mulberry32( seed );
	const dirH = new THREE.Vector3();
	const n = 11;
	for ( let i = 0; i < n; i ++ ) {

		// fan: mostly in one plane (distichous), spread a little
		const side = i % 2 ? 1 : - 1;
		const az = 0.3 + ( side > 0 ? 0 : Math.PI ) + ( rand() - 0.5 ) * 0.9;
		dirH.set( Math.cos( az ), 0, Math.sin( az ) );
		const age = i === 9 ? 0.95 : 0.2 + rand() * 0.5;
		const Lp = 0.55 + rand() * 0.45;
		const origin = new THREE.Vector3( ( rand() - 0.5 ) * 0.12, 0.02, ( rand() - 0.5 ) * 0.12 );
		const pts = petiolePoints( origin, dirH, Lp, 1.45, ( age > 0.9 ? 0.6 : 1.15 ) + rand() * 0.2, 4 );
		const L = 0.45 + rand() * 0.2;
		const ph = rand();
		addTube( b, pts, { radius: ( f ) => 0.012 - 0.004 * f, radial: 3, part: PART.STRELITZIA, age, seed: rand(), phase: ph, s0: 0, s1: 0.5 } );
		addBlade( b, {
			attach: pts[ pts.length - 1 ]!, dirH, pitch: ( age > 0.9 ? 0.2 : 1.0 + rand() * 0.3 ), bend: 0.25 + rand() * 0.2,
			L, W: L * 0.2, yBack: 0, env: paddleEnv, cup: 0.2, roll: ( rand() - 0.5 ) * 0.5, wave: 0.02,
			segsY: 5, segsX: 1, part: PART.STRELITZIA, age, seed: rand(), phase: ph, s0: 0.5, flutter: 0.2,
		} );

	}

	const flowers = 2 + Math.floor( rand() * 2 );
	for ( let i = 0; i < flowers; i ++ ) {

		const az = rand() * Math.PI * 2;
		dirH.set( Math.cos( az ), 0, Math.sin( az ) );
		const base = new THREE.Vector3( ( rand() - 0.5 ) * 0.15, 0.02, ( rand() - 0.5 ) * 0.15 );
		const top = base.clone().add( new THREE.Vector3( dirH.x * 0.08, 0.85 + rand() * 0.3, dirH.z * 0.08 ) );
		const ph = rand();
		addTube( b, [ base, base.clone().lerp( top, 0.5 ), top ], { radius: () => 0.01, radial: 3, part: PART.STRELITZIA, age: 0.3, seed: rand(), phase: ph, s0: 0, s1: 0.55 } );
		// spathe: a boat-shaped beak held level
		addBlade( b, {
			attach: top, dirH, pitch: 0.12, bend: 0.15, L: 0.19, W: 0.022, yBack: 0.1, env: ( y ) => Math.sin( Math.PI * Math.min( 1, 0.1 + y * 0.95 ) ) * 1.05 + 0.08,
			cup: 1.5, segsY: 4, segsX: 1, part: PART.BIRD, age: 0, seed: rand(), phase: ph, s0: 0.55, flutter: 0.02,
		} );
		// sepals fanning up and forward out of the beak, the tongue among them
		const at = top.clone().addScaledVector( dirH, 0.05 ).add( new THREE.Vector3( 0, 0.02, 0 ) );
		for ( let k = 0; k < 3; k ++ ) {

			const a2 = az + ( k - 1 ) * 0.35;
			const d2 = new THREE.Vector3( Math.cos( a2 ), 0, Math.sin( a2 ) );
			addBlade( b, {
				attach: at, dirH: d2, pitch: 1.0 + ( rand() - 0.5 ) * 0.3, bend: - 0.3, L: 0.11 + rand() * 0.03, W: 0.012, yBack: 0, env: ( y ) => Math.sin( Math.PI * Math.min( 1, 0.2 + y * 0.8 ) ) + 0.1,
				cup: 0.3, segsY: 2, segsX: 1, part: PART.BIRD, age: 0.5, seed: rand(), phase: ph, s0: 0.6, flutter: 0.05,
			} );

		}

		addBlade( b, {
			attach: at, dirH, pitch: 0.55, bend: 0.1, L: 0.09, W: 0.008, yBack: 0, env: () => 0.9,
			cup: 0.4, segsY: 2, segsX: 1, part: PART.BIRD, age: 1, seed: rand(), phase: ph, s0: 0.6, flutter: 0.05,
		} );

	}

	return { geometry: b.build( 1.8, new THREE.Vector3( 0, 0.7, 0 ) ), triangles: b.triangles };

}

// Broadleaf kinds continue after the understory's so the shared deformation's per-kind rules (fern
// fade) never match. Monstera has a mesh of its own; elephant ears, heliconias and birds of paradise
// share one.
export const BROADLEAF = { MONSTERA: 11, ELEPHANT: 12, HELICONIA: 13, STRELITZIA: 14 };
export function buildMonsteraMesh():Built {

	const b = new GeoBuilder();
	b.kind = BROADLEAF.MONSTERA; buildMonstera( 41, b );
	return { geometry: b.build( 2.2, new THREE.Vector3( 0, 0.6, 0 ) ), triangles: b.triangles };

}

export function buildBroadleaf():MergedBuilt<'elephant' | 'heliconia' | 'strelitzia'> {

	const b = new GeoBuilder();
	const tris = { elephant: 0, heliconia: 0, strelitzia: 0 };
	let t0 = 0;
	b.kind = BROADLEAF.ELEPHANT; buildElephantEar( 43, b ); tris.elephant = b.triangles - t0; t0 = b.triangles;
	b.kind = BROADLEAF.HELICONIA; buildHeliconia( 47, b ); tris.heliconia = b.triangles - t0; t0 = b.triangles;
	b.kind = BROADLEAF.STRELITZIA; buildStrelitzia( 53, b ); tris.strelitzia = b.triangles - t0;
	return { geometry: b.build( 3, new THREE.Vector3( 0, 1, 0 ) ), triangles: b.triangles, perKind: tris };

}
