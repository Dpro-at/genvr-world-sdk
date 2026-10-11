import { DirectionalLight, DoubleSide, FloatType, LinearFilter, MeshPhysicalNodeMaterial, NearestFilter, RedFormat, RGBAFormat, TSL, UnsignedByteType, Vector3 } from 'three/webgpu';
import { beforeAll, describe, expect, it } from 'vitest';
import { GrassField, grassMaterialOptions, type GrassMaterialOptions } from '../src/tidewater-grass/index.js';
import {
  GRASS_FN_PREFIX,
  GRASS_SURFACE_INPUTS,
  GRASS_VEG_WGSL,
  GRASS_VERTEX_INPUTS,
  GRASS_WIND_STUBS,
  ThreeGrassTexture,
  createGrassShadingMaterial,
  grassShadingFactory,
  grassShadingWgsl,
  grassSurfaceSlots,
  grassVertexSlots,
  namespaceGrassWgsl,
  threeGrassTextures,
} from '../src/tidewater-grass/grass-shading.js';
import { TidewaterWorldWind } from '../src/vegetation/world-wind.js';

// The ORIGINAL pinned Tidewater source (read only), evaluated by the GPU oracle script's `sourceGrass`
// (GrassField.js createGrassMaterial / grassModule over the real engine Material.js, bounded slices of
// VegNodes.js, common.js, MeshShader.js and lighting.js), so the snippets compared below come from the
// source text, not from the CPU port.
/* eslint-disable @typescript-eslint/no-explicit-any -- evaluated source objects and TSL nodes */
type Any = any;
const oracleUrl = new URL('../../../../tooling/tests/tidewater-grass-shading-gpu.mjs', import.meta.url).href;
let src: Any;
let TERRAIN: { res: number; size: number; texel: number; origin: number };
let options: GrassMaterialOptions;

const firstFn = (code: string) => code.match(/\bfn\s+(\w+)/)![1];
const paramsOf = (code: string) =>
  code
    .slice(code.indexOf('(') + 1, code.indexOf(')'))
    .split(',')
    .map((p) => p.split(':')[0]!.trim());
/** Undoes the one mechanical rewrite (helper namespacing). */
const restore = (code: string) => code.split(GRASS_FN_PREFIX).join('');

beforeAll(async () => {
  const mod = await import(/* @vite-ignore */ oracleUrl);
  TERRAIN = mod.TERRAIN;
  src = await mod.sourceGrass(TERRAIN);
  options = grassMaterialOptions({ terrain: TERRAIN, heightTex: null, maskTex: null });
}, 60000);

