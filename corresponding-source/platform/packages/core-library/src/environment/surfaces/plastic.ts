import { defineSurface } from './_surface.js';

/** Matte and simple: the default. */
export default defineSurface({
  key: 'plastic',
  name: 'Plastic',
  look: { roughness: 0.8, metalness: 0, opacity: 1, glow: 0 },
});
