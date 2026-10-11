import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import * as G from '../src/tidewater-grass/index.js';

// Executes the ORIGINAL pinned Tidewater grass sources (read only, tooling/other-programs) against the
// installed three.js, one module at a time with its imports injected, and compares the port bit-exact.
// The source engine's GPU pieces (Texture, Material, ShaderModule) are the port's recorder stand-ins on
// both sides; the WGSL they carry is compared as text, never run.
type Mod = Record<string, unknown>;
type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any -- the source modules are untyped JS
const root = new URL('../../../../tooling/other-programs/tidewater/src/', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8').replace(/\r\n/g, '\n');
function load(path: string, pool: Mod, extra: string[] = []): Mod {
  const src = read(path);
  const deps: string[] = [];
  for (const m of src.matchAll(/^import\s*\{([^}]*)\}\s*from/gm)) deps.push(...m[1]!.split(',').map(s => s.trim()).filter(Boolean));
  for (const m of src.matchAll(/^import\s*\*\s*as\s+(\w+)\s+from/gm)) deps.push(m[1]!);
  for (const d of deps) if (!(d in pool)) throw new Error(`${path}: no ${d}`);
  const names = [...src.matchAll(/^export\s+(?:const|function|class)\s+(\w+)/gm)].map(m => m[1]!).concat(extra);
  const body = src.replace(/^import[\s\S]*?;\n/gm, '').replace(/^export /gm, '');
  return new Function(...deps, `${body}\n;return {${names.join(',')}};`)(...deps.map(d => pool[d])) as Mod;
}
// `f`, `_lin` and `C` of VegNodes.js (that module needs the source engine): bounded slices of the source text
function vegFormatters(): { f: (x: number) => string; C: (hex: number) => string } {
  const src = read('world/vegetation/VegNodes.js');
  const slice = (start: string, end: string) => {
    const a = src.indexOf(start);
    expect(a).toBeGreaterThanOrEqual(0);
    const b = src.indexOf(end, a + start.length);
    expect(b).toBeGreaterThan(a);
    return src.slice(a, b + end.length);
  };
  const code = [slice('export const f = ( x ) => {', '\n};'), slice('const _lin = ( c ) =>', ';\n'),
    slice('export const C = ( hex ) => {', '\n};')].join('\n').replace(/^export /gm, '');
  return new Function(`${code}\nreturn { f, C };`)() as { f: (x: number) => string; C: (hex: number) => string };
}
// the same recorder stand-ins on both sides (a constructor returning an object hands that object to `new`)
function TextureStub(this: unknown, o: G.GrassTextureOptions) { return G.recordGrassTexture(o); }
function MaterialStub(this: unknown, o: G.GrassMaterialOptions) { return G.standInGrassMaterial(o); }
function ShaderModuleStub(this: unknown, o: Mod) { return { ...o }; }

// a 32 x 32 stand-in for the source's detail texture (DetailTextures.js needs the engine)
function detailTexture() {
  const S = 32, data = new Uint8Array(S * S * 4), rand = G.mulberry32(99);
  for (let i = 0; i < data.length; i++) data[i] = Math.floor(rand() * 256);
  return { image: { width: S, data } };
}

function loadOriginal() {
  const pool: Mod = { THREE, Texture: TextureStub, ShaderModule: ShaderModuleStub, Material: MaterialStub,
    vegModule: G.VEG_MODULE_REF, uCamPos: {}, getDetailTexture: detailTexture, ...vegFormatters() };
  Object.assign(pool, load('util/Noise.js', pool));
  Object.assign(pool, load('world/WorldLayout.js', pool));
  Object.assign(pool, load('world/vegetation/Scatter.js', pool));
  Object.assign(pool, load('world/vegetation/GrassField.js', pool, ['MAX_NEAR', 'MAX_MID', 'MAX_FAR', 'CLUMPS', 'BLADES',
    'BLADE_TIER', 'TIER_N', 'OATS', 'VINES', 'KIND', 'MEADOW', 'blueNoise', 'PatchBuilder', 'clumpParams', 'buildPatch',
    'createGrassMaterial']));
  return pool as Record<string, Any>;
}
const O = loadOriginal();

