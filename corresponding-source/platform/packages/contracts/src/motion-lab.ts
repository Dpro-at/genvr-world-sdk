import { z } from 'zod';
import { LAB_MAX_STATIONS, LAB_STATION_KINDS, LabProp, LabStation, stationProblems } from './motion-lab-stations.js';

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
/** Board M17: the Lab uses the project's avatar (the Avatar tab) unless a character is picked in the Lab. */
export const LAB_FOLLOW_AVATAR = 'avatar';
/** A body id (`robot`) or an imported character's id (`user.….character`, about 90 characters). */
const characterId = z.string().min(1).max(150);

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
  /** Board M18: training stations in the lab (jump pit, grasp table, pool …) and the objects on them. */
  stations: z.array(LabStation).max(LAB_MAX_STATIONS).default([]),
  props: z.array(LabProp).max(80).default([]),
}).strict().superRefine((course, ctx) => {
  const ids = new Set<string>();
  for (const [i, o] of [...course.obstacles, ...course.cars].entries()) {
    if (ids.has(o.id)) ctx.addIssue({ code: 'custom', message: `Two parts share the id "${o.id}".`, path: ['obstacles', i, 'id'] });
    ids.add(o.id);
  }
  for (const message of stationProblems(course.stations, [...ids], course.props)) ctx.addIssue({ code: 'custom', message, path: ['stations'] });
  if (course.street) for (const [i, car] of course.cars.entries())
    if (car.lane >= course.street.lanes) ctx.addIssue({ code: 'custom', message: `Car "${car.id}" is on lane ${car.lane}, the street has ${course.street.lanes}.`, path: ['cars', i, 'lane'] });
  if (course.street && course.street.light.red_s >= course.street.light.cycle_s)
    ctx.addIssue({ code: 'custom', message: 'The red time must be shorter than the whole light cycle.', path: ['street', 'light', 'red_s'] });
});
export type LabCourse = z.infer<typeof LabCourse>;

