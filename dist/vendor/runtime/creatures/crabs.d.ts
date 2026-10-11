import { type Q4, type Rng } from './kit.js';
import type { CritterBatch, CritterRecord } from './critter-batch.js';
import type { ShadowBlobs } from './shadow-blobs.js';
import { type Viewer, type WildlifeCamera, type WildlifeColliders, type WildlifeGlobals, type WildlifeLayout, type WildlifeTerrain, type WildlifeVegetation, type WildlifeVillage } from './context.js';
export interface Burrow {
    x: number;
    z: number;
    y: number;
    yaw: number;
    seed: number;
    size: number;
    resident: boolean;
    crab: Crab | null;
    hideT: number;
    q?: Q4;
}
export interface HermitHome {
    x: number;
    z: number;
    seed: number;
    crab: Crab | null;
    size?: number;
}
export type CrabHome = Burrow | HermitHome;
export interface Crab {
    species: number;
    home: CrabHome;
    seed: number;
    x: number;
    z: number;
    y: number;
    yaw: number;
    bodyYaw: number;
    speed: number;
    vx: number;
    vz: number;
    phase: number;
    pPhase: number;
    stride: number;
    lift: number;
    out: number;
    eyes: number;
    claws: number;
    state: string;
    t: number;
    tx: number;
    tz: number;
    want: number;
    q: Q4;
    pq: Q4;
    px: number;
    py: number;
    pz: number;
    fresh: boolean;
    visible: boolean;
    fade: number;
    alarm: number;
    feed: number;
    size: number;
    target?: CrabHome | null;
    sx?: number;
    sz?: number;
}
export interface CrabsOptions {
    terrain: WildlifeTerrain;
    village?: WildlifeVillage | null;
    colliders?: WildlifeColliders | null;
    vegetation?: WildlifeVegetation | null;
    seed?: number;
    globals?: WildlifeGlobals;
    layout?: WildlifeLayout;
}
export declare class Crabs {
    terrain: WildlifeTerrain;
    rng: Rng;
    burrows: Burrow[];
    homes: HermitHome[];
    grid: Map<number, number[]>;
    ghosts: Crab[];
    hermits: Crab[];
    time: number;
    scan: number;
    nearBurrows: Burrow[];
    _rec: CritterRecord;
    activity: number;
    G: WildlifeGlobals;
    layout: WildlifeLayout;
    constructor({ terrain, village, colliders, vegetation, seed, globals, layout }: CrabsOptions);
    cell(x: number, z: number): number[];
    okGround(x: number, z: number, colliders: WildlifeColliders | null, village: WildlifeVillage | null): boolean;
    sandAt(x: number, z: number): number;
    placeBurrows(village: WildlifeVillage | null, colliders: WildlifeColliders | null): Burrow[];
    placeHomes(vegetation: WildlifeVegetation | null, colliders: WildlifeColliders | null): HermitHome[];
    update(dt: number, viewer: Viewer | null, batch: CritterBatch, camera: WildlifeCamera, blobs?: ShadowBlobs | null): void;
    assign(cp: WildlifeCamera['position']): void;
    newCrab(species: number, home: CrabHome, seed: number): Crab;
    spawnGhost(b: Burrow, dist: number): Crab;
    spawnHermit(h: HermitHome): Crab;
    threat(c: Crab, viewer: Viewer | null): {
        d: number;
        closing: number;
    };
    moveTo(c: Crab, dt: number, v: number, accel?: number): number;
    pickSpot(c: Crab, r0: number, r1: number, downhill?: number): void;
    updateGhost(c: Crab, dt: number, viewer: Viewer | null): void;
    flee(c: Crab, viewer: Viewer): void;
    updateHermit(c: Crab, dt: number, viewer: Viewer | null): void;
    withdraw(c: Crab): void;
    crabRecord(c: Crab, r: CritterRecord, cp: WildlifeCamera['position']): void;
    burrowRecord(b: Burrow, r: CritterRecord, k: number): void;
}
