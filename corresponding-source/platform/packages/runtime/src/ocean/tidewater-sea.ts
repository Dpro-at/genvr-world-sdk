import type { GroundWetness } from './ground-wetness.js';
import type { TidewaterEnvironment } from '../tidewater-sky/environment.js';
/*
 * Uses ports of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software
 * Solutions LLC, MIT (see ./LICENSE-tidewater.md): the FFT (ocean-fft.ts), the surface (water-surface.ts), the foam
 * pattern (foam-texture.ts) and the shading (water-shading.ts). This file is Genvr's own glue.
 *
 * The deep sea on WebGPU at graphics High and Ultra (plan task 2): one dense grid that follows the camera, finest
 * under it and coarser outwards (Tidewater uses a CDLOD quadtree; we keep a single grid until the far sea shows
 * tiling or swimming, plan task 12), pinned to the sea's square so it ends where the old sea ended.
 */
import {
  BufferAttribute,
  type Camera,
  ClampToEdgeWrapping,
  DataTexture,
  DataUtils,
  type DirectionalLight,
  DoubleSide,
  BufferGeometry,
  FloatType,
  NearestFilter,
  RGBAFormat,
  HalfFloatType,
  LinearFilter,
  Mesh,
  MeshBasicNodeMaterial,
  RedFormat,
  type Scene,
  type Texture,
  TSL,
  Vector2,
  Vector3,
  type WebGPURenderer,
} from 'three/webgpu';
import { DEFAULT_CASCADE_SIZES } from './ocean-spectrum.js';
import { OceanFFT } from './ocean-fft.js';
import { createFoamTexture } from './foam-texture.js';
import { waterSurfaceFragment, waterSurfaceVertex } from './water-surface.js';
import { pick, waterShade } from './water-shading.js';
import { seaClock, shoreClock, type Swell, swellFromSetting } from './sea-clock.js';
import { shoreFieldFromHeights } from './shore-field-worker.js';
import type { ShoreField } from './shore-field.js';
import type { SurfShore } from './surf-sound.js';
import { SeaDetail } from './sea-detail.js';
import {
  BEACH_SLOPE,
  cpuShore,
  GRAVITY,
  SHORE_DEFAULTS,
  shoreBreakParams,
  shoreFieldSample,
  type ShoreParams,
  shorePhase,
  shoreProfile,
  shoreSwashRunup,
  shoreSwashThickness,
  shoreWaveAmp,
  SWASH_OVERSHOOT,
  tslShore,
  WATER_SHORE_DEEP,
} from './shore-waves.js';

/* eslint-disable @typescript-eslint/no-explicit-any -- TSL's typings are too narrow for these node chains */
type AnyNode = any;

const {
  abs,
  attribute,
  cameraFar,
  cameraNear,
  cameraPosition,
  clamp,
  frontFacing,
  min,
  mix,
  normalize,
  perspectiveDepthToViewZ,
  pmremTexture,
  positionLocal,
  positionWorld,
  screenUV,
  select,
  smoothstep,
  texture,
  uniform,
  varying,
  vec3,
  viewportDepthTexture,
  viewportSharedTexture,
} = TSL as AnyNode;


/** How the deep sea is drawn at a quality level. */
export interface TidewaterSeaOptions {
  /** Shared ground history bridge owned by WaterView. */
  groundWetness?: GroundWetness;
  /** FFT cascades: 3 at High (the 7.1 m one dropped), 4 at Ultra. */
  cascades: number;
  /** Grid cells per side of the camera grid. */
  gridCells: number;
  /** Near-camera ripples (Ultra). */
  ripples: boolean;
  /** Gusts, slicks and windrows (Ultra, plan task 7). */
  detail?: boolean;
  /** Debug views for checks: the shading normal, the foam, or the wave height. */
  debugView?: string | 'normal' | 'foam' | 'height' | 'sky' | 'fresnel' | 'reflection' | 'transmitted' | 'glint' | 'path' | 'below';
}

const float1 = TSL.float(1);

/** Size of the grid's finest cell, right under the camera (m). */
export const SEA_GRID_FINEST = 0.3;
/** Cells of the sea depth map per side. */
export const SEA_DEPTH_CELLS = 512;
/** The depth map keeps depths in this range (m): below it the sea looks the same, above it land is land. */
export const SEA_DEPTH_RANGE = [-40, 500] as const;

/** How far the sea grid reaches from the camera (m): just inside the camera's far plane (5000 m). */
export const SEA_HORIZON = 4900;

/**
 * Coordinates along one axis of the camera grid, from -radius to radius: `cells / 2` steps each side growing
 * geometrically from `finest`, p(i) = a (e^{b i} - 1) with a b = finest and p(cells / 2) = radius.
 */
export function seaGridAxis(cells: number, finest: number, radius: number): Float64Array {
  const half = Math.floor(cells / 2);
  // solve (e^{b half} - 1) / b = radius / finest for b by bisection
  const target = radius / finest;
  let lo = 1e-6;
  let hi = 1;
  if (half >= target) {
    // fine enough to be uniform
    lo = hi = 0;
  } else {
    for (let k = 0; k < 100; k += 1) {
      const b = (lo + hi) / 2;
      if ((Math.exp(b * half) - 1) / b > target) hi = b;
      else lo = b;
    }
  }
  const b = (lo + hi) / 2;
  const p = (i: number) => (b === 0 ? (i * radius) / half : (finest / b) * (Math.exp(b * i) - 1));
  const out = new Float64Array(half * 2 + 1);
  for (let i = -half; i <= half; i += 1) out[i + half] = Math.sign(i) * p(Math.abs(i));
  return out;
}

