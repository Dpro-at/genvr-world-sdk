/** Tidewater4811ba48, ©2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import * as THREE from 'three';
import { GeoBuilder, type Four } from './geometry-builder.js';
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
interface StemOptions {radial:number;rows:number[];radius:(u:number)=>number;Hgeo:number;mat?:Four;cap?:boolean;texU?:number;lumps?:((u:number,a:number)=>number)|null}
interface FrondOptions {origin:THREE.Vector3;azimuth:number;elevation:number;bend:number;twist?:number;length:number;segs?:number;cross?:number;leafLen:(s:number)=>number;leafAngle:(s:number)=>number;droop:(s:number)=>number;curl?:number;part?:number;age?:number;seed?:number;phase?:number;flutter?:number;minWidth?:number;bendPow?:number;stemU?:number;roll?:number;sBase?:number}


// Procedural plant geometry. All plants are built in a local frame with the base at the
// origin and +Y up. See VegNodes.plantDeform for the attribute conventions.
//
// Part ids (aMat.x):
//   plant-leaf material: 0 stem / trunk, 1 coconut frond, 2 fern frond, 3 banana leaf, 5 coconut,
//                        broadleaf plants (BROADLEAF mesh): 6 monstera, 7 elephant ear, 8 heliconia leaf,
//                        9 heliconia bract, 10 bird of paradise leaf, 11 its flower (spathe, sepals,
//                        tongue: aMat.y 0 / 0.5 / 1); their petioles / stems are the same part with uv.x < 0
//   canopy material:     0 bark, 1 tree leaf-cluster card, 4 shrub leaf-cluster card, 5 shrub stem
// (far trees / shrubs are octahedral impostors baked from these meshes: Impostors.js)

export const PART = { STEM: 0, FROND: 1, FERN: 2, BANANA: 3, COCONUT: 5, MONSTERA: 6, ELEPHANT: 7, HELICONIA: 8, BRACT: 9, STRELITZIA: 10, BIRD: 11 };

const _up = new THREE.Vector3( 0, 1, 0 );
const _v0 = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();

const smooth = ( a:number, b:number, x:number ) => {

	const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );

};

// Stem / trunk: a tube whose vertices carry the height fraction u (aVeg.x) and a radial
// offset. The real height is applied in the shader (u * H), so one mesh fits any height.
function addStem( b:GeoBuilder, { radial, rows, radius, Hgeo, mat = [ 0, 0, 0, 0 ], cap = true, texU = 1, lumps = null }:StemOptions ) {

	const start = b.count;
	for ( let j = 0; j < rows.length; j ++ ) {

		const u = rows[ j ]!;
		const r = radius( u );
		const du = 0.01;
		const dr = ( radius( u + du ) - radius( u - du ) ) / ( 2 * du * Hgeo );
		for ( let i = 0; i <= radial; i ++ ) {

			const a = ( i / radial ) * Math.PI * 2;
			const c = Math.cos( a ), s = Math.sin( a );
			const rl = lumps ? r * ( 1 + lumps( u, a ) ) : r;
			_v0.set( c * rl, u * Hgeo, s * rl );
			_v1.set( c, - dr, s ).normalize();
			b.vertex( _v0, _v1, ( i / radial ) * texU, u, [ u, 0, 0, 0 ], mat );

		}

	}

	for ( let j = 0; j < rows.length - 1; j ++ ) {

		for ( let i = 0; i < radial; i ++ ) {

			const a = start + j * ( radial + 1 ) + i;
			const c = a + radial + 1;
			b.quad( a, c, c + 1, a + 1 );

		}

	}

	if ( cap ) {

		const uTop = rows[ rows.length - 1 ]!;
		const top = b.vertex( _v0.set( 0, uTop * Hgeo, 0 ), _up, 0.5, uTop, [ uTop + 0.015, 0, 0, 0 ], mat );
		const ring = start + ( rows.length - 1 ) * ( radial + 1 );
		for ( let i = 0; i < radial; i ++ ) b.tri( ring + i, top, ring + i + 1 );

	}

}

// Pinnate frond / leaf: two wings (leaflet rows) hanging off a curved rachis. The leaflets
// themselves are cut out in the fragment shader with a procedural mask on (s, t).
function addFrond( b:GeoBuilder, o:FrondOptions ) {

	const {
		origin, azimuth, elevation, bend, twist = 0, length,
		segs = 8, cross = 2,
		leafLen, leafAngle, droop, curl = 0.2,
		part = PART.FROND, age = 0, seed = 0, phase = 0, flutter = 1, minWidth = 0.035,
		bendPow = 1.4, stemU = 1, roll = 0, sBase = 0,
	} = o;

	// rachis centre line
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
			// the frond rolls about its rachis toward the tip: one wing hangs lower than the other
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

		// normals from the grid, oriented to the frond's upper side
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

function addIcosphere( b:GeoBuilder, center:THREE.Vector3, radii:THREE.Vector3, mat:Four, veg:Four ) {

	const g = new THREE.IcosahedronGeometry( 1, 0 );
	const p = g.attributes.position!;
	const map = new Map<string,number>();
	const idx = [];
	for ( let i = 0; i < p.count; i ++ ) {

		_v0.fromBufferAttribute( p, i );
		const key = _v0.x.toFixed( 3 ) + ',' + _v0.y.toFixed( 3 ) + ',' + _v0.z.toFixed( 3 );
		let v = map.get( key );
		if ( v === undefined ) {

			_v1.copy( _v0 ).multiply( radii ).add( center );
			_v2.copy( _v0 ).divide( radii ).normalize();
			v = b.vertex( _v1, _v2, 0.5, 0.5, veg, mat );
			map.set( key, v );

		}

		idx.push( v );

	}

	for ( let i = 0; i < idx.length; i += 3 ) b.tri( idx[ i ]!, idx[ i + 1 ]!, idx[ i + 2 ]! );
	g.dispose();

}

// Coconut palm -----------------------------------------------------------------------

const PALM_H = 10; // geometry trunk height (the shader uses the per-instance height)

const palmRadius = ( u:number ) => {

	const y = u * PALM_H;
	let r = 0.155 + 0.045 * ( 1 - u ) + 0.19 * Math.exp( - Math.max( y, 0 ) / 0.42 );
	r *= 1 + 0.05 * Math.sin( y * 1.7 ) * ( 1 - u ); // slight irregularity
	r += 0.07 * smooth( 0.955, 0.99, u ) - 0.1 * smooth( 0.995, 1.02, u ); // leaf-base boot
	return r;

};

// buttress roots: lumps around the flared base, fading out within the first ~0.6 m
const palmRootLumps = ( u:number, a:number ) => {

	const y = Math.max( u * PALM_H, 0 );
	const k = Math.exp( - y / 0.3 );
	return k * ( 0.16 * Math.max( 0, Math.sin( a * 5 + 0.7 ) ) + 0.08 * Math.sin( a * 11 + 2.1 ) );

};

// Frond parameters shared by both LODs so their silhouettes agree.
function palmFrondParams( rand:()=>number, count:number ) {

	// A coconut crown holds 25-35 fronds 4.5-6 m long in a spiral (2/5 phyllotaxis): young ones
	// stand up, mature ones arch out and droop toward the tip, the oldest hang down along the trunk
	// before they drop (the shader browns them on some trees only: one crown mesh is shared).
	const list = [];
	for ( let i = 0; i < count; i ++ ) {

		const a = count > 1 ? i / ( count - 1 ) : 0.5; // 0 youngest .. 1 oldest
		const hanging = count > 10 && i >= count - 2;
		const len = ( 3.8 + 1.5 * smooth( 0, 0.45, a ) ) * ( 0.88 + 0.24 * rand() );
		list.push( {
			a, dead: hanging,
			azimuth: i * 2.39996 + ( rand() - 0.5 ) * 0.4,
			elevation: hanging ? - 1.05 - ( i - ( count - 2 ) ) * 0.25 : 1.0 - 1.25 * Math.pow( a, 0.8 ) + ( rand() - 0.5 ) * 0.3,
			// the rachis arches: most of the bend is in the outer half (the tips hang)
			bend: hanging ? 0.35 : 0.55 + 1.15 * a + rand() * 0.4,
			bendPow: hanging ? 1.2 : 1.9 + rand() * 0.5,
			twist: ( rand() - 0.5 ) * 0.45,
			roll: ( rand() - 0.5 ) * ( hanging ? 0.4 : 0.9 ),
			length: hanging ? len * 0.9 : len,
			attachY: 0.32 - 0.5 * a,
			seed: rand(),
			phase: rand(),
		} );

	}

	return list;

}

function addPalmCrown( b:GeoBuilder, fronds:ReturnType<typeof palmFrondParams>, { segs, cross, leafScale = 1 }:{segs:number;cross:number;leafScale?:number} ) {

	for ( const f of fronds ) {

		const origin = new THREE.Vector3( Math.cos( f.azimuth ) * 0.14, f.attachY, Math.sin( f.azimuth ) * 0.14 );
		const Lf = f.length;
		addFrond( b, {
			origin, azimuth: f.azimuth, elevation: f.elevation, bend: f.bend, bendPow: f.bendPow, twist: f.twist, roll: f.roll, length: Lf,
			segs, cross,
			// leaflets start after the bare petiole (~1/5 of the frond), longest a third of the way
			// out (0.6-0.9 m), shortening to the tip
			leafLen: ( s ) => leafScale * 0.23 * Lf * ( smooth( 0.14, 0.3, s ) * ( 1 - 0.68 * smooth( 0.35, 1.0, s ) ) ),
			leafAngle: ( s ) => 1.1 - 0.5 * s,
			// the two rows hang from the rachis in a V (keeled), steeper toward the tip and on old fronds
			droop: ( s ) => ( f.dead ? 1.3 : 0.88 + 0.35 * f.a ) + 0.45 * s,
			curl: f.dead ? 0.15 : 0.45,
			part: PART.FROND,
			age: f.dead ? 1 : f.a * 0.55,
			seed: f.seed, phase: f.phase,
			flutter: f.dead ? 0.3 : 1,
			minWidth: 0.045,
		} );

	}

}

// Full detail coconut palm: ringed trunk, coconut cluster and 15 fronds in one geometry
// (one draw call per pass for the plant-leaf material).
export function buildPalmNear( seed = 11 ) {

	const rand = mulberry32( seed );
	const b = new GeoBuilder();

	const rows = [ - 0.03, 0, 0.015, 0.04, 0.08, 0.14, 0.22, 0.32, 0.43, 0.54, 0.65, 0.76, 0.86, 0.94, 0.975, 0.992, 1.005 ];
	addStem( b, { radial: 10, rows, radius: palmRadius, Hgeo: PALM_H, mat: [ PART.STEM, 0, 0, 0 ], lumps: palmRootLumps } );

	// coconut cluster below the crown (crown-local coordinates)
	const nuts = 6;
	for ( let i = 0; i < nuts; i ++ ) {

		const az = i * 2.39996 + rand() * 0.5;
		const rr = 0.2 + rand() * 0.1;
		const c = new THREE.Vector3( Math.cos( az ) * rr, - 0.3 - rand() * 0.35, Math.sin( az ) * rr );
		const s = 0.12 + rand() * 0.035;
		addIcosphere( b, c, new THREE.Vector3( s, s * 1.12, s ), [ PART.COCONUT, rand(), 0, i / nuts ], [ 1, 0, 0, 0 ] );

	}

	addPalmCrown( b, palmFrondParams( rand, 18 ), { segs: 8, cross: 2 } );

	return { geometry: b.build( 16, new THREE.Vector3( 0, 6, 0 ) ), triangles: b.triangles };

}

// Low detail palm: one geometry (stem + crown) for the plant-leaf material.
export function buildPalmFar( seed = 11 ) {

	const rand = mulberry32( seed );
	const b = new GeoBuilder();
	addStem( b, { radial: 5, rows: [ - 0.03, 0.03, 0.2, 0.6, 1.0 ], radius: palmRadius, Hgeo: PALM_H, mat: [ PART.STEM, 0, 0, 0 ], cap: false } );
	const fronds = palmFrondParams( rand, 18 ).filter( ( f, i ) => i !== 1 && i !== 5 && i !== 9 && i !== 13 );
	addPalmCrown( b, fronds, { segs: 3, cross: 1, leafScale: 1.15 } );
	return { geometry: b.build( 16, new THREE.Vector3( 0, 6, 0 ) ), triangles: b.triangles };

}

// Young palm (no trunk yet) / clumping understory palm.
export function buildYoungPalm( seed = 5, b = new GeoBuilder() ) {

	const rand = mulberry32( seed );
	addStem( b, { radial: 5, rows: [ - 0.2, 0.3, 1.0 ], radius: ( u ) => 0.16 - 0.07 * u, Hgeo: 0.6, mat: [ PART.STEM, 0.35, 0, 0 ], cap: false } );
	const n = 8;
	for ( let i = 0; i < n; i ++ ) {

		const a = i / ( n - 1 );
		const az = i * 2.39996 + rand() * 0.4;
		const Lf = ( 1.7 + 0.9 * a ) * ( 0.85 + 0.3 * rand() );
		addFrond( b, {
			origin: new THREE.Vector3( 0, 0.1 - 0.15 * a, 0 ), azimuth: az,
			elevation: 1.35 - 0.8 * a + ( rand() - 0.5 ) * 0.2, bend: 0.6 + 0.7 * a, twist: ( rand() - 0.5 ) * 0.3, length: Lf,
			segs: 5, cross: 1,
			leafLen: ( s ) => 0.21 * Lf * ( smooth( 0.04, 0.25, s ) * ( 1 - 0.6 * smooth( 0.3, 1, s ) ) ),
			leafAngle: ( s ) => 1.0 - 0.4 * s,
			droop: ( s ) => 0.25 + 0.4 * a + 0.2 * s,
			curl: 0.15, part: PART.FROND, age: a * 0.4, seed: rand(), phase: rand(), minWidth: 0.03,
		} );

	}

	return { geometry: b.build( 4, new THREE.Vector3( 0, 1, 0 ) ), triangles: b.triangles };

}
