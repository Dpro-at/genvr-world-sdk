/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { Vector3 } from 'three';
import { Noise2D, type Rng } from './shore-math.js';
import type { Builder } from '../tidewater-village/geo-builder.js';
import { type Ground } from './debris-shapes.js';
/** CPU terrain (TerrainData): heights and masks on a res x res grid of `texel` m cells from `origin`. */
export interface DebrisTerrain {
    size: number;
    res: number;
    texel: number;
    origin: number;
    heights: ArrayLike<number>;
    /** rockiness 0..1 (Float32Array in the source) */
    rock: ArrayLike<number>;
    /** loose sand cover 0..255 */
    sand: ArrayLike<number>;
    /** worn footpaths 0..255 */
    path?: ArrayLike<number> | null | undefined;
    heightAt(x: number, z: number): number;
    pathDistance(x: number, z: number): number;
}
export interface DebrisLane {
    samples: readonly {
        p: {
            x: number;
            z: number;
        };
    }[];
    width?: number | undefined;
}
export interface DebrisBuilding {
    name: string;
    x: number;
    z: number;
    stilts?: boolean | undefined;
    floorY?: number | undefined;
}
export interface DebrisFootprint {
    kind: string;
    x: number;
    z: number;
    r: number;
}
export interface DebrisVillage {
    buildings: readonly DebrisBuilding[];
    path?: DebrisLane | null | undefined;
    sidePaths?: readonly (DebrisLane | null | undefined)[] | undefined;
    getFootprints(): readonly DebrisFootprint[];
}
export interface DebrisPlantRecord {
    x: number;
    z: number;
    s?: number | undefined;
}
export interface DebrisVegetation {
    records?: {
        palms: readonly DebrisPlantRecord[];
        trees?: readonly DebrisPlantRecord[] | undefined;
        bananas?: readonly DebrisPlantRecord[] | undefined;
        youngPalms?: readonly DebrisPlantRecord[] | undefined;
    } | null | undefined;
}
export interface DebrisRocks {
    instances: readonly {
        x: number;
        y: number;
        z: number;
        size: number;
    }[];
}
export interface DebrisColliderBox {
    tag: string;
    center: {
        x: number;
        z: number;
    };
    half: {
        x: number;
        z: number;
    };
    rotY: number;
    walkable?: boolean | undefined;
}
export interface DebrisColliders {
    boxes: readonly DebrisColliderBox[];
    cylinders: readonly {
        x: number;
        z: number;
        radius: number;
        tag: string;
    }[];
    addBox(center: Vector3, half: Vector3, rotY: number, opts: {
        tag: string;
    }): void;
    addCylinder(x: number, z: number, r: number, y0: number, y1: number, opts: {
        tag: string;
    }): void;
}
/** Instanced props sink (Props.js InstancedProps.add). */
export interface DebrisInstances {
    add(type: string, x: number, y: number, z: number, ry?: number, color?: readonly number[] | null, rx?: number, rz?: number): void;
}
/** A photoscanned debris instance (ScannedDebris). */
export interface ScanInstance {
    asset: number;
    x: number;
    y: number;
    z: number;
    yaw: number;
    pitch: number;
    roll: number;
    sx: number;
    sy: number;
    sz: number;
    rnd: number;
}
export interface DebrisPlacerOptions {
    B: Builder;
    inst: DebrisInstances;
    terrain: DebrisTerrain;
    village?: DebrisVillage | null | undefined;
    vegetation?: DebrisVegetation | null | undefined;
    rocks?: DebrisRocks | null | undefined;
    colliders?: DebrisColliders | null | undefined;
    seed?: number | undefined;
    detail?: unknown;
}
interface BoxObstacle {
    t: 0;
    x: number;
    z: number;
    hx: number;
    hz: number;
    c: number;
    s: number;
    pad: number;
    tag: string;
}
interface CircleObstacle {
    t: 1;
    x: number;
    z: number;
    r: number;
    pad: number;
    tag: string;
}
interface CapsuleObstacle {
    t: 2;
    x: number;
    z: number;
    bx: number;
    bz: number;
    r: number;
    pad: number;
    tag: string;
}
export type Obstacle = BoxObstacle | CircleObstacle | CapsuleObstacle;
declare class Obstacles {
    cell: number;
    map: Map<number, Obstacle[]>;
    count: number;
    constructor(cell?: number);
    _insert(o: Obstacle, x0: number, z0: number, x1: number, z1: number): void;
    box(x: number, z: number, hx: number, hz: number, rotY: number, pad?: number, tag?: string): BoxObstacle;
    circle(x: number, z: number, r: number, pad?: number, tag?: string): CircleObstacle;
    capsule(ax: number, az: number, bx: number, bz: number, r: number, pad?: number, tag?: string): CapsuleObstacle;
    dist(x: number, z: number, ignore?: ((o: Obstacle) => boolean) | null): number;
}
declare class Occupancy {
    cell: number;
    map: Map<number, {
        x: number;
        z: number;
        r: number;
    }[]>;
    constructor(cell?: number);
    free(x: number, z: number, r: number, k?: number): boolean;
    add(x: number, z: number, r: number): void;
}
/** A house / shed rectangle from the colliders (_buildingBoxes). */
export interface DebrisHouse {
    name: string;
    stilts: boolean | undefined;
    x: number;
    z: number;
    hx: number;
    hz: number;
    ry: number;
    floorY: number | undefined;
    shed: boolean;
}
/** clear() options. */
export interface ClearOptions {
    path?: number | null;
    spacing?: number;
    ignore?: ((o: Obstacle) => boolean) | null;
}
/** Pebble field density mask (RGBA8, res x res texels of `texel` m). */
export interface PebbleMask {
    data: Uint8Array;
    res: number;
    texel: number;
}
type LogRow = [string, number, number | null];
export declare class DebrisPlacer {
    B: Builder;
    inst: DebrisInstances;
    T: DebrisTerrain;
    village: DebrisVillage | null;
    vegetation: DebrisVegetation | null;
    rocks: DebrisRocks | null;
    colliders: DebrisColliders | null;
    rand: Rng;
    noise: Noise2D;
    detail: unknown;
    ground: Ground;
    obs: Obstacles;
    occ: Occupancy;
    counts: Record<string, number>;
    log: LogRow[];
    newColliders: number;
    rockSpots: [number, number, number][];
    scanned: ScanInstance[];
    doorways: {
        x: number;
        z: number;
        fx: number;
        fz: number;
    }[];
    timings: Record<string, number>;
    houses: DebrisHouse[];
    firePit: [number, number] | null;
    wrackPoints: number;
    /** set by run() (_mask) */
    mask: PebbleMask;
    constructor({ B, inst, terrain, village, vegetation, rocks, colliders, seed, detail }: DebrisPlacerOptions);
    count(k: string, n?: number, x?: number | null, z?: number | null): void;
    _idx(x: number, z: number): number;
    sand(x: number, z: number): number;
    rockM(x: number, z: number): number;
    pathM(x: number, z: number): number;
    slope(x: number, z: number, e?: number): number;
    downhill(x: number, z: number, e?: number): [number, number];
    _buildObstacles(): void;
    clear(x: number, z: number, r: number, { path, spacing, ignore }?: ClearOptions): boolean;
    take(x: number, z: number, r: number): void;
    addBox(x: number, y: number, z: number, hx: number, hy: number, hz: number, ry: number, tag: string): void;
    addCyl(x: number, z: number, r: number, y0: number, y1: number, tag: string): void;
    run(): this;
    _buildingBoxes(): DebrisHouse[];
    _hw(h: DebrisHouse, lx: number, lz: number): [number, number];
    _village(): void;
    _underHut(h: DebrisHouse): void;
    _tone(): number[];
    _float(x: number, z: number): void;
    _group(type: string, x: number, z: number, ry: number, h: DebrisHouse | null): boolean;
    _boatsAndYards(): void;
    _beachPoints(hMin: number, hMax: number, stepX?: number): [number, number, number][];
    _logs(): void;
    _scanLog(asset: number, x: number, z: number, yaw: number, sx: number, sg: number, sink: number): {
        y: number;
        r: number;
        len: number;
    };
    _logClear(x: number, z: number, yaw: number, len: number, r: number, spacing: number): boolean;
    _logTake(x: number, z: number, yaw: number, len: number, r: number): void;
    _logCollider(x: number, z: number, yaw: number, len: number, res: {
        y: number;
        r: number;
    }): void;
    _palmLitter(): void;
    _wrack(): void;
    _wrackItem(type: string, x: number, z: number, h: number, rand: Rng): void;
    _coves(): void;
    _mask(): void;
}
export {};
