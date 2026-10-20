import type { LabCourse, LabScore } from '../../contracts/index.js';
import { type LabRunResult } from './sim.js';
/**
 * Scores of one run (board M3), read from its frames:
 * - foot slide: how far planted feet move over the ground (cm, both feet, whole run);
 * - penetration: the deepest a foot goes below the ground or an obstacle top under it (cm);
 * - fall, car hit, finished: from the run's events;
 * - time: start to the end of the run;
 * - smoothness: 1 / (1 + mean jerk / 300) of the body path (1 = no jerk).
 * Total 0–100 (weights below, also written in the motion-lab skill).
 */
export declare const LAB_SCORE_WEIGHTS: {
    readonly slidePerCm: 1.2;
    readonly slideMax: 30;
    readonly penetrationPerCm: 2;
    readonly penetrationMax: 20;
    readonly slowMax: 20;
    readonly roughMax: 20;
    readonly fallCap: 20;
    readonly carCap: 10;
    readonly unfinishedFactor: 0.5;
};
export declare function scoreLabRun(course: LabCourse, run: LabRunResult): LabScore;
