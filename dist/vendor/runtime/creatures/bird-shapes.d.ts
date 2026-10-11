import type { V3 } from './kit.js';
export declare const BIRD: {
    readonly GULL: 0;
    readonly TERN: 1;
    readonly PELICAN: 2;
    readonly FRIGATE: 3;
    readonly SANDERLING: 4;
};
export type P2 = [number, number];
type Station = [number, number, number, number, number];
export interface BirdSpecies {
    name: string;
    length: number;
    span: number;
    body: Station[];
    neck: P2;
    pivot: V3;
    bill: {
        z: number;
        y: number;
        len: number;
        pitch: number;
        w: number;
        up: number;
        low: number;
        hook: number;
        gonys: number;
        pouch: number;
    };
    tail: {
        z: number;
        y: number;
        w: number;
        len: [number, number, number, number];
        spread: number;
    };
    wing: {
        root: V3;
        span: number;
        elbow: number;
        wrist: number;
        thick: V3;
        le: P2[];
        chord: P2[];
    };
    fold: {
        front: number;
        tip: number;
        top: number;
        h: number;
        minX: number;
    };
    legs: {
        hip: V3;
        tibia: number;
        tarsus: number;
        r: number;
        toe: number;
        web: number;
    };
    eye: V3;
}
export interface BirdTemplate {
    count: number;
    A: Float32Array;
    B: Float32Array;
    C: Float32Array;
    D: Float32Array;
    index: number[];
    joints: {
        S: V3;
        E: V3;
        W: V3;
    };
}
export declare const SPECIES: BirdSpecies[];
export declare function wingJoints(sp: BirdSpecies): {
    S: V3;
    E: V3;
    W: V3;
};
export declare function buildBird(sp: BirdSpecies): BirdTemplate;
export {};
