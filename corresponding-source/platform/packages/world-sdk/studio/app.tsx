import { connectLiveStudio, liveStudioOptions, type LiveStudioOptions } from './live-studio';
import { AvatarSpeechPlayer, type AvatarSpeechPlayback } from './avatar-speech-player';
import { VoicePanel } from './voice-panel';
import { AvatarCatalogQuery } from '../src/avatar-catalog-query';
import { CORE_ANIMATIONS } from '@genvr/core-library';
import { registerAvatarMotionLibrary, avatarMotionEntries, motionCategories, type AvatarMotionLibrary } from '@genvr/runtime';
import { browserUserAvatarStorage, type UserAvatarStorage } from '../src/user-avatar-library';
import { UserAvatarSession } from './user-avatar-session';
import { UserAvatarPanel } from './user-avatar-panel';
import { DEFAULT_AVATAR_LOOK, FilmCamera, FilmStudioOperation, type AvatarLook, type BodyId } from '@genvr/contracts';
import type { CharacterStage } from '@genvr/runtime/character';
import { PresentationControls } from './presentation/controls';
import { AvatarPresentation, type AvatarPresentationOptions } from '../src/avatar-presentation';
import { PresentationViewport } from './presentation/viewport';
import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Clapperboard, Download, FolderOpen, House, Save, Settings2, Mic, X } from 'lucide-react';
import { createRuntime, DEFAULT_BRUSH, DEFAULT_RIVER, type GenvrRuntime, type ToolStatus } from '@genvr/runtime';
import { runTool, TOOL_ARGS, EXPRESSIONS, type AssistantHost, type ChatModel } from '@genvr/assistant';
import { CreateFlow, type CreationOptions } from '../../../apps/web/components/create-flow';
import { PlaySettingsPicker } from '../../../apps/web/components/play-settings';
import { BuildPanel } from '../../../apps/web/components/build-panel';
import { PlayControls } from '../../../apps/web/components/play-controls';
import { StudioChrome, type StudioTab } from '../../../apps/web/components/studio/studio-chrome';
import { PhoneFilming } from '../../../apps/web/components/studio/film/phone-filming';
import { studioGrid, useIsDesktop, useStudioLayout } from '../../../apps/web/components/studio/layout';
import { DEFAULT_PREVIEW } from '../../../apps/web/components/studio/device-bar';
import { DeviceEmulator } from '../../../apps/web/components/studio/device-emulator';
import type { LogEntry } from '../../../apps/web/components/studio/console-panel';
import { StudioHostProvider } from '../../../apps/web/lib/studio-host';
import { setPlatformEnabled } from '../../../apps/web/lib/api';
import { useStudioFilming } from '../../../apps/web/lib/use-studio-filming';
import { browserStudioStorage, createStudioProject, importStudioProject, readStudioProject, STUDIO_PROJECT_BYTES, type StudioProject, type StudioStorage } from '../src/studio-project';
import { syncStudioAgents, type StudioAgent } from '../src/studio-agents';
import type { StoreEntry } from '../../../apps/web/lib/store-items';
import { StudioSaveQueue, flushStudioClose } from '../src/studio-save';

export interface StudioOptions { filmExample?: string | false; liveBridge?: LiveStudioOptions; motionLibrary?: AvatarMotionLibrary; userLibrary?: false | { scope: string; storage?: UserAvatarStorage }; presentation?: AvatarPresentationOptions; storage?: StudioStorage; model?: ChatModel; forceWebGL?: boolean; initialProjectId?: string; agents?: (projectId: string) => Promise<StudioAgent[]>; catalog?: { list(): Promise<StoreEntry[]>; asset(id: string): Promise<StudioProject['assets'][number]> }; }
const message = (error: unknown) => error instanceof Error ? error.message : 'Operation failed.';
const button = 'inline-flex size-10 shrink-0 items-center justify-center rounded-lg hover:bg-ink/10 disabled:opacity-40';
function IconButton({ label, children, ...props }: { label: string; children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} className={button} aria-label={label} title={label}>{children}</button>;
}
const download = (project: StudioProject) => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(project)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = project.title.replace(/[^a-z0-9_-]/gi, '_') + '.genvr-studio'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
};

