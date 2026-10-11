/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { type Material, type Mesh } from 'three';
import { InstanceRecords, type StorageBufferFactory, type WildlifeMaterialFactory, type WildlifeMaterialOptions } from './kit.js';
/** Source engine/render/SceneRenderer.js 18 LAYERS.TRANSPARENT (the late pass layer of the source renderer). */
export declare const LAYER_TRANSPARENT = 2;
export interface ShadowBlobsOptions {
    capacity?: number;
    storageBuffer?: StorageBufferFactory;
    material?: WildlifeMaterialFactory;
    transparentLayer?: number;
}
export declare class ShadowBlobs {
    records: InstanceRecords;
    materialOptions: WildlifeMaterialOptions;
    material: Material;
    mesh: Mesh;
    constructor({ capacity, storageBuffer, material, transparentLayer }?: ShadowBlobsOptions);
    begin(): void;
    add(x: number, y: number, z: number, radius: number, height: number, darkness?: number, sx?: number, sz?: number): void;
    commit(): void;
}
