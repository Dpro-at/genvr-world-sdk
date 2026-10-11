import { describe, expect, it } from 'vitest';
import { chunks, inspectGlb } from '../src/glb.js';
import { LOD_MIN_TRIANGLES, makeLods } from '../src/lod.js';

/** A GLB of a bumpy grid (n x n squares, two triangles each) with one colored material. */
function bumpyGrid(n: number, extra: object = {}): Uint8Array {
  const positions = new Float32Array((n + 1) * (n + 1) * 3);
  for (let j = 0; j <= n; j += 1)
    for (let i = 0; i <= n; i += 1) {
      const k = (j * (n + 1) + i) * 3;
      positions[k] = i / n;
      positions[k + 1] = Math.sin(i * 0.3) * Math.cos(j * 0.2) * 0.05;
      positions[k + 2] = j / n;
    }
  const indices = new Uint16Array(n * n * 6);
  let o = 0;
  for (let j = 0; j < n; j += 1)
    for (let i = 0; i < n; i += 1) {
      const a = j * (n + 1) + i;
      indices.set([a, a + n + 1, a + 1, a + 1, a + n + 1, a + n + 2], o);
      o += 6;
    }
  const bin = new Uint8Array(positions.byteLength + indices.byteLength);
  bin.set(new Uint8Array(positions.buffer), 0);
  bin.set(new Uint8Array(indices.buffer), positions.byteLength);
  const json = {
    asset: { version: '2.0' },
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.9, 0.2, 0.1, 1] } }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: (n + 1) * (n + 1),
        type: 'VEC3',
        min: [0, -0.05, 0],
        max: [1, 0.05, 1],
      },
      { bufferView: 1, componentType: 5123, count: indices.length, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength },
    ],
    buffers: [{ byteLength: bin.byteLength }],
    ...extra,
  };
  const text = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = Math.ceil(text.length / 4) * 4;
  const binLength = Math.ceil(bin.length / 4) * 4;
  const total = 28 + jsonLength + binLength;
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

describe('LOD levels (decision 94)', () => {
  it('makes two simpler versions of a still model that keep its material and size', async () => {
    const model = bumpyGrid(60);
    const full = inspectGlb(model);
    expect(full.triangles).toBe(7200);
    const lods = await makeLods(model);
    expect(lods).toHaveLength(2);
    const [near, far] = lods.map((lod) => inspectGlb(lod));
    expect(near!.triangles).toBeLessThan(full.triangles * 0.5);
    expect(far!.triangles).toBeLessThan(near!.triangles);
    expect(far!.triangles).toBeGreaterThan(0);
    for (const stats of [near!, far!]) {
      expect(stats.materials).toBe(1);
      expect(stats.bounds).toEqual(full.bounds);
    }
  });

  it('makes simpler versions of moving models too, changing only their triangle lists', async () => {
    // Skin weights, bones, and animations stay: each level keeps every vertex and only draws fewer
    // triangles, so a moving copy can swap its triangle list by distance.
    for (const extra of [{ animations: [{ channels: [], samplers: [] }] }, { skins: [{ joints: [0] }] }]) {
      const model = bumpyGrid(60, extra);
      const lods = await makeLods(model);
      expect(lods).toHaveLength(2);
      type Json = Record<string, unknown> & { meshes: Array<{ primitives: Array<{ attributes: object }> }> };
      const original = chunks(model).json as unknown as Json;
      for (const lod of lods) {
        const json = chunks(lod).json as unknown as Json;
        expect(inspectGlb(lod).triangles).toBeLessThan(inspectGlb(model).triangles);
        for (const key of Object.keys(extra)) expect(json[key]).toEqual(extra[key as keyof typeof extra]);
        expect(json.meshes[0]!.primitives[0]!.attributes).toEqual(
          original.meshes[0]!.primitives[0]!.attributes,
        );
      }
    }
  });

  it('leaves small and compressed models alone', async () => {
    // 10 x 10 squares: 200 triangles.
    expect(inspectGlb(bumpyGrid(10)).triangles).toBeLessThan(LOD_MIN_TRIANGLES);
    expect(await makeLods(bumpyGrid(10))).toEqual([]);
    expect(await makeLods(bumpyGrid(60, { extensionsRequired: ['KHR_draco_mesh_compression'] }))).toEqual([]);
  });
});
