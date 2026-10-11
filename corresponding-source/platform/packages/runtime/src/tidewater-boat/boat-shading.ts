/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
// Source: src/world/boat/BoatMaterials.js 1-611 (WGSL surface / vertex snippets), the engine material
// contract in src/engine/render/MeshShader.js (fragInput, surfaceOf, VertexData), src/engine/render/wgsl/
// lighting.js (Surface, defaultSurface), src/materials/Materials.js (the standard / physical preludes) and
// the MaterialX noise of src/engine/render/wgsl/common.js.
//
// Native three.js WebGPU materials for the seven boat buckets. The source WGSL snippets run verbatim
// (taken from `BoatMaterialSpecs`, which keeps them 1:1 with the source) inside generated wgslFn entries:
// each entry rebuilds the engine's `in` (FragInput), `s` (Surface, seeded like the engine's surfaceOf and
// the material prelude), `frame` and `mat` locals, runs the snippet, and returns the surface packed into a
// mat4x4f. three's MeshStandard / MeshPhysical node lighting then plays the role of the engine's
// shadeSurface (same GGX + Lambert, ao on the indirect light, a clearcoat lobe on the hull), like the
// plant materials do. The fittings vertex snippet (ensign and whip antenna motion) runs as the
// positionNode.
//
// Divergences (engine-only features with no three.js counterpart; see docs/reference/tidewater-world/
// 18-boat-shading/README.md): the glass `output` snippet (velocity weight 0 for the temporal resolve) has
// no target; the engine's underwater ambient (submergedHidden) and its scene lighting hooks are the
// runtime's TidewaterLighting adapters; s.envIntensity, specularIntensity, sheen and ior keep three's
// defaults, which equal the source values (1, 1, 0, 1.5).
import {
  DoubleSide,
  FrontSide,
  MeshPhysicalNodeMaterial,
  MeshStandardNodeMaterial,
  TSL,
  Vector3,
} from 'three/webgpu';
import {
  BOAT_BUCKETS,
  BOAT_WGSL_MODULE,
  BoatMaterialSpecs,
  wgslColor,
  wgslFloat,
  type BoatBucket,
  type HullShape,
  type WgslMaterialSpec,
} from './boat-materials.js';
/* eslint-disable @typescript-eslint/no-explicit-any -- native TSL graph boundary */
type N = any;

/** Verbatim lines of the engine's common WGSL module that the boat snippets use (sat, TWO_PI, MaterialX noise). */
export const BOAT_COMMON_WGSL = /* wgsl */ `
const TWO_PI: f32 = 6.283185307179586;
fn sat( x: f32 ) -> f32 { return clamp( x, 0.0, 1.0 ); }
fn _mxRotl( x: u32, k: u32 ) -> u32 { return ( x << k ) | ( x >> ( 32u - k ) ); }
fn _mxFinal( a0: u32, b0: u32, c0: u32 ) -> u32 {
	var a = a0; var b = b0; var c = c0;
	c ^= b; c -= _mxRotl( b, 14u );
	a ^= c; a -= _mxRotl( c, 11u );
	b ^= a; b -= _mxRotl( a, 25u );
	c ^= b; c -= _mxRotl( b, 16u );
	a ^= c; a -= _mxRotl( c, 4u );
	b ^= a; b -= _mxRotl( a, 14u );
	c ^= b; c -= _mxRotl( b, 24u );
	return c;
}
fn mxHash3( x: i32, y: i32, z: i32 ) -> u32 { let s = 0xdeadbeefu + ( 3u << 2u ) + 13u; return _mxFinal( s + u32( x ), s + u32( y ), s + u32( z ) ); }
fn _gradDot3( h: u32, p: vec3f ) -> f32 {
	let hh = h & 15u;
	let u = select( p.y, p.x, hh < 8u );
	let v = select( select( p.z, p.x, hh == 12u || hh == 14u ), p.y, hh < 4u );
	return select( u, - u, ( hh & 1u ) != 0u ) + select( v, - v, ( hh & 2u ) != 0u );
}
fn _fade3( t: vec3f ) -> vec3f { return t * t * t * ( t * ( t * 6.0 - 15.0 ) + 10.0 ); }
fn _h3( i: vec3i ) -> u32 { return mxHash3( i.x, i.y, i.z ); }
fn perlin3( p: vec3f ) -> f32 {
	let fl = floor( p );
	let i = vec3i( fl );
	let f = p - fl;
	let u = _fade3( f );
	let n000 = _gradDot3( _h3( i ), f );
	let n100 = _gradDot3( _h3( i + vec3i( 1, 0, 0 ) ), f - vec3f( 1.0, 0.0, 0.0 ) );
	let n010 = _gradDot3( _h3( i + vec3i( 0, 1, 0 ) ), f - vec3f( 0.0, 1.0, 0.0 ) );
	let n110 = _gradDot3( _h3( i + vec3i( 1, 1, 0 ) ), f - vec3f( 1.0, 1.0, 0.0 ) );
	let n001 = _gradDot3( _h3( i + vec3i( 0, 0, 1 ) ), f - vec3f( 0.0, 0.0, 1.0 ) );
	let n101 = _gradDot3( _h3( i + vec3i( 1, 0, 1 ) ), f - vec3f( 1.0, 0.0, 1.0 ) );
	let n011 = _gradDot3( _h3( i + vec3i( 0, 1, 1 ) ), f - vec3f( 0.0, 1.0, 1.0 ) );
	let n111 = _gradDot3( _h3( i + vec3i( 1, 1, 1 ) ), f - vec3f( 1.0, 1.0, 1.0 ) );
	let x0 = mix( mix( n000, n100, u.x ), mix( n010, n110, u.x ), u.y );
	let x1 = mix( mix( n001, n101, u.x ), mix( n011, n111, u.x ), u.y );
	return mix( x0, x1, u.z ) * 0.982;
}
fn mx_noise_float3( p: vec3f ) -> f32 { return perlin3( p ); }
fn mx_fractal_noise_float3( p: vec3f, octaves: i32, lacunarity: f32, diminish: f32 ) -> f32 {
	var r = 0.0; var amp = 1.0; var q = p;
	for ( var i = 0; i < octaves; i++ ) { r += amp * perlin3( q ); amp *= diminish; q *= lacunarity; }
	return r;
}
`;

