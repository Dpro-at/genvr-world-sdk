import type { BufferGeometry } from 'three/webgpu';
import { SeaMesh, mixColor, scaleColor, type Vec3 } from './mesh.js';
import { SHELL_COLORS, SHELL_KINDS, SHELL_TONES, type ShellKind, type ShellTone } from './palettes.js';
import { choiceParam, hash3, numberParam, seeded, smoothstep, type Seeded } from './random.js';

/**
 * Sea shells (SEALIFE-01): cowrie, conch, scallop and a small spiral snail, each lying on sand. Own procedural
 * code. Static (no motion).
 *
 * - Cowrie: a glossy closed dome, flattened underneath, with dense dark spots drawn by the material.
 * - Conch and snail: a tube swept along a logarithmic helico-spiral (radius r = r1 * e^(b (theta - theta1)), axial
 *   drop proportional to r, tube radius proportional to r), so every whorl is the same shape grown by a fixed
 *   ratio. The conch has shoulder knobs and a flared lip and lies on its side; the snail has a low spire and
 *   spiral bands. The aperture is open: its inside shows the back-side colour (pink in a conch).
 * - Scallop: one ribbed fan-shaped valve with ears at the hinge and a lip that rolls under, lying convex side up.
 *
 * Every kind is moved so its lowest point is at y = 0 and centred on the origin in x and z.
 */

export interface ShellParams {
  seed: number;
  kind: ShellKind;
  size: number;
  tone: ShellTone;
}

export const SHELL_DEFAULTS: ShellParams = { seed: 5, kind: 'cowrie', size: 0.1, tone: 'natural' };

export function shellParams(params: Readonly<Record<string, unknown>>): ShellParams {
  return {
    seed: Math.floor(numberParam(params, 'seed', SHELL_DEFAULTS.seed, 0, 65535)),
    kind: choiceParam(params, 'kind', SHELL_KINDS, SHELL_DEFAULTS.kind),
    size: numberParam(params, 'size', SHELL_DEFAULTS.size, 0.04, 0.3),
    tone: choiceParam(params, 'tone', SHELL_TONES, SHELL_DEFAULTS.tone),
  };
}

export const SHELL_LEVELS = 3;

const COWRIE = [
  { along: 16, around: 20 },
  { along: 8, around: 10 },
  { along: 5, around: 6 },
] as const;
const SPIRAL = {
  conch: [
    { perWhorl: 22, around: 14 },
    { perWhorl: 10, around: 8 },
    { perWhorl: 6, around: 5 },
  ],
  snail: [
    { perWhorl: 24, around: 16 },
    { perWhorl: 10, around: 8 },
    { perWhorl: 6, around: 5 },
  ],
} as const;
const SCALLOP = [
  { around: 84, rows: 9, hem: 2 },
  { around: 34, rows: 4, hem: 1 },
  { around: 14, rows: 2, hem: 0 },
] as const;

const pick = <T>(levels: readonly T[], level: number): T => levels[Math.min(levels.length - 1, Math.max(0, level))]!;

/** Moves the mesh so its lowest point is at y = 0 and its middle is over the origin. */
function settle(mesh: SeaMesh): void {
  const p = mesh.position;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < p.length; i += 3) {
    minX = Math.min(minX, p[i]!);
    maxX = Math.max(maxX, p[i]!);
    minY = Math.min(minY, p[i + 1]!);
    minZ = Math.min(minZ, p[i + 2]!);
    maxZ = Math.max(maxZ, p[i + 2]!);
  }
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  for (let i = 0; i < p.length; i += 3) {
    p[i] = p[i]! - cx;
    p[i + 1] = p[i + 1]! - minY;
    p[i + 2] = p[i + 2]! - cz;
  }
}

export function buildShell(input: ShellParams, level: number): BufferGeometry {
  const rnd = seeded(input.seed, 303 + SHELL_KINDS.indexOf(input.kind) * 17);
  const colors = SHELL_COLORS[input.kind][input.tone];
  const mesh = new SeaMesh();
  if (input.kind === 'cowrie') cowrie(mesh, input.size, colors, rnd, level);
  else if (input.kind === 'scallop') scallop(mesh, input.size, colors, rnd, level);
  else spiral(mesh, input.kind, input.size, colors, rnd, level);
  settle(mesh);
  return mesh.build();
}

type Colors = (typeof SHELL_COLORS)['cowrie']['natural'];