// exact bytes of numbers as doubles (float32 data converts losslessly; -0 kept)
const bits = (array: ArrayLike<number>) => new Uint32Array(Float64Array.from(array).buffer);
// fast exact compare of long numeric lists; reports the first difference
const same = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  if (a.length !== b.length) return `length ${a.length} vs ${b.length}`;
  const x = bits(a), y = bits(b);
  let i = 0;
  while (i < x.length && x[i] === y[i]) i++;
  return i === x.length ? 'same' : `item ${i >> 1}: ${a[i >> 1]} vs ${b[i >> 1]}`;
};
const f64 = (array: ArrayLike<number>) => Array.from(array, (x) => Object.is(x, -0) ? '-0' : x);
// exact deep compare: numbers through Object.is (-0 kept), typed arrays as lists
const plain = (v: unknown): unknown => {
  if (typeof v === 'number') return Object.is(v, -0) ? '-0' : v;
  if (ArrayBuffer.isView(v)) return f64(v as unknown as ArrayLike<number>);
  if (typeof v === 'function') return 'fn';
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  return v;
};
function expectSameGeometry(a: THREE.BufferGeometry, b: THREE.BufferGeometry, label: string) {
  expect(Object.keys(a.attributes), label).toEqual(Object.keys(b.attributes));
  for (const k of Object.keys(b.attributes)) {
    const x = a.getAttribute(k) as THREE.BufferAttribute, y = b.getAttribute(k) as THREE.BufferAttribute;
    expect([x.itemSize, x.count, x.array.constructor.name, (x as Any).isInstancedBufferAttribute ?? false, x.usage], `${label} ${k}`)
      .toEqual([y.itemSize, y.count, y.array.constructor.name, (y as Any).isInstancedBufferAttribute ?? false, y.usage]);
    expect(same(x.array, y.array), `${label} ${k}`).toBe('same');
  }
  expect(a.index?.array.constructor.name, label).toBe(b.index?.array.constructor.name);
  expect(same(a.index?.array ?? [], b.index?.array ?? []), `${label} index`).toBe('same');
  expect([(a as Any).instanceCount, plain(a.boundingSphere?.center.toArray()), a.boundingSphere?.radius, plain(a.boundingBox?.min.toArray()),
    plain(a.boundingBox?.max.toArray())], label).toEqual([(b as Any).instanceCount, plain(b.boundingSphere?.center.toArray()),
    b.boundingSphere?.radius, plain(b.boundingBox?.min.toArray()), plain(b.boundingBox?.max.toArray())]);
}
const expectSameBuilder = (a: Any, b: Any, label: string) => {
  for (const k of ['pos', 'nor', 'side', 'slot', 'bladeData', 'idx']) expect(same(a[k], b[k]), `${label} ${k}`).toBe('same');
  expect([a.count, a.triangles], label).toEqual([b.count, b.triangles]);
};

// ------------------------------------------------------------------ deterministic test grounds

