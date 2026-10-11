/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
// Source: the WGSL of src/world/fish/FishMaterial.js 85-735 (fish module, swim / prop vertex stages, surface,
// prop mask; taken from the port's material records, which keep them 1:1 with the source) and
// src/world/marine/Whale.js 405-540 (whale vertex stage, rig module, skin surface), run inside the engine
// contract of src/engine/render/MeshShader.js (VertexData, the useWorld transform, FragInput, surfaceOf),
// src/engine/render/wgsl/lighting.js (Surface, defaultSurface), src/engine/render/wgsl/common.js,
// src/materials/LODFade.js, the batch module of src/world/reef/ReefBatch.js 139-196 and the preprocessor of
// src/engine/gpu/Shader.js 88-179.
//
// Native three.js WebGPU node materials for the fish (swimming schools, rays and the turtle), the fish props
// (market displays, racks, cleaning tables) and the humpback.
//
// Fish: the source draws a ReefBatch (merged kinds, per-frame instance lists, multi-draw indirect). three
// cannot draw that, so `MarineShading.Batch` is a ReefBatch subclass (pass it to setMarineBatch or the
// FishSchools `Batch` option) whose engine storage buffers are three StorageBufferAttributes (the batch's own
// instance records, lists and bases, written by the unchanged ReefBatch code) and whose createMesh /
// createFadeMesh return a driver mesh that draws nothing (its onBeforeRender is where FishSchools / FishProps
// cull and commit) with one child mesh per kind: the merged geometry with the kind's index range (indices
// offset by its base vertex once) and `count` = the kind's committed instance count. The vertex graph finds
// the record exactly as the batch module does (`List[ Base[ kind ] + instance ]`, fade entries decoded by the
// source expression) and hands the four record vec4 to the verbatim snippet through bound
// `fishRecordIndex` / `fishRecord` / `fishFadeEntry` functions. Shadow proxies (kinds flagged shadowOnly)
// draw only in three's shadow pass.
//
// Every snippet runs verbatim inside a generated wgslFn entry; the entry is the FIRST function of each
// string (wgslFn calls the first declaration). Every other function is prefixed with `twShore_`
// (namespaceWgslFunctions): three declares interleavedGradientNoise / vogelDiskSample itself in lit shaders.
// Removing the prefix gives back the source text. Outputs are packed into mat4x4f columns and taken by name.
//
// Divergences (see docs/reference/tidewater-world/20-marine-shading/README.md): previous positions (motion
// vectors) are computed but not wired; the engine's underwater lighting (whale `underwaterLighting: 'full'`:
// caustics, depth attenuation) and the SceneLighting hooks are three's lighting; s.translucency is added as
// emissive translucency * sunColor (no shadow term, as the shore port); the LOD dither phase is frame.frameIndex
// (default 0: no TAA in Genvr); one-frame lag of the shadow pass if three renders shadows before the driver.
import {
  BufferAttribute,
  BufferGeometry,
  FrontSide,
  Mesh,
  MeshBasicNodeMaterial,
  MeshPhysicalNodeMaterial,
  StorageBufferAttribute,
  TSL,
  Vector3,
  type Material,
  type Object3D,
  type Scene,
  type Texture,
} from 'three/webgpu';
import { f32Literal } from '../creatures/creature-shading.js';
import {
  SHORE_COMMON_WGSL,
  SHORE_FN_PREFIX,
  SHORE_LOD_FADE_WGSL,
  SHORE_SURFACE_WGSL,
  namespaceWgslFunctions,
} from '../tidewater-shore/shore-shading.js';
import {
  RecordingShaderModule,
  ReefBatch,
  type ReefBatchOptions,
  type ReefKind,
  type ReefStorageBufferOptions,
} from '../tidewater-shore/reef-batch.js';
import { skinRows } from './fish-material.js';
import type { MarineBatchClass, MarineBatchKind, WgslMaterial } from './marine-shared.js';
import { K as WHALE_FRAMES, type Whale } from './whale.js';
/* eslint-disable @typescript-eslint/no-explicit-any -- native TSL graph boundary */
type N = any;

// ---------------------------------------------------------------- engine preprocessor (Shader.js 88-179)

const truthy = (v: unknown) => v !== undefined && v !== null && v !== false && v !== 0 && v !== '0';

