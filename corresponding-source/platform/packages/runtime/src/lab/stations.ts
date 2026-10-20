import { LabCourse, LabProp, LabRunSettings, type LabEvent, type LabScore, type LabStation, type LabStationScore } from '@genvr/contracts';
import type { LabFrame, LabFoot, LabRunResult } from './sim.js';
import { LAB_SCORE_WEIGHTS, scoreLabRun } from './score.js';
import { labRandom } from './course.js';

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
  /** Objects the run brings itself (the conveyor's), drawn while it plays. */
  spawned: LabProp[];
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
  return { frames: placed, events, settings, seed, end: 'finish', station: station.id, heading: station.turn, objects: [], spawned: [],
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
  return { frames: frames.map(f => placeFrame(station, f)), events, settings, seed, end: 'finish', station: station.id, heading: (station.turn + 180) % 360, objects: run.track, spawned: [],
    stationScore: { kind: 'grasp_table', values: { objects: mine.length, grabbed: run.score.grabbed, held_without_drop: run.score.held_without_drop, drops: run.score.drops, reach_cm: run.score.reach_cm, place_error_cm: run.score.place_error_cm } } };
}

/** Stations whose runs are built (phase 1); the others are placed and drawn, their runs come in later phases. */
export const LAB_RUNNABLE_STATIONS: ReadonlyArray<LabStation['kind']> = ['jump_pit', 'grasp_table', 'conveyor', 'tool_bench', 'pool', 'climb_wall', 'ladder', 'weapon_rack', 'target_post', 'high_bar', 'hurdles'];

/** How well the station's task went (0–100): a clean jump's distance against 8 m; objects held without a drop, less the place error. */
export function stationQuality(score: LabStationScore): number {
  const v = score.values, n = (key: string) => (typeof v[key] === 'number' ? v[key] as number : 0);
  if (score.kind === 'jump_pit') return n('foul_cm') > 0 || v.distance_m === null ? 0 : Math.round(Math.min(100, n('distance_m') / 8 * 100));
  if (score.kind === 'grasp_table') return n('objects') ? Math.max(0, Math.round(100 * n('held_without_drop') / n('objects') - Math.min(30, n('place_error_cm')))) : 0;
  if (score.kind === 'conveyor') return Math.max(0, Math.round(n('picked_pct') - Math.min(20, n('timing_ms') / 10) - 5 * n('dropped')));
  if (score.kind === 'tool_bench') return Math.max(0, Math.min(100, Math.round(n('quality'))));
  if (score.kind === 'pool') return v.sank === 'yes' ? 0 : Math.round(0.5 * n('head_above_pct') + (v.reached_deep_end === 'yes' ? 30 : 0) + (n('ladder_exit_s') > 0 && n('ladder_exit_s') <= 8 ? 20 : 0));
  if (score.kind === 'weapon_rack' || score.kind === 'target_post') return v.body_cross === 'yes' ? 0 : Math.max(0, Math.round(n('hit_pct') - Math.min(20, n('mean_off_cm') / 2) - (v.balance === 'lost' ? 30 : 0)));
  if (score.kind === 'high_bar') return v.bar_touched === 'yes' ? 20 : Math.max(0, Math.min(100, Math.round(70 + Math.min(30, n('clearance_cm')) - (v.landing === 'lost balance' ? 30 : 0))));
  if (score.kind === 'hurdles') return Math.max(0, Math.round(100 - 25 * n('hurdles_hit') - (v.three_step === 'yes' ? 0 : 15) - (v.landing === 'lost balance' ? 30 : 0)));
  if (score.kind === 'climb_wall' || score.kind === 'ladder') return Math.max(0, Math.min(100, Math.round((v.reached_top === 'yes' ? 60 : 0) + 0.3 * n('three_point_pct') - 10 * n('slips') + (v.climb_down_clean === 'yes' ? 10 : 0))));
  return 0;
}

/** Runs one station of a course; the total is half the common score (no time goal on a station) and half the station's quality. */
export function runStation(course: LabCourse, id: string, input: Partial<LabRunSettings> = {}, seed = course.seed, hipHeight = STATION_REFERENCE_HIP): { result: StationRunResult; score: LabScore } {
  const station = course.stations.find(s => s.id === id);
  if (!station) throw new Error(`No station "${id}". Ask course_get for the ids.`);
  if (!LAB_RUNNABLE_STATIONS.includes(station.kind)) throw new Error(`Runs on the ${station.kind.replace('_', ' ')} come in a later phase; it is placed and drawn now.`);
  const result = station.kind === 'jump_pit' ? simulateJumpPit(station, input, seed)
    : station.kind === 'conveyor' ? simulateConveyor(station, input, seed, hipHeight)
    : station.kind === 'tool_bench' ? simulateToolBench(station, course.props, input, seed, hipHeight)
    : station.kind === 'pool' ? simulatePool(station, input, seed, hipHeight)
    : station.kind === 'climb_wall' || station.kind === 'ladder' ? simulateClimb(station, input, seed, hipHeight)
    : station.kind === 'weapon_rack' || station.kind === 'target_post' ? simulateStrikes(station, course, input, seed, hipHeight)
    : station.kind === 'high_bar' ? simulateHighBar(station, input, seed, hipHeight)
    : station.kind === 'hurdles' ? simulateHurdles(station, input, seed, hipHeight)
    : simulateGraspTable(station as GraspTable, course.props, input, seed, hipHeight);
  const measured = scoreLabRun(LabCourse.parse({ finish_z: 120 }), result), w = LAB_SCORE_WEIGHTS;
  // In the pool the feet stand on the pool's own floor, below the yard's: the yard floor is not a penetration there.
  const base = station.kind === 'pool' ? { ...measured, penetration_cm: 0 } : measured;
  let common = 100 - Math.min(w.slideMax, base.foot_slide_cm * w.slidePerCm) - Math.min(w.penetrationMax, base.penetration_cm * w.penetrationPerCm) - (1 - base.smoothness) * w.roughMax;
  if (base.fell) common = Math.min(common, w.fallCap);
  return { result, score: { ...base, finished: true, total: Math.max(0, Math.round((common + stationQuality(result.stationScore)) / 2)) } };
}

// ── Phase 2: conveyor and tool bench ────────────────────────────────────────────────────────────────────────────

/** A standing character at a station's stand mark (feet planted, facing the station), one frame per step. */
function standFrames(z: number, until: number, clip: string): LabFrame[] {
  return Array.from({ length: Math.max(2, Math.round(until / STEP) + 1) }, (_, i) => ({ t: i * STEP, x: 0, y: 0, z, tilt: 0, com: [0, z - 0.05] as [number, number], speed: 0, clip,
    feet: [foot(0.12, 0, z, true), foot(-0.12, 0, z, true)] as [LabFoot, LabFoot] }));
}
/** A seeded normal value (mean 0, spread 1). */
function gauss(next: () => number): number { return Math.sqrt(-2 * Math.log(Math.max(1e-9, next()))) * Math.cos(2 * Math.PI * next()); }