function cowrie(mesh: SeaMesh, size: number, colors: Colors, rnd: Seeded, level: number): void {
  const lod = pick(COWRIE, level);
  const half = size / 2;
  const width = size * rnd.range(0.56, 0.64);
  const height = size * rnd.range(0.34, 0.38);
  const spots = 1 / (size * rnd.range(0.045, 0.06));
  const point = (theta: number, phi: number): number => {
    const r = Math.pow(Math.sin(theta), 0.8);
    const up = Math.sin(phi);
    const y = r * height * (up >= 0 ? up : 0.28 * up);
    const p: Vec3 = [-Math.cos(theta) * half, y, r * (width / 2) * Math.cos(phi)];
    // Underside: the toothed aperture slit as a dark band.
    const slit = up < 0 ? smoothstep(0.25, 0.05, Math.abs(Math.cos(phi))) : 0;
    const back = up > 0 ? smoothstep(0.2, 1, up) : 0;
    const tone = 0.94 + 0.1 * hash3(p[0] * 60, p[1] * 60, p[2] * 60);
    return mesh.add({
      p,
      color: scaleColor(mixColor(colors.base, colors.mark, slit * 0.8), tone * (0.9 + 0.12 * back)),
      inner: colors.inner,
      spot: [...colors.mark, 0.85 * smoothstep(-0.1, 0.4, up)],
      pattern: [spots, 0.18, 0.12, 0],
      line: theta * 3,
    });
  };
  const ends = [point(0, Math.PI / 2), point(Math.PI, Math.PI / 2)];
  const rows: number[][] = [];
  for (let i = 1; i < lod.along; i++) {
    const theta = (Math.PI * i) / lod.along;
    const row: number[] = [];
    for (let j = 0; j < lod.around; j++) row.push(point(theta, (2 * Math.PI * j) / lod.around));
    rows.push(row);
  }
  mesh.fan(ends[0]!, rows[0]!, true, false);
  for (let i = 1; i < rows.length; i++) mesh.stitch(rows[i - 1]!, rows[i]!, true, false);
  mesh.fan(ends[1]!, rows[rows.length - 1]!, true, true);
}

