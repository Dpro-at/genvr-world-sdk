import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial, NormalBlending, TSL } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import * as W from '../src/creatures/index.js';
import {
  BIRD_SURFACE_INPUTS,
  BIRD_VERTEX_INPUTS,
  BLOB_SURFACE_INPUTS,
  BLOB_VERTEX_INPUTS,
  CREATURE_COMMON_WGSL,
  CREATURE_IGN_WGSL,
  critterSurfaceSnippet,
  CRITTER_SURFACE_INPUTS,
  CRITTER_VERTEX_INPUTS,
  CreatureShading,
  CreatureStorageBuffer,
  GULL_VERTEX_INPUTS,
  f32Literal,
  type CreatureMaterialGraph,
} from '../src/creatures/creature-shading.js';

// The ORIGINAL pinned Tidewater source (read only): the batch modules are evaluated with recorder
// engine stand-ins (as test/tidewater-wildlife.test.ts does), so the snippets, modules and uniform
// values compared below come from the source files, not from the port's copies.
type Mod = Record<string, unknown>;
type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped source modules and node graphs
const root = new URL('../../../../tooling/other-programs/tidewater/src/', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), 'utf8').replace(/\r\n/g, '\n');
function load(path: string, pool: Mod): Mod {
  const src = read(path);
  const deps: string[] = [];
  for (const m of src.matchAll(/^import\s*\{([^}]*)\}\s*from/gm)) deps.push(...m[1]!.split(',').map((s) => s.trim()).filter(Boolean));
  for (const m of src.matchAll(/^import\s*\*\s*as\s+(\w+)\s+from/gm)) deps.push(m[1]!);
  for (const d of deps) if (!(d in pool)) throw new Error(`${path}: no ${d}`);
  const names = [...src.matchAll(/^export\s+(?:const|function|class)\s+(\w+)/gm)].map((m) => m[1]!);
  const body = src.replace(/^import[\s\S]*?;\n/gm, '').replace(/^export /gm, '');
  return new Function(...deps, `${body}\n;return {${names.join(',')}};`)(...deps.map((d) => pool[d])) as Mod;
}
class ShaderModuleStub { constructor(o: Mod) { return { ...o }; } }
class MaterialStub { options: Mod; constructor(o: Mod) { this.options = o; } }
const LAYERS = new Function(`return ${read('engine/render/SceneRenderer.js').match(/^export const LAYERS = (\{[\s\S]*?\});/m)![1]};`)();
const pool: Mod = { THREE, StorageBuffer: W.RecordedStorageBuffer, ShaderModule: ShaderModuleStub, Material: MaterialStub, LAYERS };
for (const m of ['Kit', 'BirdShapes', 'CritterShapes', 'BirdBatch', 'CritterBatch', 'ShadowBlobs'])
  Object.assign(pool, load(`world/wildlife/${m}.js`, pool));
Object.assign(pool, { Gulls: load('world/Gulls.js', pool).Gulls });
const src = pool as Record<string, Any>;
const original: Record<string, Any> = {
  Birds: new src.BirdBatch().material.options,
  Critters: new src.CritterBatch().material.options,
  ContactShadows: new src.ShadowBlobs().material.options,
  Gull: new src.Gulls({ scene: { add() {} } }).mesh.material.options,
};
const recordStride: Record<string, number> = {
  Birds: new src.BirdBatch().records.stride,
  Critters: new src.CritterBatch().records.stride,
  ContactShadows: new src.ShadowBlobs().records.stride,
};
const common = read('engine/render/wgsl/common.js');
const compact = (s: string) => s.replace(/\s+/g, '');

