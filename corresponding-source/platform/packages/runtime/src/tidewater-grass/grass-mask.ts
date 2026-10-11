/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
// Source: src/world/vegetation/Scatter.js 638-741 (`GRASS_MASK_TEXEL`, `buildGrassMask`) with the three
// `RULES` values it reads (Scatter.js 12-23: villageRadius, spawnClear, obstacleClear).
//
// Ground-flora density mask, RGBA8 over the terrain grid at 2 m (linear filtered by the grass shader):
//   R dune grass, G tall meadow grass, B sea oats, A beach creeper. Returns { data, res }.
//
// The source reads everything through its `VegSite` (Scatter.js 47-200: terrain, noises, land cover,
// rock, spawn / obstacle / village distances, bay test, scarp mask). Here that site is an injected
// interface (`GrassMaskSite`), so Genvr can feed its own soils and covers; `soilGrassSite` builds one
// from plain per-point callbacks. The Tidewater island's z band (-950..0, Scatter.js 654) and the rule
// distances are options with the source values as defaults (decision 130 (4): no island layout baked
// into the runtime; a place passes its own).
import { Noise2D, clamp, smoothstep } from './grass-noise.js';

export const GRASS_MASK_TEXEL = 2;

/** Scatter.js RULES values the mask reads. */
export const GRASS_MASK_RULES = { villageRadius: 100, spawnClear: 5, obstacleClear: 2 } as const;

/** Land cover at a point (VegSite.cover fields the mask reads). */
export interface GrassCover {
	h:number; // ground height (m)
	forest:number; // forest-floor weight, 0 meadow .. 1 forest
	bare:number; // > 0.5: bare rock face
	sand:number; // sand splat weight 0..1
	path:number; // path splat weight 0..1
	scarp:number; // embankment face (0.55 toe .. 1 lip), 0 without one
}

export interface GrassNoise { noise( x:number, y:number ):number }

/** The VegSite surface `buildGrassMask` uses. */
export interface GrassMaskSite<M = unknown> {
	terrain:{ size:number; origin:number; heightAt( x:number, z:number ):number; scarp?:M | null };
	noise:GrassNoise;
	noise2:GrassNoise;
	hasVillage:boolean;
	rock( x:number, z:number ):number;
	cover( x:number, z:number, out:GrassCover ):GrassCover;
	spawnDist( x:number, z:number ):number;
	obstacleDist( x:number, z:number ):number;
	villageDist( x:number, z:number ):number;
	inBay( x:number, z:number ):boolean;
	height( x:number, z:number ):number;
	/** Bilinear sample of a terrain mask array times `scale` (VegSite._mask). */
	_mask( mask:M, x:number, z:number, scale:number ):number;
}

export interface GrassMaskOptions {
	/** Rows outside this z band stay empty (source: the island's -950..0). */
	zMin?:number;
	zMax?:number;
	rules?:{ villageRadius:number; spawnClear:number; obstacleClear:number };
}

export interface GrassMaskResult { data:Uint8Array; res:number }

