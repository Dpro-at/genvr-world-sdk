import { CLEAR, defineWeather } from './_weather.js';

/** Sand blowing sideways and a yellow haze. */
export default defineWeather({
  preset: 'sandstorm',
  name: 'Sandstorm',
  look: {
    ...CLEAR,
    particles: 'dust',
    count: 900,
    fall: 0.3,
    wind: 9,
    particleColor: 0xd9b77a,
    fogNear: 8,
    fogScale: 0.25,
    fogColor: 0xc9a86b,
    light: 0.7,
  },
});
