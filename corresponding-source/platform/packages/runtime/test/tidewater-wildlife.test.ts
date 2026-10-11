import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import * as W from '../src/creatures/index.js';

// Executes the ORIGINAL pinned Tidewater wildlife source (read only, tooling/other-programs) against the
// installed three.js, one module at a time with its imports injected, and compares the port bit-exact.
// The source engine's GPU pieces (StorageBuffer, ShaderModule, Material, ComputeKernel, Readback) are
// recorder stand-ins shared by both sides; the WGSL they carry is compared as text, never run.
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
// `export const NAME = { ... };` of a module that cannot be loaded here (engine / fx imports)
const constOf = (path: string, name: string) => {
  const m = read(path).match(new RegExp(`^export const ${name} = (\\{[\\s\\S]*?\\});`, 'm'));
  return new Function(`return ${m![1]};`)() as Mod;
};

class ShaderModuleStub { constructor(o: Mod) { return { ...o }; } }
class MaterialStub { options: Mod; constructor(o: Mod) { this.options = o; } }

function loadOriginal(globals: W.WildlifeGlobals) {
  const pool: Mod = {
    THREE, StorageBuffer: W.RecordedStorageBuffer, ShaderModule: ShaderModuleStub, Material: MaterialStub, G: globals,
    ComputeKernel: W.RecordedKernel, Readback: W.RecordedReadback,
    SPRAY: constOf('fx/Spray.js', 'SPRAY'), LAYERS: constOf('engine/render/SceneRenderer.js', 'LAYERS'),
  };
  Object.assign(pool, load('util/Noise.js', pool));
  Object.assign(pool, load('world/WorldLayout.js', pool));
  for (const m of ['Kit', 'BirdShapes', 'BirdPose', 'Flight', 'BirdBatch', 'CritterShapes', 'CritterBatch', 'ShadowBlobs',
    'SwashProbe', 'Birds', 'Shorebirds', 'Crabs']) Object.assign(pool, load(`world/wildlife/${m}.js`, pool));
  Object.assign(pool, load('world/wildlife/Wildlife.js', pool, ['WaterHeights']));
  Object.assign(pool, { Gulls: load('world/Gulls.js', pool).Gulls });
  return pool as Record<string, Any>;
}

const bits = (array: ArrayLike<number>) => new Uint32Array(Float32Array.from(array).buffer);
// long frame logs: one loop instead of a deep compare; reports the first differing float
function expectSameFrames(a: number[], b: number[]) {
  expect(a.length).toBe(b.length);
  const x = bits(a), y = bits(b);
  let i = 0;
  while (i < x.length && x[i] === y[i]) i++;
  expect(i === x.length ? 'same' : `float ${i}: ${a[i]} vs ${b[i]}`).toBe('same');
}
// append a typed range without spreading millions of arguments
const append = (out: number[], data: Float32Array, n: number) => { for (let i = 0; i < n; i++) out.push(data[i]!); };
const f64 = (array: ArrayLike<number>) => Array.from(array, (x) => Object.is(x, -0) ? '-0' : x);
// deep structure compare with numbers exact (vectors through their arrays)
const plain = (v: unknown, seen = new Set<unknown>()): unknown => {
  if (v instanceof THREE.Vector2 || v instanceof THREE.Vector3 || v instanceof THREE.Vector4 || v instanceof THREE.Quaternion) return v.toArray();
  if (typeof v === 'number') return Object.is(v, -0) ? '-0' : v;
  if (ArrayBuffer.isView(v)) return f64(v as unknown as ArrayLike<number>);
  if (typeof v === 'function') return 'fn';
  if (v && typeof v === 'object') {
    if (seen.has(v)) return '<cycle>';
    seen.add(v);
    const out = Array.isArray(v) ? v.map(x => plain(x, seen)) : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x, seen)]));
    seen.delete(v);
    return out;
  }
  return v;
};
function expectSameGeometry(a: THREE.BufferGeometry, b: THREE.BufferGeometry, label: string) {
  expect(Object.keys(a.attributes), label).toEqual(Object.keys(b.attributes));
  for (const k of Object.keys(b.attributes)) {
    const x = a.getAttribute(k) as THREE.BufferAttribute, y = b.getAttribute(k) as THREE.BufferAttribute;
    expect([x.itemSize, x.count, x.array.constructor.name, (x as Any).isInstancedBufferAttribute ?? false], `${label} ${k}`)
      .toEqual([y.itemSize, y.count, y.array.constructor.name, (y as Any).isInstancedBufferAttribute ?? false]);
    expect(bits(x.array), `${label} ${k}`).toEqual(bits(y.array));
  }
  expect(a.index?.array.constructor.name, label).toBe(b.index?.array.constructor.name);
  expect(Array.from(a.index?.array ?? []), `${label} index`).toEqual(Array.from(b.index?.array ?? []));
}
const meshInfo = (m: THREE.Mesh) => [m.name, m.frustumCulled, m.matrixAutoUpdate, m.castShadow, m.receiveShadow, m.layers.mask,
  m.renderOrder, (m.geometry as Any).instanceCount, plain(m.geometry.boundingSphere)];
