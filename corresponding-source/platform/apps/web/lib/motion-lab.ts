import {
  LAB_CHARACTER,
  LAB_KEEP_RUNS,
  LAB_LATER_KINDS,
  LAB_OBSTACLE_KINDS,
  LAB_OVERLAYS,
  LabCar,
  LabCourse,
  LabObstacle,
  LabProjectData,
  LabRunSettings,
  LabStreet,
  MOTION_LAB_KINDS,
  MOTION_SHARE_LICENCE,
  MotionLabOperation,
  MotionShare,
  MotionShareDraft,
  type LabObstacleKind,
  type LabOverlay,
  type LabRun,
  type MotionVersion,
} from '@genvr/contracts';
import { courseFromSeed, defaultLabCourse, labGroundMove, scoreLabRun, simulateLabRun, LAB_GROUND_MOVES, type LabFrame, type LabRunResult } from '@genvr/runtime';

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
}

export const LAB_MOVES = Object.keys(LAB_GROUND_MOVES);

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

export function newLabData(): LabProjectData {
  return LabProjectData.parse({ course: defaultLabCourse() });
}

export class LabController {
  #data: LabProjectData;
  #view: LabView = { overlays: ['skeleton', 'feet', 'balance', 'speed', 'ghost', 'measures'], speed: 1, playing: false, t: 0, selected: null, run: null, ghost: null };
  #listeners = new Set<() => void>();
  #version = 0;
  #onChange: (data: LabProjectData) => void;
  #publisher: MotionSharePublisher | null = null;

