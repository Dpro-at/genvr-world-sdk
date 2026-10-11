import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { mkdir, readFile, realpath, rename, writeFile, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import process from 'node:process';
import { Id } from '@genvr/contracts';
import { TOOL_DEFINITIONS } from '@genvr/assistant';
import { WorldSession } from './session.js';

const root = resolve(process.env.GENVR_WORLD_DIR ?? '.genvr-worlds');
await mkdir(root, { recursive: true });
const realRoot = await realpath(root);
let session: WorldSession | undefined;
const server = new Server({ name: 'genvr-world-sdk', version: '0.1.0' }, { capabilities: { tools: {} } });
const localTools = [
  { name: 'create_world', description: 'Create a new local private world. No Genvr account required.', inputSchema: { type: 'object' as const, properties: { title: { type: 'string', maxLength: 60 }, style: { type: 'string', enum: ['blocky', 'realistic', 'anime', 'voxel'] } }, additionalProperties: false } },
  { name: 'save_world_local', description: 'Save the current world in the configured local folder.', inputSchema: { type: 'object' as const, properties: {}, additionalProperties: false } },
  { name: 'open_world_local', description: 'Open a saved world by ID in the configured local folder.', inputSchema: { type: 'object' as const, properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false } },
];
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [ ...localTools,
  ...TOOL_DEFINITIONS.map(tool => ({ name: tool.function.name, description: tool.function.description,
    inputSchema: tool.function.parameters as { type: 'object' } })),
] }));
server.setRequestHandler(CallToolRequestSchema, async request => {
  try {
    const args = request.params.arguments ?? {};
    let text: string;
    if (request.params.name === 'create_world') {
      session = WorldSession.create({ title: typeof args.title === 'string' ? args.title : 'My world',
        base: { style: { base: (['blocky','realistic','anime','voxel'].includes(String(args.style)) ? args.style : 'blocky') as 'blocky' }, sizeTier: 'small' } });
      text = JSON.stringify({ id: session.export().id });
    } else if (request.params.name === 'open_world_local') {
      const id = Id.parse(args.id); const file = await realpath(resolve(realRoot, id + '.genvr-world'));
      if (dirname(file) !== realRoot) throw new Error('Saved file is outside the world folder.');
      if ((await stat(file)).size > 8 * 1024 * 1024) throw new Error('Saved world exceeds 8 MB.');
      session = new WorldSession(await readFile(file, 'utf8')); text = `Opened ${id}.`;
    } else {
      if (!session) throw new Error('Create or open a local world first.');
      if (request.params.name === 'save_world_local') {
        const id = Id.parse(session.export().id), file = resolve(realRoot, id + '.genvr-world');
        const temporary = resolve(realRoot, `${id}.${crypto.randomUUID()}.tmp`);
        await writeFile(temporary, session.serialize(), { flag: 'wx', mode: 0o600 }); await rename(temporary, file);
        text = `Saved ${id}.`;
      } else {
        const result = await session.tool(request.params.name, args);
        return { content: [{ type: 'text', text: result.result }], isError: !result.ok };
      }
    }
    return { content: [{ type: 'text', text }] };
  } catch (e) { return { content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }], isError: true }; }
});
await server.connect(new StdioServerTransport());
