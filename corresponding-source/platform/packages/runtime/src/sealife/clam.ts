import type { BufferGeometry } from 'three/webgpu';
import { SeaMesh, mixColor, scaleColor, type Vec3 } from './mesh.js';
import { CLAM_MANTLES, CLAM_MANTLE_COLORS, CLAM_SHELL, type ClamMantle } from './palettes.js';
import { choiceParam, hash3, mix, numberParam, seeded, smoothstep } from './random.js';

/**
 * Giant clam (SEALIFE-01): two fluted valves sitting hinge-down, gaping upwards, with the coloured mantle between
 * them. Own procedural code.
 *
 * Each valve is a fan from the umbo (the hinge point at the origin) to a half-elliptical lip, bulging outwards,
 * with 4-6 big radial folds. Both valves carry the same fold offset in absolute z, so their wavy lips interlock.
 * The lip rolls inwards and down (a hem), so the shell edge has thickness without a second coplanar sheet. The
 * valves are built at the rest gape (the `open` parameter) and turned about the hinge line; the shader closes them
 * by at most `CLAM_CLOSE_FRACTION` of that gape, so they never meet. The mantle spans the gape below the lips,
 * inset from the hems, and follows the valves by its across-gape position.
 */

export interface ClamParams {
  seed: number;
  size: number;
  mantle: ClamMantle;
  open: number;
  speed: number;
}

export const CLAM_DEFAULTS: ClamParams = { seed: 3, size: 0.55, mantle: 'blue', open: 0.7, speed: 1 };

export function clamParams(params: Readonly<Record<string, unknown>>): ClamParams {
  return {
    seed: Math.floor(numberParam(params, 'seed', CLAM_DEFAULTS.seed, 0, 65535)),
    size: numberParam(params, 'size', CLAM_DEFAULTS.size, 0.3, 0.9),
    mantle: choiceParam(params, 'mantle', CLAM_MANTLES, CLAM_DEFAULTS.mantle),
    open: numberParam(params, 'open', CLAM_DEFAULTS.open, 0, 1),
    speed: numberParam(params, 'speed', CLAM_DEFAULTS.speed, 0, 2),
  };
}

const LEVELS = [
  { around: 40, rows: 10, hem: 2, mantleAround: 34, mantleAcross: 8 },
  { around: 18, rows: 5, hem: 1, mantleAround: 14, mantleAcross: 4 },
  { around: 9, rows: 3, hem: 0, mantleAround: 7, mantleAcross: 2 },
] as const;

export const CLAM_LEVELS = LEVELS.length;
/** Most the valves close, as a fraction of the rest gape. */
export const CLAM_CLOSE_FRACTION = 0.6;
/** Rest gape (radians between the valves) at open = 0 and open = 1. */
export const CLAM_GAPE = [0.3, 0.9] as const;
/** Base period of one open-close cycle at speed = 1 (seconds). */
const CYCLE = 16;
/** The valve fan leaves this angle out at each end of the hinge (radians). */
const END = 0.14;

