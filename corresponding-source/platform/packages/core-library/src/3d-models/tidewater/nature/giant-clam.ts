import { defineGeneratedModel, type GeneratedControlMetadata, type GeneratedLimit } from '../../_parts.js';

/**
 * Giant clam (SEALIFE-01): two fluted valves gaping upwards with a coloured, spotted mantle, slowly closing a little
 * and opening again. Drawn by the runtime generator `sealife.giant-clam` (`runtime/src/sealife/clam.ts`, own
 * procedural code). In the library for every Realistic place (ITEMS-close-01, owner 2026-10-05); the id keeps
 * `tidewater` until the internal rename.
 */
export const GIANT_CLAM_DEFAULTS = { seed: 3, size: 0.55, mantle: 'blue', open: 0.7, speed: 1 } as const;
export const GIANT_CLAM_LIMITS = {
  seed: { min: 0, max: 65535 },
  size: { min: 0.3, max: 0.9 },
  mantle: { values: ['blue', 'teal', 'purple', 'green'] },
  open: { min: 0, max: 1 },
  speed: { min: 0, max: 2 },
} satisfies Record<keyof typeof GIANT_CLAM_DEFAULTS, GeneratedLimit>;
export const GIANT_CLAM_CONTROLS = {
  seed: {
    group: 'general',
    label: 'Shape seed',
    help: 'Whole-number seed for the shell proportions, the number of folds (4-6) and the moment of each close. Fractional values are rounded down.',
  },
  size: { group: 'appearance', label: 'Size', help: 'Length of the shell along its hinge.', unit: 'm' },
  mantle: {
    group: 'appearance',
    label: 'Mantle colour',
    help: 'Colour of the mantle between the valves: blue, teal, purple or green.',
  },
  open: {
    group: 'motion',
    label: 'Open amount',
    help: 'How wide the valves gape at rest (0 narrow, 1 wide). A close takes back at most 60 % of the gape, so the valves never meet.',
  },
  speed: {
    group: 'motion',
    label: 'Close speed',
    help: 'How often the clam slowly closes a little and opens again (1 is about every 16 s, 0 keeps it still).',
  },
} satisfies Record<keyof typeof GIANT_CLAM_DEFAULTS, GeneratedControlMetadata>;

const item = defineGeneratedModel({
  id: 'genvr.core.tidewater.giant-clam',
  name: 'Giant clam',
  subcategory: 'nature',
  collider: 'box',
  triangles: 2384,
  placement: {
    // Seabed and shore: under water it rests on the bed, never on the water surface (ITEMS-close-01).
    stands: ['ground', 'built', 'water'],
    soils: ['sand', 'rock', 'mud', 'dirt'],
    maxTilt: 20,
    maxSlope: 30,
    rest: { mode: 'tilt', sink: 0.05 },
  },
  look: {
    generated: {
      generator: 'sealife.giant-clam',
      params: GIANT_CLAM_DEFAULTS,
      limits: GIANT_CLAM_LIMITS,
      controls: GIANT_CLAM_CONTROLS,
      // Default parameters including the open-close envelope, rounded outwards (a close dips at most 2 mm below
      // y = 0, inside the 5 cm sink).
      bounds: { min: [-0.273, 0, -0.182], max: [0.273, 0.27, 0.188] },
      picture: '/models/tidewater/sealife/giant-clam.png',
      source: { name: 'Genvr (own procedural code)', page: 'https://github.com/9mtm/genvr', license: 'Proprietary' },
    },
  },
});
// Opened to every place (ITEMS-close-01): a normal library item, no longer experimental.
delete item.experimental;
export default item;
