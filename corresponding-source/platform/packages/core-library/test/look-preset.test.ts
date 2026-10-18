import { describe, expect, it } from 'vitest';
import { checkLookPreset, CORE_WEARABLES, PLAYER_BODIES } from '../src/index.js';

// Look items (spec 2026-10-03): a creator's look is made only of Genvr's bodies, sizes, colors and Core wearables,
// checked with the same functions the room uses, so wearing one never needs anything new at runtime.

const hat = CORE_WEARABLES.find((item) => item.slot === 'hat')!;
const otherHat = CORE_WEARABLES.find((item) => item.slot === 'hat' && item !== hat)!;
const top = CORE_WEARABLES.find((item) => item.slot === 'top' && item.layer === 'inner')!;
const look = (extra: Record<string, unknown> = {}) => ({
  body: 'classic',
  scale: { height: 1.05, width: 0.95, head: 1 },
  skin: '#c68863',
  hair: '#1d1410',
  shirt: '#204060',
  pants: '#303030',
  shoes: '#ffffff',
  wear: [hat.manifest.id, top.manifest.id],
  ...extra,
});

describe('checkLookPreset', () => {
  it('accepts a look made of a player body, sizes, colors and Core wearables', () => {
    expect(checkLookPreset(look())).toEqual({ ok: true, look: look() });
    expect(checkLookPreset(look({ body: 'robot' }))).toEqual({ ok: true, look: look({ body: 'robot' }) });
  });

  it('refuses an unknown body, a body players cannot choose, and broken values', () => {
    expect(checkLookPreset(look({ body: 'unknown-body' })).ok).toBe(false);
    expect(checkLookPreset(look({ body: 'flat' }))).toMatchObject({
      ok: false,
      problems: [expect.stringMatching(/body/)],
    });
    expect(checkLookPreset(look({ skin: 'pink' })).ok).toBe(false);
    expect(checkLookPreset(look({ scale: { height: 9, width: 1, head: 1 } })).ok).toBe(false);
  });

  it('refuses items that are not Core wearables, and two items for one slot', () => {
    expect(checkLookPreset(look({ wear: ['user.someone.hat'] }))).toMatchObject({
      ok: false,
      problems: [expect.stringContaining('user.someone.hat')],
    });
    expect(checkLookPreset(look({ wear: [hat.manifest.id, otherHat.manifest.id] }))).toMatchObject({
      ok: false,
      problems: [expect.stringMatching(/same place/)],
    });
  });

  it('refuses items on a body that wears none (mesh bodies)', () => {
    const mesh = PLAYER_BODIES.find((body) => body.model);
    if (!mesh) return;
    expect(checkLookPreset(look({ body: mesh.id }))).toMatchObject({
      ok: false,
      problems: [expect.stringMatching(/wears no items/)],
    });
    expect(checkLookPreset(look({ body: mesh.id, wear: [] })).ok).toBe(true);
  });
});