/** What the conveyor brings: light objects from the grasp table's set (mixed, or bottles only). */
const BELT_KINDS: Array<Pick<LabProp, 'name' | 'shape' | 'size_m' | 'mass_kg' | 'grip' | 'material'>> = [
  { name: 'Cube', shape: 'box', size_m: [0.05, 0.05, 0.05], mass_kg: 0.1, grip: 'pinch', material: 'plastic' },
  { name: 'Cup', shape: 'cylinder', size_m: [0.08, 0.1, 0.08], mass_kg: 0.3, grip: 'handle', material: 'plastic' },
  { name: 'Ball', shape: 'sphere', size_m: [0.22, 0.22, 0.22], mass_kg: 0.5, grip: 'power', material: 'plastic' },
  { name: 'Bottle', shape: 'cylinder', size_m: [0.08, 0.3, 0.08], mass_kg: 1, grip: 'power', material: 'plastic' },
  { name: 'Box', shape: 'box', size_m: [0.3, 0.3, 0.3], mass_kg: 3, grip: 'power', material: 'card' },
];
export const CONVEYOR_RUN_OBJECTS = 8;

/**
 * Conveyor run (engine v1): objects come every `every_s` at the belt's speed; the character stays on the stand mark.
 * The hand meets each object in front of it when it is free (0.35 s to reach, 0.9 s to toss and come back), closing
 * `jump_timing_ms` early (−) or late (+) plus a small seeded spread; a grab more than 5 cm off the object misses, an
 * edge grab (over 3 cm) of 1 kg or more slips. Picked objects are tossed into the bin; objects nobody picks ride to the
 * belt's end and fall into the bin.
 */
export function simulateConveyor(station: Extract<LabStation, { kind: 'conveyor' }>, input: Partial<LabRunSettings> = {}, seed = 0, hipHeight = STATION_REFERENCE_HIP): StationRunResult {
  const settings = LabRunSettings.parse(input), next = labRandom(seed ^ 0x5eed), size = hipHeight / STATION_REFERENCE_HIP;
  const top = fittedHeight(station, hipHeight), half = station.length / 2, beltZ = station.width / 2, standZ = station.width + station.stand_mark;
  const bin: Vec3 = [half + 0.35, 0.35, beltZ], reachX = Math.sqrt(Math.max(0, (1.07 * size) ** 2 - (standZ - beltZ) ** 2 - (1.4 * size - top) ** 2));
  const spawned = Array.from({ length: CONVEYOR_RUN_OBJECTS }, (_, i) => { const kind = station.mix ? BELT_KINDS[Math.floor(next() * BELT_KINDS.length)]! : BELT_KINDS[3]!;
    return LabProp.parse({ ...kind, id: `${station.id}-item-${i + 1}`, on: station.id, at: [-half + 0.1, 0] }); });
  const enter = spawned.map((_, i) => 1 + i * station.every_s), end = enter.at(-1)! + station.length / station.speed_mps + 1.5;
  const frames = standFrames(standZ, end, 'Point'), events: LabEvent[] = [{ t: 0, kind: 'start', label: 'start', station: station.id }];
  type Fate = { picked: number | null; tossed: boolean; dropped: boolean; timing: number | null };
  const fates: Fate[] = spawned.map(() => ({ picked: null, tossed: false, dropped: false, timing: null }));
  let free = 0;
  spawned.forEach((prop, i) => {
    const x = (t: number) => -half + 0.1 + station.speed_mps * (t - enter[i]!);
    // Meet it in front (x 0) or, when the hand is still busy, as soon as it is free while the object is in reach.
    let meet = enter[i]! + (half - 0.1) / station.speed_mps;
    if (meet - 0.35 < free) meet = free + 0.35;
    if (x(meet) > reachX || x(meet) > half) { events.push({ t: meet, kind: 'miss', label: `missed ${prop.name.toLowerCase()} (${prop.id}): out of reach before the hand was free`, station: station.id }); return; }
    const timing = settings.jump_timing_ms + gauss(next) * 15 * (1 + station.speed_mps), off = Math.abs(station.speed_mps * timing / 1000);
    fates[i]!.timing = Math.round(timing);
    free = meet + 0.9;
    if (off > 0.05) { events.push({ t: meet, kind: 'miss', label: `missed ${prop.name.toLowerCase()} by ${Math.round(off * 100)} cm (${Math.round(timing)} ms)`, station: station.id }); return; }
    fates[i]!.picked = meet + timing / 1000;
    events.push({ t: fates[i]!.picked!, kind: 'grab', label: `grab ${prop.name.toLowerCase()} (${Math.round(timing)} ms)`, station: station.id });
    if (off > 0.03 && prop.mass_kg >= 1) { fates[i]!.dropped = true; events.push({ t: fates[i]!.picked! + 0.2, kind: 'drop', label: `dropped ${prop.name.toLowerCase()} (edge grip)`, station: station.id }); return; }
    fates[i]!.tossed = true;
    events.push({ t: fates[i]!.picked! + 0.6, kind: 'place', label: `${prop.name.toLowerCase()} into the bin`, station: station.id });
  });
  events.sort((a, b) => a.t - b.t);
  events.push({ t: end, kind: 'finish', label: 'finish', station: station.id });
  // Where each object is on every frame.
  const objects = spawned.map((prop, i) => {
    const fate = fates[i]!, onBelt = (t: number): Vec3 => [Math.min(half, -half + 0.1 + station.speed_mps * (t - enter[i]!)), top + prop.size_m[1] / 2, beltZ];
    const hand = (t: number): Vec3 => { const at = onBelt(fate.picked!); return [at[0] * (1 - Math.min(1, (t - fate.picked!) / 0.6)) + bin[0] * Math.min(1, (t - fate.picked!) / 0.6), at[1] + 0.3 * Math.sin(Math.PI * Math.min(1, (t - fate.picked!) / 0.6)), beltZ]; };
    return { id: prop.id, at: frames.map(({ t }): Vec3 => {
      if (t < enter[i]!) return [-half - 0.6, -2, beltZ];
      if (fate.picked !== null && t >= fate.picked) {
        if (fate.dropped) return [onBelt(fate.picked)[0], Math.max(prop.size_m[1] / 2, top - 4.9 * (t - fate.picked) ** 2), station.width + 0.15];
        return t >= fate.picked + 0.6 ? [bin[0], bin[1], bin[2]] : hand(t);
      }
      const at = onBelt(t), past = -half + 0.1 + station.speed_mps * (t - enter[i]!) - half;
      return past > 0 ? [bin[0], Math.max(bin[1], at[1] - 4.9 * (past / station.speed_mps) ** 2), bin[2]] : at;
    }).map(p => stationToWorld(station, p)) };
  });
  const picked = fates.filter(f => f.picked !== null).length, timings = fates.flatMap(f => (f.timing === null ? [] : [Math.abs(f.timing)]));
  return { frames: frames.map(f => placeFrame(station, f)), events, settings, seed, end: 'finish', station: station.id, heading: (station.turn + 180) % 360, objects, spawned,
    stationScore: { kind: 'conveyor', values: { objects: spawned.length, picked, picked_pct: Math.round(100 * picked / spawned.length), timing_ms: timings.length ? Math.round(timings.reduce((a, b) => a + b, 0) / timings.length) : null,
      missed: spawned.length - picked, dropped: fates.filter(f => f.dropped).length, in_bin: fates.filter(f => f.tossed).length, reached_end: fates.filter(f => f.picked === null).length, steps: 0 } } };
}

