import { describe, expect, it } from 'vitest';
import { FilmSession, burstGlow, effectParams, emptyFilm, flashWarnings, fromSeconds, particlesAt, sceneFxSteps, shakeOffset, shockPush } from '../src/index.js';

describe('scene effects', () => {
  it('shake is seeded, smooth and scales with amount squared', () => {
    expect(shakeOffset(3, 1.234, 0.7, 6)).toEqual(shakeOffset(3, 1.234, 0.7, 6));
    expect(shakeOffset(3, 1.234, 0.7, 6)).not.toEqual(shakeOffset(4, 1.234, 0.7, 6));
    expect(shakeOffset(3, 1, 0, 6)).toEqual({ x: 0, y: 0, rotation: 0 });
    const a = shakeOffset(1, 2, 1, 6), b = shakeOffset(1, 2.001, 1, 6);
    expect(Math.abs(a.x - b.x)).toBeLessThan(0.005);
    const half = shakeOffset(1, 2, 0.5, 6);
    expect(half.x).toBeCloseTo(a.x / 4, 9);
  });
  it('particles depend only on their settings and time', () => {
    const one = particlesAt('confetti', 7, 50, 1.5), two = particlesAt('confetti', 7, 50, 1.5);
    expect(one).toEqual(two);
    expect(particlesAt('confetti', 8, 50, 1.5)).not.toEqual(one);
    for (const kind of ['snow', 'bubbles'] as const) {
      const p = particlesAt(kind, 1, 100, 3);
      expect(p.length).toBeGreaterThan(50);
      expect(p.every((q) => q.x > -0.1 && q.x < 1.1 && q.y > -0.2 && q.y < 1.2)).toBe(true);
    }
  });
  it('light burst and shockwave references', () => {
    expect(burstGlow([0.5, 0.5], 0.5, 0.5, 0.8, 0.4)).toBeCloseTo(0.8, 9);
    expect(burstGlow([0.9, 0.9], 0.5, 0.5, 0.8, 0.4)).toBeLessThan(0.1);
    expect(shockPush([0.8, 0.5], 0.5, 0.5, 0.3, 0.08, 1)).toBeGreaterThan(0);
    expect(shockPush([0.5, 0.5], 0.5, 0.5, 0.3, 0.08, 1)).toBe(0);
  });
  it('settings are checked, choices included; strong bursts count as flashes', () => {
    expect(effectParams('particles', { kind: 'snow' })).toMatchObject({ kind: 'snow', count: 150 });
    expect(() => effectParams('particles', { kind: 'fire' })).toThrow('one of confetti, snow, bubbles');
    let n = 0;
    const f = new FilmSession(emptyFilm(), () => `id${++n}`);
    f.run('media.add', { media: { id: 'a', kind: 'video', asset: 'x', name: 'A', duration: fromSeconds(4), camera: null, cues: [] } });
    f.run('adjustment.add', { effect: 'light_burst', start: 1, duration: 0.2, params: { strength: 1.5 } });
    f.run('adjustment.add', { effect: 'light_burst', start: 1.2, duration: 0.2, params: { strength: 1.5 } });
    expect(flashWarnings(f.project)).toEqual([expect.stringContaining('strong light burst')]);
  });
  it('scene cues become adjustment layers at their film times; shake is filmed live', () => {
    const steps = sceneFxSteps([
      { actor: 'scene', action: 'fx_confetti', start: 1, end: 3 }, { actor: 'scene', action: 'fx_shake', start: 0, end: 1 },
      { actor: 'self', action: 'wave', start: 0, end: 1 }, { actor: 'scene', action: 'fx_shockwave', start: 2, end: 2.5 },
    ], 10);
    expect(steps).toEqual([
      { id: 'adjustment.add', args: { effect: 'particles', start: 11, duration: 2, params: { kind: 'confetti', seed: 1 } } },
      { id: 'adjustment.add', args: { effect: 'shockwave', start: 12, duration: 0.5 } },
    ]);
    let n = 0;
    const f = new FilmSession(emptyFilm(), () => `id${++n}`);
    f.run('media.add', { media: { id: 'a', kind: 'video', asset: 'x', name: 'A', duration: fromSeconds(14), camera: null, cues: [] } });
    expect(f.batch(steps.map((st) => ({ ...st, args: { ...st.args, start: (st.args.start as number) - 10 } })), { label: 'Scene effects' })).toMatchObject({ ok: true });
    const fx = f.project.tracks.filter((t) => t.kind === 'effect');
    expect(fx.map((t) => t.clips.map((c) => (c as { effect: string }).effect))).toEqual([['shockwave'], ['particles']]);
  });
});
