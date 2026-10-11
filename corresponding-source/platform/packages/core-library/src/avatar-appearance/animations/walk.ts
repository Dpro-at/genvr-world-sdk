import { defineAnimation, gait } from '../_animation.js';

export default defineAnimation({
  slug: 'walk',
  name: 'Walk',
  clip: 'Walk',
  subcategory: 'animations',
  kind: 'loop',
  duration: 1,
  keys: gait(1, { leg: 28, knee: 45, arm: 24, elbow: 14, lean: 3, bob: 0.03 }),
});
