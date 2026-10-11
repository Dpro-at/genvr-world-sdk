/** Third-person follow camera settings (task P3-15). */
export declare const FOLLOW_CAMERA: {
    /** Radius of the sphere swept from the player's head to the camera. */
    readonly probeRadius: 0.25;
    /** Gap kept between the camera and whatever blocks it. */
    readonly margin: 0.1;
    /** Closest the camera gets to the head; closer than `hideAvatarBelow` hides the avatar. */
    readonly minDistance: 0.4;
    readonly hideAvatarBelow: 1;
    /** How fast (per second) the camera eases back out once the way is clear. */
    readonly returnRate: 5;
};
/**
 * Chase camera while riding an item (movement modes, spec 8): behind the item at the ride's
 * `camera` distance, looking 20 degrees down, easing to the item's yaw and height; after the player
 * looked around, it waits `lookBack` seconds before easing back behind.
 */
export declare const CHASE_CAMERA: {
    /** Radians down (20 degrees). */
    readonly pitch: number;
    /** How fast (per second) the camera turns to behind the item and follows its height. */
    readonly rate: 3;
    /** Seconds after the last look input before the camera eases back behind the item. */
    readonly lookBack: 1.5;
    /** Height of the look point above the rider's seat, m. */
    readonly lookHeight: 1.2;
};
/**
 * The chase camera's next orbit yaw: unchanged for `lookBack` seconds after a look input
 * (`sinceLook`), then eased toward `target` (behind the item) the short way round.
 */
export declare function chaseCameraYaw(current: number, target: number, dt: number, sinceLook: number): number;
/**
 * Next camera distance: moves in at once when something blocks the view (never clips through a
 * wall), and eases back out smoothly when the way is clear again.
 */
export declare function nextCameraDistance(current: number, allowed: number, dt: number): number;
/** A box turned `yaw` about the vertical axis (as `itemColliderBox` gives it). */
export interface TurnedBox {
    center: readonly number[];
    half: readonly number[];
    yaw: number;
}
/**
 * How far the camera may go from `origin` along the unit vector `dir` (at most `max`) before a
 * sphere of `radius` touches `box`: for things that have no physics body (the scattered woods),
 * so the follow and chase cameras do not end up inside a trunk. A box the origin is already in
 * (the player standing against it) does not stop the camera.
 */
export declare function rayBoxDistance(origin: {
    x: number;
    y: number;
    z: number;
}, dir: {
    x: number;
    y: number;
    z: number;
}, box: TurnedBox, max: number, radius: number): number;
