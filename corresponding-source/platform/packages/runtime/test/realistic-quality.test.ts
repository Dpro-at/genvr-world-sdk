import { describe, expect, it } from 'vitest';
import { realisticQuality } from '../src/realistic-quality.js';

describe('realistic quality levels (P2-36)', () => {
  it('gives computers on Automatic the full sky', () => {
    const q = realisticQuality({ quality: 0, touchDevice: false });
    expect(q.cascades).toBe(4);
    expect(q.bloom).toBe(true);
    expect(q.envSize).toBe(256);
    expect(q.groundSize).toBe(1024);
  });

  it('gives phones on Automatic a lighter sky', () => {
    const q = realisticQuality({ quality: 0, touchDevice: true });
    expect(q.cascades).toBe(2);
    expect(q.bloom).toBe(false);
    expect(q.envSize).toBe(64);
    expect(q.groundSize).toBe(512);
  });

  it('uses one shadow map at the lowest quality', () => {
    expect(realisticQuality({ quality: 1, touchDevice: false }).cascades).toBe(1);
  });

  it('never gets cheaper as the quality goes up', () => {
    for (let quality = 1; quality < 10; quality += 1) {
      const low = realisticQuality({ quality, touchDevice: false });
      const high = realisticQuality({ quality: quality + 1, touchDevice: false });
      expect(high.cascades).toBeGreaterThanOrEqual(low.cascades);
      expect(high.shadowMapSize).toBeGreaterThanOrEqual(low.shadowMapSize);
      expect(high.shadowFar).toBeGreaterThan(low.shadowFar);
      expect(high.envSize).toBeGreaterThanOrEqual(low.envSize);
      expect(high.envEveryDeg).toBeLessThanOrEqual(low.envEveryDeg);
      expect(high.fogScale).toBeGreaterThan(low.fogScale);
      if (low.bloom) expect(high.bloom).toBe(true);
    }
  });
});

describe('what the water costs per quality (P2-39)', () => {
  const at = (quality: number, touchDevice = false) => realisticQuality({ quality, touchDevice });

  it('never spends an extra pass over the scene below the top range', () => {
    // This is the rule the whole table exists for: a mirror renders the scene again, and the
    // light rays under water are a pass too. Everything below 7 must pay for neither.
    for (let quality = 1; quality <= 6; quality += 1) {
      expect(at(quality).waterReflect).toBe(0);
      expect(at(quality).waterRays).toBe(false);
    }
    expect(at(7).waterReflect).toBe(2);
    expect(at(7).waterRays).toBe(true);
  });

  it('gives phones water they can afford, and never more mirrors than there are', () => {
    const phone = at(0, true);
    expect(phone.waterWaves).toBe(0);
    expect(phone.waterRefraction).toBe(false);
    expect(phone.waterCaustics).toBe(false);
    expect(phone.waterReflect).toBe(0);
    expect(phone.waterRays).toBe(false);
    // Still draws water, just the cheap kind.
    expect(phone.waterGrid).toBeGreaterThan(0);
    expect(phone.waterSpray).toBeGreaterThan(0);
  });

  it('gives computers on Automatic the whole thing', () => {
    const computer = at(0, false);
    expect(computer.waterWaves).toBe(4);
    expect(computer.waterGrid).toBe(1);
    expect(computer.waterRefraction).toBe(true);
    expect(computer.waterCaustics).toBe(true);
    expect(computer.waterReflect).toBe(2);
    expect(computer.waterRays).toBe(true);
  });

  it('matches the table in the design at 3, 5 and 9', () => {
    expect(at(3)).toMatchObject({
      waterWaves: 0,
      waterGrid: 0.25,
      waterRefraction: false,
      waterCaustics: false,
      waterReflect: 0,
      waterRays: false,
      waterSpray: 30,
    });
    expect(at(5)).toMatchObject({
      waterWaves: 2,
      waterGrid: 0.5,
      waterRefraction: true,
      waterCaustics: true,
      waterReflect: 0,
      waterRays: false,
      waterSpray: 80,
    });
    expect(at(9)).toMatchObject({
      waterWaves: 4,
      waterGrid: 1,
      waterRefraction: true,
      waterCaustics: true,
      waterReflect: 2,
      waterRays: true,
      waterSpray: 200,
    });
  });

  it('never gets cheaper as the quality goes up', () => {
    for (let quality = 1; quality < 10; quality += 1) {
      const low = at(quality);
      const high = at(quality + 1);
      expect(high.waterGrid).toBeGreaterThanOrEqual(low.waterGrid);
      expect(high.waterWaves).toBeGreaterThanOrEqual(low.waterWaves);
      expect(high.waterReflect).toBeGreaterThanOrEqual(low.waterReflect);
      expect(high.waterSpray).toBeGreaterThanOrEqual(low.waterSpray);
      expect(Number(high.waterRefraction)).toBeGreaterThanOrEqual(Number(low.waterRefraction));
      expect(Number(high.waterCaustics)).toBeGreaterThanOrEqual(Number(low.waterCaustics));
      expect(Number(high.waterRays)).toBeGreaterThanOrEqual(Number(low.waterRays));
    }
  });
});

