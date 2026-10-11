import street from './street.js';
import dirt from './dirt.js';
import tram from './tram.js';
import rail from './rail.js';
import fantasy from './fantasy.js';
import path from './path.js';
import lane from './lane.js';
import type { RoadType } from './_road.js';

export * from './_road.js';

/** Every Core road type, in catalog order (one file per type). */
export const ROAD_TYPES: readonly RoadType[] = [street, lane, dirt, tram, rail, fantasy, path];

export const DEFAULT_ROAD_TYPE = ROAD_TYPES[0]!;

const byId = new Map(ROAD_TYPES.map((type) => [type.id, type]));

/** Road type of a road's `materialId` (roads without one are streets). */
export const getRoadType = (id: string | undefined): RoadType =>
  (id ? byId.get(id) : undefined) ?? DEFAULT_ROAD_TYPE;
