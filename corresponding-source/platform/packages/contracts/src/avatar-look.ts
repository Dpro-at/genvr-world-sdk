import { z } from 'zod';

const Hex = z.string().regex(/^#[0-9a-f]{6}$/i);

/** Body parts a player colors on the Look tab. */
export const AVATAR_COLOR_PARTS = ['skin', 'hair', 'shirt', 'pants', 'shoes'] as const;
export type AvatarColorPart = (typeof AVATAR_COLOR_PARTS)[number];

/** Body size limits (P2-22), like Roblox body scales: 1 is the normal size. */
export const AVATAR_SCALE_LIMITS = {
  height: { min: 0.9, max: 1.1 },
  width: { min: 0.8, max: 1.1 },
  head: { min: 0.9, max: 1.15 },
} as const;

const scalePart = (limits: { min: number; max: number }) =>
  z.number().min(limits.min).max(limits.max).default(1);

export const AvatarScale = z.object({
  height: scalePart(AVATAR_SCALE_LIMITS.height),
  width: scalePart(AVATAR_SCALE_LIMITS.width),
  head: scalePart(AVATAR_SCALE_LIMITS.head),
});
export type AvatarScale = z.infer<typeof AvatarScale>;

export const NORMAL_AVATAR_SCALE: AvatarScale = { height: 1, width: 1, head: 1 };

/** Clothing and accessories worn at once (one per slot, P2-20). */
export const MAX_WORN_ITEMS = 8;

/**
 * Avatar body types (decision 73, P2-22): each has its own skeleton. `classic` is the Roblox-like
 * main avatar (15 jointed parts, like R15); `simple` has six stiff parts (like R6); `starter` is
 * the first test body on the 52-bone rig; `flat` is the 2D body of side-view places (decision
 * 93), worn only where a place asks for it; `anime-boy` is the first mesh body (a 3D model made
 * from the owner's concept sheet, decision 111, P2-35); `warrior` is the owner's main character
 * (P2-35), a mesh body with swinging hair and coat; `human` is our own generated body (CHAR-02): made by our code
 * from settings (style, gender), anime boy first. The realistic body joins later.
 */
export const AvatarBodyType = z.enum(['classic', 'simple', 'starter', 'flat', 'anime-boy', 'warrior', 'human', 'robot']);
export type AvatarBodyType = z.infer<typeof AvatarBodyType>;

/** A creator's uploaded body item, by its store id (uploaded bodies, 2026-10-03). */
export const ItemBodyId = z
  .string()
  .regex(/^user\.[a-z0-9][a-z0-9._-]{2,126}$/) as unknown as z.ZodType<`user.${string}`>;

/**
 * The body a look wears or a place uses: one of Genvr's bodies, or a creator's uploaded body item (uploaded bodies,
 * 2026-10-03). Who may wear an item body is checked by the API (the join ticket) and the room; anywhere else it falls
 * back to Classic until its model is known.
 */
export const BodyId = z.union([AvatarBodyType, ItemBodyId]);
export type BodyId = z.infer<typeof BodyId>;

/** Whether a body id is one of Genvr's own bodies (kept looks are kept for those only). */
export const isCoreBodyId = (id: BodyId): id is AvatarBodyType => AvatarBodyType.safeParse(id).success;

/**
 * Muscle zones of a generated human body (the owner's 17 and the hands, docs/reference/character-anime/muscles/), each an offset
 * on the overall muscle (Stage B, 2026-10-05).
 */
export const MUSCLE_GROUPS = [
  'neck',
  'shoulders',
  'chest',
  'traps',
  'lats',
  'biceps',
  'triceps',
  'forearms',
  'abs',
  'obliques',
  'waist',
  'lowerBack',
  'hips',
  'glutes',
  'quads',
  'hamstrings',
  'calves',
  'hands',
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];
/** One fixed colour per muscle zone (owner's table, 2026-10-05): the editor's dots and its Muscles view. */
export const MUSCLE_ZONE_COLORS: Readonly<Record<MuscleGroup, string>> = {
  neck: '#26a7ff',
  shoulders: '#ff8a3d',
  chest: '#ff4048',
  traps: '#ec4faf',
  lats: '#287fea',
  biceps: '#42c85a',
  triceps: '#ff9a3c',
  forearms: '#994fe8',
  abs: '#ff4048',
  obliques: '#28a4e8',
  waist: '#58ce4c',
  lowerBack: '#ffd43b',
  hips: '#a64ee2',
  glutes: '#9855e9',
  quads: '#ff4149',
  hamstrings: '#ff8c38',
  calves: '#278df0',
  hands: '#f5e663',
};
/**
 * Muscles that are parts of one editor zone (owner's anatomy sheets, docs/reference/character-anime/muscles/):
 * each part bulges on its own, the zone's slider moves them together. Other zones are one part of the same name.
 */
export const MUSCLE_PART_ZONE: Readonly<Record<string, MuscleGroup>> = {
  deltoid: 'shoulders',
  brachialis: 'biceps',
  brachioradialis: 'forearms',
  flexors: 'forearms',
  extensors: 'forearms',
  thenar: 'hands',
  hypothenar: 'hands',
  palm: 'hands',
  handBack: 'hands',
};
/**
 * Every anatomical muscle part, in a fixed order (the bake stores 1 + this index per vertex; the paint tool and the
 * review pictures colour by it). A part that is not in MUSCLE_PART_ZONE is its own editor zone.
 */
export const MUSCLE_PARTS = [
  'neck', 'deltoid', 'chest', 'traps', 'lats', 'biceps', 'brachialis', 'triceps', 'brachioradialis', 'flexors',
  'extensors', 'abs', 'obliques', 'waist', 'lowerBack', 'hips', 'glutes', 'quads', 'hamstrings', 'calves',
  'thenar', 'hypothenar', 'palm', 'handBack',
] as const;
export type MusclePart = (typeof MUSCLE_PARTS)[number];
/** Each part's colour in the paint tool and the review pictures (owner's sheets). */
export const MUSCLE_PART_COLOURS: Readonly<Record<MusclePart, string>> = {
  deltoid: '#ff8a3d',
  biceps: '#ff4048',
  brachialis: '#42c85a',
  triceps: '#287fea',
  brachioradialis: '#994fe8',
  flexors: '#1fb5b0',
  extensors: '#f0a020',
  thenar: '#f5e663',
  hypothenar: '#e0c040',
  palm: '#fff3a0',
  handBack: '#c9b030',
  // Torso parts in the drawings (distinct where the editor zones share a colour, e.g. chest and abs).
  neck: '#26a7ff',
  chest: '#ff4048',
  traps: '#ec4faf',
  lats: '#287fea',
  abs: '#ff8fb0',
  obliques: '#1fb5b0',
  waist: '#58ce4c',
  lowerBack: '#ffd43b',
  hips: '#a64ee2',
  glutes: '#9855e9',
  quads: '#ff4149',
  hamstrings: '#ff8c38',
  calves: '#278df0',
};

/** Where a generated human body stores fat, each an offset on the overall fat. */
export const FAT_REGIONS = [
  'belly',
  'waist',
  'hips',
  'buttocks',
  'thighs',
  'upperArms',
  'forearms',
  'calves',
  'face',
  'chin',
] as const;
export type FatRegion = (typeof FAT_REGIONS)[number];
/**
 * Face controls of a generated human body (FACE-01, owner notes 82/86), each -1..1 (0 the face as made). The same
 * names and order as tooling/human-bake/build-targets.mjs FACE_TARGETS; the editor groups them by part.
 */
export const FACE_FEATURES = [
  'eyeSize',
  'eyeOpen',
  'eyeSpacing',
  'eyeHeight',
  'eyeTilt',
  'eyeFold',
  'eyeDepth',
  'browHeight',
  'browAngle',
  'noseSize',
  'noseWidth',
  'noseLength',
  'noseBridge',
  'noseTip',
  'nostrils',
  'noseDepth',
  'mouthWidth',
  'mouthHeight',
  'upperLip',
  'lowerLip',
  'mouthCorners',
  'cheekVolume',
  'cheekBones',
  'cheekInner',
  'chinWidth',
  'chinHeight',
  'chinForward',
  'jawWidth',
  'headWidth',
  'headLength',
] as const;
export type FaceFeature = (typeof FACE_FEATURES)[number];
/** The parts of the face, for the editor and the MCP schema: each feature belongs to one. */
export const FACE_PARTS: Record<'eyes' | 'brows' | 'nose' | 'mouth' | 'cheeks' | 'jaw' | 'head', readonly FaceFeature[]> = {
  eyes: ['eyeSize', 'eyeOpen', 'eyeSpacing', 'eyeHeight', 'eyeTilt', 'eyeFold', 'eyeDepth'],
  brows: ['browHeight', 'browAngle'],
  nose: ['noseSize', 'noseWidth', 'noseLength', 'noseBridge', 'noseTip', 'nostrils', 'noseDepth'],
  mouth: ['mouthWidth', 'mouthHeight', 'upperLip', 'lowerLip', 'mouthCorners'],
  cheeks: ['cheekVolume', 'cheekBones', 'cheekInner'],
  jaw: ['chinWidth', 'chinHeight', 'chinForward', 'jawWidth'],
  head: ['headWidth', 'headLength'],
};
/** Most overall fat a body may have (kids audience: healthy ranges only). */
export const MAX_BODY_FAT = 0.85;
/**
 * A generated body's build as the runtime reads it: `muscle` (-1..1), `fat` (0..MAX_BODY_FAT), `fatPattern`
 * (-1 upper body .. 1 lower body), `definition` (0..1), `muscle.<group>` and `fat.<region>` offsets and
 * `face.<feature>` controls (-1..1).
 * Absent keys are 0.
 */
export const BUILD_KEYS = [
  'muscle',
  'fat',
  'fatPattern',
  'definition',
  ...MUSCLE_GROUPS.map((group) => `muscle.${group}` as const),
  ...FAT_REGIONS.map((region) => `fat.${region}` as const),
  ...FACE_FEATURES.map((feature) => `face.${feature}` as const),
] as const;
export type BuildKey = (typeof BUILD_KEYS)[number];
export const HumanBuild = z.partialRecord(z.enum(BUILD_KEYS), z.number().min(-1).max(1));
export type HumanBuild = z.infer<typeof HumanBuild>;

/**
 * Hair, eyebrows and beard of a generated body (HAIR-01): CC0 MakeHuman assets fitted onto our body by the bake
 * (tooling/human-bake/proxies.mjs, public/human/proxies/<id>.bin). Absent: none. Coloured with the look's hair colour.
 */
export const HUMAN_HAIR_STYLES = ['hair.short01', 'hair.short02', 'hair.short03', 'hair.short04'] as const;
export const HUMAN_BROW_STYLES = ['brows.eyebrow001', 'brows.eyebrow006', 'brows.eyebrow010'] as const;
export const HUMAN_BEARD_STYLES = ['beard.viking', 'beard.moustache'] as const;
export const HumanHair = z
  .object({
    head: z.enum(HUMAN_HAIR_STYLES).optional(),
    brows: z.enum(HUMAN_BROW_STYLES).optional(),
    beard: z.enum(HUMAN_BEARD_STYLES).optional(),
  })
  .strict();
export type HumanHair = z.infer<typeof HumanHair>;

/**
 * A player's avatar look (task P2-20): body colors and the Core Library wearables they put on
 * (item ids). Saved on the account and in the browser until signed in.
 */
export const AvatarLook = z.object({
  /** New looks start as the Standard robot (owner, 2026-10-20, board A12; was Classic). */
  body: BodyId.default('robot'),
  /** Height, width, and head size of the body. */
  scale: AvatarScale.default({ height: 1, width: 1, head: 1 }),
  skin: Hex.default('#f2c49b'),
  hair: Hex.default('#3b2a20'),
  shirt: Hex.default('#6d4aff'),
  pants: Hex.default('#2b2d42'),
  shoes: Hex.default('#f2f2ee'),
  /** A fantasy skin material of the Core Library (lava cracks, galaxy, ...) over the skin; absent: plain skin. */
  skinMaterial: z.string().regex(/^[a-z0-9-]{1,40}$/).optional(),
  /** Anime Shape of a generated body's face, 0..1 (absent: 0). */
  animeShape: z.number().min(0).max(1).optional(),
  /** Muscle and fat of a generated body (absent: the body as made). */
  build: HumanBuild.optional(),
  /** Hair, eyebrows and beard of a generated body (absent: none). */
  humanHair: HumanHair.optional(),
  wear: z.array(z.string().min(1).max(120)).max(MAX_WORN_ITEMS).default([]),
});
export type AvatarLook = z.infer<typeof AvatarLook>;

export const DEFAULT_AVATAR_LOOK: AvatarLook = AvatarLook.parse({});

/** Reads a saved look leniently: broken fields fall back to their defaults. */
export function readAvatarLook(saved: unknown): AvatarLook {
  const parsed = AvatarLook.safeParse(saved ?? {});
  if (parsed.success) return parsed.data;
  const source = (typeof saved === 'object' && saved !== null ? saved : {}) as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(AvatarLook.shape) as Array<keyof AvatarLook>) {
    const field = AvatarLook.shape[key].safeParse(source[key]);
    result[key] = field.success ? field.data : DEFAULT_AVATAR_LOOK[key];
  }
  return result as AvatarLook;
}

