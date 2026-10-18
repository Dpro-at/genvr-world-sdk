import { z } from 'zod';
import { Style } from './common.js';
/**
 * Steepest ground each style allows, in degrees (P2-11, docs/ENGINE-RULES.md "unnatural
 * cliffs"). Sculpting never goes past it and the world checks report steeper ground.
 */
export declare const MAX_TERRAIN_SLOPE: Record<Style, number>;
export declare const StyleSelection: z.ZodObject<{
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
/** The six soils a ground point can count as (footsteps, item rules, and colors in other styles). */
export declare const SoilName: z.ZodEnum<{
    grass: "grass";
    dirt: "dirt";
    sand: "sand";
    rock: "rock";
    snow: "snow";
    mud: "mud";
}>;
export type SoilName = z.infer<typeof SoilName>;
/** A ground material from the library (P2-37), with the soil it counts as. */
export declare const GroundMaterialRef: z.ZodObject<{
    id: z.ZodString;
    soil: z.ZodEnum<{
        grass: "grass";
        dirt: "dirt";
        sand: "sand";
        rock: "rock";
        snow: "snow";
        mud: "mud";
    }>;
}, z.core.$strip>;
export type GroundMaterialRef = z.infer<typeof GroundMaterialRef>;
/** Palette slots of a place's ground: 0-5 are the six soils, 6-15 extra materials. */
export declare const GROUND_SLOTS = 16;
export declare const GroundSlot: z.ZodString;
export type StyleSelection = z.infer<typeof StyleSelection>;
export declare const SkyPreset: z.ZodEnum<{
    day: "day";
    sunset: "sunset";
    night: "night";
    storm: "storm";
    tropical: "tropical";
}>;
export type SkyPreset = z.infer<typeof SkyPreset>;
/**
 * Sky settings kept in `environment.sky.params` (Tidewater world, task 2; `set_sky` over MCP): the hour of the day
 * (0-24; Tidewater 16.2), a turn of the sun's daily path about the vertical in degrees (Tidewater 0), and the wind:
 * where it comes from in degrees clockwise from north (-z), and its speed in m/s (Tidewater (0.35, 0.94) at 7 m/s).
 * `cycle` is the day-night cycle in minutes per day (P2-02). Every one is optional; absent keeps the sky's own.
 */
export declare const SkySettings: z.ZodObject<{
    cycle: z.ZodOptional<z.ZodNumber>;
    timeOfDay: z.ZodOptional<z.ZodNumber>;
    sunAzimuth: z.ZodOptional<z.ZodNumber>;
    windDirection: z.ZodOptional<z.ZodNumber>;
    windSpeed: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export type SkySettings = z.infer<typeof SkySettings>;
/** The sky settings of a place's sky params, dropping any value that is not valid (old or hand-made data). */
export declare function readSkySettings(params: Readonly<Record<string, unknown>> | undefined): SkySettings;
export declare const WeatherPreset: z.ZodEnum<{
    snow: "snow";
    storm: "storm";
    clear: "clear";
    rain: "rain";
    fog: "fog";
    sandstorm: "sandstorm";
}>;
export type WeatherPreset = z.infer<typeof WeatherPreset>;
/** Name a builder gives an object in the studio explorer (task P3-26). */
export declare const ObjectName: z.ZodString;
export declare const WaterBody: z.ZodObject<{
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
export type WaterBody = z.infer<typeof WaterBody>;
/**
 * A river (P2-39): a line that carves a bed into the ground and follows its slope downhill. Only
 * the shape is stored; the water level along it is derived from the terrain by `riverProfile`, so
 * sculpting a hill moves the river with it. A `WaterBody` of kind river in an older place keeps
 * drawing as a flat polygon.
 */
export declare const River: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
    points: z.ZodArray<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
    width: z.ZodDefault<z.ZodNumber>;
    widen: z.ZodDefault<z.ZodNumber>;
    flow: z.ZodDefault<z.ZodNumber>;
    params: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$strip>;
export type River = z.infer<typeof River>;
/**
 * The sea (P2-39): one per place, made by a level rather than a drawn shape. Everything below it
 * is water, out to the edge of the place and across the outer ground, so the coast comes from the
 * shape of the ground itself.
 */
/**
 * The swell that makes the shore waves (Tidewater sea, plan task 3). `direction`: where the waves come from, in
 * degrees clockwise from north (-z), absent = computed from the open side of the island; `period` in seconds
 * (Tidewater 9); `height`: offshore amplitude in metres (Tidewater 0.34). Absent parts keep Tidewater's values.
 */
export declare const SeaSwell: z.ZodObject<{
    direction: z.ZodOptional<z.ZodNumber>;
    period: z.ZodOptional<z.ZodNumber>;
    height: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export type SeaSwell = z.infer<typeof SeaSwell>;
/** Stable reusable ocean resource; absent retains legacy style/quality selection. */
export declare const OceanResourceId: z.ZodEnum<{
    "genvr.core.water.tidewater-ocean": "genvr.core.water.tidewater-ocean";
}>;
export type OceanResourceId = z.infer<typeof OceanResourceId>;
export declare const Sea: z.ZodObject<{
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
}, z.core.$strip>;
export type Sea = z.infer<typeof Sea>;
/** Limits on a place's water (P2-39), kept with the shapes so the studio and the API agree. */
export declare const RIVER_LIMITS: {
    /** Rivers per place. */
    readonly maxPerPlace: 8;
    /** Total length of the centerline in meters (`ROAD_LIMITS.maxLength`). */
    readonly maxLength: 1000;
    /** Shortest distance between two control points, in meters. */
    readonly minSegment: 1;
};
export declare const ItemInstance: z.ZodObject<{
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
}, z.core.$strip>;
export type ItemInstance = z.infer<typeof ItemInstance>;
export declare const Road: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
    points: z.ZodArray<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
    width: z.ZodDefault<z.ZodNumber>;
    materialId: z.ZodOptional<z.ZodString>;
    lanes: z.ZodOptional<z.ZodNumber>;
    oneway: z.ZodOptional<z.ZodBoolean>;
    sidewalk: z.ZodOptional<z.ZodNumber>;
    sidewalkSide: z.ZodOptional<z.ZodEnum<{
        left: "left";
        right: "right";
        both: "both";
    }>>;
}, z.core.$strip>;
export type Road = z.infer<typeof Road>;
/** A door or window cut into one straight segment of a wall. */
export declare const WallOpening: z.ZodObject<{
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
export type WallOpening = z.infer<typeof WallOpening>;
/**
 * How a real building looks (Real place R4b), read from the map: what its facade is made of, its storeys and its
 * roof. Missing fields fall back to plaster, the wall height / 3 m, and a flat roof.
 */
export declare const BuildingLook: z.ZodObject<{
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
}, z.core.$strip>;
export type BuildingLook = z.infer<typeof BuildingLook>;
export declare const Wall: z.ZodObject<{
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
}, z.core.$strip>;
export type Wall = z.infer<typeof Wall>;
/**
 * A paved area laid on the ground (R2l): a square, a market place, a car park. Its edge is exact (painting the ground
 * made blobs: the paint follows the 2 m ground grid); it follows the ground's shape and lies under streets.
 */
export declare const Paving: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
    area: z.ZodArray<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
    materialId: z.ZodString;
}, z.core.$strip>;
export type Paving = z.infer<typeof Paving>;
/**
 * The realistic starter world (P2-40, decision 113): the ground is worked out from a seed instead
 * of starting flat, the way block places already are. A chunk the creator has sculpted is stored
 * and always wins; a place with no seed is flat at 0, exactly as before, so nothing is migrated.
 * A newer generator never changes a place made with an older one.
 */
export declare const WorldSeed: z.ZodObject<{
    seed: z.ZodNumber;
    kind: z.ZodEnum<{
        plain: "plain";
        valley: "valley";
        island: "island";
        mountains: "mountains";
    }>;
    generator: z.ZodUnion<readonly [z.ZodLiteral<1>, z.ZodLiteral<2>]>;
}, z.core.$strip>;
/** The generator new starter worlds are made with. */
export declare const WORLD_GENERATOR: 2;
export type WorldSeed = z.infer<typeof WorldSeed>;
/**
 * Block ground (P2-26, decision 98): the place's ground is a grid of 1 m blocks made by a seeded
 * generator instead of the height field. The same seed and generator version always give the same
 * blocks, so only the settings are stored (edited chunks join when digging and stacking arrive).
 */
export declare const VoxelGround: z.ZodObject<{
    seed: z.ZodNumber;
    generator: z.ZodLiteral<1>;
}, z.core.$strip>;
export type VoxelGround = z.infer<typeof VoxelGround>;
/** Items grouped in the studio explorer (task P3-26); members point to it with `groupId`. */
export declare const ItemGroup: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
}, z.core.$strip>;
export type ItemGroup = z.infer<typeof ItemGroup>;
/** Saved state of an experience. Every change arrives as a Command; see docs/BUILD-TOOLS.md. */
export declare const WorldDocument: z.ZodObject<{
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
            left: "left";
            right: "right";
            both: "both";
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
export type WorldDocument = z.infer<typeof WorldDocument>;
export type WorldDocumentInput = z.input<typeof WorldDocument>;
