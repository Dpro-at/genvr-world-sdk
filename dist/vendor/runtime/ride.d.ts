import type { Ride } from '../contracts/index.js';
import { type RideInput, type RideSurface } from '../world/index.js';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { MoveIntent } from './input.js';
import type { PhysicsWorld, Vec3Like } from './physics.js';
/**
 * Riding an item on this device (movement modes, spec sections 6 to 9): where the seats are, how
 * the input drives the item, and the local prediction (`stepRide` resolved against the colliders).
 * The room judges every move; this only predicts and draws. Nothing here knows what the item is.
 */
/** Where an item is: its origin and its turn about the vertical axis. */
export interface Pose4 {
    x: number;
    y: number;
    z: number;
    yaw: number;
}
/** An item's box in its own space (already scaled), as its model bounds give it. */
export interface RideBounds {
    min: Vec3Like;
    max: Vec3Like;
}
/** Seat layout (spec 7): rows of two across, rows this far apart, the first row this share back. */
export declare const SEATS: {
    /** Narrower than this: one seat per row. */
    readonly narrow: 1.2;
    readonly rowGap: 0.9;
    readonly firstRow: 0.25;
};
/** How a rider sits: the body's root is this far under the seat point when sitting. */
export declare const RIDER: {
    readonly sitDrop: 0.45;
};
/**
 * The seats of an item, in its own space (forward is +z, left is +x): rows of two across the width
 * (one when the item is narrower than 1.2 m), seat 1 front-left (front-centre when alone in its row),
 * rows 0.9 m apart going back from 25 % of the length, at `seatHeight` of the height.
 */
export declare function seatLayout(bounds: RideBounds, ride: Pick<Ride, 'seats' | 'seatHeight'>): Vec3Like[];
/**
 * A point in an item's own space placed in the world at `pose` (turned about the vertical axis),
 * written into `out`.
 */
export declare function seatInWorld(pose: Pose4, local: Vec3Like, out: Vec3Like): Vec3Like;
/**
 * The ride input from the move intent: forward and back throttle, left and right steer, jump up,
 * descend down. The stick's circle is stretched to a square, so full forward while steering (W and D
 * together, or the stick pushed to a corner) is still full throttle.
 */
export declare function rideInput(intent: MoveIntent, out?: RideInput): RideInput;
/** The heights under a point, written into `out` (no allocation per frame). */
export type SurfaceAt = (x: number, z: number, out: RideSurface) => RideSurface;
/**
 * How an item leans (spec 6, worked out on each device, never sent): on the ground it follows the
 * slope under it (three height samples: the front, and the back left and right); in the air it banks
 * into a turn (`yawRate`, radians per second, negative turning right); on water it bobs with `time`
 * and leans a little into turns. Pitch is about the item's side axis (negative lifts the front),
 * roll about its length (positive lifts the left side).
 */
export declare function rideTilt(ride: Pick<Ride, 'model'>, pose: Pose4, size: {
    width: number;
    length: number;
}, surfaceAt: SurfaceAt, yawRate: number, time: number, out: {
    pitch: number;
    roll: number;
}): {
    pitch: number;
    roll: number;
};
/**
 * The item the local player steers (seat 1): `stepRide` wants a displacement, the box collider
 * resolves it against walls, terrain and other items, and the result is the item's new pose. No
 * allocation per step.
 */
export declare class RideController {
    #private;
    readonly instanceId: string;
    readonly ride: Ride;
    constructor(physics: PhysicsWorld, item: {
        instanceId: string;
        bounds: RideBounds;
        pose: Pose4;
    }, ride: Ride, surfaceAt: SurfaceAt);
    /** The item's box (the camera sweep skips it). */
    get collider(): RAPIER.Collider;
    /** Where the item is now. The same object every time: copy it to keep it. */
    get pose(): Readonly<Pose4>;
    /** Forward speed, m/s (negative backward). */
    get speed(): number;
    /** How the item leans now (eased), radians. */
    get tilt(): Readonly<{
        pitch: number;
        roll: number;
    }>;
    /** One step of `dt` seconds with the rider's input and `set_speed` factor. */
    step(input: RideInput, dt: number, speedFactor: number): void;
    /** The room put the item somewhere else (a correction): there at once, standing still. */
    teleport(pose: Pose4): void;
    dispose(): void;
}
