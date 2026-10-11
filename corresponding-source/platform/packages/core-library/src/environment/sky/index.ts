import day from './day.js';
import sunset from './sunset.js';
import night from './night.js';
import storm from './storm.js';
import tropical from './tropical.js';
import type { SkyItem } from './_sky.js';

export * from './_sky.js';

/** Every Core sky, in picker order (one file per sky). */
export const CORE_SKIES: readonly SkyItem[] = [day, sunset, night, storm, tropical];

/** The sky item of a world's sky preset. */
export const getSky = (preset: SkyItem['preset']): SkyItem =>
  CORE_SKIES.find((sky) => sky.preset === preset)!;
