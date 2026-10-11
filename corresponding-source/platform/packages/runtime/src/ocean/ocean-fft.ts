/*
 * Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC,
 * MIT (see ./LICENSE-tidewater.md). Source: src/ocean/OceanFFT.js (row and column kernels, L381-527).
 *
 * The multi-cascade FFT ocean (Tessendorf) as TSL compute on three.js WebGPURenderer. Two dispatches per frame for
 * all cascades, like Tidewater: rows (time evolution, packing of 8 real fields into 4 complex ones, a 256-point
 * radix-2 inverse FFT per row in workgroup memory), then columns (the same FFT, the sign fix, the Jacobian foam,
 * and the writes into two array textures, one layer per cascade).
 *
 * Where we differ (three.js, not their engine):
 * - h0 and the wave numbers are made on the CPU (`ocean-spectrum.ts`) and uploaded once, instead of their init,
 *   conjugate and copy kernels; same numbers, testable in node.
 * - Mipmaps come from three's own mip generation for storage textures (render passes after the store), not their
 *   two compute mip kernels (`mipA` / `mipB`). Measure first; port the kernels if it shows in the timings.
 * - The foam step uses our own frame dt uniform (their `frame.dt`).
 */
import {
  HalfFloatType,
  LinearFilter,
  LinearMipmapLinearFilter,
  type Node,
  RepeatWrapping,
  RGBAFormat,
  StorageArrayTexture,
  StorageBufferAttribute,
  TSL,
  type ComputeNode,
  type Texture,
  type WebGPURenderer,
} from 'three/webgpu';
import { DEFAULT_CASCADE_SIZES, FFT_SIZE, oceanSpectrum } from './ocean-spectrum.js';

const {
  Fn,
  clamp,
  cos,
  exp,
  float,
  localId,
  max,
  select,
  sin,
  storage,
  storageTexture,
  texture,
  uint,
  uniform,
  uvec2,
  vec2,
  vec3,
  vec4,
  workgroupArray,
  workgroupBarrier,
  workgroupId,
} = TSL;

const N = FFT_SIZE;
const HALF = N / 2;
const LOG2N = 8;

/* eslint-disable @typescript-eslint/no-explicit-any -- TSL's typings do not follow uint arithmetic and workgroup arrays */
type AnyNode = any;

/** Bit reversal of an 8-bit uint (`fftBitReverse8`). */
function bitReverse8(v: AnyNode): AnyNode {
  const a = v.bitAnd(uint(0x55)).shiftLeft(uint(1)).bitOr(v.shiftRight(uint(1)).bitAnd(uint(0x55))).toVar();
  const b = a.bitAnd(uint(0x33)).shiftLeft(uint(2)).bitOr(a.shiftRight(uint(2)).bitAnd(uint(0x33))).toVar();
  return b.bitAnd(uint(0x0f)).shiftLeft(uint(4)).bitOr(b.shiftRight(uint(4)).bitAnd(uint(0x0f))).toVar();
}

/** Two packed complex numbers (v.xy, v.zw) times one complex w (`fftCmul2`). */
function cmul2(v: AnyNode, w: AnyNode): AnyNode {
  return vec4(
    v.x.mul(w.x).sub(v.y.mul(w.y)),
    v.x.mul(w.y).add(v.y.mul(w.x)),
    v.z.mul(w.x).sub(v.w.mul(w.y)),
    v.z.mul(w.y).add(v.w.mul(w.x)),
  );
}

/** The 8 butterfly stages over the shared array (two vec4 per point), with a barrier after each. */
function butterflies(shared: AnyNode, t: AnyNode): void {
  for (let s = 0; s < LOG2N; s += 1) {
    const half = 1 << s;
    const pos = t.bitAnd(uint(half - 1)).toVar();
    const i = t
      .shiftRight(uint(s))
      .shiftLeft(uint(s + 1))
      .bitOr(pos)
      .toVar();
    const j = i.add(uint(half)).toVar();
    const ang = pos.toFloat().mul(Math.PI / half);
    const w = vec2(cos(ang), sin(ang)).toVar();
    const i2 = i.mul(uint(2)).toVar();
    const j2 = j.mul(uint(2)).toVar();
    const a0 = shared.element(i2).toVar();
    const a1 = shared.element(i2.add(uint(1))).toVar();
    const b0 = cmul2(shared.element(j2), w).toVar();
    const b1 = cmul2(shared.element(j2.add(uint(1))), w).toVar();
    shared.element(i2).assign(a0.add(b0));
    shared.element(i2.add(uint(1))).assign(a1.add(b1));
    shared.element(j2).assign(a0.sub(b0));
    shared.element(j2.add(uint(1))).assign(a1.sub(b1));
    workgroupBarrier();
  }
}

