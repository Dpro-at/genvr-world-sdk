import type { MotionCheckCell, MotionCheckId, MotionCheckIssue, MotionCheckLimits, MotionStyleId } from '@genvr/contracts';

/**
 * Board M16 · motion check: reads the frames of one move on one body (world space, metres, y up, floor at y = 0,
 * fixed step) and finds what a person would see as wrong. Pure and deterministic: the same frames give the same cell.
 * The sampler that plays a clip on a body and records these frames lives with the viewport; this file only measures.
 */
export type Vec3 = readonly [number, number, number];
export interface CheckLimb { root: Vec3; mid: Vec3; end: Vec3; /** Hinge axis of the mid joint in world space: a normal bend turns root→mid into mid→end around +axis. */ axis: Vec3; }
export interface CheckFrame {
  t: number;
  hips: Vec3; chest: Vec3; neck: Vec3; head: Vec3;
  /** Sole points of each foot (heel, toe) at floor height when standing; [left, right]. */
  feet: readonly [{ heel: Vec3; toe: Vec3 }, { heel: Vec3; toe: Vec3 }];
  legs: readonly [CheckLimb, CheckLimb];
  arms: readonly [CheckLimb, CheckLimb];
}
export interface CheckMove { move: string; body: string; style: MotionStyleId; loop: boolean; frames: readonly CheckFrame[];
  /** Radius of the torso around the hips → neck line (m); from the body's rest pose. */
  torsoRadius: number;
  /** A seat or a wall carries the weight (Sit, Climb): balance is not scored. */
  supported?: boolean; }

/** A sole point touches the floor below this height (m) when it is not moving up or down fast. */
export const PLANT_HEIGHT = 0.03, PLANT_VERTICAL_SPEED = 0.2;
/** Human limits before a style's extra degrees: a knee and an elbow open at most this far past straight. */
export const HUMAN_HYPEREXTENSION_DEG = 5;
/** Body speed (m/s) above which a move counts as moving (speed match) and below which as standing (balance). */
export const MOVING_SPEED = 0.2;
/** Points per unit over the limit and the most one check can take (score 0–100, also written in the motion-lab skill). */
export const MOTION_CHECK_WEIGHTS: Record<MotionCheckId, { per: number; cap: number }> = {
  foot_slide: { per: 4, cap: 30 }, ground: { per: 5, cap: 30 }, joint_limits: { per: 1, cap: 30 }, body_clash: { per: 4, cap: 30 },
  balance: { per: 40, cap: 20 }, loop_seam: { per: 2, cap: 20 }, speed_match: { per: 0.5, cap: 20 },
};
const UNITS: Record<MotionCheckId, MotionCheckIssue['unit']> = { foot_slide: 'cm', ground: 'cm', joint_limits: 'deg', body_clash: 'cm', balance: 's', loop_seam: 'deg', speed_match: '%' };

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const flat = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const deg = (radians: number) => radians * 180 / Math.PI;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Signed bend of a hinge (degrees): positive = the normal way, negative = past straight the wrong way. */
export function hingeBend(limb: CheckLimb): number {
  const a = sub(limb.mid, limb.root), b = sub(limb.end, limb.mid);
  return deg(Math.atan2(dot(cross(a, b), limb.axis) / (len(limb.axis) || 1), dot(a, b)));
}

function distanceToSegment(p: Vec3, a: Vec3, b: Vec3): number {
  const ab = sub(b, a), t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / (dot(ab, ab) || 1)));
  return len(sub(p, [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t]));
}

/** Per-frame value of a check (0 = fine), so issues can name the frames where it goes over the limit. */
type Series = number[];

function planted(frames: readonly CheckFrame[], foot: 0 | 1, point: 'heel' | 'toe', i: number): boolean {
  const p = frames[i]!.feet[foot][point], q = frames[Math.max(0, i - 1)]!.feet[foot][point], r = frames[Math.min(frames.length - 1, i + 1)]!.feet[foot][point];
  const dt = (frames[Math.min(frames.length - 1, i + 1)]!.t - frames[Math.max(0, i - 1)]!.t) || 1;
  return p[1] < PLANT_HEIGHT && Math.abs(r[1] - q[1]) / dt < PLANT_VERTICAL_SPEED;
}

