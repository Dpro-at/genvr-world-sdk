import { LabCourse, type LabObstacle } from '../../contracts/index.js';
/**
 * Motion lab course geometry (MOTION-LAB L1): every obstacle as boxes (x, y, z in metres, y up, the course runs along +z
 * from the start line at z = 0). The same boxes draw the 3D view, make the colliders and let a run read the ground.
 */
export interface LabBox {
    /** The obstacle this box belongs to. */
    id: string;
    part: 'block' | 'ramp' | 'wall' | 'sill' | 'lintel' | 'landing' | 'take_off';
    min: [number, number, number];
    max: [number, number, number];
    /** A ramp's slope rises from `min` z to `max` z (the box is its outline). */
    slope?: boolean;
}
/** Seeded random numbers (mulberry32): the same seed gives the same numbers on every machine. */
export declare function labRandom(seed: number): () => number;
/** The first-version course of board M1: step, ramp up to a block, a 1 m gap, a low wall, a window, a street with a car. */
export declare function defaultLabCourse(): LabCourse;
/** Boxes of one obstacle. */
export declare function obstacleBoxes(o: LabObstacle): LabBox[];
export declare function courseBoxes(course: LabCourse): LabBox[];
/** A gap is a hole between its take-off edge (`z`) and its far edge; the take-off block is whatever stands before it. */
export declare function gapAt(course: LabCourse, x: number, z: number): LabObstacle | undefined;
/** Ground height under a point (top of the highest box below it, a ramp's slope, 0 for the floor, −1 in a gap). */
export declare function groundAt(course: LabCourse, x: number, z: number, boxes?: LabBox[]): number;
/** Hardness 1–5 sets how big the obstacles are; the seed picks kinds, sizes and gaps between them (board M2). */
export declare function courseFromSeed(seed: number, count?: number, hardness?: number, street?: boolean): LabCourse;
