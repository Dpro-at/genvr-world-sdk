import { readFileSync } from 'node:fs';
import { DoubleSide } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import {
  bakeKernelWgsl,
  COMMON_RENAMES,
  COMMON_WGSL,
  createPropShadingMaterial,
  createVillageShadingMaterials,
  disposeVillageTextures,
  neutralVillageTextures,
  propSurfaceWgsl,
  stallSurfaceWgsl,
  threadArguments,
  villageEntryName,
  villageHelpersWgsl,
  villageSurfaceWgsl,
  villageVertexWgsl,
} from '../src/tidewater-village/village-shading.js';
import { villageMaterialSpecs } from '../src/tidewater-village/materials.js';
import { SETS, villageBakePlan } from '../src/tidewater-village/texture-baker.js';

// Original Tidewater sources (read only), evaluated with recording stubs like the GPU parity script.
const src = (p: string) =>
  readFileSync(new URL('../../../../tooling/other-programs/tidewater/src/' + p, import.meta.url), 'utf8');
const strip = (code: string) =>
  code
    .replace(/^import[\s\S]*?from\s*['"][^'"]+['"];?[ \t]*$/gm, '')
    .replace(/^export\s+(?=(const|function|class|let)\b)/gm, '');
const compact = (s: string) => s.replace(/\s+/g, '');
class ShaderModule {
  constructor(o: object) {
    Object.assign(this, o);
  }
}
interface Recorded {
  params: Record<string, unknown> & { textures: Record<string, string>; vertex: string; roughness: number; metalness: number };
  surface: string;
  defines: Record<string, number>;
}
const record = (p: Recorded['params']) => ({
  params: p,
  modules: [...((p as { modules?: unknown[] }).modules ?? [])],
  defines: {} as Record<string, number>,
  setDefine(this: { defines: Record<string, number> }, k: string, v: number) {
    this.defines[k] = v;
  },
});
type Fn = (...a: unknown[]) => unknown;
const sourceVillage = (
  new Function(
    'DoubleSide',
    'ShaderModule',
    'commonModule',
    'standard',
    'VillageTextures',
    strip(src('world/village/VillageMaterials.js')) + '\nreturn createVillageMaterials();',
  ) as Fn
)(
  'double',
  ShaderModule,
  { name: 'common' },
  record,
  class {
    textures = new Proxy({}, { get: (_, k) => k });
  },
) as Record<string, Recorded>;
const gm = src('game/GameMaterials.js');
const sourceProp = (
  new Function(
    'ShaderModule',
    'commonModule',
    'standard',
    strip(gm.slice(gm.indexOf('const gameModule'), gm.indexOf('export function createLineMaterial'))) +
      '\nreturn createPropMaterial( "gameProp", {} );',
  ) as Fn
)(ShaderModule, { name: 'common' }, record) as Recorded;
const sk = src('game/StallKit.js');
const stub = new Proxy({}, { get: () => new Proxy({}, { get: () => ({}) }) });
const sourceStall = (
  new Function(
    'ShaderModule',
    'commonModule',
    'standard',
    'assets',
    strip(sk.slice(sk.indexOf('const kitModule'), sk.indexOf('const _m = new Matrix4()'))) +
      '\nreturn createStallMaterial( assets );',
  ) as Fn
)(ShaderModule, { name: 'common' }, record, stub) as Recorded;

/** Production text back in source form: common helpers un-renamed, threaded helper arguments removed. */
const asSource = (code: string) => {
  let out = code
    .replaceAll(', frame,vlgGrime,smpAnisoRepeat ', '')
    .replaceAll(', vlgGrime,smpAnisoRepeat ', '');
  for (const [from, to] of Object.entries(COMMON_RENAMES)) out = out.replace(new RegExp(`\\b${to}\\b`, 'g'), from);
  return out;
};
const firstFn = (code: string) => code.match(/fn\s+(\w+)/)?.[1];
const specs = villageMaterialSpecs();

