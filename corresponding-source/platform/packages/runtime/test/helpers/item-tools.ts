import { WorldDocument, type CommandPayload, type ItemInstance } from '@genvr/contracts';
import { isResting, SurfaceIndex, type RestShape } from '@genvr/validator';
import { Object3D, Ray, Vector3, type Intersection } from 'three/webgpu';
import { ItemTools } from '../../src/item-tools.js';
import type { ItemModel, ItemsView } from '../../src/items.js';

/** Test items: a tree and a balloon stand upright on their base; a block stacks in a 1 m grid. */
const SHAPES: Record<string, RestShape> = {
  'genvr.core.oak-tree': { min: [-1, 0, -1], max: [1, 5, 1], rule: { mode: 'upright', sink: 0.05 } },
  'genvr.core.balloon': { min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5], rule: { mode: 'upright', sink: 0.05 } },
  'genvr.core.block': { min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5], rule: { mode: 'upright', sink: 0 } },
};

const model = (itemId: string): ItemModel => {
  const shape = SHAPES[itemId] ?? SHAPES['genvr.core.balloon']!;
  return {
    id: itemId,
    name: itemId,
    parts: [],
    bounds: {
      min: shape.min as [number, number, number],
      max: shape.max as [number, number, number],
    },
    collider: 'box',
    snug: false,
    grid: itemId === 'genvr.core.block' ? 1 : null,
    resizable: false,
  };
};

const instance = (instanceId: string, itemId: string, position: [number, number, number]): ItemInstance => ({
  instanceId,
  itemId,
  transform: { position, rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
  params: {},
});

/**
 * `ItemTools` without WebGL (P2-43): flat ground at height 0, `tree-1` resting on it, `balloon-1`
 * 5 m up in the air, and `block-1` (a grid block) on the ground. Pointer casts are faked: `tapAt`
 * points at the ground, `dragAxis` grabs a gizmo arrow and drags it. `applied` records every
 * command and applies places and moves to the document as asked.
 */
export function makeItemToolsForTest() {
  const world = WorldDocument.parse({
    schemaVersion: 1,
    experienceId: 'x',
    version: 0,
    style: { base: 'realistic' },
    sizeTier: 'small',
    access: { mode: 'private' },
    environment: { sky: { preset: 'day' }, weather: { preset: 'clear' } },
    terrain: {},
    spawn: { position: [50, 1, 50] },
    instances: [
      instance('tree-1', 'genvr.core.oak-tree', [10, 0, 10]),
      instance('balloon-1', 'genvr.core.balloon', [20, 5, 20]),
      instance('block-1', 'genvr.core.block', [30.5, 0, 30.5]),
    ],
  });
  const surfaces = new SurfaceIndex(world, {
    groundAt: () => 0,
    itemShape: (itemId) => {
      const shape = SHAPES[itemId];
      return shape
        ? {
            min: shape.min as [number, number, number],
            max: shape.max as [number, number, number],
            solid: true,
            part: false,
          }
        : null;
    },
  });
  const applied: CommandPayload[] = [];
  /** Places and moves land in the document as asked (the rest law itself is not run here). */
  const follow = (command: CommandPayload) => {
    if (command.type === 'place_item') {
      const { instanceId, itemId, position } = command.params;
      world.instances.push(instance(instanceId, itemId, position));
      surfaces.update(world.instances.at(-1)!, instanceId);
    } else if (command.type === 'transform_item') {
      const moved = world.instances.find((i) => i.instanceId === command.params.instanceId)!;
      if (command.params.position) moved.transform.position = command.params.position;
      if (command.params.rotation) moved.transform.rotation = command.params.rotation;
      surfaces.update(moved, moved.instanceId);
    }
  };
  const ground = new Object3D();
  ground.name = 'terrain:0,0';
  let hit: (targets: Object3D[]) => Intersection[] = () => [];
  let ray = new Ray();
  const items = {
    model,
    pick: () => null,
    instanceIdAt: () => null,
  } as unknown as ItemsView;
  const tools = new ItemTools({
    scene: new Object3D(),
    items,
    world: () => world,
    apply: (command) => {
      applied.push(command);
      follow(command);
      return true;
    },
    heightAt: () => 0,
    cast: (_x, _y, targets) => hit(targets),
    ray: () => ray,
    toScreen: () => null,
    surfaces: () => [ground],
    onChange: () => {},
    fail: () => {},
    isResting: (item) => {
      const shape = SHAPES[item.itemId];
      return !!shape && isResting(item, shape, surfaces);
    },
  });
  tools.setGizmoEnabled(true);

  const select = (instanceId: string) => tools.select([instanceId]);

  /** A tap on the ground at (x, z) with whichever tool is active. */
  const pointAt = (x: number, z: number) => {
    hit = (targets) =>
      targets.includes(ground) ? [{ distance: 5, point: new Vector3(x, 0, z), object: ground }] : [];
  };

  /** Drags the selected item's arrow for `axis` (0 x, 1 y, 2 z) by `by` meters, as one gesture. */
  const dragAxis = (axis: 0 | 1 | 2, by: number) => {
    const handle = (['x', 'y', 'z'] as const)[axis];
    const selected = world.instances.find((i) => i.instanceId === tools.selection?.instanceId)!;
    const [px, py, pz] = selected.transform.position;
    hit = (targets) => {
      const arrow = targets.find((t) => t.name === `gizmo:${handle}`);
      return arrow ? [{ distance: 1, point: new Vector3(px, py, pz), object: arrow }] : [];
    };
    // X and Z drag on the ground plane through the item, Y on a standing plane facing the camera.
    const aim = (shift: number) => {
      const origin = new Vector3(px, py, pz);
      if (axis === 1) {
        origin.x -= 10;
        origin.y += shift;
        ray = new Ray(origin, new Vector3(1, 0, 0));
      } else {
        origin.y += 10;
        origin.setComponent(axis, origin.getComponent(axis) + shift);
        ray = new Ray(origin, new Vector3(0, -1, 0));
      }
    };
    aim(0);
    if (!tools.startGizmo(1, 0, 0)) throw new Error(`the ${handle} arrow was not grabbed`);
    aim(by);
    tools.moveGizmo(1, 0, 0);
    tools.endGizmo(1);
  };

  /**
   * Drags the turn ring or the size handle of the selection on the ground plane through it, from
   * `from` to `to` (x, z offsets from the item), as one gesture.
   */
  const dragHandle = (handle: 'turn' | 'size', from: [number, number], to: [number, number]) => {
    const selected = world.instances.find((i) => i.instanceId === tools.selection?.instanceId)!;
    const [px, py, pz] = selected.transform.position;
    hit = (targets) => {
      const grip = targets.find((t) => t.name === `gizmo:${handle}`);
      return grip ? [{ distance: 1, point: new Vector3(px + from[0], py, pz + from[1]), object: grip }] : [];
    };
    const aim = ([dx, dz]: [number, number]) => {
      ray = new Ray(new Vector3(px + dx, py + 10, pz + dz), new Vector3(0, -1, 0));
    };
    aim(from);
    if (!tools.startGizmo(1, 0, 0)) throw new Error(`the ${handle} handle was not grabbed`);
    aim(to);
    tools.moveGizmo(1, 0, 0);
    tools.endGizmo(1);
  };

  return { tools, applied, world, select, pointAt, dragAxis, dragHandle };
}
