/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { Group, Mesh, Object3D, Vector3, type BufferGeometry, type Material } from 'three';
import { HullLines } from './hull-lines.js';
import { BoatMaterials, type BoatBucket } from './boat-materials.js';
export declare const STATIC_BUCKETS: readonly BoatBucket[];
export declare const WHEEL_TURNS = 0.75;
export declare const THROTTLE_ANGLE = 0.6;
export declare const RADAR_RPM = 24;
export declare const PROP_DISPLAY_RPS = 5;
/** Wind for the ensign: horizontal direction (x, z as x, y) and speed in m/s at 10 m. */
export interface BoatWind {
    dir: {
        x: number;
        y: number;
    };
    speed: number;
}
/** The source engine frame defaults (engine/render/Frame.js: windDir (0.35, 0.94) normalized, 7 m/s). */
export declare const BOAT_WIND_DEFAULT: BoatWind;
export declare function transverseInertia(lines: HullLines): number;
export interface BoatCollider {
    tag: string;
    center: Vector3;
    half: Vector3;
    walkable: boolean;
    solid: boolean;
}
export declare class BoatModel {
    lines: HullLines;
    materials: BoatMaterials;
    group: Group;
    meshes: Record<string, Mesh<BufferGeometry, Material>>;
    wheelPivot: Object3D;
    wheelMesh: Mesh;
    throttleMesh: Mesh;
    radarMesh: Mesh;
    propMesh: Mesh;
    rudderMesh: Mesh;
    dimensions: {
        length: number;
        beam: number;
        draft: number;
        freeboard: number;
        freeboardBow: number;
        deckHeight: number;
        hullDepth: number;
        waterlineLength: number;
        waterlineBeam: number;
        houseRoofHeight: number;
    };
    hydro: {
        waterplaneArea: number;
        canoeVolume: number;
        keelVolume: number;
        displacedVolume: number;
        suggestedMass: number;
        massWithKeel: number;
        centerOfBuoyancy: Vector3;
        centerOfFlotationZ: number;
        waterlineStart: number;
        waterlineEnd: number;
        seawaterDensity: number;
        centerOfMass: Vector3;
        inertia: Vector3;
        metacentricRadius: number;
    };
    helmEye: Vector3;
    boardPoint: Vector3;
    exitPoints: Vector3[];
    propeller: Vector3;
    rudder: Vector3;
    bowSprayPoints: Vector3[];
    hullSamples: ReturnType<HullLines['buildHullSamples']>;
    colliders: BoatCollider[];
    _steer: number;
    _throttle: number;
    _rpm: number;
    _propAngle: number;
    _radarAngle: number;
    _time: number;
    _lastPos: Vector3;
    _hasLastPos: boolean;
    _vel: Vector3;
    _flagDir: Vector3;
    _flagWind: number;
    constructor();
    createHullVolumeGeometry(): BufferGeometry<import("three").NormalBufferAttributes, import("three").BufferGeometryEventMap>;
    _maxHalfBeam(): number;
    halfBeamAt(z: number): number;
    draftAt(z: number): number;
    setSteering(angle: number): void;
    setThrottle(t: number): void;
    setPropellerRPM(rpm: number): void;
    setNavLights(on: boolean): void;
    update(dt: number, wind?: BoatWind): void;
    dispose(): void;
    get triangleCount(): number;
    _buildColliders(): BoatCollider[];
}
