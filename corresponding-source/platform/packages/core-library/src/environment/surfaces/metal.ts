import { defineSurface } from './_surface.js';

/** Shiny, reflects the sky. */
export default defineSurface({
  key: 'metal',
  name: 'Metal',
  look: { roughness: 0.3, metalness: 0.55, opacity: 1, glow: 0 },
});