const SEEDS = [1, 7, 42];
/** A beach island strip: the bay of the source (|x - 10| < 235, -245 < z < -30) rises from the sea inland. */
function testTerrain(seed: number, res = 160, texel = 4, origin = -300) {
  const size = res * texel;
  const heightAt = (x: number, z: number) => {
    const inland = Math.max(0, -z - 24);
    return 0.4 + inland * 0.032 + Math.sin(x * 0.031 + seed) * 0.6 + Math.sin(z * 0.07 + x * 0.013 * seed) * 0.35
      + (x > 120 ? (x - 120) * 0.09 : 0);
  };
  const grid = (fn: (x: number, z: number) => number, T: ArrayConstructor | Uint8ArrayConstructor | Float32ArrayConstructor) => {
    const a = new (T as Uint8ArrayConstructor)(res * res);
    for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) a[j * res + i] = fn(origin + (i + 0.5) * texel, origin + (j + 0.5) * texel);
    return a;
  };
  const rand = G.mulberry32(seed * 13 + 5);
  const blobs = Array.from({ length: 6 }, () => [rand() * 400 - 200, rand() * -260, 6 + rand() * 14] as const);
  const heights = new Float32Array(res * res);
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) heights[j * res + i] = heightAt(origin + i * texel, origin + j * texel);
  return {
    res, texel, origin, size, heights, heightAt,
    normalAt(x: number, z: number, out: THREE.Vector3) {
      return out.set(heightAt(x - 1, z) - heightAt(x + 1, z), 2, heightAt(x, z - 1) - heightAt(x, z + 1)).normalize();
    },
    rock: grid((x, z) => blobs.some(([bx, bz, r]) => Math.hypot(x - bx, z - bz) < r * 0.5) ? 0.8 : 0.05, Float32Array),
    gully: grid((x, z) => (Math.sin(x * 0.05) * Math.cos(z * 0.04) > 0.8 ? 200 : 0), Uint8Array),
    sand: grid((x, z) => z > -150 ? 255 : Math.max(0, 255 + (z + 150) * 4), Uint8Array),
    path: grid((x, z) => (Math.abs(x - 30 - z * 0.2) < 3 ? 255 : 0), Uint8Array),
    // an embankment face along z = -95 for x in [-80, 60] (0.55 toe .. 1 lip), only in some seeds
    scarp: seed === 7 ? null : grid((x, z) => (x > -80 && x < 60 && Math.abs(z + 95) < 3 ? Math.round(140 + (3 - (z + 95)) * 19) : 0), Uint8Array),
  };
}
function originalSite(seed: number) {
  const footprints = seed === 42 ? [{ x: 40, z: -118, r: 10 }, { x: 0, z: -75, r: 3 }] : [];
  return new O.VegSite(testTerrain(seed), { seed: 1234 + seed, footprints, paths: seed === 1 ? null : [] });
}
const maskOf = (seed: number) => G.buildGrassMask(originalSite(seed));

const camera = (pos: [number, number, number], look: [number, number, number], fov = 60) => {
  const c = new THREE.PerspectiveCamera(fov, 16 / 9, 0.1, 2000);
  c.position.set(...pos);
  c.lookAt(...look);
  c.updateMatrixWorld(true);
  return c;
};

// ------------------------------------------------------------------ tests

describe('Tidewater grass: source helpers', () => {
  it('mulberry32, Noise2D, smoothstep, clamp match util/Noise.js', () => {
    for (const s of [0, 1, 7, 1234, 2 ** 31 + 5]) {
      const a = G.mulberry32(s), b = O.mulberry32(s);
      expect(bits(Array.from({ length: 300 }, () => a()))).toEqual(bits(Array.from({ length: 300 }, () => b())));
      const na = new G.Noise2D(s), nb = new O.Noise2D(s);
      expect(Array.from(na.perm)).toEqual(Array.from(nb.perm));
      expect(bits(na.grad)).toEqual(bits(nb.grad));
      const pts = Array.from({ length: 400 }, (_, i) => [Math.sin(i * 1.7) * 900, Math.cos(i * 0.37) * 300 - i] as const);
      expect(f64(pts.map(([x, y]) => na.noise(x, y)))).toEqual(f64(pts.map(([x, y]) => nb.noise(x, y))));
    }
    const xs = [-2, -0.5, 0, 0.1, 0.35, 0.5, 0.9, 1, 3];
    expect(f64(xs.map(x => G.smoothstep(0.1, 0.9, x)))).toEqual(f64(xs.map(x => O.smoothstep(0.1, 0.9, x))));
    expect(f64(xs.map(x => G.smoothstep(0.9, 0.1, x)))).toEqual(f64(xs.map(x => O.smoothstep(0.9, 0.1, x))));
    expect(f64(xs.map(x => G.clamp(x, 0, 1)))).toEqual(f64(xs.map(x => O.clamp(x, 0, 1))));
  });

  it('keeps the source constants', () => {
    expect([G.CELL, G.R_NEAR, G.R_MID, G.R_FAR, G.FADE_T2, G.FADE_T1, G.FADE_T0]).toEqual([O.CELL, O.R_NEAR, O.R_MID, O.R_FAR,
      O.FADE_T2, O.FADE_T1, O.FADE_T0]);
    expect([G.MAX_NEAR, G.MAX_MID, G.MAX_FAR, G.CLUMPS, G.BLADES, G.BLADE_TIER, G.TIER_N, G.OATS, G.VINES, G.KIND])
      .toEqual([O.MAX_NEAR, O.MAX_MID, O.MAX_FAR, O.CLUMPS, O.BLADES, O.BLADE_TIER, O.TIER_N, O.OATS, O.VINES, O.KIND]);
    expect([8, 18, 46, 88, 384, 7, 12, 28]).toEqual([G.CELL, G.R_NEAR, G.R_MID, G.R_FAR, G.CLUMPS, G.BLADES, G.OATS, G.VINES]);
    expect(G.GRASS_MASK_TEXEL).toBe(O.GRASS_MASK_TEXEL);
    expect(G.GRASS_MASK_RULES).toEqual({ villageRadius: O.RULES.villageRadius, spawnClear: O.RULES.spawnClear,
      obstacleClear: O.RULES.obstacleClear });
  });
});

