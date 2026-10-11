import { defineSky } from './_sky.js';

export default defineSky({
  preset: 'storm',
  name: 'Storm clouds',
  look: {
    skyTop: 0x3d4452,
    skyHorizon: 0x7c8594,
    fog: 0x6f7885,
    sun: { color: 0xd8dde6, intensity: 0.9, elevationDeg: 50, azimuthDeg: 120 },
    ambient: { sky: 0x9aa3b0, ground: 0x3f4a3a, intensity: 0.8 },
    physical: {
      turbidity: 10,
      rayleigh: 3,
      mie: 0.02,
      cloudCoverage: 0.95,
      cloudDensity: 0.9,
      exposure: 0.45,
    },
  },
});
