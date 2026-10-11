import { ZONE_AREA_ID } from './gameplay/zone-area.js';
import { ZONE_GATE_ID } from './gameplay/zone-gate.js';
import { type CoreItem } from './_parts.js';
export * from './_parts.js';
export { MELEE_TOOL_ID } from './gameplay/melee-tool.js';
export { SPAWN_POINT_ID } from './gameplay/spawn-point.js';
export { ZONE_AREA_ID, ZONE_GATE_ID };
/**
 * The zone shape the Zone Area and Zone Gate items have by themselves (their params may name the
 * other one), or undefined for any other item; pass it to `zoneFromParams` as `itemShape`.
 */
export declare function zoneShapeOfItem(itemId: string): 'area' | 'gate' | undefined;
/** Every Core 3D model, in library order (one file per model: `<subcategory>/<slug>.ts`). */
export declare const CORE_ITEMS: readonly CoreItem[];
/**
 * Items not opened to every place yet (decision 130): found by `getCoreItem`, left out of `CORE_ITEMS`, the
 * catalogs and the library.
 */
export declare const EXPERIMENTAL_ITEMS: readonly CoreItem[];
/** Names of the generator parameters of an item with a generated look (decision 130), sorted; empty otherwise. */
export declare function generatedParamKeys(id: string): string[];
export declare const getCoreItem: (id: string) => CoreItem | undefined;
