import type { WorldDocument } from '@genvr/contracts';
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
export function documentEnvironment(
  doc: WorldDocument,
  options: DocumentEnvironmentOptions,
): WorldEnvironment {
  const surfaces =
    options.surfaces ??
    new SurfaceIndex(doc, {
      groundAt: options.groundAt,
      ...(options.waterAt ? { waterAt: options.waterAt } : {}),
      itemShape: options.itemShape,
      ...(options.restShape ? { restShape: options.restShape } : {}),
      ...(options.floors ? { floors: options.floors } : {}),
      ...(options.decks ? { decks: options.decks } : {}),
    });
  const floors = options.floors ?? [];
  return {
    groundAt: options.groundAt,
    ...(options.waterAt ? { waterAt: options.waterAt } : {}),
    itemShape: options.itemShape,
    ...(options.itemName ? { itemName: options.itemName } : {}),
    ...(options.itemTriangles ? { itemTriangles: options.itemTriangles } : {}),
    ...(options.steepCells ? { steepCells: options.steepCells } : {}),
    ...(options.doors ? { doors: options.doors } : {}),
    ...(options.itemRules ? { itemRules: options.itemRules } : {}),
    ...(options.soilAt ? { soilAt: options.soilAt } : {}),
    ...(options.wallBoxes ? { wallBoxes: options.wallBoxes } : {}),
    ...(options.restShape ? { restShape: options.restShape } : {}),
    ...(options.scattered ? { scattered: options.scattered } : {}),
    floors: () => floors,
    supportBelow: (x, z, fromY, ignore) => surfaces.below(x, z, fromY, ignore),
    // The checks judge resting against this same index, decks included (P2-43 final review, C1).
    surfaces: () => surfaces,
  };
}
