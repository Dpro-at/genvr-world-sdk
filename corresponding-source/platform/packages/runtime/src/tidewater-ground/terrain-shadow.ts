/** Tidewater4811ba48 TerrainGPU.js MIT: exact portable terrain sunlight shadow field. */
import {
  DataTexture,
  StorageTexture,
  RedFormat,
  HalfFloatType,
  LinearFilter,
  LinearMipmapLinearFilter,
  Vector2,
  Vector3,
  TSL,
  type WebGPURenderer,
} from 'three/webgpu';
import { buildShadowHeights } from './terrain-shadow-bake.js';
/* eslint-disable @typescript-eslint/no-explicit-any -- TSL resource graphs */
type N = any;
export interface TerrainShadowDomain {
  origin: Vector2;
  size: number;
  res: number;
  heightAt: (x: number, z: number) => number;
}
export class TerrainSunShadow {
  readonly heights: DataTexture;
  readonly texture = new StorageTexture(512, 512);
  readonly ready = TSL.uniform(0).setGroup(TSL.renderGroup);
  readonly #sun = TSL.uniform(new Vector3(0, 1, 0)).setGroup(TSL.renderGroup);
  readonly #origin: N;
  readonly #size: N;
  readonly #texel: N;
  readonly #kernel: N;
  #dirty = true;
  #disposed = false;
  #last = new Vector3(Infinity, Infinity, Infinity);
  #notBefore = 0;
  #pending: Float32Array | null = null;
  #row = 0;
  /** Editor height queries are sampled in bounded slices; invalidations coalesce for150ms. */
  readonly sampleBudgetMs = 4;
  constructor(readonly domain: TerrainShadowDomain) {
    if (domain.res < 4 || (domain.res & (domain.res - 1)) !== 0)
      throw new Error('Terrain shadow height resolution must be a power of two >=4');
    const t = TSL as N;
    this.heights = new DataTexture(
      new Uint16Array((domain.res / 4) ** 2),
      domain.res / 4,
      domain.res / 4,
      RedFormat,
      HalfFloatType,
    );
    this.heights.minFilter = LinearMipmapLinearFilter;
    this.heights.magFilter = LinearFilter;
    this.heights.generateMipmaps = false;
    this.texture.type = HalfFloatType;
    this.texture.minFilter = this.texture.magFilter = LinearFilter;
    this.#origin = t.uniform(domain.origin.clone()).setGroup(TSL.renderGroup);
    this.#size = t.uniform(domain.size).setGroup(TSL.renderGroup);
    this.#texel = t.uniform((domain.size / domain.res) * 4).setGroup(TSL.renderGroup);
    this.#kernel = t
      .Fn(() => {
        const ij = t.vec2(t.globalId.xy);
        const xz = ij.add(0.5).div(512).mul(this.#size).add(this.#origin);
        const lxz = t.max(t.length(this.#sun.xz), 1e-4),
          dir = this.#sun.xz.div(lxz),
          tanEl = this.#sun.y.div(lxz);
        const top = t.float(-1e4).toVar(),
          occ = t.float(0).toVar(),
          distance = t.float(24).toVar(),
          step = t.float(6).toVar();
        t.Loop(24, () => {
          const q = xz.add(dir.mul(distance)),
            uv = q.sub(this.#origin).div(this.#size);
          const h = t.texture(this.heights, uv).level(t.log2(t.max(step.div(this.#texel), 1))).r;
          const v = h.sub(distance.mul(tanEl));
          t.If(v.greaterThan(top), () => {
            top.assign(v);
            occ.assign(distance);
          });
          step.mulAssign(1.22);
          distance.addAssign(step);
        });
        t.textureStore(this.texture, t.ivec2(t.globalId.xy), t.vec4(top, occ, 0, 1));
      })()
      .compute([64, 64], [8, 8, 1]);
  }
  invalidate(): void {
    if (!this.#disposed) {
      this.#dirty = true;
      this.#pending = null;
      this.#row = 0;
      this.#notBefore = performance.now() + 150;
    }
  }
  update(renderer: WebGPURenderer, direction: Vector3, force = false): boolean {
    if (this.#disposed) return false;
    if (!force && !this.#dirty && this.ready.value && this.#last.angleTo(direction) < 0.0015) return false;
    if (this.#dirty) {
      if (!force && performance.now() < this.#notBefore) return false;
      const d = this.domain,
        texel = d.size / d.res;
      this.#pending ??= new Float32Array(d.res * d.res);
      const began = performance.now();
      for (; this.#row < d.res;) {
        const z = this.#row++;
        for (let x = 0; x < d.res; x++)
          this.#pending[z * d.res + x] = d.heightAt(
            d.origin.x + (x + 0.5) * texel,
            d.origin.y + (z + 0.5) * texel,
          );
        if (!force && performance.now() - began >= this.sampleBudgetMs && this.#row < d.res) return false;
      }
      const levels = buildShadowHeights({ res: d.res, heights: this.#pending, texel }).levels;
      this.heights.dispose();
      this.heights.image.data = levels[0]!.data;
      this.heights.mipmaps = levels;
      this.heights.needsUpdate = true;
      this.#pending = null;
      this.#row = 0;
    }
    this.#sun.value.copy(direction);
    renderer.compute(this.#kernel);
    this.#last.copy(direction);
    this.ready.value = 1;
    this.#dirty = false;
    return true;
  }
  /** Source exact four-load bilinear with N-1.001 edge clamp, for any world-space receiver. */
  visibilityNode(position: N): N {
    const t = TSL as N;
    return t.Fn(() => {
      const st = t.clamp(
        position.xz.sub(this.#origin).div(this.#size).mul(512).sub(0.5),
        t.vec2(0),
        t.vec2(512 - 1.001),
      );
      const i = t.ivec2(t.floor(st)),
        f = t.fract(st);
      const s = t.mix(
        t.mix(t.textureLoad(this.texture, i, 0), t.textureLoad(this.texture, i.add(t.ivec2(1, 0)), 0), f.x),
        t.mix(
          t.textureLoad(this.texture, i.add(t.ivec2(0, 1)), 0),
          t.textureLoad(this.texture, i.add(t.ivec2(1, 1)), 0),
          f.x,
        ),
        f.y,
      );
      const w = s.y.mul(0.012).add(0.35);
      return t.mix(1, t.smoothstep(w.negate(), w, position.y.sub(s.x)), this.ready);
    })();
  }
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#pending = null;
    this.ready.value = 0;
    this.#kernel.dispose();
    this.texture.dispose();
    this.heights.dispose();
  }
}
