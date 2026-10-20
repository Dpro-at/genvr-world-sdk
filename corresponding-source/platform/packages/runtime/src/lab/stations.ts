import { LabCourse, LabRunSettings, type LabEvent, type LabProp, type LabScore, type LabStation, type LabStationScore } from '@genvr/contracts';
import type { LabFrame, LabFoot, LabRunResult } from './sim.js';
import { LAB_SCORE_WEIGHTS, scoreLabRun } from './score.js';

/**
 * Board M18 · training stations in the engine: each station as boxes (what the Lab draws and what a run stands on) and
 * the measures of a run on it. Phase 1: the jump pit (distance, foul, take-off speed, landing) and the grasp table (a
 * hand that closes on an object holds it, a grip too weak for the weight lets it slip, an opened hand puts it down).
 * Station-local axes: x across, z along (forward from its spot), y up; `turn` turns local z toward +x.
 */
export type Vec3 = [number, number, number];
export interface StationPart { part: string; /** Centre and size in station-local metres. */ center: Vec3; size: Vec3; surface?: 'sand' | 'water' | 'wet' | 'mat' | 'wood' | 'metal' | 'belt' }

/** A station-local point in the course. */
export function stationToWorld(station: LabStation, p: Vec3): Vec3 {
  const a = station.turn * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return [station.x + p[0] * c + p[2] * s, p[1], station.z - p[0] * s + p[2] * c];
}
/** A course point in station-local metres. */
export function worldToStation(station: LabStation, p: Vec3): Vec3 {
  const a = station.turn * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), dx = p[0] - station.x, dz = p[2] - station.z;
  return [dx * c - dz * s, p[1], dx * s + dz * c];
}

/** Robot hip height (m): "Fit to character" scales table, belt and bench heights by the character's hip height over this. */
export const STATION_REFERENCE_HIP = 0.84;
export function fittedHeight(station: LabStation & { height: number; fit_to_character?: boolean }, hipHeight = STATION_REFERENCE_HIP): number {
  return station.fit_to_character ? Math.round(station.height * hipHeight / STATION_REFERENCE_HIP * 1000) / 1000 : station.height;
}

const box = (part: string, center: Vec3, size: Vec3, surface?: StationPart['surface']): StationPart => ({ part, center, size, ...(surface ? { surface } : {}) });

