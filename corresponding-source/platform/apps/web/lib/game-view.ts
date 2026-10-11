/**
 * The place's game as the page shows it (P9-12): the room's synced game read into plain rows, and
 * the few rules the page and the HUD share. Pure, so it is tested without a room or a screen.
 */

import {
  decodeGameWinner,
  teamCounterKey,
  type Game,
  type GameCounterMaps,
  type GamePlayerRow,
} from '@genvr/contracts';
import { clockText, remaining } from './game-clock';
import { speedText } from './ride-view';

/** One row of the game's scoreboard (P9-12), with the player's name. */
export interface GamePlayerSnapshot extends GamePlayerRow {
  id: string;
  name: string;
  self: boolean;
}

/**
 * The place's game as the room shares it (P9-12); `on` is false in a place without a game. The
 * counter maps are copies (`GameCounterMaps`): they never change under the page.
 */
export interface GameSnapshot extends GameCounterMaps {
  on: boolean;
  /** 'waiting', 'countdown', 'playing' or 'results'. */
  phase: string;
  /** When the phase ends, in server ms; 0 for no end. */
  endsAt: number;
  /** Encoded as in `encodeGameWinner` (@genvr/contracts). */
  winner: string;
  red: number;
  blue: number;
  players: GamePlayerSnapshot[];
}

/** The room's synced game (`state.game`), as far as the page reads it. */
export interface GameStateView extends GameCounterMaps {
  on: boolean;
  phase: string;
  endsAt: number;
  winner: string;
  red: number;
  blue: number;
  players: { forEach(callback: (player: GamePlayerRow, id: string) => void): void };
}

/**
 * Adds the roster's current names to `known` and returns it. The roster drops a player who leaves,
 * but the game keeps their row until the match ends (P9-12), so the scoreboard and the results
 * read names from what was seen, not only from who is here now.
 */
export function rememberNames(
  known: Map<string, string>,
  current: ReadonlyMap<string, string>,
): Map<string, string> {
  for (const [id, name] of current) known.set(id, name);
  return known;
}

/** The game's rows with names from the roster (a player who left keeps their row, P9-12). */
export function readGame(
  game: GameStateView,
  names: ReadonlyMap<string, string>,
  self: string,
): GameSnapshot {
  const players: GamePlayerSnapshot[] = [];
  game.players.forEach((row, id) => {
    players.push({
      id,
      name: names.get(id) ?? 'Player',
      team: row.team,
      health: row.health,
      max: row.max,
      alive: row.alive,
      score: row.score,
      kills: row.kills,
      deaths: row.deaths,
      present: row.present,
      tool: row.tool,
      respawnAt: row.respawnAt,
      place: row.place,
      counters: new Map(row.counters),
      self: id === self,
    });
  });
  return {
    on: game.on,
    phase: game.phase,
    endsAt: game.endsAt,
    winner: game.winner,
    red: game.red,
    blue: game.blue,
    players,
    teamCounters: new Map(game.teamCounters),
    globalCounters: new Map(game.globalCounters),
  };
}

/** The player's own row while they play the game; null when not in it. */
export function ownRow(snapshot: GameSnapshot | null): GamePlayerSnapshot | null {
  return snapshot?.on ? (snapshot.players.find((row) => row.self) ?? null) : null;
}

/**
 * Knocked out: the player's row is down during the match. Only the match counts; in the other
 * phases (results, waiting) the player moves again.
 */
export function knockedOut(snapshot: GameSnapshot | null): boolean {
  const me = ownRow(snapshot);
  return me !== null && snapshot!.phase === 'playing' && !me.alive;
}

/**
 * Whether a strike goes to the room: a tool in hand and not knocked out. The Strike clip is only
 * the look of it and never decides.
 */
export function canAttack(snapshot: GameSnapshot | null): boolean {
  const me = ownRow(snapshot);
  return me !== null && me.tool !== '' && !knockedOut(snapshot);
}

/**
 * Seconds until the local player is back (from the server's respawn time); null when they are not
 * knocked out or the rules bring nobody back before the next match.
 */
export function backIn(
  snapshot: GameSnapshot | null,
  serverOffset: number,
  clientNow: number,
): number | null {
  const me = ownRow(snapshot);
  if (!knockedOut(snapshot) || !me || me.respawnAt <= 0) return null;
  return remaining(me.respawnAt, serverOffset, clientNow);
}

/** Scoreboard order: highest score first, then most kills, then fewest deaths. */
export function ranked(players: readonly GamePlayerSnapshot[]): GamePlayerSnapshot[] {
  return [...players].sort((a, b) => b.score - a.score || b.kills - a.kills || a.deaths - b.deaths);
}

/** The winner in words ('' in the snapshot means nobody won: a draw). */
export function winnerText(snapshot: GameSnapshot): string {
  const winner = decodeGameWinner(snapshot.winner);
  if (winner === null) return 'Draw';
  if (winner.kind === 'team') return winner.team === 'red' ? 'Red team wins' : 'Blue team wins';
  const player = snapshot.players.find((row) => row.id === winner.id);
  if (player?.self) return 'You win';
  return `${player?.name ?? 'A player'} wins`;
}