const wgslOf = (m: THREE.Material) => plain(m.userData.wgsl);

// ------------------------------------------------------------------ a small deterministic beach world

const SEEDS = [1, 7, 42];
function terrain(): W.WildlifeTerrain {
  const res = 512, texel = 4, origin = -1024;
  const heightAt = (x: number, z: number) => {
    // sea to +z, shoreline near z = -42, dunes rising inland, a gentle wobble along the beach
    const d = -42 - z;
    const base = d < 0 ? d * 0.12 : d < 30 ? d * 0.066 : 1.98 + (d - 30) * 0.05;
    return base + Math.sin(x * 0.045) * 0.18 + Math.sin(z * 0.11 + x * 0.02) * 0.05;
  };
  const sand = new Uint8Array(res * res);
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) sand[j * res + i] = ((i * 7 + j * 13) % 11) < 9 ? 255 : 120;
  return { heightAt, origin, texel, res, sand };
}
function colliders(): W.WildlifeColliders {
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  return {
    boxes: [
      { tag: 'pierRail', center: V(53.75, 2.8, -12), half: V(0.05, 0.5, 52) },
      { tag: 'pierRail', center: V(56.25, 2.8, -12), half: V(0.05, 0.5, 52) },
      { tag: 'pierRail', center: V(55, 2.8, 39.9), half: V(7, 0.5, 0.05) },
      { tag: 'pierDeck', center: V(55, 2.2, -12), half: V(1.3, 0.1, 52) },
    ],
    groundHeightAt: (x, z) => Math.abs(x - 55) < 1.4 && z > -64 && z < 40 ? 2.3 : -Infinity,
  };
}
const village = (): W.WildlifeVillage => ({
  buildings: [{ x: 70, z: -30, stilts: true, roofTop: 6.2 }, { x: 78, z: -26, stilts: true, roofTop: 5.9 }, { x: 20, z: -120, roofTop: 8 }],
  getFootprints: () => [{ x: 40, z: -118, r: 12 }, { x: 0, z: -75, r: 3 }],
});
function vegetation(t: W.WildlifeTerrain): W.WildlifeVegetation {
  const palms = [];
  for (let i = 0; i < 40; i++) { const x = -140 + i * 7.7, z = -60 - (i * 37 % 60); palms.push({ x, y: t.heightAt(x, z), z }); }
  return { records: { palms } };
}
function boat(): W.WildlifeBoat {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.4);
  const pos = new THREE.Vector3(64.5, 0.2, 36.5);
  return { quaternion: q, driven: false, speed: 0, toWorld: (l, out) => out.copy(l).applyQuaternion(q).add(pos) };
}
function query(): W.WildlifeWaterQuery & { points: number[] } {
  const cpu = new Float32Array(64 * 4);
  const points: number[] = [];
  return {
    cpu, cpuValid: true, points, allocate: () => 4,
    setPoint(slot, x, z) { points.push(slot, x, z); cpu[slot * 4] = 0.15 * Math.sin(x * 0.1) + 0.1 * Math.cos(z * 0.07); },
  };
}
// a viewer walking down the beach, past the pier and the loafing gulls, then over the dunes
function walker(t: number): W.WildlifePlayer {
  const x = -60 + t * 2.4, z = t < 40 ? -52 + Math.sin(t * 0.3) * 6 : -70 + Math.sin(t * 0.2) * 20;
  return { position: { x, y: 0, z }, mode: t > 75 ? 'boat' : 'walk' };
}
// the swash a GPU would have answered (deterministic in the issued inputs and the clock)
function swashAnswer(inputs: Float32Array, time: number) {
  const out = new Float32Array(inputs.length);
  for (let i = 0; i < inputs.length / 4; i++) {
    const x = inputs[i * 4]!, z = inputs[i * 4 + 1]!;
    out[i * 4] = 2 + Math.sin(time * 0.8 + x * 0.05) * 1.5;
    out[i * 4 + 1] = (-42 - z) * 1.1;
    out[i * 4 + 2] = Math.cos(time * 0.8 + x * 0.05) * 1.2;
    out[i * 4 + 3] = (time / 8 + x * 0.001) % 1.3;
  }
  return out;
}
function deliver(probe: Any, time: number) {
  const rb = probe.readback as W.RecordedReadback;
  if (probe._pending) rb.deliver(swashAnswer(probe._inputsCopy, time));
}

