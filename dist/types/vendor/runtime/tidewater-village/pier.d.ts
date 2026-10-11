/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { Vector3 } from 'three';
import type { Builder } from './geo-builder.js';
import type { VillageContext } from './context.js';
/** Source WorldLayout.js WORLD.pier (world metres, sea level 0, island to -z). */
export declare const WORLD_PIER: {
    readonly x: 55;
    readonly zStart: -64;
    readonly zEnd: 40;
    readonly deckHeight: 2.3;
    readonly width: 2.6;
    readonly headWidth: 14;
    readonly headDepth: 7;
};
export declare const ARCH_H = 2.75;
export declare const PIER: {
    readonly x: 55;
    readonly zStart: -64;
    readonly zEnd: 40;
    readonly deck: 2.3;
    readonly width: 2.6;
    readonly halfW: number;
    readonly headZ0: number;
    readonly headX0: number;
    readonly headX1: number;
    readonly plankT: 0.055;
    readonly pileR: 0.15;
    readonly pileOff: number;
    readonly stringerH: 0.22;
    readonly capH: 0.26;
};
/** A lantern hung on a chain in its own builder (swung by the village; Village.js 652-721). */
export interface HungLantern {
    B: Builder | null;
    pivot: Vector3;
    rest: Vector3;
    live: Vector3;
}
export interface PierInfo {
    lamps: Vector3[];
    bollards: Vector3[];
    hung: HungLantern[];
    signPivot?: Vector3;
    stepFoot?: Vector3;
    ladder?: Vector3;
}
export interface PierContext extends Omit<VillageContext, 'checks'> {
    signB?: Builder | null;
    hang?: (() => Builder) | null;
}
export declare function buildPier({ B, terrain, colliders, rand, lights, inst, signB, hang }: PierContext): PierInfo;
