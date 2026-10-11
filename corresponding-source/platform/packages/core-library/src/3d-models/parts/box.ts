import { box, defineModel, PART } from '../_parts.js';

/** Basic part: one meter, light gray so any color shows true; stretch it in Properties. */
export default defineModel({
  id: 'genvr.core.part.box',
  name: 'Box',
  subcategory: 'parts',
  resizable: true,
  parts: [box([1, 1, 1], [0, 0.5, 0], PART)],
});
