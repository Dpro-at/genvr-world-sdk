/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
// Native three.js WebGPU shading for the ported village (TIDEWATER-15-village-shading).
//
// materials.ts, game-materials.ts and stall-kit.ts keep the source WGSL surface snippets verbatim as data.
// This file wraps each snippet into one wgslFn entry that evaluates the source engine's Surface
// (engine/render/wgsl/lighting.js `Surface`, seeded as MeshShader.js `surfaceOf`) and hands the result to
// three's physically based lighting, the same mapping the vegetation ports use (palm / canopy materials):
//   albedo -> colorNode, alpha -> opacityNode, normal (world) -> normalNode (view), roughness, metalness,
//   ao -> aoNode, emissive -> emissiveNode, clearcoat (+ roughness) -> MeshPhysicalNodeMaterial, and the
//   stall ice translucency as source direct-sun transmission (vegetation/transmission.ts).
// The source `frame.*` values are bindings (time, night, wind, sea level). Source positions are in
// Tidewater coordinates (sea level y = 0): P = positionWorld - ( 0, seaLevel, 0 ).
//
// texture-baker.ts keeps the bake kernels (TextureBaker.js) as data; bakeVillageTextures runs them on
// three's own WebGPU device (the source code unchanged, bindings declared as the source ComputeKernel
// does), reads the maps back and uploads them as mipmapped three.js DataTextures (three's mip blit is
// the source's bilinear box downsample). Not done: the IndexedDB cache of the plan, the fishing line
// (game-materials.ts lineMaterialSpec, a vertex-only ribbon) and the prop material's extra.vertex hook.
import {
  DataTexture,
  DoubleSide,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshPhysicalNodeMaterial,
  MeshStandardNodeMaterial,
  NoColorSpace,
  RepeatWrapping,
  RGBAFormat,
  TSL,
  UnsignedByteType,
  type DataArrayTexture,
  type DirectionalLight,
  type Texture,
  type WebGPURenderer,
} from 'three/webgpu';
import {
  glassModule,
  tidalModule,
  villageMaterialModule,
  villageMaterialSpecs,
  type VillageMaterialSpec,
  type VillageTextureName,
  type WgslModule,
} from './materials.js';
import { BAKE_WORKGROUP, noiseModule, SETS, villageBakePlan } from './texture-baker.js';
import { gameModule, propMaterialSpec, type PropMaterialExtra } from './game-materials.js';
import { kitModule, stallMaterialSpec } from './stall-kit.js';
import { registerPlantTransmission, copyPlantTransmission } from '../vegetation/transmission.js';
/* eslint-disable @typescript-eslint/no-explicit-any -- native TSL graph and raw WebGPU boundary */
type N = any;

// ---------------------------------------------------------------------------------------------
// WGSL text plumbing

/** Source engine/render/wgsl/common.js helpers the snippets call, renamed so they cannot collide
 * with other wgslFn code in the same three.js shader (sat, luminance, perturbNormalByMap). */
export const COMMON_RENAMES = {
  sat: 'twvSat',
  luminance: 'twvLuminance',
  perturbNormalByMap: 'twvPerturbNormalByMap',
} as const;

/** common.js 14, 19 and 239-247, renamed (COMMON_RENAMES). */
export const COMMON_WGSL = /* wgsl */ `
fn twvSat( x: f32 ) -> f32 { return clamp( x, 0.0, 1.0 ); }
fn twvLuminance( c: vec3f ) -> f32 { return dot( c, vec3f( 0.2126, 0.7152, 0.0722 ) ); }
fn twvPerturbNormalByMap( P: vec3f, N: vec3f, uv: vec2f, mapN: vec3f ) -> vec3f {
	let dp1 = dpdx( P ); let dp2 = dpdy( P );
	let duv1 = dpdx( uv ); let duv2 = dpdy( uv );
	let dp2perp = cross( dp2, N ); let dp1perp = cross( N, dp1 );
	let T = dp2perp * duv1.x + dp1perp * duv2.x;
	let B = dp2perp * duv1.y + dp1perp * duv2.y;
	let invmax = inverseSqrt( max( max( dot( T, T ), dot( B, B ) ), 1e-20 ) );
	return normalize( mat3x3f( T * invmax, B * invmax, N ) * mapN );
}
`;

