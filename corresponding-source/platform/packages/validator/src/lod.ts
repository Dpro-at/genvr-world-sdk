// Simpler far versions of uploaded models (LOD levels, decision 94). Kept out of the main entry
// (`@genvr/validator/lod`) so browser bundles that only check worlds do not load the simplifier.
import { MeshoptSimplifier } from 'three/examples/jsm/libs/meshopt_simplifier.module.js';
import { chunks } from './glb.js';

/** How much of each mesh's triangles the levels keep, and the most shape change each may cause. */
export const LOD_LEVELS = [
  { keep: 0.35, error: 0.02 },
  { keep: 0.1, error: 0.08 },
] as const;
/** Models with fewer triangles are cheap enough without simpler versions. */
export const LOD_MIN_TRIANGLES = 1000;
/** A level must drop at least this share of the triangles, or it is left out. */
const MIN_SAVING = 0.25;

const FLOAT = 5126;
const UNSIGNED_BYTE = 5121;
const UNSIGNED_SHORT = 5123;
const UNSIGNED_INT = 5125;
const ELEMENT_ARRAY_BUFFER = 34963;

interface Accessor {
  bufferView?: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  type: string;
  sparse?: unknown;
  [key: string]: unknown;
}
interface BufferView {
  buffer: number;
  byteOffset?: number;
  byteLength: number;
  byteStride?: number;
  target?: number;
}
interface Primitive {
  attributes: Record<string, number>;
  indices?: number;
  mode?: number;
  targets?: unknown[];
}
interface Json {
  meshes?: Array<{ primitives: Primitive[] }>;
  accessors?: Accessor[];
  bufferViews?: BufferView[];
  buffers?: Array<{ byteLength: number; uri?: string }>;
  extensionsRequired?: string[];
}

/** A triangle list the simplifier can work on: its tightly packed positions and indices. */
interface Shape {
  primitive: Primitive;
  positions: Float32Array;
  indices: Uint32Array;
  vertexCount: number;
}

