import type { GameContext } from '../context.js';
/**
 * Riding (movement modes): who rides which item, for the rules. The room decides who may get on
 * and off and tells the session; this component keeps the pairs (`ctx.riding`) and raises
 * `mounted` and `dismounted`. It knows items only as instance ids and free-text tags.
 */
export declare class RidingComponent {
    #private;
    constructor(ctx: GameContext);
    /** Only a player who is here gets on; one riding something else gets off it first. */
    mount(id: string, item: string, tag: string, seat: number): void;
    dismount(id: string): void;
}