/**
 * Tool bench run (engine v1): each tool on the bench in turn. Hammer: swings until the nail is in (4 hits) or 8 swings;
 * a swing lands off the nail head by a seeded spread that grows with the swing speed (the run speed); off by more than
 * 1.2 cm misses, 5 cm or more toward the holding hand hits it. Screwdriver: 6 turns of the screw at half a turn per
 * wrist turn at speed 1.6 or more. Saw: 12 strokes, straightness = mean sideways wander (cm). Wrench: two turns of the
 * bolt in quarter-turn pulls. The other hand holds the piece; swing smoothness follows the blend.
 */
export function simulateToolBench(station: Extract<LabStation, { kind: 'tool_bench' }>, props: readonly LabProp[], input: Partial<LabRunSettings> = {}, seed = 0, hipHeight = STATION_REFERENCE_HIP): StationRunResult {
  const settings = LabRunSettings.parse(input), next = labRandom(seed ^ 0x700f), f = settings.speed, top = fittedHeight(station, hipHeight), standZ = station.depth + 0.4;
  const events: LabEvent[] = [{ t: 0, kind: 'start', label: 'start', station: station.id }], values: Record<string, number | string | null> = {}, parts: number[] = [];
  const mine = props.filter(p => p.on === station.id), spot = (id: string): Vec3 | null => { const p = mine.find(q => q.id === `${station.id}-${id}`); return p ? [p.at[0], top + p.size_m[1] / 2, station.depth / 2 + p.at[1]] : null; };
  const moves: Array<{ id: string; from: number; to: number; path: (k: number) => Vec3 }> = [];
  let t = 0.3;
  const use = (tool: string, piece: string, seconds: number, motion: (k: number, rest: Vec3, work: Vec3) => Vec3) => {
    const rest = spot(tool), work = spot(piece);
    if (!rest || !work) return false;
    const lift: Vec3 = [work[0], work[1] + 0.12, work[2]];
    moves.push({ id: `${station.id}-${tool}`, from: t, to: t + 0.6, path: k => [rest[0] + (lift[0] - rest[0]) * k, rest[1] + 0.15 * Math.sin(Math.PI * k) + (lift[1] - rest[1]) * k, rest[2] + (lift[2] - rest[2]) * k] });
    moves.push({ id: `${station.id}-${tool}`, from: t + 0.6, to: t + 0.6 + seconds, path: k => motion(k, rest, lift) });
    moves.push({ id: `${station.id}-${tool}`, from: t + 0.6 + seconds, to: t + 1.2 + seconds, path: k => [lift[0] + (rest[0] - lift[0]) * k, lift[1] + 0.15 * Math.sin(Math.PI * k) + (rest[1] - lift[1]) * k, lift[2] + (rest[2] - lift[2]) * k] });
    return true;
  };
  for (const tool of station.tools) {
    if (tool === 'hammer') {
      const swingS = Math.max(0.25, Math.min(1.2, 0.8 / f)), spread = 0.4 + 0.35 * f;
      let hits = 0, swings = 0, selfHits = 0;
      const start = t + 0.6;
      while (hits < 4 && swings < 8) {
        swings++;
        const error = gauss(next) * spread, at = start + swings * swingS;
        if (error <= -5) { selfHits++; events.push({ t: at, kind: 'self_hit', label: `hammer hit the holding hand (${Math.round(-error)} cm off)`, station: station.id }); }
        else if (Math.abs(error) <= 1.2) { hits++; events.push({ t: at, kind: 'swing_hit', label: `hit the nail head (${Math.abs(error).toFixed(1)} cm)`, station: station.id }); }
        else events.push({ t: at, kind: 'miss', label: `missed the nail head by ${Math.abs(error).toFixed(1)} cm`, station: station.id });
      }
      if (use('hammer', 'nail-board', swings * swingS, (k, _rest, work) => [work[0], work[1] + 0.25 * Math.abs(Math.sin(Math.PI * k * swings)), work[2]])) {
        Object.assign(values, { hammer_hits: hits, hammer_swings: swings, swing_smoothness: Math.round(Math.min(1, 0.55 + settings.blend_s * 1.2) * 100) / 100, self_hits: selfHits });
        parts.push(100 * hits / swings - 50 * selfHits);
        t += 1.2 + swings * swingS + 0.3;
      }
    } else if (tool === 'screwdriver') {
      const perTwist = 0.5 * Math.min(1, f / 1.6), twists = Math.ceil(6 / perTwist);
      if (use('screwdriver', 'screw-plate', twists * 0.35, (k, _rest, work) => [work[0], work[1] - 0.04 * k, work[2]])) {
        values.screw_wrist_turns = twists; parts.push(100 * Math.min(1, 12 / twists)); t += 1.2 + twists * 0.35 + 0.3;
      }
    } else if (tool === 'saw') {
      let wander = 0;
      for (let i = 0; i < 12; i++) wander += Math.abs(gauss(next)) * (0.3 + 0.25 * f);
      const straight = Math.round(wander / 12 * 10) / 10;
      if (use('saw', 'plank', 12 * 0.5, (k, _rest, work) => [work[0] + 0.15 * Math.sin(Math.PI * 2 * 12 * k), work[1] - 0.02 * k, work[2]])) {
        values.saw_straightness_cm = straight; parts.push(100 * (1 - Math.min(1, straight / 3))); t += 1.2 + 6 + 0.3;
      }
    } else if (tool === 'wrench') {
      if (use('wrench', 'bolt', 8 * 0.4, (k, _rest, work) => [work[0] + 0.08 * Math.cos(Math.PI * 2 * 8 * k), work[1], work[2] + 0.08 * Math.sin(Math.PI * 2 * 8 * k)])) {
        values.wrench_pulls = 8; parts.push(100); t += 1.2 + 3.2 + 0.3;
      }
    }
  }
  values.other_hand_holds = 'yes';
  values.quality = parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : 0;
  events.sort((a, b) => a.t - b.t);
  events.push({ t, kind: 'finish', label: 'finish', station: station.id });
  const frames = standFrames(standZ, t, 'Build');
  const objects = [...new Set(moves.map(m => m.id))].map(id => {
    const own = moves.filter(m => m.id === id), rest = own[0]!.path(0);
    let last = rest;
    return { id, at: frames.map(({ t: now }) => { const m = own.find(row => now >= row.from && now <= row.to); if (m) last = m.path(Math.min(1, (now - m.from) / ((m.to - m.from) || 1))); else if (now < own[0]!.from) last = rest; return stationToWorld(station, last); }) };
  });
  return { frames: frames.map(fr => placeFrame(station, fr)), events, settings, seed, end: 'finish', station: station.id, heading: (station.turn + 180) % 360, objects, spawned: [],
    stationScore: { kind: 'tool_bench', values } };
}

