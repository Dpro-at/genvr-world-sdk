/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { MeshPhysicalNodeMaterial, MeshStandardNodeMaterial, type DataArrayTexture, type DirectionalLight, type Texture, type WebGPURenderer } from 'three/webgpu';
import { type VillageMaterialSpec, type VillageTextureName } from './materials.js';
import { villageBakePlan } from './texture-baker.js';
import { type PropMaterialExtra } from './game-materials.js';
type N = any;
/** Source engine/render/wgsl/common.js helpers the snippets call, renamed so they cannot collide
 * with other wgslFn code in the same three.js shader (sat, luminance, perturbNormalByMap). */
export declare const COMMON_RENAMES: {
    readonly sat: "twvSat";
    readonly luminance: "twvLuminance";
    readonly perturbNormalByMap: "twvPerturbNormalByMap";
};
/** common.js 14, 19 and 239-247, renamed (COMMON_RENAMES). */
export declare const COMMON_WGSL = "\nfn twvSat( x: f32 ) -> f32 { return clamp( x, 0.0, 1.0 ); }\nfn twvLuminance( c: vec3f ) -> f32 { return dot( c, vec3f( 0.2126, 0.7152, 0.0722 ) ); }\nfn twvPerturbNormalByMap( P: vec3f, N: vec3f, uv: vec2f, mapN: vec3f ) -> vec3f {\n\tlet dp1 = dpdx( P ); let dp2 = dpdy( P );\n\tlet duv1 = dpdx( uv ); let duv2 = dpdy( uv );\n\tlet dp2perp = cross( dp2, N ); let dp1perp = cross( N, dp1 );\n\tlet T = dp2perp * duv1.x + dp1perp * duv2.x;\n\tlet B = dp2perp * duv1.y + dp1perp * duv2.y;\n\tlet invmax = inverseSqrt( max( max( dot( T, T ), dot( B, B ) ), 1e-20 ) );\n\treturn normalize( mat3x3f( T * invmax, B * invmax, N ) * mapN );\n}\n";
/** The source FragInput / Surface / frame, reduced to the fields the ported snippets read and write. */
export declare const STRUCTS_WGSL = "\nstruct TwvVs { vTint: vec3f, vData: vec4f, vAux: vec4f, vLocal: vec3f, vLayer: f32, vUV2: vec2f };\nstruct TwvIn { vs: TwvVs, P: vec3f, N: vec3f, uv: vec2f, color: vec4f, front: bool, pixel: vec2f };\nstruct TwvFrame { time: f32, night: f32, windDir: vec2f, windSpeed: f32, seaLevel: f32 };\nstruct TwvSurface {\n\talbedo: vec3f, alpha: f32, normal: vec3f, roughness: f32, emissive: vec3f, metalness: f32,\n\ttranslucency: vec3f, ao: f32, clearcoat: f32, clearcoatRoughness: f32,\n};\nstruct TwvVertex { position: vec3f, vdata: vec4f };\n";
/** Renames the common.js helpers (whole words). */
export declare function renameCommon(code: string): string;
/** Appends parameters to the declaration of `fn name( ... )` and arguments to every call of it:
 * the source helpers read module-level bindings (textures, `frame`), wgslFn helpers take them as
 * parameters. */
export declare function threadArguments(code: string, name: string, params: string, args: string): string;
/** Source `frame.*` values read by the snippets (all optional TSL nodes; defaults are day, calm). */
export interface VillageShadingFrame {
    /** seconds (source frame.time) */
    time?: N;
    /** 0 day .. 1 night (source frame.night) */
    night?: N;
    /** vec2 horizontal wind direction (source frame.windDir) */
    windDirection?: N;
    /** m/s (source frame.windSpeed) */
    windSpeed?: N;
    /** Genvr world height of the sea: subtracted from world y so the source sees sea level 0 */
    seaLevel?: N;
}
/** One shaded surface: the entry (first function, the wgslFn callable) and its helper include. */
export interface SurfaceWgsl {
    entry: string;
    helpers: string;
}
/** The village helper modules (common, villageMaterials, tidal, glass), threaded for wgslFn. */
export declare function villageHelpersWgsl(): string;
/** The entry function name of a village material. */
export declare const villageEntryName: (spec: VillageMaterialSpec) => string;
/** wgslFn entry of one village material: source surfaceOf + the material's surface snippet. */
export declare function villageSurfaceWgsl(spec: VillageMaterialSpec): SurfaceWgsl;
/** The source SWAY / flag vertex snippet of the fabric and net materials as a local position function. */
export declare function villageVertexWgsl(spec: VillageMaterialSpec): string | null;
/** Village texture maps by baked name (texture-baker.ts SETS outputs). */
export type VillageTextureMaps = Record<VillageTextureName, Texture>;
export interface VillageShadingOptions {
    frame?: VillageShadingFrame;
    /** Replaces mesh inputs by name (uv, P, N, front, pixel, frame values, tint, vdata, position, color,
     * aux, local, layer, uv2): the GPU check feeds synthetic inputs through the real material slots. */
    inputs?: Record<string, N>;
}
/** Per-fragment inputs of a surface entry (TSL nodes). Materials take them from the mesh; the GPU
 * parity script feeds synthetic ones through the same node builders. */
