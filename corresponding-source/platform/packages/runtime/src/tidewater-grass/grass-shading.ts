/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
// Source: the grass material of src/world/vegetation/GrassField.js 627-879 (`grassModule`, `createGrassMaterial`
// vertex / surface WGSL, taken verbatim from the committed CPU port grass-material.ts, whose test compares them
// with the source text), the vegModule helpers it calls (src/world/vegetation/VegNodes.js: VEG_UP, vegHash12,
// vegNoise, vegWindStrength / vegWindDir3 / vegWindPerp3 / vegGustAt) and `sat` of
// src/engine/render/wgsl/common.js, run over the engine material contract of src/engine/render/MeshShader.js
// (VertexData with useWorld / worldPos / worldNormal, FragInput, surfaceOf) and src/engine/render/wgsl/lighting.js
// (Surface, defaultSurface).
//
// Native three.js WebGPU node material for the grass field (tidewater-grass/grass-field.ts). The source vertex
// snippet (slot placement, manual bilinear terrain height, mask density / presence hashes, meadow tone, clump size,
// yaw, gust bend + flutter, tier fades with width compensation and the tier-0 cut, oats / creeper / flower slots,
// the lighting normal) and the surface snippet (dune / meadow / dead-blade colours, midrib, wind sheen, oat, vine
// and flower colours, roughness, translucency) run verbatim inside generated wgslFn entries. Each entry is the
// FIRST function of its string (wgslFn calls the first declaration): the vertex entry rebuilds the engine's `v`,
// `o`, `frame` and `vegParams`, the surface entry `in`, `s` and `frame`; both return a packed mat4x4f that
// `grassVertexSlots` / `grassSurfaceSlots` map onto named slots and `applyGrassSlots` puts on the node material.
//
// Divergences (see docs/reference/tidewater-world/14-grass-shading/README.md):
// - The wind is the shared Genvr gust graph (vegetation/wind.ts `vegetationWind`, the same formula as the source
//   vegGustAt) evaluated in TSL at the slot's xz (`iCell.xy + aSlot.xy`, the snippet's own `xz`); the snippet
//   calls vegGustAt exactly once, at that xz, and the stub returns the injected value. Strength / direction /
//   perpendicular come from the same graph (the source's frame.windSpeed / frame.windDir).
// - The source module-scope bindings (grassMask, grassHeights, vegDetail and the engine samplers smpLinearClamp /
//   smpLinearRepeat) are entry parameters with the same names; vegDetail is the wind provider's detail texture.
// - Helper functions are prefixed (`twGrass_`, see namespaceGrassWgsl): three declares its own helpers in the
//   same shader modules. Removing the prefix gives the source text back.
// - Lighting is three's MeshPhysical node lighting (the role of the engine's shadeSurface); the translucency is
//   added to the sun's direct diffuse under the shadowed light colour by vegetation/transmission.ts, like the
//   engine's `acc.directDiffuse += s.translucency * lightColor`. The engine's hill shadow, underwater lighting and
//   motion vectors are not part of this file.
// - vVegGrass is rebuilt from the attribute (hf, kind, rand) and the packed dune fraction: the four varyings,
//   world position and world normal need 19 floats, one mat4x4f carries 16 (the rebuild is exact: the source
//   writes `vec4f( hf, kind, duneF, bRnd )` with hf = aBlade.x, kind = aBlade.y, bRnd = aBlade.z).
import {
  ClampToEdgeWrapping,
  DataTexture,
  DoubleSide,
  FloatType,
  LinearFilter,
  MeshPhysicalNodeMaterial,
  NearestFilter,
  NoColorSpace,
  RedFormat,
  RGBAFormat,
  TSL,
  UnsignedByteType,
  type DirectionalLight,
} from 'three/webgpu';
import { vegetationWind, type VegetationWindProvider } from '../vegetation/wind.js';
import { copyPlantTransmission, registerPlantTransmission } from '../vegetation/transmission.js';
import { grassModule, type GrassMaterialFactory, type GrassMaterialOptions } from './grass-material.js';
import type { GrassTexture, GrassTextureFactory, GrassTextureOptions } from './grass-field.js';
/* eslint-disable @typescript-eslint/no-explicit-any -- native TSL graph boundary */
type N = any;

// ---------------------------------------------------------------- source helpers (verbatim)