/** The source FragInput / Surface / frame, reduced to the fields the ported snippets read and write. */
export const STRUCTS_WGSL = /* wgsl */ `
struct TwvVs { vTint: vec3f, vData: vec4f, vAux: vec4f, vLocal: vec3f, vLayer: f32, vUV2: vec2f };
struct TwvIn { vs: TwvVs, P: vec3f, N: vec3f, uv: vec2f, color: vec4f, front: bool, pixel: vec2f };
struct TwvFrame { time: f32, night: f32, windDir: vec2f, windSpeed: f32, seaLevel: f32 };
struct TwvSurface {
	albedo: vec3f, alpha: f32, normal: vec3f, roughness: f32, emissive: vec3f, metalness: f32,
	translucency: vec3f, ao: f32, clearcoat: f32, clearcoatRoughness: f32,
};
struct TwvVertex { position: vec3f, vdata: vec4f };
`;

const word = (name: string) => new RegExp(`\\b${name}\\b`, 'g');

/** Renames the common.js helpers (whole words). */
export function renameCommon(code: string): string {
  let out = code;
  for (const [from, to] of Object.entries(COMMON_RENAMES)) out = out.replace(word(from), to);
  return out;
}

/** Index of the parenthesis closing the one opened at `open`. */
function closing(code: string, open: number): number {
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === '(') depth++;
    else if (code[i] === ')' && --depth === 0) return i;
  }
  throw new Error('village-shading: unbalanced parentheses');
}

/** Appends parameters to the declaration of `fn name( ... )` and arguments to every call of it:
 * the source helpers read module-level bindings (textures, `frame`), wgslFn helpers take them as
 * parameters. */
export function threadArguments(code: string, name: string, params: string, args: string): string {
  let out = code;
  const re = new RegExp(`(fn\\s+)?\\b${name}\\s*\\(`, 'g');
  const sites: { at: number; decl: boolean }[] = [];
  for (const m of out.matchAll(re)) sites.push({ at: m.index + m[0].length - 1, decl: m[1] !== undefined });
  for (const site of sites.reverse()) {
    const end = closing(out, site.at);
    out = out.slice(0, end) + ', ' + (site.decl ? params : args) + ' ' + out.slice(end);
  }
  return out;
}

/** Entry parameters carry a twv_ prefix: the source snippets declare `let uv`, `let P`, ... */
const prefixed = (inputs: Record<string, N>) =>
  Object.fromEntries(Object.entries(inputs).map(([k, v]) => ['twv_' + k, v])) as Record<string, N>;

const fmt = (x: number) => {
  const s = String(x);
  return s.includes('.') || s.includes('e') ? s : s + '.0';
};

// ---------------------------------------------------------------------------------------------
// Frame bindings

/** Source `frame.*` values read by the snippets (all optional TSL nodes; defaults are day, calm). */
export interface VillageShadingFrame {
  /** seconds (source frame.time) */
  time?: N;
  /** 0 day .. 1 night (source frame.night) */
  night?: N;
  /** vec2 horizontal wind direction (source frame.windDir) */
  windDirection?: N;
  /** m/s (source frame.windSpeed) */
  windSpeed?: N;
  /** Genvr world height of the sea: subtracted from world y so the source sees sea level 0 */
  seaLevel?: N;
}

function frameNodes(frame: VillageShadingFrame) {
  const t = TSL as N;
  return {
    time: frame.time ?? t.float(0),
    night: frame.night ?? t.float(0),
    windDir: frame.windDirection ?? t.vec2(0, -1),
    windSpeed: frame.windSpeed ?? t.float(0),
    seaLevel: frame.seaLevel ?? t.float(0),
  };
}

const FRAME_PARAMS = 'twv_time:f32,twv_night:f32,twv_windDir:vec2f,twv_windSpeed:f32';
const FRAME_SETUP =
  ' var frame:TwvFrame; frame.time=twv_time; frame.night=twv_night; frame.windDir=twv_windDir; frame.windSpeed=twv_windSpeed; frame.seaLevel=0.0;\n';
const SURFACE_RESULT =
  ' return mat4x4f(vec4f(s.albedo,s.alpha),vec4f(s.normal,s.roughness),vec4f(s.emissive,s.metalness),vec4f(s.ao,s.clearcoat,s.clearcoatRoughness,0.0));\n}\n';

