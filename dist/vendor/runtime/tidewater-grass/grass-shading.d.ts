/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { DataTexture, MeshPhysicalNodeMaterial, type DirectionalLight } from 'three/webgpu';
import { type VegetationWindProvider } from '../vegetation/wind.js';
import { type GrassMaterialFactory, type GrassMaterialOptions } from './grass-material.js';
import type { GrassTexture, GrassTextureFactory, GrassTextureOptions } from './grass-field.js';
type N = any;
/** VegNodes.js vegModule: VEG_UP, vegHash12, vegNoise (verbatim), and common.js `sat`. */
export declare const GRASS_VEG_WGSL = "\nconst VEG_UP = vec3f( 0.0, 1.0, 0.0 );\nfn sat( x: f32 ) -> f32 { return clamp( x, 0.0, 1.0 ); }\n\n// Dave Hoskins' sine-free hash, [0, 1)\nfn vegHash12( p: vec2f ) -> f32 {\n\tvar p3 = fract( vec3f( p.x, p.y, p.x ) * 0.1031 );\n\tp3 += dot( p3, p3.yzx + 33.33 );\n\treturn fract( ( p3.x + p3.y ) * p3.z );\n}\n\nfn vegNoise( p: vec2f ) -> f32 {\n\tlet i = floor( p );\n\tlet fr = fract( p );\n\tlet u = fr * fr * ( fr * -2.0 + 3.0 );\n\tlet a = vegHash12( i );\n\tlet b = vegHash12( i + vec2f( 1.0, 0.0 ) );\n\tlet c = vegHash12( i + vec2f( 0.0, 1.0 ) );\n\tlet d = vegHash12( i + vec2f( 1.0, 1.0 ) );\n\treturn mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y );\n}\n";
/**
 * The source wind functions (VegNodes.js vegWindStrength / vegWindDir3 / vegWindPerp3 / vegGustAt) as stubs
 * returning the values of the shared gust graph (vegetation/wind.ts) that the caller evaluated at the slot xz.
 */
export declare const GRASS_WIND_STUBS = "\nvar<private> twWind: vec2f;\nvar<private> twWindDir: vec3f;\nvar<private> twWindPerp: vec3f;\nfn vegWindStrength() -> f32 { return twWind.x; }\nfn vegWindDir3() -> vec3f { return twWindDir; }\nfn vegWindPerp3() -> vec3f { return twWindPerp; }\nfn vegGustAt( xz: vec2f ) -> f32 { return twWind.y; }\n";
/** Prefix of the helper functions in the generated WGSL (see namespaceGrassWgsl). */
export declare const GRASS_FN_PREFIX = "twGrass_";
/**
 * Prefixes every function declared in the WGSL except the first (the entry), at its declaration and at every
 * call, so source helper names (sat, vegHash12, ...) never collide with three's own shader helpers.
 */