function readShapes(json: Json, bin: Uint8Array): Shape[] {
  const view = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const shapes: Shape[] = [];
  for (const mesh of json.meshes ?? [])
    for (const primitive of mesh.primitives) {
      if ((primitive.mode ?? 4) !== 4 || primitive.targets?.length) continue;
      const position = json.accessors?.[primitive.attributes.POSITION ?? -1];
      if (!position || position.componentType !== FLOAT || position.type !== 'VEC3' || position.sparse)
        continue;
      const positionView = json.bufferViews?.[position.bufferView ?? -1];
      if (!positionView || positionView.buffer !== 0) continue;
      const stride = positionView.byteStride ?? 12;
      const start = (positionView.byteOffset ?? 0) + (position.byteOffset ?? 0);
      const positions = new Float32Array(position.count * 3);
      for (let i = 0; i < position.count; i += 1)
        for (let axis = 0; axis < 3; axis += 1)
          positions[i * 3 + axis] = view.getFloat32(start + i * stride + axis * 4, true);
      let indices: Uint32Array;
      if (primitive.indices === undefined) {
        indices = new Uint32Array(position.count);
        for (let i = 0; i < position.count; i += 1) indices[i] = i;
      } else {
        const accessor = json.accessors?.[primitive.indices];
        const indexView = accessor ? json.bufferViews?.[accessor.bufferView ?? -1] : undefined;
        if (!accessor || !indexView || indexView.buffer !== 0 || accessor.sparse) continue;
        const at = (indexView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
        indices = new Uint32Array(accessor.count);
        for (let i = 0; i < accessor.count; i += 1)
          indices[i] =
            accessor.componentType === UNSIGNED_BYTE
              ? view.getUint8(at + i)
              : accessor.componentType === UNSIGNED_SHORT
                ? view.getUint16(at + i * 2, true)
                : view.getUint32(at + i * 4, true);
      }
      if (indices.length < 3) continue;
      shapes.push({ primitive, positions, indices, vertexCount: position.count });
    }
  return shapes;
}

/** A GLB from its JSON and binary chunk. */
function writeGlb(json: Json, bin: Uint8Array): Uint8Array {
  const text = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = Math.ceil(text.length / 4) * 4;
  const binLength = Math.ceil(bin.length / 4) * 4;
  const total = 12 + 8 + jsonLength + 8 + binLength;
  const file = new Uint8Array(total);
  const view = new DataView(file.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  file.fill(0x20, 20, 20 + jsonLength);
  file.set(text, 20);
  view.setUint32(20 + jsonLength, binLength, true);
  view.setUint32(24 + jsonLength, 0x004e4942, true);
  file.set(bin, 28 + jsonLength);
  return file;
}

/**
 * Simpler far versions of a model (decision 94): the same file with each mesh's triangle list
 * replaced by a shorter one, so materials, textures, colors, and for moving models skin weights,
 * bones, and animations stay exactly as they are (a moving copy swaps only its triangle lists).
 * Returns up to two GLBs (the next levels), or none for small or compressed models, which keep
 * only their own model. Shapes with morph targets keep all their triangles.
 */
export async function makeLods(bytes: Uint8Array): Promise<Uint8Array[]> {
  const { json: parsed, bin } = chunks(bytes);
  const json = parsed as unknown as Json;
  if (!bin) return [];
  if (
    json.extensionsRequired?.some((name) => name !== 'KHR_texture_basisu' && name !== 'KHR_texture_transform')
  )
    return [];
  const shapes = readShapes(json, bin);
  const triangles = shapes.reduce((sum, shape) => sum + shape.indices.length / 3, 0);
  if (triangles < LOD_MIN_TRIANGLES) return [];
  await MeshoptSimplifier.ready;

  const levels: Uint8Array[] = [];
  for (const level of LOD_LEVELS) {
    const next = structuredClone(json);
    const extra: Uint8Array[] = [];
    let offset = Math.ceil(bin.length / 4) * 4;
    let kept = 0;
    // Primitives in the same order as `shapes` (same walk over the cloned JSON).
    const primitives = (next.meshes ?? []).flatMap((mesh) => mesh.primitives);
    const original = (json.meshes ?? []).flatMap((mesh) => mesh.primitives);
    for (const shape of shapes) {
      const target = Math.max(3, Math.floor((shape.indices.length * level.keep) / 3) * 3);
      const [simplified] = MeshoptSimplifier.simplify(shape.indices, shape.positions, 3, target, level.error);
      const indices = simplified.length >= 3 ? simplified : shape.indices;
      kept += indices.length / 3;
      const small = shape.vertexCount < 65536;
      const data = small ? new Uint16Array(indices) : new Uint32Array(indices);
      const bytesOf = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      next.bufferViews = next.bufferViews ?? [];
      next.accessors = next.accessors ?? [];
      next.bufferViews.push({
        buffer: 0,
        byteOffset: offset,
        byteLength: bytesOf.byteLength,
        target: ELEMENT_ARRAY_BUFFER,
      });
      next.accessors.push({
        bufferView: next.bufferViews.length - 1,
        componentType: small ? UNSIGNED_SHORT : UNSIGNED_INT,
        count: indices.length,
        type: 'SCALAR',
      });
      primitives[original.indexOf(shape.primitive)]!.indices = next.accessors.length - 1;
      extra.push(bytesOf);
      offset += Math.ceil(bytesOf.byteLength / 4) * 4;
    }
    if (kept > triangles * (1 - MIN_SAVING)) break;
    const merged = new Uint8Array(offset);
    merged.set(bin);
    let at = Math.ceil(bin.length / 4) * 4;
    for (const part of extra) {
      merged.set(part, at);
      at += Math.ceil(part.byteLength / 4) * 4;
    }
    next.buffers = [{ ...(next.buffers?.[0] ?? {}), byteLength: merged.length }];
    levels.push(writeGlb(next, merged));
  }
  return levels;
}