// production: the port's batches with the native factory
const shading = new CreatureShading();
const birds = new W.BirdBatch({ storageBuffer: shading.storageBuffer, material: shading.material });
const critters = new W.CritterBatch({ storageBuffer: shading.storageBuffer, material: shading.material });
const blobs = new W.ShadowBlobs({ storageBuffer: shading.storageBuffer, material: shading.material });
const gulls = new W.Gulls({ scene: { add() {} }, material: shading.material });
const graph = (m: THREE.Material) => m.userData.creature as CreatureMaterialGraph;
const made = { Birds: birds.material, Critters: critters.material, ContactShadows: blobs.material, Gull: gulls.material };
const firstFn = (code: string) => code.match(/\bfn\s+(\w+)/)![1];
const params = (code: string) => code.slice(code.indexOf('(') + 1, code.indexOf(')')).split(',').map((p) => p.split(':')[0]!.trim());

// ---- node graph introspection (explicit slot mapping)
// TSL wraps expressions in intent VarNodes; the fields of the wrapped node are what matters here
const raw = (n: Any): Any => {
  while (n?.isVarNode) n = n.node;
  return n;
};
/** Evaluates an index node (uint consts, + and *, conversions) with the builtins bound. */
function evalIndex(n: Any, env: { instance?: number; vertex?: number }): number {
  n = raw(n);
  if (n.isIndexNode) {
    const v = n.scope === 'instance' ? env.instance : n.scope === 'vertex' ? env.vertex : undefined;
    if (v === undefined) throw new Error('unbound index ' + n.scope);
    return v;
  }
  if (n.isConstNode || n.isInputNode) return Number(n.value);
  if (n.isConvertNode) return evalIndex(n.node, env);
  if (n.isOperatorNode) {
    const a = evalIndex(n.aNode, env), b = evalIndex(n.bNode, env);
    if (n.op === '+') return a + b;
    if (n.op === '*') return a * b;
  }
  throw new Error('cannot evaluate ' + (n.type ?? n.constructor?.name));
}
/** A named output: SplitNode( ArrayElementNode( FunctionCallNode, col ), comps ) -> { call, col, comps }. */
function slotOf(n: Any): { call: Any; col: number; comps: string } {
  n = raw(n);
  expect(n.isSplitNode, 'output is a swizzle').toBe(true);
  const el = raw(n.node);
  expect(el.isArrayElementNode, 'swizzle of a packed column').toBe(true);
  return { call: raw(el.node), col: Number(raw(el.indexNode).value), comps: n.components };
}
/** The WGSL `return mat4x4f( vec4f( a, b ), ... )` of a code string -> [col][comp] = expression. */
function returnTable(stmt: string, sizes: Record<string, number> = {}): string[][] {
  const inner = stmt.slice(stmt.indexOf('mat4x4f(') + 8, stmt.lastIndexOf(')'));
  const cols: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === '(') depth++;
    else if (inner[i] === ')') depth--;
    else if (inner[i] === ',' && depth === 0) { cols.push(inner.slice(start, i).trim()); start = i + 1; }
  }
  cols.push(inner.slice(start).trim());
  return cols.map((c) => {
    const m = c.match(/^vec4f\((.*)\)$/);
    if (!m) return ['x', 'y', 'z', 'w'].map((c2) => `${c}.${c2}`); // a whole vec4f expression
    // expand vector fields: ( s.albedo, s.alpha ) -> s.albedo.x, .y, .z, s.alpha
    const out: string[] = [];
    if (/^[-0-9.]+$/.test(m[1]!.trim())) return [0, 1, 2, 3].map(() => m[1]!.trim()); // vec4f( 0.0 ) splat
    for (const p of m[1]!.split(',').map((x) => x.trim())) {
      const size = /^(s\.(albedo|normal|emissive|translucency)|tw(Wp|Wn|Pwp))$/.test(p) ? 3 : sizes[p] ?? 1;
      if (size === 1) out.push(p);
      else out.push(...['x', 'y', 'z', 'w'].slice(0, size).map((c2) => `${p}.${c2}`));
    }
    expect(out.length, c).toBe(4);
    return out;
  });
}
const COMP = { x: 0, y: 1, z: 2, w: 3, r: 0, g: 1, b: 2, a: 3 } as Record<string, number>;
/** Expressions a named output reads, from the entry's own return statement. */
function readsOf(code: string, which: 'world' | 'varyings' | 'surface', slot: { col: number; comps: string }, varyings: Record<string, string> = {}): string[] {
  const stmts = [...code.matchAll(/return mat4x4f\([^;]*\);/g)].map((m) => m[0]);
  const stmt = which === 'world' ? stmts.find((s) => s.includes('twWp'))! : which === 'surface' ? stmts.find((s) => s.includes('s.albedo'))! : stmts.find((s) => s.includes('o.'))!;
  const sizes = Object.fromEntries(Object.entries(varyings).map(([k, v]) => [`o.${k}`, { f32: 1, vec2f: 2, vec3f: 3, vec4f: 4 }[v] ?? 0]));
  const t = returnTable(stmt, sizes);
  return [...slot.comps].map((c) => t[slot.col]![COMP[c]!]!);
}
const selectorOf = (call: Any) => evalIndex(raw(call).parameters.twOut, {});