/** Foot slide: how far a planted sole point drifts from where it touched down, per contact (cm). */
function footSlide(frames: readonly CheckFrame[]): Series {
  const out = frames.map(() => 0);
  for (const foot of [0, 1] as const) for (const point of ['heel', 'toe'] as const) {
    let anchor: Vec3 | null = null;
    frames.forEach((frame, i) => {
      if (!planted(frames, foot, point, i)) { anchor = null; return; }
      anchor ??= frame.feet[foot][point];
      out[i] = Math.max(out[i]!, flat(frame.feet[foot][point], anchor) * 100);
    });
  }
  return out;
}

/** Ground: the deepest sole point, hips or head below the floor (cm). */
const ground = (frames: readonly CheckFrame[]): Series => frames.map(f => Math.max(0, -Math.min(f.hips[1], f.head[1], ...f.feet.flatMap(foot => [foot.heel[1], foot.toe[1]]))) * 100);

/** Joint limits: degrees a knee or elbow goes past straight beyond the human allowance. */
const jointLimits = (frames: readonly CheckFrame[]): Series => frames.map(f => Math.max(0, ...[...f.legs, ...f.arms].map(limb => -hingeBend(limb) - HUMAN_HYPEREXTENSION_DEG)));

/** Body clash: how deep a hand or foot is inside the torso (cm). */
const bodyClash = (frames: readonly CheckFrame[], radius: number): Series => frames.map(f =>
  Math.max(0, ...[f.arms[0].end, f.arms[1].end, f.feet[0].toe, f.feet[1].toe].map(p => (radius - distanceToSegment(p, f.hips, f.neck)) * 100)));

function bodySpeed(frames: readonly CheckFrame[], i: number): number {
  const a = frames[Math.max(0, i - 1)]!, b = frames[Math.min(frames.length - 1, i + 1)]!;
  return flat(b.hips, a.hips) / ((b.t - a.t) || 1);
}

/** Balance: while standing, seconds the weight (mean of hips, chest, head) has been outside the planted feet. */
function balance(frames: readonly CheckFrame[]): Series {
  let outside = 0;
  return frames.map((f, i) => {
    const dt = i ? f.t - frames[i - 1]!.t : 0;
    const support = ([0, 1] as const).flatMap(foot => (['heel', 'toe'] as const).filter(p => planted(frames, foot, p, i)).map(p => f.feet[foot][p]));
    if (!support.length || bodySpeed(frames, i) > MOVING_SPEED) { outside = 0; return 0; }
    const weight: Vec3 = [(f.hips[0] + f.chest[0] + f.head[0]) / 3, 0, (f.hips[2] + f.chest[2] + f.head[2]) / 3];
    // Support area: the planted points, their segments, and a 6 cm margin for the foot's width.
    let near = Infinity;
    for (const a of support) for (const b of support) near = Math.min(near, distanceToSegment(weight, [a[0], 0, a[2]], [b[0], 0, b[2]]));
    if (support.length >= 3 && inside(weight, support)) near = 0;
    outside = near > 0.06 ? outside + dt : 0;
    return outside;
  });
}
function inside(p: Vec3, points: readonly Vec3[]): boolean {
  const c: Vec3 = [points.reduce((s, q) => s + q[0], 0) / points.length, 0, points.reduce((s, q) => s + q[2], 0) / points.length];
  const sorted = [...points].sort((a, b) => Math.atan2(a[2] - c[2], a[0] - c[0]) - Math.atan2(b[2] - c[2], b[0] - c[0]));
  return sorted.every((a, i) => { const b = sorted[(i + 1) % sorted.length]!; return (b[0] - a[0]) * (p[2] - a[2]) - (b[2] - a[2]) * (p[0] - a[0]) >= 0; });
}

/** Loop seam: the largest limb direction change between the last and the first frame (degrees), on the last frame. */
function loopSeam(frames: readonly CheckFrame[]): Series {
  const out = frames.map(() => 0);
  if (frames.length < 2) return out;
  const segments = (f: CheckFrame): Vec3[] => [sub(f.chest, f.hips), sub(f.head, f.neck), ...[...f.legs, ...f.arms].flatMap(l => [sub(l.mid, l.root), sub(l.end, l.mid)])];
  const a = segments(frames[0]!), b = segments(frames[frames.length - 1]!);
  out[out.length - 1] = Math.max(...a.map((v, i) => deg(Math.acos(Math.max(-1, Math.min(1, dot(v, b[i]!) / ((len(v) * len(b[i]!)) || 1)))))));
  return out;
}