function spiral(mesh: SeaMesh, kind: 'conch' | 'snail', size: number, colors: Colors, rnd: Seeded, level: number): void {
  const lod = pick<{ perWhorl: number; around: number }>(SPIRAL[kind], level);
  const conch = kind === 'conch';
  const whorls = conch ? rnd.range(3.3, 3.8) : rnd.range(2.5, 2.9);
  const growth = conch ? rnd.range(1.9, 2.15) : rnd.range(2.5, 2.9);
  const b = Math.log(growth) / (2 * Math.PI);
  const drop = conch ? rnd.range(2.0, 2.4) : rnd.range(0.9, 1.1);
  const tube = conch ? rnd.range(0.7, 0.76) : rnd.range(0.5, 0.56);
  const knobs = conch ? rnd.int(6, 7) : 0;
  const knob = conch ? rnd.range(0.3, 0.4) : 0;
  const flare = conch ? rnd.range(0.04, 0.1) : 0;
  const end = 2 * Math.PI * whorls;
  const steps = Math.round(lod.perWhorl * whorls);
  const spots = 1 / (size * 0.05);
  const bands = conch ? 0 : rnd.int(3, 5);
  // Raw shape with r1 = 1, scaled to `size` afterwards.
  const raw: { p: Vec3; theta: number; v: number; ring: number; lip: number }[] = [];
  const centre = (theta: number): Vec3 => {
    const r = Math.exp(b * (theta - end));
    return [r * Math.cos(theta), -drop * r, r * Math.sin(theta)];
  };
  const ringPoint = (theta: number, v: number): Vec3 => {
    const r = Math.exp(b * (theta - end));
    const c = centre(theta);
    let rho = tube * r;
    const late = smoothstep(end - 2 * Math.PI * 1.6, end - 2 * Math.PI * 0.6, theta);
    if (knobs) {
      const shoulder = Math.exp(-Math.pow((v - 0.8) / 0.35, 2));
      rho *= 1 + knob * late * shoulder * Math.pow(Math.max(0, Math.cos(knobs * theta)), 4);
    }
    if (flare) {
      const lip = smoothstep(end - 2.2, end, theta);
      rho *= 1 + flare * lip * Math.max(0, Math.cos(v - 0.7));
    }
    // Conch: the body whorl runs down into a tapering canal; the snail's whorl is nearly round.
    const down = Math.max(0, -Math.sin(v));
    const stretch = Math.sin(v) < 0 ? (conch ? 1.3 : 1.0) : 1.0;
    const radial = conch ? 0.9 - 0.2 * down * down : 1;
    return [
      c[0] + rho * radial * Math.cos(v) * Math.cos(theta),
      c[1] + rho * Math.sin(v) * stretch,
      c[2] + rho * radial * Math.cos(v) * Math.sin(theta),
    ];
  };
  const start = end - 2 * Math.PI * whorls + 0.6;
  for (let i = 0; i <= steps; i++) {
    const theta = start + ((end - start) * i) / steps;
    for (let j = 0; j < lod.around; j++) {
      const v = (2 * Math.PI * j) / lod.around;
      raw.push({ p: ringPoint(theta, v), theta, v, ring: i, lip: 0 });
    }
  }
  // The lip rolls outwards and back into the tube, so the aperture edge has thickness.
  // The lip: it flares outwards like a bell (a wing on the conch's outer, upper side) out to a rounded edge, so
  // the aperture edge has thickness and the opening reads as an opening.
  const roll = (theta: number, grow: (v: number) => number, ring: number, lip: number) => {
    const c = centre(theta);
    for (let j = 0; j < lod.around; j++) {
      const v = (2 * Math.PI * j) / lod.around;
      const p = ringPoint(theta, v);
      const g = grow(v);
      raw.push({ p: [c[0] + (p[0] - c[0]) * g, c[1] + (p[1] - c[1]) * g, c[2] + (p[2] - c[2]) * g], theta, v, ring, lip });
    }
  };
  const wing = (v: number) => (conch ? 0.22 * Math.max(0, Math.cos(v - 0.6)) : 0);
  roll(end + 0.04, (v) => 1.12 + wing(v), steps + 1, 1);
  roll(end + 0.06, (v) => 1.24 + wing(v) * 1.3, steps + 2, 1);
  roll(end + 0.065, (v) => 1.32 + wing(v) * 1.4, steps + 3, 1);
  const apex = centre(start - 0.25);
  // Pose: the conch lies on its side (spire axis horizontal) with its aperture turned to the side and tipped
  // 20-30 degrees towards the sand, so the opening shows and the lip never lies in the ground plane; the snail
  // stands spire-up, slightly tipped.
  const spin = rnd.range(0, Math.PI * 2);
  const tip = conch ? Math.PI / 2 - rnd.range(0.05, 0.2) : rnd.range(0.2, 0.4);
  const turn = (p: Vec3, lean: number): Vec3 => {
    // Spin about the spire (y), tip about z, lean about x.
    let [x, y, z] = p;
    [x, z] = [x * Math.cos(spin) - z * Math.sin(spin), x * Math.sin(spin) + z * Math.cos(spin)];
    [x, y] = [x * Math.cos(tip) - y * Math.sin(tip), x * Math.sin(tip) + y * Math.cos(tip)];
    [y, z] = [y * Math.cos(lean) - z * Math.sin(lean), y * Math.sin(lean) + z * Math.cos(lean)];
    return [x, y, z];
  };
  let lean = 0;
  if (conch) {
    // The aperture faces along the spiral's tangent at its end; choose the lean that tips that direction down.
    const a = centre(end - 0.01);
    const b = centre(end);
    const facing = turn([b[0] - a[0], b[1] - a[1], b[2] - a[2]], 0);
    const norm = Math.hypot(...facing);
    const [ny, nz] = [facing[1] / norm, facing[2] / norm];
    const reach = Math.hypot(ny, nz);
    const target = -Math.min(reach, Math.sin(rnd.range(0.3, 0.5)));
    lean = Math.acos(target / Math.max(reach, 1e-6)) - Math.atan2(nz, ny);
  }
  const pose = (p: Vec3): Vec3 => turn(p, lean);
  const posed = raw.map((point) => pose(point.p));
  const apexPosed = pose(apex);
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  for (const p of [...posed, apexPosed]) {
    min = min.map((m, k) => Math.min(m, p[k]!));
    max = max.map((m, k) => Math.max(m, p[k]!));
  }
  const scale = size / Math.max(max[0]! - min[0]!, max[1]! - min[1]!, max[2]! - min[2]!);
  const rings: number[][] = [];
  raw.forEach((point, k) => {
    const p = posed[k]!.map((value) => value * scale) as Vec3;
    const outer = Math.cos(point.v);
    const tone = 0.92 + 0.14 * hash3(p[0] * 80, p[1] * 80, p[2] * 80);
    const streak = conch ? 0.5 + 0.5 * Math.sin(point.theta * 5 + Math.sin(point.v * 3) * 2) : 0;
    // Inside the tube: bright at the aperture, darker deeper in.
    const depth = smoothstep(end - 1.0, end - 0.05, point.theta);
    const index = mesh.add({
      p,
      color: mixColor(
        scaleColor(mixColor(colors.base, colors.mark, streak * 0.25), tone * (0.92 + 0.08 * outer)),
        colors.inner,
        point.lip * 0.7,
      ),
      inner: scaleColor(colors.inner, 0.12 + 0.88 * Math.max(depth, point.lip)),
      spot: [...colors.mark, conch ? 0.35 : 0.15],
      pattern: [spots, conch ? 0.25 : 0.55, conch ? 0.55 : 0.35, 0.6],
      line: conch ? point.theta * 2.2 : (point.v / (2 * Math.PI)) * bands * 2 + point.theta * 0.08,
    });
    (rings[point.ring] ??= []).push(index);
  });
  const cap = mesh.add({
    p: apexPosed.map((value) => value * scale) as Vec3,
    color: colors.base,
    inner: colors.inner,
    pattern: [spots, 0, 0.55, 0],
  });
  mesh.fan(cap, rings[0]!, true, true);
  for (let i = 1; i < rings.length; i++) mesh.stitch(rings[i - 1]!, rings[i]!, true, true);
}

