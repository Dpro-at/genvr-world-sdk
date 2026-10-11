import type { CommandPayload, ItemInstance, WorldDocument } from '@genvr/contracts';
import {
  Box3,
  BoxGeometry,
  EdgesGeometry,
  LineBasicMaterial,
  LineSegments,
  Matrix3,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type InstancedMesh,
  type Intersection,
  type Mesh,
  type Object3D,
  type Ray,
} from 'three/webgpu';
import { TransformGizmo, type GizmoHandle } from './gizmo.js';
import { yawOf, yawQuaternion, type ItemsView } from './items.js';

/** The items currently selected (one item, or every member of a group). */
export interface ItemSelection {
  /** The first selected item (the only one unless a group or several items are selected). */
  instanceId: string;
  itemId: string;
  name: string;
  /** Every selected item (task P3-26). */
  instanceIds: string[];
  /** Group of the selected items when the whole selection is one group. */
  groupId: string | null;
  /** True when any selected item is locked: no handles, moving, or deleting. */
  locked: boolean;
}

interface ItemToolsOptions {
  scene: Object3D;
  items: ItemsView;
  world: () => WorldDocument;
  apply: (command: CommandPayload) => boolean;
  heightAt: (x: number, z: number) => number;
  /** Raycast from a screen position against the given objects (nearest first). */
  cast: (clientX: number, clientY: number, targets: Object3D[]) => Intersection[];
  /** The pick ray through a screen position. */
  ray: (clientX: number, clientY: number) => Ray;
  /** Screen position (client pixels) of a world point, or null when it is behind the camera. */
  toScreen: (x: number, y: number, z: number) => { x: number; y: number } | null;
  /** Surfaces items can stand on: terrain, structures, and other items. */
  surfaces: () => Object3D[];
  onChange: () => void;
  fail: (message: string) => void;
  /** Group the commands of one drag into one undo step. */
  beginGroup?: () => void;
  endGroup?: () => void;
  /**
   * True when an item rests where the rest law would put it (P2-43). Copies of a resting item
   * rest too; copies of an item placed in the air keep its height. Without it, an item counts as
   * resting when it stands on the ground.
   */
  isResting?: (instance: ItemInstance) => boolean;
}

/** Snapping (task P3-24): grid step in meters (0 = free) and turn step in radians. */
export interface SnapSettings {
  grid: number;
  angle: number;
}

/** By default items snap to a half-meter grid and turn in quarter turns. */
export const DEFAULT_SNAP: SnapSettings = { grid: 0.5, angle: Math.PI / 2 };
/** Gap left between copies made by duplicate and row. */
const COPY_GAP = 0.25;

/**
 * Whether a command from a placement path asks the rest law for its height (P2-43): every path
 * does, except grid blocks (their cells are exact) and a drag on the y arrow (the creator chose
 * that height on purpose).
 */
export function asksForRest(grid: number | null, axis?: number): boolean {
  return grid === null && axis !== 1;
}

/** `{ rest: true }` to spread into a command's params when it asks for rest, else nothing. */
const restFlag = (on: boolean): { rest?: true } => (on ? { rest: true } : {});

const newId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
const round = (v: number) => Math.round(v * 1000) / 1000;
/** Quaternion for a turn about the vertical axis, rounded so saved documents stay tidy. */
const turn = (yaw: number) => yawQuaternion(yaw).map(round) as [number, number, number, number];

/**
 * Place and select tools (task P3-03): a ghost follows the pointer, a tap places the item;
 * selected items can be turned, moved, duplicated, repeated in a row, or deleted. Every change
 * is a normal world command (undo, saving, and multiplayer just work).
 */
