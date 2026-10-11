import { z } from 'zod';
import { Id, Params, Style } from './common.js';
import { AvatarLook } from './avatar-look.js';
import { VoiceLine } from './mouth.js';
import { RideDefault } from './ride.js';

/** Item types in a .genvr package, see docs/GENVR-FORMAT.md. */
export const ItemType = z.enum([
  'model',
  'environment',
  'material',
  'style-pack',
  'avatar',
  'clothing',
  'animation',
  'vfx',
  'audio',
  'script',
  'kit',
  'ui-kit',
  'plugin',
  'live-camera',
]);
export type ItemType = z.infer<typeof ItemType>;

/** Store taxonomy: top-level categories are stable, subcategories may grow. */
export const Category = z.enum([
  '3d-models',
  'environment',
  'styles',
  'avatar-appearance',
  'visual-effects',
  '2d',
  'gameplay',
  'audio',
  'plugins',
]);
export type Category = z.infer<typeof Category>;

/** `external`: taken whole from a free outside source (Poly Haven and others; 2026-10-06), credited in `origin`. */
export const ItemSource = z.enum(['core', 'user', 'ai', 'external']);
export type ItemSource = z.infer<typeof ItemSource>;

export const Price = z.discriminatedUnion('type', [
  z.object({ type: z.literal('free') }),
  z.object({ type: z.literal('paid'), coins: z.number().int().positive() }),
  z.object({ type: z.literal('subscription') }),
]);
export type Price = z.infer<typeof Price>;

export const BuilderModelKind = z.enum([
  'props-and-decor',
  'nature',
  'structures',
  'vehicles',
  'characters',
  'building-blocks',
]);
export type BuilderModelKind = z.infer<typeof BuilderModelKind>;
export const SaveBuilderItem = z
  .object({
    requestId: z.string().uuid(),
    name: z.string().trim().min(2).max(60),
    instanceIds: z
      .array(Id)
      .min(1)
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length, 'Select each part once.'),
    destination: z.enum(['game', 'marketplace']),
    kind: BuilderModelKind,
    style: Style,
    priceGems: z.number().int().min(0).max(1000000),
    selectionHash: z.string().regex(/^[a-f0-9]{64}$/),
    model: z
      .string()
      .min(1)
      .max(28 * 1024 * 1024),
    packaging: z.enum(['assembly', 'pack', 'separate']).default('assembly'),
    designs: z
      .array(
        z
          .object({
            name: z.string().trim().min(2).max(60),
            instanceIds: z.array(Id).min(1).max(100),
            model: z
              .string()
              .min(1)
              .max(28 * 1024 * 1024),
            priceGems: z.number().int().min(0).max(1000000),
          })
          .strict(),
      )
      .min(1)
      .max(8)
      .optional(),
  })
  .strict();
export type SaveBuilderItem = z.infer<typeof SaveBuilderItem>;
export const SavedBuilderItem = z.object({
  id: Id,
  destination: z.enum(['game', 'marketplace']),
  status: z.enum(['draft', 'in_review']),
  priceGems: z.number().int(),
  checkoutEnabled: z.literal(false),
  items: z.array(z.object({ id: Id, name: z.string(), priceGems: z.number().int() })).optional(),
  packaging: z.enum(['assembly', 'pack', 'separate']).optional(),
});

/**
 * Where an item taken from a free outside source comes from (2026-10-06): the source, its id there, its page, the
 * licence and the people who made it. Kept with the item so every game that uses it can name them.
 */
export const ItemOrigin = z.object({
  provider: z.enum(['polyhaven', 'kenney', 'sketchfab']),
  assetId: z.string().min(1).max(120),
  page: z.string().url().max(300),
  license: z.string().min(1).max(60),
  authors: z.array(z.string().min(1).max(120)).max(20),
});
export type ItemOrigin = z.infer<typeof ItemOrigin>;

/** Semantic version such as "1.0.0". */
export const SemVer = z.string().regex(/^\d+\.\d+\.\d+$/);

/**
 * How an item rests on what is under it (P2-43, decision 116): written once per item, never per
 * map. `sink` is the most it may be buried (meters); `base` is the real footprint in local x, z
 * (a tree touches the ground with its trunk, not its canopy).
 */