// ── Phase 3: pool, climbing wall and ladder ─────────────────────────────────────────────────────────────────────

/** Water depth (m) at a spot along the pool (its zones, shallow end first). */
export function poolDepth(station: Extract<LabStation, { kind: 'pool' }>, along: number): number {
  const zones = [...station.zones].sort((a, b) => a.from_m - b.from_m);
  return [...zones].reverse().find(zone => along >= zone.from_m)?.depth_m ?? zones[0]!.depth_m;
}
/** Water this deep or more is swum; shallower water is walked (the board's stand vs swim switch). */
export const SWIM_DEPTH = 1.4;
/** Swimming faster than this (m/s) is the front crawl, slower the breaststroke (as in the game). */
const CRAWL_SPEED = 1.8;

/**
 * Pool run (engine v1): in by the steps at the shallow end, walking while the water is shallower than 1.4 m, then
 * swimming along the middle at ¾ of the run speed (at most 2 m/s; breaststroke below 1.8 m/s, a stroke every metre, a
 * breath every stroke; front crawl above, 1.8 m a stroke, a breath every third stroke), treading water for 3 s at the
 * deep end and out by the ladder (0.5 m/s, scaled by size). Swimming slower than 0.4 m/s in deep water sinks (fail). The head
 * is above the water while walking, treading and breathing, and under it between crawl breaths.
 */
export function simulatePool(station: Extract<LabStation, { kind: 'pool' }>, input: Partial<LabRunSettings> = {}, seed = 0, hipHeight = STATION_REFERENCE_HIP): StationRunResult {
  const settings = LabRunSettings.parse(input), size = hipHeight / STATION_REFERENCE_HIP, swim = Math.min(2, settings.speed * 0.75), crawl = swim > CRAWL_SPEED;
  const strokeLength = crawl ? 1.8 : 1, breathEvery = crawl ? 3 : 1, headHeight = 1.65 * size;
  const frames: LabFrame[] = [], events: LabEvent[] = [{ t: 0, kind: 'start', label: 'start', station: station.id }];
  let t = 0, z = -0.6, headAbove = 0, inWater = 0, strokes = 0, switchAt: number | null = null, sank = false, reachedDeep = false, exitS: number | null = null;
  // Walking: one foot planted where it stepped (a step every 0.6 m), the other swinging; swimming and climbing: no feet down.
  const walkFeet = (y: number): [LabFoot, LabFoot] => { const i = Math.floor((z + 0.6) / 0.6), at = i * 0.6 - 0.6, k = i % 2;
    const feet: [LabFoot, LabFoot] = [foot(0.12, y + 0.08, z + 0.3, false), foot(-0.12, y + 0.08, z + 0.3, false)];
    feet[k] = foot(k ? -0.12 : 0.12, y, at, true); return feet; };
  const push = (y: number, clip: string, speed: number, head: number, walking: boolean, tilt = 0) => {
    const water = z >= 0 && z <= station.length;
    if (water) { inWater++; if (head >= 0) headAbove++; }
    frames.push({ t, x: 0, y, z, tilt, com: [0, z], speed, clip, feet: walking ? walkFeet(y) : [foot(0.12, y - 0.3, z - 0.5, false), foot(-0.12, y - 0.3, z - 0.5, false)] });
    t += STEP;
  };
  // In by the steps: a walk down to the floor of the shallow end.
  events.push({ t: 0.3, kind: 'water_in', label: `in by the steps (splash ${Math.round(10 + 10 * Math.min(1, settings.speed / 4))} cm)`, station: station.id });
  const walk = Math.min(1.2, Math.max(0.4, settings.speed)), shallow = poolDepth(station, 0);
  while (z < 1.2) { const k = Math.max(0, Math.min(1, (z + 0.6) / 1.8)), floor = -shallow * k; push(floor, 'Walk', walk, floor + headHeight, true); z += walk * STEP; }
  // Walk while shallow, swim when 1.4 m deep or more.
  while (z < station.length - 0.5) {
    const depth = poolDepth(station, z);
    if (depth < SWIM_DEPTH) { push(-depth, 'Walk', walk * 0.7, headHeight - depth, true); z += walk * 0.7 * STEP; continue; }
    if (switchAt === null) { switchAt = z; events.push({ t, kind: 'swim', label: `swims from ${round2(z)} m (water ${depth} m deep)`, station: station.id }); }
    if (swim < 0.4) { sank = true; events.push({ t, kind: 'sink', label: `sank in ${depth} m deep water (too slow to swim)`, station: station.id }); break; }
    const before = Math.floor((z - switchAt) / strokeLength);
    z += swim * STEP;
    const now = Math.floor((z - switchAt) / strokeLength);
    if (now > before) { strokes++; if (strokes % breathEvery === 0) events.push({ t, kind: 'stroke', label: `stroke ${strokes} · breath`, station: station.id }); }
    // Breathing: the head is up for the first third of a breathing stroke.
    const phase = ((z - switchAt) / strokeLength) % 1, breathing = now % breathEvery === breathEvery - 1 || !crawl;
    push(-0.15, crawl ? 'Swim' : 'Breaststroke', swim, breathing && phase < (crawl ? 0.35 : 1) ? 0.1 : -0.12, false, 80);
  }
  if (!sank) {
    reachedDeep = true;
    events.push({ t, kind: 'float', label: `treads water in ${poolDepth(station, z)} m`, station: station.id });
    for (let i = 0; i < 180; i++) push(-0.6 * size, 'Breaststroke', 0, 0.15, false);
    // The ladder is reached floating (head just above the water), not from the pool floor.
    const from = Math.min(poolDepth(station, z), headHeight - 0.25), climb = (from + 0.3) / (0.5 * size), start = t;
    events.push({ t, kind: 'ladder', label: 'out by the ladder', station: station.id });
    for (let i = 0, n = Math.round(climb / STEP); i < n; i++) { const y = -from + (from + 0.05) * (i / n); push(y, 'Climb', 0, y + headHeight, false); }
    z += 0.6; push(0, 'Idle', 0, headHeight, true);
    events.push({ t, kind: 'finish', label: 'finish', station: station.id });
    exitS = round2(t - start);
  } else events.push({ t, kind: 'fall', label: 'sank', station: station.id });
  const swimTime = switchAt === null ? 0 : frames.filter(f => f.tilt > 45 && f.speed > 0).length * STEP;
  return { frames: frames.map(f => placeFrame(station, f)), events, settings, seed, end: sank ? 'fall' : 'finish', station: station.id, heading: station.turn, objects: [], spawned: [],
    stationScore: { kind: 'pool', values: { splash_cm: Math.round(10 + 10 * Math.min(1, settings.speed / 4)), head_above_pct: inWater ? Math.round(100 * headAbove / inWater) : 100,
      stroke: crawl ? 'front crawl' : 'breaststroke', strokes, strokes_per_min: swimTime ? Math.round(strokes / swimTime * 60) : 0, swim_speed: switchAt === null ? 0 : round2(swim),
      breath_every: breathEvery, swim_from_m: switchAt === null ? null : round2(switchAt), reached_deep_end: reachedDeep ? 'yes' : 'no', ladder_exit_s: exitS, sank: sank ? 'yes' : 'no' } } };
}

