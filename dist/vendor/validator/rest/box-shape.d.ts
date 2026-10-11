import type { Vec3 } from '../geometry.js';
import type { RestShape } from './rest.js';
/**
 * `RestShape` keeps `min`/`max` as plain arrays; `worldBox` (and `place`) want a fixed 3-tuple.
 * Shared by `region.ts` and `chain.ts` (P2-43 task 6 review round 1: was duplicated in both).
 */
export declare const asBoxShape: (shape: RestShape) => {
    solid: boolean;
    part: boolean;
    min: Vec3;
    max: Vec3;
    rule: import("../../contracts/index.js").RestRule;
    maxTilt?: number;
    bed?: boolean;
    rooted?: boolean;
};
