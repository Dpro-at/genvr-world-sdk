import { defineGeneratedModel, type GeneratedControlMetadata, type GeneratedLimit } from '../../_parts.js';

/**
 * Sea shell (SEALIFE-01): a cowrie, conch, scallop or small spiral snail lying on sand, drawn by the runtime
 * generator `sealife.shell` (`runtime/src/sealife/shells.ts`, own procedural code; the conch and snail follow a
 * logarithmic spiral). Static. In the library for every Realistic place (ITEMS-close-01, owner 2026-10-05); the id
 * keeps `tidewater` until the internal rename.
 */
export const SEA_SHELL_DEFAULTS = { seed: 5, kind: 'cowrie', size: 0.1, tone: 'natural' } as const;
export const SEA_SHELL_LIMITS = {
  seed: { min: 0, max: 65535 },
  kind: { values: ['cowrie', 'conch', 'scallop', 'snail'] },
  size: { min: 0.04, max: 0.3 },
  tone: { values: ['natural', 'pale', 'dark', 'rose'] },
} satisfies Record<keyof typeof SEA_SHELL_DEFAULTS, GeneratedLimit>;
export const SEA_SHELL_CONTROLS = {
  seed: {
    group: 'general',
    label: 'Shape seed',
    help: 'Whole-number seed for proportions, whorls, ribs and how the shell lies. Fractional values are rounded down.',
  },
  kind: { group: 'appearance', label: 'Kind', help: 'Shell kind: cowrie, conch, scallop or snail.' },
  size: { group: 'appearance', label: 'Size', help: 'Longest extent of the shell.', unit: 'm' },
  tone: { group: 'appearance', label: 'Colour', help: 'Colour set of the kind: natural, pale, dark or rose.' },
} satisfies Record<keyof typeof SEA_SHELL_DEFAULTS, GeneratedControlMetadata>;

const item = defineGeneratedModel({
  id: 'genvr.core.tidewater.sea-shell',
  name: 'Sea shell',
  subcategory: 'nature',
  collider: 'none',
  triangles: 600,
  placement: {
    // Seabed and shore: under water it rests on the bed, never on the water surface (ITEMS-close-01).
    stands: ['ground', 'built', 'water'],
    soils: ['sand', 'rock', 'mud', 'dirt'],
    maxTilt: 30,
    maxSlope: 40,
    rest: { mode: 'tilt', sink: 0.01 },
  },
  look: {
    generated: {
      generator: 'sealife.shell',
      params: SEA_SHELL_DEFAULTS,
      limits: SEA_SHELL_LIMITS,
      controls: SEA_SHELL_CONTROLS,
      // Default parameters (a 0.1 m cowrie), rounded outwards.
      bounds: { min: [-0.05, 0, -0.031], max: [0.05, 0.049, 0.031] },
      picture: '/models/tidewater/sealife/sea-shell.png',
      source: { name: 'Genvr (own procedural code)', page: 'https://github.com/9mtm/genvr', license: 'Proprietary' },
    },
  },
});
// Opened to every place (ITEMS-close-01): a normal library item, no longer experimental.
delete item.experimental;
export default item;