export declare function namespaceGrassWgsl(code: string): string;
export declare const GRASS_VERTEX_ENTRY = "twGrassVertex";
export declare const GRASS_SURFACE_ENTRY = "twGrassSurface";
/** Inputs of the vertex entry, in order (the texture / sampler names are the source's binding names). */
export declare const GRASS_VERTEX_INPUTS: readonly [readonly ["twPosition", "vec3f"], readonly ["twNormal", "vec3f"], readonly ["twCell", "vec4f"], readonly ["twSlot", "vec4f"], readonly ["twBlade", "vec4f"], readonly ["twSide", "vec4f"], readonly ["twCamPos", "vec3f"], readonly ["twTime", "f32"], readonly ["twWindStrength", "f32"], readonly ["twGust", "f32"], readonly ["twWindDirection", "vec3f"], readonly ["twWindPerpendicular", "vec3f"], readonly ["grassMask", "texture_2d<f32>"], readonly ["smpLinearClamp", "sampler"], readonly ["grassHeights", "texture_2d<f32>"], readonly ["vegDetail", "texture_2d<f32>"], readonly ["smpLinearRepeat", "sampler"]];
/** Inputs of the surface entry, in order. */
export declare const GRASS_SURFACE_INPUTS: readonly [readonly ["twVGrass", "vec4f"], readonly ["twVGrassTone", "vec4f"], readonly ["twVGrass2", "vec4f"], readonly ["twVGust", "f32"], readonly ["twNormal", "vec3f"], readonly ["twV", "vec3f"], readonly ["twSunDir", "vec3f"], readonly ["twNight", "f32"]];
export interface GrassShadingWgsl {
    /** wgslFn source of the vertex stage; its first function is the entry. */
    vertex: string;
    /** wgslFn source of the surface stage; its first function is the entry. */
    surface: string;
}
/** The generated WGSL of the grass material (entry first, then structs, stubs and the source modules). */
export declare function grassShadingWgsl(options: GrassMaterialOptions): GrassShadingWgsl;
/** The vertex outputs (the vertex entry's return layout) plus the rebuilt vVegGrass. */
export interface GrassVertexSlots {
    worldPos: N;
    worldNormal: N;
    vVegGrass: N;
    vVegGrassTone: N;
    vVegGrass2: N;
    vVegGust: N;
}
/** Maps the packed vertex output onto named slots; `blade` is the aBlade input (hf, kind, rand). */
export declare function grassVertexSlots(packed: N, blade: N): GrassVertexSlots;
/** The engine Surface fields the grass writes (the surface entry's return layout), as nodes. */
export interface GrassSurfaceSlots {
    albedo: N;
    alpha: N;
    normalWorld: N;
    roughness: N;
    translucency: N;
    metalness: N;
    specularIntensity: N;
    ao: N;
}
export declare function grassSurfaceSlots(packed: N): GrassSurfaceSlots;
/**
 * Puts surface slots on the node material: albedo, roughness, metalness, specularIntensity, ao, the (world)
 * shading normal (not flipped on back faces: the source bends the vertex normal towards the viewer), and the
 * translucency on the sun's direct diffuse under the shadowed light colour.
 */
export declare function applyGrassSlots(material: MeshPhysicalNodeMaterial, slots: GrassSurfaceSlots, sun: DirectionalLight): void;
/** The field's height (r32float, loaded) and mask (rgba8unorm, linear clamp) textures as three.js DataTextures. */
export declare class ThreeGrassTexture implements GrassTexture {
    readonly texture: DataTexture;
    readonly options: GrassTextureOptions;
    constructor(options: GrassTextureOptions);
    upload(data: Float32Array | Uint8Array): void;
    destroy(): void;
}
export declare const threeGrassTextures: GrassTextureFactory;
export interface GrassShadingBindings {
    /** Shared world wind (gust phase, direction, speed, detail texture): borrowed. */
    wind: VegetationWindProvider;
    /** Seconds (the source frame.time). */
    time: N;
    /** Main camera world position (the source vegParams.camPos; shadow passes keep the main camera's fades). */
    mainCamera: N;
    sun: DirectionalLight;
    /** World direction towards the sun. */
    sunDirection: N;
    /** 0 day .. 1 night. */
    night: N;
}
/** The per-vertex attributes of the vertex entry. */
export interface GrassVertexAttributes {
    position: N;
    normal: N;
    cell: N;
    slot: N;
    blade: N;
    side: N;
}
/** All vertex entry inputs: attributes, frame values, the shared gust graph at the slot xz, the textures. */
export declare function grassVertexInputs(a: GrassVertexAttributes, b: Pick<GrassShadingBindings, 'wind' | 'time' | 'mainCamera'>, textures: {
    heights: DataTexture;
    mask: DataTexture;
}): Record<string, N>;
export declare const grassVertexCall: (wgsl: GrassShadingWgsl, inputs: Record<string, N>) => N;
export declare const grassSurfaceCall: (wgsl: GrassShadingWgsl, inputs: Record<string, N>) => N;
/**
 * The grass field material: the source options (grass-material.ts `grassMaterialOptions`, carried by the
 * GrassField) on a MeshPhysicalNodeMaterial. The field's meshes have an identity transform (world positions
 * come from the vertex stage) and never cast shadows (source). Caller owns disposal; bindings are borrowed.
 */
export declare function createGrassShadingMaterial(options: GrassMaterialOptions, b: GrassShadingBindings): MeshPhysicalNodeMaterial;
/** GrassFieldOptions.material: builds the native material from the field's source options. */
export declare const grassShadingFactory: (b: GrassShadingBindings) => GrassMaterialFactory;
export {};
