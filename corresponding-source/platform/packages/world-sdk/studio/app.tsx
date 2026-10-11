import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Clapperboard, Download, FolderOpen, House, Save, Settings2, X } from 'lucide-react';
import { createRuntime, DEFAULT_BRUSH, DEFAULT_RIVER, type GenvrRuntime, type ToolStatus } from '@genvr/runtime';
import type { ChatModel } from '@genvr/assistant';
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
import { StudioSaveQueue, flushStudioClose } from '../src/studio-save';

export interface StudioOptions { storage?: StudioStorage; model?: ChatModel; forceWebGL?: boolean; }
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
  const project = useRef(initial), queue = useRef(new StudioSaveQueue()), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false), mounted = useRef(true);
  const [ready, setReady] = useState(false), [error, setError] = useState<string | null>(null), [saved, setSaved] = useState('Loading');
  const [metadata, setMetadata] = useState(initial), [settings, setSettings] = useState(false), [testing, setTesting] = useState(false);
  const [tab, setTab] = useState<StudioTab>('build'), [preview, setPreview] = useState(DEFAULT_PREVIEW);
  const [logs, setLogs] = useState<LogEntry[]>([]), desktop = useIsDesktop();
  const [layout, setLayout] = useStudioLayout(tab === 'filming' ? 'filming' : 'build');
  const [status, setStatus] = useState<ToolStatus>({ tool: null, points: 0, canFinish: false, message: null, placeItemId: null,
    selected: null, moving: false, brush: { ...DEFAULT_BRUSH }, roadType: 'genvr.core.road.street', road: { oneway: false }, river: DEFAULT_RIVER, water: null });
  const log = (text: string) => setLogs(list => [...list.slice(-99), { id: Date.now(), at: Date.now(), level: 'info', text }]);
  const filming = useStudioFilming(initial.id, runtime, container, log, () => !testing, `sdk-studio:${initial.id}`, false);
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
      const found = initial.assets.find(a => a.id === id); if (!found) throw new Error(`Local asset unavailable: ${id}`);
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
      setReady(true); setSaved('Saved locally');
    }).catch(error => { if (!abort.signal.aborted) setError(message(error)); });
    const beforeUnload = (event: BeforeUnloadEvent) => { if (dirty.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      mounted.current = false; abort.abort(); if (timer.current) clearTimeout(timer.current);
      window.removeEventListener('beforeunload', beforeUnload); latestFilm.current.releaseRuntime(); current?.dispose(); runtime.current = null;
    };
  }, []);
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
  beforeClose.current = flush;
  const goHome = async () => { if (await flush()) leave(); };
  const test = (value: boolean) => { if (value) runtime.current?.setTool(null); setTesting(value); };
  const updateMetadata = (next: StudioProject) => { project.current = next; setMetadata(next); changed(); };
  return <StudioHostProvider value={{ platform: false, ...(options.model ? { model: options.model } : {}), leave: () => { void goHome(); }, settings: () => setSettings(true) }}>
    <div className="flex h-dvh flex-col overflow-hidden bg-paper text-ink">
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-ink/10 bg-surface px-2">
        <IconButton label="My projects" disabled={(!ready && !error) || filming.busy || filming.studio.rendering} onClick={() => void goHome()}><House className="size-4" /></IconButton>
        <span className="truncate text-xs font-bold">Local Studio</span>
        <span className="min-w-0 flex-1 truncate text-xs text-ink/60" role="status">{saved}</span>
        <IconButton label="Save project" disabled={!ready} onClick={() => void save()}><Save className="size-4" /></IconButton>
        <IconButton label="Export project" disabled={!ready} onClick={() => { try { download(snapshot()); } catch (error) { setError(message(error)); } }}><Download className="size-4" /></IconButton>
        <IconButton label="Place settings" disabled={!ready} onClick={() => setSettings(true)}><Settings2 className="size-4" /></IconButton>
        {!desktop ? <IconButton label="Filming" disabled={!ready} onClick={() => { runtime.current?.setTool(null); setTab('filming'); }}><Clapperboard className="size-4" /></IconButton> : null}
      </div>
      {error ? <div role="alert" className="flex items-center gap-2 bg-coral px-3 py-2 text-sm text-white"><span className="flex-1">{error}</span><button aria-label="Dismiss error" onClick={() => setError(null)}><X className="size-4" /></button></div> : null}
      <main className="relative min-h-0 flex-1" style={desktop ? studioGrid(layout, testing) : undefined}>
        <div className="relative min-h-0 min-w-0 overflow-hidden" style={desktop ? { gridArea: 'viewport', visibility: preview.model ? 'hidden' : undefined } : { height: '100%' }}>
          <div ref={container} className="h-full w-full" />
          {!ready ? <p className="absolute inset-x-0 top-1/2 text-center text-sm">{error ? 'Could not open the world' : 'Loading world'}</p> : null}
        </div>
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
  useEffect(refresh, []);
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
  const restore = setPlatformEnabled(false), root = createRoot(container);
  const beforeClose: BeforeClose = { current: async () => true };
  root.render(<App options={options} beforeClose={beforeClose} />);
  return { async dispose() { if (!(await beforeClose.current())) return false; root.unmount(); restore(); mounted = false; return true; } };
}
