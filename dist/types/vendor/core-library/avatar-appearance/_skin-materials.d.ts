/**
 * Fantasy skin materials (owner + ChatGPT, CHAR-02; plan in docs/reference/character-anime/colours/
 * fantasy-skin-materials-plan.md): a skin is a base colour, a procedural pattern, a surface and a glow, drawn by
 * the runtime in the body's own (rest) space so it stays on the skin when it moves, on every look, without
 * textures. This first set covers every pattern type; more skins are data.
 */
/** Procedural patterns the runtime draws. */
export declare const SKIN_PATTERNS: readonly ["cracks", "stars", "marble", "stripes", "spots", "scales", "veins", "freckles", "solid"];
export type SkinPattern = (typeof SKIN_PATTERNS)[number];
export interface SkinMaterial {
    id: string;
    name: string;
    category: 'elemental' | 'nature' | 'mineral' | 'cosmic' | 'magic' | 'pattern' | 'fun';
    /** Main colour and the second colour the pattern's background drifts to. */
    base: string;
    secondary: string;
    pattern: SkinPattern;
    patternColor: string;
    /** Pattern cells per metre (bigger = smaller detail). */
    patternScale: number;
    /** Colour the skin takes in shadow (anime/cartoon looks). */
    shadow: string;
    /** Glow of the pattern (cracks, stars, veins): colour and strength (0 = none). */
    emissive?: string;
    emissiveStrength?: number;
    /** An overlay on surfaces facing up (moss, snow). */
    overlay?: {
        color: string;
        amount: number;
    };
    /** Surface for the realistic look. */
    roughness: number;
    metalness: number;
    /** The pattern drifts and the glow pulses. */
    animated: boolean;
}
export declare const SKIN_MATERIALS: readonly SkinMaterial[];
export declare const findSkinMaterial: (id: string | undefined) => SkinMaterial | undefined;
