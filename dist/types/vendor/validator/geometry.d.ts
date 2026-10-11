import type { ItemInstance } from '../contracts/index.js';
import type { WorldEnvironment } from './world-checks.js';
export type Vec3 = [number, number, number];
/** Rotates a vector by a quaternion [x, y, z, w]. */
export declare function rotate([x, y, z]: Vec3, q: readonly number[]): Vec3;
export interface Placed {
    instance: ItemInstance;
    min: Vec3;
    max: Vec3;
    /** The box a player bumps into: the trunk of a tree, the whole box of anything else. */
    body: {
        min: Vec3;
        max: Vec3;
    };
    /** Points under the item's bottom (center and four corners pulled in), world x and z. */
    feet: Array<[number, number]>;
    solid: boolean;
    part: boolean;
    floats: boolean;
    /** Players climb it (ladders). */
    climbable: boolean;
}
/** The world box of a placed item and the points it stands on. */
export declare function place(instance: ItemInstance, shape: NonNullable<ReturnType<WorldEnvironment['itemShape']>>): Placed;
/** The world-space box of a placed item (shared with the document environment). */
export declare function worldBox(instance: ItemInstance, shape: NonNullable<ReturnType<WorldEnvironment['itemShape']>>): {
    min: Vec3;
    max: Vec3;
};
/** A flat walkable surface that is not an item, such as a room floor (x, z polygon). */
export interface FloorSurface {
    points: ReadonlyArray<readonly [number, number]>;
    level: number;
}
/** Whether x, z lies inside a polygon on the ground plane. */
export declare function insidePolygon(x: number, z: number, points: FloorSurface['points']): boolean;
