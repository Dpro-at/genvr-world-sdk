import { normalizeCharacterRig } from './character-rig-compatibility.js';
import { z } from 'zod';
import {
  BodyId,
  BUILD_KEYS,
  DEFAULT_AVATAR_LOOK,
  FACE_FEATURES,
  FAT_REGIONS,
  HumanHair,
  MAX_BODY_FAT,
  MUSCLE_GROUPS,
  type AvatarLook,
  type HumanBuild,
} from './avatar-look.js';

/**
 * Character recipe (CHAR-01, plan docs/superpowers/plans/2026-10-05-character-editor-phase1.md): a character as
 * settings only, never meshes. The editor shapes and colours one of the bodies on its own skeleton; clothes,
 * animations and effects are slots for library items made for the same standard 52-bone humanoid rig (phase 2).
 */

export const CHARACTER_RECIPE_VERSION = 1;
/** The one rig every recipe, garment and animation item is made for. */
export const CHARACTER_RIG = 'genvr-humanoid-52';
/** Largest recipe as JSON (bytes of UTF-16 text length; recipes are small ASCII settings). */
export const MAX_RECIPE_JSON = 8192;

/** Shape factors (1 = the body as made). Height and size keep the head; weight widens across the bones. */
export const CHARACTER_SHAPE_LIMITS = {
  height: { min: 0.85, max: 1.15 },
  weight: { min: 0.75, max: 1.35 },
  scale: { min: 0.6, max: 1.6 },
} as const;

/** Colour areas of a recipe; block bodies paint them, mesh bodies take the tint. */
export const CHARACTER_COLOR_PARTS = ['skin', 'hair', 'top', 'bottom', 'shoes', 'tint'] as const;
export type CharacterColorPart = (typeof CHARACTER_COLOR_PARTS)[number];

/** Where a garment sits (phase 2 clothing items). */
export const GARMENT_SLOTS = [
  'head',
  'hair',
  'face',
  'neck',
  'top',
  'bottom',
  'full-body',
  'waist',
  'hands',
  'feet',
  'back',
] as const;
/** Layers from the skin outwards (extends decision 92); one garment per slot and layer. */
export const GARMENT_LAYERS = ['inner', 'mid', 'outer', 'accessory'] as const;

export const MAX_RECIPE_CLOTHES = 12;
export const MAX_RECIPE_EMOTES = 16;
export const MAX_RECIPE_EFFECTS = 8;
const MAX_GARMENT_PARAMS = 16;

const Hex = z.string().regex(/^#[0-9a-f]{6}$/i);
/** A library item id: Genvr's (`genvr.core.*`) or a creator's (`user.*`). */
const LibraryItemId = z.string().regex(/^[a-z0-9][a-z0-9._-]{2,126}$/);
/** A clip name (`Idle`, `Wave`) or an animation item id. */
const ClipId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/);

const factor = (limits: { min: number; max: number }) =>
  z.number().min(limits.min).max(limits.max).default(1);

export const CharacterShape = z
  .object({
    height: factor(CHARACTER_SHAPE_LIMITS.height),
    weight: factor(CHARACTER_SHAPE_LIMITS.weight),
    scale: factor(CHARACTER_SHAPE_LIMITS.scale),
    /** Anime Shape (generated body): 0 the base face, 1 full anime proportions (bigger eyes, smaller nose...). */
    anime: z.number().min(0).max(1).default(0),
    /** Overall muscle of a generated body: -1 less .. 1 more (0 the body as made). */
    muscle: z.number().min(-1).max(1).default(0),
    /** Overall body fat of a generated body: 0 slim .. MAX_BODY_FAT. */
    fat: z.number().min(0).max(MAX_BODY_FAT).default(0),
    /** Where the fat goes: -1 upper body (belly, waist, chest) .. 1 lower body (hips, buttocks, thighs). */
    fatPattern: z.number().min(-1).max(1).default(0),
    /** How clearly the muscles show (the lines between them), 0 soft .. 1 very defined; fat softens it. */
    definition: z.number().min(0).max(1).default(0),
    /** Each muscle group on top of the overall muscle, -1..1. */
    muscles: z.partialRecord(z.enum(MUSCLE_GROUPS), z.number().min(-1).max(1)).default({}),
    /** Each fat region on top of the overall fat, -1..1. */
    fatRegions: z.partialRecord(z.enum(FAT_REGIONS), z.number().min(-1).max(1)).default({}),
    /** Face controls (nose, eyes, mouth, cheeks, jaw, brows, head), -1..1 each; absent is 0 (FACE-01). */
    face: z.partialRecord(z.enum(FACE_FEATURES), z.number().min(-1).max(1)).default({}),
  })
  .strict();
