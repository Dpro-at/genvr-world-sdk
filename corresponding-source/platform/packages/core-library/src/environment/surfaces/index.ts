import plastic from './plastic.js';
import wood from './wood.js';
import stone from './stone.js';
import metal from './metal.js';
import glass from './glass.js';
import neon from './neon.js';
import type { SurfaceItem } from './_surface.js';

export * from './_surface.js';

/** Every Core surface, in picker order (one file per surface). */
export const CORE_SURFACES: readonly SurfaceItem[] = [plastic, wood, stone, metal, glass, neon];

/** The surface of a placed item's `material` key (unknown keys fall back to plastic). */
export const getSurface = (key: string | undefined): SurfaceItem =>
  CORE_SURFACES.find((surface) => surface.key === key) ?? CORE_SURFACES[0]!;