/** VegNodes.js vegModule: VEG_UP, vegHash12, vegNoise (verbatim), and common.js `sat`. */
export const GRASS_VEG_WGSL = /* wgsl */ `
const VEG_UP = vec3f( 0.0, 1.0, 0.0 );
fn sat( x: f32 ) -> f32 { return clamp( x, 0.0, 1.0 ); }

// Dave Hoskins' sine-free hash, [0, 1)
fn vegHash12( p: vec2f ) -> f32 {
	var p3 = fract( vec3f( p.x, p.y, p.x ) * 0.1031 );
	p3 += dot( p3, p3.yzx + 33.33 );
	return fract( ( p3.x + p3.y ) * p3.z );
}

fn vegNoise( p: vec2f ) -> f32 {
	let i = floor( p );
	let fr = fract( p );
	let u = fr * fr * ( fr * -2.0 + 3.0 );
	let a = vegHash12( i );
	let b = vegHash12( i + vec2f( 1.0, 0.0 ) );
	let c = vegHash12( i + vec2f( 0.0, 1.0 ) );
	let d = vegHash12( i + vec2f( 1.0, 1.0 ) );
	return mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y );
}
`;

/**
 * The source wind functions (VegNodes.js vegWindStrength / vegWindDir3 / vegWindPerp3 / vegGustAt) as stubs
 * returning the values of the shared gust graph (vegetation/wind.ts) that the caller evaluated at the slot xz.
 */
export const GRASS_WIND_STUBS = /* wgsl */ `
var<private> twWind: vec2f;
var<private> twWindDir: vec3f;
var<private> twWindPerp: vec3f;
fn vegWindStrength() -> f32 { return twWind.x; }
fn vegWindDir3() -> vec3f { return twWindDir; }
fn vegWindPerp3() -> vec3f { return twWindPerp; }
fn vegGustAt( xz: vec2f ) -> f32 { return twWind.y; }
`;

/** Prefix of the helper functions in the generated WGSL (see namespaceGrassWgsl). */
export const GRASS_FN_PREFIX = 'twGrass_';

/**
 * Prefixes every function declared in the WGSL except the first (the entry), at its declaration and at every
 * call, so source helper names (sat, vegHash12, ...) never collide with three's own shader helpers.
 */
export function namespaceGrassWgsl(code: string): string {
  const names = [...code.matchAll(/\bfn\s+(\w+)/g)].slice(1).map((m) => m[1]!);
  if (!names.length) return code;
  return code.replace(new RegExp(`\\b(${names.join('|')})(\\s*\\()`, 'g'), `${GRASS_FN_PREFIX}$1$2`);
}

// ---------------------------------------------------------------- entries

export const GRASS_VERTEX_ENTRY = 'twGrassVertex';
export const GRASS_SURFACE_ENTRY = 'twGrassSurface';

/** Inputs of the vertex entry, in order (the texture / sampler names are the source's binding names). */
export const GRASS_VERTEX_INPUTS = [
  ['twPosition', 'vec3f'],
  ['twNormal', 'vec3f'],
  ['twCell', 'vec4f'],
  ['twSlot', 'vec4f'],
  ['twBlade', 'vec4f'],
  ['twSide', 'vec4f'],
  ['twCamPos', 'vec3f'],
  ['twTime', 'f32'],
  ['twWindStrength', 'f32'],
  ['twGust', 'f32'],
  ['twWindDirection', 'vec3f'],
  ['twWindPerpendicular', 'vec3f'],
  ['grassMask', 'texture_2d<f32>'],
  ['smpLinearClamp', 'sampler'],
  ['grassHeights', 'texture_2d<f32>'],
  ['vegDetail', 'texture_2d<f32>'],
  ['smpLinearRepeat', 'sampler'],
] as const;

/** Inputs of the surface entry, in order. */
export const GRASS_SURFACE_INPUTS = [
  ['twVGrass', 'vec4f'],
  ['twVGrassTone', 'vec4f'],
  ['twVGrass2', 'vec4f'],
  ['twVGust', 'f32'],
  ['twNormal', 'vec3f'],
  ['twV', 'vec3f'],
  ['twSunDir', 'vec3f'],
  ['twNight', 'f32'],
] as const;

