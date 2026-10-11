/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { BufferGeometry, Vector3 } from 'three';
import { Builder, type Num3 } from './geo-builder.js';
import { type Footprint, type HouseSpec, type ShedSpec } from './buildings.js';
import { buildBoardwalk } from './boardwalk.js';
import { type HungLantern, type PierInfo } from './pier.js';
import { InstancedProps, Rand } from './props.js';
import type { FoundationCheck, VillageColliders, VillageLight, VillageTerrain } from './context.js';
export declare const VILLAGE_SEED = 90210;
export declare const PASTELS: {
    turquoise: number[];
    coral: number[];
    cream: number[];
    sky: number[];
    yellow: number[];
    mint: number[];
    pink: number[];
    white: number[];
    lavender: number[];
    sea: number[];
};
export declare const TRIMS: {
    white: number[];
    cream: number[];
    navy: number[];
    teal: number[];
    red: number[];
    green: number[];
    yellow: number[];
    blue: number[];
};
export declare const ROOFS: {
    red: number[];
    green: number[];
    blue: number[];
    teal: number[];
    rust: number[];
    grey: number[];
};
export declare const CURTAINS: number[][];
export interface VillageSpecs {
    houses: HouseSpec[];
    sheds: ShedSpec[];
    boathouse: {
        x: number;
        z: number;
        yaw: number;
        wall: Num3;
        paint: number;
    };
    stall: {
        x: number;
        z: number;
        yaw: number;
    };
}
/** Source Village._layout: houses A-N, stilt huts S1-S3, sheds 1-4, boathouse, stall (draws from rand). */
export declare function villageLayout(rand: Rand): VillageSpecs;
/** Boardwalk control points (Village.js 98-100, 121-124). The main walk starts at the pier step foot. */
export declare const BOARDWALK_MAIN: readonly [readonly [54.6, -72], readonly [52.4, -82], readonly [48.4, -92], readonly [44.8, -100.5], readonly [42.6, -107.2]];
export declare const BOARDWALK_SIDE_PATHS: readonly [readonly [readonly [36.8, -110.6], readonly [32, -109.3], readonly [27.4, -107.6]], readonly [readonly [46.8, -97.8], readonly [53.5, -98.5], readonly [61.7, -99.1]]];
export declare function flattenPads(t: VillageTerrain, specs: VillageSpecs): void;
/** Everything the Village constructor built before _assemble (the CPU half of the source class). */
export interface VillageBuild {
    B: Builder;
    signB: Builder;
    inst: InstancedProps;
    rand: Rand;
    specs: VillageSpecs;
    pierInfo: PierInfo;
    path: ReturnType<typeof buildBoardwalk>;
    sidePaths: ReturnType<typeof buildBoardwalk>[];
    lights: VillageLight[];
    footprints: Footprint[];
    foundationChecks: FoundationCheck[];
    buildings: {
        name: string | undefined;
        x: number;
        z: number;
        floorY: number;
        roofTop: number;
        stilts: boolean;
        footprint: Footprint;
    }[];
}
/** Source Village constructor 62-131: layout, pads, pier, boardwalks, plaza, houses, sheds, boathouse, stall, props. */
export declare function buildVillage({ terrain, colliders }: {
    terrain: VillageTerrain;
    colliders: VillageColliders;
}): VillageBuild;
export declare const OPAQUE_KEYS: readonly ["wood", "hard", "roofMetal", "thatch", "stone"];
export type OpaqueKey = typeof OPAQUE_KEYS[number];
export interface VillageAssembly {
    /** All opaque geometry in one vertex / index buffer; each material draws `ranges[ key ]`. */
    shared: BufferGeometry;
    ranges: Partial<Record<OpaqueKey, {
        start: number;
        count: number;
    }>>;
    /** Index count of `shared`: the wood mesh widens its draw range to this in shadow passes. */
    total: number;
    shadowTriangles: number;
    fabric: BufferGeometry | null;
    nets: BufferGeometry | null;
    fishProps: unknown;
}
/** Source _assemble 498-574: folds glass / rope / cloth / net / flag into wood / hard / fabric / nets. Empties B. */
export declare function assembleVillage(B: Builder): VillageAssembly;
/** Source _buildSign 624-650: the sign's wood / hard geometry relative to its pivot (chain tops). */
export declare function buildSignGeometry(S: Builder, pivot: Vector3): {
    key: "wood" | "hard";
    geometry: BufferGeometry;
}[];
export interface LanternSwing {
    pivot: Vector3;
    rest: Vector3;
    live: Vector3;
    t: number;
    ph: number;
    x: number;
    z: number;
    vx: number;
    vz: number;
    geometries: {
        key: 'wood' | 'hard';
        geometry: BufferGeometry;
    }[];
    /** Rotation (x, y, z) of the lantern group about its pivot after the last swingLanterns. */
    rotation: Vector3;
}
/** Source _buildLanterns 655-690 (random start phases from `random`, Math.random in the source). */
export declare function buildLanterns(hung: HungLantern[], random?: () => number): LanternSwing[];
/** Wind of the frame (source G.windSpeed.value, G.windDir.value.x / .y). */
export interface VillageWind {
    speed: number;
    dirX: number;
    dirZ: number;
}
/** Source _updateLanterns 692-721: damped pendulums pushed by the wind; moves `live` (the light). */
export declare function swingLanterns(lanterns: LanternSwing[], dt: number, wind: VillageWind): void;
/** Sign swing state (source this._swing): swing a (about x) and twist b (about y). */
export interface SignSwing {
    t: number;
    a: number;
    av: number;
    b: number;
    bv: number;
}
export declare const SIGN_SWING_W = 4.9;
export declare const SIGN_TWIST_W = 10.5;
export declare function createSignSwing(): SignSwing;
/** Source update 723-752: the sign group rotation is ( s.a, s.b, 0 ) with order YXZ. */
export declare function swingSign(s: SignSwing, dt: number, wind: VillageWind): SignSwing;
