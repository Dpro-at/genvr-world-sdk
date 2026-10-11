import { readFileSync } from 'node:fs';
import { DoubleSide, MeshPhysicalNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { BOAT_BUCKETS, BoatMaterialSpecs } from '../src/tidewater-boat/boat-materials.js';
import { BoatModel } from '../src/tidewater-boat/boat-model.js';
import {
  BOAT_COMMON_WGSL,
  BOAT_SURFACE_INPUTS,
  BOAT_VERTEX_INPUTS,
  BoatShading,
  boatShadingWgsl,
  shadeBoatModel,
} from '../src/tidewater-boat/boat-shading.js';

// The ORIGINAL pinned Tidewater source (read only): BoatMaterials.js evaluated over the real
// Materials.js (standard / physical with their WGSL preludes) and a minimal engine Material, so the
// snippets compared below come from the source, not from the port's BoatMaterialSpecs copy.
const src = new URL('../../../../tooling/other-programs/tidewater/src/', import.meta.url);
// (the source files are CRLF; template literals normalise to LF, so read them as LF too)
const read = (path: string) => readFileSync(new URL(path, src), 'utf8').replace(/\r\n/g, '\n');
const strip = (code: string) => code.replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/^export /gm, '');
const compact = (s: string) => s.replace(/\s+/g, '');
const srgbToLinear = (c: number) => (c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4));

/* eslint-disable @typescript-eslint/no-explicit-any -- evaluated source objects */
class EngineColor {
  r = 1;
  g = 1;
  b = 1;
  isColor = true;
  set(v: number) {
    this.r = srgbToLinear(((v >> 16) & 255) / 255);
    this.g = srgbToLinear(((v >> 8) & 255) / 255);
    this.b = srgbToLinear((v & 255) / 255);
    return this;
  }
  clone() {
    return Object.assign(new EngineColor(), this);
  }
}
class EngineMaterial {
  [k: string]: any;
  constructor(o: any = {}) {
    this.version = 0;
    this.name = o.name || '';
    this.vertex = o.vertex || '';
    this.surface = o.surface || '';
    this.output = o.output || '';
    this.defines = { ...(o.defines || {}) };
    this.side = o.side || 'front';
    this.transparent = !!o.transparent;
    this.depthWrite = o.depthWrite ?? !this.transparent;
    this.vertexColors = !!o.vertexColors;
    this.velocityWeight = o.velocityWeight ?? 1;
    const fields: Record<string, [string, unknown]> = {
      color: ['vec3f', null],
      opacity: ['f32', 1],
      emissive: ['vec3f', null],
      roughness: ['f32', 1],
      metalness: ['f32', 0],
      alphaTest: ['f32', 0],
      ...(o.uniforms || {}),
    };
    this.uniforms = {};
    for (const k in fields) this.uniforms[k] = { value: fields[k]![1] };
    this.uniforms.color.value = o.color === undefined ? new EngineColor() : new EngineColor().set(o.color);
    for (const k of ['roughness', 'metalness', 'opacity', 'alphaTest'])
      if (o[k] !== undefined) this.uniforms[k].value = o[k];
  }
  setDefine(k: string, v: number) {
    this.defines[k] = v;
  }
}
const { standard, physical } = new Function(
  'Material',
  'Color',
  strip(read('materials/Materials.js')) + '\nreturn { standard, physical };',
)(EngineMaterial, EngineColor);
const SourceBoatMaterials = new Function(
  'Vector3',
  'DoubleSide',
  'ShaderModule',
  'commonModule',
  'standard',
  'physical',
  strip(read('world/boat/BoatMaterials.js')) + '\nreturn BoatMaterials;',
)(
  class {
    constructor(
      public x = 0,
      public y = 0,
      public z = 0,
    ) {}
  },
  2,
  class {
    constructor(public o: any) {}
  },
  {},
  standard,
  physical,
);
const shape = { zAft: -4.05, length: 8.25 };
const source = new SourceBoatMaterials(shape);
const common = read('engine/render/wgsl/common.js');
const specs = new BoatMaterialSpecs(shape);
const wgsl = boatShadingWgsl(specs);
const ENTRY: Record<string, string> = {
  hull: 'twBoatHullSurface',
  gelcoat: 'twBoatGelcoatSurface',
  wood: 'twBoatWoodSurface',
  fittings: 'twBoatFittingsSurface',
  glass: 'twBoatGlassSurface',
  glow: 'twBoatGlowSurface',
  trap: 'twBoatTrapSurface',
};

