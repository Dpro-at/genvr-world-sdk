/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { CatmullRomCurve3, Quaternion, Vector3 } from 'three';
export declare const WHALE_SOURCE_ROUTE: readonly (readonly [number, number])[];
/** One key of the surfacing sequence (or the cruise target). */
export interface WhaleKey {
    t?: number;
    depth: number;
    pitch: number;
    arch: number;
    follow: number;
    speed: number;
    stroke: number;
    blow?: boolean;
    fluke?: boolean;
    breach?: 'launch' | 'air';
}
/** GPU water height read-back (the source's water query). */
export interface WaterQuery {
    allocate(name: string, n: number): number;
    setPoint(slot: number, x: number, z: number): void;
    cpuValid: boolean;
    get(slot: number): {
        height: number;
    };
}
export interface WhaleFin {
    sweep: number;
    lift: number;
    twist: number;
    vs: number;
    vl: number;
    vt: number;
}
export declare class WhaleBrain {
    terrain: {
        heightAt(x: number, z: number): number;
    } | null;
    query: WaterQuery | null;
    rand: () => number;
    route: readonly (readonly number[])[];
    length: number;
    rN: number;
    rPos: Float64Array;
    rYaw: Float64Array;
    yawWrap: number;
    curve: CatmullRomCurve3;
    u: number;
    position: Vector3;
    quaternion: Quaternion;
    velocity: Vector3;
    speed: number;
    yaw: number;
    pitch: number;
    roll: number;
    rollV: number;
    breachRoll: number;
    breaches: number;
    splashes: number;
    bob: number;
    y: number;
    vy: number;
    water: number;
    wetAge: number;
    strokePhase: number;
    strokeAmp: number;
    arch: number;
    headPitch: number;
    follow: number;
    blow: number;
    flukeUp: number;
    flip: number[];
    flipV: number[];
    fin: WhaleFin[];
    slap: {
        side: number;
        t: number;
        hit?: boolean;
    } | null;
    slapTimer: number;
    slaps: number;
    yawRate: number;
    time: number;
    HN: number;
    hArc: Float64Array;
    hQ: Float32Array;
    hHead: number;
    hCount: number;
    arc: number;
    seq: {
        keys: WhaleKey[];
        i: number;
        t: number;
        blown: boolean;
        splashed?: boolean;
    } | null;
    state: 'cruise' | 'surface';
    lastWrap: boolean;
    slot?: number;
    forceBreach?: boolean;
    onBlow?: () => void;
    constructor({ terrain, query, seed, route }: {
        terrain?: {
            heightAt(x: number, z: number): number;
        } | null;
        query?: WaterQuery | null;
        seed?: number;
        route?: readonly (readonly number[])[];
    });
    _buildRoute(): void;
    _routeIndex(u: number): {
        i: number;
        t: number;
        loops: number;
    };
    routeAt(u: number, out: Vector3): Vector3;
    routeYaw(u: number): number;
    _record(arc: number): void;
    pathRotation(d: number, out: Quaternion): Quaternion;
    _q(idx: number, out: Quaternion): Quaternion;
    flipperRotation(side: number, out: Quaternion): Quaternion;
    _flippers(dt: number, target: WhaleKey): void;
    floorAt(x: number, z: number): number;
    _place(dt: number): void;
    _startSequence(): void;
    _nextKey(expect: string): void;
    update(dt: number): void;
    get backDepth(): number;
}
