import type { HumanData } from './format.js';

/**
 * The human generator (CHAR-02): mixes the baked shape targets for a style and gender, stands the body on the
 * ground and places the 52 joints from the shaped mesh (each joint is the mean of a fixed set of vertices). Pure
 * code without three.js, so the bake, tests and a worker can all run it.
 */

export const HUMAN_STYLES = ['anime'] as const;
export type HumanStyle = (typeof HUMAN_STYLES)[number];
export const HUMAN_GENDERS = ['boy', 'girl'] as const;
export type HumanGender = (typeof HUMAN_GENDERS)[number];
/** Genders that have a body today (the girl comes next). */
export const READY_GENDERS: readonly HumanGender[] = ['boy'];

/** Target weights per style and gender: macro targets of the base data, then our own style target. */
export const HUMAN_PRESETS: Record<`${HumanStyle}:${HumanGender}`, Readonly<Record<string, number>> | null> = {
  'anime:boy': {
    'macro.male-young': 0.55,
    'macro.male-child': 0.45,
    'macro.male-young-slim': 0.55,
    'macro.male-child-slim': 0.45,
    'style.anime-boy': 1,
  },
  'anime:girl': null,
};

export interface HumanJoint {
  name: string;
  parent: string | null;
  at: [number, number, number];
  bind?: [number, number, number, number];
}

export interface HumanBody {
  /** Drawn vertices, metres, feet at y = 0, facing +z. */
  positions: Float32Array;
  /** Two triangles per quad. */
  triangles: Uint32Array;
  /** The lighter level of detail: two triangles per LOD quad (same vertices), or null when not baked. */
  lodTriangles: Uint32Array | null;
  /** The quads (four ids each), for the editor's quad wireframe and stats. */
  quads: Uint32Array;
  /** Quad edges as degenerate triangles (a, b, b): a wireframe of them draws only the quad edges. */
  quadEdges: Uint32Array;
  skinIndex: Uint16Array;
  /** Four weights per vertex, sum 1. */
  skinWeight: Float32Array;
  /** Region per vertex (0 skin, 1 shorts). */
  region: Float32Array;
  /**
   * Rest joints in the T-pose the clips start from (world-aligned axes). The mesh itself stays in its own A-pose:
   * `bind` turns a joint (the upper arms) from the T-pose into it, as for the warrior body.
   */
  joints: HumanJoint[];
  /** Top of the head above the feet (m). */
  height: number;
  /** Face landmarks on the shaped head (bind pose, same space as `positions`), when asked for. */
  face: Record<string, [number, number, number]>;
  /** Per drawn vertex, where the closed-eye (blink) shape moves it; played on the GPU, never mixed in. */
  blink: Float32Array;
  /** Per drawn vertex, where the open-mouth shape moves it (speech), played on the GPU like the blink. */
  mouthOpen: Float32Array;
  /** Per drawn vertex, how far along its lash strip it sits: 0 at the lid rim, 1 at the tip (0 off the lashes). */
  lash: Float32Array;
  /** Per drawn vertex, 0..1: how much muscle and how much fat can grow there (the editor's anatomy view). */
  muscleMap: Float32Array;
  fatMap: Float32Array;
  /** Per drawn vertex, 1 + the index of the muscle group (contracts `MUSCLE_GROUPS`) or fat region leading it. */
  muscleGroup: Float32Array;
  fatRegion: Float32Array;
}

/**
 * Where muscle and fat grow (owner: see them on the mesh, muscle red and fat yellow), from the baked
 * `map.anatomy` (x muscle, y fat, 0..1; never mixed as a shape). Made once per baked data.
 */
