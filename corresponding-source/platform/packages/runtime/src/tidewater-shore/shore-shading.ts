/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
// Source: the WGSL material snippets of src/world/Rocks.js 341-380, src/world/debris/NatureMaterial.js 1-266,
// src/world/debris/PebbleField.js 159-381, src/world/debris/ScannedDebris.js 177-230 and
// src/world/reef/ReefMaterials.js 1-634, run over the engine material contract of
// src/engine/render/MeshShader.js (FragInput, surfaceOf, VertexData), src/engine/render/wgsl/lighting.js
// (struct Surface, defaultSurface), src/materials/Materials.js (the standard() prelude),
// src/engine/render/wgsl/common.js (helpers, hashes, MaterialX noise, normal maps),
// src/materials/LODFade.js (lodFadeModule) and src/world/terrain/TerrainShading.js (terrainShadingModule).
//
// Native three.js WebGPU node materials for the shore (rocks, beach debris, pebbles, scanned debris and
// the reef). Every source snippet runs verbatim (taken from the committed ports of those files, which keep
// them 1:1) inside a generated wgslFn entry. The entry is the FIRST function of each string (wgslFn calls
// the first declaration); it rebuilds the engine's `in` (FragInput), `s` (Surface, seeded like the engine's
// defaultSurface + surfaceOf and the standard() prelude), `frame` and `mat`, runs the snippet and returns the
// surface packed into a mat4x4f. `shoreSurfaceSlots` maps the packed columns onto named slots, and
// `applyShoreSlots` puts the slots on the node material: three's MeshStandard / MeshPhysical node lighting
// then plays the role of the engine's shadeSurface (as for the boat and the plants).
//
// Vertex stages: the pebble placement (PebbleField.js: density mask, hashes, size, tilt, yaw, the terrain
// height and the distance fade), the scanned-debris asset selection and the reef vertex stage (instance
// record transform, per-colony warp, surge sway of flexible organisms, grow-in with distance) run as
// wgslFn entries too, on positionNode plus varyings. They are vertex steps in the source, not compute.
//
// Divergences (engine features with no three.js counterpart; see docs/reference/tidewater-world/
// 17-shore-shading/README.md):
// - Module-scope bindings of the source modules (terrainDetailTex, reefNoise and their samplers) are
//   threaded through as function parameters (`threadWgslParams`): the only change to those modules.
// - The source TerrainGPU module (terrainHeightAt, terrainSplat) is a heightfield texture of the
//   source world. Genvr injects them as node providers evaluated at the fragment's (or the pebble slot's)
//   world xz; every snippet calls each of them exactly once, at that xz. terrainUvOf stays verbatim.
// - The reef records come from bindings (default: instanced attributes in ReefBatch.data layout) instead
//   of the source's indirect draw list lookup (List / Base / FadeList storage buffers): the
//   `<prefix>RecordIndex` / `<prefix>Record` / `<prefix>FadeEntry` functions return the bound record.
// - Thin-tissue translucency (s.translucency * lightColor in the engine's direct light) is added as
//   emissive translucency * sunColor (no shadow term); s.envIntensity stays 1 like the source.
// - The heightfield sun shadow (MATERIAL_SUN_MODULATION), the engine's underwater lighting, motion vectors
//   (v.prevWorldPos) and the FFT ocean term of reefSurge (only the analytic swell surge is ported) are not
//   part of this file. The shadow hooks are three's maskShadowNode.
import {
  Data3DTexture,
  DoubleSide,
  FrontSide,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  LinearFilter,
  MeshPhysicalNodeMaterial,
  MeshStandardNodeMaterial,
  NoColorSpace,
  RepeatWrapping,
  RGBAFormat,
  TSL,
  UnsignedByteType,
  Vector3,
  type Texture,
} from 'three/webgpu';
import { createDetailTexture } from '../tidewater-ground/detail-texture.js';
import { lodFadeNode } from '../tidewater-sky/lod-fade.js';
import { rocksMaterialSpec } from './rocks.js';
import { createNatureMaterial, stoneSurfaceModule } from './nature-material.js';
import { PebbleField, pebbleModule } from './pebble-field.js';
import { ScannedDebris } from './scanned-debris.js';
import {
  FRAG_WGSL,
  REEF_COMMON_WGSL,
  RecordingMaterial,
  createReefMaterials,
  createReefView,
  makeSurge,
  type ReefBatchLike,
} from './reef-materials.js';
import { createNoiseVolumeData } from './reef-noise.js';
import { srgb } from './shore-math.js';
import { RECORDING_ENGINE, type ShoreMaterialParams } from './shore-engine.js';
/* eslint-disable @typescript-eslint/no-explicit-any -- native TSL graph boundary */
type N = any;

// ---------------------------------------------------------------- engine WGSL (verbatim copies)

