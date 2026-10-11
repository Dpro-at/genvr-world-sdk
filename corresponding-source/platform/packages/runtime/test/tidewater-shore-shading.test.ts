import { readFileSync } from 'node:fs';
import { DataTexture, DoubleSide, FrontSide, MeshPhysicalNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  PEBBLE_VERTEX_INPUTS,
  REEF_VERTEX_INPUTS,
  REEF_VERTEX_KINDS,
  SCAN_VERTEX_INPUTS,
  SHORE_COMMON_WGSL,
  SHORE_FN_PREFIX,
  SHORE_LOD_FADE_WGSL,
  SHORE_SURFACE_INPUTS,
  SHORE_SURFACE_KINDS,
  SHORE_SURFACE_TERRAIN,
  SHORE_SURFACE_TEXTURES,
  SHORE_SURFACE_WGSL,
  STANDARD_PRELUDE,
  TERRAIN_SHADING_WGSL,
  TERRAIN_UV_WGSL,
  ShoreShading,
  pebbleVertexSlots,
  reefRecordAttributes,
  reefVertexSlots,
  shoreShadingWgsl,
  shoreSurfaceSlots,
  surfaceEntryName,
  threadWgslParams,
  vertexEntryName,
  type ShoreSurfaceKind,
} from '../src/tidewater-shore/shore-shading.js';

// The ORIGINAL pinned Tidewater source (read only), evaluated by the GPU oracle script's `sourceShore`
// (Rocks.js, NatureMaterial.js, PebbleField.js, ScannedDebris.js, ReefMaterials.js and ReefBatch.js over the
// real Materials.js, TerrainShading.js, LODFade.js and common.js, with recording engine stubs), so the
// snippets compared below come from the source text, not from the ports.
/* eslint-disable @typescript-eslint/no-explicit-any -- evaluated source objects */
type Any = any;
const oracleUrl = new URL('../../../../tooling/tests/tidewater-shore-shading-gpu.mjs', import.meta.url).href;
const srcRoot = new URL('../../../../tooling/other-programs/tidewater/src/', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, srcRoot), 'utf8').replace(/\r\n/g, '\n');
let src: Any;
const wgsl = shoreShadingWgsl();
const ALL_TEXTURE_PARAMS = [...new Map(Object.values(SHORE_SURFACE_TEXTURES).flat().map((p) => [p[0], p])).values()];

/** Undoes the two mechanical rewrites (helper namespacing, texture parameter threading). */
const restore = (code: string) => {
  let out = code.split(SHORE_FN_PREFIX).join('');
  for (const [name, type] of ALL_TEXTURE_PARAMS) out = out.split(`,${name}: ${type}`).join('').split(`,${name}`).join('');
  return out;
};
const firstFn = (code: string) => code.match(/\bfn\s+(\w+)/)![1];
const paramsOf = (code: string) =>
  code
    .slice(code.indexOf('(') + 1, code.indexOf(')'))
    .split(',')
    .map((p) => p.split(':')[0]!.trim());

beforeAll(async () => {
  src = await (await import(/* @vite-ignore */ oracleUrl)).sourceShore();
}, 60000);

