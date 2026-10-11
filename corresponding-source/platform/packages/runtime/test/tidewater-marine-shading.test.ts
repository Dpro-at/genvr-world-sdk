import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { MeshPhysicalNodeMaterial, TSL } from 'three/webgpu';
import { describe, expect, it, vi } from 'vitest';
import * as M from '../src/tidewater-marine/index.js';
import {
  FISH_SHADOW_INPUTS,
  FISH_SURFACE_INPUTS,
  FISH_VERTEX_INPUTS,
  MARINE_DRIVER_ORDER,
  MarineShading,
  MarineStorageBuffer,
  WHALE_SURFACE_INPUTS,
  WHALE_VERTEX_INPUTS,
  boundBatchWgsl,
  marineKindMeshes,
  preprocessWgsl,
  type MarineMaterialGraph,
  type MarineShadingBatch,
} from '../src/tidewater-marine/marine-shading.js';
import { SHORE_FN_PREFIX } from '../src/tidewater-shore/shore-shading.js';
import * as geo from '../src/tidewater-village/geo-builder.js';
import * as props from '../src/tidewater-village/props.js';

// The ORIGINAL pinned Tidewater source (read only, commit 4811ba48): FishMaterial.js, ReefBatch.js and Whale.js
// are evaluated with record stand-ins for the engine classes (as test/tidewater-marine.test.ts does), so the
// snippets and modules compared below come from the source files, not from the port's copies.
vi.setConfig({ testTimeout: 120_000 });
type Mod = Record<string, unknown>;
type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped source modules and node graphs
const root = new URL('../../../../tooling/other-programs/tidewater/', import.meta.url);
const read = (path: string) => readFileSync(new URL('src/' + path, root), 'utf8').replace(/\r\n/g, '\n');
const strip = (text: string) =>
  text
    .replace(/^import[\s\S]*?from\s*'[^']*';\n/gm, '')
    .replace(/^export \{[^}]*\};?\n/gm, '')
    .replace(/^export /gm, '')
    .replace(/import\.meta\.env/g, 'undefined');
const load = (path: string, deps: Mod, names: string[]): Any =>
  new Function(...Object.keys(deps), strip(read(path)) + `;return {${names.join(',')}};`)(...Object.values(deps));
const between = (text: string, start: string, end: string) => {
  const a = text.indexOf(start);
  if (a < 0) throw new Error('anchor ' + start);
  const b = text.indexOf(end, a + start.length);
  if (b < 0) throw new Error('end anchor after ' + start);
  return text.slice(a, b + end.length);
};

class StorageStub {
  options: Mod;
  constructor(o: Mod) {
    this.options = o;
  }
  write() {}
  destroy() {}
}
const oSpecies = load('world/fish/FishSpecies.js', {}, ['PATTERN', 'SPECIES', 'SKIN']);
const oGeo = load('world/fish/FishGeometry.js', { THREE }, ['PART', 'fishGeometry']);
const oMaterial = load(
  'world/fish/FishMaterial.js',
  {
    Color: THREE.Color, Vector4: THREE.Vector4, Material: M.WgslMaterial, ShaderModule: M.WgslModule, UniformBlock: M.WgslUniformBlock,
    commonModule: M.COMMON_MODULE, lodFadeModule: M.LOD_FADE_MODULE, SPECIES: oSpecies.SPECIES, SKIN: oSpecies.SKIN, PATTERN: oSpecies.PATTERN, PART: oGeo.PART,
  },
  ['skinTable', 'fishModule', 'createSwimMaterial', 'createPropMaterial'],
);
const oBatch = load(
  'world/reef/ReefBatch.js',
  { BufferGeometry: THREE.BufferGeometry, BufferAttribute: THREE.BufferAttribute, Mesh: THREE.Mesh, StorageBuffer: StorageStub, ShaderModule: M.WgslModule },
  ['ReefBatch'],
);
const oWhale = load(
  'world/marine/Whale.js',
  { THREE, Material: M.WgslMaterial, ShaderModule: M.WgslModule, LAYERS: { OPAQUE: 0 }, SPRAY: M.SPRAY, WhaleBrain: class {}, loadTexture: null },
  ['Whale'],
);
const shaderJs = read('engine/gpu/Shader.js');
const oPreprocess = new Function(
  between(shaderJs, 'export function preprocess(', "\treturn out.join( '\\n' );\n\n}").replace(/^export /, '') +
    '\n' +
    between(shaderJs, 'function truthy( v ) {', '\n}') +
    '\nreturn preprocess;',
)() as (code: string, defines: Mod) => string;
const common = read('engine/render/wgsl/common.js');
const lighting = read('engine/render/wgsl/lighting.js');
const lodFade = read('materials/LODFade.js');

