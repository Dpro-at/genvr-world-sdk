import { type WorldDocument } from '../contracts/index.js';
import type { SpawnSpot, ZoneSpec } from '../game/index.js';
/**
 * Spawn points placed in the world, with their team (instance param `team`, default any); the
 * place's own spawn when none is placed. The room and the dry run read a place the same way.
 */
export declare function spawnSpots(doc: WorldDocument): SpawnSpot[];
/**
 * Zones placed in the world: every item whose params make it one (`zoneFromParams`: `zone`,
 * `zoneTag`), and the Zone Area and Zone Gate items by their own shape; an item without a usable
 * tag is no zone. A gate is 12 m wide times the x scale (2 to 120 m); an area is 4 m times the x
 * and z scale (1 to 120 m each), by `zoneSize` in the contracts. The facing comes from the item's
 * rotation. (Old gate items of a stored world are Zone Gates once the document is read: `readLegacyGates` in the contracts.)
 */
export declare function zonesOf(doc: WorldDocument): ZoneSpec[];
