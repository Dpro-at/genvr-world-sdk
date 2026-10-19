import { z } from 'zod';

/**
 * Motion lab (MOTION-LAB L1 + L2): an empty grey test world with a measured course, a street with box cars, repeatable
 * runs of a move, scores and motion versions. A lab is its own project (never a real world). Everything a person does in
 * the Lab area, an agent does through the `motion_lab` tool with the same owner gates.
 */
export const LAB_FORMAT = 1;
/** Runs are repeatable: a fixed step and a seed give the same run every time. */
export const LAB_STEP = 1 / 60;
/** Runs kept with their frames (Q-LAB-2): the last 20, plus the frames of the best version. */
export const LAB_KEEP_RUNS = 20;
/** The lab character (Mohamed, 2026-10-19): our latest robot, body id `robot` ("Standard robot"). */
export const LAB_CHARACTER = 'robot';

const labId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/, 'Use a short id: lower-case letters, digits and dashes.');
const metres = (min: number, max: number) => z.number().min(min).max(max);

/** Where an obstacle stands: `z` metres along the course from the start line, `x` sideways (0 = the centre line). */
const place = { id: labId, z: metres(0, 60), x: metres(-10, 10).default(0), hidden: z.boolean().default(false) };

export const LabStep = z.object({ ...place, kind: z.literal('step'), height: metres(0.05, 0.6).default(0.3), depth: metres(0.2, 2).default(0.6),
  width: metres(0.5, 6).default(3) }).strict();
export const LabRamp = z.object({ ...place, kind: z.literal('ramp'), rise: metres(0.1, 2).default(0.8), length: metres(1, 10).default(3),
  /** A flat top after the slope, at the ramp's full height. */
  top: metres(0, 4).default(1), width: metres(0.5, 6).default(3) }).strict();
/** A gap between two raised blocks: `width` is the jump (metres of nothing), `height` the blocks' height. */
export const LabGap = z.object({ ...place, kind: z.literal('gap'), width: metres(0.2, 3).default(1), height: metres(0, 2).default(0.8),
  /** Landing block higher (+) or lower (−) than the take-off block. */
  landing: metres(-1, 1).default(0), landing_depth: metres(0.5, 4).default(1.2), lane: metres(0.5, 6).default(3) }).strict();
export const LabLowWall = z.object({ ...place, kind: z.literal('low_wall'), height: metres(0.3, 1.5).default(0.9), thickness: metres(0.1, 0.6).default(0.3),
  width: metres(0.5, 8).default(4) }).strict();
export const LabWindow = z.object({ ...place, kind: z.literal('window'), sill: metres(0.3, 1.5).default(0.9), opening_width: metres(0.5, 2).default(1),
  opening_height: metres(0.4, 2).default(0.8), wall_height: metres(2, 4).default(2.4), wall_width: metres(1, 10).default(5),
  thickness: metres(0.1, 0.6).default(0.3) }).strict();
export const LabObstacle = z.discriminatedUnion('kind', [LabStep, LabRamp, LabGap, LabLowWall, LabWindow]);
export type LabObstacle = z.infer<typeof LabObstacle>;
export type LabObstacleKind = LabObstacle['kind'];
export const LAB_OBSTACLE_KINDS: readonly LabObstacleKind[] = ['step', 'ramp', 'gap', 'low_wall', 'window'];
/** Shown in the Add tiles but not built yet (later phases). */
export const LAB_LATER_KINDS = ['beam', 'door', 'uneven', 'moving_platform'] as const;

/** A street across the course: lanes run along x; the crossing is on the course's centre line. */
export const LabStreet = z.object({
  z: metres(0, 80).default(22),
  lanes: z.number().int().min(1).max(4).default(2),
  lane_width: metres(2, 5).default(3),
  crossing: z.boolean().default(true),
  /** Traffic light for walkers: red for `red_s`, then green, repeating every `cycle_s`. */
  light: z.object({ cycle_s: metres(5, 120).default(30), red_s: metres(1, 110).default(20) }).strict().default({ cycle_s: 30, red_s: 20 }),
}).strict();
export type LabStreet = z.infer<typeof LabStreet>;

/** A box car on a loop along one lane; `runs_red`: it does not stop for its red light (an edge case). */
export const LabCar = z.object({
  id: labId,
  lane: z.number().int().min(0).max(3).default(0),
  speed: metres(0, 30).default(8),
  /** Seconds after the run's start when the car is at the crossing for the first time. */
  offset_s: metres(0, 120).default(6),
  runs_red: z.boolean().default(false),
}).strict();
export type LabCar = z.infer<typeof LabCar>;

