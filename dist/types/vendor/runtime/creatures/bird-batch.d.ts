/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { Vector4, type Material, type Mesh } from 'three';
import { type BirdTemplate } from './bird-shapes.js';
import { InstanceRecords, type CascadeShadows, type StorageBufferFactory, type WildlifeMaterialFactory, type WildlifeMaterialOptions, type WildlifeStorageBuffer } from './kit.js';
import type { BirdPoseRecord } from './bird-pose.js';
export interface BirdBatchOptions {
    csm?: CascadeShadows | null;
    capacity?: number;
    storageBuffer?: StorageBufferFactory;
    material?: WildlifeMaterialFactory;
}
export declare class BirdBatch {
    NV: number;
    speciesBuffer: WildlifeStorageBuffer;
    joints: Vector4[];
    built: BirdTemplate[];
    records: InstanceRecords;
    material: Material;
    mesh: Mesh;
    triangles: number;
    constructor({ csm, capacity, storageBuffer, material }?: BirdBatchOptions);
    begin(): void;
    write(b: BirdPoseRecord): void;
    commit(): void;
    get count(): number;
    materialOptions(): WildlifeMaterialOptions;
}
