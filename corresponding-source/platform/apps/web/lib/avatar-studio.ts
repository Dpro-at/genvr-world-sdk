import { parseCharacterRecipe, NORMAL_CHARACTER_SHAPE, type CharacterRecipe } from '@genvr/contracts';
import { HIDDEN_BODY_IDS, PICKABLE_BODIES } from '@genvr/core-library';
import type { CharacterEditor } from '../components/studio/character-editor/use-character-editor';
import { madeMovesBridge } from './made-moves';

/** The Avatar tab's character editor while it is mounted (AV-01): MCP and the assistant change the same character. */
let current: CharacterEditor | null = null;
export const avatarStudioBridge = {
  register(editor: CharacterEditor) { current = editor; return () => { if (current === editor) current = null; }; },
  get: () => current,
};

type Input = {
  action: 'inspect' | 'set' | 'view' | 'expression' | 'play' | 'save' | 'export' | 'reset_shape' | 'undo' | 'redo' | 'moves_mine' | 'move_use' | 'move_unuse' | 'move_preview';
  /** Board M19: a made motion (My motions id or name), its key 1–8 or the base move it replaces, once or loop. */
  motion?: string | undefined; slot?: number | undefined; replaces?: 'Idle' | 'Walk' | 'Run' | 'Jump' | undefined; once?: boolean | undefined;
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
  // What the Standard robot's feet and screen face can do (board A11).
  ...(editor.recipe.body === 'robot' ? { body: { toes: 5, toeJoint: 'ToeBase 0–45° (bends up when the heel lifts)', eyes: 'round, blink, follow the viewer' } } : {}),
  pickableBodies: PICKABLE_BODIES.map((body) => body.id),
  saved: editor.saved.map((s) => ({ id: s.id, name: s.recipe.name, savedAt: s.savedAt })),
});

/** Runs one avatar_studio call on the Avatar tab; throws with a reason a person or agent can act on. */
export function runAvatarStudio(input: Input): unknown {
  // Board M19: made motions in the game (My motions → a key 1–8 or a base move of this project's avatar).
  if (input.action.startsWith('move')) {
    const moves = madeMovesBridge.get();
    if (!moves) throw new Error('Made motions need the local Studio with a project open.');
    if (input.action === 'moves_mine') return moves.mine().then((mine) => ({ mine, used: moves.moves.map((m) => ({ id: m.id, name: m.name, slot: m.slot ?? null, replaces: m.replaces ?? null, once: m.once })) }));
    if (!input.motion) throw new Error('Send motion (an id or name from moves_mine).');
    if (input.action === 'move_unuse') { moves.unuse(input.motion); return { unused: input.motion }; }
    if (input.action === 'move_preview') return moves.preview(input.motion).then(() => ({ playing: input.motion }));
    if ((input.slot === undefined) === (input.replaces === undefined)) throw new Error('Send slot 1–8 or replaces (Idle, Walk, Run, Jump), one of the two.');
    return moves.use(input.motion, input.slot !== undefined ? { slot: input.slot } : { replaces: input.replaces! }, input.once ?? true);
  }
  const editor = current;
  if (!editor) throw new Error('Open the Avatar tab in the Studio first.');
  switch (input.action) {
    case 'inspect': return describe(editor);
    case 'set': {
      if (!input.recipe) throw new Error('Send recipe with the parts to change.');
      const parsed = parseCharacterRecipe(merge(editor.recipe as unknown as Record<string, unknown>, input.recipe));
      if (!parsed.ok) throw new Error(`The recipe was refused: ${parsed.error}`);
      // Hidden bodies (board A12): a character already on one keeps it, nobody picks one anew.
      if (parsed.recipe.body !== editor.recipe.body && HIDDEN_BODY_IDS.has(parsed.recipe.body))
        throw new Error(`The body "${parsed.recipe.body}" is hidden. Pick one of: ${PICKABLE_BODIES.map((body) => body.id).join(', ')}, or a body of My characters.`);
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
