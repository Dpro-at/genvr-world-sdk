/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { StorageBufferAttribute, type DirectionalLight, type Material } from 'three/webgpu';
import type { Mesh } from 'three';
import type { StorageBufferOptions, WildlifeMaterialFactory, WildlifeMaterialOptions, WildlifeStorageBuffer } from './kit.js';
type N = any;
/** Engine common lines the snippets use (common.js: sat and the MaterialX noise, as the boat copies them). */
export declare const CREATURE_COMMON_WGSL = "\nconst TWO_PI: f32 = 6.283185307179586;\nfn sat( x: f32 ) -> f32 { return clamp( x, 0.0, 1.0 ); }\nfn _mxRotl( x: u32, k: u32 ) -> u32 { return ( x << k ) | ( x >> ( 32u - k ) ); }\nfn _mxFinal( a0: u32, b0: u32, c0: u32 ) -> u32 {\n\tvar a = a0; var b = b0; var c = c0;\n\tc ^= b; c -= _mxRotl( b, 14u );\n\ta ^= c; a -= _mxRotl( c, 11u );\n\tb ^= a; b -= _mxRotl( a, 25u );\n\tc ^= b; c -= _mxRotl( b, 16u );\n\ta ^= c; a -= _mxRotl( c, 4u );\n\tb ^= a; b -= _mxRotl( a, 14u );\n\tc ^= b; c -= _mxRotl( b, 24u );\n\treturn c;\n}\nfn mxHash3( x: i32, y: i32, z: i32 ) -> u32 { let s = 0xdeadbeefu + ( 3u << 2u ) + 13u; return _mxFinal( s + u32( x ), s + u32( y ), s + u32( z ) ); }\nfn _gradDot3( h: u32, p: vec3f ) -> f32 {\n\tlet hh = h & 15u;\n\tlet u = select( p.y, p.x, hh < 8u );\n\tlet v = select( select( p.z, p.x, hh == 12u || hh == 14u ), p.y, hh < 4u );\n\treturn select( u, - u, ( hh & 1u ) != 0u ) + select( v, - v, ( hh & 2u ) != 0u );\n}\nfn _fade3( t: vec3f ) -> vec3f { return t * t * t * ( t * ( t * 6.0 - 15.0 ) + 10.0 ); }\nfn _h3( i: vec3i ) -> u32 { return mxHash3( i.x, i.y, i.z ); }\nfn perlin3( p: vec3f ) -> f32 {\n\tlet fl = floor( p );\n\tlet i = vec3i( fl );\n\tlet f = p - fl;\n\tlet u = _fade3( f );\n\tlet n000 = _gradDot3( _h3( i ), f );\n\tlet n100 = _gradDot3( _h3( i + vec3i( 1, 0, 0 ) ), f - vec3f( 1.0, 0.0, 0.0 ) );\n\tlet n010 = _gradDot3( _h3( i + vec3i( 0, 1, 0 ) ), f - vec3f( 0.0, 1.0, 0.0 ) );\n\tlet n110 = _gradDot3( _h3( i + vec3i( 1, 1, 0 ) ), f - vec3f( 1.0, 1.0, 0.0 ) );\n\tlet n001 = _gradDot3( _h3( i + vec3i( 0, 0, 1 ) ), f - vec3f( 0.0, 0.0, 1.0 ) );\n\tlet n101 = _gradDot3( _h3( i + vec3i( 1, 0, 1 ) ), f - vec3f( 1.0, 0.0, 1.0 ) );\n\tlet n011 = _gradDot3( _h3( i + vec3i( 0, 1, 1 ) ), f - vec3f( 0.0, 1.0, 1.0 ) );\n\tlet n111 = _gradDot3( _h3( i + vec3i( 1, 1, 1 ) ), f - vec3f( 1.0, 1.0, 1.0 ) );\n\tlet x0 = mix( mix( n000, n100, u.x ), mix( n010, n110, u.x ), u.y );\n\tlet x1 = mix( mix( n001, n101, u.x ), mix( n011, n111, u.x ), u.y );\n\treturn mix( x0, x1, u.z ) * 0.982;\n}\nfn mx_noise_float3( p: vec3f ) -> f32 { return perlin3( p ); }\nfn mx_fractal_noise_float3( p: vec3f, octaves: i32, lacunarity: f32, diminish: f32 ) -> f32 {\n\tvar r = 0.0; var amp = 1.0; var q = p;\n\tfor ( var i = 0; i < octaves; i++ ) { r += amp * perlin3( q ); amp *= diminish; q *= lacunarity; }\n\treturn r;\n}\n";
/**
 * Engine common.js 86 (interleaved gradient noise) under a prefixed name: three's own shadow filter
 * declares a function `interleavedGradientNoise` in lit fragment shaders, so the critter surface
 * snippet's one call is renamed to this copy (the only textual change to a source snippet).
 */