describe('shore shading WGSL', () => {
  it('selects each generated entry as the first function (wgslFn calls the first declaration)', () => {
    for (const kind of SHORE_SURFACE_KINDS) {
      const code = wgsl.surfaces[kind];
      expect(firstFn(code)).toBe(surfaceEntryName(kind));
      const m = src.materials[kind];
      expect(paramsOf(code)).toEqual([
        ...SHORE_SURFACE_INPUTS,
        ...Object.keys(m.varyings).map((k) => 'tw' + k[0]!.toUpperCase() + k.slice(1)),
        ...SHORE_SURFACE_TERRAIN[kind],
        ...SHORE_SURFACE_TEXTURES[kind].map((p) => p[0]),
      ]);
      expect(code.slice(0, code.indexOf('{'))).toContain('-> mat4x4f');
    }
    expect(firstFn(wgsl.vertices.pebbles)).toBe(vertexEntryName('pebbles'));
    expect(paramsOf(wgsl.vertices.pebbles)).toEqual([...PEBBLE_VERTEX_INPUTS]);
    expect(firstFn(wgsl.vertices.scan)).toBe(vertexEntryName('scan'));
    expect(paramsOf(wgsl.vertices.scan)).toEqual([...SCAN_VERTEX_INPUTS]);
    for (const kind of REEF_VERTEX_KINDS) {
      expect(firstFn(wgsl.vertices[kind])).toBe(vertexEntryName(kind));
      expect(paramsOf(wgsl.vertices[kind])).toEqual([...REEF_VERTEX_INPUTS]);
    }
  });

  it('runs the original source snippets verbatim (surface with the standard() prelude, vertex)', () => {
    for (const kind of SHORE_SURFACE_KINDS) {
      const original = src.materials[kind].surface as string;
      expect(original.length, kind).toBeGreaterThan(1000);
      expect(restore(wgsl.surfaces[kind]), kind).toContain(original);
      // standard() materials carry the Materials.js prelude, the reef's engine Material does not
      expect(original.startsWith(STANDARD_PRELUDE), kind).toBe(!kind.startsWith('reef'));
    }
    expect(restore(wgsl.vertices.pebbles)).toContain(src.materials.pebbles.vertex);
    expect(restore(wgsl.vertices.scan)).toContain(src.materials.scan.vertex);
    for (const kind of REEF_VERTEX_KINDS) {
      expect(src.materials[kind].vertex.length).toBeGreaterThan(1500);
      expect(restore(wgsl.vertices[kind]), kind).toContain(src.materials[kind].vertex);
    }
    // the record reads of the reef vertex snippet are ReefBatch.record( 'index' ) of the source
    expect(src.materials.reefHard.vertex).toContain(src.record('reefHard', 'index')[3]);
    expect(src.batches.hard.prefix).toBe('reefHard');
    expect(src.batches.soft.prefix).toBe('reefSoft');
    // vertex snippets that only copy attributes into varyings run as three attribute varyings
    expect(src.materials.rocks.vertex).toBe('o.vLod = v.iLod; o.vCav = v.ao;');
    expect(src.materials.nature.vertex).toBe('\to.vTint = v.tint;\n\to.vData = v.vdata;\n');
    expect(src.materials.scan.vertex).toContain('o.vIData = v.iData;');
    const own = readFileSync(new URL('../src/tidewater-shore/shore-shading.ts', import.meta.url), 'utf8');
    for (const a of ["t.attribute('iLod', 'vec2')", "t.attribute('ao', 'float')", "t.attribute('tint', 'vec3')", "t.attribute('vdata', 'vec4')", "t.attribute('iData', 'vec4')"])
      expect(own).toContain(a);
    // the shadow hooks become maskShadowNode (the same LOD dither)
    expect(src.materials.rocks.shadow).toBe('if ( ! lodFadeVisible( in.pixel, in.vs.vLod.x, in.vs.vLod.y > 0.5 ) ) { discard; }\n\treturn true;');
    expect(src.materials.scan.shadow.trim()).toBe('return lodFadeVisible( in.pixel, in.vs.vIData.z, in.vs.vIData.w > 0.5 );');
  });

  it('copies the engine and source modules verbatim', () => {
    const common = read('engine/render/wgsl/common.js');
    const code = common.slice(common.indexOf('code: /* wgsl */`') + 17, common.lastIndexOf('`,'));
    expect(code).toBe(src.modules.common);
    expect(SHORE_COMMON_WGSL).toBe(code.slice(0, code.indexOf('// ---- depth')) + code.slice(code.indexOf('// ---- hashes')));
    expect(SHORE_COMMON_WGSL).not.toMatch(/\bframe\./);
    expect(SHORE_SURFACE_WGSL).toBe('\n' + src.engine.surfaceStruct + '\n' + src.engine.defaultSurface + '\n');
    expect(SHORE_LOD_FADE_WGSL).toBe(src.modules.lodFade);
    expect(TERRAIN_SHADING_WGSL).toBe(src.modules.terrainShading);
    expect(TERRAIN_UV_WGSL).toBe('\n' + src.engine.terrainUv + '\n');
    for (const kind of ['rocks', 'nature', 'pebbles'] as const) expect(restore(wgsl.surfaces[kind])).toContain(src.modules.terrainShading);
    for (const kind of ['nature', 'pebbles'] as const) expect(restore(wgsl.surfaces[kind])).toContain(src.modules.stone);
    expect(restore(wgsl.surfaces.pebbles)).toContain(src.modules.pebble);
    expect(restore(wgsl.vertices.pebbles)).toContain(src.modules.pebble);
    expect(restore(wgsl.vertices.pebbles)).toContain(src.engine.terrainUv);
    for (const kind of ['reefHard', 'reefSoft', 'reefHardFade', 'reefSoftFade'] as const) {
      expect(restore(wgsl.surfaces[kind])).toContain(src.modules.reefCommon);
      expect(restore(wgsl.surfaces[kind])).toContain(src.modules.frag);
      expect(restore(wgsl.vertices[kind])).toContain(src.modules.surge);
      expect(restore(wgsl.vertices[kind])).toContain(src.modules.reefCommon);
    }
    for (const kind of SHORE_SURFACE_KINDS) {
      expect(restore(wgsl.surfaces[kind])).toContain(SHORE_COMMON_WGSL);
      expect(restore(wgsl.surfaces[kind])).toContain(SHORE_SURFACE_WGSL);
    }
  });

  it('threads module-scope textures and namespaces helpers, both reversibly', () => {
    expect(
      threadWgslParams('fn e( a: f32, T: texture_2d<f32> ) -> f32 { return f( a ); }\nfn f( x: f32 ) -> f32 {\n\t// T\n\treturn g( x ) + textureLoad( T, vec2i( 0 ), 0 ).x;\n}\nfn g( x: f32 ) -> f32 { return x; }\n', 'T', 'texture_2d<f32>'),
    ).toBe('fn e( a: f32, T: texture_2d<f32> ) -> f32 { return f( a ,T); }\nfn f( x: f32 ,T: texture_2d<f32>) -> f32 {\n\t// T\n\treturn g( x ) + textureLoad( T, vec2i( 0 ), 0 ).x;\n}\nfn g( x: f32 ) -> f32 { return x; }\n');
    // the helpers that read a module-scope texture get it as a parameter
    expect(wgsl.surfaces.rocks).toContain(`fn ${SHORE_FN_PREFIX}terrainDetailGrad( uv: vec2f, gx: vec2f, gy: vec2f ,terrainDetailTex: texture_2d<f32>,smpAniso4Repeat: sampler)`);
    expect(wgsl.surfaces.rocks).toMatch(/twShore_terrainRockSurface\( p, N, p\.y, mcr, 0\.5, 1\.0, g ,terrainDetailTex,smpAniso4Repeat\)/);
    expect(wgsl.surfaces.reefHard).toContain(`fn ${SHORE_FN_PREFIX}reefVol( p: vec3f ,reefNoise: texture_3d<f32>,smpLinearRepeat: sampler)`);
    for (const kind of SHORE_SURFACE_KINDS) {
      const code = wgsl.surfaces[kind];
      // no source helper keeps its global name (three's shadow code declares some of the same names)
      for (const name of ['interleavedGradientNoise', 'vogelDiskSample', 'sat', 'defaultSurface'])
        expect(code, kind + ' ' + name).not.toMatch(new RegExp(`\\bfn ${name}\\(`));
      expect(restore(code)).not.toContain(SHORE_FN_PREFIX);
    }
  });

  it('injects the terrain lookups once per snippet, at the fragment / slot xz', () => {
    const calls = (s: string, fn: string) => [...s.matchAll(new RegExp(`\\b${fn}\\(([^)]*)\\)`, 'g'))].map((m) => m[1]!.trim());
    for (const kind of ['rocks', 'nature', 'pebbles', 'scan'] as ShoreSurfaceKind[]) {
      expect(calls(src.materials[kind].surface, 'terrainHeightAt'), kind).toEqual(['p.xz']);
      expect(SHORE_SURFACE_TERRAIN[kind]).toContain('twGround');
    }
    expect(calls(src.materials.rocks.surface, 'terrainSplat')).toEqual(['p.xz']);
    for (const kind of ['nature', 'pebbles', 'scan'] as ShoreSurfaceKind[]) expect(calls(src.materials[kind].surface, 'terrainSplat')).toEqual([]);
    for (const kind of ['reefHard', 'reefSoft'] as ShoreSurfaceKind[]) expect(calls(src.materials[kind].surface, 'terrainHeightAt')).toEqual([]);
    expect(calls(src.materials.pebbles.vertex, 'terrainHeightAt')).toEqual(['xz']);
    expect(src.materials.pebbles.vertex).toContain('let xz = cell + slot.xy;');
    // the injected stub returns the value the entry was given
    expect(wgsl.surfaces.rocks).toContain('twTerrainHeight = twGround;');
    expect(wgsl.surfaces.rocks).toContain('twTerrainSplat = twSplat;');
    expect(wgsl.vertices.pebbles).toContain('twTerrainHeight = twGround;');
  });

  it('seeds the surface like the engine surfaceOf and the material uniforms', () => {
    const num = (code: string, field: string) => Number(code.match(new RegExp(`s\\.${field} = ([-0-9.e]+);`))![1]);
    for (const kind of SHORE_SURFACE_KINDS) {
      const code = wgsl.surfaces[kind];
      const u = src.materials[kind].uniforms;
      expect(num(code, 'roughness'), kind).toBe(u.roughness.value);
      expect(num(code, 'metalness'), kind).toBe(u.metalness.value);
      expect(u.color.value.r + u.color.value.g + u.color.value.b).toBe(3);
      expect(code).toContain('var s = ' + SHORE_FN_PREFIX + 'defaultSurface( in.N );');
      expect(code).toContain('s.albedo = vec3f( 1.0 ) * in.color.rgb;');
      expect(code).toContain('s.alpha = 1.0 * in.color.a;');
    }
    expect(src.engine.surfaceOf).toContain('s.albedo = mat.color * in.color.rgb;');
  });

  it('maps the packed return columns onto the named Surface slots (catches swapped slots)', () => {
    const fake = (n: number) => ({ element: (c: number) => ({ xyz: `${n}:${c}.xyz`, w: `${n}:${c}.w`, x: `${n}:${c}.x`, y: `${n}:${c}.y`, z: `${n}:${c}.z` }) });
    // what each column of the generated return statement holds
    const columns = (code: string) => {
      const ret = code.match(/return mat4x4f\( (.*) \);/)![1]!;
      return [...ret.matchAll(/vec4f\( ([^()]*(?:\([^()]*\)[^()]*)*) \)/g)].map((m) =>
        m[1]!.split(/, (?![^(]*\))/).map((s) => s.trim()),
      );
    };
    const fieldAt = (cols: string[][], ref: string) => {
      const [, c, sw] = ref.match(/^\d+:(\d):(\w+)$/) ?? ref.match(/^\d+:(\d)\.(\w+)$/)!;
      const col = cols[Number(c)]!;
      if (sw === 'xyz') return col[0];
      if (sw === 'w') return col[col.length - 1];
      return col[{ x: 0, y: 1, z: 2 }[sw as 'x' | 'y' | 'z']];
    };
    const expected: Record<string, string> = {
      albedo: 's.albedo',
      alpha: 's.alpha',
      normalWorld: 's.normal',
      roughness: 's.roughness',
      translucency: 's.translucency',
      metalness: 's.metalness',
      ao: 's.ao',
      specularIntensity: 's.specularIntensity',
      emissiveLength: `length( s.emissive )`,
      envIntensity: 's.envIntensity',
    };
    const slots = shoreSurfaceSlots(fake(0)) as unknown as Record<string, string>;
    for (const kind of SHORE_SURFACE_KINDS) {
      const cols = columns(wgsl.surfaces[kind]);
      for (const [slot, field] of Object.entries(expected)) expect(fieldAt(cols, slots[slot]!), `${kind} ${slot}`).toBe(field);
    }
    const reefSlots = reefVertexSlots({ element: fake(0).element }) as unknown as Record<string, unknown>;
    const reefCols = columns(wgsl.vertices.reefHard).concat([['o.vReefData']]);
    expect(fieldAt(reefCols, reefSlots.worldPos as string)).toBe('v.worldPos');
    expect(fieldAt(reefCols, reefSlots.worldNormal as string)).toBe('v.worldNormal');
    expect(fieldAt(reefCols, reefSlots.local as string)).toBe('o.vReefLocal');
    expect(wgsl.vertices.reefHard).toMatch(/return mat4x4f\( vec4f\( v\.worldPos, o\.vReefInfo\.x \), vec4f\( v\.worldNormal, o\.vReefInfo\.y \), vec4f\( o\.vReefLocal, o\.vReefInfo\.z \), o\.vReefData \);/);
    const peb = pebbleVertexSlots(fake(0)) as unknown as Record<string, string>;
    const pebCols = columns(wgsl.vertices.pebbles);
    expect(fieldAt(pebCols, peb.position!)).toBe('v.position');
    expect(fieldAt(pebCols, peb.normal!)).toBe('v.normal');
    expect(wgsl.vertices.pebbles).toContain('o.vPebble, vec4f( 0.0 ) );');
  });
});

