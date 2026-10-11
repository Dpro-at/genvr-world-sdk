import { shape, defineModel, PART } from '../_parts.js';

/** Basic part: one meter, light gray so any color shows true; stretch it in Properties. */
export default defineModel({
  id: 'genvr.core.part.cylinder',
  name: 'Cylinder',
  subcategory: 'parts',
  resizable: true,
  parts: [shape('cylinder', [1, 1, 1], [0, 0.5, 0], PART)],
});