// the source material records over the source batch module
const tiny = () => oGeo.fishGeometry(oSpecies.SPECIES.grunt, { lod: 3 });
const sFish = new oBatch.ReefBatch('Fish', [{ geometry: tiny() }], { maxInstances: 4, dynamic: true, fade: true });
const sProps = new oBatch.ReefBatch('FishProps', [{ geometry: tiny() }], { maxInstances: 4, fade: true });
const original: Record<string, Any> = {
  Fish: oMaterial.createSwimMaterial(sFish).options,
  FishFade: oMaterial.createSwimMaterial(sFish, { fade: true }).options,
  FishProps: oMaterial.createPropMaterial(sProps).options,
  FishPropsFade: oMaterial.createPropMaterial(sProps, { fade: true }).options,
};
const whaleFiles = new URL('public/models/whale/', root);
const manifest = JSON.parse(readFileSync(new URL('humpback.json', whaleFiles), 'utf8'));
const bin = (() => {
  const b = readFileSync(new URL('humpback.bin', whaleFiles));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
})();
const sWhale = Object.assign(Object.create(oWhale.Whale.prototype), { albedoTex: {}, heightTex: {} });
sWhale._setupRig(manifest);
original.Whale = sWhale._createMaterial(manifest).options;

// production: the port's records through the native batch / shading
const shading = new MarineShading();
const kindsOf = () => [
  { geometry: M.fishGeometry(M.SPECIES.grunt as Any, { lod: 2 }) },
  { geometry: M.fishGeometry(M.SPECIES.grunt as Any, { lod: 3 }) },
  { geometry: M.rayGeometry({ lod: 1 }) },
  { geometry: M.turtleGeometry({ lod: 1 }), shadow: true, shadowOnly: true },
];
const fishBatch = new shading.Batch('Fish', kindsOf(), { maxInstances: 6, dynamic: true, fade: true }) as unknown as MarineShadingBatch;
const fishMesh = fishBatch.createMesh(M.createSwimMaterial(fishBatch), { castShadow: true });
const fishFadeMesh = fishBatch.createFadeMesh(M.createSwimMaterial(fishBatch, { fade: true }));
const propBatch = new shading.Batch('FishProps', kindsOf(), { maxInstances: 6, fade: true }) as unknown as MarineShadingBatch;
const propMesh = propBatch.createMesh(M.createPropMaterial(propBatch), { castShadow: true });
const propFadeMesh = propBatch.createFadeMesh(M.createPropMaterial(propBatch, { fade: true }));
const matOf = (driver: THREE.Object3D) => (driver.children[0] as THREE.Mesh).material as MeshPhysicalNodeMaterial;
const made: Record<string, MeshPhysicalNodeMaterial> = {
  Fish: matOf(fishMesh),
  FishFade: matOf(fishFadeMesh),
  FishProps: matOf(propMesh),
  FishPropsFade: matOf(propFadeMesh),
};
const whale = new M.Whale({ scene: new THREE.Scene() });
Object.assign(whale, { manifest });
whale._setupRig(manifest);
whale.albedoTex = M.whaleTexture({ width: 2, height: 2, data: new Uint8Array(16).fill(200) }, true);
whale.heightTex = M.whaleTexture({ width: 2, height: 2, data: new Uint8Array(16).fill(100) }, false);
whale.material = whale._createMaterial(manifest);
for (const { geometry } of M.whaleGeometries(manifest, bin)) {
  const mesh = new THREE.Mesh(geometry);
  mesh.matrixAutoUpdate = false;
  whale.meshes.push(mesh);
}
whale.ready = true;
made.Whale = shading.attachWhale(whale);
const graph = (m: THREE.Material) => m.userData.marine as MarineMaterialGraph;
const firstFn = (code: string) => code.match(/\bfn\s+(\w+)/)![1];
const params = (code: string) =>
  code
    .slice(code.indexOf('(') + 1, code.indexOf(')'))
    .replace(/<[^>]*>/g, '')
    .split(',')
    .map((p) => p.split(':')[0]!.trim());