function scallop(mesh: SeaMesh, size: number, colors: Colors, rnd: Seeded, level: number): void {
  const lod = pick(SCALLOP, level);
  const radius = size * 0.52;
  const spread = rnd.range(1.12, 1.25);
  const wide = Math.PI / 2 + 0.12;
  const ribs = rnd.int(14, 19);
  const rib = radius * rnd.range(0.028, 0.038);
  const dome = radius * rnd.range(0.26, 0.34);
  const thick = size * 0.012;
  const ear = radius * 0.3;
  const shape = (psi: number, t: number) => {
    const inFan = Math.abs(psi) <= spread;
    const u = (psi + spread) / (2 * spread);
    const crest = inFan ? Math.pow(0.5 + 0.5 * Math.cos(2 * Math.PI * ribs * u), 1.5) : 0;
    const reach = inFan ? radius * (0.93 + 0.07 * Math.cos((psi / spread) * (Math.PI / 2))) * (1 + 0.02 * crest * t) : ear;
    const d = t * reach;
    const height = inFan
      ? dome * Math.pow(Math.sin(Math.PI * (0.06 + 0.94 * t)), 0.7) * (1 - 0.3 * Math.pow(psi / spread, 2)) +
        rib * crest * (0.25 + t)
      : dome * (0.37 - 0.12 * t);
    return { p: [d * Math.sin(psi), height + thick, d * Math.cos(psi) - radius * 0.45] as Vec3, crest, inFan };
  };
  const add = (p: Vec3, crest: number, t: number, lip: number) =>
    mesh.add({
      p,
      color: scaleColor(mixColor(colors.base, colors.mark, 0.25 * (1 - crest)), 0.92 + 0.12 * crest + 0.06 * lip),
      inner: colors.inner,
      spot: [...colors.mark, 0.12],
      pattern: [1 / (size * 0.04), 0.5 * (1 - lip), 0.5, 0.5],
      line: t * 6.5 + crest * 0.15,
    });
  const umbo = add(shape(0, 0).p, 0, 0, 0);
  const rows: number[][] = [];
  const columns = Array.from({ length: lod.around + 1 }, (_, a) => -wide + (2 * wide * a) / lod.around);
  for (let r = 1; r <= lod.rows; r++) {
    const t = r / lod.rows;
    rows.push(columns.map((psi) => {
      const s = shape(psi, t);
      return add(s.p, s.crest, t, 0);
    }));
  }
  // Hem: the lip rolls under towards the umbo and down to the ground.
  for (let k = 1; k <= lod.hem; k++) {
    const h = k / lod.hem;
    rows.push(columns.map((psi) => {
      const s = shape(psi, 1);
      const inward = thick * 1.2 * Math.sin((h * Math.PI) / 2);
      const p: Vec3 = [s.p[0] - Math.sin(psi) * inward, s.p[1] * (1 - h), s.p[2] - Math.cos(psi) * inward];
      return add(p, s.crest, 1, 1);
    }));
  }
  mesh.fan(umbo, rows[0]!, false, false);
  for (let r = 1; r < rows.length; r++) mesh.stitch(rows[r - 1]!, rows[r]!, false, false);
}
