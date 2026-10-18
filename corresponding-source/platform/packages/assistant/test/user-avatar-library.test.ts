import { expect, it, vi } from 'vitest';
import { runTool, type AssistantHost } from '../src/index.js';
it('routes private library operations through the attached host without world edits', async () => {
  const library = vi.fn(async (input: { action: string }) => ({ private: true, action: input.action }));
  const apply = vi.fn(), host = { userAvatarLibrary: library, apply } as unknown as AssistantHost;
  expect((await runTool('user_avatar_library', { action: 'list' }, host)).ok).toBe(true);
  expect(library).toHaveBeenCalledWith({ action: 'list', target: 'self', query: '', offset: 0, limit: 30 });
  await runTool('user_avatar_library', { action: 'assign', target: 'agent-one', id: 'user.asset' }, host);
  expect(library).toHaveBeenLastCalledWith(expect.objectContaining({ target: 'agent-one', id: 'user.asset' }));
  expect(apply).not.toHaveBeenCalled();
});
it('reports absent hosts, failed assignments and invalid pagination', async () => {
  expect((await runTool('user_avatar_library', { action: 'list' }, {} as AssistantHost)).ok).toBe(false);
  const library = vi.fn(async () => { throw new Error('Character is missing.'); });
  const host = { userAvatarLibrary: library } as unknown as AssistantHost;
  expect(await runTool('user_avatar_library', { action: 'assign', id: 'missing' }, host)).toEqual({ ok: false, result: 'Character is missing.' });
  expect((await runTool('user_avatar_library', { action: 'list', limit: 101 }, host)).ok).toBe(false);
  expect(library).toHaveBeenCalledTimes(1);
});