describe('Tidewater deep sea per quality (plan task 2)', () => {
  const ocean = (quality: number, webgpu: boolean, touchDevice = false) =>
    realisticQuality({ quality, touchDevice, webgpu });

  it('quality 3 keeps the Gerstner sea, even on WebGPU', () => {
    expect(ocean(3, true)).toMatchObject({ waterOcean: 'gerstner', oceanCascades: 0, oceanRipples: false });
  });

  it('High (7) on WebGPU draws the FFT sea with 3 cascades and no near ripples', () => {
    expect(ocean(7, true)).toMatchObject({ waterOcean: 'tidewater', oceanCascades: 3, oceanRipples: false });
    expect(ocean(8, true).oceanCascades).toBe(3);
  });

  it('Ultra (10) on WebGPU draws 4 cascades with near ripples and a denser grid', () => {
    const ultra = ocean(10, true);
    expect(ultra).toMatchObject({ waterOcean: 'tidewater', oceanCascades: 4, oceanRipples: true });
    expect(ultra.oceanGrid).toBeGreaterThan(ocean(7, true).oceanGrid);
  });

  it('WebGL2 keeps the Gerstner sea at every level', () => {
    for (let q = 0; q <= 10; q += 1)
      expect(ocean(q, false)).toMatchObject({ waterOcean: 'gerstner', oceanCascades: 0 });
  });

  it('touch devices keep the Gerstner sea, also on WebGPU and at 10', () => {
    for (let q = 0; q <= 10; q += 1) expect(ocean(q, true, true).waterOcean).toBe('gerstner');
  });

  it('the backend defaults to WebGL2 (callers that do not say keep today\'s water)', () => {
    expect(realisticQuality({ quality: 10, touchDevice: false }).waterOcean).toBe('gerstner');
  });

  it('Automatic on a WebGPU computer is High: the FFT sea with 3 cascades', () => {
    expect(ocean(0, true)).toMatchObject({ waterOcean: 'tidewater', oceanCascades: 3 });
  });
});

describe('Tidewater world look per quality (world plan task 1)', () => {
  const at = (quality: number, touchDevice = false, webgpu = true) =>
    realisticQuality({ quality, touchDevice, webgpu }).worldLook;

  it('quality 3 keeps the Genvr look, even on WebGPU', () => {
    expect(at(3)).toBe('genvr');
    expect(at(6)).toBe('genvr');
  });

  it('High (7) and Ultra (10) on a WebGPU computer get the Tidewater world', () => {
    expect(at(7)).toBe('tidewater');
    expect(at(10)).toBe('tidewater');
  });

  it('touch devices never get it, at any level, also on WebGPU', () => {
    for (let q = 0; q <= 10; q += 1) expect(at(q, true)).toBe('genvr');
  });

  it('WebGL2 never gets it, at any level', () => {
    for (let q = 0; q <= 10; q += 1) expect(at(q, false, false)).toBe('genvr');
  });

  it('Automatic on a WebGPU computer is High (Tidewater); the default backend is WebGL2 (Genvr)', () => {
    expect(at(0)).toBe('tidewater');
    expect(realisticQuality({ quality: 10, touchDevice: false }).worldLook).toBe('genvr');
  });

  it('uses the same gate as the Tidewater sea', () => {
    for (const webgpu of [true, false])
      for (const touchDevice of [true, false])
        for (let q = 0; q <= 10; q += 1) {
          const knobs = realisticQuality({ quality: q, touchDevice, webgpu });
          expect(knobs.worldLook === 'tidewater').toBe(knobs.waterOcean === 'tidewater');
        }
  });
});
