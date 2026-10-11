/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { Data3DTexture, InterleavedBufferAttribute, MeshPhysicalNodeMaterial, MeshStandardNodeMaterial, type Texture } from 'three/webgpu';
type N = any;
/** common.js (commonModule) without its depth / view reconstruction block (it reads frame matrices the shore never uses). */
export declare const SHORE_COMMON_WGSL = "\nconst PI: f32 = 3.141592653589793;\nconst TWO_PI: f32 = 6.283185307179586;\nconst INV_PI: f32 = 0.3183098861837907;\nconst EPS: f32 = 1e-5;\n\nfn sat( x: f32 ) -> f32 { return clamp( x, 0.0, 1.0 ); }\nfn sat3( x: vec3f ) -> vec3f { return clamp( x, vec3f( 0.0 ), vec3f( 1.0 ) ); }\nfn pow2( x: f32 ) -> f32 { return x * x; }\nfn pow4( x: f32 ) -> f32 { let y = x * x; return y * y; }\nfn pow5( x: f32 ) -> f32 { let y = x * x; return y * y * x; }\nfn luminance( c: vec3f ) -> f32 { return dot( c, vec3f( 0.2126, 0.7152, 0.0722 ) ); }\nfn remap( x: f32, a: f32, b: f32, c: f32, d: f32 ) -> f32 { return c + ( x - a ) * ( d - c ) / ( b - a ); }\nfn remapClamp( x: f32, a: f32, b: f32, c: f32, d: f32 ) -> f32 { return mix( c, d, sat( ( x - a ) / ( b - a ) ) ); }\nfn rotate2( v: vec2f, a: f32 ) -> vec2f { let c = cos( a ); let s = sin( a ); return vec2f( c * v.x - s * v.y, s * v.x + c * v.y ); }\n\n// ---- hashes\n\nfn pcg( v: u32 ) -> u32 {\n\tlet state = v * 747796405u + 2891336453u;\n\tlet word = ( ( state >> ( ( state >> 28u ) + 4u ) ) ^ state ) * 277803737u;\n\treturn ( word >> 22u ) ^ word;\n}\nfn pcg3( v0: vec3u ) -> vec3u {\n\tvar v = v0 * 1664525u + 1013904223u;\n\tv.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;\n\tv ^= v >> vec3u( 16u );\n\tv.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;\n\treturn v;\n}\nfn u32ToUnit( h: u32 ) -> f32 { return f32( h >> 8u ) * ( 1.0 / 16777216.0 ) + ( 0.5 / 16777216.0 ); }\n// float hash in [0, 1) of a float seed (TSL hash())\nfn hash11( p: f32 ) -> f32 { return u32ToUnit( pcg( bitcast<u32>( p ) ^ 0x9e3779b9u ) ); }\nfn hash21( p: vec2f ) -> f32 { return u32ToUnit( pcg( bitcast<u32>( p.x ) ^ pcg( bitcast<u32>( p.y ) ) ) ); }\nfn hash31( p: vec3f ) -> f32 { return u32ToUnit( pcg3( bitcast<vec3u>( p ) ).x ); }\nfn hash22( p: vec2f ) -> vec2f {\n\tlet h = pcg3( vec3u( bitcast<vec2u>( p ), 0x51ed270bu ) );\n\treturn vec2f( u32ToUnit( h.x ), u32ToUnit( h.y ) );\n}\nfn hash33( p: vec3f ) -> vec3f {\n\tlet h = pcg3( bitcast<vec3u>( p ) );\n\treturn vec3f( u32ToUnit( h.x ), u32ToUnit( h.y ), u32ToUnit( h.z ) );\n}\nfn hashU( a: u32, b: u32 ) -> f32 { return u32ToUnit( pcg( a ^ pcg( b ) ) ); }\nfn ihash3( p: vec3i ) -> vec3u { return pcg3( bitcast<vec3u>( p ) ); }\n\n// Jimenez interleaved gradient noise at a pixel (0..1)\nfn interleavedGradientNoise( px: vec2f ) -> f32 { return fract( 52.9829189 * fract( dot( px, vec2f( 0.06711056, 0.00583715 ) ) ) ); }\n\n// i-th of n points of a Vogel disc (unit radius), rotated by phi\nfn vogelDiskSample( i: i32, n: i32, phi: f32 ) -> vec2f {\n\tlet r = sqrt( ( f32( i ) + 0.5 ) / f32( n ) );\n\tlet theta = f32( i ) * 2.399963229728653 + phi;\n\treturn vec2f( cos( theta ), sin( theta ) ) * r;\n}\n\n// ---- gradient noise: MaterialX (three's MaterialXNoise.js) bit for bit \u2014 the same Jenkins\n// lookup3 hash, gradients, quintic fade and gradient scales (0.6616 in 2D, 0.982 in 3D), so the\n// procedural patterns land where they did in the three.js version.\n\nfn _mxRotl( x: u32, k: u32 ) -> u32 { return ( x << k ) | ( x >> ( 32u - k ) ); }\nfn _mxFinal( a0: u32, b0: u32, c0: u32 ) -> u32 {\n\tvar a = a0; var b = b0; var c = c0;\n\tc ^= b; c -= _mxRotl( b, 14u );\n\ta ^= c; a -= _mxRotl( c, 11u );\n\tb ^= a; b -= _mxRotl( a, 25u );\n\tc ^= b; c -= _mxRotl( b, 16u );\n\ta ^= c; a -= _mxRotl( c, 4u );\n\tb ^= a; b -= _mxRotl( a, 14u );\n\tc ^= b; c -= _mxRotl( b, 24u );\n\treturn c;\n}\nfn mxHash2( x: i32, y: i32 ) -> u32 { let s = 0xdeadbeefu + ( 2u << 2u ) + 13u; return _mxFinal( s + u32( x ), s + u32( y ), s ); }\nfn mxHash3( x: i32, y: i32, z: i32 ) -> u32 { let s = 0xdeadbeefu + ( 3u << 2u ) + 13u; return _mxFinal( s + u32( x ), s + u32( y ), s + u32( z ) ); }\nfn _mxGrad2( hash: u32, x: f32, y: f32 ) -> f32 {\n\tlet h = hash & 7u;\n\tlet u = select( y, x, h < 4u );\n\tlet v = 2.0 * select( x, y, h < 4u );\n\treturn select( u, - u, ( h & 1u ) != 0u ) + select( v, - v, ( h & 2u ) != 0u );\n}\nfn _gradDot3( h: u32, p: vec3f ) -> f32 {\n\tlet hh = h & 15u;\n\tlet u = select( p.y, p.x, hh < 8u );\n\tlet v = select( select( p.z, p.x, hh == 12u || hh == 14u ), p.y, hh < 4u );\n\treturn select( u, - u, ( hh & 1u ) != 0u ) + select( v, - v, ( hh & 2u ) != 0u );\n}\nfn _fade3( t: vec3f ) -> vec3f { return t * t * t * ( t * ( t * 6.0 - 15.0 ) + 10.0 ); }\nfn _h3( i: vec3i ) -> u32 { return mxHash3( i.x, i.y, i.z ); }\n\nfn perlin3( p: vec3f ) -> f32 {\n\tlet fl = floor( p );\n\tlet i = vec3i( fl );\n\tlet f = p - fl;\n\tlet u = _fade3( f );\n\tlet n000 = _gradDot3( _h3( i ), f );\n\tlet n100 = _gradDot3( _h3( i + vec3i( 1, 0, 0 ) ), f - vec3f( 1.0, 0.0, 0.0 ) );\n\tlet n010 = _gradDot3( _h3( i + vec3i( 0, 1, 0 ) ), f - vec3f( 0.0, 1.0, 0.0 ) );\n\tlet n110 = _gradDot3( _h3( i + vec3i( 1, 1, 0 ) ), f - vec3f( 1.0, 1.0, 0.0 ) );\n\tlet n001 = _gradDot3( _h3( i + vec3i( 0, 0, 1 ) ), f - vec3f( 0.0, 0.0, 1.0 ) );\n\tlet n101 = _gradDot3( _h3( i + vec3i( 1, 0, 1 ) ), f - vec3f( 1.0, 0.0, 1.0 ) );\n\tlet n011 = _gradDot3( _h3( i + vec3i( 0, 1, 1 ) ), f - vec3f( 0.0, 1.0, 1.0 ) );\n\tlet n111 = _gradDot3( _h3( i + vec3i( 1, 1, 1 ) ), f - vec3f( 1.0, 1.0, 1.0 ) );\n\tlet x0 = mix( mix( n000, n100, u.x ), mix( n010, n110, u.x ), u.y );\n\tlet x1 = mix( mix( n001, n101, u.x ), mix( n011, n111, u.x ), u.y );\n\treturn mix( x0, x1, u.z ) * 0.982;\n}\nfn perlin2( p: vec2f ) -> f32 {\n\tlet fl = floor( p );\n\tlet X = i32( fl.x ); let Y = i32( fl.y );\n\tlet fx = p.x - fl.x; let fy = p.y - fl.y;\n\tlet u = _fade3( vec3f( fx, fy, 0.0 ) );\n\tlet v0 = _mxGrad2( mxHash2( X, Y ), fx, fy );\n\tlet v1 = _mxGrad2( mxHash2( X + 1, Y ), fx - 1.0, fy );\n\tlet v2 = _mxGrad2( mxHash2( X, Y + 1 ), fx, fy - 1.0 );\n\tlet v3 = _mxGrad2( mxHash2( X + 1, Y + 1 ), fx - 1.0, fy - 1.0 );\n\tlet s1 = 1.0 - u.x;\n\treturn ( ( 1.0 - u.y ) * ( v0 * s1 + v1 * u.x ) + u.y * ( v2 * s1 + v3 * u.x ) ) * 0.6616;\n}\nfn mx_noise_float3( p: vec3f ) -> f32 { return perlin3( p ); }\nfn mx_noise_float2( p: vec2f ) -> f32 { return perlin2( p ); }\n// MaterialX vec3 noise: one hash per corner, its three low bytes pick the gradients\nfn _mxGrad3v( h: u32, p: vec3f ) -> vec3f { return vec3f( _gradDot3( h & 0xffu, p ), _gradDot3( ( h >> 8u ) & 0xffu, p ), _gradDot3( ( h >> 16u ) & 0xffu, p ) ); }\nfn mx_noise_vec3( p: vec3f ) -> vec3f {\n\tlet fl = floor( p );\n\tlet i = vec3i( fl );\n\tlet f = p - fl;\n\tlet u = _fade3( f );\n\tlet n000 = _mxGrad3v( _h3( i ), f );\n\tlet n100 = _mxGrad3v( _h3( i + vec3i( 1, 0, 0 ) ), f - vec3f( 1.0, 0.0, 0.0 ) );\n\tlet n010 = _mxGrad3v( _h3( i + vec3i( 0, 1, 0 ) ), f - vec3f( 0.0, 1.0, 0.0 ) );\n\tlet n110 = _mxGrad3v( _h3( i + vec3i( 1, 1, 0 ) ), f - vec3f( 1.0, 1.0, 0.0 ) );\n\tlet n001 = _mxGrad3v( _h3( i + vec3i( 0, 0, 1 ) ), f - vec3f( 0.0, 0.0, 1.0 ) );\n\tlet n101 = _mxGrad3v( _h3( i + vec3i( 1, 0, 1 ) ), f - vec3f( 1.0, 0.0, 1.0 ) );\n\tlet n011 = _mxGrad3v( _h3( i + vec3i( 0, 1, 1 ) ), f - vec3f( 0.0, 1.0, 1.0 ) );\n\tlet n111 = _mxGrad3v( _h3( i + vec3i( 1, 1, 1 ) ), f - vec3f( 1.0, 1.0, 1.0 ) );\n\tlet x0 = mix( mix( n000, n100, u.x ), mix( n010, n110, u.x ), u.y );\n\tlet x1 = mix( mix( n001, n101, u.x ), mix( n011, n111, u.x ), u.y );\n\treturn mix( x0, x1, u.z ) * 0.982;\n}\nfn mx_fractal_noise_float3( p: vec3f, octaves: i32, lacunarity: f32, diminish: f32 ) -> f32 {\n\tvar r = 0.0; var amp = 1.0; var q = p;\n\tfor ( var i = 0; i < octaves; i++ ) { r += amp * perlin3( q ); amp *= diminish; q *= lacunarity; }\n\treturn r;\n}\nfn mx_cell_noise_float3( p: vec3f ) -> f32 { let i = vec3i( floor( p ) ); return f32( mxHash3( i.x, i.y, i.z ) ) / f32( 0xffffffffu ); }\nfn mx_cell_noise_float2( p: vec2f ) -> f32 { let i = vec2i( floor( p ) ); return f32( mxHash2( i.x, i.y ) ) / f32( 0xffffffffu ); }\n// distances to the nearest two feature points (F1, F2), jitter 0..1\nfn mx_worley_noise_vec2_3( p: vec3f, jitter: f32 ) -> vec2f {\n\tlet i = vec3i( floor( p ) );\n\tlet f = fract( p );\n\tvar d1 = 1e9; var d2 = 1e9;\n\tfor ( var z = -1; z <= 1; z++ ) { for ( var y = -1; y <= 1; y++ ) { for ( var x = -1; x <= 1; x++ ) {\n\t\tlet c = vec3i( x, y, z );\n\t\tlet h = ihash3( i + c );\n\t\tlet o = vec3f( f32( c.x ), f32( c.y ), f32( c.z ) ) + ( vec3f( u32ToUnit( h.x ), u32ToUnit( h.y ), u32ToUnit( h.z ) ) - 0.5 ) * jitter + 0.5 - f;\n\t\tlet d = dot( o, o );\n\t\tif ( d < d1 ) { d2 = d1; d1 = d; } else if ( d < d2 ) { d2 = d; }\n\t} } }\n\treturn sqrt( vec2f( d1, d2 ) );\n}\nfn mx_worley_noise_vec2_2( p: vec2f, jitter: f32 ) -> vec2f {\n\tlet i = vec2i( floor( p ) );\n\tlet f = fract( p );\n\tvar d1 = 1e9; var d2 = 1e9;\n\tfor ( var y = -1; y <= 1; y++ ) { for ( var x = -1; x <= 1; x++ ) {\n\t\tlet c = vec2i( x, y );\n\t\tlet h = ihash3( vec3i( i + c, 0 ) );\n\t\tlet o = vec2f( f32( c.x ), f32( c.y ) ) + ( vec2f( u32ToUnit( h.x ), u32ToUnit( h.y ) ) - 0.5 ) * jitter + 0.5 - f;\n\t\tlet d = dot( o, o );\n\t\tif ( d < d1 ) { d2 = d1; d1 = d; } else if ( d < d2 ) { d2 = d; }\n\t} }\n\treturn sqrt( vec2f( d1, d2 ) );\n}\n\n// ---- normals\n\n// orthonormal basis around n (Frisvad / Duff et al.)\nfn basis( n: vec3f ) -> mat3x3f {\n\tlet s = select( -1.0, 1.0, n.z >= 0.0 );\n\tlet a = -1.0 / ( s + n.z );\n\tlet b = n.x * n.y * a;\n\tlet t = vec3f( 1.0 + s * n.x * n.x * a, s * b, -s * n.x );\n\tlet bt = vec3f( b, s + n.y * n.y * a, -n.y );\n\treturn mat3x3f( t, bt, n );\n}\n\n// Perturb a world-space normal by a height field sampled with screen-space derivatives\n// (Mikkelsen, \"Bump Mapping Unparametrized Surfaces\"; TSL perturbNormal equivalent).\n// dhdx / dhdy: dpdx / dpdy of the height (in metres) at this pixel.\nfn perturbNormalByHeight( P: vec3f, N: vec3f, dhdx: f32, dhdy: f32, strength: f32 ) -> vec3f {\n\tlet dPdx = dpdx( P );\n\tlet dPdy = dpdy( P );\n\tlet r1 = cross( dPdy, N );\n\tlet r2 = cross( N, dPdx );\n\tlet det = dot( dPdx, r1 );\n\tlet grad = sign( det ) * ( dhdx * r1 + dhdy * r2 ) * strength;\n\treturn normalize( abs( det ) * N - grad );\n}\n\n// tangent-space normal map sample (xy in -1..1) applied with a derivative-based TBN\nfn perturbNormalByMap( P: vec3f, N: vec3f, uv: vec2f, mapN: vec3f ) -> vec3f {\n\tlet dp1 = dpdx( P ); let dp2 = dpdy( P );\n\tlet duv1 = dpdx( uv ); let duv2 = dpdy( uv );\n\tlet dp2perp = cross( dp2, N ); let dp1perp = cross( N, dp1 );\n\tlet T = dp2perp * duv1.x + dp1perp * duv2.x;\n\tlet B = dp2perp * duv1.y + dp1perp * duv2.y;\n\tlet invmax = inverseSqrt( max( max( dot( T, T ), dot( B, B ) ), 1e-20 ) );\n\treturn normalize( mat3x3f( T * invmax, B * invmax, N ) * mapN );\n}\n\n// ---- color\n\nfn srgbToLinear( c: vec3f ) -> vec3f {\n\treturn select( pow( ( c + 0.055 ) / 1.055, vec3f( 2.4 ) ), c / 12.92, c <= vec3f( 0.04045 ) );\n}\nfn linearToSrgb( c: vec3f ) -> vec3f {\n\treturn select( 1.055 * pow( c, vec3f( 1.0 / 2.4 ) ) - 0.055, c * 12.92, c <= vec3f( 0.0031308 ) );\n}\n";
/** lighting.js: the engine's `struct Surface` and `defaultSurface`. */
export declare const SHORE_SURFACE_WGSL = "\nstruct Surface {\n\talbedo: vec3f,\n\talpha: f32,\n\tnormal: vec3f,      // world space, shading normal\n\troughness: f32,\n\temissive: vec3f,\n\tmetalness: f32,\n\ttranslucency: vec3f, // fraction of the direct light transmitted through thin foliage (x lightColor)\n\tao: f32,\n\tsheenColor: vec3f,\n\tspecularIntensity: f32,\n\tclearcoat: f32,\n\tclearcoatRoughness: f32,\n\tsheenRoughness: f32,\n\tior: f32,\n\tclearcoatNormal: vec3f,\n\tenvIntensity: f32,\n};\nfn defaultSurface( N: vec3f ) -> Surface {\n\tvar s: Surface;\n\ts.albedo = vec3f( 1.0 ); s.alpha = 1.0; s.normal = N; s.roughness = 1.0; s.metalness = 0.0;\n\ts.emissive = vec3f( 0.0 ); s.translucency = vec3f( 0.0 ); s.ao = 1.0; s.sheenColor = vec3f( 0.0 );\n\ts.specularIntensity = 1.0; s.clearcoat = 0.0; s.clearcoatRoughness = 0.0; s.sheenRoughness = 1.0;\n\ts.ior = 1.5; s.clearcoatNormal = N; s.envIntensity = 1.0;\n\treturn s;\n}\n";
/** LODFade.js lodFadeModule (screen-door cross-fade; reads frame.frameIndex). */
export declare const SHORE_LOD_FADE_WGSL = "\n// Bayer 4x4 threshold in (0, 1): bit-interleaved formula of\n//   0  8  2 10 / 12  4 14  6 / 3 11  1  9 / 15  7 13  5\nfn bayer4( pixel: vec2f ) -> f32 {\n\tlet f = frame.frameIndex;\n\t// shift the pattern by a different offset every frame (all 16 over 16 frames)\n\tlet p = vec2u( pixel ) + vec2u( f * 3u, ( f >> 2u ) * 1u );\n\tlet x0 = p.x & 1u; let x1 = ( p.x >> 1u ) & 1u;\n\tlet y0 = p.y & 1u; let y1 = ( p.y >> 1u ) & 1u;\n\tlet v = ( ( x0 ^ y0 ) << 3u ) | ( y0 << 2u ) | ( ( x1 ^ y1 ) << 1u ) | y1;\n\treturn ( f32( v ) + 0.5 ) / 16.0;\n}\n\nfn lodFadeVisible( pixel: vec2f, fade: f32, outgoing: bool ) -> bool {\n\tlet t = bayer4( pixel );\n\treturn select( ( t < fade ), ( t >= fade ), outgoing );\n}\n";
/** Materials.js standard(): the SceneMaterial prelude before the material's own surface snippet. */
export declare const STANDARD_PRELUDE = "\ts.emissive = s.emissive * mat.emissiveIntensity;\n\ts.envIntensity = mat.envMapIntensity;\n";
/** TerrainShading.js SHADING_WGSL (terrainShadingModule; binds terrainDetailTex at module scope in the source). */
export declare const TERRAIN_SHADING_WGSL: string;
/** TerrainGPU.js TERRAIN_WGSL: terrainUvOf (the pebble density mask covers the terrain domain). */
export declare const TERRAIN_UV_WGSL = "\nfn terrainUvOf( xz: vec2f ) -> vec2f {\n\treturn ( xz - terrainParams.origin ) / terrainParams.size;\n}\n";
/**
 * Turns one module-scope binding of the source WGSL (a texture or sampler the engine binds by name) into a
 * function parameter: every function that uses it, directly or through a call, gets `,<name>: <type>`
 * appended to its parameters, and every call of such a function gets `,<name>` appended to its arguments.
 * Nothing else changes (removing exactly those insertions gives the source text back). Functions that
 * already declare the name (the generated entry) are the roots that pass it on.
 */
