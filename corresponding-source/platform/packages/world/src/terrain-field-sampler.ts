import type { TerrainFieldDescriptor } from '@genvr/contracts';
import { TerrainFieldStore } from './terrain-fields.js';

export interface TerrainFieldSampleOptions {
  filter?: 'bilinear' | 'nearest';
  edge?: 'clamp' | 'none';
}

/** Raw raster samples; no normalization, height binding, triangle interpolation or activation. */
export class TerrainFieldSampler {
  readonly #descriptor: TerrainFieldDescriptor;
  #disposed = false;
  constructor(readonly store: TerrainFieldStore) {
    this.#descriptor = store.descriptor;
  }
  sample(channel: string, x: number, z: number, options: TerrainFieldSampleOptions = {}): number | null {
    if (this.#disposed || !Number.isFinite(x) || !Number.isFinite(z)) return null;
    const d = this.#descriptor;
    const offset = d.sampling === 'cell-center' ? 0.5 : 0;
    let fx = (x - d.origin[0]) / d.spacing - offset;
    let fz = (z - d.origin[1]) / d.spacing - offset;
    if (!Number.isFinite(fx) || !Number.isFinite(fz)) return null;
    if ((options.edge ?? 'none') === 'clamp') {
      fx = Math.max(0, Math.min(d.width - 1, fx));
      fz = Math.max(0, Math.min(d.height - 1, fz));
    } else if (fx < 0 || fz < 0 || fx > d.width - 1 || fz > d.height - 1) return null;
    if ((options.filter ?? 'bilinear') === 'nearest')
      return this.store.readValue(channel, Math.round(fx), Math.round(fz));
    const col = Math.floor(fx),
      row = Math.floor(fz);
    const tx = fx - col,
      tz = fz - row;
    // Avoid unused neighbors, preserving exact values (including signed zero) at sample points.
    const a = this.store.readValue(channel, col, row);
    if (a === null) return null;
    const b = tx === 0 ? a : this.store.readValue(channel, col + 1, row);
    if (b === null) return null;
    const top = tx === 0 ? a : a * (1 - tx) + b * tx;
    if (tz === 0) return top;
    const c = this.store.readValue(channel, col, row + 1);
    if (c === null) return null;
    const e = tx === 0 ? c : this.store.readValue(channel, col + 1, row + 1);
    if (e === null) return null;
    const bottom = tx === 0 ? c : c * (1 - tx) + e * tx;
    return top * (1 - tz) + bottom * tz;
  }
  /** Releases the shared store's decoded cache; other samplers lazily rebuild it. */
  clear(): void {
    this.store.clearDecodedCache();
  }
  dispose(): void {
    this.clear();
    this.#disposed = true;
  }
}
