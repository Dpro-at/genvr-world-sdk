import {
  LAB_CHARACTER,
  LAB_FOLLOW_AVATAR,
  LAB_KEEP_RUNS,
  LAB_LATER_KINDS,
  LAB_OBSTACLE_KINDS,
  LAB_OVERLAYS,
  LabCar,
  LabCourse,
  LabMadeMotion,
  LabObstacle,
  LabProjectData,
  LabRunSettings,
  LabStreet,
  LabProp,
  LabStation,
  LAB_STATION_KINDS,
  MOTION_LAB_KINDS,
  baseLabStations,
  graspTableProps,
  MOTION_SHARE_LICENCE,
  MotionLabOperation,
  MotionShare,
  MotionShareDraft,
  type BodyId,
  type LabLimb,
  type LabObstacleKind,
  type LabOverlay,
  type LabPoseEase,
  type LabPoseRow,
  type LabRun,
  type LabStationKind,
  type MotionVersion,
} from '@genvr/contracts';
import {
  courseFromSeed, defaultLabCourse, labGroundMove, labHoldPins, labKeyRows, labLimbMove, labLimbPositions, labMadeMotionPace, labMirror, labPoseAt,
  labPoseLimit, labPoseProblems, labPoseRow as labRowOf, labRowKeys, labAsk, labStandPose, labTPose, runStation, scoreLabRun, simulateLabRun, LAB_GROUND_MOVES, LAB_POSE_KEYS, LAB_RUNNABLE_STATIONS, STATION_REFERENCE_HIP,
  type LabFrame, type LabGroundMove, type LabPose, type LabPoseSide, type LabRunResult,
} from '@genvr/runtime';
import { madeEntry, type MadeMotionStore } from './made-moves';

/**
 * The motion lab's state and actions (MOTION-LAB L1 + L2). The Lab area and the `motion_lab` agent tool both go
 * through this one controller, so a person and an agent can do the same things with the same owner gates:
 * an agent may build courses, run, read scores and save versions; making a version the best waits for the owner.
 */
export type LabActor = { kind: 'person' } | { kind: 'agent'; name: string };
export const PERSON: LabActor = { kind: 'person' };
export type LabSpeed = 0.25 | 0.5 | 1 | 2;

export interface LabView {
  overlays: readonly LabOverlay[];
  speed: LabSpeed;
  playing: boolean;
  /** Playhead (s) in the shown run. */
  t: number;
  selected: string | null;
  /** The shown run (replayed from its course + settings + seed) and the best version's run for the ghost. */
  run: { id: string; result: LabRunResult } | null;
  ghost: LabRunResult | null;
  /** Board M11: Run shows runs on the course; Pose edits a made motion by pose and key frames. */
  mode: 'run' | 'pose';
  /** Board M18: Run goes on the course (null) or on this station. */
  station: string | null;
  pose: LabPoseView;
}
/** What the Pose mode shows: the open made motion, the frame, the chosen joints and the mouse tool. */
export interface LabPoseView {
  motion: string | null;
  frame: number;
  playing: boolean;
  group: string;
  side: LabPoseSide;
  tool: 'turn' | 'move' | 'pin';
  onion: boolean;
}
const ALL_ROWS: readonly LabPoseRow[] = ['body', 'right_arm', 'right_hand', 'left_arm', 'left_hand', 'legs'];

export const LAB_MOVES = Object.keys(LAB_GROUND_MOVES);

/**
 * Where the move's clip stands at run frame `index` (seconds into the clip). Ground moves advance with the distance
 * walked over their natural speed, so the feet keep pace with the floor at any speed and in slow motion; other moves
 * (jump, climb, landing) count the time since they began. Driven from the run, the pose also follows seeking.
 */
export function labClipTime(frames: readonly LabFrame[], index: number, legScale = 1, made: Readonly<Record<string, LabGroundMove>> = {}): number {
  const i = Math.max(0, Math.min(frames.length - 1, Math.floor(index)));
  const clip = frames[i]?.clip;
  if (!clip) return 0;
  let start = i;
  while (start > 0 && frames[start - 1]!.clip === clip) start--;
  // A longer-legged character covers more ground per step: its natural speed grows with its legs (board M17). A made
  // motion that does not travel (pace 0) counts time instead.
  const base = [...Object.values(LAB_GROUND_MOVES), ...Object.values(made).filter((m) => m.speed > 0.05)].find((move) => move.clip === clip)?.speed;
  const natural = base ? base * legScale : undefined;
  if (!natural) return frames[i]!.t - frames[start]!.t;
  let walked = 0;
  for (let k = start + 1; k <= i; k++) walked += Math.hypot(frames[k]!.x - frames[k - 1]!.x, frames[k]!.z - frames[k - 1]!.z);
  return walked / natural;
}

/**
 * Publishing shared motions needs a host adapter (GenVR hosting). Without one a share is a local preview: it is marked
 * shared on this device and nothing leaves it, and every message says so.
 */
export interface MotionSharePublisher {
  publish(share: MotionShare, version: MotionVersion): Promise<{ url?: string }>;
  unpublish(share: MotionShare): Promise<void>;
}
/** The rights checks a version must pass before it can be shared (board M14). */
export interface MotionShareRights { made_here: boolean; not_mixamo: boolean; video_rights: boolean; passes_course: boolean; reasons: string[] }
export type MotionShareStatus = 'private' | 'pending' | 'shared' | 'blocked';
export interface SimilarMotion { name: string; source: 'library' | 'mine'; alike: number; note: string }

/** A character the Lab can use (board M17): the Standard robot, or one imported into My characters. */
export interface LabCharacter {
  id: string;
  name: string;
  source: 'lab' | 'mine';
  /** Hip height (m), for the stride: a character with longer legs walks with longer steps. */
  leg: number;
}
/** Where the Lab finds characters: the Studio's body list and private library, and the project's avatar. */
export interface LabCharacterSource {
  list(): Promise<LabCharacter[]>;
  /** The Avatar tab's character for this project (a body id or a library id), or null for the default. */
  avatar(): Promise<string | null>;
  /** The body id the character stage draws for this character (an imported one is loaded first). */
  body(id: string): Promise<BodyId>;
  subscribe?(listener: () => void): () => void;
}
/** The lab robot's hip height (m, its LeftUpLeg joint), the scale every other character's stride is measured against. */
export const LAB_ROBOT_LEG = 0.84;
const ROBOT: LabCharacter = { id: LAB_CHARACTER, name: 'Standard robot', source: 'lab', leg: LAB_ROBOT_LEG };

export function newLabData(): LabProjectData {
  return LabProjectData.parse({ course: defaultLabCourse() });
}

