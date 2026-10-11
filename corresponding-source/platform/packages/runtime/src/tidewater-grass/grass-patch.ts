/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
// Source: src/world/vegetation/GrassField.js 26-398: cell and range constants, the blue-noise slot
// sets, the patch builder (blades, ground fans, creeper ribbons), the clump / blade parameters shared
// by every level and `buildPatch` (near, mid, far). Statement order kept: the random streams and the
// float results depend on it.
//
// The world is divided into CELL x CELL metre cells. Every visible cell near the camera draws one
// instance of a "patch": a fixed blue-noise set of clump slots. The vertex shader (grass-material.ts)
// places each slot at cellOrigin + slot offset, reads its height from the terrain heightmap and its
// presence / size from the RGBA density mask (R dune grass, G meadow grass, B sea oats, A creeper).
//
// Three levels share the same clumps and blades (identical parameters), so switching a cell between
// them never moves a blade:
//   near (< R_NEAR): every blade, 3 segments        mid (< R_MID): tiers 0-1, 2 segments
//   far (< R_FAR): tier 0, one triangle per blade
import { Box3, Float32BufferAttribute, InstancedBufferGeometry, Sphere, Uint16BufferAttribute, Uint32BufferAttribute, Vector3 } from 'three';
import { mulberry32, type Rng } from './grass-noise.js';

export const CELL = 8;
export const R_NEAR = 18;
export const R_MID = 46;
export const R_FAR = 88;
export const FADE_T2 = [ 11, 17 ] as const;
export const FADE_T1 = [ 36, 45 ] as const;
export const FADE_T0 = [ 62, 87 ] as const; // tier 0 blades drop out at random distances in this range
export const MAX_NEAR = 48;
export const MAX_MID = 160;
export const MAX_FAR = 420;
export const CLUMPS = 384; // meadow / dune clump slots per cell (6 per m^2)
export const BLADES = 7; // per clump
export const BLADE_TIER = [ 0, 0, 1, 1, 2, 2, 2 ] as const;
// blades per clump in each tier (coverage compensation)
export const TIER_N = [ 2, 2, 3 ] as const;
export const OATS = 12; // sea oat slots per cell
export const VINES = 28; // creeper slots per cell

export const KIND = { GRASS: 0, OAT_STALK: 1, OAT_HEAD: 2, CREEPER: 3, FLOWER: 4 } as const;

export type P2 = [ number, number ];
type V3 = [ number, number, number ];
type V4 = [ number, number, number, number ];

// Mitchell's best-candidate blue noise on a torus; any prefix is also well distributed.
export function blueNoise( rand:Rng, n:number, size:number, k = 10 ):P2[] {

	const pts:P2[] = [];
	for ( let i = 0; i < n; i ++ ) {

		let best:P2 | null = null, bestD = - 1;
		for ( let c = 0; c < ( i === 0 ? 1 : k ); c ++ ) {

			const x = rand() * size, z = rand() * size;
			let dmin = Infinity;
			for ( const p of pts ) {

				let dx = Math.abs( p[ 0 ] - x ), dz = Math.abs( p[ 1 ] - z );
				dx = Math.min( dx, size - dx );
				dz = Math.min( dz, size - dz );
				dmin = Math.min( dmin, dx * dx + dz * dz );

			}

			if ( dmin > bestD ) {

				bestD = dmin;
				best = [ x, z ];

			}

		}

		pts.push( best! );

	}

	return pts;

}

export class PatchBuilder {

	pos:number[] = [];
	nor:number[] = [];
	side:number[] = [];
	slot:number[] = [];
	bladeData:number[] = [];
	idx:number[] = [];

	get count() {

		return this.pos.length / 3;

	}

