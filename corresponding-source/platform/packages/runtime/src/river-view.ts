import type { River, WorldDocument } from '@genvr/contracts';
import { riverProfiles, type RiverProfile, type RiverSample } from '@genvr/world';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardNodeMaterial,
  Points,
  PointsNodeMaterial,
  type Texture,
  TSL,
} from 'three/webgpu';
import { ABSORB } from './water-view.js';

const {
  attribute,
  clamp,
  cos,
  exp,
  float,
  fract,
  hash,
  materialColor,
  mix,
  normalize,
  positionLocal,
  screenUV,
  sin,
  smoothstep,
  texture,
  time,
  transformNormalToView,
  uniform,
  vec2,
  vec3,
  vertexIndex,
  viewportSharedTexture,
} = TSL;

/**
 * Rivers in the runtime (P2-39). A river is drawn as one ribbon that follows its derived profile,
 * so it steps down the slope as a single sheet of water and a steep stretch becomes a waterfall by
 * itself, with no separate geometry. Rivers never get the planar mirror (the budget goes to the sea
 * and the largest lake), so they are free to bend what lies under them.
 */

/** Points across the river, from bank to bank. */
const ACROSS = 6;
/** How much of the flow a swimmer or a floating item takes on. Below 1 because a body in water is
 * dragged along, not welded to it: on calm water this leaves a swimmer able to work upstream. */
export const FLOW_DRAG = 0.3;
/** Spray specks at the foot of each waterfall stretch, before the graphics setting scales it. */
const SPRAY_PER_FALL = 80;
/** How long one speck of spray lives, in seconds. */
const SPRAY_LIFE = 1.1;

/** Sideways direction of the river at a sample, pointing left of the flow. */
function across(samples: readonly RiverSample[], i: number): [number, number] {
  const previous = samples[Math.max(0, i - 1)]!;
  const next = samples[Math.min(samples.length - 1, i + 1)]!;
  const dx = next.x - previous.x;
  const dz = next.z - previous.z;
  const length = Math.hypot(dx, dz) || 1;
  return [-dz / length, dx / length];
}

/** How much white water a stretch shows: calm almost none, rapids plenty, a waterfall all of it. */
function foamOf(sample: RiverSample): number {
  if (sample.kind === 'waterfall') return 1;
  if (sample.kind === 'rapids') return Math.min(0.85, 0.25 + sample.slope * 3);
  return Math.min(0.2, sample.slope * 1.5);
}

/**
 * The ribbon: a strip of quads along the centerline, its vertices at the water surface. Each one
 * carries how deep the water is beneath it, how much foam belongs there, and how far along the
 * river it sits, so the shader can scroll the flow lines downstream.
 */
export function riverGeometry(samples: readonly RiverSample[]): BufferGeometry {
  const rows = samples.length;
  const count = rows * (ACROSS + 1);
  const positions = new Float32Array(count * 3);
  const depths = new Float32Array(count);
  const foams = new Float32Array(count);
  const alongs = new Float32Array(count);

  for (let i = 0; i < rows; i += 1) {
    const sample = samples[i]!;
    const [px, pz] = across(samples, i);
    const depth = sample.surface - sample.bed;
    const foam = foamOf(sample);
    for (let j = 0; j <= ACROSS; j += 1) {
      const t = (j / ACROSS) * 2 - 1; // -1 at one bank, +1 at the other
      const offset = (t * sample.width) / 2;
      const at = i * (ACROSS + 1) + j;
      positions[at * 3] = sample.x + px * offset;
      positions[at * 3 + 1] = sample.surface;
      positions[at * 3 + 2] = sample.z + pz * offset;
      // Deepest in the middle, running out to nothing at the banks, like the carved bed.
      depths[at] = depth * Math.max(0, 1 - t * t);
      // Foam gathers along the banks as well as on the fast stretches.
      foams[at] = Math.min(1, foam + Math.max(0, Math.abs(t) - 0.75) * 1.6);
      alongs[at] = sample.distance;
    }
  }

  const indices: number[] = [];
  for (let i = 0; i < rows - 1; i += 1)
    for (let j = 0; j < ACROSS; j += 1) {
      const a = i * (ACROSS + 1) + j;
      const b = a + 1;
      const c = a + (ACROSS + 1);
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('depth', new BufferAttribute(depths, 1));
  geometry.setAttribute('foam', new BufferAttribute(foams, 1));
  geometry.setAttribute('along', new BufferAttribute(alongs, 1));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

/** Where the spray of every waterfall in a river lands, and how wide each fall is. */
export function sprayPoints(
  samples: readonly RiverSample[],
): Array<{ x: number; y: number; z: number; width: number }> {
  const falls: Array<{ x: number; y: number; z: number; width: number }> = [];
  let inFall = false;
  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i]!;
    if (sample.kind === 'waterfall') {
      inFall = true;
      continue;
    }
    // The first calm sample after a fall is the pool it lands in.
    if (inFall) {
      falls.push({ x: sample.x, y: sample.surface, z: sample.z, width: sample.width });
      inFall = false;
    }
  }
  return falls;
}

