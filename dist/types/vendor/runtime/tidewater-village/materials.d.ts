/** A WGSL module of the source engine (ShaderModule): name, dependency names and code. */
export interface WgslModule {
    name: string;
    deps: readonly string[];
    code: string;
}
/** Source engine/render/wgsl/common.js module name (perturbNormalByMap, luminance, sat, ...). */
export declare const COMMON_MODULE = "common";
export declare const villageMaterialModule: WgslModule;
export declare const tidalModule: WgslModule;
export declare const VARYINGS: {
    readonly vTint: "vec3f";
    readonly vData: "vec4f";
};
export declare const ATTRIBUTES: {
    readonly tint: "vec3f";
    readonly vdata: "vec4f";
};
export declare const PASS_ATTRS = "\to.vTint = v.tint;\n\to.vData = v.vdata;\n";
/** Texture set names baked by texture-baker.ts (VillageTextures.textures keys). */
export type VillageTextureName = 'woodA' | 'woodN' | 'paintN' | 'roofA' | 'roofN' | 'thatchA' | 'thatchN' | 'stoneA' | 'stoneN' | 'hardA' | 'hardN' | 'grime' | 'rope' | 'net';
export interface VillageMaterialParams {
    roughness: number;
    metalness: number;
    side?: number;
    alphaTest?: number;
    transparent?: boolean;
    depthWrite?: boolean;
}
/** Everything the source passed to the engine's standard() for one village material. */
export interface VillageMaterialSpec {
    name: string;
    params: VillageMaterialParams;
    /** binding name (vlg<Name>) -> baked texture set name */
    textures: Record<string, VillageTextureName>;
    attributes: typeof ATTRIBUTES;
    varyings: typeof VARYINGS;
    /** module names in source order: common, villageMaterials, then the material's extra modules */
    modules: string[];
    vertex: string;
    surface: string;
}
export declare const glassModule: WgslModule;
export declare function woodMaterial(): VillageMaterialSpec;
export declare function roofMetalMaterial(): VillageMaterialSpec;
export declare function thatchMaterial(): VillageMaterialSpec;
export declare function hardMaterial(): VillageMaterialSpec;
export declare function stoneMaterial(): VillageMaterialSpec;
export declare const SWAY = "\n\tlet w = v.vdata.y;\n\tlet ph = frame.time * 1.7 + v.position.x * 0.6 + v.position.z * 0.45 + v.vdata.x * 20.0;\n\tlet gust = sin( ph ) * 0.6 + sin( ph * 2.3 + 1.7 ) * 0.3 + 0.55;\n\tlet flutter = sin( frame.time * 7.0 + v.position.y * 9.0 + v.vdata.x * 50.0 ) * 0.25;\n\tlet swayPos = v.position + vec3f( frame.windDir.x, flutter * 0.3, frame.windDir.y ) * ( ( gust + flutter ) * ( frame.windSpeed * 0.011 * w ) );\n";
export declare function fabricMaterial(): VillageMaterialSpec;
export declare function netMaterial(): VillageMaterialSpec;
/** Source createVillageMaterials: the seven village materials (keys = batch / mesh keys). */
export declare function villageMaterialSpecs(): {
    wood: VillageMaterialSpec;
    roofMetal: VillageMaterialSpec;
    thatch: VillageMaterialSpec;
    hard: VillageMaterialSpec;
    stone: VillageMaterialSpec;
    fabric: VillageMaterialSpec;
    net: VillageMaterialSpec;
};
