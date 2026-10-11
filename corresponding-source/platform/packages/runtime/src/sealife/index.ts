/** Sea-life items of the Tidewater seabed and shore (SEALIFE-01): starfish, giant clams and shells. Own code. */
export { registerSeaLife } from './register.js';
export {
  CLAM_GENERATOR,
  SHELL_GENERATOR,
  STARFISH_GENERATOR,
  clamGenerator,
  shellGenerator,
  starfishGenerator,
} from './generators.js';
export { SEALIFE_MATERIALS, createSeaMaterial, type SeaMaterialOptions, type SeaMotionKind } from './material.js';
export { STARFISH_DEFAULTS, buildStarfish, starfishParams, type StarfishParams } from './starfish.js';
export { CLAM_DEFAULTS, buildClam, clamParams, type ClamParams } from './clam.js';
export { SHELL_DEFAULTS, buildShell, shellParams, type ShellParams } from './shells.js';
export { CLAM_MANTLES, SHELL_KINDS, SHELL_TONES, STARFISH_PALETTES } from './palettes.js';
