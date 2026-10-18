import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import process from 'node:process';
import { expect, it } from 'vitest';
it('an independent agent creates, edits, saves and reopens a world through MCP stdio', async () => {
  const folder = await mkdtemp(resolve(tmpdir(), 'genvr-mcp-test-'));
  const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('../dist/mcp.js', import.meta.url))], env: { GENVR_WORLD_DIR: folder } });
  const client = new Client({ name: 'sdk-test-agent', version: '1' });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    expect(listed.tools.some(tool => tool.name === 'place_item')).toBe(true);
    expect(listed.tools.some(tool => tool.name.includes('publish'))).toBe(false);
    const capabilities = await client.callTool({ name: 'get_studio_capabilities', arguments: {} });
    expect(JSON.parse((capabilities.content as Array<{ text: string }>)[0]!.text)).toMatchObject({ liveViewport: false, accountUploads: false });
    const motions = await client.callTool({ name: 'list_avatar_motions', arguments: { category: 'Running', limit: 5 } });
    expect(JSON.parse((motions.content as Array<{ text: string }>)[0]!.text)).toMatchObject({ total: 38, viewportConnected: false });
    const guide = await client.callTool({ name: 'get_avatar_guide', arguments: {} });
    expect(guide.isError).toBeUndefined();
    expect((guide.content as Array<{ text: string }>)[0]!.text).toContain('present_avatar');
    const worldGuide = await client.callTool({ name: 'get_design_guide', arguments: { part: 'workflow' } });
    expect(worldGuide.isError).toBeUndefined();
    expect((worldGuide.content as Array<{ text: string }>)[0]!.text).toContain('Plan the layout');
    expect((await client.callTool({ name: 'get_design_guide', arguments: { part: '../outside' } })).isError).toBe(true);
    expect((await client.callTool({ name: 'create_world', arguments: { style: 'anime' } })).isError).toBe(true);
    const created = await client.callTool({ name: 'create_world', arguments: { title: 'MCP garden' } });
    const id = JSON.parse((created.content as Array<{ text: string }>)[0]!.text).id as string;
    expect((await client.callTool({ name: 'place_item', arguments: { itemId: 'genvr.core.bench', x: 3, z: 4 } })).isError).toBe(false);
    expect((await client.callTool({ name: 'save_world_local', arguments: {} })).isError).toBeUndefined();
    const saved = JSON.parse(await readFile(resolve(folder, id + '.genvr-world'), 'utf8'));
    expect(saved.commands).toHaveLength(1);
    expect((await client.callTool({ name: 'open_world_local', arguments: { id } })).isError).toBeUndefined();
    expect((await client.callTool({ name: 'open_world_local', arguments: { id: '../outside' } })).isError).toBe(true);
  } finally { await client.close(); }
});
