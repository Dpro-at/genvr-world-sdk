/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
// Source: the WGSL vertex / surface snippets of src/world/wildlife/BirdBatch.js 143-389, CritterBatch.js
// 78-278, ShadowBlobs.js 27-68 and src/world/Gulls.js 29-64 (taken from the port's material options, which
// keep them 1:1 with the source), run inside the engine contract of src/engine/render/MeshShader.js
// (VertexData, VSOut, FragInput, surfaceOf, the useWorld transform), src/engine/render/wgsl/lighting.js
// (Surface, defaultSurface), src/engine/render/Material.js (built-in uniforms) and the engine noise of
// src/engine/render/wgsl/common.js.
//
// Native three.js WebGPU node materials for the four wildlife draws. The engine binds each batch's
// instance records and template data as storage buffers and the snippets index them with
// `v.instance` / `v.vertex`. Here three's storage nodes read the same buffers with the same index
// arithmetic (record `v.instance * stride + k`, template `( species * vertices + v.vertex ) * n + k`),
// and a generated wgslFn entry hands the fetched elements to the verbatim snippet as a local window:
// local arrays named like the source buffers, `v.instance = 0` and `v.vertex` offset so that the
// snippet's own index expressions land on element 0 of the window. The entry then returns the engine's
// useWorld transform (world position, normal, previous position) or the varyings, packed into a
// mat4x4f; named output nodes are taken from it (the GPU parity test compares every named output).
// Surfaces run the same way (frame, mat, `in` and `s` rebuilt as the engine seeds them); three's
// MeshStandard lighting plays the engine's shadeSurface, and the bird `s.translucency` is added to the
// sun's direct diffuse light like the plant materials do (vegetation/transmission.ts).
//
// Divergences (see docs/reference/tidewater-world/19-wildlife-shading/README.md): previous positions
// are computed but not wired (three has no per-vertex motion input); the critter burrow dither is
// not resolved by a temporal filter; the contact shadows draw in three's transparent pass (layer 0
// is enabled on the mesh, the source late-pass layer kept).
import {
  FrontSide,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  NormalBlending,
  StorageBufferAttribute,
  TSL,
  Vector3,
  type DirectionalLight,
  type Material,
} from 'three/webgpu';
import type { Mesh } from 'three';
import type {
  StorageBufferOptions,
  WgslModule,
  WildlifeMaterialFactory,
  WildlifeMaterialOptions,
  WildlifeStorageBuffer,
} from './kit.js';
import { BOAT_COMMON_WGSL } from '../tidewater-boat/boat-shading.js';
import { copyPlantTransmission, registerPlantTransmission } from '../vegetation/transmission.js';
/* eslint-disable @typescript-eslint/no-explicit-any -- native TSL graph boundary */
type N = any;

/** Engine common lines the snippets use (common.js: sat and the MaterialX noise, as the boat copies them). */
export const CREATURE_COMMON_WGSL = BOAT_COMMON_WGSL;

/**
 * Engine common.js 86 (interleaved gradient noise) under a prefixed name: three's own shadow filter
 * declares a function `interleavedGradientNoise` in lit fragment shaders, so the critter surface
 * snippet's one call is renamed to this copy (the only textual change to a source snippet).
 */
export const CREATURE_IGN_WGSL =
  'fn twInterleavedGradientNoise( px: vec2f ) -> f32 { return fract( 52.9829189 * fract( dot( px, vec2f( 0.06711056, 0.00583715 ) ) ) ); }\n';

