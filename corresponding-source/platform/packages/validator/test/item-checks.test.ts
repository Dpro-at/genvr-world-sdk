/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkItemModel, deviceFit, GlbError, imageSize, inspectGlb, ITEM_BUDGET } from '../src/index.js';

const PACKAGES = join(import.meta.dirname, '..', '..', '..', 'apps', 'api', 'dev-packages');
const read = (name: string) => new Uint8Array(readFileSync(join(PACKAGES, name, 'model.glb')));

/** A GLB with only a JSON chunk (the checks read no geometry). */
function glbOf(json: object, bin = new Uint8Array(0)): Uint8Array {
  const text = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = Math.ceil(text.length / 4) * 4;
  const binLength = Math.ceil(bin.length / 4) * 4;
  const total = 12 + 8 + jsonLength + (bin.length ? 8 + binLength : 0);
  const file = new Uint8Array(total);
  const view = new DataView(file.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  file.fill(0x20, 20, 20 + jsonLength);
  file.set(text, 20);
  if (bin.length) {
    view.setUint32(20 + jsonLength, binLength, true);
    view.setUint32(24 + jsonLength, 0x004e4942, true);
    file.set(bin, 28 + jsonLength);
  }
  return file;
}

describe('model checks (P2-12)', () => {
  it('reads the test packages', () => {
    expect(inspectGlb(read('bouncing-ball'))).toMatchObject({
      triangles: 320,
      drawCalls: 1,
      materials: 1,
      bones: 0,
      animations: ['idle'],
      textures: 0,
    });
    expect(inspectGlb(read('waving-arm'))).toMatchObject({ triangles: 52, bones: 3, animations: ['idle'] });
    const checks = checkItemModel(inspectGlb(read('bouncing-ball')), {
      triangles: 320,
      textureMB: 0,
      mobileReady: true,
    });
    expect(checks).toMatchObject({ ok: true, mobileReady: true, findings: [] });
  });

  it('counts a mesh once per node that draws it', () => {
    const stats = inspectGlb(
      glbOf({
        scene: 0,
        scenes: [{ nodes: [0, 1, 2] }],
        nodes: [{ mesh: 0 }, { mesh: 0 }, { children: [3] }, { mesh: 0 }],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
        accessors: [{ count: 4 }, { count: 6 }],
      }),
    );
    expect(stats).toMatchObject({ triangles: 6, vertices: 12, drawCalls: 3 });
  });

  it('measures the model box through the node transforms', () => {
    const cube = { count: 8, min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5] };
    const stats = inspectGlb(
      glbOf({
        scenes: [{ nodes: [0, 1] }],
        nodes: [
          // Moved 2 m right and doubled.
          { mesh: 0, translation: [2, 0, 0], scale: [2, 2, 2] },
          // A parent lifted 3 m with a child turned 90 degrees about z (lies on its side).
          { translation: [0, 3, 0], children: [2] },
          { mesh: 0, rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] },
        ],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
        accessors: [cube],
      }),
    );
    expect(stats.bounds).toEqual({ min: [-1, 0, -1], max: [3, 3.5, 1] });
    expect(inspectGlb(glbOf({ scenes: [{ nodes: [0] }], nodes: [{}] })).bounds).toBeNull();
    const ball = inspectGlb(read('bouncing-ball')).bounds!;
    expect(ball.max[1]).toBeGreaterThan(ball.min[1]);
  });

  it('warns over the phone budget and refuses over the limit', () => {
    const model = (triangles: number) =>
      glbOf({
        scenes: [{ nodes: [0] }],
        nodes: [{ mesh: 0 }],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
        accessors: [{ count: 3 }, { count: triangles * 3 }],
      });
    const heavy = checkItemModel(inspectGlb(model(ITEM_BUDGET.phone.triangles + 1)));
    expect(heavy).toMatchObject({ ok: true, mobileReady: false });
    expect(heavy.findings.map((finding) => finding.code)).toEqual(['heavy-triangles']);
    const huge = checkItemModel(inspectGlb(model(ITEM_BUDGET.limit.triangles + 1)));
    expect(huge).toMatchObject({ ok: false, mobileReady: false });
    expect(huge.findings[0]!.message).toContain('150,000');
    // An honest-looking manifest that understates the model.
    const understated = checkItemModel(inspectGlb(model(5000)), {
      triangles: 100,
      textureMB: 0,
      mobileReady: true,
    });
    expect(understated.findings.map((finding) => finding.code)).toEqual(['budget-triangles']);
  });

  it('estimates texture memory from the image headers', () => {
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    new DataView(png.buffer).setUint32(16, 2048);
    new DataView(png.buffer).setUint32(20, 2048);
    expect(imageSize(png)).toEqual({ width: 2048, height: 2048 });
    const stats = inspectGlb(
      glbOf(
        {
          scenes: [{ nodes: [0] }],
          nodes: [{ mesh: 0 }],
          meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
          accessors: [{ count: 3 }],
          images: [{ bufferView: 0, mimeType: 'image/png' }],
          bufferViews: [{ byteOffset: 0, byteLength: 24 }],
          extensionsUsed: ['EXT_mesh_gpu_instancing'],
        },
        png,
      ),
    );
    expect(stats.textureMB).toBeCloseTo(21.3, 1); // 2048 x 2048 RGBA with mipmaps
    const checks = checkItemModel(stats);
    expect(checks.findings.map((finding) => finding.code)).toEqual([
      'heavy-textureMB',
      'unsupported-extension',
    ]);
  });

  it('reads KTX2 texture sizes and counts them compressed (KHR_texture_basisu)', () => {
    const ktx2 = new Uint8Array(64);
    ktx2.set([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]);
    const view = new DataView(ktx2.buffer);
    view.setUint32(20, 2048, true);
    view.setUint32(24, 1024, true);
    expect(imageSize(ktx2)).toEqual({ width: 2048, height: 1024 });
    const stats = inspectGlb(
      glbOf(
        {
          scenes: [{ nodes: [0] }],
          nodes: [{ mesh: 0 }],
          meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
          accessors: [{ count: 3 }],
          images: [{ bufferView: 0, mimeType: 'image/ktx2' }],
          bufferViews: [{ byteOffset: 0, byteLength: 64 }],
          extensionsUsed: ['KHR_texture_basisu'],
          extensionsRequired: ['KHR_texture_basisu'],
        },
        ktx2,
      ),
    );
    expect(stats.textureMB).toBeCloseTo(2.7, 1); // 2048 x 1024 at one byte per pixel, with mipmaps
    expect(checkItemModel(stats).findings.map((finding) => finding.code)).not.toContain(
      'unsupported-extension',
    );
  });

  it('says how a model fits each kind of device (owner note)', () => {
    const fit = (triangles: number) =>
      deviceFit({ triangles, textureMB: 0, drawCalls: 1, bones: 0 }).map((device) => [
        device.id,
        device.ready,
      ]);
    expect(fit(320).every(([, ready]) => ready)).toBe(true);
    expect(fit(41_600)).toEqual([
      ['slow-phone', false],
      ['fast-phone', false],
      ['tablet', false],
      ['console', true],
      ['computer', true],
    ]);
    const slow = deviceFit({ triangles: 4000, textureMB: 12, drawCalls: 2, bones: 0 })[0]!;
    expect(slow).toMatchObject({
      ready: false,
      heaviest: 'textureMB',
      loads: { triangles: 0.5, textureMB: 1.5 },
    });
  });

  it('refuses files that are not GLB', () => {
    expect(() => inspectGlb(new TextEncoder().encode('not a model at all'))).toThrow(GlbError);
  });
});
