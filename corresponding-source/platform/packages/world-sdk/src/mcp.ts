import { GenvrPublicationTools } from './publication-tools.js';
import { callLiveStudio } from './live-studio.js';
import { LiveStudioClient, LIVE_TOOLS } from './mcp-live.js';
import { FILMING_TOOLS, isFilmingTool, callFilmingTool } from './mcp-filming.js';
import { listAvatarMotions } from './mcp-avatar-catalog.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { mkdir, readFile, realpath, rename, writeFile, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import process from 'node:process';
import { Id, AVAILABLE_WORLD_STYLES, MOTION_LAB_KINDS, MotionLabOperation } from '@genvr/contracts';
import { TOOL_DEFINITIONS, TOOL_ARGS } from '@genvr/assistant';
import { WorldSession, SDK_VERSION } from './session.js';

const root = resolve(process.env.GENVR_WORLD_DIR ?? '.genvr-worlds');
await mkdir(root, { recursive: true });
const realRoot = await realpath(root);
const live = process.env.GENVR_STUDIO_CONNECTION ? new LiveStudioClient(process.env.GENVR_STUDIO_CONNECTION, realRoot) : undefined;
let session: WorldSession | undefined;
const publication = new GenvrPublicationTools({ ...(process.env.GENVR_API_URL ? { apiUrl: process.env.GENVR_API_URL } : {}), ...(process.env.GENVR_WEB_URL ? { webUrl: process.env.GENVR_WEB_URL } : {}), ...(process.env.GENVR_ACCOUNT_TOKEN ? { accessToken: process.env.GENVR_ACCOUNT_TOKEN } : {}), allowMutations: process.env.GENVR_MCP_PUBLICATION === '1' });
const server = new Server({ name: '3d-world-sdk', version: SDK_VERSION }, { capabilities: { tools: {} } });
const GUIDE_PARTS = ['workflow', 'tools', 'sizes', 'games', 'scripts', 'mistakes'] as const;
const localTools = [
  { name: 'get_design_guide', description: 'Read the bundled world-building skill: planning, available tools, distances, game rules, scripts and checks. Call capabilities first to distinguish local SDK features from platform-only tools.', inputSchema: { type: 'object' as const, properties: { part: { type: 'string', enum: [...GUIDE_PARTS], default: 'workflow' } }, additionalProperties: false } },
  { name: 'get_studio_capabilities', description: 'Read actual standalone MCP capabilities and missing live Studio or account connections before attempting editor, filming or upload actions.', inputSchema: { type: 'object' as const, properties: {}, additionalProperties: false } },
  { name: 'list_avatar_motions', description: 'Find named native or operator-supplied motion IDs and facial expressions. Metadata only; catalog availability does not imply a connected viewport.', inputSchema: { type: 'object' as const, properties: { query: { type: 'string', maxLength: 200 }, category: { type: 'string', maxLength: 80 }, offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 100 } }, additionalProperties: false } },
  { name: 'get_avatar_guide', description: 'Read the SDK avatar presentation skill, capabilities, tool locations and live-host requirements.', inputSchema: { type: 'object' as const, properties: {}, additionalProperties: false } },
  { name: 'create_world', description: 'Create a new local private world. No Genvr account required.', inputSchema: { type: 'object' as const, properties: { title: { type: 'string', maxLength: 60 }, style: { type: 'string', enum: [...AVAILABLE_WORLD_STYLES] } }, additionalProperties: false } },
  { name: 'save_world_local', description: 'Save the current world in the configured local folder.', inputSchema: { type: 'object' as const, properties: {}, additionalProperties: false } },
  { name: 'open_world_local', description: 'Open a saved world by ID in the configured local folder.', inputSchema: { type: 'object' as const, properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false } },
  // MOTION-LAB: the Lab area of a motion lab project in the live Studio (same owner gates as the page).
  { name: 'motion_lab', description: 'Motion lab in the live Studio (open a motion lab project first): build a measured course (step, ramp, gap, low wall, window, street with box cars), run the lab robot through it (fixed step + seed), read scores, keep motion versions. One operation per call; `{ operation: { kind: "commands" } }` lists them. Making a version the best waits for the owner. Read get_motion_lab_guide first.', inputSchema: { type: 'object' as const, properties: { operation: { type: 'object', properties: { kind: { type: 'string', enum: [...MOTION_LAB_KINDS] } }, required: ['kind'] } }, required: ['operation'], additionalProperties: false } },
  { name: 'get_motion_lab_guide', description: 'Read the motion lab skill: course sizes, runs, scores and how they are measured, versions and owner gates.', inputSchema: { type: 'object' as const, properties: {}, additionalProperties: false } },
];
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [ ...publication.tools(), ...localTools, ...LIVE_TOOLS, ...FILMING_TOOLS,
  // motion_lab is defined above with the live-Studio wording; skip the assistant copy so it is listed once.
  ...TOOL_DEFINITIONS.filter(tool => tool.function.name !== 'motion_lab').map(tool => ({ name: tool.function.name, description: tool.function.description,
    inputSchema: tool.function.parameters as { type: 'object' } })),
] }));
server.setRequestHandler(CallToolRequestSchema, async request => {
  try {
    const args = request.params.arguments ?? {};
    if (publication.handles(request.params.name)) return { content: [{ type: 'text', text: JSON.stringify(await publication.call(request.params.name, args, session)) }] };
    if (request.params.name === 'get_design_guide') {
      const part = args.part ?? 'workflow';
      if (!GUIDE_PARTS.includes(part as typeof GUIDE_PARTS[number]) || Object.keys(args).some(key => key !== 'part')) throw new Error('Choose a supported design guide part.');
      const path = part === 'workflow' ? 'SKILL.md' : `references/${part}.md`;
      return { content: [{ type: 'text', text: await readFile(new URL(`../skills/genvr-world-builder/${path}`, import.meta.url), 'utf8') }] };
    }
    if (request.params.name === 'avatar_voice') { if (!live) throw new Error('Connect a local Studio with GENVR_STUDIO_CONNECTION first.'); return { content: [{type:'text', text:JSON.stringify(await callLiveStudio(live.connection, 'voice', {...TOOL_ARGS.avatar_voice.parse(args), sessionId:live.selected}))}] }; }
    if (isFilmingTool(request.params.name) && live) return { content: [{ type: 'text', text: JSON.stringify(await live.filming(request.params.name, args)) }] };
    if (isFilmingTool(request.params.name)) return await callFilmingTool(request.params.name, args, process.env.GENVR_HOST_MCP_URL, process.env.GENVR_HOST_MCP_TOKEN);
    if (request.params.name === 'get_motion_lab_guide') return { content: [{ type: 'text', text: await readFile(new URL('../skills/genvr-motion-lab/SKILL.md', import.meta.url), 'utf8') }] };
    if (request.params.name === 'motion_lab') {
      if (!live) throw new Error('The motion lab runs in the live Studio: set GENVR_STUDIO_CONNECTION and open a motion lab project.');
      MotionLabOperation.parse((args as { operation?: unknown }).operation);
      return { content: [{ type: 'text', text: JSON.stringify(await live.call('motion_lab', args)) }] };
    }
    let text: string;
    if (LIVE_TOOLS.some(tool => tool.name === request.params.name) || (live && ['user_avatar_library', 'present_avatar', 'share_studio', 'avatar_studio'].includes(request.params.name))) {
      if (!live) throw new Error('Set GENVR_STUDIO_CONNECTION to the connection file printed by genvr-studio.');
      const result = request.params.name === 'list_studio_sessions' ? { sessions: await live.sessions() } : request.params.name === 'select_studio_session' ? await live.select(args) : await live.call(request.params.name, args);
      text = typeof result === 'string' ? result : JSON.stringify(result);
    } else if (request.params.name === 'get_studio_capabilities' && live) {
      const sessions = await live.sessions();
      text = JSON.stringify({ mode: 'live-studio', liveViewport: sessions.length > 0, sessions, avatarPresentation: { executable: sessions.length > 0 }, characterRecipeEditing: { tool: 'avatar_studio', executable: sessions.length > 0, does: 'body, shape, muscle, fat, face, colours, hair, view mode (skeleton, muscles, fat…), expression, play, save, export' }, motionLab: { tool: 'motion_lab', executable: sessions.some(row => row.capabilities.motionLab), reason: sessions.some(row => row.capabilities.motionLab) ? undefined : 'Open a motion lab project in the Studio (My projects › New motion lab).' }, privateLibrary: sessions.some(row => row.capabilities.privateLibrary), filmingAndVideoEditing: { tools: FILMING_TOOLS.map(tool => tool.name), hostConfigured: true, connectionVerified: sessions.length > 0 }, localFileWorldEditing: true, accountUploads: publication.capabilities().linked, worldPublishing: publication.capabilities().linked, publication: publication.capabilities() });
    } else if (request.params.name === 'get_studio_capabilities') {
      text = JSON.stringify({ mode: 'local-file-session', worldEditing: true, localSave: true, liveViewport: false, avatarPresentation: { schemaAvailable: true, executable: false, reason: 'No live viewport is attached to this standalone process.' }, characterRecipeEditing: { tool: 'avatar_studio', executable: false, reason: 'Needs a live Studio with the Avatar tab (GENVR_STUDIO_CONNECTION).' }, motionLab: { tool: 'motion_lab', executable: false, reason: 'Needs a live Studio with a motion lab project open (GENVR_STUDIO_CONNECTION).' }, filmingAndVideoEditing: { availableInStudioUI: true, tools: FILMING_TOOLS.map(tool => tool.name), hostConfigured: Boolean(process.env.GENVR_HOST_MCP_URL && process.env.GENVR_HOST_MCP_TOKEN), connectionVerified: false, reason: 'Uses the established platform filming connection. Configure the host and connect an authorized Studio session.' }, accountUploads: publication.capabilities().linked, worldPublishing: publication.capabilities().linked, publication: publication.capabilities(), motionCatalogConfigured: Boolean(process.env.GENVR_MOTION_CATALOG) });
    } else if (request.params.name === 'list_avatar_motions') {
      text = JSON.stringify(live ? await live.call('list_avatar_motions', args) : await listAvatarMotions(args, process.env.GENVR_MOTION_CATALOG));
    } else if (request.params.name === 'get_avatar_guide') {
      text = await readFile(new URL('../skills/genvr-avatar-presentation/SKILL.md', import.meta.url), 'utf8');
    } else if (request.params.name === 'create_world') {
      if (args.style !== undefined && !AVAILABLE_WORLD_STYLES.includes(args.style as 'blocky')) throw new Error('Choose an available world style: Simple, Realistic or Voxel.');
      session = WorldSession.create({ title: typeof args.title === 'string' ? args.title : 'My world',
        base: { style: { base: (args.style ?? 'blocky') as 'blocky' }, sizeTier: 'small' } });
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