/** A look kept for one body type while another body is worn (P2-22). */
export const AvatarBodyOutfit = AvatarLook.omit({ body: true });
export type AvatarBodyOutfit = z.infer<typeof AvatarBodyOutfit>;

/**
 * The account's avatar (P2-22): the look worn now, plus the look kept for each other body type
 * (every body keeps its own colors, clothing, and size). Rooms only ever get plain looks.
 */
export const AvatarProfile = AvatarLook.extend({
  bodies: z.partialRecord(AvatarBodyType, AvatarBodyOutfit).default({}),
});
export type AvatarProfile = z.infer<typeof AvatarProfile>;

/** Reads a saved avatar leniently: the worn look as `readAvatarLook`, broken kept looks dropped. */
export function readAvatarProfile(saved: unknown): AvatarProfile {
  const look = readAvatarLook(saved);
  const source = (typeof saved === 'object' && saved !== null ? saved : {}) as { bodies?: unknown };
  const kept = (typeof source.bodies === 'object' && source.bodies !== null ? source.bodies : {}) as Record<
    string,
    unknown
  >;
  const bodies: AvatarProfile['bodies'] = {};
  for (const body of AvatarBodyType.options) {
    if (body === look.body || !kept[body]) continue;
    // The outfit schema has no body field, so parsing drops it.
    bodies[body] = AvatarBodyOutfit.parse(readAvatarLook({ ...(kept[body] as object), body }));
  }
  return { ...look, bodies };
}