/** The river's own material: clear water that bends what is under it, with foam running downstream. */
function riverMaterial(clarity: { value: number }, caustics: Texture, refraction: boolean) {
  const material = new MeshStandardNodeMaterial({ transparent: true, roughness: 0.1 });
  const clarityUniform = uniform(clarity.value);
  const depth = attribute('depth', 'float');
  const foamAt = attribute('foam', 'float');
  const along = attribute('along', 'float');

  // Small ripples, leaning the normal so light travels over the surface.
  const ripple = sin(along.mul(2.1).sub(time.mul(3)))
    .mul(0.06)
    .add(sin(along.mul(5.3).sub(time.mul(4.4))).mul(0.03));
  const normalWorld = normalize(vec3(ripple, 1, ripple.mul(0.4)));
  material.normalNode = transformNormalToView(normalWorld);

  const swallow = float(1).div(clarityUniform);
  const transmit = vec3(
    exp(depth.mul(-2 * ABSORB.r).mul(swallow)),
    exp(depth.mul(-2 * ABSORB.g).mul(swallow)),
    exp(depth.mul(-2 * ABSORB.b).mul(swallow)),
  );

  // Light patterns on the bed, the same picture the lakes use, fading in with a little depth.
  const worldXZ = vec2(positionLocal.x, positionLocal.z);
  const caustic = texture(caustics, worldXZ.div(11).add(time.mul(0.021)))
    .r.mul(texture(caustics, worldXZ.div(7.5).sub(time.mul(-0.015))).r)
    .mul(1.1)
    .mul(smoothstep(0, 0.35, depth));

  // Flow lines: bands of white that travel downstream, faster where the water is faster.
  const streaks = sin(along.mul(1.7).sub(time.mul(2.6)))
    .mul(0.5)
    .add(0.5);
  const foam = clamp(foamAt.mul(streaks.mul(0.6).add(0.55)), 0, 1);

  let water;
  let alpha;
  if (refraction) {
    const bend = vec2(normalWorld.x, normalWorld.z)
      .mul(0.04)
      .mul(clamp(depth, 0, 1));
    const behind = viewportSharedTexture(screenUV.add(bend)).rgb;
    water = behind
      .add(caustic)
      .mul(transmit)
      .add(materialColor.mul(float(1).sub(transmit)));
    alpha = float(1);
  } else {
    water = materialColor.mul(transmit).add(caustic.mul(transmit));
    alpha = float(1).sub(exp(depth.negate().mul(swallow).mul(0.9)));
  }
  material.colorNode = mix(water, vec3(0.97, 0.99, 1), foam);
  material.opacityNode = clamp(alpha.add(foam), 0, 1);
  return { material, clarityUniform };
}

/** Specks of spray thrown up where a waterfall lands. */
function sprayMaterial(): PointsNodeMaterial {
  const material = new PointsNodeMaterial({ transparent: true, depthWrite: false });
  material.blending = AdditiveBlending;
  // Each speck runs its own loop from the pool upward and out, then starts again.
  const seed = hash(vertexIndex);
  const life = fract(time.div(SPRAY_LIFE).add(seed));
  const angle = seed.mul(6.283);
  const reach = hash(vertexIndex.add(11)).mul(0.8).add(0.3);
  const rise = life.mul(float(1).sub(life)).mul(4);
  material.positionNode = positionLocal.add(
    vec3(cos(angle).mul(reach).mul(life), rise, sin(angle).mul(reach).mul(life)),
  );
  material.colorNode = vec3(0.95, 0.98, 1);
  // Bright when thrown up, gone by the time it falls back.
  material.opacityNode = float(1).sub(life).mul(0.5);
  material.size = 6;
  return material;
}

interface BuiltRiver {
  signature: string;
  mesh: Mesh;
  material: MeshStandardNodeMaterial;
  spray: Points | null;
  profile: RiverProfile;
}

/** Draws a place's rivers and keeps their profiles for the current in the water. */
export class RiverView {
  readonly group = new Group();
  readonly #built = new Map<string, BuiltRiver>();
  readonly #color = new Color();
  readonly #clarity = { value: 9 };
  #profiles: RiverProfile[] = [];
  #refraction = true;
  #spray = SPRAY_PER_FALL;
  #caustics: Texture;

