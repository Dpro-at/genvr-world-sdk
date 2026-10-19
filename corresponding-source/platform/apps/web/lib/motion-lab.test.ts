import { describe, expect, it } from 'vitest';
import { simulateLabRun } from '@genvr/runtime';
import { runTool, type AssistantHost } from '@genvr/assistant';
import { LabController, motionLabBridge, newLabData, runMotionLab, PERSON } from './motion-lab';

const simulateOn = (lab: LabController) => simulateLabRun(lab.data.course, lab.best()!.settings, lab.data.course.seed).frames.at(-1);

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
    lab.fromSeed(77);
    // On a new course the ghost is the best version's settings run on that course.
    expect(lab.view.ghost?.frames.at(-1)).toEqual(simulateOn(lab));
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
    lab.run();
    const mine = lab.saveVersion(undefined, 'by a person');
    await expect(runMotionLab(lab, { kind: 'version_delete', version: mine.id, confirm: true }, agent)).rejects.toThrow(/owner/);
    const theirs = (await runMotionLab(lab, { kind: 'save_version' }, agent)) as { id: string };
    lab.saveBest(theirs.id);
    await expect(runMotionLab(lab, { kind: 'version_delete', version: theirs.id, confirm: true }, agent)).rejects.toThrow(/best/);
    lab.saveBest(mine.id);
    expect(await runMotionLab(lab, { kind: 'version_delete', version: theirs.id, confirm: true }, agent)).toEqual({ deleted: theirs.id });
  });
  it('gives the same scores to a person and an agent for the same run', async () => {
    const a = new LabController(newLabData()), b = new LabController(newLabData());
    const personRun = a.run({ stride: 0.7 }, PERSON);
    const agentRun = (await runMotionLab(b, { kind: 'run', settings: { stride: 0.7 } }, agent)) as { score: unknown };
    expect(agentRun.score).toEqual(personRun.score);
    expect(await runMotionLab(null, { kind: 'inspect' }, agent).catch((e: Error) => e.message)).toMatch(/motion lab project/);
  });
});

describe('run settings changes', () => {
  it('keeps the settings an agent does not name', async () => {
    const lab = new LabController(newLabData());
    lab.setSettings({ stride: 0.6, lean_deg: 8 });
    await runMotionLab(lab, { kind: 'settings_set', settings: { speed: 2 } }, agent);
    expect(lab.data.settings).toMatchObject({ speed: 2, stride: 0.6, lean_deg: 8 });
    await runMotionLab(lab, { kind: 'run', settings: { speed: 1.8 } }, agent);
    expect(lab.data.runs.at(-1)!.settings).toMatchObject({ speed: 1.8, stride: 0.6, lean_deg: 8 });
  });
});

describe('motion lab in the in-app Assistant', () => {
  // The same host wiring as assistant-panel.tsx.
  const host = { motionLab: async (input: { operation: unknown }) => runMotionLab(motionLabBridge.get(), input.operation, { kind: 'agent', name: 'Assistant' }) } as unknown as AssistantHost;
  it('builds, runs and asks for the best version, and the owner confirms it', async () => {
    const lab = new LabController(newLabData());
    const unregister = motionLabBridge.register(lab);
    try {
      expect((await runTool('motion_lab', { operation: { kind: 'obstacle_set', id: 'gap-1', set: { width: 1.2 } } }, host)).ok).toBe(true);
      const run = await runTool('motion_lab', { operation: { kind: 'run' } }, host);
      expect(run.ok).toBe(true);
      expect(lab.data.runs.at(-1)?.by).toBe('agent');
      const saved = JSON.parse((await runTool('motion_lab', { operation: { kind: 'save_version' } }, host)).result) as { id: string; by: string };
      expect(saved.by).toBe('agent');
      expect(JSON.parse((await runTool('motion_lab', { operation: { kind: 'save_best', version: saved.id } }, host)).result)).toMatchObject({ best: null, pending: saved.id });
      expect(lab.best()).toBeUndefined();
      expect(lab.data.best_pending).toMatchObject({ version: saved.id, by: 'Assistant' });
      lab.confirmPendingBest();
      expect(lab.best()?.id).toBe(saved.id);
      expect(await runTool('motion_lab', { operation: { kind: 'version_delete', version: saved.id, confirm: true } }, host))
        .toMatchObject({ ok: false, result: 'Only the owner can delete the best version.' });
      const personVersion = lab.saveVersion(undefined, '', PERSON);
      expect((await runTool('motion_lab', { operation: { kind: 'version_delete', version: personVersion.id, confirm: true } }, host)).ok).toBe(false);
      expect(lab.data.versions.map((v) => v.id)).toContain(personVersion.id);
    } finally { unregister(); }
    expect((await runTool('motion_lab', { operation: { kind: 'inspect' } }, host)).result).toMatch(/motion lab project/);
  });
});