describe('boat shading WGSL', () => {
  it('selects each generated entry as the first function (wgslFn calls the first declaration)', () => {
    for (const bucket of BOAT_BUCKETS) {
      const code = wgsl.surfaces[bucket];
      expect(code.match(/\bfn\s+(\w+)/)?.[1]).toBe(ENTRY[bucket]);
      const params = code.slice(code.indexOf('(') + 1, code.indexOf(')')).split(',');
      expect(params.map((p) => p.split(':')[0]!.trim())).toEqual([...BOAT_SURFACE_INPUTS]);
      expect(code).toContain('return mat4x4f(');
    }
    const vertex = wgsl.fittingsVertex;
    expect(vertex.match(/\bfn\s+(\w+)/)?.[1]).toBe('twBoatFittingsVertex');
    const params = vertex.slice(vertex.indexOf('(') + 1, vertex.indexOf(')')).split(',');
    expect(params.map((p) => p.split(':')[0]!.trim())).toEqual([...BOAT_VERTEX_INPUTS]);
    expect(vertex).toContain('return v.position;');
  });

  it('runs the original source snippets verbatim (surface, prelude-free) and the fittings vertex', () => {
    for (const bucket of BOAT_BUCKETS) {
      const original = source[bucket]._surface as string;
      expect(original.length).toBeGreaterThan(100);
      expect(wgsl.surfaces[bucket]).toContain(original);
    }
    expect(source.fittings.vertex.length).toBeGreaterThan(500);
    expect(wgsl.fittingsVertex).toContain(source.fittings.vertex);
    // the source boat module (helpers) is included verbatim
    const bm = read('world/boat/BoatMaterials.js');
    const moduleCode = bm.slice(bm.indexOf('code: /* wgsl */`') + 17, bm.indexOf('`,', bm.indexOf('code: /* wgsl */`')));
    expect(wgsl.surfaces.gelcoat).toContain(moduleCode);
    expect(wgsl.fittingsVertex).toContain(moduleCode);
  });

  it('copies the engine common functions it needs line for line', () => {
    const commonLines = new Set(common.split('\n').map(compact));
    const lines = BOAT_COMMON_WGSL.split('\n').map(compact).filter(Boolean);
    expect(lines.length).toBeGreaterThan(30);
    for (const line of lines) expect(commonLines.has(line), line).toBe(true);
    for (const fn of ['sat', 'mx_noise_float3', 'mx_fractal_noise_float3', 'perlin3', '_mxFinal', 'mxHash3'])
      expect(BOAT_COMMON_WGSL).toMatch(new RegExp(`\\bfn ${fn}\\(`));
  });

  it('seeds the surface like the engine surfaceOf and the Materials.js prelude', () => {
    const num = (code: string, field: string) => Number(code.match(new RegExp(`s\\.${field} = ([-0-9.e]+)`))![1]);
    for (const bucket of BOAT_BUCKETS) {
      const code = wgsl.surfaces[bucket];
      const u = source[bucket].uniforms;
      expect(num(code, 'roughness')).toBeCloseTo(u.roughness.value, 9);
      expect(num(code, 'metalness')).toBeCloseTo(u.metalness.value, 9);
      expect(num(code, 'alpha')).toBeCloseTo(u.opacity.value, 9);
      expect(num(code, 'clearcoat')).toBeCloseTo(u.clearcoat?.value ?? 0, 9);
      expect(num(code, 'clearcoatRoughness')).toBeCloseTo(u.clearcoatRoughness?.value ?? 0, 9);
      const c = code.match(/mat\.color = vec3f\( ([^,]+), ([^,]+), ([^ ]+) \)/)!;
      expect(Number(c[1])).toBeCloseTo(u.color.value.r, 7);
      expect(Number(c[2])).toBeCloseTo(u.color.value.g, 7);
      expect(Number(c[3])).toBeCloseTo(u.color.value.b, 7);
      // the engine prelude: emissive * emissiveIntensity on a black emissive, clearcoat from the uniforms
      expect(source[bucket].surface.startsWith('\ts.emissive = s.emissive * mat.emissiveIntensity;')).toBe(true);
      expect(code).toContain('s.albedo = mat.color * in.color.rgb;');
      expect(code).toContain('s.normal = in.N;');
    }
    expect(source.hull.defines.CLEARCOAT).toBe(1);
  });
});

