import { coreManifest } from '../../manifest.js';
import type { OceanResource } from './_water.js';

/** Reusable singleton sea resource; geometry fidelity limitations remain explicit. */
const ocean: OceanResource = {
  manifest: coreManifest({
    id: 'genvr.core.water.tidewater-ocean',
    name: 'Ocean',
    type: 'environment',
    category: 'environment',
    subcategory: 'water',
    styles: ['realistic'],
  }),
  resourceId: 'genvr.core.water.tidewater-ocean',
  renderer: 'tidewater',
  documentation:
    'A world-wide ocean filling terrain below its level. Select once per world; shore swell direction is automatic unless overridden. Settings affect the shared sea, not a placed model. Removing the sea leaves its ground unchanged.',
  source: {
    name: 'Tidewater ocean',
    page: 'https://github.com/dgreenheck/tidewater',
    license: 'MIT',
    commit: '4811ba48',
  },
  fallback:
    'Existing style water renderer on unsupported devices or lower graphics settings; current style water clarity and wave settings remain inherited.',
  limitations:
    'Current production sea uses a finite camera-following grid bounded by world extent, rather than the source CDLOD ocean. Selecting this resource does not certify source visual parity or enable unsupported rendering features.',
  controls: [
    {
      key: 'level',
      group: 'appearance',
      label: 'Sea level',
      description: 'Height filled by the shared sea. Removing the sea is a separate action.',
      unit: 'm',
      default: 0,
      min: -50,
      max: 50,
      reset: 'default',
    },
    {
      key: 'direction',
      group: 'motion',
      label: 'Swell direction',
      description:
        'Where shore waves come from, clockwise from north. Reset selects the open side of the coast automatically.',
      unit: 'degrees',
      default: null,
      min: 0,
      max: 360,
      exclusiveMax: true,
      reset: 'automatic',
    },
    {
      key: 'period',
      group: 'motion',
      label: 'Swell period',
      description: 'Time between shore waves. Reset restores the source period.',
      unit: 's',
      default: 9,
      min: 6,
      max: 14,
      reset: 'default',
    },
    {
      key: 'height',
      group: 'motion',
      label: 'Swell amplitude',
      description:
        'Offshore wave amplitude, not crest-to-trough height. Reset restores the source amplitude.',
      unit: 'm',
      default: 0.34,
      min: 0,
      max: 1.5,
      reset: 'default',
    },
  ],
};
export default ocean;