export const LabCourse = z.object({
  format: z.literal(LAB_FORMAT).default(LAB_FORMAT),
  seed: z.number().int().min(0).max(2 ** 31 - 1).default(4127),
  obstacles: z.array(LabObstacle).max(40).default([]),
  street: LabStreet.nullable().default(null),
  cars: z.array(LabCar).max(8).default([]),
  /** Where the run ends (metres along the course). */
  finish_z: metres(2, 120).default(30),
}).strict().superRefine((course, ctx) => {
  const ids = new Set<string>();
  for (const [i, o] of [...course.obstacles, ...course.cars].entries()) {
    if (ids.has(o.id)) ctx.addIssue({ code: 'custom', message: `Two parts share the id "${o.id}".`, path: ['obstacles', i, 'id'] });
    ids.add(o.id);
  }
  if (course.street) for (const [i, car] of course.cars.entries())
    if (car.lane >= course.street.lanes) ctx.addIssue({ code: 'custom', message: `Car "${car.id}" is on lane ${car.lane}, the street has ${course.street.lanes}.`, path: ['cars', i, 'lane'] });
  if (course.street && course.street.light.red_s >= course.street.light.cycle_s)
    ctx.addIssue({ code: 'custom', message: 'The red time must be shorter than the whole light cycle.', path: ['street', 'light', 'red_s'] });
});
export type LabCourse = z.infer<typeof LabCourse>;

/** How the character runs the course. `motion`: the base move from the Moves list (Walk, Run …). */
export const LabRunSettings = z.object({
  motion: z.string().min(1).max(60).default('Walk'),
  character: z.string().min(1).max(60).default(LAB_CHARACTER),
  speed: metres(0.5, 8).default(1.6),
  stride: metres(0.3, 1.6).default(0.74),
  /** How high the feet lift over a step (metres). */
  step_height: metres(0.05, 0.6).default(0.32),
  /** Take-off before (−) or after (+) the edge of a gap, in milliseconds. */
  jump_timing_ms: z.number().int().min(-300).max(300).default(-20),
  blend_s: metres(0, 1).default(0.25),
  lean_deg: z.number().min(-20).max(20).default(4),
  /** Waits at the crossing for green (true) or crosses at once (false). */
  wait_for_green: z.boolean().default(true),
}).strict();
export type LabRunSettings = z.infer<typeof LabRunSettings>;

export const LabScore = z.object({
  /** Planted feet drifting over the ground, both feet, whole run (cm). */
  foot_slide_cm: z.number().min(0),
  /** Deepest a foot or the body went into the floor or an obstacle (cm). */
  penetration_cm: z.number().min(0),
  fell: z.boolean(),
  car_hit: z.boolean(),
  finished: z.boolean(),
  time_s: z.number().min(0),
  /** 1 = no jerk, 0 = very jerky. */
  smoothness: z.number().min(0).max(1),
  total: z.number().min(0).max(100),
}).strict();
export type LabScore = z.infer<typeof LabScore>;

export const LabEventKind = z.enum(['start', 'step', 'ramp', 'gap_jump', 'land', 'vault', 'window', 'wait', 'crossing', 'car_near', 'car_hit', 'fall', 'slide', 'blocked', 'finish']);
export const LabEvent = z.object({ t: z.number().min(0), kind: LabEventKind, label: z.string().max(120), obstacle: labId.optional() }).strict();
export type LabEvent = z.infer<typeof LabEvent>;

export const LabRun = z.object({
  id: labId,
  at: z.string().max(40),
  seed: z.number().int().min(0),
  settings: LabRunSettings,
  /** The course as it was: a run is replayed from course + settings + seed (its frames are not stored). */
  course: LabCourse,
  score: LabScore,
  events: z.array(LabEvent).max(400),
  /** The version this run was made from, if any. */
  version: labId.optional(),
  by: z.enum(['person', 'agent']).default('person'),
}).strict();
export type LabRun = z.infer<typeof LabRun>;

export const MotionVersion = z.object({
  id: labId,
  motion: z.string().min(1).max(60),
  n: z.number().int().min(1).max(9999),
  note: z.string().max(120).default(''),
  settings: LabRunSettings,
  score: LabScore,
  run: labId,
  best: z.boolean().default(false),
  by: z.enum(['person', 'agent']).default('person'),
  at: z.string().max(40),
}).strict();
export type MotionVersion = z.infer<typeof MotionVersion>;