// Ground-flora density mask, RGBA8 over the terrain grid:
//   R dune grass, G tall meadow grass, B sea oats, A beach creeper
export function buildGrassMask<M>( site:GrassMaskSite<M>, { zMin = - 950, zMax = 0, rules: RULES = GRASS_MASK_RULES }:GrassMaskOptions = {} ):GrassMaskResult {

	const t = site.terrain;
	const res = Math.round( t.size / GRASS_MASK_TEXEL );
	const texel = t.size / res;
	const data = new Uint8Array( res * res * 4 );
	const N = site.noise, N2 = site.noise2;
	const c = {} as GrassCover;
	for ( let j = 1; j < res - 1; j ++ ) {

		const z = t.origin + ( j + 0.5 ) * texel;
		if ( z > zMax || z < zMin ) continue;
		for ( let i = 1; i < res - 1; i ++ ) {

			const k = j * res + i;
			const x = t.origin + ( i + 0.5 ) * texel;
			if ( t.heightAt( x, z ) < 1.7 ) continue;
			if ( site.rock( x, z ) > 0.45 ) continue;
			site.cover( x, z, c );
			if ( c.bare > 0.5 ) continue;
			// exclusions (+2 m so bilinear filtering of the texels never bleeds inside)
			const sd = site.spawnDist( x, z );
			if ( sd < RULES.spawnClear + 2 ) continue;
			const od = site.obstacleDist( x, z );
			if ( od < RULES.obstacleClear + 1 ) continue;
			const keep = smoothstep( RULES.spawnClear + 2, RULES.spawnClear + 4, sd ) * smoothstep( RULES.obstacleClear + 1, RULES.obstacleClear + 3.5, od )
				* ( 1 - smoothstep( 0.2, 0.5, c.path ) ) * ( 1 - smoothstep( 0.25, 0.45, c.bare ) );
			const bay = site.inBay( x, z );
			const clump = N.noise( x / 7.5, z / 7.5 ) * 0.65 + N2.noise( x / 19, z / 19 ) * 0.35;

			// tall meadow grass on the open ground, thinning into the forest; trodden near houses
			const house = site.hasVillage ? 1 - 0.55 * ( 1 - smoothstep( 3, 9, od ) ) : ( 1 - 0.85 * ( 1 - smoothstep( RULES.villageRadius - 6, RULES.villageRadius + 4, site.villageDist( x, z ) ) ) );
			const meadow = smoothstep( 2.5, 4.5, c.h ) * ( 1 - smoothstep( 0.45, 0.85, c.forest ) ) * ( 1 - smoothstep( 0.3, 0.7, c.sand ) ) * house
				* ( 0.75 + 0.25 * smoothstep( - 0.4, 0.3, clump ) );

			// Backshore vegetation edge (in the bay): driven by the ground height above the sea, so it
			// follows the beach profile (and any later embankment): a lobed, noisy edge with tongues
			// of grass reaching seaward and isolated clumps ahead of it; the lowest ~1.5 m (the
			// ~20 m of beach above the waterline) stays bare sand.
			let dune = 0, oats = 0, vine = 0;
			if ( bay ) {

				const lobe = N.noise( x / 16 + 4.4, z / 16 - 2.2 ) * 0.6 + N2.noise( x / 6 - 1.7, z / 6 + 8.1 ) * 0.4;
				let e = c.h - ( 2.15 - lobe * 0.4 ); // > 0 behind the edge
				// Where the embankment runs, the vegetation stops at its lip: the beach below it (up to
				// ~32 m seaward of a face, found by looking landward up the slope) stays sand, the face
				// only carries a few trailing runners and tufts, and the grass on top reaches right to
				// the lip and overhangs it. Elsewhere the ragged edge above applies.
				let belowScarp = 0;
				if ( c.scarp < 0.3 && t.scarp ) {

					// landward: up the smoothed slope (8 m differences: the berm's local normal wanders);
					// the face is only 1 - 3 m wide, so step finely
					let gx = site.height( x + 8, z ) - site.height( x - 8, z ), gz = site.height( x, z + 8 ) - site.height( x, z - 8 );
					const gl = Math.hypot( gx, gz );
					if ( gl > 1e-3 ) {

						gx /= gl; gz /= gl;
						for ( let d = 1; d <= 34; d += 1.5 ) belowScarp = Math.max( belowScarp, site._mask( t.scarp, x + gx * d, z + gz * d, 1 / 255 ) );

					}
					belowScarp = smoothstep( 0.3, 0.5, belowScarp );

				}

				const onFace = smoothstep( 0.3, 0.5, c.scarp );
				e = e * ( 1 - belowScarp ) - 2 * belowScarp;
				const main = smoothstep( 0.0, 0.35, e );
				const ahead = smoothstep( - 0.45, - 0.1, e ) * ( 1 - main ) * smoothstep( 0.35, 0.6, N.noise( x / 2.6 + 9.3, z / 2.6 - 4.1 ) );
				const inland = 1 - smoothstep( 4.8, 6.5, c.h );
				// patchy sward: dense clumps (a few metres), thinner stretches and bare sand gaps
				const patch = N2.noise( x / 4.2 + 5.5, z / 4.2 - 3.3 ) * 0.6 + N.noise( x / 11 - 7.1, z / 11 + 1.9 ) * 0.4;
				const clumpD = ( 0.3 + 0.7 * smoothstep( - 0.45, 0.25, patch ) ) * ( 0.6 + 0.4 * smoothstep( - 0.35, 0.35, clump ) );
				dune = Math.max( main * clumpD, ahead * 0.85 ) * inland * ( 1 - smoothstep( 0.4, 0.8, c.forest ) );
				// the face: sparse tufts hanging on (more near the lip)
				dune = dune * ( 1 - onFace ) + onFace * 0.18 * smoothstep( 0.7, 1.0, c.scarp ) * smoothstep( 0.0, 0.4, patch );
				// sea oats: fore-dune tufts just behind the edge
				oats = smoothstep( 0.0, 0.25, e ) * ( 1 - smoothstep( 1.4, 2.2, e ) ) * smoothstep( 0.0, 0.45, N.noise( x / 13 + 3.1, z / 13 - 7.7 ) );
				// creepers (beach morning glory): runners mat the ground at the edge and reach further
				// seaward than the grass
				vine = smoothstep( - 0.6, - 0.15, e ) * ( 1 - smoothstep( 1.2, 2.0, e ) ) * smoothstep( - 0.15, 0.3, N2.noise( x / 9 - 2.3, z / 9 + 5.3 ) );
				// runners trailing down the face from the lip, and matting its top
				vine = Math.max( vine * ( 1 - onFace ), onFace * 0.6 * smoothstep( 0.0, 0.35, N2.noise( x / 3.5 + 1.1, z / 3.5 - 2.9 ) ) );

			}

			const o = k * 4;
			data[ o ] = Math.round( 255 * clamp( dune * keep, 0, 1 ) );
			data[ o + 1 ] = Math.round( 255 * clamp( meadow * keep * ( 1 - dune ), 0, 1 ) );
			data[ o + 2 ] = Math.round( 255 * clamp( oats * keep, 0, 1 ) );
			data[ o + 3 ] = Math.round( 255 * clamp( vine * keep, 0, 1 ) );

		}

	}

	return { data, res };

}