export interface OceanFFTOptions {
  /** Cascades to run (Tidewater: 4; High drops the 7.1 m one). */
  cascades?: number;
  sizes?: readonly number[];
  choppiness?: number;
  /** A ready spectrum (tests); by default Tidewater's sea from `oceanSpectrum`. */
  spectrum?: { h0: Float32Array; waves: Float32Array };
  /** Also copy the outputs into storage buffers that can be read back (the browser test only). */
  readback?: boolean;
}

function arrayTexture(cascades: number, label: string): StorageArrayTexture {
  const tex = new StorageArrayTexture(N, N, cascades);
  tex.name = label;
  tex.format = RGBAFormat;
  tex.type = HalfFloatType;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  return tex;
}

/** The FFT ocean: call `update` once per frame, sample `displacement` / `derivatives` in materials. */
export class OceanFFT {
  readonly cascades: number;
  readonly sizes: readonly number[];
  /** (lambda Dx, Dy, lambda Dz, foam) per cascade layer, mipmapped, repeat-wrapped. */
  readonly displacement: StorageArrayTexture;
  /** (dDy/dx, dDy/dz, lambda dDx/dx, lambda dDz/dz) per cascade layer. */
  readonly derivatives: StorageArrayTexture;
  /** Seconds of wave time (the room clock via `setTime`, plan task 3). */
  readonly time = uniform(0);
  readonly dt = uniform(0);
  readonly choppiness = uniform(0.9);
  /** Foam starts where a cascade compresses the surface below this Jacobian (`OceanFFT.js` L103-108). */
  readonly foamBias = uniform(0.58);
  readonly foamGain = uniform(3);
  readonly foamDecay = uniform(0.35);
  readonly foamAdd = uniform(2.5);
  /** Readback buffers (only with `readback`): N*N*C vec4 each. */
  readonly readbackDisplacement: StorageBufferAttribute | null = null;
  readonly readbackDerivatives: StorageBufferAttribute | null = null;

  readonly #buffers: StorageBufferAttribute[] = [];
  readonly #rows: ComputeNode;
  readonly #columns: ComputeNode;

