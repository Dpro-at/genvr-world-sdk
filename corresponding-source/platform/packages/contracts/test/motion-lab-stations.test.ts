import { describe, expect, it } from 'vitest';
import { LAB_BASE_YARD, LAB_MAX_STATIONS, LAB_STATION_KINDS, LabProp, LabStation, LabWeaponRack, baseLabStations, graspTableProps, stationCorners, stationProblems } from '../src/index.js';

describe('board M18 · training stations', () => {
  it('every station kind parses with the board defaults', () => {
    for (const kind of LAB_STATION_KINDS) expect(LabStation.parse({ kind, id: kind.replace('_', '-'), z: 1 }).kind).toBe(kind);
    expect(LabStation.parse({ kind: 'jump_pit', id: 'pit', z: 0 })).toMatchObject({ runway_length: 20, runway_width: 1.2, board_gap: 2, sand_length: 8, sand_width: 3, sand_depth: 0.4 });
    expect(LabStation.parse({ kind: 'pool', id: 'pool', z: 0 })).toMatchObject({ length: 12.5, width: 6, zones: [{ from_m: 0, depth_m: 1 }, { from_m: 4, depth_m: 1.4 }, { from_m: 8, depth_m: 2 }] });
    expect(LabStation.parse({ kind: 'grasp_table', id: 'table', z: 0 })).toMatchObject({ width: 2, depth: 0.9, height: 0.75, fit_to_character: true });
    expect(LabWeaponRack.parse({ kind: 'weapon_rack', id: 'rack', z: 0 }).weapons).toEqual(['knife', 'sword', 'hammer', 'staff', 'shield', 'axe']);
  });
  it('refuses sizes outside the board limits', () => {
    expect(() => LabStation.parse({ kind: 'high_bar', id: 'bar', z: 0, height: 2.5 })).toThrow();
    expect(() => LabStation.parse({ kind: 'jump_pit', id: 'pit', z: 0, board_gap: 0.5 })).toThrow();
    expect(() => LabStation.parse({ kind: 'grasp_table', id: 'table', z: 0, height: 1.3 })).toThrow();
    expect(() => LabStation.parse({ kind: 'hurdles', id: 'h', z: 0, count: 11 })).toThrow();
    expect(() => LabStation.parse({ kind: 'pool', id: 'pool', z: 0, zones: [] })).toThrow();
    expect(() => LabStation.parse({ kind: 'jump_pit', id: 'Pit!', z: 0 })).toThrow();
  });
  it('keeps the conveyor between 0.1 and 1 m/s with one object every 1–5 s', () => {
    expect(LabStation.parse({ kind: 'conveyor', id: 'belt', z: 0 })).toMatchObject({ speed_mps: 0.3, every_s: 3, height: 0.85, bin: true });
    expect(() => LabStation.parse({ kind: 'conveyor', id: 'belt', z: 0, speed_mps: 1.5 })).toThrow();
    expect(() => LabStation.parse({ kind: 'conveyor', id: 'belt', z: 0, every_s: 0.5 })).toThrow();
  });
  it('ids are unique across stations, obstacles and props; props sit on a station; at most 12 stations', () => {
    const stations = [LabStation.parse({ kind: 'grasp_table', id: 'table', z: 0 }), LabStation.parse({ kind: 'jump_pit', id: 'step-1', z: 5 })];
    expect(stationProblems(stations, ['step-1'])).toEqual(['Two parts share the id "step-1".']);
    expect(stationProblems(stations.slice(0, 1), [], [LabProp.parse({ id: 'cup', on: 'shelf', name: 'Cup', shape: 'cylinder', size_m: [0.08, 0.1, 0.08], mass_kg: 0.3, grip: 'handle' })]))
      .toEqual(['"cup" is on a station that is not in the course ("shelf").']);
    const many = Array.from({ length: LAB_MAX_STATIONS + 1 }, (_, i) => LabStation.parse({ kind: 'ladder', id: `ladder-${i}`, z: i }));
    expect(stationProblems(many)).toEqual([`A course holds at most ${LAB_MAX_STATIONS} stations.`]);
  });
  it('the grasp table holds the board 12 objects, cube 0.1 kg to crate 8 kg', () => {
    const props = graspTableProps('table');
    expect(props).toHaveLength(12);
    expect(props.map(p => p.mass_kg).sort((a, b) => a - b)).toEqual([0.1, 0.1, 0.3, 0.3, 0.5, 0.5, 1, 1, 3, 3, 8, 8]);
    expect(stationProblems([LabStation.parse({ kind: 'grasp_table', id: 'table', z: 0 })], [], props)).toEqual([]);
  });
  it('the base lab fits every station in the 42 × 26 m yard without two touching', () => {
    const stations = baseLabStations();
    expect(new Set(stations.map(s => s.kind))).toEqual(new Set(LAB_STATION_KINDS));
    expect(stationProblems(stations)).toEqual([]);
    const boxes = stations.map(station => { const c = stationCorners(station); return { id: station.id, x0: Math.min(...c.map(p => p[0])), x1: Math.max(...c.map(p => p[0])), z0: Math.min(...c.map(p => p[1])), z1: Math.max(...c.map(p => p[1])) }; });
    for (const b of boxes) {
      expect(b.x0, b.id).toBeGreaterThanOrEqual(LAB_BASE_YARD.x - LAB_BASE_YARD.width / 2); expect(b.x1, b.id).toBeLessThanOrEqual(LAB_BASE_YARD.x + LAB_BASE_YARD.width / 2);
      // Clear of the course's run line (x −3 … 3 m).
      expect(b.x0, b.id).toBeGreaterThan(3);
      expect(b.z0, b.id).toBeGreaterThanOrEqual(0); expect(b.z1, b.id).toBeLessThanOrEqual(LAB_BASE_YARD.depth);
    }
    for (const a of boxes) for (const b of boxes) if (a !== b) expect(a.x1 <= b.x0 || b.x1 <= a.x0 || a.z1 <= b.z0 || b.z1 <= a.z0, `${a.id} / ${b.id}`).toBe(true);
  });
});