function surfaceSetup(roughness: number, metalness: number) {
  return (
    ' var s:TwvSurface; s.albedo=in.color.rgb; s.alpha=in.color.a; s.normal=in.N; s.roughness=' +
    fmt(roughness) +
    '; s.metalness=' +
    fmt(metalness) +
    '; s.emissive=vec3f(0.0); s.translucency=vec3f(0.0); s.ao=1.0; s.clearcoat=0.0; s.clearcoatRoughness=0.0;\n'
  );
}

/** One shaded surface: the entry (first function, the wgslFn callable) and its helper include. */
export interface SurfaceWgsl {
  entry: string;
  helpers: string;
}

// ---------------------------------------------------------------------------------------------
// Village materials (VillageMaterials.js)

const VILLAGE_MODULES: Record<string, WgslModule> = {
  [villageMaterialModule.name]: villageMaterialModule,
  [tidalModule.name]: tidalModule,
  [glassModule.name]: glassModule,
};

/** Texture parameters of the village helpers (they bind vlgGrime + smpAnisoRepeat in the source). */
const GRIME_PARAMS = 'vlgGrime:texture_2d<f32>,smpAnisoRepeat:sampler';
const GRIME_ARGS = 'vlgGrime,smpAnisoRepeat';

/** The village helper modules (common, villageMaterials, tidal, glass), threaded for wgslFn. */
export function villageHelpersWgsl(): string {
  let code = STRUCTS_WGSL + COMMON_WGSL + villageMaterialModule.code + tidalModule.code + glassModule.code;
  code = renameCommon(code);
  code = threadArguments(code, 'vlmTidal', GRIME_PARAMS, GRIME_ARGS);
  code = threadArguments(code, 'vlmGlass', 'frame:TwvFrame,' + GRIME_PARAMS, 'frame,' + GRIME_ARGS);
  return code;
}

/** The entry function name of a village material. */
export const villageEntryName = (spec: VillageMaterialSpec) => 'twv' + spec.name;

/** wgslFn entry of one village material: source surfaceOf + the material's surface snippet. */
export function villageSurfaceWgsl(spec: VillageMaterialSpec): SurfaceWgsl {
  for (const m of spec.modules.slice(1))
    if (!VILLAGE_MODULES[m]) throw new Error('village-shading: unknown module ' + m);
  const textures = Object.keys(spec.textures)
    .map((b) => b + ':texture_2d<f32>')
    .join(',');
  let body = renameCommon(spec.surface);
  body = threadArguments(body, 'vlmTidal', '', GRIME_ARGS);
  body = threadArguments(body, 'vlmGlass', '', 'frame,' + GRIME_ARGS);
  const entry =
    `fn ${villageEntryName(spec)}(twv_uv:vec2f,twv_tint:vec3f,twv_vdata:vec4f,twv_P:vec3f,twv_N:vec3f,twv_front:bool,twv_pixel:vec2f,${FRAME_PARAMS},${textures},smpAnisoRepeat:sampler)->mat4x4f{\n` +
    ' var in:TwvIn; in.vs.vTint=twv_tint; in.vs.vData=twv_vdata; in.P=twv_P; in.N=twv_N; in.uv=twv_uv; in.color=vec4f(1.0); in.front=twv_front; in.pixel=twv_pixel;\n' +
    FRAME_SETUP +
    surfaceSetup(spec.params.roughness, spec.params.metalness) +
    body +
    SURFACE_RESULT;
  return { entry, helpers: villageHelpersWgsl() };
}

/** The source SWAY / flag vertex snippet of the fabric and net materials as a local position function. */
export function villageVertexWgsl(spec: VillageMaterialSpec): string | null {
  const vertex = spec.vertex.replace(/^\s*o\.vTint = v\.tint;\s*o\.vData = v\.vdata;\s*/, '');
  if (vertex.trim() === '') return null;
  return (
    `fn twv${spec.name}Vertex(twv_position:vec3f,twv_vdata:vec4f,${FRAME_PARAMS})->vec3f{\n` +
    ' var v:TwvVertex; v.position=twv_position; v.vdata=twv_vdata;\n' +
    FRAME_SETUP +
    vertex +
    ' return v.position;\n}\n' +
    'struct TwvVertex { position: vec3f, vdata: vec4f };\n' +
    'struct TwvFrame { time: f32, night: f32, windDir: vec2f, windSpeed: f32, seaLevel: f32 };\n'
  );
}