  constructor(options: OceanFFTOptions = {}) {
    this.cascades = options.cascades ?? 4;
    this.sizes = (options.sizes ?? DEFAULT_CASCADE_SIZES).slice(0, this.cascades);
    this.choppiness.value = options.choppiness ?? 0.9;
    const C = this.cascades;
    const total = N * N * C;
    const spectrum = options.spectrum ?? oceanSpectrum({ sizes: this.sizes });

    const buffer = (data: Float32Array | number, itemSize: number) => {
      const attr = new StorageBufferAttribute(typeof data === 'number' ? new Float32Array(data * itemSize) : data, itemSize);
      this.#buffers.push(attr);
      return attr;
    };
    const h0Attr = buffer(spectrum.h0.slice(0, total * 4), 4);
    const wavesAttr = buffer(spectrum.waves.slice(0, total * 4), 4);
    const tmpAttr = buffer(total * 2, 4);
    const foamAttr = buffer(total, 1);
    const h0 = storage(h0Attr, 'vec4', total).toReadOnly();
    const waves = storage(wavesAttr, 'vec4', total).toReadOnly();
    const tmp = storage(tmpAttr, 'vec4', total * 2);
    const foam = storage(foamAttr, 'float', total);

    this.displacement = arrayTexture(C, 'oceanDisplacement');
    this.derivatives = arrayTexture(C, 'oceanDerivatives');

    let outDisp: AnyNode = null;
    let outDeriv: AnyNode = null;
    if (options.readback) {
      const d = buffer(total, 4);
      const v = buffer(total, 4);
      (this as { readbackDisplacement: StorageBufferAttribute }).readbackDisplacement = d;
      (this as { readbackDerivatives: StorageBufferAttribute }).readbackDerivatives = v;
      outDisp = storage(d, 'vec4', total);
      outDeriv = storage(v, 'vec4', total);
    }

    const time = this.time;
    const lambda: AnyNode = this.choppiness;

    // ---- row pass: h(k, t), 4 packed complex fields, IFFT per row (L408-462)
    const rows = Fn(() => {
      const shared: AnyNode = workgroupArray('vec4', N * 2);
      const t: AnyNode = (localId as AnyNode).x;
      const row: AnyNode = (workgroupId as AnyNode).x;
      const c: AnyNode = (workgroupId as AnyNode).y;
      const base = c.mul(uint(N * N)).add(row.mul(uint(N))).toVar();
      for (let e = 0; e < 2; e += 1) {
        const x = t.add(uint(e * HALF)).toVar();
        const idx = base.add(x).toVar();
        const w = waves.element(idx).toVar();
        const hv = h0.element(idx).toVar();
        const ph = w.w.mul(time).toVar();
        const cs = cos(ph).toVar();
        const sn = sin(ph).toVar();
        // h = h0 e^{i w t} + conj(h0(-k)) e^{-i w t}
        const hr = hv.x.mul(cs).sub(hv.y.mul(sn)).add(hv.z.mul(cs)).add(hv.w.mul(sn)).toVar();
        const hi = hv.x.mul(sn).add(hv.y.mul(cs)).sub(hv.z.mul(sn)).add(hv.w.mul(cs)).toVar();
        const kx = w.x;
        const kz = w.y;
        const ik = w.z;
        const fx = kx.mul(ik).toVar();
        const fz = kz.mul(ik).toVar();
        // c0 = Dx + i Dz
        const c0 = vec2(fx.mul(hi).add(fz.mul(hr)).negate(), fx.mul(hr).sub(fz.mul(hi)));
        // c1 = Dy + i dDx/dz, dDx/dz_hat = -kx kz / k h
        const q = kx.mul(kz).mul(ik).negate().toVar();
        const c1 = vec2(hr.sub(q.mul(hi)), hi.add(q.mul(hr)));
        // c2 = dDy/dx + i dDy/dz
        const c2 = vec2(kx.mul(hi).add(kz.mul(hr)).negate(), kx.mul(hr).sub(kz.mul(hi)));
        // c3 = dDx/dx + i dDz/dz
        const a = kx.mul(kx).mul(ik).negate().toVar();
        const b = kz.mul(kz).mul(ik).negate().toVar();
        const c3 = vec2(a.mul(hr).sub(b.mul(hi)), a.mul(hi).add(b.mul(hr)));
        const r = bitReverse8(x).mul(uint(2)).toVar();
        shared.element(r).assign(vec4(c0, c1));
        shared.element(r.add(uint(1))).assign(vec4(c2, c3));
      }
      workgroupBarrier();
      butterflies(shared, t);
      for (let e = 0; e < 2; e += 1) {
        const x = t.add(uint(e * HALF)).toVar();
        const o = base.add(x).mul(uint(2)).toVar();
        tmp.element(o).assign(shared.element(x.mul(uint(2))));
        tmp.element(o.add(uint(1))).assign(shared.element(x.mul(uint(2)).add(uint(1))));
      }
    })().computeKernel([HALF]);

    // ---- column pass: IFFT per column, sign fix, Jacobian foam, texture writes (L467-527)
    const dispStore: AnyNode = storageTexture(this.displacement);
    const derivStore: AnyNode = storageTexture(this.derivatives);
    const columns = Fn(() => {
      const shared: AnyNode = workgroupArray('vec4', N * 2);
      const t: AnyNode = (localId as AnyNode).x;
      const col: AnyNode = (workgroupId as AnyNode).x;
      const c: AnyNode = (workgroupId as AnyNode).y;
      const base = c.mul(uint(N * N)).toVar();
      for (let e = 0; e < 2; e += 1) {
        const y = t.add(uint(e * HALF)).toVar();
        const idx = base.add(y.mul(uint(N))).add(col).toVar();
        const r = bitReverse8(y).mul(uint(2)).toVar();
        shared.element(r).assign(tmp.element(idx.mul(uint(2))));
        shared.element(r.add(uint(1))).assign(tmp.element(idx.mul(uint(2)).add(uint(1))));
      }
      workgroupBarrier();
      butterflies(shared, t);
      for (let e = 0; e < 2; e += 1) {
        const y = t.add(uint(e * HALF)).toVar();
        const idx = base.add(y.mul(uint(N))).add(col).toVar();
        const sign = select(col.add(y).bitAnd(uint(1)).equal(uint(0)), float(1), float(-1)).toVar();
        const A = shared.element(y.mul(uint(2))).mul(sign).toVar();
        const B = shared.element(y.mul(uint(2)).add(uint(1))).mul(sign).toVar();
        // A = (Dx, Dz, Dy, dDx/dz), B = (dDy/dx, dDy/dz, dDx/dx, dDz/dz)
        const jxx = lambda.mul(B.z).add(1);
        const jzz = lambda.mul(B.w).add(1);
        const jxz = lambda.mul(A.w);
        const J = jxx.mul(jzz).sub(jxz.mul(jxz)).toVar();
        // persistent foam: made where the surface compresses (J < bias), then slowly decays
        const prev = foam.element(idx).toVar();
        const gen = clamp(this.foamBias.sub(J).mul(this.foamGain), 0, 1).toVar();
        const f = prev.mul(exp(this.foamDecay.negate().mul(this.dt))).add(gen.mul(this.foamAdd).mul(this.dt));
        const fNew = clamp(max(f, gen.mul(0.5)), 0, 1.5).toVar();
        foam.element(idx).assign(fNew);
        const vDisp = vec4(lambda.mul(A.x), A.z, lambda.mul(A.y), fNew).toVar();
        const vDeriv = vec4(B.x, B.y, lambda.mul(B.z), lambda.mul(B.w)).toVar();
        const uv = uvec2(col, y);
        dispStore.depth(c).store(uv, vDisp);
        derivStore.depth(c).store(uv, vDeriv);
        if (outDisp) {
          outDisp.element(idx).assign(vDisp);
          outDeriv.element(idx).assign(vDeriv);
        }
      }
    })().computeKernel([HALF]);

    this.#rows = rows;
    this.#columns = columns;
  }

