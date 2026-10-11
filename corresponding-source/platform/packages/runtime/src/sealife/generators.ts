import type { GeneratedBuild, Generator } from '../generators.js';
import { buildClam, clamParams, CLAM_LEVELS } from './clam.js';
import { SEALIFE_MATERIALS } from './material.js';
import { buildShell, shellParams, SHELL_LEVELS } from './shells.js';
import { buildStarfish, starfishParams, STARFISH_LEVELS } from './starfish.js';

/**
 * Generators of the sea-life items (SEALIFE-01). Pure geometry: equal parameters always give equal geometry, so
 * `buildGenerated` keeps one build per parameter set. Three levels each, nearest first; `ItemsView` switches them
 * by distance (`LOD_DISTANCES`).
 */

export const STARFISH_GENERATOR = 'sealife.starfish';
export const CLAM_GENERATOR = 'sealife.giant-clam';
export const SHELL_GENERATOR = 'sealife.shell';

const levels = (count: number, make: (level: number) => GeneratedBuild['levels'][number]): GeneratedBuild => ({
  levels: Array.from({ length: count }, (_, level) => make(level)),
});

export const starfishGenerator: Generator = {
  build(params) {
    const input = starfishParams(params);
    return levels(STARFISH_LEVELS, (level) => [
      { geometry: buildStarfish(input, level), material: SEALIFE_MATERIALS.starfish },
    ]);
  },
};

export const clamGenerator: Generator = {
  build(params) {
    const input = clamParams(params);
    return levels(CLAM_LEVELS, (level) => [{ geometry: buildClam(input, level), material: SEALIFE_MATERIALS.clam }]);
  },
};

export const shellGenerator: Generator = {
  build(params) {
    const input = shellParams(params);
    return levels(SHELL_LEVELS, (level) => [{ geometry: buildShell(input, level), material: SEALIFE_MATERIALS.shell }]);
  },
};
