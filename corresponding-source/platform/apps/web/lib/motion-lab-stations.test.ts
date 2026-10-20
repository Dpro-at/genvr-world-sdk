import { describe, expect, it } from 'vitest';
import { LabProjectData } from '@genvr/contracts';
import { LabController, newLabData, runMotionLab, PERSON } from './motion-lab';

const agent = { kind: 'agent' as const, name: 'Luna' };

describe('board M18 · stations in the Lab and through motion_lab', () => {
  it('station_add → run on it → scores, the same for a person and an agent', async () => {
    const saved: LabProjectData[] = [];
    const lab = new LabController(newLabData(), (data) => saved.push(data));
    const pit = await runMotionLab(lab, { kind: 'station_add', station: { kind: 'jump_pit', x: 8, z: 0 } }, agent) as { id: string };
    expect(pit.id).toBe('jump-pit-1');
    const run = await runMotionLab(lab, { kind: 'run', station: pit.id, settings: { motion: 'Run', speed: 8, stride: 1.6 } }, agent) as { station: string; station_score: { values: Record<string, unknown> } };
    expect(run.station).toBe(pit.id);
    expect(run.station_score.values.distance_m as number).toBeGreaterThan(4);
    const scores = await runMotionLab(lab, { kind: 'scores' }, agent) as { station_score: unknown };
    expect(scores.station_score).toEqual(run.station_score);
    // The run is kept with its course and replays the same.
    expect(LabProjectData.parse(saved.at(-1)).runs.at(-1)!.station).toBe(pit.id);
    const replayed = new LabController(saved.at(-1)!);
    expect(replayed.frameAt(0.5)).toEqual(lab.frameAt(0.5));
    // The person's Run button goes where the Lab is set to run.
    lab.runOn(pit.id);
    expect(lab.run({}, PERSON).station).toBe(pit.id);
    lab.runOn(null);
    expect(lab.run({}, PERSON).station).toBeUndefined();
  });
  it('the grasp table brings its 12 objects; objects and the belt change through the same tool', async () => {
    const lab = new LabController(newLabData());
    await runMotionLab(lab, { kind: 'station_add', station: { kind: 'grasp_table', id: 'table', z: 4 } }, agent);
    expect(lab.data.course.props).toHaveLength(12);
    const run = await runMotionLab(lab, { kind: 'run', station: 'table' }, agent) as { station_score: { values: Record<string, number> } };
    expect(run.station_score.values).toMatchObject({ objects: 12, drops: 0 });
    await runMotionLab(lab, { kind: 'prop_set', id: 'table-bottle-1', set: { mass_kg: 2 } }, agent);
    expect(lab.data.course.props.find((p) => p.id === 'table-bottle-1')!.mass_kg).toBe(2);
    await runMotionLab(lab, { kind: 'station_add', station: { kind: 'conveyor', id: 'belt', x: 6, z: 4 } }, agent);
    expect(await runMotionLab(lab, { kind: 'conveyor_set', id: 'belt', speed_mps: 0.8 }, agent)).toMatchObject({ speed_mps: 0.8 });
    await expect(runMotionLab(lab, { kind: 'conveyor_set', id: 'belt', speed_mps: 2 }, agent)).rejects.toThrow();
    // Phase 2: the belt and the tool bench run too; stations without an engine yet are refused with a reason.
    const belt = await runMotionLab(lab, { kind: 'run', station: 'belt' }, agent) as { station_score: { kind: string; values: Record<string, number> } };
    expect(belt.station_score.kind).toBe('conveyor');
    expect(belt.station_score.values.objects).toBe(8);
    await runMotionLab(lab, { kind: 'station_add', station: { kind: 'tool_bench', id: 'bench', x: 10, z: 4 } }, agent);
    expect(lab.data.course.props.filter((p) => p.on === 'bench').map((p) => p.name)).toEqual(['Hammer', 'Nail board', 'Screwdriver', 'Screw plate', 'Hand saw', 'Plank in clamp', 'Wrench', 'Bolt']);
    const bench = await runMotionLab(lab, { kind: 'run', station: 'bench' }, agent) as { station_score: { values: Record<string, unknown> } };
    expect(bench.station_score.values).toMatchObject({ wrench_pulls: 8, other_hand_holds: 'yes' });
    await runMotionLab(lab, { kind: 'station_add', station: { kind: 'pool', id: 'pool', x: 20, z: 4 } }, agent);
    await expect(runMotionLab(lab, { kind: 'run', station: 'pool' }, agent)).rejects.toThrow('later phase');
  });
  it('removing needs confirm, like version_delete; the base lab puts all 11 stations in the yard', async () => {
    const lab = new LabController(newLabData());
    await runMotionLab(lab, { kind: 'station_add', station: { kind: 'grasp_table', id: 'table', z: 4 } }, agent);
    await expect(runMotionLab(lab, { kind: 'station_remove', id: 'table' }, agent)).rejects.toThrow();
    await expect(runMotionLab(lab, { kind: 'prop_remove', id: 'table-cup-1' }, agent)).rejects.toThrow();
    await runMotionLab(lab, { kind: 'station_remove', id: 'table', confirm: true }, agent);
    expect(lab.data.course.stations).toEqual([]);
    expect(lab.data.course.props).toEqual([]);
    const base = await runMotionLab(lab, { kind: 'stations_base', confirm: true }, agent) as { stations: string[] };
    expect(base.stations).toHaveLength(11);
    const inspect = await runMotionLab(lab, { kind: 'inspect' }, agent) as { course: { stations: string[]; objects: number } };
    expect(inspect.course.stations.find((s) => s.startsWith('pool'))).toContain('runs later');
    // 12 grasp objects + the tool bench's 4 tools and 4 pieces.
    expect(inspect.course.objects).toBe(20);
    // Ids stay unique across obstacles, stations and objects.
    await expect(runMotionLab(lab, { kind: 'station_add', station: { kind: 'ladder', id: 'pool', z: 1 } }, agent)).rejects.toThrow('share the id');
  });
});
