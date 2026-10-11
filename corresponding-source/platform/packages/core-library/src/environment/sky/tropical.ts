import { defineSky } from './_sky.js';
import day from './day.js';

/** Tropical island atmosphere (Tidewater world plan, task 3). */
export default defineSky({
  preset: 'tropical',
  name: 'Tropical',
  look: {
    ...day.look,
    sun: { ...day.look.sun, elevationDeg: 27.06, azimuthDeg: -100 },
    physical: { ...day.look.physical, exposure: 0.55 },
    tidewater: { timeOfDay: 16.2, sunAzimuth: 0, exposure: 0.55, windDirection: 200.42, windSpeed: 7 },
  },
});