/** Plain per-point inputs for `soilGrassSite` (Genvr soils / covers, or a test ground). */
export interface SoilGrassInputs {
	size:number;
	origin:number;
	heightAt( x:number, z:number ):number;
	/** Sand soil weight 0..1. */
	sand( x:number, z:number ):number;
	/** Forest cover weight 0..1. */
	forest( x:number, z:number ):number;
	rock?( x:number, z:number ):number;
	path?( x:number, z:number ):number;
	/** Bare rock face tendency (> 0.5 skips the texel); default from `rock` as VegSite.cover: rock * 1.4. */
	bare?( x:number, z:number ):number;
	/** Beach zone where dune grass, oats and creeper grow. Default: everywhere. */
	inBay?( x:number, z:number ):boolean;
	spawnDist?( x:number, z:number ):number;
	obstacleDist?( x:number, z:number ):number;
	/** Noise seed: VegSite's `seed` (1234) and `seed * 7 + 3`. */
	seed?:number;
}

/**
 * A `GrassMaskSite` from plain callbacks: no village, no embankment (scarp), distances 1e9 unless
 * given (VegSite.obstacleDist's "far away"). Not part of the source; the source's VegSite derives the
 * same fields from its terrain splats.
 */
export function soilGrassSite( inputs:SoilGrassInputs ):GrassMaskSite<null> {

	const seed = inputs.seed ?? 1234;
	const far = () => 1e9;
	const rock = inputs.rock ?? ( () => 0 );
	const path = inputs.path ?? ( () => 0 );
	const bare = inputs.bare ?? ( ( x:number, z:number ) => rock( x, z ) * 1.4 );
	return {
		terrain: { size: inputs.size, origin: inputs.origin, heightAt: inputs.heightAt, scarp: null },
		noise: new Noise2D( seed ),
		noise2: new Noise2D( seed * 7 + 3 ),
		hasVillage: false,
		rock,
		cover( x, z, out ) {

			out.h = inputs.heightAt( x, z );
			out.forest = inputs.forest( x, z );
			out.bare = bare( x, z );
			out.sand = inputs.sand( x, z );
			out.path = path( x, z );
			out.scarp = 0;
			return out;

		},
		spawnDist: inputs.spawnDist ?? far,
		obstacleDist: inputs.obstacleDist ?? far,
		villageDist: far,
		inBay: inputs.inBay ?? ( () => true ),
		height: inputs.heightAt,
		_mask: () => 0,
	};

}