type BeforeClose = { current: () => Promise<boolean> };
function Editor({ initial, storage, options, leave, beforeClose }: { initial: StudioProject; storage: StudioStorage; options: StudioOptions; leave: () => void; beforeClose: BeforeClose }) {
  const container = useRef<HTMLDivElement>(null), runtime = useRef<GenvrRuntime | null>(null);
  const characterFingerprint = useRef('');
  const speechPlayback = useRef<AvatarSpeechPlayback|null>(null);
  const registerSpeech = useRef((value:AvatarSpeechPlayback|null)=>{speechPlayback.current=value;}).current;
  const presentationStage = useRef<CharacterStage | null>(null);
  const [presentation] = useState(() => new AvatarPresentation(() => {
    const world = runtime.current; if (!world) return null;
    return {
      presentAnimation: (target, id) => target === 'self' && presentationStage.current ? presentationStage.current.presentAnimation(id) : world.presentAnimation(target, id),
      presentExpression: (target, expression) => target === 'self' && presentationStage.current ? presentationStage.current.presentExpression(expression) : world.presentExpression(target, expression),
      importAvatarMotion: (target, id, data) => target === 'self' && presentationStage.current ? presentationStage.current.importAvatarMotion(id, data) : world.importAvatarMotion(target, id, data),
    };
  }, options.presentation));
  const [presentationAgents, setPresentationAgents] = useState<StudioAgent[]>([]);
  const [library] = useState(() => !options.userLibrary ? null : options.userLibrary.storage ?? browserUserAvatarStorage(options.userLibrary.scope));
  const [userAvatars] = useState(() => library ? new UserAvatarSession(library) : null);
  const selfLibraryBody = useRef<((id: BodyId) => void) | undefined>(undefined);
  const localLooks = useRef(new Map<string, AvatarLook>()), agentRows = useRef<StudioAgent[]>([]);
  const restoreLibrary = async (target: string) => {
    const body = project.current.avatarBodies?.[target];
    if (body) { localLooks.current.set(target, { ...DEFAULT_AVATAR_LOOK, body }); return; }
    const id = await library?.assignment(initial.id, target);
    if (id && userAvatars) localLooks.current.set(target, await userAvatars.look(id));
  };
  const assignUserAvatar = async (target: string, id: string | null) => {
    if (!runtime.current) throw new Error('Avatar is not ready.');
    const builtin = id?.startsWith('builtin:') ? id.slice(8) : null;
    if (builtin && !['robot', 'human', 'classic', 'simple', 'starter'].includes(builtin)) throw new Error('Unknown built-in character.');
    const look = builtin ? { ...DEFAULT_AVATAR_LOOK, body: builtin as BodyId } : id && userAvatars ? await userAvatars.look(id) : null;
    if (id && !look) throw new Error('Private library is not connected.');
    if (target !== 'self' && !agentRows.current.some(row => row.id === target)) throw new Error('Agent is no longer available.');
    await library?.assign(initial.id, target, builtin ? null : id);
    const avatarBodies = { ...project.current.avatarBodies };
    if (builtin) avatarBodies[target] = builtin as NonNullable<StudioProject['avatarBodies']>[string]; else delete avatarBodies[target];
    project.current = { ...project.current, avatarBodies }; changed();
    if (look) localLooks.current.set(target, look); else localLooks.current.delete(target);
    if (target === 'self') { runtime.current.setAvatarLook(look ?? DEFAULT_AVATAR_LOOK); selfLibraryBody.current?.(look?.body ?? 'classic'); }
    else syncStudioAgents(runtime.current, agentRows.current, localLooks.current);
  };
  const playUserMotion = async (target: string, id: string) => {
    const asset = await library?.get(id);
    if (!asset || asset.metadata.kind !== 'motion') throw new Error('Motion is missing from your local library.');
    await presentation.importMotion(target, asset.metadata.name, asset.data, 'user-library');
    const error = presentation.execute({ kind: 'animation', target, animation: 'motion:user-library', duration: Math.min(60000, Math.max(1000, (asset.metadata.duration ?? 10) * 1000)) });
    if (error) throw new Error(error);
  };
  useEffect(() => {
    const unsubscribe = options.presentation?.subscribe?.(initial.id, presentation.execute);
    return () => { unsubscribe?.(); presentation.dispose(); };
  }, [presentation]);
  const project = useRef(initial), queue = useRef(new StudioSaveQueue()), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false), mounted = useRef(true);
  const [agentCount, setAgentCount] = useState<number | null>(null);
  const [ready, setReady] = useState(false), [error, setError] = useState<string | null>(null), [saved, setSaved] = useState('Loading');
  const [metadata, setMetadata] = useState(initial), [settings, setSettings] = useState(false), [testing, setTesting] = useState(false);
  const [tab, setTab] = useState<StudioTab>('build'), [preview, setPreview] = useState(DEFAULT_PREVIEW);
  const [logs, setLogs] = useState<LogEntry[]>([]), desktop = useIsDesktop();
  const [layout, setLayout] = useStudioLayout(tab === 'filming' ? 'filming' : 'build');
  const [status, setStatus] = useState<ToolStatus>({ tool: null, points: 0, canFinish: false, message: null, placeItemId: null,
    selected: null, moving: false, brush: { ...DEFAULT_BRUSH }, roadType: 'genvr.core.road.street', road: { oneway: false }, river: DEFAULT_RIVER, water: null });
  const log = (text: string) => setLogs(list => [...list.slice(-99), { id: Date.now(), at: Date.now(), level: 'info', text }]);
  const avatarVoice: NonNullable<AssistantHost['avatarVoice']> = async input => {
    if (!options.liveBridge) throw new Error('Local voice service is not configured.');
    const response=await fetch(new URL('/studio-bridge/voice',options.liveBridge.url),{method:'POST',headers:{Authorization:`Bearer ${options.liveBridge.token}`,'Content-Type':'application/json'},body:JSON.stringify({...input,projectId:input.projectId??initial.id})});
    const body=await response.json(); if(!response.ok||body.error) throw new Error(body.error??'Voice operation failed.'); return body.result;
  };
  const filming = useStudioFilming(initial.id, runtime, container, log, () => !testing, `sdk-studio:${initial.id}`, false, avatarVoice, options.filmExample === false ? false : options.filmExample ?? '/film-examples/island-languages.genvrfilm');
  const latestFilm = useRef(filming); latestFilm.current = filming;
  const snapshot = () => readStudioProject({ ...project.current, ...(runtime.current?.snapshot() ?? {}) });
  const save = async (): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current); timer.current = null;
    try {
      const next = snapshot();
      project.current = next; setSaved('Saving');
      const current = await queue.current.write(() => storage.write(next));
      if (mounted.current && current) { dirty.current = false; setSaved('Saved locally'); setError(null); }
      return current;
    } catch (error) { if (mounted.current) { setSaved('Not saved'); setError(message(error)); } return false; }
  };
  const changed = () => {
    dirty.current = true; queue.current.changed(); setSaved('Unsaved changes');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void save(); }, 400);
  };
  useEffect(() => {
    mounted.current = true;
    const abort = new AbortController(); let current: GenvrRuntime | null = null;
    const asset = async (id: string) => {
      let found = project.current.assets.find(a => a.id === id);
      if (!found && options.catalog) {
        const loaded = await options.catalog.asset(id);
        if (abort.signal.aborted) throw new Error('Studio closed.');
        if (loaded.id !== id || loaded.manifest.price.type !== 'free') throw new Error('Item is not available for local use.');
        project.current = readStudioProject({ ...project.current, assets: [...project.current.assets.filter(a => a.id !== id), loaded] });
        found = loaded; changed();
      }
      if (!found) throw new Error(`Local asset unavailable: ${id}`);
      return { id, manifest: found.manifest, files: found.files.map(file => ({ path: file.path, contentType: file.contentType, size: atob(file.data).length, url: `data:${file.contentType};base64,${file.data}` })) };
    };
    void createRuntime({ container: container.current!, world: initial.world, terrainChunks: initial.terrainChunks, editable: true,
      playView: initial.play.view, sideMoves: initial.play.moves, loadSignal: abort.signal, fetchPackage: asset,
      emulateTouch: !desktop,
      forceWebGL: options.forceWebGL, onToolStatus: setStatus, onCommand: changed,
      onFilmFrame: (...args) => latestFilm.current.onFilmFrame(...args), onRendered: () => latestFilm.current.onRendered(),
    }).then(view => {
      current = view;
      if (abort.signal.aborted) { view.dispose(); return; }
      runtime.current = view; view.setSimulating(false); view.setControlsEnabled(true);
      void restoreLibrary('self').then(() => { if (!abort.signal.aborted && localLooks.current.has('self')) view.setAvatarLook(localLooks.current.get('self')!); }).catch(error => { if (!abort.signal.aborted) setError(message(error)); });
      setReady(true); setSaved('Saved locally');
    }).catch(error => { if (!abort.signal.aborted) setError(message(error)); });
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      mounted.current = false; abort.abort(); if (timer.current) clearTimeout(timer.current);
      window.removeEventListener('beforeunload', beforeUnload); latestFilm.current.releaseRuntime(); current?.dispose(); runtime.current = null; userAvatars?.dispose(); if (!options.userLibrary || !options.userLibrary.storage) library?.close();
    };
  }, []);
  useEffect(() => {
    if (!ready || !options.agents || !runtime.current) return;
    let stopped = false, running = false, previous = '';
    const refresh = async () => { if (running) return; running = true; try { const rows = await options.agents!(initial.id); if (stopped || !runtime.current) return; const fingerprint = JSON.stringify(rows); if (fingerprint !== previous) { agentRows.current = rows; for (const row of rows) await restoreLibrary(row.id); if (stopped || !runtime.current) return; setAgentCount(syncStudioAgents(runtime.current, rows, localLooks.current)); setPresentationAgents(rows); previous = fingerprint; } } catch { if (!stopped) setError('Agents could not be loaded. Your space remains saved.'); } finally { running = false; } };
    void refresh(); const timer = setInterval(() => void refresh(), 5000);
    return () => { stopped = true; clearInterval(timer); };
  }, [ready]);
  useEffect(() => { runtime.current?.setSimulating(testing); runtime.current?.setControlsEnabled(!settings); }, [testing, settings, ready]);
  useEffect(() => { runtime.current?.setAudioVolumes({ effects: layout.worldSounds ? 1 : 0, ambience: layout.worldSounds ? 1 : 0 }); }, [layout.worldSounds, ready]);
  useEffect(() => { runtime.current?.setPaused(!!preview.model); }, [preview.model, ready]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void save(); } if (event.key === 'Escape') setSettings(false); };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  });
  const flush = async () => {
    const current = await flushStudioClose({
      busy: () => latestFilm.current.isBusy() || latestFilm.current.studio.isRendering(),
      snapshot: () => latestFilm.current.studio.snapshot(),
      flush: () => latestFilm.current.studio.flush(),
    }, save);
    if (!current) setError('Project changed or is busy. Finish your work and try leaving again.');
    return current;
  };
  const userAvatarLibrary: NonNullable<AssistantHost['userAvatarLibrary']> = async input => {
      if (input.action === 'list') {
        const rows = [...(await library?.list() ?? []), ...[{ id: 'builtin:robot', name: 'Standard robot', kind: 'character' as const }, { id: 'builtin:human', name: 'Our human', kind: 'character' as const }]].filter(row => `${row.name} ${row.kind}`.toLowerCase().includes(input.query.toLowerCase()));
        return { private: true, bundled: false, total: rows.length, entries: rows.slice(input.offset, input.offset + input.limit).map(row => ({ id: row.id, kind: row.kind, name: row.name, ...('duration' in row ? { duration: row.duration } : {}), bundled: row.id.startsWith('builtin:') })) };
      }
      if (input.action === 'assign') {
        if (input.id === undefined) throw new Error('Choose a character ID, or null to reset.');
        await assignUserAvatar(input.target, input.id);
      } else {
        if (!input.id) throw new Error('Choose a motion ID.');
        await playUserMotion(input.target, input.id);
      }
      return { action: input.action, target: input.target, id: input.id, private: true };
  };

  const [voicePlayerHost,setVoicePlayerHost]=useState<HTMLDivElement|null>(null);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [liveConnected, setLiveConnected] = useState(false);
  const liveExecutor = useRef<(tool: string, args: unknown, signal: AbortSignal) => Promise<unknown>>(async () => { throw new Error('Studio is loading.'); });
  liveExecutor.current = async (tool, raw, signal) => {
    if (!runtime.current || !ready) throw new Error('Studio is loading.');
    const args = raw as Record<string, unknown>;
    if(tool==='avatar_speech_control'){if(!speechPlayback.current)throw new Error('Speech player is not ready.');return speechPlayback.current.control(String(args.command),typeof args.value==='number'?args.value:undefined);}
    if (tool === 'avatar_speech') {
      if (typeof args.data !== 'string' || args.data.length > 12 * 1024 * 1024 || typeof args.duration !== 'number' || args.duration <= 0 || args.duration > 120 || typeof args.target !== 'string') throw new Error('Invalid avatar speech.');
      if(!speechPlayback.current)throw new Error('Speech player is not ready.');
      await speechPlayback.current.load({data:args.data,target:args.target,duration:args.duration,...(typeof args.text==='string'?{text:args.text}:{})});
      return {started:true,target:args.target,mouthSync:runtime.current.supportsAvatarExpression(args.target)};
    }
    if (tool === 'inspect_studio') return { projectId: initial.id, world: { style: runtime.current.world.style.base, kind: runtime.current.world.terrain.world?.kind ?? 'empty', seed: runtime.current.world.terrain.world?.seed, spawn: runtime.current.world.spawn, itemCount: runtime.current.world.instances.length }, ...(args.include_checks === true ? { checks: runtime.current.checkWorld() } : {}), workspace: tab, lighting: runtime.current.world.environment.lighting ?? [], speech:speechPlayback.current?.snapshot(), avatar: presentationStage.current?.info ?? runtime.current.avatarState, camera: latestFilm.current.camera, spot: latestFilm.current.avatarSpot(), actorPosition: runtime.current.localPlayer, expressionSupported: runtime.current.supportsAvatarExpression('self'), plan: latestFilm.current.studio.plan, presentation: presentation.snapshot().lastAction };
    if (tool === 'present_avatar') { const { event } = TOOL_ARGS.present_avatar.parse(raw); const error = presentation.execute(event); if (error) throw new Error(error); return { executed: true, event: event.kind }; }
    if (tool === 'user_avatar_library') {
      const result = await runTool(tool, raw, { userAvatarLibrary, presentAvatar: presentation.execute } as AssistantHost);
      if (!result.ok) throw new Error(result.result); return result.result;
    }
    if (tool === 'list_avatar_motions') {
      const query = AvatarCatalogQuery.parse(raw), entries = [...CORE_ANIMATIONS.map(row => ({ id: row.manifest.id, name: row.manifest.name, categories: motionCategories(row.manifest.name), source: 'native' })), ...avatarMotionEntries().map(row => ({ id: row.id, name: row.name, categories: motionCategories(row.name, row.category), source: 'private-host-library' }))];
      const matching = entries.filter(row => `${row.id} ${row.name}`.toLowerCase().includes(query.query.toLowerCase()) && (!query.category || row.categories.some(category => category.toLowerCase() === query.category!.toLowerCase())));
      return { total: entries.length, matched: matching.length, offset: query.offset, entries: matching.slice(query.offset, query.offset + query.limit), expressions: EXPRESSIONS, expressionSupported: runtime.current.supportsAvatarExpression('self'), viewportConnected: true };
    }
    if (latestFilm.current.isBusy()) throw new Error('Wait for the current recording.');
    if (tool === 'get_camera') return { camera: latestFilm.current.camera, view: latestFilm.current.cameraView() };
    if (tool === 'set_camera') { latestFilm.current.apply(FilmCamera.parse(args.camera)); return { camera: FilmCamera.parse(args.camera) }; }
    if (tool === 'reset_camera') { latestFilm.current.reset(); return { camera: null }; }
    if (tool === 'studio_action' || tool === 'capture_photo') {
      setTab('filming');
      const blob = tool === 'capture_photo' ? await latestFilm.current.capturePhoto(args.settings ?? {}, AbortSignal.any([signal, AbortSignal.timeout(20000)])) : await latestFilm.current.handleStudio(FilmStudioOperation.parse(args.operation), AbortSignal.any([signal, AbortSignal.timeout(60000)]));
      if (blob.type === 'application/json') return JSON.parse(await blob.text());
      if (blob.size > 8 * 1024 * 1024) throw new Error('Live capture exceeds 8 MB. Export it from Studio instead.');
      return { mime: blob.type, data: await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]!); reader.onerror = () => reject(new Error('Capture could not be read.')); reader.readAsDataURL(blob); }) };
    }
    throw new Error('Unsupported live Studio tool.');
  };
  useEffect(() => {
    if (!ready || !options.liveBridge) return;
    return connectLiveStudio(options.liveBridge, initial, { avatar: true, privateLibrary: Boolean(library), filming: true, voice: true }, (tool, args, signal) => liveExecutor.current(tool, args, signal), setLiveConnected);
  }, [ready, initial.id, options.liveBridge]);
  beforeClose.current = flush;
  const goHome = async () => { if (await flush()) leave(); };
  const test = (value: boolean) => { if (value) runtime.current?.setTool(null); setTesting(value); };
  const updateMetadata = (next: StudioProject) => { project.current = next; setMetadata(next); changed(); };
  return <StudioHostProvider value={{ platform: false,
    userAvatarControls: library ? (section, search) => { return <UserAvatarPanel storage={library} section={section} search={search} agents={presentationAgents} assign={assignUserAvatar} play={playUserMotion} />; } : undefined,
    presentationControls: options.presentation?.enabled === false ? undefined : (section, search) => <PresentationControls controller={presentation} section={section} search={search} agents={presentationAgents} />,
    presentationOverlay: () => options.presentation?.enabled === false ? null : <PresentationViewport controller={presentation} />,
    characterLook: look => { const key = JSON.stringify(look); if (runtime.current && key !== characterFingerprint.current) { runtime.current.setAvatarLook(look); characterFingerprint.current = key; } },
    userAvatarLibrary, avatarVoice,
    characterBody: change => { selfLibraryBody.current = change; return () => { if (selfLibraryBody.current === change) selfLibraryBody.current = undefined; }; },
    presentationStage: stage => { presentationStage.current = stage; },
    presentAvatar: presentation.execute, presentationInfo: () => presentation.describe() + "; Available targets: self, " + presentationAgents.map(row => `${row.id} (${row.name})`).join(", "), ...(options.catalog ? { catalog: options.catalog } : {}), ...(options.model ? { model: options.model } : {}), leave: () => { void goHome(); }, settings: () => setSettings(true) }}>
    <div className="flex h-dvh flex-col overflow-hidden bg-paper text-ink">
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-ink/10 bg-surface px-2">
        <IconButton label="My projects" disabled={(!ready && !error) || filming.busy || filming.studio.rendering} onClick={() => void goHome()}><House className="size-4" /></IconButton>
        <span className="truncate text-xs font-bold">Local Studio</span>{options.liveBridge ? <span role="status" aria-label="Live MCP connection" className="rounded-full border border-ink/10 px-2 py-1 text-[10px]">{liveConnected ? 'MCP connected' : 'MCP connecting'}</span> : null}{agentCount !== null ? <span className="text-xs" role="status">{agentCount} agents</span> : null}
        <span className="min-w-0 flex-1 truncate text-xs text-ink/60" role="status">{saved}</span>
        <IconButton label="Save project" disabled={!ready} onClick={() => void save()}><Save className="size-4" /></IconButton>
        <IconButton label="Export project" disabled={!ready} onClick={() => { try { download(snapshot()); } catch (error) { setError(message(error)); } }}><Download className="size-4" /></IconButton>
        {options.liveBridge ? <IconButton label="Avatar voice" disabled={!ready} onClick={() => setVoiceOpen(value => !value)}><Mic className="size-4" /></IconButton> : null}
        <IconButton label="Place settings" disabled={!ready} onClick={() => setSettings(true)}><Settings2 className="size-4" /></IconButton>
        {!desktop ? <IconButton label="Filming" disabled={!ready} onClick={() => { runtime.current?.setTool(null); setTab('filming'); }}><Clapperboard className="size-4" /></IconButton> : null}
      </div>
      {error ? <div role="alert" className="flex items-center gap-2 bg-coral px-3 py-2 text-sm text-white"><span className="flex-1">{error}</span><button aria-label="Dismiss error" onClick={() => setError(null)}><X className="size-4" /></button></div> : null}
      {voiceOpen && options.liveBridge ? <VoicePanel connection={options.liveBridge} projectId={initial.id} agents={presentationAgents} playerHost={setVoicePlayerHost} close={()=>setVoiceOpen(false)} /> : null}
      <main className="relative min-h-0 flex-1" style={desktop ? studioGrid(layout, testing) : undefined}>
        <div className="relative min-h-0 min-w-0 overflow-hidden" style={desktop ? { gridArea: 'viewport', visibility: preview.model ? 'hidden' : undefined } : { height: '100%' }}>
          <div ref={container} className="h-full w-full" />

          {ready && (tab !== 'avatar' || testing) && options.presentation?.enabled !== false ? <PresentationViewport controller={presentation} agents={presentationAgents} /> : null}
          {!ready ? <p className="absolute inset-x-0 top-1/2 text-center text-sm">{error ? 'Could not open the world' : 'Loading world'}</p> : null}
        </div>
        <div style={desktop?{gridArea:'viewport'}:undefined} className={desktop?'pointer-events-none relative z-30 min-h-0 min-w-0':'pointer-events-none absolute inset-0 z-30'}><AvatarSpeechPlayer portal={voicePlayerHost} register={registerSpeech} mouth={(target,shape)=>{runtime.current?.setSpeechMouth(target,shape);if(target==='self')presentationStage.current?.setMouth(shape);}} recording={stream=>runtime.current?.setVoiceRecordingStream(stream)} /></div>
        {ready && desktop ? <StudioChrome runtime={runtime} filming={filming} placeId={initial.id} devices={metadata.play.devices} isOwner status={status}
          title={metadata.title} saveText={saved} style={runtime.current?.world.style.base ?? initial.world.style.base}
          layout={layout} onLayout={setLayout} tab={tab} onTab={next => { setTab(next); setPreview(DEFAULT_PREVIEW); }} preview={preview} onPreview={next => {
            if (next.model && options.storage) { setError('Device preview requires the default local project storage.'); return; }
            void save().then(ok => { if (ok) setPreview(next); });
          }}
          testing={testing} onTesting={test} logs={logs} onClearLogs={() => setLogs([])} onStyle={() => changed()} /> : null}
        {preview.model && desktop ? <DeviceEmulator placeId={initial.id} model={preview.model} orientation={preview.orientation} zoom={preview.zoom} reloadKey={preview.reloadKey}
          source={`?studioPreview=${initial.id}&touch=${preview.model.kind === 'phone' || preview.model.kind === 'tablet' ? '1' : '0'}`} /> : null}
        {ready && !testing && (desktop || tab !== 'filming') ? <BuildPanel runtime={runtime} status={status} studio={desktop} placeId={initial.id} onTest={() => test(true)} /> : null}
        {!desktop && testing ? <button className="absolute right-3 top-3 rounded-lg bg-surface px-3 py-2 font-bold" onClick={() => setTesting(false)}>Stop test</button> : null}
        {ready && !status.tool && (testing || (tab !== 'filming' && tab !== 'avatar')) && !preview.model ? <PlayControls runtime={runtime} raised={!desktop && !testing} forceTouch={!desktop} dash={testing && initial.play.view === 'side' && initial.play.moves.includes('dash')} /> : null}
        {!desktop && !testing && tab === 'filming' && ready ? <PhoneFilming filming={filming} onClose={() => setTab('build')} /> : null}
      </main>
      {settings ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSettings(false)}>
        <section role="dialog" aria-modal="true" aria-label="Place settings" className="max-h-[90dvh] w-full max-w-xl overflow-auto rounded-lg bg-surface p-5 shadow-xl" onClick={event => event.stopPropagation()}>
          <div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-bold">Place settings</h2><IconButton label="Close settings" onClick={() => setSettings(false)}><X className="size-5" /></IconButton></div>
          <label className="mb-5 block text-sm font-bold">Name<input className="mt-2 w-full rounded border border-ink/20 bg-paper p-2" value={metadata.title} maxLength={120} onChange={event => updateMetadata({ ...project.current, title: event.target.value })} /></label>
          <PlaySettingsPicker value={metadata.play} onChange={play => updateMetadata({ ...project.current, play })} />
          <p className="mt-5 text-sm text-ink/60">Access: private local project</p>
          <p className="mt-2 text-xs text-ink/60">{metadata.play.view !== initial.play.view || JSON.stringify(metadata.play.moves) !== JSON.stringify(initial.play.moves) ? 'Saved play settings apply when this project is reopened.' : ''}</p>
        </section>
      </div> : null}
    </div>
  </StudioHostProvider>;
}

