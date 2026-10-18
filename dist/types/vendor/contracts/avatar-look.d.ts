import { z } from 'zod';
/** Body parts a player colors on the Look tab. */
export declare const AVATAR_COLOR_PARTS: readonly ["skin", "hair", "shirt", "pants", "shoes"];
export type AvatarColorPart = (typeof AVATAR_COLOR_PARTS)[number];
/** Body size limits (P2-22), like Roblox body scales: 1 is the normal size. */
export declare const AVATAR_SCALE_LIMITS: {
    readonly height: {
        readonly min: 0.9;
        readonly max: 1.1;
    };
    readonly width: {
        readonly min: 0.8;
        readonly max: 1.1;
    };
    readonly head: {
        readonly min: 0.9;
        readonly max: 1.15;
    };
};
export declare const AvatarScale: z.ZodObject<{
    height: z.ZodDefault<z.ZodNumber>;
    width: z.ZodDefault<z.ZodNumber>;
    head: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export type AvatarScale = z.infer<typeof AvatarScale>;
export declare const NORMAL_AVATAR_SCALE: AvatarScale;
/** Clothing and accessories worn at once (one per slot, P2-20). */
export declare const MAX_WORN_ITEMS = 8;
/**
 * Avatar body types (decision 73, P2-22): each has its own skeleton. `classic` is the Roblox-like
 * main avatar (15 jointed parts, like R15); `simple` has six stiff parts (like R6); `starter` is
 * the first test body on the 52-bone rig; `flat` is the 2D body of side-view places (decision
 * 93), worn only where a place asks for it; `anime-boy` is the first mesh body (a 3D model made
 * from the owner's concept sheet, decision 111, P2-35); `warrior` is the owner's main character
 * (P2-35), a mesh body with swinging hair and coat; `human` is our own generated body (CHAR-02): made by our code
 * from settings (style, gender), anime boy first. The realistic body joins later.
 */
export declare const AvatarBodyType: z.ZodEnum<{
    flat: "flat";
    classic: "classic";
    simple: "simple";
    starter: "starter";
    "anime-boy": "anime-boy";
    warrior: "warrior";
    human: "human";
    robot: "robot";
}>;
export type AvatarBodyType = z.infer<typeof AvatarBodyType>;
/** A creator's uploaded body item, by its store id (uploaded bodies, 2026-10-03). */
export declare const ItemBodyId: z.ZodType<`user.${string}`>;
/**
 * The body a look wears or a place uses: one of Genvr's bodies, or a creator's uploaded body item (uploaded bodies,
 * 2026-10-03). Who may wear an item body is checked by the API (the join ticket) and the room; anywhere else it falls
 * back to Classic until its model is known.
 */
export declare const BodyId: z.ZodUnion<readonly [z.ZodEnum<{
    flat: "flat";
    classic: "classic";
    simple: "simple";
    starter: "starter";
    "anime-boy": "anime-boy";
    warrior: "warrior";
    human: "human";
    robot: "robot";
}>, z.ZodType<`user.${string}`, unknown, z.core.$ZodTypeInternals<`user.${string}`, unknown>>]>;
export type BodyId = z.infer<typeof BodyId>;
/** Whether a body id is one of Genvr's own bodies (kept looks are kept for those only). */
export declare const isCoreBodyId: (id: BodyId) => id is AvatarBodyType;
/**
 * Muscle zones of a generated human body (the owner's 17 and the hands, docs/reference/character-anime/muscles/), each an offset
 * on the overall muscle (Stage B, 2026-10-05).
 */
export declare const MUSCLE_GROUPS: readonly ["neck", "shoulders", "chest", "traps", "lats", "biceps", "triceps", "forearms", "abs", "obliques", "waist", "lowerBack", "hips", "glutes", "quads", "hamstrings", "calves", "hands"];
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];
/** One fixed colour per muscle zone (owner's table, 2026-10-05): the editor's dots and its Muscles view. */
export declare const MUSCLE_ZONE_COLORS: Readonly<Record<MuscleGroup, string>>;
/**
 * Muscles that are parts of one editor zone (owner's anatomy sheets, docs/reference/character-anime/muscles/):
 * each part bulges on its own, the zone's slider moves them together. Other zones are one part of the same name.
 */
export declare const MUSCLE_PART_ZONE: Readonly<Record<string, MuscleGroup>>;
/**
 * Every anatomical muscle part, in a fixed order (the bake stores 1 + this index per vertex; the paint tool and the
 * review pictures colour by it). A part that is not in MUSCLE_PART_ZONE is its own editor zone.
 */
