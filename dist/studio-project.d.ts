import { z } from 'zod';
import { LabProjectData, type Style, type WorldSeed } from '@genvr/contracts';
export declare const STUDIO_PROJECT_BYTES: number;
export declare const StudioProject: z.ZodObject<{
    format: z.ZodLiteral<"genvr-studio">;
    version: z.ZodLiteral<1>;
    id: z.ZodString;
    title: z.ZodString;
    play: z.ZodObject<{
        orientation: z.ZodEnum<{
            any: "any";
            landscape: "landscape";
            portrait: "portrait";
        }>;
        view: z.ZodDefault<z.ZodEnum<{
            free: "free";
            side: "side";
        }>>;
        moves: z.ZodDefault<z.ZodArray<z.ZodEnum<{
            "double-jump": "double-jump";
            "wall-jump": "wall-jump";
            dash: "dash";
        }>>>;
        devices: z.ZodArray<z.ZodEnum<{
            phone: "phone";
            tablet: "tablet";
            computer: "computer";
            tv: "tv";
            vr: "vr";
        }>>;
    }, z.core.$strip>;
    world: z.ZodObject<{
        schemaVersion: z.ZodLiteral<1>;
        experienceId: z.ZodString;
        version: z.ZodNumber;
        type: z.ZodOptional<z.ZodEnum<{
            game: "game";
            event: "event";
            social: "social";
        }>>;
        style: z.ZodObject<{
            base: z.ZodEnum<{
                realistic: "realistic";
                blocky: "blocky";
                anime: "anime";
                voxel: "voxel";
            }>;
            accent: z.ZodOptional<z.ZodEnum<{
                realistic: "realistic";
                blocky: "blocky";
                anime: "anime";
                voxel: "voxel";
            }>>;
            snowLine: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
            autoRock: z.ZodOptional<z.ZodBoolean>;
            grass: z.ZodOptional<z.ZodObject<{
                on: z.ZodBoolean;
                density: z.ZodNumber;
            }, z.core.$strip>>;
            woods: z.ZodOptional<z.ZodObject<{
                on: z.ZodBoolean;
                density: z.ZodNumber;
            }, z.core.$strip>>;
            water: z.ZodOptional<z.ZodObject<{
                clarity: z.ZodNumber;
                waves: z.ZodEnum<{
                    calm: "calm";
                    normal: "normal";
                    rough: "rough";
                }>;
            }, z.core.$strip>>;
        }, z.core.$strip>;
        sizeTier: z.ZodEnum<{
            small: "small";
            medium: "medium";
            large: "large";
            huge: "huge";
            max: "max";
        }>;
        access: z.ZodDiscriminatedUnion<[z.ZodObject<{
            mode: z.ZodLiteral<"private">;
        }, z.core.$strip>, z.ZodObject<{
            mode: z.ZodLiteral<"friends">;
        }, z.core.$strip>, z.ZodObject<{
            mode: z.ZodLiteral<"invite">;
        }, z.core.$strip>, z.ZodObject<{
            mode: z.ZodLiteral<"password">;
            passwordHash: z.ZodString;
        }, z.core.$strip>, z.ZodObject<{
            mode: z.ZodLiteral<"public">;
        }, z.core.$strip>, z.ZodObject<{
            mode: z.ZodLiteral<"subscription">;
            productId: z.ZodString;
        }, z.core.$strip>, z.ZodObject<{
            mode: z.ZodLiteral<"class">;
            classId: z.ZodString;
        }, z.core.$strip>], "mode">;
        environment: z.ZodObject<{
            lighting: z.ZodOptional<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                name: z.ZodString;
                enabled: z.ZodDefault<z.ZodBoolean>;
                color: z.ZodDefault<z.ZodString>;
                intensity: z.ZodDefault<z.ZodNumber>;
                angle: z.ZodDefault<z.ZodNumber>;
                softness: z.ZodDefault<z.ZodNumber>;
                distance: z.ZodDefault<z.ZodNumber>;
                actor: z.ZodDefault<z.ZodNullable<z.ZodString>>;
                position: z.ZodDefault<z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>>;
                target: z.ZodDefault<z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>>;
            }, z.core.$strict>>>;
            sky: z.ZodObject<{
                preset: z.ZodEnum<{
                    day: "day";
                    sunset: "sunset";
                    night: "night";
                    storm: "storm";
                    tropical: "tropical";
                }>;
                params: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            }, z.core.$strip>;
            weather: z.ZodObject<{
                preset: z.ZodEnum<{
                    snow: "snow";
                    storm: "storm";
                    clear: "clear";
                    rain: "rain";
                    fog: "fog";
                    sandstorm: "sandstorm";
                }>;
                params: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            }, z.core.$strip>;
            water: z.ZodDefault<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                name: z.ZodOptional<z.ZodString>;
                kind: z.ZodEnum<{
                    sea: "sea";
                    lake: "lake";
                    river: "river";
                }>;
                area: z.ZodArray<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
                level: z.ZodNumber;
                params: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            }, z.core.$strip>>>;
            rivers: z.ZodDefault<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                name: z.ZodOptional<z.ZodString>;
                points: z.ZodArray<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
                width: z.ZodDefault<z.ZodNumber>;
                widen: z.ZodDefault<z.ZodNumber>;
                flow: z.ZodDefault<z.ZodNumber>;
                params: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            }, z.core.$strip>>>;
            sea: z.ZodOptional<z.ZodObject<{
                level: z.ZodNumber;
                resourceId: z.ZodOptional<z.ZodEnum<{
                    "genvr.core.water.tidewater-ocean": "genvr.core.water.tidewater-ocean";
                }>>;
                swell: z.ZodOptional<z.ZodObject<{
                    direction: z.ZodOptional<z.ZodNumber>;
                    period: z.ZodOptional<z.ZodNumber>;
                    height: z.ZodOptional<z.ZodNumber>;
                }, z.core.$strip>>;
                params: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            }, z.core.$strip>>;
        }, z.core.$strip>;
        terrain: z.ZodObject<{
            fieldSets: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
                descriptor: z.ZodObject<{
                    schemaVersion: z.ZodLiteral<1>;
                    id: z.ZodString;
                    origin: z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>;
                    spacing: z.ZodNumber;
                    width: z.ZodNumber;
                    height: z.ZodNumber;
                    sampling: z.ZodEnum<{
                        "cell-center": "cell-center";
                        vertex: "vertex";
                    }>;
                    channels: z.ZodArray<z.ZodObject<{
                        id: z.ZodString;
                        encoding: z.ZodEnum<{
                            u8: "u8";
                            f32le: "f32le";
                        }>;
                        range: z.ZodOptional<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
                    }, z.core.$strict>>;
                    heightBinding: z.ZodOptional<z.ZodObject<{
                        channel: z.ZodString;
                        offset: z.ZodNumber;
                    }, z.core.$strict>>;
                }, z.core.$strict>;
                tiles: z.ZodArray<z.ZodString>;
            }, z.core.$strict>>>;
            activeSurface: z.ZodOptional<z.ZodObject<{
                setId: z.ZodString;
                outsideHeight: z.ZodNumber;
                edge: z.ZodEnum<{
                    clamp: "clamp";
                    constant: "constant";
                }>;
                farEdge: z.ZodEnum<{
                    inclusive: "inclusive";
                    exclusive: "exclusive";
                }>;
                materialBindings: z.ZodOptional<z.ZodArray<z.ZodObject<{
                    itemId: z.ZodString;
                    inputs: z.ZodRecord<z.ZodString, z.ZodObject<{
                        channel: z.ZodString;
                        scale: z.ZodNumber;
                    }, z.core.$strict>>;
                }, z.core.$strict>>>;
            }, z.core.$strict>>;
            chunkSizeMeters: z.ZodDefault<z.ZodNumber>;
            materials: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
                id: z.ZodString;
                soil: z.ZodEnum<{
                    grass: "grass";
                    dirt: "dirt";
                    sand: "sand";
                    rock: "rock";
                    snow: "snow";
                    mud: "mud";
                }>;
            }, z.core.$strip>>>;
            chunks: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
            world: z.ZodOptional<z.ZodObject<{
                seed: z.ZodNumber;
                kind: z.ZodEnum<{
                    plain: "plain";
                    valley: "valley";
                    island: "island";
                    mountains: "mountains";
                }>;
                generator: z.ZodUnion<readonly [z.ZodLiteral<1>, z.ZodLiteral<2>]>;
            }, z.core.$strip>>;
        }, z.core.$strip>;
        voxels: z.ZodOptional<z.ZodObject<{
            seed: z.ZodNumber;
            generator: z.ZodLiteral<1>;
        }, z.core.$strip>>;
        game: z.ZodOptional<z.ZodCodec<z.ZodObject<{
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
        }, z.core.$strip>>>;
        scripts: z.ZodOptional<z.ZodArray<z.ZodObject<{
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
        }, z.core.$strip>>>;
        story: z.ZodOptional<z.ZodObject<{
            title: z.ZodOptional<z.ZodString>;
            stops: z.ZodArray<z.ZodObject<{
                camera: z.ZodObject<{
                    position: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
                    target: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
                    fov: z.ZodOptional<z.ZodNumber>;
                    ease: z.ZodDefault<z.ZodEnum<{
                        out: "out";
                        in: "in";
                        linear: "linear";
                        in_out: "in_out";
                    }>>;
                }, z.core.$strict>;
                kicker: z.ZodOptional<z.ZodString>;
                title: z.ZodDefault<z.ZodString>;
                text: z.ZodOptional<z.ZodString>;
                side: z.ZodDefault<z.ZodEnum<{
                    left: "left";
                    right: "right";
                    center: "center";
                }>>;
            }, z.core.$strict>>;
        }, z.core.$strict>>;
        instances: z.ZodDefault<z.ZodCodec<z.ZodArray<z.ZodObject<{
            instanceId: z.ZodString;
            itemId: z.ZodString;
            itemVersion: z.ZodOptional<z.ZodString>;
            transform: z.ZodObject<{
                position: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
                rotation: z.ZodDefault<z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber], null>>;
                scale: z.ZodDefault<z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>>;
            }, z.core.$strip>;
            params: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            name: z.ZodOptional<z.ZodString>;
            groupId: z.ZodOptional<z.ZodString>;
            locked: z.ZodOptional<z.ZodBoolean>;
            anchored: z.ZodOptional<z.ZodBoolean>;
            floats: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$strip>>, z.ZodArray<z.ZodObject<{
            instanceId: z.ZodString;
            itemId: z.ZodString;
            itemVersion: z.ZodOptional<z.ZodString>;
            transform: z.ZodObject<{
                position: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
                rotation: z.ZodDefault<z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber], null>>;
                scale: z.ZodDefault<z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>>;
            }, z.core.$strip>;
            params: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            name: z.ZodOptional<z.ZodString>;
            groupId: z.ZodOptional<z.ZodString>;
            locked: z.ZodOptional<z.ZodBoolean>;
            anchored: z.ZodOptional<z.ZodBoolean>;
            floats: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$strip>>>>;
        roads: z.ZodDefault<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodOptional<z.ZodString>;
            points: z.ZodArray<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
            width: z.ZodDefault<z.ZodNumber>;
            materialId: z.ZodOptional<z.ZodString>;
            lanes: z.ZodOptional<z.ZodNumber>;
            oneway: z.ZodOptional<z.ZodBoolean>;
            sidewalk: z.ZodOptional<z.ZodNumber>;
            sidewalkSide: z.ZodOptional<z.ZodEnum<{
                both: "both";
                left: "left";
                right: "right";
            }>>;
        }, z.core.$strip>>>;
        walls: z.ZodDefault<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodOptional<z.ZodString>;
            points: z.ZodArray<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
            height: z.ZodDefault<z.ZodNumber>;
            closed: z.ZodDefault<z.ZodBoolean>;
            materialId: z.ZodOptional<z.ZodString>;
            openings: z.ZodDefault<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                kind: z.ZodEnum<{
                    door: "door";
                    window: "window";
                }>;
                segment: z.ZodNumber;
                offset: z.ZodNumber;
                width: z.ZodNumber;
                height: z.ZodNumber;
                bottom: z.ZodNumber;
            }, z.core.$strip>>>;
            building: z.ZodOptional<z.ZodObject<{
                facade: z.ZodOptional<z.ZodEnum<{
                    plaster: "plaster";
                    brick: "brick";
                    stone: "stone";
                    concrete: "concrete";
                    wood: "wood";
                }>>;
                facadeColor: z.ZodOptional<z.ZodString>;
                levels: z.ZodOptional<z.ZodNumber>;
                roofShape: z.ZodOptional<z.ZodEnum<{
                    flat: "flat";
                    gabled: "gabled";
                    hipped: "hipped";
                    pyramidal: "pyramidal";
                    skillion: "skillion";
                }>>;
                roofHeight: z.ZodOptional<z.ZodNumber>;
                roofMaterial: z.ZodOptional<z.ZodEnum<{
                    tiles: "tiles";
                    concrete: "concrete";
                    slate: "slate";
                    metal: "metal";
                    thatch: "thatch";
                }>>;
                roofColor: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>;
        }, z.core.$strip>>>;
        pavings: z.ZodDefault<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodOptional<z.ZodString>;
            area: z.ZodArray<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
            materialId: z.ZodString;
        }, z.core.$strip>>>;
        groups: z.ZodDefault<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
        }, z.core.$strip>>>;
        spawn: z.ZodObject<{
            position: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
            rotation: z.ZodDefault<z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber], null>>;
            scale: z.ZodDefault<z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>>;
        }, z.core.$strip>;
    }, z.core.$strip>;
    avatarBodies: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodEnum<{
        classic: "classic";
        simple: "simple";
        starter: "starter";
        human: "human";
        robot: "robot";
    }>>>;
    terrainChunks: z.ZodArray<z.ZodString>;
    assets: z.ZodDefault<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        manifest: z.ZodObject<{
            schemaVersion: z.ZodLiteral<1>;
            id: z.ZodString;
            name: z.ZodString;
            version: z.ZodString;
            type: z.ZodEnum<{
                model: "model";
                environment: "environment";
                material: "material";
                "style-pack": "style-pack";
                avatar: "avatar";
                clothing: "clothing";
                animation: "animation";
                vfx: "vfx";
                audio: "audio";
                script: "script";
                kit: "kit";
                "ui-kit": "ui-kit";
                plugin: "plugin";
                "live-camera": "live-camera";
            }>;
            category: z.ZodEnum<{
                environment: "environment";
                audio: "audio";
                "3d-models": "3d-models";
                styles: "styles";
                "avatar-appearance": "avatar-appearance";
                "visual-effects": "visual-effects";
                "2d": "2d";
                gameplay: "gameplay";
                plugins: "plugins";
            }>;
            subcategory: z.ZodString;
            styles: z.ZodArray<z.ZodEnum<{
                realistic: "realistic";
                blocky: "blocky";
                anime: "anime";
                voxel: "voxel";
            }>>;
            author: z.ZodObject<{
                id: z.ZodString;
                name: z.ZodString;
            }, z.core.$strip>;
            source: z.ZodEnum<{
                core: "core";
                user: "user";
                ai: "ai";
                external: "external";
            }>;
            bundle: z.ZodOptional<z.ZodArray<z.ZodObject<{
                itemId: z.ZodString;
                name: z.ZodString;
                contentHash: z.ZodString;
            }, z.core.$strip>>>;
            bundleParent: z.ZodOptional<z.ZodString>;
            testPurchase: z.ZodOptional<z.ZodObject<{
                receiptId: z.ZodString;
                sourceId: z.ZodString;
            }, z.core.$strip>>;
            builder: z.ZodOptional<z.ZodObject<{
                experienceId: z.ZodString;
                requestId: z.ZodString;
                requestHash: z.ZodString;
                destination: z.ZodEnum<{
                    game: "game";
                    marketplace: "marketplace";
                }>;
                fileDigests: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
                snapshot: z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
                credits: z.ZodArray<z.ZodObject<{
                    itemId: z.ZodString;
                    name: z.ZodString;
                    license: z.ZodString;
                    author: z.ZodObject<{
                        id: z.ZodString;
                        name: z.ZodString;
                    }, z.core.$strip>;
                    origin: z.ZodOptional<z.ZodObject<{
                        provider: z.ZodEnum<{
                            polyhaven: "polyhaven";
                            kenney: "kenney";
                            sketchfab: "sketchfab";
                        }>;
                        assetId: z.ZodString;
                        page: z.ZodString;
                        license: z.ZodString;
                        authors: z.ZodArray<z.ZodString>;
                    }, z.core.$strip>>;
                }, z.core.$strip>>;
            }, z.core.$strip>>;
            license: z.ZodString;
            price: z.ZodDiscriminatedUnion<[z.ZodObject<{
                type: z.ZodLiteral<"free">;
            }, z.core.$strip>, z.ZodObject<{
                type: z.ZodLiteral<"paid">;
                coins: z.ZodNumber;
            }, z.core.$strip>, z.ZodObject<{
                type: z.ZodLiteral<"subscription">;
            }, z.core.$strip>], "type">;
            entry: z.ZodDefault<z.ZodObject<{
                model: z.ZodOptional<z.ZodString>;
                lods: z.ZodOptional<z.ZodArray<z.ZodString>>;
                script: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>;
            physics: z.ZodOptional<z.ZodObject<{
                collider: z.ZodDefault<z.ZodEnum<{
                    none: "none";
                    box: "box";
                    sphere: "sphere";
                    capsule: "capsule";
                    mesh: "mesh";
                }>>;
                buoyancy: z.ZodOptional<z.ZodNumber>;
                friction: z.ZodOptional<z.ZodNumber>;
                floats: z.ZodOptional<z.ZodBoolean>;
                climbable: z.ZodOptional<z.ZodBoolean>;
            }, z.core.$strip>>;
            look: z.ZodOptional<z.ZodObject<{
                body: z.ZodDefault<z.ZodUnion<readonly [z.ZodEnum<{
                    flat: "flat";
                    classic: "classic";
                    simple: "simple";
                    starter: "starter";
                    "anime-boy": "anime-boy";
                    warrior: "warrior";
                    human: "human";
                    robot: "robot";
                }>, z.ZodType<`user.${string}`, unknown, z.core.$ZodTypeInternals<`user.${string}`, unknown>>]>>;
                scale: z.ZodDefault<z.ZodObject<{
                    height: z.ZodDefault<z.ZodNumber>;
                    width: z.ZodDefault<z.ZodNumber>;
                    head: z.ZodDefault<z.ZodNumber>;
                }, z.core.$strip>>;
                skin: z.ZodDefault<z.ZodString>;
                hair: z.ZodDefault<z.ZodString>;
                shirt: z.ZodDefault<z.ZodString>;
                pants: z.ZodDefault<z.ZodString>;
                shoes: z.ZodDefault<z.ZodString>;
                skinMaterial: z.ZodOptional<z.ZodString>;
                animeShape: z.ZodOptional<z.ZodNumber>;
                build: z.ZodOptional<z.ZodRecord<z.ZodEnum<{
                    muscle: "muscle";
                    fat: "fat";
                    fatPattern: "fatPattern";
                    definition: "definition";
                    "muscle.neck": "muscle.neck";
                    "muscle.shoulders": "muscle.shoulders";
                    "muscle.chest": "muscle.chest";
                    "muscle.traps": "muscle.traps";
                    "muscle.lats": "muscle.lats";
                    "muscle.biceps": "muscle.biceps";
                    "muscle.triceps": "muscle.triceps";
                    "muscle.forearms": "muscle.forearms";
                    "muscle.abs": "muscle.abs";
                    "muscle.obliques": "muscle.obliques";
                    "muscle.waist": "muscle.waist";
                    "muscle.lowerBack": "muscle.lowerBack";
                    "muscle.hips": "muscle.hips";
                    "muscle.glutes": "muscle.glutes";
                    "muscle.quads": "muscle.quads";
                    "muscle.hamstrings": "muscle.hamstrings";
                    "muscle.calves": "muscle.calves";
                    "muscle.hands": "muscle.hands";
                    "fat.forearms": "fat.forearms";
                    "fat.waist": "fat.waist";
                    "fat.hips": "fat.hips";
                    "fat.calves": "fat.calves";
                    "fat.belly": "fat.belly";
                    "fat.buttocks": "fat.buttocks";
                    "fat.thighs": "fat.thighs";
                    "fat.upperArms": "fat.upperArms";
                    "fat.face": "fat.face";
                    "fat.chin": "fat.chin";
                    "face.eyeSize": "face.eyeSize";
                    "face.eyeOpen": "face.eyeOpen";
                    "face.eyeSpacing": "face.eyeSpacing";
                    "face.eyeHeight": "face.eyeHeight";
                    "face.eyeTilt": "face.eyeTilt";
                    "face.eyeFold": "face.eyeFold";
                    "face.eyeDepth": "face.eyeDepth";
                    "face.browHeight": "face.browHeight";
                    "face.browAngle": "face.browAngle";
                    "face.noseSize": "face.noseSize";
                    "face.noseWidth": "face.noseWidth";
                    "face.noseLength": "face.noseLength";
                    "face.noseBridge": "face.noseBridge";
                    "face.noseTip": "face.noseTip";
                    "face.nostrils": "face.nostrils";
                    "face.noseDepth": "face.noseDepth";
                    "face.mouthWidth": "face.mouthWidth";
                    "face.mouthHeight": "face.mouthHeight";
                    "face.upperLip": "face.upperLip";
                    "face.lowerLip": "face.lowerLip";
                    "face.mouthCorners": "face.mouthCorners";
                    "face.cheekVolume": "face.cheekVolume";
                    "face.cheekBones": "face.cheekBones";
                    "face.cheekInner": "face.cheekInner";
                    "face.chinWidth": "face.chinWidth";
                    "face.chinHeight": "face.chinHeight";
                    "face.chinForward": "face.chinForward";
                    "face.jawWidth": "face.jawWidth";
                    "face.headWidth": "face.headWidth";
                    "face.headLength": "face.headLength";
                }> & z.core.$partial, z.ZodNumber>>;
                humanHair: z.ZodOptional<z.ZodObject<{
                    head: z.ZodOptional<z.ZodEnum<{
                        "hair.short01": "hair.short01";
                        "hair.short02": "hair.short02";
                        "hair.short03": "hair.short03";
                        "hair.short04": "hair.short04";
                    }>>;
                    brows: z.ZodOptional<z.ZodEnum<{
                        "brows.eyebrow001": "brows.eyebrow001";
                        "brows.eyebrow006": "brows.eyebrow006";
                        "brows.eyebrow010": "brows.eyebrow010";
                    }>>;
                    beard: z.ZodOptional<z.ZodEnum<{
                        "beard.viking": "beard.viking";
                        "beard.moustache": "beard.moustache";
                    }>>;
                }, z.core.$strict>>;
                wear: z.ZodDefault<z.ZodArray<z.ZodString>>;
            }, z.core.$strip>>;
            voice: z.ZodOptional<z.ZodObject<{
                sound: z.ZodString;
                duration: z.ZodNumber;
                cues: z.ZodArray<z.ZodObject<{
                    at: z.ZodNumber;
                    shape: z.ZodEnum<{
                        A: "A";
                        B: "B";
                        C: "C";
                        D: "D";
                        E: "E";
                        F: "F";
                        G: "G";
                        H: "H";
                        X: "X";
                    }>;
                }, z.core.$strip>>;
            }, z.core.$strip>>;
            body: z.ZodOptional<z.ZodObject<{
                model: z.ZodString;
                picture: z.ZodOptional<z.ZodString>;
                height: z.ZodNumber;
                use: z.ZodDefault<z.ZodEnum<{
                    place: "place";
                    store: "store";
                }>>;
                joints: z.ZodArray<z.ZodObject<{
                    name: z.ZodString;
                    parent: z.ZodNullable<z.ZodString>;
                    at: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
                }, z.core.$strip>>;
            }, z.core.$strip>>;
            tool: z.ZodOptional<z.ZodObject<{
                kind: z.ZodLiteral<"melee">;
                damage: z.ZodNumber;
                reach: z.ZodNumber;
                arcDeg: z.ZodNumber;
                cooldownSec: z.ZodNumber;
            }, z.core.$strip>>;
            marker: z.ZodOptional<z.ZodObject<{
                kind: z.ZodEnum<{
                    zone: "zone";
                    spawn: "spawn";
                }>;
            }, z.core.$strip>>;
            ride: z.ZodOptional<z.ZodObject<{
                seats: z.ZodOptional<z.ZodNumber>;
                maxSpeed: z.ZodOptional<z.ZodNumber>;
                reverse: z.ZodOptional<z.ZodNumber>;
                accel: z.ZodOptional<z.ZodNumber>;
                turn: z.ZodOptional<z.ZodNumber>;
                grip: z.ZodOptional<z.ZodNumber>;
                gravity: z.ZodOptional<z.ZodNumber>;
                climb: z.ZodOptional<z.ZodNumber>;
                glide: z.ZodOptional<z.ZodBoolean>;
                ceiling: z.ZodOptional<z.ZodNumber>;
                camera: z.ZodOptional<z.ZodNumber>;
                seatHeight: z.ZodOptional<z.ZodNumber>;
                pose: z.ZodOptional<z.ZodEnum<{
                    sit: "sit";
                    stand: "stand";
                }>>;
                reach: z.ZodOptional<z.ZodNumber>;
                exit: z.ZodOptional<z.ZodNumber>;
                returnSec: z.ZodOptional<z.ZodNumber>;
                tag: z.ZodOptional<z.ZodString>;
                model: z.ZodOptional<z.ZodEnum<{
                    ground: "ground";
                    water: "water";
                    air: "air";
                }>>;
            }, z.core.$strip>>;
            material: z.ZodOptional<z.ZodObject<{
                kind: z.ZodString;
                tags: z.ZodDefault<z.ZodArray<z.ZodString>>;
            }, z.core.$strip>>;
            params: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            audio: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
            placement: z.ZodOptional<z.ZodObject<{
                stands: z.ZodOptional<z.ZodArray<z.ZodEnum<{
                    ground: "ground";
                    water: "water";
                    built: "built";
                }>>>;
                soils: z.ZodOptional<z.ZodArray<z.ZodEnum<{
                    grass: "grass";
                    dirt: "dirt";
                    sand: "sand";
                    rock: "rock";
                    snow: "snow";
                    mud: "mud";
                }>>>;
                maxTilt: z.ZodOptional<z.ZodNumber>;
                maxSlope: z.ZodOptional<z.ZodNumber>;
                clearFront: z.ZodOptional<z.ZodNumber>;
                rest: z.ZodOptional<z.ZodObject<{
                    mode: z.ZodEnum<{
                        upright: "upright";
                        tilt: "tilt";
                        grade: "grade";
                        foundation: "foundation";
                        float: "float";
                    }>;
                    sink: z.ZodOptional<z.ZodNumber>;
                    base: z.ZodOptional<z.ZodObject<{
                        min: z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>;
                        max: z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>;
                    }, z.core.$strip>>;
                }, z.core.$strip>>;
            }, z.core.$strip>>;
            budget: z.ZodObject<{
                triangles: z.ZodNumber;
                textureMB: z.ZodNumber;
                mobileReady: z.ZodBoolean;
            }, z.core.$strip>;
            dependencies: z.ZodDefault<z.ZodArray<z.ZodString>>;
            facets: z.ZodDefault<z.ZodObject<{
                hasScript: z.ZodDefault<z.ZodBoolean>;
                rigged: z.ZodDefault<z.ZodBoolean>;
            }, z.core.$strip>>;
            trainingConsent: z.ZodBoolean;
            origin: z.ZodOptional<z.ZodObject<{
                provider: z.ZodEnum<{
                    polyhaven: "polyhaven";
                    kenney: "kenney";
                    sketchfab: "sketchfab";
                }>;
                assetId: z.ZodString;
                page: z.ZodString;
                license: z.ZodString;
                authors: z.ZodArray<z.ZodString>;
            }, z.core.$strip>>;
        }, z.core.$strip>;
        files: z.ZodArray<z.ZodObject<{
            path: z.ZodString;
            contentType: z.ZodString;
            data: z.ZodString;
        }, z.core.$strict>>;
    }, z.core.$strict>>>;
    lab: z.ZodOptional<z.ZodObject<{
        format: z.ZodDefault<z.ZodLiteral<1>>;
        course: z.ZodDefault<z.ZodObject<{
            format: z.ZodDefault<z.ZodLiteral<1>>;
            seed: z.ZodDefault<z.ZodNumber>;
            obstacles: z.ZodDefault<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
                kind: z.ZodLiteral<"step">;
                height: z.ZodDefault<z.ZodNumber>;
                depth: z.ZodDefault<z.ZodNumber>;
                width: z.ZodDefault<z.ZodNumber>;
                id: z.ZodString;
                z: z.ZodNumber;
                x: z.ZodDefault<z.ZodNumber>;
                hidden: z.ZodDefault<z.ZodBoolean>;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"ramp">;
                rise: z.ZodDefault<z.ZodNumber>;
                length: z.ZodDefault<z.ZodNumber>;
                top: z.ZodDefault<z.ZodNumber>;
                width: z.ZodDefault<z.ZodNumber>;
                id: z.ZodString;
                z: z.ZodNumber;
                x: z.ZodDefault<z.ZodNumber>;
                hidden: z.ZodDefault<z.ZodBoolean>;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"gap">;
                width: z.ZodDefault<z.ZodNumber>;
                height: z.ZodDefault<z.ZodNumber>;
                landing: z.ZodDefault<z.ZodNumber>;
                landing_depth: z.ZodDefault<z.ZodNumber>;
                lane: z.ZodDefault<z.ZodNumber>;
                id: z.ZodString;
                z: z.ZodNumber;
                x: z.ZodDefault<z.ZodNumber>;
                hidden: z.ZodDefault<z.ZodBoolean>;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"low_wall">;
                height: z.ZodDefault<z.ZodNumber>;
                thickness: z.ZodDefault<z.ZodNumber>;
                width: z.ZodDefault<z.ZodNumber>;
                id: z.ZodString;
                z: z.ZodNumber;
                x: z.ZodDefault<z.ZodNumber>;
                hidden: z.ZodDefault<z.ZodBoolean>;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"window">;
                sill: z.ZodDefault<z.ZodNumber>;
                opening_width: z.ZodDefault<z.ZodNumber>;
                opening_height: z.ZodDefault<z.ZodNumber>;
                wall_height: z.ZodDefault<z.ZodNumber>;
                wall_width: z.ZodDefault<z.ZodNumber>;
                thickness: z.ZodDefault<z.ZodNumber>;
                id: z.ZodString;
                z: z.ZodNumber;
                x: z.ZodDefault<z.ZodNumber>;
                hidden: z.ZodDefault<z.ZodBoolean>;
            }, z.core.$strict>], "kind">>>;
            street: z.ZodDefault<z.ZodNullable<z.ZodObject<{
                z: z.ZodDefault<z.ZodNumber>;
                lanes: z.ZodDefault<z.ZodNumber>;
                lane_width: z.ZodDefault<z.ZodNumber>;
                crossing: z.ZodDefault<z.ZodBoolean>;
                light: z.ZodDefault<z.ZodObject<{
                    cycle_s: z.ZodDefault<z.ZodNumber>;
                    red_s: z.ZodDefault<z.ZodNumber>;
                }, z.core.$strict>>;
            }, z.core.$strict>>>;
            cars: z.ZodDefault<z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                lane: z.ZodDefault<z.ZodNumber>;
                speed: z.ZodDefault<z.ZodNumber>;
                offset_s: z.ZodDefault<z.ZodNumber>;
                runs_red: z.ZodDefault<z.ZodBoolean>;
            }, z.core.$strict>>>;
            finish_z: z.ZodDefault<z.ZodNumber>;
        }, z.core.$strict>>;
        settings: z.ZodDefault<z.ZodObject<{
            motion: z.ZodDefault<z.ZodString>;
            character: z.ZodDefault<z.ZodString>;
            speed: z.ZodDefault<z.ZodNumber>;
            stride: z.ZodDefault<z.ZodNumber>;
            step_height: z.ZodDefault<z.ZodNumber>;
            jump_timing_ms: z.ZodDefault<z.ZodNumber>;
            blend_s: z.ZodDefault<z.ZodNumber>;
            lean_deg: z.ZodDefault<z.ZodNumber>;
            wait_for_green: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strict>>;
        runs: z.ZodDefault<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            at: z.ZodString;
            seed: z.ZodNumber;
            settings: z.ZodObject<{
                motion: z.ZodDefault<z.ZodString>;
                character: z.ZodDefault<z.ZodString>;
                speed: z.ZodDefault<z.ZodNumber>;
                stride: z.ZodDefault<z.ZodNumber>;
                step_height: z.ZodDefault<z.ZodNumber>;
                jump_timing_ms: z.ZodDefault<z.ZodNumber>;
                blend_s: z.ZodDefault<z.ZodNumber>;
                lean_deg: z.ZodDefault<z.ZodNumber>;
                wait_for_green: z.ZodDefault<z.ZodBoolean>;
            }, z.core.$strict>;
            course: z.ZodObject<{
                format: z.ZodDefault<z.ZodLiteral<1>>;
                seed: z.ZodDefault<z.ZodNumber>;
                obstacles: z.ZodDefault<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
                    kind: z.ZodLiteral<"step">;
                    height: z.ZodDefault<z.ZodNumber>;
                    depth: z.ZodDefault<z.ZodNumber>;
                    width: z.ZodDefault<z.ZodNumber>;
                    id: z.ZodString;
                    z: z.ZodNumber;
                    x: z.ZodDefault<z.ZodNumber>;
                    hidden: z.ZodDefault<z.ZodBoolean>;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"ramp">;
                    rise: z.ZodDefault<z.ZodNumber>;
                    length: z.ZodDefault<z.ZodNumber>;
                    top: z.ZodDefault<z.ZodNumber>;
                    width: z.ZodDefault<z.ZodNumber>;
                    id: z.ZodString;
                    z: z.ZodNumber;
                    x: z.ZodDefault<z.ZodNumber>;
                    hidden: z.ZodDefault<z.ZodBoolean>;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"gap">;
                    width: z.ZodDefault<z.ZodNumber>;
                    height: z.ZodDefault<z.ZodNumber>;
                    landing: z.ZodDefault<z.ZodNumber>;
                    landing_depth: z.ZodDefault<z.ZodNumber>;
                    lane: z.ZodDefault<z.ZodNumber>;
                    id: z.ZodString;
                    z: z.ZodNumber;
                    x: z.ZodDefault<z.ZodNumber>;
                    hidden: z.ZodDefault<z.ZodBoolean>;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"low_wall">;
                    height: z.ZodDefault<z.ZodNumber>;
                    thickness: z.ZodDefault<z.ZodNumber>;
                    width: z.ZodDefault<z.ZodNumber>;
                    id: z.ZodString;
                    z: z.ZodNumber;
                    x: z.ZodDefault<z.ZodNumber>;
                    hidden: z.ZodDefault<z.ZodBoolean>;
                }, z.core.$strict>, z.ZodObject<{
                    kind: z.ZodLiteral<"window">;
                    sill: z.ZodDefault<z.ZodNumber>;
                    opening_width: z.ZodDefault<z.ZodNumber>;
                    opening_height: z.ZodDefault<z.ZodNumber>;
                    wall_height: z.ZodDefault<z.ZodNumber>;
                    wall_width: z.ZodDefault<z.ZodNumber>;
                    thickness: z.ZodDefault<z.ZodNumber>;
                    id: z.ZodString;
                    z: z.ZodNumber;
                    x: z.ZodDefault<z.ZodNumber>;
                    hidden: z.ZodDefault<z.ZodBoolean>;
                }, z.core.$strict>], "kind">>>;
                street: z.ZodDefault<z.ZodNullable<z.ZodObject<{
                    z: z.ZodDefault<z.ZodNumber>;
                    lanes: z.ZodDefault<z.ZodNumber>;
                    lane_width: z.ZodDefault<z.ZodNumber>;
                    crossing: z.ZodDefault<z.ZodBoolean>;
                    light: z.ZodDefault<z.ZodObject<{
                        cycle_s: z.ZodDefault<z.ZodNumber>;
                        red_s: z.ZodDefault<z.ZodNumber>;
                    }, z.core.$strict>>;
                }, z.core.$strict>>>;
                cars: z.ZodDefault<z.ZodArray<z.ZodObject<{
                    id: z.ZodString;
                    lane: z.ZodDefault<z.ZodNumber>;
                    speed: z.ZodDefault<z.ZodNumber>;
                    offset_s: z.ZodDefault<z.ZodNumber>;
                    runs_red: z.ZodDefault<z.ZodBoolean>;
                }, z.core.$strict>>>;
                finish_z: z.ZodDefault<z.ZodNumber>;
            }, z.core.$strict>;
            score: z.ZodObject<{
                foot_slide_cm: z.ZodNumber;
                penetration_cm: z.ZodNumber;
                fell: z.ZodBoolean;
                car_hit: z.ZodBoolean;
                finished: z.ZodBoolean;
                time_s: z.ZodNumber;
                smoothness: z.ZodNumber;
                total: z.ZodNumber;
            }, z.core.$strict>;
            events: z.ZodArray<z.ZodObject<{
                t: z.ZodNumber;
                kind: z.ZodEnum<{
                    start: "start";
                    finish: "finish";
                    window: "window";
                    step: "step";
                    ramp: "ramp";
                    crossing: "crossing";
                    car_hit: "car_hit";
                    gap_jump: "gap_jump";
                    land: "land";
                    vault: "vault";
                    wait: "wait";
                    car_near: "car_near";
                    fall: "fall";
                    slide: "slide";
                    blocked: "blocked";
                }>;
                label: z.ZodString;
                obstacle: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>>;
            version: z.ZodOptional<z.ZodString>;
            by: z.ZodDefault<z.ZodEnum<{
                person: "person";
                agent: "agent";
            }>>;
        }, z.core.$strict>>>;
        versions: z.ZodDefault<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            motion: z.ZodString;
            n: z.ZodNumber;
            note: z.ZodDefault<z.ZodString>;
            settings: z.ZodObject<{
                motion: z.ZodDefault<z.ZodString>;
                character: z.ZodDefault<z.ZodString>;
                speed: z.ZodDefault<z.ZodNumber>;
                stride: z.ZodDefault<z.ZodNumber>;
                step_height: z.ZodDefault<z.ZodNumber>;
                jump_timing_ms: z.ZodDefault<z.ZodNumber>;
                blend_s: z.ZodDefault<z.ZodNumber>;
                lean_deg: z.ZodDefault<z.ZodNumber>;
                wait_for_green: z.ZodDefault<z.ZodBoolean>;
            }, z.core.$strict>;
            score: z.ZodObject<{
                foot_slide_cm: z.ZodNumber;
                penetration_cm: z.ZodNumber;
                fell: z.ZodBoolean;
                car_hit: z.ZodBoolean;
                finished: z.ZodBoolean;
                time_s: z.ZodNumber;
                smoothness: z.ZodNumber;
                total: z.ZodNumber;
            }, z.core.$strict>;
            run: z.ZodString;
            best: z.ZodDefault<z.ZodBoolean>;
            by: z.ZodDefault<z.ZodEnum<{
                person: "person";
                agent: "agent";
            }>>;
            at: z.ZodString;
        }, z.core.$strict>>>;
        best_pending: z.ZodDefault<z.ZodNullable<z.ZodObject<{
            version: z.ZodString;
            by: z.ZodString;
        }, z.core.$strict>>>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type StudioProject = z.infer<typeof StudioProject>;
