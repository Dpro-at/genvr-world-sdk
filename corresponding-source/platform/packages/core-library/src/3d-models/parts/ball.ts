import { shape, defineModel, PART } from '../_parts.js';

/** Basic part: one meter, light gray so any color shows true; stretch it in Properties. */
export default defineModel({
  id: 'genvr.core.part.ball',
  name: 'Ball',
  subcategory: 'parts',
  resizable: true,
  parts: [shape('sphere', [1, 1, 1], [0, 0.5, 0], PART)],
});
