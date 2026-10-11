import {
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  Group,
  InstancedMesh,
  MeshStandardNodeMaterial,
  Object3D,
  SRGBColorSpace,
  TextureLoader,
  TSL,
  type Node,
  type Texture,
} from 'three/webgpu';

const {
  attribute,
  cos,
  float,
  floor,
  hash,
  instanceIndex,
  mix,
  mx_noise_float,
  positionLocal,
  positionWorld,
  sin,
  texture,
  time,
  transformNormalToView,
  uniform,
  uv,
  vec2,
  vec3,
} = TSL;

/** Side of one grass patch (meters): patches are made once and dropped when out of range. */
export const GRASS_PATCH = 16;
/** The ground's own grid (meters): grass asks the ground once per cell of it. */
const CELL = 2;
const GRID = GRASS_PATCH / CELL;
/** Steepest ground grass grows on (degrees), like the rock rule of the realistic ground. */
const GRASS_MAX_SLOPE = 35;
/** Grass cards cut from Poly Haven grass_medium_01 (CC0) by tooling/realistic-models/grass-cards.py. */
export const GRASS_CARDS_URL = '/materials/grass/cards.webp';
/** The atlas: 2 columns and 4 rows of 2:1 cells; the first 5 cells hold a clump each. */
const CARD_COLUMNS = 2;
const CARD_ROWS = 4;
const CARD_COUNT = 5;
/** Scales the scanned clump colors to the grass ground's green under the realistic light (tuned live). */
const GRASS_BRIGHTNESS = 1;

/** What the ground says about one spot: is it grass, how steep, and is anything in the way. */
export interface GrassGround {
  /** True where the ground shows a grass material (palette slot of kind grass). */
  isGrass(x: number, z: number): boolean;
  height(x: number, z: number): number;
  /** Slope in degrees. */
  slope(x: number, z: number): number;
  /** True under water, on roads and walls, and above the snow line. */
  blocked(x: number, z: number): boolean;
}

/** Share of grass that grows at a spot (0 none, 1 all), P2-38. */
export function grassShare(ground: GrassGround, x: number, z: number): number {
  if (!ground.isGrass(x, z) || ground.blocked(x, z)) return 0;
  const slope = ground.slope(x, z);
  if (slope >= GRASS_MAX_SLOPE) return 0;
  return slope > GRASS_MAX_SLOPE - 10 ? (GRASS_MAX_SLOPE - slope) / 10 : 1;
}

/** Grass cards per square meter at a distance: full near the camera, thinning to none at the edge. */
export function grassDensity(distance: number, radius: number, perSquareMeter: number): number {
  if (distance >= radius) return 0;
  const t = distance / radius;
  return perSquareMeter * (t < 0.4 ? 1 : 1 - (t - 0.4) / 0.6);
}

/** A seeded random generator, so every player sees the same grass. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One grass card: two crossed upright quads, 1 m wide and 0.5 m tall (the atlas cells are 2:1),
 * each in two rows so the wind bends it smoothly (8 triangles). The attribute `plane` tells the
 * shader which quad a vertex belongs to, so the two quads show different clumps.
 */