export type CharacterShape = z.infer<typeof CharacterShape>;
export const NORMAL_CHARACTER_SHAPE: CharacterShape = {
  height: 1,
  weight: 1,
  scale: 1,
  anime: 0,
  muscle: 0,
  fat: 0,
  fatPattern: 0,
  definition: 0,
  muscles: {},
  fatRegions: {},
  face: {},
};

/**
 * What a generated character is: base, sex and style are separate choices and never mix (owner, 2026-10-05):
 * each style keeps its own controls (Anime Shape only on anime). Ready today: human, boy, anime.
 */
export const CHARACTER_BASES = ['human'] as const;
export const CHARACTER_SEXES = ['boy', 'girl'] as const;
export const CHARACTER_STYLES = ['anime', 'realistic', 'cartoon'] as const;

/**
 * Body weight and fat (owner: type a height and a weight and the body follows): the body mass index runs from
 * the slim base body (fat 0) to MAX_BODY_FAT; kilograms = BMI x height squared.
 */
export const BODY_MASS_INDEX = { slim: 18.5, heaviest: 35 } as const;

/** Body fat for a weight (kg) at a height (m), clamped to 0..MAX_BODY_FAT. */
export function fatForWeight(kilograms: number, metres: number): number {
  const bmi = kilograms / (metres * metres);
  const share = (bmi - BODY_MASS_INDEX.slim) / (BODY_MASS_INDEX.heaviest - BODY_MASS_INDEX.slim);
  return Math.round(Math.min(1, Math.max(0, share)) * MAX_BODY_FAT * 100) / 100;
}

/** The weight (kg) a body fat gives at a height (m). */
export function weightForFat(fat: number, metres: number): number {
  const share = Math.min(1, Math.max(0, fat / MAX_BODY_FAT));
  return (BODY_MASS_INDEX.slim + share * (BODY_MASS_INDEX.heaviest - BODY_MASS_INDEX.slim)) * metres * metres;
}

/** The build a recipe's shape gives a generated body (only the keys that are not 0). */
export function recipeBuild(shape: CharacterShape): HumanBuild {
  const values: Record<string, number> = {
    muscle: shape.muscle,
    fat: shape.fat,
    fatPattern: shape.fatPattern,
    definition: shape.definition,
    ...Object.fromEntries(Object.entries(shape.muscles).map(([group, value]) => [`muscle.${group}`, value])),
    ...Object.fromEntries(Object.entries(shape.fatRegions).map(([region, value]) => [`fat.${region}`, value])),
    ...Object.fromEntries(Object.entries(shape.face).map(([feature, value]) => [`face.${feature}`, value])),
  };
  return Object.fromEntries(
    BUILD_KEYS.filter((key) => values[key]).map((key) => [key, values[key]!]),
  ) as HumanBuild;
}

export const CharacterColors = z
  .object({
    skin: Hex.default(DEFAULT_AVATAR_LOOK.skin),
    hair: Hex.default(DEFAULT_AVATAR_LOOK.hair),
    top: Hex.default(DEFAULT_AVATAR_LOOK.shirt),
    bottom: Hex.default(DEFAULT_AVATAR_LOOK.pants),
    shoes: Hex.default(DEFAULT_AVATAR_LOOK.shoes),
    tint: Hex.default('#ffffff'),
    /** A fantasy skin material id (Core Library `SKIN_MATERIALS`); empty: the plain skin colour. */
    skinMaterial: z.string().regex(/^[a-z0-9-]{0,40}$/).default(''),
  })
  .strict();
export type CharacterColors = z.infer<typeof CharacterColors>;

const GarmentParam = z.union([z.number().finite(), z.string().max(40), z.boolean()]);

export const RecipeGarment = z
  .object({
    slot: z.enum(GARMENT_SLOTS),
    layer: z.enum(GARMENT_LAYERS).default('inner'),
    item: LibraryItemId,
    colors: z.array(Hex).max(4).default([]),
    params: z
      .record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9]{0,31}$/), GarmentParam)
      .refine((params) => Object.keys(params).length <= MAX_GARMENT_PARAMS, 'too many params')
      .default({}),
  })
  .strict();
export type RecipeGarment = z.infer<typeof RecipeGarment>;

export const RecipeEffect = z
  .object({
    kind: z.string().regex(/^[a-z][a-z0-9-]{0,31}$/),
    color: Hex.optional(),
    amount: z.number().min(0).max(1).optional(),
  })
  .strict();

