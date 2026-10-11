import { defineGeneratedModel } from '../../_parts.js';

/**
 * A plain box drawn by the runtime's `genvr.test-box` generator (Tidewater world plan, task 1): it proves the
 * generated-look path end to end (library item, instance parameters within limits, runtime generator, instancing
 * and LOD) before the first real Tidewater module arrives. Experimental, so no catalog lists it.
 */
export default defineGeneratedModel({
  id: 'genvr.core.tidewater.test-box',
  name: 'Generated test box',
  subcategory: 'props-and-decor',
  triangles: 12,
  look: {
    generated: {
      generator: 'genvr.test-box',
      params: { width: 1, height: 1, depth: 1, seed: 1 },
      limits: {
        width: { min: 0.1, max: 20 },
        height: { min: 0.1, max: 20 },
        depth: { min: 0.1, max: 20 },
        seed: { min: 0, max: 65535 },
      },
      controls: {
        width: { group: 'appearance', label: 'Width', help: 'Box width along its local X axis.', unit: 'm' },
        height: { group: 'appearance', label: 'Height', help: 'Box height above its base.', unit: 'm' },
        depth: { group: 'appearance', label: 'Depth', help: 'Box depth along its local Z axis.', unit: 'm' },
        seed: { group: 'general', label: 'Seed', help: 'Reserved generator seed; this test box does not use it to change geometry.' },
      },
      bounds: { min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5] },
      // No picture: experimental items are not shown in the library.
      picture: '',
      source: { name: 'Genvr', page: 'https://github.com/dgreenheck/tidewater', license: 'MIT' },
    },
  },
});
