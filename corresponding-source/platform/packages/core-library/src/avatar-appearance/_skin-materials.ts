/**
 * Fantasy skin materials (owner + ChatGPT, CHAR-02; plan in docs/reference/character-anime/colours/
 * fantasy-skin-materials-plan.md): a skin is a base colour, a procedural pattern, a surface and a glow, drawn by
 * the runtime in the body's own (rest) space so it stays on the skin when it moves, on every look, without
 * textures. This first set covers every pattern type; more skins are data.
 */

/** Procedural patterns the runtime draws. */
export const SKIN_PATTERNS = ['cracks', 'stars', 'marble', 'stripes', 'spots', 'scales', 'veins', 'freckles', 'solid'] as const;
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
  overlay?: { color: string; amount: number };
  /** Surface for the realistic look. */
  roughness: number;
  metalness: number;
  /** The pattern drifts and the glow pulses. */
  animated: boolean;
}

export const SKIN_MATERIALS: readonly SkinMaterial[] = [
  {
    id: 'lava-cracks',
    name: 'Lava Cracks',
    category: 'elemental',
    base: '#211513',
    secondary: '#4a2017',
    pattern: 'cracks',
    patternColor: '#ff4b0a',
    patternScale: 9,
    shadow: '#120b0a',
    emissive: '#ff7200',
    emissiveStrength: 2.5,
    roughness: 0.82,
    metalness: 0,
    animated: true,
  },
  {
    id: 'ice-cracks',
    name: 'Frozen Cracks',
    category: 'elemental',
    base: '#9fe3ff',
    secondary: '#4fb4e6',
    pattern: 'cracks',
    patternColor: '#f2fdff',
    patternScale: 7,
    shadow: '#3a7fb8',
    emissive: '#c8f4ff',
    emissiveStrength: 0.6,
    roughness: 0.25,
    metalness: 0.05,
    animated: false,
  },
  {
    id: 'galaxy-stars',
    name: 'Galaxy Stars',
    category: 'cosmic',
    base: '#11142e',
    secondary: '#542a8a',
    pattern: 'stars',
    patternColor: '#ffffff',
    patternScale: 38,
    shadow: '#0a0b1c',
    emissive: '#796cff',
    emissiveStrength: 0.8,
    roughness: 0.45,
    metalness: 0.05,
    animated: true,
  },
  {
    id: 'moss-stone',
    name: 'Moss Stone',
    category: 'nature',
    base: '#777568',
    secondary: '#454a3d',
    pattern: 'cracks',
    patternColor: '#3c3e34',
    patternScale: 6,
    shadow: '#3f4036',
    overlay: { color: '#769b48', amount: 0.4 },
    roughness: 0.95,
    metalness: 0,
    animated: false,
  },
  {
    id: 'marble',
    name: 'Marble',
    category: 'nature',
    base: '#eeebe6',
    secondary: '#cfcac3',
    pattern: 'marble',
    patternColor: '#8f8a86',
    patternScale: 3,
    shadow: '#a9a4a0',
    roughness: 0.3,
    metalness: 0,
    animated: false,
  },
  {
    id: 'gold',
    name: 'Gold',
    category: 'mineral',
    base: '#d9a514',
    secondary: '#b98a0c',
    pattern: 'marble',
    patternColor: '#ffd95a',
    patternScale: 2,
    shadow: '#805600',
    emissive: '#fff0a0',
    emissiveStrength: 0.15,
    roughness: 0.25,
    metalness: 1,
    animated: false,
  },
  {
    id: 'dragon-scales',
    name: 'Dragon Scales',
    category: 'pattern',
    base: '#16a66a',
    secondary: '#0d7a4c',
    pattern: 'scales',
    patternColor: '#07563a',
    patternScale: 22,
    shadow: '#07563a',
    roughness: 0.55,
    metalness: 0.1,
    animated: false,
  },
  {
    id: 'tiger-stripes',
    name: 'Tiger Stripes',
    category: 'pattern',
    base: '#e8892e',
    secondary: '#f2b05c',
    pattern: 'stripes',
    patternColor: '#1d1410',
    patternScale: 5,
    shadow: '#9a4f16',
    roughness: 0.8,
    metalness: 0,
    animated: false,
  },
  {
    id: 'magic-veins',
    name: 'Magic Veins',
    category: 'magic',
    base: '#2a1c45',
    secondary: '#3d2766',
    pattern: 'veins',
    patternColor: '#b06cff',
    patternScale: 7,
    shadow: '#170f28',
    emissive: '#d7a2ff',
    emissiveStrength: 1.6,
    roughness: 0.5,
    metalness: 0,
    animated: true,
  },
  {
    id: 'candy',
    name: 'Candy',
    category: 'fun',
    base: '#ff8fc8',
    secondary: '#ffc2e2',
    pattern: 'spots',
    patternColor: '#ffffff',
    patternScale: 10,
    shadow: '#d65b9a',
    roughness: 0.2,
    metalness: 0,
    animated: false,
  },
  {
    id: 'freckles',
    name: 'Freckles',
    category: 'pattern',
    base: '#f2c49b',
    secondary: '#eab58c',
    pattern: 'freckles',
    patternColor: '#a2603b',
    patternScale: 40,
    shadow: '#d39276',
    roughness: 0.6,
    metalness: 0,
    animated: false,
  },
];

export const findSkinMaterial = (id: string | undefined): SkinMaterial | undefined =>
  id ? SKIN_MATERIALS.find((material) => material.id === id) : undefined;