/**
 * Climbing wall or ladder run (engine v1): straight up and back down in front of it. On the wall each move takes one
 * limb to the next hold (holds every `hold_spacing`) while the other three hold; faster than 3 m/s run speed two limbs
 * move together (two-point contact). Each move may slip (seeded, 2 % plus 4 % per m/s over 1.6). On the ladder the
 * rungs are the holds. Time per move 0.6 s at 1.6 m/s (faster is quicker); the top is reached when the hands reach it.
 */
export function simulateClimb(station: Extract<LabStation, { kind: 'climb_wall' | 'ladder' }>, input: Partial<LabRunSettings> = {}, seed = 0, hipHeight = STATION_REFERENCE_HIP): StationRunResult {
  const settings = LabRunSettings.parse(input), next = labRandom(seed ^ 0xc11b), size = hipHeight / STATION_REFERENCE_HIP, f = Math.max(0.3, settings.speed);
  const wall = station.kind === 'climb_wall', height = station.height, spacing = wall ? station.hold_spacing : station.rung_spacing;
  const reach = 2.05 * size, moveS = Math.max(0.25, 0.6 * 1.6 / f), twoPoint = f > 3, slipChance = 0.02 + 0.04 * Math.max(0, f - 1.6);
  const rows = Math.floor(height / spacing), frontZ = wall ? 0.6 : 0.65;
  const frames: LabFrame[] = [], events: LabEvent[] = [{ t: 0, kind: 'start', label: 'start', station: station.id }];
  let t = 0, y = 0, holds = 0, moves = 0, threePoint = 0, slips = 0, slipsDown = 0, top = false;
  const hold = (seconds: number, clip: string, speed: number) => { for (let i = 0, n = Math.max(1, Math.round(seconds / STEP)); i < n; i++) {
    frames.push({ t, x: 0, y, z: frontZ, tilt: 0, com: [0, frontZ], speed, clip, feet: [foot(0.12, y, frontZ - 0.25, true), foot(-0.12, y, frontZ - 0.25, true)] }); t += STEP; } };
  hold(0.4, 'Idle', 0);
  // Up: the hands go one hold higher per hand move; the body follows.
  const limbs = ['right hand', 'left foot', 'left hand', 'right foot'];
  while (!top && moves < 400) {
    const limb = limbs[moves % 4]!, step = twoPoint ? 2 : 1;
    moves += step; if (!twoPoint) threePoint++;
    if (next() < slipChance) { slips++; events.push({ t, kind: 'slip', label: `${limb} slipped at ${round2(y)} m`, station: station.id }); hold(moveS, 'Climb', 0); continue; }
    if (limb.endsWith('hand') || twoPoint) { holds++; y = Math.min(height - reach * 0.55, y + spacing * (twoPoint ? 1 : 0.5)); }
    else y = Math.min(height - reach * 0.55, y + spacing * 0.5);
    hold(moveS, 'Climb', spacing / moveS);
    if (y + reach * 0.55 >= height - 1e-9 || holds >= rows) top = true;
  }
  if (top) events.push({ t, kind: 'top_out', label: `reached the top (${height} m)`, station: station.id });
  const upS = round2(t);
  hold(0.5, 'Idle', 0);
  // Down: the same moves back, with their own slips.
  while (y > 0) { if (next() < slipChance) { slipsDown++; events.push({ t, kind: 'slip', label: `slipped on the way down at ${round2(y)} m`, station: station.id }); } y = Math.max(0, y - spacing * 0.5); hold(moveS, 'Climb', spacing / moveS); }
  hold(0.3, 'Idle', 0);
  events.push({ t, kind: 'finish', label: 'finish', station: station.id });
  return { frames: frames.map(fr => placeFrame(station, fr)), events, settings, seed, end: 'finish', station: station.id, heading: (station.turn + 180) % 360, objects: [], spawned: [],
    stationScore: { kind: station.kind, values: { holds_reached: holds, holds_total: rows, three_point_pct: moves ? Math.round(100 * threePoint / moves) : 0, slips: slips + slipsDown,
      time_to_top_s: top ? upS : null, reached_top: top ? 'yes' : 'no', climb_down_clean: slipsDown === 0 ? 'yes' : 'no' } } };
}

// ── Phase 4: training weapons rack and target post ──────────────────────────────────────────────────────────────

type TargetPost = Extract<LabStation, { kind: 'target_post' }>;
/** Half the size of a target pad (m): a blow lands on it when it is this near its middle. */
export const PAD_HALF = 0.15;
/** What each training prop does at the target: its blows (pad: 0 low … 1 high), and how precise it is (cm of spread). */
const WEAPON_MOVES: Record<string, { blows: Array<[line: string, pad: number]>; spread: number; clip: string }> = {
  knife: { blows: [['thrust', 0.5], ['thrust', 0.5], ['thrust', 0.6]], spread: -1, clip: 'Strike' },
  sword: { blows: [['high line', 1], ['middle line', 0.5], ['low line', 0]], spread: 0, clip: 'Strike' },
  hammer: { blows: [['overhead blow', 0.7], ['overhead blow', 0.7]], spread: 1, clip: 'Strike' },
  staff: { blows: [['strike', 0.6], ['strike', 0.4], ['spin strike', 0.5]], spread: 2, clip: 'Strike' },
  axe: { blows: [['chop', 0.7], ['chop', 0.5]], spread: 1, clip: 'Strike' },
  shield: { blows: [], spread: 0, clip: 'Idle' },
  hands: { blows: [['punch', 0.7], ['punch', 0.5], ['punch', 0.7], ['kick', 0], ['kick', 0.2]], spread: 0.5, clip: 'Strike' },
};