/** Village texture maps by baked name (texture-baker.ts SETS outputs). */
export type VillageTextureMaps = Record<VillageTextureName, Texture>;

export interface VillageShadingOptions {
  frame?: VillageShadingFrame;
  /** Replaces mesh inputs by name (uv, P, N, front, pixel, frame values, tint, vdata, position, color,
   * aux, local, layer, uv2): the GPU check feeds synthetic inputs through the real material slots. */
  inputs?: Record<string, N>;
}

/** Per-fragment inputs of a surface entry (TSL nodes). Materials take them from the mesh; the GPU
 * parity script feeds synthetic ones through the same node builders. */
export interface SurfaceInputs {
  uv: N;
  /** Tidewater-space world position (sea level y = 0) */
  P: N;
  /** world normal, already flipped on back faces of double sided materials */
  N: N;
  front: N;
  pixel: N;
  time: N;
  night: N;
  windDir: N;
  windSpeed: N;
}

/** Inputs every surface entry reads from the mesh (fragment stage). */
export function meshSurfaceInputs(frame: VillageShadingFrame = {}, double = false): SurfaceInputs {
  const t = TSL as N;
  const f = frameNodes(frame);
  const N0 = t.normalWorldGeometry;
  return {
    uv: t.uv(),
    P: t.positionWorld.sub(t.vec3(0, f.seaLevel, 0)),
    N: double ? N0.mul(t.select(t.frontFacing, 1, -1)) : N0,
    front: t.frontFacing,
    pixel: t.screenCoordinate.xy,
    time: f.time,
    night: f.night,
    windDir: f.windDir,
    windSpeed: f.windSpeed,
  };
}

const SURFACE_KEYS = ['uv', 'P', 'N', 'front', 'pixel', 'time', 'night', 'windDir', 'windSpeed'] as const;
/** The SurfaceInputs fields only (input overrides may carry material-specific extras). */
const pick = (i: Record<string, N>): SurfaceInputs =>
  Object.fromEntries(SURFACE_KEYS.map((k) => [k, i[k]])) as unknown as SurfaceInputs;

const frameOf = (i: SurfaceInputs) => ({
  time: i.time,
  night: i.night,
  windDir: i.windDir,
  windSpeed: i.windSpeed,
});

/** Applies a surface result (mat4x4f of SURFACE_RESULT) to a node material. */
function applySurface(mat: MeshStandardNodeMaterial, shade: N, opts: { alpha: boolean; clearcoat: boolean }) {
  const t = TSL as N;
  mat.colorNode = shade.element(0).rgb;
  if (opts.alpha) mat.opacityNode = shade.element(0).a;
  // the source normalizes s.normal before shading (MeshShader.js fs)
  mat.normalNode = t.cameraViewMatrix.mul(t.vec4(shade.element(1).xyz.normalize(), 0)).xyz;
  mat.roughnessNode = shade.element(1).w;
  mat.emissiveNode = shade.element(2).rgb;
  mat.metalnessNode = shade.element(2).w;
  mat.aoNode = shade.element(3).x;
  if (opts.clearcoat) {
    const p = mat as MeshPhysicalNodeMaterial;
    p.clearcoatNode = shade.element(3).y;
    p.clearcoatRoughnessNode = shade.element(3).z;
  }
}

/** The surface of one village material as a mat4x4f node: columns ( albedo, alpha ), ( world normal,
 * roughness ), ( emissive, metalness ), ( ao, clearcoat, clearcoat roughness, 0 ). */
export function villageShadeNode(
  spec: VillageMaterialSpec,
  maps: VillageTextureMaps,
  inputs: SurfaceInputs & { tint: N; vdata: N },
): N {
  const t = TSL as N;
  const code = villageSurfaceWgsl(spec);
  const args: Record<string, N> = prefixed(inputs);
  let first: Texture | null = null;
  for (const [binding, name] of Object.entries(spec.textures)) {
    const map = maps[name];
    if (!map) throw new Error('village-shading: missing texture ' + name);
    first ??= map;
    args[binding] = t.texture(map);
  }
  if (!first) throw new Error('village-shading: ' + spec.name + ' binds no texture');
  args.smpAnisoRepeat = t.sampler(first);
  return t.wgslFn(code.entry, [t.wgsl(code.helpers)])(args);
}

