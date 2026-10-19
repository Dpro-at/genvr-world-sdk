import { describe, expect, it } from 'vitest';
import { LabController, newLabData, runMotionLab, PERSON } from './motion-lab';

const agent = { kind: 'agent' as const, name: 'Luna' };

describe('motion lab controller (MOTION-LAB L1 + L2)', () => {
  it('starts with the M1 course and saves every change', () => {
    const saved: unknown[] = [];
    const lab = new LabController(newLabData(), (data) => saved.push(data));
    expect(lab.data.course.obstacles).toHaveLength(5);
    lab.setObstacle('gap-1', { width: 1.4 });
    expect(lab.data.course.obstacles.find((o) => o.id === 'gap-1')).toMatchObject({ width: 1.4 });
    expect(saved).toHaveLength(1);
  });
  it('runs, keeps the last 20 runs, saves versions and shows the best as the ghost', () => {
    const lab = new LabController(newLabData());
    for (let i = 0; i < 22; i++) lab.run({ speed: 1.5 + i * 0.01 });
    expect(lab.data.runs).toHaveLength(20);
    expect(lab.data.runs[0]!.id).toBe('run-3');
    const v = lab.saveVersion();
    expect(v).toMatchObject({ id: 'walk-v1', motion: 'Walk', n: 1 });
    lab.saveBest(v.id, PERSON);
    expect(lab.best()?.id).toBe('walk-v1');
    expect(lab.view.ghost?.frames.length).toBeGreaterThan(100);
  });
  it('lets an agent ask for the best version, and only the owner confirms it', async () => {
    const lab = new LabController(newLabData());
    await runMotionLab(lab, { kind: 'run' }, agent);
    const v = (await runMotionLab(lab, { kind: 'save_version', note: 'first' }, agent)) as { id: string };
    expect(await runMotionLab(lab, { kind: 'save_best', version: v.id }, agent)).toMatchObject({ best: null, pending: v.id });
    expect(lab.best()).toBeUndefined();
    lab.confirmPendingBest();
    expect(lab.best()?.id).toBe(v.id);
    expect(lab.data.best_pending).toBeNull();
  });
  it('does the course through the agent tool: add, change, remove, seed, traffic', async () => {
    const lab = new LabController(newLabData());
    const added = (await runMotionLab(lab, { kind: 'obstacle_add', obstacle: { kind: 'step', z: 26, height: 0.2 } }, agent)) as { id: string };
    expect(added.id).toBe('step-2');
    await runMotionLab(lab, { kind: 'obstacle_set', id: 'step-2', set: { height: 0.25 } }, agent);
    await runMotionLab(lab, { kind: 'obstacle_remove', id: 'step-2' }, agent);
    await expect(runMotionLab(lab, { kind: 'obstacle_add', obstacle: { kind: 'beam', z: 2 } }, agent)).rejects.toThrow(/not built yet/);
    const a = await runMotionLab(lab, { kind: 'course_from_seed', seed: 12 }, agent);
    expect(a).toEqual(await runMotionLab(new LabController(newLabData()), { kind: 'course_from_seed', seed: 12 }, agent));
    await runMotionLab(lab, { kind: 'traffic_set', cars: [{ id: 'car-1', lane: 0, speed: 12, runs_red: true }] }, agent);
    expect(lab.data.course.cars[0]).toMatchObject({ speed: 12, runs_red: true });
    await expect(runMotionLab(lab, { kind: 'version_delete', version: 'x' }, agent)).rejects.toThrow();
  });
  it('gives the same scores to a person and an agent for the same run', async () => {
    const a = new LabController(newLabData()), b = new LabController(newLabData());
    const personRun = a.run({ stride: 0.7 }, PERSON);
    const agentRun = (await runMotionLab(b, { kind: 'run', settings: { stride: 0.7 } }, agent)) as { score: unknown };
    expect(agentRun.score).toEqual(personRun.score);
    expect(await runMotionLab(null, { kind: 'inspect' }, agent).catch((e: Error) => e.message)).toMatch(/motion lab project/);
  });
});