describe('shore shading materials', () => {
  it('builds native node materials with the source pass state and puts every slot on its node slot', () => {
    const tex = () => new DataTexture(new Uint8Array(4), 1, 1);
    const shading = new ShoreShading({ pebbleMask: tex(), scanTextures: { albedo: tex(), normal: tex(), arm: tex() } });
    const byKind: Record<ShoreSurfaceKind, MeshStandardNodeMaterial | MeshPhysicalNodeMaterial | null> = {
      rocks: shading.rocks,
      nature: shading.nature,
      pebbles: shading.pebbles,
      scan: shading.scan,
      reefHard: shading.reefHard,
      reefSoft: shading.reefSoft,
      reefHardFade: shading.reefHardFade,
      reefSoftFade: shading.reefSoftFade,
    };
    for (const kind of SHORE_SURFACE_KINDS) {
      const mat = byKind[kind]!;
      expect(mat.name).toBe(src.materials[kind].name);
      const slots = mat.userData.shoreSlots;
      expect(mat.colorNode).toBe(slots.albedo);
      expect(mat.roughnessNode).toBe(slots.roughness);
      expect(mat.metalnessNode).toBe(slots.metalness);
      expect(mat.aoNode).toBe(slots.ao);
      expect(mat.normalNode).toBeTruthy();
      expect(mat.emissiveNode).toBeTruthy();
      const reef = kind.startsWith('reef');
      expect(mat).toBeInstanceOf(reef ? MeshPhysicalNodeMaterial : MeshStandardNodeMaterial);
      if (reef) expect((mat as MeshPhysicalNodeMaterial).specularIntensityNode).toBe(slots.specularIntensity);
      const soft = src.materials[kind].side === 'double';
      expect(mat.side).toBe(soft ? DoubleSide : FrontSide);
      expect(mat.alphaTest).toBe(src.materials[kind].uniforms.alphaTest.value);
      expect(mat.opacityNode).toBe(soft ? slots.alpha : null);
      expect(!!mat.positionNode, kind).toBe(['pebbles', 'scan'].includes(kind) || reef);
      expect(!!mat.maskShadowNode, kind).toBe(['rocks', 'nature', 'scan', 'reefHard', 'reefHardFade'].includes(kind));
    }
    expect(shading.materials).toHaveLength(8);
    shading.update(0.5);
    expect(shading.time.value).toBe(0.5);
    expect(shading.dt.value).toBe(0.5);
    shading.dispose();
    // without a pebble mask or scan atlases those two are not built
    const plain = new ShoreShading();
    expect(plain.pebbles).toBeNull();
    expect(plain.scan).toBeNull();
    expect(plain.materials).toHaveLength(6);
    plain.dispose();
  });

  it('reads the reef records in the ReefBatch data layout (16 floats per instance)', () => {
    const data = new Float32Array(32).map((_, i) => i);
    const a = reefRecordAttributes(data);
    expect(Object.keys(a)).toEqual(['iReefRecord0', 'iReefRecord1', 'iReefRecord2', 'iReefRecord3']);
    for (let k = 0; k < 4; k++) {
      const attr = a['iReefRecord' + k]!;
      expect(attr.count).toBe(2);
      expect([attr.getX(1), attr.getY(1), attr.getZ(1), attr.getW(1)]).toEqual([16 + k * 4, 17 + k * 4, 18 + k * 4, 19 + k * 4]);
    }
    expect((a.iReefRecord0!.data as unknown as { isInstancedInterleavedBuffer: boolean }).isInstancedInterleavedBuffer).toBe(true);
  });
});
