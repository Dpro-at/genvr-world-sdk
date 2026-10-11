import { defineGeneratedModel, type GeneratedControlMetadata, type GeneratedLimit } from '../../_parts.js';

/**
 * Starfish (SEALIFE-01): a 5- or 6-armed sea star for the Tidewater seabed and shore, drawn by the runtime generator
 * `sealife.starfish` (`runtime/src/sealife/starfish.ts`, own procedural code). In the library for every Realistic
 * place (ITEMS-close-01, owner 2026-10-05); the id keeps `tidewater` until the internal rename.
 */
export const STARFISH_DEFAULTS = { seed: 7, size: 0.25, arms: 5, palette: 'orange', curl: 0.5 } as const;
export const STARFISH_LIMITS = {
  seed: { min: 0, max: 65535 },
  size: { min: 0.15, max: 0.35 },
  arms: { min: 5, max: 6 },
  palette: { values: ['orange', 'red', 'purple', 'blue', 'sandy'] },
  curl: { min: 0, max: 1 },
} satisfies Record<keyof typeof STARFISH_DEFAULTS, GeneratedLimit>;
export const STARFISH_CONTROLS = {
  seed: {
    group: 'general',
    label: 'Shape seed',
    help: 'Whole-number seed for arm lengths, bends, tip lifts and the curl rhythm. Fractional values are rounded down.',
  },
  size: { group: 'appearance', label: 'Size', help: 'Distance from arm tip to arm tip.', unit: 'm' },
  arms: { group: 'appearance', label: 'Arms', help: 'Number of arms: 5 or 6 (other values are rounded).' },
  palette: { group: 'appearance', label: 'Colour', help: 'Colour set: orange, red, purple, blue or sandy.' },
  curl: {
    group: 'motion',
    label: 'Arm curl',
    help: 'How far the arm tips slowly lift and settle (0 keeps it still, 1 lifts the tips by about 12 % of the radius).',
  },
} satisfies Record<keyof typeof STARFISH_DEFAULTS, GeneratedControlMetadata>;

const item = defineGeneratedModel({
  id: 'genvr.core.tidewater.starfish',
  name: 'Starfish',
  subcategory: 'nature',
  collider: 'none',
  triangles: 1540,
  placement: {
    // Seabed and shore: under water it rests on the bed, never on the water surface (ITEMS-close-01).
    stands: ['ground', 'built', 'water'],
    soils: ['sand', 'rock', 'mud', 'dirt'],
    maxTilt: 30,
    maxSlope: 40,
    // Thin item (GROUND-01): arms are only 4-12 mm tall, so a 1 cm sink buried most of them; 2 mm keeps it seated.
    // The base is centred on the pivot. (Before ITEMS-close-01 the tilt law's plane fit read an off-centre footprint
    // as slope when the ground was high above 0, which half-buried starfish on the beach; the fit is centred now.)
    rest: { mode: 'tilt', sink: 0.002, base: { min: [-0.1, -0.1], max: [0.1, 0.1] } },
  },
  look: {
    generated: {
      generator: 'sealife.starfish',
      params: STARFISH_DEFAULTS,
      limits: STARFISH_LIMITS,
      controls: STARFISH_CONTROLS,
      // Default parameters, rest pose and the arm-curl envelope, rounded outwards.
      bounds: { min: [-0.118, 0, -0.114], max: [0.114, 0.026, 0.11] },
      picture: '/models/tidewater/sealife/starfish.png',
      source: { name: 'Genvr (own procedural code)', page: 'https://github.com/9mtm/genvr', license: 'Proprietary' },
    },
  },
});
// Opened to every place (ITEMS-close-01): a normal library item, no longer experimental.
delete item.experimental;
export default item;