describe('Tidewater grass: clumps and patches', () => {
  it('blue-noise slots are deterministic and bit-exact (clumps, oats, creepers)', () => {
    for (const seed of [1, 8, 9, 10, 43]) for (const [n, size, k] of [[384, 8, 10], [12, 8, 10], [28, 8, 10], [50, 3.5, 4]] as const) {
      const a = G.blueNoise(G.mulberry32(seed), n, size, k), b = O.blueNoise(O.mulberry32(seed), n, size, k);
      expect(a.length).toBe(n);
      expect(bits(a.flat())).toEqual(bits(b.flat()));
      expect(bits(G.blueNoise(G.mulberry32(seed), n, size, k).flat())).toEqual(bits(a.flat()));
    }
    // well spread: no two of the 384 clump slots closer than 10 cm on the 8 m torus
    const pts = G.blueNoise(G.mulberry32(8), 384, 8);
    let dmin = Infinity;
    for (let i = 0; i < pts.length; i++) for (let j = 0; j < i; j++) {
      let dx = Math.abs(pts[i]![0] - pts[j]![0]), dz = Math.abs(pts[i]![1] - pts[j]![1]);
      dx = Math.min(dx, 8 - dx); dz = Math.min(dz, 8 - dz);
      dmin = Math.min(dmin, Math.hypot(dx, dz));
    }
    expect(dmin).toBeGreaterThan(0.1);
  });

  it('clump and blade parameters are bit-exact for several seeds', () => {
    for (const seed of [7, 1, 42]) {
      const a = G.clumpParams(seed), b = O.clumpParams(seed);
      expect(a.length).toBe(384);
      expect(plain(a)).toEqual(plain(b));
      expect(a.every(c => c.blades.map(x => x.tier).join() === '0,0,1,1,2,2,2')).toBe(true);
    }
  });

  it('near, mid and far patches are bit-exact (builder data and built geometry)', () => {
    for (const [cs, ps] of [[7, 7], [1, 3], [42, 11]] as const) {
      const ca = G.clumpParams(cs), cb = O.clumpParams(cs);
      for (const level of [0, 1, 2] as const) {
        const a = G.buildPatch(level, ca, ps), b = O.buildPatch(level, cb, ps);
        expectSameBuilder(a, b, `seed ${cs}/${ps} level ${level}`);
        expectSameGeometry(a.build(), b.build(), `seed ${cs}/${ps} level ${level}`);
      }
    }
  });

  it('levels share clumps: every far blade vertex is a vertex of the same blade at mid and near rows', () => {
    const clumps = G.clumpParams(7);
    const near = G.buildPatch(0, clumps), mid = G.buildPatch(1, clumps), far = G.buildPatch(2, clumps);
    // source sizes (seed 7): grass only on far, oats on mid, oats + creeper on near
    expect([near.count, mid.count, far.count, near.triangles, mid.triangles, far.triangles])
      .toEqual([O.buildPatch(0, O.clumpParams(7)).count, O.buildPatch(1, O.clumpParams(7)).count, O.buildPatch(2, O.clumpParams(7)).count,
        O.buildPatch(0, O.clumpParams(7)).triangles, O.buildPatch(1, O.clumpParams(7)).triangles, O.buildPatch(2, O.clumpParams(7)).triangles]);
    expect(far.triangles).toBe(384 * 2); // tier 0 only, one triangle per blade
    // the first far blade's tip equals the first near blade's tip (rows end at h = 1)
    expect(far.pos.slice(6, 9)).toEqual(near.pos.slice(18, 21));
    expect(far.pos.slice(6, 9)).toEqual(mid.pos.slice(12, 15));
  });
});