describe('wildlife shading WGSL', () => {
  it('selects each generated entry as the first function (wgslFn calls the first declaration)', () => {
    const want = {
      Birds: ['twBirdVertex', BIRD_VERTEX_INPUTS, 'twBirdSurface', BIRD_SURFACE_INPUTS],
      Critters: ['twCritterVertex', CRITTER_VERTEX_INPUTS, 'twCritterSurface', CRITTER_SURFACE_INPUTS],
      ContactShadows: ['twBlobVertex', BLOB_VERTEX_INPUTS, 'twBlobSurface', BLOB_SURFACE_INPUTS],
      Gull: ['twGullVertex', GULL_VERTEX_INPUTS, null, null],
    } as const;
    for (const [name, [vName, vIn, sName, sIn]] of Object.entries(want)) {
      const w = graph(made[name as keyof typeof made]).wgsl;
      expect(firstFn(w.vertex), name).toBe(vName);
      expect(params(w.vertex), name).toEqual([...vIn]);
      if (sName) {
        expect(firstFn(w.surface!), name).toBe(sName);
        expect(params(w.surface!), name).toEqual([...sIn!]);
      } else expect(w.surface).toBeNull();
    }
  });

  it('runs the original source snippets and modules verbatim', () => {
    for (const [name, o] of Object.entries(original)) {
      const w = graph(made[name as keyof typeof made]).wgsl;
      expect(o.vertex.length, name).toBeGreaterThan(400);
      expect(w.vertex, name).toContain(o.vertex);
      // the critter surface's one interleavedGradientNoise call is renamed (three declares that name)
      if (o.surface) expect(w.surface, name).toContain(name === 'Critters' ? critterSurfaceSnippet(o.surface) : o.surface);
      for (const m of o.modules ?? []) {
        expect(w.vertex, name + ' ' + m.name).toContain(m.code);
        for (const d of m.deps ?? []) expect(w.vertex, name + ' ' + d.name).toContain(d.code);
      }
    }
    expect(original.Critters.modules.map((m: Any) => m.name)).toEqual(['wildlifeKit', 'critterJoints']);
    const renamed = critterSurfaceSnippet(original.Critters.surface);
    expect(renamed.replace('twInterleavedGradientNoise(', 'interleavedGradientNoise(')).toBe(original.Critters.surface);
    expect(renamed).not.toMatch(/(?<!tw)interleavedGradientNoise\(/);
  });

  it('copies the engine common functions it needs line for line', () => {
    const commonLines = new Set(common.split('\n').map(compact));
    const lines = CREATURE_COMMON_WGSL.split('\n').map(compact).filter(Boolean);
    expect(lines.length).toBeGreaterThan(30);
    for (const line of lines) expect(commonLines.has(line), line).toBe(true);
    for (const fn of ['sat', 'mx_noise_float3']) expect(CREATURE_COMMON_WGSL).toMatch(new RegExp(`\\bfn ${fn}\\(`));
    // the noise copy is common.js 86 under the prefixed name
    expect(commonLines.has(compact(CREATURE_IGN_WGSL.replace('twInterleavedGradientNoise', 'interleavedGradientNoise')))).toBe(true);
    expect(CREATURE_COMMON_WGSL).not.toMatch(/fn interleavedGradientNoise/);
    expect(graph(critters.material).wgsl.surface).toContain(CREATURE_IGN_WGSL);
  });

  it('seeds the surface and the uniform arrays with the original material values (float32)', () => {
    const num = (code: string, field: string) => Number(code.match(new RegExp(`s\\.${field} = ([-0-9.e]+)`))![1]);
    for (const name of ['Birds', 'Critters', 'ContactShadows'] as const) {
      const code = graph(made[name]).wgsl.surface!;
      expect(num(code, 'roughness'), name).toBe(Math.fround(original[name].roughness ?? 1));
      expect(num(code, 'metalness'), name).toBe(Math.fround(original[name].metalness ?? 0));
      expect(code).toContain('s.albedo = vec3f( 1.0, 1.0, 1.0 ) * in.color.rgb;');
      expect(code).toContain('s.alpha = 1.0 * in.color.a;');
    }
    const lit = (v: Any) => `vec4f( ${[v.x, v.y, v.z, v.w].map(f32Literal).join(', ')} )`;
    const arr = (vs: Any[]) => `array<vec4f, ${vs.length}>( ${vs.map(lit).join(', ')} )`;
    expect(graph(birds.material).wgsl.vertex).toContain('mat.birdJoints = ' + arr(original.Birds.uniforms.birdJoints[1]));
    expect(graph(birds.material).wgsl.surface).toContain('mat.birdJoints = ' + arr(original.Birds.uniforms.birdJoints[1]));
    expect(graph(critters.material).wgsl.vertex).toContain(
      `TwCritterMat( ${arr(original.Critters.uniforms.critterLimbs[1])}, ${arr(original.Critters.uniforms.critterGait[1])} )`,
    );
    for (const v of original.Birds.uniforms.birdJoints[1]) for (const x of [v.x, v.y, v.z, v.w]) expect(Number(f32Literal(x))).toBe(Math.fround(x));
  });
});

describe('wildlife shading slot mapping', () => {
  it('feeds record slot k of instance i (storage element i * stride + k) to window element k', () => {
    for (const name of ['Birds', 'Critters', 'ContactShadows'] as const) {
      const g = graph(made[name]);
      const stride = recordStride[name]!;
      // the window lists twR0 .. twR(stride - 1) in order
      const window = g.wgsl.vertex.match(/var \w+Instances = array<vec4f, (\d+)>\( ([^)]*) \);/)!;
      expect(Number(window[1]), name).toBe(stride);
      expect(window[2]!.split(',').map((s) => s.trim()), name).toEqual(Array.from({ length: stride }, (_, k) => `twR${k}`));
      // the snippet reads only slots of that window
      for (const m of original[name].vertex.matchAll(/Instances\[ v\.instance \* (\d+)u \+ (\d+)u \]/g)) {
        expect(Number(m[1])).toBe(stride);
        expect(Number(m[2])).toBeLessThan(stride);
      }
      // both calls (world, varyings) take twRk = records.element( instance * stride + k )
      const calls = [slotOf(g.vertex!.position).call, ...Object.values(g.vertex!.varyings).map((n) => slotOf(n).call)];
      expect(new Set(calls.map(selectorOf)), name).toEqual(new Set([0, 1]));
      for (const call of calls)
        for (let k = 0; k < stride; k++) {
          const p = raw(call.parameters[`twR${k}`]);
          expect(p.indexNode, `${name} twR${k}`).toBeTruthy();
          expect(evalIndex(p.indexNode, { instance: 7 }), `${name} twR${k}`).toBe(7 * stride + k);
          expect(raw(p.node).value, `${name} twR${k} buffer`).toBe((made[name] as Any).userData.creature.options.storage[Object.keys(original[name].storage)[0]!].attribute);
        }
    }
  });

  it('wires every vertex output to the field the entry packs in its slot', () => {
    for (const name of ['Birds', 'Critters', 'ContactShadows'] as const) {
      const m = made[name] as MeshStandardNodeMaterial;
      const g = graph(m);
      const code = g.wgsl.vertex;
      expect(m.positionNode, name).toBe(g.vertex!.position);
      const pos = slotOf(g.vertex!.position), nor = slotOf(g.vertex!.normal), prev = slotOf(g.vertex!.previous);
      for (const s of [pos, nor, prev]) expect(selectorOf(s.call)).toBe(0);
      expect(readsOf(code, 'world', pos), name).toEqual(['twWp.x', 'twWp.y', 'twWp.z']);
      expect(readsOf(code, 'world', nor), name).toEqual(['twWn.x', 'twWn.y', 'twWn.z']);
      expect(readsOf(code, 'world', prev), name).toEqual(['twPwp.x', 'twPwp.y', 'twPwp.z']);
      // twWp / twWn / twPwp are the engine's useWorld results
      expect(code).toContain('let twWp = select( v.position + v.worldOffset, v.worldPos, v.useWorld );');
      expect(code).toContain('let twWn = select( v.normal, v.worldNormal, v.useWorld );');
      for (const [varying, type] of Object.entries(original[name].varyings as Record<string, string>)) {
        const s = slotOf(g.vertex!.varyings[varying]);
        expect(selectorOf(s.call), varying).toBe(1);
        const size = { f32: 1, vec2f: 2, vec3f: 3, vec4f: 4 }[type]!;
        expect(s.comps.length, varying).toBe(size);
        const reads = readsOf(code, 'varyings', s, original[name].varyings);
        expect(reads, varying).toEqual(size === 1 ? [`o.${varying}`] : ['x', 'y', 'z', 'w'].slice(0, size).map((c) => `o.${varying}.${c}`));
      }
    }
  });

  it('wires every surface output to the material slot of the same name', () => {
    const FIELD = { albedo: 's.albedo', alpha: 's.alpha', normal: 's.normal', roughness: 's.roughness', emissive: 's.emissive', metalness: 's.metalness', translucency: 's.translucency', ao: 's.ao' } as const;
    for (const name of ['Birds', 'Critters', 'ContactShadows'] as const) {
      const g = graph(made[name]);
      for (const [out, field] of Object.entries(FIELD)) {
        const s = slotOf((g.surface as Any)[out]);
        const reads = readsOf(g.wgsl.surface!, 'surface', s);
        const size = ['alpha', 'roughness', 'metalness', 'ao'].includes(out) ? 1 : 3;
        expect(reads, `${name} ${out}`).toEqual(size === 1 ? [field] : ['x', 'y', 'z'].map((c) => `${field}.${c}`));
      }
    }
    for (const m of [birds.material, critters.material] as MeshStandardNodeMaterial[]) {
      const s = graph(m).surface!;
      expect(m.colorNode).toBe(s.albedo);
      expect(m.roughnessNode).toBe(s.roughness);
      expect(m.metalnessNode).toBe(s.metalness);
      expect(m.emissiveNode).toBe(s.emissive);
      expect(m.aoNode).toBe(s.ao);
      expect(m.normalNode).toBeTruthy();
      expect(m.opacityNode).toBeFalsy();
    }
    const b = blobs.material as MeshBasicNodeMaterial, s = graph(b).surface!;
    expect(b.opacityNode).toBe(s.alpha);
    const add = raw(b.colorNode);
    expect([add.op, add.aNode, add.bNode]).toEqual(['+', s.albedo, s.emissive]);
  });
});

