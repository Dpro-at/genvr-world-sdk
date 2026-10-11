import type { GenvrRuntime, ItemSelection } from '@genvr/runtime';

/**
 * Explorer actions on the selected items (task P3-26), shared by the explorer and properties.
 * Each action is one undo step made of normal world commands (saving and co-building just work).
 */

const newId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

/** Items of the selection that are in no group yet (only those can form a new group). */
export function canGroup(runtime: GenvrRuntime, selection: ItemSelection | null): boolean {
  if (!selection || selection.instanceIds.length < 2 || selection.groupId) return false;
  const ids = new Set(selection.instanceIds);
  return !runtime.world.instances.some((i) => ids.has(i.instanceId) && i.groupId);
}

/** Groups the selected items under a new name ("Group 3"); they stay selected. */
export function groupSelection(runtime: GenvrRuntime, selection: ItemSelection): boolean {
  const taken = new Set(runtime.world.groups.map((g) => g.name));
  let n = runtime.world.groups.length + 1;
  while (taken.has(`Group ${n}`)) n += 1;
  const ok = runtime.applyCommand({
    type: 'group_items',
    params: { groupId: newId('group'), name: `Group ${n}`, instanceIds: selection.instanceIds },
  });
  if (ok) runtime.selectItems(selection.instanceIds);
  return ok;
}

export function ungroupSelection(runtime: GenvrRuntime, selection: ItemSelection): boolean {
  if (!selection.groupId) return false;
  return runtime.applyCommand({ type: 'ungroup_items', params: { groupId: selection.groupId } });
}

/** Lock, anchor, or mark as meant to float every selected item (one undo step). */
export function setSelectionFlags(
  runtime: GenvrRuntime,
  selection: ItemSelection,
  flags: { locked?: boolean; anchored?: boolean; floats?: boolean | null },
): boolean {
  return runtime.applyBatch(
    selection.instanceIds.map((instanceId) => ({ type: 'set_item_flags', params: { instanceId, ...flags } })),
  );
}

/** True when every selected item is marked as meant to float (P2-11). */
export function selectionFloats(runtime: GenvrRuntime, selection: ItemSelection): boolean {
  const ids = new Set(selection.instanceIds);
  return runtime.world.instances.every((i) => !ids.has(i.instanceId) || i.floats === true);
}

/** True when every selected item is anchored (the default). */
export function selectionAnchored(runtime: GenvrRuntime, selection: ItemSelection): boolean {
  const ids = new Set(selection.instanceIds);
  return runtime.world.instances.every((i) => !ids.has(i.instanceId) || i.anchored !== false);
}
