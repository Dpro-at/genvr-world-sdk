/*
 * Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC,
 * MIT (see ./LICENSE-tidewater.md). Source: src/world/ShoreField.js (computeShoreField L66-243, MinHeap L15-62).
 *
 * Offline wave-propagation field for the shore waves: the Eikonal equation |grad T| = 1 / c(x) solved with the Fast
 * Marching Method, c = sqrt(g depth) (capped at 25 m of depth), sources on the domain's border cells as a plane wave
 * along the swell. Fronts bend around headlands and line up with the depth contours near the beach.
 *
 * Output (RGBA float, res x res over the sea square, row-major from the origin corner):
 *   r = arrival time T (s), g,b = propagation direction x exposure (length = exposure 0.02..1),
 *   a = arrival time at the nearest shoreline (extended onto land for the swash timing).
 *
 * Where we differ: the input is our baked depth grid (sea level minus the place's height, resampled over the sea
 * square) instead of their terrain object, so the solve needs nothing but arrays; and the whole solve is ONE
 * self-contained function (the heap inside it) so a worker can be made from its source text, whatever bundler
 * built the runtime (see shore-field-worker.ts). Constants and passes are Tidewater's.
 */

export interface ShoreFieldInput {
  /** Sea depth (level - ground, m) per cell, row-major, res x res; <= 0 is land. */
  depth: Float32Array;
  res: number;
  /** World x and z of the grid's first corner (the square is origin .. origin + size on both axes). */
  origin: number;
  size: number;
  /** Unit xz direction the swell travels in. */
  swellDir: [number, number];
  maxDepth?: number;
  minDepth?: number;
}

export interface ShoreField {
  data: Float32Array;
  res: number;
  cellSize: number;
  origin: number;
  size: number;
}

/** Tidewater's swell direction (WorldLayout.js L35): travelling north (-z), a little to the west. */
export const DEFAULT_SWELL_DIR: [number, number] = (() => {
  const l = Math.hypot(-0.12, -1);
  return [-0.12 / l, -1 / l];
})();