interface AnatomyMaps {
  muscle: Float32Array;
  fat: Float32Array;
  muscleGroup: Float32Array;
  fatRegion: Float32Array;
}
const anatomyMaps = new WeakMap<HumanData, AnatomyMaps>();
function anatomyOf(data: HumanData): AnatomyMaps {
  let maps = anatomyMaps.get(data);
  if (maps) return maps;
  const drawn = data.header.drawn;
  maps = {
    muscle: new Float32Array(drawn),
    fat: new Float32Array(drawn),
    muscleGroup: new Float32Array(drawn),
    fatRegion: new Float32Array(drawn),
  };
  const regions = data.targets.get('map.regions');
  for (let i = 0; i < (regions?.indices.length ?? 0); i += 1) {
    const v = regions!.indices[i]!;
    if (v >= drawn) continue;
    maps.muscleGroup[v] = Math.round(regions!.deltas[i * 3]!);
    maps.fatRegion[v] = Math.round(regions!.deltas[i * 3 + 1]!);
  }
  const target = data.targets.get('map.anatomy');
  for (let i = 0; i < (target?.indices.length ?? 0); i += 1) {
    const v = target!.indices[i]!;
    if (v >= drawn) continue;
    maps.muscle[v] = target!.deltas[i * 3]!;
    maps.fat[v] = target!.deltas[i * 3 + 1]!;
  }
  anatomyMaps.set(data, maps);
  return maps;
}

/**
 * How far along its lash strip each vertex sits (0 root .. 1 tip). Each strip is a grid of quads: its root is the
 * long boundary side nearer the eyeball, and a vertex's row (steps from that side) over the last row is its place.
 * The material keeps only the root rows (the whole strip drawn solid read as a grey band over the lid).
 */
function lashAlong(region: Uint8Array, quads: Uint32Array, mixed: Float32Array, drawn: number): Float32Array {
  const along = new Float32Array(drawn);
  const at = (v: number) => [mixed[v * 3]!, mixed[v * 3 + 1]!, mixed[v * 3 + 2]!] as const;
  for (const side of [1, -1]) {
    const onSide = (v: number, r: number) => region[v] === r && Math.sign(mixed[v * 3]!) === side;
    const eye = [0, 0, 0];
    let eyeCount = 0;
    for (let v = 0; v < drawn; v += 1) {
      if (!onSide(v, 2)) continue;
      at(v).forEach((value, k) => (eye[k] = eye[k]! + value));
      eyeCount += 1;
    }
    if (!eyeCount) continue;
    const fromEye = (v: number) => Math.hypot(...at(v).map((value, k) => value - eye[k]! / eyeCount));
    for (const strip of [3, 4]) {
      const neighbours = new Map<number, Set<number>>();
      const edgeUse = new Map<number, number>();
      const quadUse = new Map<number, number>();
      for (let q = 0; q < quads.length; q += 4) {
        const corners = Array.from(quads.subarray(q, q + 4));
        if (!corners.every((v) => onSide(v, strip))) continue;
        corners.forEach((a, k) => {
          const b = corners[(k + 1) % 4]!;
          quadUse.set(a, (quadUse.get(a) ?? 0) + 1);
          if (!neighbours.has(a)) neighbours.set(a, new Set());
          if (!neighbours.has(b)) neighbours.set(b, new Set());
          neighbours.get(a)!.add(b);
          neighbours.get(b)!.add(a);
          const key = Math.min(a, b) * EDGE_KEY + Math.max(a, b);
          edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1);
        });
      }
      if (!neighbours.size) continue;
      // The boundary loop, split at the four corners (vertices of one quad) into sides.
      const boundary = new Map<number, number[]>();
      for (const [key, uses] of edgeUse) {
        if (uses !== 1) continue;
        const a = Math.floor(key / EDGE_KEY);
        const b = key % EDGE_KEY;
        boundary.set(a, [...(boundary.get(a) ?? []), b]);
        boundary.set(b, [...(boundary.get(b) ?? []), a]);
      }
      const corners = [...boundary.keys()].filter((v) => quadUse.get(v) === 1);
      const sides: number[][] = [];
      for (const start of corners) {
        for (const first of boundary.get(start)!) {
          const path = [start, first];
          while (!corners.includes(path[path.length - 1]!)) {
            const [prev, here] = [path[path.length - 2]!, path[path.length - 1]!];
            path.push(boundary.get(here)!.find((v) => v !== prev)!);
          }
          sides.push(path);
        }
      }
      const mean = (path: number[]) => path.reduce((sum, v) => sum + fromEye(v), 0) / path.length;
      const longest = Math.max(...sides.map((path) => path.length));
      const root = sides.filter((path) => path.length === longest).sort((a, b) => mean(a) - mean(b))[0]!;
      // Rows: steps from the root side through the grid.
      const row = new Map<number, number>(root.map((v) => [v, 0]));
      let wave = [...root];
      while (wave.length) {
        const next: number[] = [];
        for (const v of wave) for (const n of neighbours.get(v)!) if (!row.has(n)) row.set(n, row.get(v)! + 1), next.push(n);
        wave = next;
      }
      const last = Math.max(...row.values()) || 1;
      for (const [v, r] of row) along[v] = r / last;
    }
  }
  return along;
}

