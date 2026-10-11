import type { WorldDocument } from '../contracts/index.js';
import { type FloorSurface } from './geometry.js';
import type { WorldEnvironment } from './world-checks.js';
import { SurfaceIndex } from './rest/index.js';
export type { FloorSurface } from './geometry.js';
export interface DocumentEnvironmentOptions {
    groundAt: WorldEnvironment['groundAt'];
    waterAt?: WorldEnvironment['waterAt'];
    itemShape: WorldEnvironment['itemShape'];
    itemName?: WorldEnvironment['itemName'];
    itemTriangles?: WorldEnvironment['itemTriangles'];
    steepCells?: WorldEnvironment['steepCells'];
    doors?: WorldEnvironment['doors'];
    itemRules?: WorldEnvironment['itemRules'];
    soilAt?: WorldEnvironment['soilAt'];
    floors?: readonly FloorSurface[];
    decks?: readonly FloorSurface[];
    wallBoxes?: WorldEnvironment['wallBoxes'];
    /** The rest law's shape for an item type (P2-43), so floating, buried and slope are judged by
     * `rest` instead of the plain box test. */
    restShape?: WorldEnvironment['restShape'];
    /** Everything the world scatters that is not in the document (P2-43). */
    scattered?: WorldEnvironment['scattered'];
    /** The rest law's surface index when the caller has one already (the API's place environment);
     * otherwise one is built from the options above. */
    surfaces?: SurfaceIndex;
}
/**
 * A validator environment from the world document alone, without a renderer (P2-12 part 3): the
 * API and workers check places on publish with it. Support under a point comes from the ground,
 * water, room floors, and the tops of solid items' boxes. The studio uses rays against the real
 * meshes instead, so a slanted roof can differ slightly; the box top is the safer guess here.
 */
export declare function documentEnvironment(doc: WorldDocument, options: DocumentEnvironmentOptions): WorldEnvironment;
