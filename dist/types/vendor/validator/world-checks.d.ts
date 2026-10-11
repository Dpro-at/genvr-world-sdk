import { type CommandPayload, type Game, type ItemInstance, type PlacementRules, type WorldDocument } from '../contracts/index.js';
import { type FloorSurface } from './geometry.js';
import { SurfaceIndex, type RestShape } from './rest/index.js';
export { worldBox } from './geometry.js';
export { repairGame } from './game-repair.js';
/** A door cut into a wall (the runtime and the API compute them with `doorSpots`). */
export interface WorldDoor {
    wallId: string;
    openingId: string;
    x: number;
    z: number;
    sill: number;
    normal: readonly [number, number];
    width: number;
}
/** What the validator needs to know about the world beyond the document (the runtime answers). */
export interface WorldEnvironment {
    /** Terrain height at a point. */
    groundAt(x: number, z: number): number;
    /**
     * Highest surface at or below `fromY` at a point: ground, water, roads, floors, or the top of
     * another item (never the item `ignore` itself).
     */
    supportBelow(x: number, z: number, fromY: number, ignore: string): number;
    /** Water surface at a point, or null where there is no water. */
    waterAt?(x: number, z: number): number | null;
    /** Local box of an item type, whether it blocks the player, and whether it is a building part. */
    itemShape(itemId: string): {
        min: readonly [number, number, number];
        max: readonly [number, number, number];
        /**
         * What a player bumps into, where that is much smaller than the box (a tree's trunk, not its
         * crown). Overlaps and the spawn are checked with it; resting uses the whole box.
         */
        blocks?: {
            min: readonly [number, number, number];
            max: readonly [number, number, number];
        };
        solid: boolean;
        /** Basic parts and grid blocks are made to overlap or touch; they are not reported. */
        part: boolean;
        /** The item type is made to hang in the air (manifest `physics.floats`). */
        floats?: boolean;
        /** Players climb it (manifest `physics.climbable`): ladders lead up to their top. */
        climbable?: boolean;
    } | null;
    /** The item's display name (Core Library or package), if known. */
    itemName?(itemId: string): string | null;
    /** Triangles of one copy of an item type, if known (performance budget). */
    itemTriangles?(itemId: string): number | null;
    /** Ground steeper than `degrees` allows, one spot per area (the terrain's `steepCells`). */
    steepCells?(degrees: number): Array<{
        x: number;
        z: number;
        degrees: number;
    }>;
    /** Doors cut into walls. */
    doors?(): WorldDoor[];
    /** Placement rules of an item type (manifest `placement`, P2-11), or null for none. */
    itemRules?(itemId: string): PlacementRules | null;
    /** Soil of the ground at a point (grass, dirt, sand, rock, snow, mud). */
    soilAt?(x: number, z: number): string;
    /** Room floors (closed walls), for walking checks. */
    floors?(): readonly FloorSurface[];
    /** Solid wall blocks around doors and windows (`wallBoxes` of `@genvr/world`), for walking checks. */
    wallBoxes?(): readonly WallBlock[];
    /**
     * The rest law's shape for an item type: its box and how it rests (P2-43). When given, floating,
     * buried and slope findings are judged against the law (`rest`) instead of the older box test;
     * without it, callers keep the box test below.
     */
    restShape?(itemId: string): RestShape | null;
    /**
     * Everything the world scatters that is not in the document (woods, painted cover, P2-43): not
     * one finding per tree, but one alarm finding for however many are in the air, since that always
     * means the law or the drawing broke, not something a creator did.
     */
    scattered?(): ItemInstance[];
    /**
     * The rest law's own surface index for this place (P2-43 final review, C1): with it, the checks
     * ask exactly what the law asked when it placed things (bridge decks, the law's item shapes);
     * without it, `validateWorld` builds one from the functions above.
     */
    surfaces?(): SurfaceIndex;
    /** How the place is played (side view turns riding off); free when not given. */
    playView?: 'free' | 'side';
    /** Players the place holds; the size tier's cap when not given. */
    maxPlayers?: number;
}
/** A solid block of wall: center, half extents (along the wall, up, thickness), turn about Y. */
export interface WallBlock {
    center: readonly [number, number, number];
    half: readonly [number, number, number];
    yaw: number;
}
/** Every finding code (the API's response schema is built from this list). */
export declare const WORLD_FINDING_CODES: readonly ["floating", "buried", "drowned", "overlap", "spawn-blocked", "spawn-water", "heavy-place", "many-items", "steep", "slope", "door", "rule", "unreachable", "game-no-spawn", "game-team-no-spawn", "game-loadout-not-tool", "game-counter-undeclared", "game-zone-tag-missing", "game-zone-tag-unused", "game-clock-only", "game-timer-not-started", "game-timer-after-time-up", "game-event-not-emitted", "ride-side-view", "ride-water-dry", "ride-tag-unused", "ride-many", "ride-seats-vs-players", "script-no-game", "script-too-big", "script-unknown-event", "script-counter-undeclared", "script-zone-tag-missing", "script-disabled", "script-dynamic-name", "script-endless-loop", "script-syntax", "script-unreviewed-copy", "script-awaiting-review", "script-rejected", "script-checks-unavailable"];
export type WorldFindingCode = (typeof WORLD_FINDING_CODES)[number];
export interface WorldFinding {
    /** Stable while the problem stays the same (for lists and dismissals). */
    id: string;
    code: WorldFindingCode;
    level: 'warning' | 'info';
    message: string;
    /** Items the finding is about (the studio can select them). */
    instanceIds: string[];
    /** Commands that fix it as one undo step, or null when a person has to decide. */
    fix: CommandPayload[] | null;
    /** A place the finding is about when it is not an item (a door, a closed-in area): world box. */
    area?: {
        min: [number, number, number];
        max: [number, number, number];
    };
    /** The place script the finding is about, and where in its source (lines and columns from 1). */
    script?: {
        id: string;
        line?: number;
        column?: number;
    };
}
export interface WorldReport {
    findings: WorldFinding[];
    stats: {
        items: number;
        triangles: number;
    };
}
/**
 * Place budget for phones (P2-12, decision 81): above it a place still opens, but phones slow
 * down. First numbers; they follow real device measurements.
 */
