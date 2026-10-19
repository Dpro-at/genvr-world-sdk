import { parseCharacterRecipe, NORMAL_CHARACTER_SHAPE, type CharacterRecipe } from '@genvr/contracts';
import type { CharacterEditor } from '../components/studio/character-editor/use-character-editor';

/** The Avatar tab's character editor while it is mounted (AV-01): MCP and the assistant change the same character. */
let current: CharacterEditor | null = null;
export const avatarStudioBridge = {
  register(editor: CharacterEditor) { current = editor; return () => { if (current === editor) current = null; }; },
  get: () => current,
};

type Input = {
  action: 'inspect' | 'set' | 'view' | 'expression' | 'play' | 'save' | 'export' | 'reset_shape' | 'undo' | 'redo';
  recipe?: Record<string, unknown> | undefined; view?: CharacterEditor['view'] | undefined; shading?: CharacterEditor['shading'] | undefined;
  expression?: 'neutral' | 'smile' | 'angry' | 'sad' | 'surprised' | 'thinking' | undefined; clip?: string | undefined;
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
/** Recipe parts merge into the current recipe one level deep inside objects (shape.muscles, shape.face, colors…). */
function merge(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) out[key] = isObject(value) && isObject(base[key]) ? merge(base[key] as Record<string, unknown>, value) : value;
  return out;
}

const describe = (editor: CharacterEditor) => ({
  recipe: editor.recipe, view: editor.view, shading: editor.shading, clip: editor.clip,
  info: editor.info ? { height: editor.info.height, bones: editor.info.bones, expression: editor.info.expression, expressionSupported: editor.info.expressionSupported } : null,
  saved: editor.saved.map((s) => ({ id: s.id, name: s.recipe.name, savedAt: s.savedAt })),
});

/** Runs one avatar_studio call on the Avatar tab; throws with a reason a person or agent can act on. */
export function runAvatarStudio(input: Input): unknown {
  const editor = current;
  if (!editor) throw new Error('Open the Avatar tab in the Studio first.');
  switch (input.action) {
    case 'inspect': return describe(editor);
    case 'set': {
      if (!input.recipe) throw new Error('Send recipe with the parts to change.');
      const parsed = parseCharacterRecipe(merge(editor.recipe as unknown as Record<string, unknown>, input.recipe));
      if (!parsed.ok) throw new Error(`The recipe was refused: ${parsed.error}`);
      editor.load(parsed.recipe);
      return { changed: Object.keys(input.recipe), recipe: parsed.recipe };
    }
    case 'reset_shape': { editor.change((r: CharacterRecipe) => ({ ...r, shape: NORMAL_CHARACTER_SHAPE })); return { shape: NORMAL_CHARACTER_SHAPE }; }
    case 'view': {
      if (!input.view && !input.shading) throw new Error('Send view and/or shading.');
      if (input.view) editor.setView(input.view);
      if (input.shading) editor.setShading(input.shading);
      return { view: input.view ?? editor.view, shading: input.shading ?? editor.shading };
    }
    case 'expression': {
      if (!input.expression) throw new Error('Send expression.');
      const shown = editor.stage.current?.presentExpression(input.expression) ?? false;
      if (!shown) throw new Error('This body has no face controls; choose a body with a face (for example Starter).');
      return { expression: input.expression };
    }
    case 'play': { if (!input.clip) throw new Error('Send clip (a move id from list_avatar_motions).'); editor.play(input.clip); return { playing: input.clip }; }
    case 'save': { editor.save(); return { saved: editor.recipe.name }; }
    case 'export': return { recipe: JSON.parse(editor.exportJson()) as unknown };
    case 'undo': if (!editor.undo()) throw new Error('Nothing to undo on the character.'); return { undone: true };
    case 'redo': if (!editor.redo()) throw new Error('Nothing to redo on the character.'); return { redone: true };
  }
}