/**
 * Strikes at a target post (engine v1). On the weapons rack each training prop in turn: taken from the rack, carried
 * to the nearest target post (within 8 m; else a practice target 2 m in front of the rack), its blows (knife thrusts,
 * the sword's three lines, hammer and axe blows, staff strikes and a spin, the shield's two blocks), back to guard and
 * put back. On a target post: bare-hand punches and kicks. A blow lands off the aimed pad's middle by a seeded spread
 * that grows with the run speed; within 15 cm it is a hit, counted once. Back to guard takes 0.25 s + 0.2 s per kg +
 * 0.4 s / speed. A staff spun faster than 5 m/s passes through the body (fail); leaning more than 12° loses balance.
 */
export function simulateStrikes(station: Extract<LabStation, { kind: 'weapon_rack' | 'target_post' }>, course: LabCourse, input: Partial<LabRunSettings> = {}, seed = 0, hipHeight = STATION_REFERENCE_HIP): StationRunResult {
  const settings = LabRunSettings.parse(input), next = labRandom(seed ^ 0xb10c), f = Math.max(0.3, settings.speed), size = hipHeight / STATION_REFERENCE_HIP;
  const rack = station.kind === 'weapon_rack' ? station : null;
  const dist = (a: LabStation, b: LabStation) => Math.hypot(a.x - b.x, a.z - b.z);
  const post = station.kind === 'target_post' ? station
    : (course.stations.filter((s): s is TargetPost => s.kind === 'target_post').sort((a, b) => dist(a, station) - dist(b, station))[0] ?? null);
  const usePost = post && (!rack || dist(post, rack) <= 8) ? post : null;
  // Pads in the course: the post's own, or a practice target 2 m in front of the rack.
  const pads: Vec3[] = usePost ? Array.from({ length: usePost.pads }, (_, i) => stationToWorld(usePost, [0, usePost.height * (i + 1) / (usePost.pads + 1), 0.22]))
    : [0.6, 1.0, 1.4].map(y => stationToWorld(station, [0, y, 2.8]));
  const target = usePost ? stationToWorld(usePost, [0, 0, 0.22]) : stationToWorld(station, [0, 0, 2.8]);
  const rackFront = rack ? stationToWorld(rack, [0, 0, 0.8]) : null;
  const frames: LabFrame[] = [], events: LabEvent[] = [{ t: 0, kind: 'start', label: usePost ? `start · target post ${usePost.id}` : 'start · practice target (no target post near)', station: station.id }];
  const props = rack ? course.props.filter(p => p.on === rack.id) : [];
  const tracks = new Map(props.map(p => [p.id, [] as Vec3[]]));
  const slot = (p: LabProp) => stationToWorld(rack!, [p.at[0], 0.75, 0.2]);
  let t = 0, at: Vec3 = rackFront ?? stationToWorld(station, [0, 0, 0.9]), held: LabProp | null = null, heldAt: Vec3 | null = null;
  // Facing the target from where the character stands.
  const facing = (from: Vec3) => Math.atan2(target[0] - from[0], target[2] - from[2]);
  // Where each foot stands now; standing frames keep them, walking and closing steps move them.
  const standSpot = (k: number): LabFoot => { const h = facing(at), side = k ? -0.12 : 0.12; return foot(at[0] + side * Math.cos(h), 0, at[2] - side * Math.sin(h), true); };
  let feetNow: [LabFoot, LabFoot] | null = null;
  const frame = (clip: string, speed: number, feet?: [LabFoot, LabFoot]) => {
    const h = facing(at);
    feetNow = feet ?? feetNow ?? [standSpot(0), standSpot(1)];
    frames.push({ t, x: at[0], y: 0, z: at[2], tilt: settings.lean_deg, com: [at[0] + Math.sin(h) * Math.sin(settings.lean_deg * Math.PI / 180) * 0.9, at[2] + Math.cos(h) * Math.sin(settings.lean_deg * Math.PI / 180) * 0.9], speed, clip,
      feet: feetNow });
    for (const p of props) tracks.get(p.id)!.push(p === held && heldAt ? heldAt : p === held ? [at[0] + Math.sin(h) * 0.35, 1.0 * size, at[2] + Math.cos(h) * 0.35] : slot(p));
    t += STEP;
  };
  const stand = (seconds: number, clip: string) => { for (let i = 0, n = Math.max(1, Math.round(seconds / STEP)); i < n; i++) frame(clip, 0); };
  // Walking: steps of up to 0.6 m; each step lifts one foot from where it is to its next spot while the other stays planted.
  const walk = (to: Vec3) => {
    const from = at, d = Math.hypot(to[0] - from[0], to[2] - from[2]), h = Math.atan2(to[0] - from[0], to[2] - from[2]);
    if (d < 0.01) return;
    feetNow ??= [standSpot(0), standSpot(1)];
    const steps = Math.ceil(d / 0.6), perStep = Math.max(2, Math.round(d / steps / 1.4 / STEP));
    for (let j = 0; j < steps; j++) {
      const k = j % 2, side = k ? -0.12 : 0.12, along = Math.min(d, (j + 1) * (d / steps)) + (j === steps - 1 ? 0 : 0.15);
      const start = feetNow![k]!, other = { ...feetNow![1 - k]!, planted: true }, target = foot(from[0] + Math.sin(h) * along + side * Math.cos(h), 0, from[2] + Math.cos(h) * along - side * Math.sin(h), true);
      const body0 = j * (d / steps);
      for (let i = 1; i <= perStep; i++) {
        const q = i / perStep, done = i === perStep;
        at = [from[0] + Math.sin(h) * (body0 + (d / steps) * q), 0, from[2] + Math.cos(h) * (body0 + (d / steps) * q)];
        const swing = foot(start.x + (target.x - start.x) * q, done ? 0 : 0.08 * Math.sin(Math.PI * q), start.z + (target.z - start.z) * q, done);
        frame('Walk', 1.4, k ? [other, swing] : [swing, other]);
      }
    }
    // Two closing steps: each foot in turn lifts and goes to its standing spot while the other stays planted.
    for (const k of [0, 1] as const) {
      const from = feetNow![k], to = standSpot(k), other = feetNow![1 - k]!, moved = Math.hypot(to.x - from.x, to.z - from.z) > 0.005;
      if (!moved) continue;
      for (let i = 1; i <= 12; i++) { const q = i / 12, step = foot(from.x + (to.x - from.x) * q, i < 12 ? 0.06 : 0, from.z + (to.z - from.z) * q, i === 12);
        frame('Walk', 0.4, k ? [{ ...other, planted: true }, step] : [step, { ...other, planted: true }]); }
    }
  };
  const standAt = (reach: number): Vec3 => { const d = Math.hypot(at[0] - target[0], at[2] - target[2]) || 1; return [target[0] + (at[0] - target[0]) / d * reach, 0, target[2] + (at[2] - target[2]) / d * reach]; };
  let strikes = 0, hits = 0, off = 0, recovery = 0, recoveries = 0, blocks = 0, angles: number[] = [], bodyCross = false;
  const routine = (kind: string, mass: number, length: number) => {
    const moves = WEAPON_MOVES[kind]!, spread = Math.max(0.5, 3 + 2.5 * f + moves.spread * 1.5);
    for (const [line, pad] of moves.blows) {
      strikes++;
      const aim = pads[Math.round(pad * (pads.length - 1))]!, ex = gauss(next) * spread / 100, ey = gauss(next) * spread / 100, miss = Math.hypot(ex, ey);
      const swing = Math.max(0.15, 0.45 / f * (1 + mass * 0.3)), n = Math.max(1, Math.round(swing / STEP)), h = facing(at), hand: Vec3 = [at[0] + Math.sin(h) * 0.35, 1.0 * size, at[2] + Math.cos(h) * 0.35];
      for (let i = 1; i <= n; i++) { const k = i / n; heldAt = [hand[0] + (aim[0] + ex * Math.cos(h) - hand[0]) * k, hand[1] + (aim[1] + ey - hand[1]) * k, hand[2] + (aim[2] - ex * Math.sin(h) - hand[2]) * k]; frame(moves.clip, 0); }
      // One blow, one count: a hit is the pad touched once, however long the prop stays on it.
      if (miss <= PAD_HALF) { hits++; events.push({ t, kind: 'swing_hit', label: `${line}: hit, ${Math.round(miss * 100)} cm from the pad's middle`, station: station.id }); }
      else events.push({ t, kind: 'miss', label: `${line}: missed the pad by ${Math.round((miss - PAD_HALF) * 100)} cm`, station: station.id });
      off += miss * 100;
      if (kind === 'staff' && line === 'spin strike' && f > 5) { bodyCross = true; events.push({ t, kind: 'body_cross', label: 'the staff passed through the body in the spin (fail)', station: station.id }); }
      const back = 0.25 + 0.2 * mass + 0.4 / f;
      recovery += back; recoveries++;
      for (let i = 1, m = Math.max(1, Math.round(back / STEP)); i <= m; i++) { const k = i / m; heldAt = heldAt ? [heldAt[0] + (hand[0] - heldAt[0]) * k, heldAt[1] + (hand[1] - heldAt[1]) * k, heldAt[2] + (hand[2] - heldAt[2]) * k] : null; frame('Idle', 0); }
      events.push({ t, kind: 'guard', label: `back to guard in ${round2(back)} s`, station: station.id });
      heldAt = null;
    }
    if (kind === 'shield') for (let i = 0; i < 2; i++) {
      const angle = Math.round(82 + gauss(next) * 6 + settings.lean_deg * 0.8);
      blocks++; angles.push(angle); stand(0.5, 'Idle');
      events.push({ t, kind: 'block', label: `block at ${angle}° ${angle >= 70 && angle <= 95 ? '(good)' : '(open)'}`, station: station.id });
    }
    void length;
  };
  if (rack) {
    if (!props.length) events.push({ t, kind: 'miss', label: 'the rack holds no training props', station: station.id });
    for (const prop of props) {
      stand(0.3, 'Idle'); held = prop; stand(0.3, 'Idle');
      walk(standAt(0.75 + prop.size_m[2] * 0.6)); stand(0.3, 'Idle');
      routine(prop.id.slice(rack.id.length + 1), prop.mass_kg, prop.size_m[2]);
      walk(rackFront!); stand(0.3, 'Idle'); held = null; stand(0.2, 'Idle');
    }
  } else { at = standAt(0.8); stand(0.4, 'Idle'); routine('hands', 0, 0.6); }
  stand(0.3, 'Idle');
  events.sort((a, b) => a.t - b.t);
  events.push({ t, kind: 'finish', label: 'finish', station: station.id });
  const balance = Math.abs(settings.lean_deg) > 12 ? 'lost' : 'ok';
  const heading = frames.length ? facing([frames.at(-1)!.x, 0, frames.at(-1)!.z]) * 180 / Math.PI : 0;
  return { frames, events, settings, seed, end: 'finish', station: station.id, heading: ((Math.round(heading) % 360) + 360) % 360, objects: props.map(p => ({ id: p.id, at: tracks.get(p.id)! })), spawned: [],
    stationScore: { kind: station.kind, values: { ...(rack ? { weapons: props.length } : {}), strikes, hits, hit_pct: strikes ? Math.round(100 * hits / strikes) : 0, mean_off_cm: strikes ? Math.round(off / strikes) : null,
      recovery_s: recoveries ? round2(recovery / recoveries) : null, ...(blocks ? { blocks, shield_angle_deg: Math.round(angles.reduce((a, b) => a + b, 0) / angles.length) } : {}),
      body_cross: bodyCross ? 'yes' : 'no', balance, grip: 'handle end', target: usePost ? usePost.id : 'practice target' } } };
}

