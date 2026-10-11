import {
  SCRIPT_LIMITS,
  type Game,
  type PlaceScript,
  type ScriptRecording,
  type ScriptTestEvent,
  type WorldDocument,
} from '@genvr/contracts';
import { getLibraryItem } from '@genvr/core-library';
import { GameSession, type GameEvent, type Position, type SpawnSpot, type ZoneSpec } from '@genvr/game';
import type { ScriptLogLine } from './log.js';
import { spawnSpots, zonesOf } from './place.js';
import { ScriptRunner, type ScriptRequest, type ScriptStatus } from './runner.js';
import { createScriptModule, type ScriptModule } from './sandbox.js';

declare const performance: { now(): number };

export interface DryRunInput {
  /** The place: its game, zones and spawn points are read as the room reads them, unless given below. */
  doc?: WorldDocument;
  game?: Game;
  zones?: ZoneSpec[];
  /** Where players start (the place's spawn points); one at the origin when left out. */
  spawns?: SpawnSpot[];
  /** The scripts of the place (with an unsaved draft in place of its saved text, when testing a draft). */
  scripts: PlaceScript[];
  /** Run only this script (by id); it runs even when switched off. All enabled scripts when left out. */
  only?: string;
  /** Players joined at the start when the events have no `player_joined` (1 to 8, default 2). */
  players?: number;
  /** Events to replay, at most `SCRIPT_LIMITS.testEvents`. */
  events?: ScriptTestEvent[];
  /** A room's recording (`/internal/script-recording`): its follow-ups are raised again, not replayed. */
  recording?: ScriptRecording;
  /** The match seed (a recording brings its own). */
  seed?: number;
  /** A module to use instead of a fresh one (tests); the dry run never disposes a module it was given. */
  module?: ScriptModule;
  /** Wall time the replay may take (default `SCRIPT_LIMITS.dryRunMs`); tests pass less. */
  wallMs?: number;
}

export interface DryRunResult {
  /** Every action a script asked for, in order, accepted or refused and why. */
  requested: ScriptRequest[];
  /** Events that could not be replayed, with why (by their index in the input). */
  skipped: Array<{ index: number; type: string; why: string }>;
  /** Counters after the run: players by handle, teams, and everyone's. */
  counters: {
    players: Record<string, Record<string, number>>;
    teams: Record<string, Record<string, number>>;
    global: Record<string, number>;
  };
  /** Handles of the players who took part, in join order. */
  players: string[];
  /** The match phase at the end, and the dry run's clock in ms since it started. */
  phase: string;
  now: number;
  log: ScriptLogLine[];
  /** Interrupt ticks the scripts used (deterministic for the same code and events). */
  ticks: number;
  status: ScriptStatus[];
  /** Set when the replay stopped on its wall-time cap before the last event (second review, critical 1). */
  stopped?: string;
}

/** The room's game tick (realtime `GAME_TICK_MS`). */
const TICK = 100;
/** Ticks a dry run may take in all: one hour of the script clock. */
const MAX_TICKS = 36_000;
/** How far before and after a zone a replayed move starts and ends (metres). */
const STEP = 2;
const MAX_PLAYERS = 8;
/** Events the engine raises by itself: given ones are refused, recorded ones are raised again by the clock. */
const ENGINE_RAISED: ReadonlySet<string> = new Set([
  'phase_changed',
  'time_up',
  'counter_changed',
  'timer_fired',
  'respawned',
]);

/**
 * The dry-run harness (spec 12): the place's scripts in a fresh module on a real `GameSession` built from the place's
 * game, with synthetic players (handles `p1`, `p2`, ... in join order). Events become the session calls the room
 * makes: a join, a leave, a move through a zone judged by the zones component itself, a hit, getting on and off, and
 * ticks of 100 ms to their time. The same runner and session as the room, so the same events and seed request the
 * same actions. Nothing is saved.
 */
