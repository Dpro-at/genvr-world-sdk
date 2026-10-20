import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createStudioServer } from '../serve-studio.mjs';
import { privateMotionLibrary } from '../studio/private-motions';

const motion = { format: 'genvr.motion', version: 1, slug: 'idle', name: 'Idle', category: 'Idle', source: 'Test Pack', kind: 'loop', duration: 1, keys: [[0, { Hips: [0, 0, 0] }], [1, { Hips: [0, 0, 0] }]] };
const index = { motions: [
  { id: 'motion:idle', slug: 'idle', name: 'Idle', category: 'Idle', source: 'Basic Pack', kind: 'loop', duration: 1, file: 'Idle/idle.json' },
  { id: 'motion:idle-2', slug: 'idle-2', name: 'Idle', category: 'Idle', source: 'Sword Pack', kind: 'loop', duration: 1, file: 'Idle/idle-2.json' },
  { id: 'motion:bad', slug: 'bad', name: 'Bad', category: 'Idle', source: 'x', kind: 'once', duration: 1, file: '../../etc/passwd' },
] };

describe('the owner\'s private motion library in the local Studio', () => {
  let folder: string, base: string;
  const server = createStudioServer({ privateMotions: undefined as unknown as string });
  let privateServer: ReturnType<typeof createStudioServer>;
  beforeAll(async () => {
    folder = await mkdtemp(join(tmpdir(), 'motions-'));
    await mkdir(join(folder, 'Idle')); await writeFile(join(folder, 'index.json'), JSON.stringify(index));
    await writeFile(join(folder, 'Idle', 'idle.json'), JSON.stringify(motion)); await writeFile(join(folder, 'Idle', 'idle-2.json'), JSON.stringify({ ...motion, slug: 'idle-2' }));
    privateServer = createStudioServer({ privateMotions: folder });
    await new Promise<void>(resolve => privateServer.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(privateServer.address() as { port: number }).port}`;
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  });
  afterAll(async () => {
    for (const one of [privateServer, server]) { one.closeAllConnections(); await new Promise(resolve => one.close(resolve)); }
    await rm(folder, { recursive: true, force: true });
  });
  it('serves the private folder only under /private-motions/, never above it, and not at all without one', async () => {
    expect((await fetch(`${base}/private-motions/index.json`)).status).toBe(200);
    expect((await fetch(`${base}/private-motions/Idle/idle.json`)).status).toBe(200);
    for (const path of ['/private-motions/..%2f..%2fetc%2fpasswd', '/private-motions/../package.json']) expect((await fetch(base + path)).status).not.toBe(200);
    // A page on another name that resolves here (DNS rebinding) is refused.
    const { request } = await import('node:http');
    const status = await new Promise<number>((resolve, reject) => { const req = request(`${base}/private-motions/index.json`, { headers: { Host: 'evil.example:80' } }, res => { res.resume(); resolve(res.statusCode ?? 0); }); req.on('error', reject); req.end(); });
    expect(status).toBe(403);
    const plain = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    expect((await fetch(`${plain}/private-motions/index.json`)).status).not.toBe(200);
  });
  it('loads the index as a motion library: safe rows only, packs on repeated names, motions on demand', async () => {
    const library = await privateMotionLibrary((input, init) => fetch(`${base}${String(input)}`, init));
    expect(library!.entries.map(entry => [entry.id, entry.name, entry.loop])).toEqual([['motion:idle', 'Idle · Basic', true], ['motion:idle-2', 'Idle · Sword', true]]);
    expect(await library!.entries[0]!.motion!()).toMatchObject({ format: 'genvr.motion', slug: 'idle' });
    expect(await privateMotionLibrary(async () => new Response('', { status: 404 }))).toBeNull();
  });
});
