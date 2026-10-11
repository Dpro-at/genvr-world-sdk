/** Tidewater Player.js 4811ba48 (MIT), source swim motion adapted from eye anchor to capsule feet. */
export interface SwimMotionState {
    floating: boolean;
    velocity: {
        x: number;
        y: number;
        z: number;
    };
}
export declare const createSwimMotion: () => SwimMotionState;
/** Default third-person orbit looks down; calibrate its neutral view to horizontal swimming. */
export declare function swimLookForward(yaw: number, orbitPitch: number, neutralPitch: number): {
    x: number;
    y: number;
    z: number;
};
/** Deep valid water can lie below the legacy dry-world fallout threshold. */
export declare function swimFallout(feetY: number, swimming: boolean, waterLevel: number | null): boolean;
export interface SwimMotionInput {
    forward: {
        x: number;
        y: number;
        z: number;
    };
    right: {
        x: number;
        z: number;
    };
    direction: {
        x: number;
        z: number;
    };
    ascend: boolean;
    dive: boolean;
    sprint: boolean;
    /** Analogue movement magnitude; keyboard walking supplies 1. */
    magnitude: number;
}
/** Returns desired displacement. River current is applied by caller before collision resolution. */
export declare function stepSwimMotion(state: SwimMotionState, input: SwimMotionInput, feetY: number, floatFeetY: number, dt: number): {
    x: number;
    y: number;
    z: number;
};