	// side: xyz offset direction * half width, w: across coordinate (-1 left edge, 1 right, 0 tip)
	v( p:V3, n:V3, side:V3 | V4, slot:V4, blade:V4 ):number {

		this.pos.push( p[ 0 ], p[ 1 ], p[ 2 ] );
		this.nor.push( n[ 0 ], n[ 1 ], n[ 2 ] );
		this.side.push( side[ 0 ], side[ 1 ], side[ 2 ], side[ 3 ] ?? 0 );
		this.slot.push( slot[ 0 ], slot[ 1 ], slot[ 2 ], slot[ 3 ] );
		this.bladeData.push( blade[ 0 ], blade[ 1 ], blade[ 2 ], blade[ 3 ] );
		return this.count - 1;

	}

	// blade: centre-line points with half widths; tip row has zero width (single vertex).
	// w4: aBlade.w (grass: tier)
	blade( slot:V4, kind:number, rows:readonly number[], width:number, dirX:number, dirZ:number, lean:number, height:number, curve:number, rnd:number, base:P2 = [ 0, 0 ], w4 = 0 ) {

		const sx = - dirZ, sz = dirX; // horizontal side direction
		const ids:number[][] = [];
		for ( let r = 0; r < rows.length; r ++ ) {

			const h = rows[ r ]!;
			const out = ( Math.sin( lean ) * h + curve * h * h ) * height;
			const up = ( Math.cos( lean ) * h - curve * 0.35 * h * h ) * height;
			const p:V3 = [ base[ 0 ] + dirX * out, up, base[ 1 ] + dirZ * out ];
			// tangent for the normal
			const dOut = Math.sin( lean ) + 2 * curve * h, dUp = Math.cos( lean ) - 0.7 * curve * h;
			const tl = Math.hypot( dOut, dUp );
			const tx = dirX * dOut / tl, ty = dUp / tl, tz = dirZ * dOut / tl;
			// normal = side x tangent
			const nx = - sz * ty, ny = sz * tx - sx * tz, nz = sx * ty;
			const nl = Math.hypot( nx, ny, nz ) || 1;
			const n:V3 = [ nx / nl, ny / nl, nz / nl ];
			const hw = width * ( 1 - Math.pow( h, 1.6 ) ) * ( 0.75 + 0.25 * ( 1 - h ) );
			const blade:V4 = [ h, kind, rnd, w4 ];
			if ( r === rows.length - 1 ) {

				ids.push( [ this.v( p, n, [ 0, 0, 0, 0 ], slot, blade ) ] );

			} else {

				ids.push( [
					this.v( p, n, [ - sx * hw, 0, - sz * hw, - 1 ], slot, blade ),
					this.v( p, n, [ sx * hw, 0, sz * hw, 1 ], slot, blade ),
				] );

			}

		}

		for ( let r = 0; r < ids.length - 1; r ++ ) {

			const a = ids[ r ]!, b = ids[ r + 1 ]!;
			if ( b.length === 1 ) this.idx.push( a[ 0 ]!, a[ 1 ]!, b[ 0 ]! );
			else this.idx.push( a[ 0 ]!, a[ 1 ]!, b[ 1 ]!, a[ 0 ]!, b[ 1 ]!, b[ 0 ]! );

		}

	}

	// small leaf / flower lying on the ground: triangle fan around a centre point.
	// outline(a) gives the radius factor for angle a (0 = pointing along dir).
	fan( slot:V4, kind:number, center:P2, radius:number, dirX:number, dirZ:number, tilt:number, sides:number, outline:( a:number ) => number, rnd:number, lift:number, hf = 0.1 ) {

		const c = this.v( [ center[ 0 ], lift, center[ 1 ] ], [ 0, 1, 0 ], [ 0, 0, 0, 0 ], slot, [ hf, kind, rnd, 1 ] );
		const ring:number[] = [];
		for ( let i = 0; i < sides; i ++ ) {

			const a = ( i / sides ) * Math.PI * 2;
			const r = radius * outline( a );
			const lx = Math.cos( a ) * r, lz = Math.sin( a ) * r * 0.85;
			const x = center[ 0 ] + lx * dirX - lz * dirZ;
			const z = center[ 1 ] + lx * dirZ + lz * dirX;
			const along = lx / radius;
			const y = lift + ( along + 0.6 ) * radius * tilt;
			ring.push( this.v( [ x, y, z ], [ 0, 1, 0 ], [ 0, 0, 0, 0 ], slot, [ hf + 0.05 * Math.max( 0, along ), kind, rnd, 0 ] ) );

		}

		for ( let i = 0; i < sides; i ++ ) this.idx.push( c, ring[ ( i + 1 ) % sides ]!, ring[ i ]! );

	}

