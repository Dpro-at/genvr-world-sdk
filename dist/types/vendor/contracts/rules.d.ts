import { z } from 'zod';
/** Limits of the generic rules (counters, rules, zones); the validator, the server and the UI share them. */
export declare const RULE_LIMITS: {
    readonly counters: 32;
    readonly rules: 64;
    readonly conditions: 6;
    readonly actions: 8;
    readonly name: 40;
    readonly text: 80;
    readonly chain: 8;
    readonly actionsPerEvent: 64;
    readonly hud: 8;
};
/** The events the engine raises. Rules may also listen for a custom name raised by an `emit` action. */
export declare const GameEventName: z.ZodEnum<{
    zone_entered: "zone_entered";
    zone_exited: "zone_exited";
    zone_crossed: "zone_crossed";
    player_joined: "player_joined";
    player_left: "player_left";
    hit: "hit";
    died: "died";
    respawned: "respawned";
    phase_changed: "phase_changed";
    time_up: "time_up";
    counter_changed: "counter_changed";
    timer_fired: "timer_fired";
    mounted: "mounted";
    dismounted: "dismounted";
}>;
export type GameEventName = z.infer<typeof GameEventName>;
/** A zone setting on a placed item: the tag is free text the designer chooses; the engine never interprets it. */
export declare const Zone: z.ZodObject<{
    shape: z.ZodEnum<{
        area: "area";
        gate: "gate";
    }>;
    tag: z.ZodString;
    visibleInPlay: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export type Zone = z.infer<typeof Zone>;
export declare const Counter: z.ZodObject<{
    name: z.ZodString;
    scope: z.ZodEnum<{
        player: "player";
        team: "team";
        global: "global";
    }>;
    start: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export type Counter = z.infer<typeof Counter>;
export declare const Compare: z.ZodEnum<{
    "=": "=";
    "!=": "!=";
    "<": "<";
    "<=": "<=";
    ">": ">";
    ">=": ">=";
}>;
export type Compare = z.infer<typeof Compare>;
export declare const Who: z.ZodEnum<{
    actor: "actor";
    everyone: "everyone";
    team_of_actor: "team_of_actor";
}>;
export type Who = z.infer<typeof Who>;
export declare const Condition: z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"counter">;
    name: z.ZodString;
    op: z.ZodEnum<{
        "=": "=";
        "!=": "!=";
        "<": "<";
        "<=": "<=";
        ">": ">";
        ">=": ">=";
    }>;
    value: z.ZodUnion<readonly [z.ZodNumber, z.ZodObject<{
        counter: z.ZodString;
    }, z.core.$strip>]>;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodLiteral<"phase">;
    is: z.ZodEnum<{
        waiting: "waiting";
        countdown: "countdown";
        playing: "playing";
        results: "results";
    }>;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodLiteral<"team">;
    is: z.ZodEnum<{
        red: "red";
        blue: "blue";
    }>;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodLiteral<"riding">;
    is: z.ZodBoolean;
    tag: z.ZodOptional<z.ZodString>;
}, z.core.$strip>], "kind">;
export type Condition = z.infer<typeof Condition>;
export declare const Action: z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"add_counter">;
    name: z.ZodString;
    by: z.ZodNumber;
    who: z.ZodDefault<z.ZodEnum<{
        actor: "actor";
        everyone: "everyone";
        team_of_actor: "team_of_actor";
    }>>;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodLiteral<"set_counter">;
    name: z.ZodString;
    to: z.ZodNumber;
    who: z.ZodDefault<z.ZodEnum<{
        actor: "actor";
        everyone: "everyone";
        team_of_actor: "team_of_actor";
    }>>;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodLiteral<"add_score">;
    by: z.ZodNumber;
    who: z.ZodDefault<z.ZodEnum<{
        actor: "actor";
        everyone: "everyone";
        team_of_actor: "team_of_actor";
    }>>;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodLiteral<"end_match">;
    winner: z.ZodUnion<readonly [z.ZodObject<{
        byCounter: z.ZodString;
        order: z.ZodEnum<{
            high: "high";
            low: "low";
        }>;
    }, z.core.$strip>, z.ZodObject<{
        player: z.ZodLiteral<"actor">;
    }, z.core.$strip>, z.ZodObject<{
        team: z.ZodEnum<{
            red: "red";
            blue: "blue";
        }>;
    }, z.core.$strip>, z.ZodLiteral<"nobody">]>;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodLiteral<"start_timer">;
    name: z.ZodString;
    seconds: z.ZodNumber;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodLiteral<"damage">;
    amount: z.ZodNumber;
    who: z.ZodDefault<z.ZodEnum<{
        actor: "actor";
        everyone: "everyone";
        team_of_actor: "team_of_actor";
    }>>;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodLiteral<"heal">;
    amount: z.ZodNumber;
    who: z.ZodDefault<z.ZodEnum<{
        actor: "actor";
        everyone: "everyone";
        team_of_actor: "team_of_actor";
    }>>;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodLiteral<"teleport_to_zone">;
    tag: z.ZodString;
    who: z.ZodDefault<z.ZodEnum<{
        actor: "actor";
        everyone: "everyone";
        team_of_actor: "team_of_actor";
    }>>;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodLiteral<"show_message">;
    text: z.ZodString;
    who: z.ZodDefault<z.ZodEnum<{
        actor: "actor";
        everyone: "everyone";
        team_of_actor: "team_of_actor";
    }>>;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodLiteral<"emit">;
    event: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodLiteral<"say">;
    line: z.ZodString;
    who: z.ZodDefault<z.ZodEnum<{
        actor: "actor";
        everyone: "everyone";
        team_of_actor: "team_of_actor";
    }>>;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodLiteral<"dismount">;
    who: z.ZodDefault<z.ZodEnum<{
        actor: "actor";
        everyone: "everyone";
        team_of_actor: "team_of_actor";
    }>>;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodLiteral<"set_speed">;
    factor: z.ZodNumber;
    seconds: z.ZodNumber;
    who: z.ZodDefault<z.ZodEnum<{
        actor: "actor";
        everyone: "everyone";
        team_of_actor: "team_of_actor";
    }>>;
}, z.core.$strip>], "kind">;
export type Action = z.infer<typeof Action>;
export declare const Rule: z.ZodObject<{
    when: z.ZodObject<{
        event: z.ZodUnion<readonly [z.ZodEnum<{
            zone_entered: "zone_entered";
            zone_exited: "zone_exited";
            zone_crossed: "zone_crossed";
            player_joined: "player_joined";
            player_left: "player_left";
            hit: "hit";
            died: "died";
            respawned: "respawned";
            phase_changed: "phase_changed";
            time_up: "time_up";
            counter_changed: "counter_changed";
            timer_fired: "timer_fired";
            mounted: "mounted";
            dismounted: "dismounted";
        }>, z.ZodString]>;
        tag: z.ZodOptional<z.ZodString>;
        counter: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    if: z.ZodDefault<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"counter">;
        name: z.ZodString;
        op: z.ZodEnum<{
            "=": "=";
            "!=": "!=";
            "<": "<";
            "<=": "<=";
            ">": ">";
            ">=": ">=";
        }>;
        value: z.ZodUnion<readonly [z.ZodNumber, z.ZodObject<{
            counter: z.ZodString;
        }, z.core.$strip>]>;
    }, z.core.$strip>, z.ZodObject<{
        kind: z.ZodLiteral<"phase">;
        is: z.ZodEnum<{
            waiting: "waiting";
            countdown: "countdown";
            playing: "playing";
            results: "results";
        }>;
    }, z.core.$strip>, z.ZodObject<{
        kind: z.ZodLiteral<"team">;
        is: z.ZodEnum<{
            red: "red";
            blue: "blue";
        }>;
    }, z.core.$strip>, z.ZodObject<{
        kind: z.ZodLiteral<"riding">;
        is: z.ZodBoolean;
        tag: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>], "kind">>>;
    do: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"add_counter">;
        name: z.ZodString;
        by: z.ZodNumber;
        who: z.ZodDefault<z.ZodEnum<{
            actor: "actor";
            everyone: "everyone";
            team_of_actor: "team_of_actor";
        }>>;
    }, z.core.$strip>, z.ZodObject<{
        kind: z.ZodLiteral<"set_counter">;
        name: z.ZodString;
        to: z.ZodNumber;
        who: z.ZodDefault<z.ZodEnum<{
            actor: "actor";
            everyone: "everyone";
            team_of_actor: "team_of_actor";
        }>>;
    }, z.core.$strip>, z.ZodObject<{
        kind: z.ZodLiteral<"add_score">;
        by: z.ZodNumber;
        who: z.ZodDefault<z.ZodEnum<{
            actor: "actor";
            everyone: "everyone";
            team_of_actor: "team_of_actor";
        }>>;
    }, z.core.$strip>, z.ZodObject<{
        kind: z.ZodLiteral<"end_match">;
        winner: z.ZodUnion<readonly [z.ZodObject<{
            byCounter: z.ZodString;
            order: z.ZodEnum<{
                high: "high";
                low: "low";
            }>;
        }, z.core.$strip>, z.ZodObject<{
            player: z.ZodLiteral<"actor">;
        }, z.core.$strip>, z.ZodObject<{
            team: z.ZodEnum<{
                red: "red";
                blue: "blue";
            }>;
        }, z.core.$strip>, z.ZodLiteral<"nobody">]>;
    }, z.core.$strip>, z.ZodObject<{
        kind: z.ZodLiteral<"start_timer">;
        name: z.ZodString;
        seconds: z.ZodNumber;
    }, z.core.$strip>, z.ZodObject<{
        kind: z.ZodLiteral<"damage">;
        amount: z.ZodNumber;
        who: z.ZodDefault<z.ZodEnum<{
            actor: "actor";
            everyone: "everyone";
            team_of_actor: "team_of_actor";
        }>>;
    }, z.core.$strip>, z.ZodObject<{
        kind: z.ZodLiteral<"heal">;
        amount: z.ZodNumber;
        who: z.ZodDefault<z.ZodEnum<{
            actor: "actor";
            everyone: "everyone";
            team_of_actor: "team_of_actor";
        }>>;
    }, z.core.$strip>, z.ZodObject<{
        kind: z.ZodLiteral<"teleport_to_zone">;
        tag: z.ZodString;
        who: z.ZodDefault<z.ZodEnum<{
            actor: "actor";
            everyone: "everyone";
            team_of_actor: "team_of_actor";
        }>>;
    }, z.core.$strip>, z.ZodObject<{
        kind: z.ZodLiteral<"show_message">;
        text: z.ZodString;
        who: z.ZodDefault<z.ZodEnum<{
            actor: "actor";
            everyone: "everyone";
            team_of_actor: "team_of_actor";
        }>>;
    }, z.core.$strip>, z.ZodObject<{
        kind: z.ZodLiteral<"emit">;
        event: z.ZodString;
    }, z.core.$strip>, z.ZodObject<{
        kind: z.ZodLiteral<"say">;
        line: z.ZodString;
        who: z.ZodDefault<z.ZodEnum<{
            actor: "actor";
            everyone: "everyone";
            team_of_actor: "team_of_actor";
        }>>;
    }, z.core.$strip>, z.ZodObject<{
        kind: z.ZodLiteral<"dismount">;
        who: z.ZodDefault<z.ZodEnum<{
            actor: "actor";
            everyone: "everyone";
            team_of_actor: "team_of_actor";
        }>>;
    }, z.core.$strip>, z.ZodObject<{
        kind: z.ZodLiteral<"set_speed">;
        factor: z.ZodNumber;
        seconds: z.ZodNumber;
        who: z.ZodDefault<z.ZodEnum<{
            actor: "actor";
            everyone: "everyone";
            team_of_actor: "team_of_actor";
        }>>;
    }, z.core.$strip>], "kind">>;
}, z.core.$strip>;
export type Rule = z.infer<typeof Rule>;
/** The counter that orders players (scoreboard, place, default winner); the designer chooses it. */
export declare const Ranking: z.ZodObject<{
    by: z.ZodString;
    order: z.ZodEnum<{
        high: "high";
        low: "low";
    }>;
    then: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type Ranking = z.infer<typeof Ranking>;
export declare const HudBinding: z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"counter">;
    label: z.ZodString;
    counter: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodLiteral<"rank">;
    label: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodLiteral<"timer">;
    label: z.ZodString;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodLiteral<"speed">;
    label: z.ZodString;
    unit: z.ZodDefault<z.ZodEnum<{
        "km/h": "km/h";
        "m/s": "m/s";
    }>>;
}, z.core.$strip>], "kind">;
export type HudBinding = z.infer<typeof HudBinding>;
/**
 * The zone settings of a placed item, stored flat in its instance params (`set_item_params` takes
 * only strings, numbers, booleans and null): `zone` is the shape ('area' | 'gate'), `zoneTag` the
 * tag, `zoneVisible` whether players see it while playing. The room, the validator and the studio
 * read them through `zoneFromParams`, so they agree on what is a zone.
 */
export declare const ZONE_PARAMS: {
    readonly shape: "zone";
    readonly tag: "zoneTag";
    readonly visible: "zoneVisible";
};
/**
 * A zone's size in metres from its item's scale: a gate is 12 m wide times the x scale (2 to
 * 120 m) with no depth; an area is 4 m times the x and z scale (1 to 120 m each). Width is across
 * the item's facing, depth along it. The room judges zones with it and the assistant reports it.
 */
export declare function zoneSize(shape: Zone['shape'], scale: readonly number[]): {
    width: number;
    depth: number;
};
/**
 * The zone an item's params describe, or null when it is none: no shape (neither in the params nor
 * `itemShape`, the shape a zone item has by itself), or no usable tag (a string of 1 to
 * `RULE_LIMITS.name` characters once trimmed). A shape in the params wins over `itemShape`.
 */
export declare function zoneFromParams(params: Readonly<Record<string, unknown>>, itemShape?: Zone['shape']): Zone | null;
