import { describe, expect, it } from 'vitest';
import { AvatarLook, DEFAULT_CHARACTER_RECIPE } from '@genvr/contracts';
import { AVATAR_BODIES, DEFAULT_BODY_ID, findBody, HIDDEN_BODY_IDS, PICKABLE_BODIES } from '../src/index.js';

describe('bodies offered for a new choice (board A12)', () => {
  it('offers the Standard robot first, then Anime body; hides the five early bodies', () => {
    expect(PICKABLE_BODIES.map((body) => body.id)).toEqual(['robot', 'human']);
    for (const id of ['classic', 'simple', 'starter', 'anime-boy', 'warrior']) expect(HIDDEN_BODY_IDS.has(id)).toBe(true);
    expect(PICKABLE_BODIES.some((body) => HIDDEN_BODY_IDS.has(body.id))).toBe(false);
  });
  it('starts new looks and new characters as the robot', () => {
    expect(DEFAULT_BODY_ID).toBe('robot');
    expect(AvatarLook.parse({}).body).toBe('robot');
    expect(DEFAULT_CHARACTER_RECIPE.body).toBe('robot');
  });
  it('keeps every hidden body in the library, so old looks still resolve', () => {
    for (const id of HIDDEN_BODY_IDS) expect(AVATAR_BODIES.some((body) => body.id === id)).toBe(true);
    expect(findBody('classic').id).toBe('classic');
    expect(AvatarLook.parse({ body: 'warrior' }).body).toBe('warrior');
  });
});