/** Players by the game's ranking, best place first; players it does not rank (place 0) are left out. */
export function byPlace(players: readonly GamePlayerSnapshot[]): GamePlayerSnapshot[] {
  return players.filter((row) => row.place > 0).sort((a, b) => a.place - b.place);
}

/** The parts of the place's game the HUD reads: its counters, its ranking and the designer's bindings. */
export type GameHudRules = Pick<Game, 'counters' | 'ranking' | 'hud'>;

/**
 * The scoreboard's heading for the ranked counter: the label of the designer's display of that
 * counter, else the counter's name; null without a ranking.
 */
export function rankingTitle(rules: GameHudRules | null | undefined): string | null {
  const by = rules?.ranking?.by;
  if (!by) return null;
  const shown = rules.hud?.find(
    (binding) => binding.kind === 'counter' && binding.counter === by && binding.label,
  );
  return shown?.label || by;
}

/** One line the HUD shows for a binding: the designer's label and the value now. */
export interface HudLine {
  key: string;
  label: string;
  value: string;
}

/**
 * The designer's HUD bindings (`game.hud`) as lines for the local player: a counter's value (their
 * own, their team's, or the global one, by the counter's scope), their place by the ranking ("2/5"),
 * or the time left of the match. A binding with nothing to show yet is left out: a counter that is
 * not declared or has no value, a place of 0, a clock without an end. `left` is the seconds left
 * (null for none); `speed` is the local player's speed over the ground in m/s (movement modes; null
 * or missing shows no Speed line).
 */
export function hudLines(
  snapshot: GameSnapshot,
  rules: GameHudRules | null | undefined,
  left: number | null,
  speed: number | null = null,
): HudLine[] {
  const me = ownRow(snapshot);
  if (!me || !rules?.hud) return [];
  const lines: HudLine[] = [];
  rules.hud.forEach((binding, index) => {
    const key = `${index}:${binding.kind}`;
    if (binding.kind === 'counter') {
      const scope = rules.counters?.find((counter) => counter.name === binding.counter)?.scope;
      const value =
        scope === 'player'
          ? me.counters.get(binding.counter)
          : scope === 'team'
            ? me.team === 'red' || me.team === 'blue'
              ? snapshot.teamCounters.get(teamCounterKey(me.team, binding.counter))
              : undefined
            : scope === 'global'
              ? snapshot.globalCounters.get(binding.counter)
              : undefined;
      if (value !== undefined) lines.push({ key, label: binding.label, value: String(value) });
    } else if (binding.kind === 'rank') {
      if (me.place > 0)
        lines.push({ key, label: binding.label, value: `${me.place}/${byPlace(snapshot.players).length}` });
    } else if (binding.kind === 'speed') {
      if (speed !== null) lines.push({ key, label: binding.label, value: speedText(speed, binding.unit) });
    } else if (left !== null) lines.push({ key, label: binding.label, value: clockText(left) });
  });
  return lines;
}

/** A rule's message (`show_message`) as the HUD shows it: the text and when it arrived (client ms). */
export interface GameMessage {
  key: number;
  at: number;
  text: string;
}

/** How long a message stays on screen, and how many show at once. */
export const MESSAGES = { ms: 4000, lines: 3 } as const;

/** The messages with a new one added; old ones that are no longer shown are let go. */
export function addMessage(list: readonly GameMessage[], message: GameMessage): GameMessage[] {
  return [...shownMessages(list, message.at), message].slice(-MESSAGES.lines);
}

/** The messages still on screen at `now`, oldest first, at most `MESSAGES.lines`. */
export function shownMessages(list: readonly GameMessage[], now: number): GameMessage[] {
  return list
    .filter((message) => now - message.at < MESSAGES.ms && message.text.trim() !== '')
    .slice(-MESSAGES.lines);
}

/**
 * The compact HUD of short screens (landscape phones): screens at most `maxHeight` px tall stack
 * the health line and the displays at the top left, `top` px down (under the platform bar), in rows
 * of `row` px, and keep the bottom `thumb` px free for the joystick thumb and the bottom buttons.
 * `toggle` is the 44 px "Show more" button with its gap.
 */
export const COMPACT_HUD = { maxHeight: 500, top: 64, row: 28, toggle: 48, thumb: 110 } as const;

/**
 * How many of `count` displays show before the "Show more" button: all of them on a tall screen,
 * or when they fit (with the health line, when shown) above the thumb area of a short one;
 * otherwise as many as fit with the health line and the button, and always at least one.
 */
export function hudFit(count: number, viewportHeight: number, withHealth: boolean): number {
  if (count === 0 || viewportHeight > COMPACT_HUD.maxHeight) return count;
  const health = withHealth ? 1 : 0;
  const room = viewportHeight - COMPACT_HUD.top - COMPACT_HUD.thumb;
  if ((count + health) * COMPACT_HUD.row <= room) return count;
  const rows = Math.floor((room - COMPACT_HUD.toggle) / COMPACT_HUD.row) - health;
  return Math.max(1, Math.min(count, rows));
}