const params = (list: readonly (readonly [string, string])[]) => list.map(([k, ty]) => `${k}: ${ty}`).join(', ');
const structOf = (vars: Record<string, string>) =>
  Object.entries(vars)
    .map(([k, ty]) => `${k}: ${ty}`)
    .join(', ');

function vertexEntry(o: GrassMaterialOptions): string {
  return `
fn ${GRASS_VERTEX_ENTRY}( ${params(GRASS_VERTEX_INPUTS)} ) -> mat4x4f {
	frame.time = twTime;
	vegParams.camPos = twCamPos;
	twWind = vec2f( twWindStrength, twGust );
	twWindDir = twWindDirection;
	twWindPerp = twWindPerpendicular;
	var v: GrassVertexData;
	v.position = twPosition;
	v.normal = twNormal;
	v.iCell = twCell;
	v.aSlot = twSlot;
	v.aBlade = twBlade;
	v.aSide = twSide;
	v.useWorld = false;
	v.worldPos = vec3f( 0.0 );
	v.worldNormal = vec3f( 0.0 );
	var o: GrassVsOut;
	{
${o.vertex}
	}
	return mat4x4f( vec4f( v.worldPos, o.vVegGust ), vec4f( v.worldNormal, o.vVegGrass.z ), o.vVegGrassTone, o.vVegGrass2 );
}
struct GrassVertexData { position: vec3f, normal: vec3f, ${structOf(o.attributes)}, useWorld: bool, worldPos: vec3f, worldNormal: vec3f };
struct GrassVsOut { ${structOf(o.varyings)} };
struct GrassFrame { time: f32 };
var<private> frame: GrassFrame;
struct GrassVegParams { camPos: vec3f };
var<private> vegParams: GrassVegParams;
${GRASS_WIND_STUBS}${GRASS_VEG_WGSL}${grassModule.code}`;
}

function surfaceEntry(o: GrassMaterialOptions): string {
  return `
fn ${GRASS_SURFACE_ENTRY}( ${params(GRASS_SURFACE_INPUTS)} ) -> mat4x4f {
	frame.sunDir = twSunDir;
	frame.night = twNight;
	var in: GrassIn;
	in.vs.vVegGrass = twVGrass;
	in.vs.vVegGrassTone = twVGrassTone;
	in.vs.vVegGrass2 = twVGrass2;
	in.vs.vVegGust = twVGust;
	in.vs.normal = twNormal;
	in.V = twV;
	// defaultSurface( in.N ) + surfaceOf (mat.color 1, opacity 1, emissive 0, the material roughness / metalness)
	var s: GrassSurface;
	s.albedo = vec3f( 1.0 );
	s.alpha = 1.0;
	s.normal = normalize( twNormal );
	s.roughness = ${o.roughness.toFixed(1)};
	s.metalness = ${o.metalness.toFixed(1)};
	s.translucency = vec3f( 0.0 );
	s.ao = 1.0;
	s.specularIntensity = 1.0;
	{
${o.surface}
	}
	return mat4x4f( vec4f( s.albedo, s.alpha ), vec4f( s.normal, s.roughness ), vec4f( s.translucency, s.metalness ), vec4f( s.specularIntensity, s.ao, 0.0, 0.0 ) );
}
struct GrassVs { ${structOf(o.varyings)}, normal: vec3f };
struct GrassIn { vs: GrassVs, V: vec3f };
struct GrassSurface { albedo: vec3f, alpha: f32, normal: vec3f, roughness: f32, metalness: f32, translucency: vec3f, ao: f32, specularIntensity: f32 };
struct GrassFrame { sunDir: vec3f, night: f32 };
var<private> frame: GrassFrame;
${GRASS_VEG_WGSL}${grassModule.code}`;
}

export interface GrassShadingWgsl {
  /** wgslFn source of the vertex stage; its first function is the entry. */
  vertex: string;
  /** wgslFn source of the surface stage; its first function is the entry. */
  surface: string;
}

/** The generated WGSL of the grass material (entry first, then structs, stubs and the source modules). */
export function grassShadingWgsl(options: GrassMaterialOptions): GrassShadingWgsl {
  return { vertex: namespaceGrassWgsl(vertexEntry(options)), surface: namespaceGrassWgsl(surfaceEntry(options)) };
}

// ---------------------------------------------------------------- slots