/** The critter surface snippet with its noise call renamed (see CREATURE_IGN_WGSL). */
export function critterSurfaceSnippet(surface: string): string {
  const calls = surface.match(/\binterleavedGradientNoise\(/g)?.length ?? 0;
  if (calls !== 1) throw new Error(`creature shading: expected one interleavedGradientNoise call, found ${calls}`);
  return surface.replace(/\binterleavedGradientNoise\(/, 'twInterleavedGradientNoise(');
}

// ---------------------------------------------------------------- storage buffers

/** A source StorageBuffer on three: a StorageBufferAttribute (vec4f elements) and its read-only node. */
export class CreatureStorageBuffer implements WildlifeStorageBuffer {
  readonly options: StorageBufferOptions;
  readonly attribute: StorageBufferAttribute;
  readonly node: N;
  writes = 0;

  constructor(options: StorageBufferOptions) {
    if (options.type !== 'vec4f') throw new Error(`creature storage: ${options.label} is ${options.type}, not vec4f`);
    this.options = options;
    const array = new Float32Array(Math.max(1, options.count) * 4);
    if (options.data) array.set(options.data);
    this.attribute = new StorageBufferAttribute(array, 4);
    this.node = (TSL as N).storage(this.attribute, 'vec4', Math.max(1, options.count)).toReadOnly();
  }

  /** Same contract as the engine: upload the used part (the batches pass a subarray from 0). */
  write(data: Float32Array): void {
    const a = this.attribute;
    (a.array as Float32Array).set(data);
    a.clearUpdateRanges();
    a.addUpdateRange(0, data.length);
    a.needsUpdate = true;
    this.writes++;
  }

  dispose(): void {
    // three frees the GPU buffer with the geometry / material that used it; nothing to own here
  }
}

/** StorageBufferFactory for the wildlife batches (pass as `storageBuffer`). */
export const creatureStorageBuffer = (options: StorageBufferOptions): CreatureStorageBuffer =>
  new CreatureStorageBuffer(options);

const nodeOf = (b: unknown, name: string): N => {
  if (!(b instanceof CreatureStorageBuffer))
    throw new Error(`creature shading: storage ${name} was not made by creatureStorageBuffer`);
  return b.node;
};

// ---------------------------------------------------------------- WGSL generation helpers

/** WGSL float literal of the float32 value the engine would upload. */
export const f32Literal = (x: number): string => {
  const s = String(Math.fround(x));
  return s.includes('.') || s.includes('e') ? s : s + '.0';
};
const vec4Literal = (v: { x: number; y: number; z: number; w: number }) =>
  `vec4f( ${f32Literal(v.x)}, ${f32Literal(v.y)}, ${f32Literal(v.z)}, ${f32Literal(v.w)} )`;
const arrayLiteral = (values: { x: number; y: number; z: number; w: number }[]) =>
  `array<vec4f, ${values.length}>( ${values.map(vec4Literal).join(', ')} )`;

/** The modules a snippet needs, dependencies first, each once (engine collectModules order). */
function moduleCode(modules: WgslModule[] = []): string {
  const seen = new Set<WgslModule>();
  let out = '';
  const add = (m: WgslModule) => {
    if (seen.has(m)) return;
    seen.add(m);
    for (const d of m.deps ?? []) add(d);
    out += m.code;
  };
  modules.forEach(add);
  return out;
}

/** Record reads of a snippet: `name[ v.instance * <stride>u + <k>u ]`. */
export function recordLayout(snippet: string, buffer: string): { stride: number; slots: number[] } {
  const re = new RegExp(`\\b${buffer}\\[ v\\.instance \\* (\\d+)u \\+ (\\d+)u \\]`, 'g');
  let stride = 0;
  const slots: number[] = [];
  for (const m of snippet.matchAll(re)) {
    stride = Number(m[1]);
    slots.push(Number(m[2]));
  }
  if (!stride) throw new Error(`creature shading: no ${buffer} record reads`);
  return { stride, slots };
}

/** Template stride of a snippet: `( si * <vertices>u + v.vertex ) * <n>u`. */
export function templateLayout(snippet: string): { vertices: number; elements: number } {
  const m = snippet.match(/\( si \* (\d+)u \+ v\.vertex \) \* (\d+)u/);
  if (!m) throw new Error('creature shading: no template index in the snippet');
  return { vertices: Number(m[1]), elements: Number(m[2]) };
}

const struct = (name: string, fields: Record<string, string>) =>
  `struct ${name} { ${Object.entries(fields)
    .map(([k, t]) => `${k}: ${t}`)
    .join(', ')} };\n`;

// The engine's world transform after materialVertex (MeshShader.js vs(), the useWorld branch with an
// identity model: the batches never move their mesh) and the previous-position fallback.
const WORLD_RETURN = `
	let twWp = select( v.position + v.worldOffset, v.worldPos, v.useWorld );
	let twWn = select( v.normal, v.worldNormal, v.useWorld );
	let twPwp = select( v.position + select( v.prevWorldOffset, v.worldOffset, v.prevWorldOffset.x > 1e29 ), select( v.prevWorldPos, twWp, v.prevWorldPos.x > 1e29 ), v.useWorld );`;

/** Fields of the engine VertexData every vertex entry declares (MeshShader.js `vdata`). */
const VERTEX_FIELDS = {
  position: 'vec3f',
  normal: 'vec3f',
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
	v.worldOffset = vec3f( 0.0 );
	v.prevWorldOffset = vec3f( 1e30 );
	v.useWorld = false;
	v.prevWorldPos = vec3f( 1e30 );`;

/** Fields of the engine Surface the snippets read or write (lighting.js). */
const SURFACE_FIELDS = {
  albedo: 'vec3f',
  alpha: 'f32',
  normal: 'vec3f',
  roughness: 'f32',
  emissive: 'vec3f',
  metalness: 'f32',
  translucency: 'vec3f',
  ao: 'f32',
};
const FRAME_FIELDS = { time: 'f32', night: 'f32', sunDir: 'vec3f' };

// engine surfaceOf( in ) on defaultSurface( in.N ): mat.color * in.color.rgb, mat.opacity * in.color.a,
// mat.roughness, mat.metalness, mat.emissive (Material.js built-ins: white, 1, black)
function surfaceSeed(o: WildlifeMaterialOptions): string {
  return `
	var s: TwSurface;
	s.albedo = vec3f( 1.0, 1.0, 1.0 ) * in.color.rgb;
	s.alpha = 1.0 * in.color.a;
	s.normal = in.N;
	s.roughness = ${f32Literal(o.roughness ?? 1)};
	s.metalness = ${f32Literal(o.metalness ?? 0)};
	s.emissive = vec3f( 0.0, 0.0, 0.0 );
	s.translucency = vec3f( 0.0 );
	s.ao = 1.0;`;
}
const SURFACE_RETURN =
  '\treturn mat4x4f( vec4f( s.albedo, s.alpha ), vec4f( s.normal, s.roughness ), vec4f( s.emissive, s.metalness ), vec4f( s.translucency, s.ao ) );';

/** Named surface outputs of a packed surface (the order of SURFACE_RETURN). */
export interface CreatureSurface {
  albedo: N;
  alpha: N;
  normal: N;
  roughness: N;
  emissive: N;
  metalness: N;
  translucency: N;
  ao: N;
}
function surfaceOutputs(m: N): CreatureSurface {
  return {
    albedo: m.element(0).xyz,
    alpha: m.element(0).w,
    normal: m.element(1).xyz,
    roughness: m.element(1).w,
    emissive: m.element(2).xyz,
    metalness: m.element(2).w,
    translucency: m.element(3).xyz,
    ao: m.element(3).w,
  };
}

/** Named vertex outputs: the engine world transform plus the material's varyings. */
export interface CreatureVertex {
  position: N;
  normal: N;
  previous: N;
  varyings: Record<string, N>;
}

// varyings packed in declaration order into the columns of the second output (each in one column)
function varyingPacking(varyings: Record<string, string>): { name: string; col: number; size: number }[] {
  const size = (t: string) => ({ f32: 1, vec2f: 2, vec3f: 3, vec4f: 4 })[t] ?? 0;
  return Object.entries(varyings).map(([name, t], col) => {
    if (!size(t) || col > 3) throw new Error(`creature shading: cannot pack varying ${name}: ${t}`);
    return { name, col, size: size(t) };
  });
}
function varyingReturn(varyings: Record<string, string>): string {
  const cols = ['vec4f( 0.0 )', 'vec4f( 0.0 )', 'vec4f( 0.0 )', 'vec4f( 0.0 )'];
  for (const p of varyingPacking(varyings))
    cols[p.col] =
      p.size === 4 ? `o.${p.name}` : `vec4f( o.${p.name}${', 0.0'.repeat(4 - p.size)} )`;
  return `\treturn mat4x4f( ${cols.join(', ')} );`;
}
function vertexOutputs(world: N, vary: N, varyings: Record<string, string>): CreatureVertex {
  const pick = ['x', 'xy', 'xyz', 'xyzw'];
  const out: Record<string, N> = {};
  for (const p of varyingPacking(varyings)) out[p.name] = (vary.element(p.col) as N)[pick[p.size - 1]!];
  return { position: world.element(0).xyz, normal: world.element(1).xyz, previous: world.element(2).xyz, varyings: out };
}
const VERTEX_WORLD_RETURN =
  '\tif ( twOut == 0u ) { return mat4x4f( vec4f( twWp, 0.0 ), vec4f( twWn, 0.0 ), vec4f( twPwp, 0.0 ), vec4f( 0.0 ) ); }';

// ---------------------------------------------------------------- generated entries

const recParams = (n: number) => Array.from({ length: n }, (_, k) => `twR${k}`);

/** Inputs of the bird vertex entry: the 16 record vec4, the species elements A-D, the output selector. */
export const BIRD_VERTEX_INPUTS = [...recParams(16), 'twA', 'twB', 'twC', 'twD', 'twOut'] as const;
export const BIRD_SURFACE_INPUTS = ['twRest', 'twRestN', 'twInfo', 'twFold', 'twN', 'twSunDir'] as const;
export const CRITTER_VERTEX_INPUTS = [...recParams(6), 'twA', 'twB', 'twLimb', 'twRing', 'twOut'] as const;
export const CRITTER_SURFACE_INPUTS = ['twInfo', 'twLocal', 'twPixel', 'twTime'] as const;
export const BLOB_VERTEX_INPUTS = ['twR0', 'twR1', 'twPosition', 'twSunDir', 'twOut'] as const;
export const BLOB_SURFACE_INPUTS = ['twUv', 'twInfo', 'twNight'] as const;
export const GULL_VERTEX_INPUTS = ['twPosition', 'twA', 'twB', 'twSide', 'twSpan', 'twTime'] as const;

function birdVertexEntry(o: WildlifeMaterialOptions): string {
  const snippet = o.vertex!;
  const rec = recordLayout(snippet, 'birdInstances');
  const tpl = templateLayout(snippet);
  const joints = o.uniforms!.birdJoints![1] as { x: number; y: number; z: number; w: number }[];
  return `
fn twBirdVertex( ${recParams(rec.stride).map((p) => p + ': vec4f').join(', ')}, twA: vec4f, twB: vec4f, twC: vec4f, twD: vec4f, twOut: u32 ) -> mat4x4f {
	// the record and species windows (see the file comment)
	var birdInstances = array<vec4f, ${rec.stride}>( ${recParams(rec.stride).join(', ')} );
	var birdSpecies = array<vec4f, ${tpl.elements}>( twA, twB, twC, twD );
	var mat: TwBirdMat;
	mat.birdJoints = ${arrayLiteral(joints)};
	var v: TwBirdVertexData;
	v.position = vec3f( 0.0 );
	v.normal = vec3f( 0.0, 1.0, 0.0 );
	v.instance = 0u;
	v.vertex = 0u - u32( twR9.w + 0.5 ) * ${tpl.vertices}u;
${VERTEX_SEED}
	var o: TwBirdVaryings;
	{
${snippet}
	}
${WORLD_RETURN}
${VERTEX_WORLD_RETURN}
${varyingReturn(o.varyings!)}
}
${struct('TwBirdVertexData', VERTEX_FIELDS)}${struct('TwBirdVaryings', o.varyings!)}${struct('TwBirdMat', { birdJoints: `array<vec4f, ${joints.length}>` })}${moduleCode(o.modules)}`;
}

function birdSurfaceEntry(o: WildlifeMaterialOptions): string {
  const joints = o.uniforms!.birdJoints![1] as { x: number; y: number; z: number; w: number }[];
  return `
fn twBirdSurface( twRest: vec3f, twRestN: vec3f, twInfo: vec4f, twFold: f32, twN: vec3f, twSunDir: vec3f ) -> mat4x4f {
	var in: TwBirdIn;
	in.vs.vBirdRest = twRest;
	in.vs.vBirdRestN = twRestN;
	in.vs.vBirdInfo = twInfo;
	in.vs.vBirdFold = twFold;
	in.N = twN;
	in.color = vec4f( 1.0 );
	var frame: TwFrame;
	frame.sunDir = twSunDir;
	var mat: TwBirdMat;
	mat.birdJoints = ${arrayLiteral(joints)};
${surfaceSeed(o)}
	{
${o.surface}
	}
${SURFACE_RETURN}
}
${struct('TwBirdVs', o.varyings!)}${struct('TwBirdIn', { vs: 'TwBirdVs', N: 'vec3f', color: 'vec4f' })}${struct('TwFrame', FRAME_FIELDS)}${struct('TwSurface', SURFACE_FIELDS)}${struct('TwBirdMat', { birdJoints: `array<vec4f, ${joints.length}>` })}${CREATURE_COMMON_WGSL}`;
}

function critterVertexEntry(o: WildlifeMaterialOptions): string {
  const snippet = o.vertex!;
  const rec = recordLayout(snippet, 'critterInstances');
  const tpl = templateLayout(snippet);
  const limbs = o.uniforms!.critterLimbs![1] as { x: number; y: number; z: number; w: number }[];
  const gait = o.uniforms!.critterGait![1] as { x: number; y: number; z: number; w: number }[];
  return `
fn twCritterVertex( ${recParams(rec.stride).map((p) => p + ': vec4f').join(', ')}, twA: vec4f, twB: vec4f, twLimb: vec4f, twRing: vec2f, twOut: u32 ) -> mat4x4f {
	var critterInstances = array<vec4f, ${rec.stride}>( ${recParams(rec.stride).join(', ')} );
	var critterBodies = array<vec4f, ${tpl.elements}>( twA, twB );
	var v: TwCritterVertexData;
	v.position = vec3f( 0.0 );
	v.normal = vec3f( 0.0, 1.0, 0.0 );
	v.aLimb = twLimb;
	v.aRing = twRing;
	v.instance = 0u;
	v.vertex = 0u - u32( twR2.x + 0.5 ) * ${tpl.vertices}u;
${VERTEX_SEED}
	var o: TwCritterVaryings;
	{
${snippet}
	}
${WORLD_RETURN}
${VERTEX_WORLD_RETURN}
${varyingReturn(o.varyings!)}
}
${struct('TwCritterVertexData', { ...VERTEX_FIELDS, ...o.attributes })}${struct('TwCritterVaryings', o.varyings!)}${struct('TwCritterMat', { critterLimbs: `array<vec4f, ${limbs.length}>`, critterGait: `array<vec4f, ${gait.length}>` })}var<private> mat: TwCritterMat = TwCritterMat( ${arrayLiteral(limbs)}, ${arrayLiteral(gait)} );
${moduleCode(o.modules)}`;
}

function critterSurfaceEntry(o: WildlifeMaterialOptions): string {
  return `
fn twCritterSurface( twInfo: vec4f, twLocal: vec3f, twPixel: vec2f, twTime: f32 ) -> mat4x4f {
	var in: TwCritterIn;
	in.vs.vCritInfo = twInfo;
	in.vs.vCritLocal = twLocal;
	in.color = vec4f( 1.0 );
	in.pixel = twPixel;
	in.N = vec3f( 0.0, 1.0, 0.0 );
	var frame: TwFrame;
	frame.time = twTime;
${surfaceSeed(o)}
	{
${critterSurfaceSnippet(o.surface!)}
	}
${SURFACE_RETURN}
}
${struct('TwCritterVs', o.varyings!)}${struct('TwCritterIn', { vs: 'TwCritterVs', N: 'vec3f', color: 'vec4f', pixel: 'vec2f' })}${struct('TwFrame', FRAME_FIELDS)}${struct('TwSurface', SURFACE_FIELDS)}${CREATURE_COMMON_WGSL}${CREATURE_IGN_WGSL}`;
}

function blobVertexEntry(o: WildlifeMaterialOptions): string {
  const rec = recordLayout(o.vertex!, 'blobInstances');
  return `
fn twBlobVertex( twR0: vec4f, twR1: vec4f, twPosition: vec3f, twSunDir: vec3f, twOut: u32 ) -> mat4x4f {
	var blobInstances = array<vec4f, ${rec.stride}>( twR0, twR1 );
	var frame: TwFrame;
	frame.sunDir = twSunDir;
	var v: TwBlobVertexData;
	v.position = twPosition;
	v.normal = vec3f( 0.0, 1.0, 0.0 );
	v.instance = 0u;
	v.vertex = 0u;
${VERTEX_SEED}
	var o: TwBlobVaryings;
	{
${o.vertex}
	}
${WORLD_RETURN}
${VERTEX_WORLD_RETURN}
${varyingReturn(o.varyings!)}
}
${struct('TwBlobVertexData', VERTEX_FIELDS)}${struct('TwBlobVaryings', o.varyings!)}${struct('TwFrame', FRAME_FIELDS)}`;
}

function blobSurfaceEntry(o: WildlifeMaterialOptions): string {
  return `
fn twBlobSurface( twUv: vec2f, twInfo: vec4f, twNight: f32 ) -> mat4x4f {
	var in: TwBlobIn;
	in.vs.vBlobUV = twUv;
	in.vs.vBlobInfo = twInfo;
	in.color = vec4f( 1.0 );
	in.N = vec3f( 0.0, 1.0, 0.0 );
	var frame: TwFrame;
	frame.night = twNight;
${surfaceSeed(o)}
	{
${o.surface}
	}
${SURFACE_RETURN}
}
${struct('TwBlobVs', o.varyings!)}${struct('TwBlobIn', { vs: 'TwBlobVs', N: 'vec3f', color: 'vec4f' })}${struct('TwFrame', FRAME_FIELDS)}${struct('TwSurface', SURFACE_FIELDS)}`;
}

function gullVertexEntry(o: WildlifeMaterialOptions): string {
  return `
fn twGullVertex( twPosition: vec3f, twA: vec4f, twB: vec4f, twSide: f32, twSpan: f32, twTime: f32 ) -> vec3f {
	var v: TwGullVertexData;
	v.position = twPosition;
	v.gA = twA;
	v.gB = twB;
	v.gSide = twSide;
	v.gSpan = twSpan;
	var frame: TwFrame;
	frame.time = twTime;
	{
${o.vertex}
	}
	return v.position;
}
${struct('TwGullVertexData', { position: 'vec3f', ...o.attributes })}${struct('TwFrame', FRAME_FIELDS)}`;
}

export interface CreatureShadingWgsl {
  vertex: string;
  surface: string | null;
}

/** The generated WGSL of one wildlife material (entry first: wgslFn calls the first declaration). */
export function creatureShadingWgsl(o: WildlifeMaterialOptions): CreatureShadingWgsl {
  switch (o.name) {
    case 'Birds':
      return { vertex: birdVertexEntry(o), surface: birdSurfaceEntry(o) };
    case 'Critters':
      return { vertex: critterVertexEntry(o), surface: critterSurfaceEntry(o) };
    case 'ContactShadows':
      return { vertex: blobVertexEntry(o), surface: blobSurfaceEntry(o) };
    case 'Gull':
      return { vertex: gullVertexEntry(o), surface: null };
  }
  throw new Error(`creature shading: no native material for ${o.name}`);
}

// ---------------------------------------------------------------- node graphs

/** Index inputs of a vertex graph: the material passes the draw builtins, tests a compute layout. */
export interface CreatureIndices {
  instance: N;
  vertex: N;
}

const recordReads = (records: N, stride: number, instance: N) =>
  Array.from({ length: stride }, (_, k) => records.element(instance.mul(TSL.uint(stride)).add(TSL.uint(k))));

/** Bird vertex outputs (world transform and varyings) for one instance / vertex. */
export function birdVertexNodes(o: WildlifeMaterialOptions, wgsl: string, idx: CreatureIndices): CreatureVertex {
  const t = TSL as N;
  const records = nodeOf(o.storage!.birdInstances, 'birdInstances');
  const species = nodeOf(o.storage!.birdSpecies, 'birdSpecies');
  const rec = recordLayout(o.vertex!, 'birdInstances');
  const tpl = templateLayout(o.vertex!);
  const r = recordReads(records, rec.stride, idx.instance);
  // the snippet's own species index: si = u32( r9.w + 0.5 ), base = ( si * NV + v.vertex ) * 4
  const si = t.uint(r[9].w.add(0.5));
  const base = si.mul(t.uint(tpl.vertices)).add(idx.vertex).mul(t.uint(tpl.elements));
  const params: Record<string, N> = {};
  r.forEach((n, k) => (params[`twR${k}`] = n));
  ['twA', 'twB', 'twC', 'twD'].forEach((k, i) => (params[k] = species.element(base.add(t.uint(i)))));
  const fn = t.wgslFn(wgsl);
  return vertexOutputs(fn({ ...params, twOut: t.uint(0) }), fn({ ...params, twOut: t.uint(1) }), o.varyings!);
}

/** Critter vertex outputs; `limb` / `ring` are the template's aLimb / aRing attributes. */
export function critterVertexNodes(
  o: WildlifeMaterialOptions,
  wgsl: string,
  idx: CreatureIndices & { limb: N; ring: N },
): CreatureVertex {
  const t = TSL as N;
  const records = nodeOf(o.storage!.critterInstances, 'critterInstances');
  const bodies = nodeOf(o.storage!.critterBodies, 'critterBodies');
  const rec = recordLayout(o.vertex!, 'critterInstances');
  const tpl = templateLayout(o.vertex!);
  const r = recordReads(records, rec.stride, idx.instance);
  // the snippet's body index: si = u32( r2.x + 0.5 ), base = ( si * BODY_VERTS + v.vertex ) * 2
  // (limb vertices read nothing from it; their index is kept inside the buffer)
  const si = t.uint(r[2].x.add(0.5));
  const count = (o.storage!.critterBodies as CreatureStorageBuffer).options.count;
  const base = t.min(si.mul(t.uint(tpl.vertices)).add(idx.vertex).mul(t.uint(tpl.elements)), t.uint(count - tpl.elements));
  const params: Record<string, N> = {};
  r.forEach((n, k) => (params[`twR${k}`] = n));
  params.twA = bodies.element(base);
  params.twB = bodies.element(base.add(t.uint(1)));
  params.twLimb = idx.limb;
  params.twRing = idx.ring;
  const fn = t.wgslFn(wgsl);
  return vertexOutputs(fn({ ...params, twOut: t.uint(0) }), fn({ ...params, twOut: t.uint(1) }), o.varyings!);
}

/** Contact shadow vertex outputs; `position` is the quad's geometry position. */
export function blobVertexNodes(
  o: WildlifeMaterialOptions,
  wgsl: string,
  idx: { instance: N; position: N; sunDirection: N },
): CreatureVertex {
  const t = TSL as N;
  const records = nodeOf(o.storage!.blobInstances, 'blobInstances');
  const r = recordReads(records, recordLayout(o.vertex!, 'blobInstances').stride, idx.instance);
  const params = { twR0: r[0], twR1: r[1], twPosition: idx.position, twSunDir: idx.sunDirection };
  const fn = t.wgslFn(wgsl);
  return vertexOutputs(fn({ ...params, twOut: t.uint(0) }), fn({ ...params, twOut: t.uint(1) }), o.varyings!);
}

/** Gull position (local; the mesh stays at the origin like the source's) from the instance attributes. */
export function gullVertexNode(
  wgsl: string,
  a: { position: N; gA: N; gB: N; gSide: N; gSpan: N; time: N },
): N {
  return (TSL as N).wgslFn(wgsl)({
    twPosition: a.position,
    twA: a.gA,
    twB: a.gB,
    twSide: a.gSide,
    twSpan: a.gSpan,
    twTime: a.time,
  });
}

/** Bird surface from the varyings (vBirdRest, vBirdRestN, vBirdInfo, vBirdFold) and the normal. */
export function birdSurfaceNodes(
  wgsl: string,
  a: { rest: N; restN: N; info: N; fold: N; normal: N; sunDirection: N },
): CreatureSurface {
  return surfaceOutputs(
    (TSL as N).wgslFn(wgsl)({
      twRest: a.rest,
      twRestN: a.restN,
      twInfo: a.info,
      twFold: a.fold,
      twN: a.normal,
      twSunDir: a.sunDirection,
    }),
  );
}
export function critterSurfaceNodes(wgsl: string, a: { info: N; local: N; pixel: N; time: N }): CreatureSurface {
  return surfaceOutputs((TSL as N).wgslFn(wgsl)({ twInfo: a.info, twLocal: a.local, twPixel: a.pixel, twTime: a.time }));
}
export function blobSurfaceNodes(wgsl: string, a: { uv: N; info: N; night: N }): CreatureSurface {
  return surfaceOutputs((TSL as N).wgslFn(wgsl)({ twUv: a.uv, twInfo: a.info, twNight: a.night }));
}

// ---------------------------------------------------------------- materials

/** Frame inputs (the source engine's frame uniforms); missing ones are owned by CreatureShading. */
export interface CreatureShadingBindings {
  /** Simulation time in seconds (frame.time): gull flight, burrow dither. */
  time?: N;
  /** 0 day .. 1 night (frame.night): contact shadow strength. */
  night?: N;
  /** Direction toward the sun or moon, world space (frame.sunDir): bird translucency, contact shadows. */
  sunDirection?: N;
  /** The key light: the bird wing / tail translucency is added to its direct diffuse light. */
  sun?: DirectionalLight;
}

/** What each material keeps for inspection and tests (the named graph outputs it was wired from). */
export interface CreatureMaterialGraph {
  options: WildlifeMaterialOptions;
  wgsl: CreatureShadingWgsl;
  vertex: CreatureVertex | null;
  surface: CreatureSurface | null;
}

/**
 * The source wildlife materials as native three.js WebGPU node materials. Pass `storageBuffer` and
 * `material` to Wildlife / BirdBatch / CritterBatch / ShadowBlobs / Gulls, then `attach` their meshes.
 */
export class CreatureShading {
  readonly time: N;
  readonly night: N;
  readonly sunDirection: N;
  readonly sun: DirectionalLight | null;
  readonly materials: Material[] = [];
  readonly storageBuffer = creatureStorageBuffer;
  readonly material: WildlifeMaterialFactory = (o) => this.create(o);
  #ownTime: boolean;

  constructor(bindings: CreatureShadingBindings = {}) {
    const t = TSL as N;
    this.#ownTime = !bindings.time;
    this.time = bindings.time ?? t.uniform(0);
    this.night = bindings.night ?? t.uniform(0);
    // source engine frame default (engine/render/Frame.js)
    this.sunDirection = bindings.sunDirection ?? t.uniform(new Vector3(0.3, 0.6, -0.7).normalize());
    this.sun = bindings.sun ?? null;
  }

  /** WildlifeMaterialFactory: one native material per source material (by its name). */
  create(o: WildlifeMaterialOptions): Material {
    const t = TSL as N;
    const wgsl = creatureShadingWgsl(o);
    let mat: MeshStandardNodeMaterial | MeshBasicNodeMaterial;
    let vertex: CreatureVertex | null = null;
    let surface: CreatureSurface | null = null;
    const normalView = (n: N) => t.cameraViewMatrix.mul(t.vec4(n.normalize(), 0)).xyz;
    if (o.name === 'Birds') {
      mat = new MeshStandardNodeMaterial({ side: FrontSide, roughness: o.roughness ?? 1, metalness: o.metalness ?? 0 });
      vertex = birdVertexNodes(o, wgsl.vertex, { instance: t.instanceIndex, vertex: t.vertexIndex });
      const v = vertex.varyings;
      const n = t.varying(vertex.normal, 'twBirdNormal').normalize();
      surface = birdSurfaceNodes(wgsl.surface!, {
        rest: t.varying(v.vBirdRest, 'twBirdRest'),
        restN: t.varying(v.vBirdRestN, 'twBirdRestN'),
        info: t.varying(v.vBirdInfo, 'twBirdInfo'),
        fold: t.varying(v.vBirdFold, 'twBirdFold'),
        normal: n,
        sunDirection: this.sunDirection,
      });
      mat.positionNode = vertex.position;
      mat.normalNode = normalView(n);
      this.#wireLit(mat, surface);
      if (this.sun) {
        registerPlantTransmission(mat, surface.translucency);
        copyPlantTransmission(mat, mat, this.sun);
      }
    } else if (o.name === 'Critters') {
      mat = new MeshStandardNodeMaterial({ side: FrontSide, roughness: o.roughness ?? 1, metalness: o.metalness ?? 0 });
      vertex = critterVertexNodes(o, wgsl.vertex, {
        instance: t.instanceIndex,
        vertex: t.vertexIndex,
        limb: t.attribute('aLimb', 'vec4'),
        ring: t.attribute('aRing', 'vec2'),
      });
      const v = vertex.varyings;
      surface = critterSurfaceNodes(wgsl.surface!, {
        info: t.varying(v.vCritInfo, 'twCritInfo'),
        local: t.varying(v.vCritLocal, 'twCritLocal'),
        pixel: t.screenCoordinate,
        time: this.time,
      });
      mat.positionNode = vertex.position;
      mat.normalNode = normalView(t.varying(vertex.normal, 'twCritNormal'));
      this.#wireLit(mat, surface);
    } else if (o.name === 'ContactShadows') {
      // lit: false, premultiplied blending (one, one - src alpha), no depth write
      mat = new MeshBasicNodeMaterial({
        transparent: true,
        depthWrite: false,
        blending: NormalBlending,
        premultipliedAlpha: true,
        side: FrontSide,
      });
      vertex = blobVertexNodes(o, wgsl.vertex, {
        instance: t.instanceIndex,
        position: t.positionGeometry,
        sunDirection: this.sunDirection,
      });
      const v = vertex.varyings;
      surface = blobSurfaceNodes(wgsl.surface!, {
        uv: t.varying(v.vBlobUV, 'twBlobUv'),
        info: t.varying(v.vBlobInfo, 'twBlobInfo'),
        night: this.night,
      });
      mat.positionNode = vertex.position;
      // engine unlit output: vec4( s.albedo + s.emissive, s.alpha )
      mat.colorNode = surface.albedo.add(surface.emissive);
      mat.opacityNode = surface.alpha;
      mat.fog = false;
    } else {
      // Gull: no surface snippet, so the engine surface is surfaceOf alone: albedo = vertex colour
      mat = new MeshStandardNodeMaterial({
        side: FrontSide,
        vertexColors: !!o.vertexColors,
        roughness: o.roughness ?? 1,
        metalness: o.metalness ?? 0,
      });
      mat.positionNode = gullVertexNode(wgsl.vertex, {
        position: t.positionGeometry,
        gA: t.attribute('gA', 'vec4'),
        gB: t.attribute('gB', 'vec4'),
        gSide: t.attribute('gSide', 'float'),
        gSpan: t.attribute('gSpan', 'float'),
        time: this.time,
      });
    }
    mat.name = o.name;
    mat.userData.creature = { options: o, wgsl, vertex, surface } satisfies CreatureMaterialGraph;
    this.materials.push(mat);
    return mat;
  }

  #wireLit(mat: MeshStandardNodeMaterial, s: CreatureSurface): void {
    mat.colorNode = s.albedo;
    mat.roughnessNode = s.roughness;
    mat.metalnessNode = s.metalness;
    mat.emissiveNode = s.emissive;
    mat.aoNode = s.ao;
  }

  /**
   * Makes a wildlife mesh draw its instances on three: the batches keep the count in
   * `geometry.instanceCount` (an engine convention three ignores on a plain BufferGeometry), so the
   * mesh reports it as `count`. Contact shadows also join layer 0 (three cameras see layer 0 only).
   */
  attach(mesh: Mesh): Mesh {
    const g = mesh.geometry as unknown as { instanceCount?: number };
    if (!(Object.getOwnPropertyDescriptor(mesh, 'count')?.get))
      Object.defineProperty(mesh, 'count', { configurable: true, get: () => g.instanceCount ?? 1 });
    if (mesh.name === 'ContactShadows') mesh.layers.enable(0);
    if (!mesh.matrix.equals(mesh.matrix.clone().identity()))
      throw new Error('creature shading: the wildlife meshes must stay at the origin (world positions)');
    return mesh;
  }

  /** Attaches every mesh of a Wildlife owner (birds, critters, contact shadows). */
  attachWildlife(w: { birdBatch: { mesh: Mesh }; critterBatch: { mesh: Mesh }; blobs: { mesh: Mesh } }): void {
    this.attach(w.birdBatch.mesh);
    this.attach(w.critterBatch.mesh);
    this.attach(w.blobs.mesh);
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
