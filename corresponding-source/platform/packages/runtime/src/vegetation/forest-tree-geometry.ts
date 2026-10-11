/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
// Source: src/world/vegetation/PlantGeometry.js 449-770 (lobed crowns, broadleaf forest tree).
// Shared canopy helpers (branch, card, lobe cards) are exported for shrub-geometry.ts.
import * as THREE from 'three';
import { GeoBuilder, type Four } from './geometry-builder.js';

/** Source util/Noise.js mulberry32 (same as the private copy in palm-geometry.ts). */
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

export const smooth = ( a:number, b:number, x:number ) => {

	const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );

};

/** Lobe [x, y, z, radius] in plant-local space. */
export type Lobe = readonly [number, number, number, number];
export type FlexFn = ( p:THREE.Vector3 ) => number;
type Rand = () => number;

export const _up = new THREE.Vector3( 0, 1, 0 );

// Broadleaf trees and shrubs: lobed crowns ------------------------------------------------
//
// A crown is a set of lobes (leaf clusters at the branch ends) [x, y, z, radius] in plant-local
// space. Every leaf card stores the offset to its lobe centre and the lobe id (aLobe), so each
// instance can drop or resize lobes in the vertex shader: one mesh, irregular crowns with gaps.
// The far impostors are baked from the same variants (LOBE_TABLE rows), so the LOD switch keeps
// the crown's shape. Lobes 0-1 are never dropped.

export const TREE_H = 12.5; // nominal height (top of the highest lobe)
// deep, irregular crown: lobes from ~4 m up to the top, so from a distance the canopy is a
// continuous lumpy carpet rather than crowns on bare poles
export const TREE_LOBES:readonly Lobe[] = [
	[ 0.4, 9.9, - 0.3, 2.9 ],
	[ - 2.0, 8.3, 1.6, 2.6 ],
	[ 3.0, 7.7, 1.2, 2.4 ],
	[ 1.7, 6.8, - 3.0, 2.5 ],
	[ - 3.2, 6.3, - 1.8, 2.3 ],
	[ 0.4, 5.6, 3.4, 2.2 ],
	[ - 1.1, 11.2, - 1.7, 1.8 ],
	[ 3.7, 5.2, - 0.9, 1.9 ],
];
const TREE_FORK = [ 0.15, 3.7, - 0.05 ] as const;
export const TREE_VARIANTS = 3;

export function addBranch( b:GeoBuilder, p0:THREE.Vector3, p1:THREE.Vector3, r0:number, r1:number, radial:number, rows:number, mat:Four, hScale:number, flexFn:FlexFn, radiusFn:( ( f:number, a:number, c:THREE.Vector3 ) => number ) | null = null ) {

	const dir = new THREE.Vector3().subVectors( p1, p0 );
	const len = dir.length();
	dir.normalize();
	const tmp = Math.abs( dir.y ) < 0.9 ? _up : new THREE.Vector3( 1, 0, 0 );
	const X = new THREE.Vector3().crossVectors( dir, tmp ).normalize();
	const Z = new THREE.Vector3().crossVectors( X, dir ).normalize();
	const start = b.count;
	for ( let j = 0; j <= rows; j ++ ) {

		const f = j / rows;
		const c = new THREE.Vector3().copy( p0 ).addScaledVector( dir, len * f );
		for ( let i = 0; i <= radial; i ++ ) {

			const a = ( i / radial ) * Math.PI * 2;
			const r = radiusFn ? radiusFn( f, a, c ) : r0 + ( r1 - r0 ) * f;
			const n = new THREE.Vector3().copy( X ).multiplyScalar( Math.cos( a ) ).addScaledVector( Z, Math.sin( a ) );
			const p = c.clone().addScaledVector( n, r );
			b.vertex( p, n, i / radial, f * len, [ Math.max( 0, p.y / hScale ), flexFn( p ), 0, 0 ], mat );

		}

	}

	for ( let j = 0; j < rows; j ++ ) {

		for ( let i = 0; i < radial; i ++ ) {

			const a = start + j * ( radial + 1 ) + i;
			const c = a + radial + 1;
			b.quad( a, c, c + 1, a + 1 );

		}

	}

}

