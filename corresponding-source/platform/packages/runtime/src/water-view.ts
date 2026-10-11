import { GroundWetness } from './ocean/ground-wetness.js';
import type { WaterBody, WorldDocument } from '@genvr/contracts';
import { wakeNodes, type WakeField } from './water-wake.js';
import { TidewaterSea } from './ocean/tidewater-sea.js';
import { swellFromSetting } from './ocean/sea-clock.js';
import { shoreFieldFromHeights } from './ocean/shore-field-worker.js';
import type { SurfGround, SurfShore } from './ocean/surf-sound.js';

/**
 * Cells per side of the shore field solved for the surf sound alone (Tidewater plan task 6), when the sea is not
 * the Tidewater sea (phones, WebGL2, graphics 1-6): the timing needs no finer grid, and the solve stays small.
 */
export const SOUND_SHORE_RES = 256;
import {
  type Camera,
  type DirectionalLight,
  type Scene,
  type WebGPURenderer,
  BufferAttribute,
  BufferGeometry,
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  Group,
  LinearFilter,
  Mesh,
  MeshStandardNodeMaterial,
  type Node,
  type Object3D,
  RedFormat,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
  TSL,
  UnsignedByteType,
} from 'three/webgpu';

const {
  cameraViewMatrix,
  clamp,
  cos,
  dot,
  exp,
  float,
  materialColor,
  materialOpacity,
  max,
  mix,
  normalize,
  positionLocal,
  positionViewDirection,
  positionWorld,
  pow,
  reflector,
  screenUV,
  sin,
  smoothstep,
  texture,
  time,
  uniform,
  vec2,
  vec3,
  vec4,
  viewportSharedTexture,
} = TSL;

/**
 * Waves (P2-02, P2-39). Each one: direction (x, z), wave number (per meter), speed (per second),
 * height (m), and steepness (how much it pinches its crests sideways). At low quality only their
 * slope bends the normal, as it always did; from quality 4 the surface really moves with them
 * (Gerstner: each vertex swings in a small circle, which sharpens crests and flattens troughs).
 */
const WAVES = [
  { dx: 1, dz: 0.3, k: 0.9, speed: 1.1, height: 0.13, steepness: 0.8 },
  { dx: -0.4, dz: 1, k: 1.7, speed: 1.6, height: 0.05, steepness: 0.6 },
  { dx: 0.7, dz: -0.7, k: 3.1, speed: 2.3, height: 0.02, steepness: 0.4 },
  { dx: -0.9, dz: -0.2, k: 5.3, speed: 3.1, height: 0.012, steepness: 0.3 },
] as const;

/** Depths up to this many meters are stored (deeper water looks the same). */
export const MAX_STORED_DEPTH = 8;
/** Largest depth map side: big seas get coarser cells, never more than this. */
const MAX_CELLS = 256;
/** Largest number of grid cells along one side of a water surface. */
const MAX_GRID_SIDE = 192;
/** Waves fade out over the last meters before the shore, so they never poke through a beach. */
const WAVE_FADE_DEPTH = 1.5;
/** Foam shows where the water is shallower than this (m), along the shore. */
const FOAM = 0.15;
/** Seconds for one run of the foam up the beach and back. */
const SWASH_SECONDS = 7;
/** How far up the beach the foam line runs (m of depth). */
const SWASH = 0.06;
/** Water bodies that mirror the world at most (each one renders the scene once more). */
export const MAX_REFLECTING_BODIES = 2;

/**
 * How strongly each color is swallowed per meter of water. Red goes first and blue-green lasts,
 * which is why clear water turns deep blue-green rather than grey as it gets deeper.
 */
export const ABSORB = { r: 0.46, g: 0.09, b: 0.06 } as const;
/** Meters one can see down into the water by default (the World tab's clarity setting). */
export const DEFAULT_CLARITY = 9;

/** The tiling caustics picture (`tooling/realistic-models/caustics.py`). */
export const CAUSTICS_URL = '/materials/water/caustics.webp';
/** Shared with rivers, which read the same picture at the same world scale. */
/** Meters one tile of the caustics picture covers, for the two layers laid over each other. */
const CAUSTIC_TILE = [11, 7.5] as const;
/** How fast each caustics layer drifts (tiles per second), in opposite directions. */
const CAUSTIC_DRIFT = [0.021, -0.015] as const;
/** How bright the light patterns on the bed are once the two layers are multiplied. */
const CAUSTIC_STRENGTH = 1.1;
/** Caustics fade in over the first meters of water, so dry ground never gets speckled. */
const CAUSTIC_FADE_DEPTH = 0.35;
/** How far the waves bend what is seen under the water, as a share of the screen. */
const REFRACT = 0.045;

