import { describe, expect, it } from 'vitest';
import { LAB_STATION_KINDS, LabCourse, LabStation, baseLabStations, graspTableProps } from '@genvr/contracts';
import type { LabFrame } from '../src/lab/sim.js';
import { fittedHeight, measureLongJump, runGraspTable, runStation, stationParts, stationToWorld, worldToStation, type GraspHand, type Vec3 } from '../src/lab/stations.js';

const pit = LabStation.parse({ kind: 'jump_pit', id: 'pit', z: 0 }) as Extract<LabStation, { kind: 'jump_pit' }>;
const table = LabStation.parse({ kind: 'grasp_table', id: 'table', z: 0 }) as Extract<LabStation, { kind: 'grasp_table' }>;

/** A run down the pit's runway: alternating steps, take-off with the left foot at `takeOffZ`, landing with both feet at `landZ`. */
function jumpRun(takeOffZ: number, landZ: number, fallBack = false): LabFrame[] {
  const frames: LabFrame[] = [], speed = 9, frame = (t: number, z: number, left: [number, boolean], right: [number, boolean], tilt = 0): LabFrame =>
    ({ t, x: 0, y: 0, z, tilt, feet: [{ x: 0.1, y: 0, z: left[0], planted: left[1] }, { x: -0.1, y: 0, z: right[0], planted: right[1] }], com: [0, z], speed, clip: 'Run' });
  let t = 0;
  for (let step = 0, z = takeOffZ - 12; z < takeOffZ; step++, z += 2) frames.push(frame(t += 0.22, z, [z, step % 2 === 0], [z, step % 2 === 1]));
  frames.push(frame(t += 0.1, takeOffZ, [takeOffZ, true], [takeOffZ + 0.5, false]));
  for (let z = takeOffZ + 1; z < landZ; z += 1) frames.push(frame(t += 0.1, z, [z, false], [z, false]));
  frames.push(frame(t += 0.1, landZ + 0.3, [landZ, true], [landZ, true]));
  for (let i = 0; i < 20; i++) frames.push(frame(t += 0.05, fallBack ? landZ - 0.4 : landZ + 0.5, [landZ, true], [landZ, true], fallBack ? 70 : 0));
  return frames;
}

describe('board M18 · stations in the engine', () => {
  it('every station kind has parts, and station ↔ course points round-trip with its turn', () => {
    for (const station of baseLabStations()) {
      expect(stationParts(station).length, station.kind).toBeGreaterThan(0);
      const p: Vec3 = [0.4, 1, 2.5], back = worldToStation(station, stationToWorld(station, p));
      back.forEach((v, i) => expect(v).toBeCloseTo(p[i]!, 9));
    }
    expect(new Set(baseLabStations().map(s => s.kind))).toEqual(new Set(LAB_STATION_KINDS));
    // The pit: runway, a 0.2 m board ending 2 m before the sand, sand 0.4 m deep.
    const parts = stationParts(pit);
    expect(parts.find(p => p.part === 'board')).toMatchObject({ center: [0, 0.01, 17.9], size: [1.2, 0.02, 0.2] });
    expect(parts.find(p => p.part === 'sand')).toMatchObject({ center: [0, -0.2, 24], surface: 'sand' });
  });
  it('long jump: distance from the board edge to the nearest mark, and the foul', () => {
    const clean = measureLongJump(pit, jumpRun(17.7, 24.1));
    expect(clean).toMatchObject({ distance_m: 6.1, foul_cm: 0, take_off_speed: 9, landing: 'forward' });
    expect(clean.steps).toBeGreaterThan(3);
    const foul = measureLongJump(pit, jumpRun(17.95, 24));
    expect(foul.foul_cm).toBe(7);
    // Falling back: the body's mark behind the feet counts.
    expect(measureLongJump(pit, jumpRun(17.7, 24.1, true))).toMatchObject({ distance_m: 5.7, landing: 'back' });
    expect(measureLongJump(pit, jumpRun(10, 15)).distance_m).toBeNull();
  });
  it('grasp table: the hand lifts the 1 kg bottle without a drop and puts it on its mark', () => {
    const props = graspTableProps('table'), bottle = props.find(p => p.id === 'table-bottle-1')!;
    const start = stationToWorld(table, [bottle.at[0], 0.75 + 0.15, 0.45 + bottle.at[1]]), mark = stationToWorld(table, [bottle.target![0], 0.75 + 0.15, 0.45 + bottle.target![1]]);
    const hand: GraspHand[] = [];
    let t = 0;
    const go = (to: Vec3, closing: number, n = 20) => { const from = hand.at(-1)?.at ?? to; for (let i = 1; i <= n; i++) hand.push({ t: t += 1 / 60, at: [from[0] + (to[0] - from[0]) * i / n, from[1] + (to[1] - from[1]) * i / n, from[2] + (to[2] - from[2]) * i / n], closing }); };
    go([start[0], start[1] + 0.3, start[2]], 0, 1); go([start[0], start[1] + 0.01, start[2]], 0); go([start[0], start[1] + 0.01, start[2]], 1, 5);
    go([start[0], start[1] + 0.3, start[2]], 1); go([mark[0], mark[1] + 0.3, mark[2]], 1, 40); go([mark[0], mark[1] + 0.02, mark[2]], 1); go([mark[0], mark[1] + 0.3, mark[2]], 0, 30);
    const { score, events, objects } = runGraspTable(table, props, hand);
    expect(events.map(e => `${e.kind}:${e.prop}`)).toEqual(['grab:table-bottle-1', 'place:table-bottle-1']);
    expect(score).toMatchObject({ grabbed: 1, held_without_drop: 1, drops: 0 });
    expect(score.reach_cm!).toBeLessThan(5);
    expect(score.place_error_cm!).toBeLessThan(2);
    const placed = objects.find(o => o.prop.id === bottle.id)!;
    expect(placed.at[1]).toBeCloseTo(0.75 + 0.15, 3);
  });
  it('a grip too weak for the 8 kg crate lets it slip; a hand too far away grabs nothing', () => {
    const props = graspTableProps('table'), crate = props.find(p => p.id === 'table-crate-1')!;
    const at = stationToWorld(table, [crate.at[0], 0.75 + 0.2, 0.45 + crate.at[1]]);
    const weak = runGraspTable(table, props, [{ t: 0, at: [at[0], at[1] + 0.2, at[2]], closing: 0.6 }, { t: 1 / 60, at: [at[0], at[1] + 0.25, at[2]], closing: 0.6 }, ...Array.from({ length: 60 }, (_, i) => ({ t: (i + 2) / 60, at: [at[0], at[1] + 0.3, at[2]] as Vec3, closing: 0.6 }))]);
    expect(weak.events.map(e => e.kind)).toEqual(['grab', 'drop']);
    expect(weak.score).toMatchObject({ grabbed: 1, held_without_drop: 0, drops: 1 });
    expect(weak.objects.find(o => o.prop.id === crate.id)!.at[1]).toBeCloseTo(0.75 + 0.2, 3);
    const far = runGraspTable(table, props, [{ t: 0, at: [at[0], at[1] + 0.5, at[2]], closing: 1 }]);
    expect(far.score.grabbed).toBe(0);
  });
  it('fit to character: a body with half the hip height gets a table half as high', () => {
    expect(fittedHeight(table, 0.42)).toBe(0.375);
    expect(fittedHeight({ ...table, fit_to_character: false }, 0.42)).toBe(0.75);
    expect(stationParts(table, 0.42).find(p => p.part === 'top')!.center[1]).toBeCloseTo(0.355, 6);
  });
});