function cardGeometry(): BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const planes: number[] = [];
  const index: number[] = [];
  for (let plane = 0; plane < 2; plane += 1) {
    const dx = plane === 0 ? 1 : 0;
    const dz = 1 - dx;
    const first = positions.length / 3;
    for (const v of [0, 0.5, 1])
      for (const u of [0, 1]) {
        positions.push((u - 0.5) * dx, v * 0.5, (u - 0.5) * dz);
        uvs.push(u, v);
        planes.push(plane);
      }
    for (const row of [0, 2]) {
      const a = first + row;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const normals = new Float32Array(positions.length);
  for (let i = 1; i < normals.length; i += 3) normals[i] = 1; // lit like the ground under it
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  geometry.setAttribute('plane', new BufferAttribute(new Float32Array(planes), 1));
  geometry.setIndex(index);
  return geometry;
}

/** A clear 1x1 picture shown until the cards load (nothing is drawn meanwhile). */
function emptyTexture(): DataTexture {
  const empty = new DataTexture(new Uint8Array(4), 1, 1);
  empty.needsUpdate = true;
  return empty;
}

/**
 * Grass that grows by itself on grass ground in Realistic places (P2-38): patches of instanced
 * grass cards (real clumps cut from a scanned texture, alpha-tested) around the camera, swaying in
 * the wind (TSL), sparser with distance.
 */
export class GrassView {
  readonly group = new Group();
  readonly #geometry = cardGeometry();
  readonly #material: MeshStandardNodeMaterial;
  readonly #empty = emptyTexture();
  /** The atlas node; its picture is swapped in once the cards load. */
  readonly #cards: { value: Texture };
  #loaded: Texture | undefined;
  #disposed = false;
  readonly #patches = new Map<string, InstancedMesh>();
  /**
   * Dropped patch meshes kept for the next patch: a new mesh makes the renderer prepare its
   * shaders again (tens of ms each), which stuttered a fast-flying camera (SCROLL-01).
   */
  readonly #spare: InstancedMesh[] = [];
  /** Most patches grown per frame; the rest follow on the next frames, nearest first. */
  #growBudget = Number.POSITIVE_INFINITY;
  readonly #dummy = new Object3D();
  readonly #wind = uniform(1);
  #radius = 50;
  #perSquareMeter = 4;
  #center = '';

  /** `cardsUrl` is the atlas; without it (tests) the cards stay clear. */
  constructor(
    private readonly ground: GrassGround,
    cardsUrl?: string,
  ) {
    this.group.name = 'grass';
    const along = uv().y;
    // Wind: the upper card bends, more at the top, in slow gusts that travel across the field.
    // Each card has its own phase (a hash of its index), so the field never moves in lockstep.
    const phase = hash(instanceIndex).mul(6.283);
    const gust = sin(time.mul(1.3).add(phase))
      .mul(0.6)
      .add(sin(time.mul(0.37).add(phase.mul(0.5))).mul(0.4));
    const bend = along.mul(along).mul(gust).mul(0.12).mul(this.#wind);
    const material = new MeshStandardNodeMaterial({ metalness: 0, roughness: 1 });
    // Added to the card's placed position, whichever order three applies its instance transform in.
    material.positionNode = positionLocal.add(
      vec3(bend.mul(cos(float(0.6))), float(0), bend.mul(sin(float(0.6)))),
    );
    // Each quad shows one of the clumps: picked by the card's hash, the second quad two cells on.
    const cell = floor(hash(instanceIndex.add(7)).mul(CARD_COUNT))
      .add(attribute('plane', 'float').mul(2))
      .mod(CARD_COUNT);
    const column = cell.mod(CARD_COLUMNS);
    const row = floor(cell.div(CARD_COLUMNS));
    // The picture is flipped on load: v runs up from its bottom, while rows count from its top.
    // A texel of inset keeps the row below from bleeding in at the root.
    const inset = 1 / 512;
    const atlasUv = vec2(
      column.add(uv().x).div(CARD_COLUMNS),
      float(1 - 1 / CARD_ROWS + inset)
        .sub(row.div(CARD_ROWS))
        .add(along.mul(1 / CARD_ROWS - inset)),
    );
    const cards = texture(this.#empty, atlasUv);
    this.#cards = cards;
    // Darker near the root (the clump shades itself) and large slow color changes like the ground.
    const tint = mx_noise_float(positionWorld.xz.mul(0.03)).mul(0.25).add(1);
    const shade = mix(float(0.6), float(1), along).mul(tint).mul(GRASS_BRIGHTNESS);
    material.colorNode = cards.rgb.mul(shade) as Node<'vec3'>;
    material.opacityNode = cards.a;
    material.alphaTest = 0.45;
    material.side = 2; // DoubleSide
    // Lit like the ground under it from both sides: without this the back faces flip the normal
    // downwards and turn black.
    material.normalNode = transformNormalToView(vec3(0, 1, 0));
    this.#material = material;
    if (cardsUrl) void this.#load(cardsUrl);
  }

  async #load(url: string): Promise<void> {
    try {
      const loaded = await new TextureLoader().loadAsync(url);
      if (this.#disposed) {
        loaded.dispose();
        return;
      }
      loaded.colorSpace = SRGBColorSpace;
      loaded.anisotropy = 4;
      this.#loaded = loaded;
      this.#cards.value = loaded;
    } catch (error) {
      console.warn('Grass cards did not load:', error);
    }
  }

  /** How far grass grows and how dense it is (quality and the place's density setting). */
  setDensity(radius: number, perSquareMeter: number, wind = 1): void {
    if (radius === this.#radius && perSquareMeter === this.#perSquareMeter) return;
    this.#radius = radius;
    this.#perSquareMeter = perSquareMeter;
    this.#wind.value = wind;
    this.clear();
    // Spare meshes are sized for the old density.
    for (const mesh of this.#spare.splice(0)) mesh.dispose();
  }

  /** Grow at most this many patches per frame (a fast camera spreads the work over frames). */
  setGrowBudget(patchesPerFrame: number): void {
    this.#growBudget = Math.max(1, patchesPerFrame);
  }

  /** Drops every patch (the ground changed); they grow again around the camera. */
  clear(): void {
    for (const key of [...this.#patches.keys()]) this.#drop(key);
    this.#center = '';
  }

  /** Call every frame with the camera position (cheap while it stays in the same patch). */
  update(x: number, z: number): void {
    const cx = Math.floor(x / GRASS_PATCH);
    const cz = Math.floor(z / GRASS_PATCH);
    const key = `${cx},${cz}`;
    if (key === this.#center) return;
    const reach = Math.ceil(this.#radius / GRASS_PATCH);
    const wanted = new Set<string>();
    const missing: { patch: string; px: number; pz: number; density: number; distance: number }[] = [];
    for (let pz = cz - reach; pz <= cz + reach; pz += 1)
      for (let px = cx - reach; px <= cx + reach; px += 1) {
        const mx = (px + 0.5) * GRASS_PATCH;
        const mz = (pz + 0.5) * GRASS_PATCH;
        const distance = Math.max(0, Math.hypot(mx - x, mz - z) - GRASS_PATCH * 0.7);
        const density = grassDensity(distance, this.#radius, this.#perSquareMeter);
        if (density <= 0) continue;
        const patch = `${px},${pz},${Math.round(density * 4)}`;
        wanted.add(patch);
        if (!this.#patches.has(patch)) missing.push({ patch, px, pz, density, distance });
      }
    // Drop first, so the dropped meshes can carry the new patches.
    for (const patch of [...this.#patches.keys()]) if (!wanted.has(patch)) this.#drop(patch);
    missing.sort((a, b) => a.distance - b.distance);
    const grow = missing.slice(0, this.#growBudget);
    for (const { patch, px, pz, density } of grow) this.#grow(patch, px, pz, density);
    // Done for this patch only when nothing is left; otherwise the next frame goes on.
    this.#center = grow.length === missing.length ? key : '';
  }

  #grow(key: string, px: number, pz: number, density: number): void {
    const count = Math.round(density * GRASS_PATCH * GRASS_PATCH);
    const random = seeded((px * 73856093) ^ (pz * 19349663));
    const mesh = this.#spareFor(count) ?? new InstancedMesh(this.#geometry, this.#material, this.#capacity(count));
    // The ground is asked once per 2 m cell (its own grid), not once per card: a patch holds up to
    // a thousand cards and the questions cost more than the drawing on a flying camera.
    const x0 = px * GRASS_PATCH;
    const z0 = pz * GRASS_PATCH;
    const heights = new Float32Array((GRID + 1) * (GRID + 1));
    for (let j = 0; j <= GRID; j += 1)
      for (let i = 0; i <= GRID; i += 1) heights[j * (GRID + 1) + i] = this.ground.height(x0 + i * CELL, z0 + j * CELL);
    const shares = new Float32Array(GRID * GRID);
    for (let j = 0; j < GRID; j += 1)
      for (let i = 0; i < GRID; i += 1) shares[j * GRID + i] = grassShare(this.ground, x0 + (i + 0.5) * CELL, z0 + (j + 0.5) * CELL);
    let n = 0;
    for (let i = 0; i < count; i += 1) {
      const fx = random() * GRID;
      const fz = random() * GRID;
      const size = 0.45 + random() * 0.4;
      const turn = random() * Math.PI * 2;
      const ci = Math.min(GRID - 1, Math.floor(fx));
      const cj = Math.min(GRID - 1, Math.floor(fz));
      if (random() >= shares[cj * GRID + ci]!) continue;
      const u = fx - ci;
      const v = fz - cj;
      const at = (a: number, b: number) => heights[(cj + b) * (GRID + 1) + ci + a]!;
      const y = (at(0, 0) * (1 - u) + at(1, 0) * u) * (1 - v) + (at(0, 1) * (1 - u) + at(1, 1) * u) * v;
      this.#dummy.position.set(x0 + fx * CELL, y - 0.03, z0 + fz * CELL);
      this.#dummy.rotation.set(0, turn, 0);
      this.#dummy.scale.setScalar(size);
      this.#dummy.updateMatrix();
      mesh.setMatrixAt(n, this.#dummy.matrix);
      n += 1;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    // Keep the empty patch cached, but do not submit it to node/shadow rendering.
    // A zero instance count alone still lets the renderer prepare its pipelines.
    mesh.visible = n > 0;
    mesh.name = `grass:${key}`;
    mesh.frustumCulled = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    this.#patches.set(key, mesh);
    this.group.add(mesh);
  }

  #drop(key: string): void {
    const mesh = this.#patches.get(key);
    if (!mesh) return;
    this.group.remove(mesh);
    this.#patches.delete(key);
    this.#spare.push(mesh);
  }

  /** Room for the densest patch, so any spare mesh can carry any patch. */
  #capacity(count: number): number {
    return Math.max(count, Math.ceil(this.#perSquareMeter * GRASS_PATCH * GRASS_PATCH));
  }

  #spareFor(count: number): InstancedMesh | undefined {
    const index = this.#spare.findIndex((mesh) => mesh.instanceMatrix.count >= count);
    return index < 0 ? undefined : this.#spare.splice(index, 1)[0];
  }

  get patchCount(): number {
    return this.#patches.size;
  }

  dispose(): void {
    this.#disposed = true;
    this.clear();
    for (const mesh of this.#spare.splice(0)) mesh.dispose();
    this.#geometry.dispose();
    this.#material.dispose();
    this.#empty.dispose();
    this.#loaded?.dispose();
  }
}
