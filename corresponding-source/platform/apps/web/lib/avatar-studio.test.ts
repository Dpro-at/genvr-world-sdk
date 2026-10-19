import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_CHARACTER_RECIPE, NORMAL_CHARACTER_SHAPE, type CharacterRecipe } from '@genvr/contracts';
import { avatarStudioBridge, runAvatarStudio } from './avatar-studio';
import type { CharacterEditor } from '../components/studio/character-editor/use-character-editor';

function fakeEditor() {
  const editor = {
    recipe: DEFAULT_CHARACTER_RECIPE as CharacterRecipe, view: 'normal', shading: 'smooth', clip: 'Idle', info: null, saved: [],
    load: vi.fn((r: CharacterRecipe) => { editor.recipe = r; }), change: vi.fn((f: (r: CharacterRecipe) => CharacterRecipe) => { editor.recipe = f(editor.recipe); }),
    setView: vi.fn(), setShading: vi.fn(), play: vi.fn(), save: vi.fn(), exportJson: () => JSON.stringify(editor.recipe),
    undo: vi.fn(() => true), redo: vi.fn(() => false),
    stage: { current: { presentExpression: vi.fn(() => true) } },
  };
  return editor;
}

describe('avatar_studio (AV-01)', () => {
  it('refuses without the Avatar tab', () => {
    expect(() => runAvatarStudio({ action: 'inspect' })).toThrow(/Avatar tab/);
  });
  it('merges muscle, fat and face parts, checks the recipe, sets views and expressions', () => {
    const editor = fakeEditor();
    const off = avatarStudioBridge.register(editor as never);
    runAvatarStudio({ action: 'set', recipe: { shape: { muscle: 0.4, muscles: { chest: 0.5 }, face: { eyeSize: 0.2 } }, colors: { top: '#6855c9' } } });
    expect(editor.recipe.shape.muscle).toBe(0.4);
    expect(editor.recipe.shape.muscles.chest).toBe(0.5);
    expect(editor.recipe.shape.height).toBe(NORMAL_CHARACTER_SHAPE.height);
    expect(editor.recipe.colors.top).toBe('#6855c9');
    expect(() => runAvatarStudio({ action: 'set', recipe: { shape: { muscle: 5 } } })).toThrow(/refused/);
    runAvatarStudio({ action: 'view', view: 'muscles' });
    expect(editor.setView).toHaveBeenCalledWith('muscles');
    runAvatarStudio({ action: 'expression', expression: 'smile' });
    expect(editor.stage.current.presentExpression).toHaveBeenCalledWith('smile');
    runAvatarStudio({ action: 'reset_shape' });
    expect(editor.recipe.shape).toEqual(NORMAL_CHARACTER_SHAPE);
    off();
  });
  it('steps through the character edits and says when there is nothing to redo', () => {
    const editor = fakeEditor();
    const off = avatarStudioBridge.register(editor as unknown as CharacterEditor);
    expect(runAvatarStudio({ action: 'undo' })).toEqual({ undone: true });
    expect(() => runAvatarStudio({ action: 'redo' })).toThrow(/Nothing to redo/);
    off();
  });
});
