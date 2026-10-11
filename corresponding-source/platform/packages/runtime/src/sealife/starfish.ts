import type { BufferGeometry } from 'three/webgpu';
import { SeaMesh, mixColor, scaleColor, type Vec4 } from './mesh.js';
import { STARFISH_COLORS, STARFISH_PALETTES, type StarfishPalette } from './palettes.js';
import { choiceParam, hash3, numberParam, seeded, smoothstep } from './random.js';

/**
 * Starfish (SEALIFE-01): a 5- or 6-armed sea star lying on sand or rock. Own procedural code.
 *
 * The body is a closed polar mesh: a domed top and a nearly flat underside share the outline ring, so nothing is
 * coplanar (no flicker) and the underside, which faces the ground, is culled from above. The outline is a sum of
 * per-arm lobes (seeded length, angle, sideways bend and tip lift); the top tapers from the central disc to the
 * tips and its cross-section is rounded. Tubercles (knobs) are drawn by the material from the vertex pattern
 * settings (worley spots with a bump), so the mesh stays light.
 */

export interface StarfishParams {
  seed: number;
  size: number;
  arms: number;
  palette: StarfishPalette;
  curl: number;
}

export const STARFISH_DEFAULTS: StarfishParams = { seed: 7, size: 0.25, arms: 5, palette: 'orange', curl: 0.5 };

export function starfishParams(params: Readonly<Record<string, unknown>>): StarfishParams {
  return {
    seed: Math.floor(numberParam(params, 'seed', STARFISH_DEFAULTS.seed, 0, 65535)),
    size: numberParam(params, 'size', STARFISH_DEFAULTS.size, 0.15, 0.35),
    arms: Math.round(numberParam(params, 'arms', STARFISH_DEFAULTS.arms, 5, 6)),
    palette: choiceParam(params, 'palette', STARFISH_PALETTES, STARFISH_DEFAULTS.palette),
    curl: numberParam(params, 'curl', STARFISH_DEFAULTS.curl, 0, 1),
  };
}

/** Segments per arm, rings of the top and rings of the underside, nearest level first. */
const LEVELS = [
  { perArm: 14, top: 9, bottom: 3 },
  { perArm: 6, top: 4, bottom: 2 },
  { perArm: 4, top: 2, bottom: 1 },
] as const;

export const STARFISH_LEVELS = LEVELS.length;

/** Period of the slow arm curl (seconds) before the seeded spread. */
const CURL_PERIOD = 11;
/** Highest arm-tip lift of the curl animation as a fraction of the radius, at curl = 1. */
export const STARFISH_CURL_LIFT = 0.12;

const wrapPi = (a: number): number => {
  let x = (a + Math.PI) % (2 * Math.PI);
  if (x < 0) x += 2 * Math.PI;
  return x - Math.PI;
};