// The engine's fragment input, surface, frame and material uniforms, reduced to the fields the boat
// snippets read or write (FragInput: MeshShader.js; Surface: lighting.js; frame: Frame.js).
const SURFACE_STRUCTS = /* wgsl */ `
struct BoatVs { vAux: vec4f, vLocal: vec3f };
struct BoatIn { vs: BoatVs, P: vec3f, N: vec3f, uv: vec2f, color: vec4f };
struct BoatSurface { albedo: vec3f, alpha: f32, normal: vec3f, roughness: f32, emissive: vec3f, metalness: f32, ao: f32, clearcoat: f32, clearcoatRoughness: f32 };
struct BoatFrame { time: f32, night: f32, sunDir: vec3f, sunColor: vec3f, skyIrradiance: vec3f };
struct BoatMat { color: vec3f, navOn: f32 };
`;

const VERTEX_STRUCTS = /* wgsl */ `
struct BoatVertexData { position: vec3f, aux: vec4f };
struct BoatVertexOut { vAux: vec4f, vLocal: vec3f };
struct BoatVertexFrame { time: f32, windSpeed: f32 };
struct BoatVertexMat { flagPivot: vec3f, flagDir: vec3f, flagWind: f32 };
`;

/** The inputs every surface entry takes, in order (one signature for all seven buckets). */
export const BOAT_SURFACE_INPUTS = [
  'twUv',
  'twColor',
  'twAux',
  'twLocal',
  'twP',
  'twN',
  'twTime',
  'twNight',
  'twSunDir',
  'twSunColor',
  'twSky',
  'twNavOn',
] as const;

const entryName = (bucket: BoatBucket) =>
  'twBoat' + bucket[0]!.toUpperCase() + bucket.slice(1) + 'Surface';

