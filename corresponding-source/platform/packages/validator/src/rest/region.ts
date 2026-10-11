import type { CommandPayload, ItemInstance, WorldDocument } from '@genvr/contracts';
import { worldBox } from '../geometry.js';
import { asBoxShape } from './box-shape.js';
import type { RestShape } from './rest.js';

export type Rect = [minX: number, minZ: number, maxX: number, maxZ: number];

/** Ground graded beside a road, wall or river reaches this far past its points (meters). */
const SHOULDER = 10;
/** A water body's own edge reaches this far past its area (meters). */
const WATER_MARGIN = 1;

const around = (points: ReadonlyArray<readonly [number, number]>, margin: number): Rect => [
  Math.min(...points.map((p) => p[0])) - margin,
  Math.min(...points.map((p) => p[1])) - margin,
  Math.max(...points.map((p) => p[0])) + margin,
  Math.max(...points.map((p) => p[1])) + margin,
];

/**
 * Where on the ground plane a command can change what things rest on (P2-43). Commands that
 * change nothing under anything return []; a new world or sea level returns 'all'.
 */
export function regionOf(
  command: CommandPayload,
  doc: WorldDocument,
  shapeOf: (itemId: string) => RestShape | null,
): Rect[] | 'all' {
  const rectOf = (instance: ItemInstance, shape: RestShape): Rect => {
    const { min, max } = worldBox(instance, asBoxShape(shape));
    return [min[0], min[2], max[0], max[2]];
  };
  const boxOf = (instanceId: string): Rect[] => {
    const instance = doc.instances.find((i) => i.instanceId === instanceId);
    const shape = instance && shapeOf(instance.itemId);
    if (!instance || !shape) return [];
    return [rectOf(instance, shape)];
  };
  switch (command.type) {
    case 'place_item':
      return [
        [
          command.params.position[0] - 1,
          command.params.position[2] - 1,
          command.params.position[0] + 1,
          command.params.position[2] + 1,
        ],
      ];
    case 'transform_item': {
      // Both where the item used to stand (review round 1, IMPORTANT 2) and where it will stand:
      // a lamp resting on top of it could be either uncovered or newly covered by the move.
      const old = boxOf(command.params.instanceId);
      const instance = doc.instances.find((i) => i.instanceId === command.params.instanceId);
      const shape = instance && shapeOf(instance.itemId);
      if (!instance || !shape) return old;
      const moved: ItemInstance = {
        ...instance,
        transform: {
          position: command.params.position ?? instance.transform.position,
          rotation: command.params.rotation ?? instance.transform.rotation,
          scale: command.params.scale ?? instance.transform.scale,
        },
      };
      return [...old, rectOf(moved, shape)];
    }
    case 'remove_item':
      return boxOf(command.params.instanceId);
    case 'sculpt_terrain':
      return [around(command.params.area, 1)];
    // New hills (a Real place build): everything on the tile rests again, so trees stay in the ground (owner,
    // 2026-10-07).
    case 'set_heights': {
      const { x0, z0, cols, rows, step } = command.params;
      return [[x0 - step - 1, z0 - step - 1, x0 + cols * step + 1, z0 + rows * step + 1]];
    }
    case 'draw_road':
    case 'draw_wall':
    case 'draw_river':
      return [around(command.params.points, SHOULDER)];
    case 'set_blocks':
      return [
        around(
          command.params.blocks.map(([x, , z]) => [x, z] as [number, number]),
          1,
        ),
      ];
    case 'remove_road': {
      const road = doc.roads.find((r) => r.id === command.params.roadId);
      return road ? [around(road.points, SHOULDER)] : [];
    }
    case 'remove_wall': {
      const wall = doc.walls.find((w) => w.id === command.params.wallId);
      return wall ? [around(wall.points, SHOULDER)] : [];
    }
    case 'remove_river': {
      const river = doc.environment.rivers.find((r) => r.id === command.params.riverId);
      return river ? [around(river.points, SHOULDER)] : [];
    }
    case 'edit_river': {
      // The union of the old and new shape (review round 1, IMPORTANT 2): a stretch the river no
      // longer covers still needs to be judged (its old bed may now leave something floating),
      // and a stretch it newly covers does too.
      const river = doc.environment.rivers.find((r) => r.id === command.params.riverId);
      const points = [...(river?.points ?? []), ...(command.params.points ?? [])];
      return points.length ? [around(points, SHOULDER)] : [];
    }
    case 'add_water':
      return [around(command.params.area, WATER_MARGIN)];
    case 'remove_water': {
      const water = doc.environment.water.find((w) => w.id === command.params.waterId);
      return water ? [around(water.area, WATER_MARGIN)] : [];
    }
    case 'set_water_level': {
      const water = doc.environment.water.find((w) => w.id === command.params.waterId);
      return water ? [around(water.area, WATER_MARGIN)] : [];
    }
    // A new world or sea changes what is under everything; a new style gives every item a new
    // shape (P2-43 final review), so anything may rest anew.
    case 'generate_world':
    case 'set_sea':
    case 'set_style':
      return 'all';
    // Undo/redo payloads (review round 1, IMPORTANT 2): the runtime applies these only as part of
    // undoing or redoing an earlier command, and the chain never runs on undo/redo (constraint),
    // so no region is needed here — the fall-through default (`[]`) is correct, this case just
    // names why rather than leaving it silently unhandled.
    case 'revert_terrain':
    case 'restore_terrain':
      return [];
    default:
      return [];
  }
}
