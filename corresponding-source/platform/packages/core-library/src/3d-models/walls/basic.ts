import { defineDrawn } from '../../drawn.js';

/** Tap corners to draw walls; tap the first corner again to close a room with a floor. */
export default defineDrawn({
  id: 'genvr.core.wall.basic',
  name: 'Walls and rooms',
  tool: 'wall',
  type: 'model',
  category: '3d-models',
  subcategory: 'walls',
});