/** common.js (commonModule) without its depth / view reconstruction block (it reads frame matrices the shore never uses). */
export const SHORE_COMMON_WGSL = /* wgsl */ `
const PI: f32 = 3.141592653589793;
const TWO_PI: f32 = 6.283185307179586;
const INV_PI: f32 = 0.3183098861837907;
const EPS: f32 = 1e-5;

fn sat( x: f32 ) -> f32 { return clamp( x, 0.0, 1.0 ); }
fn sat3( x: vec3f ) -> vec3f { return clamp( x, vec3f( 0.0 ), vec3f( 1.0 ) ); }
fn pow2( x: f32 ) -> f32 { return x * x; }
fn pow4( x: f32 ) -> f32 { let y = x * x; return y * y; }
fn pow5( x: f32 ) -> f32 { let y = x * x; return y * y * x; }
fn luminance( c: vec3f ) -> f32 { return dot( c, vec3f( 0.2126, 0.7152, 0.0722 ) ); }
fn remap( x: f32, a: f32, b: f32, c: f32, d: f32 ) -> f32 { return c + ( x - a ) * ( d - c ) / ( b - a ); }
fn remapClamp( x: f32, a: f32, b: f32, c: f32, d: f32 ) -> f32 { return mix( c, d, sat( ( x - a ) / ( b - a ) ) ); }
fn rotate2( v: vec2f, a: f32 ) -> vec2f { let c = cos( a ); let s = sin( a ); return vec2f( c * v.x - s * v.y, s * v.x + c * v.y ); }

// ---- hashes

fn pcg( v: u32 ) -> u32 {
	let state = v * 747796405u + 2891336453u;
	let word = ( ( state >> ( ( state >> 28u ) + 4u ) ) ^ state ) * 277803737u;
	return ( word >> 22u ) ^ word;
}
fn pcg3( v0: vec3u ) -> vec3u {
	var v = v0 * 1664525u + 1013904223u;
	v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
	v ^= v >> vec3u( 16u );
	v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
	return v;
}
fn u32ToUnit( h: u32 ) -> f32 { return f32( h >> 8u ) * ( 1.0 / 16777216.0 ) + ( 0.5 / 16777216.0 ); }
// float hash in [0, 1) of a float seed (TSL hash())
fn hash11( p: f32 ) -> f32 { return u32ToUnit( pcg( bitcast<u32>( p ) ^ 0x9e3779b9u ) ); }
fn hash21( p: vec2f ) -> f32 { return u32ToUnit( pcg( bitcast<u32>( p.x ) ^ pcg( bitcast<u32>( p.y ) ) ) ); }
fn hash31( p: vec3f ) -> f32 { return u32ToUnit( pcg3( bitcast<vec3u>( p ) ).x ); }
fn hash22( p: vec2f ) -> vec2f {
	let h = pcg3( vec3u( bitcast<vec2u>( p ), 0x51ed270bu ) );
	return vec2f( u32ToUnit( h.x ), u32ToUnit( h.y ) );
}
fn hash33( p: vec3f ) -> vec3f {
	let h = pcg3( bitcast<vec3u>( p ) );
	return vec3f( u32ToUnit( h.x ), u32ToUnit( h.y ), u32ToUnit( h.z ) );
}
fn hashU( a: u32, b: u32 ) -> f32 { return u32ToUnit( pcg( a ^ pcg( b ) ) ); }
fn ihash3( p: vec3i ) -> vec3u { return pcg3( bitcast<vec3u>( p ) ); }

// Jimenez interleaved gradient noise at a pixel (0..1)
fn interleavedGradientNoise( px: vec2f ) -> f32 { return fract( 52.9829189 * fract( dot( px, vec2f( 0.06711056, 0.00583715 ) ) ) ); }

// i-th of n points of a Vogel disc (unit radius), rotated by phi
fn vogelDiskSample( i: i32, n: i32, phi: f32 ) -> vec2f {
	let r = sqrt( ( f32( i ) + 0.5 ) / f32( n ) );
	let theta = f32( i ) * 2.399963229728653 + phi;
	return vec2f( cos( theta ), sin( theta ) ) * r;
}

// ---- gradient noise: MaterialX (three's MaterialXNoise.js) bit for bit — the same Jenkins
// lookup3 hash, gradients, quintic fade and gradient scales (0.6616 in 2D, 0.982 in 3D), so the
// procedural patterns land where they did in the three.js version.

fn _mxRotl( x: u32, k: u32 ) -> u32 { return ( x << k ) | ( x >> ( 32u - k ) ); }
fn _mxFinal( a0: u32, b0: u32, c0: u32 ) -> u32 {
	var a = a0; var b = b0; var c = c0;
	c ^= b; c -= _mxRotl( b, 14u );
	a ^= c; a -= _mxRotl( c, 11u );
	b ^= a; b -= _mxRotl( a, 25u );
	c ^= b; c -= _mxRotl( b, 16u );
	a ^= c; a -= _mxRotl( c, 4u );
	b ^= a; b -= _mxRotl( a, 14u );
	c ^= b; c -= _mxRotl( b, 24u );
	return c;
}
fn mxHash2( x: i32, y: i32 ) -> u32 { let s = 0xdeadbeefu + ( 2u << 2u ) + 13u; return _mxFinal( s + u32( x ), s + u32( y ), s ); }
fn mxHash3( x: i32, y: i32, z: i32 ) -> u32 { let s = 0xdeadbeefu + ( 3u << 2u ) + 13u; return _mxFinal( s + u32( x ), s + u32( y ), s + u32( z ) ); }
fn _mxGrad2( hash: u32, x: f32, y: f32 ) -> f32 {
	let h = hash & 7u;
	let u = select( y, x, h < 4u );
	let v = 2.0 * select( x, y, h < 4u );
	return select( u, - u, ( h & 1u ) != 0u ) + select( v, - v, ( h & 2u ) != 0u );
}
fn _gradDot3( h: u32, p: vec3f ) -> f32 {
	let hh = h & 15u;
	let u = select( p.y, p.x, hh < 8u );
	let v = select( select( p.z, p.x, hh == 12u || hh == 14u ), p.y, hh < 4u );
	return select( u, - u, ( hh & 1u ) != 0u ) + select( v, - v, ( hh & 2u ) != 0u );
}
fn _fade3( t: vec3f ) -> vec3f { return t * t * t * ( t * ( t * 6.0 - 15.0 ) + 10.0 ); }
fn _h3( i: vec3i ) -> u32 { return mxHash3( i.x, i.y, i.z ); }

fn perlin3( p: vec3f ) -> f32 {
	let fl = floor( p );
	let i = vec3i( fl );
	let f = p - fl;
	let u = _fade3( f );
	let n000 = _gradDot3( _h3( i ), f );
	let n100 = _gradDot3( _h3( i + vec3i( 1, 0, 0 ) ), f - vec3f( 1.0, 0.0, 0.0 ) );
	let n010 = _gradDot3( _h3( i + vec3i( 0, 1, 0 ) ), f - vec3f( 0.0, 1.0, 0.0 ) );
	let n110 = _gradDot3( _h3( i + vec3i( 1, 1, 0 ) ), f - vec3f( 1.0, 1.0, 0.0 ) );
	let n001 = _gradDot3( _h3( i + vec3i( 0, 0, 1 ) ), f - vec3f( 0.0, 0.0, 1.0 ) );
	let n101 = _gradDot3( _h3( i + vec3i( 1, 0, 1 ) ), f - vec3f( 1.0, 0.0, 1.0 ) );
	let n011 = _gradDot3( _h3( i + vec3i( 0, 1, 1 ) ), f - vec3f( 0.0, 1.0, 1.0 ) );
	let n111 = _gradDot3( _h3( i + vec3i( 1, 1, 1 ) ), f - vec3f( 1.0, 1.0, 1.0 ) );
	let x0 = mix( mix( n000, n100, u.x ), mix( n010, n110, u.x ), u.y );
	let x1 = mix( mix( n001, n101, u.x ), mix( n011, n111, u.x ), u.y );
	return mix( x0, x1, u.z ) * 0.982;
}
fn perlin2( p: vec2f ) -> f32 {
	let fl = floor( p );
	let X = i32( fl.x ); let Y = i32( fl.y );
	let fx = p.x - fl.x; let fy = p.y - fl.y;
	let u = _fade3( vec3f( fx, fy, 0.0 ) );
	let v0 = _mxGrad2( mxHash2( X, Y ), fx, fy );
	let v1 = _mxGrad2( mxHash2( X + 1, Y ), fx - 1.0, fy );
	let v2 = _mxGrad2( mxHash2( X, Y + 1 ), fx, fy - 1.0 );
	let v3 = _mxGrad2( mxHash2( X + 1, Y + 1 ), fx - 1.0, fy - 1.0 );
	let s1 = 1.0 - u.x;
	return ( ( 1.0 - u.y ) * ( v0 * s1 + v1 * u.x ) + u.y * ( v2 * s1 + v3 * u.x ) ) * 0.6616;
}
fn mx_noise_float3( p: vec3f ) -> f32 { return perlin3( p ); }
fn mx_noise_float2( p: vec2f ) -> f32 { return perlin2( p ); }
// MaterialX vec3 noise: one hash per corner, its three low bytes pick the gradients
fn _mxGrad3v( h: u32, p: vec3f ) -> vec3f { return vec3f( _gradDot3( h & 0xffu, p ), _gradDot3( ( h >> 8u ) & 0xffu, p ), _gradDot3( ( h >> 16u ) & 0xffu, p ) ); }
fn mx_noise_vec3( p: vec3f ) -> vec3f {
	let fl = floor( p );
	let i = vec3i( fl );
	let f = p - fl;
	let u = _fade3( f );
	let n000 = _mxGrad3v( _h3( i ), f );
	let n100 = _mxGrad3v( _h3( i + vec3i( 1, 0, 0 ) ), f - vec3f( 1.0, 0.0, 0.0 ) );
	let n010 = _mxGrad3v( _h3( i + vec3i( 0, 1, 0 ) ), f - vec3f( 0.0, 1.0, 0.0 ) );
	let n110 = _mxGrad3v( _h3( i + vec3i( 1, 1, 0 ) ), f - vec3f( 1.0, 1.0, 0.0 ) );
	let n001 = _mxGrad3v( _h3( i + vec3i( 0, 0, 1 ) ), f - vec3f( 0.0, 0.0, 1.0 ) );
	let n101 = _mxGrad3v( _h3( i + vec3i( 1, 0, 1 ) ), f - vec3f( 1.0, 0.0, 1.0 ) );
	let n011 = _mxGrad3v( _h3( i + vec3i( 0, 1, 1 ) ), f - vec3f( 0.0, 1.0, 1.0 ) );
	let n111 = _mxGrad3v( _h3( i + vec3i( 1, 1, 1 ) ), f - vec3f( 1.0, 1.0, 1.0 ) );
	let x0 = mix( mix( n000, n100, u.x ), mix( n010, n110, u.x ), u.y );
	let x1 = mix( mix( n001, n101, u.x ), mix( n011, n111, u.x ), u.y );
	return mix( x0, x1, u.z ) * 0.982;
}
fn mx_fractal_noise_float3( p: vec3f, octaves: i32, lacunarity: f32, diminish: f32 ) -> f32 {
	var r = 0.0; var amp = 1.0; var q = p;
	for ( var i = 0; i < octaves; i++ ) { r += amp * perlin3( q ); amp *= diminish; q *= lacunarity; }
	return r;
}
fn mx_cell_noise_float3( p: vec3f ) -> f32 { let i = vec3i( floor( p ) ); return f32( mxHash3( i.x, i.y, i.z ) ) / f32( 0xffffffffu ); }
fn mx_cell_noise_float2( p: vec2f ) -> f32 { let i = vec2i( floor( p ) ); return f32( mxHash2( i.x, i.y ) ) / f32( 0xffffffffu ); }
// distances to the nearest two feature points (F1, F2), jitter 0..1
fn mx_worley_noise_vec2_3( p: vec3f, jitter: f32 ) -> vec2f {
	let i = vec3i( floor( p ) );
	let f = fract( p );
	var d1 = 1e9; var d2 = 1e9;
	for ( var z = -1; z <= 1; z++ ) { for ( var y = -1; y <= 1; y++ ) { for ( var x = -1; x <= 1; x++ ) {
		let c = vec3i( x, y, z );
		let h = ihash3( i + c );
		let o = vec3f( f32( c.x ), f32( c.y ), f32( c.z ) ) + ( vec3f( u32ToUnit( h.x ), u32ToUnit( h.y ), u32ToUnit( h.z ) ) - 0.5 ) * jitter + 0.5 - f;
		let d = dot( o, o );
		if ( d < d1 ) { d2 = d1; d1 = d; } else if ( d < d2 ) { d2 = d; }
	} } }
	return sqrt( vec2f( d1, d2 ) );
}
fn mx_worley_noise_vec2_2( p: vec2f, jitter: f32 ) -> vec2f {
	let i = vec2i( floor( p ) );
	let f = fract( p );
	var d1 = 1e9; var d2 = 1e9;
	for ( var y = -1; y <= 1; y++ ) { for ( var x = -1; x <= 1; x++ ) {
		let c = vec2i( x, y );
		let h = ihash3( vec3i( i + c, 0 ) );
		let o = vec2f( f32( c.x ), f32( c.y ) ) + ( vec2f( u32ToUnit( h.x ), u32ToUnit( h.y ) ) - 0.5 ) * jitter + 0.5 - f;
		let d = dot( o, o );
		if ( d < d1 ) { d2 = d1; d1 = d; } else if ( d < d2 ) { d2 = d; }
	} }
	return sqrt( vec2f( d1, d2 ) );
}

// ---- normals

// orthonormal basis around n (Frisvad / Duff et al.)
fn basis( n: vec3f ) -> mat3x3f {
	let s = select( -1.0, 1.0, n.z >= 0.0 );
	let a = -1.0 / ( s + n.z );
	let b = n.x * n.y * a;
	let t = vec3f( 1.0 + s * n.x * n.x * a, s * b, -s * n.x );
	let bt = vec3f( b, s + n.y * n.y * a, -n.y );
	return mat3x3f( t, bt, n );
}

// Perturb a world-space normal by a height field sampled with screen-space derivatives
// (Mikkelsen, "Bump Mapping Unparametrized Surfaces"; TSL perturbNormal equivalent).
// dhdx / dhdy: dpdx / dpdy of the height (in metres) at this pixel.
fn perturbNormalByHeight( P: vec3f, N: vec3f, dhdx: f32, dhdy: f32, strength: f32 ) -> vec3f {
	let dPdx = dpdx( P );
	let dPdy = dpdy( P );
	let r1 = cross( dPdy, N );
	let r2 = cross( N, dPdx );
	let det = dot( dPdx, r1 );
	let grad = sign( det ) * ( dhdx * r1 + dhdy * r2 ) * strength;
	return normalize( abs( det ) * N - grad );
}

// tangent-space normal map sample (xy in -1..1) applied with a derivative-based TBN
fn perturbNormalByMap( P: vec3f, N: vec3f, uv: vec2f, mapN: vec3f ) -> vec3f {
	let dp1 = dpdx( P ); let dp2 = dpdy( P );
	let duv1 = dpdx( uv ); let duv2 = dpdy( uv );
	let dp2perp = cross( dp2, N ); let dp1perp = cross( N, dp1 );
	let T = dp2perp * duv1.x + dp1perp * duv2.x;
	let B = dp2perp * duv1.y + dp1perp * duv2.y;
	let invmax = inverseSqrt( max( max( dot( T, T ), dot( B, B ) ), 1e-20 ) );
	return normalize( mat3x3f( T * invmax, B * invmax, N ) * mapN );
}

// ---- color

fn srgbToLinear( c: vec3f ) -> vec3f {
	return select( pow( ( c + 0.055 ) / 1.055, vec3f( 2.4 ) ), c / 12.92, c <= vec3f( 0.04045 ) );
}
fn linearToSrgb( c: vec3f ) -> vec3f {
	return select( 1.055 * pow( c, vec3f( 1.0 / 2.4 ) ) - 0.055, c * 12.92, c <= vec3f( 0.0031308 ) );
}
`;

