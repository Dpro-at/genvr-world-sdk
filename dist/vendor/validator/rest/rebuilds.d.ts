import type { CommandPayload, WorldDocument } from '../../contracts/index.js';
/**
 * Command types after which a `SurfaceIndex` must be built again (P2-43): they change room floors,
 * bridge decks, water (lakes, the sea, rivers) or, through the style, the shape of every item.
 * An item placed, moved or removed updates the index in place instead, and ground height is read
 * live. The studio and the API both rebuild on exactly this list, so they see the same surfaces.
 */
export declare const REBUILDS_SURFACES: ReadonlySet<CommandPayload['type']>;
/**
 * Whether, after this command, the floors, bridge decks and river water a `SurfaceIndex` holds
 * must be worked out again (P2-43 final review, I6): a room floor, a bridge deck and a river's
 * surface all follow the ground under them, so reshaping the ground moves them too. Only when the
 * place has walls, roads or rivers at all, which keeps a plain sculpt cheap. The item grid stays:
 * no item moved (`SurfaceIndex.setLayers`).
 */
export declare function refreshesLayers(command: CommandPayload, doc: Pick<WorldDocument, 'walls' | 'roads' | 'environment'>): boolean;