/**
 * Speed match: over the frames where the body moves, the median speed of the planted feet under the body against the
 * median body speed (%). One value for the move, written on every moving frame.
 */
function speedMatch(frames: readonly CheckFrame[]): Series {
  const moving: number[] = [], feet: number[] = [], body: number[] = [];
  frames.forEach((f, i) => {
    const speed = bodySpeed(frames, i);
    if (speed <= MOVING_SPEED || i === 0) return;
    moving.push(i); body.push(speed);
    const prev = frames[i - 1]!, dt = (f.t - prev.t) || 1;
    for (const foot of [0, 1] as const) for (const p of ['heel', 'toe'] as const)
      if (planted(frames, foot, p, i) && planted(frames, foot, p, i - 1)) feet.push(flat(sub(f.feet[foot][p], f.hips), sub(prev.feet[foot][p], prev.hips)) / dt);
  });
  const out = frames.map(() => 0);
  if (!feet.length) return out;
  const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
  const mismatch = Math.abs(median(feet) - median(body)) / median(body) * 100;
  for (const i of moving) out[i] = mismatch;
  return out;
}

/** Ranges of frames where a series goes over the limit, worst value per range. */
function ranges(check: MotionCheckId, series: Series, limit: number): MotionCheckIssue[] {
  const issues: MotionCheckIssue[] = [];
  let from = -1, worst = 0;
  // Values are compared as reported (one decimal), so a rounding hair over the limit is not an issue.
  const over = (value: number) => round1(value) > limit;
  series.forEach((value, i) => {
    if (over(value)) { if (from < 0) { from = i; worst = 0; } worst = Math.max(worst, value); }
    if (from >= 0 && (!over(value) || i === series.length - 1)) {
      issues.push({ check, from, to: over(value) ? i : i - 1, value: round1(worst), limit, unit: UNITS[check] }); from = -1;
    }
  });
  return issues;
}

const penalty = (issue: MotionCheckIssue) => Math.min(MOTION_CHECK_WEIGHTS[issue.check].cap, (issue.value - issue.limit) * MOTION_CHECK_WEIGHTS[issue.check].per);

/** One cell of the grid: every check against the style's limits, a 0–100 score and the issues, worst first. */
export function checkMove(input: CheckMove, limits: MotionCheckLimits): MotionCheckCell {
  const { frames } = input;
  const all: MotionCheckIssue[] = [
    ...ranges('foot_slide', footSlide(frames), limits.foot_slide_cm),
    ...ranges('ground', ground(frames), limits.ground_cm),
    ...ranges('joint_limits', jointLimits(frames), limits.joint_extra_deg),
    ...ranges('body_clash', bodyClash(frames, input.torsoRadius), limits.body_clash_cm),
    ...(limits.balance_s === null || input.supported ? [] : ranges('balance', balance(frames), limits.balance_s)),
    ...(input.loop ? ranges('loop_seam', loopSeam(frames), limits.loop_seam_deg) : []),
    ...ranges('speed_match', speedMatch(frames), limits.speed_match_pct),
  ];
  // A check takes points once, from its worst issue.
  const worst = new Map<MotionCheckId, number>();
  for (const issue of all) worst.set(issue.check, Math.max(worst.get(issue.check) ?? 0, penalty(issue)));
  const score = Math.max(0, Math.round(100 - [...worst.values()].reduce((sum, value) => sum + value, 0)));
  const issues = all.sort((a, b) => penalty(b) - penalty(a) || a.from - b.from).slice(0, 50);
  return { move: input.move, body: input.body, style: input.style, score, frames: frames.length, issues };
}

/** The grid's ranked list: worst cells first, then by move and body so the order never changes between runs. */
export function rankCells(cells: readonly MotionCheckCell[]): MotionCheckCell[] {
  return [...cells].sort((a, b) => a.score - b.score || a.move.localeCompare(b.move) || a.body.localeCompare(b.body) || a.style.localeCompare(b.style));
}
