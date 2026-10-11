import { chunkKey, fromBase64, toBase64, type TerrainData } from './terrain-data.js';

/**
 * Terrain edits as the points they changed (P3-08 follow-up): each changed vertex with its
 * height and soil before and after. Undoing an edit reverts only those points and keeps what
 * other builders changed later: a point still as this edit left it gets its old value back
 * exactly; a point someone changed since keeps their change plus this edit's height difference
 * reversed (soil only reverts where it is still this edit's soil).
 */

interface ChunkEdit {
  cx: number;
  cz: number;
  indices: Uint16Array;
  heightsBefore: Float32Array;
  heightsAfter: Float32Array;
  soilsBefore: Uint8Array;
  soilsAfter: Uint8Array;
  /** Ground cover (P2-40); an edit stored before it existed reads back as zeroes. */
  coverBefore: Uint8Array;
  coverAfter: Uint8Array;
}

/** Snapshot of chunk contents (copies) to compare against after an edit. */
export type ChunkSnapshot = Map<
  string,
  { cx: number; cz: number; heights: Float32Array; soils: Uint8Array; cover: Uint8Array }
>;

export function snapshotTerrain(terrain: TerrainData, keys: Iterable<string>): ChunkSnapshot {
  const snapshot: ChunkSnapshot = new Map();
  for (const key of keys) {
    const [cx, cz] = key.split(',').map(Number) as [number, number];
    const chunk = terrain.getChunk(cx, cz);
    snapshot.set(key, {
      cx,
      cz,
      heights: chunk.heights.slice(),
      soils: chunk.soils.slice(),
      cover: chunk.cover.slice(),
    });
  }
  return snapshot;
}

const bytes = (array: Uint16Array | Float32Array | Uint8Array) =>
  new Uint8Array(array.buffer, array.byteOffset, array.byteLength);

/** Aligned copy of decoded bytes (typed arrays need aligned offsets). */
const aligned = (text: string) => {
  const raw = fromBase64(text);
  const copy = new Uint8Array(raw.byteLength);
  copy.set(raw);
  return copy.buffer;
};

function encodeEdit(edit: ChunkEdit): string {
  return JSON.stringify({
    v: 1,
    cx: edit.cx,
    cz: edit.cz,
    i: toBase64(bytes(edit.indices)),
    hb: toBase64(bytes(edit.heightsBefore)),
    ha: toBase64(bytes(edit.heightsAfter)),
    sb: toBase64(edit.soilsBefore),
    sa: toBase64(edit.soilsAfter),
    // Written only when cover changed, so an edit that did not touch it stays the size it was.
    ...(edit.coverBefore.some((v, i) => v !== edit.coverAfter[i])
      ? { cb: toBase64(edit.coverBefore), ca: toBase64(edit.coverAfter) }
      : {}),
  });
}

export function decodeTerrainEdit(text: string): ChunkEdit {
  const parsed = JSON.parse(text) as {
    v: number;
    cx: number;
    cz: number;
    i: string;
    hb: string;
    ha: string;
    sb: string;
    sa: string;
    cb?: string;
    ca?: string;
  };
  if (parsed.v !== 1) throw new Error(`Unsupported terrain edit version ${parsed.v}`);
  const edit: ChunkEdit = {
    cx: parsed.cx,
    cz: parsed.cz,
    indices: new Uint16Array(aligned(parsed.i)),
    heightsBefore: new Float32Array(aligned(parsed.hb)),
    heightsAfter: new Float32Array(aligned(parsed.ha)),
    soilsBefore: fromBase64(parsed.sb),
    soilsAfter: fromBase64(parsed.sa),
    // An edit stored before cover existed did not change any, so both sides are zeroes.
    coverBefore: parsed.cb ? fromBase64(parsed.cb) : new Uint8Array(fromBase64(parsed.sb).length),
    coverAfter: parsed.ca ? fromBase64(parsed.ca) : new Uint8Array(fromBase64(parsed.sa).length),
  };
  const n = edit.indices.length;
  if (
    edit.heightsBefore.length !== n ||
    edit.heightsAfter.length !== n ||
    edit.soilsBefore.length !== n ||
    edit.soilsAfter.length !== n ||
    edit.coverBefore.length !== n ||
    edit.coverAfter.length !== n
  )
    throw new Error('Terrain edit arrays do not match.');
  return edit;
}

/** The points that differ between a snapshot and the terrain now, as encoded edits. */
export function diffTerrain(terrain: TerrainData, before: ChunkSnapshot): string[] {
  const edits: string[] = [];
  for (const old of before.values()) {
    const now = terrain.getChunk(old.cx, old.cz);
    const changed: number[] = [];
    for (let i = 0; i < old.heights.length; i += 1)
      if (old.heights[i] !== now.heights[i] || old.soils[i] !== now.soils[i] || old.cover[i] !== now.cover[i])
        changed.push(i);
    if (changed.length === 0) continue;
    edits.push(
      encodeEdit({
        cx: old.cx,
        cz: old.cz,
        indices: Uint16Array.from(changed),
        heightsBefore: Float32Array.from(changed, (i) => old.heights[i]!),
        heightsAfter: Float32Array.from(changed, (i) => now.heights[i]!),
        soilsBefore: Uint8Array.from(changed, (i) => old.soils[i]!),
        soilsAfter: Uint8Array.from(changed, (i) => now.soils[i]!),
        coverBefore: Uint8Array.from(changed, (i) => old.cover[i]!),
        coverAfter: Uint8Array.from(changed, (i) => now.cover[i]!),
      }),
    );
  }
  return edits;
}

/**
 * Reverts encoded edits (after -> before) point by point, keeping later changes by others.
 * Returns the edits that undo this revert and the changed chunk keys.
 */
export function revertTerrain(
  terrain: TerrainData,
  encoded: readonly string[],
  clampHeight: (h: number) => number,
): { inverse: string[]; changed: Set<string> } {
  const decoded = encoded.map(decodeTerrainEdit);
  const { min, max } = terrain.chunkRange;
  const size = terrain.edge * terrain.edge;
  for (const edit of decoded) {
    if (edit.cx < min || edit.cx > max || edit.cz < min || edit.cz > max)
      throw new Error('Chunk is outside the place.');
    if (edit.indices.some((i) => i >= size)) throw new Error('Vertex index out of range.');
  }
  const keys = decoded.map((edit) => chunkKey(edit.cx, edit.cz));
  const before = snapshotTerrain(terrain, keys);
  for (const edit of decoded) {
    const chunk = terrain.getChunk(edit.cx, edit.cz);
    edit.indices.forEach((vertex, k) => {
      const current = chunk.heights[vertex]!;
      chunk.heights[vertex] =
        current === edit.heightsAfter[k]
          ? edit.heightsBefore[k]!
          : clampHeight(current + edit.heightsBefore[k]! - edit.heightsAfter[k]!);
      if (chunk.soils[vertex] === edit.soilsAfter[k]) chunk.soils[vertex] = edit.soilsBefore[k]!;
      // Cover goes back only where nobody has painted over it since, as the soil does.
      if (chunk.cover[vertex] === edit.coverAfter[k]) chunk.cover[vertex] = edit.coverBefore[k]!;
    });
  }
  // The inverse of a revert is the change it just made, as edits of their own.
  return { inverse: diffTerrain(terrain, before), changed: new Set(keys) };
}