function App({ options, beforeClose }: { options: StudioOptions; beforeClose: BeforeClose }) {
  const [storage] = useState(() => options.storage ?? browserStudioStorage());
  const [project, setProject] = useState<StudioProject | null>(null), [recent, setRecent] = useState<Array<{ id: string; title: string }>>([]);
  const [error, setError] = useState<string | null>(null), picker = useRef<HTMLInputElement>(null);
  const refresh = () => { void storage.list().then(setRecent).catch(error => setError(message(error))); };
  useEffect(() => { refresh(); if (options.initialProjectId) void open(options.initialProjectId); }, []);
  const open = async (id: string) => { try { setProject(await storage.read(id)); setError(null); } catch (error) { setError(message(error)); } };
  const create = async ({ style, worldKind, play }: CreationOptions) => {
    const next = createStudioProject(style, worldKind, play); await storage.write(next); setProject(next);
  };
  const previewId = new URLSearchParams(location.search).get('studioPreview');
  if (previewId) return <PlayerPreview id={previewId} storage={storage} options={options} />;
  if (!project) beforeClose.current = async () => true;
  return project ? <Editor key={project.id} initial={project} storage={storage} options={options} beforeClose={beforeClose} leave={() => { setProject(null); refresh(); }} /> : <div className="min-h-dvh bg-paper text-ink">
    <header className="flex min-h-14 flex-wrap items-center gap-3 border-b border-ink/10 bg-surface px-4 py-2">
      <strong>Genvr Studio</strong>
      {recent.length ? <select aria-label="Open project" className="min-w-0 max-w-full rounded border border-ink/20 bg-paper p-2 text-sm" value="" onChange={event => void open(event.target.value)}><option value="" disabled>My projects</option>{recent.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select> : null}
      <IconButton label="Import project" onClick={() => picker.current?.click()}><FolderOpen className="size-4" /></IconButton>
    </header>
    <input ref={picker} type="file" accept=".genvr-studio,.genvr-world,application/json" className="hidden" aria-label="Project file" onChange={async event => {
      const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
      try { if (file.size > STUDIO_PROJECT_BYTES) throw new Error('Studio project exceeds 64 MB.'); const next = { ...importStudioProject(await file.text()), id: crypto.randomUUID() }; await storage.write(next); setProject(next); setError(null); }
      catch (error) { setError(message(error)); }
    }} />
    {error ? <p role="alert" className="mx-auto max-w-4xl p-4 text-coral">{error}</p> : null}
    <CreateFlow onCreate={create} onImport={() => picker.current?.click()} />
  </div>;
}

function PlayerPreview({ id, storage, options }: { id: string; storage: StudioStorage; options: StudioOptions }) {
  const container = useRef<HTMLDivElement>(null), [error, setError] = useState<string | null>(null);
  const player = useRef<GenvrRuntime | null>(null), [project, setProject] = useState<StudioProject | null>(null);
  const touch = new URLSearchParams(location.search).get('touch') === '1';
  useEffect(() => {
    const abort = new AbortController(); let runtime: GenvrRuntime | undefined;
    void storage.read(id).then(project => { setProject(project); return createRuntime({ container: container.current!, world: project.world, terrainChunks: project.terrainChunks,
      editable: false, playView: project.play.view, sideMoves: project.play.moves, forceWebGL: options.forceWebGL, loadSignal: abort.signal,
      emulateTouch: touch,
      fetchPackage: async id => { const asset = project.assets.find(a => a.id === id); if (!asset) throw new Error('Local asset missing.');
        return { id, manifest: asset.manifest, files: asset.files.map(f => ({ path: f.path, contentType: f.contentType, size: atob(f.data).length, url: `data:${f.contentType};base64,${f.data}` })) }; },
    }); }).then(view => { if (abort.signal.aborted) view.dispose(); else { runtime = view; player.current = view; } }).catch(error => { if (!abort.signal.aborted) setError(message(error)); });
    return () => { abort.abort(); runtime?.dispose(); player.current = null; };
  }, [id]);
  return <div className="relative h-dvh w-full"><div ref={container} className="h-full w-full" />{error ? <p role="alert">{error}</p> : null}
    {project ? <PlayControls runtime={player} raised={false} forceTouch={touch} dash={project.play.view === 'side' && project.play.moves.includes('dash')} /> : null}</div>;
}

let mounted = false;
/** A local Studio owns its isolated bundled platform transport until disposed. */
export function mountStudio(container: HTMLElement, options: StudioOptions = {}) {
  if (mounted) throw new Error('Only one Studio can be mounted per SDK module. Dispose it before mounting another.');
  mounted = true;
  options = { ...options, userLibrary: options.userLibrary ?? { scope: 'genvr-user-library' }, liveBridge: options.liveBridge ?? liveStudioOptions() };
  const restoreMotions = options.motionLibrary ? registerAvatarMotionLibrary(options.motionLibrary) : undefined;
  const restore = setPlatformEnabled(false), root = createRoot(container);
  const beforeClose: BeforeClose = { current: async () => true };
  root.render(<App options={options} beforeClose={beforeClose} />);
  return { async dispose() { if (!(await beforeClose.current())) return false; root.unmount(); restoreMotions?.(); restore(); mounted = false; return true; } };
}


/** Mount the same legacy presentation over an existing room or background avatar viewport. */
export function mountAvatarPresentation(container: HTMLElement, runtime: Pick<GenvrRuntime, 'presentAnimation' | 'presentExpression'>, options: AvatarPresentationOptions = {}) {
  const controller = new AvatarPresentation(() => runtime, options);
  const root = createRoot(container);
  root.render(<PresentationViewport controller={controller} />);
  const unsubscribe = options.subscribe?.('', controller.execute);
  return { execute: controller.execute, controller, dispose() { unsubscribe?.(); root.unmount(); controller.dispose(); } };
}