export async function dryRun(input: DryRunInput): Promise<DryRunResult> {
  const recorded = input.recording;
  const events: Array<ScriptTestEvent & { caused?: boolean }> = recorded
    ? recorded.events.map((event, i) => ({
        ...event,
        ...(recorded.at?.[i] === undefined ? {} : { at: recorded.at[i] }),
        ...(recorded.caused?.[i] ? { caused: true } : {}),
      }))
    : (input.events ?? []);
  if (!recorded && events.length > SCRIPT_LIMITS.testEvents)
    throw new Error(`a dry run takes at most ${SCRIPT_LIMITS.testEvents} events`);
  const game = input.game ?? input.doc?.game;
  if (!game) throw new Error('the place has no game; scripts run only in places with a game');
  const place = {
    game,
    zones: input.zones ?? (input.doc ? zonesOf(input.doc) : []),
    spawns: input.spawns ?? (input.doc ? spawnSpots(input.doc) : []),
  };
  const players = input.players ?? 2;
  if (!Number.isInteger(players) || players < 1 || players > MAX_PLAYERS)
    throw new Error(`a dry run has 1 to ${MAX_PLAYERS} players`);

  const scripts = input.only
    ? input.scripts.filter((s) => s.id === input.only).map((s) => ({ ...s, enabled: true }))
    : input.scripts;
  if (input.only && scripts.length === 0) throw new Error(`no script ${input.only}`);
  const seed = recorded?.seed ?? input.seed ?? 1;

  const module = input.module ?? (await createScriptModule());
  const log: ScriptLogLine[] = [];
  const requested: ScriptRequest[] = [];
  const runner = new ScriptRunner(scripts, {
    placeSeed: 'dry-run',
    seed,
    module,
    onLog: (line) => log.push(line),
    onRequest: (request) => requested.push(request),
  });
  try {
    return replay(place, Boolean(recorded), events, players, runner, {
      log,
      requested,
      wallMs: input.wallMs ?? SCRIPT_LIMITS.dryRunMs,
    });
  } finally {
    runner.dispose();
    if (!input.module) module.dispose();
  }
}

