import { defineSky } from './_sky.js';

export default defineSky({
  preset: 'sunset',
  name: 'Sunset',
  look: {
    skyTop: 0x5b4bb7,
    skyHorizon: 0xffa56b,
    fog: 0xf7b58a,
    sun: { color: 0xffb070, intensity: 2.0, elevationDeg: 8, azimuthDeg: 250 },
    ambient: { sky: 0xffc6a0, ground: 0x5a4a6a, intensity: 0.9 },
    physical: {
      turbidity: 6,
      rayleigh: 2,
      mie: 0.008,
      cloudCoverage: 0.4,
      cloudDensity: 0.45,
      exposure: 0.6,
    },
  },
});
