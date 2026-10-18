import { readFile, stat } from 'node:fs/promises';
import { z } from 'zod';
const Connection = z.object({ version: z.literal(1), url: z.string().url(), token: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
/** The user explicitly selects a locally generated connection file for this MCP process. */
export async function callLiveStudio(path, route, body = {}) {
    if ((await stat(path)).size > 4096)
        throw new Error('Invalid Studio connection file.');
    const connection = Connection.parse(JSON.parse(await readFile(path, 'utf8'))), url = new URL(connection.url);
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== '/')
        throw new Error('Live Studio connection must use a loopback HTTP origin.');
    const response = await fetch(new URL(`/studio-bridge/${route}`, url), { method: 'POST', headers: { Authorization: `Bearer ${connection.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(65000) });
    const result = await response.json();
    if (!response.ok || result.error)
        throw new Error(result.error ?? 'Live Studio request failed.');
    return route === 'sessions' ? result.sessions ?? [] : result.result;
}
//# sourceMappingURL=live-studio.js.map