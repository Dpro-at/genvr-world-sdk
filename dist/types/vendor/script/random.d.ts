/** FNV-1a over a string: a stable 32-bit seed from text (a place id and a match number). */
export declare function hash32(text: string): number;
/**
 * mulberry32: the generator behind `genvr.random()` and `Math.random` in a script. The prelude carries the same
 * code (`MULBERRY32_SOURCE`); this host copy lets tests and the harness predict a script's numbers.
 */
export declare function mulberry32(seed: number): () => number;
/** The same generator as JavaScript text for the prelude (`imul` is captured before creator code runs). */
export declare const MULBERRY32_SOURCE = "(seed) => {\n    let state = seed >>> 0;\n    return () => {\n      state = (state + 0x6d2b79f5) | 0;\n      let t = state;\n      t = imul(t ^ (t >>> 15), t | 1);\n      t ^= t + imul(t ^ (t >>> 7), t | 61);\n      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;\n    };\n  }";
/** The seed of match `n` of a place (0 is the first): the harness may fix the first one. */
export declare function matchSeed(placeSeed: string, n: number, first?: number): number;
/** One script's seed within a match: scripts of a place do not share a sequence. */
export declare function scriptSeed(match: number, scriptId: string): number;
