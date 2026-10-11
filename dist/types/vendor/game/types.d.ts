import type { Action } from '../contracts/index.js';
/**
 * A match's phases. The match component runs them from an ordered list per game (see
 * `phaseSteps`), so a later game adds its own (a shooter's buy phase) without a closed switch.
 */
export type Phase = 'waiting' | 'countdown' | 'playing' | 'results';
export type TeamName = 'red' | 'blue';
export type Winner = {
    kind: 'player';
    id: string;
} | {
    kind: 'team';
    team: TeamName;
} | null;
export interface SpawnSpot {
    x: number;
    y: number;
    z: number;
    team: TeamName | 'any';
}
/** A point in the world (server-authoritative player positions). */
export interface Position {
    x: number;
    y: number;
    z: number;
}
/** Where a player is now, as the server knows it; null when unknown (not connected, no body). */
export type PositionsProvider = (id: string) => Position | null;
/** The tool behind a loadout item; null for an item that is not a tool (the session ignores it). */
export type ToolLookup = (itemId: string) => MeleeTool | null;
/**
 * What happens in a game. Components talk only through these (decision 117); the room forwards
 * some of them to clients, and scripts (P2-10) will listen to the same bus.
 */
export type GameEvent = {
    type: 'phase_changed';
    phase: Phase;
    endsAt: number | null;
}
/** The match's clock ran out while playing; the win component names the winner. */
 | {
    type: 'time_up';
}
/** Results are over: every component clears its part of the rows for the next match. */
 | {
    type: 'match_reset';
}
/** Testing alone (the studio's Test game) turned on or off. */
 | {
    type: 'solo_changed';
    on: boolean;
}
/** `returning`: a player who left mid-match came back to their row. */
 | {
    type: 'player_joined';
    id: string;
    team: TeamName | null;
    returning: boolean;
} | {
    type: 'player_left';
    id: string;
} | {
    type: 'team_changed';
    id: string;
    team: TeamName;
}
/** A player's body goes to `at` (match start, joining mid-match, a new team); the room moves it. */
 | {
    type: 'placed';
    id: string;
    at: SpawnSpot;
}
/** A player used their tool (an accepted strike); clients show it on the striking player. */
 | {
    type: 'struck';
    id: string;
}
/** `by` is null for damage without an attacker (zones, falls). */
 | {
    type: 'hit';
    victim: string;
    by: string | null;
    damage: number;
    health: number;
} | {
    type: 'died';
    victim: string;
    by: string | null;
}
/** A knocked-out player is back at `at`; the room moves the body there. */
 | {
    type: 'respawned';
    id: string;
    at: SpawnSpot;
} | {
    type: 'score_changed';
    id: string;
    score: number;
} | {
    type: 'match_won';
    winner: Winner;
}
/** A player's trusted position moved into an area zone (`zone` is the instance id, `tag` its tag). */
 | {
    type: 'zone_entered';
    id: string;
    zone: string;
    tag: string;
} | {
    type: 'zone_exited';
    id: string;
    zone: string;
    tag: string;
}
/** A player moved through a gate zone in its direction of travel. */
 | {
    type: 'zone_crossed';
    id: string;
    zone: string;
    tag: string;
}
/** A counter changed; `id` is the player for a player counter, null for a team or global one. */
 | {
    type: 'counter_changed';
    name: string;
    value: number;
    id: string | null;
}
/** A rule's `emit` action: a designer-named event other rules can listen for; `id` is its actor. */
 | {
    type: 'custom';
    name: string;
    id: string | null;
}
/** A timer a rule started ran out; `id` is the actor of that rule (null for none). */
 | {
    type: 'timer_fired';
    name: string;
    id: string | null;
}
/** A rule shows `text` to one player (`id`), or to everyone (null). */
 | {
    type: 'message';
    id: string | null;
    text: string;
}
/** A player says a voice line (the `say` action; lip sync, P2-44). */
 | {
    type: 'said';
    id: string;
    line: string;
}
/** A player got on a rideable item (`item` is its instance id, `tag` its ride tag, '' for none; seats from 1). */
 | {
    type: 'mounted';
    id: string;
    item: string;
    tag: string;
    seat: number;
}
/** A player got off a rideable item. */
 | {
    type: 'dismounted';
    id: string;
    item: string;
    tag: string;
}
/** The room moved a player's body (a seat, an exit spot, a correction): zones forget the last sample. */
 | {
    type: 'relocated';
    id: string;
}
/** A rule's `dismount`: the room gets the player off (at the item's exit spot). */
 | {
    type: 'dismount_requested';
    id: string;
}
/** A rule's `set_speed`: the room scales the player's top speed by `factor` until `until` (server ms). */
 | {
    type: 'speed_requested';
    id: string;
    factor: number;
    until: number;
};
/** One row of the scoreboard; each component owns its own fields. */
export interface PlayerView {
    /** Teams. */
    team: TeamName | null;
    /** Health. */
    health: number;
    alive: boolean;
    deaths: number;
    /** Respawn: no damage before this time (spawn protection). */
    protectedUntil: number;
    /** Respawn: when a knocked-out player comes back (server ms); null when not waiting. */
    respawnAt: number | null;
    /** Score. */
    score: number;
    kills: number;
    /** Loadout: the items this player carries, and the one in hand ('' for none). */
    items: string[];
    tool: string;
    /** The session: false for a player who left mid-match (they keep their row until it ends). */
    present: boolean;
    /** Ranking: the live place, 1 is first (0 when the game has no ranking). */
    place: number;
    /** Counters: this player's own counters by name (those declared with scope player). */
    counters: Record<string, number>;
}
export interface MeleeTool {
    damage: number;
    reach: number;
    arcDeg: number;
    cooldownSec: number;
}
/** Ground position and facing; forward = (sin yaw, cos yaw). */
export interface Pose {
    x: number;
    z: number;
    yaw: number;
}
export type AttackResult = 'ok' | 'cooldown' | 'not_playing' | 'dead' | 'no_tool';
/** A copy of the session's state; changing it changes nothing in the session. */
export interface SessionView {
    phase: Phase;
    endsAt: number | null;
    players: ReadonlyMap<string, Readonly<PlayerView>>;
    teamScores: {
        red: number;
        blue: number;
    };
    winner: Winner;
    /** Counters: the team-scope and global-scope values by name. */
    teamCounters: Record<TeamName, Record<string, number>>;
    globalCounters: Record<string, number>;
}
/** A zone placed in the world: an area (a box) or a gate (a line crossed in one direction). */
export interface ZoneSpec {
    /** The instance id, unique in the place. */
    id: string;
    shape: 'area' | 'gate';
    tag: string;
    x: number;
    y: number;
    z: number;
    /** Facing: forward is (sin yaw, cos yaw); a gate is crossed along it. */
    yaw: number;
    /** The full size across the facing, in metres. */
    width: number;
    /** The full size along the facing, in metres (an area; a gate has none). */
    depth: number;
}
/**
 * Creator scripts (P2-10) as the session sees them: a listener on the bus that hears events after every component
 * and the rules, and can only ask for the rules' actions through `ScriptSessionApi.act`. `@genvr/script` implements
 * it; the session stays free of WASM.
 */