export const RestRule = z.object({
  mode: z.enum(['upright', 'tilt', 'grade', 'foundation', 'float']),
  sink: z.number().min(0).max(5).optional(),
  base: z
    .object({ min: z.tuple([z.number(), z.number()]), max: z.tuple([z.number(), z.number()]) })
    .optional(),
});
export type RestRule = z.infer<typeof RestRule>;

/**
 * Where and how an item may stand in a world (P2-11, owner note): the world checks test every
 * placed item against these rules, the assistant follows them, and the studio shows which rule
 * an item breaks. Absent fields mean no rule. "Front" is the item's +z side.
 */
export const PlacementRules = z.object({
  /** What it may stand on: the ground, built things (floors, parts, other items), or water. */
  stands: z
    .array(z.enum(['ground', 'built', 'water']))
    .min(1)
    .optional(),
  /** Soils it needs when standing on the ground (plants). */
  soils: z
    .array(z.enum(['grass', 'dirt', 'sand', 'rock', 'snow', 'mud']))
    .min(1)
    .optional(),
  /** Largest lean from upright, in degrees. */
  maxTilt: z.number().min(0).max(180).optional(),
  /** Steepest ground it can stand on, in degrees. */
  maxSlope: z.number().min(0).max(90).optional(),
  /** Free space it needs in front, in meters (a bench to sit on, a house door). */
  clearFront: z.number().min(0).max(10).optional(),
  /** How it rests on the surface under it (P2-43). Absent: the default for its group. */
  rest: RestRule.optional(),
});
export type PlacementRules = z.infer<typeof PlacementRules>;

/** The one script file of a `script` item (P2-10). */
const SCRIPT_FILE = /^scripts\/[a-z0-9][a-z0-9_-]*\.js$/;

const ManifestFields = z.object({
  schemaVersion: z.literal(1),
  id: Id,
  name: z.string().min(1).max(80),
  version: SemVer,
  type: ItemType,
  category: Category,
  subcategory: z.string().min(1).max(64),
  styles: z.array(Style).min(1),
  author: z.object({ id: Id, name: z.string().min(1) }),
  source: ItemSource,
  /** Pack members are separate usable designs, retained under their reviewed parent. */
  bundle: z
    .array(z.object({ itemId: Id, name: z.string(), contentHash: z.string().regex(/^[a-f0-9]{64}$/) }))
    .min(1)
    .max(8)
    .optional(),
  bundleParent: Id.optional(),
  /** Informational only; the database receipt and grant authorize TEST usage. */
  testPurchase: z.object({ receiptId: z.string().uuid(), sourceId: Id }).optional(),
  /** Builder provenance is retained through review; server records the actual saved world selection. */
  builder: z
    .object({
      experienceId: Id,
      requestId: z.string().uuid(),
      requestHash: z.string().regex(/^[a-f0-9]{64}$/),
      destination: z.enum(['game', 'marketplace']),
      fileDigests: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)).optional(),
      snapshot: z.array(z.record(z.string(), z.unknown())).min(1).max(100),
      credits: z
        .array(
          z.object({
            itemId: Id,
            name: z.string(),
            license: z.string(),
            author: z.object({ id: Id, name: z.string() }),
            origin: ItemOrigin.optional(),
          }),
        )
        .max(100),
    })
    .optional(),
  license: z.string().min(1),
  price: Price,
  entry: z
    .object({
      model: z.string().optional(),
      /**
       * Simpler versions of the model for far away (decision 94), nearest first: the creator's
       * own files, or made by Genvr on upload for still models.
       */
      lods: z.array(z.string()).max(2).optional(),
      script: z.string().optional(),
    })
    .default({}),
  physics: z
    .object({
      collider: z.enum(['none', 'box', 'sphere', 'capsule', 'mesh']).default('box'),
      buoyancy: z.number().min(0).optional(),
      friction: z.number().min(0).max(1).optional(),
      /** Made to hang in the air (clouds, balloons, hanging lamps): never settled onto the ground. */
      floats: z.boolean().optional(),
      /** Players climb it (ladders, climbing walls): up and down while touching it (P2-23). */
      climbable: z.boolean().optional(),
    })
    .optional(),
  /**
   * A look item (`avatar` / `avatar-appearance` / `looks`; spec 2026-10-03): a base body, sizes, colors and Core
   * wearables a player can wear as their own look. Checked with `checkLookPreset` in the Core Library.
   */
  look: AvatarLook.optional(),
  /** A voice line (an `audio` item a character can say; lip sync P2-44): its sound and mouth timings. */
  voice: VoiceLine.optional(),
  /**
   * An uploaded body (`avatar` / `avatar-appearance` / `bodies`; uploaded bodies, 2026-10-03): the rigged model in
   * the package, its picture, its height, and the standard bones' rest positions read from the file (meters, facing
   * +z, left +x, T-pose), root first.
   */
  body: z
    .object({
      model: z.string().min(1).max(200),
      picture: z.string().min(1).max(200).optional(),
      height: z.number().min(0.3).max(4),
      /**
       * `place`: only for the creator's own places, never in the store (any character they may use in a game);
       * `store`: reviewed, then others can own and wear it (owner, 2026-10-03, Mixamo terms).
       */
      use: z.enum(['place', 'store']).default('store'),
      joints: z
        .array(
          z.object({
            name: z.string().min(1).max(64),
            parent: z.string().min(1).max(64).nullable(),
            at: z.tuple([z.number(), z.number(), z.number()]),
          }),
        )
        .min(1)
        .max(128),
    })
    .optional(),
  /** A tool a player holds and uses in a game (P9-12); only melee for now. */
  tool: z
    .object({
      kind: z.literal('melee'),
      damage: z.number().int().min(1).max(1000),
      reach: z.number().min(0.5).max(10),
      arcDeg: z.number().min(10).max(360),
      cooldownSec: z.number().min(0.1).max(10),
    })
    .optional(),
  /** A map marker for the rules (P9-12): seen while building, hidden while playing (`zone`: a zone item). */
  marker: z.object({ kind: z.enum(['spawn', 'zone']) }).optional(),
  /** Rideable by default (movement modes): any subset of the ride settings; instance params win. */
  ride: RideDefault.optional(),
  material: z
    .object({
      kind: z.string().min(1),
      tags: z.array(z.string()).default([]),
    })
    .optional(),
  params: Params.default({}),
  audio: z.record(z.string(), z.string()).default({}),
  placement: PlacementRules.optional(),
  /** Declared by the author; mobileReady is recomputed by the platform on review. */
  budget: z.object({
    triangles: z.number().int().min(0),
    textureMB: z.number().min(0),
    mobileReady: z.boolean(),
  }),
  dependencies: z.array(Id).default([]),
  facets: z
    .object({
      hasScript: z.boolean().default(false),
      rigged: z.boolean().default(false),
    })
    .default({ hasScript: false, rigged: false }),
  trainingConsent: z.boolean(),
  /** Set for items taken from a free outside source (`source: 'external'`). */
  origin: ItemOrigin.optional(),
});

