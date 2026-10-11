import { defineAnimation, gait } from '../_animation.js';

export default defineAnimation({
  slug: 'run',
  name: 'Run',
  clip: 'Run',
  subcategory: 'animations',
  kind: 'loop',
  duration: 0.64,
  keys: gait(0.64, { leg: 45, knee: 90, arm: 28, elbow: 50, lean: 12, bob: 0.06 }),
});