const unprefix = (s: string) => s.replaceAll(SHORE_FN_PREFIX, '');
const fnCount = (s: string) => [...s.matchAll(/(^|\n)[ \t]*fn\s+\w+\s*\(/g)].length;

// ---- node graph introspection
const raw = (n: Any): Any => {
  while (n?.isVarNode) n = n.node;
  return n;
};
function slotOf(n: Any): { call: Any; col: number; comps: string } {
  n = raw(n);
  // a whole packed column (vec4 varyings) or a swizzle of one
  if (n.isArrayElementNode) return { call: raw(n.node), col: Number(raw(n.indexNode).value), comps: 'xyzw' };
  expect(n.isSplitNode, 'output is a swizzle').toBe(true);
  const el = raw(n.node);
  expect(el.isArrayElementNode, 'swizzle of a packed column').toBe(true);
  return { call: raw(el.node), col: Number(raw(el.indexNode).value), comps: n.components };
}
/** `return mat4x4f( vec4f( a, b ), ... )` -> [col][comp] = expression (vectors expanded by name). */
function returnTable(stmt: string, sizes: Record<string, number>): string[][] {
  const inner = stmt.slice(stmt.indexOf('mat4x4f(') + 8, stmt.lastIndexOf(')'));
  const split = (s: string) => {
    const out: string[] = [];
    let depth = 0,
      start = 0;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '(') depth++;
      else if (s[i] === ')') depth--;
      else if (s[i] === ',' && depth === 0) {
        out.push(s.slice(start, i).trim());
        start = i + 1;
      }
    }
    out.push(s.slice(start).trim());
    return out;
  };
  return split(inner).map((c) => {
    const m = c.match(/^vec4f\((.*)\)$/);
    if (!m) return ['x', 'y', 'z', 'w'].map((k) => `${c}.${k}`);
    const out: string[] = [];
    for (const f of split(m[1]!)) {
      const n = sizes[f] ?? 1;
      if (n === 1) out.push(f);
      else for (const k of ['x', 'y', 'z', 'w'].slice(0, n)) out.push(`${f}.${k}`);
    }
    while (out.length < 4) out.push(out.length && /^[-0-9.]+$/.test(out[0]!) ? out[0]! : '0.0');
    return out;
  });
}
const SURFACE_SIZES = {
  's.albedo': 3, 's.normal': 3, 's.translucency': 3, twWp: 3, twWn: 3, twPwp: 3, 'o.vFishLocal': 3,
  'o.vFishData': 4, 'o.vFishInfo': 4, 'o.vFishFlags': 4,
};
const returns = (code: string) => [...code.matchAll(/return mat4x4f\([^;]*\);/g)].map((m) => m[0]);

