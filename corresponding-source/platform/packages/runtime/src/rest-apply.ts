import type { CommandPayload, ItemInstance } from '@genvr/contracts';
import {
  defaultFromY,
  gradeCommands,
  isResting,
  REBUILDS_SURFACES,
  refreshesLayers,
  regionOf,
  rest,
  restingBefore,
  settleChain,
  worldBox,
  type Rect,
  type RestResult,
  type RestShape,
  type SurfaceIndex,
  type SurfaceLayers,
} from '@genvr/validator';
import type { AppliedStep, CommandHistory, WorldState } from '@genvr/world';

/** What the rest law needs to know about the place being edited (P2-43). */
export interface RestContext {
  shapeOf(itemId: string): RestShape | null;
  /** The surface index; the host keeps it cached and rebuilds it when told to. */
  surfaces(): SurfaceIndex;
  /** Drops the cached surface index, so the next `surfaces()` builds a new one. */
  invalidate?(): void;
  /**
   * Room floors, bridge decks and water as the place stands now (`restLayers` of `@genvr/world`):
   * after the ground under a wall, road or river changed, the cached index takes these instead of
   * keeping the old ones (P2-43 final review, I6).
   */
  layers?(): SurfaceLayers;
}

/** How far below a mover's top a thing's base may sit and still be "on it" (meters). */
const ON_TOP = 0.05;
/** Below this, a sideways move is rounding noise, not a move (meters). */
const SIDEWAYS = 1e-6;

/**
 * What the rest law remembers during one undo group a caller keeps open (a drag of the move
 * handle, a nudge of several items, a batch): the graded buildings still to level when the group
 * ends (I1), the items that moved by their own command (I5), and what each moved or carried item
 * stood on when the group began (I5). Kept per context, for the group `groupNumber` names.
 */
interface GroupMemory {
  group: number;
  pendingGrades: Set<string>;
  ownMoved: Set<string>;
  parents: Map<string, string>;
}

const memories = new WeakMap<RestContext, GroupMemory>();

const freshMemory = (group: number): GroupMemory => ({
  group,
  pendingGrades: new Set(),
  ownMoved: new Set(),
  parents: new Map(),
});

/** The memory of the group open now: the same one for every call inside that group. */
function memoryOf(history: CommandHistory, context: RestContext): GroupMemory {
  const known = memories.get(context);
  if (known && known.group === history.groupNumber) return known;
  const memory = freshMemory(history.groupNumber);
  memories.set(context, memory);
  return memory;
}

/** Keeps the surface index in step with a command that placed, moved or removed an item. */
function track(surfaces: SurfaceIndex, state: WorldState, command: CommandPayload): void {
  if (command.type === 'place_item' || command.type === 'transform_item' || command.type === 'remove_item') {
    const id = command.params.instanceId;
    surfaces.update(state.doc.instances.find((i) => i.instanceId === id) ?? null, id);
  }
}

/**
 * The item a place or move command would leave, with the command's position, rotation and scale
 * merged in: the same merge as the API's `resolveRest`, so both compute the same rest.
 */
function planned(state: WorldState, command: CommandPayload): ItemInstance | null {
  if (command.type === 'place_item')
    return {
      instanceId: command.params.instanceId,
      itemId: command.params.itemId,
      params: command.params.itemParams ?? {},
      transform: {
        position: command.params.position,
        rotation: command.params.rotation ?? [0, 0, 0, 1],
        scale: command.params.scale ?? [1, 1, 1],
      },
    };
  if (command.type !== 'transform_item') return null;
  const { params } = command;
  const current = state.doc.instances.find((i) => i.instanceId === params.instanceId);
  if (!current) return null;
  return {
    ...current,
    transform: {
      ...current.transform,
      ...(params.position ? { position: params.position } : {}),
      ...(params.rotation ? { rotation: params.rotation } : {}),
      ...(params.scale ? { scale: params.scale } : {}),
    },
  };
}

type Box = { min: readonly number[]; max: readonly number[] };

function boxOf(instance: ItemInstance, shape: RestShape): Box {
  return worldBox(instance, {
    min: shape.min as [number, number, number],
    max: shape.max as [number, number, number],
    solid: true,
    part: false,
  });
}

/** Whether two boxes overlap across the ground (touching edges do not count). */
const overlapsAcross = (a: Box, b: Box) =>
  a.min[0]! < b.max[0]! && b.min[0]! < a.max[0]! && a.min[2]! < b.max[2]! && b.min[2]! < a.max[2]!;