describe('wildlife shading materials', () => {
  it('builds native node materials with the source pass state', () => {
    expect(birds.material).toBeInstanceOf(MeshStandardNodeMaterial);
    expect(critters.material).toBeInstanceOf(MeshStandardNodeMaterial);
    expect(gulls.material).toBeInstanceOf(MeshStandardNodeMaterial);
    expect(blobs.material).toBeInstanceOf(MeshBasicNodeMaterial);
    for (const [name, m] of Object.entries(made)) {
      expect(m.name).toBe(original[name].name);
      expect((m as MeshStandardNodeMaterial).positionNode, name).toBeTruthy();
    }
    for (const name of ['Birds', 'Critters', 'Gull'] as const) {
      const m = made[name] as MeshStandardNodeMaterial;
      expect(m.roughness).toBe(original[name].roughness);
      expect(m.metalness).toBe(original[name].metalness);
      expect(m.transparent).toBe(false);
      expect(m.side).toBe(THREE.FrontSide);
    }
    expect((gulls.material as MeshStandardNodeMaterial).vertexColors).toBe(true);
    const b = blobs.material as MeshBasicNodeMaterial;
    expect([b.transparent, b.depthWrite, b.blending, b.premultipliedAlpha]).toEqual([true, false, NormalBlending, true]);
    expect([original.ContactShadows.lit, original.ContactShadows.transparent, original.ContactShadows.blending, original.ContactShadows.depthWrite]).toEqual([false, true, 'premultiplied', false]);
    // gull position: the vertex entry on the geometry position and the four attributes
    const call = raw((gulls.material as MeshStandardNodeMaterial).positionNode);
    expect(Object.keys(call.parameters)).toEqual([...GULL_VERTEX_INPUTS]);
  });

  it('uploads records through three storage buffers and draws the instance count', () => {
    const buf = birds.records.buffer as CreatureStorageBuffer;
    expect(buf).toBeInstanceOf(CreatureStorageBuffer);
    expect(buf.attribute.array.length).toBe(160 * 16 * 4);
    const species = birds.speciesBuffer as CreatureStorageBuffer;
    expect(Array.from(species.attribute.array as Float32Array)).toEqual(Array.from(new src.BirdBatch().speciesBuffer.data));
    const P = W.createPose(2, 0.3);
    W.storePrevious(P);
    birds.begin();
    birds.write(P);
    birds.write(P);
    birds.commit();
    const v0 = buf.attribute.version;
    expect(Array.from((buf.attribute.array as Float32Array).subarray(0, 128))).toEqual(Array.from(birds.records.data.subarray(0, 128)));
    expect(buf.attribute.updateRanges).toEqual([{ start: 0, count: 128 }]);
    birds.begin();
    birds.commit();
    expect(buf.attribute.version).toBe(v0 + 1);
    const mesh = shading.attach(birds.mesh);
    birds.mesh.onBeforeRender(null as Any, null as Any, null as Any, null as Any, null as Any, null as Any);
    expect((mesh as Any).count).toBe(0);
    birds.begin();
    for (let i = 0; i < 5; i++) birds.write(P);
    birds.commit();
    birds.mesh.onBeforeRender(null as Any, null as Any, null as Any, null as Any, null as Any, null as Any);
    expect((mesh as Any).count).toBe(5);
    shading.attach(blobs.mesh);
    expect(blobs.mesh.layers.isEnabled(0)).toBe(true);
    expect(blobs.mesh.layers.isEnabled(W.LAYER_TRANSPARENT)).toBe(true);
    expect(() => shading.storageBuffer({ label: 'x', count: 2, type: 'f32' })).toThrow();
  });

  it('shades a whole Wildlife owner and the gulls through the factories', () => {
    const own = new CreatureShading({ time: TSL.uniform(3) });
    const scene = new THREE.Scene();
    const w = new W.Wildlife({ scene, terrain: { heightAt: () => 0 }, storageBuffer: own.storageBuffer, material: own.material, swashGpu: W.recordedSwashGpu() });
    own.attachWildlife(w);
    expect(own.materials.map((m) => m.name)).toEqual(['Birds', 'Critters', 'ContactShadows']);
    expect(w.birdBatch.records.buffer).toBeInstanceOf(CreatureStorageBuffer);
    const g = new W.Gulls({ scene, material: own.material });
    own.attach(g.mesh);
    expect((g.mesh as Any).count).toBe(18);
    expect(() => own.material({ name: 'Unknown' })).toThrow();
    own.update(1);
    expect(own.time.value).toBe(3); // a bound clock is not advanced
    own.dispose();
  });
});