describe('grass shading WGSL', () => {
  it('puts the generated entry first in both strings, with the declared inputs', () => {
    const wgsl = grassShadingWgsl(options);
    expect(firstFn(wgsl.vertex)).toBe('twGrassVertex');
    expect(firstFn(wgsl.surface)).toBe('twGrassSurface');
    expect(paramsOf(wgsl.vertex)).toEqual(GRASS_VERTEX_INPUTS.map(([k]) => k));
    expect(paramsOf(wgsl.surface)).toEqual(GRASS_SURFACE_INPUTS.map(([k]) => k));
  });

  it('runs the ORIGINAL source snippets and modules verbatim (prefix undone)', () => {
    const wgsl = grassShadingWgsl(options);
    expect(src.material.vertex.length).toBeGreaterThan(4000);
    expect(restore(wgsl.vertex)).toContain(src.material.vertex);
    expect(restore(wgsl.surface)).toContain(src.material.surface);
    expect(restore(wgsl.vertex)).toContain(src.grassModule.code);
    expect(restore(wgsl.surface)).toContain(src.grassModule.code);
    // the source material state the entries seed (surfaceOf: roughness / metalness of the material)
    expect([src.material.roughness, src.material.metalness, src.material.side]).toEqual([0.8, 0, 'double']);
    expect(wgsl.surface).toContain('s.roughness = 0.8;');
    expect(wgsl.surface).toContain('s.metalness = 0.0;');
    // the attribute / varying layout of the source material
    expect(options.attributes).toEqual(src.material.attributes);
    expect(options.varyings).toEqual(src.material.varyings);
  });

  it('copies the vegModule helpers and common.js sat verbatim, and stubs exactly the source wind signatures', () => {
    for (const k of ['up', 'sat', 'hash', 'noise'] as const) expect(GRASS_VEG_WGSL, k).toContain(src.vegSlices[k]);
    for (const sig of ['fn vegWindStrength() -> f32', 'fn vegWindDir3() -> vec3f', 'fn vegWindPerp3() -> vec3f', 'fn vegGustAt( xz: vec2f ) -> f32']) {
      expect(src.vegSlices.wind).toContain(sig);
      expect(GRASS_WIND_STUBS).toContain(sig);
    }
    // the shared gust graph (vegetation/wind.ts) has the source formula; the snippet asks for the gust once, at
    // its own xz (= iCell.xy + aSlot.xy, where grassVertexInputs evaluates the graph)
    expect(src.vegSlices.wind).toContain('let n = textureSampleLevel( vegDetail, smpLinearRepeat, p / 140.0, 0.0 ).w * 0.62');
    expect(src.material.vertex.match(/vegGustAt\(/g)).toHaveLength(1);
    expect(src.material.vertex).toContain('let g = vegGustAt( xz );');
    expect(src.material.vertex).toContain('let xz = cell + slot.xy;');
    expect(src.material.vertex).toContain('let cell = v.iCell.xy;');
  });

  it('prefixes every helper (never the entry) so three helper names cannot collide', () => {
    const wgsl = grassShadingWgsl(options);
    for (const code of [wgsl.vertex, wgsl.surface]) {
      const names = [...code.matchAll(/\bfn\s+(\w+)/g)].map((m) => m[1]!);
      expect(names[0]!.startsWith(GRASS_FN_PREFIX)).toBe(false);
      for (const n of names.slice(1)) expect(n.startsWith(GRASS_FN_PREFIX), n).toBe(true);
      for (const n of ['sat', 'vegHash12', 'vegNoise', 'vegMeadowTone', 'vegGustAt']) expect(code).not.toMatch(new RegExp(`(?<!${GRASS_FN_PREFIX})\\b${n}\\s*\\(`));
    }
    expect(namespaceGrassWgsl('fn a() {}\nfn b() { a(); }')).toBe('fn a() {}\nfn twGrass_b() { a(); }');
  });

  it('maps the packed return columns onto the named slots (catches swapped slots)', () => {
    const wgsl = grassShadingWgsl(options);
    const fake = { element: (c: number) => ({ xyz: `${c}.xyz`, w: `${c}.w`, x: `${c}.x`, y: `${c}.y`, z: `${c}.z`, col: `${c}` }) };
    const columns = (code: string) => {
      const ret = code.match(/return mat4x4f\( (.*) \);/)![1]!;
      return ret.split(/, (?![^(]*\))/).map((c) => {
        const m = c.match(/^vec4f\( (.*) \)$/);
        return m ? m[1]!.split(/, (?![^(]*\))/).map((s) => s.trim()) : [c.trim()];
      });
    };
    const fieldAt = (cols: string[][], ref: unknown) => {
      if (typeof ref === 'object') return cols[Number((ref as { col: string }).col)]!.join();
      const [c, sw] = String(ref).split('.');
      const col = cols[Number(c)]!;
      if (sw === 'xyz') return col[0];
      if (sw === 'w') return col[col.length - 1];
      return col[{ x: 0, y: 1, z: 2 }[sw as 'x' | 'y' | 'z']];
    };
    const sCols = columns(wgsl.surface);
    const s = grassSurfaceSlots(fake) as unknown as Record<string, unknown>;
    const expected = {
      albedo: 's.albedo',
      alpha: 's.alpha',
      normalWorld: 's.normal',
      roughness: 's.roughness',
      translucency: 's.translucency',
      metalness: 's.metalness',
      specularIntensity: 's.specularIntensity',
      ao: 's.ao',
    };
    for (const [slot, field] of Object.entries(expected)) expect(fieldAt(sCols, s[slot]), slot).toBe(field);
    const vCols = columns(wgsl.vertex);
    const v = grassVertexSlots(fake, { x: 'hf', y: 'kind', z: 'rnd' }) as unknown as Record<string, unknown>;
    expect(fieldAt(vCols, v.worldPos)).toBe('v.worldPos');
    expect(fieldAt(vCols, v.worldNormal)).toBe('v.worldNormal');
    expect(fieldAt(vCols, v.vVegGust)).toBe('o.vVegGust');
    expect(fieldAt(vCols, v.vVegGrassTone)).toBe('o.vVegGrassTone');
    expect(fieldAt(vCols, v.vVegGrass2)).toBe('o.vVegGrass2');
    // vVegGrass rebuilt as the source writes it: vec4f( hf = aBlade.x, kind = aBlade.y, duneF, bRnd = aBlade.z )
    expect(src.material.vertex).toContain('o.vVegGrass = vec4f( hf, kind, duneF, bRnd );');
    expect(src.material.vertex).toMatch(/let hf = blade\.x;\s+let kind = blade\.y;\s+let bRnd = blade\.z;/);
    expect(fieldAt(vCols, '1.w')).toBe('o.vVegGrass.z');
  });
});

describe('grass shading material', () => {
  const bindings = () => ({
    wind: new TidewaterWorldWind(),
    time: TSL.uniform(0),
    mainCamera: TSL.uniform(new Vector3()),
    sun: new DirectionalLight(),
    sunDirection: TSL.uniform(new Vector3(0, 1, 0)),
    night: TSL.uniform(0),
  });

  it('puts every surface slot on its node slot of a double-sided physical node material', () => {
    const h = new ThreeGrassTexture({ label: 'grassHeights', width: 4, height: 4, format: 'r32float', data: new Float32Array(16) });
    const m = new ThreeGrassTexture({ label: 'grassMask', width: 4, height: 4, format: 'rgba8unorm', data: new Uint8Array(64), sampler: 'linearClamp' });
    const b = bindings();
    const mat = createGrassShadingMaterial(grassMaterialOptions({ terrain: TERRAIN, heightTex: h, maskTex: m }), b);
    expect(mat).toBeInstanceOf(MeshPhysicalNodeMaterial);
    expect(mat.name).toBe(src.material.name);
    expect(mat.side).toBe(DoubleSide);
    const slots = mat.userData.grassSlots;
    expect(mat.colorNode).toBe(slots.albedo);
    expect(mat.roughnessNode).toBe(slots.roughness);
    expect(mat.metalnessNode).toBe(slots.metalness);
    expect(mat.specularIntensityNode).toBe(slots.specularIntensity);
    expect(mat.aoNode).toBe(slots.ao);
    expect(mat.roughnessNode).not.toBe(mat.metalnessNode);
    expect(mat.normalNode).toBeTruthy();
    expect(mat.positionNode).toBeTruthy();
    expect(firstFn(mat.userData.grassWgsl.vertex)).toBe('twGrassVertex');
    // the source textures only: other texture handles are refused
    expect(() => createGrassShadingMaterial(grassMaterialOptions({ terrain: TERRAIN, heightTex: {}, maskTex: m }), b)).toThrow(/ThreeGrassTexture/);
    b.wind.dispose();
  });

  it('gives the field DataTextures in the source formats and one shared material for the three levels', () => {
    const res = 16,
      heights = new Float32Array(res * res).fill(1),
      mask = new Uint8Array(8 * 8 * 4).fill(255);
    const b = bindings();
    const field = new GrassField({ terrain: { res, size: 32, texel: 2, origin: -16, heights }, mask: { data: mask, res: 8 }, textures: threeGrassTextures, material: grassShadingFactory(b) });
    const ht = (field.heightTex as unknown as ThreeGrassTexture).texture,
      mt = (field.maskTex as unknown as ThreeGrassTexture).texture;
    expect([ht.format, ht.type, ht.minFilter, ht.magFilter, ht.image.width]).toEqual([RedFormat, FloatType, NearestFilter, NearestFilter, res]);
    expect([mt.format, mt.type, mt.minFilter, mt.magFilter, mt.image.width]).toEqual([RGBAFormat, UnsignedByteType, LinearFilter, LinearFilter, 8]);
    expect(field.meshes).toHaveLength(3);
    for (const mesh of field.meshes) expect(mesh.material).toBe(field.material);
    expect(field.material).toBeInstanceOf(MeshPhysicalNodeMaterial);
    expect(field.meshes.every((m) => !m.castShadow && m.receiveShadow && !m.frustumCulled)).toBe(true);
    // Vegetation.refreshTerrain re-upload through the three-style handle
    const v = ht.version;
    field.heightTex.needsUpdate = true;
    expect(ht.version).toBeGreaterThan(v);
    expect(ht.image.data).toBe(heights);
    field.dispose();
    b.wind.dispose();
  });
});
