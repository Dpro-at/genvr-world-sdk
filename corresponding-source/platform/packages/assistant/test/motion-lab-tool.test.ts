import { expect, it, vi } from 'vitest';
import { runTool, TOOL_DEFINITIONS, type AssistantHost } from '../src/index.js';

it('routes motion_lab to the open lab without editing the world', async () => {
  const motionLab = vi.fn(async (input: unknown) => ({ ran: input })), apply = vi.fn();
  const host = { motionLab, apply } as unknown as AssistantHost;
  const outcome = await runTool('motion_lab', { operation: { kind: 'run', settings: { speed: 1.4 } } }, host);
  expect(outcome.ok).toBe(true);
  expect(motionLab).toHaveBeenCalledWith({ operation: { kind: 'run', settings: { speed: 1.4 } } });
  expect(apply).not.toHaveBeenCalled();
});

it('refuses unknown kinds, a delete without confirm and hosts without a lab', async () => {
  const motionLab = vi.fn(), host = { motionLab } as unknown as AssistantHost;
  expect((await runTool('motion_lab', { operation: { kind: 'evaluate' } }, host)).ok).toBe(false);
  expect((await runTool('motion_lab', { operation: { kind: 'version_delete', version: 'walk-v1' } }, host)).ok).toBe(false);
  expect((await runTool('motion_lab', { operation: { kind: 'run' }, extra: 1 }, host)).ok).toBe(false);
  expect(motionLab).not.toHaveBeenCalled();
  const absent = await runTool('motion_lab', { operation: { kind: 'inspect' } }, {} as AssistantHost);
  expect(absent).toMatchObject({ ok: false });
  expect(absent.result).toMatch(/motion lab project/);
});

it('passes lab errors back to the model', async () => {
  const host = { motionLab: async () => { throw new Error('Only the owner can delete the best version.'); } } as unknown as AssistantHost;
  expect(await runTool('motion_lab', { operation: { kind: 'version_delete', version: 'walk-v1', confirm: true } }, host))
    .toMatchObject({ ok: false, result: 'Only the owner can delete the best version.' });
});

it('lists motion_lab once with every operation kind', () => {
  const defs = TOOL_DEFINITIONS.filter((tool) => tool.function.name === 'motion_lab');
  expect(defs).toHaveLength(1);
  expect(JSON.stringify(defs[0]!.function.parameters)).toContain('save_best');
});

it('routes the pose and key frame kinds (board M11) and checks them first', async () => {
  const motionLab = vi.fn(async (input: unknown) => input), host = { motionLab } as unknown as AssistantHost;
  expect((await runTool('motion_lab', { operation: { kind: 'pose_set', frame: 412, joint: 'elbow.bend', side: 'right', value: 38 } }, host)).ok).toBe(true);
  expect((await runTool('motion_lab', { operation: { kind: 'key_add', frame: 412, rows: ['right_arm'], ease: 'smooth' } }, host)).ok).toBe(true);
  expect((await runTool('motion_lab', { operation: { kind: 'limb_move', frame: 1, limb: 'tail', target: [0, 1, 0] } }, host)).ok).toBe(false);
  expect(motionLab).toHaveBeenCalledTimes(2);
});
