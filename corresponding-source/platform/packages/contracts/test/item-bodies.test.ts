import { describe, expect, it } from 'vitest';
import { AvatarLook, readAvatarLook, readAvatarProfile, readPlaceAvatar, wearBody } from '../src/index.js';

// Uploaded bodies (plan 2026-10-03, Task 4): a look and a place may name a creator's body item; saved looks of
// Genvr's bodies read exactly as before, and anything else still falls back to Classic.

const ITEM = 'user.creator.my-hero-a1b2c3';

describe('looks with uploaded bodies', () => {
  it('a look may wear a body item; broken or foreign values still fall back to Classic', () => {
    expect(readAvatarLook({ body: ITEM }).body).toBe(ITEM);
    expect(readAvatarLook({ body: 'warrior' }).body).toBe('warrior');
    for (const bad of ['robot', 'genvr.core.body.classic', 'user.', 'user.x y', 42, null])
      expect(readAvatarLook({ body: bad }).body, String(bad)).toBe('classic');
  });

  it('old saved looks read the same as before', () => {
    const saved = {
      body: 'classic',
      skin: '#112233',
      wear: ['genvr.core.hat.cap'],
      bodies: { warrior: { skin: '#445566' } },
    };
    const profile = readAvatarProfile(saved);
    expect(profile).toMatchObject({ body: 'classic', skin: '#112233', wear: ['genvr.core.hat.cap'] });
    expect(profile.bodies.warrior?.skin).toBe('#445566');
  });

  it("switching to a body item keeps the Genvr body's look, and switching back brings it again", () => {
    const start = AvatarLook.parse({ body: 'classic', shirt: '#204060' });
    const onItem = wearBody(start, ITEM);
    expect(onItem.body).toBe(ITEM);
    expect(onItem.bodies.classic?.shirt).toBe('#204060');
    const back = wearBody(onItem, 'classic');
    expect(back.body).toBe('classic');
    expect(back.shirt).toBe('#204060');
  });

  it('a place may use a body item for everyone', () => {
    expect(readPlaceAvatar({ mode: 'place', body: ITEM }).body).toBe(ITEM);
    expect(readPlaceAvatar({ mode: 'place', body: 'nonsense' }).body).toBe('any');
  });
});