export declare function threadWgslParams(code: string, name: string, type: string): string;
/** Prefix of the source helper functions in the generated WGSL (see namespaceWgslFunctions). */
export declare const SHORE_FN_PREFIX = "twShore_";
/**
 * Prefixes every function declared in the WGSL except the first (the entry) with SHORE_FN_PREFIX, at its
 * declaration and at every call. three emits its own helpers into the same shader module (the shadow
 * filters declare interleavedGradientNoise and vogelDiskSample, as common.js does), so the source helper
 * names must not be global. Removing the prefix gives the text back.
 */
export declare function namespaceWgslFunctions(code: string): string;
/** Reef.js names the batches 'Reef.hard' / 'Reef.soft' (ReefBatch prefixes reefHard / reefSoft). */
export declare const REEF_BATCH_PREFIX: {
    readonly hard: "reefHard";
    readonly soft: "reefSoft";
};
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
export type ShoreSurfaceKind = 'rocks' | 'nature' | 'pebbles' | 'scan' | 'reefHard' | 'reefSoft' | 'reefHardFade' | 'reefSoftFade';
export declare const SHORE_SURFACE_KINDS: readonly ShoreSurfaceKind[];
/** The source material records of every shore material (as the ports record them). */
export declare function shoreMaterialSnippets(): Record<ShoreSurfaceKind, ShoreMaterialSnippet>;
/** Name of the generated surface entry of a kind (the first function of its WGSL). */
export declare const surfaceEntryName: (kind: ShoreSurfaceKind) => string;
/** Inputs every surface entry takes first, in order (then the kind's varyings, extras and textures). */
export declare const SHORE_SURFACE_INPUTS: readonly ["twP", "twN", "twUv", "twPixel", "twTime", "twFrameIndex", "twCameraPos", "twSunDir", "twView"];
/** Texture / sampler parameters of each kind's surface entry (the source binds them at module scope). */
export declare const SHORE_SURFACE_TEXTURES: Record<ShoreSurfaceKind, readonly (readonly [string, string])[]>;
/** Injected terrain values of each kind's surface entry (terrainHeightAt( p.xz ), terrainSplat( p.xz )). */
export declare const SHORE_SURFACE_TERRAIN: Record<ShoreSurfaceKind, readonly ('twGround' | 'twSplat')[]>;
/** Inputs of the pebble vertex entry, in order. */
export declare const PEBBLE_VERTEX_INPUTS: readonly ["twPosition", "twNormal", "twCell", "twSlot", "twCameraPos", "twGround", "twTerrainOrigin", "twTerrainSize", "debrisPebbleMask", "smpLinearClamp"];
/** Inputs of the scanned-debris vertex entry, in order. */
export declare const SCAN_VERTEX_INPUTS: readonly ["twPosition", "twAsset", "twIData"];
/** Inputs of the reef vertex entries, in order. */
export declare const REEF_VERTEX_INPUTS: readonly ["twPosition", "twNormal", "twAData", "twAKind", "twInstance", "twRecord0", "twRecord1", "twRecord2", "twRecord3", "twFadeInfo", "twTime", "twDt", "twSeaLevel", "twViewPosition", "twViewRange"];
export type ReefVertexKind = 'reefHard' | 'reefSoft' | 'reefHardFade' | 'reefSoftFade';
export declare const REEF_VERTEX_KINDS: readonly ReefVertexKind[];
export declare const vertexEntryName: (kind: ReefVertexKind | "pebbles" | "scan") => string;
export interface ShoreShadingWgsl {
    /** One wgslFn source per surface kind; its first function is the entry. */
    surfaces: Record<ShoreSurfaceKind, string>;
    /** Vertex entries: pebble placement, scanned-debris asset selection, reef records / warp / sway. */
    vertices: Record<ReefVertexKind | 'pebbles' | 'scan', string>;
}
/** The generated WGSL of every shore material (entry first, then structs, stubs and the source modules). */
export declare function shoreShadingWgsl(snippets?: Record<ShoreSurfaceKind, ShoreMaterialSnippet>): ShoreShadingWgsl;
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
export declare function shoreSurfaceSlots(packed: N): ShoreSurfaceSlots;
/** The reef vertex outputs (the reef vertex entries' return layout) plus the record-copied varyings. */
export interface ReefVertexSlots {
    worldPos: N;
    worldNormal: N;
    local: N;
    data: N;
    info: N;
}
export declare function reefVertexSlots(packed: N): ReefVertexSlots;
/** The pebble vertex outputs. */
export interface PebbleVertexSlots {
    position: N;
    normal: N;
    pebble: N;
}
export declare function pebbleVertexSlots(packed: N): PebbleVertexSlots;
export type ShoreShadedMaterial = MeshStandardNodeMaterial | MeshPhysicalNodeMaterial;
/**
 * Puts surface slots on a node material: albedo, roughness, metalness, ao, the (world) shading normal,
 * alpha for alpha-tested kinds, specularIntensity on physical materials, and the thin-tissue
 * translucency as emissive under the sun colour.
 */