/** How the character runs the course. `motion`: the base move from the Moves list (Walk, Run …). */
export const LabRunSettings = z.object({
  motion: z.string().min(1).max(60).default('Walk'),
  character: characterId.default(LAB_CHARACTER),
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
/** A change to some run settings. Without defaults, so the settings not named keep their current values. */
const runShape = LabRunSettings.shape;
export const LabRunSettingsPatch = z.object({ motion: runShape.motion.unwrap(), character: runShape.character.unwrap(), speed: runShape.speed.unwrap(),
  stride: runShape.stride.unwrap(), step_height: runShape.step_height.unwrap(), jump_timing_ms: runShape.jump_timing_ms.unwrap(),
  blend_s: runShape.blend_s.unwrap(), lean_deg: runShape.lean_deg.unwrap(), wait_for_green: runShape.wait_for_green.unwrap() }).partial().strict();
export type LabRunSettingsPatch = z.infer<typeof LabRunSettingsPatch>;

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

export const LabEventKind = z.enum(['start', 'step', 'ramp', 'gap_jump', 'land', 'vault', 'window', 'wait', 'crossing', 'car_near', 'car_hit', 'fall', 'slide', 'blocked', 'finish',
  // Board M18 · stations.
  'take_off', 'foul', 'grab', 'drop', 'place', 'swing_hit', 'water_in', 'float', 'stroke', 'ladder', 'bar_touch']);
export const LabEvent = z.object({ t: z.number().min(0), kind: LabEventKind, label: z.string().max(120), obstacle: labId.optional(), station: labId.optional() }).strict();
export type LabEvent = z.infer<typeof LabEvent>;

/**
 * Motions made in the Lab by pose and key frames (board M11). A key is the pose of some joints on one frame: slider
 * values with the same keys as the Avatar pose panel (`head.nod`, `R.elbow.bend`, `L.index.mid` …, degrees or %)
 * plus where the hips are (`root.x`, `root.y`, `root.z`, metres). The lab fills the frames between keys, slider by
 * slider, from the key before (its ease) to the key after. Frames run at 60 per second, as runs do.
 */
export const LAB_POSE_FPS = 60;
export const LAB_POSE_MAX_FRAMES = 3600;
/** The key track's rows: which sliders a key holds decides the rows it shows in. */
export const LAB_POSE_ROWS = ['body', 'right_arm', 'right_hand', 'left_arm', 'left_hand', 'legs'] as const;
export const LabPoseRow = z.enum(LAB_POSE_ROWS);
export type LabPoseRow = z.infer<typeof LabPoseRow>;
/** Linear: straight from key to key; smooth: eases out of the key and into the next; hold: stays until the next key. */
export const LabPoseEase = z.enum(['linear', 'smooth', 'hold']);
export type LabPoseEase = z.infer<typeof LabPoseEase>;
export const LAB_LIMBS = ['left_hand', 'right_hand', 'left_foot', 'right_foot'] as const;
export const LabLimb = z.enum(LAB_LIMBS);
export type LabLimb = z.infer<typeof LabLimb>;
export const LabPoseKeyName = z.string().regex(/^([LR]\.)?[a-z]+\.[a-z]+$/, 'A pose slider like "head.nod", "R.elbow.bend" or "root.y".').max(24);
export const LabPoseValues = z.record(LabPoseKeyName, z.number().min(-360).max(360)).refine((v) => Object.keys(v).length <= 200, 'At most 200 sliders in one key.');
export type LabPoseValues = z.infer<typeof LabPoseValues>;
const poseFrame = z.number().int().min(0).max(LAB_POSE_MAX_FRAMES - 1);
export const LabPoseKey = z.object({ frame: poseFrame, ease: LabPoseEase.default('smooth'), values: LabPoseValues }).strict();
export type LabPoseKey = z.infer<typeof LabPoseKey>;
export const LabMadeMotion = z.object({
  id: labId,
  name: z.string().trim().min(1).max(60),
  /** Length in frames (60 per second). */
  frames: z.number().int().min(2).max(LAB_POSE_MAX_FRAMES).default(120),
  /** A loop runs from the last key back into the first (a walk); otherwise the last key holds. */
  loop: z.boolean().default(true),
  keys: z.array(LabPoseKey).max(400).default([]),
  /** Slider changes on a frame not keyed yet for that joint: kept here until Key (K) makes them a key. */
  draft: z.object({ frame: poseFrame, values: LabPoseValues }).strict().nullable().default(null),
  /** Hands and feet that stay where they are while other joints change (an editing aid). */
  pins: z.array(LabLimb).max(4).default([]),
  by: z.enum(['person', 'agent']).default('person'),
  at: z.string().max(40).default(''),
}).strict().superRefine((motion, ctx) => {
  const frames = new Set<number>();
  for (const [i, key] of motion.keys.entries()) {
    if (frames.has(key.frame)) ctx.addIssue({ code: 'custom', message: `Two keys on frame ${key.frame}.`, path: ['keys', i, 'frame'] });
    if (key.frame >= motion.frames) ctx.addIssue({ code: 'custom', message: `Key on frame ${key.frame}, the motion has ${motion.frames} frames.`, path: ['keys', i, 'frame'] });
    frames.add(key.frame);
  }
});
export type LabMadeMotion = z.infer<typeof LabMadeMotion>;

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
  /** A run of a motion made in the Lab (board M11): its natural pace measured from its keys, so a replay is exact. */
  move: z.object({ speed: z.number().min(0).max(20), stride: z.number().min(0).max(4) }).strict().optional(),
  /** Board M18: a run on a station and what it measured there (distance, foul, grabs …), shown above the common scores. */
  station: labId.optional(),
  station_score: z.lazy(() => LabStationScore).optional(),
}).strict();
export type LabRun = z.infer<typeof LabRun>;
/** What a run on a station measured: named values in the station's own units. */
export const LabStationScore = z.object({ kind: z.enum(LAB_STATION_KINDS as [LabStation['kind'], ...LabStation['kind'][]]),
  values: z.record(z.string().max(40), z.union([z.number(), z.string().max(40), z.null()])) }).strict();
export type LabStationScore = z.infer<typeof LabStationScore>;

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
  /** A motion made in the Lab (board M11): its keys as they were, so rolling back brings them back. */
  made: LabMadeMotion.optional(),
}).strict();
export type MotionVersion = z.infer<typeof MotionVersion>;

/**
 * Sharing a motion with the GenVR community (board M14). A version is first only on this device; sharing publishes it,
 * so an agent can only prepare a share (`pending`) and the owner confirms each one; the owner (or an agent, with
 * `confirm`) can stop sharing at any time. Never shareable: motions not made from a GenVR library move (for example
 * from Mixamo, Q-MIXAMO) or from a video the owner has no rights to.
 */