// The engine seeds the Surface (defaultSurface + surfaceOf: albedo = mat.color * in.color.rgb, alpha =
// mat.opacity * in.color.a, roughness, metalness, emissive) and the Materials.js prelude (emissive *
// emissiveIntensity (1), physical: clearcoat, clearcoatRoughness) before the material's own snippet.
function surfaceEntry(bucket: BoatBucket, spec: WgslMaterialSpec): string {
  const o = spec.options;
  const physical = spec.kind === 'physical';
  return `
fn ${entryName(bucket)}( twUv: vec2f, twColor: vec3f, twAux: vec4f, twLocal: vec3f, twP: vec3f, twN: vec3f, twTime: f32, twNight: f32, twSunDir: vec3f, twSunColor: vec3f, twSky: vec3f, twNavOn: f32 ) -> mat4x4f {
	var in: BoatIn;
	in.vs.vAux = twAux;
	in.vs.vLocal = twLocal;
	in.P = twP;
	in.N = twN;
	in.uv = twUv;
	in.color = vec4f( twColor, 1.0 );
	var frame: BoatFrame;
	frame.time = twTime;
	frame.night = twNight;
	frame.sunDir = twSunDir;
	frame.sunColor = twSunColor;
	frame.skyIrradiance = twSky;
	var mat: BoatMat;
	mat.color = ${wgslColor(o.color ?? 0xffffff)};
	mat.navOn = twNavOn;
	var s: BoatSurface;
	s.albedo = mat.color * in.color.rgb;
	s.alpha = ${wgslFloat(o.opacity ?? 1)} * in.color.a;
	s.normal = in.N;
	s.roughness = ${wgslFloat(o.roughness ?? 1)};
	s.metalness = ${wgslFloat(o.metalness ?? 0)};
	s.emissive = vec3f( 0.0 );
	s.ao = 1.0;
	s.clearcoat = ${wgslFloat(physical ? (o.clearcoat ?? 0) : 0)};
	s.clearcoatRoughness = ${wgslFloat(physical ? (o.clearcoatRoughness ?? 0) : 0)};
	{
${spec.surface}
	}
	return mat4x4f( vec4f( s.albedo, s.alpha ), vec4f( s.normal, s.roughness ), vec4f( s.emissive, s.metalness ), vec4f( s.ao, s.clearcoat, s.clearcoatRoughness, 0.0 ) );
}
`;
}

/** Inputs of the fittings vertex entry, in order. */
export const BOAT_VERTEX_INPUTS = [
  'twPosition',
  'twAux',
  'twTime',
  'twWindSpeed',
  'twFlagPivot',
  'twFlagDir',
  'twFlagWind',
] as const;

function vertexEntry(spec: WgslMaterialSpec): string {
  return `
fn twBoatFittingsVertex( twPosition: vec3f, twAux: vec4f, twTime: f32, twWindSpeed: f32, twFlagPivot: vec3f, twFlagDir: vec3f, twFlagWind: f32 ) -> vec3f {
	var v: BoatVertexData;
	v.position = twPosition;
	v.aux = twAux;
	var o: BoatVertexOut;
	var frame: BoatVertexFrame;
	frame.time = twTime;
	frame.windSpeed = twWindSpeed;
	var mat: BoatVertexMat;
	mat.flagPivot = twFlagPivot;
	mat.flagDir = twFlagDir;
	mat.flagWind = twFlagWind;
	{
${spec.vertex ?? ''}
	}
	return v.position;
}
`;
}

export interface BoatShadingWgsl {
  /** One wgslFn source per bucket; its first function is the entry (wgslFn calls the first declaration). */
  surfaces: Record<BoatBucket, string>;
  /** The fittings vertex animation (ensign, whip antenna), entry first. */
  fittingsVertex: string;
}

/** The generated WGSL of every boat material (entry first, then structs, the source boat module and noise). */
export function boatShadingWgsl(specs: BoatMaterialSpecs): BoatShadingWgsl {
  const surfaces = {} as Record<BoatBucket, string>;
  for (const bucket of BOAT_BUCKETS)
    surfaces[bucket] = surfaceEntry(bucket, specs[bucket]) + SURFACE_STRUCTS + BOAT_WGSL_MODULE + BOAT_COMMON_WGSL;
  return {
    surfaces,
    fittingsVertex: vertexEntry(specs.fittings) + VERTEX_STRUCTS + BOAT_WGSL_MODULE,
  };
}

/** Uniform handles shared with BoatModel.update / setNavLights (BoatMaterials keeps them as `{ value }`). */
export interface BoatShadingHandles {
  navOn: { value: number };
  flagPivot: { value: Vector3 };
  flagDir: { value: Vector3 };
  flagWind: { value: number };
}