describe('Tidewater marine shading: generated WGSL', () => {
  it('puts the intended entry first in every string, with the exported inputs', () => {
    for (const k of ['Fish', 'FishFade', 'FishProps', 'FishPropsFade']) {
      const w = graph(made[k]!).wgsl;
      expect([firstFn(w.vertex), firstFn(w.surface)]).toEqual(['twFishVertex', 'twFishSurface']);
      expect(params(w.vertex)).toEqual([...FISH_VERTEX_INPUTS]);
      expect(params(w.surface)).toEqual([...FISH_SURFACE_INPUTS]);
      if (k.startsWith('FishProps')) {
        expect(firstFn(w.shadow!)).toBe('twFishShadow');
        expect(params(w.shadow!)).toEqual([...FISH_SHADOW_INPUTS]);
      } else expect(w.shadow).toBeNull();
    }
    const w = graph(made.Whale!).wgsl;
    expect([firstFn(w.vertex), firstFn(w.surface)]).toEqual(['twWhaleVertex', 'twWhaleSurface']);
    expect(params(w.vertex)).toEqual([...WHALE_VERTEX_INPUTS]);
    expect(params(w.surface)).toEqual([...WHALE_SURFACE_INPUTS]);
  });

  it('runs the original snippets and modules verbatim (only the helper prefix added)', () => {
    for (const k of ['Fish', 'FishFade', 'FishProps', 'FishPropsFade']) {
      const o = original[k], g = graph(made[k]!).wgsl;
      // the fragment entries link the shared library (one wgsl include)
      const w = { vertex: g.vertex, surface: g.surface + g.library, shadow: g.shadow === null ? null : g.shadow + g.library };
      expect(fnCount(g.surface)).toBe(1);
      if (g.shadow) expect(fnCount(g.shadow)).toBe(2); // the entry and the hook
      expect(unprefix(w.vertex)).toContain(o.vertex);
      expect(unprefix(w.surface)).toContain(o.surface);
      expect(unprefix(w.vertex)).toContain(o.modules[0].code);
      expect(unprefix(w.surface)).toContain(o.modules[0].code);
      expect(graph(made[k]!).options.varyings).toEqual(o.varyings);
      expect(graph(made[k]!).options.attributes).toEqual(o.attributes);
      if (o.shadow) expect(unprefix(w.shadow!)).toContain(o.shadow);
      // the engine modules the surfaces use, line for line
      expect(unprefix(w.surface)).toContain(between(common, 'fn perturbNormalByHeight(', '\n}'));
      expect(unprefix(w.surface)).toContain(between(common, 'fn luminance(', '\n'));
      expect(unprefix(w.surface)).toContain(between(lodFade, 'fn bayer4( pixel: vec2f ) -> f32 {', 'return select( ( t < fade ), ( t >= fade ), outgoing );\n}'));
      expect(unprefix(w.surface)).toContain(between(lighting, 'struct Surface {', '};'));
      expect(unprefix(w.surface)).toContain(between(lighting, 'fn defaultSurface(', '\n}'));
      // every helper is namespaced: no source helper name stays global
      for (const name of ['interleavedGradientNoise', 'vogelDiskSample', 'fishRow', 'fishSwimOffset', 'lodFadeVisible', 'perturbNormalByHeight'])
        expect([w.vertex, w.surface, w.shadow ?? ''].join('\n')).not.toMatch(new RegExp(`(?<!${SHORE_FN_PREFIX})\\b${name}\\s*\\(`));
    }
    // the fade entry decodes with the source batch module's own expression
    const decode = between(sFish.module.code, 'return fishFadeInfo(', ');');
    expect(graph(made.FishFade!).wgsl.vertex).toContain(decode);
    expect(boundBatchWgsl(sFish.module.code, 'fish')).toContain(between(sFish.module.code, 'struct fishFadeInfo {', '};'));
    // the whale: rig module and the preprocessed snippets (Shader.js preprocess, PASS_DEPTH off)
    const ow = original.Whale, gw = graph(made.Whale!).wgsl;
    const w = { vertex: gw.vertex, surface: gw.surface + gw.library };
    const defines = { ...ow.defines, PASS_DEPTH: 0 };
    expect(unprefix(w.vertex)).toContain(ow.modules[0].code);
    expect(unprefix(w.vertex)).toContain(oPreprocess(ow.vertex, defines));
    expect(unprefix(w.surface)).toContain(oPreprocess(ow.surface, defines));
    expect(graph(made.Whale!).options.uniforms!.whalePos![0]).toBe(ow.uniforms.whalePos[0]);
  });

  it('preprocesses like the engine', () => {
    for (const d of [{}, { WHALE_TEX: 1 }, { WHALE_TEX: 0, PASS_DEPTH: 1 }, { WHALE_TEX: 1, PASS_DEPTH: 1 }, { A: 2, B: 'x' }]) {
      expect(preprocessWgsl(original.Whale.vertex, d)).toBe(oPreprocess(original.Whale.vertex, d));
      expect(preprocessWgsl(original.Whale.surface, d)).toBe(oPreprocess(original.Whale.surface, d));
    }
    const t = '#if A == 2\na\n#elif B\nb\n#else\nc\n#endif\n#ifdef B\nd\n#endif\n#if A && B || C\ne\n#endif';
    for (const d of [{ A: 2 }, { B: 1 }, {}, { A: 2, B: 'x' }, { C: 1 }]) expect(preprocessWgsl(t, d)).toBe(oPreprocess(t, d));
    expect(() => preprocessWgsl('#if A\nx')).toThrow(/unterminated/);
  });

  it('packs the skin table with the source float32 values', () => {
    const rows = oMaterial.skinTable().fields.rows[1];
    const text = graph(made.Fish!).wgsl.library;
    const lits = text.slice(text.indexOf('var<private> fishSkin'), text.indexOf(') );', text.indexOf('var<private> fishSkin')));
    const values = [...lits.matchAll(/vec4f\( ([^)]*) \)/g)].map((m) => m[1]!.split(',').map(Number));
    expect(values.length).toBe(rows.length);
    values.forEach((v, i) => expect(v).toEqual([rows[i].x, rows[i].y, rows[i].z, rows[i].w].map(Math.fround)));
  });
});