  constructor(data: LabProjectData, onChange: (data: LabProjectData) => void = () => {}) {
    this.#data = LabProjectData.parse(data);
    this.#onChange = onChange;
    const last = this.#data.runs.at(-1);
    if (last) this.#view.run = { id: last.id, result: replay(last) };
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
  fromSeed(seed: number, count = 5, hardness = 2, street = true) { const course = this.setCourse(courseFromSeed(seed, count, hardness, street)); this.select(null); return course; }
  setTraffic(street?: unknown, cars?: unknown[]) {
    const course = this.#data.course;
    return this.setCourse({ ...course, ...(street !== undefined ? { street: street === null ? null : LabStreet.parse(street) } : {}), ...(cars ? { cars: cars.map((c) => LabCar.parse(c)) } : {}) });
  }
  setSettings(patch: Partial<LabRunSettings>) { const settings = LabRunSettings.parse({ ...this.#data.settings, ...patch }); this.#set({ settings }); return settings; }

  // ---- runs (boards M1, M3)
  run(patch: Partial<LabRunSettings> = {}, by: LabActor = PERSON, fromVersion?: string): LabRun {
    let base = this.#data.settings;
    if (fromVersion) base = this.#versionById(fromVersion).settings;
    const settings = LabRunSettings.parse({ ...base, ...patch });
    const course = this.#data.course;
    const result = simulateLabRun(course, settings, course.seed);
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
    };
    this.#data = LabProjectData.parse({ ...this.#data, settings, runs: [...this.#data.runs, run].slice(-LAB_KEEP_RUNS) });
    this.#view = { ...this.#view, run: { id: run.id, result }, t: 0, playing: true };
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
    const version: MotionVersion = { id: freeVersionId(this.#data.versions, run.settings.motion, n), motion: run.settings.motion, n, note, settings: run.settings, score: run.score, run: run.id, best: false, by: by.kind, at: new Date().toISOString() };
    this.#set({ versions: [...this.#data.versions, version] });
    return version;
  }
  /** A person makes it the best at once; an agent's request waits for the owner. */
  saveBest(id: string, by: LabActor = PERSON): { best: string | null; pending: string | null } {
    const version = this.#versionById(id);
    if (by.kind === 'agent') {
      this.#set({ best_pending: { version: version.id, by: by.name } });
      return { best: this.best()?.id ?? null, pending: version.id };
    }
    this.#set({ versions: this.#data.versions.map((v) => ({ ...v, best: v.motion === version.motion ? v.id === version.id : v.best })), best_pending: null });
    this.#view = { ...this.#view, ghost: this.#ghost() };
    this.#emit(false);
    return { best: version.id, pending: null };
  }
  confirmPendingBest() { const pending = this.#data.best_pending; if (pending) this.saveBest(pending.version, PERSON); }
  rejectPendingBest() { this.#set({ best_pending: null }); }
  rollback(id: string) { const v = this.#versionById(id); this.setSettings(v.settings); return v; }
  /** An agent may delete only versions an agent made, never the best one; a person may delete any. */
  deleteVersion(id: string, by: LabActor = PERSON) {
    const version = this.#versionById(id);
    if (by.kind === 'agent' && (version.best || version.by !== 'agent')) throw new Error(version.best ? 'Only the owner can delete the best version.' : 'Only the owner can delete a version a person made.');
    if (this.shareOf(id)?.state === 'shared') throw new Error(`${id} is shared with the community: stop sharing it first.`);
    this.#set({ versions: this.#data.versions.filter((v) => v.id !== id), shares: this.#data.shares.filter((s) => s.version !== id), best_pending: this.#data.best_pending?.version === id ? null : this.#data.best_pending });
    this.#view = { ...this.#view, ghost: this.#ghost() };
    this.#emit(false);
  }
  best(motion = this.#data.settings.motion): MotionVersion | undefined { return this.#data.versions.find((v) => v.best && v.motion === motion); }
  #versionById(id: string) { const v = this.#data.versions.find((x) => x.id === id); if (!v) throw new Error(`No version "${id}". Ask versions for the ids.`); return v; }
  #ghost(): LabRunResult | null {
    const best = this.best();
    if (!best) return null;
    // The best version's settings on the course as it is now, so the ghost runs beside the new run on the same course
    // (it keeps working when the best run has left the last 20: a run is replayed from settings + course + seed).
    return simulateLabRun(this.#data.course, best.settings, this.#data.course.seed);
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
    const native = Object.hasOwn(LAB_GROUND_MOVES, v.settings.motion) && !v.settings.character.startsWith('user.');
    const passes = v.score.finished && !v.score.fell && !v.score.car_hit;
    if (!madeHere) reasons.push('It was not made in this lab.');
    if (!native) reasons.push(`"${v.settings.motion}" on "${v.settings.character}" is not a GenVR library move on a GenVR character (moves made from Mixamo are never shared).`);
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
      character: v.settings.character === LAB_CHARACTER ? 'Standard robot' : v.settings.character, score: v.score.total, preview_s: input.preview_s ?? old?.preview_s ?? 4,
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
    if (!this.#view.playing || !this.#view.run) return;
    const t = this.#view.t + dt * this.#view.speed;
    const end = this.duration();
    this.#view = { ...this.#view, t: Math.min(end, t), playing: t < end };
    this.#version++;
    for (const listener of this.#listeners) listener();
  }
}

function replay(run: LabRun): LabRunResult { return simulateLabRun(run.course, run.settings, run.seed); }
function freeId(course: LabCourse, base: string): string {
  const used = new Set([...course.obstacles.map((o) => o.id), ...course.cars.map((c) => c.id)]);
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
  settings_set: 'Run settings: motion (Walk, Run, Sneak, Crouch Walk), speed, stride, step_height, jump_timing_ms, blend_s, lean_deg, wait_for_green.',
  run: 'Run the course once (fixed step, seed). Optional settings or a version to start from. Returns the run id and scores.',
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
};

export async function runMotionLab(lab: LabController | null, input: unknown, by: LabActor): Promise<unknown> {
  if (!lab) throw new Error('Open a motion lab project first (My projects › New motion lab).');
  const op = MotionLabOperation.parse(input);
  const summary = (run: LabRun) => ({ id: run.id, motion: run.settings.motion, score: run.score, events: run.events.map((e) => `${e.t.toFixed(1)} s ${e.label}`) });
  switch (op.kind) {
    case 'commands': return MOTION_LAB_KINDS.map((kind) => ({ kind, help: HELP[kind] }));
    case 'inspect': {
      const d = lab.data, last = d.runs.at(-1), best = lab.best();
      return { character: 'Standard robot (body robot)', course: { seed: d.course.seed, finish_z: d.course.finish_z, obstacles: d.course.obstacles.map((o) => `${o.id} ${o.kind} at ${o.z} m`), street: d.course.street, cars: d.course.cars.length },
        settings: d.settings, moves: LAB_MOVES, last_run: last ? summary(last) : null, best: best ? { id: best.id, score: best.score.total } : null, best_pending: d.best_pending,
        runs: d.runs.length, versions: d.versions.length, view: { overlays: lab.view.overlays, speed: lab.view.speed } };
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
    case 'traffic_set': return lab.setTraffic(op.street, op.cars);
    case 'settings_set': return lab.setSettings(op.settings);
    case 'run': return summary(lab.run(op.settings ?? {}, by, op.version));
    case 'runs_list': return lab.data.runs.map((r) => ({ id: r.id, motion: r.settings.motion, total: r.score.total, at: r.at, by: r.by }));
    case 'scores': { const run = lab.runById(op.run); return { run: run.id, score: run.score, best: lab.best()?.score ?? null }; }
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