describe('board M18 · runs on a station', () => {
  const course = LabCourse.parse({ stations: [pit, table], props: graspTableProps('table') });
  it('a jump pit run takes off at the board, flies and lands in the sand; a late take-off fouls', () => {
    const { result, score } = runStation(course, 'pit', { speed: 8, stride: 1.6 });
    const v = result.stationScore.values;
    expect(v.foul_cm).toBe(0);
    expect(v.distance_m as number).toBeGreaterThan(4);
    expect(v.distance_m as number).toBeLessThan(8);
    expect(result.events.map(e => e.kind)).toEqual(['start', 'take_off', 'land', 'finish']);
    expect(score.total).toBeGreaterThan(50);
    const late = runStation(course, 'pit', { speed: 8, stride: 1.6, jump_timing_ms: 60 });
    expect(late.result.stationScore.values.foul_cm as number).toBeGreaterThan(0);
    expect(late.result.events.some(e => e.kind === 'foul')).toBe(true);
    expect(late.score.total).toBeLessThan(score.total);
    // Same course, settings and seed: the same run.
    expect(runStation(course, 'pit', { speed: 8, stride: 1.6 }).result.frames).toEqual(result.frames);
  });
  it('a slow run-up comes down before the sand: no distance, but take-off speed and steps are measured', () => {
    const v = runStation(course, 'pit', { speed: 1.6 }).result.stationScore.values;
    expect(v).toMatchObject({ distance_m: null, landing: 'short', take_off_speed: 1.6 });
    expect(v.steps as number).toBeGreaterThan(5);
  });
  it('a grasp table run grabs the reachable objects, carries them to their marks and drops nothing', () => {
    const { result, score } = runStation(course, 'table');
    const v = result.stationScore.values;
    expect(v.objects).toBe(12);
    expect(v.drops).toBe(0);
    expect(v.grabbed as number).toBeGreaterThanOrEqual(6);
    expect(v.place_error_cm as number).toBeLessThan(3);
    expect(result.objects).toHaveLength(12);
    expect(result.objects[0]!.at).toHaveLength(result.frames.length);
    expect(score.total).toBeGreaterThan(40);
    // Side-steps keep the planted feet still.
    expect(score.foot_slide_cm).toBeLessThan(2);
    // A smaller body (half the hip height) reaches less far.
    const small = runStation(course, 'table', {}, course.seed, 0.42).result.stationScore.values;
    expect(small.grabbed as number).toBeLessThanOrEqual(v.grabbed as number);
  });
  it('stations without a phase-1 engine say so', () => {
    const pool = LabCourse.parse({ stations: [LabStation.parse({ kind: 'pool', id: 'pool', z: 0 })] });
    expect(() => runStation(pool, 'pool')).toThrow('later phase');
    expect(() => runStation(pool, 'nope')).toThrow('No station');
  });
});
