import { defineDrawn } from '../../drawn.js';

/** Tap a hole to fill it with water, or flat ground to dig a pond. */
export default defineDrawn({
  id: 'genvr.core.water.pond',
  name: 'Water',
  tool: 'water',
  type: 'environment',
  category: 'environment',
  subcategory: 'water',
});