// Curved limb: a tapered tube along a quadratic Bezier p0 -> ctrl -> p1 (rings follow the curve,
// frames rotation-minimised from ring to ring).
function addLimb( b:GeoBuilder, p0:THREE.Vector3, ctrl:THREE.Vector3, p1:THREE.Vector3, r0:number, r1:number, radial:number, rows:number, mat:Four, hScale:number, flexFn:FlexFn ) {

	const start = b.count;
	const pt = ( t:number ) => new THREE.Vector3()
		.copy( p0 ).multiplyScalar( ( 1 - t ) * ( 1 - t ) )
		.addScaledVector( ctrl, 2 * ( 1 - t ) * t )
		.addScaledVector( p1, t * t );
	const tan = ( t:number ) => new THREE.Vector3().subVectors( ctrl, p0 ).multiplyScalar( 2 * ( 1 - t ) ).addScaledVector( new THREE.Vector3().subVectors( p1, ctrl ), 2 * t ).normalize();
	let T = tan( 0 );
	const X = new THREE.Vector3().crossVectors( T, Math.abs( T.y ) < 0.9 ? _up : new THREE.Vector3( 1, 0, 0 ) ).normalize();
	let len = 0;
	let prev = pt( 0 );
	for ( let j = 0; j <= rows; j ++ ) {

		const f = j / rows;
		const c = pt( f );
		len += c.distanceTo( prev );
		prev = c;
		const Tn = tan( f );
		// rotation-minimising frame: project the previous X onto the new normal plane
		X.addScaledVector( Tn, - X.dot( Tn ) ).normalize();
		T = Tn;
		const Z = new THREE.Vector3().crossVectors( X, T ).normalize();
		const r = r0 + ( r1 - r0 ) * Math.pow( f, 0.8 );
		for ( let i = 0; i <= radial; i ++ ) {

			const a = ( i / radial ) * Math.PI * 2;
			const n = new THREE.Vector3().copy( X ).multiplyScalar( Math.cos( a ) ).addScaledVector( Z, Math.sin( a ) );
			const p = c.clone().addScaledVector( n, r );
			b.vertex( p, n, i / radial, len, [ Math.max( 0, p.y / hScale ), flexFn( p ), 0, 0 ], mat );

		}

	}

	for ( let j = 0; j < rows; j ++ ) {

		for ( let i = 0; i < radial; i ++ ) {

			const a = start + j * ( radial + 1 ) + i;
			const c = a + radial + 1;
			b.quad( a, c, c + 1, a + 1 );

		}

	}

}

export interface CardSpec {
	center:THREE.Vector3; size:number; normal:THREE.Vector3; yaw:number;
	lobeC:THREE.Vector3; lobeR:number; lobeId:number; crownC:THREE.Vector3; crownR:THREE.Vector3;
	rand:Rand; flexFn:FlexFn; hScale:number; part:number; clumpC?:THREE.Vector3 | null; clumpR?:number;
}
export interface CardOptions {
	crownC:THREE.Vector3; crownR:THREE.Vector3; rand:Rand; flexFn:FlexFn; hScale:number; part:number; flatten?:number;
}

