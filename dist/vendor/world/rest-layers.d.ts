import type { Road } from '../contracts/index.js';
import type { WorldState } from './apply.js';
/** A flat surface over the ground: a room floor or a bridge deck, as a polygon and a height. */
export interface RestLayer {
    points: Array<[number, number]>;
    level: number;
}
/**
 * What lies over the ground of a place as it stands now (P2-43 final review, I6): room floors,
 * bridge decks and water (lakes, the sea and rivers, the higher wins). The studio and the API
 * both build their rest law surface index from this one function, and build it again after the
 * ground under a room, a road or a river changed, so the two never disagree about fresh ground.
 */
export declare function restLayers(state: WorldState): {
    floors: RestLayer[];
    decks: RestLayer[];
    waterAt: (x: number, z: number) => number | null;
};
/**
 * True within half a metre of a road's edge (P2-43 final review): the woods keep off roads. The
 * studio's scatter and the server's check of it use this one test, so they grow the same trees.
 */
export declare function nearRoad(roads: readonly Pick<Road, 'points' | 'width'>[], x: number, z: number): boolean;
