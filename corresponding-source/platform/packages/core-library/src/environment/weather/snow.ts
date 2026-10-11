import { CLEAR, defineWeather } from './_weather.js';

/** Slow snowflakes drifting with the wind. */
export default defineWeather({
  preset: 'snow',
  name: 'Snow',
  look: {
    ...CLEAR,
    particles: 'snow',
    count: 700,
    fall: 1.4,
    wind: 0.8,
    particleColor: 0xffffff,
    fogNear: 25,
    fogScale: 0.55,
    light: 0.9,
  },
});