/** Whether `upper`'s base sits on `lower`'s top. */
const standsOn = (upper: Box, lower: Box) =>
  overlapsAcross(upper, lower) && Math.abs(upper.min[1]! - lower.max[1]!) <= ON_TOP;

/** What an item stands on (the highest item whose top its base sits on), if any. */
function supportOf(
  state: WorldState,
  context: RestContext,
  instance: ItemInstance,
  shape: RestShape,
): string | null {
  const box = boxOf(instance, shape);
  let best: { id: string; top: number } | null = null;
  for (const other of state.doc.instances) {
    if (other.instanceId === instance.instanceId) continue;
    const otherShape = context.shapeOf(other.itemId);
    if (!otherShape) continue;
    const otherBox = boxOf(other, otherShape);
    if (standsOn(box, otherBox) && (!best || otherBox.max[1]! > best.top))
      best = { id: other.instanceId, top: otherBox.max[1]! };
  }
  return best?.id ?? null;
}

/**
 * Everything resting on top of `moverId`, and on top of those, as it stands now (P2-43 final
 * review, I5): a thing is carried when its base sits on the top of what carries it, across the
 * ground they overlap, and it rests by the law (a thing placed in the air on purpose stays put).
 * Items in `exclude` (moving by their own command in this group) are never carried. Parents come
 * before their children.
 */
function carriedBy(
  state: WorldState,
  context: RestContext,
  surfaces: SurfaceIndex,
  moverId: string,
  exclude: ReadonlySet<string>,
): Array<{ id: string; parent: string }> {
  const carried: Array<{ id: string; parent: string }> = [];
  const seen = new Set<string>([moverId, ...exclude]);
  const queue = [moverId];
  while (queue.length > 0) {
    const parentId = queue.shift()!;
    const parent = state.doc.instances.find((i) => i.instanceId === parentId);
    const parentShape = parent && context.shapeOf(parent.itemId);
    if (!parent || !parentShape) continue;
    const parentBox = boxOf(parent, parentShape);
    for (const other of state.doc.instances) {
      if (seen.has(other.instanceId)) continue;
      const shape = context.shapeOf(other.itemId);
      if (!shape || shape.rule.mode === 'float') continue;
      if (!standsOn(boxOf(other, shape), parentBox) || !isResting(other, shape, surfaces)) continue;
      seen.add(other.instanceId);
      carried.push({ id: other.instanceId, parent: parentId });
      queue.push(other.instanceId);
    }
  }
  return carried;
}

/**
 * The one door every studio edit goes through (P2-43, decision 116): a command that asks for rest
 * gets its y (and tilt) by the law, and every item the change reaches that rested before rests
 * again. What stands on a moved item moves with it (I5). All of it is one undo step: its own group,
 * or the group the caller already opened (a build tool's drag), which it then leaves open. While a
 * caller's group is open, a graded building rests on the ground as it is and is graded only once,
 * when the group ends (`endRestGroup`, I1), so a drag leaves no trail of levelled ground. A graded
 * building first levels its ground, then rests again on the levelled ground (the server resolves
 * it after the grade too). If any command is refused, everything this call applied is taken back
 * before the error is thrown on. Undo and redo never come here.
 */
export function applyWithRest(
  history: CommandHistory,
  state: WorldState,
  context: RestContext,
  input: CommandPayload,
): AppliedStep[] {
  return applyRest(history, state, context, input, false);
}

/**
 * Ends the undo group a caller opened (P2-43 final review, I1): first levels the ground under every
 * graded building the group moved (rested without grading while it was dragged), rests it again
 * on that ground and runs the chain, all inside the same group, then closes it. Returns the steps
 * it applied, for the host to report. Use it instead of `history.endGroup()` around edits that went
 * through `applyWithRest`. If a grade is refused the group is still closed and the error thrown on.
 */
export function endRestGroup(
  history: CommandHistory,
  state: WorldState,
  context: RestContext,
): AppliedStep[] {
  const steps: AppliedStep[] = [];
  try {
    const memory = memories.get(context);
    if (history.grouping && memory && memory.group === history.groupNumber) {
      const pending = [...memory.pendingGrades].sort();
      memory.pendingGrades.clear();
      for (const instanceId of pending) {
        if (!state.doc.instances.some((i) => i.instanceId === instanceId)) continue;
        steps.push(
          ...applyRest(
            history,
            state,
            context,
            { type: 'transform_item', params: { instanceId, rest: true } },
            true,
          ),
        );
      }
    }
  } finally {
    memories.delete(context);
    history.endGroup();
  }
  return steps;
}