/** The vertex outputs (the vertex entry's return layout) plus the rebuilt vVegGrass. */
export interface GrassVertexSlots {
  worldPos: N;
  worldNormal: N;
  vVegGrass: N;
  vVegGrassTone: N;
  vVegGrass2: N;
  vVegGust: N;
}

/** Maps the packed vertex output onto named slots; `blade` is the aBlade input (hf, kind, rand). */
export function grassVertexSlots(packed: N, blade: N): GrassVertexSlots {
  const t = TSL as N;
  const c0 = packed.element(0),
    c1 = packed.element(1);
  return {
    worldPos: c0.xyz,
    worldNormal: c1.xyz,
    vVegGrass: t.vec4(blade.x, blade.y, c1.w, blade.z),
    vVegGrassTone: packed.element(2),
    vVegGrass2: packed.element(3),
    vVegGust: c0.w,
  };
}

/** The engine Surface fields the grass writes (the surface entry's return layout), as nodes. */
export interface GrassSurfaceSlots {
  albedo: N;
  alpha: N;
  normalWorld: N;
  roughness: N;
  translucency: N;
  metalness: N;
  specularIntensity: N;
  ao: N;
}
export function grassSurfaceSlots(packed: N): GrassSurfaceSlots {
  const c0 = packed.element(0),
    c1 = packed.element(1),
    c2 = packed.element(2),
    c3 = packed.element(3);
  return {
    albedo: c0.xyz,
    alpha: c0.w,
    normalWorld: c1.xyz,
    roughness: c1.w,
    translucency: c2.xyz,
    metalness: c2.w,
    specularIntensity: c3.x,
    ao: c3.y,
  };
}

/**
 * Puts surface slots on the node material: albedo, roughness, metalness, specularIntensity, ao, the (world)
 * shading normal (not flipped on back faces: the source bends the vertex normal towards the viewer), and the
 * translucency on the sun's direct diffuse under the shadowed light colour.
 */
export function applyGrassSlots(material: MeshPhysicalNodeMaterial, slots: GrassSurfaceSlots, sun: DirectionalLight): void {
  const t = TSL as N;
  material.colorNode = slots.albedo;
  material.normalNode = t.cameraViewMatrix.mul(t.vec4(slots.normalWorld, 0)).xyz;
  material.roughnessNode = slots.roughness;
  material.metalnessNode = slots.metalness;
  material.specularIntensityNode = slots.specularIntensity;
  material.aoNode = slots.ao;
  registerPlantTransmission(material, slots.translucency);
  copyPlantTransmission(material, material, sun);
  material.userData.grassSlots = slots;
}

// ---------------------------------------------------------------- textures

/** The field's height (r32float, loaded) and mask (rgba8unorm, linear clamp) textures as three.js DataTextures. */
export class ThreeGrassTexture implements GrassTexture {
  readonly texture: DataTexture;
  readonly options: GrassTextureOptions;
  constructor(options: GrassTextureOptions) {
    this.options = options;
    const float = options.format === 'r32float';
    const tex = new DataTexture(options.data, options.width, options.height, float ? RedFormat : RGBAFormat, float ? FloatType : UnsignedByteType);
    tex.name = options.label;
    tex.colorSpace = NoColorSpace;
    tex.wrapS = tex.wrapT = ClampToEdgeWrapping;
    // heights are only loaded (textureLoad); the mask uses the engine's linearClamp sampler
    tex.minFilter = tex.magFilter = float ? NearestFilter : LinearFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    this.texture = tex;
  }
  upload(data: Float32Array | Uint8Array): void {
    this.texture.image.data = data;
    this.texture.needsUpdate = true;
  }
  destroy(): void {
    this.texture.dispose();
  }
}
export const threeGrassTextures: GrassTextureFactory = (options) => new ThreeGrassTexture(options);

const textureOf = (x: unknown): DataTexture => {
  if (x instanceof ThreeGrassTexture) return x.texture;
  if (x instanceof DataTexture) return x;
  throw new Error('grass shading needs ThreeGrassTexture textures (GrassFieldOptions.textures = threeGrassTextures)');
};

// ---------------------------------------------------------------- material

export interface GrassShadingBindings {
  /** Shared world wind (gust phase, direction, speed, detail texture): borrowed. */
  wind: VegetationWindProvider;
  /** Seconds (the source frame.time). */
  time: N;
  /** Main camera world position (the source vegParams.camPos; shadow passes keep the main camera's fades). */
  mainCamera: N;
  sun: DirectionalLight;
  /** World direction towards the sun. */
  sunDirection: N;
  /** 0 day .. 1 night. */
  night: N;
}

