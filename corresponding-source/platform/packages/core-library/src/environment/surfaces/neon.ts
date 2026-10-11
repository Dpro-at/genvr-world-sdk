import { defineSurface } from './_surface.js';

/** Glows in its own color. */
export default defineSurface({
  key: 'neon',
  name: 'Neon',
  look: { roughness: 0.5, metalness: 0, opacity: 1, glow: 1 },
});