/** The station's parts as boxes; `hipHeight` fits tables, belt and bench to the character. */
export function stationParts(station: LabStation, hipHeight = STATION_REFERENCE_HIP): StationPart[] {
  switch (station.kind) {
    case 'jump_pit': {
      const board = station.runway_length - station.board_gap;
      return [box('runway', [0, 0.005, station.runway_length / 2], [station.runway_width, 0.01, station.runway_length]),
        box('board', [0, 0.01, board - 0.1], [station.runway_width, 0.02, 0.2], 'wood'),
        box('sand', [0, -station.sand_depth / 2, station.runway_length + station.sand_length / 2], [station.sand_width, station.sand_depth, station.sand_length], 'sand')];
    }
    case 'high_bar': {
      const posts = [-1, 1].map(side => box(`post-${side < 0 ? 'left' : 'right'}`, [side * station.width / 2, station.height / 2 + 0.1, 0.5], [0.06, station.height + 0.2, 0.06], 'metal'));
      return [...posts, box('bar', [0, station.height, 0.5], [station.width, 0.03, 0.03], 'metal'),
        box('mat', [0, station.mat[2] / 2, 0.5 + station.mat[1] / 2], [station.mat[0], station.mat[2], station.mat[1]], 'mat')];
    }
    case 'hurdles': {
      const first = Math.max(2, station.lane_length - (station.count - 1) * station.spacing - 3);
      return [box('lane', [0, 0.005, station.lane_length / 2], [station.lane_width, 0.01, station.lane_length]),
        ...Array.from({ length: station.count }, (_, i) => box(`hurdle-${i + 1}`, [0, station.height - 0.05, first + i * station.spacing], [station.lane_width, 0.1, 0.04], 'wood'))];
    }
    case 'pool': {
      const zones = [...station.zones].sort((a, b) => a.from_m - b.from_m);
      const water = zones.map((zone, i) => { const to = Math.min(station.length, zones[i + 1]?.from_m ?? station.length), from = Math.min(zone.from_m, to);
        return box(`water-${i + 1}`, [0, -zone.depth_m / 2 - 0.05, (from + to) / 2], [station.width, zone.depth_m - 0.1, to - from], 'water'); });
      return [...water, box('edge', [0, 0.01, -0.3], [station.width + 1.2, 0.02, 0.6], 'wet'),
        ...(station.steps ? [box('steps', [-station.width / 2 + 0.6, -0.5, 0.6], [1.2, 1, 1.2])] : []),
        ...(station.ladder ? [box('ladder', [station.width / 2 - 0.4, -1, station.length - 0.1], [0.5, 2, 0.1], 'metal')] : [])];
    }
    case 'climb_wall': return [box('wall', [0, station.height / 2, 0.15], [station.width, station.height, 0.3], 'wood'), box('mat', [0, 0.15, 0.3 + station.mat[1] / 2], [station.mat[0], 0.3, station.mat[1]], 'mat')];
    case 'ladder': return [-1, 1].map(side => box(`rail-${side < 0 ? 'left' : 'right'}`, [side * 0.25, station.height / 2, 0.3], [0.05, station.height, 0.05], 'metal'))
      .concat(Array.from({ length: Math.floor(station.height / station.rung_spacing) }, (_, i) => box(`rung-${i + 1}`, [0, (i + 1) * station.rung_spacing, 0.3], [0.5, 0.03, 0.03], 'metal')));
    case 'grasp_table': { const h = fittedHeight(station, hipHeight);
      return [box('top', [0, h - 0.02, station.depth / 2], [station.width, 0.04, station.depth], 'wood'), box('stand-mark', [0, 0.003, station.depth + 0.4], [0.5, 0.006, 0.3])]; }
    case 'conveyor': { const h = fittedHeight(station, hipHeight);
      return [box('belt', [0, h - 0.05, station.width / 2], [station.length, 0.1, station.width], 'belt'),
        ...(station.bin ? [box('bin', [station.length / 2 + 0.35, 0.3, station.width / 2], [0.6, 0.6, 0.6])] : []),
        box('stand-mark', [0, 0.003, station.width + station.stand_mark], [0.5, 0.006, 0.3])]; }
    case 'tool_bench': { const h = fittedHeight(station, hipHeight);
      return [box('top', [0, h - 0.03, station.depth / 2], [station.width, 0.06, station.depth], 'wood'), box('stand-mark', [0, 0.003, station.depth + 0.4], [0.5, 0.006, 0.3])]; }
    case 'weapon_rack': return [box('rack', [0, 0.75, 0.2], [station.width, 1.5, 0.3], 'wood')];
    case 'target_post': return [box('post', [0, station.height / 2, 0.3], [0.12, station.height, 0.12], 'wood'),
      ...Array.from({ length: station.pads }, (_, i) => box(`pad-${i + 1}`, [0, station.height * (i + 1) / (station.pads + 1), 0.22], [0.3, 0.3, 0.06], 'mat'))];
  }
}

// ── Jump pit ────────────────────────────────────────────────────────────────────────────────────────────────────

export interface LongJumpScore {
  /** From the board's front edge to the nearest mark in the sand (m); null without a landing in the sand. */
  distance_m: number | null;
  /** How far the take-off toe was past the board's front edge (cm); 0 = clean. */
  foul_cm: number;
  take_off_speed: number;
  /** Steps on the runway before the take-off. */
  steps: number;
  /** `short`: came down before the sand (no mark); `none`: never left the ground. */
  landing: 'forward' | 'back' | 'short' | 'none';
}
/** A planted foot's toe is this far in front of its frame point (m). */
const TOE = 0.12;

