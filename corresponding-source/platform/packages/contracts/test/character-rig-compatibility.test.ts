import { expect, it } from 'vitest';
import { CharacterRecipe, parseCharacterRecipe, readCharacterRecipe, CHARACTER_RIG } from '../src/character-recipe.js';
it('imports older saved characters without losing their settings and exports the current rig name', () => {
  const saved = { rig: 'mixamo-52', body: 'human', name: 'Saved human', shape: { height: 1.1 }, colors: { skin: '#abcdef' } };
  const imported = parseCharacterRecipe(JSON.stringify(saved));
  expect(imported.ok).toBe(true);
  if (!imported.ok) return;
  expect(imported.recipe).toMatchObject({ rig: CHARACTER_RIG, body: 'human', name: 'Saved human', shape: { height: 1.1 }, colors: { skin: '#abcdef' } });
  expect(readCharacterRecipe(saved)).toEqual(imported.recipe);
  expect(JSON.stringify(imported.recipe)).not.toContain('mixamo');
});
it('accepts the robot while rejecting unrelated unknown rig identifiers', () => {
  expect(CharacterRecipe.parse({ body: 'robot' }).rig).toBe('genvr-humanoid-52');
  expect(parseCharacterRecipe({ rig: 'unknown-rig' }).ok).toBe(false);
});