/**
 * The camera grid: positions (x, 0, z) in the mesh's own space and a `spacing` per vertex (the larger of its
 * cells' sides) for the band limit of the waves. Triangles face up.
 */
export function seaGridGeometry(cells: number, finest: number, radius: number): BufferGeometry {
  const axis = seaGridAxis(cells, finest, radius);
  const n = axis.length;
  const positions = new Float32Array(n * n * 3);
  const spacing = new Float32Array(n * n);
  const step = (i: number) => Math.max(axis[Math.min(n - 1, i + 1)]! - axis[i]!, axis[i]! - axis[Math.max(0, i - 1)]!);
  for (let j = 0; j < n; j += 1)
    for (let i = 0; i < n; i += 1) {
      const v = j * n + i;
      positions[v * 3] = axis[i]!;
      positions[v * 3 + 2] = axis[j]!;
      spacing[v] = Math.max(step(i), step(j));
    }
  const index = new Uint32Array((n - 1) * (n - 1) * 6);
  let k = 0;
  for (let j = 0; j < n - 1; j += 1)
    for (let i = 0; i < n - 1; i += 1) {
      const a = j * n + i;
      const b = a + 1;
      const d = a + n;
      const c = d + 1;
      index.set([a, d, b, b, d, c], k);
      k += 6;
    }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('spacing', new BufferAttribute(spacing, 1));
  geometry.setIndex(new BufferAttribute(index, 1));
  return geometry;
}

/** Depth of the sea over its square (level minus ground, clamped to SEA_DEPTH_RANGE), row-major from -extent. */
export function bakeSeaDepth(
  level: number,
  extent: number,
  heightAt: (x: number, z: number) => number,
  cells = SEA_DEPTH_CELLS,
): Float32Array {
  const out = new Float32Array(cells * cells);
  for (let j = 0; j < cells; j += 1)
    for (let i = 0; i < cells; i += 1) {
      const x = -extent + ((i + 0.5) / cells) * extent * 2;
      const z = -extent + ((j + 0.5) / cells) * extent * 2;
      const depth = level - heightAt(x, z);
      out[j * cells + i] = Math.min(SEA_DEPTH_RANGE[1], Math.max(SEA_DEPTH_RANGE[0], depth));
    }
  return out;
}

