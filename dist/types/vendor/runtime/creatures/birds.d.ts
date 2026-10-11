/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { CatmullRomCurve3, Vector2, Vector3 } from 'three';
import { Flyer } from './flight.js';
import { type Rng } from './kit.js';
import type { BirdBatch } from './bird-batch.js';
import { type Viewer, type WildlifeBoat, type WildlifeBoatModel, type WildlifeCamera, type WildlifeColliders, type WildlifeGlobals, type WildlifeLayout, type WildlifeSpray, type WildlifeTerrain, type WildlifeVillage } from './context.js';
export type BirdKind = 'gull' | 'tern' | 'pelican' | 'frigate';
export interface Perch {
    x: number;
    y: number;
    z: number;
    kind: string;
    kinds: string[];
    bird: BirdAgent | null;
    yawJitter: number;
    local?: Vector3;
}
/** One bird (the source's plain agent object; fields appear as its states need them). */
export interface BirdAgent {
    kind: BirdKind;
    f: Flyer;
    state: string;
    t: number;
    perch: Perch | null;
    id: number;
    hy: number;
    hp: number;
    hyT: number;
    hpT: number;
    headT: number;
    visible: boolean;
    lane: {
        x0: number;
        x1: number;
        z: number;
        y: number;
    };
    slot: number;
    home: {
        x: number;
        z: number;
    };
    circle: {
        x: number;
        y: number;
        z: number;
        r: number;
        dir: number;
        t: number;
    };
    center: {
        x: number;
        z: number;
        y: number;
        r: number;
        dir: number;
    };
    goal: {
        x: number;
        y: number;
        z: number;
    };
    fold: number;
    perchYaw: number;
    shuffle: number;
    stretch: number;
    alarm?: number;
    land: {
        x0: number;
        y0: number;
        z0: number;
        vx: number;
        vy: number;
        vz: number;
        T: number;
        h: number;
    };
    dir?: number;
    twist: number;
    floatYaw: number;
}
/** Water heights for birds on the sea (Wildlife.WaterHeights). */
export interface BirdWater {
    height(key: unknown, x: number, z: number): number;
}
export interface SquadPath {
    curve: CatmullRomCurve3;
    length: number;
    pt: Vector3;
    tan: Vector3;
}
export interface BirdsOptions {
    terrain: WildlifeTerrain;
    village?: WildlifeVillage | null;
    colliders?: WildlifeColliders | null;
    boat?: WildlifeBoat | null;
    boatModel?: WildlifeBoatModel | null;
    water: BirdWater;
    spray?: WildlifeSpray | null;
    seed?: number;
    globals?: WildlifeGlobals;
    layout?: WildlifeLayout;
}
export declare class Birds {
    terrain: WildlifeTerrain;
    boat: WildlifeBoat | null;
    boatModel: WildlifeBoatModel | null;
    water: BirdWater;
    spray: WildlifeSpray | null;
    rng: Rng;
    time: number;
    agents: BirdAgent[];
    perches: Perch[];
    wind: Vector2;
    squad: BirdAgent[];
    squadPath: SquadPath;
    squadS: number;
    squadFlap: number;
    squadBeat?: number;
    squadBeats?: number;
    lastViewer?: Viewer | null;
    G: WildlifeGlobals;
    layout: WildlifeLayout;
    railTop: number;
    constructor({ terrain, village, colliders, boat, boatModel, water, spray, seed, globals, layout, }: BirdsOptions);
    buildPerches(village: WildlifeVillage | null, colliders: WildlifeColliders | null): Perch[];
    perchPosition(p: Perch, out: Vector3): Vector3;
    settle(a: BirdAgent, p: Perch | null): void;
    unperch(a: BirdAgent): void;
    startRoam(a: BirdAgent, x: number, y: number, z: number): void;
    startForage(a: BirdAgent, x: number, z: number): void;
    takeOff(a: BirdAgent, ux: number, uz: number): void;
    windYaw(): number;
    update(dt: number, viewer: Viewer | null, batch: BirdBatch, camera: WildlifeCamera): void;
    threat(viewer: Viewer | null | undefined, x: number, y: number, z: number): number;
    idleHead(a: BirdAgent, dt: number, pitch0?: number, range?: number): void;
    perchedPose(a: BirdAgent, dt: number): void;
    boatYaw(): number;
    takeoffStep(a: BirdAgent, dt: number, then: () => void): void;
    beginLanding(a: BirdAgent, p: Perch): void;
    landStep(a: BirdAgent, dt: number): void;
    updateGull(a: BirdAgent, dt: number, viewer: Viewer | null, day: number): void;
    newGullGoal(a: BirdAgent, viewer?: Viewer | null | undefined): void;
    pickPerch(a: BirdAgent, viewer: Viewer | null, roost: boolean): Perch | null;
    flyTo(a: BirdAgent, dt: number, x: number, y: number, z: number, speed: number, power: number, turn?: number): void;
    updateTern(a: BirdAgent, dt: number, viewer: Viewer | null): void;
    splash(x: number, y: number, z: number, k: number): void;
    buildSquadPath(): {
        curve: CatmullRomCurve3;
        length: number;
        pt: Vector3;
        tan: Vector3;
    };
    updateSquad(dt: number): void;
    squadMember(a: BirdAgent, dt: number): void;
    updatePelican(a: BirdAgent, dt: number, viewer: Viewer | null): void;
    updateFrigate(a: BirdAgent, dt: number): void;
}
