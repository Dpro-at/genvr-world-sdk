export interface LiveStudioOptions { url: string; token: string }
export function liveStudioOptions(): LiveStudioOptions | undefined {
  const token = document.querySelector<HTMLMetaElement>('meta[name="genvr-studio-token"]')?.content;
  return token ? { url: location.origin, token } : undefined;
}
/** Long-polls the local authenticated mailbox; commands always use existing Studio executors. */
export function connectLiveStudio(options: LiveStudioOptions, project: { id: string; title: string }, capabilities: Record<string, unknown>, execute: (tool: string, args: unknown, signal: AbortSignal) => Promise<unknown>, status: (connected: boolean) => void) {
  const origin = new URL(options.url);
  if (origin.origin !== location.origin || !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)) throw new Error('Live Studio requires its own loopback origin.');
  const key = 'genvr-live-studio-tab', clientId = sessionStorage.getItem(key) ?? crypto.randomUUID(); sessionStorage.setItem(key, clientId);
  const abort = new AbortController(); let sessionId: string | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  const send = async (route: string, body: unknown, signal: AbortSignal | null = abort.signal) => {
    const response = await fetch(new URL(`/studio-bridge/${route}`, origin), { method: 'POST', headers: { Authorization: `Bearer ${options.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), ...(signal ? { signal } : {}) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error ?? 'Live Studio disconnected.'); return result;
  };
  const run = async () => {
    try {
      ({ sessionId } = await send('connect', { projectId: project.id, title: project.title, capabilities, clientId })); status(true);
      while (!abort.signal.aborted) {
        const { commands } = await send('poll', { sessionId });
        for (const command of commands) {
          let result: unknown, error: string | undefined;
          try { result = await execute(command.tool, command.arguments, abort.signal); } catch (reason) { error = reason instanceof Error ? reason.message : 'Studio operation failed.'; }
          if (!abort.signal.aborted) await send('result', { sessionId, id: command.id, result, error });
        }
      }
    } catch { status(false); if (!abort.signal.aborted) timer = setTimeout(() => void run(), 2000); }
  };
  void run();
  return () => { clearTimeout(timer); abort.abort(); status(false); if (sessionId) void send('disconnect', { sessionId }, null).catch(() => {}); };
}