/** Frame inputs (the source engine's frame uniforms). Missing ones are owned by BoatShading. */
export interface BoatShadingBindings {
  /** Simulation time in seconds (frame.time): radar sweep, gauges, ensign and whip motion. */
  time?: N;
  /** 0 day .. 1 night (frame.night): screen and light brightness. */
  night?: N;
  /** Wind speed in m/s at 10 m (frame.windSpeed): whip antenna sway. */
  windSpeed?: N;
  /** Direction toward the sun or moon (frame.sunDir), world space. */
  sunDirection?: N;
  /** Sun colour times intensity (frame.sunColor). */
  sunColor?: N;
  /** Sky irradiance (frame.skyIrradiance): the wheelhouse headliner fill. */
  skyIrradiance?: N;
}

export type BoatShadedMaterial = MeshStandardNodeMaterial | MeshPhysicalNodeMaterial;

/** Animated mesh names of BoatModel and their bucket (static meshes are named `boat-<bucket>`). */
export const BOAT_PART_BUCKETS: Readonly<Record<string, BoatBucket>> = {
  wheel: 'wood',
  throttle: 'fittings',
  radar: 'fittings',
  propeller: 'fittings',
  rudder: 'fittings',
};

/**
 * The source BoatMaterials as native three.js WebGPU node materials: the same buckets, uniform handles,
 * setNavLights and dispose as `BoatMaterials`, plus the frame uniforms it reads.
 */
export class BoatShading {
  readonly specs: BoatMaterialSpecs;
  readonly wgsl: BoatShadingWgsl;
  readonly time: N;
  readonly night: N;
  readonly windSpeed: N;
  readonly sunDirection: N;
  readonly sunColor: N;
  readonly skyIrradiance: N;
  readonly navOn: { value: number };
  readonly flagPivot: { value: Vector3 };
  readonly flagDir: { value: Vector3 };
  readonly flagWind: { value: number };
  readonly hull: MeshPhysicalNodeMaterial;
  readonly gelcoat: MeshStandardNodeMaterial;
  readonly wood: MeshStandardNodeMaterial;
  readonly fittings: MeshStandardNodeMaterial;
  readonly glass: MeshPhysicalNodeMaterial;
  readonly glow: MeshStandardNodeMaterial;
  readonly trap: MeshStandardNodeMaterial;
  #ownTime: boolean;

