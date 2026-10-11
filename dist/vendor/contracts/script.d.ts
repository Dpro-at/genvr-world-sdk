import { z } from 'zod';
/**
 * Limits of creator scripts (P2-10, spec `docs/superpowers/specs/2026-10-02-script-sandbox-design.md` 5.4); the
 * contracts, the sandbox, the validator, the room and the tools share them. The tick numbers were measured in plan
 * Task 1: one interrupt tick is about 10 000 loop iterations (0.10-0.39 ms on the dev machine), so 12 ticks fit in a
 * 5 ms handler and 60 in the 25 ms top level, and the deterministic count trips before the clock.
 */
export declare const SCRIPT_LIMITS: {
    readonly scripts: 8;
    readonly sourceChars: 16384;
    readonly totalChars: 65536;
    /**
     * The heap limit of one script's runtime. QuickJS-ng counts allocations against it, not bytes, in this build (about
     * 500 000 allocations), so long strings count less than their size; the place's shared memory below is the hard
     * bound (spec 5.1, review finding 5).
     */
    readonly memoryBytes: number;
    /** All scripts of a place share this much WebAssembly memory (one module per room); allocations past it fail. */
    readonly placeMemoryBytes: number;
    /** A call that grows the place's memory past this switches the script that made it off for the match. */
    readonly placeMemorySoftBytes: number;
    readonly stackBytes: number;
    readonly startMs: 25;
    readonly startTicks: 60;
    readonly handlerMs: 5;
    readonly handlerTicks: 12;
    readonly scriptMsPerSecond: 25;
    readonly placeMsPerSecond: 50;
    readonly strikes: 3;
    readonly errors: 50;
    readonly actsPerHandler: 16;
    readonly readsPerHandler: 512;
    readonly eventJsonBytes: 4096;
    readonly actJsonBytes: 2048;
    /** A read's argument (`{ op, args }`), refused before the host parses it (second review). */
    readonly readJsonBytes: 1024;
    readonly logPerSecond: 10;
    readonly logChars: 200;
    readonly logLines: 200;
    readonly recordingEvents: 2000;
    readonly testEvents: 500;
    readonly watchdogMs: 50;
    /**
     * Match starts (each script's sandbox, prelude and top level) of a place share this much script time in
     * `startWindowMs`, on top of the place's 50 ms a second (second review, critical 1).
     */
    readonly startMsPerWindow: 250;
    readonly startWindowMs: 10000;
    /**
     * A place's scripts may be ended this many times (the hard deadline, a worker that died, a call over the watchdog)
     * in `killWindowMs` before they stay off; a changed script may start again `killRetryMs` after the last kill,
     * doubled for every kill past the limit (second review, critical 2).
     */
    readonly kills: 3;
    readonly killWindowMs: 600000;
    readonly killRetryMs: 5000;
    /** A dry run (the API's `test_script`, package installs, the studio's replay) stops after this much wall time. */
    readonly dryRunMs: 2000;
};
/** The Genvr Script API version scripts target; a later version gets its own prelude and v1 stays supported. */
export declare const SCRIPT_API_VERSION = 1;
/** A place script's id: `scr-` and 8 hex characters. */
export declare const ScriptId: z.ZodString;
export type ScriptId = z.infer<typeof ScriptId>;
/** A player as a script sees them: a handle for this match (`p1`, `p2`, ... in join order), never an account. */
export declare const ScriptHandle: z.ZodString;
export type ScriptHandle = z.infer<typeof ScriptHandle>;
/** A script in a place (world document `scripts`), changed only by the `set_script` command. */
export declare const PlaceScript: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    api: z.ZodLiteral<1>;
    enabled: z.ZodBoolean;
    source: z.ZodString;
    from: z.ZodOptional<z.ZodObject<{
        itemId: z.ZodString;
        version: z.ZodString;
        sha256: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type PlaceScript = z.infer<typeof PlaceScript>;
/** What `set_script` carries: a script without its id (the id is the command's `scriptId`). */
export declare const PlaceScriptBody: z.ZodObject<{
    name: z.ZodString;
    from: z.ZodOptional<z.ZodObject<{
        itemId: z.ZodString;
        version: z.ZodString;
        sha256: z.ZodString;
    }, z.core.$strip>>;
    source: z.ZodString;
    api: z.ZodLiteral<1>;
    enabled: z.ZodBoolean;
}, z.core.$strip>;
export type PlaceScriptBody = z.infer<typeof PlaceScriptBody>;
/** The total source size of a place's scripts. */
export declare function scriptChars(scripts: ReadonlyArray<{
    source: string;
}>): number;
/** A place's scripts: at most 8, at most 65 536 characters together, ids unique. */
export declare const PlaceScripts: z.ZodArray<z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    api: z.ZodLiteral<1>;
    enabled: z.ZodBoolean;
    source: z.ZodString;
    from: z.ZodOptional<z.ZodObject<{
        itemId: z.ZodString;
        version: z.ZodString;
        sha256: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>>;
/**
 * An event as a script hears it (spec 4): the engine event as plain JSON, every player id replaced by its handle, plus
 * `actor` (the player the event is about, as rules see it). No positions, no names. `endsAt` is on the script clock
 * (`genvr.now()`), not the server's.
 */
export declare const ScriptEvent: z.ZodDiscriminatedUnion<readonly [z.ZodObject<{
    type: z.ZodLiteral<"zone_entered">;
    actor: z.ZodNullable<z.ZodString>;
    id: z.ZodString;
    zone: z.ZodString;
    tag: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"zone_exited">;
    actor: z.ZodNullable<z.ZodString>;
    id: z.ZodString;
    zone: z.ZodString;
    tag: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"zone_crossed">;
    actor: z.ZodNullable<z.ZodString>;
    id: z.ZodString;
    zone: z.ZodString;
    tag: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"player_joined">;
    actor: z.ZodNullable<z.ZodString>;
    id: z.ZodString;
    team: z.ZodNullable<z.ZodEnum<{
        red: "red";
        blue: "blue";
    }>>;
    returning: z.ZodBoolean;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"player_left">;
    actor: z.ZodNullable<z.ZodString>;
    id: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"hit">;
    actor: z.ZodNullable<z.ZodString>;
    victim: z.ZodString;
    by: z.ZodNullable<z.ZodString>;
    damage: z.ZodNumber;
    health: z.ZodNumber;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"died">;
    actor: z.ZodNullable<z.ZodString>;
    victim: z.ZodString;
    by: z.ZodNullable<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"respawned">;
    actor: z.ZodNullable<z.ZodString>;
    id: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"phase_changed">;
    actor: z.ZodNullable<z.ZodString>;
    phase: z.ZodEnum<{
        waiting: "waiting";
        countdown: "countdown";
        playing: "playing";
        results: "results";
    }>;
    endsAt: z.ZodNullable<z.ZodNumber>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"time_up">;
    actor: z.ZodNullable<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"counter_changed">;
    actor: z.ZodNullable<z.ZodString>;
    name: z.ZodString;
    value: z.ZodNumber;
    id: z.ZodNullable<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"timer_fired">;
    actor: z.ZodNullable<z.ZodString>;
    name: z.ZodString;
    id: z.ZodNullable<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"mounted">;
    actor: z.ZodNullable<z.ZodString>;
    id: z.ZodString;
    item: z.ZodString;
    tag: z.ZodString;
    seat: z.ZodNumber;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"dismounted">;
    actor: z.ZodNullable<z.ZodString>;
    id: z.ZodString;
    item: z.ZodString;
    tag: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"custom">;
    actor: z.ZodNullable<z.ZodString>;
    name: z.ZodString;
    id: z.ZodNullable<z.ZodString>;
}, z.core.$strip>], "type">;
export type ScriptEvent = z.infer<typeof ScriptEvent>;
/** The latest a dry-run event may happen: ms on the script clock (one hour). */
export declare const SCRIPT_TEST_MAX_MS = 3600000;
/**
 * An event given to a dry run (`test_script`, spec 12): a script event whose `actor` may be left out (the engine works
 * it out) and with an optional `at`, when it happens in ms on the script clock (`genvr.now()`). Events without `at`
 * follow each other at once; the dry run lets play start first.
 */
export declare const ScriptTestEvent: z.ZodDiscriminatedUnion<readonly [z.ZodObject<{
    type: z.ZodLiteral<"zone_entered">;
    actor: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    at: z.ZodOptional<z.ZodNumber>;
    id: z.ZodString;
    zone: z.ZodString;
    tag: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"zone_exited">;
    actor: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    at: z.ZodOptional<z.ZodNumber>;
    id: z.ZodString;
    zone: z.ZodString;
    tag: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"zone_crossed">;
    actor: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    at: z.ZodOptional<z.ZodNumber>;
    id: z.ZodString;
    zone: z.ZodString;
    tag: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"player_joined">;
    actor: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    at: z.ZodOptional<z.ZodNumber>;
    id: z.ZodString;
    team: z.ZodNullable<z.ZodEnum<{
        red: "red";
        blue: "blue";
    }>>;
    returning: z.ZodBoolean;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"player_left">;
    actor: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    at: z.ZodOptional<z.ZodNumber>;
    id: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"hit">;
    actor: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    at: z.ZodOptional<z.ZodNumber>;
    victim: z.ZodString;
    by: z.ZodNullable<z.ZodString>;
    damage: z.ZodNumber;
    health: z.ZodNumber;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"died">;
    actor: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    at: z.ZodOptional<z.ZodNumber>;
    victim: z.ZodString;
    by: z.ZodNullable<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"respawned">;
    actor: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    at: z.ZodOptional<z.ZodNumber>;
    id: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"phase_changed">;
    actor: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    at: z.ZodOptional<z.ZodNumber>;
    phase: z.ZodEnum<{
        waiting: "waiting";
        countdown: "countdown";
        playing: "playing";
        results: "results";
    }>;
    endsAt: z.ZodNullable<z.ZodNumber>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"time_up">;
    actor: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    at: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"counter_changed">;
    actor: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    at: z.ZodOptional<z.ZodNumber>;
    name: z.ZodString;
    value: z.ZodNumber;
    id: z.ZodNullable<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"timer_fired">;
    actor: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    at: z.ZodOptional<z.ZodNumber>;
    name: z.ZodString;
    id: z.ZodNullable<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"mounted">;
    actor: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    at: z.ZodOptional<z.ZodNumber>;
    id: z.ZodString;
    item: z.ZodString;
    tag: z.ZodString;
    seat: z.ZodNumber;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"dismounted">;
    actor: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    at: z.ZodOptional<z.ZodNumber>;
    id: z.ZodString;
    item: z.ZodString;
    tag: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"custom">;
    actor: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    at: z.ZodOptional<z.ZodNumber>;
    name: z.ZodString;
    id: z.ZodNullable<z.ZodString>;
}, z.core.$strip>], "type">;
export type ScriptTestEvent = z.infer<typeof ScriptTestEvent>;
/**
 * The script-visible events of one match as a room recorded them (spec 10), for `test_script { recording:
 * 'last_match' }`: the match seed, the events, when each happened (ms on the script clock) and whether it was a
 * follow-up (raised while another event was delivered: by the rules, the scripts or the engine itself), which a dry
 * run raises again instead of replaying.
 */
export declare const ScriptRecording: z.ZodObject<{
    seed: z.ZodNumber;
    events: z.ZodArray<z.ZodDiscriminatedUnion<readonly [z.ZodObject<{
        type: z.ZodLiteral<"zone_entered">;
        actor: z.ZodNullable<z.ZodString>;
        id: z.ZodString;
        zone: z.ZodString;
        tag: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"zone_exited">;
        actor: z.ZodNullable<z.ZodString>;
        id: z.ZodString;
        zone: z.ZodString;
        tag: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"zone_crossed">;
        actor: z.ZodNullable<z.ZodString>;
        id: z.ZodString;
        zone: z.ZodString;
        tag: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"player_joined">;
        actor: z.ZodNullable<z.ZodString>;
        id: z.ZodString;
        team: z.ZodNullable<z.ZodEnum<{
            red: "red";
            blue: "blue";
        }>>;
        returning: z.ZodBoolean;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"player_left">;
        actor: z.ZodNullable<z.ZodString>;
        id: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"hit">;
        actor: z.ZodNullable<z.ZodString>;
        victim: z.ZodString;
        by: z.ZodNullable<z.ZodString>;
        damage: z.ZodNumber;
        health: z.ZodNumber;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"died">;
        actor: z.ZodNullable<z.ZodString>;
        victim: z.ZodString;
        by: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"respawned">;
        actor: z.ZodNullable<z.ZodString>;
        id: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"phase_changed">;
        actor: z.ZodNullable<z.ZodString>;
        phase: z.ZodEnum<{
            waiting: "waiting";
            countdown: "countdown";
            playing: "playing";
            results: "results";
        }>;
        endsAt: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"time_up">;
        actor: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"counter_changed">;
        actor: z.ZodNullable<z.ZodString>;
        name: z.ZodString;
        value: z.ZodNumber;
        id: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"timer_fired">;
        actor: z.ZodNullable<z.ZodString>;
        name: z.ZodString;
        id: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"mounted">;
        actor: z.ZodNullable<z.ZodString>;
        id: z.ZodString;
        item: z.ZodString;
        tag: z.ZodString;
        seat: z.ZodNumber;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"dismounted">;
        actor: z.ZodNullable<z.ZodString>;
        id: z.ZodString;
        item: z.ZodString;
        tag: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"custom">;
        actor: z.ZodNullable<z.ZodString>;
        name: z.ZodString;
        id: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>], "type">>;
    at: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
    caused: z.ZodOptional<z.ZodArray<z.ZodBoolean>>;
}, z.core.$strip>;
export type ScriptRecording = z.infer<typeof ScriptRecording>;
export interface ScriptApiEntry {
    /** The member of `genvr`. */
    name: string;
    /** TypeScript signature of the member, used in the `.d.ts` and the reference text. */
    signature: string;
    doc: string;
}
/**
 * The Genvr Script API version 1, the single source of the prelude's members, the `.d.ts` (`scriptApiDts`) and the
 * reference text `get_script_api` returns (`scriptApiText`). Only generic reads, the rules' actions and logging.
 */
export declare const SCRIPT_API: ReadonlyArray<ScriptApiEntry>;
/** The `.d.ts` of the Genvr Script API, generated from `SCRIPT_API`, `Action` and `ScriptEvent`. */
export declare function scriptApiDts(): string;
/** The reference text of the Genvr Script API (`get_script_api`): members, limits and the `.d.ts`. */
export declare function scriptApiText(): string;