export function buildStarfish(input: StarfishParams, level: number): BufferGeometry {
  const lod = LEVELS[Math.min(LEVELS.length - 1, Math.max(0, level))]!;
  const rnd = seeded(input.seed, 101);
  const n = input.arms;
  const colors = STARFISH_COLORS[input.palette];
  const tipRadius = input.size / 2;
  const discRadius = tipRadius * rnd.range(0.25, 0.3);
  const thickness = tipRadius * rnd.range(0.2, 0.25);
  const edge = thickness * 0.16;
  const turn = rnd.range(0, Math.PI * 2);
  const period = CURL_PERIOD * rnd.range(0.85, 1.2);
  const speed = (2 * Math.PI) / period;
  const phase0 = rnd.range(0, Math.PI * 2);
  const arms = Array.from({ length: n }, (_, i) => ({
    angle: turn + (i * 2 * Math.PI) / n + rnd.range(-0.07, 0.07),
    length: tipRadius * rnd.range(0.9, 1.04),
    width: tipRadius * rnd.range(0.17, 0.21),
    bend: rnd.range(-0.22, 0.22),
    tipLift: rnd.range(0, 0.1) * tipRadius,
    phase: phase0 + i * 1.25 + rnd.range(-0.3, 0.3),
  }));
  const tipWidth = tipRadius * 0.035;
  const knobFrequency = 1 / (tipRadius * 0.065);

  /** Half-width of an arm at distance `a` along it: tapered, with a rounded tip. */
  const halfWidth = (arm: (typeof arms)[number], a: number): number =>
    a < 0 || a > arm.length
      ? 0
      : (arm.width * Math.pow(1 - a / arm.length, 0.85) + tipWidth) * Math.sqrt(Math.max(0, 1 - Math.pow(a / arm.length, 6)));
  /** Where a ray at angle phi from the arm's axis leaves the arm (0 when it never enters it). */
  const armReach = (arm: (typeof arms)[number], phi: number): number => {
    if (Math.abs(phi) >= Math.PI / 2) return 0;
    const c = Math.cos(phi);
    const s = Math.abs(Math.sin(phi));
    const inside = (d: number) => halfWidth(arm, d * c) - d * s > 0;
    const far = arm.length / c;
    const steps = 32;
    let lo = 0;
    for (let k = 1; k <= steps; k++) {
      const d = (far * k) / steps;
      if (!inside(d)) break;
      lo = d;
    }
    let hi = Math.min(far, lo + far / steps);
    for (let k = 0; k < 14; k++) {
      const mid = (lo + hi) / 2;
      if (inside(mid)) lo = mid;
      else hi = mid;
    }
    return lo;
  };
  /** Smooth maximum (polynomial), so the disc and the arms meet in rounded corners. */
  const smoothMax = (a: number, b: number, k: number): number => {
    const h = Math.min(1, Math.max(0, 0.5 + (0.5 * (b - a)) / k));
    return a + (b - a) * h + k * h * (1 - h);
  };

  /** Outline radius at an angle and soft weights for blending per-arm values. */
  const weigh = (theta: number) => {
    let reach = 0;
    let total = 0;
    const soft: number[] = [];
    arms.forEach((arm) => {
      const phi = wrapPi(theta - arm.angle);
      reach = Math.max(reach, armReach(arm, phi));
      const a = (phi * n * 0.8) / 2;
      const w = Math.abs(a) < Math.PI / 2 ? Math.pow(Math.cos(a), 2) : 0;
      soft.push(w);
      total += w;
    });
    const radius = smoothMax(discRadius, reach, discRadius * 0.45);
    const blend = (pick: (arm: (typeof arms)[number]) => number) =>
      arms.reduce((sum, arm, i) => sum + (soft[i]! / Math.max(total, 1e-6)) * pick(arm), 0);
    return { radius, blend };
  };

  // Angles: each arm's half-spans are sampled separately, denser towards the arm's axis, so every tip lands on a
  // vertex and the narrow arms get most of the columns.
  const angles: number[] = [];
  arms.forEach((arm, i) => {
    const prev = arms[(i + n - 1) % n]!;
    const next = arms[(i + 1) % n]!;
    const spanLeft = wrapPi(arm.angle - prev.angle) / 2;
    const spanRight = wrapPi(next.angle - arm.angle) / 2;
    const half = lod.perArm / 2;
    for (let k = 0; k < half; k++) angles.push(arm.angle - spanLeft * Math.pow((half - k) / half, 1.6));
    for (let k = 0; k < half; k++) angles.push(arm.angle + spanRight * Math.pow(k / half, 1.6));
  });
  const columns = angles.map((theta) => ({ theta, ...weigh(theta) }));

  const mesh = new SeaMesh();
  const pattern = (amount: number): Vec4 => [knobFrequency, 0, 0.62, amount];

  /** A point of the body at outline fraction r (0 centre, 1 rim); top or underside. */
  const point = (column: (typeof columns)[number], r: number, top: boolean) => {
    const d = r * column.radius;
    const along = Math.min(1, d / tipRadius);
    const armHeight = thickness * (1 - 0.55 * smoothstep(0, 1, along));
    const round = Math.sqrt(Math.max(0, 1 - Math.pow(r, 4)));
    const staticLift = column.blend((arm) => arm.tipLift) * Math.pow(along, 3);
    const y = (top ? edge + (armHeight - edge) * round : edge * Math.pow(r, 6)) + staticLift;
    const bend = column.blend((arm) => arm.bend) * along * along;
    const angle = column.theta + bend;
    const x = d * Math.cos(angle);
    const z = d * Math.sin(angle);
    const jitter = 0.9 + 0.2 * hash3(x * 40, 0, z * 40);
    const color = top
      ? scaleColor(mixColor(colors.top, colors.tip, smoothstep(0.45, 1, along)), jitter * (along < 0.3 ? 0.94 : 1))
      : scaleColor(colors.under, 0.95 + 0.1 * jitter);
    const knobs = top ? colors.knobs * (1 - smoothstep(0.8, 1, r)) : 0;
    const lift = input.curl * STARFISH_CURL_LIFT * tipRadius * Math.pow(along, 2.5);
    return mesh.add({
      p: [x, y, z],
      color,
      spot: [...colors.knob, knobs],
      pattern: pattern(top ? 1 : 0),
      motion: [lift, column.blend((arm) => arm.phase), speed, 0],
    });
  };

  // Top: centre vertex, then rings packed towards the rounded rim.
  const center = columns[0]!;
  const topCenter = mesh.add({
    p: [0, thickness, 0],
    color: scaleColor(colors.top, 0.92),
    spot: [...colors.knob, colors.knobs],
    pattern: pattern(1),
    motion: [0, center.blend((arm) => arm.phase), speed, 0],
  });
  const topRings: number[][] = [];
  for (let i = 1; i <= lod.top; i++) {
    const r = 1 - Math.pow(1 - i / lod.top, 1.5);
    topRings.push(columns.map((column) => point(column, r, true)));
  }
  const rim = topRings[topRings.length - 1]!;
  // Underside: its own inner rings, sharing the rim with the top (a closed body).
  const bottomCenter = mesh.add({
    p: [0, 0, 0],
    color: colors.under,
    pattern: pattern(0),
    motion: [0, center.blend((arm) => arm.phase), speed, 0],
  });
  const bottomRings: number[][] = [];
  for (let i = 1; i < lod.bottom; i++) bottomRings.push(columns.map((column) => point(column, i / lod.bottom, false)));
  bottomRings.push(rim);

  mesh.fan(topCenter, topRings[0]!, true, true);
  for (let i = 1; i < topRings.length; i++) mesh.stitch(topRings[i - 1]!, topRings[i]!, true, true);
  mesh.fan(bottomCenter, bottomRings[0]!, true, false);
  for (let i = 1; i < bottomRings.length; i++) mesh.stitch(bottomRings[i - 1]!, bottomRings[i]!, true, false);
  return mesh.build();
}
