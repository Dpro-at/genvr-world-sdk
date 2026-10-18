import { BufferGeometry, Color, type Material } from 'three/webgpu';
import { type SkinMaterial } from '../../../core-library/index.js';
import { type HumanData } from './format.js';
import { type HumanGender, type HumanStyle } from './generate.js';
/** The baked data at a URL, fetched and read once. */
export declare function loadHumanData(url: string): Promise<HumanData>;
/** Default colours of the base body. */
export declare const HUMAN_SKIN = "#f0c4a6";
export declare const HUMAN_SHORTS = "#2f3446";
/**
 * The colour a surface takes in shadow, as a share of its own colour per channel: warm and rosy, never grey
 * (owner's ChatGPT anime palette: shadows go to rose and terracotta; fitted to its skin/shadow pairs, a little
 * deeper so the form reads).
 */
export declare const ANIME_SHADOW: Color;
/**
 * Outline (inverted hull): width in metres at `reference` metres from the camera, growing with distance within
 * `scale` so it stays a steady line on screen; its colour as a (linear) share of the surface colour.
 */
export declare const OUTLINE: {
    width: number;
    shade: number;
    reference: number;
    scale: readonly [0.7, 5];
};
/**
 * How much of each lash strip is drawn, from the lid rim (0) to the tip (1): a line at the root, the rest cut
 * away (owner note 53: the whole strip drawn solid read as a grey band over the lid). The lower lashes are not
 * drawn at all (owner: the lower lid needs no line).
 */
export declare const LASH_KEEP: {
    upper: number;
    lower: number;
};
/**
 * The anime body material: cel shading with warm shadows, skin and shorts by region, rim light (one draw call);
 * `skinMaterial` paints a fantasy skin over the skin region.
 */
export declare function humanMaterial(skin?: string, shorts?: string, skinMaterial?: SkinMaterial, face?: Record<string, [number, number, number]>, brow?: string): Material;
/**
 * The anime outline: the body drawn again from its back faces, pushed out along the normals (`OUTLINE.width`,
 * applied by the skinning node), in a dark shade of each surface's own colour. Shares the colour uniforms of the
 * body material so recolouring updates both.
 */
export declare function humanOutlineMaterial(body: Material): Material;
/** The skinned geometry of a generated body; `userData.quadEdges` holds the quad wireframe index. */
export declare function humanGeometry(data: HumanData, style?: HumanStyle, gender?: HumanGender, animeShape?: number, build?: Readonly<Record<string, number>>): BufferGeometry;
/**
 * A generated body's geometry at a level of detail: `full`, or `lite` (the same vertex buffers with the lighter
 * index; made once and kept on the full geometry). Bodies baked without a lighter index stay full.
 */
export declare function humanDetail(full: BufferGeometry, detail: 'full' | 'lite'): BufferGeometry;
/** Recolours a generated body's own material (skin and shorts; owner, CHAR-02: skin colour per character). */
export declare function setHumanColors(material: Material, skin: string, shorts: string, brow?: string): void;
/** Shapes the drawn mouth of a generated body for a lip sync viseme. */
export declare function setHumanMouth(material: Material, shape: string): void;