// ------------------------------------------------------------------ math, shapes, poses

describe('Tidewater wildlife: kit math', () => {
  const src = loadOriginal(W.wildlifeGlobals());
  it('matches the angle helpers, quaternions and the seeded generator', () => {
    const rng = W.mulberry32(9), srng = src.mulberry32(9);
    for (let i = 0; i < 400; i++) expect(rng()).toBe(srng());
    const r = W.mulberry32(3);
    for (let i = 0; i < 300; i++) {
      const a = (r() - 0.5) * 30, b = (r() - 0.5) * 30, c = (r() - 0.5) * 4, d = r() * 0.2;
      expect(Object.is(W.angleDiff(a, b), src.angleDiff(a, b))).toBe(true);
      expect(W.approach(a, d)).toBe(src.approach(a, d));
      expect(W.smooth(a, b, c)).toBe(src.smooth(a, b, c));
      expect(W.lerp(a, b, c)).toBe(src.lerp(a, b, c));
      expect(W.clamp(a, -3, 3)).toBe(src.clamp(a, -3, 3));
      const q: W.Q4 = [0, 0, 0, 1], sq = [0, 0, 0, 1];
      expect(W.qYawPitchRoll(q, a, b, c)).toEqual(src.qYawPitchRoll(sq, a, b, c));
      expect(W.qRotate([0, 0, 0], q, a, b, c)).toEqual(src.qRotate([0, 0, 0], sq, a, b, c));
      const n = new THREE.Vector3(r() - 0.5, 1, r() - 0.5).normalize();
      expect(W.qGround([0, 0, 0, 1], a, n.x, n.y, n.z)).toEqual(src.qGround([0, 0, 0, 1], a, n.x, n.y, n.z));
    }
    expect(W.kitModule).toEqual({ ...src.kitModule });
  });
});

describe('Tidewater wildlife: bird template and poses', () => {
  const src = loadOriginal(W.wildlifeGlobals());
  it('keeps the species tables and builds every species bit-exact', () => {
    expect(plain(W.SPECIES)).toEqual(plain(src.SPECIES));
    expect({ ...W.BIRD }).toEqual(src.BIRD);
    for (let s = 0; s < W.SPECIES.length; s++) {
      const a = W.buildBird(W.SPECIES[s]!), b = src.buildBird(src.SPECIES[s]);
      expect(a.count).toBe(b.count);
      for (const k of ['A', 'B', 'C', 'D'] as const) expect(bits(a[k]), `${s} ${k}`).toEqual(bits(b[k]));
      expect(a.index).toEqual(b.index);
      expect(a.joints).toEqual(b.joints);
    }
    // one shared topology: 349 vertices, 592 triangles per bird (all species)
    expect([W.buildBird(W.SPECIES[0]!).count, W.buildBird(W.SPECIES[2]!).index.length / 3]).toEqual([349, 592]);
  });

  it('matches the pose helpers (wings, legs, head, ground pose)', () => {
    const r = W.mulberry32(5);
    for (let s = 0; s < 5; s++) {
      const P = W.createPose(s, 0.3), Q = src.createPose(s, 0.3);
      expect(plain(P)).toEqual(plain(Q));
      for (let i = 0; i < 40; i++) {
        const v = Array.from({ length: 12 }, () => (r() - 0.5) * 2);
        W.flapWings(P, W.FLIGHT[s]!.glide, v[0]! * 3, Math.abs(v[1]!), v[2]!); src.flapWings(Q, src.FLIGHT[s].glide, v[0]! * 3, Math.abs(v[1]!), v[2]!);
        W.setHead(P, v[3]!, v[4]!, v[5]! * 0.01); src.setHead(Q, v[3]!, v[4]!, v[5]! * 0.01);
        W.tuckLegs(P, i % 3 ? Math.abs(v[6]!) : 0); src.tuckLegs(Q, i % 3 ? Math.abs(v[6]!) : 0);
        W.groundPose(P, v[7]! * 50, v[8]!, v[9]! * 50, v[10]! * 6, v[11]! * 0.3, W.standHeight(P.sp), v[0]! * 9, 0.03, 0.01, 1 + v[1]! * 0.2);
        src.groundPose(Q, v[7]! * 50, v[8]!, v[9]! * 50, v[10]! * 6, v[11]! * 0.3, src.standHeight(Q.sp), v[0]! * 9, 0.03, 0.01, 1 + v[1]! * 0.2);
        W.storePrevious(P); src.storePrevious(Q);
        expect(plain(P), `species ${s} step ${i}`).toEqual(plain(Q));
        const k: W.V3 = [0, 0, 0], f: W.V3 = [0, 0, 0], sk = [0, 0, 0], sf = [0, 0, 0];
        W.solveLeg(k, f, 0, 0, 0, v[0]! * 0.1, v[1]! * 0.1 - 0.05, v[2]! * 0.1, 0.05, 0.05);
        src.solveLeg(sk, sf, 0, 0, 0, v[0]! * 0.1, v[1]! * 0.1 - 0.05, v[2]! * 0.1, 0.05, 0.05);
        expect([k, f]).toEqual([sk, sf]);
      }
    }
  });
});