describe('Tidewater grass: density mask', () => {
  it('buildGrassMask is bit-exact against Scatter.js on the source VegSite over several seeds', () => {
    for (const seed of SEEDS) {
      const site = originalSite(seed);
      const a = G.buildGrassMask(site), b = O.buildGrassMask(site);
      expect(a.res).toBe(b.res);
      expect(Buffer.from(a.data).equals(Buffer.from(b.data)), `seed ${seed}`).toBe(true);
      // all four channels are exercised
      for (let ch = 0; ch < 4; ch++) {
        let n = 0;
        for (let k = ch; k < a.data.length; k += 4) if (a.data[k]! > 8) n++;
        expect(n, `seed ${seed} channel ${ch}`).toBeGreaterThan(20);
      }
    }
  });

  it('channels from soils: dune on dry bay sand above ~2.15 m, meadow ss(2.5, 4.5, h) minus forest and sand', () => {
    const flat = (h: number, o: Partial<G.SoilGrassInputs> = {}) => G.buildGrassMask(G.soilGrassSite({
      size: 128, origin: -128, heightAt: () => h, sand: () => 0, forest: () => 0, ...o,
    }));
    const stats = (m: G.GrassMaskResult) => {
      const max = [0, 0, 0, 0], sum = [0, 0, 0, 0];
      for (let k = 0; k < m.data.length; k++) { max[k & 3] = Math.max(max[k & 3]!, m.data[k]!); sum[k & 3]! += m.data[k]!; }
      return { max, sum };
    };
    // wet / low beach: nothing below 1.7 m
    expect(stats(flat(1.5, { sand: () => 1 })).max).toEqual([0, 0, 0, 0]);
    // dry sand at 1.8 m: in front of the 2.15 m edge (only lobes reach it), creeper reaches furthest seaward
    const low = stats(flat(1.8, { sand: () => 1 }));
    // dry sand at 3 m behind the edge: dune grass, no meadow on sand
    const dune = stats(flat(3, { sand: () => 1 }));
    expect(dune.max[0]).toBeGreaterThan(200);
    expect(dune.max[1]).toBe(0);
    expect(dune.sum[0]).toBeGreaterThan(low.sum[0]! * 3);
    expect(low.sum[3]).toBeGreaterThan(0);
    // not in the bay: no dune, oats or creeper at all
    const inland = stats(flat(5, { inBay: () => false }));
    expect([inland.max[0], inland.max[2], inland.max[3]]).toEqual([0, 0, 0]);
    // meadow rises with smoothstep(2.5, 4.5, h) and is gone under forest
    const g = (h: number, forest = 0) => stats(flat(h, { inBay: () => false, forest: () => forest })).sum[1]!;
    expect(g(2.4)).toBe(0);
    expect(g(3) > 0 && g(3) < g(3.5) && g(3.5) < g(4.5)).toBe(true);
    expect(g(4.5)).toBe(g(6));
    expect(g(6, 0.9)).toBe(0);
    expect(g(6, 0.6)).toBeLessThan(g(6));
    // rows outside the source island band (-950 .. 0) stay empty; the band is an option
    const half = flat(5, { inBay: () => false, origin: -64 });
    const res = half.res;
    for (let j = 1; j < res - 1; j++) {
      const z = -64 + (j + 0.5) * (128 / res);
      let row = 0;
      for (let i = 0; i < res; i++) row += half.data[(j * res + i) * 4 + 1]!;
      expect(row > 0, `row z ${z}`).toBe(z <= 0);
    }
    const wide = G.buildGrassMask(G.soilGrassSite({ size: 128, origin: -64, heightAt: () => 5, sand: () => 0, forest: () => 0,
      inBay: () => false }), { zMax: 100 });
    expect(stats(wide).sum[1]).toBeGreaterThan(stats(half).sum[1]!);
  });
});

