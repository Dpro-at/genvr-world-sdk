import type { CommandPayload, ItemInstance, WorldDocument } from '../contracts/index.js';
import { type SurfaceIndex } from '../validator/index.js';
import { type ScatterGround, type ScatterOptions, type TerrainData } from '../world/index.js';
/**
 * The woods and the painted cover, drawn around the player (P2-40).
 *
 * Nothing here decides where anything stands: `@genvr/world` does that from the seed, so the
 * browser and the server agree. This only decides **which ground is worth working out right now**
 * and turns the result into ordinary item instances, which `ItemsView` then draws with the
 * instancing, LOD and colliders it already has.
 *
 * Chunks are kept once they are worked out, so walking back and forth does not redo them, and a
 * chunk is thrown away when the ground under it changes.
 */
/**
 * How far from the player things are drawn, in meters.
 *
 * This was three chunks, which is the mistake worth keeping a note about: a chunk is 64 m, not the
 * 32 m I measured with, so three of them reached 224 m in every direction and filled a small place
 * end to end. 1,140 trees drew at once for 53 million triangles and 19 fps. Distance in meters
 * cannot drift when the chunk size changes, which is the whole reason it is written this way.
 */
export declare const DRAW_DISTANCE = 128;
/**
 * How far the player walks before the drawn part of the scatter is chosen again (P2-43 final
 * review, I4), in meters. What is drawn is chosen within `DRAW_DISTANCE - RESELECT` of where the
 * choice was made, so nothing drawn is ever farther than `DRAW_DISTANCE` from the player: that is
 * where the ground is drawn at full detail, and past it a tree would stand over coarser ground.
 */
export declare const RESELECT = 8;
/**
 * The part of the worked-out scatter to draw around a point (P2-43 final review, I4): the ring of
 * chunks `ScatterView` keeps reaches much farther than the draw distance (it is a cache), so only
 * what stands within it, less the reselect step, goes to `ItemsView`.
 */
export declare function drawnScatter(instances: readonly ItemInstance[], x: number, z: number): ItemInstance[];
/** Whether the player walked far enough from where the drawn scatter was chosen to choose again. */
export declare function needsReselect(last: {
    x: number;
    z: number;
} | null, x: number, z: number): boolean;
/**
 * True where something built stands over the ground at x, z (P2-43): a room floor, a bridge deck
 * or the top of a solid item, taken from the rest law's surface index. Water is not "built": the
 * index counts it as a surface, so what is under the point is compared with the higher of the
 * ground and the water, and a lake never blocks its own shore (scatter keeps out of water itself).
 */
export declare function builtOver(surfaces: Pick<SurfaceIndex, 'below' | 'options'>, x: number, z: number): boolean;
/**
 * Where an item stands before `command` moves or removes it, as a `place_item` of its current
 * transform, read from `doc` before the command is applied (P2-43). Remote commands come without
 * an inverse; this stands in for it so `scatterChunksAfter` also regrows the spot the item left.
 * Any other command is its own stand-in (it adds no old spot).
 */
export declare function preImage(doc: WorldDocument, command: CommandPayload): CommandPayload;
/**
 * The chunks whose scatter must be worked out again after these commands (P2-43): where an item
 * stood before and stands now, as far as it reaches, or `'all'` after a change to floors, decks
 * or water. `reach` is how far an item reaches from its pivot across the ground, in meters.
 */
export declare function scatterChunksAfter(steps: ReadonlyArray<{
    applied: CommandPayload;
    result: {
        inverse: CommandPayload;
    };
}>, doc: WorldDocument, chunkSize: number, reach: (itemId: string, scale: readonly number[]) => number): Set<string> | 'all';
export declare class ScatterView {
    #private;
    private readonly terrain;
    private readonly ground;
    /** `blocked(x, z)`: spots where something is built over the ground (P2-43). */
    private readonly options;
    constructor(terrain: TerrainData, ground: ScatterGround, 
    /** `blocked(x, z)`: spots where something is built over the ground (P2-43). */
    options?: ScatterOptions);
    /** Everything standing around the player now. */
    get instances(): readonly ItemInstance[];
    /**
     * What is already worked out (`update`) within `radius` meters of a point, read-only (P2-43):
     * the world checks ask this for the woods and painted cover near the player, without triggering
     * more chunks to be built.
     */
    instancesNear(x: number, z: number, radius?: number): readonly ItemInstance[];
    /** Off for places with no starter world, and on phones that cannot afford it. */
    setEnabled(on: boolean): void;
    /** The ground changed here, so whatever stood on it is worked out again. */
    groundChanged(keys: Iterable<string>): void;
    /** Everything is worked out again: a new world, or the World tab's settings changed. */
    clear(): void;
    /**
     * Fills in the ground around a point. Returns true when what stands there changed, so the
     * caller only hands `ItemsView` a new list when there is a new one.
     */
    update(doc: WorldDocument, x: number, z: number): boolean;
}