describe('Tidewater marine shading: explicit slot mapping', () => {
  it('reads the record of the drawn instance as the batch module does (list / base / instances)', () => {
    for (const [k, batch, fade] of [
      ['Fish', fishBatch, false],
      ['FishFade', fishBatch, true],
      ['FishProps', propBatch, false],
      ['FishPropsFade', propBatch, true],
    ] as const) {
      const v = graph(made[k]!).vertex;
      for (const out of [v.position, v.varyings.vFishData]) {
        const call = slotOf(out).call;
        const p = call.parameters;
        let ri: Any = null;
        [0, 1, 2, 3].forEach((slot) => {
          const el = raw(p['twR' + slot]);
          expect(el.isStorageArrayElementNode, `twR${slot} is a storage element`).toBe(true);
          expect(raw(el.node)).toBe(raw(batch.nodes.instances));
          const sum = raw(el.indexNode);
          expect([sum.op, Number(raw(sum.bNode).value)]).toEqual(['+', slot]);
          const mul = raw(sum.aNode);
          expect([mul.op, Number(raw(mul.bNode).value)]).toEqual(['*', 4]);
          if (ri) expect(raw(mul.aNode)).toBe(ri);
          ri = raw(mul.aNode);
        });
        const listIndex = (e: Any, list: Any, base: Any) => {
          expect(e.isStorageArrayElementNode).toBe(true);
          expect(raw(e.node)).toBe(raw(list));
          const add = raw(e.indexNode);
          expect(add.op).toBe('+');
          const b = raw(add.aNode);
          expect(raw(b.node)).toBe(raw(base));
          expect(raw(add.bNode).isIndexNode && raw(add.bNode).scope).toBe('instance');
        };
        if (fade) {
          expect([ri.op, Number(raw(ri.bNode).value)]).toEqual(['&', 0xffffff]);
          listIndex(raw(ri.aNode), batch.nodes.fadeList, batch.nodes.fadeBase);
          expect(raw(p.twFadeEntry)).toBe(raw(ri.aNode));
        } else listIndex(ri, batch.nodes.list, batch.nodes.base);
      }
    }
  });

  it('takes every named output from the packed field of that name', () => {
    const fishVertex = (code: string) => returns(code).slice(0, 2).map((s) => returnTable(s, SURFACE_SIZES));
    for (const k of ['Fish', 'FishFade', 'FishProps', 'FishPropsFade']) {
      const g = graph(made[k]!);
      const [world, vary] = fishVertex(g.wgsl.vertex);
      const at = (n: Any, table: string[][]) => {
        const s = slotOf(n);
        return [...s.comps].map((c) => table[s.col]!['xyzw'.indexOf(c)]);
      };
      const check = (n: Any, outSel: number, want: string[]) => {
        const s = slotOf(n);
        expect(Number(raw(s.call.parameters.twOut).value)).toBe(outSel);
        expect(at(n, outSel ? vary! : world!)).toEqual(want);
      };
      check(g.vertex.position, 0, ['twWp.x', 'twWp.y', 'twWp.z']);
      check(g.vertex.normal, 0, ['twWn.x', 'twWn.y', 'twWn.z']);
      check(g.vertex.previous, 0, ['twPwp.x', 'twPwp.y', 'twPwp.z']);
      check(g.vertex.varyings.vFishLocal, 1, ['o.vFishLocal.x', 'o.vFishLocal.y', 'o.vFishLocal.z']);
      check(g.vertex.varyings.vFishData, 1, ['o.vFishData.x', 'o.vFishData.y', 'o.vFishData.z', 'o.vFishData.w']);
      check(g.vertex.varyings.vFishInfo, 1, ['o.vFishInfo.x', 'o.vFishInfo.y', 'o.vFishInfo.z', 'o.vFishInfo.w']);
      check(g.vertex.varyings.vFishFlags, 1, ['o.vFishFlags.x', 'o.vFishFlags.y', 'o.vFishFlags.z', 'o.vFishFlags.w']);
      const fadeNode = raw(g.vertex.varyings.vFishFade);
      const fadeParts = (fadeNode.nodes ?? fadeNode.params ?? []).map((n: Any) => at(n, world!)[0]);
      expect(fadeParts).toEqual(['o.vFishFade.x', 'o.vFishFade.y']);
    }
    for (const k of ['Fish', 'FishProps', 'Whale']) {
      const g = graph(made[k]!);
      const table = returnTable(returns(g.wgsl.surface)[0]!, SURFACE_SIZES);
      const named: Record<string, string[]> = {
        albedo: ['s.albedo.x', 's.albedo.y', 's.albedo.z'],
        alpha: ['s.alpha'],
        normal: ['s.normal.x', 's.normal.y', 's.normal.z'],
        roughness: ['s.roughness'],
        translucency: ['s.translucency.x', 's.translucency.y', 's.translucency.z'],
        metalness: ['s.metalness'],
        ao: ['s.ao'],
        specularIntensity: ['s.specularIntensity'],
        clearcoat: ['s.clearcoat'],
        clearcoatRoughness: ['s.clearcoatRoughness'],
      };
      for (const [name, want] of Object.entries(named)) {
        const s = slotOf((g.surface as Any)[name]);
        expect([...s.comps].map((c) => table[s.col]!['xyzw'.indexOf(c)]), name).toEqual(want);
      }
    }
  });

  it('wires the material slots to the same named outputs (a roughness / metalness swap fails here)', () => {
    for (const [k, m] of Object.entries(made)) {
      const s = graph(m).surface;
      expect(m).toBeInstanceOf(MeshPhysicalNodeMaterial);
      expect(m.colorNode).toBe(s.albedo);
      expect(m.roughnessNode).toBe(s.roughness);
      expect(m.metalnessNode).toBe(s.metalness);
      expect(m.aoNode).toBe(s.ao);
      expect(m.specularIntensityNode).toBe(s.specularIntensity);
      expect(m.positionNode).toBe(graph(m).vertex.position);
      if (k.startsWith('FishProps')) {
        expect(m.clearcoatNode).toBe(s.clearcoat);
        expect(m.clearcoatRoughnessNode).toBe(s.clearcoatRoughness);
        expect(m.maskShadowNode).toBeTruthy();
      } else expect(m.clearcoatNode).toBeNull();
      // emissive = translucency * sun colour; normal = view( normalize( s.normal ) )
      const em = raw(m.emissiveNode);
      expect([em.op, raw(em.aNode)]).toEqual(['*', raw(s.translucency)]);
      const nv = JSON.stringify(Object.keys(raw(m.normalNode)));
      expect(nv.length).toBeGreaterThan(2);
      expect([m.roughness, m.metalness, m.side]).toEqual([graph(m).options.roughness, graph(m).options.metalness, THREE.FrontSide]);
    }
  });

  it('binds the whale rig to the whale\'s own uniform arrays', () => {
    const p = slotOf(graph(made.Whale!).vertex.position).call.parameters;
    expect(raw(p.twWhalePos).array).toBe(whale.uPos.array);
    expect(raw(p.twWhaleRot).array).toBe(whale.uRot.array);
    expect(raw(p.twWhaleFlip).array).toBe(whale.uFlip.array);
    for (const mesh of whale.meshes) expect(mesh.material).toBe(made.Whale);
    const sp = slotOf(graph(made.Whale!).surface.albedo).call.parameters;
    (whale.material.uniforms.whaleWater as Any).value = 1.25;
    (whale.material.uniforms.whaleWet as Any).value = 0.5;
    for (const [k, want] of [['twWater', 1.25], ['twWet', 0.5]] as const) {
      const u = raw(sp[k]);
      u.updateType = u.updateType ?? 'render';
      u.update?.({ frameId: 1 });
      expect(u.value).toBe(want);
    }
  });
});

