/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { Group as ThreeGroup, Quaternion, Vector3, type BufferAttribute, type BufferGeometry, type Camera, type InterleavedBufferAttribute, type Object3D, type Vector3Like } from 'three';
import { type SpeciesName } from './fish-species.js';
import { type MarineBatch, type MarineBatchClass, type MarineBatchKind, type WgslMaterial } from './marine-shared.js';
export type SwimMode = 'bait' | 'school' | 'hover' | 'mill' | 'forage' | 'pair' | 'lurk' | 'solo' | 'patrol' | 'cruise' | 'glide' | 'turtle' | 'surface' | 'jumper' | 'fry' | 'pile' | 'escort' | 'remora';
/** Behaviour of one kind of swimmer (speeds in body lengths / s, see the source comment). */
export interface Behaviour {
    name: string;
    model: SpeciesName;
    length: number[];
    mode: SwimMode;
    cruise: number;
    max: number;
    burst: number;
    accel: number;
    sep: number;
    nbr: number;
    wSep: number;
    wAli: number;
    wCoh: number;
    wGoal: number;
    flee: number;
    depth: number[];
    homeRadius: number;
    amp: number;
    freq: number[];
    ceiling: number;
    minDepth: number;
    band: number[];
}
export declare const BEHAVIOUR: Record<string, Behaviour>;
/** Swimmer models (anatomy names, plus 'stingray' / 'eagleRay' / 'turtle'). */
export interface ModelKind extends MarineBatchKind {
    model: string;
    lod: number;
}
export declare function buildModels(names: string[]): {
    kinds: ModelKind[];
    first: Record<string, number>;
};
/** A zone of a group: centre, radius and water depth band, optional coral heads, path and piles. */
export interface Zone {
    x: number;
    z: number;
    r: number;
    band: number[];
    anchors?: number[][];
    path?: number[][];
    piles?: number[][];
    sand?: boolean;
}
export declare class Group {
    sp: Behaviour;
    count: number;
    offset: number;
    zone: Zone;
    home: Vector3;
    goal: Vector3;
    center: Vector3;
    heading: Vector3;
    timer: number;
    alarm: number;
    spin: number;
    rng: () => number;
    active: boolean;
    radius: number;
    ball: number;
    rest: number;
    breath: number;
    jumpTimer: number;
    pathIndex: number;
    pathDir: number;
    attached?: boolean;
    skin?: {
        P: BufferAttribute | InterleavedBufferAttribute;
        N: BufferAttribute | InterleavedBufferAttribute;
    };
    constructor(sp: Behaviour, count: number, offset: number, zone: Zone, rng: () => number);
}
/** Height field of the seabed / terrain (sea level 0, metres). */
export interface MarineTerrain {
    heightAt(x: number, z: number): number;
}
/** Shore field (ShoreField.js): exposure of the beaches to the swell (channels 1, 2 per cell). */
export interface ShoreFieldData {
    origin: number;
    cellSize: number;
    res: number;
    data: ArrayLike<number>;
}
/** Pier layout (the source's WORLD.pier). */
export interface PierLayout {
    x: number;
    zStart: number;
    zEnd: number;
    width: number;
    headWidth: number;
    headDepth: number;
}
/** Spray emitter (fx/Spray.js). */
export interface MarineSpray {
    emit(p: Vector3, v: Vector3, count: number, size: number, kind: number, o?: Record<string, number>): void;
}
/** The humpback as the escort sees it (Whale.js). */
export interface EscortWhale {
    ready: boolean;
    brain: {
        position: Vector3;
        velocity: Vector3;
        state: string;
        water: number;
    };
    zHead: number;
    dz: number;
    manifest: {
        notchZ: number;
    };
    rest: {
        z: number;
        y: number;
    }[];
    rot: Quaternion[];
    meshes: {
        geometry: BufferGeometry;
    }[];
    toWorld(local: Vector3Like, out: Vector3): Vector3;
}
/** Ocean marks of the whale (ocean/WhaleWater.js). */
export interface WhaleWaterLike {
    update(whale: EscortWhale, dt: number, spray: MarineSpray | null): void;
}
export interface FishSchoolsOptions {
    parent: Object3D;
    terrain: MarineTerrain;
    floorAt?: ((x: number, z: number) => number) | null;
    center: Vector3;
    radius: number;
    anchors?: number[][];
    seed?: number;
    bay?: boolean;
    shoreField?: ShoreFieldData | null;
    /** Pier of the bay (needed with `bay`). */
    pier?: PierLayout;
    /** Batch class (default: setMarineBatch). */
    Batch?: MarineBatchClass;
    /** Ocean marks of the whale (default: none). */
    createWhaleWater?: () => WhaleWaterLike;
    /** Internal render height when the renderer has none (the source's FrameUniforms resolution.y). */
    viewHeight?: () => number;
}
export declare class FishSchools {
    terrain: MarineTerrain;
    floorAt: (x: number, z: number) => number;
    center: Vector3;
    radius: number;
    anchors: number[][];
    shoreField: ShoreFieldData | null;
    pier: PierLayout | null;
    rng: () => number;
    time: number;
    spray: MarineSpray | null;
    group: ThreeGroup;
    groups: Group[];
    n: number;
    dropPath: number[][];
    baitGroups: Group[];
    escort?: Group[];
    modelKind: Record<string, number>;
    pos: Float32Array;
    vel: Float32Array;
    head: Float32Array;
    roll: Float32Array;
    bend: Float32Array;
    phase: Float32Array;
    size: Float32Array;
    speedMul: Float32Array;
    panic: Float32Array;
    seed: Float32Array;
    kind: Uint16Array;
    pattern: Uint8Array;
    slot: Float32Array;
    jump: Float32Array;
    floorC: Float32Array;
    shallowC: Uint8Array;
    prev: Float32Array;
    tmpA: Float32Array;
    tmpC: Uint16Array;
    batch: MarineBatch;
    material: WgslMaterial;
    fadeMaterial: WgslMaterial;
    mesh: Object3D;
    viewHeight: number;
    viewHeightSource: (() => number) | null;
    createWhaleWater: (() => WhaleWaterLike) | null;
    whale?: EscortWhale;
    whaleWater?: WhaleWaterLike;
    breakGrid?: Float32Array;
    _frame: number;
    _cullFrame: number;
    dt: number;
    constructor({ parent, terrain, floorAt, center, radius, anchors, seed, bay, shoreField, pier, Batch, createWhaleWater, viewHeight }: FishSchoolsOptions);
    get fishCount(): number;
    depthAt(x: number, z: number): number;
    breakDepth(x: number, z: number): number;
    fits(sp: Behaviour, zone: Zone, x: number, z: number): boolean;
    addGroup(name: string, count: number, zone: Zone): Group;
    pickSpot(sp: Behaviour, zone: Zone, homes: number[][], anchored: boolean): number[] | null;
    layout(bay: boolean): void;
    setWhale(whale: EscortWhale): void;
    dropOff(): number[][];
    initGroup(g: Group): void;
    depthFor(sp: Behaviour, x: number, z: number, k: number): number;
    clampY(sp: Behaviour, x: number, z: number, y: number): number;
    retarget(g: Group, away: {
        x: number;
        z: number;
    } | null): void;
    warmUp(): void;
    update(dt: number, player: Vector3 | null): void;
    resume(g: Group): void;
    stepGroup(g: Group, dt: number, player: Vector3 | null): void;
    breakDepthFast(x: number, z: number): number;
    stepBait(g: Group, dt: number, player: Vector3 | null): void;
    attachEscort(g: Group): void;
    escortTarget(i: number, out: Vector3): Vector3;
    stepEscort(g: Group, dt: number): void;
    splash(x: number, z: number, vx: number, vz: number, L: number, strength: number): void;
    cull(camera: Camera): void;
    dispose(): void;
}
export declare function yawPitchRoll(yaw: number, pitch: number, roll: number, q: Quaternion): Quaternion;