/** Mixes targets into a copy of every vertex position (drawn and helper). */
export function mixHuman(data: HumanData, weights: Readonly<Record<string, number>>): Float32Array {
  const out = data.positions.slice();
  for (const [name, weight] of Object.entries(weights)) {
    if (!weight) continue;
    const target = data.targets.get(name);
    if (!target) throw new Error(`Unknown human target ${name}`);
    const { indices, deltas } = target;
    for (let i = 0; i < indices.length; i += 1) {
      const v = indices[i]! * 3;
      out[v] = out[v]! + deltas[i * 3]! * weight;
      out[v + 1] = out[v + 1]! + deltas[i * 3 + 1]! * weight;
      out[v + 2] = out[v + 2]! + deltas[i * 3 + 2]! * weight;
    }
  }
  return out;
}

type Quat = [number, number, number, number];
type Vec = [number, number, number];

/** The rotation turning unit vector `a` into unit vector `b`. */
function between(a: Vec, b: Vec): Quat {
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const c: Vec = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const q: Quat = [c[0], c[1], c[2], 1 + d];
  const n = Math.hypot(...q);
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

/** `v` turned by `q`. */
function rotate(q: Quat, v: Vec): Vec {
  const [x, y, z, w] = q;
  const t: Vec = [2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])];
  return [
    v[0] + w * t[0] + (y * t[2] - z * t[1]),
    v[1] + w * t[1] + (z * t[0] - x * t[2]),
    v[2] + w * t[2] + (x * t[1] - y * t[0]),
  ];
}

const mul = (a: Quat, b: Quat): Quat => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const inverse = (q: Quat): Quat => [-q[0], -q[1], -q[2], q[3]];

/** Arm bones levelled for the T-pose, each aimed along the side's x axis at the next joint. */
const ARM_CHAIN = [
  ['Arm', 'ForeArm'],
  ['ForeArm', 'Hand'],
  ['Hand', 'HandMiddle1'],
] as const;

/**
 * The T-pose of joints fitted in the mesh's A-pose: the upper arm, forearm and hand are turned level along their
 * side's x axis (outer bones first, each carrying its subtree). Each keeps the local turn back into the mesh's pose
 * as its `bind`, so the mesh binds where it is and clips start from the T-pose.
 */
export function tPose(joints: readonly HumanJoint[]): HumanJoint[] {
  const out = joints.map((joint) => ({ ...joint, at: [...joint.at] as Vec }));
  const posed = new Map(joints.map((joint) => [joint.name, joint.at]));
  const byName = new Map(out.map((joint) => [joint.name, joint]));
  for (const side of ['Left', 'Right'] as const) {
    let parentWorld: Quat = [0, 0, 0, 1];
    for (const [bone, next] of ARM_CHAIN) {
      const joint = byName.get(`${side}${bone}`)!;
      const a = posed.get(joint.name)!;
      const b = posed.get(`${side}${next}`)!;
      const dir: Vec = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const length = Math.hypot(...dir);
      const world = between([side === 'Left' ? 1 : -1, 0, 0], [dir[0] / length, dir[1] / length, dir[2] / length]);
      const back = inverse(world);
      const subtree = new Set([joint.name]);
      for (const one of out) if (one.parent && subtree.has(one.parent)) subtree.add(one.name);
      for (const one of out) {
        if (!subtree.has(one.name) || one === joint) continue;
        const p = posed.get(one.name)!;
        const r = rotate(back, [p[0] - a[0], p[1] - a[1], p[2] - a[2]]);
        one.at = [joint.at[0] + r[0], joint.at[1] + r[1], joint.at[2] + r[2]];
      }
      joint.bind = mul(inverse(parentWorld), world).map((value) => Math.round(value * 1e6) / 1e6) as Quat;
      parentWorld = world;
    }
  }
  return out;
}

