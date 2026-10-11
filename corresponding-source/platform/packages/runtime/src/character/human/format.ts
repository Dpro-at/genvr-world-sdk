/**
 * The baked human data (CHAR-02): one compact binary written by `tooling/human-bake/bake.ts` from CC0 base data and
 * read by our generator. Settings only reach the generator; the data never changes at runtime.
 *
 * Layout: `GVH1` (4 bytes), header length (u32 LE), header JSON (UTF-8), zero padding to 4 bytes, then the arrays
 * the header points at (offsets from the start of the array block, little endian).
 */

export const HUMAN_MAGIC = 'GVH1';
export const HUMAN_FORMAT_VERSION = 1;

/** Where one typed array sits in the array block. */
export interface HumanArrayRef {
  offset: number;
  length: number;
}

/** A sparse shape target: vertex ids and int16 offsets (x, y, z) times `scale` metres. */
export interface HumanTargetRef {
  name: string;
  scale: number;
  indices: HumanArrayRef;
  deltas: HumanArrayRef;
}

/** A joint: its rest position is the mean of these vertices (drawn or helper) of the shaped body. */
export interface HumanJointRef {
  name: string;
  parent: string | null;
  vertices: HumanArrayRef;
}

export interface HumanHeader {
  version: number;
  /**
   * Bytes per stored vertex id (quads, joint vertices, target indices): 2 up to 65,536 vertices, 4 above (owner,
   * 2026-10-05: the 100k-quad body). Absent = 2 (older files). Decoded always as Uint32Array.
   */
  indexBytes?: 2 | 4;
  /** Every vertex (drawn first, then helper vertices that only place joints). */
  vertices: number;
  /** The first `drawn` vertices are drawn. */
  drawn: number;
  /** Quads of the drawn surface (four vertex ids each, counter-clockwise from outside). */
  quads: number;
  /** Quads of the lighter level of detail (the same vertices; the finer muscle areas merged back), when baked. */
  lodQuads?: number;
  /** Surface regions by vertex (0 skin, 1 base shorts). */
  regions: readonly string[];
  arrays: {
    /** Float32, metres, y up, facing +z, left +x. */
    positions: HumanArrayRef;
    /** Vertex ids (`indexBytes` each) x4 per quad. */
    quads: HumanArrayRef;
    /** Uint8 per drawn vertex. */
    region: HumanArrayRef;
    /** Uint8 x4 per drawn vertex (joint order of `joints`). */
    skinIndex: HumanArrayRef;
    /** Uint8 x4 per drawn vertex, sums to 255. */
    skinWeight: HumanArrayRef;
    /** Vertex ids used by the joints. */
    jointVertices: HumanArrayRef;
    /** Vertex ids x4 per quad of the lighter level of detail (optional). */
    lodQuads?: HumanArrayRef;
  };
  joints: readonly HumanJointRef[];
  targets: readonly HumanTargetRef[];
  /** Where the data came from (licence per source file). */
  sources: readonly { file: string; licence: string }[];
}

export interface HumanTarget {
  name: string;
  indices: Uint32Array;
  /** Metres, x y z per entry. */
  deltas: Float32Array;
}

export interface HumanData {
  header: HumanHeader;
  positions: Float32Array;
  quads: Uint32Array;
  /** The lighter level of detail's quads (same vertices), when baked. */
  lodQuads?: Uint32Array;
  region: Uint8Array;
  skinIndex: Uint8Array;
  skinWeight: Uint8Array;
  joints: readonly { name: string; parent: string | null; vertices: Uint32Array }[];
  targets: ReadonlyMap<string, HumanTarget>;
}

const align = (n: number) => (n + 3) & ~3;