export declare function applyShoreSlots(material: ShoreShadedMaterial, slots: ShoreSurfaceSlots, { alphaTested, sunColor }: {
    alphaTested?: boolean;
    sunColor: N;
}): void;
/** ReefNoise.js: the 64^3 RGBA8 noise volume as a three.js 3D texture (sampler linearRepeat). */
export declare function createReefNoiseTexture(size?: number): Data3DTexture;
/**
 * Instance records of a ReefBatch (`batch.data`: 16 floats per instance, Reef.js buildBatches) as the four
 * instanced vec4 attributes the reef materials read by default (iReefRecord0..3).
 */
export declare function reefRecordAttributes(data: Float32Array): Record<string, InterleavedBufferAttribute>;
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
    scanTextures?: {
        albedo: Texture;
        normal: Texture;
        arm: Texture;
    };
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
export declare function shoreSurfaceCall(wgsl: ShoreShadingWgsl, kind: ShoreSurfaceKind, inputs: ShoreSurfaceInputs): N;
/**
 * The source shore materials as native three.js WebGPU node materials: rocks, the natural debris (one
 * draw), the pebble field, scanned debris (when atlases are given) and the reef (hard / soft, each with
 * its LOD cross-fade channel).
 */
export declare class ShoreShading {
    #private;
    readonly bindings: ShoreShadingBindings;
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
    constructor(bindings?: ShoreShadingBindings);
    /** Advances the owned clock (when no `time` binding was given). */
    update(dt: number): void;
    /** Every material built (scan / pebbles only when their textures were given). */
    get materials(): ShoreShadedMaterial[];
    dispose(): void;
}
export {};