/** `computeShoreField` (L66-243). Self-contained: nothing from outside the function body is used. */
export function computeShoreField(input: ShoreFieldInput): ShoreField {
  const GRAVITY = 9.81;
  const { depth, res, origin, size } = input;
  const maxDepth = input.maxDepth ?? 25;
  const minDepth = input.minDepth ?? 0.25;
  const h = size / res;
  const N = res * res;

  // binary min-heap of (time, cell)
  const keys = new Float64Array(N * 4);
  const vals = new Int32Array(N * 4);
  let heapSize = 0;
  const push = (k: number, v: number) => {
    let i = heapSize++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p]! <= k) break;
      keys[i] = keys[p]!;
      vals[i] = vals[p]!;
      i = p;
    }
    keys[i] = k;
    vals[i] = v;
  };
  const pop = () => {
    const top = vals[0]!;
    heapSize -= 1;
    const k = keys[heapSize]!;
    const v = vals[heapSize]!;
    let i = 0;
    const n = heapSize;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= n) break;
      if (c + 1 < n && keys[c + 1]! < keys[c]!) c += 1;
      if (keys[c]! >= k) break;
      keys[i] = keys[c]!;
      vals[i] = vals[c]!;
      i = c;
    }
    keys[i] = k;
    vals[i] = v;
    return top;
  };

  const speed = new Float32Array(N);
  for (let k = 0; k < N; k += 1) {
    const d = depth[k]!;
    speed[k] = d > 0 ? Math.sqrt(GRAVITY * Math.min(Math.max(d, minDepth), maxDepth)) : 0;
  }

  const T = new Float32Array(N).fill(Infinity);
  const state = new Uint8Array(N); // 0 far, 1 trial, 2 known
  const sdx = input.swellDir[0];
  const sdz = input.swellDir[1];
  const c0 = Math.sqrt(GRAVITY * maxDepth);

  // plane-wave initial condition on the border water cells
  for (let j = 0; j < res; j += 1)
    for (let i = 0; i < res; i += 1) {
      if (i !== 0 && j !== 0 && i !== res - 1 && j !== res - 1) continue;
      const k = j * res + i;
      if (speed[k]! <= 0) continue;
      const x = origin + (i + 0.5) * h;
      const z = origin + (j + 0.5) * h;
      T[k] = (x * sdx + z * sdz) / c0 + size; // offset keeps T positive
      state[k] = 1;
      push(T[k]!, k);
    }

  const solve = (i: number, j: number) => {
    const k = j * res + i;
    const c = speed[k]!;
    if (c <= 0) return Infinity;
    const f = h / c;
    const tx = Math.min(
      i > 0 && state[k - 1] === 2 ? T[k - 1]! : Infinity,
      i < res - 1 && state[k + 1] === 2 ? T[k + 1]! : Infinity,
    );
    const tz = Math.min(
      j > 0 && state[k - res] === 2 ? T[k - res]! : Infinity,
      j < res - 1 && state[k + res] === 2 ? T[k + res]! : Infinity,
    );
    const a = Math.min(tx, tz);
    const b = Math.max(tx, tz);
    if (!Number.isFinite(b) || b - a >= f) return a + f;
    return 0.5 * (a + b + Math.sqrt(2 * f * f - (a - b) * (a - b)));
  };

  while (heapSize > 0) {
    const k = pop();
    if (state[k] === 2) continue;
    state[k] = 2;
    const i = k % res;
    const j = (k / res) | 0;
    for (let n = 0; n < 4; n += 1) {
      const ni = n === 0 ? i - 1 : n === 1 ? i + 1 : i;
      const nj = n === 2 ? j - 1 : n === 3 ? j + 1 : j;
      if (ni < 0 || nj < 0 || ni >= res || nj >= res) continue;
      const nk = nj * res + ni;
      if (state[nk] === 2 || speed[nk]! <= 0) continue;
      const t = solve(ni, nj);
      if (t < T[nk]!) {
        T[nk] = t;
        state[nk] = 1;
        push(t, nk);
      }
    }
  }

  // Extend a field onto land one ring of cells per pass (average of the known neighbours + inc). Each pass reads
  // the previous pass only, so values from far away never sweep across the land in one pass.
  const extend = (F: Float32Array, passes: number, inc: number) => {
    const prev = new Float32Array(N);
    for (let pass = 0; pass < passes; pass += 1) {
      prev.set(F);
      let changed = false;
      for (let j = 0; j < res; j += 1)
        for (let i = 0; i < res; i += 1) {
          const k = j * res + i;
          if (Number.isFinite(prev[k]!)) continue;
          let s = 0;
          let n = 0;
          if (i > 0 && Number.isFinite(prev[k - 1]!)) {
            s += prev[k - 1]!;
            n += 1;
          }
          if (i < res - 1 && Number.isFinite(prev[k + 1]!)) {
            s += prev[k + 1]!;
            n += 1;
          }
          if (j > 0 && Number.isFinite(prev[k - res]!)) {
            s += prev[k - res]!;
            n += 1;
          }
          if (j < res - 1 && Number.isFinite(prev[k + res]!)) {
            s += prev[k + res]!;
            n += 1;
          }
          if (n > 0) {
            F[k] = s / n + inc;
            changed = true;
          }
        }
      if (!changed) break;
    }
  };

  // arrival time at the nearest shoreline, extended unchanged onto land (swash timing)
  const Tshore = new Float32Array(T);
  extend(Tshore, 40, 0);
  // T onto land (a continuous phase in the swash zone), slowly continuing up the beach
  const Tfilled = new Float32Array(T);
  extend(Tfilled, 24, h / 1.5);

  // smooth to remove first-order FMM kinks (keeps the phase monotonic)
  let Ts = Tfilled;
  for (let it = 0; it < 3; it += 1) {
    const out = new Float32Array(N);
    for (let j = 0; j < res; j += 1)
      for (let i = 0; i < res; i += 1) {
        const k = j * res + i;
        if (!Number.isFinite(Ts[k]!)) {
          out[k] = Ts[k]!;
          continue;
        }
        let s = Ts[k]! * 4;
        let w = 4;
        if (i > 0 && Number.isFinite(Ts[k - 1]!)) {
          s += Ts[k - 1]!;
          w += 1;
        }
        if (i < res - 1 && Number.isFinite(Ts[k + 1]!)) {
          s += Ts[k + 1]!;
          w += 1;
        }
        if (j > 0 && Number.isFinite(Ts[k - res]!)) {
          s += Ts[k - res]!;
          w += 1;
        }
        if (j < res - 1 && Number.isFinite(Ts[k + res]!)) {
          s += Ts[k + res]!;
          w += 1;
        }
        out[k] = s / w;
      }
    Ts = out;
  }

  // directions + exposure
  const data = new Float32Array(N * 4);
  const sl = Math.hypot(sdx, sdz);
  const g = (a: number, b: number) => (Number.isFinite(a) && Number.isFinite(b) ? a - b : 0);
  for (let j = 0; j < res; j += 1)
    for (let i = 0; i < res; i += 1) {
      const k = j * res + i;
      const t = Ts[k]!;
      const tl = i > 0 ? Ts[k - 1]! : t;
      const tr = i < res - 1 ? Ts[k + 1]! : t;
      const td = j > 0 ? Ts[k - res]! : t;
      const tu = j < res - 1 ? Ts[k + res]! : t;
      let gx = g(tr, tl);
      let gz = g(tu, td);
      if (gx === 0 && Number.isFinite(tr) && Number.isFinite(t)) gx = tr - t;
      if (gz === 0 && Number.isFinite(tu) && Number.isFinite(t)) gz = tu - t;
      const len = Math.hypot(gx, gz) || 1;
      const dx = gx / len;
      const dz = gz / len;
      // exposure: how directly the local wave direction faces the incoming swell
      const align = (dx * sdx + dz * sdz) / sl;
      const exposure = Math.min(1, Math.max(0.02, align * 1.4 + 0.1));
      data[k * 4] = Number.isFinite(t) ? t : 1e5;
      data[k * 4 + 1] = dx * exposure;
      data[k * 4 + 2] = dz * exposure;
      data[k * 4 + 3] = Number.isFinite(Tshore[k]!) ? Tshore[k]! : Number.isFinite(t) ? t : 1e5;
    }

  return { data, res, cellSize: h, origin, size };
}

