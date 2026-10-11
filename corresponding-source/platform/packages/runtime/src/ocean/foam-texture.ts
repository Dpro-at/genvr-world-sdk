/*
 * Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC,
 * MIT (see ./LICENSE-tidewater.md). Source: src/ocean/FoamTexture.js.
 *
 * Tileable procedural foam, made once on the GPU (TSL compute). Real sea foam is an irregular bubbly mat: dense
 * rafts with ragged edges, holes of every size, thin bubble streaks and fine bubbles. Thresholding this density
 * against the local foam coverage (water-surface.ts) makes foam grow, tear into lace and dissolve.
 *   R: foam density   G: fine bubbles   B: soft mottling   A: streaks
 * Mipmaps come from three's mip generation for storage textures (Tidewater: `generateMipmaps`).
 */
import {
  HalfFloatType,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  RGBAFormat,
  StorageTexture,
  TSL,
  type WebGPURenderer,
} from 'three/webgpu';

/* eslint-disable @typescript-eslint/no-explicit-any -- TSL's typings are too narrow for these node chains */
type AnyNode = any;

const { Fn, clamp, dot, float, floor, fract, globalId, length, min, mix, sin, smoothstep, textureStore, uvec2, vec2, vec4 } = TSL as AnyNode;


/** Texture side (Tidewater: 1024). */
export const FOAM_TEXTURE_SIZE = 1024;

const hash2 = Fn(([p]: [AnyNode]) =>
  fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))).mul(43758.5453)),
).setLayout({ name: 'foamHash2', type: 'vec2', inputs: [{ name: 'p', type: 'vec2' }] });

// GLSL-style mod: x - y floor(x / y)
const fmod2 = (x: AnyNode, y: AnyNode) => x.sub(y.mul(floor(x.div(y))));

/** Periodic Worley F1 with jittered cells. */
const worley = Fn(([uv, cells]: [AnyNode, AnyNode]) => {
  const p = uv.mul(cells);
  const ip = floor(p).toVar();
  const fp = fract(p).toVar();
  let f1: AnyNode = float(8);
  for (let j = -1; j <= 1; j += 1)
    for (let i = -1; i <= 1; i += 1) {
      const o = vec2(i, j);
      const h = (hash2 as AnyNode)(fmod2(ip.add(o), cells));
      f1 = min(f1, length(o.add(h).sub(fp)));
    }
  return f1;
}).setLayout({
  name: 'foamWorley',
  type: 'float',
  inputs: [
    { name: 'uv', type: 'vec2' },
    { name: 'cells', type: 'float' },
  ],
});

/** Periodic value noise. */
const vnoise = Fn(([uv, cells]: [AnyNode, AnyNode]) => {
  const p = uv.mul(cells);
  const i = floor(p).toVar();
  const f = fract(p).toVar();
  const u = f.mul(f).mul(float(3).sub(f.mul(2))).toVar();
  const h = hash2 as AnyNode;
  const a = h(fmod2(i, cells)).x;
  const b = h(fmod2(i.add(vec2(1, 0)), cells)).x;
  const c = h(fmod2(i.add(vec2(0, 1)), cells)).x;
  const d = h(fmod2(i.add(vec2(1, 1)), cells)).x;
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}).setLayout({
  name: 'foamNoise',
  type: 'float',
  inputs: [
    { name: 'uv', type: 'vec2' },
    { name: 'cells', type: 'float' },
  ],
});

/** fbm(uv, base, octaves) with constant octave weights, unrolled like Tidewater's. */
function fbm(uv: AnyNode, base: number, octaves: number): AnyNode {
  let sum: AnyNode = float(0);
  let a = 0.5;
  let n = 0;
  for (let o = 0; o < octaves; o += 1) {
    sum = sum.add((vnoise as AnyNode)(uv, float(base * Math.pow(2, o))).mul(a));
    n += a;
    a *= 0.5;
  }
  return sum.div(n);
}

/** Makes the foam pattern once; the caller owns (and disposes) the texture. */
export function createFoamTexture(renderer: WebGPURenderer, size = FOAM_TEXTURE_SIZE): StorageTexture {
  const tex = new StorageTexture(size, size);
  tex.name = 'foamPattern';
  tex.format = RGBAFormat;
  tex.type = HalfFloatType;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;

  const kernel = Fn(() => {
    const px: AnyNode = uvec2((globalId as AnyNode).x, (globalId as AnyNode).y);
    const uv = vec2(px).add(0.5).div(size).toVar();
    // domain warp (organic, flowing shapes)
    const w1 = vec2(fbm(uv, 3, 4), fbm(uv.add(0.43), 3, 4)).sub(0.5).mul(0.14).toVar();
    const wuv = uv.add(w1).toVar();
    // density: ragged rafts
    const dens = fbm(wuv, 4, 6);
    const W = worley as AnyNode;
    // holes of many sizes punched through the mat
    const holeA = smoothstep(0.28, 0.12, W(wuv, float(7)).add(fbm(uv, 16, 3).sub(0.5).mul(0.25)));
    const holeB = smoothstep(0.3, 0.16, W(wuv.add(0.17), float(19)).add(fbm(uv, 32, 2).sub(0.5).mul(0.3)));
    const holeC = smoothstep(0.32, 0.18, W(wuv.add(0.61), float(47)));
    const holes = clamp(holeA.mul(0.9).add(holeB.mul(0.7)).add(holeC.mul(0.45)), 0, 1);
    // fine bubbles: small bright dots
    const bub = smoothstep(0.24, 0.08, W(uv.add(0.33), float(140)))
      .mul(0.8)
      .add(smoothstep(0.2, 0.05, W(uv.add(0.71), float(260))).mul(0.5))
      .toVar();
    // streaks (drawn out by flow)
    const streak = fbm(uv.add(w1.mul(2)), 12, 4);
    const foam = clamp(dens.mul(1.35).sub(holes.mul(0.55)).add(bub.mul(0.08)), 0, 1);
    const mottle = fbm(uv, 2, 3);
    textureStore(tex, px, vec4(foam, clamp(bub, 0, 1), mottle, streak));
  })().computeKernel([8, 8, 1]);

  renderer.compute(kernel, [size / 8, size / 8, 1]);
  return tex;
}