  constructor(hullShape: HullShape, bindings: BoatShadingBindings = {}, handles?: BoatShadingHandles) {
    const t = TSL as N;
    const specs = (this.specs = new BoatMaterialSpecs(hullShape));
    const wgsl = (this.wgsl = boatShadingWgsl(specs));
    const h = handles ?? specs;
    this.navOn = h.navOn;
    this.flagPivot = h.flagPivot;
    this.flagDir = h.flagDir;
    this.flagWind = h.flagWind;
    this.#ownTime = !bindings.time;
    this.time = bindings.time ?? t.uniform(0);
    this.night = bindings.night ?? t.uniform(0);
    this.windSpeed = bindings.windSpeed ?? t.uniform(7);
    // source engine frame defaults (engine/render/Frame.js)
    this.sunDirection = bindings.sunDirection ?? t.uniform(new Vector3(0.3, 0.6, -0.7).normalize());
    this.sunColor = bindings.sunColor ?? t.uniform(new Vector3(1, 1, 1));
    this.skyIrradiance = bindings.skyIrradiance ?? t.uniform(new Vector3(0.3, 0.4, 0.6));

    const navOn = t.uniform(this.navOn.value).onRenderUpdate(() => this.navOn.value);
    const flagPivot = t.uniform(new Vector3()).onRenderUpdate(() => this.flagPivot.value);
    const flagDir = t.uniform(new Vector3(0, 0, -1)).onRenderUpdate(() => this.flagDir.value);
    const flagWind = t.uniform(this.flagWind.value).onRenderUpdate(() => this.flagWind.value);

    const aux = t.attribute('aux', 'vec4');
    const local = t.varying(t.positionGeometry, 'twBoatLocal');
    const make = (bucket: BoatBucket): BoatShadedMaterial => {
      const spec = specs[bucket];
      const o = spec.options;
      const double = o.side === DoubleSide;
      const params = {
        side: o.side ?? FrontSide,
        transparent: o.transparent ?? false,
        depthWrite: o.depthWrite ?? !(o.transparent ?? false),
        alphaTest: o.alphaTest ?? 0,
        roughness: o.roughness ?? 1,
        metalness: o.metalness ?? 0,
      };
      const mat =
        spec.kind === 'physical'
          ? new MeshPhysicalNodeMaterial({
              ...params,
              clearcoat: o.clearcoat ?? 0,
              clearcoatRoughness: o.clearcoatRoughness ?? 0,
              ior: o.ior ?? 1.5,
            })
          : new MeshStandardNodeMaterial(params);
      mat.name = spec.name;
      // engine fragInput: N = normalize( world normal ), flipped on back faces of double-sided materials
      const normal = double
        ? t.normalWorldGeometry.mul(t.select(t.frontFacing, 1, -1))
        : t.normalWorldGeometry;
      const shade = t.wgslFn(wgsl.surfaces[bucket])({
        twUv: t.uv(),
        twColor: t.attribute('color', 'vec3'),
        twAux: aux,
        twLocal: local,
        twP: t.positionWorld,
        twN: normal,
        twTime: this.time,
        twNight: this.night,
        twSunDir: this.sunDirection,
        twSunColor: this.sunColor,
        twSky: this.skyIrradiance,
        twNavOn: navOn,
      });
      mat.colorNode = shade.element(0).rgb;
      if (o.transparent || o.alphaTest) mat.opacityNode = shade.element(0).a;
      // snippets that write s.normal (world space); three takes a view-space normal
      if (/\bs\.normal\s*=/.test(spec.surface))
        mat.normalNode = t.cameraViewMatrix.mul(t.vec4(shade.element(1).xyz.normalize(), 0)).xyz;
      mat.roughnessNode = shade.element(1).w;
      mat.emissiveNode = shade.element(2).rgb;
      mat.metalnessNode = shade.element(2).w;
      mat.aoNode = shade.element(3).x;
      if (mat instanceof MeshPhysicalNodeMaterial && (o.clearcoat ?? 0) > 0) {
        mat.clearcoatNode = shade.element(3).y;
        mat.clearcoatRoughnessNode = shade.element(3).z;
      }
      // only the fittings carry a vertex snippet beyond the shared AUX_VERTEX copy of the varyings
      if (bucket === 'fittings')
        mat.positionNode = t.wgslFn(wgsl.fittingsVertex)({
          twPosition: t.positionGeometry,
          twAux: aux,
          twTime: this.time,
          twWindSpeed: this.windSpeed,
          twFlagPivot: flagPivot,
          twFlagDir: flagDir,
          twFlagWind: flagWind,
        });
      return mat;
    };
    this.hull = make('hull') as MeshPhysicalNodeMaterial;
    this.gelcoat = make('gelcoat') as MeshStandardNodeMaterial;
    this.wood = make('wood') as MeshStandardNodeMaterial;
    this.fittings = make('fittings') as MeshStandardNodeMaterial;
    this.glass = make('glass') as MeshPhysicalNodeMaterial;
    this.glow = make('glow') as MeshStandardNodeMaterial;
    this.trap = make('trap') as MeshStandardNodeMaterial;
  }

  /** Advances the owned clock (when no `time` binding was given) and takes the wind speed. */
  update(dt: number, wind?: { speed: number }): void {
    if (this.#ownTime && dt > 0) this.time.value += dt;
    if (wind && this.windSpeed.isUniformNode) this.windSpeed.value = wind.speed;
  }

  setNavLights(on: boolean): void {
    this.navOn.value = on ? 1 : 0;
  }

  /** Puts these materials on a BoatModel's meshes (by bucket), keeping its uniform handles. */
  apply(model: {
    meshes: Record<string, { name: string; material: unknown }>;
  }): void {
    for (const [name, mesh] of Object.entries(model.meshes)) {
      const bucket = BOAT_PART_BUCKETS[name] ?? (BOAT_BUCKETS as readonly string[]).find((b) => b === name);
      if (bucket) mesh.material = this[bucket as BoatBucket];
    }
  }

  dispose(): void {
    for (const k of BOAT_BUCKETS) this[k].dispose();
  }
}

/**
 * Shades a BoatModel with native materials: shares its uniform handles (BoatModel.update writes the
 * ensign wind, setNavLights the nav lights) and replaces the stand-ins on its meshes.
 */
export function shadeBoatModel(
  model: {
    lines: HullShape;
    materials: BoatShadingHandles;
    meshes: Record<string, { name: string; material: unknown }>;
  },
  bindings: BoatShadingBindings = {},
): BoatShading {
  const shading = new BoatShading(model.lines, bindings, model.materials);
  shading.apply(model);
  return shading;
}