/** The lab part of a lab project. An agent's "make best" waits in `best_pending` until the owner confirms. */
export const LabProjectData = z.object({
  format: z.literal(LAB_FORMAT).default(LAB_FORMAT),
  course: LabCourse.default(() => LabCourse.parse({})),
  settings: LabRunSettings.default(() => LabRunSettings.parse({})),
  runs: z.array(LabRun).max(LAB_KEEP_RUNS).default([]),
  versions: z.array(MotionVersion).max(500).default([]),
  best_pending: z.object({ version: labId, by: z.string().max(80) }).strict().nullable().default(null),
}).strict();
export type LabProjectData = z.infer<typeof LabProjectData>;

export const LAB_OVERLAYS = ['skeleton', 'feet', 'balance', 'speed', 'ghost', 'measures'] as const;
export const LabOverlay = z.enum(LAB_OVERLAYS);
export type LabOverlay = z.infer<typeof LabOverlay>;
export const LabPlaySpeed = z.union([z.literal(0.25), z.literal(0.5), z.literal(1), z.literal(2)]);

const obstaclePatch = z.object({ z: metres(0, 60), x: metres(-10, 10), hidden: z.boolean(), height: metres(0, 4), depth: metres(0.2, 4), width: metres(0.2, 10),
  rise: metres(0.1, 2), length: metres(1, 10), top: metres(0, 4), landing: metres(-1, 1), landing_depth: metres(0.5, 4), lane: metres(0.5, 6),
  thickness: metres(0.1, 0.6), sill: metres(0.3, 1.5), opening_width: metres(0.5, 2), opening_height: metres(0.4, 2), wall_height: metres(2, 4),
  wall_width: metres(1, 10) }).partial().strict();

/** The `motion_lab` agent tool: one operation per call (or a batch). Same owner gates as the Lab area. */
export const MotionLabOperation = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('inspect') }).strict(),
  z.object({ kind: z.literal('commands') }).strict(),
  z.object({ kind: z.literal('course_get') }).strict(),
  z.object({ kind: z.literal('course_set'), course: z.unknown() }).strict(),
  z.object({ kind: z.literal('obstacle_add'), obstacle: z.unknown() }).strict(),
  z.object({ kind: z.literal('obstacle_set'), id: labId, set: obstaclePatch }).strict(),
  z.object({ kind: z.literal('obstacle_remove'), id: labId }).strict(),
  z.object({ kind: z.literal('course_from_seed'), seed: z.number().int().min(0).max(2 ** 31 - 1), obstacles: z.number().int().min(1).max(12).default(5),
    hardness: z.number().int().min(1).max(5).default(2), street: z.boolean().default(true) }).strict(),
  z.object({ kind: z.literal('traffic_set'), street: LabStreet.nullable().optional(), cars: z.array(LabCar).max(8).optional() }).strict(),
  z.object({ kind: z.literal('settings_set'), settings: LabRunSettings.partial() }).strict(),
  z.object({ kind: z.literal('run'), settings: LabRunSettings.partial().optional(), version: labId.optional() }).strict(),
  z.object({ kind: z.literal('runs_list') }).strict(),
  z.object({ kind: z.literal('scores'), run: labId.optional() }).strict(),
  z.object({ kind: z.literal('frame'), run: labId.optional(), t: z.number().min(0).max(600) }).strict(),
  z.object({ kind: z.literal('view_set'), overlays: z.array(LabOverlay).max(6).optional(), speed: LabPlaySpeed.optional() }).strict(),
  z.object({ kind: z.literal('versions') }).strict(),
  z.object({ kind: z.literal('save_version'), run: labId.optional(), note: z.string().max(120).optional() }).strict(),
  /** A person makes a version the best at once; an agent's request waits for the owner (`best_pending`). */
  z.object({ kind: z.literal('save_best'), version: labId }).strict(),
  z.object({ kind: z.literal('rollback'), version: labId }).strict(),
  z.object({ kind: z.literal('version_delete'), version: labId, confirm: z.literal(true) }).strict(),
]);
export type MotionLabOperation = z.infer<typeof MotionLabOperation>;
export const MOTION_LAB_KINDS = MotionLabOperation.options.map((o) => o.shape.kind.value);