// ── Phase 5: high bar, hurdles and running every station ────────────────────────────────────────────────────────

/** A straight run-up along the station (local z) with planted steps; returns where it ended. */
function runUp(frames: LabFrame[], from: number, to: number, speed: number, stride: number, t0: number): number {
  let t = t0;
  for (let z = from; z < to; z += speed * STEP, t += STEP) {
    const i = Math.floor((z - from) / stride), k = i % 2, plant = from + i * stride, contact = z - plant < stride * 0.45;
    const feet: [LabFoot, LabFoot] = [foot(0.12, 0.06, z + stride * 0.3, false), foot(-0.12, 0.06, z + stride * 0.3, false)];
    feet[k] = contact ? foot(k ? -0.12 : 0.12, 0, plant, true) : foot(k ? -0.12 : 0.12, 0.08, z - stride * 0.2, false);
    frames.push({ t, x: 0, y: contact ? 0 : 0.04, z, tilt: 0, com: [0, z], speed, clip: 'Run', feet });
  }
  return t;
}

/**
 * High bar run (engine v1, a scissor jump): run-up of 8 m at the run speed (at most 7 m/s), take-off 1 m before the bar
 * with a vertical speed of 55 % of the run speed (at most 4 m/s); the hips rise from 0.95 m × size by v² / 2g and pass the bar 25 cm
 * lower than their top (the scissor). Clearance = that lowest point over the bar; below it touches the bar. The body
 * lands on the mat; leaning back more than 12° loses balance.
 */