/**
 * The swell direction when the place does not set one (Genvr's own): from the open side of the island. For 16
 * directions, the share of deep water (capped at 25 m) in the up-swell strip of the square; Tidewater's direction
 * when it is as good as the best (an island in open sea), else the mean of the best directions.
 */
export function autoSwellDirection(depth: Float32Array, res: number): [number, number] {
  const score = (dx: number, dz: number) => {
    let sum = 0;
    let n = 0;
    for (let j = 0; j < res; j += 1)
      for (let i = 0; i < res; i += 1) {
        const x = ((i + 0.5) / res) * 2 - 1;
        const z = ((j + 0.5) / res) * 2 - 1;
        if (x * dx + z * dz > -0.6) continue;
        sum += Math.min(Math.max(depth[j * res + i]!, 0), 25) / 25;
        n += 1;
      }
    return n > 0 ? sum / n : 0;
  };
  const candidates: Array<{ dir: [number, number]; s: number }> = [];
  for (let k = 0; k < 16; k += 1) {
    const a = (k / 16) * Math.PI * 2;
    const dir: [number, number] = [Math.cos(a), Math.sin(a)];
    candidates.push({ dir, s: score(dir[0], dir[1]) });
  }
  const best = Math.max(...candidates.map((c) => c.s));
  if (score(DEFAULT_SWELL_DIR[0], DEFAULT_SWELL_DIR[1]) >= best - 0.02) return [...DEFAULT_SWELL_DIR];
  let sx = 0;
  let sz = 0;
  for (const c of candidates)
    if (c.s >= best - 0.02) {
      sx += c.dir[0];
      sz += c.dir[1];
    }
  const l = Math.hypot(sx, sz);
  if (l < 1e-6) return [...candidates.find((c) => c.s === best)!.dir];
  return [sx / l, sz / l];
}
