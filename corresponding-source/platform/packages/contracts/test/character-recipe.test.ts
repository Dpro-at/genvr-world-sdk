import { describe, expect, it } from 'vitest';
import {
  CHARACTER_RIG,
  CharacterRecipe,
  DEFAULT_CHARACTER_RECIPE,
  FACE_FEATURES,
  FACE_PARTS,
  MAX_RECIPE_CLOTHES,
  MAX_RECIPE_JSON,
  NORMAL_CHARACTER_SHAPE,
  parseCharacterRecipe,
  readCharacterRecipe,
  recipeLook,
} from '../src/index.js';

describe('character recipe (CHAR-01)', () => {
  it('fills every default from an empty object', () => {
    expect(DEFAULT_CHARACTER_RECIPE).toMatchObject({
      version: 1,
      rig: CHARACTER_RIG,
      body: 'robot',
      shape: { height: 1, weight: 1, scale: 1 },
      clothes: [],
      animations: { idle: 'Idle', emotes: [] },
      effects: [],
    });
  });

  it('accepts a full recipe with clothes, animations and effects', () => {
    const result = parseCharacterRecipe({
      name: 'Shore runner',
      body: 'warrior',
      shape: { height: 1.1, weight: 0.9, scale: 1.2 },
      colors: { skin: '#e8c1a0', top: '#b8322a' },
      clothes: [
        {
          slot: 'top',
          layer: 'outer',
          item: 'genvr.core.garment.long-robe',
          colors: ['#b8322a'],
          params: { length: 0.95, split: 'front' },
        },
        { slot: 'top', layer: 'inner', item: 'user.abc.inner-robe' },
      ],
      animations: { idle: 'Idle', emotes: ['Wave', 'Cheer'] },
      effects: [{ kind: 'aura', color: '#ff5533', amount: 0.5 }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.recipe.clothes[1]!.layer).toBe('inner');
  });

  it('refuses shapes outside the limits', () => {
    for (const shape of [{ height: 1.3 }, { weight: 0.5 }, { scale: 3 }, { height: 0.5 }])
      expect(parseCharacterRecipe({ shape }).ok).toBe(false);
  });

  it('refuses bad colours, unknown keys, other rigs and versions', () => {
    expect(parseCharacterRecipe({ colors: { skin: 'red' } }).ok).toBe(false);
    expect(parseCharacterRecipe({ mesh: [1, 2, 3] }).ok).toBe(false);
    expect(parseCharacterRecipe({ shape: { height: 1, arms: 2 } }).ok).toBe(false);
    expect(parseCharacterRecipe({ rig: 'classic-15' }).ok).toBe(false);
    expect(parseCharacterRecipe({ version: 2 }).ok).toBe(false);
    expect(parseCharacterRecipe({ body: 'dragon' }).ok).toBe(false);
  });

  it('allows one garment per slot and layer, and at most the limit', () => {
    const robe = { slot: 'top', layer: 'outer', item: 'genvr.core.garment.robe' };
    expect(parseCharacterRecipe({ clothes: [robe, robe] }).ok).toBe(false);
    const many = Array.from({ length: MAX_RECIPE_CLOTHES + 1 }, (_, i) => ({
      slot: 'back',
      layer: 'accessory',
      item: `user.item-${i}`,
    }));
    expect(parseCharacterRecipe({ clothes: many }).ok).toBe(false);
    const params = Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`p${i}`, i]));
    expect(parseCharacterRecipe({ clothes: [{ ...robe, params }] }).ok).toBe(false);
  });

  it('refuses recipes over 8 KB and text that is not JSON', () => {
    const big = JSON.stringify({ name: 'x', padding: 'y'.repeat(MAX_RECIPE_JSON) });
    expect(parseCharacterRecipe(big)).toEqual({ ok: false, error: 'Recipe is larger than 8 KB' });
    expect(parseCharacterRecipe({ name: 'z'.repeat(MAX_RECIPE_JSON) }).ok).toBe(false);
    expect(parseCharacterRecipe('{nope').ok).toBe(false);
    expect(parseCharacterRecipe(JSON.stringify({ name: 'Ok' })).ok).toBe(true);
  });

  it('a saved default recipe is small', () => {
    expect(JSON.stringify(DEFAULT_CHARACTER_RECIPE).length).toBeLessThan(1024);
  });

  it('reads saved recipes leniently, keeping good fields', () => {
    const read = readCharacterRecipe({
      name: 'Kept',
      shape: { height: 9, weight: 1.2 },
      colors: { skin: 'bad', hair: '#123456' },
      clothes: 'nonsense',
    });
    expect(read.name).toBe('Kept');
    expect(read.shape).toEqual({ ...NORMAL_CHARACTER_SHAPE, weight: 1.2 });
    expect(read.colors.hair).toBe('#123456');
    expect(read.colors.skin).toBe(DEFAULT_CHARACTER_RECIPE.colors.skin);
    expect(read.clothes).toEqual([]);
    expect(CharacterRecipe.safeParse(read).success).toBe(true);
    expect(readCharacterRecipe(null)).toEqual(DEFAULT_CHARACTER_RECIPE);
  });

  it('maps colours to an avatar look', () => {
    const look = recipeLook(
      readCharacterRecipe({ body: 'classic', colors: { top: '#ff0000', bottom: '#00ff00' } }),
    );
    expect(look).toMatchObject({ body: 'classic', shirt: '#ff0000', pants: '#00ff00' });
  });

  it('gives a generated body its muscle and fat build, and keeps Anime Shape to the anime style', () => {
    const recipe = CharacterRecipe.parse({
      body: 'human',
      shape: { anime: 0.5, muscle: 0.4, fat: 0.3, muscles: { biceps: 0.6 }, fatRegions: { belly: -0.2 } },
    });
    expect(recipeLook(recipe)).toMatchObject({
      animeShape: 0.5,
      build: { muscle: 0.4, fat: 0.3, 'muscle.biceps': 0.6, 'fat.belly': -0.2 },
    });
    expect(recipeLook({ ...recipe, style: 'realistic' }).animeShape).toBeUndefined();
    expect(parseCharacterRecipe({ shape: { fat: 0.95 } }).ok).toBe(false);
    expect(parseCharacterRecipe({ shape: { muscles: { tail: 1 } } }).ok).toBe(false);
    expect(recipeLook(DEFAULT_CHARACTER_RECIPE).build).toBeUndefined();
  });

  it('carries the face controls into the build, and refuses unknown or out-of-range ones (FACE-01)', async () => {
    const recipe = CharacterRecipe.parse({ body: 'human', shape: { face: { noseWidth: -0.4, eyeFold: 0.8 } } });
    expect(recipeLook(recipe).build).toEqual({ 'face.noseWidth': -0.4, 'face.eyeFold': 0.8 });
    expect(parseCharacterRecipe({ shape: { face: { tail: 1 } } }).ok).toBe(false);
    expect(parseCharacterRecipe({ shape: { face: { noseSize: 1.5 } } }).ok).toBe(false);
    // Every feature is in exactly one part, and the bake has a target pair for each, in the same order.
    expect(Object.values(FACE_PARTS).flat().sort()).toEqual([...FACE_FEATURES].sort());
    // @ts-expect-error - the bake list is plain JavaScript without types.
    const { FACE_TARGETS } = (await import('../../../../tooling/human-bake/build-targets.mjs')) as {
      FACE_TARGETS: Record<string, unknown>;
    };
    expect(Object.keys(FACE_TARGETS)).toEqual([...FACE_FEATURES]);
  });
});