export function buildClam(input: ClamParams, level: number): BufferGeometry {
  const lod = LEVELS[Math.min(LEVELS.length - 1, Math.max(0, level))]!;
  const rnd = seeded(input.seed, 202);
  const mantleColors = CLAM_MANTLE_COLORS[input.mantle];
  const half = input.size / 2;
  const height = input.size * rnd.range(0.4, 0.47);
  const bulge = input.size * rnd.range(0.24, 0.27);
  const folds = rnd.int(4, 6);
  const fold = input.size * rnd.range(0.045, 0.055);
  const thick = input.size * 0.011;
  const gape = mix(CLAM_GAPE[0], CLAM_GAPE[1], input.open);
  const speed = (input.speed * 2 * Math.PI) / (CYCLE * rnd.range(0.85, 1.2));
  const phase = rnd.range(0, Math.PI * 2);
  const closeAngle = (CLAM_CLOSE_FRACTION * gape) / 2;
  const crustSeed = rnd.range(0, 100);

  const span = Math.PI - 2 * END;
  /** Valve point before the gape turn: psi along the lip (END..PI-END), t from the umbo (0) to the lip (1). */
  const valve = (psi: number, t: number, side: 1 | -1): Vec3 => {
    const u = (psi - END) / span;
    const cosine = Math.cos(2 * Math.PI * folds * u);
    // Sharper crests: the lip reads as a row of teeth.
    const wave = Math.sign(cosine) * Math.pow(Math.abs(cosine), 0.7);
    const x = -Math.cos(psi) * half * t;
    // The ends rise a little from the hinge, so no part of the valve lies flat on the ground.
    const y = Math.sin(psi) * height * t + height * 0.12 * t * Math.cos(psi) ** 2 + fold * 0.9 * wave * smoothstep(0.7, 1, t);
    const z =
      side * bulge * Math.pow(Math.sin(Math.PI * t), 1.25) * Math.pow(Math.sin(Math.PI * u), 0.5) +
      fold * Math.pow(t, 1.2) * wave;
    return [x, y, z];
  };
  const turn = (p: Vec3, angle: number): Vec3 => {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c];
  };

  /** Distance between the two lips (z) at rest. */
  const gapAt = (psi: number): number => turn(valve(psi, 1, 1), gape / 2)[2] - turn(valve(psi, 1, -1), -gape / 2)[2];

  const mesh = new SeaMesh();
  const growthLines = 9;

  for (const side of [1, -1] as const) {
    const rest = (side * gape) / 2;
    const motion = [-side * closeAngle, phase, speed, 0] as [number, number, number, number];
    const shellPoint = (psi: number, t: number, p: Vec3, lip: number) => {
      const u = (psi - END) / span;
      const wave = 0.5 + 0.5 * Math.cos(2 * Math.PI * folds * u);
      const tone = 0.92 + 0.12 * hash3(p[0] * 30 + crustSeed, p[1] * 30, side);
      const outer = scaleColor(mixColor(CLAM_SHELL.ridge, CLAM_SHELL.outer, wave), tone);
      return mesh.add({
        p: turn(p, rest),
        color: mixColor(outer, CLAM_SHELL.inner, lip * 0.5),
        inner: CLAM_SHELL.inner,
        spot: [...CLAM_SHELL.crust, 0.18 * (1 - lip)],
        pattern: [1 / (input.size * 0.05), 0.3 * (1 - lip), 0.72, 0.8],
        line: t * growthLines,
        motion,
      });
    };
    const umbo = shellPoint(Math.PI / 2, 0, [0, 0, 0], 0);
    const rows: number[][] = [];
    for (let r = 1; r <= lod.rows; r++) {
      const t = r / lod.rows;
      const row: number[] = [];
      for (let a = 0; a <= lod.around; a++) {
        const psi = END + (span * a) / lod.around;
        row.push(shellPoint(psi, t, valve(psi, t, side), 0));
      }
      rows.push(row);
    }
    // Hem: the lip rolls inwards (towards the gape) and down.
    for (let k = 1; k <= lod.hem; k++) {
      const h = k / lod.hem;
      const row: number[] = [];
      for (let a = 0; a <= lod.around; a++) {
        const psi = END + (span * a) / lod.around;
        const lip = valve(psi, 1, side);
        // Never deeper than a sixth of the gap between the lips, so the hems stay apart when the clam closes.
        const inward = Math.min(thick, gapAt(psi) / 6);
        const p: Vec3 = [lip[0], lip[1] - thick * 1.5 * h * h, lip[2] - side * inward * Math.sin((h * Math.PI) / 2)];
        row.push(shellPoint(psi, 1, p, 1));
      }
      rows.push(row);
    }
    const flip = side === -1;
    mesh.fan(umbo, rows[0]!, false, !flip);
    for (let r = 1; r < rows.length; r++) mesh.stitch(rows[r - 1]!, rows[r]!, false, !flip);
  }

  // Mantle: across the gape below the hems, from the -z valve (w = -1) to the +z valve (w = 1).
  const mantleEnd = END + 0.2;
  const mantleRows: number[][] = [];
  for (let c = 0; c <= lod.mantleAcross; c++) {
    const w = -1 + (2 * c) / lod.mantleAcross;
    const row: number[] = [];
    for (let a = 0; a <= lod.mantleAround; a++) {
      const psi = mantleEnd + ((Math.PI - 2 * mantleEnd) * a) / lod.mantleAround;
      const lipA = turn(valve(psi, 1, 1), gape / 2);
      const lipB = turn(valve(psi, 1, -1), -gape / 2);
      const gap = lipA[2] - lipB[2];
      const inset = Math.min(thick * 2.2, gap * 0.3);
      const zA = lipA[2] - inset;
      const zB = lipB[2] + inset;
      const s = (w + 1) / 2;
      const lipY = mix(lipB[1], lipA[1], s) - thick * 1.4;
      const ends = Math.sin(((psi - mantleEnd) / (Math.PI - 2 * mantleEnd)) * Math.PI);
      const dome = height * 0.14 * (1 - w * w) * Math.pow(ends, 0.6);
      const frill = input.size * 0.012 * Math.sin(psi * 15 + w * 2) * w * w * ends;
      const p: Vec3 = [mix(lipB[0], lipA[0], s), lipY + dome + frill, mix(zB, zA, s)];
      const rim = smoothstep(0.55, 1, Math.abs(w));
      const tone = 0.9 + 0.2 * hash3(p[0] * 50, p[2] * 50, crustSeed);
      row.push(
        mesh.add({
          p,
          color: scaleColor(mixColor(mantleColors.base, mantleColors.edge, rim), tone),
          inner: scaleColor(mantleColors.base, 0.55),
          spot: [...mantleColors.spot, 0.9 * (1 - rim * 0.6)],
          pattern: [1 / (input.size * 0.03), 0.25, 0.32, 0.35],
          line: Math.abs(w) * 4 + Math.sin(psi * 9) * 0.3,
          motion: [-w * closeAngle, phase, speed, height * 0.06 * (1 - 0.5 * w * w)],
        }),
      );
    }
    mantleRows.push(row);
  }
  for (let c = 1; c < mantleRows.length; c++) mesh.stitch(mantleRows[c - 1]!, mantleRows[c]!, false, false);
  return mesh.build();
}
