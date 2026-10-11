/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { Vector3 } from 'three';
import type { VillageContext } from './context.js';
export interface BoardwalkOptions {
    width?: number;
    lift?: number;
    startY?: number;
    lightEvery?: number;
}
export interface BoardwalkSample {
    p: Vector3;
    tan: Vector3;
    nx: number;
    nz: number;
    g: number;
    gLow: number;
    yaw: number;
}
export declare const BOARDWALK_WIDTH = 1.8;
export declare function buildBoardwalk(ctx: Omit<VillageContext, 'inst'>, pts: readonly (readonly [number, number])[], opts?: BoardwalkOptions): {
    samples: BoardwalkSample[];
    deck: number[];
    length: number;
    width: number;
};