/** The local position of the fabric / net vertex snippet (sway, flags), or null without one. */
export function villageVertexNode(
  spec: VillageMaterialSpec,
  inputs: { position: N; vdata: N; time: N; night: N; windDir: N; windSpeed: N },
): N | null {
  const code = villageVertexWgsl(spec);
  return code ? (TSL as N).wgslFn(code)(prefixed(inputs)) : null;
}

/** A native WebGPU material for one village material spec (materials.ts). Geometry: geo-builder
 * Batch layout (position, normal, uv in metres, tint, vdata). Caller owns textures and disposal. */
export function createVillageShadingMaterial(
  spec: VillageMaterialSpec,
  maps: VillageTextureMaps,
  options: VillageShadingOptions = {},
): MeshStandardNodeMaterial {
  const t = TSL as N;
  const p = spec.params;
  const double = p.side === DoubleSide;
  const mat = new MeshStandardNodeMaterial();
  if (double) mat.side = DoubleSide;
  mat.transparent = p.transparent ?? false;
  mat.depthWrite = p.depthWrite ?? true;
  mat.alphaTest = p.alphaTest ?? 0;
  mat.name = spec.name;
  const o = options.inputs ?? {};
  const tint = o.tint ?? t.attribute('tint', 'vec3'),
    vdata = o.vdata ?? t.attribute('vdata', 'vec4');
  const inputs = { ...meshSurfaceInputs(options.frame, double), ...o } as SurfaceInputs;
  const position = villageVertexNode(spec, {
    position: o.position ?? t.positionLocal,
    vdata,
    ...frameOf(inputs),
  });
  if (position) mat.positionNode = position;
  const shade = villageShadeNode(spec, maps, { ...pick(inputs), tint, vdata });
  applySurface(mat, shade, { alpha: p.alphaTest !== undefined || p.transparent === true, clearcoat: false });
  return mat;
}

