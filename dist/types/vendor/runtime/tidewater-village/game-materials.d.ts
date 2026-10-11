/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { MeshStandardMaterial, Vector3 } from 'three';
import { type WgslModule } from './materials.js';
export declare const PAT: {
    readonly plain: 0;
    readonly wood: 1;
    readonly cloth: 2;
    readonly skin: 3;
    readonly cork: 4;
    readonly rusty: 5;
    readonly woodX: 6;
    readonly woodZ: 7;
    readonly carbon: 8;
    readonly thread: 9;
    readonly eva: 10;
    readonly braid: 11;
    readonly machined: 12;
    readonly knurl: 13;
    readonly rubber: 14;
};
export declare const gameModule: WgslModule;
/** A source engine uniform declaration: [ WGSL type, initial value ]. */
export type WgslUniform = readonly [string, unknown];
export interface PropMaterialExtra {
    uniforms?: Record<string, WgslUniform> | undefined;
    vertex?: string | undefined;
    clearcoat?: boolean | undefined;
}
/** What the source passed to standard() for a prop material. */
export interface PropMaterialOptions {
    vertexColors: boolean;
    modules: WgslModule[];
    attributes: Record<string, string>;
    varyings: Record<string, string>;
    uniforms: Record<string, WgslUniform>;
    vertex: string;
}
export interface PropMaterialSpec {
    name: string;
    options: PropMaterialOptions;
    defines: Record<string, number>;
    surface: string;
}
/** Source createPropMaterial as data. */
export declare function propMaterialSpec(name?: string, extra?: PropMaterialExtra): PropMaterialSpec;
/** Three.js stand-in for the source createPropMaterial: vertex colours, no per-vertex aux or patterns. */
export declare function createPropMaterial(name?: string, extra?: PropMaterialExtra): MeshStandardMaterial;
/** What the source passed to standard() for the fishing line. */
export interface LineMaterialOptions {
    color: number;
    roughness: number;
    side: 'double';
    uniforms: {
        lineA: WgslUniform;
        lineB: WgslUniform;
        lineCtl: WgslUniform;
        lineShow: WgslUniform;
    };
    attributes: Record<string, string>;
    vertex: string;
}
export interface LineMaterialSpec {
    name: string;
    options: LineMaterialOptions;
    /** { value } handles over the uniform initial values (shared objects, as the engine's uniforms) */
    uniforms: {
        lineA: {
            value: Vector3;
        };
        lineB: {
            value: Vector3;
        };
        lineCtl: {
            value: Vector3;
        };
        lineShow: {
            value: number;
        };
    };
    receiveShadows: boolean;
}
export declare function lineMaterialSpec(): LineMaterialSpec;
