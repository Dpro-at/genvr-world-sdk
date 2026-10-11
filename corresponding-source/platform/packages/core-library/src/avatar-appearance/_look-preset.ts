import { AvatarLook } from '@genvr/contracts';
import { PLAYER_BODIES } from './_body.js';
import { findWearable, wornItems } from './_wearables.js';

/**
 * Whether a look can be a look item (spec `docs/superpowers/specs/2026-10-03-look-items-design.md`): a body players
 * can choose, valid sizes and colors, and only Core wearables, one per slot and layer, on a body that wears items.
 * The same lookups the room uses (`wornItems`), so a look item never needs anything new at runtime.
 */
export function checkLookPreset(
  input: unknown,
): { ok: true; look: AvatarLook } | { ok: false; problems: string[] } {
  const parsed = AvatarLook.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      problems: parsed.error.issues.map((issue) => `${issue.path.join('.') || 'look'}: ${issue.message}`),
    };
  const look = parsed.data;
  const problems: string[] = [];
  const body = PLAYER_BODIES.find((one) => one.id === look.body);
  if (!body) problems.push(`the body "${look.body}" is not one players can choose`);
  const unknown = look.wear.filter((id) => !findWearable(id));
  for (const id of unknown) problems.push(`"${id}" is not a Genvr wearable`);
  const known = look.wear.filter((id) => findWearable(id));
  if (unknown.length === 0 && wornItems(known).length < known.length)
    problems.push('two items take the same place on the body (one per slot and layer)');
  if (body?.model && look.wear.length > 0) problems.push(`the body "${look.body}" wears no items`);
  return problems.length > 0 ? { ok: false, problems } : { ok: true, look };
}