describe('Tidewater wildlife: flight model', () => {
  const src = loadOriginal(W.wildlifeGlobals());
  const snap = (f: Any) => plain({ ...f, rng: 0, sp: 0, cfg: 0 });
  it('steers and animates every species bit-exact over several seeds', () => {
    for (const seed of SEEDS) for (let s = 0; s < 5; s++) {
      const a = new W.Flyer(s, seed / 100, W.mulberry32(seed)), b = new src.Flyer(s, seed / 100, src.mulberry32(seed));
      a.place(10, 12, -5, 0.3); b.place(10, 12, -5, 0.3);
      const wind = new THREE.Vector2(2.4, 6.6);
      for (let i = 0; i < 300; i++) {
        const t = i / 30, tx = Math.cos(t * 0.4) * 60, ty = 8 + Math.sin(t) * 6, tz = Math.sin(t * 0.4) * 60;
        const power = i < 30 ? 2 : i % 90 < 30 ? 0 : 1;
        a.dive = b.dive = i > 200 && i < 240 ? 0.8 : 0;
        a.flare = b.flare = i > 260 ? 0.6 : 0;
        a.steer(1 / 30, tx, ty, tz, a.cfg.speed, power, 1.2, i % 2 ? wind : null);
        b.steer(1 / 30, tx, ty, tz, b.cfg.speed, power, 1.2, i % 2 ? wind : null);
        a.animate(1 / 30); b.animate(1 / 30);
      }
      expect(snap(a), `species ${s} seed ${seed}`).toEqual(snap(b));
    }
  });

  it('keeps speed and bank within the species limits', () => {
    for (const seed of SEEDS) for (let s = 0; s < 5; s++) {
      const f = new W.Flyer(s, 0.5, W.mulberry32(seed)), c = f.cfg;
      f.place(0, 10, 0, 0);
      const hi = Math.max(f.speed, c.speed + c.sink * 3.5 * 0.4) + 1e-9;
      for (let i = 0; i < 600; i++) {
        const t = i / 30;
        f.steer(1 / 30, Math.cos(t) * 80, 5 + Math.sin(t * 2) * 30, Math.sin(t * 1.3) * 80, c.speed, i < 60 ? 2 : 1, 2);
        f.animate(1 / 30);
        expect(f.speed).toBeGreaterThanOrEqual(c.minSpeed * 0.5);
        expect(f.speed).toBeLessThanOrEqual(hi);
        expect(Math.abs(f.bank)).toBeLessThanOrEqual(c.maxBank + 1e-12);
        expect(Number.isFinite(f.x + f.y + f.z)).toBe(true);
      }
    }
  });
});

// ------------------------------------------------------------------ batches (records, templates, WGSL data)

