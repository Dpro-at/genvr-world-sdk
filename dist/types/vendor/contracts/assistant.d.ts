import { z } from 'zod';
/**
 * Correction logging (task P4-08): what a builder did with the assistant's work right after a
 * reply. `moved`, `deleted`, and `changed` carry the builder's command; `undone` means they took
 * the whole reply back; `kept` means they left it as it was.
 */
export declare const CorrectionKind: z.ZodEnum<{
    kept: "kept";
    moved: "moved";
    deleted: "deleted";
    changed: "changed";
    undone: "undone";
}>;
export type CorrectionKind = z.infer<typeof CorrectionKind>;
export declare const CorrectionReport: z.ZodObject<{
    prompt: z.ZodString;
    aiCommands: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
        type: z.ZodLiteral<"set_size_tier">;
        params: z.ZodObject<{
            sizeTier: z.ZodEnum<{
                small: "small";
                medium: "medium";
                large: "large";
                huge: "huge";
                max: "max";
            }>;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"add_paving">;
        params: z.ZodObject<{
            pavingId: z.ZodString;
            area: z.ZodArray<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
            materialId: z.ZodString;
            name: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"remove_paving">;
        params: z.ZodObject<{
            pavingId: z.ZodString;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"set_spawn">;
        params: z.ZodObject<{
            spawn: z.ZodObject<{
                position: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
                rotation: z.ZodDefault<z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber], null>>;
                scale: z.ZodDefault<z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>>;
            }, z.core.$strip>;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"set_terrain_surface">;
        params: z.ZodObject<{
            surface: z.ZodNullable<z.ZodObject<{
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
        }, z.core.$strict>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"create_field_set">;
        params: z.ZodObject<{
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
        }, z.core.$strict>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"set_field_tile">;
        params: z.ZodObject<{
            tile: z.ZodObject<{
                kind: z.ZodLiteral<"terrain-fields-v1">;
                setId: z.ZodString;
                tx: z.ZodNumber;
                tz: z.ZodNumber;
                cols: z.ZodNumber;
                rows: z.ZodNumber;
                channels: z.ZodRecord<z.ZodString, z.ZodString>;
            }, z.core.$strict>;
        }, z.core.$strict>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"remove_field_tile">;
        params: z.ZodObject<{
            setId: z.ZodString;
            tx: z.ZodNumber;
            tz: z.ZodNumber;
        }, z.core.$strict>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"remove_field_set">;
        params: z.ZodObject<{
            setId: z.ZodString;
        }, z.core.$strict>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"restore_field_tile">;
        params: z.ZodObject<{
            setId: z.ZodString;
            tx: z.ZodNumber;
            tz: z.ZodNumber;
            before: z.ZodNullable<z.ZodObject<{
                kind: z.ZodLiteral<"terrain-fields-v1">;
                setId: z.ZodString;
                tx: z.ZodNumber;
                tz: z.ZodNumber;
                cols: z.ZodNumber;
                rows: z.ZodNumber;
                channels: z.ZodRecord<z.ZodString, z.ZodString>;
            }, z.core.$strict>>;
            after: z.ZodNullable<z.ZodObject<{
                kind: z.ZodLiteral<"terrain-fields-v1">;
                setId: z.ZodString;
                tx: z.ZodNumber;
                tz: z.ZodNumber;
                cols: z.ZodNumber;
                rows: z.ZodNumber;
                channels: z.ZodRecord<z.ZodString, z.ZodString>;
            }, z.core.$strict>>;
        }, z.core.$strict>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"set_blocks">;
        params: z.ZodObject<{
            blocks: z.ZodArray<z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber], null>>;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"place_item">;
        params: z.ZodObject<{
            instanceId: z.ZodString;
            itemId: z.ZodString;
            position: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
            rotation: z.ZodOptional<z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber], null>>;
            scale: z.ZodOptional<z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>>;
            itemParams: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            name: z.ZodOptional<z.ZodString>;
            groupId: z.ZodOptional<z.ZodString>;
            locked: z.ZodOptional<z.ZodBoolean>;
            anchored: z.ZodOptional<z.ZodBoolean>;
            floats: z.ZodOptional<z.ZodBoolean>;
            rest: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"remove_item">;
        params: z.ZodObject<{
            instanceId: z.ZodString;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"transform_item">;
        params: z.ZodObject<{
            instanceId: z.ZodString;
            position: z.ZodOptional<z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>>;
            rotation: z.ZodOptional<z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber], null>>;
            scale: z.ZodOptional<z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>>;
            rest: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"set_item_params">;
        params: z.ZodObject<{
            instanceId: z.ZodString;
            params: z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean, z.ZodNull]>>;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"rename">;
        params: z.ZodObject<{
            kind: z.ZodEnum<{
                water: "water";
                item: "item";
                group: "group";
                river: "river";
                road: "road";
                wall: "wall";
            }>;
            id: z.ZodString;
            name: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"set_item_flags">;
        params: z.ZodObject<{
            instanceId: z.ZodString;
            locked: z.ZodOptional<z.ZodBoolean>;
            anchored: z.ZodOptional<z.ZodBoolean>;
            floats: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"group_items">;
        params: z.ZodObject<{
            groupId: z.ZodString;
            name: z.ZodString;
            instanceIds: z.ZodArray<z.ZodString>;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"ungroup_items">;
        params: z.ZodObject<{
            groupId: z.ZodString;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"set_lighting">;
        params: z.ZodObject<{
            lights: z.ZodOptional<z.ZodArray<z.ZodObject<{
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
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"set_style">;
        params: z.ZodObject<{
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
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"set_sky">;
        params: z.ZodObject<{
            preset: z.ZodEnum<{
                day: "day";
                sunset: "sunset";
                night: "night";
                storm: "storm";
                tropical: "tropical";
            }>;
            params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"set_weather">;
        params: z.ZodObject<{
            preset: z.ZodEnum<{
                snow: "snow";
                storm: "storm";
                clear: "clear";
                rain: "rain";
                fog: "fog";
                sandstorm: "sandstorm";
            }>;
            params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"sculpt_terrain">;
        params: z.ZodObject<{
            area: z.ZodArray<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
            operation: z.ZodEnum<{
                raise: "raise";
                lower: "lower";
                flatten: "flatten";
                smooth: "smooth";
            }>;
            strength: z.ZodNumber;
            targetHeight: z.ZodOptional<z.ZodNumber>;
            soft: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"generate_world">;
        params: z.ZodObject<{
            world: z.ZodNullable<z.ZodObject<{
                seed: z.ZodNumber;
                kind: z.ZodEnum<{
                    plain: "plain";
                    valley: "valley";
                    island: "island";
                    mountains: "mountains";
                }>;
                generator: z.ZodUnion<readonly [z.ZodLiteral<1>, z.ZodLiteral<2>]>;
            }, z.core.$strip>>;
            spawn: z.ZodOptional<z.ZodObject<{
                position: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
                rotation: z.ZodDefault<z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber], null>>;
                scale: z.ZodDefault<z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>>;
            }, z.core.$strip>>;
            terrain: z.ZodOptional<z.ZodArray<z.ZodString>>;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"paint_cover">;
        params: z.ZodObject<{
            area: z.ZodArray<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
            cover: z.ZodEnum<{
                default: "default";
                cleared: "cleared";
                plants: "plants";
                pebbles: "pebbles";
            }>;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"set_heights">;
        params: z.ZodObject<{
            x0: z.ZodNumber;
            z0: z.ZodNumber;
            cols: z.ZodNumber;
            rows: z.ZodNumber;
            step: z.ZodNumber;
            base: z.ZodNumber;
            heights: z.ZodString;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"paint_rule">;
        params: z.ZodObject<{
            box: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
            soilId: z.ZodOptional<z.ZodEnum<{
                grass: "grass";
                dirt: "dirt";
                sand: "sand";
                rock: "rock";
                snow: "snow";
                mud: "mud";
            }>>;
            material: z.ZodOptional<z.ZodObject<{
                id: z.ZodString;
                soil: z.ZodEnum<{
                    grass: "grass";
                    dirt: "dirt";
                    sand: "sand";
                    rock: "rock";
                    snow: "snow";
                    mud: "mud";
                }>;
            }, z.core.$strip>>;
            cover: z.ZodOptional<z.ZodEnum<{
                default: "default";
                cleared: "cleared";
                plants: "plants";
                pebbles: "pebbles";
            }>>;
            height: z.ZodOptional<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
            slope: z.ZodOptional<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
            depth: z.ZodOptional<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"paint_terrain">;
        params: z.ZodObject<{
            area: z.ZodArray<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
            soilId: z.ZodString;
            material: z.ZodOptional<z.ZodObject<{
                id: z.ZodString;
                soil: z.ZodEnum<{
                    grass: "grass";
                    dirt: "dirt";
                    sand: "sand";
                    rock: "rock";
                    snow: "snow";
                    mud: "mud";
                }>;
            }, z.core.$strip>>;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"set_ground_material">;
        params: z.ZodObject<{
            slot: z.ZodNumber;
            material: z.ZodNullable<z.ZodObject<{
                id: z.ZodString;
                soil: z.ZodEnum<{
                    grass: "grass";
                    dirt: "dirt";
                    sand: "sand";
                    rock: "rock";
                    snow: "snow";
                    mud: "mud";
                }>;
            }, z.core.$strip>>;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"add_water">;
        params: z.ZodObject<{
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
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"draw_road">;
        params: z.ZodObject<{
            roadId: z.ZodString;
            points: z.ZodArray<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
            width: z.ZodOptional<z.ZodNumber>;
            materialId: z.ZodOptional<z.ZodString>;
            name: z.ZodOptional<z.ZodString>;
            lanes: z.ZodOptional<z.ZodNumber>;
            oneway: z.ZodOptional<z.ZodBoolean>;
            sidewalk: z.ZodOptional<z.ZodNumber>;
            sidewalkSide: z.ZodOptional<z.ZodEnum<{
                both: "both";
                left: "left";
                right: "right";
            }>>;
            grade: z.ZodOptional<z.ZodBoolean>;
            terrain: z.ZodOptional<z.ZodArray<z.ZodString>>;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"remove_water">;
        params: z.ZodObject<{
            waterId: z.ZodString;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"set_water_level">;
        params: z.ZodObject<{
            waterId: z.ZodString;
            level: z.ZodNumber;
            terrain: z.ZodOptional<z.ZodArray<z.ZodString>>;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"draw_river">;
        params: z.ZodObject<{
            riverId: z.ZodString;
            points: z.ZodArray<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
            width: z.ZodOptional<z.ZodNumber>;
            widen: z.ZodOptional<z.ZodNumber>;
            flow: z.ZodOptional<z.ZodNumber>;
            name: z.ZodOptional<z.ZodString>;
            carve: z.ZodOptional<z.ZodBoolean>;
            terrain: z.ZodOptional<z.ZodArray<z.ZodString>>;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"edit_river">;
        params: z.ZodObject<{
            riverId: z.ZodString;
            points: z.ZodOptional<z.ZodArray<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>>;
            width: z.ZodOptional<z.ZodNumber>;
            widen: z.ZodOptional<z.ZodNumber>;
            flow: z.ZodOptional<z.ZodNumber>;
            carve: z.ZodOptional<z.ZodBoolean>;
            terrain: z.ZodOptional<z.ZodArray<z.ZodString>>;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"remove_river">;
        params: z.ZodObject<{
            riverId: z.ZodString;
            terrain: z.ZodOptional<z.ZodArray<z.ZodString>>;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"set_game">;
        params: z.ZodObject<{
            game: z.ZodNullable<z.ZodObject<{
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
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"set_story">;
        params: z.ZodObject<{
            story: z.ZodNullable<z.ZodObject<{
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
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"set_script">;
        params: z.ZodObject<{
            scriptId: z.ZodString;
            script: z.ZodNullable<z.ZodObject<{
                name: z.ZodString;
                enabled: z.ZodBoolean;
                from: z.ZodOptional<z.ZodObject<{
                    itemId: z.ZodString;
                    version: z.ZodString;
                    sha256: z.ZodString;
                }, z.core.$strip>>;
                source: z.ZodString;
                api: z.ZodLiteral<1>;
            }, z.core.$strip>>;
            index: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"set_sea">;
        params: z.ZodObject<{
            level: z.ZodNullable<z.ZodNumber>;
            swell: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                direction: z.ZodOptional<z.ZodNumber>;
                period: z.ZodOptional<z.ZodNumber>;
                height: z.ZodOptional<z.ZodNumber>;
            }, z.core.$strip>>>;
            resourceId: z.ZodOptional<z.ZodNullable<z.ZodEnum<{
                "genvr.core.water.tidewater-ocean": "genvr.core.water.tidewater-ocean";
            }>>>;
            params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"remove_road">;
        params: z.ZodObject<{
            roadId: z.ZodString;
            terrain: z.ZodOptional<z.ZodArray<z.ZodString>>;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"remove_wall">;
        params: z.ZodObject<{
            wallId: z.ZodString;
            terrain: z.ZodOptional<z.ZodArray<z.ZodString>>;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"add_wall_opening">;
        params: z.ZodObject<{
            wallId: z.ZodString;
            opening: z.ZodObject<{
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
            }, z.core.$strip>;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"remove_wall_opening">;
        params: z.ZodObject<{
            wallId: z.ZodString;
            openingId: z.ZodString;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"revert_terrain">;
        params: z.ZodObject<{
            edits: z.ZodArray<z.ZodString>;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"restore_terrain">;
        params: z.ZodObject<{
            chunks: z.ZodArray<z.ZodString>;
        }, z.core.$strip>;
    }, z.core.$strip>, z.ZodObject<{
        type: z.ZodLiteral<"draw_wall">;
        params: z.ZodObject<{
            wallId: z.ZodString;
            points: z.ZodArray<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
            height: z.ZodOptional<z.ZodNumber>;
            closed: z.ZodOptional<z.ZodBoolean>;
            materialId: z.ZodOptional<z.ZodString>;
            openings: z.ZodOptional<z.ZodArray<z.ZodObject<{
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
            name: z.ZodOptional<z.ZodString>;
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
            grade: z.ZodOptional<z.ZodBoolean>;
            terrain: z.ZodOptional<z.ZodArray<z.ZodString>>;
        }, z.core.$strip>;
    }, z.core.$strip>], "type">>;
    corrections: z.ZodArray<z.ZodObject<{
        kind: z.ZodEnum<{
            kept: "kept";
            moved: "moved";
            deleted: "deleted";
            changed: "changed";
            undone: "undone";
        }>;
        command: z.ZodNullable<z.ZodDiscriminatedUnion<[z.ZodObject<{
            type: z.ZodLiteral<"set_size_tier">;
            params: z.ZodObject<{
                sizeTier: z.ZodEnum<{
                    small: "small";
                    medium: "medium";
                    large: "large";
                    huge: "huge";
                    max: "max";
                }>;
            }, z.core.$strip>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"add_paving">;
            params: z.ZodObject<{
                pavingId: z.ZodString;
                area: z.ZodArray<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
                materialId: z.ZodString;
                name: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"remove_paving">;
            params: z.ZodObject<{
                pavingId: z.ZodString;
            }, z.core.$strip>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"set_spawn">;
            params: z.ZodObject<{
                spawn: z.ZodObject<{
                    position: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
                    rotation: z.ZodDefault<z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber], null>>;
                    scale: z.ZodDefault<z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>>;
                }, z.core.$strip>;
            }, z.core.$strip>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"set_terrain_surface">;
            params: z.ZodObject<{
                surface: z.ZodNullable<z.ZodObject<{
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
            }, z.core.$strict>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"create_field_set">;
            params: z.ZodObject<{
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
            }, z.core.$strict>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"set_field_tile">;
            params: z.ZodObject<{
                tile: z.ZodObject<{
                    kind: z.ZodLiteral<"terrain-fields-v1">;
                    setId: z.ZodString;
                    tx: z.ZodNumber;
                    tz: z.ZodNumber;
                    cols: z.ZodNumber;
                    rows: z.ZodNumber;
                    channels: z.ZodRecord<z.ZodString, z.ZodString>;
                }, z.core.$strict>;
            }, z.core.$strict>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"remove_field_tile">;
            params: z.ZodObject<{
                setId: z.ZodString;
                tx: z.ZodNumber;
                tz: z.ZodNumber;
            }, z.core.$strict>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"remove_field_set">;
            params: z.ZodObject<{
                setId: z.ZodString;
            }, z.core.$strict>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"restore_field_tile">;
            params: z.ZodObject<{
                setId: z.ZodString;
                tx: z.ZodNumber;
                tz: z.ZodNumber;
                before: z.ZodNullable<z.ZodObject<{
                    kind: z.ZodLiteral<"terrain-fields-v1">;
                    setId: z.ZodString;
                    tx: z.ZodNumber;
                    tz: z.ZodNumber;
                    cols: z.ZodNumber;
                    rows: z.ZodNumber;
                    channels: z.ZodRecord<z.ZodString, z.ZodString>;
                }, z.core.$strict>>;
                after: z.ZodNullable<z.ZodObject<{
                    kind: z.ZodLiteral<"terrain-fields-v1">;
                    setId: z.ZodString;
                    tx: z.ZodNumber;
                    tz: z.ZodNumber;
                    cols: z.ZodNumber;
                    rows: z.ZodNumber;
                    channels: z.ZodRecord<z.ZodString, z.ZodString>;
                }, z.core.$strict>>;
            }, z.core.$strict>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"set_blocks">;
            params: z.ZodObject<{
                blocks: z.ZodArray<z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber], null>>;
            }, z.core.$strip>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"place_item">;
            params: z.ZodObject<{
                instanceId: z.ZodString;
                itemId: z.ZodString;
                position: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
                rotation: z.ZodOptional<z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber], null>>;
                scale: z.ZodOptional<z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>>;
                itemParams: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
                name: z.ZodOptional<z.ZodString>;
                groupId: z.ZodOptional<z.ZodString>;
                locked: z.ZodOptional<z.ZodBoolean>;
                anchored: z.ZodOptional<z.ZodBoolean>;
                floats: z.ZodOptional<z.ZodBoolean>;
                rest: z.ZodOptional<z.ZodBoolean>;
            }, z.core.$strip>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"remove_item">;
            params: z.ZodObject<{
                instanceId: z.ZodString;
            }, z.core.$strip>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"transform_item">;
            params: z.ZodObject<{
                instanceId: z.ZodString;
                position: z.ZodOptional<z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>>;
                rotation: z.ZodOptional<z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber], null>>;
                scale: z.ZodOptional<z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>>;
                rest: z.ZodOptional<z.ZodBoolean>;
            }, z.core.$strip>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"set_item_params">;
            params: z.ZodObject<{
                instanceId: z.ZodString;
                params: z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean, z.ZodNull]>>;
            }, z.core.$strip>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"rename">;
            params: z.ZodObject<{
                kind: z.ZodEnum<{
                    water: "water";
                    item: "item";
                    group: "group";
                    river: "river";
                    road: "road";
                    wall: "wall";
                }>;
                id: z.ZodString;
                name: z.ZodNullable<z.ZodString>;
            }, z.core.$strip>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"set_item_flags">;
            params: z.ZodObject<{
                instanceId: z.ZodString;
                locked: z.ZodOptional<z.ZodBoolean>;
                anchored: z.ZodOptional<z.ZodBoolean>;
                floats: z.ZodOptional<z.ZodNullable<z.ZodBoolean>>;
            }, z.core.$strip>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"group_items">;
            params: z.ZodObject<{
                groupId: z.ZodString;
                name: z.ZodString;
                instanceIds: z.ZodArray<z.ZodString>;
            }, z.core.$strip>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"ungroup_items">;
            params: z.ZodObject<{
                groupId: z.ZodString;
            }, z.core.$strip>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"set_lighting">;
            params: z.ZodObject<{
                lights: z.ZodOptional<z.ZodArray<z.ZodObject<{
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
            }, z.core.$strip>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"set_style">;
            params: z.ZodObject<{
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
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"set_sky">;
            params: z.ZodObject<{
                preset: z.ZodEnum<{
                    day: "day";
                    sunset: "sunset";
                    night: "night";
                    storm: "storm";
                    tropical: "tropical";
                }>;
                params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            }, z.core.$strip>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"set_weather">;
            params: z.ZodObject<{
                preset: z.ZodEnum<{
                    snow: "snow";
                    storm: "storm";
                    clear: "clear";
                    rain: "rain";
                    fog: "fog";
                    sandstorm: "sandstorm";
                }>;
                params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            }, z.core.$strip>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"sculpt_terrain">;
            params: z.ZodObject<{
                area: z.ZodArray<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
                operation: z.ZodEnum<{
                    raise: "raise";
                    lower: "lower";
                    flatten: "flatten";
                    smooth: "smooth";
                }>;
                strength: z.ZodNumber;
                targetHeight: z.ZodOptional<z.ZodNumber>;
                soft: z.ZodOptional<z.ZodBoolean>;
            }, z.core.$strip>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"generate_world">;
            params: z.ZodObject<{
                world: z.ZodNullable<z.ZodObject<{
                    seed: z.ZodNumber;
                    kind: z.ZodEnum<{
                        plain: "plain";
                        valley: "valley";
                        island: "island";
                        mountains: "mountains";
                    }>;
                    generator: z.ZodUnion<readonly [z.ZodLiteral<1>, z.ZodLiteral<2>]>;
                }, z.core.$strip>>;
                spawn: z.ZodOptional<z.ZodObject<{
                    position: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
                    rotation: z.ZodDefault<z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber], null>>;
                    scale: z.ZodDefault<z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>>;
                }, z.core.$strip>>;
                terrain: z.ZodOptional<z.ZodArray<z.ZodString>>;
            }, z.core.$strip>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"paint_cover">;
            params: z.ZodObject<{
                area: z.ZodArray<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
                cover: z.ZodEnum<{
                    default: "default";
                    cleared: "cleared";
                    plants: "plants";
                    pebbles: "pebbles";
                }>;
            }, z.core.$strip>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"set_heights">;
            params: z.ZodObject<{
                x0: z.ZodNumber;
                z0: z.ZodNumber;
                cols: z.ZodNumber;
                rows: z.ZodNumber;
                step: z.ZodNumber;
                base: z.ZodNumber;
                heights: z.ZodString;
            }, z.core.$strip>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"paint_rule">;
            params: z.ZodObject<{
                box: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
                soilId: z.ZodOptional<z.ZodEnum<{
                    grass: "grass";
                    dirt: "dirt";
                    sand: "sand";
                    rock: "rock";
                    snow: "snow";
                    mud: "mud";
                }>>;
                material: z.ZodOptional<z.ZodObject<{
                    id: z.ZodString;
                    soil: z.ZodEnum<{
                        grass: "grass";
                        dirt: "dirt";
                        sand: "sand";
                        rock: "rock";
                        snow: "snow";
                        mud: "mud";
                    }>;
                }, z.core.$strip>>;
                cover: z.ZodOptional<z.ZodEnum<{
                    default: "default";
                    cleared: "cleared";
                    plants: "plants";
                    pebbles: "pebbles";
                }>>;
                height: z.ZodOptional<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
                slope: z.ZodOptional<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
                depth: z.ZodOptional<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
            }, z.core.$strip>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"paint_terrain">;
            params: z.ZodObject<{
                area: z.ZodArray<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
                soilId: z.ZodString;
                material: z.ZodOptional<z.ZodObject<{
                    id: z.ZodString;
                    soil: z.ZodEnum<{
                        grass: "grass";
                        dirt: "dirt";
                        sand: "sand";
                        rock: "rock";
                        snow: "snow";
                        mud: "mud";
                    }>;
                }, z.core.$strip>>;
            }, z.core.$strip>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"set_ground_material">;
            params: z.ZodObject<{
                slot: z.ZodNumber;
                material: z.ZodNullable<z.ZodObject<{
                    id: z.ZodString;
                    soil: z.ZodEnum<{
                        grass: "grass";
                        dirt: "dirt";
                        sand: "sand";
                        rock: "rock";
                        snow: "snow";
                        mud: "mud";
                    }>;
                }, z.core.$strip>>;
            }, z.core.$strip>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"add_water">;
            params: z.ZodObject<{
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
            }, z.core.$strip>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"draw_road">;
            params: z.ZodObject<{
                roadId: z.ZodString;
                points: z.ZodArray<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
                width: z.ZodOptional<z.ZodNumber>;
                materialId: z.ZodOptional<z.ZodString>;
                name: z.ZodOptional<z.ZodString>;
                lanes: z.ZodOptional<z.ZodNumber>;
                oneway: z.ZodOptional<z.ZodBoolean>;
                sidewalk: z.ZodOptional<z.ZodNumber>;
                sidewalkSide: z.ZodOptional<z.ZodEnum<{
                    both: "both";
                    left: "left";
                    right: "right";
                }>>;
                grade: z.ZodOptional<z.ZodBoolean>;
                terrain: z.ZodOptional<z.ZodArray<z.ZodString>>;
            }, z.core.$strip>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"remove_water">;
            params: z.ZodObject<{
                waterId: z.ZodString;
            }, z.core.$strip>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"set_water_level">;
            params: z.ZodObject<{
                waterId: z.ZodString;
                level: z.ZodNumber;
                terrain: z.ZodOptional<z.ZodArray<z.ZodString>>;
            }, z.core.$strip>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"draw_river">;
            params: z.ZodObject<{
                riverId: z.ZodString;
                points: z.ZodArray<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
                width: z.ZodOptional<z.ZodNumber>;
                widen: z.ZodOptional<z.ZodNumber>;
                flow: z.ZodOptional<z.ZodNumber>;
                name: z.ZodOptional<z.ZodString>;
                carve: z.ZodOptional<z.ZodBoolean>;
                terrain: z.ZodOptional<z.ZodArray<z.ZodString>>;
            }, z.core.$strip>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"edit_river">;
            params: z.ZodObject<{
                riverId: z.ZodString;
                points: z.ZodOptional<z.ZodArray<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>>;
                width: z.ZodOptional<z.ZodNumber>;
                widen: z.ZodOptional<z.ZodNumber>;
                flow: z.ZodOptional<z.ZodNumber>;
                carve: z.ZodOptional<z.ZodBoolean>;
                terrain: z.ZodOptional<z.ZodArray<z.ZodString>>;
            }, z.core.$strip>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"remove_river">;
            params: z.ZodObject<{
                riverId: z.ZodString;
                terrain: z.ZodOptional<z.ZodArray<z.ZodString>>;
            }, z.core.$strip>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"set_game">;
            params: z.ZodObject<{
                game: z.ZodNullable<z.ZodObject<{
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
            }, z.core.$strip>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"set_story">;
            params: z.ZodObject<{
                story: z.ZodNullable<z.ZodObject<{
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
            }, z.core.$strip>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"set_script">;
            params: z.ZodObject<{
                scriptId: z.ZodString;
                script: z.ZodNullable<z.ZodObject<{
                    name: z.ZodString;
                    enabled: z.ZodBoolean;
                    from: z.ZodOptional<z.ZodObject<{
                        itemId: z.ZodString;
                        version: z.ZodString;
                        sha256: z.ZodString;
                    }, z.core.$strip>>;
                    source: z.ZodString;
                    api: z.ZodLiteral<1>;
                }, z.core.$strip>>;
                index: z.ZodOptional<z.ZodNumber>;
            }, z.core.$strip>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"set_sea">;
            params: z.ZodObject<{
                level: z.ZodNullable<z.ZodNumber>;
                swell: z.ZodOptional<z.ZodNullable<z.ZodObject<{
                    direction: z.ZodOptional<z.ZodNumber>;
                    period: z.ZodOptional<z.ZodNumber>;
                    height: z.ZodOptional<z.ZodNumber>;
                }, z.core.$strip>>>;
                resourceId: z.ZodOptional<z.ZodNullable<z.ZodEnum<{
                    "genvr.core.water.tidewater-ocean": "genvr.core.water.tidewater-ocean";
                }>>>;
                params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
            }, z.core.$strip>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"remove_road">;
            params: z.ZodObject<{
                roadId: z.ZodString;
                terrain: z.ZodOptional<z.ZodArray<z.ZodString>>;
            }, z.core.$strip>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"remove_wall">;
            params: z.ZodObject<{
                wallId: z.ZodString;
                terrain: z.ZodOptional<z.ZodArray<z.ZodString>>;
            }, z.core.$strip>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"add_wall_opening">;
            params: z.ZodObject<{
                wallId: z.ZodString;
                opening: z.ZodObject<{
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
                }, z.core.$strip>;
            }, z.core.$strip>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"remove_wall_opening">;
            params: z.ZodObject<{
                wallId: z.ZodString;
                openingId: z.ZodString;
            }, z.core.$strip>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"revert_terrain">;
            params: z.ZodObject<{
                edits: z.ZodArray<z.ZodString>;
            }, z.core.$strip>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"restore_terrain">;
            params: z.ZodObject<{
                chunks: z.ZodArray<z.ZodString>;
            }, z.core.$strip>;
        }, z.core.$strip>, z.ZodObject<{
            type: z.ZodLiteral<"draw_wall">;
            params: z.ZodObject<{
                wallId: z.ZodString;
                points: z.ZodArray<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
                height: z.ZodOptional<z.ZodNumber>;
                closed: z.ZodOptional<z.ZodBoolean>;
                materialId: z.ZodOptional<z.ZodString>;
                openings: z.ZodOptional<z.ZodArray<z.ZodObject<{
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
                name: z.ZodOptional<z.ZodString>;
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
                grade: z.ZodOptional<z.ZodBoolean>;
                terrain: z.ZodOptional<z.ZodArray<z.ZodString>>;
            }, z.core.$strip>;
        }, z.core.$strip>], "type">>;
        afterMs: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type CorrectionReport = z.infer<typeof CorrectionReport>;
