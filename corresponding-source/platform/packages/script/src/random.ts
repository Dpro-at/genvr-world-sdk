/** FNV-1a over a string: a stable 32-bit seed from text (a place id and a match number). */
export function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * mulberry32: the generator behind `genvr.random()` and `Math.random` in a script. The prelude carries the same
 * code (`MULBERRY32_SOURCE`); this host copy lets tests and the harness predict a script's numbers.
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The same generator as JavaScript text for the prelude (`imul` is captured before creator code runs). */
export const MULBERRY32_SOURCE = `(seed) => {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) | 0;
      let t = state;
      t = imul(t ^ (t >>> 15), t | 1);
      t ^= t + imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }`;

/** The seed of match `n` of a place (0 is the first): the harness may fix the first one. */
export function matchSeed(placeSeed: string, n: number, first?: number): number {
  const base = first ?? hash32(placeSeed);
  return n === 0 ? base >>> 0 : hash32(`${base}:${n}`);
}

/** One script's seed within a match: scripts of a place do not share a sequence. */
export function scriptSeed(match: number, scriptId: string): number {
  return hash32(`${match}:${scriptId}`);
}
