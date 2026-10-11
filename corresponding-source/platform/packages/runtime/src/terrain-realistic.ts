import {
  MeshStandardNodeMaterial,
  TSL,
  type DataArrayTexture,
  type Node,
  type UniformNode,
} from 'three/webgpu';

type Float = Node<'float'>;
type Vec3 = Node<'vec3'>;

const {
  abs,
  attribute,
  float,
  max,
  mix,
  mx_noise_float,
  normalLocal,
  normalize,
  positionLocal,
  positionWorld,
  pow,
  smoothstep,
  texture,
  transformNormalToView,
  uniform,
  uniformArray,
  vec2,
  vec3,
} = TSL;

/** Slopes turn to rock between these angles (degrees). */
const ROCK_FROM = 35;
const ROCK_FULL = 45;
/** Snow fades in over this many meters above the line, and slides off slopes from 45 to 65 degrees. */
const SNOW_EDGE = 4;
const SNOW_SLIDE = [45, 65] as const;
/** Ground photos are brighter than the ground they show under the sun (tuned live on sand). */
const ALBEDO = 0.8;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (from: number, to: number, value: number) => {
  const t = clamp01((value - from) / (to - from));
  return t * t * (3 - 2 * t);
};

/** Share of rock on a slope (P2-37): none below 35 degrees, all above 45 degrees. */
export function rockShare(slopeDeg: number): number {
  return smooth(ROCK_FROM, ROCK_FULL, slopeDeg);
}

/** Share of snow at a height on a slope; none with the snow line off (null). */
export function snowShare(height: number, line: number | null, slopeDeg: number): number {
  if (line === null) return 0;
  return smooth(line, line + SNOW_EDGE, height) * (1 - smooth(SNOW_SLIDE[0], SNOW_SLIDE[1], slopeDeg));
}

/**
 * The texture layers to load for a place's ground palette (slot to material name), each once, in
 * slot order, then the rock and snow of the slope and height rules; empty slots show slot 0.
 */
export function groundLayers(
  palette: readonly (string | undefined)[],
  rules: { rock: string; snow: string },
): { names: string[]; layerOfSlot: (slot: number) => number; rockLayer: number; snowLayer: number } {
  const names: string[] = [];
  const layerOf = (name: string) => {
    const at = names.indexOf(name);
    if (at >= 0) return at;
    names.push(name);
    return names.length - 1;
  };
  const slots = palette.map((name) => (name ? layerOf(name) : 0));
  const rockLayer = layerOf(rules.rock);
  const snowLayer = layerOf(rules.snow);
  return { names, layerOfSlot: (slot) => slots[slot] ?? 0, rockLayer, snowLayer };
}

/**
 * Per-triangle corners for a non-indexed chunk (P2-37): every vertex of a triangle carries the
 * layers of its three corners and a barycentric weight, so three materials blend across it.
 * `order` lists the source vertex of each output vertex (to copy positions and normals).
 */
export function triangleCorners(
  slots: ArrayLike<number>,
  indices: ArrayLike<number>,
  layerOf: (slot: number) => number,
): { layers: Float32Array; bary: Float32Array; order: Uint32Array } {
  const count = indices.length;
  const layers = new Float32Array(count * 3);
  const bary = new Float32Array(count * 3);
  const order = new Uint32Array(count);
  for (let t = 0; t < count; t += 3) {
    const corners = [indices[t]!, indices[t + 1]!, indices[t + 2]!];
    const cornerLayers = corners.map((vertex) => layerOf(slots[vertex] ?? 0));
    for (let k = 0; k < 3; k += 1) {
      const v = t + k;
      order[v] = corners[k]!;
      layers.set(cornerLayers, v * 3);
      bary[v * 3 + k] = 1;
    }
  }
  return { layers, bary, order };
}

/** Uniforms of the realistic ground material that change without rebuilding it. */
export interface GroundRules {
  snowLine: UniformNode<'float', number>;
  snowOn: UniformNode<'float', number>;
  rockOn: UniformNode<'float', number>;
}

