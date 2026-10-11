import { describe, expect, it } from 'vitest';
import { HalfFloatType, FloatType, UnsignedByteType, Texture, PerspectiveCamera } from 'three/webgpu';
import { halton, lanczos2Sq } from '../src/post/temporal-math.js';
import { TemporalUpscale } from '../src/post/temporal-upscale.js';
import { LensDrops } from '../src/post/lens-drops.js';

const input = (): Texture => new Texture({ width: 128, height: 64 });
describe('source temporal jitter and lens lifecycle', () => {
  it('uses the exact four-phase half-pixel Halton jitter and restores a prior camera view', () => {
    const camera = new PerspectiveCamera(65, 2, 0.1, 400);
    camera.setViewOffset(256, 128, 20, 10, 128, 64);
    const before = { ...camera.view! };
    const taa = new TemporalUpscale(input(), input(), camera);
    taa.resize(128, 64);
    taa.beginFrame();
    expect(camera.view?.offsetX).toBe(0);
    expect(camera.view?.offsetY).toBeCloseTo(-1 / 12, 10);
    taa.endFrame();
    expect(camera.view).toEqual(before);
    expect([1, 2, 3, 4].map((i) => halton(i, 2))).toEqual([0.5, 0.25, 0.75, 0.125]);
    expect(lanczos2Sq(0)).toBe(1);
    expect(lanczos2Sq(1)).toBeCloseTo(0, 10);
    expect(lanczos2Sq(4)).toBe(0);
    taa.dispose();
  });
  it('retains source history formats and safe resize/reset behavior', () => {
    const camera = new PerspectiveCamera();
    const taa = new TemporalUpscale(input(), input(), camera);
    taa.resize(64, 32);
    expect(taa.previousDepth.type).toBe(FloatType);
    expect(taa.history[0]![0]!.type).toBe(HalfFloatType);
    expect(taa.history[0]![2]!.type).toBe(UnsignedByteType);
    taa.beginFrame();
    taa.reset();
    taa.endFrame();
    expect(camera.view).toBeNull();
    taa.resize(128, 64);
    expect(taa.texture.image).toMatchObject({ width: 128, height: 64 });
    taa.dispose();
  });
  it('only wets the lens after surfacing, then dries over source nine-second duration', () => {
    const drops = new LensDrops();
    drops.update(1, true);
    expect(drops.wet.value).toBe(0);
    drops.update(0, false);
    expect(drops.wet.value).toBe(1);
    expect(drops.age.value).toBe(0);
    drops.update(4.5, false);
    expect(drops.wet.value).toBeCloseTo(0.5);
    drops.update(4.5, false);
    expect(drops.wet.value).toBe(0);
    drops.update(1, true);
    drops.update(0, false);
    expect(drops.wet.value).toBe(1);
    drops.reset();
    expect(drops.wet.value).toBe(0);
  });
});
