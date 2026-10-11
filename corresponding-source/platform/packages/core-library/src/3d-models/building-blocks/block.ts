import { box, defineModel } from '../_parts.js';

export default defineModel({
  id: 'genvr.core.block',
  name: 'Building Block',
  subcategory: 'building-blocks',
  grid: 1,
  parts: [box([1, 1, 1], [0, 0.5, 0], '#6d4aff')],
});