// Leaf-cluster card: a quad facing `normal`, rotated by `yaw` around it. Vertex normals blend the
// lobe sphere and the whole crown (volumetric shading), aMat.y = exposure (0 inner .. 1 outer).
function addCard( b:GeoBuilder, { center, size, normal, yaw, lobeC, lobeR, lobeId, crownC, crownR, rand, flexFn, hScale, part, clumpC = null, clumpR = 1 }:CardSpec ) {

	const n = normal.clone().normalize();
	const tmp = Math.abs( n.y ) < 0.95 ? _up : new THREE.Vector3( 1, 0, 0 );
	const X = new THREE.Vector3().crossVectors( tmp, n ).normalize();
	const Y = new THREE.Vector3().crossVectors( n, X ).normalize();
	const cy = Math.cos( yaw ), sy = Math.sin( yaw );
	const Xr = X.clone().multiplyScalar( cy ).addScaledVector( Y, sy );
	const Yr = Y.clone().multiplyScalar( cy ).addScaledVector( X, - sy );
	const cr = rand();
	const card = rand();
	const ph = rand();
	const ids:number[] = [];
	const corners = [ [ - 0.5, - 0.5, 0, 0 ], [ 0.5, - 0.5, 1, 0 ], [ 0.5, 0.5, 1, 1 ], [ - 0.5, 0.5, 0, 1 ] ] as const;
	for ( const [ x, y, u, v ] of corners ) {

		const p = center.clone().addScaledVector( Xr, x * size ).addScaledVector( Yr, y * size );
		const dl = clumpC ? p.clone().sub( clumpC ).divideScalar( clumpR ) : p.clone().sub( lobeC ).divideScalar( lobeR );
		const dc = p.clone().sub( crownC ).divide( crownR );
		// normals bent outward from the clump (or lobe) centre and from the crown centre: soft,
		// volumetric shading of every clump
		const nn = dl.clone().normalize().multiplyScalar( 0.5 ).addScaledVector( dc.clone().normalize(), 0.4 ).addScaledVector( n, 0.2 ).normalize();
		// exposure: outer / upper leaves lit, the inside of each clump and of the crown dark
		const ext = Math.min( 1, 0.5 * Math.min( 1, dl.length() ) + 0.4 * Math.min( 1, dc.length() ) + 0.25 * Math.max( 0, dc.y ) );
		const hf = Math.max( 0, p.y / hScale );
		ids.push( b.vertex( p, nn, u, v, [ hf, flexFn( p ), 1, ph ], [ part, 0.2 + 0.8 * ext * ext, cr, card ], [ lobeC.x - p.x, lobeC.y - p.y, lobeC.z - p.z, lobeId ] ) );

	}

	b.quad( ids[ 0 ]!, ids[ 1 ]!, ids[ 2 ]!, ids[ 3 ]! );

}

// fills a lobe with leaf cards, biased towards its shell (the lobe reads as a volume, with gaps);
// returns card specs (emitted later, outermost first, so near cards draw first: early depth test)
export function lobeCards( lobe:Lobe, id:number, { count, size, crownC, crownR, rand, flexFn, hScale, part, flatten = 0.6 }:CardOptions & { count:number; size:number } ) {

	const lobeC = new THREE.Vector3( lobe[ 0 ], lobe[ 1 ], lobe[ 2 ] );
	const R = lobe[ 3 ];
	const cards:CardSpec[] = [];
	for ( let k = 0; k < count; k ++ ) {

		let x, y, z;
		do {

			x = rand() * 2 - 1; y = rand() * 2 - 1; z = rand() * 2 - 1;

		} while ( x * x + y * y + z * z > 1 || y < - 0.75 );

		const l = Math.hypot( x, y, z ) || 1;
		const shell = 0.45 + 0.55 * Math.sqrt( l );
		const c = new THREE.Vector3( x / l * shell * R * 0.85, y / l * shell * R * 0.85 * flatten, z / l * shell * R * 0.85 ).add( lobeC );
		const out = c.clone().sub( lobeC ).normalize();
		const normal = out.lerp( _up, 0.35 + rand() * 0.35 ).normalize();
		cards.push( {
			center: c, size: size * ( 0.8 + rand() * 0.45 ), normal, yaw: rand() * 6.283,
			lobeC, lobeR: R, lobeId: id, crownC, crownR, rand, flexFn, hScale, part,
		} );

	}

	return cards;

}

