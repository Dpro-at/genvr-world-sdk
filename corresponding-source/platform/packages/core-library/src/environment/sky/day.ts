import { defineSky } from './_sky.js';

export default defineSky({
  preset: 'day',
  name: 'Day',
  look: {
    skyTop: 0x4aa8ff,
    skyHorizon: 0xcfe9ff,
    fog: 0xcfe9ff,
    sun: { color: 0xfff4e0, intensity: 2.6, elevationDeg: 55, azimuthDeg: 140 },
    ambient: { sky: 0xbfe3ff, ground: 0x6b8f4e, intensity: 1.1 },
    physical: {
      turbidity: 2.5,
      rayleigh: 1.2,
      mie: 0.005,
      cloudCoverage: 0.35,
      cloudDensity: 0.4,
      exposure: 0.6,
    },
  },
});
