/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { Group, Mesh, type Camera, type Material, type Object3D } from 'three';
import { Builder, Batch } from '../tidewater-village/geo-builder.js';
import { type DebrisPlacerOptions, type DebrisTerrain } from './debris-placement.js';
import { PebbleField, type PebbleTerrain } from './pebble-field.js';
import { ScannedDebris, type ScannedDebrisOptions } from './scanned-debris.js';
import { type ShoreEngine, type ShoreMaterial, type ShoreTerrainGpu } from './shore-engine.js';
/** Source engine render layers (src/engine/render/SceneRenderer.js 15-20). */
export declare const LAYERS: {
    readonly OPAQUE: 0;
    readonly WATER: 1;
    readonly TRANSPARENT: 2;
    readonly REFLECT_ONLY: 3;
};
type PlacerOptions = DebrisPlacerOptions;
/** What the debris reads of the village: its shared materials and the texture baker. */
export interface DebrisVillageMaterials {
    materials: {
        wood: Material;
        hard: Material;
        fabric: Material;
    };
    textures?: {
        bake?: () => void;
    } | null;
}
export interface DebrisOptions {
    scene: {
        add(o: Object3D): unknown;
        remove(o: Object3D): unknown;
    };
    terrain: {
        data: PebbleTerrain & DebrisTerrain;
        gpu: ShoreTerrainGpu;
    };
    village: DebrisVillageMaterials & NonNullable<PlacerOptions['village']>;
    vegetation?: PlacerOptions['vegetation'];
    rocks?: PlacerOptions['rocks'];
    colliders?: PlacerOptions['colliders'];
    seed?: number;
    engine?: ShoreEngine;
    /** three.js material for the nature mesh (default: a MeshStandardMaterial stand-in). */
    natureMaterial?: Material;
    /** ScannedDebris loader options (base URL, file readers); default: nothing is loaded. */
    scan?: Pick<ScannedDebrisOptions, 'base' | 'loadBytes' | 'loadPixels' | 'material' | 'autoLoad'>;
}
type DebrisMesh = Mesh & {
    staticVelocity?: boolean;
};
export declare class Debris {
    scene: DebrisOptions['scene'];
    terrainData: PebbleTerrain & DebrisTerrain;
    gpu: ShoreTerrainGpu;
    engine: ShoreEngine;
    natureStandIn: Material | undefined;
    group: Group;
    counts: unknown;
    newColliders: unknown;
    meshes: DebrisMesh[];
    materials: {
        nature: ShoreMaterial;
    } | null;
    natureMaterial: Material | null;
    natureCasterTris: number;
    shadowTriangles: number;
    pebbles: PebbleField;
    scanned: ScannedDebris;
    timings: Record<string, number>;
    constructor({ scene, terrain, village, vegetation, rocks, colliders, seed, engine, natureMaterial, scan }: DebrisOptions);
    _assemble(B: Builder, village: DebrisVillageMaterials): void;
    _bakeContact(b: Batch): void;
    update(camera: Camera): void;
    stats(): {
        triangles: number;
        pebbleTriangles: number;
        pebbleCells: number;
        occupiedCells: number;
        scannedInstances: number;
        scannedTriangles: number;
        scannedReady: boolean;
        drawCalls: number;
        shadowCasters: number;
        shadowTriangles: number;
        colliders: unknown;
        counts: unknown;
        timings: Record<string, number>;
    };
    dispose(): void;
}
export {};
