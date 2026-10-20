import { z } from 'zod';

/**
 * Board M16: one base set of moves, three motion styles derived from it, and a check of every move on every body.
 * A style is numbers only (timing curve, amplitude, holds, transition, cancel points); the moves stay one base set.
 * The check limits are proposals per style; the Lab keeps them per style and the owner can change them.
 */
export const MOTION_STYLES = ['realistic', 'game', 'anime'] as const;
export const MotionStyleId = z.enum(MOTION_STYLES);
export type MotionStyleId = z.infer<typeof MotionStyleId>;

export const MotionStyleParams = z.object({
  /** Cubic timing curve [x1, y1, x2, y2] applied inside each move's phases (CSS-style bezier, 0–1). */
  timing: z.tuple([z.number().min(0).max(1), z.number().min(-1).max(2), z.number().min(0).max(1), z.number().min(-1).max(2)]),
  /** Pose size against the base: 1 = base, anime 1.2–1.4. Scales joint rotations away from rest, never foot contact. */
  amplitude: z.number().min(0.5).max(2),
  /** Seconds held at a move's peak pose. */
  hold_s: z.number().min(0).max(1),
  /** Blend time between moves. */
  transition_s: z.number().min(0.03).max(1),
  /** Clear points where an input may cancel the move (attack → run). */
  cancel_points: z.boolean(),
  /** Extra follow-through on arms and hair: 0 = none, 1 = strong. */
  overlap: z.number().min(0).max(1),
}).strict();
export type MotionStyleParams = z.infer<typeof MotionStyleParams>;

export const MOTION_CHECKS = ['foot_slide', 'ground', 'joint_limits', 'body_clash', 'balance', 'loop_seam', 'speed_match'] as const;
export const MotionCheckId = z.enum(MOTION_CHECKS);
export type MotionCheckId = z.infer<typeof MotionCheckId>;

export const MotionCheckLimits = z.object({
  /** How far a planted foot may drift on the ground over one contact (cm). */
  foot_slide_cm: z.number().min(0).max(20),
  /** How deep a foot or the body may go below the floor (cm). */
  ground_cm: z.number().min(0).max(10),
  /** Degrees allowed past human joint limits (knee forward, elbow backward, extra twist). */
  joint_extra_deg: z.number().min(0).max(45),
  /** How deep a hand or leg may pass into the body (cm). */
  body_clash_cm: z.number().min(0).max(10),
  /** Longest time the weight may stay outside the feet while standing (s); null = not scored (held poses are fine). */
  balance_s: z.number().min(0).max(2).nullable(),
  /** Largest joint difference between the last and the first frame of a loop (degrees). */
  loop_seam_deg: z.number().min(0).max(30),
  /** Feet speed against body speed while moving (± %). */
  speed_match_pct: z.number().min(0).max(100),
}).strict();
export type MotionCheckLimits = z.infer<typeof MotionCheckLimits>;

export const MotionStyle = z.object({ id: MotionStyleId, params: MotionStyleParams, limits: MotionCheckLimits }).strict();
export type MotionStyle = z.infer<typeof MotionStyle>;

/** The board's proposals. Realistic is the base every style starts from. */
export const DEFAULT_MOTION_STYLES: Record<MotionStyleId, MotionStyle> = {
  realistic: { id: 'realistic', params: { timing: [0.42, 0, 0.58, 1], amplitude: 1, hold_s: 0, transition_s: 0.3, cancel_points: false, overlap: 0.2 },
    limits: { foot_slide_cm: 1, ground_cm: 0, joint_extra_deg: 0, body_clash_cm: 0, balance_s: 0.1, loop_seam_deg: 2, speed_match_pct: 10 } },
  game: { id: 'game', params: { timing: [0.2, 0, 0.4, 1], amplitude: 1, hold_s: 0, transition_s: 0.12, cancel_points: true, overlap: 0.1 },
    limits: { foot_slide_cm: 1.5, ground_cm: 0, joint_extra_deg: 0, body_clash_cm: 0, balance_s: 0.2, loop_seam_deg: 2, speed_match_pct: 15 } },
  anime: { id: 'anime', params: { timing: [0.6, -0.3, 0.2, 1.2], amplitude: 1.3, hold_s: 0.12, transition_s: 0.12, cancel_points: true, overlap: 0.6 },
    limits: { foot_slide_cm: 1, ground_cm: 0, joint_extra_deg: 15, body_clash_cm: 0, balance_s: null, loop_seam_deg: 2, speed_match_pct: 10 } },
};

/** Default style of a place: Realistic worlds, films and Avatar Live → realistic; Simple and Voxel → game; Anime → anime. */
export function defaultMotionStyle(worldStyle: string): MotionStyleId {
  return worldStyle === 'anime' ? 'anime' : worldStyle === 'blocky' || worldStyle === 'voxel' ? 'game' : 'realistic';
}

/** One problem in one move: the check, the frames it covers and how far over the limit it is. */
export const MotionCheckIssue = z.object({ check: MotionCheckId, from: z.number().int().min(0), to: z.number().int().min(0), value: z.number(),
  limit: z.number(), unit: z.enum(['cm', 'deg', 's', '%']) }).strict();
export type MotionCheckIssue = z.infer<typeof MotionCheckIssue>;

/** One cell of the check grid: a move on a body in a style, 0–100 and its issues (worst first). */
export const MotionCheckCell = z.object({ move: z.string().min(1).max(150), body: z.string().min(1).max(150), style: MotionStyleId,
  score: z.number().int().min(0).max(100), frames: z.number().int().min(0), issues: z.array(MotionCheckIssue).max(50) }).strict();
export type MotionCheckCell = z.infer<typeof MotionCheckCell>;

export const MotionCheckReport = z.object({ step: z.number().positive(), seed: z.number().int(), cells: z.array(MotionCheckCell).max(5000) }).strict();
export type MotionCheckReport = z.infer<typeof MotionCheckReport>;