/** Joint rest positions of mixed vertices (before the ground shift), where the mesh is (its A-pose). */
export function fitJoints(data: HumanData, positions: Float32Array): HumanJoint[] {
  return data.joints.map((joint) => {
    let x = 0;
    let y = 0;
    let z = 0;
    for (const v of joint.vertices) {
      x += positions[v * 3]!;
      y += positions[v * 3 + 1]!;
      z += positions[v * 3 + 2]!;
    }
    const n = Math.max(1, joint.vertices.length);
    return { name: joint.name, parent: joint.parent, at: [x / n, y / n, z / n] };
  });
}

/** Edge keys pack two vertex ids in one number (2^21 > the 100k-quad body's vertex count). */
const EDGE_KEY = 2 ** 21;

const round = (value: number) => Math.round(value * 1e5) / 1e5;

/** A sparse target as one delta per drawn vertex (zeros where it does not move). */
function denseTarget(data: HumanData, name: string, drawn: number): Float32Array {
  const out = new Float32Array(drawn * 3);
  const target = data.targets.get(name);
  if (target)
    target.indices.forEach((v, i) => {
      if (v < drawn) out.set(target.deltas.subarray(i * 3, i * 3 + 3), v * 3);
    });
  return out;
}

/** Builds the body for a style and gender (null when that gender has no body yet). */
export function generateHuman(
  data: HumanData,
  style: HumanStyle = 'anime',
  gender: HumanGender = 'boy',
  landmarks: Readonly<Record<string, readonly number[]>> = {},
  extra: Readonly<Record<string, number>> = {},
): HumanBody | null {
  const preset = HUMAN_PRESETS[`${style}:${gender}`];
  if (!preset) return null;
  return buildHuman(data, mixHuman(data, { ...preset, ...extra }), landmarks);
}

/**
 * Anime Shape (owner + ChatGPT review): how much of each face morph the master slider brings at 1 (eyes, nose,
 * mouth, jaw, lower face, cranium); the slider scales them all.
 */
export const ANIME_SHAPE_MIX: Readonly<Record<string, number>> = {
  'anime.eyes': 0.82,
  'anime.nose': 0.78,
  'anime.mouth': 0.5,
  'anime.jaw': 0.68,
  'anime.lower-face': 0.45,
  'anime.cranium': 0.42,
};

/** The target weights of an Anime Shape value (0..1). */
export const animeShapeWeights = (amount: number): Record<string, number> =>
  Object.fromEntries(Object.entries(ANIME_SHAPE_MIX).map(([name, weight]) => [name, weight * amount]));

/** The muscle groups (contracts `MUSCLE_GROUPS`): the overall muscle grows each of them. */
const MUSCLE_GROUP_KEYS = [
  'neck',
  'shoulders',
  'chest',
  'traps',
  'lats',
  'biceps',
  'triceps',
  'forearms',
  'abs',
  'obliques',
  'waist',
  'lowerBack',
  'hips',
  'glutes',
  'quads',
  'hamstrings',
  'calves',
  'hands',
];

/**
 * Where the overall fat goes with the fat pattern (owner, Stage B; anatomy.md): -1 the upper body (android: belly,
 * waist), +1 the lower body (gynoid: hips, buttocks, thighs). Share of the overall fat added to each region.
 */
export const FAT_PATTERN: Readonly<Record<string, readonly [upper: number, lower: number]>> = {
  belly: [1, 0.3],
  waist: [0.8, 0.4],
  hips: [0.3, 1],
  buttocks: [0.3, 1],
  thighs: [0.3, 1],
  upperArms: [0.5, 0.7],
  forearms: [0.3, 0.3],
  calves: [0.3, 0.5],
  face: [0.5, 0.5],
};
/**
 * Overall fat grows every region in proportion (owner: fat goes everywhere on the body), the pattern then moves
 * more of it up or down: each region gets fat x (BASE + PATTERN_STRENGTH x its pattern share).
 */