export function simulateHighBar(station: Extract<LabStation, { kind: 'high_bar' }>, input: Partial<LabRunSettings> = {}, seed = 0, hipHeight = STATION_REFERENCE_HIP): StationRunResult {
  const settings = LabRunSettings.parse(input), size = hipHeight / STATION_REFERENCE_HIP, v = Math.min(7, settings.speed), stride = Math.max(settings.stride, v * 0.32);
  const frames: LabFrame[] = [], events: LabEvent[] = [{ t: 0, kind: 'start', label: 'start', station: station.id }];
  const barZ = 0.5, takeOffZ = barZ - 1;
  let t = runUp(frames, takeOffZ - 8, takeOffZ, v, stride, 0);
  events.push({ t, kind: 'take_off', label: 'take-off 1 m before the bar', station: station.id });
  const vy = Math.min(4, v * 0.55), peak = 0.95 * size + vy * vy / 19.62, low = peak - 0.25, clearance = Math.round((low - station.height) * 100), touched = clearance < 0;
  const flight = 2 * vy / 9.81 + 0.15, vz = (barZ + 1.2 - takeOffZ) / flight;
  for (let a = 0; a < flight; a += STEP, t += STEP) {
    const z = takeOffZ + vz * a, y = Math.max(0, vy * a - 4.905 * a * a);
    frames.push({ t, x: 0, y, z, tilt: 0, com: [0, z], speed: vz, clip: 'Jump', feet: [foot(0.12, y + 0.2, z, false), foot(-0.12, y + 0.4, z + 0.3, false)] });
  }
  if (touched) events.push({ t: t - flight / 2, kind: 'bar_touch', label: `touched the bar (${-clearance} cm short)`, station: station.id });
  events.push({ t, kind: 'land', label: touched ? 'landed on the mat with the bar' : `cleared ${station.height} m by ${clearance} cm`, station: station.id });
  const back = settings.lean_deg < -12, matTop = station.mat[2], landZ = barZ + 1.2;
  for (let i = 0; i < 40; i++, t += STEP) frames.push({ t, x: 0, y: matTop, z: landZ, tilt: back ? 70 * Math.min(1, i / 18) : 0, com: [0, landZ], speed: 0, clip: back ? 'Hard Landing' : 'Soft Landing', feet: [foot(0.12, matTop, landZ, true), foot(-0.12, matTop, landZ, true)] });
  events.push({ t, kind: 'finish', label: 'finish', station: station.id });
  return { frames: frames.map(f => placeFrame(station, f)), events, settings, seed, end: 'finish', station: station.id, heading: station.turn, objects: [], spawned: [],
    stationScore: { kind: 'high_bar', values: { bar_m: station.height, clearance_cm: clearance, bar_touched: touched ? 'yes' : 'no', take_off_speed: round2(v), landing: back ? 'lost balance' : 'on the feet' } } };
}

/**
 * Hurdles run (engine v1): along the lane at the run speed; each hurdle is cleared by a 3.2 m hurdle stride whose
 * trail leg rises to 0.62 m × size plus 4 cm per m/s; lower than the hurdle hits it (it falls, counted once). Between
 * hurdles the steps are (spacing − 3.2) / stride, rounded: three is the rhythm that keeps the same lead leg.
 */
export function simulateHurdles(station: Extract<LabStation, { kind: 'hurdles' }>, input: Partial<LabRunSettings> = {}, seed = 0, hipHeight = STATION_REFERENCE_HIP): StationRunResult {
  const settings = LabRunSettings.parse(input), size = hipHeight / STATION_REFERENCE_HIP, v = Math.min(9, settings.speed), stride = Math.max(settings.stride, v * 0.3);
  const first = Math.max(2, station.lane_length - (station.count - 1) * station.spacing - 3), lift = 0.62 * size + 0.04 * v;
  const frames: LabFrame[] = [], events: LabEvent[] = [{ t: 0, kind: 'start', label: 'start', station: station.id }];
  let t = 0, z = 0, hits = 0;
  const steps = Math.max(1, Math.round((station.spacing - 3.2) / stride));
  for (let h = 0; h < station.count; h++) {
    const at = first + h * station.spacing;
    t = runUp(frames, z, at - 1.6, v, stride, t);
    // The hurdle stride: 3.2 m over the hurdle.
    const n = Math.max(2, Math.round(3.2 / v / STEP));
    for (let i = 1; i <= n; i++, t += STEP) { const zz = at - 1.6 + 3.2 * i / n, y = lift * Math.sin(Math.PI * i / n); frames.push({ t, x: 0, y: y * 0.5, z: zz, tilt: 0, com: [0, zz], speed: v, clip: 'Jump Forward', feet: [foot(0.12, y, zz + 0.3, false), foot(-0.12, y * 0.8, zz - 0.3, false)] }); }
    if (lift < station.height) { hits++; events.push({ t, kind: 'bar_touch', label: `hit hurdle ${h + 1} (trail leg ${Math.round((station.height - lift) * 100)} cm low)`, station: station.id }); }
    else events.push({ t, kind: 'step', label: `over hurdle ${h + 1} by ${Math.round((lift - station.height) * 100)} cm`, station: station.id });
    z = at + 1.6;
  }
  t = runUp(frames, z, station.lane_length, v, stride, t);
  const back = Math.abs(settings.lean_deg) > 12;
  for (let i = 0; i < 30; i++, t += STEP) frames.push({ t, x: 0, y: 0, z: station.lane_length, tilt: back ? 70 * Math.min(1, i / 18) : 0, com: [0, station.lane_length], speed: 0, clip: 'Sprint Stop', feet: [foot(0.12, 0, station.lane_length, true), foot(-0.12, 0, station.lane_length, true)] });
  events.push({ t, kind: 'finish', label: 'finish', station: station.id });
  return { frames: frames.map(f => placeFrame(station, f)), events, settings, seed, end: 'finish', station: station.id, heading: station.turn, objects: [], spawned: [],
    stationScore: { kind: 'hurdles', values: { hurdles: station.count, hurdles_hit: hits, steps_between: steps, three_step: steps === 3 ? 'yes' : 'no', trail_leg_m: round2(lift), time_s: round2(t), landing: back ? 'lost balance' : 'on the feet' } } };
}

/** One line of the all-stations report: the best of the station's runs and the seed that gave it. */
export interface StationReportRow { station: string; kind: LabStation['kind']; runs: number; best: number; worst: number; seed: number; values: LabStationScore['values'] }

/**
 * Runs every station with an engine `repeats` times (seeds course.seed, +1, …) without keeping the runs, and reports
 * the best total per station, worst first (what to train next). The step before the night queue (board M6).
 */
export function runAllStations(course: LabCourse, input: Partial<LabRunSettings> = {}, repeats = 3, hipHeight = STATION_REFERENCE_HIP): StationReportRow[] {
  const rows: StationReportRow[] = [];
  for (const station of course.stations) {
    if (station.hidden || !LAB_RUNNABLE_STATIONS.includes(station.kind)) continue;
    let best: { total: number; seed: number; values: LabStationScore['values'] } | null = null, worst = 100;
    for (let r = 0; r < Math.max(1, Math.min(20, repeats)); r++) {
      const seed = course.seed + r, { result, score } = runStation(course, station.id, input, seed, hipHeight);
      worst = Math.min(worst, score.total);
      if (!best || score.total > best.total) best = { total: score.total, seed, values: result.stationScore.values };
    }
    rows.push({ station: station.id, kind: station.kind, runs: Math.max(1, Math.min(20, repeats)), best: best!.total, worst, seed: best!.seed, values: best!.values });
  }
  return rows.sort((a, b) => a.best - b.best || a.station.localeCompare(b.station));
}