export const MOTION_SHARE_LICENCE = {
  id: 'genvr-community-1',
  name: 'GenVR community licence',
  /** Q-LAB-3, chosen by the owner on 2026-10-20. */
  text: 'Free to use in GenVR worlds and films, also commercially. Credit the creator. Do not sell or re-share the motion file on its own.',
} as const;
export const MotionShareTag = z.string().regex(/^[a-z0-9][a-z0-9-]{0,23}$/, 'Tags: lower-case letters, digits and dashes, up to 24.');
export const MotionShare = z.object({
  version: labId,
  /** `pending`: prepared, waits for the owner's OK. `shared`: the owner confirmed. `stopped`: the owner stopped sharing. */
  state: z.enum(['pending', 'shared', 'stopped']),
  name: z.string().trim().min(1).max(80),
  description: z.string().max(400).default(''),
  tags: z.array(MotionShareTag).max(8).default([]),
  character: characterId,
  score: z.number().min(0).max(100),
  /** Seconds of the version's run shown as the preview clip. */
  preview_s: metres(2, 10).default(4),
  licence: z.literal(MOTION_SHARE_LICENCE.id).default(MOTION_SHARE_LICENCE.id),
  prepared_by: z.string().min(1).max(80),
  prepared_at: z.string().max(40),
  shared_at: z.string().max(40).optional(),
  stopped_at: z.string().max(40).optional(),
  /** Where the share went: `local-preview` when no GenVR hosting is connected (nothing left the device). */
  where: z.enum(['local-preview', 'platform']).optional(),
  url: z.string().url().max(300).optional(),
}).strict();
export type MotionShare = z.infer<typeof MotionShare>;
/** What a share shows; the rest (character, score, licence) comes from the version. */
export const MotionShareDraft = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(400).optional(),
  tags: z.array(MotionShareTag).max(8).optional(),
  preview_s: metres(2, 10).optional(),
}).strict();
export type MotionShareDraft = z.infer<typeof MotionShareDraft>;

/** The lab part of a lab project. An agent's "make best" waits in `best_pending` until the owner confirms. */
export const LabProjectData = z.object({
  format: z.literal(LAB_FORMAT).default(LAB_FORMAT),
  course: LabCourse.default(() => LabCourse.parse({})),
  settings: LabRunSettings.default(() => LabRunSettings.parse({})),
  /** Who runs (board M17): `avatar` follows the Avatar tab; otherwise the character picked in the Lab. */
  who: characterId.default(LAB_FOLLOW_AVATAR),
  runs: z.array(LabRun).max(LAB_KEEP_RUNS).default([]),
  versions: z.array(MotionVersion).max(500).default([]),
  best_pending: z.object({ version: labId, by: z.string().max(80) }).strict().nullable().default(null),
  /** Board M14: shares of versions with the GenVR community (one per version). */
  shares: z.array(MotionShare).max(500).default([]),
  /** Board M11: motions made here by pose and key frames. */
  motions: z.array(LabMadeMotion).max(50).default([]),
}).strict().superRefine((data, ctx) => {
  const names = new Set<string>();
  for (const [i, m] of data.motions.entries()) {
    if (names.has(m.name.toLowerCase())) ctx.addIssue({ code: 'custom', message: `Two made motions are called "${m.name}".`, path: ['motions', i, 'name'] });
    names.add(m.name.toLowerCase());
  }
});
export type LabProjectData = z.infer<typeof LabProjectData>;

/**
 * Board M19: motions made in the Lab used in the game. Saving a version of a made motion puts it in My motions (a
 * private store on this device); a project then uses it as a player move on a key 1–8 (once or loop) or instead of
 * a base move of this project's avatar. The project keeps the motion's keys, so it plays without the lab.
 */