// Leaf clumps at the branch tips of a lobe: each clump a few crossing cards around its centre
// (normals outward from the clump with random tilt), clumps of different sizes and depths with
// real gaps between them (sky and branches show through). Returns { cards, tips }.
function clumpCards( lobe:Lobe, id:number, { clumps, clumpR, cardsPer, size, crownC, crownR, rand, flexFn, hScale, part, flatten = 0.7 }:CardOptions & { clumps:number; clumpR:number; cardsPer:number; size:number } ) {

	const lobeC = new THREE.Vector3( lobe[ 0 ], lobe[ 1 ], lobe[ 2 ] );
	const R = lobe[ 3 ];
	const cards:CardSpec[] = [], tips:Array<{ c:THREE.Vector3; rc:number }> = [];
	for ( let k = 0; k < clumps; k ++ ) {

		let x, y, z;
		do {

			x = rand() * 2 - 1; y = rand() * 2 - 1; z = rand() * 2 - 1;

		} while ( x * x + y * y + z * z > 1 || y < - 0.55 );

		const l = Math.hypot( x, y, z ) || 1;
		const reach = 0.3 + 0.7 * Math.sqrt( rand() ); // mostly toward the lobe surface, some deeper
		const c = new THREE.Vector3( x / l, y / l * flatten, z / l ).multiplyScalar( reach * R * 0.85 ).add( lobeC );
		const rc = clumpR * ( 0.65 + rand() * 0.7 );
		tips.push( { c, rc } );
		const out = c.clone().sub( lobeC ).normalize();
		for ( let j = 0; j < cardsPer; j ++ ) {

			// crossing cards: each faces a random direction around the clump, biased outward / up
			const dir = new THREE.Vector3( rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1 ).normalize()
				.addScaledVector( out, 0.9 ).addScaledVector( _up, 0.55 ).normalize();
			const center = c.clone().addScaledVector( dir, rc * ( 0.1 + 0.3 * rand() ) )
				.add( new THREE.Vector3( rand() - 0.5, ( rand() - 0.5 ) * 0.6, rand() - 0.5 ).multiplyScalar( rc * 0.5 ) );
			cards.push( {
				center, size: size * rc / clumpR * ( 0.8 + rand() * 0.4 ), normal: dir, yaw: rand() * 6.283,
				lobeC, lobeR: R, lobeId: id, crownC, crownR, rand, flexFn, hScale, part, clumpC: c, clumpR: rc,
			} );

		}

	}

	return { cards, tips };

}

export function emitCards( b:GeoBuilder, cards:CardSpec[], crownC:THREE.Vector3 ) {

	cards.sort( ( a, c ) => c.center.distanceToSquared( crownC ) - a.center.distanceToSquared( crownC ) );
	for ( const card of cards ) addCard( b, card );

}