/** The part of a water body the depth map and the surface need. */
export type WaterShape = Pick<WaterBody, 'level' | 'area'>;

/** How much of the water a device draws (P2-39); filled from the graphics setting. */
export interface WaterQuality {
  /** Surface vertices per meter; more means finer waves. */
  grid: number;
  /** Gerstner waves that really move the surface; 0 keeps the flat normal-map look. */
  waves: number;
  /** Bend what is seen under the water. Costs no extra pass: it reads the drawn scene. */
  refraction: boolean;
  /** Light patterns on the bed. */
  caustics: boolean;
  /** How many bodies mirror the world; each one costs a whole pass over the scene. */
  reflect: number;
  /**
   * The sea: today's Gerstner surface, or Tidewater's FFT deep sea (WebGPU High/Ultra only, plan task 2). Lakes
   * and rivers never change. Absent means Gerstner.
   */
  ocean?: 'gerstner' | 'tidewater';
  /** FFT cascades, camera grid cells per side and near ripples of the Tidewater sea. */
  oceanCascades?: number;
  oceanGrid?: number;
  oceanRipples?: boolean;
  /** Gusts, slicks and windrows on the Tidewater sea (Ultra, plan task 7). */
  oceanDetail?: boolean;
  /** A debug view of the Tidewater sea (`?oceanDebug=normal|foam|depth|...`), for checks only. */
  oceanDebug?: string;
}

export const DEFAULT_WATER_QUALITY: WaterQuality = {
  grid: 0.5,
  waves: 2,
  refraction: true,
  caustics: true,
  reflect: MAX_REFLECTING_BODIES,
};

/** How deep a water body is over the ground, sampled on a grid over its area. */
export interface WaterDepthMap {
  minX: number;
  minZ: number;
  sizeX: number;
  sizeZ: number;
  width: number;
  height: number;
  /** Depth per cell, 0-255 for 0 to MAX_STORED_DEPTH meters (0 where the ground is above). */
  data: Uint8Array;
}

/** How much ground a polygon covers, in square meters (shoelace). */
export function polygonArea(area: ReadonlyArray<readonly [number, number]>): number {
  let twice = 0;
  for (let i = 0, j = area.length - 1; i < area.length; j = i, i += 1) {
    const [xi, zi] = area[i]!;
    const [xj, zj] = area[j]!;
    twice += xj * zi - xi * zj;
  }
  return Math.abs(twice) / 2;
}

/** Bounding box of a polygon on the ground plane. */
function bounds(area: ReadonlyArray<readonly [number, number]>) {
  const xs = area.map(([x]) => x);
  const zs = area.map(([, z]) => z);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}