/** Measures a run on a jump pit from its frames (course metres). */
export function measureLongJump(station: Extract<LabStation, { kind: 'jump_pit' }>, frames: readonly LabFrame[]): LongJumpScore {
  const board = station.runway_length - station.board_gap, sand = station.runway_length;
  const local = frames.map(frame => ({ frame, root: worldToStation(station, [frame.x, frame.y, frame.z]), feet: frame.feet.map(foot => ({ planted: foot.planted, at: worldToStation(station, [foot.x, foot.y, foot.z]) })) }));
  // Landing: the first frame with a planted foot in the sand; take-off: the last frame with a planted foot before the flight.
  let land = local.findIndex(f => f.feet.some(foot => foot.planted && foot.at[2] >= sand));
  const short = land < 0;
  if (short) {
    // Came down before the sand: the first touch after a flight (both feet up) still gives the take-off.
    const flight = local.findIndex((f, i) => i > 0 && !f.feet.some(foot => foot.planted) && f.frame.y > 0.05);
    land = flight < 0 ? -1 : local.findIndex((f, i) => i > flight && f.feet.some(foot => foot.planted));
    if (land < 0) return { distance_m: null, foul_cm: 0, take_off_speed: 0, steps: 0, landing: 'none' };
  }
  let off = land - 1;
  while (off >= 0 && !local[off]!.feet.some(foot => foot.planted)) off--;
  const takeOff = local[Math.max(0, off)]!;
  const toe = Math.max(...takeOff.feet.filter(foot => foot.planted).map(foot => foot.at[2] + TOE), -Infinity);
  // The nearest mark: feet after landing, and the body when it sits or falls back (tilted).
  const after = local.slice(land, land + 30);
  const marks = after.flatMap(f => [...f.feet.filter(foot => foot.planted).map(foot => foot.at[2]), ...(f.frame.tilt > 45 ? [f.root[2]] : [])]);
  const mark = Math.min(...marks);
  let steps = 0;
  for (let i = 1; i <= off; i++) for (let k = 0; k < 2; k++) if (local[i]!.feet[k]!.planted && !local[i - 1]!.feet[k]!.planted) steps++;
  const end = local[Math.min(local.length - 1, land + 30)]!;
  const footMark = Math.min(...local[land]!.feet.filter(foot => foot.planted).map(foot => foot.at[2]));
  return { distance_m: short ? null : Math.round((mark - board) * 100) / 100, foul_cm: Math.round(Math.max(0, toe - board) * 1000) / 10,
    take_off_speed: Math.round(takeOff.frame.speed * 100) / 100, steps, landing: short ? 'short' : end.root[2] >= footMark ? 'forward' : 'back' };
}

// ── Grasp table ─────────────────────────────────────────────────────────────────────────────────────────────────

/** Most a grip holds (kg) with the hand fully closed; a half-closed hand holds half. */
export const GRIP_STRENGTH_KG: Record<LabProp['grip'], number> = { power: 15, handle: 12, hook: 10, pinch: 1.5 };
/** A closing hand takes an object when it is this near the object's surface (m), and it closes on it from this far. */
export const GRAB_REACH = 0.05, GRAB_CLOSE = 0.6, RELEASE_OPEN = 0.3;
const GRAVITY = 9.81;

export interface GraspHand { t: number; at: Vec3; /** 0 open … 1 closed. */ closing: number }
export interface GraspEvent { t: number; kind: 'grab' | 'drop' | 'place'; prop: string; value?: number }
export interface GraspObject { prop: LabProp; at: Vec3; held: boolean; offset: Vec3; fall: number; landed: boolean; released: 'place' | 'drop' | null }

/** Objects resting on the station's top (course metres). */
type GraspTable = Extract<LabStation, { kind: 'grasp_table' }>;
/** A spot on the table's top ([x, z] from its middle) in course metres. */
const tableSpot = (station: GraspTable, spot: readonly [number, number], y: number) => stationToWorld(station, [spot[0], y, station.depth / 2 + spot[1]]);
export function graspObjects(station: GraspTable, props: readonly LabProp[], hipHeight = STATION_REFERENCE_HIP): GraspObject[] {
  const top = fittedHeight(station, hipHeight);
  return props.filter(prop => prop.on === station.id).map(prop => ({ prop, at: tableSpot(station, prop.at, top + prop.size_m[1] / 2),
    held: false, offset: [0, 0, 0], fall: 0, landed: true, released: null }));
}
const radius = (prop: LabProp) => Math.max(...prop.size_m) / 2;
const distance = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * One step of the grasp engine: a hand that closes near an object takes it (reach recorded); a grip weaker than the
 * weight lets it slip (drop); an opening hand lets go (place). Free objects fall to `floorAt` (the table top or the floor).
 */