export declare const MUSCLE_PARTS: readonly ["neck", "deltoid", "chest", "traps", "lats", "biceps", "brachialis", "triceps", "brachioradialis", "flexors", "extensors", "abs", "obliques", "waist", "lowerBack", "hips", "glutes", "quads", "hamstrings", "calves", "thenar", "hypothenar", "palm", "handBack"];
export type MusclePart = (typeof MUSCLE_PARTS)[number];
/** Each part's colour in the paint tool and the review pictures (owner's sheets). */
export declare const MUSCLE_PART_COLOURS: Readonly<Record<MusclePart, string>>;
/** Where a generated human body stores fat, each an offset on the overall fat. */
export declare const FAT_REGIONS: readonly ["belly", "waist", "hips", "buttocks", "thighs", "upperArms", "forearms", "calves", "face", "chin"];
export type FatRegion = (typeof FAT_REGIONS)[number];
/**
 * Face controls of a generated human body (FACE-01, owner notes 82/86), each -1..1 (0 the face as made). The same
 * names and order as tooling/human-bake/build-targets.mjs FACE_TARGETS; the editor groups them by part.
 */
export declare const FACE_FEATURES: readonly ["eyeSize", "eyeOpen", "eyeSpacing", "eyeHeight", "eyeTilt", "eyeFold", "eyeDepth", "browHeight", "browAngle", "noseSize", "noseWidth", "noseLength", "noseBridge", "noseTip", "nostrils", "noseDepth", "mouthWidth", "mouthHeight", "upperLip", "lowerLip", "mouthCorners", "cheekVolume", "cheekBones", "cheekInner", "chinWidth", "chinHeight", "chinForward", "jawWidth", "headWidth", "headLength"];
export type FaceFeature = (typeof FACE_FEATURES)[number];
/** The parts of the face, for the editor and the MCP schema: each feature belongs to one. */
export declare const FACE_PARTS: Record<'eyes' | 'brows' | 'nose' | 'mouth' | 'cheeks' | 'jaw' | 'head', readonly FaceFeature[]>;
/** Most overall fat a body may have (kids audience: healthy ranges only). */
export declare const MAX_BODY_FAT = 0.85;
/**
 * A generated body's build as the runtime reads it: `muscle` (-1..1), `fat` (0..MAX_BODY_FAT), `fatPattern`
 * (-1 upper body .. 1 lower body), `definition` (0..1), `muscle.<group>` and `fat.<region>` offsets and
 * `face.<feature>` controls (-1..1).
 * Absent keys are 0.
 */
export declare const BUILD_KEYS: readonly ["muscle", "fat", "fatPattern", "definition", ...("muscle.neck" | "muscle.shoulders" | "muscle.chest" | "muscle.traps" | "muscle.lats" | "muscle.biceps" | "muscle.triceps" | "muscle.forearms" | "muscle.abs" | "muscle.obliques" | "muscle.waist" | "muscle.lowerBack" | "muscle.hips" | "muscle.glutes" | "muscle.quads" | "muscle.hamstrings" | "muscle.calves" | "muscle.hands" | "fat.forearms" | "fat.waist" | "fat.hips" | "fat.calves" | "fat.belly" | "fat.buttocks" | "fat.thighs" | "fat.upperArms" | "fat.face" | "fat.chin" | "face.eyeSize" | "face.eyeOpen" | "face.eyeSpacing" | "face.eyeHeight" | "face.eyeTilt" | "face.eyeFold" | "face.eyeDepth" | "face.browHeight" | "face.browAngle" | "face.noseSize" | "face.noseWidth" | "face.noseLength" | "face.noseBridge" | "face.noseTip" | "face.nostrils" | "face.noseDepth" | "face.mouthWidth" | "face.mouthHeight" | "face.upperLip" | "face.lowerLip" | "face.mouthCorners" | "face.cheekVolume" | "face.cheekBones" | "face.cheekInner" | "face.chinWidth" | "face.chinHeight" | "face.chinForward" | "face.jawWidth" | "face.headWidth" | "face.headLength")[]];
export type BuildKey = (typeof BUILD_KEYS)[number];
export declare const HumanBuild: z.ZodRecord<z.ZodEnum<{
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
}> & z.core.$partial, z.ZodNumber>;
export type HumanBuild = z.infer<typeof HumanBuild>;
/**
 * Hair, eyebrows and beard of a generated body (HAIR-01): CC0 MakeHuman assets fitted onto our body by the bake
 * (tooling/human-bake/proxies.mjs, public/human/proxies/<id>.bin). Absent: none. Coloured with the look's hair colour.
 */