  constructor(
    private readonly heightAt: (x: number, z: number) => number,
    color: number,
    caustics: Texture,
  ) {
    this.group.name = 'rivers';
    this.#color.set(color);
    this.#caustics = caustics;
  }

  /** The profiles behind the drawn rivers, for `riverFlowAt`. */
  get profiles(): readonly RiverProfile[] {
    return this.#profiles;
  }

  setLook(color: number): void {
    this.#color.set(color);
    for (const built of this.#built.values()) built.material.color.copy(this.#color);
  }

  setClarity(meters: number, doc: WorldDocument): void {
    const value = Math.max(0.5, meters);
    if (this.#clarity.value === value) return;
    this.#clarity.value = value;
    this.#rebuild(doc);
  }

  /** How many specks each waterfall throws up (the graphics setting, P2-39). */
  setSpray(count: number, doc: WorldDocument): void {
    const specks = Math.max(0, Math.round(count));
    if (this.#spray === specks) return;
    this.#spray = specks;
    this.#rebuild(doc);
  }

  /** Rivers refract unless the device cannot afford it (the same switch the lakes use). */
  setRefraction(on: boolean, doc: WorldDocument): void {
    if (this.#refraction === on) return;
    this.#refraction = on;
    this.#rebuild(doc);
  }

  /** The real caustics picture, once it has loaded. */
  setCaustics(texture: Texture, doc: WorldDocument): void {
    this.#caustics = texture;
    this.#rebuild(doc);
  }

  sync(doc: WorldDocument): void {
    const rivers: readonly River[] = doc.environment.rivers;
    this.#profiles = riverProfiles(
      { heightAt: this.heightAt },
      rivers,
      doc.environment.water,
      doc.environment.sea?.level ?? null,
    );
    const wanted = new Set<string>();
    for (const profile of this.#profiles) {
      wanted.add(profile.id);
      const river = rivers.find((r) => r.id === profile.id)!;
      const signature = `${this.#refraction}:${this.#spray}:${this.#clarity.value}:${JSON.stringify(river)}:${profile.samples.length}`;
      if (this.#built.get(profile.id)?.signature === signature) continue;
      this.#remove(profile.id);
      const built = this.#build(profile, signature);
      if (built) this.#built.set(profile.id, built);
    }
    for (const id of [...this.#built.keys()]) if (!wanted.has(id)) this.#remove(id);
  }

  /** The ground changed: the profiles follow the new terrain, so everything is drawn again. */
  groundChanged(doc: WorldDocument): void {
    this.#rebuild(doc);
  }

  #rebuild(doc: WorldDocument): void {
    for (const id of [...this.#built.keys()]) this.#remove(id);
    this.sync(doc);
  }

  #build(profile: RiverProfile, signature: string): BuiltRiver | null {
    if (profile.samples.length < 2) return null;
    const { material } = riverMaterial(this.#clarity, this.#caustics, this.#refraction);
    material.color.copy(this.#color);
    const mesh = new Mesh(riverGeometry(profile.samples), material);
    mesh.name = `river:${profile.id}`;
    mesh.receiveShadow = true;
    this.group.add(mesh);

    // Spray at the foot of every waterfall along this river.
    const falls = sprayPoints(profile.samples);
    let spray: Points | null = null;
    if (falls.length > 0 && this.#spray > 0) {
      const positions = new Float32Array(falls.length * this.#spray * 3);
      let at = 0;
      for (const fall of falls)
        for (let i = 0; i < this.#spray; i += 1) {
          const t = (i / this.#spray) * 2 - 1;
          positions[at * 3] = fall.x + t * fall.width * 0.35;
          positions[at * 3 + 1] = fall.y + 0.1;
          positions[at * 3 + 2] = fall.z + t * fall.width * 0.2;
          at += 1;
        }
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(positions, 3));
      geometry.computeBoundingSphere();
      spray = new Points(geometry, sprayMaterial());
      spray.name = `river-spray:${profile.id}`;
      this.group.add(spray);
    }
    return { signature, mesh, material, spray, profile };
  }

  #remove(id: string): void {
    const built = this.#built.get(id);
    if (!built) return;
    this.group.remove(built.mesh);
    built.mesh.geometry.dispose();
    built.material.dispose();
    if (built.spray) {
      this.group.remove(built.spray);
      built.spray.geometry.dispose();
      (built.spray.material as PointsNodeMaterial).dispose();
    }
    this.#built.delete(id);
  }

  dispose(): void {
    for (const id of [...this.#built.keys()]) this.#remove(id);
    this.#profiles = [];
  }
}