/** Reads the baked binary. */
export function decodeHuman(buffer: ArrayBuffer): HumanData {
  const bytes = new Uint8Array(buffer);
  const magic = String.fromCharCode(...bytes.subarray(0, 4));
  if (magic !== HUMAN_MAGIC) throw new Error('Not human data');
  const length = new DataView(buffer).getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + length))) as HumanHeader;
  if (header.version !== HUMAN_FORMAT_VERSION) throw new Error(`Human data version ${header.version}`);
  const block = align(8 + length);
  // Copies keep every array aligned whatever the buffer's own offset.
  const slice = (ref: HumanArrayRef, size: number) =>
    buffer.slice(block + ref.offset, block + ref.offset + ref.length * size);
  const { arrays } = header;
  const wide = header.indexBytes === 4;
  const ids = (ref: HumanArrayRef) =>
    wide ? new Uint32Array(slice(ref, 4)) : Uint32Array.from(new Uint16Array(slice(ref, 2)));
  const jointVertices = ids(arrays.jointVertices);
  let at = 0;
  const joints = header.joints.map((joint) => {
    const vertices = jointVertices.subarray(at, at + joint.vertices.length);
    at += joint.vertices.length;
    return { name: joint.name, parent: joint.parent, vertices };
  });
  const targets = new Map<string, HumanTarget>();
  for (const target of header.targets) {
    const raw = new Int16Array(slice(target.deltas, 2));
    const deltas = new Float32Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) deltas[i] = raw[i]! * target.scale;
    targets.set(target.name, { name: target.name, indices: ids(target.indices), deltas });
  }
  return {
    header,
    positions: new Float32Array(slice(arrays.positions, 4)),
    quads: ids(arrays.quads),
    ...(arrays.lodQuads ? { lodQuads: ids(arrays.lodQuads) } : {}),
    region: new Uint8Array(slice(arrays.region, 1)),
    skinIndex: new Uint8Array(slice(arrays.skinIndex, 1)),
    skinWeight: new Uint8Array(slice(arrays.skinWeight, 1)),
    joints,
    targets,
  };
}

/** What the bake hands to `encodeHuman`. */
export interface HumanSource {
  positions: Float32Array;
  drawn: number;
  quads: ArrayLike<number>;
  /** The lighter level of detail's quads (same vertices). */
  lodQuads?: ArrayLike<number>;
  regions: readonly string[];
  region: Uint8Array;
  skinIndex: Uint8Array;
  skinWeight: Uint8Array;
  joints: readonly { name: string; parent: string | null; vertices: readonly number[] }[];
  targets: readonly { name: string; indices: ArrayLike<number>; deltas: Float32Array }[];
  sources: HumanHeader['sources'];
}

/** Writes the baked binary (deterministic for the same input). */
export function encodeHuman(source: HumanSource): Uint8Array {
  const parts: Uint8Array[] = [];
  let offset = 0;
  const put = (array: ArrayBufferView & { length: number }): HumanArrayRef => {
    const view = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    const ref = { offset, length: array.length };
    parts.push(view);
    offset += view.byteLength;
    const pad = align(offset) - offset;
    if (pad) {
      parts.push(new Uint8Array(pad));
      offset += pad;
    }
    return ref;
  };
  const jointList = source.joints.flatMap((joint) => joint.vertices);
  const indexBytes: 2 | 4 = source.positions.length / 3 > 65536 ? 4 : 2;
  const ids = (list: ArrayLike<number>) => (indexBytes === 4 ? Uint32Array.from(list) : Uint16Array.from(list));
  const arrays = {
    positions: put(source.positions),
    quads: put(ids(source.quads)),
    region: put(source.region),
    skinIndex: put(source.skinIndex),
    skinWeight: put(source.skinWeight),
    jointVertices: put(ids(jointList)),
    ...(source.lodQuads ? { lodQuads: put(ids(source.lodQuads)) } : {}),
  };
  const joints: HumanJointRef[] = source.joints.map((joint) => ({
    name: joint.name,
    parent: joint.parent,
    vertices: { offset: 0, length: joint.vertices.length },
  }));
  const targets: HumanTargetRef[] = source.targets.map((target) => {
    let largest = 0;
    for (const d of target.deltas) largest = Math.max(largest, Math.abs(d));
    const scale = largest > 0 ? largest / 32767 : 1;
    const quantized = new Int16Array(target.deltas.length);
    for (let i = 0; i < quantized.length; i += 1) quantized[i] = Math.round(target.deltas[i]! / scale);
    return { name: target.name, scale, indices: put(ids(target.indices)), deltas: put(quantized) };
  });
  const header: HumanHeader = {
    version: HUMAN_FORMAT_VERSION,
    ...(indexBytes === 4 ? { indexBytes } : {}),
    vertices: source.positions.length / 3,
    drawn: source.drawn,
    quads: source.quads.length / 4,
    ...(source.lodQuads ? { lodQuads: source.lodQuads.length / 4 } : {}),
    regions: source.regions,
    arrays,
    joints,
    targets,
    sources: source.sources,
  };
  const json = new TextEncoder().encode(JSON.stringify(header));
  const block = align(8 + json.length);
  const out = new Uint8Array(block + offset);
  out.set(new TextEncoder().encode(HUMAN_MAGIC), 0);
  new DataView(out.buffer).setUint32(4, json.length, true);
  out.set(json, 8);
  let at = block;
  for (const part of parts) {
    out.set(part, at);
    at += part.byteLength;
  }
  return out;
}