describe('Tidewater marine shading: the drawable batch', () => {
  it('draws each kind from the merged buffers with its own index range and count', () => {
    for (const batch of [fishBatch, propBatch]) {
      const src = batch.geometry.index!.array;
      batch.kinds.forEach((_, k) => {
        const g = batch.kindGeometries[k]!;
        expect([g.drawRange.start, g.drawRange.count]).toEqual([batch.firstIndex[k], batch.indexCount[k]]);
        for (let i = batch.firstIndex[k]!; i < batch.firstIndex[k]! + batch.indexCount[k]!; i++)
          expect(g.index!.array[i]).toBe(src[i]! + batch.baseVertex[k]!);
        for (const a of ['position', 'normal', 'aData', 'aKind']) expect(g.attributes[a]).toBe(batch.geometry.attributes[a]);
      });
    }
    const meshes = marineKindMeshes(fishMesh);
    expect(meshes.map((m) => m.userData.channel)).toEqual(['main', 'main', 'main', 'main']);
    expect(fishMesh.renderOrder).toBe(MARINE_DRIVER_ORDER);
    expect((fishMesh as Any).count).toBe(0);
    fishBatch.begin();
    fishBatch.add(0, 2);
    fishBatch.add(0, 4);
    fishBatch.add(2, 1);
    fishBatch.add(3, 5);
    fishBatch.addFade(1, 3, 0.5, true);
    fishBatch.commit();
    const mainScene = new THREE.Scene(), shadowScene = new THREE.Scene();
    (shadowScene as Any).overrideMaterial = { isShadowPassMaterial: true };
    const counts = (scene: THREE.Scene, list: THREE.Mesh[]) =>
      list.map((m) => {
        m.onBeforeRender(null as Any, scene, null as Any, null as Any, null as Any, null as Any);
        return (m as Any).count;
      });
    expect(counts(mainScene, fishBatch.kindMeshes.main)).toEqual([2, 0, 1, 0]); // kind 3 is shadow only
    expect(counts(shadowScene, fishBatch.kindMeshes.main)).toEqual([0, 0, 0, 1]);
    expect(counts(mainScene, fishBatch.kindMeshes.fade)).toEqual([0, 1, 0, 0]);
    expect(fishBatch.kindMeshes.main.map((m) => m.castShadow)).toEqual([false, false, false, true]);
    expect(fishBatch.kindMeshes.fade.every((m) => !m.castShadow)).toBe(true);
    // the storage nodes hold what the unchanged ReefBatch code wrote
    const list = (fishBatch.listBuffer as MarineStorageBuffer).attribute.array;
    expect(Array.from(list.slice(0, 4))).toEqual([2, 4, 1, 5]);
    expect(Array.from((fishBatch.baseBuffer as MarineStorageBuffer).attribute.array.slice(0, 4))).toEqual([0, 2, 2, 3]);
    expect((fishBatch.fadeListBuffer as MarineStorageBuffer).attribute.array[0]).toBe((3 | (64 << 24) | 0x80000000) >>> 0);
    fishBatch.data.fill(0.25);
    fishBatch.upload();
    const inst = fishBatch.instanceBuffer as MarineStorageBuffer;
    expect(Array.from(inst.attribute.array.slice(0, 3))).toEqual([0.25, 0.25, 0.25]);
    expect(inst.attribute.updateRanges).toEqual([{ start: 0, count: fishBatch.data.length }]);
    expect(fishFadeMesh.visible).toBe(true);
    fishBatch.begin();
    fishBatch.commit();
    expect(fishFadeMesh.visible).toBe(false);
  });

  it('builds the village fish displays and the schools on the native batch', () => {
    const prevBatch = M.setMarineBatch(shading.Batch);
    const prevProps = props.setFishProps(M.FishProps);
    let frame = 0;
    const prevFrame = M.setMarineFrame(() => frame);
    try {
      const B = new geo.Builder();
      B.frame.makeTranslation(40, 1.2, -110);
      ['redSnapper', 'yellowtail', 'grunt', 'tuna'].forEach((s, i) => {
        props.fish(B, i * 0.3, 0.9, 0.1 * i, { species: s, len: 0.3, ry: i, curl: 0.2, jaw: 0.2, seed: i / 9 });
        props.fish(B, i * 0.2, 2.1, 0.5, { species: s, len: 0.35, pose: 'tail', kind: i % 2 ? 'split' : 'whole', seed: 0.1 * i });
      });
      props.iceBed(B, -1, 0.8, 0, 0.42, 0.3);
      props.lobster(B, 1, 0.85, 0, 1.1, 0.3, 0.6, 0.05);
      const fp = B.fishProps as M.FishProps;
      const mesh = fp.build();
      const batch = fp.batch as unknown as MarineShadingBatch;
      expect(batch.shading).toBe(shading);
      expect(mesh.name).toBe('village_fish');
      const kinds = marineKindMeshes(mesh);
      expect(kinds.length).toBe(batch.kinds.length * 2);
      const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 500);
      camera.position.set(40, 3, -104);
      camera.lookAt(40, 1, -110);
      frame++;
      mesh.onBeforeRender(null as Any, new THREE.Scene(), camera, null as Any, null as Any, null as Any);
      const drawn = batch.kindMeshes.main.reduce((n, m) => n + (m as Any).count, 0);
      expect(drawn).toBeGreaterThan(0);
      expect(materialsOf(mesh).every((m) => m instanceof MeshPhysicalNodeMaterial)).toBe(true);
      // fish schools: a reef without the bay
      const parent = new THREE.Group();
      const heightAt = (x: number, z: number) => -(0.5 + Math.max(0, z) * 0.12 + 3 * Math.sin(x * 0.05) * Math.cos(z * 0.07));
      const fish = new M.FishSchools({ parent, terrain: { heightAt }, center: new THREE.Vector3(-78, 0, 58), radius: 68, anchors: [[-80, 55]], seed: 23, bay: false });
      const fb = fish.batch as unknown as MarineShadingBatch;
      expect(fb.kindMeshes.main.length).toBe(fb.kinds.length);
      expect(fb.kindMeshes.fade.length).toBe(fb.kinds.length);
      camera.position.set(-78, -3, 40);
      camera.lookAt(-78, -5, 58);
      fish.update(1 / 60, null);
      fish.mesh.onBeforeRender({ domElement: { height: 800 } } as Any, new THREE.Scene(), camera, null as Any, null as Any, null as Any);
      expect(fb.visibleInstances).toBeGreaterThan(0);
      expect(fb.kindMeshes.main.reduce((n, m) => n + (m as Any).count, 0)).toBe(fb.visibleInstances);
      fish.dispose?.();
    } finally {
      M.setMarineBatch(prevBatch);
      props.setFishProps(prevProps);
      M.setMarineFrame(prevFrame);
    }
  });

  it('keeps the meshes at the origin and refuses an unloaded whale', () => {
    const w = new M.Whale({ scene: new THREE.Scene() });
    expect(() => shading.attachWhale(w)).toThrow(/load the whale/);
    const s2 = new MarineShading({ time: TSL.uniform(3) });
    s2.update(1);
    expect((s2.time as Any).value).toBe(3);
    const s3 = new MarineShading();
    s3.update(0.5);
    expect((s3.time as Any).value).toBe(0.5);
  });
});

function materialsOf(o: THREE.Object3D): THREE.Material[] {
  const out = new Set<THREE.Material>();
  o.traverse((c) => {
    if ((c as Any).userData?.channel) out.add((c as THREE.Mesh).material as THREE.Material);
  });
  return [...out];
}
