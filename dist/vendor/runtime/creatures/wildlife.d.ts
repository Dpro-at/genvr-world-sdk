/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import type { Object3D } from 'three';
import { BirdBatch } from './bird-batch.js';
import { Birds } from './birds.js';
import { CritterBatch } from './critter-batch.js';
import { Crabs } from './crabs.js';
import { ShadowBlobs } from './shadow-blobs.js';
import { type SwashProbeGpu, type SwashShore, type SwashTerrainGpu } from './swash-probe.js';
import { Shorebirds } from './shorebirds.js';
import { type CascadeShadows, type StorageBufferFactory, type WildlifeMaterialFactory } from './kit.js';
import { type Viewer, type WildlifeBoat, type WildlifeBoatModel, type WildlifeCamera, type WildlifeColliders, type WildlifeGlobals, type WildlifeLayout, type WildlifeSpray, type WildlifeTerrain, type WildlifeVegetation, type WildlifeVillage, type WildlifeWaterQuery } from './context.js';
/** The walker / swimmer / boat the animals react to (Player.js position and mode). */
export interface WildlifePlayer {
    position: {
        x: number;
        y: number;
        z: number;
    };
    mode: string;
}
export type WildlifeTest = (birds: BirdBatch, dt: number, critters: CritterBatch, blobs: ShadowBlobs) => void;
export interface WildlifeOptions {
    scene: {
        add(o: Object3D): unknown;
    };
    renderer?: unknown;
    terrain: WildlifeTerrain;
    terrainGPU?: SwashTerrainGpu | null;
    shore?: SwashShore | null;
    village?: WildlifeVillage | null;
    colliders?: WildlifeColliders | null;
    vegetation?: WildlifeVegetation | null;
    boat?: WildlifeBoat | null;
    boatModel?: WildlifeBoatModel | null;
    query?: WildlifeWaterQuery | null;
    spray?: WildlifeSpray | null;
    csm?: CascadeShadows | null;
    globals?: WildlifeGlobals;
    layout?: WildlifeLayout;
    storageBuffer?: StorageBufferFactory;
    material?: WildlifeMaterialFactory;
    swashGpu?: SwashProbeGpu;
    now?: () => number;
}
export declare class WaterHeights {
    query: WildlifeWaterQuery | null;
    n: number;
    start: number;
    keys: unknown[];
    used: Int32Array;
    since: Int32Array;
    frame: number;
    constructor(query: WildlifeWaterQuery | null, n?: number);
    height(key: unknown, x: number, z: number): number;
    endFrame(): void;
}
export declare class Wildlife {
    terrain: WildlifeTerrain;
    birdBatch: BirdBatch;
    critterBatch: CritterBatch;
    crabs: Crabs;
    blobs: ShadowBlobs;
    shorebirds: Shorebirds;
    water: WaterHeights;
    birds: Birds;
    viewer: Viewer;
    test: WildlifeTest | null;
    cpuMs: number;
    now: () => number;
    constructor({ scene, renderer, terrain, terrainGPU, shore, village, colliders, vegetation, boat, boatModel, query, spray, csm, globals, layout, storageBuffer, material, swashGpu, now, }: WildlifeOptions);
    updateViewer(dt: number, camera: WildlifeCamera, player: WildlifePlayer | null): Viewer | null;
    update(dt: number, camera: WildlifeCamera, player?: WildlifePlayer | null): void;
}