function replay(
  input: { game: Game; zones: ZoneSpec[]; spawns: SpawnSpot[] },
  fromRecording: boolean,
  events: Array<ScriptTestEvent & { caused?: boolean }>,
  players: number,
  runner: ScriptRunner,
  out: { log: ScriptLogLine[]; requested: ScriptRequest[]; wallMs: number },
): DryRunResult {
  // The replay runs synchronously on its caller's thread (the API's event loop): it stops on a wall-time cap.
  const deadline = performance.now() + out.wallMs;
  let stopped: string | undefined;
  const overCap = () => {
    if (stopped !== undefined) return true;
    if (performance.now() <= deadline) return false;
    stopped = `the dry run stopped after ${out.wallMs} ms of wall time (at ${(now / 1000).toFixed(1)} s of the match clock); test fewer events or a shorter time`;
    runner.switchOff('the dry run stopped on its time limit');
    out.log.push({ at: now, script: '', level: 'off', text: stopped });
    return true;
  };
  const positions = new Map<string, Position>();
  const spawns = input.spawns.length ? input.spawns : [{ x: 0, y: 0, z: 0, team: 'any' as const }];
  const start = spawns[0]!;
  let now = 0;
  let ticks = 0;
  const session = new GameSession(input.game, spawns, now, {
    positions: (id) => positions.get(id) ?? null,
    tools: (itemId) => getLibraryItem(itemId)?.manifest.tool ?? null,
    leaveGraceMs: 0,
    zones: input.zones,
    log: () => {},
    scripts: runner,
  });
  const bus = session.bus;
  // What the room's hooks do: bodies move to spawns, the knocked out and those a rule asks get off.
  const move = (event: { id: string; at: SpawnSpot }) =>
    positions.set(event.id, { x: event.at.x, y: event.at.y, z: event.at.z });
  bus.on('placed', move);
  bus.on('respawned', move);
  const getOff = (id: string) => {
    if (session.ridingOf(id)) session.dismount(id, now);
  };
  bus.on('died', (event) => getOff(event.victim));
  bus.on('dismount_requested', (event) => getOff(event.id));
  const zoneEvents: GameEvent[] = [];
  for (const type of ['zone_entered', 'zone_exited', 'zone_crossed'] as const)
    bus.on(type, (event) => zoneEvents.push(event));

  // Players: handle pK is the K-th to join (the runner numbers them in join order, too).
  const ids: string[] = [];
  const idOf = (handle: string | null | undefined) => {
    if (!handle) return undefined;
    const n = /^p(\d+)$/.exec(handle);
    return n ? ids[Number(n[1]) - 1] : undefined;
  };
  const present = (id: string) => session.view().players.get(id)?.present === true;

  const tick = () => {
    if (ticks >= MAX_TICKS || overCap()) return false;
    ticks += 1;
    now += TICK;
    session.tick(now);
    return true;
  };
  const advanceTo = (at: number | undefined) => {
    if (at === undefined) return;
    while (now + TICK <= at && tick());
    if (now < at && ticks < MAX_TICKS && stopped === undefined) now = at;
  };
  const join = (id: string) => {
    if (!positions.has(id)) positions.set(id, { x: start.x, y: start.y, z: start.z });
    session.join(id, now);
  };

  const joins = events.some((event) => event.type === 'player_joined' && !event.caused);
  if (!joins)
    for (let k = 1; k <= players; k += 1) {
      ids.push(`dry-${k}`);
      join(`dry-${k}`);
    }
  // A place that needs more players than the dry run has plays as a lone tester would (solo).
  const expected = joins
    ? new Set(events.flatMap((e) => (e.type === 'player_joined' ? [e.id] : []))).size
    : players;
  if (expected < input.game.match.minPlayers) session.setSolo(true, now);

  const timed = events.some((event) => event.at !== undefined);
  let playing = timed;
  const ensurePlaying = () => {
    if (playing) return;
    playing = true;
    for (let i = 0; i < 1000 && session.view().phase !== 'playing'; i += 1) if (!tick()) break;
  };

  const skipped: DryRunResult['skipped'] = [];
  events.forEach((event, index) => {
    const refuse = (why: string) => skipped.push({ index, type: event.type, why });
    if (event.caused || overCap()) return;
    if (ENGINE_RAISED.has(event.type)) {
      if (!fromRecording)
        refuse('the engine raises this event itself; give later times (at) and let the clock raise it');
      return;
    }
    if (event.type !== 'player_joined') ensurePlaying();
    const known = (handle: string | null | undefined, what = 'player') => {
      const id = idOf(handle);
      if (id === undefined) refuse(`unknown ${what} handle "${handle}" (players here: ${handles(ids)})`);
      return id;
    };
    switch (event.type) {
      case 'player_joined': {
        advanceTo(event.at);
        const id = idOf(event.id);
        if (id === undefined) {
          const next = `p${ids.length + 1}`;
          if (event.id !== next)
            return refuse(`handles are given in join order: the next new player is ${next}`);
          ids.push(`dry-${ids.length + 1}`);
          join(ids[ids.length - 1]!);
          return;
        }
        if (present(id)) return refuse(`${event.id} is already here`);
        join(id);
        return;
      }
      case 'player_left': {
        const id = known(event.id);
        if (id === undefined) return;
        advanceTo(event.at);
        if (!present(id)) return refuse(`${event.id} is not here`);
        session.leave(id, now);
        return;
      }
      case 'zone_entered':
      case 'zone_exited':
      case 'zone_crossed': {
        const id = known(event.id);
        if (id === undefined) return;
        if (!present(id)) return refuse(`${event.id} is not here`);
        const shape = event.type === 'zone_crossed' ? 'gate' : 'area';
        const zone =
          input.zones.find((z) => z.id === event.zone && z.shape === shape) ??
          input.zones.find((z) => z.tag === event.tag && z.shape === shape);
        if (!zone)
          return refuse(`the place has no zone ${shape} "${event.zone}" or with the tag "${event.tag}"`);
        if (event.at !== undefined) advanceTo(event.at - 2 * TICK);
        const [from, to] = passage(zone, event.type);
        // The room moves nobody between two ticks without judging it; a jump to the start of the move is a relocation.
        positions.set(id, from);
        session.relocated(id, now);
        tick();
        zoneEvents.length = 0;
        positions.set(id, to);
        tick();
        const happened = zoneEvents.some(
          (z) => z.type === event.type && 'id' in z && z.id === id && 'zone' in z && z.zone === zone.id,
        );
        if (!happened)
          refuse(
            `the zone did not count the move (zones are judged while playing; the phase is ${session.view().phase})`,
          );
        return;
      }
      case 'hit':
      case 'died': {
        const victim = known(event.victim);
        if (victim === undefined) return;
        const by = event.by === null ? null : known(event.by);
        if (by === undefined) return;
        advanceTo(event.at);
        const row = session.view().players.get(victim);
        if (!row?.present) return refuse(`${event.victim} is not here`);
        if (!row.alive) {
          // A recorded death follows the hit that caused it: the replayed hit already did it.
          if (event.type === 'died' && fromRecording) return;
          return refuse(`${event.victim} is already knocked out`);
        }
        session.damage(victim, event.type === 'hit' ? event.damage : row.health, by, now);
        return;
      }
      case 'mounted': {
        const id = known(event.id);
        if (id === undefined) return;
        advanceTo(event.at);
        if (!present(id)) return refuse(`${event.id} is not here`);
        session.mount(id, event.item, event.tag, event.seat, now);
        return;
      }
      case 'dismounted': {
        const id = known(event.id);
        if (id === undefined) return;
        advanceTo(event.at);
        if (!session.ridingOf(id)) return refuse(`${event.id} rides nothing`);
        session.dismount(id, now);
        return;
      }
      case 'custom': {
        const id = event.id === null ? null : known(event.id);
        if (id === undefined) return;
        advanceTo(event.at);
        // As if a rule raised it: a top-level event the rules and scripts hear.
        bus.emit({ type: 'custom', name: event.name, id });
        bus.flush();
        return;
      }
    }
  });

  const view = session.view();
  const handleOf = (id: string) => `p${ids.indexOf(id) + 1}`;
  const status = runner.status();
  return {
    requested: out.requested,
    skipped,
    counters: {
      players: Object.fromEntries([...view.players].map(([id, row]) => [handleOf(id), { ...row.counters }])),
      teams: { red: { ...view.teamCounters.red }, blue: { ...view.teamCounters.blue } },
      global: { ...view.globalCounters },
    },
    players: ids.map(handleOf),
    phase: view.phase,
    now,
    log: out.log,
    ticks: status.reduce((sum, s) => sum + s.ticks, 0),
    status,
    ...(stopped === undefined ? {} : { stopped }),
  };
}

const handles = (ids: string[]) => (ids.length ? ids.map((_, i) => `p${i + 1}`).join(', ') : 'none');

/** Where a move through a zone starts and ends: through a gate along its facing, into or out of an area. */
function passage(
  zone: ZoneSpec,
  type: 'zone_entered' | 'zone_exited' | 'zone_crossed',
): [Position, Position] {
  const fx = Math.sin(zone.yaw);
  const fz = Math.cos(zone.yaw);
  const at = (d: number): Position => ({ x: zone.x + fx * d, y: zone.y, z: zone.z + fz * d });
  if (type === 'zone_crossed') return [at(-STEP), at(STEP)];
  const outside = at(-(zone.depth / 2 + STEP));
  const inside = at(0);
  return type === 'zone_entered' ? [outside, inside] : [inside, outside];
}
