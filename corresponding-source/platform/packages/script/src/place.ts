import { zoneFromParams, zoneSize, type WorldDocument } from '@genvr/contracts';
import { SPAWN_POINT_ID, zoneShapeOfItem } from '@genvr/core-library';
import type { SpawnSpot, ZoneSpec } from '@genvr/game';

/**
 * Spawn points placed in the world, with their team (instance param `team`, default any); the
 * place's own spawn when none is placed. The room and the dry run read a place the same way.
 */
export function spawnSpots(doc: WorldDocument): SpawnSpot[] {
  const placed = doc.instances
    .filter((i) => i.itemId === SPAWN_POINT_ID)
    .map((i): SpawnSpot => {
      const team = i.params.team === 'red' || i.params.team === 'blue' ? i.params.team : 'any';
      const [x, y, z] = i.transform.position;
      return { x, y, z, team };
    });
  if (placed.length > 0) return placed;
  const [x, y, z] = doc.spawn.position;
  return [{ x, y, z, team: 'any' }];
}

/** The yaw of a rotation quaternion [x, y, z, w] about the vertical axis. */
const yawOf = (q: readonly number[]) => 2 * Math.atan2(q[1] ?? 0, q[3] ?? 1);

/**
 * Zones placed in the world: every item whose params make it one (`zoneFromParams`: `zone`,
 * `zoneTag`), and the Zone Area and Zone Gate items by their own shape; an item without a usable
 * tag is no zone. A gate is 12 m wide times the x scale (2 to 120 m); an area is 4 m times the x
 * and z scale (1 to 120 m each), by `zoneSize` in the contracts. The facing comes from the item's
 * rotation. (Old gate items of a stored world are Zone Gates once the document is read: `readLegacyGates` in the contracts.)
 */
export function zonesOf(doc: WorldDocument): ZoneSpec[] {
  return doc.instances.flatMap((i): ZoneSpec[] => {
    const zone = zoneFromParams(i.params, zoneShapeOfItem(i.itemId));
    if (!zone) return [];
    const [x, y, z] = i.transform.position;
    return [
      {
        id: i.instanceId,
        shape: zone.shape,
        tag: zone.tag,
        x,
        y,
        z,
        yaw: yawOf(i.transform.rotation),
        ...zoneSize(zone.shape, i.transform.scale),
      },
    ];
  });
}
