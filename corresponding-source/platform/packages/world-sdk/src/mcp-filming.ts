import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { FilmCamera, FilmPhoto, FilmVideo, FilmStudioOperation, PlaceId } from '@genvr/contracts';
import { z } from 'zod';

// Keep the established platform filming tool names and shared argument contracts.
const target = { place_id: PlaceId, session_id: z.string().uuid() };
export const FILMING_ARGS = {
  list_capture_sessions: z.object({ place_id: PlaceId }).strict(),
  set_camera: z.object({ ...target, camera: FilmCamera }).strict(),
  reset_camera: z.object(target).strict(),
  get_camera: z.object(target).strict(),
  capture_photo: z.object({ ...target, settings: FilmPhoto.default(() => FilmPhoto.parse({})) }).strict(),
  record_video: z.object({ ...target, settings: FilmVideo.default(() => FilmVideo.parse({})) }).strict(),
  get_capture: z.object({ place_id: PlaceId, job_id: z.string().uuid() }).strict(),
  studio_action: z.object({ ...target, operation: FilmStudioOperation }).strict(),
};
export type FilmingTool = keyof typeof FILMING_ARGS;
const descriptions: Record<FilmingTool, string> = {
  list_capture_sessions: 'List your connected filming sessions on the configured Genvr host. Uses the existing Studio MCP connection.',
  set_camera: 'Set a connected filming camera using the existing camera presets or path. Returns job_id; poll get_capture.',
  reset_camera: 'Restore the connected session gameplay camera. Returns job_id; poll get_capture.',
  get_camera: 'Inspect the connected filming camera. Returns job_id; poll get_capture.',
  capture_photo: 'Capture a PNG through the existing connected Studio renderer. Returns job_id; poll get_capture.',
  record_video: 'Record silent WebM through the existing connected Studio renderer. Returns job_id; poll get_capture.',
  get_capture: 'Read a filming job status and its authenticated result on the configured host.',
  studio_action: 'Control the existing film editor: inspect, discover commands, change its workspace, execute commands or batches, record shots, render frames, and edit captions or sound. Use dialogue_voice to synthesize a cue with a saved voice_id and language; dialogue_preview auditions it. Requires an authorized connected Studio session; use operation kind commands to discover current command schemas.',
};
export const FILMING_TOOLS = (Object.keys(FILMING_ARGS) as FilmingTool[]).map(name => {
  const inputSchema = z.toJSONSchema(FILMING_ARGS[name], { io: 'input' }); delete inputSchema.$schema;
  return { name, description: descriptions[name], inputSchema: inputSchema as { type: 'object' } };
});
export const isFilmingTool = (name: string): name is FilmingTool => Object.hasOwn(FILMING_ARGS, name);
export function filmingHostUrl(endpoint: string): URL {
  const url = new URL(endpoint);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))) throw new Error('Use an HTTPS MCP endpoint or a loopback HTTP endpoint, without embedded credentials.');
  return url;
}
/** Forward to the established service; no second recorder, editor or authentication flow. */
export async function callFilmingTool(name: FilmingTool, args: unknown, endpoint?: string, token?: string) {
  const parsed = FILMING_ARGS[name].parse(args);
  if (!endpoint || !token) throw new Error('Filming tools require GENVR_HOST_MCP_URL and GENVR_HOST_MCP_TOKEN, plus your connected Studio filming session.');
  const client = new Client({ name: 'genvr-world-sdk', version: '1' });
  const transport = new StreamableHTTPClientTransport(filmingHostUrl(endpoint), { requestInit: { headers: { Authorization: `Bearer ${token}` }, redirect: 'error' } });
  try {
    // The upstream transport declares sessionId as string | undefined rather than an exact optional property.
    await client.connect(transport as unknown as Transport);
    return await client.callTool({ name, arguments: parsed });
  } finally { await client.close(); }
}
