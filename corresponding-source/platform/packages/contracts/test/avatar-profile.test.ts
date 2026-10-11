import { describe, expect, it } from 'vitest';
import { AvatarLook, lookForBody, readAvatarLook, readAvatarProfile, wearBody } from '../src/index.js';

describe('avatar looks per body type (P2-22)', () => {
  const red = readAvatarLook({ body: 'classic', shirt: '#ff0000', scale: { height: 1.1 } });

  it('keeps the worn look for the old body and brings back the new body look', () => {
    const starter = wearBody(red, 'starter');
    // A body with no kept look starts from the worn look.
    expect(starter).toMatchObject({ body: 'starter', shirt: '#ff0000' });
    expect(starter.bodies.classic).toMatchObject({ shirt: '#ff0000', scale: { height: 1.1 } });

    const changed = { ...starter, shirt: '#00ff00' };
    const back = wearBody(changed, 'classic');
    expect(back).toMatchObject({ body: 'classic', shirt: '#ff0000', scale: { height: 1.1 } });
    expect(back.bodies).toEqual({ starter: expect.objectContaining({ shirt: '#00ff00' }) });
    expect(wearBody(back, 'starter')).toMatchObject({ body: 'starter', shirt: '#00ff00' });
  });

  it('gives the look of any body type, and plain looks carry no kept looks', () => {
    const profile = wearBody({ ...wearBody(red, 'starter'), shirt: '#00ff00' }, 'classic');
    expect(lookForBody(profile, 'starter')).toMatchObject({ body: 'starter', shirt: '#00ff00' });
    expect(lookForBody(profile, 'classic')).toMatchObject({ body: 'classic', shirt: '#ff0000' });
    expect(lookForBody(profile, 'starter')).not.toHaveProperty('bodies');
    // Rooms read plain looks: the kept looks are dropped.
    expect(AvatarLook.parse(profile)).not.toHaveProperty('bodies');
  });

  it('reads saved avatars leniently', () => {
    expect(readAvatarProfile(undefined).bodies).toEqual({});
    const saved = readAvatarProfile({
      ...red,
      bodies: {
        starter: { shirt: 'not a color', pants: '#123456' },
        classic: { shirt: '#000000' },
        alien: {},
      },
    });
    // Broken fields fall back to defaults; the worn body and unknown bodies are not kept.
    expect(saved.bodies.starter).toMatchObject({ pants: '#123456', shirt: readAvatarLook({}).shirt });
    expect(Object.keys(saved.bodies)).toEqual(['starter']);
  });
});