describe('village shading entries', () => {
  it('select the intended entry as the first function of every wgslFn', () => {
    for (const spec of Object.values(specs)) {
      const code = villageSurfaceWgsl(spec);
      expect(firstFn(code.entry)).toBe(villageEntryName(spec));
      expect(code.entry.match(/\bfn\s+\w+/g)).toHaveLength(1);
      expect(code.entry).toContain('return mat4x4f(');
      // the helper include never defines the entry
      expect(code.helpers).not.toMatch(new RegExp(`fn\\s+${villageEntryName(spec)}\\b`));
    }
    expect(firstFn(propSurfaceWgsl().entry)).toBe('twvPropShade');
    expect(firstFn(stallSurfaceWgsl().entry)).toBe('twvStallShade');
    expect(firstFn(villageVertexWgsl(specs.fabric)!)).toBe('twvVillageFabricVertex');
    expect(firstFn(villageVertexWgsl(specs.net)!)).toBe('twvVillageNetVertex');
    for (const key of ['wood', 'roofMetal', 'thatch', 'hard', 'stone'] as const)
      expect(villageVertexWgsl(specs[key])).toBeNull();
  });

  it('contain every original source surface snippet verbatim (after renames and threading)', () => {
    for (const [key, spec] of Object.entries(specs)) {
      const source = sourceVillage[key]!;
      const prod = compact(asSource(villageSurfaceWgsl(spec).entry));
      expect(prod).toContain(compact(source.surface));
      // the source standard() PBR parameters seed the surface (MeshShader.js surfaceOf)
      expect(prod).toContain(`s.roughness=${String(source.params.roughness).replace(/^(\d+)$/, '$1.0')};`);
      expect(prod).toContain(`s.metalness=${String(source.params.metalness).replace(/^(\d+)$/, '$1.0')};`);
      expect(Object.keys(spec.textures)).toEqual(Object.keys(source.params.textures));
      const vertex = villageVertexWgsl(spec);
      const sourceVertex = source.params.vertex.replace(/\s*o\.\w+ = v\.\w+;/g, '');
      if (vertex) expect(compact(vertex)).toContain(compact(sourceVertex));
      else expect(sourceVertex.trim()).toBe('');
    }
    expect(compact(asSource(propSurfaceWgsl().entry))).toContain(compact(sourceProp.surface));
    expect(compact(asSource(stallSurfaceWgsl().entry))).toContain(compact(sourceStall.surface));
  });

  it('keeps the original engine helpers (common.js) under their new names', () => {
    const common = src('engine/render/wgsl/common.js');
    const block = (anchor: string) => {
      const a = common.indexOf(anchor);
      let i = common.indexOf('{', a),
        d = 0;
      for (; i < common.length; i++) {
        if (common[i] === '{') d++;
        else if (common[i] === '}' && --d === 0) break;
      }
      return common.slice(a, i + 1);
    };
    const back = compact(asSource(COMMON_WGSL));
    for (const anchor of ['fn sat(', 'fn luminance(', 'fn perturbNormalByMap(']) expect(back).toContain(compact(block(anchor)));
  });

  it('threads texture and frame bindings through the helpers, nested calls included', () => {
    const helpers = villageHelpersWgsl();
    expect(helpers).toMatch(/fn vlmTidal\( pw: vec3f, col: vec3f, rough: f32 , vlgGrime:texture_2d<f32>,smpAnisoRepeat:sampler \)/);
    expect(helpers).toMatch(/lit: f32 , frame:TwvFrame,vlgGrime:texture_2d<f32>,smpAnisoRepeat:sampler \)/);
    const wood = villageSurfaceWgsl(specs.wood).entry;
    expect(wood).toContain('vlmTidal( in.P, col, rough , vlgGrime,smpAnisoRepeat )');
    expect(wood).toContain('vlmGlass( in.uv, aTint, seed, paint, weather , frame,vlgGrime,smpAnisoRepeat )');
    expect(villageSurfaceWgsl(specs.hard).entry).toContain(
      'vlmTidal( in.P, mix( hardCol, ropeCol, isRope ), mix( hardRough, 0.93, isRope ) , vlgGrime,smpAnisoRepeat )',
    );
    expect(threadArguments('fn f( a: f32 ) {} let x = f( g( 1, 2 ) ) + f(3);', 'f', 'b: u32', 'c')).toBe(
      'fn f( a: f32 , b: u32 ) {} let x = f( g( 1, 2 ) , c ) + f(3, c );',
    );
    // entry parameters are prefixed: the snippets declare `let uv`, `let P`, `let uv2`
    for (const code of [villageSurfaceWgsl(specs.stone).entry, stallSurfaceWgsl().entry, propSurfaceWgsl().entry]) {
      const params = code.slice(code.indexOf('(') + 1, code.indexOf(')->'));
      for (const p of params.split(',')) expect(p).toMatch(/^(twv_|vlg|sk|smp)/);
    }
  });
});

describe('village shading materials', () => {
  it('builds the seven materials with the source render state', () => {
    const mats = createVillageShadingMaterials(neutralVillageTextures());
    expect(Object.keys(mats)).toEqual(['wood', 'roofMetal', 'thatch', 'hard', 'stone', 'fabric', 'net']);
    expect(mats.fabric.side).toBe(DoubleSide);
    expect(mats.fabric.alphaTest).toBe(0.5);
    expect(mats.fabric.positionNode).toBeTruthy();
    expect(mats.net.transparent).toBe(true);
    expect(mats.net.depthWrite).toBe(false);
    expect(mats.net.opacityNode).toBeTruthy();
    expect(mats.wood.opacityNode).toBeFalsy();
    expect(mats.wood.positionNode).toBeFalsy();
    for (const m of Object.values(mats)) expect(m.normalNode && m.roughnessNode && m.aoNode && m.emissiveNode).toBeTruthy();
    const prop = createPropShadingMaterial('rod', { clearcoat: true });
    expect((prop as unknown as { clearcoatNode: unknown }).clearcoatNode).toBeTruthy();
  });
});

describe('village texture maps', () => {
  it('disposes every map', () => {
    const maps = neutralVillageTextures();
    let disposed = 0;
    for (const tex of Object.values(maps)) tex.addEventListener('dispose', () => disposed++);
    disposeVillageTextures(maps);
    expect(disposed).toBe(14);
  });
});

describe('village texture bake kernels', () => {
  it('declares the source bindings and substitutes the workgroup size', () => {
    const plan = villageBakePlan();
    expect(plan).toHaveLength(SETS.length + SETS.filter((s) => s.nra).length);
    for (const k of plan) {
      const code = bakeKernelWgsl(k);
      expect(code).not.toMatch(/\bWG_[XYZ]\b/);
      expect(code).toContain('@compute @workgroup_size( 8, 8, 1 )');
      if (k.kind === 'derive') {
        expect(code).toContain('@group(0) @binding(0) var vlgFields: texture_2d<f32>;');
        expect(code).toContain('@group(0) @binding(1) var vlgNRA: texture_storage_2d<rgba8unorm, write>;');
      } else {
        const set = SETS.find((s) => s.name === k.set)!;
        expect(code).toContain('fn vlgPcg(');
        if (set.nra) expect(code).toContain('@group(0) @binding(0) var vlgOutFields: texture_storage_2d<rgba16float, write>;');
        if (set.out)
          expect(code).toContain(`@binding(${set.nra ? 1 : 0}) var vlgOutAlbedo: texture_storage_2d<rgba8unorm, write>;`);
      }
    }
  });
});
