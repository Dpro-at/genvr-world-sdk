/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { CatmullRomCurve3, Vector3 } from 'three';
import { Flyer } from './flight.js';
import { type Rng } from './kit.js';
import type { BirdBatch } from './bird-batch.js';
import type { ShadowBlobs } from './shadow-blobs.js';
import type { SwashSample } from './swash-probe.js';
import { type Viewer, type WildlifeCamera, type WildlifeGlobals, type WildlifeLayout, type WildlifeTerrain } from './context.js';
/** What the shorebirds call on the swash probe (SwashProbe.js). */
export interface ShoreProbe {
    get(i: number, out: SwashSample): SwashSample | null;
    set(i: number, x: number, z: number): void;
    update(): void;
}
export interface Flock {
    x: number;
    range: [number, number];
    n: number;
    birds: Shorebird[];
    state: string;
    drift: number;
    alarm: number;
    cx: number;
    away: number;
    wary: boolean;
    path: CatmullRomCurve3;
    len: number;
    s: number;
    dest: number;
    px: number;
    py: number;
    pz: number;
    hx: number;
    hz: number;
}
export interface Shorebird {
    F: Flock;
    f: Flyer;
    index: number;
    state: string;
    x: number;
    z: number;
    y: number;
    yaw: number;
    v: number;
    vx: number;
    vz: number;
    offset: number;
    margin: number;
    phase: number;
    peck: number;
    peckT: number;
    head: number;
    stop: number;
    hop: number;
    fold: number;
    t: number;
    lx: number;
    lz: number;
    form: [number, number, number];
    scale0?: number;
}
export interface ShorebirdsOptions {
    terrain: WildlifeTerrain;
    probe?: ShoreProbe | null;
    seed?: number;
    globals?: WildlifeGlobals;
    layout?: WildlifeLayout;
}
export declare class Shorebirds {
    terrain: WildlifeTerrain;
    probe: ShoreProbe | null;
    rng: Rng;
    time: number;
    birds: Shorebird[];
    flocks: Flock[];
    G: WildlifeGlobals;
    layout: WildlifeLayout;
    constructor({ terrain, probe, seed, globals, layout }: ShorebirdsOptions);
    newBird(F: Flock, index: number): Shorebird;
    frontGuess(x: number, h?: number): number;
    slopeAt(x: number, z: number, out: Vector3): Vector3;
    update(dt: number, viewer: Viewer | null, batch: BirdBatch, camera: WildlifeCamera, blobs?: ShadowBlobs | null): void;
    updateFlock(F: Flock, dt: number, viewer: Viewer | null, night: number): void;
    groundBird(b: Shorebird, dt: number, viewer: Viewer | null, night: number): void;
    groundPoseOf(b: Shorebird, dt: number, strideLen: number): void;
    flush(F: Flock, viewer: Viewer | null): void;
    flockFlight(F: Flock, dt: number): void;
    flyBird(b: Shorebird, dt: number): void;
}
