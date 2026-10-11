import { type Node } from 'three/webgpu';
/**
 * The wake a swimmer leaves on the water (P2-39 follow-up, owner request 2026-09-28).
 *
 * It is not drawn as a V. It is built the way a wake actually forms: every point a body passes
 * sends out a ring, and the V everyone recognises is the envelope of all those rings (Huygens).
 * Drop a ring behind the swimmer every so often, let each one spread and fade, and the V appears
 * on its own, along with the crossing pattern inside it.
 *
 * The one number that matters is how fast a ring spreads. On deep water a wave group travels at
 * half the speed of its crests, and working the envelope out from that gives a half-angle of
 * arcsin(1/3), about 19.5 degrees, **whatever the speed** - a famously constant angle, the same
 * for a duck and for a ship. The same angle comes out here by making each ring spread at a third
 * of the speed the swimmer had when it was dropped, so the V stays correct at any speed without
 * the angle being written down anywhere.
 *
 * Every device works this out for itself from positions it already has, for its own player and
 * for the others, so nothing about the wake is ever sent over the network.
 */
/** Rings kept at once; the oldest is replaced. */
export declare const MAX_RINGS = 24;
/** Meters a swimmer travels between one ring and the next. */
export declare const RING_SPACING = 0.45;
/** Seconds a ring lasts before it has faded to nothing. */
export declare const RING_LIFE = 4.5;
/** A ring spreads at this share of the speed that dropped it: 1/3 is what gives the 19.5 degrees. */
export declare const SPREAD_SHARE: number;
/** The half-angle of the V behind anything moving on deep water, in degrees. */
export declare const KELVIN_DEGREES: number;
/** One ring: where it was dropped, when, and how fast the swimmer was going. */
export interface Ring {
    x: number;
    z: number;
    /** Seconds on the runtime clock. */
    born: number;
    /** The swimmer's speed when it was dropped (m/s). */
    speed: number;
}
/**
 * Keeps the rings that are still worth drawing and hands the shader a fixed-size array. Swimmers
 * are followed by id, so each one only drops a ring once it has moved far enough.
 */
export declare class WakeField {
    #private;
    /** vec4 per ring: x, z, when it was born, how fast it spreads. */
    readonly rings: import("three/webgpu").UniformArrayNode<string>;
    /** How many of them the shader should look at; 0 turns the wake off entirely. */
    readonly live: import("three/webgpu").UniformNode<"float", number>;
    /**
     * Seconds on the runtime's own clock, which both this and the shader read. It is not the
     * shader's built-in time: sharing one number means a ring's age can never drift between where
     * it is drawn and where it is worked out.
     */
    readonly clock: import("three/webgpu").UniformNode<"float", number>;
    constructor(capacity?: number);
    /** How many rings this device may keep (the graphics setting). */
    /** The runtime moved on: rings age against this. */
    tick(seconds: number): void;
    setCapacity(capacity: number): void;
    /**
     * A swimmer is here now. A ring is dropped only once they have moved `RING_SPACING`, so the
     * trail is even however often this is called and standing still does not fill it up.
     */
    follow(id: string, x: number, z: number, speed: number, now: number): void;
    /** A swimmer stopped swimming or left: their trail stays and fades, but no more is added. */
    forget(id: string): void;
    /** Rings still alive at this moment, for tests and for the bob of floating things. */
    ringsAt(now: number): Ring[];
    clear(): void;
}
/**
 * How high the water stands at a point because of the rings, and how much white water is there.
 * The same sum on the CPU as in the shader, so a floating item rides the wake it can see.
 */
export declare function wakeAt(rings: readonly Ring[], x: number, z: number, now: number): {
    lift: number;
    foam: number;
};
/**
 * The same thing for the shader. Returns the rise of the water and the foam, summed over every
 * ring the device is keeping.
 */
export declare function wakeNodes(field: WakeField, worldX: Node<'float'>, worldZ: Node<'float'>): {
    lift: Node<"float">;
    foam: Node<"float">;
};
