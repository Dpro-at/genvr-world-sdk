import type { LabProp, LabStation } from '@genvr/contracts';
import type { LabFrame } from './sim.js';

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
  landing: 'forward' | 'back' | 'none';
}
/** A planted foot's toe is this far in front of its frame point (m). */
const TOE = 0.12;

/** Measures a run on a jump pit from its frames (course metres). */
export function measureLongJump(station: Extract<LabStation, { kind: 'jump_pit' }>, frames: readonly LabFrame[]): LongJumpScore {
  const board = station.runway_length - station.board_gap, sand = station.runway_length;
  const local = frames.map(frame => ({ frame, root: worldToStation(station, [frame.x, frame.y, frame.z]), feet: frame.feet.map(foot => ({ planted: foot.planted, at: worldToStation(station, [foot.x, foot.y, foot.z]) })) }));
  // Landing: the first frame with a planted foot in the sand; take-off: the last frame with a planted foot before the flight.
  const land = local.findIndex(f => f.feet.some(foot => foot.planted && foot.at[2] >= sand));
  if (land < 0) return { distance_m: null, foul_cm: 0, take_off_speed: 0, steps: 0, landing: 'none' };
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
  return { distance_m: Math.round((mark - board) * 100) / 100, foul_cm: Math.round(Math.max(0, toe - board) * 1000) / 10,
    take_off_speed: Math.round(takeOff.frame.speed * 100) / 100, steps, landing: end.root[2] >= footMark ? 'forward' : 'back' };
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
  for (const object of objects) {
    const { prop } = object;
    if (object.held) {
      // An opening hand lets go on purpose; only a closed grip that is too weak for the weight drops it.
      if (hand.closing < RELEASE_OPEN) { object.held = false; object.released = 'place'; object.landed = false; object.fall = 0; }
      else if (prop.mass_kg > GRIP_STRENGTH_KG[prop.grip] * hand.closing) { object.held = false; object.released = 'drop'; object.landed = false; object.fall = 0; events.push({ t: hand.t, kind: 'drop', prop: prop.id }); }
      else object.at = [hand.at[0] + object.offset[0], hand.at[1] + object.offset[1], hand.at[2] + object.offset[2]];
    } else if (!holding && object.landed && hand.closing >= GRAB_CLOSE && distance(hand.at, object.at) - radius(prop) <= GRAB_REACH) {
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
export function runGraspTable(station: GraspTable, props: readonly LabProp[], hand: readonly GraspHand[], hipHeight = STATION_REFERENCE_HIP): { score: GraspScore; events: GraspEvent[]; objects: GraspObject[] } {
  const objects = graspObjects(station, props, hipHeight), events: GraspEvent[] = [], top = fittedHeight(station, hipHeight);
  const onTable = (x: number, z: number) => { const p = worldToStation(station, [x, 0, z]); return Math.abs(p[0]) <= station.width / 2 && p[2] >= 0 && p[2] <= station.depth ? top : 0; };
  hand.forEach((pose, i) => graspStep(objects, pose, i ? pose.t - hand[i - 1]!.t : 0, onTable, events));
  const grabs = events.filter(event => event.kind === 'grab'), dropped = new Set(events.filter(event => event.kind === 'drop').map(event => event.prop));
  const placed = objects.filter(object => object.released === 'place' && object.landed && object.prop.target);
  const errors = placed.map(object => { const target = tableSpot(station, object.prop.target!, 0); return Math.hypot(object.at[0] - target[0], object.at[2] - target[2]) * 100; });
  const mean = (values: number[]) => values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length * 10) / 10 : null;
  return { events, objects, score: { grabbed: new Set(grabs.map(event => event.prop)).size, held_without_drop: new Set(grabs.map(event => event.prop).filter(id => !dropped.has(id))).size,
    drops: events.filter(event => event.kind === 'drop').length, reach_cm: mean(grabs.map(event => event.value ?? 0)), place_error_cm: mean(errors) } };
}