// Broadleaf rainforest tree: buttressed trunk forking into limbs that end in leafy lobes.
// Canopy parts (aMat.x): 0 bark, 1 tree leaf-cluster card.
export function buildTreeNear( seed = 21, b = new GeoBuilder() ) {

	const rand = mulberry32( seed );
	const H = TREE_H;
	const crownC = new THREE.Vector3( 0, 7.8, 0 );
	const crownR = new THREE.Vector3( 5.2, 3.7, 5.2 );
	const flex = ( p:THREE.Vector3 ) => Math.min( 1, Math.hypot( p.x, p.z ) / 5 ) * smooth( 3.2, 6.5, p.y );
	const fork = new THREE.Vector3( ...TREE_FORK );

	// trunk with buttress fins at the foot
	const trunkR = ( f:number, a:number, c:THREE.Vector3 ) => {

		const y = c.y;
		const r = 0.34 - 0.1 * f;
		const fin = Math.pow( Math.max( 0, Math.cos( 4 * a + 0.4 ) ), 4 ) * Math.exp( - Math.max( y, 0 ) / 0.8 );
		return r * ( 1 + 0.9 * fin + 0.25 * Math.exp( - Math.max( y + 0.3, 0 ) / 0.5 ) );

	};

	addBranch( b, new THREE.Vector3( 0, - 0.5, 0 ), fork, 0.34, 0.24, 10, 7, [ 0, 0, 0, 0 ], H, flex, trunkR );

	// limbs to the lobes (the first five from the fork, the rest from the middle of a limb)
	const mids:THREE.Vector3[] = [];
	TREE_LOBES.forEach( ( L, i ) => {

		const lc = new THREE.Vector3( L[ 0 ], L[ 1 ], L[ 2 ] );
		const end = lc.clone().addScaledVector( lc.clone().sub( crownC ).setY( 0 ).normalize(), - L[ 3 ] * 0.2 ).setY( L[ 1 ] - L[ 3 ] * 0.25 );
		// limbs rise steeply from the fork and spread out (vase-shaped crown), with a random kink
		const bow = ( a:THREE.Vector3, e:THREE.Vector3, k:number ) => {

			const mid = a.clone().lerp( e, 0.5 );
			const d = e.clone().sub( a );
			const horiz = new THREE.Vector3( d.x, 0, d.z );
			return mid.addScaledVector( horiz, - 0.28 * k ).add( new THREE.Vector3( 0, d.length() * 0.16 * k, 0 ) )
				.add( new THREE.Vector3( ( rand() - 0.5 ) * 0.5, ( rand() - 0.5 ) * 0.3, ( rand() - 0.5 ) * 0.5 ).multiplyScalar( d.length() * 0.25 ) );

		};

		if ( i < 5 ) {

			const start = fork.clone().add( new THREE.Vector3( ( rand() - 0.5 ) * 0.2, - 0.2 - rand() * 0.3, ( rand() - 0.5 ) * 0.2 ) );
			const ctrl = bow( start, end, 1 );
			addLimb( b, start, ctrl, end, 0.18, 0.05, 6, 5, [ 0, 0, 0, 0 ], H, flex );
			// branching point for the secondary limbs: along the curve
			mids.push( start.clone().multiplyScalar( 0.25 ).addScaledVector( ctrl, 0.5 ).addScaledVector( end, 0.25 ) );

		} else {

			let best = mids[ 0 ]!;
			for ( const m of mids ) if ( m.distanceTo( lc ) < best.distanceTo( lc ) ) best = m;
			addLimb( b, best, bow( best, end, 0.6 ), end, 0.085, 0.03, 4, 3, [ 0, 0, 0, 0 ], H, flex );

		}

	} );

	const cards:CardSpec[] = [];
	TREE_LOBES.forEach( ( L, i ) => {

		const { cards: cs, tips } = clumpCards( L, i, {
			clumps: Math.round( 3.9 * L[ 3 ] ), clumpR: 0.82, cardsPer: 3, size: 1.45, crownC, crownR, rand, flexFn: flex, hScale: H, part: 1, flatten: 0.72,
		} );
		cards.push( ...cs );
		// short twigs carrying each clump (from part way along the lobe's limb, not one point);
		// only on the two lobes no crown variant drops (twigs don't follow the lobe scaling)
		const base = new THREE.Vector3( L[ 0 ], L[ 1 ] - L[ 3 ] * 0.3, L[ 2 ] );
		if ( i < 2 ) for ( const t of tips ) {

			const from = base.clone().lerp( t.c, 0.4 + rand() * 0.25 ).add( new THREE.Vector3( rand() - 0.5, ( rand() - 0.5 ) * 0.4, rand() - 0.5 ).multiplyScalar( 0.5 ) );
			// ends inside the clump even when the variant shrinks the lobe (no floating twigs)
			addBranch( b, from, from.clone().lerp( t.c, 0.7 ), 0.035, 0.014, 3, 1, [ 0, 0, 0, 0 ], H, flex );

		}

	} );
	emitCards( b, cards, crownC );

	return { geometry: b.build( 14, new THREE.Vector3( 0, 6.5, 0 ) ), triangles: b.triangles };

}