	// thin ribbon lying on the ground (creeper runner)
	ribbon( slot:V4, kind:number, pts:V3[], width:number, rnd:number ) {

		const ids:number[][] = [];
		for ( let i = 0; i < pts.length; i ++ ) {

			const p = pts[ i ]!, q = pts[ Math.min( pts.length - 1, i + 1 ) ]!, o = pts[ Math.max( 0, i - 1 ) ]!;
			let dx = q[ 0 ] - o[ 0 ], dz = q[ 2 ] - o[ 2 ];
			const l = Math.hypot( dx, dz ) || 1;
			dx /= l; dz /= l;
			const sx = - dz * width, sz = dx * width;
			ids.push( [
				this.v( [ p[ 0 ] - sx, p[ 1 ], p[ 2 ] - sz ], [ 0, 1, 0 ], [ 0, 0, 0, 0 ], slot, [ 0.05, kind, rnd, 0 ] ),
				this.v( [ p[ 0 ] + sx, p[ 1 ], p[ 2 ] + sz ], [ 0, 1, 0 ], [ 0, 0, 0, 0 ], slot, [ 0.05, kind, rnd, 0 ] ),
			] );

		}

		for ( let i = 0; i < ids.length - 1; i ++ ) {

			const a = ids[ i ]!, b = ids[ i + 1 ]!;
			this.idx.push( a[ 0 ]!, b[ 1 ]!, a[ 1 ]!, a[ 0 ]!, b[ 0 ]!, b[ 1 ]! );

		}

	}

	build():InstancedBufferGeometry {

		const g = new InstancedBufferGeometry();
		g.setAttribute( 'position', new Float32BufferAttribute( this.pos, 3 ) );
		g.setAttribute( 'normal', new Float32BufferAttribute( this.nor, 3 ) );
		g.setAttribute( 'aSide', new Float32BufferAttribute( this.side, 4 ) );
		g.setAttribute( 'aSlot', new Float32BufferAttribute( this.slot, 4 ) );
		g.setAttribute( 'aBlade', new Float32BufferAttribute( this.bladeData, 4 ) );
		g.setIndex( this.count > 65535 ? new Uint32BufferAttribute( this.idx, 1 ) : new Uint16BufferAttribute( this.idx, 1 ) );
		g.boundingSphere = new Sphere( new Vector3(), 1e7 );
		g.boundingBox = new Box3( new Vector3( - 1e7, - 1e7, - 1e7 ), new Vector3( 1e7, 1e7, 1e7 ) );
		return g;

	}

	get triangles() {

		return this.idx.length / 3;

	}

}

export interface GrassBlade {
	dx:number; dz:number; lean:number; h:number; curve:number; rnd:number; base:P2; tier:number;
}
export interface GrassClump { x:number; z:number; slotRand:number; blades:GrassBlade[] }

// Clump / blade parameters shared by all levels (same seeds -> identical blades).
export function clumpParams( seed:number ):GrassClump[] {

	const rand = mulberry32( seed );
	const slots = blueNoise( mulberry32( seed + 1 ), CLUMPS, CELL );
	return slots.map( ( [ x, z ] ) => {

		const slotRand = rand();
		const az0 = rand() * Math.PI * 2;
		const blades:GrassBlade[] = [];
		for ( let k = 0; k < BLADES; k ++ ) {

			// golden-angle azimuths: any prefix of the blades spreads around the clump; the first
			// two (kept at every distance) lean away from each other
			const az = az0 + k * 2.39996 + ( rand() - 0.5 ) * 0.5;
			const outer = k === 0 ? 0.1 + 0.3 * rand() : k === 1 ? 0.35 + 0.4 * rand() : rand();
			blades.push( {
				dx: Math.cos( az ), dz: Math.sin( az ),
				lean: 0.06 + 0.55 * outer * ( 0.6 + 0.8 * rand() ),
				h: ( 0.7 + 0.5 * rand() ) * ( 1.06 - 0.22 * outer ),
				curve: 0.12 + 0.5 * outer * ( 0.5 + rand() ),
				rnd: rand(),
				base: [ Math.cos( az ) * 0.09 * rand(), Math.sin( az ) * 0.09 * rand() ],
				tier: BLADE_TIER[ k ]!,
			} );

		}

		return { x, z, slotRand, blades };

	} );

}

