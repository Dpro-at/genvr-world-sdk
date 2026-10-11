/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { Vector3 } from 'three';
export type P2 = [number, number];
declare const clamp01: (x: number) => number;
declare const lerp: (a: number, b: number, t: number) => number;
declare const sstep: (a: number, b: number, x: number) => number;
export declare const RHO_SEAWATER = 1025;
export interface Stem {
    k: number;
    R: number;
    yF: number;
    zW: number;
    yc: number;
    zc: number;
    yT: number;
}
export interface HullField {
    bottom: Float32Array;
    nx: number;
    nz: number;
    cell: number;
    x0: number;
    z0: number;
}
export interface HullSample {
    position: Vector3;
    area: number;
    depth: number;
    bottomY: number;
}
export declare class HullLines {
    zAft: number;
    zBow: number;
    length: number;
    deckY: number;
    shell: number;
    houseBack: number;
    houseFront: number;
    stem: Stem;
    _setback: Map<number, Float64Array>;
    _sectionCache: Map<string, Float64Array>;
    wlStart: number;
    wlEnd: number;
    _beamTable: Float64Array<ArrayBuffer>;
    _tableZ0: number;
    _tableDz: number;
    _field: HullField;
    waterplaneArea: number;
    canoeVolume: number;
    centerOfFlotationZ: number;
    centerOfBuoyancy: Vector3;
    constructor();
    sheerZ(t: number): number;
    tAtSheerZ(z: number): number;
    sheerY(t: number): number;
    sheerX(t: number): number;
    keelY(t: number): number;
    chineX(t: number): number;
    chineY(t: number): number;
    bilgeTangent(t: number): number;
    bottomConvexity(t: number): number;
    flare(t: number): number;
    bowBlend(t: number): number;
    stemZ(y: number): number;
    controlPoints(t: number): P2[];
    sectionPoints(t: number, density?: number): Float64Array<ArrayBufferLike>;
    setback(density?: number): Float64Array<ArrayBufferLike>;
    sectionCount(density?: number): number;
    station(t: number, density?: number): Vector3[];
    stationParams(count: number): number[];
    halfBreadth(t: number, y: number): number;
    tAt(z: number, y: number): number;
    zOnStation(t: number, y: number): number;
    hullXAt(z: number, y: number): number;
    analyze(): void;
    halfBeamAt(z: number): number;
    draftAt(z: number): number;
    bottomAt(x: number, z: number): number;
    buildHullSamples(slices?: number): HullSample[];
}
export { sstep, lerp, clamp01 };