/** lighting.js: the engine's `struct Surface` and `defaultSurface`. */
export const SHORE_SURFACE_WGSL = /* wgsl */ `
struct Surface {
	albedo: vec3f,
	alpha: f32,
	normal: vec3f,      // world space, shading normal
	roughness: f32,
	emissive: vec3f,
	metalness: f32,
	translucency: vec3f, // fraction of the direct light transmitted through thin foliage (x lightColor)
	ao: f32,
	sheenColor: vec3f,
	specularIntensity: f32,
	clearcoat: f32,
	clearcoatRoughness: f32,
	sheenRoughness: f32,
	ior: f32,
	clearcoatNormal: vec3f,
	envIntensity: f32,
};
fn defaultSurface( N: vec3f ) -> Surface {
	var s: Surface;
	s.albedo = vec3f( 1.0 ); s.alpha = 1.0; s.normal = N; s.roughness = 1.0; s.metalness = 0.0;
	s.emissive = vec3f( 0.0 ); s.translucency = vec3f( 0.0 ); s.ao = 1.0; s.sheenColor = vec3f( 0.0 );
	s.specularIntensity = 1.0; s.clearcoat = 0.0; s.clearcoatRoughness = 0.0; s.sheenRoughness = 1.0;
	s.ior = 1.5; s.clearcoatNormal = N; s.envIntensity = 1.0;
	return s;
}
`;

/** LODFade.js lodFadeModule (screen-door cross-fade; reads frame.frameIndex). */
export const SHORE_LOD_FADE_WGSL = /* wgsl */ `
// Bayer 4x4 threshold in (0, 1): bit-interleaved formula of
//   0  8  2 10 / 12  4 14  6 / 3 11  1  9 / 15  7 13  5
fn bayer4( pixel: vec2f ) -> f32 {
	let f = frame.frameIndex;
	// shift the pattern by a different offset every frame (all 16 over 16 frames)
	let p = vec2u( pixel ) + vec2u( f * 3u, ( f >> 2u ) * 1u );
	let x0 = p.x & 1u; let x1 = ( p.x >> 1u ) & 1u;
	let y0 = p.y & 1u; let y1 = ( p.y >> 1u ) & 1u;
	let v = ( ( x0 ^ y0 ) << 3u ) | ( y0 << 2u ) | ( ( x1 ^ y1 ) << 1u ) | y1;
	return ( f32( v ) + 0.5 ) / 16.0;
}

fn lodFadeVisible( pixel: vec2f, fade: f32, outgoing: bool ) -> bool {
	let t = bayer4( pixel );
	return select( ( t < fade ), ( t >= fade ), outgoing );
}
`;

/** Materials.js standard(): the SceneMaterial prelude before the material's own surface snippet. */
export const STANDARD_PRELUDE = '\ts.emissive = s.emissive * mat.emissiveIntensity;\n\ts.envIntensity = mat.envMapIntensity;\n';

// TerrainShading.js PALETTE / MEADOW (sRGB picked from photo references, stored linear)
const PALETTE: Record<string, string> = {
  rockDark: srgb(0.15, 0.145, 0.135),
  rockMid: srgb(0.3, 0.285, 0.265),
  rockLight: srgb(0.48, 0.455, 0.42),
  rockWarm: srgb(0.44, 0.37, 0.3),
  lichenPale: srgb(0.7, 0.7, 0.64),
  lichenOrange: srgb(0.78, 0.5, 0.2),
  blackZone: srgb(0.075, 0.075, 0.07),
  barnacle: srgb(0.78, 0.76, 0.7),
  algae: srgb(0.2, 0.27, 0.1),
  coralline: srgb(0.62, 0.44, 0.46),
  moss: srgb(0.19, 0.29, 0.08),
  mossDry: srgb(0.3, 0.34, 0.14),
};
const MEADOW: Record<string, string> = {
  lush: srgb(0.13, 0.2, 0.05),
  green: srgb(0.25, 0.32, 0.1),
  olive: srgb(0.36, 0.37, 0.14),
  yellow: srgb(0.5, 0.46, 0.2),
  straw: srgb(0.62, 0.54, 0.33),
  soil: srgb(0.17, 0.13, 0.08),
};
const consts = (prefix: string, o: Record<string, string>) =>
  Object.entries(o)
    .map(([k, v]) => `const ${prefix}${k}: vec3f = ${v};`)
    .join('\n');

