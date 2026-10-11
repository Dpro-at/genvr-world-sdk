import type { Game } from '@genvr/contracts';
import { CountersComponent } from './components/counters.js';
import { HealthComponent } from './components/health.js';
import { LoadoutComponent } from './components/loadout.js';
import { MatchComponent } from './components/match.js';
import { PlacementComponent } from './components/placement.js';
import { RankingComponent } from './components/ranking.js';
import { RespawnComponent } from './components/respawn.js';
import { RidingComponent } from './components/riding.js';
import { ActionRunner, actorOf } from './components/actions.js';
import { RulesComponent } from './components/rules.js';
import { ScoreComponent } from './components/score.js';
import { TeamsComponent } from './components/teams.js';
import { teamScores, WinComponent } from './components/win.js';
import { ZonesComponent } from './components/zones.js';
import { newRow, type GameContext } from './context.js';
import { EventBus } from './events.js';
import { pickSpawn } from './spawn.js';
import type {
  AttackResult, GameEvent, MeleeTool, PositionsProvider, ScriptHost, ScriptSessionApi, SessionView, SpawnSpot, ToolLookup, Winner,
  ZoneSpec,
} from './types.js';

export interface SessionOptions {
  /** Where each player is now (server-authoritative); used to spawn away from opponents. */
  positions?: PositionsProvider;
  /** The tool behind a loadout item; without it every item counts as a tool. */
  tools?: ToolLookup;
  /** Ms before "last one standing" ends a match after a leave (0, the default: at once). */
  leaveGraceMs?: number;
  /** The place's zones (areas and gates); none by default. */
  zones?: ZoneSpec[];
  /** Where problems with the game's data are reported (default: console.warn). */
  log?: (message: string) => void;
  /** Creator scripts (P2-10): they hear events after the rules and request the rules' actions. */
  scripts?: ScriptHost;
}

declare const console: { warn(message: string): void };

const anyTool: ToolLookup = () => ({ damage: 0, reach: 0, arcDeg: 0, cooldownSec: 0 });

/**
 * One game: composes the rule components the game's keys turn on and wires them to one event bus.
 * Its methods are the only way in; each applies a change, then delivers the events it raised.
 * Time comes from the caller (`now`, server ms), positions from the injected provider.
 */
export class GameSession {
  readonly #ctx: GameContext;
  readonly #match: MatchComponent;
  readonly #teams: TeamsComponent;
  readonly #health: HealthComponent;
  readonly #respawn: RespawnComponent;
  readonly #loadout: LoadoutComponent;
  readonly #zones: ZonesComponent;
  readonly #counters: CountersComponent;
  readonly #ranking: RankingComponent | null;
  readonly #win: WinComponent | null;
  /** The rules' and scripts' actions, budgets and timers; null with neither rules nor scripts. */
  readonly #actions: ActionRunner | null;
  readonly #riding: RidingComponent;
  /** Server ms when the current match began. */
  #matchStartedAt: number;
  /** The winner of this match (every decider raises `match_won` at most once per match). */
  #winner: Winner = null;

