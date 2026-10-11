import { TerrainFieldSetMetadata, TerrainFieldTile, TERRAIN_FIELD_TILE_SIZE } from '@genvr/contracts';
import { TerrainFieldStore } from '@genvr/world';

export interface TerrainFieldPageRequest {
  readonly setId: string;
  readonly version: number;
  /** Row-major references from the complete metadata; never more than eight. */
  readonly coordinates: readonly Readonly<{ tx: number; tz: number }>[];
}
export interface TerrainFieldPage {
  readonly version: number;
  readonly tiles: readonly unknown[];
}
export type TerrainFieldPageLoader = (
  request: TerrainFieldPageRequest,
  signal?: AbortSignal,
) => Promise<TerrainFieldPage>;
export interface TerrainFieldLoadOptions {
  signal?: AbortSignal;
  /** Called before page work and between every decoded tile. Default: next timer task. */
  yieldControl?: () => Promise<void>;
  /** Counts only: an incomplete store is never passed to the caller. */
  onProgress?: (progress: Readonly<{ loaded: number; total: number }>) => void;
}

/** Hydrates a caller-selected complete staged set; does not activate or install terrain consumers. */
export async function hydrateTerrainFieldSet(
  metadata: TerrainFieldSetMetadata,
  version: number,
  loadPage: TerrainFieldPageLoader,
  {
    signal,
    yieldControl = () => new Promise<void>((resolve) => setTimeout(resolve, 0)),
    onProgress,
  }: TerrainFieldLoadOptions = {},
): Promise<TerrainFieldStore> {
  const checkAbort = () => {
    if (signal?.aborted) throw new DOMException('Terrain field loading aborted', 'AbortError');
  };
  checkAbort();
  if (!Number.isSafeInteger(version) || version < 0) throw new RangeError('Invalid terrain snapshot version');
  const set = TerrainFieldSetMetadata.parse(metadata);
  const total =
    Math.ceil(set.descriptor.width / TERRAIN_FIELD_TILE_SIZE) *
    Math.ceil(set.descriptor.height / TERRAIN_FIELD_TILE_SIZE);
  if (set.tiles.length !== total) throw new Error('Terrain field metadata is incomplete');
  // Parsing snapshots mutable caller metadata before asynchronous work; callbacks cannot rewrite requests.
  const coordinates = set.tiles
    .map((key) => {
      const [tx, tz] = key.split(',').map(Number);
      return Object.freeze({ tx: tx!, tz: tz! });
    })
    .sort((a, b) => a.tz - b.tz || a.tx - b.tx);
  const store = new TerrainFieldStore(set.descriptor);
  let loaded = 0;
  const progress = () => {
    checkAbort();
    onProgress?.(Object.freeze({ loaded, total }));
    checkAbort();
  };
  const yieldChecked = async () => {
    checkAbort();
    await yieldControl();
    checkAbort();
  };
  progress();
  for (let offset = 0; offset < total; offset += 8) {
    await yieldChecked();
    const requested = Object.freeze(coordinates.slice(offset, offset + 8));
    const request = Object.freeze({ setId: set.descriptor.id, version, coordinates: requested });
    checkAbort();
    const response = await loadPage(request, signal);
    checkAbort();
    if (!response || response.version !== version) throw new Error('Terrain field snapshot version conflict');
    if (!Array.isArray(response.tiles) || response.tiles.length !== requested.length)
      throw new Error('Terrain field page has missing or excessive tiles');
    const wanted = new Set(requested.map((c) => `${c.tx},${c.tz}`)),
      rows = new Map<string, unknown>();
    // Envelope inspection does not decode channel bytes; full codec validation is paced below.
    for (const row of response.tiles) {
      if (!row || typeof row !== 'object') throw new Error('Invalid terrain field tile envelope');
      const tile = row as { setId?: unknown; tx?: unknown; tz?: unknown };
      const key = `${tile.tx},${tile.tz}`;
      if (
        tile.setId !== set.descriptor.id ||
        !Number.isInteger(tile.tx) ||
        !Number.isInteger(tile.tz) ||
        !wanted.has(key) ||
        rows.has(key)
      )
        throw new Error('Terrain field page has duplicate or unrequested coordinates');
      // Snapshot the envelope and immutable base64 strings before yielding to caller code.
      // Schema parsing clones objects but does not decode the raw channels.
      rows.set(key, TerrainFieldTile.parse(row));
    }
    for (const coordinate of requested) {
      await yieldChecked();
      // Shared codec checks canonical base64, channel coverage, exact lengths, ranges and finite floats.
      store.replace(rows.get(`${coordinate.tx},${coordinate.tz}`), store.revision);
      checkAbort();
      loaded++;
      progress();
    }
  }
  checkAbort();
  if (!store.complete) throw new Error('Terrain field store is incomplete');
  return store;
}
