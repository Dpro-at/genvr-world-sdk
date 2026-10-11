import { RULE_LIMITS, type Game } from '@genvr/contracts';
import { getLibraryItem } from '@genvr/core-library';

/** An item a game's loadout can hold: a library item with a `tool`. */
export const isTool = (itemId: string) => Boolean(getLibraryItem(itemId)?.manifest.tool);

/**
 * The counters a game names (in rules, the ranking or displays) or its scripts name (`also`, literal names in the
 * place's enabled scripts) that it does not declare, in the order they first appear, and those a fix can declare (as
 * many as the counter limit leaves room for).
 */
export function undeclaredCounters(
  game: Game,
  also: readonly string[] = [],
): { undeclared: string[]; declaredByFix: string[] } {
  const declared = new Set((game.counters ?? []).map((c) => c.name));
  const named: string[] = [];
  const name = (n: string | undefined) => {
    if (n !== undefined && !named.includes(n)) named.push(n);
  };
  for (const rule of game.rules ?? []) {
    name(rule.when.counter);
    for (const condition of rule.if)
      if (condition.kind === 'counter') {
        name(condition.name);
        if (typeof condition.value === 'object') name(condition.value.counter);
      }
    for (const action of rule.do) {
      if (action.kind === 'add_counter' || action.kind === 'set_counter') name(action.name);
      if (action.kind === 'end_match' && typeof action.winner === 'object' && 'byCounter' in action.winner)
        name(action.winner.byCounter);
    }
  }
  name(game.ranking?.by);
  name(game.ranking?.then);
  for (const binding of game.hud ?? []) if (binding.kind === 'counter') name(binding.counter);
  for (const n of also) name(n);
  const undeclared = named.filter((n) => !declared.has(n));
  const room = RULE_LIMITS.counters - (game.counters ?? []).length;
  return { undeclared, declaredByFix: undeclared.slice(0, Math.max(0, room)) };
}

/**
 * The game with every whole-game repair the Checks offer: loadout items that are not tools taken
 * out, undeclared counters (the game's own and those its scripts name, `scriptCounters`) declared
 * per player from 0. Every whole-game fix (`set_game`) carries this same game: fixes are made from
 * one report, so a fix built from the stored game alone would undo the others when the console's
 * Fix all applies them together. Each fix therefore makes all of them, and any order or subset of
 * them ends in the same game.
 */
export function repairGame(game: Game, scriptCounters: readonly string[] = []): Game {
  const { declaredByFix } = undeclaredCounters(game, scriptCounters);
  return {
    ...game,
    ...(game.loadout ? { loadout: { ...game.loadout, items: game.loadout.items.filter(isTool) } } : {}),
    ...(declaredByFix.length > 0
      ? {
          counters: [
            ...(game.counters ?? []),
            ...declaredByFix.map((name) => ({ name, scope: 'player' as const, start: 0 })),
          ],
        }
      : {}),
  };
}
