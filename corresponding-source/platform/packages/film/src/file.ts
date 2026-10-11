import { missingAssets } from './invariants.js';
import { migrate } from './migrate.js';
import type { FilmProject } from './model.js';

/**
 * The `.genvrfilm` project file: one file that carries a film between machines.
 * Layout: the 8 bytes `GVFILM1\n`, a 4-byte little-endian header length, the header JSON
 * `{ project, assets: [{ id, type, size }] }`, then the asset bytes one after another.
 */
export const FILM_FILE_EXTENSION = '.genvrfilm';
const MAGIC = new TextEncoder().encode('GVFILM1\n');
const MAX_HEADER = 8 * 1024 * 1024;

export interface FilmAsset { id: string; type: string; bytes: Uint8Array }

export function writeFilmFile(project: FilmProject, assets: FilmAsset[]): Uint8Array {
  const missing = missingAssets(project, assets.map((a) => a.id));
  if (missing.length) throw new Error(`The film needs ${missing.length} recording(s) that are not here.`);
  const header = new TextEncoder().encode(JSON.stringify({ project, assets: assets.map((a) => ({ id: a.id, type: a.type, size: a.bytes.byteLength })) }));
  const total = MAGIC.length + 4 + header.length + assets.reduce((n, a) => n + a.bytes.byteLength, 0);
  const out = new Uint8Array(total);
  out.set(MAGIC, 0);
  new DataView(out.buffer).setUint32(MAGIC.length, header.length, true);
  out.set(header, MAGIC.length + 4);
  let offset = MAGIC.length + 4 + header.length;
  for (const asset of assets) { out.set(asset.bytes, offset); offset += asset.bytes.byteLength; }
  return out;
}

/** Reads a project file; refuses a damaged or incomplete one with the reason. */
export function readFilmFile(data: Uint8Array): { project: FilmProject; assets: FilmAsset[] } {
  const bad = (why: string): never => { throw new Error(`Not a Genvr film file: ${why}`); };
  if (data.byteLength < MAGIC.length + 4 || MAGIC.some((b, i) => data[i] !== b)) bad('wrong start.');
  const length = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(MAGIC.length, true);
  if (length > MAX_HEADER || MAGIC.length + 4 + length > data.byteLength) bad('the header is cut off.');
  let header: { project?: unknown; assets?: { id: string; type: string; size: number }[] };
  try { header = JSON.parse(new TextDecoder().decode(data.subarray(MAGIC.length + 4, MAGIC.length + 4 + length))); }
  catch { return bad('the header is not readable.'); }
  if (!Array.isArray(header.assets)) bad('no media list.');
  let offset = MAGIC.length + 4 + length;
  const assets = header.assets!.map((a) => {
    if (typeof a?.id !== 'string' || typeof a.type !== 'string' || !Number.isSafeInteger(a.size) || a.size < 0 || offset + a.size > data.byteLength) bad('a recording is cut off.');
    const bytes = data.slice(offset, offset + a.size); offset += a.size;
    return { id: a.id, type: a.type, bytes };
  });
  if (offset !== data.byteLength) bad('extra bytes at the end.');
  const project = migrate(header.project);
  const missing = missingAssets(project, assets.map((a) => a.id));
  if (missing.length) bad(`${missing.length} recording(s) are missing.`);
  return { project, assets };
}