describe('Tidewater wildlife: instanced batches', () => {
  const src = loadOriginal(W.wildlifeGlobals());
  it('builds the bird batch (species data, joints, template, WGSL material) and packs records', () => {
    const csm = { cascades: [{ camera: 'near' }, { camera: 'far' }] };
    const a = new W.BirdBatch({ csm }), b = new src.BirdBatch({ csm });
    expect([a.NV, a.triangles]).toEqual([b.NV, b.triangles]);
    expect(bits((a.speciesBuffer as W.RecordedStorageBuffer).data!)).toEqual(bits(b.speciesBuffer.data));
    expect(plain(a.joints)).toEqual(plain(b.joints));
    expectSameGeometry(a.mesh.geometry, b.mesh.geometry, 'birds');
    expect(meshInfo(a.mesh)).toEqual(meshInfo(b.mesh));
    expect(wgslOf(a.material)).toEqual(plain(b.material.options));
    const r = W.mulberry32(2);
    a.begin(); b.begin();
    for (let i = 0; i < 170; i++) {
      const P = W.createPose(i % 5, r());
      W.flapWings(P, W.FLIGHT[i % 5]!.glide, r() * 6, r());
      W.groundPose(P, r() * 9, r(), r() * 9, r() * 6, 0.2, 0.1, r() * 6, 0.02, 0.01);
      P.scale = r(); P.fold = r(); P.tailPitch = r(); P.tailSpread = r() + 1;
      W.storePrevious(P);
      a.write(P); b.write(P);
    }
    a.commit(); b.commit();
    expect(a.count).toBe(160);
    expect(bits(a.records.data)).toEqual(bits(b.records.data));
    expect(bits((a.records.buffer as W.RecordedStorageBuffer).data!)).toEqual(bits(b.records.buffer.data));
    // the near cascade only: far cascade cameras draw no birds
    a.mesh.onBeforeRender(null as Any, null as Any, 'far' as Any, null as Any, null as Any, null as Any);
    expect((a.mesh.geometry as Any).instanceCount).toBe(0);
    a.mesh.onBeforeRender(null as Any, null as Any, 'near' as Any, null as Any, null as Any, null as Any);
    expect((a.mesh.geometry as Any).instanceCount).toBe(160);
  });

  it('builds the critter batch, the contact shadows and the vertex-animated gulls', () => {
    const t = W.buildCritters(), u = src.buildCritters();
    expectSameGeometry(t.geometry, u.geometry, 'critters');
    expect(bits(t.bodyData)).toEqual(bits(u.bodyData));
    expect(plain(t.limbs)).toEqual(plain(u.limbs));
    expect([t.species, t.vertices, t.triangles]).toEqual([u.species, u.vertices, u.triangles]);
    expect([t.vertices, t.triangles]).toEqual([290, 504]);
    const a = new W.CritterBatch(), b = new src.CritterBatch();
    expect(meshInfo(a.mesh)).toEqual(meshInfo(b.mesh));
    expect(wgslOf(a.material)).toEqual(plain(b.material.options));
    const c = new W.ShadowBlobs(), d = new src.ShadowBlobs();
    expectSameGeometry(c.mesh.geometry, d.mesh.geometry, 'blobs');
    expect(meshInfo(c.mesh)).toEqual(meshInfo(d.mesh));
    expect(wgslOf(c.material)).toEqual(plain(d.material.options));
    const sa = { add() {} }, sb = { add() {} };
    for (const [count, seed] of [[18, 7], [40, 3]] as const) {
      const g = new W.Gulls({ scene: sa, count, seed }), h = new src.Gulls({ scene: sb, count, seed });
      expectSameGeometry(g.mesh.geometry, h.mesh.geometry, 'gulls');
      expect(meshInfo(g.mesh)).toEqual(meshInfo(h.mesh));
      expect(wgslOf(g.material)).toEqual(plain(h.mesh.material.options));
    }
    // records
    const r = W.mulberry32(4);
    c.begin(); d.begin(); a.begin(); b.begin();
    for (let i = 0; i < 50; i++) {
      const v = Array.from({ length: 8 }, () => r() * 10 - 5);
      c.add(v[0]!, v[1]!, v[2]!, v[3]!, v[4]!, v[5]!, v[6]!, v[7]!); d.add(v[0]!, v[1]!, v[2]!, v[3]!, v[4]!, v[5]!, v[6]!, v[7]!);
      const rec: W.CritterRecord = { x: v[0]!, y: v[1]!, z: v[2]!, scale: v[3]!, q: [v[4]!, v[5]!, v[6]!, v[7]!], species: i % 3, phase: v[1]!,
        stride: v[2]!, lift: v[3]!, out: v[4]!, eyes: v[5]!, claws: v[6]!, seed: v[7]!, px: v[0]!, py: v[1]!, pz: v[2]!, pPhase: v[3]!, pq: [v[7]!, v[6]!, v[5]!, v[4]!] };
      a.write(rec); b.write(structuredClone(rec));
    }
    c.commit(); d.commit(); a.commit(); b.commit();
    expect(bits(c.records.data)).toEqual(bits(d.records.data));
    expect(bits(a.records.data)).toEqual(bits(b.records.data));
  });
});

// ------------------------------------------------------------------ swash probe (CPU side)

describe('Tidewater wildlife: swash probe', () => {
  it('matches the dispatch cadence and the extrapolated swash edge', () => {
    const ga = W.wildlifeGlobals(), gb = W.wildlifeGlobals();
    const src = loadOriginal(gb);
    const shore = { module: { name: 'shore', code: '' }, period: { value: 8 } }, terrainGPU = { module: { name: 'terrain', code: '' } };
    const a = new W.SwashProbe(null, { shore, terrainGPU, globals: ga }), b = new src.SwashProbe(null, { shore, terrainGPU });
    expect(plain((a.kernel as W.RecordedKernel).options)).toEqual(plain(b.kernel.options));
    const outA: unknown[] = [], outB: unknown[] = [];
    for (let i = 0; i < 400; i++) {
      ga.time.value = gb.time.value = i / 30;
      for (let k = 0; k < 32; k++) if ((k + i) % 7) { a.set(k, k * 3 - 40, -45 + Math.sin(i * 0.01 + k)); b.set(k, k * 3 - 40, -45 + Math.sin(i * 0.01 + k)); } else if (i % 5 === 0) { a.clear(k); b.clear(k); }
      a.update(); b.update();
      if (i % 3 === 0) { deliver(a, i / 30); deliver(b, i / 30); }
      for (const k of [0, 5, 13, 31]) {
        outA.push(plain(a.get(k, { runup: 0, inland: 0, speed: 0, tau: 0, x: 0, z: 0, age: 0 })));
        outB.push(plain(b.get(k, { runup: 0, inland: 0, speed: 0, tau: 0, x: 0, z: 0, age: 0 })));
      }
    }
    expect(outA).toEqual(outB);
    expect((a.kernel as W.RecordedKernel).dispatches).toEqual(b.kernel.dispatches);
    expect(outA.filter((x) => x !== null).length).toBeGreaterThan(1000);
  });
});

