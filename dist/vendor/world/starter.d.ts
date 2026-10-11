import { WorldDocument, type CommandPayload, type SizeTier, type Style, type WorldSeed } from '../contracts/index.js';
import { type Footprint } from './scatter.js';
import type { TerrainData } from './terrain-data.js';
/**
 * Giving a place a starter world, as commands (P2-40 task 4).
 *
 * Every caller builds the same world this way — the create flow, the World tab and the assistant —
 * so none of them can forget the spawn items, the water (task 7) or invent a different clearing. It is a batch rather
 * than one big command on purpose: each piece keeps its own exact inverse, which is the rule every
 * command in this package follows, and `applyBatch` is what makes the lot one undo step.
 */
export declare function starterWorldCommands(doc: Pick<WorldDocument, 'instances' | 'sizeTier' | 'environment' | 'terrain' | 'style'>, world: WorldSeed, 
/**
 * Ground height after the world is given. Callers with no stored chunks can pass
 * `worldHeightAt`; a place that has been built in must apply `generate_world` first and then
 * pass the terrain's own `heightAt`, because a stored chunk beats the generator.
 */
heightAt: (x: number, z: number) => number, 
/** Each item's footprint, so the ring keeps its things apart (see `spawnRing`). */
footprint?: (itemId: string) => Footprint | null): CommandPayload[];
/** Ids of the water a starter world brings, so a world given again replaces its own water only. */
export declare const STARTER_WATER_IDS: {
    readonly lake: "starter-lake";
    readonly river: "starter-river";
};
/**
 * The water a kind of world starts with (P2-40 task 7, design 3.4), made of R4's own commands so
 * it edits, undoes and saves like water the creator drew: a valley's river into a lake at its far
 * end, the island's sea, the plain's lake in its dip, and a river down the mountain pass into a lake
 * where it comes out. Lakes fill the basin the ground already has, as the Water tool does.
 *
 * Worked out on the seed's own ground, so it is the same on every device and the server. A river
 * never runs through the spawn clearing: it bends around it.
 */
export declare function starterWater(world: WorldSeed, sizeTier: SizeTier, style?: Style): CommandPayload[];
/**
 * The ground a fresh place of this world stands on once its water is in: the seed's ground with
 * the river's bed carved and any lake basin dug. What "untouched" means for a starter world.
 */
export declare function starterGround(world: WorldSeed, sizeTier: SizeTier, style?: Style): TerrainData;
