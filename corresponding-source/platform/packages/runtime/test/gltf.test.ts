import { Mesh } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { createGltfLoader, parseGltf } from '../src/gltf.js';

// One triangle as a GLB (JSON chunk plus binary chunk, no external files).
function triangleGlb(): ArrayBuffer {
  const bin = new Uint8Array(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer);
  const json = JSON.stringify({
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'tri' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bin.length }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
    ],
  });
  const text = new TextEncoder().encode(json.padEnd(Math.ceil(json.length / 4) * 4, ' '));
  const total = 12 + 8 + text.length + 8 + bin.length;
  const glb = new Uint8Array(total);
  const view = new DataView(glb.buffer);
  view.setUint32(0, 0x46546c67, true); // "glTF"
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, text.length, true);
  view.setUint32(16, 0x4e4f534a, true); // "JSON"
  glb.set(text, 20);
  const binStart = 20 + text.length;
  view.setUint32(binStart, bin.length, true);
  view.setUint32(binStart + 4, 0x004e4942, true); // "BIN"
  glb.set(bin, binStart + 8);
  return glb.buffer;
}

describe('glTF loader', () => {
  it('reads KTX2 textures only with a renderer that says which compressed formats the GPU takes', () => {
    expect((createGltfLoader() as unknown as { ktx2Loader: unknown }).ktx2Loader).toBeNull();
    const asked: string[] = [];
    const renderer = {
      isWebGPURenderer: true as const,
      hasFeature: (name: string) => {
        asked.push(name);
        return name === 'texture-compression-bc';
      },
    };
    const loader = createGltfLoader({ ktx2: { renderer: renderer as never } });
    expect((loader as unknown as { ktx2Loader: unknown }).ktx2Loader).not.toBeNull();
    expect(asked).toContain('texture-compression-astc');
  });

  it('parses a GLB into runtime meshes', async () => {
    const gltf = await parseGltf(createGltfLoader(), triangleGlb());
    const mesh = gltf.scene.getObjectByName('tri');
    expect(mesh).toBeInstanceOf(Mesh);
    expect((mesh as Mesh).geometry.getAttribute('position').count).toBe(3);
  });
});
