import { CLEAR, defineWeather } from './_weather.js';

/** Rain streaks, a little fog, softer light. */
export default defineWeather({
  preset: 'rain',
  name: 'Rain',
  look: {
    ...CLEAR,
    particles: 'rain',
    count: 900,
    fall: 16,
    wind: 1.5,
    particleColor: 0xaecbe6,
    fogNear: 30,
    fogScale: 0.6,
    light: 0.75,
  },
});