export declare const HUMAN_HAIR_STYLES: readonly ["hair.short01", "hair.short02", "hair.short03", "hair.short04"];
export declare const HUMAN_BROW_STYLES: readonly ["brows.eyebrow001", "brows.eyebrow006", "brows.eyebrow010"];
export declare const HUMAN_BEARD_STYLES: readonly ["beard.viking", "beard.moustache"];
export declare const HumanHair: z.ZodObject<{
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
}, z.core.$strict>;
export type HumanHair = z.infer<typeof HumanHair>;
/**
 * A player's avatar look (task P2-20): body colors and the Core Library wearables they put on
 * (item ids). Saved on the account and in the browser until signed in.
 */
export declare const AvatarLook: z.ZodObject<{
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
}, z.core.$strip>;
export type AvatarLook = z.infer<typeof AvatarLook>;
export declare const DEFAULT_AVATAR_LOOK: AvatarLook;
/** Reads a saved look leniently: broken fields fall back to their defaults. */
export declare function readAvatarLook(saved: unknown): AvatarLook;
/** A look kept for one body type while another body is worn (P2-22). */
export declare const AvatarBodyOutfit: z.ZodObject<{
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
}, z.core.$strip>;
export type AvatarBodyOutfit = z.infer<typeof AvatarBodyOutfit>;
/**
 * The account's avatar (P2-22): the look worn now, plus the look kept for each other body type
 * (every body keeps its own colors, clothing, and size). Rooms only ever get plain looks.
 */
export declare const AvatarProfile: z.ZodObject<{
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
    bodies: z.ZodDefault<z.ZodRecord<z.ZodEnum<{
        flat: "flat";
        classic: "classic";
        simple: "simple";
        starter: "starter";
        "anime-boy": "anime-boy";
        warrior: "warrior";
        human: "human";
        robot: "robot";
    }> & z.core.$partial, z.ZodObject<{
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
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type AvatarProfile = z.infer<typeof AvatarProfile>;
/** Reads a saved avatar leniently: the worn look as `readAvatarLook`, broken kept looks dropped. */
export declare function readAvatarProfile(saved: unknown): AvatarProfile;
/** The look of `body` in a saved avatar: the worn look, the look kept for it, or the worn look moved over. */
export declare function lookForBody(saved: unknown, body: BodyId): AvatarLook;
/**
 * Switches to another body: the worn look is kept for the old body, the new body's look comes back. Looks are kept
 * for Genvr's bodies only (an uploaded body is one model with no colors or sizes of its own).
 */
export declare function wearBody(saved: unknown, body: BodyId): AvatarProfile;
/**
 * How avatars look in a place (task P2-21), set by the owner in the place settings:
 * - `player`: everyone wears their own look;
 * - `player-limited`: their own look without large accessories (capes, wings, backpacks), at
 *   the normal size;
 * - `place`: everyone wears the place's outfit at the normal size and keeps their own skin,
 *   hair, and body type.
 */
export declare const PlaceAvatarMode: z.ZodEnum<{
    player: "player";
    "player-limited": "player-limited";
    place: "place";
}>;
export type PlaceAvatarMode = z.infer<typeof PlaceAvatarMode>;
export declare const PlaceAvatar: z.ZodObject<{
    mode: z.ZodDefault<z.ZodEnum<{
        player: "player";
        "player-limited": "player-limited";
        place: "place";
    }>>;
    body: z.ZodDefault<z.ZodUnion<readonly [z.ZodLiteral<"any">, z.ZodUnion<readonly [z.ZodEnum<{
        flat: "flat";
        classic: "classic";
        simple: "simple";
        starter: "starter";
        "anime-boy": "anime-boy";
        warrior: "warrior";
        human: "human";
        robot: "robot";
    }>, z.ZodType<`user.${string}`, unknown, z.core.$ZodTypeInternals<`user.${string}`, unknown>>]>]>>;
    outfit: z.ZodDefault<z.ZodObject<{
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
}, z.core.$strip>;
export type PlaceAvatar = z.infer<typeof PlaceAvatar>;
export declare const DEFAULT_PLACE_AVATAR: PlaceAvatar;
/** Reads the saved setting leniently: anything broken means players wear their own look. */
export declare function readPlaceAvatar(saved: unknown): PlaceAvatar;
