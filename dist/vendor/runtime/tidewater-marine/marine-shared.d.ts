/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import type { BufferGeometry, Object3D } from 'three';
export declare function mulberry32(seed: number): () => number;
/** Smoothstep share of `dist` over [start, end] (0 before, 1 after). */
export declare function bandFade(dist: number, start: number, end: number): number;
/** A WGSL module record (the source's ShaderModule options). */
export declare class WgslModule {
    name: string;
    deps?: unknown[];
    uniforms?: unknown;
    uniformName?: string;
    bindings?: unknown;
    code: string;
    constructor(options: {
        name: string;
        code: string;
        deps?: unknown[];
        uniforms?: unknown;
        uniformName?: string;
        bindings?: unknown;
    });
}
/** A uniform block record (the source's UniformBlock( name, fields, options )). */
export declare class WgslUniformBlock {
    name: string;
    fields: Record<string, [string, unknown]>;
    options: Record<string, unknown>;
    constructor(name: string, fields: Record<string, [string, unknown]>, options?: Record<string, unknown>);
}
/** A material record (the source's engine Material options), with `{ value }` uniform handles. */
export declare class WgslMaterial {
    name: string;
    options: Record<string, unknown>;
    uniforms: Record<string, {
        value: unknown;
    }>;
    disposed: number;
    constructor(options: Record<string, unknown>);
    dispose(): void;
}
/** Engine modules the fish material depends on (src/engine/render/wgsl/common.js, materials/LODFade.js). */
export declare const COMMON_MODULE: {
    name: string;
};
export declare const LOD_FADE_MODULE: {
    name: string;
};
/** One model at one level of detail ("kind") of a batch. */
export interface MarineBatchKind {
    geometry: BufferGeometry;
    model?: string;
    lod?: number;
    shadow?: boolean;
    shadowOnly?: boolean;
}
export interface MarineBatchOptions {
    maxInstances: number;
    dynamic?: boolean;
    fade?: boolean;
}
/** Many instanced models in one render object: per-instance data (16 floats), per-frame kind lists. */
export interface MarineBatch {
    /** 16 floats per instance: four vec4 records. */
    data: Float32Array;
    /** three-style handle: `needsUpdate = true` uploads the data. */
    dataAttr: {
        needsUpdate: boolean;
    };
    fadeMesh: Object3D | null;
    /** WGSL module with the instance storage and lookups (added to the material's modules). */
    module: unknown;
    upload(): void;
    begin(): void;
    add(kind: number, id: number): void;
    addFade(kind: number, id: number, fade: number, outgoing: boolean): void;
    commit(): void;
    createMesh(material: unknown, options?: {
        castShadow?: boolean;
        receiveShadow?: boolean;
    }): Object3D;
    createFadeMesh(material: unknown): Object3D;
    /** WGSL expressions for a vertex snippet (see ReefBatch.js 182-230). */
    fadeEntry(): string;
    recordIndex(): string;
    record(index: string): string[];
    dispose(): void;
}
export type MarineBatchClass = new (name: string, kinds: MarineBatchKind[], options: MarineBatchOptions) => MarineBatch;
/** Inject the batch class (the reef port's ReefBatch); returns the previous one. */
export declare function setMarineBatch(cls: MarineBatchClass | null): MarineBatchClass | null;
export declare function marineBatchClass(): MarineBatchClass;
/** Inject the renderer's frame counter; returns the previous source. */
export declare function setMarineFrame(fn: () => number): () => number;
export declare const marineFrame: () => number;