export interface ScriptHost {
    /** Event types to subscribe to (`custom` for custom names); read once at session start, after the rules attached. */
    readonly events: ReadonlyArray<GameEvent['type']>;
    /** Called once when the session is built, before the first match starts (the host may run its top levels here). */
    attach?(api: ScriptSessionApi): void;
    /** One event, within the rules' chain limit. */
    hear(event: GameEvent, api: ScriptSessionApi): void;
    /** A new match began (`match_reset`): rebuild the scripts' state. */
    matchReset(): void;
}
/** What a script host may do with the session: generic reads and the rules' actions, nothing else. */
export interface ScriptSessionApi {
    /**
     * Runs one of the rules' actions for `actor` through the shared `ActionRunner` (same budgets as the rules); false
     * when refused (over a budget, or no event is being delivered).
     */
    act(action: Action, actor: string | null): boolean;
    view(): SessionView;
    /** Server ms of the call being handled. */
    now(): number;
    zones(): ReadonlyArray<ZoneSpec>;
    ridingOf(id: string): {
        item: string;
        tag: string;
    } | null;
    actorOf(event: GameEvent): string | null;
    /** Server ms when the current match began (session start or the last `match_reset`). */
    matchStartedAt(): number;
    /** A counter's value for a player, a team or everyone (null when the game does not declare it in that scope). */
    counter(name: string, of: {
        player: string;
    } | {
        team: TeamName;
    } | 'global'): number | null;
    /** The scope of a counter the game declares, or null when it declares none of that name. */
    counterScope(name: string): 'player' | 'team' | 'global' | null;
    /**
     * Whether `event` is a follow-up: raised while another event was being delivered (by the rules, a script or a
     * component reacting), not by a call into the session (a join, a tick, a hit). A dry run replays only the latter.
     */
    caused(event: GameEvent): boolean;
}