/** Patch level: 0 near, 1 mid, 2 far. */
export type GrassLevel = 0 | 1 | 2;

// level: 0 near, 1 mid, 2 far
export function buildPatch( level:GrassLevel, clumps:GrassClump[], seed = 7 ):PatchBuilder {

	const b = new PatchBuilder();
	const rows = ( [ [ 0, 0.3, 0.62, 1 ], [ 0, 0.55, 1 ], [ 0, 1 ] ] as const )[ level ];
	const maxTier = 2 - level;

	for ( const c of clumps ) {

		const slot:V4 = [ c.x, c.z, c.slotRand, 0 ];
		for ( const bl of c.blades ) {

			if ( bl.tier > maxTier ) continue;
			b.blade( slot, KIND.GRASS, rows, 0.012, bl.dx, bl.dz, bl.lean, bl.h, bl.curve, bl.rnd, bl.base, bl.tier );

		}

	}

	if ( level === 2 ) return b;

	// sea oats (tier 1: fade out before the far level) and, near only, beach creeper. Every slot
	// has its own random stream, so the near and mid versions of a plant are identical.
	const oatSlots = blueNoise( mulberry32( seed + 2 ), OATS, CELL );
	const near = level === 0;
	oatSlots.forEach( ( [ x, z ], si ) => {

		const rand = mulberry32( seed * 7919 + si * 131 + 17 );
		const slot:V4 = [ x, z, rand(), 1 ];
		const stalks = near ? 3 : 1;
		for ( let q = 0; q < 3; q ++ ) {

			const az = rand() * Math.PI * 2;
			const dx = Math.cos( az ), dz = Math.sin( az );
			const lean = 0.06 + 0.14 * rand();
			const hq = 0.8 + 0.3 * rand();
			const rnd = rand();
			const bx = q === 0 ? 0 : ( rand() - 0.5 ) * 0.22, bz = q === 0 ? 0 : ( rand() - 0.5 ) * 0.22;
			const hs = [ rand(), rand(), rand(), rand(), rand(), rand(), rand(), rand() ];
			if ( q >= stalks ) continue;
			const qTier = q === 0 ? 0 : 2;
			// stalk (unit height, scaled in the shader)
			b.blade( slot, KIND.OAT_STALK, near ? [ 0, 0.3, 0.6, 0.85, 1 ] : [ 0, 0.6, 1 ], near ? 0.0075 : 0.014, dx, dz, lean, hq, 0.2, rnd, [ bx, bz ], qTier );
			// drooping panicle: flat spikelets hanging off the upper stalk
			const heads = near ? 8 : 3;
			for ( let k = 0; k < heads; k ++ ) {

				const hf = 0.7 + 0.3 * ( k / Math.max( 1, heads - 1 ) );
				const out = ( Math.sin( lean ) * hf + 0.2 * hf * hf ) * hq;
				const up = ( Math.cos( lean ) * hf - 0.07 * hf * hf ) * hq;
				const sa = az + ( k % 2 ? 1 : - 1 ) * ( 0.45 + 0.6 * hs[ k ]! );
				const sdx = Math.cos( sa ), sdz = Math.sin( sa );
				const cx = bx + dx * out + sdx * 0.02, cz = bz + dz * out + sdz * 0.02;
				const L = near ? 0.085 : 0.13, W = near ? 0.022 : 0.04;
				const n:V3 = [ 0, 1, 0 ];
				const slotB:V4 = [ hf, KIND.OAT_HEAD, rnd, qTier ];
				const a = b.v( [ cx, up + 0.01, cz ], n, [ 0, 0, 0, 0 ], slot, slotB );
				const l = b.v( [ cx + sdx * L * 0.45 - sdz * W, up - L * 0.4, cz + sdz * L * 0.45 + sdx * W ], n, [ 0, 0, 0, 0 ], slot, slotB );
				const r = b.v( [ cx + sdx * L * 0.45 + sdz * W, up - L * 0.4, cz + sdz * L * 0.45 - sdx * W ], n, [ 0, 0, 0, 0 ], slot, slotB );
				const t = b.v( [ cx + sdx * L * 0.8, up - L * 0.95, cz + sdz * L * 0.8 ], n, [ 0, 0, 0, 0 ], slot, slotB );
				b.idx.push( a, l, t, a, t, r );

			}

		}

		if ( near ) {

			for ( let k = 0; k < 4; k ++ ) {

				const la = ( k / 4 ) * Math.PI * 2 + rand();
				b.blade( slot, KIND.GRASS, [ 0, 0.45, 0.8, 1 ], 0.01, Math.cos( la ), Math.sin( la ), 0.55 + 0.4 * rand(), 0.45, 0.35, rand(), [ 0, 0 ], 2 );

			}

		}

	} );

	if ( ! near ) return b;

	// beach creeper (railroad vine): a runner crawling over the sand with notched leaves
	const notched = ( a:number ) => {

		const d = Math.min( Math.abs( a ), Math.abs( a - Math.PI * 2 ) );
		return 1 - 0.38 * Math.exp( - ( d * d ) / 0.12 ) - 0.15 * Math.pow( Math.sin( a * 0.5 ), 8 );

	};
	const petals = ( a:number ) => 0.82 + 0.18 * Math.cos( a * 5 );
	const vineSlots = blueNoise( mulberry32( seed + 3 ), VINES, CELL );
	vineSlots.forEach( ( [ x, z ], si ) => {

		const rand = mulberry32( seed * 3571 + si * 197 + 5 );
		const slot:V4 = [ x, z, rand(), 2 ];
		let az = rand() * Math.PI * 2;
		const pts:V3[] = [];
		const n = 12;
		let px = - Math.cos( az ) * 1.1, pz = - Math.sin( az ) * 1.1;
		for ( let i = 0; i < n; i ++ ) {

			pts.push( [ px, 0.01, pz ] );
			az += ( rand() - 0.5 ) * 0.5;
			px += Math.cos( az ) * 0.19;
			pz += Math.sin( az ) * 0.19;

		}

		b.ribbon( slot, KIND.CREEPER, pts, 0.011, rand() );
		for ( let i = 1; i < pts.length; i ++ ) {

			const side = i % 2 ? 1 : - 1;
			const p0 = pts[ i - 1 ]!, p1 = pts[ i ]!;
			let dx = p1[ 0 ] - p0[ 0 ], dz = p1[ 2 ] - p0[ 2 ];
			const l = Math.hypot( dx, dz ) || 1;
			dx /= l; dz /= l;
			// leaves stand on short petioles, angled forward off the runner, tilted up
			const la = Math.atan2( dz, dx ) + side * ( 0.7 + 0.5 * rand() );
			const ldx = Math.cos( la ), ldz = Math.sin( la );
			const r = ( 0.07 + 0.04 * rand() ) * ( 0.6 + 0.4 * Math.sin( Math.PI * i / n ) );
			b.fan( slot, KIND.CREEPER, [ p1[ 0 ] + ldx * r * 0.9, p1[ 2 ] + ldz * r * 0.9 ], r, ldx, ldz, 0.3 + 0.3 * rand(), 7, notched, rand(), 0.015 );

		}

		const fp = pts[ 3 + Math.floor( rand() * 4 ) ]!;
		b.fan( slot, KIND.FLOWER, [ fp[ 0 ] + 0.03, fp[ 2 ] + 0.03 ], 0.036, 1, 0, 1.4, 10, petals, rand(), 0.07, 0.2 );

	} );

	return b;

}
