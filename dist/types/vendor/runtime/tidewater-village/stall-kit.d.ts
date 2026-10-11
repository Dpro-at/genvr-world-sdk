/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { BufferGeometry, CylinderGeometry, DataArrayTexture, LatheGeometry, Matrix4, MeshStandardMaterial, SphereGeometry, TorusGeometry, Vector3 } from 'three';
import { type WgslModule } from './materials.js';
export declare const LAYER: {
    readonly WALL: 0;
    readonly DECK: 1;
    readonly TIN: 2;
    readonly PAINTED: 3;
    readonly PROP: 100;
    readonly ICE: -1;
    readonly SIGN: -2;
    readonly CHALK: -3;
    readonly PLAIN: -4;
    readonly ROPE: -5;
    readonly FLOAT: -6;
    readonly DIAL: -7;
};
export interface StallSurface {
    name: string;
    size: number;
    grain: 'u' | 'v';
}
export declare const SURF: readonly StallSurface[];
/** An atlas rect in uv: [ u0, v0, u1, v1 ]. */
export type AtlasRect = readonly number[];
export declare const ATLAS: {
    readonly joe: readonly [0, 0, 1, 0.25];
    readonly marta: readonly [0, 0.25, 0.72, 0.5];
    readonly prices: readonly [0, 0.5, 0.5, 1];
    readonly dial: readonly [0.75, 0.5, 1, 1];
};
export declare const RIBS = 16, RIB_PHASE = 1.029, RIB_AMP = 0.011;
/** Source BASE without the Vite BASE_URL prefix (the web app's public path is chosen by the item slice). */
export declare const STALL_ASSET_BASE = "/models/props/";
export interface StallPropInfo {
    vOff: number;
    vCount: number;
    iOff: number;
    iCount: number;
    min: number[];
    max: number[];
}
/** props.json written by the source's tools/props/build.mjs. */
export interface StallAssetInfo {
    vertexFloats: number;
    vertexCount: number;
    indexCount: number;
    indexByteOffset: number;
    layers: string[];
    props: Record<string, StallPropInfo>;
}
/** What KitBuilder.prop / bounds read (props.bin: interleaved pos3 nrm3 uv2 layer1, then uint32 indices). */
export interface StallGeometryAssets {
    info: StallAssetInfo;
    verts: Float32Array;
    index: Uint32Array;
}
export interface StallImage {
    width: number;
    height: number;
    data: ArrayLike<number>;
}
/** Injected IO (source: fetch / globalThis.__assetFile and the engine's decodeImage). */
export interface StallAssetIO {
    bytes(url: string): Promise<ArrayBuffer>;
    decode(bytes: Uint8Array, mime: string): StallImage | Promise<StallImage>;
    /** folder holding props.json / props.bin / the jpgs and signs.png (default STALL_ASSET_BASE) */
    base?: string | undefined;
}
export interface StallTextureSet {
    a: DataArrayTexture;
    n: DataArrayTexture;
    r: DataArrayTexture;
}
export interface StallAssets extends StallGeometryAssets {
    surf: StallTextureSet;
    prop: StallTextureSet;
    signs: DataArrayTexture;
    material: MeshStandardMaterial;
    loadMs: number;
}
/** Source bytes() over fetch (without the source's globalThis.__assetFile test hook). */
export declare function fetchStallBytes(url: string): Promise<ArrayBuffer>;
export declare function arrayTexture(label: string, imgs: readonly StallImage[], srgb: boolean): DataArrayTexture;
export declare function loadStallAssets(io: StallAssetIO): Promise<StallAssets>;
export declare const kitModule: WgslModule;
/** Texture binding -> source texture label (StallAssets: surf.a / .n / .r, prop.a / .n / .r, signs). */
export declare const STALL_TEXTURE_BINDINGS: {
    readonly skSurfA: "stallSurfA";
    readonly skSurfN: "stallSurfN";
    readonly skSurfR: "stallSurfR";
    readonly skPropA: "stallPropA";
    readonly skPropN: "stallPropN";
    readonly skPropR: "stallPropR";
    readonly skSigns: "stallSigns";
};
/** Everything the source passed to the engine's standard() for the stall material. */
export interface StallMaterialSpec {
    name: string;
    vertexColors: boolean;
    modules: WgslModule[];
    attributes: Record<string, string>;
    varyings: Record<string, string>;
    textures: Record<string, string>;
    vertex: string;
    defines: Record<string, number>;
    surface: string;
}
export declare function stallMaterialSpec(): StallMaterialSpec;
/** Three.js stand-in for the source createStallMaterial: vertex colours (tints) only, no texture layers. */
export declare function createStallMaterial(): MeshStandardMaterial;
type XYZ = {
    x: number;
    y: number;
    z: number;
};
export type KitColor = readonly number[];
export type KitAxis = 'x' | 'y' | 'z';
export interface KitBoxOptions {
    layer?: number | undefined;
    color?: KitColor | undefined;
    off?: readonly number[] | undefined;
    along?: KitAxis | undefined;
    uv2Rect?: AtlasRect | undefined;
    params?: readonly number[] | undefined;
}
export interface KitGeometryOptions {
    layer?: number | undefined;
    color?: KitColor | undefined;
    params?: readonly number[] | undefined;
    uvScale?: readonly number[] | undefined;
    uv2FromUV?: AtlasRect | undefined;
}
export interface KitDiscOptions {
    layer?: number | undefined;
    uv2Rect?: AtlasRect | undefined;
    color?: KitColor | undefined;
}
export declare function place(x: number, y: number, z: number, ry?: number, rx?: number, rz?: number, s?: number): Matrix4;
export declare class KitBuilder {
    assets: StallGeometryAssets | null;
    pos: number[];
    nrm: number[];
    uv: number[];
    col: number[];
    layer: number[];
    uv2: number[];
    idx: number[];
    seed: number;
    constructor(assets: StallGeometryAssets | null, seed?: number);
    rnd(): number;
    jit(a: number): number;
    _vert(p: XYZ, n: XYZ, uv: readonly number[], col: KitColor, layer: number, uv2: readonly number[]): number;
    box(w: number, h: number, d: number, matrix: Matrix4, o?: KitBoxOptions): void;
    geometry(g: BufferGeometry, matrix: Matrix4, o?: KitGeometryOptions): void;
    rope(points: readonly Vector3[], r?: number, color?: KitColor, radial?: number): void;
    coil(x: number, y: number, z: number, r?: number, turns?: number, rr?: number, color?: KitColor): void;
    corrugated(w: number, l: number, matrix: Matrix4, u0?: number, color?: KitColor): void;
    ice(w: number, d: number, matrix: Matrix4, lump?: number): void;
    disc(r: number, matrix: Matrix4, o?: KitDiscOptions): void;
    prop(name: string, matrix: Matrix4): void;
    bounds(name: string): StallPropInfo | undefined;
    build(): BufferGeometry<import("three").NormalBufferAttributes, import("three").BufferGeometryEventMap>;
}
export interface PropLayerFix {
    layer: Float32Array;
    uv2: Float32Array;
}
export declare function propLayers(A: StallGeometryAssets, name: string, P: StallPropInfo): PropLayerFix | null;
export declare const Shapes: {
    cylinder: (rt: number, rb: number, h: number, seg?: number, open?: boolean) => CylinderGeometry;
    torus: (r: number, t: number, rs?: number, ts?: number) => TorusGeometry;
    sphere: (r: number, ws?: number, hs?: number) => SphereGeometry;
    lathe: (pts: readonly (readonly number[])[], seg?: number) => LatheGeometry;
};
export {};
