/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
// Source: src/world/reef/ReefNoise.js 1-84 (tileable RGBA8 3D noise volume for the reef materials).
// Divergence: the source builds the voxel data and wraps it in an engine `Texture` in one function.
// Here the CPU fill is the pure `createNoiseVolumeData` (bit-exact vs the source), the exact
// Texture options the source passes are `noiseVolumeTextureOptions`, and `createNoiseVolume`
// takes the GPU texture factory as an injected first parameter. The Texture creation itself
// (WebGPU 3D texture, `linearRepeat` sampler) is not executable here and is untested.
import { mulberry32 } from './shore-math.js';

// Tileable 3D gradient noise in a small RGBA8 volume: four independent noise channels with
// `cells` noise cells across the tile (size / cells texels per cell), sampled with trilinear
// filtering and repeat wrapping. One fetch returns four noise values, far cheaper than
// evaluating procedural noise per pixel. The noise is band-limited (features span several
// texels), so sampling it minified doesn't alias as long as the features stay larger than a
// pixel, which the materials ensure by fading detail with the pixel footprint.
//
// Stored as v * 0.55 + 0.5 (v: unit-gradient Perlin noise, |v| < 0.87); NOISE_SCALE maps a
// fetched value back to about the range of MaterialX noise: ( s - 0.5 ) * NOISE_SCALE.
export const NOISE_SCALE = 2.55;

/** The options object the source passes to `new Texture( ... )` (ReefNoise.js 81). */
export interface NoiseVolumeTextureOptions {
	label:'reefNoise';
	width:number;
	height:number;
	depth:number;
	dimension:'3d';
	format:'rgba8unorm';
	data:Uint8Array;
	sampler:'linearRepeat';
}

/** Injected GPU texture factory (the engine's `new Texture( options )`). */
export type NoiseVolumeTextureFactory<T> = ( options:NoiseVolumeTextureOptions ) => T;

// ReefNoise.js 14-77: the voxel data ( size^3 RGBA8, x fastest )
export function createNoiseVolumeData( size = 64, cells = 8, seed = 90210 ):Uint8Array {

	const rng = mulberry32( seed );
	const n = cells, n3 = n * n * n;
	const data = new Uint8Array( size * size * size * 4 );
	const fade = ( t:number ) => t * t * t * ( t * ( t * 6 - 15 ) + 10 );
	// per-axis interpolation tables (the same for x, y and z)
	const i0 = new Int32Array( size ), i1 = new Int32Array( size ), fr = new Float32Array( size ), fw = new Float32Array( size );
	for ( let x = 0; x < size; x ++ ) {

		const p = ( x + 0.5 ) * n / size;
		const i = Math.floor( p );
		i0[ x ] = i % n;
		i1[ x ] = ( i + 1 ) % n;
		fr[ x ] = p - i;
		fw[ x ] = fade( p - i );

	}

	const gx = new Float32Array( n3 ), gy = new Float32Array( n3 ), gz = new Float32Array( n3 );
	for ( let ch = 0; ch < 4; ch ++ ) {

		for ( let k = 0; k < n3; k ++ ) {

			// random unit gradient
			const z = rng() * 2 - 1, a = rng() * Math.PI * 2, r = Math.sqrt( 1 - z * z );
			gx[ k ] = r * Math.cos( a );
			gy[ k ] = r * Math.sin( a );
			gz[ k ] = z;

		}

		const dot = ( ix:number, iy:number, iz:number, x:number, y:number, z:number ) => {

			const k = ( iz * n + iy ) * n + ix;
			return gx[ k ]! * x + gy[ k ]! * y + gz[ k ]! * z;

		};

		for ( let z = 0; z < size; z ++ ) {

			const z0 = i0[ z ]!, z1 = i1[ z ]!, fz = fr[ z ]!, wz = fw[ z ]!;
			for ( let y = 0; y < size; y ++ ) {

				const y0 = i0[ y ]!, y1 = i1[ y ]!, fy = fr[ y ]!, wy = fw[ y ]!;
				for ( let x = 0; x < size; x ++ ) {

					const x0 = i0[ x ]!, x1 = i1[ x ]!, fx = fr[ x ]!, wx = fw[ x ]!;
					const a = dot( x0, y0, z0, fx, fy, fz ), b = dot( x1, y0, z0, fx - 1, fy, fz );
					const c = dot( x0, y1, z0, fx, fy - 1, fz ), d = dot( x1, y1, z0, fx - 1, fy - 1, fz );
					const e = dot( x0, y0, z1, fx, fy, fz - 1 ), f = dot( x1, y0, z1, fx - 1, fy, fz - 1 );
					const g = dot( x0, y1, z1, fx, fy - 1, fz - 1 ), h = dot( x1, y1, z1, fx - 1, fy - 1, fz - 1 );
					const ab = a + ( b - a ) * wx, cd = c + ( d - c ) * wx, ef = e + ( f - e ) * wx, gh = g + ( h - g ) * wx;
					const lo = ab + ( cd - ab ) * wy, hi = ef + ( gh - ef ) * wy;
					const v = lo + ( hi - lo ) * wz;
					data[ ( ( z * size + y ) * size + x ) * 4 + ch ] = Math.max( 0, Math.min( 255, Math.round( ( v * 0.55 + 0.5 ) * 255 ) ) );

				}

			}

		}

	}

	return data;

}

// ReefNoise.js 79-81: sampled trilinear with repeat wrapping (the shared `smpLinearRepeat` sampler), no mipmaps
export function noiseVolumeTextureOptions( size:number, data:Uint8Array ):NoiseVolumeTextureOptions {

	return { label: 'reefNoise', width: size, height: size, depth: size, dimension: '3d', format: 'rgba8unorm', data, sampler: 'linearRepeat' };

}

// ReefNoise.js 14-84: the source's createNoiseVolume( size, cells, seed ) with the Texture factory injected first
export function createNoiseVolume<T>( createTexture:NoiseVolumeTextureFactory<T>, size = 64, cells = 8, seed = 90210 ):T {

	const data = createNoiseVolumeData( size, cells, seed );
	const tex = createTexture( noiseVolumeTextureOptions( size, data ) );
	return tex;

}