/** TerrainShading.js SHADING_WGSL (terrainShadingModule; binds terrainDetailTex at module scope in the source). */
export const TERRAIN_SHADING_WGSL = /* wgsl */ `
${consts('PAL_', PALETTE)}
${consts('MEADOW_', MEADOW)}

struct RockGrad {
	dpdx: vec3f,
	dpdy: vec3f,
	fwY: f32,
	useGrad: bool,
};

// implicit-derivative RockGrad for a world position (call in uniform control flow)
fn terrainImplicitGrad( p: vec3f ) -> RockGrad {
	var g: RockGrad;
	g.dpdx = dpdx( p ); g.dpdy = dpdy( p ); g.fwY = 0.0; g.useGrad = false;
	return g;
}

// Mikkelsen surface-gradient bump: perturb world normal N by the scalar height field hd
// (screen-space derivatives, so any mix of projections / scales works). Robustness for terrain:
//  - the tilt is limited to ~55 degrees (at grazing angles |det| collapses and the unclamped
//    gradient would swing the normal into the tangent plane: 'chrome' patches on steep faces)
//  - the bump fades out where the screen-space frame is degenerate (the thin sliver triangles
//    of CDLOD geomorphing, which otherwise light up as bright lines along the grid) or where the
//    rendered facet disagrees with N (sub-texel crags)
fn terrainPerturbNormal( p: vec3f, N: vec3f, hd: f32, scale: f32 ) -> vec3f {
	let dpx = dpdx( p ); let dpy = dpdy( p );
	let dhdx = dpdx( hd ) * scale; let dhdy = dpdy( hd ) * scale;
	let r1 = cross( dpy, N );
	let r2 = cross( N, dpx );
	let det = dot( dpx, r1 );
	let ad = abs( det );
	let grad = ( r1 * dhdx + r2 * dhdy ) * sign( det );
	let area = length( cross( dpx, dpy ) );
	let fr = area / max( length( dpx ) * length( dpy ), 1e-20 ); // sin of the footprint angle
	let facet = ad / max( area, 1e-20 ); // cos between the facet and N
	let k = smoothstep( 0.12, 0.35, fr ) * smoothstep( 0.3, 0.6, facet );
	let g = grad * min( 1.0, ad * 1.4 / max( length( grad ), 1e-20 ) ) * k;
	return normalize( N * max( ad, 1e-20 ) - g );
}

// triplanar blend weights (sharp)
fn terrainTriWeights( N: vec3f ) -> vec3f {
	let a = abs( N );
	let w = a * a * ( a * a );
	return w / ( w.x + w.y + w.z );
}

fn terrainDetailGrad( uv: vec2f, gx: vec2f, gy: vec2f ) -> vec4f {
	return textureSampleGrad( terrainDetailTex, smpAniso4Repeat, uv, gx, gy );
}

// one channel-set of the detail texture, triplanar. The samples use explicit gradients (the
// derivatives of the world position in g), so they may run in non-uniform control flow.
fn terrainTriplanar( p: vec3f, w: vec3f, tile: f32, g: RockGrad ) -> vec4f {
	let s = 1.0 / tile;
	let x = terrainDetailGrad( p.zy * s, g.dpdx.zy * s, g.dpdy.zy * s );
	let y = terrainDetailGrad( p.xz * s + 0.37, g.dpdx.xz * s, g.dpdy.xz * s );
	let z = terrainDetailGrad( p.xy * s + 0.71, g.dpdx.xy * s, g.dpdy.xy * s );
	return x * w.x + y * w.y + z * w.z;
}

struct RockSurface {
	albedo: vec3f,
	rough: f32,
	hd: f32,     // bump height (m)
	moss: f32,   // 0..1
	wet: f32,
	height: f32,
};

// Weathered volcanic rock seen on the headlands, sea stacks and boulders.
//   p world position, N world normal (geometric / mcr), h height above sea level
//   mcr: 0..1 large scale variation, seed: per object variation (0..1)
// With g.useGrad every sample uses the gradients in g (branch safe).
fn terrainRockSurface( p: vec3f, N: vec3f, h: f32, mcr: f32, seed: f32, mossAmount: f32, g: RockGrad ) -> RockSurface {
	let w = terrainTriWeights( N );
	// big blocks (4 m cells), plates (0.9 m) and grain / chips
	let big = terrainTriplanar( p, w, 27.0, g );
	let mid = terrainTriplanar( p, w, 6.1, g );
	let fine = terrainTriplanar( p, w, 1.3, g );
	// pixel footprint (m): features smaller than a few pixels fade out instead of sparkling
	let px = select( length( abs( g.dpdx ) + abs( g.dpdy ) ), max( length( g.dpdx ), length( g.dpdy ) ), g.useGrad );
	let fineK = 1.0 - smoothstep( 0.006, 0.02, px );
	let midK = 1.0 - smoothstep( 0.03, 0.1, px );
	let hr = big.x * 0.45 + mid.x * 0.35 + ( ( fine.x - 0.5 ) * fineK + 0.5 ) * 0.2;

	// layered lava flows / bedding on steep faces: irregular bands (1D lookup of the fbm channel
	// along the height, warped), faded out once a band gets thinner than a few pixels
	let steep = 1.0 - smoothstep( 0.55, 0.85, N.y );
	let bandY = p.y + mid.w * 2.5 + mcr * 6.0;
	var fwY = g.fwY;
	if ( ! g.useGrad ) { fwY = fwidth( bandY ); }
	let bandUV = vec2f( bandY / 14.0, seed * 0.37 + 0.13 );
	var strata: f32;
	if ( g.useGrad ) {
		strata = terrainDetailGrad( bandUV, vec2f( fwY / 14.0, 0.0 ), vec2f( 0.0 ) ).w;
	} else {
		strata = textureSample( terrainDetailTex, smpAniso4Repeat, bandUV ).w;
	}
	let strataAA = 1.0 - smoothstep( 0.15, 0.6, fwY );
	let tone = hr * 0.9 + ( mcr - 0.5 ) * 0.7 + ( strata - 0.5 ) * 0.8 * steep * strataAA + ( seed - 0.5 ) * 0.3;
	var col = mix( PAL_rockDark, PAL_rockMid, smoothstep( 0.1, 0.5, tone ) );
	col = mix( col, PAL_rockLight, smoothstep( 0.5, 0.85, tone ) );
	// iron staining / warm weathering in patches
	col = mix( col, PAL_rockWarm, smoothstep( 0.62, 0.8, mid.w + mcr * 0.3 ) * 0.18 );
	// joints between the big blocks, fainter between plates
	col = col * ( smoothstep( 0.05, 0.25, big.x ) * 0.35 + 0.65 ) * ( smoothstep( 0.05, 0.25, mid.x ) * 0.15 + 0.85 );
	// rain streaks: dark stains running down steep faces, paler bands between (the fbm channel
	// stretched vertically on the two vertical projection planes)
	let sUVa = vec2f( p.z / 3.1, p.y / 41.0 );
	let sUVb = vec2f( p.x / 3.1 + 0.5, p.y / 41.0 + 0.3 );
	let sa = terrainDetailGrad( sUVa, vec2f( g.dpdx.z / 3.1, g.dpdx.y / 41.0 ), vec2f( g.dpdy.z / 3.1, g.dpdy.y / 41.0 ) );
	let sb = terrainDetailGrad( sUVb, vec2f( g.dpdx.x / 3.1, g.dpdx.y / 41.0 ), vec2f( g.dpdy.x / 3.1, g.dpdy.y / 41.0 ) );
	let sw4 = pow( abs( N.xz ), vec2f( 4.0 ) );
	let stainS = ( sa.w * sw4.x + sb.w * sw4.y ) / ( sw4.x + sw4.y + 1e-5 );
	let stain = smoothstep( 0.52, 0.72, stainS ) * steep;
	col = col * ( 1.0 - stain * 0.4 ) * ( smoothstep( 0.35, 0.2, stainS ) * steep * 0.12 + 1.0 );

	// lichens on the dry upper faces
	let dry = smoothstep( 2.6, 4.0, h );
	let lichen = smoothstep( 0.6, 0.78, mid.y ) * smoothstep( 0.2, 0.7, N.y ) * dry * smoothstep( 0.45, 0.65, mcr );
	col = mix( col, PAL_lichenPale, lichen * 0.45 );
	col = mix( col, PAL_lichenOrange, smoothstep( 0.8, 0.88, mid.y ) * dry * smoothstep( 0.5, 0.8, N.y ) * 0.3 );

	// moss / grass on ledges and tops, ferns hanging along the bedding planes of steep faces
	let ledge = smoothstep( 0.55, 0.7, strata ) * steep * strataAA * smoothstep( 0.4, 0.6, mid.w + ( mcr - 0.5 ) * 0.4 );
	let moss = max( smoothstep( 0.62, 0.9, N.y + ( big.x - 0.5 ) * 0.5 + ( mcr - 0.5 ) * 0.3 ), ledge * 0.8 )
		* smoothstep( 2.5, 5.0, h ) * mossAmount;
	col = mix( col, mix( PAL_moss, PAL_mossDry, mid.w ), moss * 0.9 );

	// shoreline zonation: black lichen band (splash zone), barnacles and algae in the intertidal
	let splash = smoothstep( 0.5, 1.0, h ) * smoothstep( 2.8, 1.8, h + mid.w * 1.2 ) * smoothstep( 0.35, 0.6, mcr + mid.w * 0.3 );
	col = mix( col, PAL_blackZone, splash * 0.55 );
	// sun-bleached, weathered upper faces
	col = mix( col, PAL_rockLight, smoothstep( 0.35, 0.95, N.y ) * smoothstep( 1.5, 3.0, h ) * 0.3 );
	let inter = smoothstep( -0.7, -0.2, h ) * smoothstep( 0.7, 0.2, h );
	let barn = smoothstep( 0.62, 0.72, fine.z ) * inter * fineK;
	col = mix( col, PAL_algae, inter * smoothstep( 0.4, 0.6, mid.y ) * 0.6 );
	col = mix( col, PAL_barnacle, barn * 0.8 );
	// below the water: algae films and pink coralline crusts
	let sub = smoothstep( -0.3, -1.2, h );
	col = mix( col, mix( PAL_algae, PAL_coralline, smoothstep( 0.45, 0.7, mid.w ) ), sub * 0.55 );

	// wet below the swash line (dark, glossy)
	let wet = smoothstep( 1.0, 0.25, h + mid.w * 0.3 );
	col = col * mix( 1.0, 0.55, wet );

	var r: RockSurface;
	r.albedo = col;
	r.rough = mix( mix( 0.88, 0.8, steep ), 0.45, wet ) + moss * 0.06;
	// relief (m): tilted blocks and plates with bevelled joints, then grain
	r.hd = big.x * 0.25 + mid.x * 0.07 * ( midK * 0.6 + 0.4 ) + fine.x * 0.012 * fineK * ( 1.0 - wet * 0.6 ) + barn * 0.005;
	r.moss = moss;
	r.wet = wet;
	r.height = hr;
	return r;
}

// saturation helper
fn terrainSaturation( c: vec3f, s: f32 ) -> vec3f {
	return mix( vec3f( luminance( c ) ), c, s );
}

struct MeadowTone {
	tone: vec3f,
	dry: f32,
	lush: f32,
};

//   mA, mB: detail fbm channel at the 173 m / 47 m scales (~0.5 +- 0.1): the samples at
//   rot2( xz, 0.7 ) / 173 and rot2( xz, 2.1 ) / 47 that the terrain takes anyway; slope: 1 - N.y;
//   south: N.z (the sun side); detail: optional finer fbm (~0.5 +- 0.1) that breaks up the patches
//   (hasDetail = false: none)
// Returns { tone, dry, lush }: mostly fresh green grass with olive, sun-bleached yellow and a few
// straw-dry patches (more on exposed slopes), darker lush grass in the damp patches (the hollows
// are darkened further by the AO).
fn terrainMeadowTone( mA: f32, mB: f32, slope: f32, south: f32, detail: f32, hasDetail: bool ) -> MeadowTone {
	var m = mA * 0.55 + mB * 0.45 + slope * 0.25 + south * 0.04;
	let dd = select( 0.0, detail - 0.5, hasDetail );
	m += dd * 0.28;
	let olive = smoothstep( 0.52, 0.6, m );
	let yellow = smoothstep( 0.6, 0.67, m );
	let straw = smoothstep( 0.66, 0.73, m + ( mB - 0.5 ) * 0.2 );
	let lush = smoothstep( 0.46, 0.37, mB * 0.7 + mA * 0.3 + slope * 0.2 + dd * 0.2 );
	var c = mix( MEADOW_green, MEADOW_olive, olive );
	c = mix( c, MEADOW_yellow, yellow * 0.8 );
	c = mix( c, MEADOW_straw, straw * 0.55 );
	c = mix( c, MEADOW_lush, lush * 0.75 );
	var o: MeadowTone;
	o.tone = c;
	o.dry = olive * 0.4 + yellow * 0.6;
	o.lush = lush;
	return o;
}
`;

/** TerrainGPU.js TERRAIN_WGSL: terrainUvOf (the pebble density mask covers the terrain domain). */
export const TERRAIN_UV_WGSL = /* wgsl */ `
fn terrainUvOf( xz: vec2f ) -> vec2f {
	return ( xz - terrainParams.origin ) / terrainParams.size;
}
`;

// ---------------------------------------------------------------- parameter threading

interface WgslFn {
  name: string;
  open: number;
  close: number;
  bodyStart: number;
  bodyEnd: number;
}

const stripComments = (s: string) => s.replace(/\/\/[^\n]*/g, '');

function matchClose(code: string, open: number, a: string, b: string): number {
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    const c = code[i];
    if (c === '/' && code[i + 1] === '/') {
      const e = code.indexOf('\n', i);
      i = e < 0 ? code.length : e;
      continue;
    }
    if (c === a) depth++;
    else if (c === b && --depth === 0) return i;
  }
  throw new Error('unbalanced ' + a + b + ' at ' + open);
}

