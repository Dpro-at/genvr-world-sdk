/**
 * Unified input layer (docs/INPUT-AND-DEVICES.md): every device produces the same MoveIntent,
 * so the character controller never knows whether input came from keys, touch, a gamepad,
 * a walking platform, or XR controllers.
 */
export interface MoveIntent {
    /** Camera-relative direction on the ground plane; length 0..1. x = right, z = forward. */
    direction: {
        x: number;
        z: number;
    };
    /** 0..1 (walk .. run). */
    speed: number;
    jump: boolean;
    /** A dash in side-view places that allow it (decision 95); present only while pressed. */
    dash?: boolean;
    /** Down while riding an item that flies (movement modes); present only while pressed. */
    descend?: boolean;
    /** Explicit underwater descent; separate from aircraft Shift descent. */
    dive?: boolean;
    /**
     * Get on or off a rideable item (movement modes); present only while pressed. The runtime acts on
     * the press (edge), like jump.
     */
    interact?: boolean;
}
export interface InputSource {
    read(): MoveIntent;
    dispose(): void;
}
/**
 * WASD / arrow keys, Shift to run, Space to jump, E to dash (side-view places) or to get on and off
 * a rideable item, Q or Shift to go down while riding an item that flies.
 */
export declare class KeyboardInput implements InputSource {
    #private;
    private readonly target;
    private readonly arrowsFree;
    /** `arrowsFree` false: arrow keys belong to the build tools (nudging the selection). */
    constructor(target?: Window, arrowsFree?: () => boolean);
    read(): MoveIntent;
    dispose(): void;
}
/** The first connected game controller (standard mapping), or null. */
export declare function firstGamepad(): Gamepad | null;
/** Stick value with a small dead zone, so resting sticks do not drift. */
export declare const stickValue: (value: number | undefined) => number;
/**
 * Standard gamepads. Walk-in-place boards and omnidirectional treadmills usually appear as a
 * gamepad, so they work through this adapter without device-specific code.
 */
export declare class GamepadInput implements InputSource {
    read(): MoveIntent;
    dispose(): void;
}
/** Virtual joystick for touch screens: drag anywhere on the left half of the screen. */
export declare class TouchJoystickInput implements InputSource {
    #private;
    private readonly element;
    /** Device emulator: a mouse drag on the left half works like a finger. */
    private readonly mouseAsFinger;
    /** Off while a build tool is active, so taps on the left half build instead of walking. */
    private readonly enabled;
    constructor(element: HTMLElement, 
    /** Device emulator: a mouse drag on the left half works like a finger. */
    mouseAsFinger?: boolean, 
    /** Off while a build tool is active, so taps on the left half build instead of walking. */
    enabled?: () => boolean);
    /** Lets go of the stick (a second finger starts a pinch or two-finger turn). */
    release(): void;
    /** True while the given pointer drives the joystick (camera orbit ignores it). */
    owns(pointerId: number): boolean;
    /**
     * On-screen buttons held down (movement modes): the jump button held climbs while riding an item
     * that flies, the Down button descends. Released with false.
     */
    setButtons(buttons: {
        up?: boolean;
        descend?: boolean;
    }): void;
    read(): MoveIntent;
    dispose(): void;
}
/** Combines sources: the strongest direction wins, jump (and dash) if any source does. */
export declare function mergeIntents(intents: MoveIntent[]): MoveIntent;
