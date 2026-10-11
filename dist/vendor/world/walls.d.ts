import type { Wall, WallOpening } from '../contracts/index.js';
import { type HeightUpdate, type TerrainData } from './terrain-data.js';
type Point = readonly [number, number];
type HeightAt = (x: number, z: number) => number;
export declare const WALL_THICKNESS = 0.3;
/**
 * Walls of a real building (Real place R4): drawn with a roof on top instead of a room floor, all such buildings in one
 * mesh. Other walls and rooms are unchanged.
 */
export declare const BUILDING_WALL_MATERIAL = "genvr.core.wall.building";
/**
 * Looks a plain wall can have: its `materialId` names the Core ground material shown on it. A wall without one keeps
 * the light plaster bricks.
 */
export declare const WALL_SURFACES: {
    readonly 'old-stone': "bricks-102";
    readonly stone: "sandstone-blocks-04";
    readonly 'old-brick': "bricks-097";
    readonly brick: "bricks-104";
    readonly 'yellow-brick': "bricks-105";
    readonly concrete: "concrete-wall-008";
    readonly wood: "weathered-plank-siding";
};
export type WallSurface = keyof typeof WALL_SURFACES;
export declare const WALL_LIMITS: {
    readonly maxLength: 1000;
    readonly minSegment: 0.5;
};
/** Standard opening sizes used by the door and window tools. */
export declare const OPENING_PRESETS: {
    readonly door: {
        readonly width: 1.2;
        readonly height: 2.2;
        readonly bottom: 0;
    };
    readonly window: {
        readonly width: 1.4;
        readonly height: 1.2;
        readonly bottom: 1;
    };
};
/** Straight segments of a wall; a closed wall adds the segment back to the first point last. */
export declare function wallSegments(points: readonly Point[], closed: boolean): Array<[Point, Point]>;
/** Problems with a wall's shape, or null when it can be built. */
export declare function wallShapeError(points: readonly Point[], closed: boolean): string | null;
/** Problems with placing an opening in a wall, or null when it fits. */
export declare function openingError(wall: Wall, opening: WallOpening, ignoreId?: string): string | null;
export declare const sortOpenings: (openings: WallOpening[]) => {
    id: string;
    kind: "door" | "window";
    segment: number;
    offset: number;
    width: number;
    height: number;
    bottom: number;
}[];
/**
 * Plans flattening the ground under a room to the average height of its outline, so the floor,
 * doors, and the ground outside line up (kids never get a room they cannot walk into).
 */
export declare function planRoomGrading(terrain: TerrainData, points: readonly Point[]): HeightUpdate[];
/** Floor height of a closed wall (room): the highest ground on its outline and inside it. */
export declare function roomFloorLevel(wall: Wall, heightAt: HeightAt): number | null;
/** A solid block of wall: center, half extents (along the wall, up, thickness), rotation about Y. */
export interface WallBox {
    center: [number, number, number];
    half: [number, number, number];
    /** Rotation about the vertical axis (right-handed, same as three.js and Rapier). */
    yaw: number;
}
/**
 * Splits a wall into solid boxes around its doors and windows. The same boxes are used for
 * rendering and for physics colliders, so what players see is exactly what they bump into.
 */
export declare function wallBoxes(wall: Wall, heightAt: HeightAt): WallBox[];
/** Segment index and distance along it of the point on the wall nearest to (x, z). */
export declare function nearestWallPosition(wall: Wall, x: number, z: number): {
    segment: number;
    offset: number;
    distance: number;
};
/** A door cut into a wall: where its sill is and which way it faces (P2-11 door check). */
export interface DoorSpot {
    wallId: string;
    openingId: string;
    /** Middle of the doorway on the ground plane. */
    x: number;
    z: number;
    /** Height of the door's lower edge. */
    sill: number;
    /** Unit direction across the wall (either side is checked). */
    normal: [number, number];
    width: number;
}
/** Every door opening of a wall with its sill height, the same base as `wallBoxes`. */
export declare function doorSpots(wall: Wall, heightAt: HeightAt): DoorSpot[];
export {};
