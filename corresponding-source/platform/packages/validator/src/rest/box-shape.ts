import type { Vec3 } from '../geometry.js';
import type { RestShape } from './rest.js';

/**
 * `RestShape` keeps `min`/`max` as plain arrays; `worldBox` (and `place`) want a fixed 3-tuple.
 * Shared by `region.ts` and `chain.ts` (P2-43 task 6 review round 1: was duplicated in both).
 */
export const asBoxShape = (shape: RestShape) => ({
  ...shape,
  solid: true,
  part: false,
  min: shape.min as unknown as Vec3,
  max: shape.max as unknown as Vec3,
});