export const GAME_BASE_MOVES = ['Idle', 'Walk', 'Run', 'Jump'] as const;
export const GameBaseMove = z.enum(GAME_BASE_MOVES);
export type GameBaseMove = z.infer<typeof GameBaseMove>;
/** Below this pace (m/s, measured from its feet) a made motion does not travel and cannot replace Walk or Run. */
export const MADE_TRAVEL_PACE = 0.3;
export const MadeMotionRights = z.object({ shareable: z.boolean(), reasons: z.array(z.string().max(300)).max(8) }).strict();
/** One saved version of a made motion in My motions. */
export const MadeMotionEntry = z.object({
  id: labId,
  name: z.string().trim().min(1).max(60),
  n: z.number().int().min(1).max(9999),
  score: z.number().min(0).max(100),
  passes_course: z.boolean(),
  pace: z.object({ speed: z.number().min(0).max(20), stride: z.number().min(0).max(4) }).strict(),
  character: characterId,
  rights: MadeMotionRights,
  motion: LabMadeMotion,
  saved_at: z.string().max(40),
}).strict();
export type MadeMotionEntry = z.infer<typeof MadeMotionEntry>;
/** A made motion used in a project: on a key (slot) or instead of a base move (replaces). */
export const GameMadeMove = z.object({
  /** The My motions entry (a version id). */
  id: labId,
  name: z.string().trim().min(1).max(60),
  slot: z.number().int().min(1).max(8).optional(),
  replaces: GameBaseMove.optional(),
  once: z.boolean().default(true),
  passes_course: z.boolean(),
  pace: z.object({ speed: z.number().min(0).max(20), stride: z.number().min(0).max(4) }).strict(),
  rights: MadeMotionRights,
  motion: LabMadeMotion,
}).strict().superRefine((move, ctx) => {
  if ((move.slot === undefined) === (move.replaces === undefined)) ctx.addIssue({ code: 'custom', message: 'A game move is on a key (slot 1–8) or replaces a base move, one of the two.' });
  const why = madeMoveProblem(move);
  if (why) ctx.addIssue({ code: 'custom', message: why, path: ['replaces'] });
});
export type GameMadeMove = z.infer<typeof GameMadeMove>;
/** Why a made motion cannot replace a base move (null: it can). Walk and Run need a travelling loop that passes the course. */
export function madeMoveProblem(move: { replaces?: GameBaseMove | undefined; passes_course: boolean; pace: { speed: number }; motion: { loop: boolean }; name: string }): string | null {
  if (!move.replaces) return null;
  if ((move.replaces === 'Idle' || move.replaces === 'Walk' || move.replaces === 'Run') && !move.motion.loop) return `"${move.name}" does not loop; ${move.replaces} needs a loop.`;
  if (move.replaces === 'Walk' || move.replaces === 'Run') {
    if (move.pace.speed < MADE_TRAVEL_PACE) return `"${move.name}" does not travel (its feet give ${move.pace.speed} m/s); ${move.replaces} needs a motion that walks.`;
    if (!move.passes_course) return `"${move.name}" did not pass the course (it fell, was hit or did not finish); test it in the Lab first.`;
  }
  return null;
}
/** Every game move of a project: at most one per key and one per base move. */
export const GameMadeMoves = z.array(GameMadeMove).max(12).superRefine((moves, ctx) => {
  const used = new Set<string>();
  for (const [i, m] of moves.entries()) {
    const key = m.slot !== undefined ? `slot ${m.slot}` : `${m.replaces}`;
    if (used.has(key)) ctx.addIssue({ code: 'custom', message: `Two game moves on ${key}.`, path: [i] });
    used.add(key);
  }
});

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
  z.object({ kind: z.literal('settings_set'), settings: LabRunSettingsPatch }).strict(),
  /** Characters the Lab can use (board M17) and who runs now. */
  z.object({ kind: z.literal('characters') }).strict(),
  /** Pick who runs: a character id from `characters`, or `avatar` to follow the Avatar tab. */
  z.object({ kind: z.literal('who_set'), who: characterId }).strict(),
  z.object({ kind: z.literal('run'), settings: LabRunSettingsPatch.optional(), version: labId.optional(), station: labId.optional() }).strict(),
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
  // ---- training stations (board M18)
  /** Add a station: { station: { kind, z, x?, turn?, …sizes } }; the grasp table brings its 12 objects. */
  z.object({ kind: z.literal('station_add'), station: z.unknown() }).strict(),
  z.object({ kind: z.literal('station_set'), id: labId, set: z.record(z.string().max(40), z.unknown()) }).strict(),
  z.object({ kind: z.literal('station_remove'), id: labId, confirm: z.literal(true) }).strict(),
  /** Put the base lab's stations in the yard (replaces the stations and their objects). */
  z.object({ kind: z.literal('stations_base'), confirm: z.literal(true) }).strict(),
  z.object({ kind: z.literal('prop_add'), prop: z.unknown() }).strict(),
  z.object({ kind: z.literal('prop_set'), id: labId, set: z.record(z.string().max(40), z.unknown()) }).strict(),
  z.object({ kind: z.literal('prop_remove'), id: labId, confirm: z.literal(true) }).strict(),
  z.object({ kind: z.literal('conveyor_set'), id: labId, speed_mps: metres(0.1, 1).optional(), every_s: metres(1, 5).optional(), mix: z.boolean().optional() }).strict(),
  // ---- pose and key frames (board M11)
  /** Motions made in the Lab and the one open in Pose. */
  z.object({ kind: z.literal('pose_list') }).strict(),
  /** A new made motion (it opens in Pose): standing (arms down) or T-pose on frame 0. */
  z.object({ kind: z.literal('pose_new'), name: z.string().trim().min(1).max(60), frames: z.number().int().min(2).max(LAB_POSE_MAX_FRAMES).optional(),
    loop: z.boolean().optional(), from: z.enum(['stand', 't_pose']).default('stand') }).strict(),
  /** Open a made motion in Pose (by id or name), or change its length / loop. */
  z.object({ kind: z.literal('pose_open'), motion: z.string().min(1).max(60), frames: z.number().int().min(2).max(LAB_POSE_MAX_FRAMES).optional(), loop: z.boolean().optional() }).strict(),
  /** The pose on a frame: every slider, which rows have a key there, the joint law check, hands and feet in metres. */
  z.object({ kind: z.literal('pose_get'), frame: poseFrame }).strict(),
  /** Move one slider (joint + side) or several (`values`); it stops at the joint law. Pinned hands and feet stay. */
  z.object({ kind: z.literal('pose_set'), frame: poseFrame, joint: LabPoseKeyName.optional(), side: z.enum(['both', 'left', 'right']).default('both'),
    value: z.number().min(-360).max(360).optional(), values: LabPoseValues.optional() }).strict(),
  /** Key the pose of some rows (default: every row) on a frame. */
  z.object({ kind: z.literal('key_add'), frame: poseFrame, rows: z.array(LabPoseRow).max(6).optional(), ease: LabPoseEase.optional() }).strict(),
  /** Remove the key of some rows (default: every row) on a frame. */
  z.object({ kind: z.literal('key_remove'), frame: poseFrame, rows: z.array(LabPoseRow).max(6).optional() }).strict(),
  /** How the frames after a key are filled: linear, smooth or hold. */
  z.object({ kind: z.literal('key_ease'), frame: poseFrame, ease: LabPoseEase }).strict(),
  /** Copy the pose of some rows from one frame onto another as a key. */
  z.object({ kind: z.literal('key_copy'), from: poseFrame, to: poseFrame, rows: z.array(LabPoseRow).max(6).optional() }).strict(),
  /** Move a hand or foot (metres, x his left, y up, z his front, from his feet) and the arm or leg follows (two bones). */
  z.object({ kind: z.literal('limb_move'), frame: poseFrame, limb: LabLimb, target: z.tuple([z.number().min(-3).max(3), z.number().min(-1).max(3), z.number().min(-3).max(3)]).optional(),
    by: z.tuple([z.number().min(-2).max(2), z.number().min(-2).max(2), z.number().min(-2).max(2)]).optional() }).strict(),
  /** Pin a hand or foot where it is (or unpin it): it stays while other joints change. */
  z.object({ kind: z.literal('pin'), limb: LabLimb, on: z.boolean().default(true) }).strict(),
  /** Mirror the pose on a frame: swap his left and right, or copy one side onto the other. */
  z.object({ kind: z.literal('pose_mirror'), frame: poseFrame, mode: z.enum(['swap', 'left_to_right', 'right_to_left']).default('swap') }).strict(),
  /** Test in course: run the course with the open made motion. */
  z.object({ kind: z.literal('pose_test') }).strict(),
  /** Save as version: tests it in the course when its keys changed since the last test, then keeps that run as a version. */
  z.object({ kind: z.literal('pose_save_version'), note: z.string().max(120).optional() }).strict(),
  // ---- made motions in the game (board M19)
  /** Put a version of a made motion in My motions (Save as version does it too): { version? } (default: the newest of the open motion). */
  z.object({ kind: z.literal('made_to_moves'), version: labId.optional() }).strict(),
  // ---- sharing (board M14)
  /** My motions: every version with its share state and the rights checks. */
  z.object({ kind: z.literal('motions_mine') }).strict(),
  /** Motions we already have that are like this version (GenVR library moves and my shared versions). */
  z.object({ kind: z.literal('motion_similar'), version: labId }).strict(),
  /** Prepare a share (name, description, tags, preview). It waits for the owner's OK; nothing is published. */
  z.object({ kind: z.literal('share_prepare'), version: labId, share: MotionShareDraft }).strict(),
  /** Publish a prepared share. Owner only: an agent's call is refused and the share keeps waiting for the owner. */
  z.object({ kind: z.literal('share'), version: labId, confirm: z.literal(true) }).strict(),
  /** Stop sharing (or drop a prepared share). */
  z.object({ kind: z.literal('unshare'), version: labId, confirm: z.literal(true) }).strict(),
]);
export type MotionLabOperation = z.infer<typeof MotionLabOperation>;
export const MOTION_LAB_KINDS = MotionLabOperation.options.map((o) => o.shape.kind.value);
