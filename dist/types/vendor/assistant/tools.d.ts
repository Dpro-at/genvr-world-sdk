import { z } from 'zod';
/** Blocks the assistant builds with in block places (P2-26), like the Blocks tool's picker. */
export declare const BUILD_BLOCKS: readonly ["grass", "dirt", "sand", "stone", "snow", "gravel", "planks", "cobble", "brick", "paving", "path"];
/** Most items one `place_items` call places (one saved change holds at most 200 commands). */
export declare const PLACE_ITEMS_MAX = 200;
export declare const TOOL_ARGS: {
    readonly avatar_voice: z.ZodObject<{
        action: z.ZodEnum<{
            audio: "audio";
            models: "models";
            install: "install";
            voices: "voices";
            clone: "clone";
            assign: "assign";
            speak: "speak";
            job: "job";
            recordings: "recordings";
            replay: "replay";
            demo: "demo";
            playback: "playback";
            demo_all: "demo_all";
            preview: "preview";
            preview_demo: "preview_demo";
            prepare_previews: "prepare_previews";
            remove: "remove";
            design: "design";
            save_design: "save_design";
            export_voice: "export_voice";
        }>;
        preview: z.ZodOptional<z.ZodBoolean>;
        voiceType: z.ZodOptional<z.ZodEnum<{
            male: "male";
            female: "female";
            child: "child";
        }>>;
        description: z.ZodOptional<z.ZodString>;
        confirm: z.ZodOptional<z.ZodBoolean>;
        command: z.ZodOptional<z.ZodEnum<{
            play: "play";
            pause: "pause";
            stop: "stop";
            seek: "seek";
            rate: "rate";
            volume: "volume";
        }>>;
        value: z.ZodOptional<z.ZodNumber>;
        demoId: z.ZodOptional<z.ZodString>;
        audioId: z.ZodOptional<z.ZodString>;
        model: z.ZodOptional<z.ZodString>;
        jobId: z.ZodOptional<z.ZodString>;
        voiceId: z.ZodOptional<z.ZodString>;
        name: z.ZodOptional<z.ZodString>;
        audio: z.ZodOptional<z.ZodString>;
        consent: z.ZodOptional<z.ZodBoolean>;
        projectId: z.ZodOptional<z.ZodString>;
        target: z.ZodDefault<z.ZodString>;
        text: z.ZodOptional<z.ZodString>;
        language: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    readonly user_avatar_library: z.ZodObject<{
        action: z.ZodEnum<{
            assign: "assign";
            play: "play";
            list: "list";
        }>;
        target: z.ZodDefault<z.ZodString>;
        id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        query: z.ZodDefault<z.ZodString>;
        offset: z.ZodDefault<z.ZodNumber>;
        limit: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strict>;
    readonly present_avatar: z.ZodObject<{
        event: z.ZodDiscriminatedUnion<[z.ZodObject<{
            kind: z.ZodLiteral<"animation">;
            target: z.ZodDefault<z.ZodString>;
            animation: z.ZodString;
            duration: z.ZodDefault<z.ZodNumber>;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"expression">;
            target: z.ZodDefault<z.ZodString>;
            expression: z.ZodEnum<{
                neutral: "neutral";
                smile: "smile";
                angry: "angry";
                sad: "sad";
                surprised: "surprised";
                thinking: "thinking";
            }>;
            duration: z.ZodDefault<z.ZodNumber>;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"effect">;
            effect: z.ZodEnum<{
                snow: "snow";
                rain: "rain";
                matrix: "matrix";
                emoji: "emoji";
                fireflies: "fireflies";
                starfield: "starfield";
                fire: "fire";
                lightning: "lightning";
                aurora: "aurora";
                glitch: "glitch";
                scanlines: "scanlines";
                hologram: "hologram";
                vignette: "vignette";
                confetti: "confetti";
            }>;
            enabled: z.ZodBoolean;
            intensity: z.ZodDefault<z.ZodNumber>;
            duration: z.ZodDefault<z.ZodNumber>;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"notification">;
            notification: z.ZodObject<{
                type: z.ZodEnum<{
                    msg: "msg";
                    task: "task";
                    approval: "approval";
                    email: "email";
                    whatsapp: "whatsapp";
                    facebook: "facebook";
                    instagram: "instagram";
                    telegram: "telegram";
                    discord: "discord";
                    stripe: "stripe";
                    paypal: "paypal";
                    bank: "bank";
                    applepay: "applepay";
                    stock: "stock";
                    calendar: "calendar";
                    terminal: "terminal";
                    gif: "gif";
                    twitter: "twitter";
                    tiktok: "tiktok";
                    linkedin: "linkedin";
                    snapchat: "snapchat";
                    youtube: "youtube";
                    reddit: "reddit";
                    twitch: "twitch";
                    otp: "otp";
                    faceid: "faceid";
                    sms_otp: "sms_otp";
                }>;
                title: z.ZodString;
                body: z.ZodString;
                sourceId: z.ZodOptional<z.ZodString>;
                from: z.ZodOptional<z.ZodString>;
                needsApproval: z.ZodOptional<z.ZodBoolean>;
                canReply: z.ZodOptional<z.ZodBoolean>;
                terminalCmd: z.ZodOptional<z.ZodString>;
                terminalOutput: z.ZodOptional<z.ZodString>;
                gifUrl: z.ZodOptional<z.ZodString>;
                otpCode: z.ZodOptional<z.ZodString>;
                biometricDevice: z.ZodOptional<z.ZodString>;
                phoneNumber: z.ZodOptional<z.ZodString>;
            }, z.core.$strict>;
            duration: z.ZodDefault<z.ZodNumber>;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"card">;
            title: z.ZodString;
            spec: z.ZodObject<{
                root: z.ZodString;
                elements: z.ZodRecord<z.ZodString, z.ZodObject<{
                    type: z.ZodString;
                    props: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                    children: z.ZodArray<z.ZodString>;
                }, z.core.$strict>>;
            }, z.core.$strip>;
            duration: z.ZodDefault<z.ZodNumber>;
        }, z.core.$strict>, z.ZodObject<{
            kind: z.ZodLiteral<"clear">;
        }, z.core.$strict>], "kind">;
    }, z.core.$strict>;
    readonly get_resource_controls: z.ZodObject<{
        item_id: z.ZodString;
    }, z.core.$strip>;
    readonly set_resource_params: z.ZodObject<{
        instance_id: z.ZodString;
        params: z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodNumber, z.ZodString, z.ZodBoolean, z.ZodNull]>>;
    }, z.core.$strip>;
    readonly get_world_summary: z.ZodObject<{
        from_item: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>;
    /** The game's own data (counters, numbered rules, ranking, displays), read before changing it. */
    readonly get_game: z.ZodObject<{
        from_rule: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>;
    readonly search_catalog: z.ZodObject<{
        query: z.ZodString;
    }, z.core.$strip>;
    readonly place_item: z.ZodObject<{
        itemId: z.ZodString;
        x: z.ZodNumber;
        z: z.ZodNumber;
        turn: z.ZodOptional<z.ZodNumber>;
        size: z.ZodOptional<z.ZodNumber>;
        stretch: z.ZodOptional<z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>>;
        on: z.ZodOptional<z.ZodString>;
        color: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    readonly scatter_items: z.ZodObject<{
        itemIds: z.ZodArray<z.ZodString>;
        x: z.ZodNumber;
        z: z.ZodNumber;
        radius: z.ZodNumber;
        count: z.ZodNumber;
    }, z.core.$strip>;
    readonly build_platforms: z.ZodObject<{
        platforms: z.ZodArray<z.ZodObject<{
            x: z.ZodNumber;
            height: z.ZodNumber;
            width: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
        floating: z.ZodOptional<z.ZodBoolean>;
        ladder: z.ZodOptional<z.ZodBoolean>;
        color: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    /** Moves, turns or resizes one placed item: one transform_item, the rest law sets its height. */
    readonly move_item: z.ZodObject<{
        instanceId: z.ZodString;
        x: z.ZodOptional<z.ZodNumber>;
        z: z.ZodOptional<z.ZodNumber>;
        turn: z.ZodOptional<z.ZodNumber>;
        size: z.ZodOptional<z.ZodNumber>;
        stretch: z.ZodOptional<z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>>;
    }, z.core.$strip>;
    readonly remove_items: z.ZodObject<{
        instanceIds: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
    readonly fill_blocks: z.ZodObject<{
        block: z.ZodEnum<{
            grass: "grass";
            snow: "snow";
            dirt: "dirt";
            sand: "sand";
            brick: "brick";
            stone: "stone";
            path: "path";
            gravel: "gravel";
            planks: "planks";
            cobble: "cobble";
            paving: "paving";
        }>;
        height: z.ZodOptional<z.ZodNumber>;
        raise: z.ZodOptional<z.ZodNumber>;
        hollow: z.ZodOptional<z.ZodBoolean>;
        x1: z.ZodNumber;
        z1: z.ZodNumber;
        x2: z.ZodNumber;
        z2: z.ZodNumber;
    }, z.core.$strip>;
    readonly block_line: z.ZodObject<{
        points: z.ZodArray<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
        block: z.ZodEnum<{
            grass: "grass";
            snow: "snow";
            dirt: "dirt";
            sand: "sand";
            brick: "brick";
            stone: "stone";
            path: "path";
            gravel: "gravel";
            planks: "planks";
            cobble: "cobble";
            paving: "paving";
        }>;
        height: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>;
    readonly block_floor: z.ZodObject<{
        block: z.ZodEnum<{
            grass: "grass";
            snow: "snow";
            dirt: "dirt";
            sand: "sand";
            brick: "brick";
            stone: "stone";
            path: "path";
            gravel: "gravel";
            planks: "planks";
            cobble: "cobble";
            paving: "paving";
        }>;
        x1: z.ZodNumber;
        z1: z.ZodNumber;
        x2: z.ZodNumber;
        z2: z.ZodNumber;
    }, z.core.$strip>;
    readonly dig_blocks: z.ZodObject<{
        depth: z.ZodNumber;
        x1: z.ZodNumber;
        z1: z.ZodNumber;
        x2: z.ZodNumber;
        z2: z.ZodNumber;
    }, z.core.$strip>;
    readonly draw_road: z.ZodObject<{
        points: z.ZodArray<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
        roadType: z.ZodOptional<z.ZodEnum<{
            dirt: "dirt";
            path: "path";
            street: "street";
            tram: "tram";
            rail: "rail";
            fantasy: "fantasy";
        }>>;
        lanes: z.ZodOptional<z.ZodNumber>;
        oneway: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>;
    readonly pave_area: z.ZodObject<{
        points: z.ZodArray<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
        material: z.ZodOptional<z.ZodEnum<{
            slabs: "slabs";
            asphalt: "asphalt";
            pavers: "pavers";
        }>>;
    }, z.core.$strip>;
    readonly draw_wall: z.ZodObject<{
        points: z.ZodArray<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
        closed: z.ZodOptional<z.ZodBoolean>;
        height: z.ZodOptional<z.ZodNumber>;
        material: z.ZodOptional<z.ZodEnum<{
            plaster: "plaster";
            brick: "brick";
            stone: "stone";
            concrete: "concrete";
            wood: "wood";
            "old-stone": "old-stone";
            "old-brick": "old-brick";
            "yellow-brick": "yellow-brick";
        }>>;
    }, z.core.$strip>;
    readonly build_house: z.ZodObject<{
        points: z.ZodArray<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
        height: z.ZodOptional<z.ZodNumber>;
        levels: z.ZodOptional<z.ZodNumber>;
        facade: z.ZodOptional<z.ZodEnum<{
            plaster: "plaster";
            brick: "brick";
            stone: "stone";
            concrete: "concrete";
            wood: "wood";
        }>>;
        facadeColor: z.ZodOptional<z.ZodString>;
        roof: z.ZodOptional<z.ZodEnum<{
            flat: "flat";
            gabled: "gabled";
            hipped: "hipped";
            pyramidal: "pyramidal";
            skillion: "skillion";
        }>>;
        roofHeight: z.ZodOptional<z.ZodNumber>;
        roofMaterial: z.ZodOptional<z.ZodEnum<{
            concrete: "concrete";
            tiles: "tiles";
            slate: "slate";
            metal: "metal";
            thatch: "thatch";
        }>>;
        roofColor: z.ZodOptional<z.ZodString>;
        name: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    readonly add_water: z.ZodObject<{
        x: z.ZodNumber;
        z: z.ZodNumber;
    }, z.core.$strip>;
    readonly draw_river: z.ZodObject<{
        points: z.ZodArray<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
        width: z.ZodOptional<z.ZodNumber>;
        flow: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>;
    readonly set_sea: z.ZodObject<{
        level: z.ZodNullable<z.ZodNumber>;
        resource_id: z.ZodOptional<z.ZodNullable<z.ZodEnum<{
            "genvr.core.water.tidewater-ocean": "genvr.core.water.tidewater-ocean";
        }>>>;
        swell: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            direction: z.ZodOptional<z.ZodNumber>;
            period: z.ZodOptional<z.ZodNumber>;
            height: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strict>>>;
    }, z.core.$strict>;
    readonly sculpt_terrain: z.ZodObject<{
        x: z.ZodNumber;
        z: z.ZodNumber;
        radius: z.ZodNumber;
        operation: z.ZodEnum<{
            raise: "raise";
            lower: "lower";
            flatten: "flatten";
            smooth: "smooth";
        }>;
        strength: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>;
    readonly paint_terrain: z.ZodObject<{
        x: z.ZodNumber;
        z: z.ZodNumber;
        radius: z.ZodNumber;
        soil: z.ZodEnum<{
            grass: "grass";
            snow: "snow";
            dirt: "dirt";
            sand: "sand";
            rock: "rock";
        }>;
        material: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    readonly make_world: z.ZodObject<{
        kind: z.ZodEnum<{
            plain: "plain";
            valley: "valley";
            island: "island";
            mountains: "mountains";
        }>;
        seed: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>;
    readonly cover_ground: z.ZodObject<{
        x: z.ZodNumber;
        z: z.ZodNumber;
        radius: z.ZodNumber;
        cover: z.ZodEnum<{
            default: "default";
            cleared: "cleared";
            plants: "plants";
            pebbles: "pebbles";
        }>;
    }, z.core.$strip>;
    readonly set_sky: z.ZodObject<{
        preset: z.ZodEnum<{
            day: "day";
            sunset: "sunset";
            night: "night";
            storm: "storm";
            tropical: "tropical";
        }>;
        cycle_minutes: z.ZodOptional<z.ZodNumber>;
        time_of_day: z.ZodOptional<z.ZodNumber>;
        sun_azimuth: z.ZodOptional<z.ZodNumber>;
        wind_direction: z.ZodOptional<z.ZodNumber>;
        wind_speed: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>;
    /** A rectangle of exact ground heights (MCP build clients, Tidewater world task 2). */
    readonly set_ground_heights: z.ZodObject<{
        x0: z.ZodNumber;
        z0: z.ZodNumber;
        cols: z.ZodNumber;
        rows: z.ZodNumber;
        step: z.ZodNumber;
        base: z.ZodNumber;
        heights_cm: z.ZodString;
    }, z.core.$strip>;
    /** Many exact placements in one change (MCP build clients, Tidewater world task 2). */
    readonly place_items: z.ZodObject<{
        items: z.ZodArray<z.ZodObject<{
            itemId: z.ZodString;
            x: z.ZodNumber;
            z: z.ZodNumber;
            y: z.ZodOptional<z.ZodNumber>;
            turn: z.ZodOptional<z.ZodNumber>;
            size: z.ZodOptional<z.ZodNumber>;
            stretch: z.ZodOptional<z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>>;
            lean: z.ZodOptional<z.ZodNumber>;
            params: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean]>>>;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    /** Paint a soil or a cover where a rule holds (MCP build clients, Tidewater world task 2). */
    readonly paint_ground_rule: z.ZodObject<{
        soil: z.ZodOptional<z.ZodEnum<{
            grass: "grass";
            snow: "snow";
            dirt: "dirt";
            sand: "sand";
            rock: "rock";
            mud: "mud";
        }>>;
        material: z.ZodOptional<z.ZodString>;
        cover: z.ZodOptional<z.ZodEnum<{
            default: "default";
            cleared: "cleared";
            plants: "plants";
            pebbles: "pebbles";
        }>>;
        height: z.ZodOptional<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
        slope: z.ZodOptional<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
        depth_below_sea: z.ZodOptional<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
        x1: z.ZodNumber;
        z1: z.ZodNumber;
        x2: z.ZodNumber;
        z2: z.ZodNumber;
    }, z.core.$strip>;
    readonly set_weather: z.ZodObject<{
        preset: z.ZodEnum<{
            snow: "snow";
            storm: "storm";
            clear: "clear";
            rain: "rain";
            fog: "fog";
            sandstorm: "sandstorm";
        }>;
    }, z.core.$strip>;
    /** The place's scroll story (SCROLL-02): every call replaces all stops. */
    readonly set_story: z.ZodObject<{
        title: z.ZodOptional<z.ZodString>;
        stops: z.ZodNullable<z.ZodArray<z.ZodObject<{
            position: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
            look_at: z.ZodTuple<[z.ZodNumber, z.ZodNumber, z.ZodNumber], null>;
            fov: z.ZodOptional<z.ZodNumber>;
            ease: z.ZodOptional<z.ZodEnum<{
                out: "out";
                in: "in";
                linear: "linear";
                in_out: "in_out";
            }>>;
            kicker: z.ZodOptional<z.ZodString>;
            title: z.ZodString;
            text: z.ZodOptional<z.ZodString>;
            side: z.ZodOptional<z.ZodEnum<{
                left: "left";
                right: "right";
                center: "center";
            }>>;
        }, z.core.$strict>>>;
    }, z.core.$strict>;
    readonly set_style: z.ZodObject<{
        base: z.ZodEnum<{
            realistic: "realistic";
            blocky: "blocky";
            anime: "anime";
            voxel: "voxel";
        }>;
    }, z.core.$strip>;
    /** The place's game (P9-12): unset fields keep the game's current settings. */
    readonly set_game: z.ZodObject<{
        remove: z.ZodOptional<z.ZodBoolean>;
        teams: z.ZodOptional<z.ZodEnum<{
            none: "none";
            two: "two";
        }>>;
        minutes: z.ZodOptional<z.ZodNumber>;
        health: z.ZodOptional<z.ZodNumber>;
        respawn_seconds: z.ZodOptional<z.ZodNumber>;
        min_players: z.ZodOptional<z.ZodNumber>;
        tools: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>;
    /**
     * The game's generic rules (generic rules Task 8): the same data the Place settings rules editor
     * saves. A given list replaces the game's list; parts not given stay as they are.
     */
    readonly set_rules: z.ZodObject<{
        add_counters: z.ZodOptional<z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            scope: z.ZodEnum<{
                player: "player";
                team: "team";
                global: "global";
            }>;
            start: z.ZodDefault<z.ZodNumber>;
        }, z.core.$strip>>>;
        remove_counters: z.ZodOptional<z.ZodArray<z.ZodString>>;
        add_rules: z.ZodOptional<z.ZodArray<z.ZodObject<{
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
        remove_rules: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
        add_hud: z.ZodOptional<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
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
        remove_hud: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
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
        remove: z.ZodOptional<z.ZodArray<z.ZodEnum<{
            counters: "counters";
            rules: "rules";
            ranking: "ranking";
            hud: "hud";
        }>>>;
        highest_score_wins: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>;
    /** Any placed item can be a zone (generic rules): an area or a gate with a tag the rules name. */
    readonly set_zone: z.ZodObject<{
        instanceId: z.ZodString;
        shape: z.ZodOptional<z.ZodEnum<{
            area: "area";
            gate: "gate";
            off: "off";
        }>>;
        tag: z.ZodOptional<z.ZodString>;
        visible: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>;
    /**
     * Any placed item can be ridden (movement modes): a movement model (the medium) and generic
     * numbers, stored as the item's params through one `set_item_params`.
     */
    readonly set_ride: z.ZodObject<{
        instance_id: z.ZodString;
        model: z.ZodOptional<z.ZodNullable<z.ZodEnum<{
            ground: "ground";
            water: "water";
            air: "air";
        }>>>;
        preset: z.ZodOptional<z.ZodBoolean>;
        seats: z.ZodOptional<z.ZodNumber>;
        max_speed: z.ZodOptional<z.ZodNumber>;
        reverse: z.ZodOptional<z.ZodNumber>;
        accel: z.ZodOptional<z.ZodNumber>;
        turn: z.ZodOptional<z.ZodNumber>;
        grip: z.ZodOptional<z.ZodNumber>;
        gravity: z.ZodOptional<z.ZodNumber>;
        climb: z.ZodOptional<z.ZodNumber>;
        glide: z.ZodOptional<z.ZodBoolean>;
        ceiling: z.ZodOptional<z.ZodNumber>;
        camera: z.ZodOptional<z.ZodNumber>;
        seat_height: z.ZodOptional<z.ZodNumber>;
        pose: z.ZodOptional<z.ZodEnum<{
            sit: "sit";
            stand: "stand";
        }>>;
        reach: z.ZodOptional<z.ZodNumber>;
        exit: z.ZodOptional<z.ZodNumber>;
        return_seconds: z.ZodOptional<z.ZodNumber>;
        tag: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, z.core.$strip>;
    /** Place scripts (P2-10): the reference of the Genvr Script API (`SCRIPT_API` in the contracts). */
    readonly get_script_api: z.ZodObject<{
        part: z.ZodOptional<z.ZodEnum<{
            guide: "guide";
            types: "types";
        }>>;
    }, z.core.$strip>;
    readonly get_scripts: z.ZodObject<{
        script_id: z.ZodOptional<z.ZodString>;
        from_line: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>;
    /** One `set_script` command: add, change, switch on or off, or remove one script. */
    readonly set_script: z.ZodObject<{
        script_id: z.ZodOptional<z.ZodString>;
        name: z.ZodOptional<z.ZodString>;
        source: z.ZodOptional<z.ZodString>;
        enabled: z.ZodOptional<z.ZodBoolean>;
        remove: z.ZodOptional<z.ZodBoolean>;
    }, z.core.$strip>;
    /** A dry run (spec 12): nothing is saved. */
    readonly test_script: z.ZodObject<{
        script_id: z.ZodOptional<z.ZodString>;
        source: z.ZodOptional<z.ZodString>;
        events: z.ZodOptional<z.ZodArray<z.ZodDiscriminatedUnion<readonly [z.ZodObject<{
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
        }, z.core.$strip>], "type">>>;
        recording: z.ZodOptional<z.ZodLiteral<"last_match">>;
        players: z.ZodOptional<z.ZodNumber>;
        seed: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>;
    readonly get_script_logs: z.ZodObject<{
        since: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>;
    readonly ask_user: z.ZodObject<{
        question: z.ZodString;
        options: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
};
export type ToolName = keyof typeof TOOL_ARGS;
export type ToolArgs<N extends ToolName> = z.infer<(typeof TOOL_ARGS)[N]>;
/** Tools that build with blocks: only places with block ground offer them (P2-26). */
export declare const BLOCK_TOOLS: readonly ToolName[];
/** Tools that shape the smooth height-field ground: block places do not offer them. */
export declare const HEIGHT_FIELD_TOOLS: readonly ToolName[];
/**
 * Bulk tools for MCP build clients (Tidewater world, task 2): base64 heights and lists of 200 items are no work for
 * the in-app assistant's small models, so its tool list leaves them out (they still run through `runTool`).
 */
export declare const MCP_BULK_TOOLS: readonly ToolName[];
/** Tool definitions in the Ollama / OpenAI function format, generated from the argument schemas. */
export declare const TOOL_DEFINITIONS: {
    type: "function";
    function: {
        name: "place_item" | "set_style" | "set_sky" | "set_weather" | "sculpt_terrain" | "paint_terrain" | "add_water" | "draw_road" | "draw_river" | "set_game" | "set_story" | "set_script" | "set_sea" | "draw_wall" | "avatar_voice" | "user_avatar_library" | "present_avatar" | "get_resource_controls" | "set_resource_params" | "get_world_summary" | "get_game" | "search_catalog" | "scatter_items" | "build_platforms" | "move_item" | "remove_items" | "fill_blocks" | "block_line" | "block_floor" | "dig_blocks" | "pave_area" | "build_house" | "make_world" | "cover_ground" | "set_ground_heights" | "place_items" | "paint_ground_rule" | "set_rules" | "set_zone" | "set_ride" | "get_script_api" | "get_scripts" | "test_script" | "get_script_logs" | "ask_user";
        description: string;
        parameters: Record<string, unknown>;
    };
}[];
/**
 * The tools a place offers: block places build with blocks instead of shaping the ground;
 * other places have no blocks to build with. Fewer tools also help small models choose.
 */
export declare function toolDefinitions(place: {
    blockGround: boolean;
}): {
    type: "function";
    function: {
        name: "place_item" | "set_style" | "set_sky" | "set_weather" | "sculpt_terrain" | "paint_terrain" | "add_water" | "draw_road" | "draw_river" | "set_game" | "set_story" | "set_script" | "set_sea" | "draw_wall" | "avatar_voice" | "user_avatar_library" | "present_avatar" | "get_resource_controls" | "set_resource_params" | "get_world_summary" | "get_game" | "search_catalog" | "scatter_items" | "build_platforms" | "move_item" | "remove_items" | "fill_blocks" | "block_line" | "block_floor" | "dig_blocks" | "pave_area" | "build_house" | "make_world" | "cover_ground" | "set_ground_heights" | "place_items" | "paint_ground_rule" | "set_rules" | "set_zone" | "set_ride" | "get_script_api" | "get_scripts" | "test_script" | "get_script_logs" | "ask_user";
        description: string;
        parameters: Record<string, unknown>;
    };
}[];
export declare const isToolName: (name: string) => name is ToolName;
