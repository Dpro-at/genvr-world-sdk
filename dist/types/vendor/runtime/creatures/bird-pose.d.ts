/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { type BirdSpecies } from './bird-shapes.js';
import { type Q4, type V3 } from './kit.js';
/** One bird's pose as the renderer wants it (BirdBatch.write). */
export interface BirdPoseRecord {
    species: number;
    seed: number;
    sp: BirdSpecies;
    pos: V3;
    scale: number;
    q: Q4;
    QA: Q4;
    QB: Q4;
    QC: Q4;
    qH: Q4;
    headOff: V3;
    fold: number;
    kneeL: V3;
    footL: V3;
    kneeR: V3;
    footR: V3;
    tailPitch: number;
    tailSpread: number;
    pPos: V3;
    pScale: number;
    pQ: Q4;
    pQA: Q4;
    pQB: Q4;
    pQC: Q4;
    fresh: boolean;
}
/** Glide articulation of a species (Flight.FLIGHT[ s ].glide). */
export interface WingGlide {
    elev: number;
    sweep: number;
    twist: number;
    elbow: number;
    wrist: number;
    hand: number;
}
export declare function createPose(species: number, seed?: number): BirdPoseRecord;
export declare function storePrevious(P: BirdPoseRecord): void;
export declare function resetPrevious(P: BirdPoseRecord): void;
export declare function setWings(P: BirdPoseRecord, elev: number, sweep: number, twist: number, elbow: number, wrist: number, hand: number, handTwist?: number): void;
export declare function flapWings(P: BirdPoseRecord, g: WingGlide, ph: number, amp: number, extra?: number): void;
export declare function solveLeg(knee: V3, foot: V3, hx: number, hy: number, hz: number, fx: number, fy: number, fz: number, a: number, b: number): void;
export declare function setLegs(P: BirdPoseRecord, lx: number, ly: number, lz: number, rx: number, ry: number, rz: number): void;
export declare function tuckLegs(P: BirdPoseRecord, dangle?: number): void;
export declare function setHead(P: BirdPoseRecord, yaw: number, pitch: number, ox?: number, oy?: number, oz?: number): void;
export declare function standHeight(sp: BirdSpecies, bend?: number): number;
export declare const clampAngle: (a: number, m: number) => number;
export declare function groundPose(P: BirdPoseRecord, x: number, y: number, z: number, yaw: number, pitch: number, height: number, phase?: number, stride?: number, lift?: number, spread?: number): void;