const FAT_BASE_SHARE = 1.1;
const PATTERN_STRENGTH = 0.6;
/**
 * Overall muscle and fat at slider 1, as a share of MakeHuman's min-to-max macro difference: on the young/child
 * boy that difference is only ~2.7 cm, too small to see (owner check, 2026-10-05). `zone`: our muscle shapes at
 * slider 1 (x the zone's own height from zones.json, 1.2-3 cm).
 */
export const BUILD_STRENGTH = { muscle: 2, fat: 4.5, zone: 1.2 };

/**
 * The target weights of a body's build (muscle, fat, fat pattern, muscle groups, fat regions, face controls; keys of the contracts'
 * `BUILD_KEYS`): each control mixes its baked `+` or `-` target. The double chin only grows, above fat 0.6.
 */
export function buildWeights(build: Readonly<Record<string, number>> = {}): Record<string, number> {
  const weights: Record<string, number> = {};
  const signed = (target: string, value: number) => {
    const clamped = Math.max(-1, Math.min(1, value));
    if (clamped > 0) weights[`${target}+`] = (weights[`${target}+`] ?? 0) + clamped;
    if (clamped < 0) weights[`${target}-`] = (weights[`${target}-`] ?? 0) - clamped;
  };
  // The overall muscle grows every muscle group (our anatomical shapes) and a little of the whole frame; less
  // muscle is already strong in the data (~5 cm).
  const muscle = Math.max(-1, Math.min(1, build.muscle ?? 0));
  if (muscle > 0) weights['muscle.all+'] = muscle * BUILD_STRENGTH.muscle * 0.4;
  if (muscle < 0) weights['muscle.all-'] = -muscle;
  const groups = new Map<string, number>(MUSCLE_GROUP_KEYS.map((group) => [group, muscle]));
  const fat = Math.max(0, Math.min(0.85, build.fat ?? 0));
  if (fat) weights['fat.all+'] = fat * BUILD_STRENGTH.fat;
  const pattern = Math.max(-1, Math.min(1, build.fatPattern ?? 0));
  const regions = new Map<string, number>();
  for (const [key, value] of Object.entries(build)) {
    if (key.startsWith('muscle.')) groups.set(key.slice(7), (groups.get(key.slice(7)) ?? 0) + value);
    else if (key.startsWith('fat.')) regions.set(key.slice(4), value);
    // Face controls (FACE-01): each mixes its baked `face.<feature>+` or `-` target at full strength.
    else if (key.startsWith('face.')) signed(key, value);
  }
  for (const [group, value] of groups) {
    // The overall muscle and the zone's own slider add up, at most one full muscle either way.
    const amount = Math.max(-1, Math.min(1, value));
    if (amount > 0) weights[`muscle.${group}+`] = amount * BUILD_STRENGTH.zone;
    if (amount < 0) weights[`muscle.${group}-`] = -amount;
  }
  // Definition: the lines between the muscles; more with muscle, lost under fat.
  const definition = Math.max(0, Math.min(1, build.definition ?? 0));
  const shows = definition * (0.5 + Math.max(0, muscle) * 0.5) * (1 - fat / 0.85) ** 1.5;
  if (shows > 0) weights['muscle.definition'] = shows;
  for (const [region, [upper, lower]] of Object.entries(FAT_PATTERN)) {
    const share = pattern < 0 ? -pattern * upper : pattern * lower;
    regions.set(region, (regions.get(region) ?? 0) + fat * (FAT_BASE_SHARE + PATTERN_STRENGTH * share));
  }
  for (const [region, value] of regions) if (region !== 'chin') signed(`fat.${region}`, value);
  const chin = (regions.get('chin') ?? 0) + Math.max(0, fat - 0.6) * 2;
  if (chin > 0) weights['fat.chin+'] = Math.min(1, chin);
  return weights;
}