function halfTexture(depths: Float32Array, cells: number): DataTexture {
  const data = new Uint16Array(depths.length);
  for (let i = 0; i < depths.length; i += 1) data[i] = DataUtils.toHalfFloat(depths[i]!);
  const tex = new DataTexture(data, cells, cells, RedFormat, HalfFloatType);
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearFilter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

/** The shore field as a float texture read with exact loads (a 1 x 1 "no field" until the first solve). */
function fieldTexture(field: ShoreField | null): DataTexture {
  const tex = field
    ? new DataTexture(field.data, field.res, field.res, RGBAFormat, FloatType)
    : new DataTexture(new Float32Array([1e5, 0.02, 0, 1e5]), 1, 1, RGBAFormat, FloatType);
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

/** Seconds the shore waves take to fade in or out when a new shore field replaces the old one. */
export const SHORE_FADE_SECONDS = 0.5;
/** A terrain edit solves the shore field again after this quiet time (ms). */
export const SHORE_RESOLVE_DELAY = 1000;

/** The Tidewater deep sea: FFT, foam pattern, depth map, camera grid and the water material. */
export class TidewaterSea {
  readonly mesh: Mesh;
  readonly fft: OceanFFT;
  readonly #foam: Texture;
  /** Gusts, slicks and windrows (Ultra), or null. */
  readonly #detail: SeaDetail | null;
  /** Sea time for the detail when there is no room clock (local steps). */
  #localSeaTime = 0;
  #depth: DataTexture;
  readonly #material: MeshBasicNodeMaterial;
  readonly #level = uniform(0);
  readonly #extent = uniform(1);
  readonly #origin = uniform(new Vector2());
  readonly #sunDir = uniform(new Vector3(0, 1, 0));
  readonly #sunColor = uniform(new Vector3(1, 1, 1));
  readonly #envIntensity = uniform(1);
  readonly #skyFallback = uniform(new Vector3(0.3, 0.4, 0.6));
  readonly #horizonFallback = uniform(new Vector3(0.6, 0.7, 0.8));
  #env: AnyNode = null;
  #envTexture: Texture | null = null;
  #tidewaterEnvironment: TidewaterEnvironment | null = null;
  #levelValue = Number.NaN;
  #extentValue = 0;
  #disposed = false;
  readonly #sunVector = new Vector3();
  // ---- the shore field and the shore waves (plan tasks 4-5)
  #field: DataTexture = fieldTexture(null);
  #fieldNodes: AnyNode[] = [];
  readonly #fieldRes = uniform(1);
  /** 0..1: the shore waves fade in when a field arrives and out while a new one replaces it. */
  readonly #shoreOn = uniform(0);
  #shoreTarget = 0;
  #pendingField: (ShoreField & { swellDir: [number, number] }) | null = null;
  /** What the surf sound hears from the field on the GPU now (one object per field, plan task 6). */
  #surfShore: SurfShore | null = null;
  #hasField = false;
  #solveToken = 0;
  #solveTimer: ReturnType<typeof setTimeout> | null = null;
  #swell: Swell = swellFromSetting(undefined);
  #swellKey = '';
  /** The direction the swell travels in, once the field is solved (automatic or the place's). */
  swellDirection: [number, number] | null = null;
  readonly #shoreTime = uniform(0);
  readonly #swellDirU = uniform(new Vector2(0, -1));
  readonly #period = uniform(9);
  readonly #amplitude = uniform(0.34);

  constructor(
    private readonly renderer: WebGPURenderer,
    private readonly heightAt: (x: number, z: number) => number,
    readonly options: TidewaterSeaOptions,
  ) {
    this.fft = new OceanFFT({ cascades: options.cascades, sizes: DEFAULT_CASCADE_SIZES.slice(0, options.cascades) });
    this.#foam = createFoamTexture(renderer);
    this.#detail = options.detail ? new SeaDetail() : null;
    this.#depth = halfTexture(new Float32Array(4), 2);
    this.#material = new MeshBasicNodeMaterial({ side: DoubleSide, transparent: true, depthWrite: true });
    this.#material.name = 'tidewater-sea';
    // One pass for both sides: three would otherwise draw the back faces first, and the front faces would then
    // read that half-drawn water back as "the scene behind" for the refraction.
    this.#material.forceSinglePass = true;
    this.mesh = new Mesh(new BufferGeometry(), this.#material);
    this.mesh.name = 'water:sea';
    this.mesh.frustumCulled = false;
    // drawn after the opaque scene (it reads the scene behind it), before other transparent things
    this.mesh.renderOrder = -1;
  }

  /**
   * Puts the sea at `level` over a square of +-extent; bakes its depth map and solves its shore field again when
   * either or the swell changes.
   */
  sync(level: number, extent: number, scene: Scene | null, swell?: Swell): void {
    const nextSwell = swell ?? swellFromSetting(undefined);
    const swellKey = JSON.stringify(nextSwell);
    if (swellKey !== this.#swellKey) {
      this.#swellKey = swellKey;
      this.#swell = nextSwell;
      this.#period.value = nextSwell.period;
      this.#amplitude.value = nextSwell.amplitude;
      if (!Number.isNaN(this.#levelValue)) this.#requestShore(0);
    }
    if (level === this.#levelValue && extent === this.#extentValue && this.mesh.geometry.index) return;
    const firstBuild = !this.mesh.geometry.index;
    this.#levelValue = level;
    this.#extentValue = extent;
    this.#level.value = level;
    this.#extent.value = extent;
    this.options.groundWetness?.invalidate();
    this.#bakeDepth();
    if (firstBuild) {
      this.mesh.geometry.dispose();
      // Covers the square from any camera inside it (corner distance 2 sqrt 2 extent), and reaches the camera's
      // far plane: a sea that ended short of it showed a dark band of sky under the horizon (SCROLL-01).
      this.mesh.geometry = seaGridGeometry(this.options.gridCells, SEA_GRID_FINEST, Math.max(extent * 3, SEA_HORIZON));
    }
    this.#build(scene?.environment ?? null, scene?.userData.tidewaterEnvironment ?? null);
    this.#requestShore(0);
  }

  /** Terrain edits: the depth map follows the ground, the shore field after a quiet second. */
  groundChanged(): void {
    if (Number.isNaN(this.#levelValue)) return;
    this.#bakeDepth();
    this.options.groundWetness?.invalidate();
    this.#requestShore(SHORE_RESOLVE_DELAY);
  }

  /** The shore the surf sound hears (plan task 6): the field the waves are drawn from, null until the first one. */
  get surfShore(): SurfShore | null {
    return this.#surfShore;
  }

  /** True once a shore field is on the GPU and faded in (for checks). */
  get shoreReady(): boolean {
    return this.#hasField && this.#shoreOn.value > 0.99;
  }

  #requestShore(delay: number): void {
    if (this.#solveTimer) clearTimeout(this.#solveTimer);
    this.#solveTimer = setTimeout(() => {
      this.#solveTimer = null;
      void this.#solveShore();
    }, delay);
  }

  async #solveShore(): Promise<void> {
    const token = (this.#solveToken += 1);
    try {
      const field = await shoreFieldFromHeights({
        heightAt: this.heightAt,
        level: this.#levelValue,
        extent: this.#extentValue,
        swellDir: this.#swell.direction,
      });
      if (this.#disposed || token !== this.#solveToken) return;
      this.#pendingField = field;
      // the first field fades in; a new one waits until the old waves have faded out (no jump, no flicker)
      if (!this.#hasField) this.#applyField();
      else this.#shoreTarget = 0;
    } catch (error) {
      console.warn('Shore field failed; the sea keeps no shore waves:', error);
    }
  }

  #applyField(): void {
    const field = this.#pendingField;
    if (!field) return;
    this.#pendingField = null;
    this.swellDirection = field.swellDir;
    const next = fieldTexture(field);
    for (const node of this.#fieldNodes) node.value = next;
    this.#field.dispose();
    this.#field = next;
    this.#fieldRes.value = field.res;
    // (with the field, so the along-shore position changes only while the shore waves are faded out)
    if (this.swellDirection) this.#swellDirU.value.set(this.swellDirection[0], this.swellDirection[1]);
    this.#hasField = true;
    this.#shoreTarget = 1;
    this.#surfShore = {
      field,
      heightAt: this.heightAt,
      level: this.#levelValue,
      swellDir: this.swellDirection ?? [0, -1],
      period: this.#swell.period,
      amplitude: this.#swell.amplitude,
    };
  }

  #bakeDepth(): void {
    const depths = bakeSeaDepth(this.#levelValue, this.#extentValue, this.heightAt);
    const next = halfTexture(depths, SEA_DEPTH_CELLS);
    for (const node of this.#depthNodes) node.value = next;
    this.#depth.dispose();
    this.#depth = next;
  }

  #build(environment: Texture | null, tidewater: TidewaterEnvironment | null = null): void {
    this.#tidewaterEnvironment = tidewater;
    const fft = this.fft;
    this.#envTexture = environment;
    const depthNodes: AnyNode[] = [];
    const seaDepthAt = (xz: AnyNode, vertexStage = false): AnyNode => {
      const uv = xz.add(this.#extent).div(this.#extent.mul(2));
      const node: AnyNode = texture(this.#depth, uv);
      depthNodes.push(node);
      return (vertexStage ? node.level(0) : node).r;
    };
    this.#depthNodes = depthNodes;

    // the shore field at a point: (T, dir x exposure, Ts), and the shore waves' settings as uniforms
    const fieldNodes: AnyNode[] = [];
    const fieldAt = (xz: AnyNode): AnyNode => {
      const base: AnyNode = texture(this.#field);
      fieldNodes.push(base);
      return shoreFieldSample(base, xz, this.#extent.negate(), this.#extent.mul(2), this.#fieldRes);
    };
    this.#fieldNodes = fieldNodes;
    const M = tslShore;
    const P: ShoreParams = {
      period: this.#period,
      amplitude: this.#amplitude,
      variation: TSL.float(SHORE_DEFAULTS.variation),
      gamma: TSL.float(SHORE_DEFAULTS.gamma),
      breakSpan: TSL.float(SHORE_DEFAULTS.breakSpan),
      curl: TSL.float(SHORE_DEFAULTS.curl),
      runup: TSL.float(SHORE_DEFAULTS.runup),
      enabled: this.#shoreOn,
    };
    const level = this.#level;
    const time = this.#shoreTime;
    /** Phase data at a point (`shorePhaseAt`, ShoreWaves.js L510-519). */
    const phaseAt = (xz: AnyNode) => {
      const sh = fieldAt(xz).toVar();
      const exposure = TSL.length(TSL.vec2(sh.y, sh.z)).toVar();
      const dir = TSL.vec2(sh.y, sh.z).div(TSL.max(exposure, 1e-4)).toVar();
      // Along-shore position. Tidewater projects on the local wave direction's normal, which is fine on their long
      // straight beach; round the coast of an island the local direction turns with the shore and that projection
      // collapses to ~0 with noise (spiky fronts). We project on the normal of the swell itself: smooth everywhere,
      // and the same as theirs where the waves meet the beach head-on.
      const along = TSL.dot(xz, TSL.vec2(this.#swellDirU.y.negate(), this.#swellDirU.x)).toVar();
      const s = shorePhase(M, time, sh.x, along, P.period).toVar();
      return { sh, exposure, dir, along, s };
    };

    // ---- vertex: the grid follows the camera, pinned to the sea's square
    const spacing: AnyNode = attribute('spacing', 'float');
    const worldXZ = clamp(positionLocal.xz.add(this.#origin), this.#extent.negate(), this.#extent).toVar();
    const depth = seaDepthAt(worldXZ, true).toVar();
    const surface = waterSurfaceVertex(fft, worldXZ, spacing, depth);
    const disp = surface.displacement.toVar();
    const ground = level.sub(depth).toVar();

    // ---- shore waves (`shoreEvaluate`, ShoreWaves.js L54-169; WaterSurface.js L172-219)
    const ph = phaseAt(worldXZ);
    const cW = TSL.sqrt(clamp(depth, 0.3, 25).mul(GRAVITY));
    const lam = cW.mul(P.period).toVar();
    const m = TSL.floor(ph.s.add(0.5)).toVar();
    const u = ph.s.sub(m).toVar();
    // wave height with a smooth hand-over between consecutive waves at the trough
    const A0 = shoreWaveAmp(M, m, ph.along, P);
    const An = shoreWaveAmp(M, m.add(TSL.sign(u)), ph.along, P);
    const A = mix(A0, An, smoothstep(0.32, 0.5, abs(u)).mul(0.5)).toVar();
    // the breaking state of the whole wave comes from the depth under its crest (`shoreBreakDepth`)
    const crestDepth = seaDepthAt(worldXZ.add(ph.dir.mul(u.mul(lam))), true);
    const dB = mix(crestDepth, depth, smoothstep(0.3, 0.5, abs(u))).toVar();
    // offshore fade-in (the FFT covers deep water) and fade on land (the swash sheet takes over)
    const envW = smoothstep(WATER_SHORE_DEEP, 13, depth)
      .mul(smoothstep(-0.25, 0.05, depth))
      .mul(clamp(ph.exposure.mul(1.4), 0, 1))
      .mul(P.enabled)
      .toVar();
    const B = shoreBreakParams(M, A, dB, P);
    const e = 0.15;
    const s0 = shoreProfile(M, u, lam, B, P, true);
    const s1 = shoreProfile(M, u.sub(TSL.float(e).div(lam)), lam, B, P, false);
    const sx0 = s0.x.toVar();
    const sy0 = s0.y.toVar();
    const shoreDisp = vec3(ph.dir.x.mul(sx0), sy0, ph.dir.y.mul(sx0)).mul(envW);
    // the surface normal from a finite difference along the wave direction
    const dX = s1.x.sub(sx0).mul(envW).add(e);
    const dY = s1.y.sub(sy0).mul(envW);
    const tAlong = vec3(ph.dir.x.mul(dX), dY, ph.dir.y.mul(dX));
    const tAcross = vec3(ph.dir.y.negate(), 0, ph.dir.x);
    const nW = normalize(TSL.cross(tAcross, tAlong).add(vec3(0, 1e-4, 0)));
    let shoreN: AnyNode = normalize(vec3(nW.x, TSL.max(nW.y, 0.04), nW.z));
    // the churn of a bore is uneven along the crest (patches and lace, different for every wave)
    const wwPatch = smoothstep(-0.5, 0.45, TSL.mx_noise_float(TSL.vec2(ph.along.mul(0.06).add(time.mul(0.05)), m.mul(2.9).add(0.4))));
    const shoreFoam = s0.foam.mul(envW).mul(mix(0.3, 1, wwPatch));
    let surfMask: AnyNode = TSL.vec2(s0.face.mul(envW), s0.roller.mul(envW));

    // ---- the swash: run-up of the latest wave on the sand as a thin sheet (`shoreSwashRunup`)
    const swr = shoreSwashRunup(M, time, ph.sh.w, ph.exposure, ph.along, ground, level, P);
    const front = swr.Rt.sub(swr.inland).toVar();
    let thick: AnyNode = shoreSwashThickness(M, front);
    // Wet sand (Genvr's stand-in for Tidewater's ShoreSim, plan task 11): beyond the front, up to where the last
    // two waves reached, the sheet stays a little above the sand and the pixel shader draws the sand behind it,
    // darker. Lifted 0.15 m so it never fights the terrain for depth.
    const reachNow = swr.RhMax;
    const reachLast = shoreWaveAmp(M, swr.ms.sub(1), ph.along, P)
      .mul(2.1)
      .mul(P.runup)
      .mul(clamp(ph.exposure.mul(1.4), 0, 1))
      .div(BEACH_SLOPE);
    const wetReach = TSL.max(reachNow, reachLast).mul(P.enabled).toVar();
    const wetV = smoothstep(wetReach.add(2.5), wetReach.add(1.5), swr.inland).mul(smoothstep(-6, -3, depth));
    // The sand's slope from the depth map, then a clearance: our 2 m depth map and the sea grid's triangles miss the
    // terrain mesh by centimetres on a steep beach, and a 3 cm sheet then dips under the sand in a dashed line
    // (the contact shadow showing only where it peeks out). The clearance grows with the slope and the grid
    // spacing; beyond the front the pixels draw the sand behind them, so the lift there is invisible.
    const g1 = seaDepthAt(worldXZ.add(TSL.vec2(1, 0)), true);
    const g2 = seaDepthAt(worldXZ.add(TSL.vec2(0, 1)), true);
    const gx = g1.sub(depth);
    const gz = g2.sub(depth);
    const clearance = min(TSL.length(TSL.vec2(gx, gz)).mul(spacing).mul(0.5).add(0.02), 0.2);
    const overshootZone = smoothstep(-SWASH_OVERSHOOT - 1.3, -SWASH_OVERSHOOT, front);
    thick = pick(
      front.lessThan(0),
      TSL.max(thick, TSL.max(wetV.mul(0.15), overshootZone.mul(clearance))),
      thick.add(clearance.sub(0.02)),
    );
    const swashLevel = ground.add(thick);

    // ---- sum: FFT + shore waves, the sheet on the sand, hidden below dry land
    let total: AnyNode = disp.add(shoreDisp).toVar();
    let y: AnyNode = level.add(total.y);
    // The waves sink smoothly into the beach (our depth map is coarser than the terrain mesh: a per-vertex step
    // drew a saw-tooth and z-fought); the swash sheet then takes over on the sand.
    const sink = smoothstep(0.25, -0.75, depth);
    const target = pick(depth.lessThan(-3), min(ground.sub(2), level.sub(1)), ground.sub(1));
    y = mix(y, min(y, target), sink);
    // no run-up sheet on steep rock (cliffs): waves break against it instead (`gentle`, from the depth map)
    const groundTilt = normalize(vec3(gx, 1, gz));
    const gentle = smoothstep(0.45, 0.25, TSL.length(TSL.vec2(groundTilt.x, groundTilt.z)));
    // The sheet lies on the sand, but its shading normal leans at most like Tidewater's beach (BEACH_SLOPE 0.066): on a
    // steeper beach the sand's own tilt sends the reflection of the thin film below the horizon (a dark band).
    const slopeLen = TSL.max(TSL.length(TSL.vec2(gx, gz)), 1e-4);
    const groundN = normalize(vec3(gx, 1, gz).mul(vec3(TSL.min(slopeLen, BEACH_SLOPE).div(slopeLen), 1, TSL.min(slopeLen, BEACH_SLOPE).div(slopeLen))));
    const nearShore = pick(depth.lessThan(WATER_SHORE_DEEP), TSL.float(1), TSL.float(0));
    const k = 0.04;
    const hmx = clamp(swashLevel.sub(y).div(k).mul(0.5).add(0.5), 0, 1).mul(gentle).mul(nearShore).toVar();
    y = mix(y, swashLevel, hmx).add(hmx.mul(float1.sub(hmx)).mul(k));
    // where the sheet is the surface, it lies on the sand: the sand's slope, no wave motion
    shoreN = normalize(mix(shoreN, groundN, hmx));
    const still = float1.sub(hmx);
    total = vec3(total.x.mul(still), total.y, total.z.mul(still));
    surfMask = surfMask.mul(still);
    // Hide the sheet below dry land beyond the swash zone. Not Tidewater's per-vertex "below the ground: 6 cm under
    // it" step: with our depth map that drew a dashed line along the waterline (triangles folding at the step); the
    // sheet beyond the front already lies 10 cm under the sand, and deep inland it goes 2 m under.
    y = pick(depth.lessThan(-3), min(y, min(ground.sub(2), level.sub(1))), y);
    this.#material.positionNode = vec3(
      worldXZ.x.add(total.x).sub(this.#origin.x),
      y,
      worldXZ.y.add(total.z).sub(this.#origin.y),
    );
    const vLagXZ = varying(worldXZ, 'vLagXZ');
    const vDepth = varying(depth, 'vSeaDepth');
    const vFoam = varying(surface.foam, 'vFoam');
    const vHeight = varying(total.y, 'vWaveH');
    const vShoreN = varying(shoreN, 'vShoreN');
    const vShoreFoam = varying(shoreFoam, 'vShoreFoam');
    const vSurfMask = varying(surfMask, 'vSurfMask');

    // ---- fragment: the swash edge per pixel (`shoreSwashEdge`, ShoreWaves.js L602-621; WaterMaterial.js L245-283)
    const pos = positionWorld;
    const groundH = level.sub(seaDepthAt(pos.xz)).toVar();
    const tRaw = pos.y.sub(groundH).toVar();
    const php = phaseAt(pos.xz);
    const swp = shoreSwashRunup(M, time, php.sh.w, php.exposure, php.along, groundH, level, P);
    const frontP = swp.Rt.sub(swp.inland).toVar();
    const wEdge = smoothstep(level.sub(0.8), level.sub(0.4), groundH)
      .mul(smoothstep(0.3, 0.15, tRaw))
      .mul(pick(vDepth.lessThan(1), TSL.float(1), TSL.float(0)))
      .toVar();
    const hasEdge = wEdge.greaterThan(0);
    let thickness: AnyNode = pick(hasEdge, mix(tRaw, min(tRaw, frontP.mul(0.08)), wEdge), tRaw);
    let frontD: AnyNode = pick(hasEdge, frontP.div(TSL.max(wEdge, 1e-3)), TSL.float(1e3));
    const swTau = pick(hasEdge, swp.tau, TSL.float(0)).toVar();
    const swRt = pick(hasEdge, swp.Rt.mul(wEdge), TSL.float(0)).toVar();
    // the draining sheet has no rounded front: it thins out and breaks up where the sand drains faster
    const backwash = smoothstep(0.32, 0.46, swTau);
    // (Tidewater switches this on below 3 m from the front; a hard switch steps the film thickness, and fwidth of
    // that step drew a dashed dark line in the shallows. Faded in from 3 m to 2 m instead.)
    const breakUp = pick(backwash.greaterThan(0).and(swRt.greaterThan(0)), smoothstep(3, 2, frontD), TSL.float(0));
    const noiseA = TSL.mx_noise_float(pos.xz.mul(1.1)).mul(0.35).add(TSL.mx_noise_float(pos.xz.mul(3.7).add(TSL.vec2(5.3, 1.9))).mul(0.15));
    frontD = frontD.add(noiseA.mul(backwash).mul(breakUp)).toVar();
    thickness = mix(thickness, min(tRaw, frontD.mul(mix(0.08, 0.025, backwash))), breakUp).toVar();
    // the foam line riding the front: a dense bead at the edge while it runs up, a thinning lace behind it
    const uprush = smoothstep(0.46, 0.32, swTau).toVar();
    const bead = smoothstep(-0.01, 0.05, frontD).mul(smoothstep(0.6, 0.12, frontD));
    const trail = smoothstep(-0.01, 0.25, frontD).mul(smoothstep(2.2, 0.3, frontD));
    const patchy = smoothstep(-0.45, 0.55, TSL.mx_noise_float(pos.xz.mul(0.42)))
      .mul(0.7)
      .add(smoothstep(-0.3, 0.6, TSL.mx_noise_float(pos.xz.mul(1.7).add(TSL.vec2(3.1, 7.7)))).mul(0.3));
    const edgePatch = pick(swRt.greaterThan(0).and(vDepth.lessThan(0.4)), patchy, TSL.float(1));
    const edgeFoam = bead
      .mul(mix(0.45, 1.1, uprush))
      .mul(mix(0.35, 1, edgePatch))
      .add(trail.mul(mix(0.12, 0.4, uprush)).mul(edgePatch))
      .mul(smoothstep(0, 1, swRt))
      .mul(smoothstep(0.4, -0.2, vDepth));
    // the meniscus: the last decimetre of the advancing sheet bends down to the sand
    const lipW = float1.sub(smoothstep(0, 0.14, frontD)).mul(uprush);
    // wet sand: how far up the last two waves ran (the same reach as the vertex lift)
    const reachP = TSL.max(
      swp.RhMax,
      shoreWaveAmp(M, swp.ms.sub(1), php.along, P).mul(2.1).mul(P.runup).mul(clamp(php.exposure.mul(1.4), 0, 1)).div(BEACH_SLOPE),
    ).mul(P.enabled);
    const wet = smoothstep(reachP.add(1.5), reachP.sub(0.5), swp.inland).toVar();
    // surf-zone water: sand and bubbles make it milky turquoise (`shoreSurfMedium`, ShoreWaves.js L497-505)
    const turb = smoothstep(4.5, 1.2, vDepth)
      .mul(smoothstep(-0.2, 0.15, vDepth))
      .mul(clamp(php.exposure.mul(1.4), 0, 1))
      .mul(SHORE_DEFAULTS.turbidity)
      .mul(P.enabled);
    const medium = { scatter: vec3(0.9, 1, 0.85).mul(turb), absorb: vec3(0.1, 0.2, 0.62).mul(turb) };

    // gusts, slicks and windrows (Ultra, plan task 7)
    const det = this.#detail ? this.#detail.sample(tslShore, vLagXZ) : null;
    const surf = waterSurfaceFragment(fft, vLagXZ, vDepth, vFoam, {
      ripples: this.options.ripples,
      foamTexture: this.#foam,
      foamBias: fft.foamBias,
      shore: { normal: vShoreN, foam: vShoreFoam.add(edgeFoam), face: vSurfMask.x },
      ...(det ? { detail: det } : {}),
    });

    const env = environment;
    this.#env = null;
    const intensity = this.#envIntensity;
    let sky: (dir: AnyNode, roughness: AnyNode | number) => AnyNode;
    let skyIrradiance: AnyNode;
    let horizonColor: AnyNode;
    if (tidewater) {
      sky = (dir, roughness) => tidewater.sampleSpecular(dir, roughness).mul(intensity);
      skyIrradiance = tidewater.sampleDiffuse(vec3(0, 1, 0)).mul(intensity);
      const toCam = normalize(cameraPosition.sub(positionWorld));
      horizonColor = sky(normalize(vec3(toCam.x.negate(), 0.02, toCam.z.negate())), 0.6);
    } else if (env) {
      const nodes: AnyNode[] = [];
      sky = (dir, roughness) => {
        const node: AnyNode = pmremTexture(env, dir, roughness);
        nodes.push(node);
        return node.rgb.mul(intensity);
      };
      skyIrradiance = sky(vec3(0, 1, 0), 1);
      const toCam = normalize(cameraPosition.sub(positionWorld));
      horizonColor = sky(normalize(vec3(toCam.x.negate(), 0.02, toCam.z.negate())), 0.6);
      this.#env = nodes;
    } else {
      sky = (dir) => mix(this.#horizonFallback, this.#skyFallback, clamp(dir.y.mul(2), 0, 1));
      skyIrradiance = this.#skyFallback;
      horizonColor = this.#horizonFallback;
    }

    const camH = cameraPosition.y.sub(this.#level);
    const nearSurface = abs(camH).lessThan(1.5);
    const folded = surf.jacobian.lessThan(0.1);
    // 1 where the surface is seen from below (a float: TSL's select of booleans does not build cleanly)
    const fromBelow = pick(
      nearSurface.and(folded.not()),
      select(frontFacing, TSL.float(0), TSL.float(1)),
      select(camH.lessThan(0), TSL.float(1), TSL.float(0)),
    );

    const color = waterShade({
      position: positionWorld,
      lagXZ: vLagXZ,
      depth: vDepth,
      height: vHeight,
      normal: surf.normal,
      foam: surf.foam,
      jacobian: surf.jacobian,
      footprint: surf.footprint,
      sunDir: this.#sunDir,
      sunColor: this.#sunColor,
      sky,
      skyIrradiance,
      horizonColor,
      seaDepthAt: (xz) => seaDepthAt(xz),
      sceneColor: (uv) => viewportSharedTexture(uv).rgb,
      sceneViewZ: (uv) => perspectiveDepthToViewZ(viewportDepthTexture(uv).x, cameraNear, cameraFar),
      screenUV,
      fromBelow,
      medium,
      aeration: surf.aeration,
      ...(det ? { rough: det.rough } : {}),
      edge: { thickness, frontD, uprush, lipW, wet },
      debug: this.options.debugView,
    });
    const debug = this.options.debugView;
    this.#material.colorNode =
      debug === 'normal'
        ? vec3(surf.normal.x.mul(5).add(0.5), 0, surf.normal.z.mul(5).add(0.5))
        : debug === 'foam'
          ? vec3(surf.foam, surf.coverage, surf.jacobian.mul(0.5))
          : debug === 'height'
            ? vec3(vHeight.mul(0.5).add(0.5), vDepth.mul(0.01), 0)
            : debug === 'depth'
              ? vec3(clamp(vDepth.mul(-0.2), 0, 1), clamp(vDepth.mul(0.2), 0, 1), 0)
            : debug === 'shore'
              ? (() => {
                  const sh = fieldAt(vLagXZ);
                  const exposure = TSL.length(TSL.vec2(sh.y, sh.z));
                  const dir = TSL.vec2(sh.y, sh.z).div(TSL.max(exposure, 1e-4));
                  void dir;
                  const along = TSL.dot(vLagXZ, TSL.vec2(this.#swellDirU.y.negate(), this.#swellDirU.x));
                  const s = shorePhase(tslShore, this.#shoreTime, sh.x, along, this.#period);
                  return vec3(TSL.fract(s), exposure, this.#shoreOn);
                })()
            : debug === 'detail' && det
              ? vec3(det.gust, det.slick, det.streak.mul(3))
            : debug === 'sky'
              ? sky(normalize(vec3(0, 0.2, -1)), 0.1)
              : color;
    this.#material.opacityNode = TSL.float(1);
    this.#material.needsUpdate = true;
  }

  #depthNodes: AnyNode[] = [];

  /**
   * Once per frame before rendering: advance the waves, follow the camera, take the sun and the sky's light.
   */
  update(
    dt: number,
    camera: Camera,
    scene: Scene,
    sun: DirectionalLight,
    fallback?: { sky: number[]; horizon: number[] },
    /** The room's time (ms since 1970): every device in the room shows the same waves. Absent: local steps. */
    roomMs?: number,
  ): void {
    if (this.#disposed || Number.isNaN(this.#levelValue)) return;
    const env = scene.environment ?? null;
    const tidewater: TidewaterEnvironment | null = scene.userData.tidewaterEnvironment ?? null;
    if (tidewater !== this.#tidewaterEnvironment || (env === null) !== (this.#envTexture === null)) this.#build(env, tidewater);
    else if (env && env !== this.#envTexture) {
      this.#envTexture = env;
      for (const node of this.#env ?? []) node.value = env;
    }
    this.#envIntensity.value = scene.environmentIntensity ?? 1;
    if (fallback) {
      this.#skyFallback.value.set(fallback.sky[0] ?? 0.3, fallback.sky[1] ?? 0.4, fallback.sky[2] ?? 0.6);
      this.#horizonFallback.value.set(fallback.horizon[0] ?? 0.6, fallback.horizon[1] ?? 0.7, fallback.horizon[2] ?? 0.8);
    }
    this.#sunVector.copy(sun.position).sub(sun.target.position);
    if (this.#sunVector.lengthSq() < 1e-8) this.#sunVector.set(0, 1, 0);
    this.#sunDir.value.copy(this.#sunVector.normalize());
    this.#sunColor.value.set(sun.color.r, sun.color.g, sun.color.b).multiplyScalar(sun.visible ? sun.intensity : 0);
    // the grid follows the camera in steps of its finest cell, so the vertices near it never slide
    const step = SEA_GRID_FINEST;
    const ox = Math.round(camera.position.x / step) * step;
    const oz = Math.round(camera.position.z / step) * step;
    this.#origin.value.set(ox, oz);
    this.mesh.position.set(ox, 0, oz);
    if (roomMs === undefined) this.fft.update(this.renderer, Math.min(dt, 0.1));
    else this.fft.setTime(this.renderer, seaClock(roomMs));
    this.#localSeaTime += Math.min(dt, 0.1);
    this.#detail?.setTime(roomMs === undefined ? this.#localSeaTime : seaClock(roomMs));
    // the shore waves' clock (room time, wrapped on whole waves) and their fade when a new field arrives
    const period = this.#swell.period;
    this.#shoreTime.value =
      roomMs === undefined
        ? (this.#shoreTime.value + Math.min(dt, 0.1)) % (period * 400)
        : shoreClock(roomMs, period);
    const fade = Math.min(dt, 0.1) / SHORE_FADE_SECONDS;
    const on = this.#shoreOn.value;
    this.#shoreOn.value = this.#shoreTarget > on ? Math.min(1, on + fade) : Math.max(0, on - fade);
    if (this.#shoreOn.value === 0 && this.#pendingField) this.#applyField();
    if (this.#hasField) this.options.groundWetness?.update(this.renderer, Math.min(dt, .1), {
      fieldTexture: this.#field, depthTexture: this.#depth, extent: this.#extentValue,
      level: this.#levelValue, time: this.#shoreTime.value, period: this.#period.value,
      amplitude: this.#amplitude.value, enabled: this.#shoreOn.value, swellDirection: this.swellDirection,
    });
    else this.options.groundWetness?.deactivate();
  }

  /** The CPU shore phase s for a field sample (T, along) at the current shore time (checks; the surf sound later). */
  shorePhaseAt(T: number, along: number): number {
    return shorePhase(cpuShore, cpuShore.c(this.#shoreTime.value), cpuShore.c(T), cpuShore.c(along), cpuShore.c(this.#swell.period)).v;
  }

  dispose(): void {
    this.#disposed = true;
    this.options.groundWetness?.deactivate();
    if (this.#solveTimer) clearTimeout(this.#solveTimer);
    this.#field.dispose();
    this.mesh.geometry.dispose();
    this.#material.dispose();
    this.fft.dispose();
    this.#foam.dispose();
    this.#detail?.dispose();
    this.#depth.dispose();
  }
}