export class ItemTools {
  #placeItemId: string | null = null;
  #snap: SnapSettings = { ...DEFAULT_SNAP };
  #yaw = 0;
  #selected: string[] = [];
  #moving = false;
  #ghost: Mesh | null = null;
  #ghostItemId: string | null = null;
  readonly #ghostMaterial = new MeshStandardMaterial({
    color: 0x6d4aff,
    transparent: true,
    opacity: 0.45,
  });
  readonly #outline = new LineSegments(
    new EdgesGeometry(new BoxGeometry(1, 1, 1)),
    new LineBasicMaterial({ color: 0x6d4aff, depthTest: false }),
  );

  readonly #gizmo = new TransformGizmo();
  #gizmoOn = false;
  #drag: {
    pointerId: number;
    handle: GizmoHandle;
    start: Vector3;
    pivot: Vector3;
    /** Every selected item as it was when the drag started. */
    items: Array<{
      instanceId: string;
      position: [number, number, number];
      yaw: number;
      scale: [number, number, number];
    }>;
    applied: string;
  } | null = null;

  constructor(private readonly options: ItemToolsOptions) {
    this.#outline.visible = false;
    this.#outline.renderOrder = 10;
    // Build helpers are left out of place pictures (runtime.capture).
    this.#outline.userData.helper = true;
    this.#gizmo.group.userData.helper = true;
    options.scene.add(this.#outline, this.#gizmo.group);
  }

  /** Drag handles show on the selected item while the select tool is active. */
  setGizmoEnabled(on: boolean): void {
    this.#gizmoOn = on;
    this.refreshOutline();
  }

  /** Starts dragging a handle under the pointer; false when no handle was hit. */
  startGizmo(pointerId: number, clientX: number, clientY: number): boolean {
    const instances = this.#instances();
    if (!this.#gizmoOn || instances.length === 0 || this.#locked(instances) || this.#moving) return false;
    const hit = this.options.cast(clientX, clientY, this.#gizmo.targets)[0];
    const handle = hit ? this.#gizmo.handleOf(hit.object) : null;
    if (!handle) return false;
    const pivot = this.#pivot(instances);
    const start = this.#gizmo.dragPoint(handle, this.options.ray(clientX, clientY), pivot);
    if (!start) return false;
    this.#drag = {
      pointerId,
      handle,
      start,
      pivot,
      items: instances.map((i) => ({
        instanceId: i.instanceId,
        position: [...i.transform.position] as [number, number, number],
        yaw: yawOf(i.transform.rotation),
        scale: [...i.transform.scale] as [number, number, number],
      })),
      applied: '',
    };
    this.options.beginGroup?.();
    return true;
  }

  /** Moves or turns the selection with the handle; snaps to the grid and turn steps. */
  moveGizmo(pointerId: number, clientX: number, clientY: number): boolean {
    const drag = this.#drag;
    if (!drag || drag.pointerId !== pointerId) return false;
    const point = this.#gizmo.dragPoint(drag.handle, this.options.ray(clientX, clientY), drag.pivot);
    if (!point) return true;
    const step = (value: number) =>
      this.#snap.grid > 0 ? Math.round(value / this.#snap.grid) * this.#snap.grid : round(value);
    let change: { turn: number } | { axis: number; by: number } | { factor: number };
    if (drag.handle === 'size') {
      // Distance from the middle now versus at the start, in 5 percent steps.
      const from = Math.hypot(drag.start.x - drag.pivot.x, drag.start.z - drag.pivot.z);
      const to = Math.hypot(point.x - drag.pivot.x, point.z - drag.pivot.z);
      change = { factor: Math.max(0.05, Math.round((to / Math.max(0.01, from)) * 20) / 20) };
    } else if (drag.handle === 'turn') {
      const from = Math.atan2(drag.start.x - drag.pivot.x, drag.start.z - drag.pivot.z);
      const to = Math.atan2(point.x - drag.pivot.x, point.z - drag.pivot.z);
      change = { turn: Math.round((to - from) / this.#snap.angle) * this.#snap.angle };
    } else {
      const axis = drag.handle === 'x' ? 0 : drag.handle === 'y' ? 1 : 2;
      change = { axis, by: step(point.getComponent(axis) - drag.start.getComponent(axis)) };
    }
    const signature = JSON.stringify(change);
    if (signature !== drag.applied) {
      drag.applied = signature;
      const instances = this.options.world().instances;
      for (const item of drag.items) {
        let params: {
          position?: [number, number, number];
          rotation?: [number, number, number, number];
          rest?: true;
        };
        let scale: [number, number, number] | undefined;
        const itemId = instances.find((i) => i.instanceId === item.instanceId)?.itemId;
        const grid = itemId ? this.options.items.model(itemId).grid : null;
        if ('factor' in change) {
          // A new size is a new footprint and a new lowest point: it rests anew (P2-43).
          scale = this.#resized(item, change.factor);
          params = restFlag(asksForRest(grid));
        } else if ('turn' in change) {
          params = {
            ...this.#turnedAbout(item, drag.pivot, change.turn, drag.items.length > 1),
            ...restFlag(asksForRest(grid)),
          };
        } else {
          const position = [...item.position] as [number, number, number];
          position[change.axis] = round(position[change.axis]! + change.by);
          // Across the ground the item rests where it arrives; up and down is a height on purpose.
          params = { position, ...restFlag(asksForRest(grid, change.axis)) };
        }
        this.options.apply({
          type: 'transform_item',
          params: { instanceId: item.instanceId, ...params, ...(scale ? { scale } : {}) },
        });
      }
      this.refreshOutline();
      // Properties shows the new numbers while dragging.
      this.options.onChange();
    }
    return true;
  }

  /** An item's size times `factor`, kept within the sizes Properties allows. */
  #resized(item: { instanceId: string; scale: readonly number[] }, factor: number): [number, number, number] {
    const itemId = this.options.world().instances.find((i) => i.instanceId === item.instanceId)?.itemId;
    const max = itemId && this.options.items.model(itemId).resizable ? 50 : 10;
    return item.scale.map((v) => round(Math.min(max, Math.max(0.1, v * factor)))) as [number, number, number];
  }

  /**
   * Moves the selection by a step (arrow keys, P3-24): `dx`, `dz` on the ground, `dy` up.
   * One undo step for the whole selection.
   */
  nudge(dx: number, dy: number, dz: number): boolean {
    const instances = this.#instances();
    if (instances.length === 0 || this.#moving) return false;
    if (this.#locked(instances)) {
      this.options.fail('It is locked. Unlock it first.');
      return true;
    }
    // Where each one was before any moved: an item carried by another one moved first (P2-43) is
    // still nudged by one step from its own start, not twice.
    const starts = instances.map((instance) => ({
      instanceId: instance.instanceId,
      position: [...instance.transform.position] as [number, number, number],
      grid: this.options.items.model(instance.itemId, instance.params).grid,
    }));
    this.options.beginGroup?.();
    for (const { instanceId, position, grid } of starts) {
      const [x, y, z] = position;
      this.options.apply({
        type: 'transform_item',
        params: {
          instanceId,
          position: [round(x + dx), round(y + dy), round(z + dz)],
          // Across the ground it rests where it arrives; up and down is a height on purpose.
          ...restFlag(asksForRest(grid, dy !== 0 ? 1 : undefined)),
        },
      });
    }
    this.options.endGroup?.();
    this.refreshOutline();
    this.options.onChange();
    return true;
  }

  /** Grid step for nudges (a tenth of a meter without a grid). */
  get nudgeStep(): number {
    return this.#snap.grid > 0 ? this.#snap.grid : 0.1;
  }

  get hasSelection(): boolean {
    return this.#selected.length > 0;
  }

  /**
   * Box select (Shift and drag): every unlocked item whose middle is inside the screen
   * rectangle, with whole groups. `add` keeps the current selection.
   */
  selectInRect(left: number, top: number, right: number, bottom: number, add: boolean): void {
    const world = this.options.world();
    const picked = new Set<string>(add ? this.#selected : []);
    const groups = new Set<string>();
    for (const instance of world.instances) {
      if (instance.locked) continue;
      const { bounds } = this.options.items.model(instance.itemId, instance.params);
      const [x, y, z] = instance.transform.position;
      const middle = y + ((bounds.min[1] + bounds.max[1]) / 2) * instance.transform.scale[1];
      const at = this.options.toScreen(x, middle, z);
      if (!at || at.x < left || at.x > right || at.y < top || at.y > bottom) continue;
      picked.add(instance.instanceId);
      if (instance.groupId) groups.add(instance.groupId);
    }
    for (const instance of world.instances)
      if (instance.groupId && groups.has(instance.groupId)) picked.add(instance.instanceId);
    this.select([...picked]);
  }

  /** An item turned by `delta` about the pivot (a group turns as one; one item turns in place). */
  #turnedAbout(
    item: { position: readonly number[]; yaw: number },
    pivot: Vector3,
    delta: number,
    orbit: boolean,
  ): { position?: [number, number, number]; rotation: [number, number, number, number] } {
    const rotation = turn(item.yaw + delta);
    if (!orbit) return { rotation };
    const dx = item.position[0]! - pivot.x;
    const dz = item.position[2]! - pivot.z;
    const cos = Math.cos(delta);
    const sin = Math.sin(delta);
    return {
      rotation,
      position: [
        round(pivot.x + dx * cos + dz * sin),
        item.position[1]!,
        round(pivot.z - dx * sin + dz * cos),
      ],
    };
  }

  /** Where the handles sit: on the item, or in the middle of a group at its lowest point. */
  #pivot(instances: ItemInstance[]): Vector3 {
    if (instances.length === 1) {
      const [x, y, z] = instances[0]!.transform.position;
      return new Vector3(x, y, z);
    }
    const pivot = new Vector3(0, Infinity, 0);
    for (const { transform } of instances) {
      pivot.x += transform.position[0] / instances.length;
      pivot.z += transform.position[2] / instances.length;
      pivot.y = Math.min(pivot.y, transform.position[1]);
    }
    return pivot;
  }

  #locked(instances: ItemInstance[]): boolean {
    return instances.some((i) => i.locked);
  }

  endGizmo(pointerId: number): void {
    if (!this.#drag || this.#drag.pointerId !== pointerId) return;
    this.#drag = null;
    this.options.endGroup?.();
  }

  get placeItemId(): string | null {
    return this.#placeItemId;
  }

  get moving(): boolean {
    return this.#moving;
  }

  get selection(): ItemSelection | null {
    const instances = this.#instances();
    const first = instances[0];
    if (!first) return null;
    const groupId =
      first.groupId && instances.every((i) => i.groupId === first.groupId) ? first.groupId : null;
    const group = groupId ? this.options.world().groups.find((g) => g.id === groupId) : undefined;
    return {
      instanceId: first.instanceId,
      itemId: first.itemId,
      name:
        instances.length > 1
          ? (group?.name ?? `${instances.length} items`)
          : (first.name ?? this.options.items.model(first.itemId).name),
      instanceIds: instances.map((i) => i.instanceId),
      groupId,
      locked: this.#locked(instances),
    };
  }

  /** Selects items by id (the studio explorer); an empty list clears the selection. */
  select(instanceIds: readonly string[]): void {
    this.#moving = false;
    this.#hideGhost();
    this.#selected = [...instanceIds];
    this.refreshOutline();
    this.options.onChange();
  }

  /** Chooses the item the place tool puts down. */
  setPlaceItem(itemId: string | null): void {
    this.#placeItemId = itemId;
    this.#yaw = 0;
    this.#hideGhost();
  }

  /** Leaves place/select mode (tool switched). */
  reset(): void {
    this.#placeItemId = null;
    this.#moving = false;
    this.#selected = [];
    this.#hideGhost();
    this.refreshOutline();
  }

  /** Quarter turn: the ghost while placing or moving, otherwise the selected item. */
  rotate(): void {
    if (this.#placeItemId || this.#moving) {
      this.#yaw = (this.#yaw + this.#snap.angle) % (Math.PI * 2);
      if (this.#ghost) this.#ghost.rotation.y = this.#yaw;
      return;
    }
    const instances = this.#instances();
    if (instances.length === 0 || this.#locked(instances)) return;
    const pivot = this.#pivot(instances);
    this.options.beginGroup?.();
    for (const instance of instances) {
      const item = { position: instance.transform.position, yaw: yawOf(instance.transform.rotation) };
      const params = this.#turnedAbout(item, pivot, this.#snap.angle, instances.length > 1);
      // Turned, its footprint changed: it rests anew (P2-43).
      const rest = restFlag(asksForRest(this.options.items.model(instance.itemId, instance.params).grid));
      this.options.apply({
        type: 'transform_item',
        params: { instanceId: instance.instanceId, ...params, ...rest },
      });
    }
    this.options.endGroup?.();
    this.refreshOutline();
    this.options.onChange();
  }

  hover(clientX: number, clientY: number): void {
    const itemId = this.#placeItemId ?? (this.#moving ? this.#instance()?.itemId : null);
    if (!itemId) return;
    const spot = this.#surfacePoint(clientX, clientY, itemId);
    if (!spot) {
      this.#hideGhost();
      return;
    }
    this.#showGhost(itemId);
    this.#ghost!.position.set(spot[0], spot[1], spot[2]);
    this.#ghost!.rotation.y = this.#yaw;
  }

  /** Place tool tap: puts the chosen item down (the tool stays active for more). */
  tapPlace(clientX: number, clientY: number): void {
    const itemId = this.#placeItemId;
    if (!itemId) return;
    const spot = this.#surfacePoint(clientX, clientY, itemId);
    if (!spot) return;
    const instanceId = newId('item');
    const placed = this.options.apply({
      type: 'place_item',
      params: {
        instanceId,
        itemId,
        position: spot,
        rotation: turn(this.#yaw),
        ...restFlag(asksForRest(this.options.items.model(itemId).grid)),
      },
    });
    if (!placed) this.options.fail('It cannot go there.');
  }

  /**
   * Select tool tap: selects an item (with its group), or drops the item being moved. With
   * `add` (Shift or Ctrl), the item joins the selection, or leaves it when already selected.
   */
  tapSelect(clientX: number, clientY: number, add = false): void {
    if (this.#moving) {
      const instance = this.#instance();
      const spot = instance ? this.#surfacePoint(clientX, clientY, instance.itemId) : null;
      if (instance && spot) {
        this.options.apply({
          type: 'transform_item',
          params: {
            instanceId: instance.instanceId,
            position: spot,
            rotation: turn(this.#yaw),
            ...restFlag(asksForRest(this.options.items.model(instance.itemId, instance.params).grid)),
          },
        });
      }
      this.#moving = false;
      this.#hideGhost();
      this.refreshOutline();
      this.options.onChange();
      return;
    }
    // Tapping an item of a group selects the whole group.
    const picked = this.pickItem(clientX, clientY);
    const instances = this.options.world().instances;
    const groupId = picked ? instances.find((i) => i.instanceId === picked)?.groupId : undefined;
    const hit = groupId
      ? instances.filter((i) => i.groupId === groupId).map((i) => i.instanceId)
      : picked
        ? [picked]
        : [];
    if (add) {
      const current = new Set(this.#selected);
      const all = hit.length > 0 && hit.every((id) => current.has(id));
      for (const id of hit) {
        if (all) current.delete(id);
        else current.add(id);
      }
      this.#selected = [...current];
    } else {
      this.#selected = hit;
    }
    this.refreshOutline();
    this.options.onChange();
  }

  /** Grid and turn steps for placing, moving, and turning. */
  setSnap(settings: Partial<SnapSettings>): void {
    this.#snap = { ...this.#snap, ...settings };
  }

  #snapValue(v: number): number {
    return this.#snap.grid > 0 ? Math.round(v / this.#snap.grid) * this.#snap.grid : round(v);
  }

  /** Instance id of the item under a screen position, or null. */
  pickItem(clientX: number, clientY: number, ignore?: string | null): string | null {
    return this.options.items.pick(this.options.ray(clientX, clientY), ignore);
  }

  /** Starts moving the selected item: the next tap drops it where the ghost is. */
  startMove(): void {
    const instance = this.#single();
    if (!instance) return;
    this.#moving = true;
    this.#yaw = yawOf(instance.transform.rotation);
    this.options.onChange();
  }

  /** Copies the selected item next to itself and selects the copy. */
  duplicate(): string | null {
    const instance = this.#single();
    if (!instance) return null;
    const copy = this.#copyBeside(instance);
    if (!copy) {
      this.options.fail('There is no room for a copy.');
      return null;
    }
    this.#selected = [copy];
    this.refreshOutline();
    this.options.onChange();
    return copy;
  }

  /** Makes a row of copies (fences, trees, lamps). */
  row(count: number): void {
    for (let i = 0; i < count; i += 1) if (!this.duplicate()) break;
  }

  remove(): void {
    const instances = this.#instances();
    if (instances.length === 0) return;
    if (this.#locked(instances)) {
      this.options.fail('It is locked. Unlock it first.');
      return;
    }
    this.options.beginGroup?.();
    for (const instance of instances)
      this.options.apply({ type: 'remove_item', params: { instanceId: instance.instanceId } });
    this.options.endGroup?.();
    this.#selected = [];
    this.refreshOutline();
    this.options.onChange();
  }

  /** Keeps the selection outline on the selected item (call after every command). */
  refreshOutline(): void {
    const instances = this.#instances();
    this.#selected = instances.map((i) => i.instanceId);
    if (instances.length === 0) {
      this.#outline.visible = false;
      this.#gizmo.place(null);
      return;
    }
    let size: number[];
    if (instances.length === 1) {
      // One item: a box turned with it.
      const instance = instances[0]!;
      const { bounds } = this.options.items.model(instance.itemId, instance.params);
      const { position, rotation, scale } = instance.transform;
      const yaw = yawOf(rotation);
      size = [0, 1, 2].map((k) => (bounds.max[k]! - bounds.min[k]!) * scale[k]! + 0.1);
      const lx = ((bounds.min[0] + bounds.max[0]) / 2) * scale[0];
      const lz = ((bounds.min[2] + bounds.max[2]) / 2) * scale[2];
      this.#outline.rotation.set(0, yaw, 0);
      this.#outline.position.set(
        position[0] + lx * Math.cos(yaw) + lz * Math.sin(yaw),
        position[1] + ((bounds.min[1] + bounds.max[1]) / 2) * scale[1],
        position[2] - lx * Math.sin(yaw) + lz * Math.cos(yaw),
      );
    } else {
      // Several items: one box around all of them.
      const box = new Box3();
      const matrix = new Matrix4();
      for (const { transform, itemId } of instances) {
        const { bounds } = this.options.items.model(itemId);
        matrix.compose(
          new Vector3(...transform.position),
          new Quaternion(...transform.rotation),
          new Vector3(...transform.scale),
        );
        box.union(new Box3(new Vector3(...bounds.min), new Vector3(...bounds.max)).applyMatrix4(matrix));
      }
      const extent = box.getSize(new Vector3());
      size = [extent.x + 0.1, extent.y + 0.1, extent.z + 0.1];
      this.#outline.rotation.set(0, 0, 0);
      box.getCenter(this.#outline.position);
    }
    this.#outline.scale.set(size[0]!, size[1]!, size[2]!);
    this.#outline.visible = true;
    const pivot = this.#pivot(instances);
    this.#gizmo.place(
      this.#gizmoOn && !this.#moving && !this.#locked(instances)
        ? {
            x: pivot.x,
            y: pivot.y + 0.05,
            z: pivot.z,
            size: Math.max(size[0]!, size[2]!),
            resize: instances.length === 1,
          }
        : null,
    );
  }

  /** Every selected item that still exists. */
  #instances(): ItemInstance[] {
    if (this.#selected.length === 0) return [];
    const wanted = new Set(this.#selected);
    return this.options.world().instances.filter((i) => wanted.has(i.instanceId));
  }

  /** The selected item when exactly one unlocked item is selected (move, duplicate, row). */
  #single(): ItemInstance | null {
    const instances = this.#instances();
    if (instances.length === 1 && !this.#locked(instances)) return instances[0]!;
    if (instances.length > 0)
      this.options.fail(instances.length > 1 ? 'That works on one item at a time.' : 'It is locked.');
    return null;
  }

  /** The item being moved (the only selected one). */
  #instance(): ItemInstance | null {
    const instances = this.#instances();
    return instances.length === 1 ? instances[0]! : null;
  }

  #copyBeside(instance: ItemInstance): string | null {
    const { bounds, snug, grid } = this.options.items.model(instance.itemId, instance.params);
    const { position, rotation, scale } = instance.transform;
    const yaw = yawOf(rotation);
    const step = (bounds.max[0] - bounds.min[0]) * scale[0] + (snug ? 0 : COPY_GAP);
    const x = round(position[0] + Math.cos(yaw) * step);
    const z = round(position[2] - Math.sin(yaw) * step);
    // Items standing on the ground follow the ground; stacked items keep their height. That is
    // the hint: a copy of a resting item rests where it lands (P2-43), while a copy of an item in
    // the air, or of a grid block, stays at the hint.
    const onGround = Math.abs(position[1] - this.options.heightAt(position[0], position[2])) < 0.05;
    const y = round(onGround ? this.options.heightAt(x, z) : position[1]);
    const rest = asksForRest(grid) && (this.options.isResting ? this.options.isResting(instance) : onGround);
    const instanceId = newId('item');
    const placed = this.options.apply({
      type: 'place_item',
      params: {
        instanceId,
        itemId: instance.itemId,
        position: [x, y, z],
        rotation,
        scale,
        itemParams: instance.params,
        ...restFlag(rest),
      },
    });
    return placed ? instanceId : null;
  }

  /** Snapped spot on the nearest surface under the pointer (ground, floor, or another item). */
  #surfacePoint(clientX: number, clientY: number, itemId: string): [number, number, number] | null {
    const ignore = this.#moving ? (this.#selected[0] ?? null) : null;
    const grid = this.options.items.model(itemId).grid;
    for (const hit of this.options.cast(clientX, clientY, this.options.surfaces())) {
      const id = this.options.items.instanceIdAt(hit.object, hit.instanceId);
      if (id && id === ignore) continue;
      const onTerrain = hit.object.name.startsWith('terrain:');
      if (grid) return this.#gridCell(hit, id, grid, onTerrain);
      const x = this.#snapValue(hit.point.x);
      const z = this.#snapValue(hit.point.z);
      return [x, round(onTerrain ? this.options.heightAt(x, z) : hit.point.y), z];
    }
    return null;
  }

  /**
   * Block-style items fill grid cells: tapping a block's top stacks on it, tapping a side puts
   * the new block next to it, tapping the ground uses the cell there.
   */
  #gridCell(
    hit: Intersection,
    hitId: string | null,
    grid: number,
    onTerrain: boolean,
  ): [number, number, number] {
    const cell = (v: number) => Math.floor(v / grid) * grid + grid / 2;
    const normal = new Vector3(0, 1, 0);
    if (hitId && hit.face && hit.instanceId !== undefined) {
      const matrix = new Matrix4();
      (hit.object as InstancedMesh).getMatrixAt(hit.instanceId, matrix);
      normal.copy(hit.face.normal).applyMatrix3(new Matrix3().getNormalMatrix(matrix)).normalize();
    }
    const target = hit.point.clone().addScaledVector(normal, grid / 2);
    const x = round(cell(target.x));
    const z = round(cell(target.z));
    if (!hitId) return [x, round(onTerrain ? this.options.heightAt(x, z) : hit.point.y), z];
    const base =
      this.options.world().instances.find((i) => i.instanceId === hitId)?.transform.position[1] ?? 0;
    if (normal.y > 0.5) return [x, round(base + grid), z];
    if (normal.y < -0.5) return [x, round(base - grid), z];
    return [x, round(base), z];
  }

  #showGhost(itemId: string): void {
    if (this.#ghost && this.#ghostItemId === itemId) {
      this.#ghost.visible = true;
      return;
    }
    this.#hideGhost();
    this.#ghost = this.options.items.previewMesh(itemId, this.#ghostMaterial);
    this.#ghostItemId = itemId;
    this.#ghost.userData.helper = true;
    this.options.scene.add(this.#ghost);
  }

  /** An item's model changed (its package loaded): the ghost is drawn again on the next move. */
  modelChanged(itemId: string): void {
    if (this.#ghostItemId === itemId) this.#hideGhost();
  }

  #hideGhost(): void {
    if (!this.#ghost) return;
    this.options.scene.remove(this.#ghost);
    this.#ghost.geometry.dispose();
    this.#ghost = null;
    this.#ghostItemId = null;
  }

  dispose(): void {
    this.#hideGhost();
    this.options.scene.remove(this.#outline, this.#gizmo.group);
    this.#gizmo.dispose();
    this.#outline.geometry.dispose();
    (this.#outline.material as LineBasicMaterial).dispose();
    this.#ghostMaterial.dispose();
  }
}
