/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { Color } from 'three';
import { type ReefShaderModuleLike, type ReefShaderModuleOptions } from './reef-batch.js';
/** What the materials read of a ReefBatch. */
export interface ReefBatchLike {
    prefix: string;
    module: ReefShaderModuleLike;
    record(index: string): string[];
}
/** UniformBlock as the source uses it (structName, `fields.<name>.value` handles). */
export interface ReefUniformBlock {
    structName: string;
    fields: Record<string, {
        value: unknown;
    }>;
}
export type ReefUniformFields = Record<string, [string] | [string, unknown]>;
/** Options of the source's `new Material( { ... } )`. */
export interface ReefMaterialOptions {
    modules: ReefShaderModuleLike[];
    textures: Record<string, unknown>;
    bindings: Record<string, {
        uniform: ReefUniformBlock;
    }>;
    attributes: Record<string, string>;
    varyings: Record<string, string>;
    roughness: number;
    metalness: number;
    name?: string;
    vertex?: string;
    surface?: string;
    side?: string;
    alphaTest?: number;
}
export interface ReefMaterialLike {
    dispose(): void;
}
export interface ReefMaterialGpu {
    ShaderModule: new (o: ReefShaderModuleOptions) => ReefShaderModuleLike;
    UniformBlock: new (structName: string, fields: ReefUniformFields) => ReefUniformBlock;
    Material: new (o: ReefMaterialOptions) => ReefMaterialLike;
    commonModule: ReefShaderModuleLike;
    lodFadeModule: ReefShaderModuleLike;
}
/** Records the block name and fields ({ value } handles: the initial value or null). */
export declare class RecordingUniformBlock implements ReefUniformBlock {
    structName: string;
    fields: Record<string, {
        value: unknown;
    }>;
    constructor(structName: string, fields: ReefUniformFields);
}
/** Records the material options. */
export declare class RecordingMaterial implements ReefMaterialLike {
    options: ReefMaterialOptions;
    disposed: number;
    constructor(o: ReefMaterialOptions);
    dispose(): void;
}
export declare const RECORDING_REEF_MATERIAL_GPU: ReefMaterialGpu;
export declare const aData = "v.aData";
export declare const SURFACE: {
    rock: number;
    star: number;
    brain: number;
    brainWide: number;
    porites: number;
    acropora: number;
    finger: number;
    fire: number;
    plate: number;
    pillar: number;
    gorgonian: number;
    sponge: number;
    urchin: number;
    anemone: number;
    rubble: number;
    grass: number;
    fan: number;
    plume: number;
    lettuce: number;
    algae: number;
    sargassum: number;
};
export declare const f: (x: number) => string;
export declare const srgb: (hex: number) => string;
export declare const packColor: (c: Color) => number;
export declare const REEF_COMMON_WGSL = "\nfn reefUnpackColor( f: f32 ) -> vec3f {\n\tlet u = u32( f + 0.5 ); // the value is exact, but interpolation may leave it a hair below\n\tlet c = vec3f( f32( ( u >> 16u ) & 255u ), f32( ( u >> 8u ) & 255u ), f32( u & 255u ) ) / 255.0;\n\treturn pow( c, vec3f( 2.2 ) );\n}\n\nfn rotateQ( q: vec4f, v: vec3f ) -> vec3f { return v + cross( q.xyz, cross( q.xyz, v ) + v * q.w ) * 2.0; }\n\n// bump mapping from a scalar height field (Mikkelsen's surface gradient; the TSL version worked in\n// view space, this one in world space: the construction is invariant under the view rotation)\nfn bumpNormal( P: vec3f, N: vec3f, height: f32 ) -> vec3f {\n\tlet dpx = dpdx( P ); let dpy = dpdy( P );\n\tlet dhdx = dpdx( height ); let dhdy = dpdy( height );\n\tlet r1 = cross( dpy, N ); let r2 = cross( N, dpx );\n\tlet det = dot( dpx, r1 );\n\tlet grad = sign( det ) * ( dhdx * r1 + dhdy * r2 );\n\treturn normalize( abs( det ) * N - grad );\n}\n";
export declare const FRAG_WGSL: string;
export declare function reefShaderModules(gpu?: ReefMaterialGpu): {
    reefCommonModule: ReefShaderModuleLike;
    fragModule: ReefShaderModuleLike;
};
export declare const reefCommonModule: ReefShaderModuleLike;
export declare const rotateQ: (q: string, v: string) => string;
export declare const bumpNormal: (height: string) => string;
/** What makeSurge reads of the ocean FFT. */
export interface ReefOceanFFT {
    module?: ReefShaderModuleLike | null;
    cascades: number;
    sizes: ArrayLike<number>;
}
export interface ReefSurge {
    module: ReefShaderModuleLike;
    call(xz: string, depth: string, t: string): string;
}
export declare function makeSurge(getOcean: (() => ReefOceanFFT | null) | null | undefined, gpu?: ReefMaterialGpu): ReefSurge;
export declare const VARYINGS: {
    vReefColors: string;
    vReefLocal: string;
    vReefData: string;
    vReefInfo: string;
};
export declare const V: {
    local: string;
    data: string;
    info: string;
};
export declare const reefColors: () => string[];
export declare function createReefView(gpu?: ReefMaterialGpu): ReefUniformBlock;
export declare function reefVertex(batch: ReefBatchLike, surge: ReefSurge, view: unknown, fade?: boolean): string;
export declare const HARD_SURFACE: string;
export declare const SOFT_SURFACE: string;
export interface ReefMaterialsOptions {
    hard: ReefBatchLike;
    soft: ReefBatchLike;
    getOcean?: (() => ReefOceanFFT | null) | null;
    noise: unknown;
    view: ReefUniformBlock | {
        block: ReefUniformBlock;
    };
    fade?: boolean;
}
export declare function createReefMaterials({ hard, soft, getOcean, noise, view, fade: lodFade }: ReefMaterialsOptions, gpu?: ReefMaterialGpu): {
    hard: ReefMaterialLike;
    soft: ReefMaterialLike;
};
