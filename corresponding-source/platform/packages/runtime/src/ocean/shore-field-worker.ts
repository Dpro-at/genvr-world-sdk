/*
 * Solves the shore field off the main thread (Tidewater sea, plan task 4). Genvr's own code around the ported
 * solve in ./shore-field.ts (Tidewater, MIT, see ./LICENSE-tidewater.md).
 *
 * The worker is made from the solve's own source text (a Blob URL), so it works however the runtime was bundled:
 * `computeShoreField` uses nothing from outside its body. Where there is no Worker (node tests) or it cannot start,
 * the solve runs here instead, after the current frame.
 */
import { autoSwellDirection, computeShoreField, type ShoreField, type ShoreFieldInput } from './shore-field.js';

/** Cells per side of the shore field (Tidewater: 512). */
export const SHORE_FIELD_RES = 512;

export interface ShoreFieldRequest {
  /** Ground height of the place at world x, z. */
  heightAt: (x: number, z: number) => number;
  /** Sea level. */
  level: number;
  /** The sea square is -extent .. extent on x and z. */
  extent: number;
  res?: number;
  /** Unit direction the swell travels in; null or absent: from the open side (`autoSwellDirection`). */
  swellDir?: [number, number] | null;
}

/** Depth (level - ground) at the cell centres of the field's grid, row-major from (-extent, -extent). */
export function shoreDepthGrid(heightAt: (x: number, z: number) => number, level: number, extent: number, res: number): Float32Array {
  const out = new Float32Array(res * res);
  const h = (extent * 2) / res;
  for (let j = 0; j < res; j += 1)
    for (let i = 0; i < res; i += 1) out[j * res + i] = level - heightAt(-extent + (i + 0.5) * h, -extent + (j + 0.5) * h);
  return out;
}

let workerUrl: string | null = null;

function makeWorker(): Worker | null {
  if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') return null;
  try {
    if (!workerUrl) {
      const source = `const computeShoreField = ${computeShoreField.toString()};
self.onmessage = (event) => {
  const field = computeShoreField(event.data);
  self.postMessage(field, [field.data.buffer]);
};`;
      workerUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    }
    return new Worker(workerUrl);
  } catch {
    return null;
  }
}

/** Runs the solve in a worker when one can start, else on this thread after the current task. */
export function solveShoreField(input: ShoreFieldInput): Promise<ShoreField> {
  const worker = makeWorker();
  if (!worker) return new Promise((resolve) => setTimeout(() => resolve(computeShoreField(input)), 0));
  return new Promise((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<ShoreField>) => {
      worker.terminate();
      resolve(event.data);
    };
    worker.onerror = (event) => {
      worker.terminate();
      // a worker that fails (a strict content policy, an old browser) falls back to this thread
      event.preventDefault();
      try {
        resolve(computeShoreField(input));
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    };
    worker.postMessage(input);
  });
}

/** The place's shore field: its heights resampled over the sea square, the swell given or worked out, solved. */
export async function shoreFieldFromHeights(request: ShoreFieldRequest): Promise<ShoreField & { swellDir: [number, number] }> {
  const res = request.res ?? SHORE_FIELD_RES;
  const depth = shoreDepthGrid(request.heightAt, request.level, request.extent, res);
  const swellDir = request.swellDir ?? autoSwellDirection(depth, res);
  // the depth grid is copied to the worker (the caller may keep using it)
  const field = await solveShoreField({ depth, res, origin: -request.extent, size: request.extent * 2, swellDir });
  return { ...field, swellDir };
}
