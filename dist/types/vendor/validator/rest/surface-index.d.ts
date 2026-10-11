import type { ItemInstance, WorldDocument } from '../../contracts/index.js';
import { type FloorSurface } from '../geometry.js';
import type { WorldEnvironment } from '../world-checks.js';
import type { RestShape } from './rest.js';
/** What lies over the ground apart from items: room floors, bridge decks and water. */
export interface SurfaceLayers {
    waterAt?(x: number, z: number): number | null;
    floors?: readonly FloorSurface[];
    decks?: readonly FloorSurface[];
}
export interface SurfaceOptions extends SurfaceLayers {
    groundAt(x: number, z: number): number;
    itemShape: WorldEnvironment['itemShape'];
    /**
     * The rest law's shape of an item type (P2-43 final review): when it gives a `base` (a tree's
     * trunk), only the base carries things, so a canopy is never a floor and never keeps scatter out.
     */
    restShape?(itemId: string): RestShape | null;
}
/**
 * What is under a point, from the world document alone (P2-43): ground, water, room floors,
 * bridge decks and the tops of solid items. The server, the studio and the validator all ask this
 * one index, so they always agree about where a thing rests.
 */
export declare class SurfaceIndex {
    #private;
    readonly options: SurfaceOptions;
    constructor(doc: WorldDocument, options: SurfaceOptions);
    /**
     * New floors, decks or water (P2-43 final review, I6): the ground under a room, a bridge or a
     * river changed, so what stands on it changed too, but no item moved, so the item grid stays.
     */
    setLayers(layers: SurfaceLayers): void;
    update(instance: ItemInstance | null, instanceId: string): void;
    /**
     * The highest surface under x, z at or below `fromY`. `bed` skips the water surface, so an item
     * that belongs under water (sea life) finds the seabed, floors and items below the water.
     */
    below(x: number, z: number, fromY: number, ignore?: string, bed?: boolean): number;
}