/** Largest number of texture layers: 16 palette slots plus rock and snow. */
export const MAX_GROUND_LAYERS = 18;

/**
 * The Realistic style's ground material (P2-37). Each triangle blends the three corner materials
 * (weights sharpened by each material's brightness, so gravel and rock show between grass instead
 * of a soft smear); steep slopes turn to the rock layer drawn from three sides (no stretching on
 * cliffs); snow covers ground above the snow line; a slow, large color change hides the repeats.
 */
export function realisticGroundMaterial(
  color: DataArrayTexture,
  surface: DataArrayTexture,
  tiles: readonly number[],
  rockLayer: number,
  snowLayer: number,
  proceduralLayers: readonly boolean[] = [],
): { material: MeshStandardNodeMaterial; rules: GroundRules } {
  const rules: GroundRules = {
    snowLine: uniform(60) as UniformNode<'float', number>,
    snowOn: uniform(1) as UniformNode<'float', number>,
    rockOn: uniform(1) as UniformNode<'float', number>,
  };
  const tiles_ = uniformArray([...tiles, ...new Array(MAX_GROUND_LAYERS - tiles.length).fill(3)], 'float');
  // The typings cannot follow a dynamic array element; it is a float.
  const tileOf = (layer: Float) => tiles_.element(layer) as unknown as Float;
  const layers = attribute('groundLayers', 'vec3');
  const bary = attribute('groundBary', 'vec3');
  const p = positionLocal;
  const n = normalLocal;

  const sampleTop = (layer: Float) => {
    const uv = p.xz.div(tileOf(layer));
    return { c: texture(color, uv).depth(layer), s: texture(surface, uv).depth(layer) };
  };
  const a = sampleTop(layers.x as Float);
  const b = sampleTop(layers.y as Float);
  const c = sampleTop(layers.z as Float);
  // Height blend: each corner's weight plus its brightness, keeping only the top of the three.
  const hA = bary.x.add(a.c.g.mul(0.6));
  const hB = bary.y.add(b.c.g.mul(0.6));
  const hC = bary.z.add(c.c.g.mul(0.6));
  // 0.4 keeps a soft band where two materials meet (lower values make jagged grid edges).
  const top = max(max(hA, hB), hC).sub(0.4);
  let wA = max(hA.sub(top), 0);
  let wB = max(hB.sub(top), 0);
  let wC = max(hC.sub(top), 0);
  if (proceduralLayers.some(Boolean)) {
    const legacy = uniformArray([...proceduralLayers.map(value => value ? 0 : 1),
      ...new Array(MAX_GROUND_LAYERS - proceduralLayers.length).fill(1)], 'float');
    const la = legacy.element(layers.x) as unknown as Float;
    const lb = legacy.element(layers.y) as unknown as Float;
    const lc = legacy.element(layers.z) as unknown as Float;
    // Source coverage is mixed by the procedural adapter. Its fallback image must never leak
    // into that transition. Legacy corners alone supply this branch's normalized color/normal.
    const sourceTriangle = la.mul(lb).mul(lc).oneMinus();
    wA = mix(wA, bary.x.mul(la), sourceTriangle);
    wB = mix(wB, bary.y.mul(lb), sourceTriangle);
    wC = mix(wC, bary.z.mul(lc), sourceTriangle);
  }
  const wSum = wA.add(wB).add(wC).max(0.0001);
  const blend = (x: Vec3, y: Vec3, z: Vec3): Vec3 =>
    x.mul(wA).add(y.mul(wB)).add(z.mul(wC)).div(wSum) as Vec3;
  let baseColor: Vec3 = blend(a.c.rgb as Vec3, b.c.rgb as Vec3, c.c.rgb as Vec3);
  let baseSurface: Vec3 = blend(a.s.rgb as Vec3, b.s.rgb as Vec3, c.s.rgb as Vec3);

  // Rock on steep slopes, from three sides.
  const rock = float(rockLayer);
  const rockTile = tileOf(rock);
  const side = pow(abs(n), vec3(4));
  const sideSum = side.x.add(side.y).add(side.z);
  const tri = (map: DataArrayTexture) =>
    texture(map, p.zy.div(rockTile))
      .depth(rock)
      .rgb.mul(side.x)
      .add(texture(map, p.xz.div(rockTile)).depth(rock).rgb.mul(side.y))
      .add(texture(map, p.xy.div(rockTile)).depth(rock).rgb.mul(side.z))
      .div(sideSum);
  // Flat ground has n.y = 1; rock starts below cos(35 degrees) and is complete at cos(45 degrees).
  const slopeRock = smoothstep(
    float(Math.cos((ROCK_FULL * Math.PI) / 180)),
    float(Math.cos((ROCK_FROM * Math.PI) / 180)),
    n.y,
  )
    .oneMinus()
    .mul(rules.rockOn);
  baseColor = mix(baseColor, tri(color) as Vec3, slopeRock) as Vec3;
  baseSurface = mix(baseSurface, tri(surface) as Vec3, slopeRock) as Vec3;

  // Snow above the snow line, sliding off steep slopes.
  const snow = sampleTop(float(snowLayer));
  const snowCover = smoothstep(rules.snowLine, rules.snowLine.add(SNOW_EDGE), p.y)
    .mul(
      smoothstep(
        float(Math.cos((SNOW_SLIDE[1] * Math.PI) / 180)),
        float(Math.cos((SNOW_SLIDE[0] * Math.PI) / 180)),
        n.y,
      ),
    )
    .mul(rules.snowOn);
  baseColor = mix(baseColor, snow.c.rgb as Vec3, snowCover) as Vec3;
  baseSurface = mix(baseSurface, snow.s.rgb as Vec3, snowCover) as Vec3;

  // Large slow color changes so the repeats do not show.
  const variation = mx_noise_float(p.xz.mul(0.015))
    .mul(0.5)
    .add(mx_noise_float(p.xz.mul(0.06)).mul(0.25));
  // Photos of ground are brighter than real ground under sunlight (ALBEDO), plus large slow changes.
  baseColor = baseColor.mul(variation.mul(0.35).add(1)).mul(ALBEDO) as Vec3;

  // Normal map (OpenGL, x along world x, y along world z) around the ground's own normal.
  const tangentNormal = vec2(baseSurface.r, baseSurface.g).mul(2).sub(1);
  const bent = normalize(vec3(n.x.add(tangentNormal.x), n.y, n.z.sub(tangentNormal.y)));

  const material = new MeshStandardNodeMaterial({ metalness: 0 });
  material.colorNode = baseColor;
  // Ground is matte: never shinier than 0.75 (rough maps of grass and soil read too glossy at low angles).
  material.roughnessNode = max(baseSurface.b, 0.75);
  material.normalNode = transformNormalToView(bent);
  return { material, rules };
}

/**
 * The ground beyond the place's edge in Realistic places (P2-37): the place's grass (slot 0) laid
 * flat in world space, with the same large color changes as the ground inside.
 */
export function realisticOuterMaterial(
  color: DataArrayTexture,
  surface: DataArrayTexture,
  tile: number,
  layer: number,
): MeshStandardNodeMaterial {
  const uv = positionWorld.xz.div(tile);
  const c = texture(color, uv).depth(float(layer));
  const s = texture(surface, uv).depth(float(layer));
  const variation = mx_noise_float(positionWorld.xz.mul(0.015))
    .mul(0.5)
    .add(mx_noise_float(positionWorld.xz.mul(0.06)).mul(0.25));
  const material = new MeshStandardNodeMaterial({ metalness: 0 });
  material.colorNode = c.rgb.mul(variation.mul(0.35).add(1)).mul(ALBEDO);
  material.roughnessNode = max(s.b, 0.75);
  return material;
}
