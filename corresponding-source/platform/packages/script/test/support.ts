import { Game, type PlaceScript } from '@genvr/contracts';
import { GameSession, type GameEvent, type Position, type ZoneSpec } from '@genvr/game';
import { ScriptRunner, type RunnerOptions, type ScriptLogLine, type ScriptRequest } from '../src/index.js';
import type { ScriptModule } from '../src/index.js';

type GameInput = Parameters<typeof Game.parse>[0] & object;

/** A gate at z = -20 crossed heading +z, and an area pad at (50, 50). Examples only. */
export const GATE: ZoneSpec = {
  id: 'z-gate',
  shape: 'gate',
  tag: 'line',
  x: 0,
  y: 0,
  z: -20,
  yaw: 0,
  width: 6,
  depth: 0,
};
export const PAD: ZoneSpec = {
  id: 'z-pad',
  shape: 'area',
  tag: 'pad',
  x: 50,
  y: 0,
  z: 50,
  yaw: 0,
  width: 4,
  depth: 4,
};

/** A neutral game for tests: 2 players to start, no countdown, 60 s of play, 3 s of results, three counters. */
export const BASE_GAME = {
  match: { minPlayers: 2, durationSec: 60, countdownSec: 0, resultsSec: 3 },
  health: { max: 100 },
  respawn: { delaySec: 3, protectSec: 0 },
  win: { by: 'highest_score' as const },
  counters: [
    { name: 'n', scope: 'player' as const, start: 0 },
    { name: 't', scope: 'team' as const, start: 0 },
    { name: 'g', scope: 'global' as const, start: 0 },
  ],
  rules: [] as unknown[],
};

let counter = 0;
/** A place script with a fresh id. */
export function script(source: string, name = `example ${counter + 1}`, enabled = true): PlaceScript {
  counter += 1;
  return { id: `scr-${counter.toString(16).padStart(8, '0')}`, name, api: 1, enabled, source };
}

export interface PlaceOptions {
  game?: Partial<GameInput>;
  scripts: PlaceScript[];
  module: ScriptModule;
  players?: string[];
  runner?: Partial<RunnerOptions>;
  /** Skip the two ticks that start play. */
  noStart?: boolean;
}

/** A real session with a script runner, two players joined and play started (unless `noStart`). */
export function place(options: PlaceOptions) {
  const game = Game.parse({ ...BASE_GAME, ...options.game });
  const logs: ScriptLogLine[] = [];
  const requests: ScriptRequest[] = [];
  const engineLog: string[] = [];
  const pos = new Map<string, Position>();
  const seen: GameEvent[] = [];
  let now = 0;
  const runner = new ScriptRunner(options.scripts, {
    placeSeed: 'exp-example',
    module: options.module,
    onLog: (line) => logs.push(line),
    onRequest: (request) => requests.push(request),
    ...options.runner,
  });
  const session = new GameSession(game, [{ x: 0, y: 0, z: 0, team: 'any' }], 0, {
    positions: (id) => pos.get(id) ?? null,
    zones: [GATE, PAD],
    log: (message) => engineLog.push(message),
    scripts: runner,
  });
  for (const type of ['placed', 'message', 'speed_requested', 'dismount_requested', 'score_changed'] as const)
    session.bus.on(type, (event) => seen.push(event));
  const tick = (ms = 100) => {
    now += ms;
    session.tick(now);
  };
  for (const id of options.players ?? ['a', 'b']) {
    pos.set(id, { x: 0, y: 0, z: 0 });
    session.join(id, now);
  }
  if (!options.noStart) {
    tick();
    tick();
  }
  /** Raises a custom event as if a rule emitted it (top level, actor `id`). */
  const raise = (name: string, id: string | null = 'a') => {
    session.bus.emit({ type: 'custom', name, id });
    session.bus.flush();
  };
  /** Moves `id` through the gate (two ticks). */
  const cross = (id = 'a') => {
    pos.set(id, { x: 0, y: 0, z: -22 });
    tick();
    pos.set(id, { x: 0, y: 0, z: -18 });
    tick();
  };
  const texts = (level?: ScriptLogLine['level']) =>
    logs.filter((line) => level === undefined || line.level === level).map((line) => line.text);
  return {
    runner,
    session,
    logs,
    texts,
    requests,
    engineLog,
    seen,
    pos,
    tick,
    raise,
    cross,
    now: () => now,
    counter: (name: string, id: string) => session.view().players.get(id)?.counters[name],
    dispose: () => runner.dispose(),
  };
}

/** Plays ticks until a new match began (`match_reset`), at most `limit` ticks. */
export function untilReset(t: ReturnType<typeof place>, limit = 2000): void {
  let reset = false;
  t.session.bus.on('match_reset', () => {
    reset = true;
  });
  for (let i = 0; i < limit && !reset; i++) t.tick(100);
  if (!reset) throw new Error('no new match');
}
