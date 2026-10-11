/** Tones of one block: the main color, a lighter and a darker one (share of each pixel). */
export interface Tones {
    base: number;
    light: number;
    dark: number;
    /** Share of light and dark pixels (the rest are base). */
    lightShare?: number;
    darkShare?: number;
    /** Pixels per speck (2 draws calmer, bigger specks). */
    speck?: 1 | 2;
}
/** A face of scattered tones. */
export declare function speckled(tones: Tones, seed: number): number[];
/** A face of one clean color (the plain look). */
export declare const plain: (color: number) => number[];
/** Bricks in rows of 8 x 4 pixels, every other row shifted by half a brick, with mortar lines. */
export declare function bricks(brick: number, mortar: number, shade?: number): number[];
/** Boards: horizontal planks four pixels high with a darker line between them, joints staggered. */
export declare function boards(wood: number, line: number, shade?: number): number[];
/** Soft horizontal shine lines (water). */
export declare function ripples(tones: Tones, seed: number): number[];
/** A side face with another face's top rows (grass or snow over the block below). */
export declare function capped(cap: readonly number[], body: readonly number[], rows: number, seed: number): number[];
/** A clean edge on every block: a lighter top-left line and a darker bottom-right one. */
export declare function bevel(pixels: readonly number[], amount?: number): number[];