describe('Tidewater grass: field cells, levels and update', () => {
  const terrainOf = (seed: number) => {
    const t = testTerrain(seed);
    return { res: t.res, size: t.size, texel: t.texel, origin: t.origin, heights: t.heights };
  };

  it('cell occupancy, height ranges, textures, meshes and material options are bit-exact', () => {
    for (const seed of SEEDS) {
      const terrain = terrainOf(seed), mask = maskOf(seed);
      const a = new G.GrassField({ terrain, mask }), b = new O.GrassField({ terrain, mask });
      expect(a.cellsPerSide).toBe(b.cellsPerSide);
      expect(Array.from(a.cellFlags)).toEqual(Array.from(b.cellFlags));
      expect(bits(a.cellMinY)).toEqual(bits(b.cellMinY));
      expect(bits(a.cellMaxY)).toEqual(bits(b.cellMaxY));
      expect(a.cellFlags.reduce((s, x) => s + x, 0)).toBeGreaterThan(100);
      expect(a.cellFlags.reduce((s, x) => s + x, 0)).toBeLessThan(a.cellFlags.length);
      expect(a.patchTris).toEqual(b.patchTris);
      expect([a.nearTris, a.farTris]).toEqual([b.nearTris, b.farTris]);
      for (let k = 0; k < 3; k++) {
        const x = a.levels[k]!, y = b.levels[k];
        expectSameGeometry(x.geometry, y.geometry, `seed ${seed} level ${k}`);
        expect([x.mesh.name, x.mesh.frustumCulled, x.mesh.castShadow, x.mesh.receiveShadow, x.mesh.matrixAutoUpdate, x.max, x.count])
          .toEqual([y.mesh.name, y.mesh.frustumCulled, y.mesh.castShadow, y.mesh.receiveShadow, y.mesh.matrixAutoUpdate, y.max, y.count]);
      }
      // textures: options, then the three-style needsUpdate re-upload of the heights
      for (const k of ['heightTex', 'maskTex'] as const) expect((a[k] as G.RecordedGrassTexture).options).toEqual(b[k].options);
      a.heightTex.needsUpdate = true; b.heightTex.needsUpdate = true;
      a.heightTex.needsUpdate = false; b.heightTex.needsUpdate = false;
      expect((a.heightTex as G.RecordedGrassTexture).uploads).toEqual(b.heightTex.uploads);
      expect((a.heightTex as G.RecordedGrassTexture).uploads[0]).toBe(terrain.heights);
      // material: the source options (WGSL text with the terrain constants) through the same stand-in
      const ma = a.material.userData.wgsl as G.GrassMaterialOptions, mb = b.material.userData.wgsl as G.GrassMaterialOptions;
      expect(ma.vertex).toBe(mb.vertex);
      expect(ma.surface).toBe(mb.surface);
      expect([ma.name, ma.side, ma.roughness, ma.metalness, ma.attributes, ma.varyings])
        .toEqual([mb.name, mb.side, mb.roughness, mb.metalness, mb.attributes, mb.varyings]);
      expect(ma.modules.map(m => [m.name, m.code])).toEqual(mb.modules.map(m => [m.name, m.code]));
      expect([ma.textures.grassHeights, ma.textures.grassMask]).toEqual([a.heightTex, a.maskTex]);
      expect(ma.vertex).toContain(`( xz - ${G.f(terrain.origin)} ) / ${G.f(terrain.size)}`);
      expect(a.material).toBeInstanceOf(THREE.MeshStandardMaterial);
      expect(a.levels.every(l => l.mesh.material === a.material)).toBe(true);
    }
  });

  it('grass WGSL module and the f / C formatters are verbatim', () => {
    expect(G.grassModule.name).toBe(O.grassModule.name);
    expect(G.grassModule.code).toBe(O.grassModule.code);
    expect(G.grassModule.deps).toEqual(O.grassModule.deps);
    expect(G.MEADOW).toEqual(O.MEADOW);
    const { f, C } = vegFormatters();
    for (const x of [0, 1, -128, 2.5, 1 / 6.5, 1e-7, 1e21, -0.25]) expect(G.f(x)).toBe(f(x));
    for (const hex of [0x000000, 0xffffff, 0x5d6232, 0xb8479c, 0x0a0b0c]) expect(G.C(hex)).toBe(C(hex));
    // the first function of the module is the meadow tone, the tier fade follows (entry order matters for wgslFn)
    expect(G.grassModule.code.indexOf('fn vegMeadowTone(')).toBeLessThan(G.grassModule.code.indexOf('fn vegGrassTierFade('));
  });

  it('update(camera): skip rule, frustum culling, level assignment and instance data are bit-exact', () => {
    for (const seed of SEEDS) {
      const terrain = terrainOf(seed), mask = maskOf(seed);
      const a = new G.GrassField({ terrain, mask }), b = new O.GrassField({ terrain, mask });
      const shots: THREE.PerspectiveCamera[] = [
        camera([20, 12, -90], [40, 2, -140]),
        camera([20, 12, -90], [40, 2, -140]), // unchanged: skipped
        camera([20.03, 12, -90.02], [40.03, 2, -140.02]), // < 5 cm: skipped
        camera([-60, 4, -60], [-10, 3, -160]),
        camera([0, 140, -100], [0.1, 0, -100.1], 120), // high, looking down, wide
        camera([150, 6, -200], [100, 6, -150]),
        camera([10, 3, 200], [10, 3, 300]), // looking away from the island
        camera([-250, 20, -280], [0, 0, 0], 90),
      ];
      let changed = 0, drawn = 0;
      for (const [i, cam] of shots.entries()) {
        const ra = a.update(cam), rb = b.update(cam);
        expect(ra, `seed ${seed} shot ${i}`).toBe(rb);
        if (ra) changed++;
        for (let k = 0; k < 3; k++) {
          const x = a.levels[k]!, y = b.levels[k];
          expect([x.count, x.geometry.instanceCount, plain(x.attr.updateRanges), x.attr.version], `seed ${seed} shot ${i} level ${k}`)
            .toEqual([y.count, y.geometry.instanceCount, plain(y.attr.updateRanges), y.attr.version]);
          expect(bits(x.arr), `seed ${seed} shot ${i} level ${k}`).toEqual(bits(y.arr));
        }
        expect(a.triangles).toBe(b.triangles);
        drawn += a.levels.reduce((s, l) => s + l.count, 0);
        expect(f64(a._last)).toEqual(f64(b._last));
      }
      expect(changed).toBe(6);
      expect(drawn).toBeGreaterThan(50);
      // every level's cells sit in their distance band from the camera (nearest point, horizontal)
      const cam = shots[3]!;
      a.update(camera([0, 0, 0], [1, 0, 0])); a.update(cam);
      const p = cam.position;
      const dist = (x0: number, z0: number) => Math.hypot(Math.max(x0 - p.x, 0, p.x - x0 - 8), Math.max(z0 - p.z, 0, p.z - z0 - 8));
      for (const [k, [lo, hi]] of [[0, [0, 18]], [1, [0, 46]], [2, [46, 88]]] as const) {
        const l = a.levels[k]!;
        for (let n = 0; n < l.count; n++) {
          const d = dist(l.arr[n * 4]!, l.arr[n * 4 + 1]!);
          expect(d >= lo && d <= hi, `level ${k} cell ${n} d ${d}`).toBe(true);
        }
      }
      a.dispose();
      expect((a.heightTex as G.RecordedGrassTexture).destroyed && (a.maskTex as G.RecordedGrassTexture).destroyed).toBe(true);
    }
  });
});

describe('Tidewater grass: CPU mirrors of the WGSL distance LOD (not source-run)', () => {
  it('tiers fade in their bands and the remaining blades widen so coverage stays constant', () => {
    expect([G.grassTierFade(2, 10, 80), G.grassTierFade(2, 17, 80), G.grassTierFade(1, 35, 80), G.grassTierFade(1, 45, 80)])
      .toEqual([1, 0, 1, 0]);
    expect(G.grassTierFade(0, 60, 80)).toBe(1);
    expect(G.grassTierFade(0, 80, 80)).toBe(0);
    for (let d = 0; d < 67; d += 0.25) {
      const covered = G.grassWidthCompensation(d) * (2 * G.grassTierFade(0, d, 87) + 2 * G.grassTierFade(1, d, 87) + 3 * G.grassTierFade(2, d, 87));
      expect(covered).toBeCloseTo(7, 12);
    }
    for (const [r, r2] of [[0, 0], [0.5, 0.25], [0.999, 0.999], [0.13, 0.77]] as const) {
      const cut = G.grassTierZeroCut(r, r2);
      expect(cut >= 67 && cut <= 87).toBe(true);
    }
  });
});