export function graspStep(objects: GraspObject[], hand: GraspHand, dt: number, floorAt: (x: number, z: number) => number, events: GraspEvent[]): void {
  const holding = objects.some(object => object.held);
  // A closing hand takes the nearest object it reaches, never one behind another.
  const nearest = holding || hand.closing < GRAB_CLOSE ? null : objects.filter(object => object.landed && distance(hand.at, object.at) - radius(object.prop) <= GRAB_REACH)
    .sort((a, b) => distance(hand.at, a.at) - distance(hand.at, b.at))[0] ?? null;
  for (const object of objects) {
    const { prop } = object;
    if (object.held) {
      // An opening hand lets go on purpose; only a closed grip that is too weak for the weight drops it.
      if (hand.closing < RELEASE_OPEN) { object.held = false; object.released = 'place'; object.landed = false; object.fall = 0; }
      else if (prop.mass_kg > GRIP_STRENGTH_KG[prop.grip] * hand.closing) { object.held = false; object.released = 'drop'; object.landed = false; object.fall = 0; events.push({ t: hand.t, kind: 'drop', prop: prop.id }); }
      else object.at = [hand.at[0] + object.offset[0], hand.at[1] + object.offset[1], hand.at[2] + object.offset[2]];
    } else if (object === nearest) {
      object.held = true; object.offset = [object.at[0] - hand.at[0], object.at[1] - hand.at[1], object.at[2] - hand.at[2]];
      events.push({ t: hand.t, kind: 'grab', prop: prop.id, value: Math.round(Math.max(0, distance(hand.at, object.at) - radius(prop)) * 1000) / 10 });
    }
    if (!object.held && !object.landed) {
      object.fall += GRAVITY * dt;
      const floor = floorAt(object.at[0], object.at[2]) + prop.size_m[1] / 2;
      object.at = [object.at[0], Math.max(floor, object.at[1] - object.fall * dt), object.at[2]];
      if (object.at[1] <= floor) { object.landed = true; object.fall = 0; if (object.released === 'place') events.push({ t: hand.t, kind: 'place', prop: prop.id }); }
    }
  }
}

export interface GraspScore { grabbed: number; held_without_drop: number; drops: number; /** Mean hand–object gap at the grab (cm). */ reach_cm: number | null; /** Mean distance from the target mark after placing (cm). */ place_error_cm: number | null }

/** Plays a hand path over the grasp table's objects and scores it. */
export function runGraspTable(station: GraspTable, props: readonly LabProp[], hand: readonly GraspHand[], hipHeight = STATION_REFERENCE_HIP): { score: GraspScore; events: GraspEvent[]; objects: GraspObject[]; track: Array<{ id: string; at: Vec3[] }> } {
  const objects = graspObjects(station, props, hipHeight), events: GraspEvent[] = [], top = fittedHeight(station, hipHeight);
  const onTable = (x: number, z: number) => { const p = worldToStation(station, [x, 0, z]); return Math.abs(p[0]) <= station.width / 2 && p[2] >= 0 && p[2] <= station.depth ? top : 0; };
  const track = objects.map(object => ({ id: object.prop.id, at: [] as Vec3[] }));
  hand.forEach((pose, i) => { graspStep(objects, pose, i ? pose.t - hand[i - 1]!.t : 0, onTable, events); objects.forEach((object, k) => track[k]!.at.push([...object.at])); });
  const grabs = events.filter(event => event.kind === 'grab'), dropped = new Set(events.filter(event => event.kind === 'drop').map(event => event.prop));
  const placed = objects.filter(object => object.released === 'place' && object.landed && object.prop.target);
  const errors = placed.map(object => { const target = tableSpot(station, object.prop.target!, 0); return Math.hypot(object.at[0] - target[0], object.at[2] - target[2]) * 100; });
  const mean = (values: number[]) => values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length * 10) / 10 : null;
  return { events, objects, track, score: { grabbed: new Set(grabs.map(event => event.prop)).size, held_without_drop: new Set(grabs.map(event => event.prop).filter(id => !dropped.has(id))).size,
    drops: events.filter(event => event.kind === 'drop').length, reach_cm: mean(grabs.map(event => event.value ?? 0)), place_error_cm: mean(errors) } };
}

// ── Runs on a station ───────────────────────────────────────────────────────────────────────────────────────────

const STEP = 1 / 60, round2 = (n: number) => Math.round(n * 100) / 100;
/** A station run: the frames and events as a course run has, plus where it faces, its measures and moving objects. */
export interface StationRunResult extends LabRunResult {
  station: string;
  /** The direction the character runs or faces (degrees, as a station's turn). */
  heading: number;
  stationScore: LabStationScore;
  objects: Array<{ id: string; at: Vec3[] }>;
}
const foot = (x: number, y: number, z: number, planted: boolean): LabFoot => ({ x, y, z, planted });
/** Station-local frame → course frame. */
function placeFrame(station: LabStation, f: LabFrame): LabFrame {
  const at = (x: number, y: number, z: number) => stationToWorld(station, [x, y, z]);
  const root = at(f.x, f.y, f.z), com = at(f.com[0], 0, f.com[1]);
  return { ...f, x: root[0], y: root[1], z: root[2], com: [com[0], com[2]], feet: f.feet.map(p => { const w = at(p.x, p.y, p.z); return foot(w[0], w[1], w[2], p.planted); }) as [LabFoot, LabFoot] };
}

