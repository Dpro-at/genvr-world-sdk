import { z } from 'zod';
import { type AvatarLook, type HumanBuild } from './avatar-look.js';
/**
 * Character recipe (CHAR-01, plan docs/superpowers/plans/2026-10-05-character-editor-phase1.md): a character as
 * settings only, never meshes. The editor shapes and colours one of the bodies on its own skeleton; clothes,
 * animations and effects are slots for library items made for the same 52-bone Mixamo-name rig (phase 2).
 */
export declare const CHARACTER_RECIPE_VERSION = 1;
/** The one rig every recipe, garment and animation item is made for. */
export declare const CHARACTER_RIG = "mixamo-52";
/** Largest recipe as JSON (bytes of UTF-16 text length; recipes are small ASCII settings). */
export declare const MAX_RECIPE_JSON = 8192;
/** Shape factors (1 = the body as made). Height and size keep the head; weight widens across the bones. */
export declare const CHARACTER_SHAPE_LIMITS: {
    readonly height: {
        readonly min: 0.85;
        readonly max: 1.15;
    };
    readonly weight: {
        readonly min: 0.75;
        readonly max: 1.35;
    };
    readonly scale: {
        readonly min: 0.6;
        readonly max: 1.6;
    };
};
/** Colour areas of a recipe; block bodies paint them, mesh bodies take the tint. */
export declare const CHARACTER_COLOR_PARTS: readonly ["skin", "hair", "top", "bottom", "shoes", "tint"];
export type CharacterColorPart = (typeof CHARACTER_COLOR_PARTS)[number];
/** Where a garment sits (phase 2 clothing items). */
export declare const GARMENT_SLOTS: readonly ["head", "hair", "face", "neck", "top", "bottom", "full-body", "waist", "hands", "feet", "back"];
/** Layers from the skin outwards (extends decision 92); one garment per slot and layer. */
export declare const GARMENT_LAYERS: readonly ["inner", "mid", "outer", "accessory"];
export declare const MAX_RECIPE_CLOTHES = 12;
export declare const MAX_RECIPE_EMOTES = 16;
export declare const MAX_RECIPE_EFFECTS = 8;
export declare const CharacterShape: z.ZodObject<{
    height: z.ZodDefault<z.ZodNumber>;
    weight: z.ZodDefault<z.ZodNumber>;
    scale: z.ZodDefault<z.ZodNumber>;
    anime: z.ZodDefault<z.ZodNumber>;
    muscle: z.ZodDefault<z.ZodNumber>;
    fat: z.ZodDefault<z.ZodNumber>;
    fatPattern: z.ZodDefault<z.ZodNumber>;
    definition: z.ZodDefault<z.ZodNumber>;
    muscles: z.ZodDefault<z.ZodRecord<z.ZodEnum<{
        neck: "neck";
        shoulders: "shoulders";
        chest: "chest";
        traps: "traps";
        lats: "lats";
        biceps: "biceps";
        triceps: "triceps";
        forearms: "forearms";
        abs: "abs";
        obliques: "obliques";
        waist: "waist";
        lowerBack: "lowerBack";
        hips: "hips";
        glutes: "glutes";
        quads: "quads";
        hamstrings: "hamstrings";
        calves: "calves";
        hands: "hands";
    }> & z.core.$partial, z.ZodNumber>>;
    fatRegions: z.ZodDefault<z.ZodRecord<z.ZodEnum<{
        forearms: "forearms";
        waist: "waist";
        hips: "hips";
        calves: "calves";
        belly: "belly";
        buttocks: "buttocks";
        thighs: "thighs";
        upperArms: "upperArms";
        face: "face";
        chin: "chin";
    }> & z.core.$partial, z.ZodNumber>>;
    face: z.ZodDefault<z.ZodRecord<z.ZodEnum<{
        eyeSize: "eyeSize";
        eyeOpen: "eyeOpen";
        eyeSpacing: "eyeSpacing";
        eyeHeight: "eyeHeight";
        eyeTilt: "eyeTilt";
        eyeFold: "eyeFold";
        eyeDepth: "eyeDepth";
        browHeight: "browHeight";
        browAngle: "browAngle";
        noseSize: "noseSize";
        noseWidth: "noseWidth";
        noseLength: "noseLength";
        noseBridge: "noseBridge";
        noseTip: "noseTip";
        nostrils: "nostrils";
        noseDepth: "noseDepth";
        mouthWidth: "mouthWidth";
        mouthHeight: "mouthHeight";
        upperLip: "upperLip";
        lowerLip: "lowerLip";
        mouthCorners: "mouthCorners";
        cheekVolume: "cheekVolume";
        cheekBones: "cheekBones";
        cheekInner: "cheekInner";
        chinWidth: "chinWidth";
        chinHeight: "chinHeight";
        chinForward: "chinForward";
        jawWidth: "jawWidth";
        headWidth: "headWidth";
        headLength: "headLength";
    }> & z.core.$partial, z.ZodNumber>>;
}, z.core.$strict>;
export type CharacterShape = z.infer<typeof CharacterShape>;
export declare const NORMAL_CHARACTER_SHAPE: CharacterShape;
/**
 * What a generated character is: base, sex and style are separate choices and never mix (owner, 2026-10-05):
 * each style keeps its own controls (Anime Shape only on anime). Ready today: human, boy, anime.
 */