/** Two triangles per quad (a, b, c) and (a, c, d). */
function quadTriangles(quads: Uint32Array): Uint32Array {
  const triangles = new Uint32Array((quads.length / 4) * 6);
  for (let q = 0; q < quads.length / 4; q += 1) {
    const [a, b, c, d] = [quads[q * 4]!, quads[q * 4 + 1]!, quads[q * 4 + 2]!, quads[q * 4 + 3]!];
    triangles.set([a, b, c, a, c, d], q * 6);
  }
  return triangles;
}

/** The drawn body of mixed positions: on the ground, triangles, quad edges, weights and joints. */
export function buildHuman(
  data: HumanData,
  mixed: Float32Array,
  landmarks: Readonly<Record<string, readonly number[]>> = {},
): HumanBody {
  const drawn = data.header.drawn;
  let floor = Infinity;
  let top = -Infinity;
  for (let v = 0; v < drawn; v += 1) {
    floor = Math.min(floor, mixed[v * 3 + 1]!);
    top = Math.max(top, mixed[v * 3 + 1]!);
  }
  const positions = new Float32Array(drawn * 3);
  for (let v = 0; v < drawn; v += 1) {
    positions[v * 3] = mixed[v * 3]!;
    positions[v * 3 + 1] = mixed[v * 3 + 1]! - floor;
    positions[v * 3 + 2] = mixed[v * 3 + 2]!;
  }
  const joints = tPose(fitJoints(data, mixed)).map((joint) => ({
    ...joint,
    at: [round(joint.at[0]), round(joint.at[1] - floor), round(joint.at[2])] as Vec,
  }));
  const quads = data.quads;
  const count = quads.length / 4;
  const triangles = new Uint32Array(count * 6);
  const edges = new Map<number, [number, number]>();
  for (let q = 0; q < count; q += 1) {
    const [a, b, c, d] = [quads[q * 4]!, quads[q * 4 + 1]!, quads[q * 4 + 2]!, quads[q * 4 + 3]!];
    triangles.set([a, b, c, a, c, d], q * 6);
    for (const [s, e] of [
      [a, b],
      [b, c],
      [c, d],
      [d, a],
    ] as const) {
      if (s === e) continue;
      const key = s < e ? s * EDGE_KEY + e : e * EDGE_KEY + s;
      if (!edges.has(key)) edges.set(key, [s, e]);
    }
  }
  const quadEdges = new Uint32Array(edges.size * 3);
  let at = 0;
  for (const [s, e] of edges.values()) {
    quadEdges[at++] = s;
    quadEdges[at++] = e;
    quadEdges[at++] = e;
  }
  const skinIndex = Uint16Array.from(data.skinIndex);
  const skinWeight = new Float32Array(data.skinWeight.length);
  for (let v = 0; v < drawn; v += 1) {
    let sum = 0;
    for (let k = 0; k < 4; k += 1) sum += data.skinWeight[v * 4 + k]!;
    for (let k = 0; k < 4; k += 1) skinWeight[v * 4 + k] = sum > 0 ? data.skinWeight[v * 4 + k]! / sum : k === 0 ? 1 : 0;
  }
  return {
    positions,
    triangles,
    lodTriangles: data.lodQuads ? quadTriangles(data.lodQuads) : null,
    quads: quads.slice(),
    quadEdges,
    skinIndex,
    skinWeight,
    region: Float32Array.from(data.region),
    joints,
    height: top - floor,
    blink: denseTarget(data, 'face.blink', drawn),
    mouthOpen: denseTarget(data, 'face.mouth-open', drawn),
    lash: lashAlong(data.region, data.quads, mixed, drawn),
    muscleMap: anatomyOf(data).muscle,
    fatMap: anatomyOf(data).fat,
    muscleGroup: anatomyOf(data).muscleGroup,
    fatRegion: anatomyOf(data).fatRegion,
    face: Object.fromEntries(
      Object.entries(landmarks).map(([name, vertices]) => {
        const at: Vec = [0, 0, 0];
        for (const v of vertices) for (let k = 0; k < 3; k += 1) at[k] = at[k]! + mixed[v * 3 + k]! / vertices.length;
        at[1] -= floor;
        return [name, at.map(round) as Vec];
      }),
    ),
  };
}
