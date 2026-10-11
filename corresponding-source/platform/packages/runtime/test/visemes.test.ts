import { MOUTH_SHAPES } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import { applyMouthMorphs, morphKey, mouthMorphs } from '../src/visemes.js';

// Lip sync (P2-44, plan Task 6): mesh bodies show the nine shapes through the mouth blend shapes they have.

const dictionary = (names: string[]) => Object.fromEntries(names.map((name, index) => [name, index]));

describe('mouth shapes on mesh bodies', () => {
  it('reads the common names of mouth shapes', () => {
    expect(morphKey('viseme_aa')).toBe('aa');
    expect(morphKey('vrc.v_oh')).toBe('oh');
    expect(morphKey('Fcl_MTH_A')).toBe('a');
    expect(morphKey('v_ff')).toBe('ff');
    expect(morphKey('jawOpen')).toBe('jawopen');
    // A `v` that starts a word is not a prefix.
    expect(morphKey('veil')).toBe('veil');
  });

  it('uses the full viseme set (Ready Player Me, VRChat)', () => {
    const names = ['eyeBlinkLeft', ...['sil', 'PP', 'FF', 'TH', 'DD', 'kk', 'CH', 'SS', 'nn', 'RR', 'aa', 'E', 'I', 'O', 'U'].map((v) => `viseme_${v}`)];
    const table = mouthMorphs(dictionary(names))!;
    const at = (name: string) => names.indexOf(name);
    expect(table.A).toEqual([[at('viseme_PP'), 1]]);
    expect(table.B).toEqual([[at('viseme_kk'), 1]]);
    expect(table.D).toEqual([[at('viseme_aa'), 1]]);
    expect(table.F).toEqual([[at('viseme_U'), 1]]);
    expect(table.G).toEqual([[at('viseme_FF'), 1]]);
    expect(table.H).toEqual([[at('viseme_nn'), 1]]);
    expect(table.X).toEqual([]);
  });

  it('makes do with vowels only (VRoid): closed shapes stay at rest', () => {
    const names = ['Fcl_MTH_A', 'Fcl_MTH_I', 'Fcl_MTH_U', 'Fcl_MTH_E', 'Fcl_MTH_O'];
    const table = mouthMorphs(dictionary(names))!;
    expect(table.D).toEqual([[0, 1]]);
    expect(table.C).toEqual([[3, 1]]);
    expect(table.E).toEqual([[4, 1]]);
    expect(table.F).toEqual([[2, 1]]);
    expect(table.B).toEqual([[1, 0.5]]);
    expect(table.A).toEqual([]);
    expect(table.G).toEqual([]);
  });

  it('uses ARKit face shapes, or one open shape, and nothing for a model without mouth shapes', () => {
    const arkit = mouthMorphs(dictionary(['jawOpen', 'mouthFunnel', 'mouthPucker', 'mouthRollLower']))!;
    expect(arkit.D).toEqual([[0, 0.65]]);
    expect(arkit.E).toEqual([[0, 0.35], [1, 0.6]]);
    expect(arkit.X).toEqual([]);
    const open = mouthMorphs(dictionary(['Blink', 'MouthOpen']))!;
    expect(open.D).toEqual([[1, 0.8]]);
    expect(open.A).toEqual([]);
    for (const shape of MOUTH_SHAPES) expect(open[shape]).toBeDefined();
    expect(mouthMorphs(dictionary(['Blink', 'Smile']))).toBeNull();
    expect(mouthMorphs(undefined)).toBeNull();
  });

  it('shows one shape at a time and leaves the other morphs alone', () => {
    const table = mouthMorphs(dictionary(['blink', 'viseme_aa', 'viseme_O', 'viseme_PP']))!;
    const influences = [0.4, 0, 0, 0];
    applyMouthMorphs(influences, table, 'D');
    expect(influences).toEqual([0.4, 1, 0, 0]);
    applyMouthMorphs(influences, table, 'E');
    expect(influences).toEqual([0.4, 0, 1, 0]);
    applyMouthMorphs(influences, table, 'X');
    expect(influences).toEqual([0.4, 0, 0, 0]);
  });
});
