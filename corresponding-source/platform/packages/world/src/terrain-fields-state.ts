import {
  TerrainFieldId,
  TerrainFieldSets,
  TerrainFieldTile,
  type CommandPayload,
  type TerrainFieldDescriptor,
} from '@genvr/contracts';
import { TerrainFieldStore, validateTerrainFieldTile, serializeTerrainFieldTile } from './terrain-fields.js';
import type { WorldState, ApplyResult } from './apply.js';

export const FIELD_COMMAND_TYPES = [
  'create_field_set',
  'set_field_tile',
  'remove_field_tile',
  'remove_field_set',
  'restore_field_tile',
] as const;
export type FieldCommand = Extract<CommandPayload, { type: (typeof FIELD_COMMAND_TYPES)[number] }>;
export function isFieldCommand(command: CommandPayload): command is FieldCommand {
  return (FIELD_COMMAND_TYPES as readonly string[]).includes(command.type);
}
export class TerrainFieldStateError extends Error {
  constructor(
    readonly code: 'invalid' | 'not_found' | 'duplicate',
    message: string,
  ) {
    super(message);
  }
}
/** Canonical DB storage key without needing a loaded descriptor. Shape is checked by state application. */
export function fieldTileStorageKey(setId: string, tx: number, tz: number): string {
  TerrainFieldId.parse(setId);
  if (!Number.isInteger(tx) || !Number.isInteger(tz) || tx < 0 || tz < 0 || tx > 31 || tz > 31)
    throw new RangeError('Invalid field tile coordinates');
  return `f:${setId}:${tx},${tz}`;
}
export function parseFieldTileStorageKey(key: string): { setId: string; tx: number; tz: number } {
  const match = /^f:([a-z][a-z0-9_-]{0,47}):((?:[0-9]|[12][0-9]|3[01])),((?:[0-9]|[12][0-9]|3[01]))$/.exec(
    key,
  );
  if (!match) throw new Error('Invalid field tile storage key');
  return { setId: match[1]!, tx: Number(match[2]), tz: Number(match[3]) };
}
/** Distinct old rows a selective command save must load before applying/producing an inverse. */
export function fieldCommandKeys(commands: readonly CommandPayload[]): string[] {
  const keys = new Set<string>();
  for (const command of commands) {
    if (command.type === 'set_field_tile') {
      const tile = command.params.tile;
      keys.add(fieldTileStorageKey(tile.setId, tile.tx, tile.tz));
    } else if (command.type === 'remove_field_tile' || command.type === 'restore_field_tile') {
      const p = command.params;
      keys.add(fieldTileStorageKey(p.setId, p.tx, p.tz));
    }
  }
  return [...keys];
}
export function initializeTerrainFieldSets(state: WorldState): void {
  const sets = TerrainFieldSets.parse(state.doc.terrain.fieldSets ?? {});
  for (const metadata of Object.values(sets)) metadata.tiles.sort();
  if (state.doc.terrain.fieldSets) state.doc.terrain.fieldSets = sets;
  for (const [id, set] of Object.entries(sets))
    state.terrain.fieldSets.set(id, new TerrainFieldStore(set.descriptor));
}
/** Descriptor metadata is authoritative; unknown/unreferenced/duplicate persisted rows fail closed. */
export function loadTerrainFieldTile(state: WorldState, input: unknown): void {
  const tile = TerrainFieldTile.parse(input);
  const { metadata, store } = requireSet(state, tile.setId);
  const coord = `${tile.tx},${tile.tz}`;
  if (!metadata.tiles.includes(coord))
    throw new TerrainFieldStateError('invalid', 'Stored field tile has no metadata reference');
  if (store.getTile(tile.tx, tile.tz))
    throw new TerrainFieldStateError('invalid', 'Duplicate stored field tile');
  store.replace(tile, store.revision);
}
function requireSet(state: WorldState, id: string) {
  const metadata = state.doc.terrain.fieldSets?.[id],
    store = state.terrain.fieldSets.get(id);
  if (!metadata || !store) throw new TerrainFieldStateError('not_found', `Field set ${id} not found`);
  return { metadata, store };
}
function referencedTile(state: WorldState, id: string, tx: number, tz: number): TerrainFieldTile | null {
  const { metadata, store } = requireSet(state, id),
    tile = store.getTile(tx, tz);
  const exists = metadata.tiles.includes(`${tx},${tz}`);
  if (exists && !tile)
    throw new TerrainFieldStateError(
      'invalid',
      'Referenced field tile was not loaded; load its exact old row before editing',
    );
  if (!exists && tile)
    throw new TerrainFieldStateError('invalid', 'Loaded field tile has no metadata reference');
  return tile;
}
function sameTile(a: TerrainFieldTile | null, b: TerrainFieldTile | null): boolean {
  if (!a || !b) return a === b;
  return (
    a.kind === b.kind &&
    a.setId === b.setId &&
    a.tx === b.tx &&
    a.tz === b.tz &&
    a.cols === b.cols &&
    a.rows === b.rows &&
    Object.keys(a.channels).length === Object.keys(b.channels).length &&
    Object.entries(a.channels).every(([id, bytes]) => b.channels[id] === bytes)
  );
}
/** Only loaded referenced rows can be serialized; an omitted old row can never become a deletion. */
export function encodeTerrainFieldRow(state: WorldState, key: string): string {
  const { setId, tx, tz } = parseFieldTileStorageKey(key);
  if (!state.doc.terrain.fieldSets?.[setId] && state.terrain.removedFieldSets.has(setId)) return '';
  const tile = referencedTile(state, setId, tx, tz),
    { store } = requireSet(state, setId);
  return tile ? serializeTerrainFieldTile(store.descriptor, tile) : '';
}
export function loadedTerrainFieldKeys(state: WorldState): string[] {
  const keys: string[] = [];
  for (const [id, metadata] of Object.entries(state.doc.terrain.fieldSets ?? {})) {
    const { store } = requireSet(state, id);
    for (const coord of metadata.tiles) {
      const [tx, tz] = coord.split(',').map(Number) as [number, number];
      if (store.getTile(tx, tz)) keys.push(fieldTileStorageKey(id, tx, tz));
    }
  }
  return keys;
}
function validateInverseTile(
  descriptor: TerrainFieldDescriptor,
  input: TerrainFieldTile | null,
  setId: string,
  tx: number,
  tz: number,
): TerrainFieldTile | null {
  if (!input) return null;
  const tile = validateTerrainFieldTile(descriptor, input);
  if (tile.setId !== setId || tile.tx !== tx || tile.tz !== tz)
    throw new TerrainFieldStateError('invalid', 'Inverse field tile coordinates mismatch');
  return tile;
}
export function applyFieldCommand(state: WorldState, command: FieldCommand): ApplyResult {
  const none = new Set<string>();
  if (command.type === 'create_field_set') {
    const descriptor = command.params.descriptor,
      id = descriptor.id;
    if (state.doc.terrain.fieldSets?.[id] || state.terrain.fieldSets.has(id))
      throw new TerrainFieldStateError('duplicate', `Field set ${id} already exists`);
    const sets = TerrainFieldSets.parse({ ...state.doc.terrain.fieldSets, [id]: { descriptor, tiles: [] } });
    const store = new TerrainFieldStore(descriptor);
    state.doc.terrain.fieldSets = sets;
    state.terrain.fieldSets.set(id, store);
    state.terrain.removedFieldSets.delete(id);
    return { inverse: { type: 'remove_field_set', params: { setId: id } }, changedChunks: none };
  }
  if (command.type === 'remove_field_set') {
    const { setId } = command.params,
      { metadata, store } = requireSet(state, setId);
    if (metadata.tiles.length || store.tileCount)
      throw new TerrainFieldStateError('invalid', 'Only an empty staged field set can be removed');
    const descriptor = store.descriptor;
    delete state.doc.terrain.fieldSets![setId];
    state.terrain.fieldSets.delete(setId);
    state.terrain.removedFieldSets.add(setId);
    if (Object.keys(state.doc.terrain.fieldSets!).length === 0) delete state.doc.terrain.fieldSets;
    return { inverse: { type: 'create_field_set', params: { descriptor } }, changedChunks: none };
  }
  const incoming = command.type === 'set_field_tile' ? command.params.tile : null;
  const p = command.params;
  const setId = incoming?.setId ?? ('setId' in p ? p.setId : ''),
    tx = incoming?.tx ?? ('tx' in p ? p.tx : 0),
    tz = incoming?.tz ?? ('tz' in p ? p.tz : 0);
  const { metadata, store } = requireSet(state, setId);
  const old = referencedTile(state, setId, tx, tz);
  let next: TerrainFieldTile | null;
  if (command.type === 'restore_field_tile') {
    const expected = validateInverseTile(store.descriptor, command.params.after, setId, tx, tz);
    next = validateInverseTile(store.descriptor, command.params.before, setId, tx, tz);
    if (!sameTile(old, expected))
      throw new TerrainFieldStateError('invalid', 'Field tile changed since this inverse was recorded');
  } else next = incoming ? validateTerrainFieldTile(store.descriptor, incoming) : null;
  if (command.type === 'remove_field_tile' && !old)
    throw new TerrainFieldStateError('not_found', 'Field tile not found');
  store.restore(tx, tz, next, store.revision);
  const coord = `${tx},${tz}`;
  if (next && !metadata.tiles.includes(coord)) metadata.tiles.push(coord);
  metadata.tiles.sort();
  if (!next) metadata.tiles = metadata.tiles.filter((key) => key !== coord);
  return {
    inverse: { type: 'restore_field_tile', params: { setId, tx, tz, before: old, after: next } },
    changedChunks: new Set([fieldTileStorageKey(setId, tx, tz)]),
  };
}
