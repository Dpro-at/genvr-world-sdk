import { LabRunSettings, type LabCourse, type LabEvent } from '../../contracts/index.js';
/**
 * One motion-lab run (MOTION-LAB L2): the lab robot goes along the course centre line at a fixed step (1/60 s) with a
 * seed, so the same course, settings and seed always give the same frames. Each part of the course uses a move from the
 * Moves list: the base move on the ground, Jump Forward / Long Jump over a gap, Climb over a low wall or through a window.
 *
 * Gait model v1 (honest note): the feet are placed by a stride model of the chosen move (natural speed and stride),
 * not read from the animated bones; a stride that does not fit the speed makes planted feet slide. Reading the real
 * bones is the L3 motion tool.
 */
export interface LabFoot {
    x: number;
    y: number;
    z: number;
    planted: boolean;
}
export interface LabFrame {
    t: number;
    /** Root (between the feet, on the ground) and the body's tilt (0 upright, 90 lying). */
    x: number;
    y: number;
    z: number;
    tilt: number;
    feet: [LabFoot, LabFoot];
    /** Balance point on the ground (centre of mass straight down). */
    com: [number, number];
    speed: number;
    /** The move playing (its name in the Moves list). */
    clip: string;
}
export interface LabRunResult {
    frames: LabFrame[];
    events: LabEvent[];
    settings: LabRunSettings;
    seed: number;
    end: 'finish' | 'fall' | 'car' | 'blocked' | 'time';
}
/** Natural speed (m/s) and stride (m) of the ground moves the lab can use. */
export declare const LAB_GROUND_MOVES: Record<string, {
    speed: number;
    stride: number;
    clip: string;
}>;
/** The ground move for a name (own keys only); unknown names use Walk. */
export declare function labGroundMove(name: string): {
    speed: number;
    stride: number;
    clip: string;
};
export declare function simulateLabRun(course: LabCourse, input?: Partial<LabRunSettings>, seed?: number): LabRunResult;
