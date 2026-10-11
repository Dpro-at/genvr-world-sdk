import { defineSurface } from './_surface.js';

/** See-through. */
export default defineSurface({
  key: 'glass',
  name: 'Glass',
  look: { roughness: 0.05, metalness: 0, opacity: 0.35, glow: 0 },
});