export const CharacterRecipe = z
  .object({
    version: z.literal(CHARACTER_RECIPE_VERSION).default(CHARACTER_RECIPE_VERSION),
    rig: z.preprocess(normalizeCharacterRig, z.literal(CHARACTER_RIG).default(CHARACTER_RIG)),
    name: z.string().trim().min(1).max(60).default('My character'),
    /** The body shaped and coloured: one of Genvr's, or a creator's uploaded body item. */
    body: BodyId.default('robot'),
    base: z.enum(CHARACTER_BASES).default('human'),
    sex: z.enum(CHARACTER_SEXES).default('boy'),
    style: z.enum(CHARACTER_STYLES).default('anime'),
    shape: CharacterShape.default(NORMAL_CHARACTER_SHAPE),
    colors: CharacterColors.default(CharacterColors.parse({})),
    /** Hair, eyebrows and beard of a generated body (HAIR-01); coloured with `colors.hair`. */
    hair: HumanHair.default({}),
    clothes: z
      .array(RecipeGarment)
      .max(MAX_RECIPE_CLOTHES)
      .refine(
        (clothes) => new Set(clothes.map((g) => `${g.slot}:${g.layer}`)).size === clothes.length,
        'one garment per slot and layer',
      )
      .default([]),
    animations: z
      .object({
        idle: ClipId.default('Idle'),
        emotes: z.array(ClipId).max(MAX_RECIPE_EMOTES).default([]),
      })
      .strict()
      .default({ idle: 'Idle', emotes: [] }),
    effects: z.array(RecipeEffect).max(MAX_RECIPE_EFFECTS).default([]),
  })
  .strict();
export type CharacterRecipe = z.infer<typeof CharacterRecipe>;

export const DEFAULT_CHARACTER_RECIPE: CharacterRecipe = CharacterRecipe.parse({});

export type RecipeResult = { ok: true; recipe: CharacterRecipe } | { ok: false; error: string };

/** Reads a recipe strictly (a file, a request): too large, unknown keys or values out of range are refused. */
export function parseCharacterRecipe(input: unknown): RecipeResult {
  let value = input;
  if (typeof input === 'string') {
    if (input.length > MAX_RECIPE_JSON) return { ok: false, error: 'Recipe is larger than 8 KB' };
    try {
      value = JSON.parse(input);
    } catch {
      return { ok: false, error: 'Recipe is not JSON' };
    }
  } else if (JSON.stringify(input ?? null).length > MAX_RECIPE_JSON)
    return { ok: false, error: 'Recipe is larger than 8 KB' };
  const parsed = CharacterRecipe.safeParse(value);
  if (parsed.success) return { ok: true, recipe: parsed.data };
  const issue = parsed.error.issues[0];
  return {
    ok: false,
    error: issue ? `${issue.path.join('.') || 'recipe'}: ${issue.message}` : 'Invalid recipe',
  };
}

/** Reads a saved recipe leniently: every broken part falls back to its default. */
export function readCharacterRecipe(saved: unknown): CharacterRecipe {
  const strict = CharacterRecipe.safeParse(saved ?? {});
  if (strict.success) return strict.data;
  const source = (typeof saved === 'object' && saved !== null ? saved : {}) as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(CharacterRecipe.shape) as Array<keyof CharacterRecipe>) {
    const field = CharacterRecipe.shape[key].safeParse(source[key]);
    if (field.success) {
      result[key] = field.data;
      continue;
    }
    // Objects keep their good fields.
    const inner = (CharacterRecipe.shape[key] as unknown as { unwrap?: () => z.ZodTypeAny }).unwrap?.();
    const shape = (inner as unknown as { shape?: Record<string, z.ZodTypeAny> } | undefined)?.shape;
    const value = source[key];
    if (shape && typeof value === 'object' && value !== null) {
      const partial: Record<string, unknown> = {};
      for (const [name, schema] of Object.entries(shape)) {
        const one = schema.safeParse((value as Record<string, unknown>)[name]);
        if (one.success && one.data !== undefined) partial[name] = one.data;
      }
      const merged = CharacterRecipe.shape[key].safeParse(partial);
      result[key] = merged.success ? merged.data : DEFAULT_CHARACTER_RECIPE[key];
    } else result[key] = DEFAULT_CHARACTER_RECIPE[key];
  }
  return result as CharacterRecipe;
}

/** The avatar look a recipe paints (body and colours; sizes come from the recipe's shape, not the look). */
export function recipeLook(recipe: CharacterRecipe): AvatarLook {
  return {
    ...DEFAULT_AVATAR_LOOK,
    body: recipe.body,
    skin: recipe.colors.skin,
    hair: recipe.colors.hair,
    shirt: recipe.colors.top,
    pants: recipe.colors.bottom,
    shoes: recipe.colors.shoes,
    ...(recipe.colors.skinMaterial ? { skinMaterial: recipe.colors.skinMaterial } : {}),
    ...(recipe.style === 'anime' && recipe.shape.anime > 0 ? { animeShape: recipe.shape.anime } : {}),
    ...(Object.keys(recipeBuild(recipe.shape)).length ? { build: recipeBuild(recipe.shape) } : {}),
    ...(Object.keys(recipe.hair).length ? { humanHair: { ...recipe.hair } } : {}),
  };
}