export declare const CHARACTER_BASES: readonly ["human"];
export declare const CHARACTER_SEXES: readonly ["boy", "girl"];
export declare const CHARACTER_STYLES: readonly ["anime", "realistic", "cartoon"];
/**
 * Body weight and fat (owner: type a height and a weight and the body follows): the body mass index runs from
 * the slim base body (fat 0) to MAX_BODY_FAT; kilograms = BMI x height squared.
 */
export declare const BODY_MASS_INDEX: {
    readonly slim: 18.5;
    readonly heaviest: 35;
};
/** Body fat for a weight (kg) at a height (m), clamped to 0..MAX_BODY_FAT. */
export declare function fatForWeight(kilograms: number, metres: number): number;
/** The weight (kg) a body fat gives at a height (m). */
export declare function weightForFat(fat: number, metres: number): number;
/** The build a recipe's shape gives a generated body (only the keys that are not 0). */
export declare function recipeBuild(shape: CharacterShape): HumanBuild;
export declare const CharacterColors: z.ZodObject<{
    skin: z.ZodDefault<z.ZodString>;
    hair: z.ZodDefault<z.ZodString>;
    top: z.ZodDefault<z.ZodString>;
    bottom: z.ZodDefault<z.ZodString>;
    shoes: z.ZodDefault<z.ZodString>;
    tint: z.ZodDefault<z.ZodString>;
    skinMaterial: z.ZodDefault<z.ZodString>;
}, z.core.$strict>;
export type CharacterColors = z.infer<typeof CharacterColors>;
export declare const RecipeGarment: z.ZodObject<{
    slot: z.ZodEnum<{
        hair: "hair";
        head: "head";
        neck: "neck";
        waist: "waist";
        hands: "hands";
        face: "face";
        bottom: "bottom";
        top: "top";
        "full-body": "full-body";
        feet: "feet";
        back: "back";
    }>;
    layer: z.ZodDefault<z.ZodEnum<{
        inner: "inner";
        mid: "mid";
        outer: "outer";
        accessory: "accessory";
    }>>;
    item: z.ZodString;
    colors: z.ZodDefault<z.ZodArray<z.ZodString>>;
    params: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodNumber, z.ZodString, z.ZodBoolean]>>>;
}, z.core.$strict>;
export type RecipeGarment = z.infer<typeof RecipeGarment>;
export declare const RecipeEffect: z.ZodObject<{
    kind: z.ZodString;
    color: z.ZodOptional<z.ZodString>;
    amount: z.ZodOptional<z.ZodNumber>;
}, z.core.$strict>;
export declare const CharacterRecipe: z.ZodObject<{
    version: z.ZodDefault<z.ZodLiteral<1>>;
    rig: z.ZodDefault<z.ZodLiteral<"mixamo-52">>;
    name: z.ZodDefault<z.ZodString>;
    body: z.ZodDefault<z.ZodUnion<readonly [z.ZodEnum<{
        flat: "flat";
        classic: "classic";
        simple: "simple";
        starter: "starter";
        "anime-boy": "anime-boy";
        warrior: "warrior";
        human: "human";
    }>, z.ZodType<`user.${string}`, unknown, z.core.$ZodTypeInternals<`user.${string}`, unknown>>]>>;
    base: z.ZodDefault<z.ZodEnum<{
        human: "human";
    }>>;
    sex: z.ZodDefault<z.ZodEnum<{
        boy: "boy";
        girl: "girl";
    }>>;
    style: z.ZodDefault<z.ZodEnum<{
        realistic: "realistic";
        anime: "anime";
        cartoon: "cartoon";
    }>>;
    shape: z.ZodDefault<z.ZodObject<{
        height: z.ZodDefault<z.ZodNumber>;
        weight: z.ZodDefault<z.ZodNumber>;
        scale: z.ZodDefault<z.ZodNumber>;
        anime: z.ZodDefault<z.ZodNumber>;
        muscle: z.ZodDefault<z.ZodNumber>;
        fat: z.ZodDefault<z.ZodNumber>;
        fatPattern: z.ZodDefault<z.ZodNumber>;
        definition: z.ZodDefault<z.ZodNumber>;
        muscles: z.ZodDefault<z.ZodRecord<z.ZodEnum<{
            neck: "neck";
            shoulders: "shoulders";
            chest: "chest";
            traps: "traps";
            lats: "lats";
            biceps: "biceps";
            triceps: "triceps";
            forearms: "forearms";
            abs: "abs";
            obliques: "obliques";
            waist: "waist";
            lowerBack: "lowerBack";
            hips: "hips";
            glutes: "glutes";
            quads: "quads";
            hamstrings: "hamstrings";
            calves: "calves";
            hands: "hands";
        }> & z.core.$partial, z.ZodNumber>>;
        fatRegions: z.ZodDefault<z.ZodRecord<z.ZodEnum<{
            forearms: "forearms";
            waist: "waist";
            hips: "hips";
            calves: "calves";
            belly: "belly";
            buttocks: "buttocks";
            thighs: "thighs";
            upperArms: "upperArms";
            face: "face";
            chin: "chin";
        }> & z.core.$partial, z.ZodNumber>>;
        face: z.ZodDefault<z.ZodRecord<z.ZodEnum<{
            eyeSize: "eyeSize";
            eyeOpen: "eyeOpen";
            eyeSpacing: "eyeSpacing";
            eyeHeight: "eyeHeight";
            eyeTilt: "eyeTilt";
            eyeFold: "eyeFold";
            eyeDepth: "eyeDepth";
            browHeight: "browHeight";
            browAngle: "browAngle";
            noseSize: "noseSize";
            noseWidth: "noseWidth";
            noseLength: "noseLength";
            noseBridge: "noseBridge";
            noseTip: "noseTip";
            nostrils: "nostrils";
            noseDepth: "noseDepth";
            mouthWidth: "mouthWidth";
            mouthHeight: "mouthHeight";
            upperLip: "upperLip";
            lowerLip: "lowerLip";
            mouthCorners: "mouthCorners";
            cheekVolume: "cheekVolume";
            cheekBones: "cheekBones";
            cheekInner: "cheekInner";
            chinWidth: "chinWidth";
            chinHeight: "chinHeight";
            chinForward: "chinForward";
            jawWidth: "jawWidth";
            headWidth: "headWidth";
            headLength: "headLength";
        }> & z.core.$partial, z.ZodNumber>>;
    }, z.core.$strict>>;
    colors: z.ZodDefault<z.ZodObject<{
        skin: z.ZodDefault<z.ZodString>;
        hair: z.ZodDefault<z.ZodString>;
        top: z.ZodDefault<z.ZodString>;
        bottom: z.ZodDefault<z.ZodString>;
        shoes: z.ZodDefault<z.ZodString>;
        tint: z.ZodDefault<z.ZodString>;
        skinMaterial: z.ZodDefault<z.ZodString>;
    }, z.core.$strict>>;
    hair: z.ZodDefault<z.ZodObject<{
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
    clothes: z.ZodDefault<z.ZodArray<z.ZodObject<{
        slot: z.ZodEnum<{
            hair: "hair";
            head: "head";
            neck: "neck";
            waist: "waist";
            hands: "hands";
            face: "face";
            bottom: "bottom";
            top: "top";
            "full-body": "full-body";
            feet: "feet";
            back: "back";
        }>;
        layer: z.ZodDefault<z.ZodEnum<{
            inner: "inner";
            mid: "mid";
            outer: "outer";
            accessory: "accessory";
        }>>;
        item: z.ZodString;
        colors: z.ZodDefault<z.ZodArray<z.ZodString>>;
        params: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnion<readonly [z.ZodNumber, z.ZodString, z.ZodBoolean]>>>;
    }, z.core.$strict>>>;
    animations: z.ZodDefault<z.ZodObject<{
        idle: z.ZodDefault<z.ZodString>;
        emotes: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strict>>;
    effects: z.ZodDefault<z.ZodArray<z.ZodObject<{
        kind: z.ZodString;
        color: z.ZodOptional<z.ZodString>;
        amount: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strict>>>;
}, z.core.$strict>;
export type CharacterRecipe = z.infer<typeof CharacterRecipe>;
export declare const DEFAULT_CHARACTER_RECIPE: CharacterRecipe;
export type RecipeResult = {
    ok: true;
    recipe: CharacterRecipe;
} | {
    ok: false;
    error: string;
};
/** Reads a recipe strictly (a file, a request): too large, unknown keys or values out of range are refused. */
export declare function parseCharacterRecipe(input: unknown): RecipeResult;
/** Reads a saved recipe leniently: every broken part falls back to its default. */
export declare function readCharacterRecipe(saved: unknown): CharacterRecipe;
/** The avatar look a recipe paints (body and colours; sizes come from the recipe's shape, not the look). */
export declare function recipeLook(recipe: CharacterRecipe): AvatarLook;