// ------------------------------------------------------------------ behaviour (same inputs, same frames)

function stepGlobals(g: W.WildlifeGlobals, i: number, dt: number) {
  g.time.value = i * dt;
  g.night.value = i > 2400 ? 0.8 : 0; // dusk late in the run: crabs out, sanderlings roost
  g.sunDir.value.set(0.3, i > 2400 ? -0.05 : 0.6, 0.2).normalize();
}
const viewerAt = (t: number): W.Viewer => {
  const p = walker(t).position;
  return { x: p.x, y: p.y, z: p.z, speed: t % 20 < 4 ? 5 : 1.4, mode: walker(t).mode, px: p.x, pz: p.z, init: true };
};

describe('Tidewater wildlife: behaviour (bit-exact frames)', () => {
  const DT = 1 / 30;
  const states = new Map<string, Set<string>>();
  const seen = (k: string, s: string) => { if (!states.has(k)) states.set(k, new Set()); states.get(k)!.add(s); };

  it.each(SEEDS)('birds: same seed and inputs give the same frames (seed %i)', (seed) => {
    const ga = W.wildlifeGlobals(), gb = W.wildlifeGlobals();
    const src = loadOriginal(gb);
    const T = terrain();
    const mk = (side: 0 | 1) => {
      const water = side ? new src.WaterHeights(query()) : new W.WaterHeights(query());
      const spray = new W.RecordedSpray();
      const o = { terrain: T, village: village(), colliders: colliders(), boat: boat(), boatModel: { dimensions: { houseRoofHeight: 2.6 } }, water, spray, seed };
      return side ? new src.Birds(o) : new W.Birds({ ...o, globals: ga });
    };
    const a = mk(0), b = mk(1);
    const ba = new W.BirdBatch(), bb = new src.BirdBatch();
    const fa: number[] = [], fb: number[] = [];
    for (let i = 0; i < 3000; i++) {
      stepGlobals(ga, i, DT); stepGlobals(gb, i, DT);
      const t = i * DT, v = i % 400 < 300 ? viewerAt(t) : null, cam = { position: { x: walker(t).position.x, y: 1.7, z: walker(t).position.z + 4 } };
      if (i === 1500) a.boat.driven = b.boat.driven = true;
      ba.begin(); bb.begin();
      a.update(DT, v, ba, cam); b.update(DT, v, bb, cam);
      ba.commit(); bb.commit();
      a.water.endFrame(); b.water.endFrame();
      fa.push(ba.count); append(fa, ba.records.data, ba.count * 64); fb.push(bb.count); append(fb, bb.records.data, bb.count * 64);
      for (const g of a.agents) seen(g.kind, g.state);
    }
    expectSameFrames(fa, fb);
    expect(plain(a.spray.calls)).toEqual(plain(b.spray.calls));
    expect(plain(a.perches.map((p: Any) => ({ ...p, bird: p.bird?.id ?? null })))).toEqual(plain(b.perches.map((p: Any) => ({ ...p, bird: p.bird?.id ?? null }))));
  }, 60_000);

  it.each(SEEDS)('shorebirds: same seed and inputs give the same frames (seed %i)', (seed) => {
    const ga = W.wildlifeGlobals(), gb = W.wildlifeGlobals();
    const src = loadOriginal(gb);
    const T = terrain();
    const shore = { module: { name: 'shore', code: '' }, period: { value: 8 } }, terrainGPU = { module: { name: 't', code: '' } };
    const pa = new W.SwashProbe(null, { shore, terrainGPU, globals: ga }), pb = new src.SwashProbe(null, { shore, terrainGPU });
    const a = new W.Shorebirds({ terrain: T, probe: pa, seed, globals: ga }), b = new src.Shorebirds({ terrain: T, probe: pb, seed });
    const ba = new W.BirdBatch(), bb = new src.BirdBatch(), xa = new W.ShadowBlobs(), xb = new src.ShadowBlobs();
    const fa: number[] = [], fb: number[] = [];
    for (let i = 0; i < 3000; i++) {
      stepGlobals(ga, i, DT); stepGlobals(gb, i, DT);
      const t = i * DT, v = viewerAt(t), cam = { position: { x: v.x, y: 1.7, z: v.z + 3 } };
      ba.begin(); bb.begin(); xa.begin(); xb.begin();
      a.update(DT, v, ba, cam, xa); b.update(DT, v, bb, cam, xb);
      if (i % 2 === 0) { deliver(pa, t); deliver(pb, t); }
      fa.push(ba.count, xa.records.count); append(fa, ba.records.data, ba.count * 64); append(fa, xa.records.data, xa.records.count * 8);
      fb.push(bb.count, xb.records.count); append(fb, bb.records.data, bb.count * 64); append(fb, xb.records.data, xb.records.count * 8);
      for (const F of a.flocks) seen('flock', F.state);
      for (const s of a.birds) seen('sanderling', s.state);
    }
    expectSameFrames(fa, fb);
  }, 60_000);

  it.each(SEEDS)('crabs: same seed and inputs give the same frames (seed %i)', (seed) => {
    const ga = W.wildlifeGlobals(), gb = W.wildlifeGlobals();
    const src = loadOriginal(gb);
    const T = terrain();
    const o = { terrain: T, village: village(), colliders: colliders(), vegetation: vegetation(T), seed };
    const a = new W.Crabs({ ...o, globals: ga }), b = new src.Crabs(o);
    expect(plain(a.burrows)).toEqual(plain(b.burrows));
    expect(plain(a.homes)).toEqual(plain(b.homes));
    const ca = new W.CritterBatch(), cb = new src.CritterBatch(), xa = new W.ShadowBlobs(), xb = new src.ShadowBlobs();
    const fa: number[] = [], fb: number[] = [];
    for (let i = 0; i < 3000; i++) {
      stepGlobals(ga, i, DT); stepGlobals(gb, i, DT);
      // the viewer strolls over the upper beach, stops, then walks straight at the burrows
      const t = i * DT, x = -80 + t * 1.6, z = -62 + Math.sin(t * 0.25) * 9;
      const v: W.Viewer = { x, y: T.heightAt(x, z), z, speed: i % 600 < 200 ? 0 : 1.5, mode: 'walk', px: x, pz: z, init: true };
      const cam = { position: { x: x, y: v.y + 1.6, z: z + 2 } };
      ca.begin(); cb.begin(); xa.begin(); xb.begin();
      a.update(DT, i % 900 < 850 ? v : null, ca, cam, xa); b.update(DT, i % 900 < 850 ? v : null, cb, cam, xb);
      fa.push(ca.count, xa.records.count); append(fa, ca.records.data, ca.count * 24); append(fa, xa.records.data, xa.records.count * 8);
      fb.push(cb.count, xb.records.count); append(fb, cb.records.data, cb.count * 24); append(fb, xb.records.data, xb.records.count * 8);
      for (const c of a.ghosts) seen('ghost', c.state);
      for (const c of a.hermits) seen('hermit', c.state);
    }
    expectSameFrames(fa, fb);
  }, 60_000);

  it('runs the whole Wildlife owner bit-exact (viewer, water slots, swash probe, all three draws)', () => {
    const ga = W.wildlifeGlobals(), gb = W.wildlifeGlobals();
    const src = loadOriginal(gb);
    const T = terrain();
    const mk = () => ({
      scene: { add() {} }, renderer: null, terrain: T, terrainGPU: { module: { name: 't', code: '' } },
      shore: { module: { name: 'shore', code: '' }, period: { value: 8 } }, village: village(), colliders: colliders(),
      vegetation: vegetation(T), boat: boat(), boatModel: { dimensions: { houseRoofHeight: 2.6 } }, query: query(), spray: new W.RecordedSpray(),
      csm: null,
    });
    const oa = mk(), ob = mk();
    const a = new W.Wildlife({ ...oa, globals: ga }), b = new src.Wildlife(ob);
    const fa: number[] = [], fb: number[] = [];
    for (let i = 0; i < 2400; i++) {
      stepGlobals(ga, i, 1 / 30); stepGlobals(gb, i, 1 / 30);
      const t = i / 30, p = walker(t);
      const cam = { position: { x: p.position.x, y: i % 500 < 450 ? 1.8 : 30, z: p.position.z + 5 } };
      const player = i % 700 < 500 ? p : null;
      a.update(1 / 30, cam, player); b.update(1 / 30, cam, player);
      if (i % 2) { deliver(a.shorebirds.probe, t); deliver(b.shorebirds.probe, t); }
      for (const [w, f] of [[a, fa], [b, fb]] as const) {
        f.push(w.birdBatch.count, w.critterBatch.count, w.blobs.records.count);
        append(f, w.birdBatch.records.data, w.birdBatch.count * 64);
        append(f, w.critterBatch.records.data, w.critterBatch.count * 24);
        append(f, w.blobs.records.data, w.blobs.records.count * 8);
        f.push(w.viewer.speed, w.viewer.x, w.viewer.z);
      }
    }
    expectSameFrames(fa, fb);
    expect(oa.query.points).toEqual(ob.query.points);
    expect(plain(oa.spray.calls)).toEqual(plain(ob.spray.calls));
  }, 60_000);

  it('visits the main states of every animal in these runs', () => {
    const has = (k: string, list: string[]) => expect([...(states.get(k) ?? [])].sort(), k).toEqual(expect.arrayContaining(list));
    has('gull', ['perched', 'takeoff', 'fly', 'approach', 'land']);
    has('tern', ['patrol', 'hover', 'dive', 'under']);
    has('pelican', ['line', 'forage', 'dive', 'float', 'watertakeoff']);
    has('frigate', ['soar']);
    has('flock', ['feed', 'fly']);
    has('ghost', ['hidden', 'idle', 'flee', 'enter', 'freeze']);
    has('hermit', ['idle', 'walk', 'withdrawn', 'emerge']);
  });
});