export declare const CREATURE_IGN_WGSL = "fn twInterleavedGradientNoise( px: vec2f ) -> f32 { return fract( 52.9829189 * fract( dot( px, vec2f( 0.06711056, 0.00583715 ) ) ) ); }\n";
/** The critter surface snippet with its noise call renamed (see CREATURE_IGN_WGSL). */
export declare function critterSurfaceSnippet(surface: string): string;
/** A source StorageBuffer on three: a StorageBufferAttribute (vec4f elements) and its read-only node. */
export declare class CreatureStorageBuffer implements WildlifeStorageBuffer {
    readonly options: StorageBufferOptions;
    readonly attribute: StorageBufferAttribute;
    readonly node: N;
    writes: number;
    constructor(options: StorageBufferOptions);
    /** Same contract as the engine: upload the used part (the batches pass a subarray from 0). */
    write(data: Float32Array): void;
    dispose(): void;
}
/** StorageBufferFactory for the wildlife batches (pass as `storageBuffer`). */
export declare const creatureStorageBuffer: (options: StorageBufferOptions) => CreatureStorageBuffer;
/** WGSL float literal of the float32 value the engine would upload. */
export declare const f32Literal: (x: number) => string;
/** Record reads of a snippet: `name[ v.instance * <stride>u + <k>u ]`. */
export declare function recordLayout(snippet: string, buffer: string): {
    stride: number;
    slots: number[];
};
/** Template stride of a snippet: `( si * <vertices>u + v.vertex ) * <n>u`. */
export declare function templateLayout(snippet: string): {
    vertices: number;
    elements: number;
};
/** Named surface outputs of a packed surface (the order of SURFACE_RETURN). */
export interface CreatureSurface {
    albedo: N;
    alpha: N;
    normal: N;
    roughness: N;
    emissive: N;
    metalness: N;
    translucency: N;
    ao: N;
}
/** Named vertex outputs: the engine world transform plus the material's varyings. */
export interface CreatureVertex {
    position: N;
    normal: N;
    previous: N;
    varyings: Record<string, N>;
}
/** Inputs of the bird vertex entry: the 16 record vec4, the species elements A-D, the output selector. */
export declare const BIRD_VERTEX_INPUTS: readonly [...string[], "twA", "twB", "twC", "twD", "twOut"];
export declare const BIRD_SURFACE_INPUTS: readonly ["twRest", "twRestN", "twInfo", "twFold", "twN", "twSunDir"];
export declare const CRITTER_VERTEX_INPUTS: readonly [...string[], "twA", "twB", "twLimb", "twRing", "twOut"];
export declare const CRITTER_SURFACE_INPUTS: readonly ["twInfo", "twLocal", "twPixel", "twTime"];
export declare const BLOB_VERTEX_INPUTS: readonly ["twR0", "twR1", "twPosition", "twSunDir", "twOut"];
export declare const BLOB_SURFACE_INPUTS: readonly ["twUv", "twInfo", "twNight"];
export declare const GULL_VERTEX_INPUTS: readonly ["twPosition", "twA", "twB", "twSide", "twSpan", "twTime"];
export interface CreatureShadingWgsl {
    vertex: string;
    surface: string | null;
}
/** The generated WGSL of one wildlife material (entry first: wgslFn calls the first declaration). */
export declare function creatureShadingWgsl(o: WildlifeMaterialOptions): CreatureShadingWgsl;
/** Index inputs of a vertex graph: the material passes the draw builtins, tests a compute layout. */
export interface CreatureIndices {
    instance: N;
    vertex: N;
}
/** Bird vertex outputs (world transform and varyings) for one instance / vertex. */
export declare function birdVertexNodes(o: WildlifeMaterialOptions, wgsl: string, idx: CreatureIndices): CreatureVertex;
/** Critter vertex outputs; `limb` / `ring` are the template's aLimb / aRing attributes. */
export declare function critterVertexNodes(o: WildlifeMaterialOptions, wgsl: string, idx: CreatureIndices & {
    limb: N;
    ring: N;
}): CreatureVertex;
/** Contact shadow vertex outputs; `position` is the quad's geometry position. */
export declare function blobVertexNodes(o: WildlifeMaterialOptions, wgsl: string, idx: {
    instance: N;
    position: N;
    sunDirection: N;
}): CreatureVertex;
/** Gull position (local; the mesh stays at the origin like the source's) from the instance attributes. */
export declare function gullVertexNode(wgsl: string, a: {
    position: N;
    gA: N;
    gB: N;
    gSide: N;
    gSpan: N;
    time: N;
}): N;
/** Bird surface from the varyings (vBirdRest, vBirdRestN, vBirdInfo, vBirdFold) and the normal. */
export declare function birdSurfaceNodes(wgsl: string, a: {
    rest: N;
    restN: N;
    info: N;
    fold: N;
    normal: N;
    sunDirection: N;
}): CreatureSurface;
export declare function critterSurfaceNodes(wgsl: string, a: {
    info: N;
    local: N;
    pixel: N;
    time: N;
}): CreatureSurface;
export declare function blobSurfaceNodes(wgsl: string, a: {
    uv: N;
    info: N;
    night: N;
}): CreatureSurface;
/** Frame inputs (the source engine's frame uniforms); missing ones are owned by CreatureShading. */
export interface CreatureShadingBindings {
    /** Simulation time in seconds (frame.time): gull flight, burrow dither. */
    time?: N;
    /** 0 day .. 1 night (frame.night): contact shadow strength. */
    night?: N;
    /** Direction toward the sun or moon, world space (frame.sunDir): bird translucency, contact shadows. */
    sunDirection?: N;
    /** The key light: the bird wing / tail translucency is added to its direct diffuse light. */
    sun?: DirectionalLight;
}
/** What each material keeps for inspection and tests (the named graph outputs it was wired from). */
export interface CreatureMaterialGraph {
    options: WildlifeMaterialOptions;
    wgsl: CreatureShadingWgsl;
    vertex: CreatureVertex | null;
    surface: CreatureSurface | null;
}
/**
 * The source wildlife materials as native three.js WebGPU node materials. Pass `storageBuffer` and
 * `material` to Wildlife / BirdBatch / CritterBatch / ShadowBlobs / Gulls, then `attach` their meshes.
 */