/** An item's manifest. A script item (P2-10) is one `scripts/<name>.js` file and nothing to draw. */
export const GenvrManifest = ManifestFields.refine(
  (manifest) =>
    manifest.type !== 'script' ||
    (typeof manifest.entry.script === 'string' &&
      SCRIPT_FILE.test(manifest.entry.script) &&
      manifest.entry.model === undefined &&
      manifest.entry.lods === undefined),
  { message: 'a script item names one scripts/<name>.js file and no model', path: ['entry'] },
);
export type GenvrManifest = z.infer<typeof GenvrManifest>;
export type GenvrManifestInput = z.input<typeof GenvrManifest>;

/**
 * A package file path inside a `.genvr` package: lowercase segments (it becomes part of a
 * storage key), no "..". Models are GLB for now (one file, no external buffers); a script item's one file is
 * `scripts/<name>.js` (P2-10).
 */
export const PackagePath = z
  .string()
  .max(160)
  .regex(
    /^(?:[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_-]*)*\.(glb|ogg|mp3|wav)|scripts\/[a-z0-9][a-z0-9_-]*\.js)$/,
    'lowercase path to a .glb, .ogg, .mp3 or .wav file, or scripts/<name>.js',
  );
export type PackagePath = z.infer<typeof PackagePath>;

/** An item's package as the player loads it: the manifest and a signed link per file. */
export const ItemPackage = z.object({
  id: Id,
  manifest: GenvrManifest,
  files: z.array(
    z.object({
      path: PackagePath,
      url: z.string(),
      size: z.number().int().min(0),
      contentType: z.string(),
    }),
  ),
});
export type ItemPackage = z.infer<typeof ItemPackage>;