export interface SurfaceInputs {
    uv: N;
    /** Tidewater-space world position (sea level y = 0) */
    P: N;
    /** world normal, already flipped on back faces of double sided materials */
    N: N;
    front: N;
    pixel: N;
    time: N;
    night: N;
    windDir: N;
    windSpeed: N;
}
/** Inputs every surface entry reads from the mesh (fragment stage). */
export declare function meshSurfaceInputs(frame?: VillageShadingFrame, double?: boolean): SurfaceInputs;
/** The surface of one village material as a mat4x4f node: columns ( albedo, alpha ), ( world normal,
 * roughness ), ( emissive, metalness ), ( ao, clearcoat, clearcoat roughness, 0 ). */
export declare function villageShadeNode(spec: VillageMaterialSpec, maps: VillageTextureMaps, inputs: SurfaceInputs & {
    tint: N;
    vdata: N;
}): N;
/** The local position of the fabric / net vertex snippet (sway, flags), or null without one. */
export declare function villageVertexNode(spec: VillageMaterialSpec, inputs: {
    position: N;
    vdata: N;
    time: N;
    night: N;
    windDir: N;
    windSpeed: N;
}): N | null;
/** A native WebGPU material for one village material spec (materials.ts). Geometry: geo-builder
 * Batch layout (position, normal, uv in metres, tint, vdata). Caller owns textures and disposal. */
export declare function createVillageShadingMaterial(spec: VillageMaterialSpec, maps: VillageTextureMaps, options?: VillageShadingOptions): MeshStandardNodeMaterial;
/** Source createVillageMaterials: the seven village materials by batch key. */
export declare function createVillageShadingMaterials(maps: VillageTextureMaps, options?: VillageShadingOptions): Record<"hard" | "stone" | "wood" | "thatch" | "roofMetal" | "net" | "fabric", MeshStandardNodeMaterial>;
/** gameProps helpers (common renamed). */
export declare function propHelpersWgsl(): string;
export declare function propSurfaceWgsl(extra?: PropMaterialExtra): SurfaceWgsl;
/** The prop surface (columns as villageShadeNode). color = vertex colour (linear albedo, alpha),
 * aux = ( roughness, metalness, pattern, spare ), local = rest position. */
export declare function propShadeNode(inputs: SurfaceInputs & {
    color: N;
    aux: N;
    local: N;
}, clearcoat?: boolean): N;
export interface PropShadingOptions extends VillageShadingOptions {
    /** source extra.clearcoat (carbon / thread patterns use the clear-coat lobe) */
    clearcoat?: boolean;
}
/** Native material for meshes built with the boat GeoKit layout (color = linear albedo, aux =
 * roughness, metalness, pattern, spare). Source extra.vertex / extra.uniforms are not supported. */
export declare function createPropShadingMaterial(name?: string, options?: PropShadingOptions): MeshStandardNodeMaterial;
/** stallKit helpers (common renamed) and the private translucency channel of the entry. */
export declare function stallHelpersWgsl(): string;
export declare function stallSurfaceWgsl(): SurfaceWgsl;
/** The stall texture arrays (stall-kit.ts StallAssets surf / prop / signs). */
export interface StallShadingTextures {
    surf: {
        a: DataArrayTexture;
        n: DataArrayTexture;
        r: DataArrayTexture;
    };
    prop: {
        a: DataArrayTexture;
        n: DataArrayTexture;
        r: DataArrayTexture;
    };
    signs: DataArrayTexture;
}
/** The stall surface (columns as villageShadeNode) and its translucency (vec3, source direct-light
 * transmission of the crushed ice). The signs use the signs texture's own sampler (the source samples
 * them with linear clamp; stall-kit.ts arrayTexture sets repeat). */
export declare function stallShadeNodes(tex: StallShadingTextures, inputs: SurfaceInputs & {
    color: N;
    layer: N;
    uv2: N;
}): {
    shade: N;
    translucency: N;
};
export interface StallShadingOptions extends VillageShadingOptions {
    /** the sun whose direct light the crushed ice transmits (source s.translucency x light colour) */
    sun?: DirectionalLight;
}
/** Native material for KitBuilder meshes (uv, color, aLayer, aUV2). */
export declare function createStallShadingMaterial(tex: StallShadingTextures, options?: StallShadingOptions): MeshPhysicalNodeMaterial;
/** Neutral 1 x 1 maps (mid albedo, flat normal, roughness 0.8, no occlusion) for use before a bake. */
export declare function neutralVillageTextures(): VillageTextureMaps;
/** Frees the GPU memory of baked (or neutral) maps. */
export declare function disposeVillageTextures(maps: Partial<VillageTextureMaps>): void;
/** WGSL of one bake kernel as the source ComputeKernel assembles it (binding declarations in the
 * source binding order, module code, kernel code with WG_X / WG_Y substituted). */
export declare function bakeKernelWgsl(kernel: ReturnType<typeof villageBakePlan>[number]): string;
export interface VillageBake {
    maps: VillageTextureMaps;
    /** RGBA8 level-0 bytes of every map (for caching or checks) */
    bytes: Record<VillageTextureName, Uint8Array>;
    ms: number;
}
/** Runs the source bake kernels on the renderer's WebGPU device and returns mipmapped DataTextures.
 * Requires an initialised WebGPURenderer on the WebGPU backend. */
export declare function bakeVillageTextures(renderer: WebGPURenderer): Promise<VillageBake>;
export {};
