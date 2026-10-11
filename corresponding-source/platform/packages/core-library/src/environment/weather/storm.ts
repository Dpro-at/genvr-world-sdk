import { CLEAR, defineWeather } from './_weather.js';

/** Heavy slanted rain, dark light, and lightning flashes. */
export default defineWeather({
  preset: 'storm',
  name: 'Thunderstorm',
  look: {
    ...CLEAR,
    particles: 'rain',
    count: 1200,
    fall: 22,
    wind: 5,
    particleColor: 0x9fb4c8,
    fogNear: 20,
    fogScale: 0.45,
    light: 0.45,
    lightning: true,
  },
});