/** Source createVillageMaterials: the seven village materials by batch key. */
export function createVillageShadingMaterials(maps: VillageTextureMaps, options: VillageShadingOptions = {}) {
  const specs = villageMaterialSpecs();
  const out = {} as Record<keyof typeof specs, MeshStandardNodeMaterial>;
  for (const key of Object.keys(specs) as (keyof typeof specs)[])
    out[key] = createVillageShadingMaterial(specs[key], maps, options);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Game prop material (GameMaterials.js createPropMaterial)

/** gameProps helpers (common renamed). */
export function propHelpersWgsl(): string {
  return renameCommon(STRUCTS_WGSL + COMMON_WGSL + gameModule.code);
}

export function propSurfaceWgsl(extra: PropMaterialExtra = {}): SurfaceWgsl {
  const spec = propMaterialSpec('gameProp', extra);
  const entry =
    `fn twvPropShade(twv_color:vec4f,twv_aux:vec4f,twv_local:vec3f,twv_uv:vec2f,twv_P:vec3f,twv_N:vec3f,twv_front:bool,twv_pixel:vec2f,${FRAME_PARAMS})->mat4x4f{\n` +
    ' var in:TwvIn; in.vs.vAux=twv_aux; in.vs.vLocal=twv_local; in.P=twv_P; in.N=twv_N; in.uv=twv_uv; in.color=twv_color; in.front=twv_front; in.pixel=twv_pixel;\n' +
    FRAME_SETUP +
    // source standard() defaults: roughness 1, metalness 0 (engine/render/Material.js)
    surfaceSetup(1, 0) +
    renameCommon(spec.surface) +
    SURFACE_RESULT;
  return { entry, helpers: propHelpersWgsl() };
}

/** The prop surface (columns as villageShadeNode). color = vertex colour (linear albedo, alpha),
 * aux = ( roughness, metalness, pattern, spare ), local = rest position. */
export function propShadeNode(inputs: SurfaceInputs & { color: N; aux: N; local: N }, clearcoat = false): N {
  const t = TSL as N;
  const code = propSurfaceWgsl({ clearcoat });
  return t.wgslFn(code.entry, [t.wgsl(code.helpers)])(prefixed(inputs));
}

export interface PropShadingOptions extends VillageShadingOptions {
  /** source extra.clearcoat (carbon / thread patterns use the clear-coat lobe) */
  clearcoat?: boolean;
}

/** Native material for meshes built with the boat GeoKit layout (color = linear albedo, aux =
 * roughness, metalness, pattern, spare). Source extra.vertex / extra.uniforms are not supported. */
export function createPropShadingMaterial(name = 'gameProp', options: PropShadingOptions = {}) {
  const t = TSL as N;
  const clearcoat = options.clearcoat === true;
  const mat = clearcoat ? new MeshPhysicalNodeMaterial() : new MeshStandardNodeMaterial();
  mat.name = name;
  const shade = propShadeNode(
    {
      ...pick({ ...meshSurfaceInputs(options.frame), ...options.inputs }),
      color: options.inputs?.color ?? t.vertexColor(),
      aux: options.inputs?.aux ?? t.attribute('aux', 'vec4'),
      // the pattern coordinates are the rest position (source: o.vLocal = v.position)
      local: options.inputs?.local ?? t.positionGeometry,
    },
    clearcoat,
  );
  applySurface(mat, shade, { alpha: false, clearcoat });
  return mat;
}

// ---------------------------------------------------------------------------------------------
// Stall material (StallKit.js createStallMaterial)

const STALL_TEXTURE_PARAMS =
  'skSurfA:texture_2d_array<f32>,skSurfN:texture_2d_array<f32>,skSurfR:texture_2d_array<f32>,' +
  'skPropA:texture_2d_array<f32>,skPropN:texture_2d_array<f32>,skPropR:texture_2d_array<f32>,' +
  'skSigns:texture_2d_array<f32>,smpAnisoRepeat:sampler,smpLinearClamp:sampler';

/** stallKit helpers (common renamed) and the private translucency channel of the entry. */
export function stallHelpersWgsl(): string {
  return (
    renameCommon(STRUCTS_WGSL + COMMON_WGSL + kitModule.code) +
    'var<private> twvStallTranslucency: vec3f;\n' +
    // reads the translucency of the evaluated surface: `done` (the entry result) orders the call
    'fn twvStallTranslucencyOf( done: vec4f ) -> vec3f { return twvStallTranslucency; }\n'
  );
}

export function stallSurfaceWgsl(): SurfaceWgsl {
  const spec = stallMaterialSpec();
  const entry =
    `fn twvStallShade(twv_color:vec4f,twv_layer:f32,twv_uv2:vec2f,twv_uv:vec2f,twv_P:vec3f,twv_N:vec3f,twv_front:bool,twv_pixel:vec2f,${FRAME_PARAMS},${STALL_TEXTURE_PARAMS})->mat4x4f{\n` +
    ' var in:TwvIn; in.vs.vLayer=twv_layer; in.vs.vUV2=twv_uv2; in.P=twv_P; in.N=twv_N; in.uv=twv_uv; in.color=twv_color; in.front=twv_front; in.pixel=twv_pixel;\n' +
    FRAME_SETUP +
    surfaceSetup(1, 0) +
    renameCommon(spec.surface) +
    ' twvStallTranslucency = s.translucency;\n' +
    SURFACE_RESULT;
  return { entry, helpers: stallHelpersWgsl() };
}

/** The stall texture arrays (stall-kit.ts StallAssets surf / prop / signs). */
export interface StallShadingTextures {
  surf: { a: DataArrayTexture; n: DataArrayTexture; r: DataArrayTexture };
  prop: { a: DataArrayTexture; n: DataArrayTexture; r: DataArrayTexture };
  signs: DataArrayTexture;
}

/** The stall surface (columns as villageShadeNode) and its translucency (vec3, source direct-light
 * transmission of the crushed ice). The signs use the signs texture's own sampler (the source samples
 * them with linear clamp; stall-kit.ts arrayTexture sets repeat). */
export function stallShadeNodes(
  tex: StallShadingTextures,
  inputs: SurfaceInputs & { color: N; layer: N; uv2: N },
): { shade: N; translucency: N } {
  const t = TSL as N;
  const code = stallSurfaceWgsl();
  const helpers = t.wgsl(code.helpers);
  const shade = t.wgslFn(code.entry, [helpers])({
    ...prefixed(inputs),
    skSurfA: t.texture(tex.surf.a),
    skSurfN: t.texture(tex.surf.n),
    skSurfR: t.texture(tex.surf.r),
    skPropA: t.texture(tex.prop.a),
    skPropN: t.texture(tex.prop.n),
    skPropR: t.texture(tex.prop.r),
    skSigns: t.texture(tex.signs),
    smpAnisoRepeat: t.sampler(tex.surf.a),
    smpLinearClamp: t.sampler(tex.signs),
  });
  const translucency = t.wgslFn(
    'fn twvStallTranslucencyOut(done:vec4f)->vec3f{return twvStallTranslucencyOf(done);}',
    [helpers],
  )({ done: shade.element(0) });
  return { shade, translucency };
}

export interface StallShadingOptions extends VillageShadingOptions {
  /** the sun whose direct light the crushed ice transmits (source s.translucency x light colour) */
  sun?: DirectionalLight;
}

/** Native material for KitBuilder meshes (uv, color, aLayer, aUV2). */
export function createStallShadingMaterial(tex: StallShadingTextures, options: StallShadingOptions = {}) {
  const t = TSL as N;
  const mat = new MeshPhysicalNodeMaterial();
  mat.name = 'stall';
  const { shade, translucency } = stallShadeNodes(tex, {
    ...pick({ ...meshSurfaceInputs(options.frame), ...options.inputs }),
    color: options.inputs?.color ?? t.vertexColor(),
    layer: options.inputs?.layer ?? t.attribute('aLayer', 'float'),
    uv2: options.inputs?.uv2 ?? t.attribute('aUV2', 'vec2'),
  });
  applySurface(mat, shade, { alpha: false, clearcoat: true });
  if (options.sun) {
    registerPlantTransmission(mat, translucency);
    copyPlantTransmission(mat, mat, options.sun);
  }
  return mat;
}

// ---------------------------------------------------------------------------------------------
// Texture bake (TextureBaker.js VillageTextures.bake) on three's WebGPU device

/** Neutral 1 x 1 maps (mid albedo, flat normal, roughness 0.8, no occlusion) for use before a bake. */
export function neutralVillageTextures(): VillageTextureMaps {
  const maps = {} as VillageTextureMaps;
  for (const set of SETS) {
    if (set.out) maps[set.out] = mapTexture(set.out, new Uint8Array([128, 128, 128, 255]), 1, 1);
    if (set.nra) maps[set.nra] = mapTexture(set.nra, new Uint8Array([128, 128, 204, 255]), 1, 1);
  }
  return maps;
}

function mapTexture(name: string, data: Uint8Array, w: number, h: number) {
  const tex = new DataTexture(data, w, h, RGBAFormat, UnsignedByteType);
  tex.name = name;
  tex.colorSpace = NoColorSpace;
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

/** Frees the GPU memory of baked (or neutral) maps. */
export function disposeVillageTextures(maps: Partial<VillageTextureMaps>): void {
  for (const tex of Object.values(maps)) tex?.dispose();
}

/** WGSL of one bake kernel as the source ComputeKernel assembles it (binding declarations in the
 * source binding order, module code, kernel code with WG_X / WG_Y substituted). */
export function bakeKernelWgsl(kernel: ReturnType<typeof villageBakePlan>[number]): string {
  const decl: string[] = [];
  let i = 0;
  for (const [name, target] of Object.entries(kernel.bindings)) {
    const type =
      kernel.kind === 'derive' && name === 'vlgFields'
        ? 'texture_2d<f32>'
        : `texture_storage_2d<${target === 'fields' ? 'rgba16float' : 'rgba8unorm'}, write>`;
    decl.push(`@group(0) @binding(${i++}) var ${name}: ${type};`);
  }
  const modules = kernel.modules.map((m) => {
    if (m !== noiseModule.name) throw new Error('village-shading: unknown bake module ' + m);
    return noiseModule.code;
  });
  const [x, y, z] = BAKE_WORKGROUP;
  const code = kernel.code
    .replace(/\bWG_X\b/g, String(x))
    .replace(/\bWG_Y\b/g, String(y))
    .replace(/\bWG_Z\b/g, String(z));
  return decl.join('\n') + '\n' + modules.join('\n') + '\n' + code;
}

export interface VillageBake {
  maps: VillageTextureMaps;
  /** RGBA8 level-0 bytes of every map (for caching or checks) */
  bytes: Record<VillageTextureName, Uint8Array>;
  ms: number;
}

/** Runs the source bake kernels on the renderer's WebGPU device and returns mipmapped DataTextures.
 * Requires an initialised WebGPURenderer on the WebGPU backend. */
export async function bakeVillageTextures(renderer: WebGPURenderer): Promise<VillageBake> {
  const device: N = (renderer.backend as N).device;
  if (!device) throw new Error('village-shading: the texture bake needs the WebGPU backend');
  const G: N = globalThis as N;
  const t0 = performance.now();
  const usage = G.GPUTextureUsage,
    bufferUsage = G.GPUBufferUsage,
    mapMode = G.GPUMapMode;
  const finals = new Map<string, { tex: N; w: number; h: number }>();
  const encoder = device.createCommandEncoder({ label: 'VillageBake' });
  const fieldMaps = new Map<string, N>();
  const reads: { name: string; buffer: N; w: number; h: number }[] = [];
  const maps = {} as VillageTextureMaps;
  const bytes = {} as Record<VillageTextureName, Uint8Array>;
  try {
    for (const set of SETS) {
      if (set.nra)
        fieldMaps.set(
          set.name,
          device.createTexture({
            label: 'vlgFields_' + set.name,
            size: [set.w, set.h],
            format: 'rgba16float',
            usage: usage.TEXTURE_BINDING | usage.STORAGE_BINDING,
          }),
        );
      for (const name of [set.out, set.nra])
        if (name)
          finals.set(name, {
            w: set.w,
            h: set.h,
            tex: device.createTexture({
              label: name,
              size: [set.w, set.h],
              format: 'rgba8unorm',
              usage: usage.STORAGE_BINDING | usage.COPY_SRC,
            }),
          });
    }
    for (const kernel of villageBakePlan()) {
      const module = device.createShaderModule({ label: kernel.label, code: bakeKernelWgsl(kernel) });
      const pipeline = device.createComputePipeline({
        label: kernel.label,
        layout: 'auto',
        compute: { module, entryPoint: 'main' },
      });
      const entries = Object.values(kernel.bindings).map((target, binding) => ({
        binding,
        resource: (target === 'fields' ? fieldMaps.get(kernel.set) : finals.get(target)!.tex).createView(),
      }));
      const pass = encoder.beginComputePass({ label: kernel.label });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries }));
      pass.dispatchWorkgroups(
        Math.ceil(kernel.width / BAKE_WORKGROUP[0]),
        Math.ceil(kernel.height / BAKE_WORKGROUP[1]),
        1,
      );
      pass.end();
    }
    for (const [name, f] of finals) {
      const buffer = device.createBuffer({
        label: name + ' readback',
        size: f.w * f.h * 4,
        usage: bufferUsage.COPY_DST | bufferUsage.MAP_READ,
      });
      // every map is at least 256 texels wide: rows are already 256-byte aligned
      encoder.copyTextureToBuffer({ texture: f.tex }, { buffer, bytesPerRow: f.w * 4 }, [f.w, f.h]);
      reads.push({ name, buffer, w: f.w, h: f.h });
    }
    device.queue.submit([encoder.finish()]);
    for (const r of reads) {
      await r.buffer.mapAsync(mapMode.READ);
      const data = new Uint8Array(r.buffer.getMappedRange().slice(0));
      r.buffer.unmap();
      bytes[r.name as VillageTextureName] = data;
      maps[r.name as VillageTextureName] = mapTexture(r.name, data, r.w, r.h);
    }
  } catch (error) {
    disposeVillageTextures(maps);
    throw error;
  } finally {
    // transient field maps, the storage targets and readback buffers are freed whatever happened
    for (const tex of fieldMaps.values()) tex.destroy();
    for (const f of finals.values()) f.tex.destroy();
    for (const r of reads) r.buffer.destroy();
  }
  return { maps, bytes, ms: performance.now() - t0 };
}