export class LabController {
  #data: LabProjectData;
  #view: LabView = { overlays: ['skeleton', 'feet', 'balance', 'speed', 'ghost', 'measures'], speed: 1, playing: false, t: 0, selected: null, run: null, ghost: null,
    mode: 'run', station: null, pose: { motion: null, frame: 0, playing: false, group: 'Elbow', side: 'R', tool: 'turn', onion: false } };
  /** The made motion each run of this session used, as it was (Save as version keeps it with the version). */
  #runMotion = new Map<string, LabMadeMotion>();
  /** Board M19: My motions, where every saved version of a made motion goes. */
  #madeStore: MadeMotionStore | null = null;
  #listeners = new Set<() => void>();
  #version = 0;
  #onChange: (data: LabProjectData) => void;
  #publisher: MotionSharePublisher | null = null;
  #source: LabCharacterSource | null = null;
  #characters: LabCharacter[] = [ROBOT];
  #avatar: string | null = null;

  constructor(data: LabProjectData, onChange: (data: LabProjectData) => void = () => {}) {
    this.#data = LabProjectData.parse(data);
    this.#onChange = onChange;
    const last = this.#data.runs.at(-1);
    if (last) this.#view.run = { id: last.id, result: replay(last) };
    this.#view.pose = { ...this.#view.pose, motion: this.#data.motions[0]?.id ?? null };
    this.#view.ghost = this.#ghost();
  }

  get data(): LabProjectData { return this.#data; }
  get view(): LabView { return this.#view; }
  get version(): number { return this.#version; }
  subscribe = (listener: () => void) => { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; };
  getVersion = () => this.#version;

  #emit(saved: boolean) {
    this.#version++;
    if (saved) this.#onChange(this.#data);
    for (const listener of this.#listeners) listener();
  }
  #set(data: Partial<LabProjectData>) {
    this.#data = LabProjectData.parse({ ...this.#data, ...data });
    this.#emit(true);
  }
  #setView(view: Partial<LabView>) { this.#view = { ...this.#view, ...view }; this.#emit(false); }

  // ---- course (board M2)
  setCourse(input: unknown) {
    const course = LabCourse.parse(input);
    this.#data = LabProjectData.parse({ ...this.#data, course });
    this.#view = { ...this.#view, ghost: this.#ghost() };
    this.#emit(true);
    return course;
  }
  addObstacle(kind: LabObstacleKind, fields: Record<string, unknown> = {}) {
    if (!LAB_OBSTACLE_KINDS.includes(kind)) throw new Error(`"${kind}" is not built yet (later: ${LAB_LATER_KINDS.join(', ')}).`);
    const course = this.#data.course;
    const id = typeof fields.id === 'string' ? fields.id : freeId(course, kind.replace('_', '-'));
    const lastEnd = course.obstacles.reduce((z, o) => Math.max(z, o.z + 3), 3);
    const obstacle = LabObstacle.parse({ z: Math.min(60, lastEnd), ...fields, kind, id });
    this.setCourse({ ...course, obstacles: [...course.obstacles, obstacle] });
    this.select(obstacle.id);
    return obstacle;
  }
  setObstacle(id: string, patch: Record<string, unknown>) {
    const course = this.#data.course;
    const at = course.obstacles.findIndex((o) => o.id === id);
    if (at < 0) throw new Error(`No obstacle "${id}". Ask course_get for the ids.`);
    const next = LabObstacle.parse({ ...course.obstacles[at], ...patch, id, kind: course.obstacles[at]!.kind });
    this.setCourse({ ...course, obstacles: course.obstacles.map((o, i) => (i === at ? next : o)) });
    return next;
  }
  duplicateObstacle(id: string) {
    const o = this.#data.course.obstacles.find((x) => x.id === id);
    if (!o) throw new Error(`No obstacle "${id}".`);
    const { id: _id, kind, ...rest } = o;
    return this.addObstacle(kind, { ...rest, z: Math.min(60, o.z + 3) });
  }
  removeObstacle(id: string) {
    const course = this.#data.course;
    if (!course.obstacles.some((o) => o.id === id)) throw new Error(`No obstacle "${id}".`);
    this.setCourse({ ...course, obstacles: course.obstacles.filter((o) => o.id !== id) });
    if (this.#view.selected === id) this.select(null);
  }
  // ---- training stations (board M18)
  addStation(kind: LabStationKind, fields: Record<string, unknown> = {}) {
    if (!LAB_STATION_KINDS.includes(kind)) throw new Error(`"${kind}" is not a station (stations: ${LAB_STATION_KINDS.join(', ')}).`);
    const course = this.#data.course;
    const id = typeof fields.id === 'string' ? fields.id : freeId(course, kind.replace('_', '-'));
    const station = LabStation.parse({ z: 0, x: 0, ...fields, kind, id });
    // The grasp table comes with its 12 objects.
    const props = kind === 'grasp_table' && !course.props.some((p) => p.on === id) ? graspTableProps(id) : [];
    this.setCourse({ ...course, stations: [...course.stations, station], props: [...course.props, ...props] });
    this.select(station.id);
    return station;
  }
  setStation(id: string, patch: Record<string, unknown>) {
    const course = this.#data.course, at = course.stations.findIndex((s) => s.id === id);
    if (at < 0) throw new Error(`No station "${id}". Ask course_get for the ids.`);
    const next = LabStation.parse({ ...course.stations[at], ...patch, id, kind: course.stations[at]!.kind });
    this.setCourse({ ...course, stations: course.stations.map((s, i) => (i === at ? next : s)) });
    return next;
  }
  removeStation(id: string) {
    const course = this.#data.course;
    if (!course.stations.some((s) => s.id === id)) throw new Error(`No station "${id}".`);
    this.setCourse({ ...course, stations: course.stations.filter((s) => s.id !== id), props: course.props.filter((p) => p.on !== id) });
    if (this.#view.selected === id) this.select(null);
    if (this.#view.station === id) this.#setView({ station: null });
  }
  /** The base lab's stations in the 42 × 26 m yard (they replace the stations and their objects). */
  baseStations() {
    const stations = baseLabStations();
    this.setCourse({ ...this.#data.course, stations, props: stations.filter((s) => s.kind === 'grasp_table').flatMap((s) => graspTableProps(s.id)) });
    this.select(null);
    return this.#data.course.stations;
  }
  addProp(fields: Record<string, unknown>) {
    const course = this.#data.course;
    const prop = LabProp.parse({ ...fields, id: typeof fields.id === 'string' ? fields.id : freeId(course, 'prop') });
    this.setCourse({ ...course, props: [...course.props, prop] });
    return prop;
  }
  setProp(id: string, patch: Record<string, unknown>) {
    const course = this.#data.course, at = course.props.findIndex((p) => p.id === id);
    if (at < 0) throw new Error(`No object "${id}".`);
    const next = LabProp.parse({ ...course.props[at], ...patch, id });
    this.setCourse({ ...course, props: course.props.map((p, i) => (i === at ? next : p)) });
    return next;
  }
  removeProp(id: string) {
    const course = this.#data.course;
    if (!course.props.some((p) => p.id === id)) throw new Error(`No object "${id}".`);
    this.setCourse({ ...course, props: course.props.filter((p) => p.id !== id) });
  }
  setConveyor(id: string, patch: { speed_mps?: number | undefined; every_s?: number | undefined; mix?: boolean | undefined }) {
    const station = this.#data.course.stations.find((s) => s.id === id);
    if (station?.kind !== 'conveyor') throw new Error(`"${id}" is not a conveyor.`);
    return this.setStation(id, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)));
  }
  /** Where Run goes: the course (null) or a station with a phase-1 engine. */
  runOn(id: string | null) {
    if (id !== null) {
      const station = this.#data.course.stations.find((s) => s.id === id);
      if (!station) throw new Error(`No station "${id}".`);
      if (!LAB_RUNNABLE_STATIONS.includes(station.kind)) throw new Error(`Runs on the ${station.kind.replace('_', ' ')} come in a later phase.`);
    }
    this.#setView({ station: id });
  }
  fromSeed(seed: number, count = 5, hardness = 2, street = true) { const course = this.setCourse(courseFromSeed(seed, count, hardness, street)); this.select(null); return course; }
  setTraffic(street?: unknown, cars?: unknown[]) {
    const course = this.#data.course;
    return this.setCourse({ ...course, ...(street !== undefined ? { street: street === null ? null : LabStreet.parse(street) } : {}), ...(cars ? { cars: cars.map((c) => LabCar.parse(c)) } : {}) });
  }
  setSettings(patch: Partial<LabRunSettings>) { const settings = LabRunSettings.parse({ ...this.#data.settings, ...patch }); this.#set({ settings }); return settings; }

  // ---- who runs (board M17)
  /** Connects the Studio's characters; the list and the Avatar tab's choice are read again whenever they change. */
  setCharacterSource(source: LabCharacterSource | null) {
    this.#source = source;
    void this.refreshCharacters();
    return source?.subscribe?.(() => void this.refreshCharacters());
  }
  async refreshCharacters() {
    const source = this.#source;
    const [list, avatar] = source ? await Promise.all([source.list(), source.avatar()]) : [[], null];
    this.#characters = [ROBOT, ...list.filter((c) => c.id !== ROBOT.id)];
    this.#avatar = avatar;
    this.#view = { ...this.#view, ghost: this.#ghost() };
    this.#emit(false);
  }
  get characters(): readonly LabCharacter[] { return this.#characters; }
  /** The character the Avatar tab uses, when the Lab can use it (hidden bodies cannot); else null. */
  get avatarCharacter(): LabCharacter | null { return this.#characters.find((c) => c.id === this.#avatar) ?? null; }
  /** Who runs now: the Avatar tab's character when following it, else the picked one; the robot when either is gone. */
  get character(): LabCharacter {
    const who = this.#data.who;
    if (who === LAB_FOLLOW_AVATAR) return this.avatarCharacter ?? ROBOT;
    return this.#characters.find((c) => c.id === who) ?? ROBOT;
  }
  /** A character picked in the Lab that is no longer in My characters (the Lab uses the robot meanwhile). */
  get missingCharacter(): string | null {
    const who = this.#data.who;
    return who !== LAB_FOLLOW_AVATAR && !this.#characters.some((c) => c.id === who) ? who : null;
  }
  /** Leg length over the robot's, for the clip's pace on the floor. */
  get legScale(): number { return this.character.leg / LAB_ROBOT_LEG; }
  characterBody(id: string): Promise<BodyId> { return id === ROBOT.id || !this.#source ? Promise.resolve(LAB_CHARACTER) : this.#source.body(id); }
  setWho(who: string) {
    if (who !== LAB_FOLLOW_AVATAR && !this.#characters.some((c) => c.id === who))
      throw new Error(`No character "${who}". Ask characters for the ids, or use "${LAB_FOLLOW_AVATAR}" to follow the Avatar tab.`);
    this.#set({ who });
    this.#view = { ...this.#view, ghost: this.#ghost() };
    this.#emit(false);
    return { who, character: this.character };
  }

  // ---- runs (boards M1, M3)
  run(patch: Partial<LabRunSettings> = {}, by: LabActor = PERSON, fromVersion?: string, station: string | null = this.#view.station): LabRun {
    if (station) return this.#runStation(station, patch, by, fromVersion);
    let base = this.#data.settings;
    if (fromVersion) base = this.#versionById(fromVersion).settings;
    if (patch.character !== undefined && patch.character !== this.character.id) this.setWho(patch.character);
    const settings = LabRunSettings.parse({ ...base, ...patch, character: this.character.id });
    const course = this.#data.course;
    const made = this.madeMotion(settings.motion);
    const move = made ? labMadeMotionPace(made) : undefined;
    const result = simulateLabRun(course, settings, course.seed, made && move ? { [made.name]: { ...move, clip: made.name } } : {});
    const run: LabRun = {
      id: freeRunId(this.#data.runs),
      at: new Date().toISOString(),
      seed: course.seed,
      settings,
      course,
      score: scoreLabRun(course, result),
      events: result.events.slice(0, 400),
      ...(fromVersion ? { version: fromVersion } : {}),
      by: by.kind,
      ...(move ? { move } : {}),
    };
    if (made) this.#runMotion.set(run.id, made);
    this.#data = LabProjectData.parse({ ...this.#data, settings, runs: [...this.#data.runs, run].slice(-LAB_KEEP_RUNS) });
    this.#view = { ...this.#view, run: { id: run.id, result }, t: 0, playing: true, mode: 'run' };
    this.#emit(true);
    return run;
  }
  #runStation(id: string, patch: Partial<LabRunSettings>, by: LabActor, fromVersion?: string): LabRun {
    let base = this.#data.settings;
    if (fromVersion) base = this.#versionById(fromVersion).settings;
    if (patch.character !== undefined && patch.character !== this.character.id) this.setWho(patch.character);
    const settings = LabRunSettings.parse({ ...base, ...patch, character: this.character.id });
    const course = this.#data.course, hip = STATION_REFERENCE_HIP * this.legScale;
    const { result, score } = runStation(course, id, settings, course.seed, hip);
    const run: LabRun = { id: freeRunId(this.#data.runs), at: new Date().toISOString(), seed: course.seed, settings, course, score,
      events: result.events.slice(0, 400), ...(fromVersion ? { version: fromVersion } : {}), by: by.kind, station: id,
      station_score: { ...result.stationScore, values: { ...result.stationScore.values, hip_m: Math.round(hip * 1000) / 1000 } } };
    this.#data = LabProjectData.parse({ ...this.#data, settings, runs: [...this.#data.runs, run].slice(-LAB_KEEP_RUNS) });
    this.#view = { ...this.#view, run: { id: run.id, result }, t: 0, playing: true, mode: 'run', station: id };
    this.#emit(true);
    return run;
  }
  showRun(id: string) {
    const run = this.#data.runs.find((r) => r.id === id);
    if (!run) throw new Error(`No run "${id}" (the lab keeps the last ${LAB_KEEP_RUNS}).`);
    this.#setView({ run: { id, result: replay(run) }, t: 0, playing: false });
    return run;
  }
  runById(id?: string): LabRun {
    const run = id ? this.#data.runs.find((r) => r.id === id) : this.#data.runs.at(-1);
    if (!run) throw new Error(id ? `No run "${id}".` : 'No run yet. Use run first.');
    return run;
  }
  frameAt(t: number, runId?: string): LabFrame | null {
    const result = runId && runId !== this.#view.run?.id ? replay(this.runById(runId)) : this.#view.run?.result ?? (this.#data.runs.length ? replay(this.runById()) : null);
    if (!result || !result.frames.length) return null;
    return result.frames[Math.min(result.frames.length - 1, Math.max(0, Math.round(t * 60)))]!;
  }

  // ---- versions (board M3)
  saveVersion(runId?: string, note = '', by: LabActor = PERSON): MotionVersion {
    const run = this.runById(runId);
    const n = this.#data.versions.filter((v) => v.motion === run.settings.motion).length + 1;
    const made = this.#runMotion.get(run.id) ?? this.madeMotion(run.settings.motion);
    const version: MotionVersion = { id: freeVersionId(this.#data.versions, run.settings.motion, n), motion: run.settings.motion, n, note, settings: run.settings, score: run.score, run: run.id, best: false, by: by.kind, at: new Date().toISOString(),
      ...(made ? { made } : {}) };
    this.#set({ versions: [...this.#data.versions, version] });
    if (made) void this.toMoves(version.id).catch(() => { /* My motions is optional; made_to_moves reports problems */ });
    return version;
  }
  /** A person makes it the best at once; an agent's request waits for the owner. */
  saveBest(id: string, by: LabActor = PERSON): { best: string | null; pending: string | null } {
    const version = this.#versionById(id);
    if (by.kind === 'agent') {
      this.#set({ best_pending: { version: version.id, by: by.name } });
      return { best: this.best()?.id ?? null, pending: version.id };
    }
    const same = (v: MotionVersion) => v.motion === version.motion && v.settings.character === version.settings.character;
    this.#set({ versions: this.#data.versions.map((v) => ({ ...v, best: same(v) ? v.id === version.id : v.best })), best_pending: null });
    this.#view = { ...this.#view, ghost: this.#ghost() };
    this.#emit(false);
    return { best: version.id, pending: null };
  }
  confirmPendingBest() { const pending = this.#data.best_pending; if (pending) this.saveBest(pending.version, PERSON); }
  rejectPendingBest() { this.#set({ best_pending: null }); }
  /** Use a version's settings again; a made motion's version also brings its keys back (board M11). */
  rollback(id: string) {
    const v = this.#versionById(id);
    if (v.made) {
      const others = this.#data.motions.filter((m) => m.id !== v.made!.id && m.name.toLowerCase() !== v.made!.name.toLowerCase());
      this.#data = LabProjectData.parse({ ...this.#data, motions: [...others, v.made] });
      this.#view = { ...this.#view, pose: { ...this.#view.pose, motion: v.made.id, frame: 0 } };
    }
    this.setSettings(v.settings);
    return v;
  }
  /** An agent may delete only versions an agent made, never the best one; a person may delete any. */
  deleteVersion(id: string, by: LabActor = PERSON) {
    const version = this.#versionById(id);
    if (by.kind === 'agent' && (version.best || version.by !== 'agent')) throw new Error(version.best ? 'Only the owner can delete the best version.' : 'Only the owner can delete a version a person made.');
    if (this.shareOf(id)?.state === 'shared') throw new Error(`${id} is shared with the community: stop sharing it first.`);
    this.#set({ versions: this.#data.versions.filter((v) => v.id !== id), shares: this.#data.shares.filter((s) => s.version !== id), best_pending: this.#data.best_pending?.version === id ? null : this.#data.best_pending });
    this.#view = { ...this.#view, ghost: this.#ghost() };
    this.#emit(false);
  }
  /** The best version of a move for one character: scores only compare runs of the same character (board M17). */
  best(motion = this.#data.settings.motion, character = this.character.id): MotionVersion | undefined {
    return this.#data.versions.find((v) => v.best && v.motion === motion && v.settings.character === character);
  }
  #versionById(id: string) { const v = this.#data.versions.find((x) => x.id === id); if (!v) throw new Error(`No version "${id}". Ask versions for the ids.`); return v; }
  #ghost(): LabRunResult | null {
    const best = this.best();
    if (!best) return null;
    // The best version's settings on the course as it is now, so the ghost runs beside the new run on the same course
    // (it keeps working when the best run has left the last 20: a run is replayed from settings + course + seed).
    const made = best.made ?? this.madeMotion(best.motion);
    return simulateLabRun(this.#data.course, best.settings, this.#data.course.seed, made ? { [best.motion]: { ...labMadeMotionPace(made), clip: best.motion } } : {});
  }

  // ---- sharing with the GenVR community (board M14)
  setPublisher(publisher: MotionSharePublisher | null) { this.#publisher = publisher; }
  get publishing(): 'platform' | 'local-preview' { return this.#publisher ? 'platform' : 'local-preview'; }
  versionById(id: string) { return this.#versionById(id); }
  shareOf(id: string): MotionShare | undefined { return this.#data.shares.find((s) => s.version === id); }
  /** Made in this lab, from a GenVR library move on a GenVR character (never Mixamo), no source video, passes the course. */
  rights(id: string): MotionShareRights {
    const v = this.#versionById(id), reasons: string[] = [];
    const run = this.#data.runs.find((r) => r.id === v.run);
    const madeHere = Boolean(run) || v.run.startsWith('run-');
    // A motion made here by pose and key frames counts as made in the lab (board M11).
    const native = (Object.hasOwn(LAB_GROUND_MOVES, v.settings.motion) || Boolean(v.made)) && !v.settings.character.startsWith('user.');
    const passes = v.score.finished && !v.score.fell && !v.score.car_hit;
    if (!madeHere) reasons.push('It was not made in this lab.');
    if (!native) reasons.push(`"${v.settings.motion}" on "${v.settings.character}" is not a GenVR library move or a motion made in this lab, on a GenVR character (moves made from Mixamo are never shared).`);
    if (!passes) reasons.push(v.score.fell ? 'It falls on the course.' : v.score.car_hit ? 'A car hits it on the course.' : 'It does not finish the course.');
    // The lab has no video-to-motion yet (board M8), so no version has a source video.
    return { made_here: madeHere, not_mixamo: native, video_rights: true, passes_course: passes, reasons };
  }
  shareStatus(id: string): MotionShareStatus {
    const share = this.shareOf(id);
    if (share?.state === 'shared') return 'shared';
    if (!this.rights(id).reasons.length) return share?.state === 'pending' ? 'pending' : 'private';
    return 'blocked';
  }
  /** My motions: every version, newest first, with its share state. */
  mine() {
    return [...this.#data.versions].reverse().map((v) => {
      const share = this.shareOf(v.id), rights = this.rights(v.id);
      return { version: v.id, motion: v.motion, n: v.n, score: v.score.total, best: v.best, by: v.by, status: this.shareStatus(v.id), share: share ?? null, blocked: rights.reasons };
    });
  }
  /**
   * Motions we already have that are like this one: the GenVR library move it is made from (alike by pace, stride, lean
   * and step height — not pose by pose yet), and my other shared versions of the same move. The library move is also run
   * on this course so the two can be compared.
   */
  similar(id: string): SimilarMotion[] {
    const v = this.#versionById(id), natural = labGroundMove(v.settings.motion);
    const alike = (a: LabRunSettings, b: Pick<LabRunSettings, 'speed' | 'stride' | 'lean_deg' | 'step_height'>) => {
      const off = Math.abs(a.speed - b.speed) / b.speed * 0.45 + Math.abs(a.stride - b.stride) / b.stride * 0.35
        + Math.abs(a.lean_deg - b.lean_deg) / 40 * 0.1 + Math.abs(a.step_height - b.step_height) / 0.6 * 0.1;
      return Math.max(0, Math.min(100, Math.round(100 - off * 100)));
    };
    const defaults = LabRunSettings.parse({});
    const library = LabRunSettings.parse({ ...defaults, motion: v.settings.motion, speed: Math.min(8, Math.max(0.5, natural.speed)), stride: natural.stride });
    const course = this.#data.course;
    const libScore = scoreLabRun(course, simulateLabRun(course, library, course.seed));
    const out: SimilarMotion[] = Object.hasOwn(LAB_GROUND_MOVES, v.settings.motion) ? [{
      name: v.settings.motion, source: 'library', alike: alike(v.settings, library),
      note: `On this course: yours ${v.score.foot_slide_cm} cm foot slide, score ${v.score.total}; library ${libScore.foot_slide_cm} cm, score ${libScore.total}.`,
    }] : [];
    for (const other of this.#data.versions) {
      if (other.id === v.id || other.motion !== v.motion || this.shareOf(other.id)?.state !== 'shared') continue;
      out.push({ name: this.shareOf(other.id)!.name, source: 'mine', alike: alike(v.settings, other.settings), note: `Your shared ${other.id}, score ${other.score.total}.` });
    }
    return out.sort((a, b) => b.alike - a.alike);
  }
  /** Use the library move instead of this version (the person's "Use library one"): its natural pace and stride. */
  useLibraryMove(id: string) {
    const v = this.#versionById(id), natural = labGroundMove(v.settings.motion);
    return this.setSettings({ motion: v.settings.motion, speed: Math.min(8, Math.max(0.5, natural.speed)), stride: natural.stride });
  }
  /** Prepare a share. Nothing is published: it waits for the owner (`share`). Blocked versions cannot be prepared. */
  prepareShare(id: string, draft: MotionShareDraft, by: LabActor = PERSON): MotionShare {
    const v = this.#versionById(id), input = MotionShareDraft.parse(draft), rights = this.rights(id);
    if (rights.reasons.length) throw new Error(`This motion cannot be shared: ${rights.reasons.join(' ')}`);
    const old = this.shareOf(id);
    if (old?.state === 'shared') throw new Error(`${id} is already shared. Stop sharing first to change it.`);
    const share = MotionShare.parse({
      version: v.id, state: 'pending', name: input.name, description: input.description ?? old?.description ?? '', tags: input.tags ?? old?.tags ?? [],
      character: this.#characters.find((c) => c.id === v.settings.character)?.name ?? v.settings.character, score: v.score.total, preview_s: input.preview_s ?? old?.preview_s ?? 4,
      licence: MOTION_SHARE_LICENCE.id, prepared_by: by.kind === 'agent' ? by.name : 'you', prepared_at: new Date().toISOString(),
    });
    this.#set({ shares: [...this.#data.shares.filter((s) => s.version !== id), share] });
    return share;
  }
  /** Publish a prepared share. Owner only. Without a host adapter it is a local preview (nothing leaves the device). */
  async share(id: string, by: LabActor = PERSON): Promise<MotionShare> {
    const pending = this.shareOf(id);
    if (by.kind === 'agent') throw new Error(pending?.state === 'pending' ? `Only the owner shares a motion. "${pending.name}" is prepared and waits for their OK in the Lab (My motions).` : 'Only the owner shares a motion. Prepare it with share_prepare; the owner confirms it in the Lab.');
    if (!pending || pending.state !== 'pending') throw new Error(pending?.state === 'shared' ? `${id} is already shared.` : `Prepare ${id} first (name, description, tags).`);
    const rights = this.rights(id);
    if (rights.reasons.length) throw new Error(`This motion cannot be shared: ${rights.reasons.join(' ')}`);
    const version = this.#versionById(id);
    const published = this.#publisher ? await this.#publisher.publish(pending, version) : {};
    const share = MotionShare.parse({ ...pending, state: 'shared', shared_at: new Date().toISOString(), where: this.#publisher ? 'platform' : 'local-preview', ...(published.url ? { url: published.url } : {}) });
    this.#set({ shares: this.#data.shares.map((s) => (s.version === id ? share : s)) });
    return share;
  }
  /** Stop sharing (a shared motion is taken down), or drop a prepared share. */
  async unshare(id: string): Promise<MotionShare> {
    const share = this.shareOf(id);
    if (!share || share.state === 'stopped') throw new Error(`${id} is not shared.`);
    if (share.state === 'shared' && share.where === 'platform') {
      if (!this.#publisher) throw new Error('Connect GenVR hosting to take this motion down there.');
      await this.#publisher.unpublish(share);
    }
    const next = MotionShare.parse({ ...share, state: 'stopped', stopped_at: new Date().toISOString() });
    this.#set({ shares: this.#data.shares.map((s) => (s.version === id ? next : s)) });
    return next;
  }

  // ---- made motions in the game (board M19)
  setMadeStore(store: MadeMotionStore | null) { this.#madeStore = store; }
  /** Puts a saved version of a made motion in My motions (Save as version does it at once). */
  async toMoves(versionId?: string) {
    if (!this.#madeStore) throw new Error('My motions is not connected here (the Studio keeps it on this device).');
    const open = this.openMotion;
    const id = versionId ?? [...this.#data.versions].reverse().find((v) => v.made && (!open || v.made.id === open.id))?.id;
    if (!id) throw new Error('Save a version of the made motion first (pose_save_version).');
    const version = this.#versionById(id), rights = this.rights(id);
    const entry = madeEntry(version, this.#data.runs.find((r) => r.id === version.run), { shareable: !rights.reasons.length, reasons: rights.reasons });
    if (!entry) throw new Error(`${id} is not a made motion (only motions made in Pose go to My motions).`);
    await this.#madeStore.put(entry);
    return entry;
  }

  // ---- pose and key frames (board M11)
  /** A made motion by id or name. */
  madeMotion(ref: string): LabMadeMotion | undefined {
    const name = ref.trim().toLowerCase();
    return this.#data.motions.find((m) => m.id === ref || m.name.toLowerCase() === name);
  }
  /** The made motion open in Pose. */
  get openMotion(): LabMadeMotion | undefined { return this.#view.pose.motion ? this.madeMotion(this.#view.pose.motion) : undefined; }
  #open(): LabMadeMotion {
    const open = this.openMotion;
    if (!open) throw new Error('No made motion is open. Make one with pose_new (Pose › New motion) or open one with pose_open.');
    return open;
  }
  #frame(frame: number) {
    const open = this.#open();
    if (frame >= open.frames) throw new Error(`Frame ${frame} is past the end: "${open.name}" has ${open.frames} frames (0–${open.frames - 1}).`);
    return Math.round(frame);
  }
  #putMotion(next: LabMadeMotion, view: Partial<LabPoseView> = {}) {
    const motion = LabMadeMotion.parse(next);
    this.#data = LabProjectData.parse({ ...this.#data, motions: this.#data.motions.map((m) => (m.id === motion.id ? motion : m)) });
    this.#view = { ...this.#view, mode: 'pose', pose: { ...this.#view.pose, motion: motion.id, ...view } };
    this.#emit(true);
    return motion;
  }
  newMotion(name: string, options: { frames?: number; loop?: boolean; from?: 'stand' | 't_pose' } = {}, by: LabActor = PERSON): LabMadeMotion {
    const clean = name.trim();
    if (Object.keys(LAB_GROUND_MOVES).some((m) => m.toLowerCase() === clean.toLowerCase())) throw new Error(`"${clean}" is a library move. Give the made motion its own name.`);
    if (this.madeMotion(clean)) throw new Error(`A made motion is already called "${clean}". Open it with pose_open.`);
    const slug = clean.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'motion';
    let id = `made-${slug}`;
    for (let n = 2; this.#data.motions.some((m) => m.id === id); n++) id = `made-${slug}-${n}`;
    const start = options.from === 't_pose' ? labTPose() : labStandPose();
    const motion = LabMadeMotion.parse({ id, name: clean, frames: options.frames ?? 120, loop: options.loop ?? true, keys: [{ frame: 0, ease: 'smooth', values: start }], by: by.kind, at: new Date().toISOString() });
    this.#data = LabProjectData.parse({ ...this.#data, motions: [...this.#data.motions, motion] });
    this.#view = { ...this.#view, mode: 'pose', pose: { ...this.#view.pose, motion: id, frame: 0, playing: false } };
    this.#emit(true);
    return motion;
  }
  openMotionAt(ref: string, change: { frames?: number; loop?: boolean } = {}): LabMadeMotion {
    const motion = this.madeMotion(ref);
    if (!motion) throw new Error(`No made motion "${ref}". Ask pose_list for the names.`);
    if (change.frames !== undefined && motion.keys.some((k) => k.frame >= change.frames!)) throw new Error(`Keys lie past frame ${change.frames - 1}: remove them first, or keep the length.`);
    const frame = Math.min(Math.round(this.#view.pose.frame), (change.frames ?? motion.frames) - 1);
    return this.#putMotion({ ...motion, ...change }, { frame, playing: false });
  }
  /** The pose on a frame (keys filled in, the draft on its frame). */
  poseAt(frame: number, motion = this.openMotion): LabPose { return motion ? labPoseAt(motion, frame) : labStandPose(); }
  poseGet(frame: number) {
    const open = this.#open(), f = this.#frame(frame), pose = this.poseAt(f), key = open.keys.find((k) => k.frame === f);
    return {
      motion: { id: open.id, name: open.name, frames: open.frames, loop: open.loop }, frame: f, pose,
      keyed_rows: key ? labKeyRows(key.values) : [], ease: key?.ease ?? null,
      draft: open.draft?.frame === f ? Object.keys(open.draft.values) : [],
      problems: labPoseProblems(pose), limbs: labLimbPositions(pose), pins: open.pins,
      keys: open.keys.map((k) => ({ frame: k.frame, ease: k.ease, rows: labKeyRows(k.values) })).sort((a, b) => a.frame - b.frame),
    };
  }
  /**
   * Writes changed sliders on a frame: into the key there when it already holds that slider's row, else into the draft
   * (Key makes the draft a key; a draft on another frame is dropped).
   */
  #write(frame: number, before: LabPose, after: LabPose) {
    const open = this.#open();
    const key = open.keys.find((k) => k.frame === frame);
    const rows = new Set(key ? labKeyRows(key.values) : []);
    const keyValues = { ...(key?.values ?? {}) };
    const draft = { ...(open.draft?.frame === frame ? open.draft.values : {}) };
    for (const slider of LAB_POSE_KEYS) {
      if (Math.abs((after[slider] ?? 0) - (before[slider] ?? 0)) < 1e-4) continue;
      if (rows.has(labRowOf(slider))) keyValues[slider] = after[slider]!;
      else draft[slider] = after[slider]!;
    }
    const keys = key ? open.keys.map((k) => (k === key ? { ...k, values: keyValues } : k)) : open.keys;
    return this.#putMotion({ ...open, keys, draft: Object.keys(draft).length ? { frame, values: draft } : null }, { frame, playing: false });
  }
  /** Move sliders on a frame; each stops at the joint law, and pinned hands and feet stay where they are. */
  poseSet(frame: number, asked: Record<string, number>) {
    const f = this.#frame(frame), open = this.#open(), before = this.poseAt(f);
    const limited = labPoseLimit(before, asked);
    const after = labHoldPins(before, limited.pose, open.pins, Object.keys(asked));
    this.#write(f, before, after);
    return { frame: f, set: Object.fromEntries(Object.keys(asked).map((k) => [k, after[k]])), stopped: limited.stopped, problems: labPoseProblems(after),
      ...(limited.stopped.length ? { note: `Stopped at the joint law: ${limited.stopped.join(', ')}.` } : {}) };
  }
  /** Key the pose of some rows on a frame (default: every row). */
  keyAdd(frame: number, rows: readonly LabPoseRow[] = ALL_ROWS, ease?: LabPoseEase) {
    const open = this.#open(), f = this.#frame(frame), pose = this.poseAt(f);
    const key = open.keys.find((k) => k.frame === f);
    const values = { ...(key?.values ?? {}) };
    for (const row of rows) for (const slider of labRowKeys(row)) values[slider] = pose[slider]!;
    const draft = open.draft?.frame === f ? Object.fromEntries(Object.entries(open.draft.values).filter(([k]) => !rows.includes(labRowOf(k)))) : open.draft?.values ?? {};
    const next = { frame: f, ease: ease ?? key?.ease ?? 'smooth', values };
    const keys = key ? open.keys.map((k) => (k === key ? next : k)) : [...open.keys, next].sort((a, b) => a.frame - b.frame);
    this.#putMotion({ ...open, keys, draft: Object.keys(draft).length && open.draft ? { frame: open.draft.frame, values: draft } : null }, { frame: f });
    return { frame: f, ease: next.ease, rows: labKeyRows(values) };
  }
  keyRemove(frame: number, rows: readonly LabPoseRow[] = ALL_ROWS) {
    const open = this.#open(), f = this.#frame(frame), key = open.keys.find((k) => k.frame === f);
    if (!key) throw new Error(`No key on frame ${f}.`);
    const values = Object.fromEntries(Object.entries(key.values).filter(([k]) => !rows.includes(labRowOf(k))));
    const keys = Object.keys(values).length ? open.keys.map((k) => (k === key ? { ...k, values } : k)) : open.keys.filter((k) => k !== key);
    if (!keys.length) throw new Error('A made motion keeps at least one key.');
    this.#putMotion({ ...open, keys }, { frame: f });
    return { frame: f, rows: Object.keys(values).length ? labKeyRows(values) : [] };
  }
  keyEase(frame: number, ease: LabPoseEase) {
    const open = this.#open(), f = this.#frame(frame), key = open.keys.find((k) => k.frame === f);
    if (!key) throw new Error(`No key on frame ${f}.`);
    this.#putMotion({ ...open, keys: open.keys.map((k) => (k === key ? { ...k, ease } : k)) }, { frame: f });
    return { frame: f, ease };
  }
  /** Copy the pose of some rows from one frame onto another as a key. */
  keyCopy(from: number, to: number, rows: readonly LabPoseRow[] = ALL_ROWS) {
    const open = this.#open(), a = this.#frame(from), b = this.#frame(to), pose = this.poseAt(a);
    const key = open.keys.find((k) => k.frame === b);
    const values = { ...(key?.values ?? {}) };
    for (const row of rows) for (const slider of labRowKeys(row)) values[slider] = pose[slider]!;
    const next = { frame: b, ease: key?.ease ?? open.keys.find((k) => k.frame === a)?.ease ?? 'smooth', values };
    this.#putMotion({ ...open, keys: key ? open.keys.map((k) => (k === key ? next : k)) : [...open.keys, next].sort((x, y) => x.frame - y.frame) }, { frame: b });
    return { from: a, to: b, rows: labKeyRows(values) };
  }
  /** Move a wrist or ankle to a point (or by an offset) and the limb follows; pinned limbs stay. */
  limbMove(frame: number, limb: LabLimb, target?: readonly number[], by?: readonly number[], quick = false) {
    const open = this.#open(), f = this.#frame(frame), before = this.poseAt(f);
    const from = labLimbPositions(before)[limb];
    const goal = (target ?? (by ? from.map((x, i) => x + by[i]!) : null)) as [number, number, number] | null;
    if (!goal) throw new Error('Give a target [x, y, z] or by [dx, dy, dz] in metres.');
    const moved = labLimbMove(before, limb, goal, quick);
    const after = labHoldPins(before, moved.pose, open.pins.filter((p) => p !== limb), Object.keys(moved.pose).filter((k) => moved.pose[k] !== before[k]));
    this.#write(f, before, after);
    return { frame: f, limb, reached: moved.reached, miss_cm: moved.miss_cm, stopped: moved.stopped,
      ...(moved.miss_cm > 2 ? { note: moved.stopped ? 'Stopped at the joint law before the point.' : 'The point is out of reach.' } : {}) };
  }
  pin(limb: LabLimb, on = true) {
    const open = this.#open();
    const pins = on ? [...new Set([...open.pins, limb])] : open.pins.filter((p) => p !== limb);
    this.#putMotion({ ...open, pins });
    return { pins };
  }
  poseMirror(frame: number, mode: 'swap' | 'left_to_right' | 'right_to_left' = 'swap') {
    const f = this.#frame(frame), before = this.poseAt(f);
    const after = labMirror(before, mode);
    this.#write(f, before, after);
    return { frame: f, mode, problems: labPoseProblems(after) };
  }
  #signature(m: LabMadeMotion) { return JSON.stringify([m.frames, m.loop, m.keys]); }
  /** Test in course: the course run with the open made motion, at the pace its feet give (when it travels). */
  poseTest(by: LabActor = PERSON): LabRun {
    const open = this.#open();
    const pace = labMadeMotionPace(open);
    const travels = pace.speed >= 0.3;
    return this.run({ motion: open.name, ...(travels ? { speed: Math.min(8, Math.max(0.5, pace.speed)), stride: Math.min(1.6, Math.max(0.3, pace.stride)) } : {}) }, by);
  }
  /** Save as version: tests the open made motion in the course when its keys changed since the last test, then keeps that run. */
  poseSaveVersion(note = '', by: LabActor = PERSON): MotionVersion {
    const open = this.#open();
    const last = [...this.#data.runs].reverse().find((r) => r.settings.motion === open.name && r.settings.character === this.character.id);
    const tested = last && this.#runMotion.get(last.id);
    const run = tested && this.#signature(tested) === this.#signature(open) ? last : this.poseTest(by);
    return this.saveVersion(run.id, note, by);
  }
  // Pose view (person's choices; an agent's pose operations also move the view to their frame).
  setMode(mode: 'run' | 'pose') { this.#setView({ mode, playing: mode === 'run' ? this.#view.playing : false, pose: { ...this.#view.pose, playing: false } }); }
  setPoseView(change: Partial<Omit<LabPoseView, 'motion'>>) {
    const open = this.openMotion;
    const frame = change.frame === undefined ? this.#view.pose.frame : Math.max(0, Math.min((open?.frames ?? 1) - 1, change.frame));
    this.#setView({ pose: { ...this.#view.pose, ...change, frame } });
  }

  // ---- view
  select(id: string | null) { this.#setView({ selected: id }); }
  toggleOverlay(overlay: LabOverlay) { const on = this.#view.overlays.includes(overlay); this.#setView({ overlays: on ? this.#view.overlays.filter((o) => o !== overlay) : [...this.#view.overlays, overlay] }); }
  setOverlays(overlays: readonly LabOverlay[]) { this.#setView({ overlays: LAB_OVERLAYS.filter((o) => overlays.includes(o)) }); }
  setSpeed(speed: LabSpeed) { this.#setView({ speed }); }
  setPlaying(playing: boolean) { this.#setView({ playing }); }
  seek(t: number) { const end = this.duration(); this.#setView({ t: Math.max(0, Math.min(end, t)) }); }
  step(frames: number) { this.#setView({ playing: false }); this.seek(this.#view.t + frames / 60); }
  duration() { const f = this.#view.run?.result.frames; return f?.length ? f[f.length - 1]!.t : 0; }
  /** Advance the playhead (called by the view every animation frame). */
  tick(dt: number) {
    const pose = this.#view.pose, open = this.openMotion;
    if (this.#view.mode === 'pose' && pose.playing && open) {
      const next = pose.frame + dt * 60 * this.#view.speed;
      const frame = open.loop ? next % open.frames : Math.min(open.frames - 1, next);
      this.#view = { ...this.#view, pose: { ...pose, frame, playing: open.loop || next < open.frames - 1 } };
      this.#version++;
      for (const listener of this.#listeners) listener();
      return;
    }
    if (!this.#view.playing || !this.#view.run) return;
    const t = this.#view.t + dt * this.#view.speed;
    const end = this.duration();
    this.#view = { ...this.#view, t: Math.min(end, t), playing: t < end };
    this.#version++;
    for (const listener of this.#listeners) listener();
  }
}

function replay(run: LabRun): LabRunResult {
  if (run.station) { const hip = run.station_score?.values.hip_m; return runStation(run.course, run.station, run.settings, run.seed, typeof hip === 'number' ? hip : STATION_REFERENCE_HIP).result; }
  return simulateLabRun(run.course, run.settings, run.seed, run.move ? { [run.settings.motion]: { ...run.move, clip: run.settings.motion } } : {});
}

function freeId(course: LabCourse, base: string): string {
  const used = new Set([...course.obstacles.map((o) => o.id), ...course.cars.map((c) => c.id), ...course.stations.map((s) => s.id), ...course.props.map((p) => p.id)]);
  for (let n = 1; ; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
}
function freeRunId(runs: readonly LabRun[]): string {
  const n = runs.reduce((max, r) => Math.max(max, Number(r.id.replace(/^run-/, '')) || 0), 0) + 1;
  return `run-${n}`;
}
function freeVersionId(versions: readonly MotionVersion[], motion: string, n: number): string {
  const slug = motion.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'motion';
  let id = `${slug}-v${n}`;
  for (let k = 2; versions.some((v) => v.id === id); k++) id = `${slug}-v${n}-${k}`;
  return id;
}

// ---- the agent tool (`motion_lab`), routed from the assistant and the live MCP bridge
const HELP: Record<string, string> = {
  inspect: 'Course summary, run settings, last run, best version, view.',
  commands: 'This list.',
  course_get: 'The whole course (obstacles with sizes in metres, street, cars, seed, finish).',
  course_set: 'Replace the whole course: { course }. Checked; sizes in metres.',
  obstacle_add: 'Add { obstacle: { kind: step|ramp|gap|low_wall|window, z, …sizes } }; id is made when missing.',
  obstacle_set: 'Change sizes or place of one obstacle: { id, set: { width, height, z, … } }.',
  obstacle_remove: 'Remove one obstacle: { id }.',
  course_from_seed: 'A new course from { seed, obstacles 1–12, hardness 1–5, street }. Same seed = same course.',
  traffic_set: 'Street (lanes, light) and cars (speed, lane, offset_s, runs_red).',
  characters: 'Characters the Lab can use (id, name, source lab|mine, leg in metres), who runs now, and whether the Lab follows the Avatar tab.',
  who_set: 'Pick who runs: { who: a character id from characters, or "avatar" to follow the Avatar tab }. Hidden bodies are not offered.',
  settings_set: 'Run settings: motion (Walk, Run, Sneak, Crouch Walk), speed, stride, step_height, jump_timing_ms, blend_s, lean_deg, wait_for_green.',
  run: 'Run the course once (fixed step, seed). Optional settings or a version to start from; { station } runs on a training station instead (jump_pit, grasp_table now). Returns the run id and scores (station scores too).',
  runs_list: 'The last 20 runs with their scores.',
  scores: 'Scores of a run (default: the last).',
  frame: 'One frame of a run at time t: body, feet (planted), balance point, speed, move.',
  view_set: 'What the person sees: overlays (skeleton, feet, balance, speed, ghost, measures) and play speed.',
  versions: 'Motion versions with score, settings and which is best; pending best request.',
  save_version: 'Keep a run as a new version of its motion: { run?, note? }.',
  save_best: 'Ask to make a version the best: the owner confirms it in the Lab.',
  rollback: 'Use a version\'s settings again: { version }.',
  version_delete: 'Delete a version an agent made: { version, confirm: true }. The best version and versions a person made are the owner\'s.',
  motions_mine: 'My motions: every version with its share state (private, pending, shared, blocked), the share and why it is blocked.',
  motion_similar: 'Motions we already have like this one: { version }. The GenVR library move (also run on this course to compare) and my shared versions.',
  share_prepare: 'Prepare a share with the GenVR community: { version, share: { name, description?, tags?, preview_s? } }. Nothing is published; it waits for the owner.',
  share: 'Publish a prepared share: { version, confirm: true }. Owner only: an agent is refused and the share keeps waiting for the owner in the Lab.',
  unshare: 'Stop sharing a motion, or drop a prepared share: { version, confirm: true }.',
  station_add: 'Add a training station (board M18): { station: { kind: jump_pit|high_bar|hurdles|pool|climb_wall|ladder|grasp_table|conveyor|tool_bench|weapon_rack|target_post, x, z, turn?, …sizes in metres } }. The grasp table comes with its 12 objects.',
  station_set: 'Change a station\'s place or sizes: { id, set: { x, z, turn, height, runway_length, … } }.',
  station_remove: 'Remove a station and the objects on it: { id, confirm: true }.',
  stations_base: 'Put the base lab\'s 11 stations in the 42 × 26 m yard (replaces the stations and their objects): { confirm: true }.',
  prop_add: 'Add an object on a station: { prop: { on, name, shape box|cylinder|sphere|tool, size_m [x,y,z], mass_kg, grip power|pinch|hook|handle, at [x,z], target? [x,z] } }.',
  prop_set: 'Change an object: { id, set: { mass_kg, at, target, … } }.',
  prop_remove: 'Remove an object: { id, confirm: true }.',
  conveyor_set: 'Belt speed (0.1–1 m/s), one object every 1–5 s, mixed objects: { id, speed_mps?, every_s?, mix? }.',
  pose_list: 'Motions made here by pose and key frames (board M11): id, name, frames (60 per second), loop, keys, pins; and the one open in Pose.',
  pose_new: 'A new made motion: { name, frames? (default 120 = 2 s), loop? (default true), from: stand|t_pose }. Frame 0 gets a key of the whole pose; it opens in Pose.',
  pose_open: 'Open a made motion in Pose: { motion: id or name, frames?, loop? }.',
  pose_get: 'The pose on a frame: { frame }. Every slider (same names as the Avatar pose panel: head.nod, R.elbow.bend, L.index.mid …, degrees or %; root.x/y/z in metres), the rows keyed there, the joint law check, wrists and ankles in metres (x his left, y up, z his front), pins and the list of keys.',
  pose_set: 'Move sliders on a frame: { frame, joint: "elbow.bend", side: both|left|right, value } or { frame, values: { "R.elbow.bend": 38, … } }. Each stops at the joint law (answer says which stopped); pinned hands and feet stay. On a frame keyed for that joint it changes the key, else it waits as a draft until key_add.',
  key_add: 'Key the pose on a frame: { frame, rows?: body|right_arm|right_hand|left_arm|left_hand|legs (default all), ease?: linear|smooth|hold }. The lab fills the frames between keys.',
  key_remove: 'Remove the key of some rows (default all) on a frame: { frame, rows? }.',
  key_ease: 'How the frames after a key are filled: { frame, ease: linear|smooth|hold }.',
  key_copy: 'Copy the pose of some rows from one frame to another as a key: { from, to, rows? }.',
  limb_move: 'Move a wrist or ankle and the arm or leg follows (two bones, inside the joint law): { frame, limb: left_hand|right_hand|left_foot|right_foot, target: [x, y, z] or by: [dx, dy, dz] } in metres.',
  pin: 'Pin a hand or foot where it is, or unpin it: { limb, on }. A pinned foot keeps its spot (the hips move); a pinned hand reaches back to its place.',
  pose_mirror: 'Mirror the pose on a frame: { frame, mode: swap|left_to_right|right_to_left }.',
  pose_test: 'Test in course: run the course with the open made motion (at the pace its feet give, when it travels). Returns the run and scores.',
  made_to_moves: 'Put a saved version of a made motion in My motions (Avatar › Moves), ready for keys 1–8 or a base move: { version? } (default: the newest version of the open motion). Save as version does it already.',
  pose_save_version: 'Save as version: tests the open made motion in the course if its keys changed since the last test, then keeps the run as a version with its keys: { note? }.',
};

export async function runMotionLab(lab: LabController | null, input: unknown, by: LabActor): Promise<unknown> {
  if (!lab) throw new Error('Open the motion lab project first (the Lab tab in the Studio).');
  const op = MotionLabOperation.parse(input);
  const summary = (run: LabRun) => ({ id: run.id, motion: run.settings.motion, score: run.score, events: run.events.map((e) => `${e.t.toFixed(1)} s ${e.label}`) });
  switch (op.kind) {
    case 'commands': return MOTION_LAB_KINDS.map((kind) => ({ kind, help: HELP[kind] }));
    case 'inspect': {
      const d = lab.data, last = d.runs.at(-1), best = lab.best();
      return { character: { id: lab.character.id, name: lab.character.name, follows_avatar: d.who === LAB_FOLLOW_AVATAR }, course: { seed: d.course.seed, finish_z: d.course.finish_z, obstacles: d.course.obstacles.map((o) => `${o.id} ${o.kind} at ${o.z} m`), street: d.course.street, cars: d.course.cars.length,
          stations: d.course.stations.map((s) => `${s.id} ${s.kind} at x ${s.x} z ${s.z}${LAB_RUNNABLE_STATIONS.includes(s.kind) ? '' : ' (placed; runs later)'}`), objects: d.course.props.length, run_on: lab.view.station ?? 'course' },
        settings: d.settings, moves: LAB_MOVES, last_run: last ? summary(last) : null, best: best ? { id: best.id, score: best.score.total } : null, best_pending: d.best_pending,
        runs: d.runs.length, versions: d.versions.length, view: { overlays: lab.view.overlays, speed: lab.view.speed, mode: lab.view.mode },
        made_motions: d.motions.map((m) => m.name), open_motion: lab.openMotion?.name ?? null };
    }
    case 'course_get': return lab.data.course;
    case 'course_set': return lab.setCourse(op.course);
    case 'obstacle_add': {
      const o = (op.obstacle ?? {}) as Record<string, unknown>;
      return lab.addObstacle(String(o.kind) as LabObstacleKind, o);
    }
    case 'obstacle_set': return lab.setObstacle(op.id, op.set);
    case 'obstacle_remove': lab.removeObstacle(op.id); return { removed: op.id };
    case 'course_from_seed': return lab.fromSeed(op.seed, op.obstacles, op.hardness, op.street);
    case 'station_add': { const st = (op.station ?? {}) as Record<string, unknown>; return lab.addStation(String(st.kind) as LabStationKind, st); }
    case 'station_set': return lab.setStation(op.id, op.set);
    case 'station_remove': lab.removeStation(op.id); return { removed: op.id };
    case 'stations_base': return { stations: lab.baseStations().map((s) => `${s.id} ${s.kind} at x ${s.x} z ${s.z}`) };
    case 'prop_add': return lab.addProp((op.prop ?? {}) as Record<string, unknown>);
    case 'prop_set': return lab.setProp(op.id, op.set);
    case 'prop_remove': lab.removeProp(op.id); return { removed: op.id };
    case 'conveyor_set': return lab.setConveyor(op.id, { speed_mps: op.speed_mps, every_s: op.every_s, mix: op.mix });
    case 'traffic_set': return lab.setTraffic(op.street, op.cars);
    case 'settings_set': {
      const { character, ...rest } = op.settings;
      if (character !== undefined) lab.setWho(character);
      return lab.setSettings(rest);
    }
    case 'characters': await lab.refreshCharacters(); return { who: lab.data.who, follows_avatar: lab.data.who === LAB_FOLLOW_AVATAR, now: lab.character, avatar: lab.avatarCharacter, missing: lab.missingCharacter, characters: lab.characters };
    case 'who_set': return lab.setWho(op.who);
    case 'run': { const run = lab.run(op.settings ?? {}, by, op.version, op.station ?? null); return { ...summary(run), ...(run.station ? { station: run.station, station_score: run.station_score } : {}) }; }
    case 'runs_list': return lab.data.runs.map((r) => ({ id: r.id, motion: r.settings.motion, character: r.settings.character, total: r.score.total, at: r.at, by: r.by }));
    case 'scores': { const run = lab.runById(op.run); return { run: run.id, score: run.score, ...(run.station ? { station: run.station, station_score: run.station_score } : {}), best: lab.best()?.score ?? null }; }
    case 'frame': { const f = lab.frameAt(op.t, op.run); if (!f) throw new Error('No run yet. Use run first.'); return f; }
    case 'view_set': { if (op.overlays) lab.setOverlays(op.overlays); if (op.speed) lab.setSpeed(op.speed as LabSpeed); return { overlays: lab.view.overlays, speed: lab.view.speed }; }
    case 'versions': return { versions: lab.data.versions, best_pending: lab.data.best_pending };
    case 'save_version': return lab.saveVersion(op.run, op.note ?? '', by);
    case 'save_best': {
      const result = lab.saveBest(op.version, by);
      return by.kind === 'agent' ? { ...result, note: 'The owner confirms the best version in the Lab (Versions).' } : result;
    }
    case 'rollback': return lab.rollback(op.version);
    case 'version_delete': lab.deleteVersion(op.version, by); return { deleted: op.version };
    case 'motions_mine': return { publishing: lab.publishing, licence: MOTION_SHARE_LICENCE, motions: lab.mine() };
    case 'motion_similar': return { version: op.version, similar: lab.similar(op.version) };
    case 'share_prepare': {
      const share = lab.prepareShare(op.version, op.share, by);
      return { share, rights: lab.rights(op.version), licence: MOTION_SHARE_LICENCE, note: 'Prepared, not published. The owner confirms each share in the Lab (My motions).' };
    }
    case 'share': {
      const share = await lab.share(op.version, by);
      return { share, note: share.where === 'local-preview' ? 'Local preview: marked shared on this device only. Nothing was published (no GenVR hosting connected).' : 'Shared with the GenVR community.' };
    }
    case 'unshare': return { share: await lab.unshare(op.version) };
    case 'pose_list': return { open: lab.openMotion?.id ?? null, motions: lab.data.motions.map((m) => ({ id: m.id, name: m.name, frames: m.frames, seconds: m.frames / 60, loop: m.loop, keys: m.keys.length, pins: m.pins, by: m.by })) };
    case 'pose_new': return lab.newMotion(op.name, { ...(op.frames ? { frames: op.frames } : {}), ...(op.loop !== undefined ? { loop: op.loop } : {}), from: op.from }, by);
    case 'pose_open': return lab.openMotionAt(op.motion, { ...(op.frames ? { frames: op.frames } : {}), ...(op.loop !== undefined ? { loop: op.loop } : {}) });
    case 'pose_get': { const got = lab.poseGet(op.frame); lab.setPoseView({ frame: got.frame }); return got; }
    case 'pose_set': {
      const asked = { ...(op.values ?? {}), ...(op.joint !== undefined ? labAsk(op.joint, op.side === 'left' ? 'L' : op.side === 'right' ? 'R' : 'both', op.value ?? Number.NaN) : {}) };
      if (op.joint !== undefined && op.value === undefined) throw new Error('Give a value for the joint.');
      if (!Object.keys(asked).length) throw new Error('Give { joint, side, value } or { values }.');
      return lab.poseSet(op.frame, asked);
    }
    case 'key_add': return lab.keyAdd(op.frame, op.rows, op.ease);
    case 'key_remove': return lab.keyRemove(op.frame, op.rows);
    case 'key_ease': return lab.keyEase(op.frame, op.ease);
    case 'key_copy': return lab.keyCopy(op.from, op.to, op.rows);
    case 'limb_move': return lab.limbMove(op.frame, op.limb, op.target, op.by);
    case 'pin': return lab.pin(op.limb, op.on);
    case 'pose_mirror': return lab.poseMirror(op.frame, op.mode);
    case 'pose_test': return summary(lab.poseTest(by));
    case 'pose_save_version': return lab.poseSaveVersion(op.note ?? '', by);
    case 'made_to_moves': { const entry = await lab.toMoves(op.version); return { id: entry.id, name: entry.name, version: entry.n, score: entry.score, passes_course: entry.passes_course, pace: entry.pace, note: 'In My motions. Use it with avatar_studio move_use { motion, slot 1–8 | replaces Idle|Walk|Run|Jump }.' }; }
  }
}

/** The open lab, for the live bridge and the in-app assistant. */
export const motionLabBridge = (() => {
  let current: LabController | null = null;
  return {
    register(lab: LabController | null) { current = lab; return () => { if (current === lab) current = null; }; },
    get: () => current,
  };
})();
