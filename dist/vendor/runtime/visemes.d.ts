import { type MouthShape } from '../contracts/index.js';
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
export declare function morphKey(name: string): string;
/** The morph weights of the nine shapes for a model's morph names (`morphTargetDictionary`); null when it has none. */
export declare function mouthMorphs(dictionary: Readonly<Record<string, number>> | undefined): MouthMorphs | null;
/** Shows a shape: the mouth morphs of the table to their weights, the others of the table to zero. */
export declare function applyMouthMorphs(influences: number[], table: MouthMorphs, shape: MouthShape): void;