/**
 * Begins an undo group for edits that go through `applyWithRest` (P2-43 final review): a group
 * still open is ended first through `endRestGroup`, so the grades it deferred are not lost the way
 * `history.beginGroup()` alone would lose them. Returns the steps that flush applied.
 */
export function beginRestGroup(
  history: CommandHistory,
  state: WorldState,
  context: RestContext,
): AppliedStep[] {
  const steps = history.grouping ? endRestGroup(history, state, context) : [];
  history.beginGroup();
  return steps;
}

function applyRest(
  history: CommandHistory,
  state: WorldState,
  context: RestContext,
  input: CommandPayload,
  gradeNow: boolean,
): AppliedStep[] {
  let surfaces = context.surfaces();
  const own = !history.grouping;
  // In its own group nothing needs remembering past this call; in a caller's group, everything.
  const memory = own ? freshMemory(-1) : memoryOf(history, context);
  const defer = !own && !gradeNow;
  let command = input;
  let grade: CommandPayload[] = [];
  let regrade: ((surfaces: SurfaceIndex) => RestResult) | null = null;

  // The mover's own support when the group began, and what it carries (P2-43 final review, I5).
  const moverId = command.type === 'transform_item' ? command.params.instanceId : null;
  const mover = moverId ? state.doc.instances.find((i) => i.instanceId === moverId) : undefined;
  const moverShape = mover ? context.shapeOf(mover.itemId) : null;
  if (mover && moverShape && !memory.parents.has(mover.instanceId)) {
    const support = supportOf(state, context, mover, moverShape);
    if (support) memory.parents.set(mover.instanceId, support);
  }
  /** Above the top of what this item stood on when the group began, if that moved in the group
   * too and is under it now: a lamp moved before its table (in either order) still lands on it. */
  const liftOnto = (instance: ItemInstance, shape: RestShape): number | undefined => {
    const parentId = memory.parents.get(instance.instanceId);
    if (!parentId || !memory.ownMoved.has(parentId)) return undefined;
    const parent = state.doc.instances.find((i) => i.instanceId === parentId);
    const parentShape = parent && context.shapeOf(parent.itemId);
    if (!parent || !parentShape) return undefined;
    const parentBox = boxOf(parent, parentShape);
    if (!overlapsAcross(boxOf(instance, shape), parentBox)) return undefined;
    return Math.max(defaultFromY(instance, shape), parentBox.max[1]! + ON_TOP);
  };

  if ((command.type === 'place_item' || command.type === 'transform_item') && command.params.rest) {
    const params = { ...command.params };
    delete params.rest;
    const stripped = { ...command, params } as CommandPayload;
    const instance = planned(state, stripped);
    const shape = instance && context.shapeOf(instance.itemId);
    command = stripped;
    if (instance && shape) {
      const fromY = liftOnto(instance, shape);
      const resolve = (index: SurfaceIndex) =>
        rest(instance, shape, index, undefined, undefined, fromY === undefined ? undefined : { fromY });
      const result = resolve(surfaces);
      command = {
        ...stripped,
        params: { ...params, position: result.position, rotation: result.rotation },
      } as CommandPayload;
      if (result.grade) {
        if (defer) memory.pendingGrades.add(instance.instanceId);
        else {
          grade = gradeCommands(result.grade);
          regrade = resolve;
        }
      }
    }
  }

  // Things standing on a thing moved sideways go with it; the ones that moved in this group by
  // their own command are left to it, and set down on the mover again below.
  let carried: Array<{ id: string; parent: string }> = [];
  let reseat: string[] = [];
  let dx = 0;
  let dz = 0;
  if (mover && moverShape && command.type === 'transform_item') {
    const to = command.params.position ?? mover.transform.position;
    dx = to[0] - mover.transform.position[0];
    dz = to[2] - mover.transform.position[2];
    if (Math.abs(dx) > SIDEWAYS || Math.abs(dz) > SIDEWAYS) {
      carried = carriedBy(state, context, surfaces, mover.instanceId, memory.ownMoved);
      for (const { id, parent } of carried) if (!memory.parents.has(id)) memory.parents.set(id, parent);
    }
    reseat = [...memory.ownMoved].filter(
      (id) => id !== mover.instanceId && memory.parents.get(id) === mover.instanceId,
    );
    memory.ownMoved.add(mover.instanceId);
  }
  const carriedMoves: CommandPayload[] = carried.flatMap(({ id }) => {
    const instance = state.doc.instances.find((i) => i.instanceId === id);
    if (!instance) return [];
    const [x, y, z] = instance.transform.position;
    return [{ type: 'transform_item', params: { instanceId: id, position: [x + dx, y, z + dz] } }];
  });

  // A grade reaches further than the building: what rested in its blend ring rests again too.
  const regions = [command, ...grade, ...carriedMoves].map((next) =>
    regionOf(next, state.doc, context.shapeOf),
  );
  const region = regions.includes('all') ? 'all' : (regions as Rect[][]).flat();
  const resting =
    region === 'all' || region.length > 0
      ? restingBefore(state.doc, region, context.shapeOf, surfaces)
      : new Map<string, boolean>();
  const mark = history.size;
  if (own) history.beginGroup();
  const steps: AppliedStep[] = [];
  const run = (next: CommandPayload) => {
    steps.push(history.execute(next));
    if (REBUILDS_SURFACES.has(next.type) && context.invalidate) {
      context.invalidate();
      surfaces = context.surfaces();
    } else {
      track(surfaces, state, next);
      // Floors, decks and rivers follow the ground under them (P2-43 final review, I6).
      if (context.layers && refreshesLayers(next, state.doc)) surfaces.setLayers(context.layers());
    }
  };
  const heightOf = (id: string) =>
    state.doc.instances.find((i) => i.instanceId === id)?.transform.position[1] ?? 0;
  try {
    for (const flatten of grade) run(flatten);
    if (regrade) {
      // The level ground can differ a little from the level asked for; rest on what is there.
      const again = regrade(surfaces);
      command = {
        ...command,
        params: { ...command.params, position: again.position, rotation: again.rotation },
      } as CommandPayload;
    }
    const risen = new Map<string, number>();
    const before = moverId ? heightOf(moverId) : 0;
    run(command);
    if (moverId) risen.set(moverId, heightOf(moverId) - before);
    // Carried things, parents first: across by the mover's move, then down onto what is under them
    // now, searching from above the carrier's rise so a table climbing a hill keeps its lamp on top.
    for (const { id, parent } of carried) {
      const instance = state.doc.instances.find((i) => i.instanceId === id);
      const shape = instance && context.shapeOf(instance.itemId);
      if (!instance || !shape) continue;
      const [x, y, z] = instance.transform.position;
      const across: ItemInstance = {
        ...instance,
        transform: { ...instance.transform, position: [x + dx, y, z + dz] },
      };
      const fromY = defaultFromY(across, shape) + Math.max(0, risen.get(parent) ?? 0);
      const result = rest(across, shape, surfaces, undefined, undefined, { fromY });
      run({
        type: 'transform_item',
        params: { instanceId: id, position: result.position, rotation: result.rotation },
      });
      risen.set(id, result.position[1] - y);
    }
    // Things that moved first in this group, and stood on the mover when it began: set them down
    // on its top again, now that it is under them.
    for (const id of reseat) {
      const instance = state.doc.instances.find((i) => i.instanceId === id);
      const shape = instance && context.shapeOf(instance.itemId);
      const fromY = instance && shape ? liftOnto(instance, shape) : undefined;
      if (!instance || !shape || fromY === undefined) continue;
      const result = rest(instance, shape, surfaces, undefined, undefined, { fromY });
      if (Math.abs(result.position[1] - instance.transform.position[1]) < 0.001) continue;
      run({
        type: 'transform_item',
        params: { instanceId: id, position: result.position, rotation: result.rotation },
      });
    }
    // The item just placed or moved is where the law (or its maker) put it, and so are the things
    // it carried; the chain looks after the others.
    if (command.type === 'place_item' || command.type === 'transform_item')
      resting.delete(command.params.instanceId);
    for (const { id } of carried) resting.delete(id);
    for (const id of reseat) resting.delete(id);
    // In a caller's group (a sculpt stroke), a graded building the chain re-rests is levelled once,
    // when the group ends, not on every tick (P2-43 final review).
    settleChain(
      state.doc,
      context.shapeOf,
      surfaces,
      resting,
      run,
      undefined,
      defer
        ? {
            deferGrade: (id) => {
              memory.pendingGrades.add(id);
              return true;
            },
          }
        : undefined,
    );
  } catch (error) {
    history.discardFromGroup(steps.length);
    // What was tracked into the surface index is gone again: rebuild it from the document.
    context.invalidate?.();
    throw error;
  } finally {
    if (own) {
      history.endGroup();
      history.mergeSince(mark);
    }
  }
  return steps;
}
