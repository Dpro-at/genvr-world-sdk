import { createServer } from 'node:http';
import { expect, it } from 'vitest';
import { createLiveStudioBridge } from '../live-studio-bridge.mjs';
it('authenticates actual mailbox delivery and refuses origins, unknown tools and wrong result sessions', async () => {
  const bridge = createLiveStudioBridge({ timeout: 1000 });
  const server = createServer(async (req, res) => { if (!await bridge.handle(req, res)) res.writeHead(404).end(); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const send = (route, data, headers = {}) => fetch(base + '/studio-bridge/' + route, { method: 'POST', headers: { Authorization: `Bearer ${bridge.token}`, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(data) });
  try {
    expect((await send('sessions', {}, { Authorization: 'Bearer wrong' })).status).toBe(401);
    expect((await send('sessions', {}, { Origin: 'https://untrusted.example' })).status).toBe(403);
    const { sessionId } = await (await send('connect', { projectId: 'test-project', title: 'My project', capabilities: { avatar: true } })).json();
    const waiting = bridge.call('present_avatar', { event: { kind: 'expression', expression: 'smile' } }, sessionId);
    const { commands } = await (await send('poll', { sessionId })).json();
    expect(commands[0].tool).toBe('present_avatar');
    expect((await send('result', { sessionId: crypto.randomUUID(), id: commands[0].id, result: 'wrong' })).status).toBe(400);
    await send('result', { sessionId, id: commands[0].id, result: { executed: true } });
    expect(await waiting).toEqual({ executed: true });
    await send('connect', { projectId: 'second-project', title: 'Second', capabilities: {} });
    await expect(bridge.call('inspect_studio', {})).rejects.toThrow(/Select/);
    await expect(bridge.call('evaluate_javascript', {}, sessionId)).rejects.toThrow(/not allowed/);
    const disconnected = bridge.call('inspect_studio', {}, sessionId); const assertion = expect(disconnected).rejects.toThrow(/disconnected/);
    await send('disconnect', { sessionId }); await assertion;
    expect(bridge.list()).toHaveLength(1);
  } finally { bridge.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
it('refuses commands without a connected viewport', async () => {
  const bridge = createLiveStudioBridge({ timeout: 20 });
  await expect(bridge.call('inspect_studio', {})).rejects.toThrow(/No live/);
  bridge.close();
});
it('scopes voice assignment to the selected project and refuses conflicting project ids', async () => {
  const calls = [];
  const bridge = createLiveStudioBridge({ voice: { call: async args => { calls.push(args); return { saved: true }; } } });
  const server = createServer(async (req, res) => { if (!await bridge.handle(req, res)) res.writeHead(404).end(); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const send = async (route, args) => { const response = await fetch(`http://127.0.0.1:${server.address().port}/studio-bridge/${route}`, { method: 'POST', headers: { Authorization: `Bearer ${bridge.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) }); return { status: response.status, body: await response.json() }; };
  try {
    const { body: first } = await send('connect', { projectId: 'project-a', title: 'A', capabilities: {} });
    await send('connect', { projectId: 'project-b', title: 'B', capabilities: {} });
    expect((await send('voice', { action: 'assign', sessionId: first.sessionId })).status).toBe(200);
    expect(calls[0].projectId).toBe('project-a');
    expect((await send('voice', { action: 'assign', sessionId: first.sessionId, projectId: 'project-b' })).status).toBe(400);
    expect(calls).toHaveLength(1);
  } finally { bridge.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
it('delivers the Avatar tab and motion lab tools to the Studio', async () => {
  const bridge = createLiveStudioBridge({ timeout: 1000 });
  const server = createServer(async (req, res) => { if (!await bridge.handle(req, res)) res.writeHead(404).end(); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const send = (route, data) => fetch(`http://127.0.0.1:${server.address().port}/studio-bridge/${route}`, { method: 'POST', headers: { Authorization: `Bearer ${bridge.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(response => response.json());
  try {
    const { sessionId } = await send('connect', { projectId: 'lab-project', title: 'Motion lab', capabilities: { motionLab: true } });
    for (const tool of ['avatar_studio', 'motion_lab']) {
      const waiting = bridge.call(tool, { operation: { kind: 'commands' } }, sessionId);
      const { commands } = await send('poll', { sessionId });
      expect(commands[0].tool).toBe(tool);
      await send('result', { sessionId, id: commands[0].id, result: { ok: tool } });
      expect(await waiting).toEqual({ ok: tool });
    }
  } finally { bridge.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
