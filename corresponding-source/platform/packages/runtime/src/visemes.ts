import { MOUTH_SHAPES, type MouthShape } from '@genvr/contracts';

/**
 * Mouth shapes on mesh bodies (lip sync P2-44, plan Task 6): a model that has mouth blend shapes (morph targets)
 * shows our nine shapes through them. The common naming families are understood:
 * - visemes (Oculus / Ready Player Me `viseme_aa`, VRChat `vrc.v_aa`): `sil PP FF TH DD kk CH SS nn RR aa E I O U`;
 * - vowels only (VRoid `Fcl_MTH_A`, VRM `aa ih ou ee oh`);
 * - ARKit face shapes (`jawOpen`, `mouthFunnel`, `mouthPucker`, `mouthRollLower`);
 * - one open shape (`mouthOpen`, `jawOpen`, `MouthOpen`).
 * A model with none of them keeps its mouth still.
 */

/** Weights per morph target index for one shape; empty means the mouth at rest. */
export type MorphWeights = ReadonlyArray<readonly [index: number, weight: number]>;
export type MouthMorphs = Readonly<Record<MouthShape, MorphWeights>>;

/** A morph name reduced to its sound: lower case, letters and digits, family prefixes dropped. */
export function morphKey(name: string): string {
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const prefix of ['viseme', 'vrcv', 'fclmth', 'mth', 'v'])
    if (key.startsWith(prefix) && key.length > prefix.length) {
      // `v` alone only before a known sound (`v_aa`), never inside a word.
      if (prefix === 'v' && !SOUNDS.has(key.slice(1))) continue;
      return key.slice(prefix.length);
    }
  return key;
}

/** Each viseme's sound and the names it goes by. */
const ALIASES: Record<string, readonly string[]> = {
  aa: ['aa', 'a'],
  e: ['e', 'ee'],
  i: ['i', 'ih'],
  o: ['o', 'oh'],
  u: ['u', 'ou', 'uu'],
  pp: ['pp'],
  ff: ['ff'],
  kk: ['kk'],
  dd: ['dd'],
  nn: ['nn'],
};
const SOUNDS = new Set(Object.values(ALIASES).flat());

/**
 * For each shape, alternatives in order: the first one the model has is used. Rhubarb's shapes: A closed (P B M),
 * B a little open (most consonants), C open (E), D wide open (A), E rounded (O), F puckered (U W), G F/V, H L, X rest.
 */
const VISEMES: Record<MouthShape, ReadonlyArray<ReadonlyArray<readonly [string, number]>>> = {
  A: [[['pp', 1]]],
  B: [[['kk', 1]], [['dd', 1]], [['i', 0.5]]],
  C: [[['e', 1]], [['i', 1]]],
  D: [[['aa', 1]]],
  E: [[['o', 1]]],
  F: [[['u', 1]]],
  G: [[['ff', 1]]],
  H: [[['nn', 1]], [['dd', 1]], [['i', 0.7]]],
  X: [],
};

/** ARKit face shapes. */
const ARKIT: Record<MouthShape, ReadonlyArray<readonly [string, number]>> = {
  A: [],
  B: [['jawopen', 0.15]],
  C: [['jawopen', 0.35]],
  D: [['jawopen', 0.65]],
  E: [['jawopen', 0.35], ['mouthfunnel', 0.6]],
  F: [['jawopen', 0.1], ['mouthpucker', 0.9]],
  G: [['jawopen', 0.05], ['mouthrolllower', 0.7]],
  H: [['jawopen', 0.3]],
  X: [],
};

/** How far one open shape opens for each mouth shape. */
const OPEN: Record<MouthShape, number> = { A: 0, B: 0.2, C: 0.45, D: 0.8, E: 0.45, F: 0.2, G: 0.1, H: 0.35, X: 0 };

/** The morph weights of the nine shapes for a model's morph names (`morphTargetDictionary`); null when it has none. */
export function mouthMorphs(dictionary: Readonly<Record<string, number>> | undefined): MouthMorphs | null {
  if (!dictionary) return null;
  const byKey = new Map<string, number>();
  for (const [name, index] of Object.entries(dictionary)) {
    const key = morphKey(name);
    if (!byKey.has(key)) byKey.set(key, index);
  }
  const find = (sound: string) => {
    for (const alias of ALIASES[sound] ?? [sound]) {
      const index = byKey.get(alias);
      if (index !== undefined) return index;
    }
    return undefined;
  };
  const table = {} as Record<MouthShape, MorphWeights>;
  // Visemes or vowels: the model must at least open wide.
  if (find('aa') !== undefined) {
    for (const shape of MOUTH_SHAPES) {
      table[shape] = [];
      for (const alternative of VISEMES[shape]) {
        const weights = alternative.map(([sound, weight]) => [find(sound), weight] as const);
        if (weights.every(([index]) => index !== undefined)) {
          table[shape] = weights as MorphWeights;
          break;
        }
      }
    }
    return table;
  }
  if (byKey.has('jawopen') && (byKey.has('mouthfunnel') || byKey.has('mouthpucker'))) {
    for (const shape of MOUTH_SHAPES)
      table[shape] = ARKIT[shape].flatMap(([key, weight]) =>
        byKey.has(key) ? [[byKey.get(key)!, weight] as const] : [],
      );
    return table;
  }
  const open = byKey.get('mouthopen') ?? byKey.get('jawopen') ?? byKey.get('open');
  if (open === undefined) return null;
  for (const shape of MOUTH_SHAPES) table[shape] = OPEN[shape] > 0 ? [[open, OPEN[shape]]] : [];
  return table;
}

/** Shows a shape: the mouth morphs of the table to their weights, the others of the table to zero. */
export function applyMouthMorphs(influences: number[], table: MouthMorphs, shape: MouthShape): void {
  for (const weights of Object.values(table)) for (const [index] of weights) influences[index] = 0;
  for (const [index, weight] of table[shape]) influences[index] = weight;
}