/**
 * Jump pit run (engine v1, like the course's gait model): run-up at the run speed with a stride that grows with speed,
 * take-off from the left foot at the board (`jump_timing_ms` earlier or later; later can foul), a flight from the
 * take-off speed and an angle of 20° plus half the lean, feet reaching 0.45 m ahead into the sand, then the body goes
 * forward (lean ≥ 0) or sits back (lean < 0).
 */
export function simulateJumpPit(station: Extract<LabStation, { kind: 'jump_pit' }>, input: Partial<LabRunSettings> = {}, seed = 0): StationRunResult {
  const settings = LabRunSettings.parse(input), v = settings.speed, stride = Math.max(settings.stride, v * 0.32);
  const board = station.runway_length - station.board_gap, takeOff = Math.max(stride, board - 0.15 - TOE + (settings.jump_timing_ms / 1000) * v);
  const plants: number[] = [];
  for (let z = takeOff; z >= 0; z -= stride) plants.unshift(z);
  const firstFoot = (plants.length - 1) % 2 === 0 ? 0 : 1; // the last plant (take-off) is the left foot
  const frames: LabFrame[] = [], events: LabEvent[] = [{ t: 0, kind: 'start', label: 'start', station: station.id }];
  const side = (k: number) => (k === 0 ? 0.12 : -0.12);
  const frame = (t: number, z: number, y: number, feet: [LabFoot, LabFoot], speed: number, clip: string, tilt = 0, comZ = z): LabFrame => ({ t, x: 0, y, z, tilt, feet, com: [0, comZ], speed, clip });
  let t = 0, z = plants[0]!;
  for (; z < takeOff; z += v * STEP, t += STEP) {
    const i = plants.filter(p => p <= z + 1e-9).length - 1, k = (firstFoot + i) % 2, contact = z - plants[i]! < stride * 0.45;
    const feet: [LabFoot, LabFoot] = [foot(0.12, 0, z, false), foot(-0.12, 0, z, false)];
    if (contact) feet[k] = foot(side(k), 0, plants[i]!, true);
    feet[1 - k] = foot(side(1 - k), contact ? 0.12 : 0.06, z + stride * 0.3, false);
    if (!contact) feet[k] = foot(side(k), 0.08, z - stride * 0.2, false);
    frames.push(frame(t, z, contact ? 0 : 0.04, feet, v, 'Run'));
  }
  frames.push(frame(t, takeOff, 0, [foot(0.12, 0, takeOff, true), foot(-0.12, 0.2, takeOff + 0.4, false)], v, 'Run'));
  events.push({ t, kind: 'take_off', label: `take-off ${round2(board - takeOff - TOE)} m before the board edge`, station: station.id });
  if (takeOff + TOE > board) events.push({ t, kind: 'foul', label: `foul: toe ${Math.round((takeOff + TOE - board) * 100)} cm over the board`, station: station.id });
  const angle = Math.max(10, Math.min(30, 20 + settings.lean_deg / 2)) * Math.PI / 180, vx = v * Math.cos(angle), vy = v * Math.sin(angle);
  let air = 0;
  for (;;) {
    air += STEP; t += STEP;
    const height = vy * air - 4.905 * air * air, rz = takeOff + vx * air;
    if (0.95 + height <= 0.55 && air > 0.1) break;
    frames.push(frame(t, rz, Math.max(0, height + 0.1), [foot(0.12, Math.max(0.05, height + 0.25), rz + 0.3, false), foot(-0.12, Math.max(0.05, height + 0.25), rz + 0.3, false)], vx, 'Long Jump'));
  }
  const land = takeOff + vx * air + 0.45, back = settings.lean_deg < 0;
  events.push({ t, kind: 'land', label: `landed ${round2(land - board)} m from the board`, station: station.id });
  for (let i = 0; i < 40; i++, t += STEP) {
    const k = Math.min(1, i / 18), rz = back ? land - 0.5 * k : land - 0.45 + 0.75 * k;
    frames.push(frame(t, rz, 0, [foot(0.12, 0, land, true), foot(-0.12, 0, land, true)], 0, 'Soft Landing', back ? 70 * k : 0, rz));
  }
  events.push({ t, kind: 'finish', label: 'finish', station: station.id });
  const placed = frames.map(f => placeFrame(station, f)), measured = measureLongJump(station, placed);
  return { frames: placed, events, settings, seed, end: 'finish', station: station.id, heading: station.turn, objects: [],
    stationScore: { kind: 'jump_pit', values: { distance_m: measured.distance_m, foul_cm: measured.foul_cm, take_off_speed: measured.take_off_speed, steps: measured.steps, landing: measured.landing } } };
}

