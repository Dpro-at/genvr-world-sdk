import type { Wall, WorldDocument } from '../contracts/index.js';
import { type TerrainData, type WallBox } from '../world/index.js';
import { BufferGeometry, CanvasTexture, Group, Mesh, type Material } from 'three/webgpu';
import type { PhysicsWorld } from './physics.js';
import { RoadMaterials } from './road-view.js';
import { PavingMaterials } from './paving-view.js';
import { BuildingMaterials } from './building-view.js';
type HeightAt = (x: number, z: number) => number;
/** Light plaster bricks; 1 texture repeat = 2 m. */
export declare const wallTexture: () => CanvasTexture<HTMLCanvasElement>;
/** Wooden floor boards; 1 repeat = 2 m. */
export declare const floorTexture: () => CanvasTexture<HTMLCanvasElement>;
/** All wall boxes merged into one geometry; UVs in meters / 2 so bricks keep their size. */
export declare function boxesGeometry(boxes: readonly WallBox[]): BufferGeometry<import("three/webgpu").NormalBufferAttributes, import("three/webgpu").BufferGeometryEventMap>;
/** Triangulated room floor at a height (render and collider share it). */
export declare function floorArrays(points: ReadonlyArray<readonly [number, number]>, level: number): {
    positions: Float32Array<ArrayBuffer>;
    uvs: Float32Array<ArrayBuffer>;
    indices: Uint32Array<ArrayBuffer>;
};
export interface StructureMaterials {
    wall: Material;
    floor: Material;
}
export declare function createStructureMaterials(): StructureMaterials;
/** Builds the meshes of one wall with its room floor (also used for the ghost preview). */
export declare function buildWallMeshes(wall: Wall, heightAt: HeightAt, materials: Pick<StructureMaterials, 'wall' | 'floor'>): {
    meshes: Mesh<BufferGeometry<import("three/webgpu").NormalBufferAttributes, import("three/webgpu").BufferGeometryEventMap>, Material<import("three/webgpu").MaterialEventMap> | Material<import("three/webgpu").MaterialEventMap>[], import("three/webgpu").Object3DEventMap>[];
    boxes: WallBox[];
    floor: {
        positions: Float32Array<ArrayBuffer>;
        uvs: Float32Array<ArrayBuffer>;
        indices: Uint32Array<ArrayBuffer>;
    } | null;
};
/**
 * Renders the world's roads and walls (with room floors) and keeps their physics colliders in
 * sync. Only structures whose data changed, or whose ground changed under them, are rebuilt.
 */
export declare class StructuresView {
    #private;
    private readonly terrain;
    private readonly physics;
    readonly group: Group<import("three/webgpu").Object3DEventMap>;
    readonly materials: StructureMaterials;
    readonly roadMaterials: RoadMaterials;
    readonly pavingMaterials: PavingMaterials;
    readonly buildingMaterials: BuildingMaterials;
    constructor(terrain: TerrainData, physics: PhysicsWorld);
    /** Call after every command with the terrain chunks it changed. */
    sync(doc: WorldDocument, changedChunks?: Iterable<string>): void;
    get count(): number;
    dispose(): void;
}
export {};
