import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
const allowed = new Set(['share_studio', 'present_avatar', 'user_avatar_library', 'list_avatar_motions', 'inspect_studio', 'studio_action', 'set_camera', 'get_camera', 'reset_camera', 'capture_photo', 'avatar_speech', 'avatar_speech_control', 'avatar_studio', 'motion_lab']);
/** Authenticated loopback mailbox. Only named Studio operations cross the boundary. */
export function createLiveStudioBridge({ token = randomBytes(32).toString('hex'), timeout = 60000, voice } = {}) {
  const sessions = new Map(), pending = new Map();
  const list = () => [...sessions.values()].filter(row => Date.now() - row.seen < 45000).map(({ id, projectId, title, placeId, capabilities }) => ({ id, projectId, title, placeId, capabilities, local: true }));
  const json = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(value)); };
  const deliver = session => { if (session.poll && session.queue.length) { const res = session.poll; session.poll = null; clearTimeout(session.timer); json(res, 200, { commands: [session.queue.shift()] }); } };
  const call = (tool, args, sessionId) => new Promise((resolve, reject) => {
    if (!allowed.has(tool)) { reject(new Error('Live Studio tool is not allowed.')); return; }
    const available = list();
    const session = sessions.get(sessionId ?? (available.length === 1 ? available[0].id : ''));
    if (!session || !available.some(row => row.id === session.id)) { reject(new Error(available.length > 1 ? 'Select a Studio session first.' : 'No live Studio session is connected.')); return; }
    if (pending.size >= 32 || session.queue.length >= 16) { reject(new Error('Live Studio queue is full.')); return; }
    const id = randomUUID(), timer = setTimeout(() => { pending.delete(id); session.queue = session.queue.filter(row => row.id !== id); reject(new Error('Live Studio operation timed out.')); }, timeout);
    pending.set(id, { sessionId: session.id, resolve, reject, timer });
    session.queue.push({ id, tool, arguments: args }); deliver(session);
  });
  async function handle(req, res) {
    if (!req.url?.startsWith('/studio-bridge/')) return false;
    try {
      const host = new URL('http://' + req.headers.host);
      if (!['127.0.0.1', 'localhost', '[::1]'].includes(host.hostname) || (req.headers.origin && req.headers.origin !== host.origin)) { json(res, 403, { error: 'Origin refused.' }); return true; }
      const actual = Buffer.from(req.headers.authorization ?? ''), expected = Buffer.from('Bearer ' + token);
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) { json(res, 401, { error: 'Studio authentication required.' }); return true; }
      let bytes = 0, chunks = [];
      for await (const chunk of req) { bytes += chunk.length; if (bytes > 16 * 1024 * 1024) throw new Error('Studio message exceeds 16 MB.'); chunks.push(chunk); }
      const body = bytes ? JSON.parse(Buffer.concat(chunks).toString()) : {}, path = new URL(req.url, host).pathname;
      if (req.method !== 'POST') { json(res, 405, { error: 'POST required.' }); return true; }
      if (path === '/studio-bridge/voice') {
        if (!voice) throw new Error('Local voice service is not configured.');
        const active = list();
        const selected = body.sessionId ? active.find(row => row.id === body.sessionId) : active.length === 1 ? active[0] : undefined;
        if (body.sessionId && !selected) throw new Error('Studio session expired.');
        if (selected && body.projectId && selected.projectId !== body.projectId) throw new Error('Voice project does not match the selected Studio session.');
        json(res, 200, { result: await voice.call({ ...body, ...(selected ? { projectId: selected.projectId, sessionId: selected.id } : {}) }) });
      }
      else if (path === '/studio-bridge/sessions') json(res, 200, { sessions: list() });
      else if (path === '/studio-bridge/connect') {
        if (typeof body.projectId !== 'string' || !/^[A-Za-z0-9._-]{1,120}$/.test(body.projectId) || typeof body.title !== 'string' || body.title.length > 200) throw new Error('Invalid Studio registration.');
        for (const [key, previous] of sessions) if (Date.now() - previous.seen >= 45000 || (body.clientId && previous.clientId === body.clientId)) {
          clearTimeout(previous.timer); if (previous.poll) json(previous.poll, 200, { commands: [] }); sessions.delete(key);
          for (const [commandId, command] of pending) if (command.sessionId === key) { clearTimeout(command.timer); pending.delete(commandId); command.reject(new Error('Studio session reloaded.')); }
        }
        if (sessions.size >= 16) throw new Error('Too many Studio sessions.');
        const id = randomUUID(), placeId = 'exp-' + body.projectId.replace(/[^a-f0-9]/gi, '').slice(0, 16).padEnd(16, '0').toLowerCase();
        sessions.set(id, { id, clientId: body.clientId, projectId: body.projectId, title: body.title, placeId, capabilities: body.capabilities, seen: Date.now(), queue: [], poll: null }); json(res, 200, { sessionId: id });
      } else if (path === '/studio-bridge/poll') {
        const session = sessions.get(body.sessionId); if (!session) throw new Error('Studio session expired.');
        session.seen = Date.now(); if (session.poll) json(session.poll, 200, { commands: [] }); clearTimeout(session.timer); session.poll = res;
        session.timer = setTimeout(() => { if (session.poll === res) { session.poll = null; json(res, 200, { commands: [] }); } }, 15000);
        res.on('close', () => { if (session.poll === res) session.poll = null; }); deliver(session);
      } else if (path === '/studio-bridge/result') {
        const command = pending.get(body.id); if (!command || command.sessionId !== body.sessionId) throw new Error('Unknown Studio operation.');
        const session = sessions.get(body.sessionId); if (session) session.seen = Date.now();
        clearTimeout(command.timer); pending.delete(body.id); body.error ? command.reject(new Error(String(body.error).slice(0, 2000))) : command.resolve(body.result); json(res, 200, { ok: true });
      } else if (path === '/studio-bridge/call') json(res, 200, { result: await call(body.tool, body.arguments ?? {}, body.sessionId) });
      else if (path === '/studio-bridge/disconnect') {
        const session = sessions.get(body.sessionId); if (session?.poll) json(session.poll, 200, { commands: [] }); clearTimeout(session?.timer); sessions.delete(body.sessionId);
        for (const [id, command] of pending) if (command.sessionId === body.sessionId) { clearTimeout(command.timer); pending.delete(id); command.reject(new Error('Studio session disconnected.')); }
        json(res, 200, { ok: true });
      } else json(res, 404, { error: 'Unknown Studio endpoint.' });
    } catch (error) { if (!res.headersSent) json(res, 400, { error: error instanceof Error ? error.message : 'Studio operation failed.' }); }
    return true;
  }
  return { token, handle, list, call, close() { for (const session of sessions.values()) { clearTimeout(session.timer); if (session.poll) json(session.poll, 200, { commands: [] }); } sessions.clear(); for (const command of pending.values()) { clearTimeout(command.timer); command.reject(new Error('Studio server closed.')); } pending.clear(); } };
}