/**
 * Grasp table run (engine v1, a reach model like the gait model): the character stands on the stand mark facing the
 * table, side-steps in front of each object, reaches (arm 0.62 m plus a 0.45 m lean, scaled by hip height), closes the
 * hand, lifts, carries it to its mark (its own spot unless the course moves the mark), puts it down and goes back to
 * rest. Out-of-reach objects are missed.
 */
export function simulateGraspTable(station: GraspTable, props: readonly LabProp[], input: Partial<LabRunSettings> = {}, seed = 0, hipHeight = STATION_REFERENCE_HIP): StationRunResult {
  const settings = LabRunSettings.parse(input), size = hipHeight / STATION_REFERENCE_HIP, top = fittedHeight(station, hipHeight);
  const standZ = station.depth + 0.4, shoulderY = 1.4 * size, reach = 1.07 * size, sideSpeed = Math.min(1, settings.speed * 0.5);
  const mine = props.filter(prop => prop.on === station.id);
  const frames: LabFrame[] = [], hand: GraspHand[] = [];
  let t = 0, x = 0, h: Vec3 = [0, shoulderY - 0.55, standZ - 0.15];
  // Each foot stays where it touched down; when the body has moved, the foot farther from its place steps there
  // (one foot at a time, 1.5 m/s, lifted 5 cm), so planted feet never slide.
  const feetX = [0.12, -0.12];
  const local = (p: Vec3) => stationToWorld(station, p);
  const push = (target: Vec3, closing: number, seconds: number, move = 0) => {
    const n = Math.max(1, Math.round(seconds / STEP)), from = h, fromX = x;
    for (let i = 1; i <= n; i++) {
      const k = i / n, ease = k * k * (3 - 2 * k);
      x = fromX + (move - fromX) * ease;
      const want: Vec3 = [from[0] + (target[0] - from[0]) * ease, from[1] + (target[1] - from[1]) * ease, from[2] + (target[2] - from[2]) * ease];
      // The arm reaches only so far from the shoulder (lean included).
      const shoulder: Vec3 = [x, shoulderY, standZ - 0.05], d = distance(want, shoulder);
      h = d > reach ? [shoulder[0] + (want[0] - shoulder[0]) * reach / d, shoulder[1] + (want[1] - shoulder[1]) * reach / d, shoulder[2] + (want[2] - shoulder[2]) * reach / d] : want;
      t += STEP;
      hand.push({ t, at: local(h), closing });
      const off = [0, 1].map(side => x + (side ? -0.12 : 0.12) - feetX[side]!), lead = Math.abs(off[0]!) >= Math.abs(off[1]!) ? 0 : 1, swing = Math.abs(off[lead]!) > 0.01;
      if (swing) feetX[lead] = feetX[lead]! + Math.sign(off[lead]!) * Math.min(Math.abs(off[lead]!), 1.5 * STEP);
      const stepping = swing || Math.abs(move - fromX) > 0.02, up = (side: number) => swing && lead === side;
      frames.push({ t, x, y: 0, z: standZ, tilt: 0, com: [x, standZ - Math.min(0.25, Math.max(0, standZ - h[2] - 0.5) * 0.5)], speed: stepping ? sideSpeed : 0, clip: stepping ? 'Strafe Left' : 'Point',
        feet: [foot(feetX[0]!, up(0) ? 0.05 : 0, standZ, !up(0)), foot(feetX[1]!, up(1) ? 0.05 : 0, standZ, !up(1))] });
    }
  };
  const rest = (atX: number): Vec3 => [atX, shoulderY - 0.55, standZ - 0.15];
  for (const prop of mine) {
    const at: Vec3 = [prop.at[0], top + prop.size_m[1] / 2, station.depth / 2 + prop.at[1]], target = prop.target ?? prop.at;
    const to: Vec3 = [target[0], top + prop.size_m[1] / 2 + 0.02, station.depth / 2 + target[1]];
    const walk = (goal: number) => Math.abs(goal - x) / sideSpeed;
    push(rest(at[0]), 0, Math.max(0.2, walk(at[0])), at[0]);
    push([at[0], at[1] + 0.15, at[2]], 0, 0.5, at[0]);
    push([at[0], at[1] + 0.01, at[2]], 0, 0.2, at[0]);
    push([at[0], at[1] + 0.01, at[2]], 1, 0.15, at[0]);
    push([at[0], at[1] + 0.25, at[2]], 1, 0.3, at[0]);
    push([to[0], to[1] + 0.25, to[2]], 1, Math.max(0.4, walk(to[0])), to[0]);
    push(to, 1, 0.25, to[0]);
    push(to, 0, 0.15, to[0]);
    push(rest(to[0]), 0, 0.4, to[0]);
  }
  if (!frames.length) push(rest(0), 0, 0.5);
  const run = runGraspTable(station, props, hand, hipHeight), events: LabEvent[] = [{ t: 0, kind: 'start', label: 'start', station: station.id }];
  for (const event of run.events) events.push({ t: event.t, kind: event.kind, label: `${event.kind} ${event.prop}${event.kind === 'grab' && event.value !== undefined ? ` (${event.value} cm from it)` : ''}`, station: station.id });
  events.push({ t, kind: 'finish', label: 'finish', station: station.id });
  return { frames: frames.map(f => placeFrame(station, f)), events, settings, seed, end: 'finish', station: station.id, heading: (station.turn + 180) % 360, objects: run.track,
    stationScore: { kind: 'grasp_table', values: { objects: mine.length, grabbed: run.score.grabbed, held_without_drop: run.score.held_without_drop, drops: run.score.drops, reach_cm: run.score.reach_cm, place_error_cm: run.score.place_error_cm } } };
}

