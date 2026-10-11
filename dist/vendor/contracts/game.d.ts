import { z } from 'zod';
/** Limits of the game settings (P9-12); the validator, the server and the settings page share them. */
export declare const GAME_LIMITS: {
    readonly minPlayers: {
        readonly min: 1;
        readonly max: 50;
    };
    readonly durationSec: {
        readonly min: 30;
        readonly max: 1800;
    };
    readonly countdownSec: {
        readonly min: 0;
        readonly max: 30;
    };
    readonly resultsSec: {
        readonly min: 3;
        readonly max: 60;
    };
    readonly health: {
        readonly min: 1;
        readonly max: 1000;
    };
    readonly respawnDelaySec: {
        readonly min: 0;
        readonly max: 60;
    };
    readonly protectSec: {
        readonly min: 0;
        readonly max: 10;
    };
    readonly scoreGoal: {
        readonly min: 1;
        readonly max: 1000;
    };
    readonly loadoutItems: 4;
};
declare const LiveGame: z.ZodObject<{
    match: z.ZodObject<{
        minPlayers: z.ZodNumber;
        durationSec: z.ZodNumber;
        countdownSec: z.ZodNumber;
        resultsSec: z.ZodNumber;
    }, z.core.$strip>;
    teams: z.ZodOptional<z.ZodObject<{
        mode: z.ZodEnum<{
            none: "none";
            two: "two";
        }>;
        friendlyFire: z.ZodBoolean;
    }, z.core.$strip>>;
    health: z.ZodOptional<z.ZodObject<{
        max: z.ZodNumber;
    }, z.core.$strip>>;
    respawn: z.ZodOptional<z.ZodObject<{
        delaySec: z.ZodNumber;
        protectSec: z.ZodNumber;
    }, z.core.$strip>>;
    loadout: z.ZodOptional<z.ZodObject<{
        items: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
    score: z.ZodOptional<z.ZodObject<{
        from: z.ZodEnum<{
            kills: "kills";
        }>;
        goal: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    win: z.ZodOptional<z.ZodObject<{
        by: z.ZodEnum<{
            highest_score: "highest_score";
        }>;
    }, z.core.$strip>>;
    counters: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        scope: z.ZodEnum<{
            player: "player";
            team: "team";
            global: "global";
        }>;
        start: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>>>;
    rules: z.ZodOptional<z.ZodArray<z.ZodObject<{
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
    }, z.core.$strip>>>;
    ranking: z.ZodOptional<z.ZodObject<{
        by: z.ZodString;
        order: z.ZodEnum<{
            high: "high";
            low: "low";
        }>;
        then: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    hud: z.ZodOptional<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
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
    }, z.core.$strip>], "kind">>>;
}, z.core.$strip>;
/**
 * A place's game as it is given and read now: commands (`set_game`), requests, the settings page
 * and the assistant take only this. It never has the old keys (`template`, `race`).
 */
export declare const Game: z.ZodObject<{
    match: z.ZodObject<{
        minPlayers: z.ZodNumber;
        durationSec: z.ZodNumber;
        countdownSec: z.ZodNumber;
        resultsSec: z.ZodNumber;
    }, z.core.$strip>;
    teams: z.ZodOptional<z.ZodObject<{
        mode: z.ZodEnum<{
            none: "none";
            two: "two";
        }>;
        friendlyFire: z.ZodBoolean;
    }, z.core.$strip>>;
    health: z.ZodOptional<z.ZodObject<{
        max: z.ZodNumber;
    }, z.core.$strip>>;
    respawn: z.ZodOptional<z.ZodObject<{
        delaySec: z.ZodNumber;
        protectSec: z.ZodNumber;
    }, z.core.$strip>>;
    loadout: z.ZodOptional<z.ZodObject<{
        items: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
    score: z.ZodOptional<z.ZodObject<{
        from: z.ZodEnum<{
            kills: "kills";
        }>;
        goal: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    win: z.ZodOptional<z.ZodObject<{
        by: z.ZodEnum<{
            highest_score: "highest_score";
        }>;
    }, z.core.$strip>>;
    counters: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        scope: z.ZodEnum<{
            player: "player";
            team: "team";
            global: "global";
        }>;
        start: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>>>;
    rules: z.ZodOptional<z.ZodArray<z.ZodObject<{
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
    }, z.core.$strip>>>;
    ranking: z.ZodOptional<z.ZodObject<{
        by: z.ZodString;
        order: z.ZodEnum<{
            high: "high";
            low: "low";
        }>;
        then: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    hud: z.ZodOptional<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
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
    }, z.core.$strip>], "kind">>>;
}, z.core.$strip>;
export type Game = z.output<typeof LiveGame>;
/**
 * A place's game as a stored world document holds it: the live game, or one stored before the
 * generic rules, whose old keys are input only and read away (`migrateStoredGame`). Only the
 * stored-document read path (`WorldDocument`) uses it. A codec, so a document can be written back
 * (responses are encoded): the live game is its own stored form.
 */
export declare const StoredGame: z.ZodCodec<z.ZodObject<{
    match: z.ZodObject<{
        minPlayers: z.ZodNumber;
        durationSec: z.ZodNumber;
        countdownSec: z.ZodNumber;
        resultsSec: z.ZodNumber;
    }, z.core.$strip>;
    teams: z.ZodOptional<z.ZodObject<{
        mode: z.ZodEnum<{
            none: "none";
            two: "two";
        }>;
        friendlyFire: z.ZodBoolean;
    }, z.core.$strip>>;
    health: z.ZodOptional<z.ZodObject<{
        max: z.ZodNumber;
    }, z.core.$strip>>;
    respawn: z.ZodOptional<z.ZodObject<{
        delaySec: z.ZodNumber;
        protectSec: z.ZodNumber;
    }, z.core.$strip>>;
    loadout: z.ZodOptional<z.ZodObject<{
        items: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
    score: z.ZodOptional<z.ZodObject<{
        from: z.ZodEnum<{
            kills: "kills";
        }>;
        goal: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    win: z.ZodOptional<z.ZodObject<{
        by: z.ZodEnum<{
            highest_score: "highest_score";
        }>;
    }, z.core.$strip>>;
    counters: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        scope: z.ZodEnum<{
            player: "player";
            team: "team";
            global: "global";
        }>;
        start: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>>>;
    rules: z.ZodOptional<z.ZodArray<z.ZodObject<{
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
    }, z.core.$strip>>>;
    ranking: z.ZodOptional<z.ZodObject<{
        by: z.ZodString;
        order: z.ZodEnum<{
            high: "high";
            low: "low";
        }>;
        then: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    hud: z.ZodOptional<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
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
    }, z.core.$strip>], "kind">>>;
    template: z.ZodOptional<z.ZodEnum<{
        sword_fight: "sword_fight";
        car_race: "car_race";
    }>>;
    race: z.ZodOptional<z.ZodObject<{
        laps: z.ZodNumber;
        checkpoints: z.ZodEnum<{
            ordered: "ordered";
            any_order: "any_order";
        }>;
        finish: z.ZodEnum<{
            all_finish: "all_finish";
            first_wins: "first_wins";
            timed: "timed";
        }>;
        graceSec: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>, z.ZodObject<{
    match: z.ZodObject<{
        minPlayers: z.ZodNumber;
        durationSec: z.ZodNumber;
        countdownSec: z.ZodNumber;
        resultsSec: z.ZodNumber;
    }, z.core.$strip>;
    teams: z.ZodOptional<z.ZodObject<{
        mode: z.ZodEnum<{
            none: "none";
            two: "two";
        }>;
        friendlyFire: z.ZodBoolean;
    }, z.core.$strip>>;
    health: z.ZodOptional<z.ZodObject<{
        max: z.ZodNumber;
    }, z.core.$strip>>;
    respawn: z.ZodOptional<z.ZodObject<{
        delaySec: z.ZodNumber;
        protectSec: z.ZodNumber;
    }, z.core.$strip>>;
    loadout: z.ZodOptional<z.ZodObject<{
        items: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
    score: z.ZodOptional<z.ZodObject<{
        from: z.ZodEnum<{
            kills: "kills";
        }>;
        goal: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
    win: z.ZodOptional<z.ZodObject<{
        by: z.ZodEnum<{
            highest_score: "highest_score";
        }>;
    }, z.core.$strip>>;
    counters: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        scope: z.ZodEnum<{
            player: "player";
            team: "team";
            global: "global";
        }>;
        start: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>>>;
    rules: z.ZodOptional<z.ZodArray<z.ZodObject<{
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
    }, z.core.$strip>>>;
    ranking: z.ZodOptional<z.ZodObject<{
        by: z.ZodString;
        order: z.ZodEnum<{
            high: "high";
            low: "low";
        }>;
        then: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    hud: z.ZodOptional<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
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
    }, z.core.$strip>], "kind">>>;
}, z.core.$strip>>;
/**
 * The Core Library ids of the old race gates (removed from the library), as stored worlds may still
 * hold them; `readLegacyGates` reads them as Zone Gates.
 */
export declare const LEGACY_GATE_ITEMS: {
    readonly checkpoint: "genvr.core.gameplay.checkpoint";
    readonly finish: "genvr.core.gameplay.finish-line";
};
/**
 * How many checkpoints a migrated race counts. The rules cannot see the world, so they are written
 * for every checkpoint index up to this number; a stored course with more checkpoints cannot finish
 * a lap (its finish line's tag has no rule) until the designer rebuilds it with zones.
 */
export declare const MIGRATED_CHECKPOINTS = 16;
/** The zone tag of the old checkpoint at 1-based position `index` (by `order`, then world order). */
export declare function legacyCheckpointTag(index: number): string;
/** The zone tag of an old finish line in a world with `checkpoints` old checkpoints. */
export declare function legacyFinishTag(checkpoints: number): string;
/**
 * Whether a tag is one the rules of a migrated race are written for (`legacyCheckpointTag` 1 to
 * `MIGRATED_CHECKPOINTS`, `legacyFinishTag` 0 to `MIGRATED_CHECKPOINTS`). Most of them have no
 * zone in a given place by design, so the Checks do not report them as missing.
 */
export declare function isLegacyGateTag(tag: string): boolean;
/**
 * The zone tags of the old race gates in a world (instance id to tag): checkpoints sorted by their
 * `order` param (a missing or bad one reads as 1; equal orders keep world order), exactly as the old
 * race sorted them; every finish line tagged with the number of checkpoints before it. The room
 * turns these instances into gate zones, so a migrated race plays on the gates already placed.
 */
export declare function legacyGateTags(instances: ReadonlyArray<{
    instanceId: string;
    itemId: string;
    params: Readonly<Record<string, unknown>>;
}>): Map<string, string>;
/**
 * The Core Library's Zone Gate (`ZONE_GATE_ID`; a core-library test checks they agree): the old
 * race gates of a stored world are read as it.
 */
export declare const LEGACY_GATE_REPLACEMENT = "genvr.core.gameplay.zone-gate";
/**
 * Reads the instances of a world stored before the generic rules: every old Checkpoint and Finish
 * line (`LEGACY_GATE_ITEMS`) becomes a Zone Gate in the same place, size and turn, tagged as the
 * migrated race's rules expect (`legacyGateTags`), so a stored race plays on the gates already
 * placed and nothing in the world names the old items any more. Zone params set on an old gate
 * (a shape and a tag) are kept as they were; its other old params (`order`) are dropped. Anything
 * else passes through untouched.
 */
export declare function readLegacyGates<T extends {
    instanceId: string;
    itemId: string;
    params: Record<string, unknown>;
}>(instances: T[]): T[];
/**
 * The Core Library id of the old Sword item (renamed, decision 119: no game-named items), as stored
 * worlds and loadouts may still hold it; `readLegacyItemId` reads it as the Melee tool.
 */
export declare const LEGACY_MELEE_TOOL_ID = "genvr.core.gameplay.sword";
/**
 * The Core Library's Melee tool (`MELEE_TOOL_ID`; a core-library test checks they agree): the same
 * held tool and model the old Sword item was, under a neutral name.
 */
export declare const MELEE_TOOL_REPLACEMENT = "genvr.core.gameplay.melee-tool";
/** An item id as stored before the renames: the old Sword item reads as the Melee tool; others pass. */
export declare function readLegacyItemId(itemId: string): string;
/**
 * Reads the instances of a stored world (`WorldDocument`): old race gates become Zone Gates
 * (`readLegacyGates`) and renamed items take their new id (`readLegacyItemId`). A world without
 * old items is returned as it is.
 */
export declare function readLegacyItems<T extends {
    instanceId: string;
    itemId: string;
    params: Record<string, unknown>;
}>(instances: T[]): T[];
/**
 * The game a place starts with when the builder turns one on (Place settings, the assistant's
 * `set_game`): only generic parts, a match clock, a point per knock-out and the highest score
 * winning. The builder changes the rest.
 */
export declare function newGame(): Game;
/**
 * A player uses the tool in hand (P9-12), as sent to the room. Tagged by kind so ranged tools
 * (the shooter) add their own shape; `{ yaw }` alone is still taken as a melee strike (clients
 * before the tag). `target` is the session id the client thinks it hit: the server judges hits
 * itself and only counts a claim it cannot confirm (cheat evidence).
 */
export declare const AttackMessage: z.ZodPipe<z.ZodUnion<readonly [z.ZodObject<{
    kind: z.ZodLiteral<"melee">;
    yaw: z.ZodNumber;
    target: z.ZodOptional<z.ZodString>;
}, z.core.$strip>, z.ZodObject<{
    yaw: z.ZodNumber;
}, z.core.$strict>]>, z.ZodTransform<{
    kind: "melee";
    yaw: number;
    target?: string | undefined;
}, {
    kind: "melee";
    yaw: number;
    target?: string | undefined;
} | {
    yaw: number;
}>>;
export type AttackMessage = z.output<typeof AttackMessage>;
/** One row of the game's scoreboard, as the room syncs it (`state.game.players`, by session id). */
export interface GamePlayerRow {
    /** 'red', 'blue', or '' when teams are off. */
    team: string;
    health: number;
    max: number;
    alive: boolean;
    score: number;
    kills: number;
    deaths: number;
    /** False for a player who left mid-match (they keep their row until the match ends). */
    present: boolean;
    /** The item in hand (a Core Library tool id); '' for none. */
    tool: string;
    /** When a knocked-out player comes back (server `Date.now()` ms); 0 when not waiting. */
    respawnAt: number;
    /** The live place by the game's ranking, 1 is first (0 when the game has no ranking). */
    place: number;
    /** This player's own counters (those declared with scope `player`), by name. */
    counters: ReadonlyMap<string, number>;
}
/**
 * The game's synced counters beside the rows (`state.game`): the team counters, keyed by
 * `teamCounterKey` (`'red:<name>'`, `'blue:<name>'`), and the global counters, by name. Each
 * player's own counters are in their row (`GamePlayerRow.counters`).
 */
export interface GameCounterMaps {
    teamCounters: ReadonlyMap<string, number>;
    globalCounters: ReadonlyMap<string, number>;
}
/**
 * The key of a team counter in the synced `teamCounters` map (`GameCounterMaps`): the team, a
 * colon, the counter name (`'red:shared'`).
 */
export declare function teamCounterKey(team: 'red' | 'blue', name: string): string;
/** A match's winner: a player (by session id), a team, or null for a draw. */
export type GameWinner = {
    kind: 'player';
    id: string;
} | {
    kind: 'team';
    team: 'red' | 'blue';
} | null;
/** The winner as synced: '' (draw or none yet), 'player:<sessionId>', 'team:red' or 'team:blue'. */
export declare function encodeGameWinner(winner: GameWinner): string;
export declare function decodeGameWinner(text: string): GameWinner;
/** What the room announces to everyone (message `game-event`); ids are session ids. */
export type GameWireEvent = {
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
/** A player's strike with the tool in hand was accepted: everyone else shows it on them (one per strike). */
 | {
    type: 'struck';
    id: string;
}
/** `winner` encoded as in `encodeGameWinner`. */
 | {
    type: 'match_won';
    winner: string;
}
/** A rule's `show_message` text; sent only to the players it names. */
 | {
    type: 'message';
    text: string;
}
/** A player got on or off a rideable item (`item` is its instance id). */
 | {
    type: 'mounted' | 'dismounted';
    id: string;
    item: string;
}
/** A player says a voice line (a store item id; lip sync, P2-44): play it from them, with their mouth moving. */
 | {
    type: 'said';
    id: string;
    line: string;
};
/**
 * A positive whole number from an instance param, given as a number or a numeric string (the
 * builder's param field may store either). The old gates' `order` is read through it.
 */
export declare function positiveInt(value: unknown): number | undefined;
export {};