/** The per-vertex attributes of the vertex entry. */
export interface GrassVertexAttributes {
  position: N;
  normal: N;
  cell: N;
  slot: N;
  blade: N;
  side: N;
}

/** All vertex entry inputs: attributes, frame values, the shared gust graph at the slot xz, the textures. */
export function grassVertexInputs(
  a: GrassVertexAttributes,
  b: Pick<GrassShadingBindings, 'wind' | 'time' | 'mainCamera'>,
  textures: { heights: DataTexture; mask: DataTexture },
): Record<string, N> {
  const t = TSL as N;
  // the snippet's own `xz = cell + slot.xy`: the one point it asks vegGustAt for
  const wind = vegetationWind(b.wind, a.cell.xy.add(a.slot.xy));
  const mask = t.texture(textures.mask),
    detail = t.texture(b.wind.detail);
  return {
    twPosition: a.position,
    twNormal: a.normal,
    twCell: a.cell,
    twSlot: a.slot,
    twBlade: a.blade,
    twSide: a.side,
    twCamPos: b.mainCamera,
    twTime: b.time,
    twWindStrength: wind.strength,
    twGust: wind.gust,
    twWindDirection: wind.direction,
    twWindPerpendicular: wind.perpendicular,
    grassMask: mask,
    smpLinearClamp: t.sampler(mask),
    grassHeights: t.texture(textures.heights),
    vegDetail: detail,
    smpLinearRepeat: t.sampler(detail),
  };
}

export const grassVertexCall = (wgsl: GrassShadingWgsl, inputs: Record<string, N>): N => (TSL as N).wgslFn(wgsl.vertex)(inputs);
export const grassSurfaceCall = (wgsl: GrassShadingWgsl, inputs: Record<string, N>): N => (TSL as N).wgslFn(wgsl.surface)(inputs);

/**
 * The grass field material: the source options (grass-material.ts `grassMaterialOptions`, carried by the
 * GrassField) on a MeshPhysicalNodeMaterial. The field's meshes have an identity transform (world positions
 * come from the vertex stage) and never cast shadows (source). Caller owns disposal; bindings are borrowed.
 */
export function createGrassShadingMaterial(options: GrassMaterialOptions, b: GrassShadingBindings): MeshPhysicalNodeMaterial {
  const t = TSL as N;
  const wgsl = grassShadingWgsl(options);
  const mat = new MeshPhysicalNodeMaterial({ side: DoubleSide });
  mat.name = options.name;
  const blade = t.attribute('aBlade', 'vec4');
  const vertex = grassVertexSlots(
    grassVertexCall(
      wgsl,
      grassVertexInputs(
        {
          position: t.positionGeometry,
          normal: t.normalGeometry,
          cell: t.attribute('iCell', 'vec4'),
          slot: t.attribute('aSlot', 'vec4'),
          blade,
          side: t.attribute('aSide', 'vec4'),
        },
        b,
        { heights: textureOf(options.textures.grassHeights), mask: textureOf(options.textures.grassMask) },
      ),
    ),
    blade,
  );
  mat.positionNode = vertex.worldPos;
  const slots = grassSurfaceSlots(
    grassSurfaceCall(wgsl, {
      twVGrass: t.varying(vertex.vVegGrass, 'twGrassV0'),
      twVGrassTone: t.varying(vertex.vVegGrassTone, 'twGrassV1'),
      twVGrass2: t.varying(vertex.vVegGrass2, 'twGrassV2'),
      twVGust: t.varying(vertex.vVegGust, 'twGrassV3'),
      twNormal: t.varying(vertex.worldNormal, 'twGrassNormal'),
      twV: t.positionViewDirection.transformDirection(t.cameraWorldMatrix),
      twSunDir: b.sunDirection,
      twNight: b.night,
    }),
  );
  applyGrassSlots(mat, slots, b.sun);
  mat.userData.grassWgsl = wgsl;
  return mat;
}

/** GrassFieldOptions.material: builds the native material from the field's source options. */
export const grassShadingFactory =
  (b: GrassShadingBindings): GrassMaterialFactory =>
  (options) =>
    createGrassShadingMaterial(options, b);
