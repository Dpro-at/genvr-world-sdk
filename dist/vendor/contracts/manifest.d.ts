import { z } from 'zod';
/** Item types in a .genvr package, see docs/GENVR-FORMAT.md. */
export declare const ItemType: z.ZodEnum<{
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
export type ItemType = z.infer<typeof ItemType>;
/** Store taxonomy: top-level categories are stable, subcategories may grow. */
export declare const Category: z.ZodEnum<{
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
export type Category = z.infer<typeof Category>;
/** `external`: taken whole from a free outside source (Poly Haven and others; 2026-10-06), credited in `origin`. */
export declare const ItemSource: z.ZodEnum<{
    core: "core";
    user: "user";
    ai: "ai";
    external: "external";
}>;
export type ItemSource = z.infer<typeof ItemSource>;
export declare const Price: z.ZodDiscriminatedUnion<[z.ZodObject<{
    type: z.ZodLiteral<"free">;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"paid">;
    coins: z.ZodNumber;
}, z.core.$strip>, z.ZodObject<{
    type: z.ZodLiteral<"subscription">;
}, z.core.$strip>], "type">;
export type Price = z.infer<typeof Price>;
export declare const BuilderModelKind: z.ZodEnum<{
    "props-and-decor": "props-and-decor";
    nature: "nature";
    structures: "structures";
    vehicles: "vehicles";
    characters: "characters";
    "building-blocks": "building-blocks";
}>;
export type BuilderModelKind = z.infer<typeof BuilderModelKind>;
export declare const SaveBuilderItem: z.ZodObject<{
    requestId: z.ZodString;
    name: z.ZodString;
    instanceIds: z.ZodArray<z.ZodString>;
    destination: z.ZodEnum<{
        game: "game";
        marketplace: "marketplace";
    }>;
    kind: z.ZodEnum<{
        "props-and-decor": "props-and-decor";
        nature: "nature";
        structures: "structures";
        vehicles: "vehicles";
        characters: "characters";
        "building-blocks": "building-blocks";
    }>;
    style: z.ZodEnum<{
        realistic: "realistic";
        blocky: "blocky";
        anime: "anime";
        voxel: "voxel";
    }>;
    priceGems: z.ZodNumber;
    selectionHash: z.ZodString;
    model: z.ZodString;
    packaging: z.ZodDefault<z.ZodEnum<{
        assembly: "assembly";
        pack: "pack";
        separate: "separate";
    }>>;
    designs: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        instanceIds: z.ZodArray<z.ZodString>;
        model: z.ZodString;
        priceGems: z.ZodNumber;
    }, z.core.$strict>>>;
}, z.core.$strict>;
export type SaveBuilderItem = z.infer<typeof SaveBuilderItem>;
export declare const SavedBuilderItem: z.ZodObject<{
    id: z.ZodString;
    destination: z.ZodEnum<{
        game: "game";
        marketplace: "marketplace";
    }>;
    status: z.ZodEnum<{
        draft: "draft";
        in_review: "in_review";
    }>;
    priceGems: z.ZodNumber;
    checkoutEnabled: z.ZodLiteral<false>;
    items: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        priceGems: z.ZodNumber;
    }, z.core.$strip>>>;
    packaging: z.ZodOptional<z.ZodEnum<{
        assembly: "assembly";
        pack: "pack";
        separate: "separate";
    }>>;
}, z.core.$strip>;
/**
 * Where an item taken from a free outside source comes from (2026-10-06): the source, its id there, its page, the
 * licence and the people who made it. Kept with the item so every game that uses it can name them.
 */
export declare const ItemOrigin: z.ZodObject<{
    provider: z.ZodEnum<{
        polyhaven: "polyhaven";
        kenney: "kenney";
        sketchfab: "sketchfab";
    }>;
    assetId: z.ZodString;
    page: z.ZodString;
    license: z.ZodString;
    authors: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type ItemOrigin = z.infer<typeof ItemOrigin>;
/** Semantic version such as "1.0.0". */
export declare const SemVer: z.ZodString;
/**
 * How an item rests on what is under it (P2-43, decision 116): written once per item, never per
 * map. `sink` is the most it may be buried (meters); `base` is the real footprint in local x, z
 * (a tree touches the ground with its trunk, not its canopy).
 */
export declare const RestRule: z.ZodObject<{
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
}, z.core.$strip>;
export type RestRule = z.infer<typeof RestRule>;
/**
 * Where and how an item may stand in a world (P2-11, owner note): the world checks test every
 * placed item against these rules, the assistant follows them, and the studio shows which rule
 * an item breaks. Absent fields mean no rule. "Front" is the item's +z side.
 */
export declare const PlacementRules: z.ZodObject<{
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
}, z.core.$strip>;
export type PlacementRules = z.infer<typeof PlacementRules>;
/** An item's manifest. A script item (P2-10) is one `scripts/<name>.js` file and nothing to draw. */
export declare const GenvrManifest: z.ZodObject<{
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
export type GenvrManifest = z.infer<typeof GenvrManifest>;
export type GenvrManifestInput = z.input<typeof GenvrManifest>;
/**
 * A package file path inside a `.genvr` package: lowercase segments (it becomes part of a
 * storage key), no "..". Models are GLB for now (one file, no external buffers); a script item's one file is
 * `scripts/<name>.js` (P2-10).
 */
export declare const PackagePath: z.ZodString;
export type PackagePath = z.infer<typeof PackagePath>;
/** An item's package as the player loads it: the manifest and a signed link per file. */
export declare const ItemPackage: z.ZodObject<{
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
        url: z.ZodString;
        size: z.ZodNumber;
        contentType: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type ItemPackage = z.infer<typeof ItemPackage>;