/** Local snapshots never enter the platform's format-1 command-journal import API. */
export declare function readStudioProject(input: unknown): StudioProject;
export declare function createStudioProject(style: Style, kind: WorldSeed['kind'] | 'empty' | 'small', play?: {
    orientation: "any" | "landscape" | "portrait";
    view: "side" | "free";
    moves: ("dash" | "double-jump" | "wall-jump")[];
    devices: ("phone" | "tablet" | "computer" | "tv" | "vr")[];
}): StudioProject;
/** A motion lab is its own project (Q-LAB-1): an empty flat world and the lab part; it never changes a real world. */
export declare function createLabProject(lab: LabProjectData, play?: {
    orientation: "any" | "landscape" | "portrait";
    view: "side" | "free";
    moves: ("dash" | "double-jump" | "wall-jump")[];
    devices: ("phone" | "tablet" | "computer" | "tv" | "vr")[];
}): StudioProject;
export declare function importStudioProject(text: string): StudioProject;
export interface StudioStorage {
    list(): Promise<Array<{
        id: string;
        title: string;
    }>>;
    read(id: string): Promise<StudioProject>;
    write(project: StudioProject): Promise<void>;
}
/** One transaction per project; a failed save leaves the previous complete record intact. */
export declare function browserStudioStorage(): StudioStorage;