/** The look of `body` in a saved avatar: the worn look, the look kept for it, or the worn look moved over. */
export function lookForBody(saved: unknown, body: BodyId): AvatarLook {
  const profile = readAvatarProfile(saved);
  const { bodies, ...worn } = profile;
  const kept = profile.body === body || !isCoreBodyId(body) ? undefined : bodies[body];
  return { ...(kept ?? worn), body };
}

/**
 * Switches to another body: the worn look is kept for the old body, the new body's look comes back. Looks are kept
 * for Genvr's bodies only (an uploaded body is one model with no colors or sizes of its own).
 */
export function wearBody(saved: unknown, body: BodyId): AvatarProfile {
  const profile = readAvatarProfile(saved);
  if (profile.body === body) return profile;
  const { bodies, body: old, ...outfit } = profile;
  const next = lookForBody(profile, body);
  // The new body's kept look is worn now, so it is no longer kept.
  const others = isCoreBodyId(old) ? { ...bodies, [old]: outfit } : { ...bodies };
  if (isCoreBodyId(body)) delete others[body];
  return { ...next, bodies: others };
}

/**
 * How avatars look in a place (task P2-21), set by the owner in the place settings:
 * - `player`: everyone wears their own look;
 * - `player-limited`: their own look without large accessories (capes, wings, backpacks), at
 *   the normal size;
 * - `place`: everyone wears the place's outfit at the normal size and keeps their own skin,
 *   hair, and body type.
 */
export const PlaceAvatarMode = z.enum(['player', 'player-limited', 'place']);
export type PlaceAvatarMode = z.infer<typeof PlaceAvatarMode>;

export const PlaceAvatar = z.object({
  mode: PlaceAvatarMode.default('player'),
  /** The body everyone uses here (P2-22; a body item the owner may use, 2026-10-03), or `any`: each player's own. */
  body: z.union([z.literal('any'), BodyId]).default('any'),
  /** The outfit of `place` mode (its skin and hair colors are not used). */
  outfit: AvatarLook.default(DEFAULT_AVATAR_LOOK),
});
export type PlaceAvatar = z.infer<typeof PlaceAvatar>;

export const DEFAULT_PLACE_AVATAR: PlaceAvatar = PlaceAvatar.parse({});

/** Reads the saved setting leniently: anything broken means players wear their own look. */
export function readPlaceAvatar(saved: unknown): PlaceAvatar {
  const parsed = PlaceAvatar.safeParse(saved ?? {});
  return parsed.success ? parsed.data : DEFAULT_PLACE_AVATAR;
}
