import {
  defineGeneratedModel,
  type GeneratedControlMetadata,
  type GeneratedLimit,
  type ItemBounds,
} from '../../_parts.js';

/** Reusable source resource, registered in the existing Nature catalog. */
export const TIDEWATER_PALM_ID = 'genvr.core.tidewater.palm';
export const TIDEWATER_PALM_DEFAULTS = { seed: 11, height: 10, lean: 0.12, leanAngle: 0.3 } as const;
export const TIDEWATER_PALM_LIMITS = {
  seed: { min: 0, max: 65535 },
  height: { min: 3, max: 20 },
  lean: { min: 0, max: 0.4 },
  leanAngle: { min: 0, max: Math.PI * 2 },
} satisfies Record<keyof typeof TIDEWATER_PALM_DEFAULTS, GeneratedLimit>;
export const TIDEWATER_PALM_CONTROLS = {
  seed: {
    group: 'general',
    label: 'Shape seed',
    help: 'Whole-number seed for palm geometry and appearance. Fractional values are rounded down.',
  },
  height: {
    group: 'appearance',
    label: 'Trunk height',
    help: 'Height of the trunk before lean and wind deformation; the crown extends above it.',
    unit: 'm',
  },
  lean: {
    group: 'appearance',
    label: 'Trunk lean',
    help: 'Dimensionless source lean: calm crown displacement is this fraction of trunk height. Wind adds its own motion.',
  },
  leanAngle: {
    group: 'appearance',
    label: 'Lean direction (radians)',
    help: 'Local lean direction in radians: 0 points along +X and pi/2 along +Z. Placed yaw rotates this direction.',
    unit: 'rad',
  },
} satisfies Record<keyof typeof TIDEWATER_PALM_DEFAULTS, GeneratedControlMetadata>;
export const TIDEWATER_PALM_SOURCE = {
  name: 'Tidewater / DRG Software Solutions LLC',
  page: 'https://github.com/dgreenheck/tidewater/tree/4811ba48d795197de5621985f404e765c0b7c0ef/src/world/vegetation',
  license: 'MIT',
} as const;
/** Outward-rounded source calm-pose measurements at the declared default parameters.
 * These are static AABBs, not a conservative animated wind envelope. */
export const TIDEWATER_PALM_BOUNDS: ItemBounds = {
  min: [-3.711, -0.39, -4.424],
  max: [5.643, 12.671, 4.853],
};
export const TIDEWATER_PALM_BLOCKS: ItemBounds = {
  min: [-0.409, -0.39, -0.441],
  max: [1.37, 10.2, 0.568],
};

/** Static authoring bounds and trunk collider; wind is inherited from world settings. */
export function createTidewaterPalmResource(
  bounds: ItemBounds = TIDEWATER_PALM_BOUNDS,
  blocks: ItemBounds = TIDEWATER_PALM_BLOCKS,
) {
  const item = defineGeneratedModel({
    id: TIDEWATER_PALM_ID,
    name: 'Coconut palm',
    subcategory: 'nature',
    triangles: 1602,
    placement: {
      soils: ['sand', 'grass', 'dirt', 'mud'],
      // Sample around the rooted origin, not the midpoint of the leaning crown bounds.
      rest: { mode: 'upright', sink: 0.35, base: { min: [-0.35, -0.35], max: [0.35, 0.35] } },
    },
    look: {
      generated: {
        generator: 'tidewater.palm',
        params: TIDEWATER_PALM_DEFAULTS,
        limits: TIDEWATER_PALM_LIMITS,
        controls: TIDEWATER_PALM_CONTROLS,
        bounds,
        blocks,
        picture: '/models/tidewater/palm.png',
        source: TIDEWATER_PALM_SOURCE,
      },
    },
  });
  // Desktop isolated shader evidence does not establish a mobile frame budget.
  item.manifest.budget.mobileReady = false;
  delete item.experimental;
  return item;
}

export const TIDEWATER_PALM = createTidewaterPalmResource();
export default TIDEWATER_PALM;
