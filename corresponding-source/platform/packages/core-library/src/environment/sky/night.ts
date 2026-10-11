import { defineSky } from './_sky.js';

export default defineSky({
  preset: 'night',
  name: 'Night',
  look: {
    skyTop: 0x05081f,
    skyHorizon: 0x1c2550,
    fog: 0x141b3a,
    sun: { color: 0xaec6ff, intensity: 0.5, elevationDeg: 40, azimuthDeg: 60 },
    ambient: { sky: 0x3b4a8f, ground: 0x151a2e, intensity: 0.45 },
    physical: {
      turbidity: 2,
      rayleigh: 1,
      mie: 0.005,
      cloudCoverage: 0.25,
      cloudDensity: 0.3,
      exposure: 1.4,
    },
  },
});