describe('Tidewater wildlife: flush distances (port only)', () => {
  it('a perched gull flushes only once someone walks within its flight distance', () => {
    const g = W.wildlifeGlobals();
    const birds = new W.Birds({ terrain: terrain(), colliders: colliders(), water: new W.WaterHeights(null), seed: 3, globals: g });
    const gull = birds.agents.find((a) => a.kind === 'gull' && a.state === 'perched' && a.perch!.kind === 'rail')!;
    const p = gull.perch!, batch = new W.BirdBatch();
    gull.t = 1e9; // not restless
    const cam = { position: { x: p.x, y: 2, z: p.z } };
    for (const d of [20, 14, 9, 7.6]) {
      for (let i = 0; i < 30; i++) birds.update(1 / 30, { x: p.x + d, y: p.y, z: p.z, speed: 0, mode: 'walk', px: 0, pz: 0, init: true }, batch, cam);
      expect(gull.state, `at ${d} m`).toBe('perched');
    }
    for (let i = 0; i < 30 && gull.state === 'perched'; i++) birds.update(1 / 30, { x: p.x + 5, y: p.y, z: p.z, speed: 0, mode: 'walk', px: 0, pz: 0, init: true }, batch, cam);
    expect(gull.state).toBe('takeoff');
  });

  it('a sanderling flock flushes within 8 m (or 13.6 m of a runner) and only then', () => {
    const g = W.wildlifeGlobals();
    const sb = new W.Shorebirds({ terrain: terrain(), seed: 2, globals: g });
    const F = sb.flocks[0]!, batch = new W.BirdBatch();
    const cam = { position: { x: 0, y: 2, z: -40 } };
    const at = (d: number, speed: number): W.Viewer => {
      const b = F.birds.reduce((m, x) => x.x > m.x ? x : m);
      return { x: b.x + d, y: 0, z: b.z, speed, mode: 'walk', px: 0, pz: 0, init: true };
    };
    for (let i = 0; i < 60; i++) sb.update(1 / 30, at(9, 1), batch, cam);
    expect(F.state).toBe('feed');
    for (let i = 0; i < 60; i++) sb.update(1 / 30, at(12, 1), batch, cam);
    expect(F.state).toBe('feed');
    for (let i = 0; i < 20; i++) sb.update(1 / 30, at(12, 5), batch, cam);
    expect(F.state).toBe('fly');
  });

  it('a ghost crab freezes when someone comes near and runs once they are close', () => {
    const g = W.wildlifeGlobals();
    const T = terrain();
    const crabs = new W.Crabs({ terrain: T, seed: 4, globals: g });
    const b = crabs.burrows.find((x) => x.resident)!;
    const batch = new W.CritterBatch(), cam = { position: { x: b.x, y: 2, z: b.z } };
    crabs.update(1 / 30, null, batch, cam);
    const c = b.crab!;
    Object.assign(c, { state: 'idle', t: 1e9, out: 1, visible: true, x: b.x + 2, z: b.z });
    const v = (d: number): W.Viewer => ({ x: c.x + d, y: T.heightAt(c.x, c.z), z: c.z, speed: 0, mode: 'walk', px: 0, pz: 0, init: true });
    crabs.update(1 / 30, v(12), batch, cam);
    expect(c.state).toBe('idle');
    crabs.update(1 / 30, v(9), batch, cam);
    expect(c.state).toBe('freeze');
    crabs.update(1 / 30, v(6), batch, cam);
    expect(c.state).toBe('flee');
  });
});
