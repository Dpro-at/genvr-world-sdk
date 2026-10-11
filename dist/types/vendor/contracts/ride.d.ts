import { z } from 'zod';
/**
 * Movement modes (docs/superpowers/specs/2026-09-30-movement-modes-design.md): any placed item can
 * be made rideable by a designer. The engine knows only a movement model (the medium it moves in)
 * and generic numbers; what the item is stays the designer's business.
 */
/** Hard limits of the ride settings; the schema, the room, the tool and the assistant share them. */
export declare const RIDE_LIMITS: {
    readonly seats: 8;
    /** m/s, the platform cap. */
    readonly maxSpeed: 60;
    readonly accel: readonly [0.5, 40];
    readonly turnDeg: readonly [10, 360];
    readonly climb: readonly [0, 30];
    readonly ceiling: readonly [5, 300];
    readonly camera: readonly [2, 40];
    readonly reach: readonly [1, 12];
    readonly exit: readonly [0.5, 10];
    readonly returnSec: readonly [0, 600];
    readonly speedFactor: readonly [0.1, 3];
    readonly tag: 40;
};
/** The medium an item moves in: on a surface, floating on water, or through the air. */
export declare const RideModel: z.ZodEnum<{
    ground: "ground";
    water: "water";
    air: "air";
}>;
export type RideModel = z.infer<typeof RideModel>;
/** A rideable item's settings. */
export declare const Ride: z.ZodObject<{
    model: z.ZodEnum<{
        ground: "ground";
        water: "water";
        air: "air";
    }>;
    seats: z.ZodDefault<z.ZodNumber>;
    maxSpeed: z.ZodNumber;
    reverse: z.ZodDefault<z.ZodNumber>;
    accel: z.ZodNumber;
    turn: z.ZodNumber;
    grip: z.ZodNumber;
    gravity: z.ZodDefault<z.ZodNumber>;
    climb: z.ZodDefault<z.ZodNumber>;
    glide: z.ZodDefault<z.ZodBoolean>;
    ceiling: z.ZodDefault<z.ZodNumber>;
    camera: z.ZodDefault<z.ZodNumber>;
    seatHeight: z.ZodDefault<z.ZodNumber>;
    pose: z.ZodDefault<z.ZodEnum<{
        sit: "sit";
        stand: "stand";
    }>>;
    reach: z.ZodDefault<z.ZodNumber>;
    exit: z.ZodDefault<z.ZodNumber>;
    returnSec: z.ZodDefault<z.ZodNumber>;
    tag: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type Ride = z.infer<typeof Ride>;
/**
 * A ride default an item may come with (`GenvrManifest.ride`): any subset of the settings, no
 * defaults filled in (the preset of the model fills the rest, and instance params win).
 */
export declare const RideDefault: z.ZodObject<{
    seats: z.ZodOptional<z.ZodNumber>;
    maxSpeed: z.ZodOptional<z.ZodNumber>;
    reverse: z.ZodOptional<z.ZodNumber>;
    accel: z.ZodOptional<z.ZodNumber>;
    turn: z.ZodOptional<z.ZodNumber>;
    grip: z.ZodOptional<z.ZodNumber>;
    gravity: z.ZodOptional<z.ZodNumber>;
    climb: z.ZodOptional<z.ZodNumber>;
    glide: z.ZodOptional<z.ZodBoolean>;
    ceiling: z.ZodOptional<z.ZodNumber>;
    camera: z.ZodOptional<z.ZodNumber>;
    seatHeight: z.ZodOptional<z.ZodNumber>;
    pose: z.ZodOptional<z.ZodEnum<{
        sit: "sit";
        stand: "stand";
    }>>;
    reach: z.ZodOptional<z.ZodNumber>;
    exit: z.ZodOptional<z.ZodNumber>;
    returnSec: z.ZodOptional<z.ZodNumber>;
    tag: z.ZodOptional<z.ZodString>;
    model: z.ZodOptional<z.ZodEnum<{
        ground: "ground";
        water: "water";
        air: "air";
    }>>;
}, z.core.$strip>;
export type RideDefault = z.infer<typeof RideDefault>;
/** Starting numbers per model; the designer tunes from there. */
export declare const RIDE_PRESETS: Record<RideModel, Omit<Ride, 'model' | 'tag'>>;
/** Stored flat in instance params (`set_item_params` takes strings, numbers, booleans, null; keys <= 32 chars). */
export declare const RIDE_PARAMS: {
    readonly model: "ride";
    readonly seats: "rideSeats";
    readonly maxSpeed: "rideSpeed";
    readonly reverse: "rideReverse";
    readonly accel: "rideAccel";
    readonly turn: "rideTurn";
    readonly grip: "rideGrip";
    readonly gravity: "rideGravity";
    readonly climb: "rideClimb";
    readonly glide: "rideGlide";
    readonly ceiling: "rideCeiling";
    readonly camera: "rideCamera";
    readonly seatHeight: "rideSeatHeight";
    readonly pose: "ridePose";
    readonly reach: "rideReach";
    readonly exit: "rideExit";
    readonly returnSec: "rideReturn";
    readonly tag: "rideTag";
};
/**
 * The ride an item's params describe, or null when it is not rideable (no model in the params nor in
 * `itemDefault`, the manifest's `ride`; a model in the params that is not one of the models). Never
 * throws: a missing number takes the item default, then the preset; a number out of range is clamped;
 * a bad enum or boolean takes the preset. The room, the runtime, the validator and the studio all
 * read rides through this one function, so they agree.
 */
export declare function rideFromParams(params: Readonly<Record<string, unknown>>, itemDefault?: RideDefault): Ride | null;
/** The params `set_item_params` writes for a ride (null for every key turns riding off). */
export declare function rideToParams(ride: Ride | null): Record<string, string | number | boolean | null>;
/** Client -> room `ride`: get on the item with this instance id. */
export declare const RideRequest: z.ZodObject<{
    instanceId: z.ZodString;
}, z.core.$strip>;
export type RideRequest = z.infer<typeof RideRequest>;
/** Client -> room `leave-ride`: get off. */
export declare const LeaveRideRequest: z.ZodObject<{}, z.core.$strip>;
export type LeaveRideRequest = z.infer<typeof LeaveRideRequest>;
/**
 * Why the room refused to let a player get on (room -> client `ride-refused { reason }`). `not_here`:
 * the item cannot move where it is (one that moves on water with no water under it).
 */
export declare const RideRefusal: z.ZodEnum<{
    not_rideable: "not_rideable";
    too_far: "too_far";
    full: "full";
    cannot_move: "cannot_move";
    side_view: "side_view";
    busy: "busy";
    not_here: "not_here";
}>;
export type RideRefusal = z.infer<typeof RideRefusal>;
