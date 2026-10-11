/** How much of each mesh's triangles the levels keep, and the most shape change each may cause. */
export declare const LOD_LEVELS: readonly [{
    readonly keep: 0.35;
    readonly error: 0.02;
}, {
    readonly keep: 0.1;
    readonly error: 0.08;
}];
/** Models with fewer triangles are cheap enough without simpler versions. */
export declare const LOD_MIN_TRIANGLES = 1000;
/**
 * Simpler far versions of a model (decision 94): the same file with each mesh's triangle list
 * replaced by a shorter one, so materials, textures, colors, and for moving models skin weights,
 * bones, and animations stay exactly as they are (a moving copy swaps only its triangle lists).
 * Returns up to two GLBs (the next levels), or none for small or compressed models, which keep
 * only their own model. Shapes with morph targets keep all their triangles.
 */
export declare function makeLods(bytes: Uint8Array): Promise<Uint8Array[]>;
