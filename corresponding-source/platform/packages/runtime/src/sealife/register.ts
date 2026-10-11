import { registerGenerator, registerGeneratorMaterial } from '../generators.js';
import {
  CLAM_GENERATOR,
  SHELL_GENERATOR,
  STARFISH_GENERATOR,
  clamGenerator,
  shellGenerator,
  starfishGenerator,
} from './generators.js';
import { SEALIFE_MATERIALS, SEALIFE_MATERIAL_OPTIONS, createSeaMaterial } from './material.js';

/**
 * Registers the sea-life generators and their shared materials (SEALIFE-01). Called once when the runtime entry
 * loads (`runtime/src/index.ts`), like the generators registered at the end of `runtime/src/generators.ts`;
 * calling it again only replaces the same entries.
 */
export function registerSeaLife(): void {
  for (const kind of Object.keys(SEALIFE_MATERIALS) as (keyof typeof SEALIFE_MATERIALS)[])
    registerGeneratorMaterial(SEALIFE_MATERIALS[kind], () => createSeaMaterial(SEALIFE_MATERIAL_OPTIONS[kind]));
  registerGenerator(STARFISH_GENERATOR, starfishGenerator);
  registerGenerator(CLAM_GENERATOR, clamGenerator);
  registerGenerator(SHELL_GENERATOR, shellGenerator);
}
