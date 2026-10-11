import type { WorldDocument } from '../contracts/index.js';
import type { FloorSurface } from './document-environment.js';
import { type WorldEnvironment } from './world-checks.js';
export interface RestingOptions {
    groundAt: WorldEnvironment['groundAt'];
    itemShape: WorldEnvironment['itemShape'];
    floors?: readonly FloorSurface[];
}
/**
 * Where a new item stands at x, z (P2-11, docs/ENGINE-RULES.md "new items settle onto the
 * nearest supporting surface"): the ground, or a room's floor, and when building parts or grid
 * blocks fill that spot, on top of them (never inside a platform or a block wall). A ceiling
 * higher than the headroom does not count, so things in a room stay on its floor. With `on`, the
 * item stands on top of that placed item (a lamp on a table), at x, z when the point is over it,
 * otherwise at its middle. Returns null when `on` names no known item.
 */
export declare function restingPoint(doc: WorldDocument, options: RestingOptions, x: number, z: number, on?: string): [number, number, number] | null;