  /** Advances the waves by `dt` seconds and runs the two passes. */
  update(renderer: WebGPURenderer, dt: number): void {
    this.time.value += dt;
    this.dt.value = dt;
    this.dispatch(renderer);
  }

  /**
   * Puts the waves at an absolute wave time (the room clock, `seaClock`) and runs the two passes. The foam decays
   * by the time since the last call (at most 0.1 s; one frame's worth when the clock wrapped).
   */
  setTime(renderer: WebGPURenderer, time: number): void {
    const step = time - this.time.value;
    this.dt.value = step >= 0 && step <= 0.1 ? step : step > 0.1 ? 0.1 : 1 / 60;
    this.time.value = time;
    this.dispatch(renderer);
  }

  /** Runs the two passes at the current `time` (no time step). */
  dispatch(renderer: WebGPURenderer): void {
    renderer.compute(this.#rows, [N, this.cascades, 1]);
    renderer.compute(this.#columns, [N, this.cascades, 1]);
  }

  /** The tile size of a cascade (m). */
  size(cascade: number): number {
    return this.sizes[cascade]!;
  }

  /**
   * Displacement of one cascade at world xz, at a mip level (`oceanSampleDisplacement` per layer). Returns
   * (lambda Dx, Dy, lambda Dz, foam).
   */
  sampleDisplacement(cascade: number, xz: Node<'vec2'>, level: Node<'float'> | number): Node<'vec4'> {
    return (texture(this.displacement as unknown as Texture, (xz as AnyNode).div(this.sizes[cascade]!)) as AnyNode)
      .depth(cascade)
      .level(level);
  }

  /** Derivatives of one cascade at world xz, with the hardware's own mip choice (fragment stage). */
  sampleDerivatives(cascade: number, xz: Node<'vec2'>, level?: Node<'float'> | number): Node<'vec4'> {
    const node = (texture(this.derivatives as unknown as Texture, (xz as AnyNode).div(this.sizes[cascade]!)) as AnyNode).depth(
      cascade,
    );
    return level === undefined ? node : node.level(level);
  }

  /** A TSL vec3 summing every cascade's displacement (with optional per-cascade weights). */
  displacementSum(xz: Node<'vec2'>, level: Node<'float'> | number = 0, weights?: ReadonlyArray<Node<'float'> | number>): Node<'vec3'> {
    let sum: AnyNode = vec3(0, 0, 0);
    for (let c = 0; c < this.cascades; c += 1) {
      let s: AnyNode = (this.sampleDisplacement(c, xz, level) as AnyNode).xyz;
      if (weights) s = s.mul(weights[c] ?? 0);
      sum = sum.add(s);
    }
    return sum;
  }

  dispose(): void {
    this.displacement.dispose();
    this.derivatives.dispose();
    this.#rows.dispose();
    this.#columns.dispose();
  }
}