function functionsOf(code: string): WgslFn[] {
  const out: WgslFn[] = [];
  for (const m of code.matchAll(/(^|\n)[ \t]*fn\s+(\w+)\s*\(/g)) {
    const open = m.index! + m[0].length - 1;
    const close = matchClose(code, open, '(', ')');
    const bodyStart = code.indexOf('{', close);
    out.push({ name: m[2]!, open, close, bodyStart, bodyEnd: matchClose(code, bodyStart, '{', '}') });
  }
  return out;
}

const inLineComment = (code: string, at: number) => {
  const lineStart = code.lastIndexOf('\n', at - 1) + 1;
  return code.slice(lineStart, at).includes('//');
};

/**
 * Turns one module-scope binding of the source WGSL (a texture or sampler the engine binds by name) into a
 * function parameter: every function that uses it, directly or through a call, gets `,<name>: <type>`
 * appended to its parameters, and every call of such a function gets `,<name>` appended to its arguments.
 * Nothing else changes (removing exactly those insertions gives the source text back). Functions that
 * already declare the name (the generated entry) are the roots that pass it on.
 */
export function threadWgslParams(code: string, name: string, type: string): string {
  const fns = functionsOf(code);
  const word = new RegExp(`\\b${name}\\b`);
  const declares = (f: WgslFn) => new RegExp(`\\b${name}\\s*:`).test(code.slice(f.open + 1, f.close));
  const need = new Set<string>();
  for (let changed = true; changed; ) {
    changed = false;
    for (const f of fns) {
      if (need.has(f.name) || declares(f)) continue;
      const body = stripComments(code.slice(f.bodyStart, f.bodyEnd + 1));
      if (word.test(body) || [...need].some((n) => new RegExp(`\\b${n}\\s*\\(`).test(body))) {
        need.add(f.name);
        changed = true;
      }
    }
  }
  if (!need.size) return code;
  const edits: [number, string][] = [];
  for (const f of fns)
    if (need.has(f.name)) edits.push([f.close, (code.slice(f.open + 1, f.close).trim() ? ',' : '') + `${name}: ${type}`]);
  for (const n of need)
    for (const m of code.matchAll(new RegExp(`\\b${n}\\s*\\(`, 'g'))) {
      if (/\bfn\s+$/.test(code.slice(Math.max(0, m.index! - 8), m.index!)) || inLineComment(code, m.index!)) continue;
      const open = m.index! + m[0].length - 1;
      const close = matchClose(code, open, '(', ')');
      edits.push([close, (code.slice(open + 1, close).trim() ? ',' : '') + name]);
    }
  edits.sort((a, b) => b[0] - a[0]);
  let out = code;
  for (const [at, text] of edits) out = out.slice(0, at) + text + out.slice(at);
  return out;
}

const thread = (code: string, params: readonly (readonly [string, string])[]) =>
  params.reduce((c, [name, type]) => threadWgslParams(c, name, type), code);

/** Prefix of the source helper functions in the generated WGSL (see namespaceWgslFunctions). */
export const SHORE_FN_PREFIX = 'twShore_';

/**
 * Prefixes every function declared in the WGSL except the first (the entry) with SHORE_FN_PREFIX, at its
 * declaration and at every call. three emits its own helpers into the same shader module (the shadow
 * filters declare interleavedGradientNoise and vogelDiskSample, as common.js does), so the source helper
 * names must not be global. Removing the prefix gives the text back.
 */
export function namespaceWgslFunctions(code: string): string {
  const names = functionsOf(code)
    .slice(1)
    .map((f) => f.name);
  if (!names.length) return code;
  return code.replace(new RegExp(`\\b(${names.join('|')})(\\s*\\()`, 'g'), `${SHORE_FN_PREFIX}$1$2`);
}

// ---------------------------------------------------------------- the source snippets (from the ports)

const OPAQUE_GPU = { module: { name: 'terrain' }, sunModulationModule: { name: 'terrainSunModulation' } };
const record = (prefix: string): ReefBatchLike => ({
  prefix,
  module: { name: 'batch-' + prefix },
  // ReefBatch.js record( index ): the four record reads of the vertex snippet
  record: (index: string) => [0, 1, 2, 3].map((k) => `${prefix}Record( ${index}, ${k}u )`),
});
/** Reef.js names the batches 'Reef.hard' / 'Reef.soft' (ReefBatch prefixes reefHard / reefSoft). */
export const REEF_BATCH_PREFIX = { hard: 'reefHard', soft: 'reefSoft' } as const;

export interface ShoreMaterialSnippet {
  name: string;
  roughness: number;
  metalness: number;
  /** true for standard() materials (Materials.js prelude before the surface). */
  standard: boolean;
  surface: string;
  vertex: string;
  shadow?: string;
  varyings: Record<string, string>;
  side?: string;
  alphaTest?: number;
}

export type ShoreSurfaceKind =
  | 'rocks'
  | 'nature'
  | 'pebbles'
  | 'scan'
  | 'reefHard'
  | 'reefSoft'
  | 'reefHardFade'
  | 'reefSoftFade';
export const SHORE_SURFACE_KINDS: readonly ShoreSurfaceKind[] = [
  'rocks',
  'nature',
  'pebbles',
  'scan',
  'reefHard',
  'reefSoft',
  'reefHardFade',
  'reefSoftFade',
];

const fromParams = (p: ShoreMaterialParams, standard: boolean): ShoreMaterialSnippet => ({
  name: p.name,
  roughness: p.roughness as number,
  metalness: (p.metalness as number) ?? 0,
  standard,
  surface: (p.surface as string) ?? '',
  vertex: (p.vertex as string) ?? '',
  ...(p.shadow ? { shadow: p.shadow as string } : {}),
  varyings: (p.varyings as Record<string, string>) ?? {},
});

/** The source material records of every shore material (as the ports record them). */
export function shoreMaterialSnippets(): Record<ShoreSurfaceKind, ShoreMaterialSnippet> {
  const rocks = rocksMaterialSpec(OPAQUE_GPU, true);
  const nature = createNatureMaterial(OPAQUE_GPU, { sunShadow: true }, RECORDING_ENGINE).params;
  const pebbles = (PebbleField.prototype as N)._createMaterial.call({ gpu: OPAQUE_GPU, engine: RECORDING_ENGINE, maskTex: null })
    .params as ShoreMaterialParams;
  const scan = (ScannedDebris.prototype as N)._createMaterial.call({
    gpu: OPAQUE_GPU,
    engine: RECORDING_ENGINE,
    textures: { albedo: null, normal: null, arm: null },
  }).params as ShoreMaterialParams;
  const reef = (fade: boolean) => {
    const m = createReefMaterials({
      hard: record(REEF_BATCH_PREFIX.hard),
      soft: record(REEF_BATCH_PREFIX.soft),
      getOcean: null,
      noise: null,
      view: createReefView(),
      fade,
    });
    const of = (r: unknown): ShoreMaterialSnippet => {
      const o = (r as RecordingMaterial).options;
      return {
        name: o.name!,
        roughness: o.roughness,
        metalness: o.metalness,
        standard: false,
        surface: o.surface!,
        vertex: o.vertex!,
        varyings: o.varyings,
        ...(o.side ? { side: o.side } : {}),
        ...(o.alphaTest ? { alphaTest: o.alphaTest } : {}),
      };
    };
    return { hard: of(m.hard), soft: of(m.soft) };
  };
  const plain = reef(false),
    fade = reef(true);
  return {
    rocks: {
      name: rocks.params.name,
      roughness: rocks.params.roughness,
      metalness: rocks.params.metalness,
      standard: true,
      surface: rocks.surface!,
      vertex: rocks.vertex!,
      shadow: rocks.shadow!,
      varyings: rocks.varyings!,
    },
    nature: fromParams(nature, true),
    pebbles: fromParams(pebbles, true),
    scan: fromParams(scan, true),
    reefHard: plain.hard,
    reefSoft: plain.soft,
    reefHardFade: fade.hard,
    reefSoftFade: fade.soft,
  };
}

// ---------------------------------------------------------------- generated entries

const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
/** Name of the generated surface entry of a kind (the first function of its WGSL). */
export const surfaceEntryName = (kind: ShoreSurfaceKind) => 'twShore' + cap(kind) + 'Surface';

/** Inputs every surface entry takes first, in order (then the kind's varyings, extras and textures). */
export const SHORE_SURFACE_INPUTS = [
  'twP',
  'twN',
  'twUv',
  'twPixel',
  'twTime',
  'twFrameIndex',
  'twCameraPos',
  'twSunDir',
  'twView',
] as const;
const SURFACE_PARAMS: readonly (readonly [string, string])[] = [
  ['twP', 'vec3f'],
  ['twN', 'vec3f'],
  ['twUv', 'vec2f'],
  ['twPixel', 'vec2f'],
  ['twTime', 'f32'],
  ['twFrameIndex', 'u32'],
  ['twCameraPos', 'vec3f'],
  ['twSunDir', 'vec3f'],
  ['twView', 'mat4x4f'],
];

const DETAIL = [
  ['terrainDetailTex', 'texture_2d<f32>'],
  ['smpAniso4Repeat', 'sampler'],
] as const;
const REEF_NOISE = [
  ['reefNoise', 'texture_3d<f32>'],
  ['smpLinearRepeat', 'sampler'],
] as const;
const SCAN_TEXTURES = [
  ['scanAlbedo', 'texture_2d<f32>'],
  ['scanNormal', 'texture_2d<f32>'],
  ['scanArm', 'texture_2d<f32>'],
  ['smpAnisoClamp', 'sampler'],
] as const;
/** Texture / sampler parameters of each kind's surface entry (the source binds them at module scope). */
export const SHORE_SURFACE_TEXTURES: Record<ShoreSurfaceKind, readonly (readonly [string, string])[]> = {
  rocks: DETAIL,
  nature: DETAIL,
  pebbles: DETAIL,
  scan: SCAN_TEXTURES,
  reefHard: REEF_NOISE,
  reefSoft: REEF_NOISE,
  reefHardFade: REEF_NOISE,
  reefSoftFade: REEF_NOISE,
};
/** Injected terrain values of each kind's surface entry (terrainHeightAt( p.xz ), terrainSplat( p.xz )). */
export const SHORE_SURFACE_TERRAIN: Record<ShoreSurfaceKind, readonly ('twGround' | 'twSplat')[]> = {
  rocks: ['twGround', 'twSplat'],
  nature: ['twGround'],
  pebbles: ['twGround'],
  scan: ['twGround'],
  reefHard: [],
  reefSoft: [],
  reefHardFade: [],
  reefSoftFade: [],
};

const varyingParam = (v: string) => 'tw' + cap(v);

const TERRAIN_HEIGHT_STUB = `
// terrainHeightAt of the source TerrainGPU module: the injected terrain provider, evaluated by the
// caller at the one xz the snippet asks for (the fragment's p.xz, or the pebble slot's xz)
var<private> twTerrainHeight: f32;
fn terrainHeightAt( xz: vec2f ) -> f32 { return twTerrainHeight; }
`;
const TERRAIN_SPLAT_STUB = `
// terrainSplat of the source TerrainGPU module (sand, paths, gullies / seagrass, rubble), injected like the height
var<private> twTerrainSplat: vec4f;
fn terrainSplat( xz: vec2f ) -> vec4f { return twTerrainSplat; }
`;
const FRAGMENT_STRUCTS = `
struct ShoreFrame { time: f32, frameIndex: u32, cameraPos: vec3f, sunDir: vec3f, view: mat4x4f };
var<private> frame: ShoreFrame;
struct ShoreMat { emissiveIntensity: f32, envMapIntensity: f32 };
var<private> mat: ShoreMat;
`;

const f32 = (x: number) => {
  const s = String(x);
  return /[.e]/.test(s) ? s : s + '.0';
};

function surfaceModules(kind: ShoreSurfaceKind): string {
  if (kind.startsWith('reef')) return REEF_COMMON_WGSL + FRAG_WGSL + SHORE_LOD_FADE_WGSL + SHORE_COMMON_WGSL + SHORE_SURFACE_WGSL;
  const terrain = SHORE_SURFACE_TERRAIN[kind];
  const stubs = (terrain.includes('twGround') ? TERRAIN_HEIGHT_STUB : '') + (terrain.includes('twSplat') ? TERRAIN_SPLAT_STUB : '');
  const shading = kind === 'scan' ? '' : TERRAIN_SHADING_WGSL;
  const stone = kind === 'nature' || kind === 'pebbles' ? stoneSurfaceModule.code! : '';
  const peb = kind === 'pebbles' ? '\n' + pebbleModule.code! + '\n' : '';
  return stubs + shading + stone + peb + SHORE_LOD_FADE_WGSL + SHORE_COMMON_WGSL + SHORE_SURFACE_WGSL;
}

function surfaceEntry(kind: ShoreSurfaceKind, m: ShoreMaterialSnippet): string {
  const vs = Object.entries(m.varyings);
  const terrain = SHORE_SURFACE_TERRAIN[kind];
  const params = [
    ...SURFACE_PARAMS,
    ...vs.map(([k, type]) => [varyingParam(k), type] as const),
    ...terrain.map((k) => [k, k === 'twGround' ? 'f32' : 'vec4f'] as const),
    ...SHORE_SURFACE_TEXTURES[kind],
  ];
  return `
fn ${surfaceEntryName(kind)}( ${params.map(([k, type]) => `${k}: ${type}`).join(', ')} ) -> mat4x4f {
	frame.time = twTime;
	frame.frameIndex = twFrameIndex;
	frame.cameraPos = twCameraPos;
	frame.sunDir = twSunDir;
	frame.view = twView;
	mat.emissiveIntensity = 1.0;
	mat.envMapIntensity = 1.0;
${terrain.includes('twGround') ? '\ttwTerrainHeight = twGround;\n' : ''}${terrain.includes('twSplat') ? '\ttwTerrainSplat = twSplat;\n' : ''}	var in: ShoreIn;
${vs.map(([k]) => `\tin.vs.${k} = ${varyingParam(k)};\n`).join('')}	in.P = twP;
	in.N = twN;
	in.V = normalize( frame.cameraPos - twP );
	in.uv = twUv;
	in.color = vec4f( 1.0 );
	in.front = true;
	in.pixel = twPixel;
	var s = defaultSurface( in.N );
	s.albedo = vec3f( 1.0 ) * in.color.rgb;
	s.alpha = 1.0 * in.color.a;
	s.roughness = ${f32(m.roughness)};
	s.metalness = ${f32(m.metalness)};
	s.emissive = vec3f( 0.0 );
	{
${m.standard ? STANDARD_PRELUDE : ''}${m.surface}
	}
	return mat4x4f( vec4f( s.albedo, s.alpha ), vec4f( s.normal, s.roughness ), vec4f( s.translucency, s.metalness ), vec4f( s.ao, s.specularIntensity, length( s.emissive ), s.envIntensity ) );
}
struct ShoreVs { ${vs.map(([k, type]) => `${k}: ${type}`).join(', ')} };
struct ShoreIn { vs: ShoreVs, P: vec3f, N: vec3f, V: vec3f, uv: vec2f, color: vec4f, front: bool, pixel: vec2f };
`;
}

// ---- vertex entries

/** Inputs of the pebble vertex entry, in order. */
export const PEBBLE_VERTEX_INPUTS = [
  'twPosition',
  'twNormal',
  'twCell',
  'twSlot',
  'twCameraPos',
  'twGround',
  'twTerrainOrigin',
  'twTerrainSize',
  'debrisPebbleMask',
  'smpLinearClamp',
] as const;
function pebbleVertexEntry(m: ShoreMaterialSnippet): string {
  return `
fn twShorePebblesVertex( twPosition: vec3f, twNormal: vec3f, twCell: vec4f, twSlot: vec4f, twCameraPos: vec3f, twGround: f32, twTerrainOrigin: f32, twTerrainSize: f32, debrisPebbleMask: texture_2d<f32>, smpLinearClamp: sampler ) -> mat4x4f {
	frame.cameraPos = twCameraPos;
	terrainParams.origin = twTerrainOrigin;
	terrainParams.size = twTerrainSize;
	twTerrainHeight = twGround;
	var v: ShoreVertexData;
	v.position = twPosition;
	v.normal = twNormal;
	v.iCell = twCell;
	v.aSlot = twSlot;
	var o: ShoreVsOut;
	{
${m.vertex}
	}
	return mat4x4f( vec4f( v.position, 1.0 ), vec4f( v.normal, 0.0 ), o.vPebble, vec4f( 0.0 ) );
}
struct ShoreVertexData { position: vec3f, normal: vec3f, iCell: vec4f, aSlot: vec4f };
struct ShoreVsOut { vPebble: vec4f };
struct ShoreFrame { cameraPos: vec3f };
var<private> frame: ShoreFrame;
struct TerrainParams { origin: f32, size: f32 };
var<private> terrainParams: TerrainParams;
${TERRAIN_UV_WGSL}${TERRAIN_HEIGHT_STUB}
${pebbleModule.code}
`;
}

/** Inputs of the scanned-debris vertex entry, in order. */
export const SCAN_VERTEX_INPUTS = ['twPosition', 'twAsset', 'twIData'] as const;
function scanVertexEntry(m: ShoreMaterialSnippet): string {
  return `
fn twShoreScanVertex( twPosition: vec3f, twAsset: f32, twIData: vec4f ) -> vec3f {
	var v: ShoreVertexData;
	v.position = twPosition;
	v.aAsset = twAsset;
	v.iData = twIData;
	var o: ShoreVsOut;
	{
${m.vertex}
	}
	return v.position;
}
struct ShoreVertexData { position: vec3f, aAsset: f32, iData: vec4f };
struct ShoreVsOut { vIData: vec4f };
`;
}

/** Inputs of the reef vertex entries, in order. */
export const REEF_VERTEX_INPUTS = [
  'twPosition',
  'twNormal',
  'twAData',
  'twAKind',
  'twInstance',
  'twRecord0',
  'twRecord1',
  'twRecord2',
  'twRecord3',
  'twFadeInfo',
  'twTime',
  'twDt',
  'twSeaLevel',
  'twViewPosition',
  'twViewRange',
] as const;
export type ReefVertexKind = 'reefHard' | 'reefSoft' | 'reefHardFade' | 'reefSoftFade';
export const REEF_VERTEX_KINDS: readonly ReefVertexKind[] = ['reefHard', 'reefSoft', 'reefHardFade', 'reefSoftFade'];
export const vertexEntryName = (kind: ReefVertexKind | 'pebbles' | 'scan') => 'twShore' + cap(kind) + 'Vertex';

function reefVertexEntry(kind: ReefVertexKind, m: ShoreMaterialSnippet): string {
  const P = kind.startsWith('reefHard') ? REEF_BATCH_PREFIX.hard : REEF_BATCH_PREFIX.soft;
  const surge = makeSurge(null).module.code!;
  return `
fn ${vertexEntryName(kind)}( twPosition: vec3f, twNormal: vec3f, twAData: vec4f, twAKind: f32, twInstance: u32, twRecord0: vec4f, twRecord1: vec4f, twRecord2: vec4f, twRecord3: vec4f, twFadeInfo: vec2f, twTime: f32, twDt: f32, twSeaLevel: f32, twViewPosition: vec3f, twViewRange: f32 ) -> mat4x4f {
	frame.time = twTime;
	frame.dt = twDt;
	frame.seaLevel = twSeaLevel;
	reefView.position = twViewPosition;
	reefView.range = twViewRange;
	twRecord = array<vec4f, 4>( twRecord0, twRecord1, twRecord2, twRecord3 );
	twFade = twFadeInfo;
	var v: ShoreVertexData;
	v.position = twPosition;
	v.normal = twNormal;
	v.aData = twAData;
	v.aKind = twAKind;
	v.instance = twInstance;
	v.useWorld = false;
	v.worldPos = vec3f( 0.0 );
	v.worldNormal = vec3f( 0.0 );
	v.prevWorldPos = vec3f( 1e30 );
	var o: ShoreVsOut;
	{
${m.vertex}
	}
	return mat4x4f( vec4f( v.worldPos, o.vReefInfo.x ), vec4f( v.worldNormal, o.vReefInfo.y ), vec4f( o.vReefLocal, o.vReefInfo.z ), o.vReefData );
}
struct ShoreVertexData { position: vec3f, normal: vec3f, aData: vec4f, aKind: f32, instance: u32, useWorld: bool, worldPos: vec3f, worldNormal: vec3f, prevWorldPos: vec3f };
struct ShoreVsOut { ${Object.entries(m.varyings)
    .map(([k, type]) => `${k}: ${type}`)
    .join(', ')} };
struct ShoreFrame { time: f32, dt: f32, seaLevel: f32 };
var<private> frame: ShoreFrame;
struct ReefView { position: vec3f, range: f32 };
var<private> reefView: ReefView;
// the ReefBatch module (${P}RecordIndex / ${P}Record / ${P}FadeEntry): the record and fade entry of this
// instance come bound (twRecord0..3, twFadeInfo) instead of through the indirect draw list
var<private> twRecord: array<vec4f, 4>;
var<private> twFade: vec2f;
fn ${P}RecordIndex( kind: u32, instance: u32 ) -> u32 { return 0u; }
fn ${P}Record( index: u32, k: u32 ) -> vec4f { return twRecord[ k ]; }
struct ${P}FadeInfo { index: u32, fade: f32, outgoing: f32 };
fn ${P}FadeEntry( kind: u32, instance: u32 ) -> ${P}FadeInfo { return ${P}FadeInfo( 0u, twFade.x, twFade.y ); }
${surge}${REEF_COMMON_WGSL}${SHORE_COMMON_WGSL}`;
}

export interface ShoreShadingWgsl {
  /** One wgslFn source per surface kind; its first function is the entry. */
  surfaces: Record<ShoreSurfaceKind, string>;
  /** Vertex entries: pebble placement, scanned-debris asset selection, reef records / warp / sway. */
  vertices: Record<ReefVertexKind | 'pebbles' | 'scan', string>;
}

/** The generated WGSL of every shore material (entry first, then structs, stubs and the source modules). */
export function shoreShadingWgsl(snippets = shoreMaterialSnippets()): ShoreShadingWgsl {
  const surfaces = {} as Record<ShoreSurfaceKind, string>;
  // the module-scope textures become parameters (the entry declares them and passes them on)
  for (const kind of SHORE_SURFACE_KINDS)
    surfaces[kind] = namespaceWgslFunctions(
      thread(surfaceEntry(kind, snippets[kind]) + FRAGMENT_STRUCTS + surfaceModules(kind), SHORE_SURFACE_TEXTURES[kind]),
    );
  const vertices = {
    pebbles: namespaceWgslFunctions(pebbleVertexEntry(snippets.pebbles)),
    scan: namespaceWgslFunctions(scanVertexEntry(snippets.scan)),
  } as Record<ReefVertexKind | 'pebbles' | 'scan', string>;
  for (const kind of REEF_VERTEX_KINDS) vertices[kind] = namespaceWgslFunctions(reefVertexEntry(kind, snippets[kind]));
  return { surfaces, vertices };
}

// ---------------------------------------------------------------- slots

/** The engine Surface fields of one packed surface (the generated entries' return value), as nodes. */
export interface ShoreSurfaceSlots {
  albedo: N;
  alpha: N;
  normalWorld: N;
  roughness: N;
  translucency: N;
  metalness: N;
  ao: N;
  specularIntensity: N;
  /** length( s.emissive ): no shore snippet writes s.emissive (it stays black). */
  emissiveLength: N;
  envIntensity: N;
}

/** Maps the packed mat4x4f of a surface entry onto named Surface slots (the entries' return layout). */
export function shoreSurfaceSlots(packed: N): ShoreSurfaceSlots {
  const c0 = packed.element(0),
    c1 = packed.element(1),
    c2 = packed.element(2),
    c3 = packed.element(3);
  return {
    albedo: c0.xyz,
    alpha: c0.w,
    normalWorld: c1.xyz,
    roughness: c1.w,
    translucency: c2.xyz,
    metalness: c2.w,
    ao: c3.x,
    specularIntensity: c3.y,
    emissiveLength: c3.z,
    envIntensity: c3.w,
  };
}

/** The reef vertex outputs (the reef vertex entries' return layout) plus the record-copied varyings. */
export interface ReefVertexSlots {
  worldPos: N;
  worldNormal: N;
  local: N;
  data: N;
  info: N;
}
export function reefVertexSlots(packed: N): ReefVertexSlots {
  const c0 = packed.element(0),
    c1 = packed.element(1),
    c2 = packed.element(2);
  return {
    worldPos: c0.xyz,
    worldNormal: c1.xyz,
    local: c2.xyz,
    data: packed.element(3),
    info: (TSL as N).vec3(c0.w, c1.w, c2.w),
  };
}

/** The pebble vertex outputs. */
export interface PebbleVertexSlots {
  position: N;
  normal: N;
  pebble: N;
}
export function pebbleVertexSlots(packed: N): PebbleVertexSlots {
  return { position: packed.element(0).xyz, normal: packed.element(1).xyz, pebble: packed.element(2) };
}

export type ShoreShadedMaterial = MeshStandardNodeMaterial | MeshPhysicalNodeMaterial;

/**
 * Puts surface slots on a node material: albedo, roughness, metalness, ao, the (world) shading normal,
 * alpha for alpha-tested kinds, specularIntensity on physical materials, and the thin-tissue
 * translucency as emissive under the sun colour.
 */
export function applyShoreSlots(
  material: ShoreShadedMaterial,
  slots: ShoreSurfaceSlots,
  { alphaTested = false, sunColor }: { alphaTested?: boolean; sunColor: N },
): void {
  const t = TSL as N;
  material.colorNode = slots.albedo;
  if (alphaTested) material.opacityNode = slots.alpha;
  material.normalNode = t.cameraViewMatrix.mul(t.vec4(slots.normalWorld, 0)).xyz;
  material.roughnessNode = slots.roughness;
  material.metalnessNode = slots.metalness;
  material.aoNode = slots.ao;
  if (material instanceof MeshPhysicalNodeMaterial) material.specularIntensityNode = slots.specularIntensity;
  material.emissiveNode = slots.translucency.mul(sunColor);
  material.userData.shoreSlots = slots;
}

// ---------------------------------------------------------------- textures

/** ReefNoise.js: the 64^3 RGBA8 noise volume as a three.js 3D texture (sampler linearRepeat). */
export function createReefNoiseTexture(size = 64): Data3DTexture {
  const tex = new Data3DTexture(createNoiseVolumeData(size), size, size, size);
  tex.format = RGBAFormat;
  tex.type = UnsignedByteType;
  tex.colorSpace = NoColorSpace;
  tex.minFilter = tex.magFilter = LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = RepeatWrapping;
  tex.generateMipmaps = false;
  tex.unpackAlignment = 1;
  tex.name = 'reefNoise';
  tex.needsUpdate = true;
  return tex;
}

/**
 * Instance records of a ReefBatch (`batch.data`: 16 floats per instance, Reef.js buildBatches) as the four
 * instanced vec4 attributes the reef materials read by default (iReefRecord0..3).
 */
export function reefRecordAttributes(data: Float32Array): Record<string, InterleavedBufferAttribute> {
  const buffer = new InstancedInterleavedBuffer(data, 16);
  const out: Record<string, InterleavedBufferAttribute> = {};
  for (let k = 0; k < 4; k++) out['iReefRecord' + k] = new InterleavedBufferAttribute(buffer, 4, k * 4);
  return out;
}

// ---------------------------------------------------------------- materials

/** Frame and world inputs (the source engine's frame / terrain / view uniforms). Missing ones are owned. */
export interface ShoreShadingBindings {
  /** Simulation time in seconds (frame.time): reef sway and the sea-fan dither. */
  time?: N;
  /** Frame time step (frame.dt; the source's previous-frame sway for motion vectors). */
  dt?: N;
  /** frame.seaLevel (m): reef water depth for the surge. */
  seaLevel?: N;
  /** frame.frameIndex (u32): LOD dither phase. Default 0 (static, no TAA in Genvr). */
  frameIndex?: N;
  /** World-space direction toward the sun (frame.sunDir): reef translucency. */
  sunDirection?: N;
  /** Sun colour times intensity: multiplies the translucency (as emissive). */
  sunColor?: N;
  /** Main camera position (frame.cameraPos; also the reef view position). Default: three's cameraPosition. */
  cameraPosition?: N;
  /** World-to-view matrix (frame.view; reef pattern footprint). Default: three's cameraViewMatrix. */
  view?: N;
  /** Ground height (m) at a world xz node (the source's terrainHeightAt). Default: -90 (no ground). */
  terrainHeight?: (xz: N) => N;
  /** Ground splat (sand, paths, gullies / seagrass, rubble) at a world xz node. Default: vec4( 0 ). */
  terrainSplat?: (xz: N) => N;
  /** The shared terrain detail texture (tidewater-ground createDetailTexture). Default: a new one. */
  detailTexture?: Texture;
  /** The reef noise volume. Default: createReefNoiseTexture(). */
  reefNoise?: Data3DTexture;
  /** The debris pebble mask (RGBA8 over the terrain domain) and that domain (origin, size in m). */
  pebbleMask?: Texture;
  terrainOrigin?: N;
  terrainSize?: N;
  /** Scanned debris atlases (albedo sRGB, normal, AO-rough-metal); without them no scan material is built. */
  scanTextures?: { albedo: Texture; normal: Texture; arm: Texture };
  /** Reef draw distance limit (ReefView.range, m). Default 45. */
  reefRange?: N;
  /** Reef instance record k (0..3) node. Default: instanced attribute iReefRecord<k> (reefRecordAttributes). */
  reefRecord?: (k: number) => N;
  /** Reef LOD fade entry ( fade, outgoing ). Default: instanced attribute iReefFade. */
  reefFade?: N;
  /** Reef aKind (f32) of the vertex. Default 0 (records come bound, the kind selects nothing). */
  reefKind?: N;
}

/** Fragment inputs of a surface entry, by name (see SHORE_SURFACE_INPUTS and the kind's varyings). */
export type ShoreSurfaceInputs = Record<string, N>;

/** Calls the surface entry of a kind with named inputs (textures included). */
export function shoreSurfaceCall(wgsl: ShoreShadingWgsl, kind: ShoreSurfaceKind, inputs: ShoreSurfaceInputs): N {
  return (TSL as N).wgslFn(wgsl.surfaces[kind])(inputs);
}

/**
 * The source shore materials as native three.js WebGPU node materials: rocks, the natural debris (one
 * draw), the pebble field, scanned debris (when atlases are given) and the reef (hard / soft, each with
 * its LOD cross-fade channel).
 */
export class ShoreShading {
  readonly snippets: Record<ShoreSurfaceKind, ShoreMaterialSnippet>;
  readonly wgsl: ShoreShadingWgsl;
  readonly time: N;
  readonly dt: N;
  readonly seaLevel: N;
  readonly frameIndex: N;
  readonly sunDirection: N;
  readonly sunColor: N;
  readonly cameraPosition: N;
  readonly view: N;
  readonly reefRange: N;
  readonly terrainOrigin: N;
  readonly terrainSize: N;
  readonly detailTexture: Texture;
  readonly reefNoise: Data3DTexture;
  readonly rocks: MeshStandardNodeMaterial;
  readonly nature: MeshStandardNodeMaterial;
  readonly pebbles: MeshStandardNodeMaterial | null;
  readonly scan: MeshStandardNodeMaterial | null;
  readonly reefHard: MeshPhysicalNodeMaterial;
  readonly reefSoft: MeshPhysicalNodeMaterial;
  readonly reefHardFade: MeshPhysicalNodeMaterial;
  readonly reefSoftFade: MeshPhysicalNodeMaterial;
  #ownTime: boolean;
  #ownTextures: Texture[] = [];

  constructor(readonly bindings: ShoreShadingBindings = {}) {
    const t = TSL as N;
    const snippets = (this.snippets = shoreMaterialSnippets());
    const wgsl = (this.wgsl = shoreShadingWgsl(snippets));
    this.#ownTime = !bindings.time;
    this.time = bindings.time ?? t.uniform(0);
    this.dt = bindings.dt ?? t.uniform(1 / 60);
    this.seaLevel = bindings.seaLevel ?? t.uniform(0);
    this.frameIndex = bindings.frameIndex ?? t.uniform(0, 'uint');
    // source engine frame defaults (engine/render/Frame.js)
    this.sunDirection = bindings.sunDirection ?? t.uniform(new Vector3(0.3, 0.6, -0.7).normalize());
    this.sunColor = bindings.sunColor ?? t.uniform(new Vector3(1, 1, 1));
    this.cameraPosition = bindings.cameraPosition ?? t.cameraPosition;
    this.view = bindings.view ?? t.cameraViewMatrix;
    this.reefRange = bindings.reefRange ?? t.uniform(45);
    this.terrainOrigin = bindings.terrainOrigin ?? t.uniform(0);
    this.terrainSize = bindings.terrainSize ?? t.uniform(1);
    if (bindings.detailTexture) this.detailTexture = bindings.detailTexture;
    else this.#ownTextures.push((this.detailTexture = createDetailTexture()));
    if (bindings.reefNoise) this.reefNoise = bindings.reefNoise;
    else this.#ownTextures.push((this.reefNoise = createReefNoiseTexture()));
    const height = bindings.terrainHeight ?? (() => t.float(-90));
    const splat = bindings.terrainSplat ?? (() => t.vec4(0));
    const detail = t.texture(this.detailTexture);
    const noise = t.texture3D(this.reefNoise);
    const common = (P: N, normal: N, uv: N): ShoreSurfaceInputs => ({
      twP: P,
      twN: normal,
      twUv: uv,
      twPixel: t.screenCoordinate.xy,
      twTime: this.time,
      twFrameIndex: this.frameIndex,
      twCameraPos: this.cameraPosition,
      twSunDir: this.sunDirection,
      twView: this.view,
    });
    const detailInputs = { terrainDetailTex: detail, smpAniso4Repeat: t.sampler(detail) };
    const standard = (kind: ShoreSurfaceKind, inputs: ShoreSurfaceInputs) => {
      const m = snippets[kind];
      const mat = new MeshStandardNodeMaterial({ roughness: m.roughness, metalness: m.metalness });
      mat.name = m.name;
      const shade = shoreSurfaceCall(wgsl, kind, inputs);
      applyShoreSlots(mat, shoreSurfaceSlots(shade), { sunColor: this.sunColor });
      return { mat, shade };
    };

    // ---- rocks (instanced near / far LODs; iLod = ( fade, outgoing ), ao per vertex)
    {
      const lod = t.attribute('iLod', 'vec2');
      const { mat, shade } = standard('rocks', {
        ...common(t.positionWorld, t.normalWorldGeometry, t.vec2(0)),
        twVLod: lod,
        twVCav: t.attribute('ao', 'float'),
        twGround: height(t.positionWorld.xz),
        twSplat: splat(t.positionWorld.xz),
        ...detailInputs,
      });
      void shade;
      // Rocks.js shadow snippet: the LOD dither in the shadow pass too
      mat.maskShadowNode = lodFadeNode(lod.x, lod.y.greaterThan(0.5), this.frameIndex);
      this.rocks = mat;
    }

    // ---- natural debris (one draw: stones, coconuts, weed, shells, coral, fronds, driftwood)
    {
      const { mat, shade } = standard('nature', {
        ...common(t.positionWorld, t.normalWorldGeometry, t.uv()),
        twVTint: t.attribute('tint', 'vec3'),
        twVData: t.attribute('vdata', 'vec4'),
        twGround: height(t.positionWorld.xz),
        ...detailInputs,
      });
      // engine depth pass: surfaceOf runs (the distance dissolve discards there too), alphaTest 0
      mat.maskShadowNode = shoreSurfaceSlots(shade).alpha.greaterThanEqual(0);
      this.nature = mat;
    }

    // ---- pebble field (InstancedBufferGeometry: aSlot per vertex, iCell per instance; identity transform)
    if (bindings.pebbleMask) {
      const mask = t.texture(bindings.pebbleMask);
      const cell = t.attribute('iCell', 'vec4');
      const slot = t.attribute('aSlot', 'vec4');
      const vertex = pebbleVertexSlots(
        t.wgslFn(wgsl.vertices.pebbles)({
          twPosition: t.positionGeometry,
          twNormal: t.normalGeometry,
          twCell: cell,
          twSlot: slot,
          twCameraPos: this.cameraPosition,
          twGround: height(cell.xy.add(slot.xy)),
          twTerrainOrigin: this.terrainOrigin,
          twTerrainSize: this.terrainSize,
          debrisPebbleMask: mask,
          smpLinearClamp: t.sampler(mask),
        }),
      );
      const { mat } = standard('pebbles', {
        ...common(t.positionWorld, t.varying(vertex.normal, 'twShorePebbleNormal').normalize(), t.vec2(0)),
        twVPebble: t.varying(vertex.pebble, 'twShorePebble'),
        twGround: height(t.positionWorld.xz),
        ...detailInputs,
      });
      mat.positionNode = vertex.position;
      this.pebbles = mat;
    } else this.pebbles = null;

    // ---- scanned debris (InstancedMesh per LOD; aAsset per vertex, iData per instance)
    if (bindings.scanTextures) {
      const A = bindings.scanTextures;
      const iData = t.attribute('iData', 'vec4');
      const albedo = t.texture(A.albedo);
      const { mat } = standard('scan', {
        ...common(t.positionWorld, t.normalWorldGeometry, t.uv()),
        twVIData: iData,
        twGround: height(t.positionWorld.xz),
        scanAlbedo: albedo,
        scanNormal: t.texture(A.normal),
        scanArm: t.texture(A.arm),
        smpAnisoClamp: t.sampler(albedo),
      });
      mat.positionNode = t.wgslFn(wgsl.vertices.scan)({
        twPosition: t.positionLocal,
        twAsset: t.attribute('aAsset', 'float'),
        twIData: iData,
      });
      // ScannedDebris.js shadow snippet
      mat.maskShadowNode = lodFadeNode(iData.z, iData.w.greaterThan(0.5), this.frameIndex);
      this.scan = mat;
    } else this.scan = null;

    // ---- reef (identity transform; the vertex stage places the instance from its record)
    const record = bindings.reefRecord ?? ((k: number) => t.attribute('iReefRecord' + k, 'vec4'));
    const fade = bindings.reefFade ?? t.attribute('iReefFade', 'vec2');
    const reef = (kind: ReefVertexKind) => {
      const m = snippets[kind];
      const soft = m.side === 'double';
      const faded = kind.endsWith('Fade');
      const vertex = reefVertexSlots(
        t.wgslFn(wgsl.vertices[kind])({
          twPosition: t.positionGeometry,
          twNormal: t.normalGeometry,
          twAData: t.attribute('aData', 'vec4'),
          twAKind: bindings.reefKind ?? t.float(0),
          twInstance: t.instanceIndex,
          twRecord0: record(0),
          twRecord1: record(1),
          twRecord2: record(2),
          twRecord3: record(3),
          twFadeInfo: faded ? fade : t.vec2(1, 0),
          twTime: this.time,
          twDt: this.dt,
          twSeaLevel: this.seaLevel,
          twViewPosition: this.cameraPosition,
          twViewRange: this.reefRange,
        }),
      );
      const mat = new MeshPhysicalNodeMaterial({
        roughness: m.roughness,
        metalness: m.metalness,
        side: soft ? DoubleSide : FrontSide,
        alphaTest: m.alphaTest ?? 0,
      });
      mat.name = m.name;
      const normal = t.varying(vertex.worldNormal, 'twShoreReefNormal').normalize();
      const shade = shoreSurfaceCall(wgsl, kind, {
        ...common(t.positionWorld, soft ? normal.mul(t.select(t.frontFacing, 1, -1)) : normal, t.vec2(0)),
        twVReefColors: t.varying(record(2).xy, 'twShoreReefColors'),
        twVReefLocal: t.varying(vertex.local, 'twShoreReefLocal'),
        twVReefData: t.varying(vertex.data, 'twShoreReefData'),
        twVReefInfo: t.varying(vertex.info, 'twShoreReefInfo'),
        ...(faded ? { twVReefFade: t.varying(fade, 'twShoreReefFade') } : {}),
        reefNoise: noise,
        smpLinearRepeat: t.sampler(noise),
      });
      applyShoreSlots(mat, shoreSurfaceSlots(shade), { alphaTested: soft, sunColor: this.sunColor });
      mat.positionNode = vertex.worldPos;
      // engine depth pass: surfaceOf runs (fade discard, the soft batch's alpha test)
      if (!soft) mat.maskShadowNode = shoreSurfaceSlots(shade).alpha.greaterThanEqual(0);
      return mat;
    };
    this.reefHard = reef('reefHard');
    this.reefSoft = reef('reefSoft');
    this.reefHardFade = reef('reefHardFade');
    this.reefSoftFade = reef('reefSoftFade');
  }

  /** Advances the owned clock (when no `time` binding was given). */
  update(dt: number): void {
    if (this.#ownTime && dt > 0) this.time.value += dt;
    if (this.dt.isUniformNode && dt > 0) this.dt.value = dt;
  }

  /** Every material built (scan / pebbles only when their textures were given). */
  get materials(): ShoreShadedMaterial[] {
    return [
      this.rocks,
      this.nature,
      this.pebbles,
      this.scan,
      this.reefHard,
      this.reefSoft,
      this.reefHardFade,
      this.reefSoftFade,
    ].filter((m): m is ShoreShadedMaterial => m !== null);
  }

  dispose(): void {
    for (const m of this.materials) m.dispose();
    for (const tex of this.#ownTextures) tex.dispose();
  }
}
