import { CLEAR, defineWeather } from './_weather.js';

/** Thick fog: the world fades out after a few dozen meters. */
export default defineWeather({
  preset: 'fog',
  name: 'Fog',
  look: { ...CLEAR, fogNear: 5, fogScale: 0.18, light: 0.85 },
});