/** The engine's `#if` / `#ifdef` / `#elif` / `#else` / `#endif` preprocessor (src/engine/gpu/Shader.js). */
export function preprocessWgsl(code: string, defines: Record<string, unknown> = {}): string {
  const lines = code.split('\n');
  const out: string[] = [];
  const stack: { active: boolean; taken: boolean; parent: boolean }[] = [];
  const active = () => stack.length === 0 || stack[stack.length - 1]!.active;
  const evalCond = (expr: string): boolean => {
    expr = expr.trim();
    let m: RegExpExecArray | null;
    if ((m = /^!\s*(\w+)$/.exec(expr))) return !truthy(defines[m[1]!]);
    if ((m = /^(\w+)\s*(==|!=|>=|<=|>|<)\s*([\w.'"-]+)$/.exec(expr))) {
      const a = defines[m[1]!] as any;
      let b: any = m[3]!.replace(/^['"]|['"]$/g, '');
      if (!isNaN(Number(b)) && typeof a === 'number') b = Number(b);
      switch (m[2]) {
        case '==':
          return a == b;
        case '!=':
          return a != b;
        case '>=':
          return a >= b;
        case '<=':
          return a <= b;
        case '>':
          return a > b;
        case '<':
          return a < b;
      }
    }
    if (/\|\|/.test(expr)) return expr.split('||').some((e) => evalCond(e));
    if (/&&/.test(expr)) return expr.split('&&').every((e) => evalCond(e));
    return truthy(defines[expr]);
  };
  for (const line of lines) {
    const t = line.trim();
    let m: RegExpExecArray | null;
    if ((m = /^#(if|ifdef|ifndef)\s+(.*)$/.exec(t))) {
      const parent = active();
      let c: boolean;
      if (m[1] === 'ifdef') c = defines[m[2]!.trim()] !== undefined;
      else if (m[1] === 'ifndef') c = defines[m[2]!.trim()] === undefined;
      else c = evalCond(m[2]!);
      stack.push({ active: parent && c, taken: c, parent });
      continue;
    }
    if ((m = /^#elif\s+(.*)$/.exec(t))) {
      const s = stack[stack.length - 1]!;
      const c = !s.taken && evalCond(m[1]!);
      s.active = s.parent && c;
      s.taken = s.taken || c;
      continue;
    }
    if (t === '#else') {
      const s = stack[stack.length - 1]!;
      s.active = s.parent && !s.taken;
      s.taken = true;
      continue;
    }
    if (t === '#endif') {
      stack.pop();
      continue;
    }
    if (active()) out.push(line);
  }
  if (stack.length) throw new Error('preprocess: unterminated #if');
  return out.join('\n');
}

// ---------------------------------------------------------------- storage buffers

/** A ReefBatch storage buffer on three (vec4f records or u32 lists) with its read-only storage node. */
export class MarineStorageBuffer {
  readonly options: ReefStorageBufferOptions;
  readonly attribute: StorageBufferAttribute;
  readonly node: N;
  writes = 0;

  constructor(options: ReefStorageBufferOptions) {
    this.options = options;
    const n = Math.max(1, options.count);
    if (options.type === 'vec4f') {
      this.attribute = new StorageBufferAttribute(new Float32Array(n * 4), 4);
      this.node = (TSL as N).storage(this.attribute, 'vec4', n).toReadOnly();
    } else if (options.type === 'u32') {
      this.attribute = new StorageBufferAttribute(new Uint32Array(n), 1);
      this.node = (TSL as N).storage(this.attribute, 'uint', n).toReadOnly();
    } else throw new Error(`marine shading: storage ${options.label} is ${options.type}`);
  }

  /** Same contract as the engine StorageBuffer: upload `data` from element 0. */
  write(data: ArrayBufferView): void {
    const a = this.attribute;
    const src = data as Float32Array | Uint32Array;
    (a.array as Float32Array | Uint32Array).set(src);
    a.clearUpdateRanges();
    a.addUpdateRange(0, src.length);
    a.needsUpdate = true;
    this.writes++;
  }

  destroy(): void {
    // three frees the GPU buffer with the materials that use it
  }
}

/** The batch's storage nodes the vertex graph reads (names as the source bindings). */
export interface MarineBatchNodes {
  instances: N;
  list: N;
  base: N;
  fadeList: N | null;
  fadeBase: N | null;
}

const nodeOf = (b: unknown, name: string): N => {
  if (!(b instanceof MarineStorageBuffer)) throw new Error(`marine shading: ${name} is not a MarineStorageBuffer`);
  return b.node;
};

// ---------------------------------------------------------------- WGSL generation

const struct = (name: string, fields: Record<string, string>) =>
  `struct ${name} { ${Object.entries(fields)
    .map(([k, t]) => `${k}: ${t}`)
    .join(', ')} };\n`;

/** Fields of the engine VertexData (MeshShader.js `vdata`) the entries declare, plus material attributes. */
const VERTEX_FIELDS = {
  position: 'vec3f',
  normal: 'vec3f',
  uv: 'vec2f',
  instance: 'u32',
  vertex: 'u32',
  worldOffset: 'vec3f',
  prevWorldOffset: 'vec3f',
  useWorld: 'bool',
  worldPos: 'vec3f',
  worldNormal: 'vec3f',
  prevWorldPos: 'vec3f',
};
// engine vs() defaults before materialVertex
const VERTEX_SEED = `
	v.instance = 0u;
	v.vertex = 0u;
	v.worldOffset = vec3f( 0.0 );
	v.prevWorldOffset = vec3f( 1e30 );
	v.useWorld = false;
	v.prevWorldPos = vec3f( 1e30 );`;
// engine vs() world transform after materialVertex (identity model: the meshes stay at the origin)
const WORLD_RETURN = `
	let twWp = select( v.position + v.worldOffset, v.worldPos, v.useWorld );
	let twWn = select( v.normal, v.worldNormal, v.useWorld );
	let twPwp = select( v.position + select( v.prevWorldOffset, v.worldOffset, v.prevWorldOffset.x > 1e29 ), select( v.prevWorldPos, twWp, v.prevWorldPos.x > 1e29 ), v.useWorld );`;

// engine surfaceOf( in ) on defaultSurface( in.N ) with the built-in uniforms (white, opacity 1, black emissive)
const surfaceSeed = (roughness: number, metalness: number) => `
	var s = defaultSurface( in.N );
	s.albedo = vec3f( 1.0, 1.0, 1.0 ) * in.color.rgb;
	s.alpha = 1.0 * in.color.a;
	s.roughness = ${f32Literal(roughness)};
	s.metalness = ${f32Literal(metalness)};
	s.emissive = vec3f( 0.0, 0.0, 0.0 );`;
/** Packed surface: ( albedo, alpha ), ( normal, roughness ), ( translucency, metalness ), ( ao, specularIntensity, clearcoat, clearcoatRoughness ). */
const SURFACE_RETURN =
  '\treturn mat4x4f( vec4f( s.albedo, s.alpha ), vec4f( s.normal, s.roughness ), vec4f( s.translucency, s.metalness ), vec4f( s.ao, s.specularIntensity, s.clearcoat, s.clearcoatRoughness ) );';

const FRAG_IN_FIELDS = (vs: string) => ({ vs, P: 'vec3f', N: 'vec3f', V: 'vec3f', uv: 'vec2f', color: 'vec4f', front: 'bool', pixel: 'vec2f' });

/** The material record options the fish / whale shading reads. */
export interface MarineMaterialOptions {
  name: string;
  roughness: number;
  metalness: number;
  vertex: string;
  surface: string;
  shadow?: string;
  varyings: Record<string, string>;
  attributes: Record<string, string>;
  defines?: Record<string, unknown>;
  modules?: { name?: string; code?: string; deps?: unknown[]; uniforms?: unknown; uniformName?: string }[];
  uniforms?: Record<string, [string, unknown]>;
}

const optionsOf = (m: WgslMaterial) => m.options as unknown as MarineMaterialOptions;

/** The skin table as the module-scope `fishSkin` the fish module reads (float32 values of the uniform block). */
export function fishSkinWgsl(): string {
  const rows = skinRows();
  return `struct TwFishSkin { rows: array<vec4f, ${rows.length}> };
var<private> fishSkin: TwFishSkin = TwFishSkin( array<vec4f, ${rows.length}>( ${rows
    .map((r) => `vec4f( ${f32Literal(r.x)}, ${f32Literal(r.y)}, ${f32Literal(r.z)}, ${f32Literal(r.w)} )`)
    .join(', ')} ) );
`;
}

/** The fish module's WGSL (FishMaterial.js fishModule; first of the material's modules). */
function fishModuleCode(o: MarineMaterialOptions): string {
  const m = o.modules?.find((x) => x.name === 'fish');
  if (!m?.code) throw new Error('marine shading: no fish module in ' + o.name);
  return m.code;
}

/**
 * The ReefBatch module with its record and fade lookups bound: the record and the raw fade-list entry of the
 * vertex come from the node graph (which reads the batch's own List / Base storage exactly as
 * `<P>RecordIndex` does); `<P>FadeEntry` decodes the entry with the source's own expression.
 */
export function boundBatchWgsl(batchCode: string, prefix: string): string {
  const decode = batchCode.match(new RegExp(`\\n\\tlet e = ${prefix}FadeList\\[[^\\n]*\\n\\treturn (${prefix}FadeInfo\\( [^\\n]* \\));`));
  const info = batchCode.match(new RegExp(`struct ${prefix}FadeInfo \\{[^}]*\\};`));
  if (batchCode.includes(`fn ${prefix}FadeEntry(`) && !(decode && info)) throw new Error('marine shading: cannot bind ' + prefix + 'FadeEntry');
  return `var<private> twRecord: array<vec4f, 4>;
var<private> twFadeRaw: u32;
fn ${prefix}RecordIndex( kind: u32, instance: u32 ) -> u32 { return 0u; }
fn ${prefix}Record( index: u32, k: u32 ) -> vec4f { return twRecord[ k ]; }
${
  decode && info
    ? `${info[0]}
fn ${prefix}FadeEntry( kind: u32, instance: u32 ) -> ${prefix}FadeInfo {
	let e = twFadeRaw;
	return ${decode[1]};
}
`
    : ''
}`;
}

export const FISH_VERTEX_INPUTS = ['twPosition', 'twNormal', 'twAData', 'twAKind', 'twR0', 'twR1', 'twR2', 'twR3', 'twFadeEntry', 'twOut'] as const;
export const FISH_SURFACE_INPUTS = ['twP', 'twN', 'twV', 'twPixel', 'twTime', 'twFrameIndex', 'twView', 'twLocal', 'twData', 'twInfo', 'twFlags', 'twFade'] as const;
export const FISH_SHADOW_INPUTS = ['twPixel', 'twTime', 'twData'] as const;
export const WHALE_VERTEX_INPUTS = ['twPosition', 'twNormal', 'twUv', 'twRig', 'twWhalePos', 'twWhaleRot', 'twWhaleFlip', 'whaleHeightTex', 'smpLinearClamp'] as const;
export const WHALE_SURFACE_INPUTS = ['twP', 'twN', 'twV', 'twUv', 'twWater', 'twWet', 'whaleAlbedoTex', 'whaleHeightTex', 'smpAnisoClamp'] as const;

const FISH_FRAME = 'struct TwFishFrame { time: f32, frameIndex: u32, view: mat4x4f };\nvar<private> frame: TwFishFrame;\n';

function fishVertexEntry(o: MarineMaterialOptions, batchCode: string, prefix: string): string {
  return `
fn twFishVertex( twPosition: vec3f, twNormal: vec3f, twAData: vec4f, twAKind: f32, twR0: vec4f, twR1: vec4f, twR2: vec4f, twR3: vec4f, twFadeEntry: u32, twOut: u32 ) -> mat4x4f {
	twRecord = array<vec4f, 4>( twR0, twR1, twR2, twR3 );
	twFadeRaw = twFadeEntry;
	var v: TwFishVertexData;
	v.position = twPosition;
	v.normal = twNormal;
	v.uv = vec2f( 0.0 );
	v.aData = twAData;
	v.aKind = twAKind;
${VERTEX_SEED}
	var o: TwFishVaryings;
	{
${o.vertex}
	}
${WORLD_RETURN}
	if ( twOut == 0u ) { return mat4x4f( vec4f( twWp, o.vFishFade.x ), vec4f( twWn, o.vFishFade.y ), vec4f( twPwp, 0.0 ), vec4f( 0.0 ) ); }
	return mat4x4f( vec4f( o.vFishLocal, 0.0 ), o.vFishData, o.vFishInfo, o.vFishFlags );
}
${struct('TwFishVertexData', { ...VERTEX_FIELDS, ...o.attributes })}${struct('TwFishVaryings', o.varyings)}${boundBatchWgsl(batchCode, prefix)}${fishSkinWgsl()}${fishModuleCode(o)}`;
}

function fishSurfaceEntry(o: MarineMaterialOptions): string {
  return `
fn twFishSurface( twP: vec3f, twN: vec3f, twV: vec3f, twPixel: vec2f, twTime: f32, twFrameIndex: u32, twView: mat4x4f, twLocal: vec3f, twData: vec4f, twInfo: vec4f, twFlags: vec4f, twFade: vec2f ) -> mat4x4f {
	frame.time = twTime;
	frame.frameIndex = twFrameIndex;
	frame.view = twView;
	var in: TwFishIn;
	in.vs.vFishLocal = twLocal;
	in.vs.vFishData = twData;
	in.vs.vFishInfo = twInfo;
	in.vs.vFishFlags = twFlags;
	in.vs.vFishFade = twFade;
	in.P = twP;
	in.N = twN;
	in.V = twV;
	in.uv = vec2f( 0.0 );
	in.color = vec4f( 1.0 );
	in.front = true;
	in.pixel = twPixel;
${surfaceSeed(o.roughness, o.metalness)}
	{
${o.surface}
	}
${SURFACE_RETURN}
}
`;
}

// what the fragment entries of one fish material share (one wgsl code node: the surface and the prop shadow
// hook can run in the same shader, three's shadow pass reads colorNode.a and the mask)
function fishFragmentLibrary(o: MarineMaterialOptions): string {
  return `${struct('TwFishVs', o.varyings)}${struct('TwFishIn', FRAG_IN_FIELDS('TwFishVs'))}${FISH_FRAME}${fishSkinWgsl()}${fishModuleCode(o)}${SHORE_LOD_FADE_WGSL}${SHORE_COMMON_WGSL}${SHORE_SURFACE_WGSL}`;
}

// the prop shadow hook (MeshShader.js materialShadow): the fin mask, the fragment kept when it returns true
function fishShadowEntry(o: MarineMaterialOptions): string {
  return `
fn twFishShadow( twPixel: vec2f, twTime: f32, twData: vec4f ) -> f32 {
	frame.time = twTime;
	var in: TwFishIn;
	in.vs.vFishData = twData;
	in.pixel = twPixel;
	in.color = vec4f( 1.0 );
	in.front = true;
	if ( ! twFishShadowHook( in ) ) { discard; }
	return 1.0;
}
fn twFishShadowHook( in: TwFishIn ) -> bool {
${o.shadow}
}
`;
}

/**
 * The generated WGSL of one material. `vertex` is standalone; `surface` / `shadow` hold only their entry (the
 * first function) and take the shared declarations from `library` (pass it as the wgslFn include).
 */
export interface MarineShadingWgsl {
  vertex: string;
  surface: string;
  shadow: string | null;
  library: string;
}

const fnNames = (code: string) => [...code.matchAll(/(^|\n)[ \t]*fn\s+(\w+)\s*\(/g)].map((m) => m[2]!);
/** namespaceWgslFunctions over several strings that are linked into one shader: every function but the entries. */
function namespaceGroup(parts: string[], entries: string[]): string[] {
  const names = [...new Set(parts.flatMap(fnNames))].filter((n) => !entries.includes(n));
  if (!names.length) return parts;
  const re = new RegExp(`\\b(${names.join('|')})(\\s*\\()`, 'g');
  return parts.map((p) => p.replace(re, `${SHORE_FN_PREFIX}$1$2`));
}

/** The generated WGSL of one fish material (entry first in every string, helpers namespaced). */
export function fishShadingWgsl(record: WgslMaterial, batch: { prefix: string; module: { code?: string } }): MarineShadingWgsl {
  const o = optionsOf(record);
  if (!/^Fish(Props)?(Fade)?$/.test(o.name)) throw new Error('marine shading: not a fish material: ' + o.name);
  const [surface, shadow, library] = namespaceGroup(
    [fishSurfaceEntry(o), o.shadow ? fishShadowEntry(o) : '', fishFragmentLibrary(o)],
    ['twFishSurface', 'twFishShadow'],
  );
  return {
    vertex: namespaceWgslFunctions(fishVertexEntry(o, batch.module.code ?? '', batch.prefix)),
    surface: surface!,
    shadow: o.shadow ? shadow! : null,
    library: library!,
  };
}

const ARR = (n: number) => `array<vec4f, ${n}>`;
function whaleMatStruct(): string {
  return `${struct('TwWhaleMat', {
    whalePos: ARR(2 * WHALE_FRAMES),
    whaleRot: ARR(2 * WHALE_FRAMES),
    whaleFlip: ARR(4),
    whaleWater: 'f32',
    whaleWet: 'f32',
  })}var<private> mat: TwWhaleMat;\n`;
}

function whaleVertexEntry(o: MarineMaterialOptions, defines: Record<string, unknown>): string {
  const rig = o.modules?.find((m) => m.name === 'whaleRig')?.code;
  if (!rig) throw new Error('marine shading: no whale rig module');
  return `
fn twWhaleVertex( twPosition: vec3f, twNormal: vec3f, twUv: vec2f, twRig: vec4f, twWhalePos: ${ARR(2 * WHALE_FRAMES)}, twWhaleRot: ${ARR(2 * WHALE_FRAMES)}, twWhaleFlip: ${ARR(4)}, whaleHeightTex: texture_2d<f32>, smpLinearClamp: sampler ) -> mat4x4f {
	mat.whalePos = twWhalePos;
	mat.whaleRot = twWhaleRot;
	mat.whaleFlip = twWhaleFlip;
	var v: TwWhaleVertexData;
	v.position = twPosition;
	v.normal = twNormal;
	v.uv = twUv;
	v.rig = twRig;
${VERTEX_SEED}
	{
${preprocessWgsl(o.vertex, defines)}
	}
${WORLD_RETURN}
	return mat4x4f( vec4f( twWp, 0.0 ), vec4f( twWn, 0.0 ), vec4f( twPwp, 0.0 ), vec4f( 0.0 ) );
}
${struct('TwWhaleVertexData', { ...VERTEX_FIELDS, ...o.attributes })}${whaleMatStruct()}${rig}`;
}

function whaleSurfaceEntry(o: MarineMaterialOptions, defines: Record<string, unknown>): string {
  return `
fn twWhaleSurface( twP: vec3f, twN: vec3f, twV: vec3f, twUv: vec2f, twWater: f32, twWet: f32, whaleAlbedoTex: texture_2d<f32>, whaleHeightTex: texture_2d<f32>, smpAnisoClamp: sampler ) -> mat4x4f {
	mat.whaleWater = twWater;
	mat.whaleWet = twWet;
	var in: TwWhaleIn;
	in.P = twP;
	in.N = twN;
	in.V = twV;
	in.uv = twUv;
	in.color = vec4f( 1.0 );
	in.front = true;
	in.pixel = vec2f( 0.0 );
${surfaceSeed(o.roughness, o.metalness)}
	{
${preprocessWgsl(o.surface, defines)}
	}
${SURFACE_RETURN}
}
`;
}

function whaleFragmentLibrary(): string {
  return `${struct('TwWhaleVs', { twUnused: 'f32' })}${struct('TwWhaleIn', FRAG_IN_FIELDS('TwWhaleVs'))}${whaleMatStruct()}${SHORE_COMMON_WGSL}${SHORE_SURFACE_WGSL}`;
}

/** The engine defines of the whale's main colour pass (the record's defines; PASS_DEPTH off). */
export const whaleDefines = (record: WgslMaterial): Record<string, unknown> => ({ ...(optionsOf(record).defines ?? {}), PASS_DEPTH: 0 });

/** The generated WGSL of the whale material (vertex: rig + relief; surface: baked skin). */
export function whaleShadingWgsl(record: WgslMaterial, defines = whaleDefines(record)): MarineShadingWgsl {
  const o = optionsOf(record);
  if (o.name !== 'Whale') throw new Error('marine shading: not the whale material: ' + o.name);
  const [surface, library] = namespaceGroup([whaleSurfaceEntry(o, defines), whaleFragmentLibrary()], ['twWhaleSurface']);
  return { vertex: namespaceWgslFunctions(whaleVertexEntry(o, defines)), surface: surface!, shadow: null, library: library! };
}

const libraries = new WeakMap<MarineShadingWgsl, N>();
/** The shared fragment declarations of a material as one wgsl code node (the include of its fragment entries). */
export function marineLibraryNode(wgsl: MarineShadingWgsl): N {
  let lib = libraries.get(wgsl);
  if (!lib) libraries.set(wgsl, (lib = (TSL as N).wgsl(wgsl.library)));
  return lib;
}
const fragmentFn = (wgsl: MarineShadingWgsl, entry: string) => (TSL as N).wgslFn(entry, [marineLibraryNode(wgsl)]);

// ---------------------------------------------------------------- node graphs

/** Named vertex outputs (world transform from the engine's useWorld path) and the varyings. */
export interface MarineVertex {
  position: N;
  normal: N;
  previous: N;
  varyings: Record<string, N>;
}

/** Named surface outputs (the packing of SURFACE_RETURN). */
export interface MarineSurface {
  albedo: N;
  alpha: N;
  normal: N;
  roughness: N;
  translucency: N;
  metalness: N;
  ao: N;
  specularIntensity: N;
  clearcoat: N;
  clearcoatRoughness: N;
}
export function marineSurfaceSlots(m: N): MarineSurface {
  return {
    albedo: m.element(0).xyz,
    alpha: m.element(0).w,
    normal: m.element(1).xyz,
    roughness: m.element(1).w,
    translucency: m.element(2).xyz,
    metalness: m.element(2).w,
    ao: m.element(3).x,
    specularIntensity: m.element(3).y,
    clearcoat: m.element(3).z,
    clearcoatRoughness: m.element(3).w,
  };
}

/** Per-vertex inputs of the fish vertex graph (material: geometry attributes and the draw's instance index). */
export interface FishVertexInputs {
  instance: N;
  position: N;
  normal: N;
  aData: N;
  aKind: N;
}

/**
 * Fish vertex outputs for one (instance, vertex): the record found as the batch module finds it
 * (`<P>List[ <P>Base[ kind ] + instance ]`; the fade channel: `<P>FadeList[ <P>FadeBase[ kind ] + instance ]`,
 * low 24 bits = record index) and its four vec4 (`<P>Instances[ index * 4 + k ]`).
 */
export function fishVertexNodes(wgsl: string, nodes: MarineBatchNodes, a: FishVertexInputs, fade: boolean): MarineVertex {
  const t = TSL as N;
  const kind = t.uint(a.aKind);
  let raw: N, ri: N;
  if (fade) {
    if (!nodes.fadeList || !nodes.fadeBase) throw new Error('marine shading: the batch has no fade channel');
    raw = nodes.fadeList.element(nodes.fadeBase.element(kind).add(a.instance));
    ri = raw.bitAnd(t.uint(0xffffff));
  } else {
    raw = t.uint(0);
    ri = nodes.list.element(nodes.base.element(kind).add(a.instance));
  }
  const rec = [0, 1, 2, 3].map((k) => nodes.instances.element(ri.mul(t.uint(4)).add(t.uint(k))));
  const params = {
    twPosition: a.position,
    twNormal: a.normal,
    twAData: a.aData,
    twAKind: a.aKind,
    twR0: rec[0],
    twR1: rec[1],
    twR2: rec[2],
    twR3: rec[3],
    twFadeEntry: raw,
  };
  const fn = t.wgslFn(wgsl);
  const w = fn({ ...params, twOut: t.uint(0) });
  const vy = fn({ ...params, twOut: t.uint(1) });
  return {
    position: w.element(0).xyz,
    normal: w.element(1).xyz,
    previous: w.element(2).xyz,
    varyings: {
      vFishFade: t.vec2(w.element(0).w, w.element(1).w),
      vFishLocal: vy.element(0).xyz,
      vFishData: vy.element(1),
      vFishInfo: vy.element(2),
      vFishFlags: vy.element(3),
    },
  };
}

export interface FishSurfaceInputs {
  P: N;
  N: N;
  V: N;
  pixel: N;
  time: N;
  frameIndex: N;
  view: N;
  local: N;
  data: N;
  info: N;
  flags: N;
  fade: N;
}
export function fishSurfaceNodes(wgsl: MarineShadingWgsl, a: FishSurfaceInputs): MarineSurface {
  return marineSurfaceSlots(
    fragmentFn(wgsl, wgsl.surface)({
      twP: a.P,
      twN: a.N,
      twV: a.V,
      twPixel: a.pixel,
      twTime: a.time,
      twFrameIndex: a.frameIndex,
      twView: a.view,
      twLocal: a.local,
      twData: a.data,
      twInfo: a.info,
      twFlags: a.flags,
      twFade: a.fade,
    }),
  );
}
export function fishShadowNode(wgsl: MarineShadingWgsl, a: { pixel: N; time: N; data: N }): N {
  if (!wgsl.shadow) throw new Error('marine shading: the material has no shadow hook');
  return fragmentFn(wgsl, wgsl.shadow)({ twPixel: a.pixel, twTime: a.time, twData: a.data });
}

export interface WhaleVertexInputs {
  position: N;
  normal: N;
  uv: N;
  rig: N;
  /** uniformArray nodes of the rig (whale.uPos / uRot / uFlip arrays). */
  pos: N;
  rot: N;
  flip: N;
  heightTexture: N;
}
export function whaleVertexNodes(wgsl: string, a: WhaleVertexInputs): MarineVertex {
  const t = TSL as N;
  const w = t.wgslFn(wgsl)({
    twPosition: a.position,
    twNormal: a.normal,
    twUv: a.uv,
    twRig: a.rig,
    twWhalePos: a.pos,
    twWhaleRot: a.rot,
    twWhaleFlip: a.flip,
    whaleHeightTex: a.heightTexture,
    smpLinearClamp: t.sampler(a.heightTexture),
  });
  return { position: w.element(0).xyz, normal: w.element(1).xyz, previous: w.element(2).xyz, varyings: {} };
}

export interface WhaleSurfaceInputs {
  P: N;
  N: N;
  V: N;
  uv: N;
  water: N;
  wet: N;
  albedoTexture: N;
  heightTexture: N;
}
export function whaleSurfaceNodes(wgsl: MarineShadingWgsl, a: WhaleSurfaceInputs): MarineSurface {
  const t = TSL as N;
  return marineSurfaceSlots(
    fragmentFn(wgsl, wgsl.surface)({
      twP: a.P,
      twN: a.N,
      twV: a.V,
      twUv: a.uv,
      twWater: a.water,
      twWet: a.wet,
      whaleAlbedoTex: a.albedoTexture,
      whaleHeightTex: a.heightTexture,
      smpAnisoClamp: t.sampler(a.albedoTexture),
    }),
  );
}

// ---------------------------------------------------------------- materials and the drawable batch

/** Frame inputs (the source engine's frame uniforms). Missing ones are owned by MarineShading. */
export interface MarineShadingBindings {
  /** Simulation time in seconds (frame.time): the props' fin dither. */
  time?: N;
  /** frame.frameIndex (u32): LOD cross-fade dither phase. Default 0 (static; no TAA in Genvr). */
  frameIndex?: N;
  /** Sun colour times intensity: multiplies s.translucency (added as emissive). Default white. */
  sunColor?: N;
  /** Main camera position (frame.cameraPos, in.V). Default: three's cameraPosition. */
  cameraPosition?: N;
  /** World-to-view matrix (frame.view: the scale footprint of the fish skin). Default: three's cameraViewMatrix. */
  view?: N;
}

/** What each material keeps for inspection and tests (the named outputs it was wired from). */
export interface MarineMaterialGraph {
  options: MarineMaterialOptions;
  wgsl: MarineShadingWgsl;
  vertex: MarineVertex;
  surface: MarineSurface;
  shadow: N | null;
}

/** One drawable kind of a batch channel (per-kind geometry over the merged buffers). */
export interface MarineKindMesh extends Mesh {
  userData: { kind: number; channel: 'main' | 'fade'; shadowPass: boolean };
}

const DRIVER_GEOMETRY = new BufferGeometry();
DRIVER_GEOMETRY.setAttribute('position', new BufferAttribute(new Float32Array(9), 3));
let driverMaterial: MeshBasicNodeMaterial | null = null;
/** Render order of the driver meshes: before every kind mesh, so the cull in its onBeforeRender comes first. */
export const MARINE_DRIVER_ORDER = -1e9;

/** A ReefBatch whose storage, records and meshes are three's (see the file comment). */
export interface MarineShadingBatch extends ReefBatch {
  readonly shading: MarineShading;
  readonly nodes: MarineBatchNodes;
  readonly kindGeometries: BufferGeometry[];
  readonly kindMeshes: { main: MarineKindMesh[]; fade: MarineKindMesh[] };
}

/**
 * The source fish and whale materials as native three.js WebGPU node materials. Fish: pass `Batch` to
 * setMarineBatch (or FishSchools' `Batch` option) before building FishSchools / FishProps; the batch builds
 * the native materials from the source records itself. Whale: `attachWhale(whale)` after `whale.load()`.
 */
export class MarineShading {
  readonly time: N;
  readonly frameIndex: N;
  readonly sunColor: N;
  readonly cameraPosition: N;
  readonly view: N;
  readonly materials: Material[] = [];
  /** ReefBatch class for the fish batches (setMarineBatch( shading.Batch )). */
  readonly Batch: MarineBatchClass;
  #ownTime: boolean;

  constructor(bindings: MarineShadingBindings = {}) {
    const t = TSL as N;
    this.#ownTime = !bindings.time;
    this.time = bindings.time ?? t.uniform(0);
    this.frameIndex = bindings.frameIndex ?? t.uniform(0, 'uint');
    this.sunColor = bindings.sunColor ?? t.uniform(new Vector3(1, 1, 1));
    this.cameraPosition = bindings.cameraPosition ?? t.cameraPosition;
    this.view = bindings.view ?? t.cameraViewMatrix;
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- the batch class closes over its shading
    const shading = this;
    this.Batch = class extends ReefBatch {
      readonly shading = shading;
      readonly nodes: MarineBatchNodes;
      readonly kindGeometries: BufferGeometry[];
      readonly kindMeshes = { main: [] as MarineKindMesh[], fade: [] as MarineKindMesh[] };

      constructor(name: string, kinds: MarineBatchKind[], options: ReefBatchOptions) {
        super(name, kinds as ReefKind[], options, { StorageBuffer: MarineStorageBuffer, ShaderModule: RecordingShaderModule });
        this.nodes = {
          instances: nodeOf(this.instanceBuffer, 'instances'),
          list: nodeOf(this.listBuffer, 'list'),
          base: nodeOf(this.baseBuffer, 'base'),
          fadeList: this.fadeListBuffer ? nodeOf(this.fadeListBuffer, 'fadeList') : null,
          fadeBase: this.fadeBaseBuffer ? nodeOf(this.fadeBaseBuffer, 'fadeBase') : null,
        };
        this.kindGeometries = kindGeometries(this);
      }

      override createMesh(material: unknown, { castShadow = false, receiveShadow = true }: { castShadow?: boolean; receiveShadow?: boolean } = {}): Mesh<BufferGeometry, Material> {
        const driver = shading.drive(this as unknown as MarineShadingBatch, material as WgslMaterial, 'main', castShadow, receiveShadow);
        this.mesh = driver;
        return driver;
      }

      override createFadeMesh(material: unknown): Mesh<BufferGeometry, Material> {
        const driver = shading.drive(this as unknown as MarineShadingBatch, material as WgslMaterial, 'fade', false, true);
        driver.name = this.name + '.fade';
        this.fadeMesh = driver;
        return driver;
      }
    } as unknown as MarineBatchClass;
  }

  /** The driver mesh of one batch channel and its per-kind meshes (children) with the native material. */
  drive(batch: MarineShadingBatch, record: WgslMaterial, channel: 'main' | 'fade', castShadow: boolean, receiveShadow: boolean): Mesh<BufferGeometry, Material> {
    const material = this.fishMaterial(record, batch);
    const driver = new Mesh<BufferGeometry, Material>(DRIVER_GEOMETRY, (driverMaterial ??= new MeshBasicNodeMaterial({ colorWrite: false, depthWrite: false })));
    driver.name = batch.name;
    driver.frustumCulled = false;
    driver.castShadow = false;
    driver.receiveShadow = false;
    driver.matrixAutoUpdate = false;
    driver.renderOrder = MARINE_DRIVER_ORDER;
    Object.defineProperty(driver, 'count', { configurable: true, value: 0 });
    // three calls onBeforeRender before the draw; the owners (FishSchools, FishProps) wrap it to cull
    driver.onBeforeRender = () => {};
    const counts = (): Uint32Array => (channel === 'main' ? batch.counts : batch.fadeCounts!);
    batch.kinds.forEach((kind, k) => {
      const mesh = new Mesh(batch.kindGeometries[k], material) as unknown as MarineKindMesh;
      mesh.name = `${batch.name}.${channel}.${k}`;
      mesh.frustumCulled = false;
      mesh.matrixAutoUpdate = false;
      mesh.receiveShadow = receiveShadow;
      // the source shadow pass draws the kinds flagged `shadow`, the main pass all but `shadowOnly`
      mesh.castShadow = castShadow && !!kind.shadow;
      mesh.userData = { kind: k, channel, shadowPass: false };
      mesh.onBeforeRender = (_r, scene: Scene) => {
        mesh.userData.shadowPass = !!(scene?.overrideMaterial as { isShadowPassMaterial?: boolean } | null)?.isShadowPassMaterial;
      };
      Object.defineProperty(mesh, 'count', {
        configurable: true,
        get: () => {
          const n = counts()[k] ?? 0;
          if (mesh.userData.shadowPass) return kind.shadow ? n : 0;
          return kind.shadowOnly ? 0 : n;
        },
      });
      batch.kindMeshes[channel].push(mesh);
      driver.add(mesh);
    });
    return driver;
  }

  /** The native material of a fish material record (Fish, FishFade, FishProps, FishPropsFade). */
  fishMaterial(record: WgslMaterial, batch: MarineShadingBatch): MeshPhysicalNodeMaterial {
    const t = TSL as N;
    const o = optionsOf(record);
    const fade = o.name.endsWith('Fade');
    const wgsl = fishShadingWgsl(record, batch);
    const mat = new MeshPhysicalNodeMaterial({ side: FrontSide, roughness: o.roughness, metalness: o.metalness });
    const vertex = fishVertexNodes(wgsl.vertex, batch.nodes, {
      instance: t.instanceIndex,
      position: t.positionGeometry,
      normal: t.normalGeometry,
      aData: t.attribute('aData', 'vec4'),
      aKind: t.attribute('aKind', 'float'),
    }, fade);
    const v = vertex.varyings;
    const n = t.varying(vertex.normal, 'twFishNormal').normalize();
    const data = t.varying(v.vFishData, 'twFishData');
    const surface = fishSurfaceNodes(wgsl, {
      P: t.positionWorld,
      N: n,
      V: this.cameraPosition.sub(t.positionWorld).normalize(),
      pixel: t.screenCoordinate.xy,
      time: this.time,
      frameIndex: this.frameIndex,
      view: this.view,
      local: t.varying(v.vFishLocal, 'twFishLocal'),
      data,
      info: t.varying(v.vFishInfo, 'twFishInfo'),
      flags: t.varying(v.vFishFlags, 'twFishFlags'),
      fade: t.varying(v.vFishFade, 'twFishFade'),
    });
    mat.positionNode = vertex.position;
    this.#wire(mat, surface, o.name.startsWith('FishProps'));
    const shadow = wgsl.shadow ? fishShadowNode(wgsl, { pixel: t.screenCoordinate.xy, time: this.time, data }) : null;
    if (shadow) mat.maskShadowNode = shadow.greaterThan(0.5);
    mat.name = o.name;
    mat.userData.marine = { options: o, wgsl, vertex, surface, shadow } satisfies MarineMaterialGraph;
    this.materials.push(mat);
    return mat;
  }

  /**
   * The whale's native material (rig vertex stage over whale.uPos / uRot / uFlip, baked skin); replaces the
   * stand-in on every level of detail. Call after `whale.load()`.
   */
  attachWhale(whale: Whale): MeshPhysicalNodeMaterial {
    const t = TSL as N;
    if (!whale.ready) throw new Error('marine shading: load the whale first');
    const record = whale.material;
    const o = optionsOf(record);
    const wgsl = whaleShadingWgsl(record);
    if (!whale.albedoTex || !whale.heightTex) throw new Error('marine shading: the whale needs its baked textures');
    const albedo = t.texture(whale.albedoTex as Texture);
    const height = t.texture(whale.heightTex as Texture);
    const uniform = (k: string) => t.uniform(0).onRenderUpdate(() => (record.uniforms[k]!.value as number) ?? 0);
    const vertex = whaleVertexNodes(wgsl.vertex, {
      position: t.positionGeometry,
      normal: t.normalGeometry,
      uv: t.uv(),
      rig: t.attribute('rig', 'vec4'),
      pos: t.uniformArray(whale.uPos.array, 'vec4'),
      rot: t.uniformArray(whale.uRot.array, 'vec4'),
      flip: t.uniformArray(whale.uFlip.array, 'vec4'),
      heightTexture: height,
    });
    const surface = whaleSurfaceNodes(wgsl, {
      P: t.positionWorld,
      N: t.varying(vertex.normal, 'twWhaleNormal').normalize(),
      V: this.cameraPosition.sub(t.positionWorld).normalize(),
      uv: t.uv(),
      water: uniform('whaleWater'),
      wet: uniform('whaleWet'),
      albedoTexture: albedo,
      heightTexture: height,
    });
    const mat = new MeshPhysicalNodeMaterial({ side: FrontSide, roughness: o.roughness, metalness: o.metalness });
    mat.name = o.name;
    mat.positionNode = vertex.position;
    this.#wire(mat, surface, false);
    mat.userData.marine = { options: o, wgsl, vertex, surface, shadow: null } satisfies MarineMaterialGraph;
    for (const mesh of whale.meshes) {
      if (!mesh.matrix.equals(mesh.matrix.clone().identity()))
        throw new Error('marine shading: the whale meshes must stay at the origin (world positions)');
      mesh.material = mat;
    }
    this.materials.push(mat);
    return mat;
  }

  #wire(mat: MeshPhysicalNodeMaterial, s: MarineSurface, clearcoat: boolean): void {
    const t = TSL as N;
    mat.colorNode = s.albedo;
    mat.roughnessNode = s.roughness;
    mat.metalnessNode = s.metalness;
    mat.aoNode = s.ao;
    mat.specularIntensityNode = s.specularIntensity;
    // engine fs(): s.normal = normalize( s.normal ) (world space) -> three's view-space normal
    mat.normalNode = t.cameraViewMatrix.mul(t.vec4(s.normal.normalize(), 0)).xyz;
    mat.emissiveNode = s.translucency.mul(this.sunColor);
    if (clearcoat) {
      mat.clearcoatNode = s.clearcoat;
      mat.clearcoatRoughnessNode = s.clearcoatRoughness;
    }
  }

  /** Advances the owned clock (when no `time` binding was given). */
  update(dt: number): void {
    if (this.#ownTime && dt > 0) this.time.value += dt;
  }

  dispose(): void {
    for (const m of this.materials) m.dispose();
    this.materials.length = 0;
  }
}

/** Per-kind geometries over the batch's merged buffers: one shared index with the base vertices applied. */
function kindGeometries(batch: ReefBatch): BufferGeometry[] {
  const g = batch.geometry;
  const src = g.index!.array as Uint32Array;
  const index = new Uint32Array(src.length);
  batch.kinds.forEach((_, k) => {
    const first = batch.firstIndex[k]!, count = batch.indexCount[k]!, base = batch.baseVertex[k]!;
    for (let i = first; i < first + count; i++) index[i] = src[i]! + base;
  });
  const shared = new BufferAttribute(index, 1);
  return batch.kinds.map((_, k) => {
    const kg = new BufferGeometry();
    for (const name of Object.keys(g.attributes)) kg.setAttribute(name, g.attributes[name]!);
    kg.setIndex(shared);
    kg.setDrawRange(batch.firstIndex[k]!, batch.indexCount[k]!);
    return kg;
  });
}

/** Mesh helpers for tests and owners: every kind mesh of a batch built by MarineShading.Batch. */
export function marineKindMeshes(o: Object3D): MarineKindMesh[] {
  const out: MarineKindMesh[] = [];
  o.traverse((c) => {
    if ((c as MarineKindMesh).userData?.channel) out.push(c as MarineKindMesh);
  });
  return out;
}