// node class of a TSL node (proxied or not)
const kind = (n: any): string => (n && typeof n === 'object' ? (n.constructor?.type ?? n.constructor?.name ?? '') : '');

describe('boat shading materials', () => {
  it('builds native node materials with the source pass state', () => {
    const shading = new BoatShading(shape);
    expect(shading.hull).toBeInstanceOf(MeshPhysicalNodeMaterial);
    expect(shading.glass).toBeInstanceOf(MeshPhysicalNodeMaterial);
    for (const k of ['gelcoat', 'wood', 'fittings', 'glow', 'trap'] as const)
      expect(shading[k]).toBeInstanceOf(MeshStandardNodeMaterial);
    expect(shading.hull.clearcoat).toBe(1);
    expect(shading.hull.clearcoatNode).toBeTruthy();
    expect(shading.glass.transparent).toBe(true);
    expect(shading.glass.depthWrite).toBe(false);
    expect(shading.glass.side).toBe(DoubleSide);
    expect(shading.glass.opacityNode).toBeTruthy();
    expect(shading.trap.alphaTest).toBe(0.5);
    expect(shading.trap.side).toBe(DoubleSide);
    expect(shading.trap.opacityNode).toBeTruthy();
    expect(shading.fittings.positionNode).toBeTruthy();
    for (const k of ['hull', 'gelcoat', 'wood', 'glass', 'glow', 'trap'] as const)
      expect(shading[k].positionNode).toBeFalsy();
    // the snippets that write s.normal get a normalNode, the others keep three's geometric normal
    for (const k of ['gelcoat', 'wood', 'fittings'] as const) expect(shading[k].normalNode).toBeTruthy();
    for (const k of ['hull', 'glass', 'glow', 'trap'] as const) expect(shading[k].normalNode).toBeFalsy();
    for (const k of BOAT_BUCKETS) expect(shading[k].name).toBe(source[k].name);
    shading.update(0.5, { speed: 3 });
    expect(shading.time.value).toBe(0.5);
    expect(shading.windSpeed.value).toBe(3);
    shading.dispose();
  });

  // Packed-column parity cannot see which column feeds which material slot (a roughness read from the
  // metalness column compares equal there). Walk each slot's node graph down to the surface call and
  // check the called entry, the mat4 column index and the swizzle.
  it('reads every material slot from the right packed column and component', () => {
    const shading = new BoatShading(shape);
    const SW: Record<string, string> = { r: 'x', g: 'y', b: 'z', a: 'w' };
    const reads = (root: any) => {
      const out = new Set<string>();
      const seen = new Set<any>();
      const walk = (n: any) => {
        if (!n || typeof n !== 'object' || seen.has(n)) return;
        seen.add(n);
        if (Array.isArray(n)) return n.forEach(walk);
        if (!n.isNode) return;
        if (kind(n) === 'FunctionCallNode') return;
        if (kind(n) === 'SplitNode' && kind(n.node) === 'ArrayElementNode' && kind(n.node.node) === 'FunctionCallNode') {
          const entry = String(n.node.node.functionNode.code).match(/\bfn\s+(\w+)/)?.[1];
          const comps = [...String(n.components)].map((c) => SW[c] ?? c).join('');
          out.add(`${entry}:${n.node.indexNode.value}.${comps}`);
          return;
        }
        for (const k of Object.keys(n)) if (k !== 'parents') walk(n[k]);
      };
      walk(root);
      return [...out];
    };
    const SLOTS: Record<string, string> = {
      colorNode: '0.xyz',
      opacityNode: '0.w',
      normalNode: '1.xyz',
      roughnessNode: '1.w',
      emissiveNode: '2.xyz',
      metalnessNode: '2.w',
      aoNode: '3.x',
      clearcoatNode: '3.y',
      clearcoatRoughnessNode: '3.z',
    };
    const present: Record<string, string[]> = {
      opacityNode: ['glass', 'trap'],
      normalNode: ['gelcoat', 'wood', 'fittings'],
      clearcoatNode: ['hull'],
      clearcoatRoughnessNode: ['hull'],
    };
    for (const bucket of BOAT_BUCKETS) {
      const m = shading[bucket] as any;
      for (const [slot, read] of Object.entries(SLOTS)) {
        if (present[slot] && !present[slot]!.includes(bucket)) {
          expect(m[slot], `${bucket}.${slot}`).toBeFalsy();
          continue;
        }
        expect(reads(m[slot]), `${bucket}.${slot}`).toEqual([`${ENTRY[bucket]}:${read}`]);
      }
      // the ensign / whip motion is the fittings vertex entry, nothing else moves
      if (bucket === 'fittings')
        expect(String(m.positionNode.functionNode.code).match(/\bfn\s+(\w+)/)?.[1]).toBe('twBoatFittingsVertex');
    }
    shading.dispose();
  });

  it('flips the input normal on back faces of the double-sided materials only', () => {
    const shading = new BoatShading(shape);
    const hasFrontFacing = (root: any) => {
      const seen = new Set<any>();
      const walk = (n: any): boolean => {
        if (!n || typeof n !== 'object' || seen.has(n)) return false;
        seen.add(n);
        if (Array.isArray(n)) return n.some(walk);
        if (kind(n) === 'FrontFacingNode') return true;
        return Object.keys(n).some((k) => k !== 'parents' && walk(n[k]));
      };
      return walk(root);
    };
    for (const bucket of BOAT_BUCKETS) {
      const call = (shading[bucket] as any).colorNode.node.node;
      expect(kind(call)).toBe('FunctionCallNode');
      expect(hasFrontFacing(call.parameters.twN), bucket).toBe(source[bucket].side === 'double');
    }
    expect(BOAT_BUCKETS.filter((b) => source[b].side === 'double').sort()).toEqual(['glass', 'trap']);
    shading.dispose();
  });

  it('shades a BoatModel in place and shares its uniform handles', () => {
    const model = new BoatModel();
    const shading = shadeBoatModel(model);
    for (const [name, mesh] of Object.entries(model.meshes)) {
      const bucket = ({ wheel: 'wood', throttle: 'fittings', radar: 'fittings', propeller: 'fittings', rudder: 'fittings' } as Record<string, string>)[name] ?? name;
      expect(mesh.material).toBe(shading[bucket as (typeof BOAT_BUCKETS)[number]]);
    }
    expect(Object.keys(model.meshes)).toHaveLength(12);
    model.setNavLights(false);
    expect(shading.navOn.value).toBe(0);
    model.update(0.5, { dir: { x: 1, y: 0 }, speed: 9 });
    expect(shading.flagWind).toBe(model.materials.flagWind);
    expect(shading.flagWind.value).toBeGreaterThan(0.5);
    expect(shading.flagPivot.value.lengthSq()).toBeGreaterThan(0);
    shading.dispose();
    model.dispose();
  });
});
