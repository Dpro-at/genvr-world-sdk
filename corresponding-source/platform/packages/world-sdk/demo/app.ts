import { WorldSession, browserStorage, saveWorld, openWorld, GenvrClient, TOOL_DEFINITIONS, type ChatModel } from '../src/index.js';
import { previewWorld, type GenvrRuntime } from '../src/runtime.js';
import { readChatStream } from '@genvr/assistant';
const byId = (id: string) => document.getElementById(id)!;
const value = (id: string) => (byId(id) as HTMLInputElement).value;
const storage = browserStorage(localStorage);
let session = WorldSession.create({ id: 'local.demo', title: 'My garden' });
let runtime: GenvrRuntime | undefined;
let busy = false;
function status(text: string) { byId('status').textContent = text; }
async function render() {
  runtime?.dispose(); runtime = undefined;
  runtime = await previewWorld(session, byId('view'), { forceWebGL: true });
}
function action(id: string, run: () => Promise<void> | void, redraw = false) {
  byId(id).addEventListener('click', async () => {
    if (busy) return;
    busy = true; document.querySelectorAll('button').forEach(b => b.disabled = true);
    try { await run(); if (redraw) await render(); }
    catch(e) { status(e instanceof Error ? e.message : String(e)); }
    finally { busy = false; document.querySelectorAll('button').forEach(b => b.disabled = false); }
  });
}
action('new', () => { session = WorldSession.create({ id: 'local.demo', title: 'My garden' }); status('New local world.'); }, true);
action('garden', async () => {
  for (const [x,z] of [[-8,-8],[8,-8],[-8,8],[8,8]]) {
    const result = await session.tool('place_item', { itemId: 'genvr.core.tree.round', x, z });
    if (!result.ok) throw new Error(result.result);
  }
  await session.tool('place_item', { itemId: 'genvr.core.bench', x: 4, z: 0 });
  await session.tool('place_item', { itemId: 'genvr.core.house.small', x: -4, z: 0 });
  await session.tool('set_sky', { preset: 'sunset' }); status('Generated a garden with shared SDK tools.');
}, true);
action('bench', async () => { const n = session.world.instances.length; const result = await session.tool('place_item', { itemId: 'genvr.core.bench', x: n * 4, z: 0 }); status(result.result); }, true);
action('sky', async () => { status((await session.tool('set_sky', { preset: 'sunset' })).result); }, true);
action('undo', () => { session.undo(); status('Undo.'); }, true);
action('redo', () => { session.redo(); status('Redo.'); }, true);
action('save', async () => { await saveWorld(session, storage); status('Saved on this device.'); });
action('open', async () => { session = await openWorld('local.demo', storage); status('Reopened local world.'); }, true);
action('download', () => {
  const url = URL.createObjectURL(new Blob([session.serialize()], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'my-world.genvr-world'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
byId('file').addEventListener('change', async event => {
  const file = (event.target as HTMLInputElement).files?.[0]; if (!file || busy) return;
  try { if (file.size > 8 * 1024 * 1024) throw new Error('File exceeds 8 MB.'); session = new WorldSession(await file.text()); await render(); status('Imported local world file.'); }
  catch(e) { status(String(e)); }
});
const client = () => new GenvrClient(value('api'));
action('draft', async () => { const draft = await client().createDraft(session); (byId('target') as HTMLInputElement).value = draft.id; (byId('version') as HTMLInputElement).value = '0'; status(`Created private draft ${draft.id}. Keep its ID for retries.`); });
action('upload', async () => {
  if (!value('target')) throw new Error('Select or create your private draft first.');
  const result = await client().uploadWorld(session, { id: value('target'), baseVersion: Number(value('version')) });
  (byId('version') as HTMLInputElement).value = String(result.version); status(`Uploaded to private draft ${result.id}, version ${result.version}.`);
});
action('item-submit', async () => {
  const file = (byId('item-file') as HTMLInputElement).files?.[0]; if (!file) throw new Error('Choose your GLB.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Demo GLB limit is 5 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer()); let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
  const item = await client().submitItem({ name: value('item-name'), kind: 'props-and-decor', styles: ['blocky'], model: btoa(binary) });
  status(`Item ${item.id} submitted for review.`);
});
action('generate', async () => {
  const url = new URL(value('model'));
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Choose an HTTP model endpoint.');
  const model: ChatModel = async (messages, onText, signal, onQueue) => {
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: value('model-name'), messages, tools: TOOL_DEFINITIONS, stream: true }), ...(signal ? { signal } : {}) });
    if (!response.ok || !response.body) throw new Error(`Model returned ${response.status}.`);
    return readChatStream(response.body, onText, onQueue);
  };
  await session.generate(value('prompt'), model, { onEvent: e => { if (e.type === 'done') status(e.text); else if (e.type === 'tool') status(e.result); } });
}, true);
window.addEventListener('beforeunload', () => runtime?.dispose());
void render().catch(e => status(`Preview unavailable: ${String(e)}. Local authoring is still available.`));
