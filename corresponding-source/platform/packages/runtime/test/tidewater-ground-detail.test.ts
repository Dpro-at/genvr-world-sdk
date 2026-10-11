import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { RepeatWrapping, LinearFilter, LinearMipmapLinearFilter, NoColorSpace, UnsignedByteType } from 'three/webgpu';
import { createDetailPixels, createDetailTexture, DETAIL_TEXTURE_SIZE } from '../src/tidewater-ground/detail-texture.js';

const sourceRoot = new URL('../../../../tooling/other-programs/tidewater/src/world/terrain/', import.meta.url);

/** Execute the original pinned source generator, replacing only GPU upload plumbing.
 * This oracle contains no copied/mirrored procedural equations from the port.
 */
function sourceOracle(): Uint8Array {
  const noise = readFileSync(new URL('TerrainNoise.js', sourceRoot), 'utf8');
  const hashFunction = noise.slice(noise.indexOf('export function hash2'), noise.indexOf('// 0 below 0')).replace('export ', '');
  const detail = readFileSync(new URL('DetailTextures.js', sourceRoot), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace('export function getDetailTexture', 'function getDetailTexture');
  class TextureStub {
    userData = {}; image?: {data: Uint8Array};
    constructor(readonly options: {data: Uint8Array}) {}
    getGPU(): void {}
  }
  return runInNewContext(`${hashFunction}\n${detail}\ngetDetailTexture().image.data`, {
    Texture: TextureStub, generateMipmaps: () => {}, performance, Uint8Array, Float32Array, Math,
  }) as Uint8Array;
}

const oracle = sourceOracle();
const actual = createDetailPixels();

describe('Tidewater shared ground and rock detail', () => {
  it('matches all 1,048,576 source-generated RGBA8 bytes', () => {
    expect(DETAIL_TEXTURE_SIZE).toBe(512);
    expect(actual.length).toBe(512 * 512 * 4);
    expect(Buffer.compare(Buffer.from(actual), Buffer.from(oracle))).toBe(0);
  });
  it('is deterministic and returns independent CPU storage', () => {
    const repeat = createDetailPixels();
    expect(repeat).not.toBe(actual);
    expect(createHash('sha256').update(repeat).digest('hex')).toBe(createHash('sha256').update(oracle).digest('hex'));
    repeat[0] = (repeat[0]! + 1) % 256;
    expect(repeat[0]).not.toBe(actual[0]);
  });
  it('uploads height channels as repeat-wrapped linear data with box-filtered mips', () => {
    const texture = createDetailTexture();
    expect(texture.image.width).toBe(512); expect(texture.image.height).toBe(512);
    expect(Buffer.compare(Buffer.from(texture.image.data as Uint8Array), Buffer.from(oracle))).toBe(0);
    expect(texture.wrapS).toBe(RepeatWrapping); expect(texture.wrapT).toBe(RepeatWrapping);
    expect(texture.minFilter).toBe(LinearMipmapLinearFilter); expect(texture.magFilter).toBe(LinearFilter);
    expect(texture.type).toBe(UnsignedByteType); expect(texture.colorSpace).toBe(NoColorSpace);
    expect(texture.generateMipmaps).toBe(true); expect(texture.anisotropy).toBe(4);
    expect(texture.version).toBeGreaterThan(0); expect(texture.userData.ms).toBeGreaterThan(0);
    texture.dispose();
  });
});
