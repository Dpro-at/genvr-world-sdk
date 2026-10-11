/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { Vector4, type Material, type Mesh } from 'three';
import { type CritterTemplate } from './critter-shapes.js';
import { InstanceRecords, type StorageBufferFactory, type WgslModule, type WildlifeMaterialFactory, type WildlifeMaterialOptions, type WildlifeStorageBuffer, type Q4 } from './kit.js';
/** One critter instance as Crabs hands it to write(). */
export interface CritterRecord {
    x: number;
    y: number;
    z: number;
    scale: number;
    q: Q4;
    species: number;
    phase: number;
    stride: number;
    lift: number;
    out: number;
    eyes: number;
    claws: number;
    seed: number;
    px: number;
    py: number;
    pz: number;
    pPhase: number;
    pq: Q4;
}
export interface CritterBatchOptions {
    capacity?: number;
    storageBuffer?: StorageBufferFactory;
    material?: WildlifeMaterialFactory;
}
export declare class CritterBatch {
    template: CritterTemplate;
    bodyBuffer: WildlifeStorageBuffer;
    limbs: Vector4[];
    records: InstanceRecords;
    helpers: WgslModule;
    material: Material;
    mesh: Mesh;
    triangles: number;
    constructor({ capacity, storageBuffer, material }?: CritterBatchOptions);
    begin(): void;
    write(c: CritterRecord): void;
    commit(): void;
    get count(): number;
    materialOptions(): WildlifeMaterialOptions;
}