/** Stations whose runs are built (phase 1); the others are placed and drawn, their runs come in later phases. */
export const LAB_RUNNABLE_STATIONS: ReadonlyArray<LabStation['kind']> = ['jump_pit', 'grasp_table'];

/** How well the station's task went (0–100): a clean jump's distance against 8 m; objects held without a drop, less the place error. */
export function stationQuality(score: LabStationScore): number {
  const v = score.values, n = (key: string) => (typeof v[key] === 'number' ? v[key] as number : 0);
  if (score.kind === 'jump_pit') return n('foul_cm') > 0 || v.distance_m === null ? 0 : Math.round(Math.min(100, n('distance_m') / 8 * 100));
  if (score.kind === 'grasp_table') return n('objects') ? Math.max(0, Math.round(100 * n('held_without_drop') / n('objects') - Math.min(30, n('place_error_cm')))) : 0;
  return 0;
}

/** Runs one station of a course; the total is half the common score (no time goal on a station) and half the station's quality. */
export function runStation(course: LabCourse, id: string, input: Partial<LabRunSettings> = {}, seed = course.seed, hipHeight = STATION_REFERENCE_HIP): { result: StationRunResult; score: LabScore } {
  const station = course.stations.find(s => s.id === id);
  if (!station) throw new Error(`No station "${id}". Ask course_get for the ids.`);
  if (!LAB_RUNNABLE_STATIONS.includes(station.kind)) throw new Error(`Runs on the ${station.kind.replace('_', ' ')} come in a later phase; it is placed and drawn now.`);
  const result = station.kind === 'jump_pit' ? simulateJumpPit(station, input, seed) : simulateGraspTable(station as GraspTable, course.props, input, seed, hipHeight);
  const base = scoreLabRun(LabCourse.parse({ finish_z: 120 }), result), w = LAB_SCORE_WEIGHTS;
  let common = 100 - Math.min(w.slideMax, base.foot_slide_cm * w.slidePerCm) - Math.min(w.penetrationMax, base.penetration_cm * w.penetrationPerCm) - (1 - base.smoothness) * w.roughMax;
  if (base.fell) common = Math.min(common, w.fallCap);
  return { result, score: { ...base, finished: true, total: Math.max(0, Math.round((common + stationQuality(result.stationScore)) / 2)) } };
}
