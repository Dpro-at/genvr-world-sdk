import { createServer } from 'node:http';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createLiveStudioBridge } from '../live-studio-bridge.mjs';
import { LiveStudioClient } from '../src/mcp-live.ts';
import { callLiveStudio } from '../src/live-studio.ts';
it('discovers a real mailbox, completes a film job, saves only bounded rendered artifacts and rejects mismatched sessions', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'studio-live-test-')), bridge = createLiveStudioBridge({ timeout: 1000 });
  const server = createServer(async (req, res) => { if (!await bridge.handle(req, res)) res.writeHead(404).end(); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`, path = join(folder, 'connection.json');
  await writeFile(path, JSON.stringify({ version: 1, url: base, token: bridge.token }), { mode: 0o600 });
  const post = async (route, body) => (await fetch(base + '/studio-bridge/' + route, { method: 'POST', headers: { Authorization: `Bearer ${bridge.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
  try {
    const { sessionId } = await post('connect', { projectId: '01234567-abcd', title: 'Studio', capabilities: { filming: true }, clientId: 'stable-tab' });
    const client = new LiveStudioClient(path, folder), sessions = await client.sessions();
    await client.select({ session_id: sessionId });
    expect(sessions[0].title).toBe('Studio');
    const target = { place_id: sessions[0].placeId, session_id: sessionId };
    const created = await client.filming('studio_action', { ...target, operation: { kind: 'frame', at: 0 } });
    const { commands } = await post('poll', { sessionId }); expect(commands[0].tool).toBe('studio_action');
    await post('result', { sessionId, id: commands[0].id, result: { mime: 'image/png', data: Buffer.from('rendered-fixture').toString('base64') } });
    let job;
    for (let i = 0; i < 50; i++) { job = await client.filming('get_capture', { place_id: target.place_id, job_id: created.job_id }); if (job.status !== 'running') break; await new Promise(resolve => setTimeout(resolve, 5)); }
    expect(job.status).toBe('done'); expect(job.result.path.startsWith(join(folder, 'live-captures'))).toBe(true);
    expect(await readFile(job.result.path, 'utf8')).toBe('rendered-fixture');
    await expect(client.filming('get_camera', { ...target, place_id: 'exp-0000000000000000' })).rejects.toThrow(/does not match/);
    const replacement = await post('connect', { projectId: '01234567-abcd', title: 'Reloaded', capabilities: {}, clientId: 'stable-tab' });
    expect(bridge.list()).toHaveLength(1); expect(bridge.list()[0].id).toBe(replacement.sessionId);
    await writeFile(path, JSON.stringify({ version: 1, url: 'http://external.example', token: bridge.token }));
    await expect(callLiveStudio(path, 'sessions')).rejects.toThrow(/loopback/);
  } finally { bridge.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(folder, { recursive: true, force: true }); }
});