export declare class CreatureShading {
    #private;
    readonly time: N;
    readonly night: N;
    readonly sunDirection: N;
    readonly sun: DirectionalLight | null;
    readonly materials: Material[];
    readonly storageBuffer: (options: StorageBufferOptions) => CreatureStorageBuffer;
    readonly material: WildlifeMaterialFactory;
    constructor(bindings?: CreatureShadingBindings);
    /** WildlifeMaterialFactory: one native material per source material (by its name). */
    create(o: WildlifeMaterialOptions): Material;
    /**
     * Makes a wildlife mesh draw its instances on three: the batches keep the count in
     * `geometry.instanceCount` (an engine convention three ignores on a plain BufferGeometry), so the
     * mesh reports it as `count`. Contact shadows also join layer 0 (three cameras see layer 0 only).
     */
    attach(mesh: Mesh): Mesh;
    /** Attaches every mesh of a Wildlife owner (birds, critters, contact shadows). */
    attachWildlife(w: {
        birdBatch: {
            mesh: Mesh;
        };
        critterBatch: {
            mesh: Mesh;
        };
        blobs: {
            mesh: Mesh;
        };
    }): void;
    /** Advances the owned clock (when no `time` binding was given). */
    update(dt: number): void;
    dispose(): void;
}
export {};
