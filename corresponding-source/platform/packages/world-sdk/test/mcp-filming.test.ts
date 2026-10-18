import { createServer } from 'node:http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { expect, it } from 'vitest';
import { callFilmingTool, filmingHostUrl, FILMING_TOOLS } from '../src/mcp-filming.js';
it('retains existing film tool names and refuses an unconfigured host', async () => {
  expect(FILMING_TOOLS.map(tool => tool.name)).toContain('studio_action');
  await expect(callFilmingTool('list_capture_sessions', { place_id: 'exp-0123456789abcdef' })).rejects.toThrow(/require/);
  expect(() => filmingHostUrl('http://external.example/mcp')).toThrow();
  expect(() => filmingHostUrl('https://user:secret@example.com/mcp')).toThrow();
});
it('forwards the shared film operation to an authenticated existing MCP host', async () => {
  let command: unknown, auth: string | undefined;
  const sessions: Server[] = [];
  const http = createServer(async (req, res) => {
    auth = req.headers.authorization;
    const mcp = new Server({ name: 'filming-test-host', version: '1' }, { capabilities: { tools: {} } });
    sessions.push(mcp);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    mcp.setRequestHandler(CallToolRequestSchema, async request => { command = request.params; return { content: [{ type: 'text', text: 'film inspected' }] }; });
    await mcp.connect(transport);
    let body = ''; for await (const chunk of req) body += chunk;
    await transport.handleRequest(req, res, body ? JSON.parse(body) : undefined);
  });
  await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve));
  const port = (http.address() as { port: number }).port;
  try {
    const result = await callFilmingTool('studio_action', { place_id: 'exp-0123456789abcdef', session_id: '22222222-2222-4222-8222-222222222222', operation: { kind: 'inspect' } }, `http://127.0.0.1:${port}/mcp`, 'test-token');
    expect(result.content).toEqual([{ type: 'text', text: 'film inspected' }]);
    expect(auth).toBe('Bearer test-token'); expect(command).toMatchObject({ name: 'studio_action', arguments: { operation: { kind: 'inspect' } } });
  } finally { await Promise.all(sessions.map(session => session.close())); await new Promise<void>(resolve => http.close(() => resolve())); }
});