/** Ray casting point-in-polygon on the ground plane (x, z). */
function inside(x: number, z: number, area: ReadonlyArray<readonly [number, number]>): boolean {
  let hit = false;
  for (let i = 0, j = area.length - 1; i < area.length; j = i, i += 1) {
    const [xi, zi] = area[i]!;
    const [xj, zj] = area[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
}

/**
 * Samples a water body's depth (its level minus the ground) at about one meter per cell, fewer
 * cells for big seas. The shader reads it for the depth color, the shore foam, and for calming
 * the waves in the shallows.
 */
export function bakeWaterDepth(body: WaterShape, heightAt: (x: number, z: number) => number): WaterDepthMap {
  const box = bounds(body.area);
  const minX = box.minX;
  const minZ = box.minZ;
  const sizeX = Math.max(1, box.maxX - minX);
  const sizeZ = Math.max(1, box.maxZ - minZ);
  const width = Math.min(MAX_CELLS, Math.max(2, Math.ceil(sizeX) + 1));
  const height = Math.min(MAX_CELLS, Math.max(2, Math.ceil(sizeZ) + 1));
  const data = new Uint8Array(width * height);
  for (let j = 0; j < height; j += 1)
    for (let i = 0; i < width; i += 1) {
      const x = minX + (i / (width - 1)) * sizeX;
      const z = minZ + (j / (height - 1)) * sizeZ;
      const depth = body.level - heightAt(x, z);
      data[j * width + i] = Math.round(Math.min(1, Math.max(0, depth / MAX_STORED_DEPTH)) * 255);
    }
  return { minX, minZ, sizeX, sizeZ, width, height, data };
}

/**
 * Height of the waves at a point, in meters, at a moment. The same sum the shader uses, so a
 * floating item bobs with the water it sits on. Every device works it out for itself from the
 * clock: nothing about the waves is sent over the network (owner choice: play uses the flat
 * level with a light bob on top).
 */
export function waveHeightAt(x: number, z: number, seconds: number, waves: number = WAVES.length): number {
  let height = 0;
  for (let i = 0; i < Math.min(waves, WAVES.length); i += 1) {
    const wave = WAVES[i]!;
    const length = Math.hypot(wave.dx, wave.dz);
    const phase = ((x * wave.dx + z * wave.dz) / length) * wave.k - seconds * wave.speed;
    height += Math.sin(phase) * wave.height;
  }
  return height;
}

/**
 * A grid over the water's area, in the mesh's own plane (local x is world x, local y is world -z,
 * local z is world up so the waves lift the surface along it). Only the cells that touch the
 * polygon are kept, plus the ring around them so the water still reaches the shore.
 */
export function waterGridGeometry(
  area: ReadonlyArray<readonly [number, number]>,
  verticesPerMeter: number,
): BufferGeometry {
  const box = bounds(area);
  const sizeX = Math.max(1, box.maxX - box.minX);
  const sizeZ = Math.max(1, box.maxZ - box.minZ);
  const cellsX = Math.min(MAX_GRID_SIDE, Math.max(1, Math.round(sizeX * verticesPerMeter)));
  const cellsZ = Math.min(MAX_GRID_SIDE, Math.max(1, Math.round(sizeZ * verticesPerMeter)));
  const stepX = sizeX / cellsX;
  const stepZ = sizeZ / cellsZ;

  const positions = new Float32Array((cellsX + 1) * (cellsZ + 1) * 3);
  const isInside: boolean[] = [];
  for (let j = 0; j <= cellsZ; j += 1)
    for (let i = 0; i <= cellsX; i += 1) {
      const x = box.minX + i * stepX;
      const z = box.minZ + j * stepZ;
      const at = (j * (cellsX + 1) + i) * 3;
      positions[at] = x;
      positions[at + 1] = -z;
      positions[at + 2] = 0;
      isInside.push(inside(x, z, area));
    }

  const indices: number[] = [];
  const corner = (i: number, j: number) => j * (cellsX + 1) + i;
  for (let j = 0; j < cellsZ; j += 1)
    for (let i = 0; i < cellsX; i += 1) {
      const a = corner(i, j);
      const b = corner(i + 1, j);
      const c = corner(i + 1, j + 1);
      const d = corner(i, j + 1);
      // One corner inside is enough: the cell then covers the shore rather than stopping short.
      if (!isInside[a] && !isInside[b] && !isInside[c] && !isInside[d]) continue;
      // Local y is world -z, so this winding faces world up.
      indices.push(a, c, b, a, d, c);
    }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * The water material of one body: moving waves that calm down in the shallows, clear water that
 * goes deep blue-green as the light is swallowed, a foam line that runs up the beach and back,
 * and, with `reflect`, the world mirrored in it (a planar reflection at half resolution).
 */
function waterMaterial(
  map: WaterDepthMap,
  depthTexture: DataTexture,
  reflect: boolean,
  quality: WaterQuality,
  clarity: { value: number },
  causticsTexture: Texture,
  waveScale: number,
  wake: WakeField | null,
): {
  material: MeshStandardNodeMaterial;
  mirror: Object3D | null;
  /** The caustics samplers, so the real picture can be dropped in when it finishes loading. */
  caustics: Array<{ value: Texture }>;
} {
  const material = new MeshStandardNodeMaterial({ transparent: true, roughness: 0.12 });
  const clarityUniform = uniform(clarity.value);

  // The geometry holds world coordinates: local x is world x and local y is world -z.
  const worldX = positionLocal.x;
  const worldZ = positionLocal.y.negate();
  const depthUv = vec2(worldX.sub(map.minX).div(map.sizeX), worldZ.sub(map.minZ).div(map.sizeZ));
  const depthAt = texture(depthTexture, depthUv).r.mul(MAX_STORED_DEPTH);
  // Waves die away as the water gets shallow, so the sea never pokes through the beach.
  const calm = smoothstep(0, WAVE_FADE_DEPTH, depthAt);

  const used = WAVES.slice(0, Math.max(0, Math.min(quality.waves, WAVES.length)));
  const shaped = (quality.waves > 0 ? used : WAVES.slice(0, 3)).map((wave) => {
    const length = Math.hypot(wave.dx, wave.dz);
    const [dx, dz] = [wave.dx / length, wave.dz / length];
    const phase = worldX.mul(dx).add(worldZ.mul(dz)).mul(wave.k).sub(time.mul(wave.speed));
    const slope = cos(phase)
      .mul(wave.height * wave.k * waveScale)
      .mul(calm);
    return {
      wave,
      dx,
      dz,
      phase,
      slopeX: slope.mul(dx),
      slopeZ: slope.mul(dz),
      crest: sin(phase)
        .mul(wave.height * waveScale)
        .mul(calm),
      swing: cos(phase)
        .mul(wave.height * wave.steepness * waveScale)
        .mul(calm),
    };
  });
  const first = shaped[0]!;
  const rest = shaped.slice(1);
  const slopeX = rest.reduce((total, s) => total.add(s.slopeX), first.slopeX);
  const slopeZ = rest.reduce((total, s) => total.add(s.slopeZ), first.slopeZ);
  const crest = rest.reduce((total, s) => total.add(s.crest), first.crest);

  // What swims in the water leaves rings on it (owner request, 2026-09-28). They lift the surface
  // and whiten it at the body; the V behind a swimmer is the envelope of the rings themselves.
  const swimmer = wake ? wakeNodes(wake, worldX, worldZ) : null;

  // The surface really moves: each vertex rises with the crest and swings sideways into it.
  if (quality.waves > 0) {
    const swingX = rest.reduce((total, s) => total.add(s.swing.mul(s.dx)), first.swing.mul(first.dx));
    const swingZ = rest.reduce((total, s) => total.add(s.swing.mul(s.dz)), first.swing.mul(first.dz));
    const rise = swimmer ? crest.add(swimmer.lift) : crest;
    material.positionNode = positionLocal.add(vec3(swingX, swingZ.negate(), rise));
  }

  // The normal leans against the waves' slope, so light and sky glint travel over the water.
  const normalWorld = normalize(vec3(slopeX.negate(), 1, slopeZ.negate()));
  const normalView = normalize(cameraViewMatrix.mul(vec4(normalWorld, 0)).xyz);
  material.normalNode = normalView;

  // Depth under this pixel (m), read again in world space so the color follows the moved surface.
  const pixelUv = vec2(
    positionWorld.x.sub(map.minX).div(map.sizeX),
    positionWorld.z.sub(map.minZ).div(map.sizeZ),
  );
  const depth = texture(depthTexture, pixelUv).r.mul(MAX_STORED_DEPTH);

  // Clear water: what is left of the light after it has crossed the depth twice, color by color.
  const swallow = float(1).div(clarityUniform);
  const transmit = vec3(
    exp(depth.mul(-2 * ABSORB.r).mul(swallow)),
    exp(depth.mul(-2 * ABSORB.g).mul(swallow)),
    exp(depth.mul(-2 * ABSORB.b).mul(swallow)),
  );
  // How much the water itself covers what lies under it: clear in the shallows, solid when deep.
  const cover = float(1).sub(exp(depth.negate().mul(swallow).mul(0.9)));

  // The foam line wobbles with the waves and runs up the beach and back over SWASH_SECONDS.
  const lap = sin(time.mul(1.4).add(positionWorld.x.add(positionWorld.z).mul(0.7))).mul(0.04);
  const swash = sin(time.mul((Math.PI * 2) / SWASH_SECONDS)).mul(SWASH);
  // Moving lines of foam, so gentle shores get lapping bands rather than a solid white rim.
  const bands = sin(depth.mul(45).sub(time.mul(2.2)))
    .mul(0.35)
    .add(0.65);
  const shoreFoam = float(1)
    .sub(smoothstep(FOAM * 0.2, FOAM, depth.add(lap).add(swash)))
    .mul(bands)
    .mul(0.75);
  // White water at a swimmer joins the foam along the shore.
  const foam = swimmer ? max(shoreFoam, swimmer.foam) : shoreFoam;

  // Light patterns on the bed: two layers of the same tiling picture drifting apart, multiplied
  // so their veins cross and flicker the way they do in a pool. They are added to the water's
  // color, so the scene's own light dims them at night without any extra plumbing.
  const causticNodes: Array<{ value: Texture }> = [];
  let caustic: Node<'float'> = float(0);
  if (quality.caustics) {
    const worldXZ = vec2(positionWorld.x, positionWorld.z);
    const first = texture(causticsTexture, worldXZ.div(CAUSTIC_TILE[0]).add(time.mul(CAUSTIC_DRIFT[0])));
    const second = texture(causticsTexture, worldXZ.div(CAUSTIC_TILE[1]).sub(time.mul(CAUSTIC_DRIFT[1])));
    causticNodes.push(first as unknown as { value: Texture }, second as unknown as { value: Texture });
    // Nothing outside the water: at no depth the surface is invisible, and light patterns there
    // would speckle the dry shore.
    caustic = first.r
      .mul(second.r)
      .mul(CAUSTIC_STRENGTH)
      .mul(smoothstep(0, CAUSTIC_FADE_DEPTH, depth));
  }

  let water: Node<'vec3'>;
  let alpha: Node<'float'>;
  // A surface either mirrors the world or bends what lies under it, never both: the mirror pass
  // renders the scene again at half size, which resizes the shared screen picture the refraction
  // reads, and WebGPU then refuses the frame ("destroyed texture used in a submit"). Reflection
  // wins on the big bodies, where a low view angle shows mostly sky anyway; everything else
  // refracts. Both keep the clear water, which comes from the extinction, not from either effect.
  if (quality.refraction && !reflect) {
    // The scene behind the water is already drawn, so it can be read back and shifted by the
    // waves. No second pass: the water simply looks at the picture under it, bent. The shift
    // fades out in the shallows, or the shore would wobble where the water is a finger deep.
    const bend = normalWorld.xz.mul(REFRACT).mul(clamp(depth, 0, 1));
    const behind = viewportSharedTexture(screenUV.add(bend)).rgb;
    // What comes back up: the bed dimmed color by color, the caustics on it, and the water's own
    // color standing in for the light that never made it through.
    water = behind
      .add(caustic)
      .mul(transmit)
      .add(materialColor.mul(float(1).sub(transmit)));
    // The blend is done here, so the surface covers what it draws over.
    alpha = float(1);
  } else {
    // Phones: no reading back the screen. The old blend, with the water tinted by what survives.
    water = materialColor.mul(transmit).add(caustic.mul(transmit));
    alpha = cover.mul(materialOpacity);
  }
  water = water.mul(crest.mul(1.2).add(1));

  let mirror: Object3D | null = null;
  if (reflect) {
    const mirrored = reflector({ resolutionScale: 0.5 });
    mirrored.uvNode = mirrored.uvNode!.add(normalWorld.xz.mul(0.04));
    mirror = mirrored.target;
    // Fresnel: little reflection looking straight down, much looking across the water.
    const facing = max(dot(normalView, positionViewDirection), 0);
    const reflectance = pow(float(1).sub(facing), 4).mul(0.75).add(0.08);
    water = mix(water, mirrored.rgb, reflectance);
  }
  material.colorNode = mix(water, vec3(0.96, 0.98, 1), foam);
  material.opacityNode = clamp(max(alpha, foam), 0, 1);
  return { material, mirror, caustics: causticNodes };
}

interface BuiltWater {
  signature: string;
  mesh: Mesh;
  material: MeshStandardNodeMaterial;
  depth: DataTexture;
  body: WaterShape;
  caustics: Array<{ value: Texture }>;
}

/** A single black pixel: caustics look like nothing until the real picture has loaded. */
function blankTexture(): DataTexture {
  const blank = new DataTexture(new Uint8Array([0]), 1, 1, RedFormat, UnsignedByteType);
  blank.needsUpdate = true;
  return blank;
}

/** Renders the world's water bodies and rebuilds only those that changed. */
export class WaterView {
  readonly group = new Group();
  readonly #built = new Map<string, BuiltWater>();
  readonly #color = new Color();
  #opacity: number;
  #reflections = false;
  #quality: WaterQuality = { ...DEFAULT_WATER_QUALITY };
  readonly #clarity = { value: DEFAULT_CLARITY };
  #waveScale = 1;
  #wake: WakeField | null = null;
  readonly #blank = blankTexture();
  #caustics: Texture | null = null;
  #causticsLoad: Promise<Texture | null> | null = null;
  #disposed = false;
  /** The WebGPU renderer, when the Tidewater sea may run (it needs compute). */
  #renderer: WebGPURenderer | null = null;
  #tidewater: TidewaterSea | null = null;
  #tidewaterKey = '';
  #groundWetness: GroundWetness | null = null;
  /** Stable provider survives sea quality switches; WaterView owns final disposal. */
  get groundWetness(): GroundWetness { return this.#groundWetness ??= new GroundWetness(); }
  /** Set once the Tidewater sea failed: the Gerstner sea stays for the rest of the session. */
  #tidewaterFailed = false;

  constructor(
    private readonly heightAt: (x: number, z: number) => number,
    color: number,
    opacity = 0.82,
    /** How far the sea reaches from the middle of the place (the outer ground's edge). */
    private readonly seaExtent = 0,
  ) {
    this.group.name = 'water';
    this.#color.set(color);
    this.#opacity = opacity;
    this.#causticsLoad = this.#loadCaustics();
    void this.#causticsLoad;
  }

  /**
   * Lets the sea use Tidewater's FFT ocean when the quality asks for it. Only a renderer on the WebGPU backend
   * is kept: WebGL2 has no compute, so it keeps today's sea whatever the quality says.
   */
  setRenderer(renderer: WebGPURenderer | null, doc: WorldDocument): void {
    const webgpu = (renderer?.backend as { isWebGPUBackend?: boolean } | undefined)?.isWebGPUBackend === true;
    const next = webgpu ? renderer : null;
    if (next === this.#renderer) return;
    this.#renderer = next;
    this.#rebuild(doc);
  }

  /** True while the sea is drawn by the Tidewater FFT ocean. */
  get tidewaterSea(): TidewaterSea | null {
    return this.#tidewater;
  }

  /** Whether the sea is handed to the Tidewater ocean: asked for by the quality, WebGPU, and no earlier failure. */
  #wantsTidewater(doc: WorldDocument): boolean {
    return (
      this.#quality.ocean === 'tidewater' &&
      this.#renderer !== null &&
      !this.#tidewaterFailed &&
      Boolean(doc.environment.sea) &&
      this.seaExtent > 0
    );
  }

  /** Builds, updates or removes the Tidewater sea; on any error it logs once and the Gerstner sea comes back. */
  #syncTidewater(doc: WorldDocument): boolean {
    if (!this.#wantsTidewater(doc)) {
      this.#dropTidewater();
      return false;
    }
    const q = this.#quality;
    const key = `${q.oceanCascades ?? 4}:${q.oceanGrid ?? 512}:${q.oceanRipples ? 1 : 0}:${q.oceanDetail ? 1 : 0}:${q.oceanDebug ?? ''}`;
    try {
      if (!this.#tidewater || this.#tidewaterKey !== key) {
        this.#dropTidewater();
        this.#tidewater = new TidewaterSea(this.#renderer!, this.heightAt, {
          groundWetness: this.groundWetness,
          cascades: q.oceanCascades ?? 4,
          gridCells: q.oceanGrid ?? 512,
          ripples: q.oceanRipples ?? false,
          detail: q.oceanDetail ?? false,
          ...(q.oceanDebug ? { debugView: q.oceanDebug } : {}),
        });
        this.#tidewaterKey = key;
        this.group.add(this.#tidewater.mesh);
      }
      this.#tidewater.sync(
        doc.environment.sea!.level,
        this.seaExtent,
        this.#scene,
        swellFromSetting(doc.environment.sea!.swell),
      );
      return true;
    } catch (error) {
      console.warn('Tidewater sea failed, keeping the Gerstner sea:', error);
      this.#tidewaterFailed = true;
      this.#dropTidewater();
      return false;
    }
  }

  #dropTidewater(): void {
    if (!this.#tidewater) return;
    this.group.remove(this.#tidewater.mesh);
    this.#tidewater.dispose();
    this.#tidewater = null;
    this.#tidewaterKey = '';
  }

  #scene: Scene | null = null;

  /**
   * Once per frame before rendering: the Tidewater sea's FFT, camera grid and light (nothing for Gerstner), at the
   * room's time when given (plan task 3).
   */
  update(dt: number, camera: Camera, scene: Scene, sun: DirectionalLight, roomMs?: number): void {
    this.#scene = scene;
    this.#tidewater?.update(dt, camera, scene, sun, undefined, roomMs);
  }

  /** The caustics picture in use now: the blank one until the real one has arrived. */
  get causticsTexture(): Texture {
    return this.#caustics ?? this.#blank;
  }

  /** Settles with the real caustics picture once it loads, or null if it never does. */
  whenCausticsReady(): Promise<Texture | null> {
    return this.#causticsLoad ?? Promise.resolve(null);
  }

  /** Fetches the tiling caustics picture once and hands it to every surface already built. */
  async #loadCaustics(): Promise<Texture | null> {
    try {
      const loaded = await new TextureLoader().loadAsync(CAUSTICS_URL);
      if (this.#disposed) {
        loaded.dispose();
        return null;
      }
      loaded.colorSpace = SRGBColorSpace;
      loaded.wrapS = RepeatWrapping;
      loaded.wrapT = RepeatWrapping;
      loaded.anisotropy = 4;
      this.#caustics = loaded;
      for (const built of this.#built.values()) for (const node of built.caustics) node.value = loaded;
      return loaded;
    } catch (error) {
      console.warn('Water caustics did not load:', error);
      return null;
    }
  }

  /** The style's water color and opacity (set_style). */
  setLook(color: number, opacity: number): void {
    this.#color.set(color);
    this.#opacity = opacity;
    for (const built of this.#built.values()) {
      built.material.color.copy(this.#color);
      built.material.opacity = opacity;
    }
  }

  /** How many meters one can see down into the water (World tab, P2-39). */
  setClarity(meters: number, doc: WorldDocument): void {
    const value = Math.max(0.5, meters);
    if (this.#clarity.value === value) return;
    this.#clarity.value = value;
    this.#rebuild(doc);
  }

  /** The rings swimmers leave, shared with the rivers (owner request, 2026-09-28). */
  setWake(wake: WakeField | null, doc: WorldDocument): void {
    if (this.#wake === wake) return;
    this.#wake = wake;
    this.#rebuild(doc);
  }

  /**
   * How rough the surface is (the World tab, P2-39). Calm and rough scale the wave heights; how
   * many waves there are stays with the graphics setting, because that is what costs.
   */
  setWaves(waves: 'calm' | 'normal' | 'rough', doc: WorldDocument): void {
    const scale = waves === 'calm' ? 0.4 : waves === 'rough' ? 1.8 : 1;
    if (this.#waveScale === scale) return;
    this.#waveScale = scale;
    this.#rebuild(doc);
  }

  /** Surface detail and how many waves really move it (the graphics setting, P2-39). */
  setQuality(quality: WaterQuality, doc: WorldDocument): void {
    const same =
      this.#quality.grid === quality.grid &&
      this.#quality.waves === quality.waves &&
      this.#quality.refraction === quality.refraction &&
      this.#quality.caustics === quality.caustics &&
      this.#quality.reflect === quality.reflect &&
      (this.#quality.ocean ?? 'gerstner') === (quality.ocean ?? 'gerstner') &&
      this.#quality.oceanCascades === quality.oceanCascades &&
      this.#quality.oceanGrid === quality.oceanGrid &&
      this.#quality.oceanRipples === quality.oceanRipples &&
      this.#quality.oceanDetail === quality.oceanDetail &&
      this.#quality.oceanDebug === quality.oceanDebug;
    if (same) return;
    this.#quality = { ...quality };
    this.#rebuild(doc);
  }

  /**
   * Mirrors the world in the water (high graphics quality on computers): the first
   * MAX_REFLECTING_BODIES water bodies get a planar reflection.
   */
  setReflections(on: boolean, doc: WorldDocument): void {
    if (this.#reflections === on) return;
    this.#reflections = on;
    this.#rebuild(doc);
  }

  /**
   * Every surface to draw: the place's lakes and ponds, and the sea as one square covering the
   * place and the outer ground, so it needs no drawn shape of its own (owner choice, P2-39).
   */
  #shapes(doc: WorldDocument, withSea = true): Array<{ id: string; body: WaterShape }> {
    // Biggest first: only two bodies can mirror the world, and they are worth the most on the
    // widest water. The sea goes ahead of them all.
    const list = doc.environment.water
      .map((body) => ({ id: body.id, body: body as WaterShape }))
      .sort((a, b) => polygonArea(b.body.area) - polygonArea(a.body.area));
    const sea = doc.environment.sea;
    if (withSea && sea && this.seaExtent > 0) {
      const e = this.seaExtent;
      list.unshift({
        id: 'sea',
        body: {
          level: sea.level,
          area: [
            [-e, -e],
            [e, -e],
            [e, e],
            [-e, e],
          ],
        },
      });
    }
    return list;
  }

  sync(doc: WorldDocument): void {
    const wanted = new Set<string>();
    // The sea goes to Tidewater's FFT ocean on WebGPU High/Ultra; everything else is drawn as before.
    const tidewater = this.#syncTidewater(doc);
    this.#lastDoc = doc;
    this.#syncSound(doc, tidewater);
    for (const [index, { id, body }] of this.#shapes(doc, !tidewater).entries()) {
      wanted.add(id);
      const reflect = index < this.#reflectingBodies();
      const q = this.#quality;
      const signature = `${reflect}:${q.grid}:${q.waves}:${q.refraction}:${q.caustics}:${this.#clarity.value}:${this.#waveScale}:${this.#wake ? 'wake' : 'flat'}:${JSON.stringify(body)}`;
      if (this.#built.get(id)?.signature === signature) continue;
      this.#remove(id);
      this.#built.set(id, this.#build(body, id, signature, reflect));
    }
    for (const id of [...this.#built.keys()]) if (!wanted.has(id)) this.#remove(id);
  }

  /** How many bodies mirror the world: never more than the budget, none when they are off. */
  #reflectingBodies(): number {
    if (!this.#reflections) return 0;
    return Math.max(0, Math.min(this.#quality.reflect, MAX_REFLECTING_BODIES));
  }

  #rebuild(doc: WorldDocument): void {
    for (const id of [...this.#built.keys()]) this.#remove(id);
    this.sync(doc);
  }

  /**
   * The ground changed inside these areas (terrain edits): water over them measures its depth
   * again, so shores and foam follow sculpting.
   */
  groundChanged(areas: ReadonlyArray<{ minX: number; minZ: number; maxX: number; maxZ: number }>): void {
    if (areas.length > 0) this.#tidewater?.groundChanged();
    // the sound's own field follows terrain edits after a quiet second, like the Tidewater sea's
    if (areas.length > 0 && this.#soundKey && this.#lastDoc) this.#solveSoundShore(this.#lastDoc, 1000);
    for (const built of this.#built.values()) {
      const map = bounds(built.body.area);
      if (
        !areas.some(
          (area) =>
            area.maxX >= map.minX && area.minX <= map.maxX && area.maxZ >= map.minZ && area.minZ <= map.maxZ,
        )
      )
        continue;
      const next = bakeWaterDepth(built.body, this.heightAt);
      (built.depth.image.data as Uint8Array).set(next.data);
      built.depth.needsUpdate = true;
    }
  }

  #build(body: WaterShape, id: string, signature: string, reflect: boolean): BuiltWater {
    const map = bakeWaterDepth(body, this.heightAt);
    const depth = new DataTexture(map.data, map.width, map.height, RedFormat, UnsignedByteType);
    depth.magFilter = LinearFilter;
    depth.minFilter = LinearFilter;
    depth.wrapS = ClampToEdgeWrapping;
    depth.wrapT = ClampToEdgeWrapping;
    depth.needsUpdate = true;
    const { material, mirror, caustics } = waterMaterial(
      map,
      depth,
      reflect,
      this.#quality,
      this.#clarity,
      this.#caustics ?? this.#blank,
      this.#waveScale,
      this.#wake,
    );
    material.color.copy(this.#color);
    material.opacity = this.#opacity;
    const mesh = new Mesh(waterGridGeometry(body.area, this.#quality.grid), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = body.level + 0.02;
    mesh.receiveShadow = true;
    mesh.name = `water:${id}`;
    // The mirror plane follows the water's surface (the mesh's local z is the world's up).
    if (mirror) mesh.add(mirror);
    this.group.add(mesh);
    return { signature, mesh, material, depth, body, caustics };
  }

  #remove(id: string): void {
    const built = this.#built.get(id);
    if (!built) return;
    this.group.remove(built.mesh);
    built.mesh.geometry.dispose();
    built.material.dispose();
    built.depth.dispose();
    this.#built.delete(id);
  }

  // ---- the surf sound's shore (Tidewater plan task 6)
  #ground: SurfGround | null = null;
  #soundShore: SurfShore | null = null;
  #soundKey = '';
  #soundToken = 0;
  #soundTimer: ReturnType<typeof setTimeout> | null = null;

  /** The ground and sea level for the surf sound, null without a sea. */
  surfGround(): SurfGround | null {
    return this.#ground;
  }

  /**
   * The shore the surf sound listens to: the Tidewater sea's own field (the sound follows the waves drawn), else
   * a field solved for the sound alone, so every device hears the same waves. Null until a field is solved.
   */
  surfShore(): SurfShore | null {
    if (this.#tidewater) return this.#tidewater.surfShore;
    return this.#soundShore;
  }

  #syncSound(doc: WorldDocument, tidewater: boolean): void {
    const sea = doc.environment.sea;
    if (!sea || this.seaExtent <= 0) {
      this.#ground = null;
      this.#dropSoundShore();
      return;
    }
    if (this.#ground?.level !== sea.level) this.#ground = { heightAt: this.heightAt, level: sea.level };
    if (tidewater) {
      this.#dropSoundShore();
      return;
    }
    const key = `${sea.level}:${this.seaExtent}:${JSON.stringify(sea.swell ?? null)}`;
    if (key === this.#soundKey) return;
    this.#soundKey = key;
    this.#solveSoundShore(doc, 0);
  }

  #solveSoundShore(doc: WorldDocument, delay: number): void {
    const sea = doc.environment.sea;
    if (!sea) return;
    if (this.#soundTimer) clearTimeout(this.#soundTimer);
    const token = (this.#soundToken += 1);
    const swell = swellFromSetting(sea.swell);
    this.#soundTimer = setTimeout(() => {
      this.#soundTimer = null;
      shoreFieldFromHeights({
        heightAt: this.heightAt,
        level: sea.level,
        extent: this.seaExtent,
        res: SOUND_SHORE_RES,
        swellDir: swell.direction,
      }).then(
        (field) => {
          if (this.#disposed || token !== this.#soundToken) return;
          this.#soundShore = {
            field,
            heightAt: this.heightAt,
            level: sea.level,
            swellDir: field.swellDir,
            period: swell.period,
            amplitude: swell.amplitude,
          };
        },
        (error: unknown) => console.warn('Shore field for the surf sound failed:', error),
      );
    }, delay);
  }

  #dropSoundShore(): void {
    if (this.#soundTimer) clearTimeout(this.#soundTimer);
    this.#soundTimer = null;
    this.#soundToken += 1;
    this.#soundShore = null;
    this.#soundKey = '';
  }

  #lastDoc: WorldDocument | null = null;

  dispose(): void {
    this.#disposed = true;
    this.#dropSoundShore();
    this.#dropTidewater();
    for (const id of [...this.#built.keys()]) this.#remove(id);
    this.#caustics?.dispose();
    this.#blank.dispose();
    this.#groundWetness?.dispose();
  }
}
