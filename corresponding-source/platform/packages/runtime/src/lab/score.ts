import type { LabCourse, LabScore } from '@genvr/contracts';
import { courseBoxes, groundAt } from './course.js';
import { LAB_GROUND_MOVES, type LabRunResult } from './sim.js';

/**
 * Scores of one run (board M3), read from its frames:
 * - foot slide: how far planted feet move over the ground (cm, both feet, whole run);
 * - penetration: the deepest a foot goes below the ground or an obstacle top under it (cm);
 * - fall, car hit, finished: from the run's events;
 * - time: start to the end of the run;
 * - smoothness: 1 / (1 + mean jerk / 300) of the body path (1 = no jerk).
 * Total 0–100 (weights below, also written in the motion-lab skill).
 */
export const LAB_SCORE_WEIGHTS = { slidePerCm: 1.2, slideMax: 30, penetrationPerCm: 2, penetrationMax: 20, slowMax: 20, roughMax: 20, fallCap: 20, carCap: 10, unfinishedFactor: 0.5 } as const;

export function scoreLabRun(course: LabCourse, run: LabRunResult): LabScore {
  const boxes = courseBoxes(course);
  const { frames, events } = run;
  let slide = 0, pen = 0;
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1]!, b = frames[i]!;
    for (let f = 0; f < 2; f++) {
      const fa = a.feet[f]!, fb = b.feet[f]!;
      if (fa.planted && fb.planted) slide += Math.hypot(fb.x - fa.x, fb.z - fa.z);
      if (b.tilt < 30) {
        const g = groundAt(course, fb.x, fb.z, boxes);
        if (g >= 0) pen = Math.max(pen, g - fb.y);
      }
    }
  }
  const fell = events.some((e) => e.kind === 'fall');
  const carHit = events.some((e) => e.kind === 'car_hit');
  const finished = events.some((e) => e.kind === 'finish');
  const time = frames.length ? frames[frames.length - 1]!.t : 0;
  // Jerk of the body path (third difference of position over the fixed step).
  let jerk = 0, n = 0;
  for (let i = 3; i < frames.length; i++) {
    const p = [frames[i - 3]!, frames[i - 2]!, frames[i - 1]!, frames[i]!];
    const dt = p[3]!.t - p[2]!.t || 1 / 60;
    const jz = (p[3]!.z - 3 * p[2]!.z + 3 * p[1]!.z - p[0]!.z) / dt ** 3;
    const jy = (p[3]!.y - 3 * p[2]!.y + 3 * p[1]!.y - p[0]!.y) / dt ** 3;
    jerk += Math.hypot(jz, jy); n++;
  }
  const smoothness = 1 / (1 + (n ? jerk / n : 0) / 300);
  const w = LAB_SCORE_WEIGHTS;
  const slideCm = slide * 100, penCm = Math.max(0, pen * 100);
  const move = LAB_GROUND_MOVES[run.settings.motion] ?? LAB_GROUND_MOVES.Walk!;
  const ideal = Math.max(1, (course.finish_z + 1) / Math.max(run.settings.speed, move.speed * 0.5));
  const waited = frames.filter((f) => f.clip === 'Idle').length / 60;
  let total = 100
    - Math.min(w.slideMax, slideCm * w.slidePerCm)
    - Math.min(w.penetrationMax, penCm * w.penetrationPerCm)
    - Math.min(w.slowMax, Math.max(0, (time - waited) / ideal - 1) * 20)
    - (1 - smoothness) * w.roughMax;
  if (fell) total = Math.min(total, w.fallCap);
  if (carHit) total = Math.min(total, w.carCap);
  if (!finished) total *= w.unfinishedFactor;
  return {
    foot_slide_cm: round1(slideCm),
    penetration_cm: round1(penCm),
    fell,
    car_hit: carHit,
    finished,
    time_s: round1(time),
    smoothness: Math.round(smoothness * 100) / 100,
    total: Math.max(0, Math.round(total)),
  };
}

function round1(n: number): number { return Math.round(n * 10) / 10; }