export declare const PLACE_BUDGET: {
    readonly triangles: 400000;
    readonly items: 3000;
};
/**
 * World validator v1 (P2-12, docs/ENGINE-RULES.md): items floating above what is under them,
 * items buried in the ground, solid items inside each other, a spawn point inside an item or in
 * deep water, and the place's phone budget. Floating and buried items come with a fix (one
 * undo step); the rest needs a person. Pure: the same checks run in the studio and in workers.
 */
export declare function validateWorld(doc: WorldDocument, env: WorldEnvironment): WorldReport;
/**
 * Checks of a game's generic rules (P9-12 generic rules, Task 8): names that point at nothing.
 * The engine never interprets a counter name, a zone tag or a custom event, so a typo is not an
 * error to it, only a rule that silently never does anything; these findings say so. Nothing here
 * knows what a game means by any name.
 *
 * - A counter named by a rule, the ranking or a display that the game does not declare (one fix, on
 *   the first of them, declares them all per player, starting at 0).
 * - A zone tag a rule listens to or teleports to that no zone in the place has (except the tags a
 *   migrated stored race is written for, `isLegacyGateTag`), and (info) a zone whose tag no rule
 *   uses.
 * - (info) A game only the clock can end: no `win`, and every `end_match` waits for `time_up`.
 * - A rule waiting for `timer_fired` when no rule starts a timer, and a timer started on `time_up`
 *   (the match is decided in that same moment, so it never fires: a rule that decides the match
 *   at the end must do so while handling `time_up` itself).
 * - A custom event a rule listens to that no rule raises with `emit`.
 * - A ride tag a rule hears (`mounted`, `dismounted`) or asks for (`riding`) that no rideable item has.
 *
 * The place's enabled scripts count too (P2-10): their literal emits raise custom events, their literal zone tags use
 * zones, and the counters they name are declared by the same fix; a script that works a name out while running
 * turns the "nobody raises / nobody uses" findings off (spec 8).
 */
export declare function checkGameRules(doc: WorldDocument, game: Game): WorldFinding[];