  constructor(game: Game, spawns: SpawnSpot[], now: number, options: SessionOptions = {}) {
    const bus = new EventBus();
    this.#ctx = {
      game,
      bus,
      players: new Map(),
      positions: options.positions ?? (() => null),
      tools: options.tools ?? anyTool,
      leaveGraceMs: options.leaveGraceMs ?? 0,
      log: options.log ?? ((message) => console.warn(message)),
      now,
      phase: 'waiting',
      endsAt: null,
      decided: false,
      solo: false,
      spawns,
      zones: options.zones ?? [],
      riding: new Map(),
    };
    this.#matchStartedAt = now;
    // A new match drops the rows of players who left; the components then reset their fields.
    bus.on('match_reset', () => {
      this.#matchStartedAt = this.#ctx.now;
      for (const [id, row] of this.#ctx.players) if (!row.present) this.#ctx.players.delete(id);
      this.#ctx.decided = false;
      this.#winner = null;
    });
    // One decision per match: cleared when play starts, before any component hears it.
    bus.on('phase_changed', (event) => {
      if (event.phase === 'playing') {
        this.#ctx.decided = false;
        this.#winner = null;
      }
    });
    bus.on('match_won', (event) => {
      this.#winner = event.winner;
    });
    // Order matters where listeners share an event: teams even out before placement at play start.
    // With a ranking, a match the clock ends undecided goes to the first-ranked player (if anyone moved).
    this.#match = new MatchComponent(this.#ctx, () => this.#ranking?.leader() ?? null);
    this.#teams = new TeamsComponent(this.#ctx);
    this.#health = new HealthComponent(this.#ctx);
    this.#respawn = new RespawnComponent(this.#ctx);
    new PlacementComponent(this.#ctx);
    this.#loadout = new LoadoutComponent(this.#ctx);
    this.#zones = new ZonesComponent(this.#ctx);
    this.#counters = new CountersComponent(this.#ctx);
    this.#riding = new RidingComponent(this.#ctx);
    this.#ranking = game.ranking ? new RankingComponent(this.#ctx) : null;
    new ScoreComponent(this.#ctx);
    this.#win = game.win ? new WinComponent(this.#ctx) : null;
    // Last, so a rule hears an event after the components above have applied it, and a script after the rules.
    const rules = Boolean(game.rules?.length);
    this.#actions =
      rules || options.scripts
        ? new ActionRunner(this.#ctx, { counters: this.#counters, health: this.#health, ranking: this.#ranking })
        : null;
    if (rules) new RulesComponent(this.#ctx, this.#actions!);
    if (options.scripts) this.#attachScripts(options.scripts, this.#actions!);
    this.#run(now, () => this.#match.start());
  }

  get bus(): EventBus {
    return this.#ctx.bus;
  }

  /** A player already here is left alone; one who left mid-match comes back to their row. */
  join(id: string, now: number): void {
    this.#run(now, () => {
      const existing = this.#ctx.players.get(id);
      if (existing?.present) return;
      if (existing) existing.present = true;
      else {
        this.#ctx.players.set(id, newRow());
        this.#teams.assign(id);
      }
      this.bus.emit({ type: 'player_joined', id, team: this.#ctx.players.get(id)!.team, returning: Boolean(existing) });
    });
  }

  /** During play and the results a leaver keeps their row (score, winner, place) until the next match. */
  leave(id: string, now: number): void {
    this.#run(now, () => {
      const player = this.#ctx.players.get(id);
      if (!player) return;
      if (this.#ctx.phase === 'playing' || this.#ctx.phase === 'results') player.present = false;
      else this.#ctx.players.delete(id);
      this.bus.emit({ type: 'player_left', id });
    });
  }

  setSolo(on: boolean, now: number): void {
    this.#run(now, () => {
      if (this.#ctx.solo === on) return;
      this.#ctx.solo = on;
      this.bus.emit({ type: 'solo_changed', on });
    });
  }

  tick(now: number): void {
    this.#run(now, () => this.#respawn.tick());
    this.#run(now, () => this.#win?.tick());
    this.#run(now, () => this.#zones.tick());
    this.#run(now, () => this.#actions?.tick());
    this.#run(now, () => this.#match.tick());
  }

  /**
   * A strike of the tool in hand reaching `targets` (the caller finds them from the positions it
   * trusts). Each target is one change: a goal reached by the first ends the match before the next.
   */
  attack(id: string, tool: MeleeTool, targets: string[], now: number): AttackResult {
    this.#ctx.now = now;
    const attacker = this.#ctx.players.get(id);
    if (this.#ctx.phase !== 'playing' || !attacker?.present) return 'not_playing';
    if (!attacker.alive) return 'dead';
    if (!attacker.tool) return 'no_tool';
    const result = this.#loadout.use(id, tool);
    if (result !== 'ok') return result;
    this.#run(now, () => this.bus.emit({ type: 'struck', id }));
    for (const target of targets)
      this.#run(now, () => {
        if (this.#teams.canHurt(id, target)) this.#health.damage(target, tool.damage, id);
      });
    return 'ok';
  }

  /** Harm without a strike (zones, falls later); `by` is null when nobody caused it. */
  damage(victim: string, amount: number, by: string | null, now: number): void {
    this.#run(now, () => this.#health.damage(victim, amount, by));
  }

  /** The counters of this game (the rules interpreter reads and changes them). */
  get counters(): CountersComponent {
    return this.#counters;
  }

  /** The tool in a player's hand, or null (none, or the item is not a tool). */
  toolOf(id: string): MeleeTool | null {
    return this.#loadout.toolOf(id);
  }

  /** The place's spawn points changed (a builder moved one): later spawns use the new ones. */
  setSpawns(spawns: SpawnSpot[]): void {
    this.#ctx.spawns = spawns;
  }

  /** The place's zones changed (a builder moved one): they are judged as given from the next tick. */
  setZones(zones: ZoneSpec[]): void {
    this.#ctx.zones = zones;
  }

  /** Where a player would come back, away from the given opponent positions. */
  respawnSpot(id: string, opponents: Array<{ x: number; z: number }>): SpawnSpot | null {
    return pickSpawn(this.#ctx.spawns, this.#ctx.players.get(id)?.team ?? null, opponents);
  }

  /** Whether a player is knocked out during play (a cheap check, without copying the view). */
  isDown(id: string): boolean {
    const row = this.#ctx.players.get(id);
    return this.#ctx.phase === 'playing' && row !== undefined && row.present && !row.alive;
  }

  /**
   * A player got on a rideable item (the room checked it): `item` is its instance id, `tag` its ride
   * tag ('' for none), `seat` from 1. Only for a player who is here.
   */
  mount(id: string, item: string, tag: string, seat: number, now: number): void {
    this.#run(now, () => this.#riding.mount(id, item, tag, seat));
  }

  /** A player got off what they ride (nothing when they ride nothing). */
  dismount(id: string, now: number): void {
    this.#run(now, () => this.#riding.dismount(id));
  }

  /** The room moved a player's body itself (a seat, an exit spot, a correction): no zone judges the jump. */
  relocated(id: string, now: number): void {
    this.#run(now, () => this.bus.emit({ type: 'relocated', id }));
  }

  /** What a player rides (instance id and ride tag), or null. */
  ridingOf(id: string): { item: string; tag: string } | null {
    const riding = this.#ctx.riding.get(id);
    return riding ? { ...riding } : null;
  }

  /** A copy of the state; changing it changes nothing here. */
  view(): SessionView {
    const players = new Map(
      [...this.#ctx.players].map(([id, row]) => [id, { ...row, items: [...row.items], counters: { ...row.counters } }]),
    );
    return { phase: this.#ctx.phase, endsAt: this.#ctx.endsAt, players,
             teamScores: teamScores(this.#ctx), winner: this.#winner,
             teamCounters: this.#counters.teamValues(), globalCounters: this.#counters.globalValues() };
  }

  /** Subscribes a script host after the rules; it hears only events within the rules' chain limit. */
  #attachScripts(host: ScriptHost, actions: ActionRunner): void {
    const ctx = this.#ctx;
    const api: ScriptSessionApi = {
      act: (action, actor) => actions.run(action, actor),
      view: () => this.view(),
      now: () => ctx.now,
      zones: () => ctx.zones.map((zone) => ({ ...zone })),
      ridingOf: (id) => this.ridingOf(id),
      actorOf,
      matchStartedAt: () => this.#matchStartedAt,
      counter: (name, of) => actions.read(name, of, null),
      counterScope: (name) => (ctx.game.counters ?? []).find((c) => c.name === name)?.scope ?? null,
      caused: (event) => ctx.bus.traceOf(event).root !== event,
    };
    host.attach?.(api);
    for (const type of new Set(host.events))
      ctx.bus.on(type, (event: GameEvent) => {
        if (actions.allowed(event)) host.hear(event, api);
      });
    ctx.bus.on('match_reset', () => host.matchReset());
  }

  /** Applies one change at time `now`, then delivers the events it raised. */
  #run(now: number, change: () => void): void {
    this.#ctx.now = now;
    change();
    this.#ctx.bus.flush();
  }
}
