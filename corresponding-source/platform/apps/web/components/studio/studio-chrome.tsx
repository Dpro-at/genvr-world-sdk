'use client';
import { QuickVoice } from './film/quick-voice';
import { BodySection } from './character-editor/character-controls';
import { LightingPanel } from './lighting-panel';


import { recipeLook } from '@genvr/contracts';

import type { PlayDevice } from '@genvr/contracts';
import type { GenvrRuntime, ToolStatus } from '@genvr/runtime';
import { Mic, Camera, Users, Focus, Lightbulb, Circle, Globe, Play, Redo2, Square, Undo2, type LucideIcon, Settings2, Volume2, VolumeX } from 'lucide-react';
import { useEffect, type ReactNode, type RefObject } from 'react';
import { toolsFor } from '../build-panel';
import { EnvironmentPicker } from '../environment-picker';
import { ThemeToggle } from '../theme-toggle';
import { ConsolePanel, type LogEntry } from './console-panel';
import { DeviceBar, type PreviewState } from './device-bar';
import { allowedPanels, defaultLayout, movePanel, type DockPanel, type StudioLayout } from './layout';
import { DockWorkspace } from './dock-workspace';
import { ToolbarMenu } from './toolbar-menu';
import { LibraryPanel } from './library-panel';
import { AssistantPanel } from './assistant-panel';
import { CaptureButton } from './capture-button';
import { ExplorerPanel } from './explorer-panel';
import { PropertiesPanel } from './properties-panel';
import { SnapBar } from './snap-bar';
import { GenvrMark } from '../genvr-mark';
import { FilmingPanel } from './filming-panel';
import { StoryPanel } from './story-panel';
import type { StudioFilming } from '../../lib/use-studio-filming';
import { VideoEditor, VideoSceneInspector } from './video-editor';
import { useStudioHost } from '../../lib/studio-host';
import {
  CharacterControls,
  CharacterMoves,
  CharacterStageView,
  useCharacterEditor,
} from './character-editor/character-editor';

export type StudioTab = 'build' | 'items' | 'world' | 'avatar' | 'filming';
const TABS: Array<{ id: StudioTab; label: string }> = [
  { id: 'build', label: 'Build' },
  { id: 'items', label: 'Items' },
  { id: 'world', label: 'World' },
  { id: 'avatar', label: 'Avatar' },
  { id: 'filming', label: 'Filming' },
];

/**
 * Real tools (actions). Roads, walls, doors, windows, and water are things to build: they live in
 * the library (Items), and picking one starts its tool. Playing is the Test button, not a tool
 * (owner review): clicking the active tool again puts it away.
 */
/**
 * What the studio's tool dock leaves out, rather than what it lets in.
 *
 * It used to be a list of the tools to show, and the failure mode of that is invisible: Water,
 * rivers, roads and walls were missing here for weeks and could only be reached in the phone and
 * tablet layout (P2-39), because adding a tool meant remembering two places. The Cover tool (P2-40)
 * would have been the same story. Named the other way round, a new tool appears by itself and the
 * worst that can happen is that it appears somewhere it should not, which anyone can see at once.
 *
 * Play is the Test button, not a tool; items come from the Library tab; doors and windows are put
 * in from the wall they belong to.
 */
const NOT_IN_DOCK = new Set<string | null>([null, 'place', 'door', 'window']);

/** Panel titles; the tab panel is named after the open tab. */
const PANEL_TITLES: Record<DockPanel, (tab: StudioTab) => string> = {
  tab: (tab) =>
    ({ build: 'Build tools', items: 'Library', world: 'World', avatar: 'Avatar', filming: 'Filming' })[tab],
  outline: () => 'Explorer',
  properties: (tab) => (tab === 'filming' ? 'Scene inspector' : tab === 'avatar' ? 'Moves' : 'Properties'),
  assistant: () => 'Assistant',
  output: () => 'Debug',
  timeline: () => 'Timeline',
};

function SidebarButton({
  label,
  Icon,
  active = false,
  onClick,
}: {
  label: string;
  Icon: LucideIcon;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-xl py-2.5 text-[11px] font-bold ${
        active ? 'bg-ink text-on-brand' : 'bg-paper text-ink hover:bg-ink/10'
      }`}
    >
      <Icon className="size-5" strokeWidth={2} aria-hidden />
      {label}
    </button>
  );
}

function PanelTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="px-3 pt-2.5 pb-1.5 text-xs font-black tracking-wide text-ink/50 uppercase">{children}</h2>
  );
}

/** Relocation unmounts the transport; its playback abort must also reveal the live view. */
function DockedTimeline({ filming }: { filming: StudioFilming }) {
  useEffect(() => () => filming.studio.setPreviewing(false), [filming.studio.identity]);
  return <VideoEditor filming={filming} />;
}

/**
 * The desktop studio around the 3D view (P3-06, docs/PLAYER-UI.md): top bar, tool ribbon, library
 * and explorer on the left, properties on the right, console at the bottom. Every panel can
 * be resized or hidden; sizes are remembered. Phones and tablets keep the simple layout.
 */
export function StudioChrome({
  runtime,
  placeId,
  devices,
  isOwner,
  status,
  title,
  saveText,
  style,
  layout,
  onLayout,
  tab,
  onTab,
  preview,
  onPreview,
  testing,
  onTesting,
  logs,
  onClearLogs,
  onStyle,
  filming,
}: {
  runtime: RefObject<GenvrRuntime | null>;
  filming: StudioFilming;
  /** The place being built (the assistant works on it). */
  placeId: string;
  /** Devices the place is made for (P9-15); the device preview marks the others. */
  devices: readonly PlayDevice[] | null;
  /** The owner gets the Place settings button (name, categories, how it is played, where it is available). */
  isOwner: boolean;
  status: ToolStatus;
  title: string;
  saveText: string | null;
  style: 'blocky' | 'realistic' | 'anime' | 'voxel';
  layout: StudioLayout;
  onLayout: (change: Partial<StudioLayout>) => void;
  tab: StudioTab;
  onTab: (tab: StudioTab) => void;
  /** Device preview (emulator) settings. */
  preview: PreviewState;
  onPreview: (preview: PreviewState) => void;
  testing: boolean;
  onTesting: (testing: boolean) => void;
  logs: LogEntry[];
  onClearLogs: () => void;
  /** The place's style changed (World tab). */
  onStyle: (style: 'blocky' | 'realistic' | 'anime' | 'voxel') => void;
}) {
  const rt = () => runtime.current;
  const host = useStudioHost();
  const filmWorkspace = tab === 'filming';
  // The Avatar tab is the character editor (CHAR-01): its own stage over the viewport, the world rests meanwhile.
  const character = useCharacterEditor();
  useEffect(() => host.characterBody?.(body => character.change(recipe => ({ ...recipe, body }))), [host.characterBody]);
  useEffect(() => { host.characterLook?.(recipeLook(character.recipe)); }, [character.recipe, host.characterLook]);
  const characterWorkspace = tab === 'avatar' && !testing;
  useEffect(() => {
    if (!characterWorkspace) return;
    runtime.current?.setPaused(true);
    return () => runtime.current?.setPaused(false);
  }, [characterWorkspace, runtime]);
  useEffect(() => {
    filming.studio.setOpen(filmWorkspace);
  }, [filmWorkspace]);
  // Snapping steps from the top bar apply to placing, moving, and turning (P3-24).
  useEffect(() => {
    runtime.current?.setSnap({ grid: layout.snapGrid, angle: (layout.snapAngle * Math.PI) / 180 });
  }, [runtime, layout.snapGrid, layout.snapAngle]);
  const panelContent = (id: DockPanel): ReactNode => {
    if (id === 'output') return <ConsolePanel runtime={runtime} logs={logs} onClear={onClearLogs} />;
    if (id === 'timeline') return <DockedTimeline filming={filming} />;
    if (filmWorkspace && id === 'properties') return <VideoSceneInspector filming={filming} />;
    if (tab === 'avatar' && id === 'properties') return <CharacterMoves editor={character} />;
    // The scroll story is a Filming workspace (SCROLL-03): it is camera work, like filming.
    if (id === 'tab' && tab === 'filming' && filming.studio.workspace === 'story')
      return <StoryPanel runtime={runtime} status={status} placeId={placeId} filming={filming} />;
    if (id === 'tab' && tab === 'filming')
      return (
        <FilmingPanel
          filming={{
            ...filming,
            studio: {
              ...filming.studio,
              setOpen: (open) => {
                filming.studio.setOpen(open);
                if (open) onLayout(movePanel(layout, 'timeline', layout.docks.timeline));
              },
            },
          }}
        />
      );
    if (id === 'outline')
      return (
        <div className="px-1.5 pb-2">
          <ExplorerPanel runtime={runtime} status={status} />
        </div>
      );
    if (id === 'assistant') return <AssistantPanel runtime={runtime} placeId={placeId} />;
    if (id === 'properties')
      return (
        <div className="px-3 pb-3">
          <PropertiesPanel
            placeId={isOwner && host.platform ? placeId : undefined}
            runtime={runtime}
            status={status}
            grid={layout.snapGrid}
            angle={layout.snapAngle}
          />
        </div>
      );
    if (tab === 'items')
      return (
        <div className="flex min-h-0 flex-1 flex-col px-2 pb-2">
          <LibraryPanel runtime={runtime} status={status} style={style} />
        </div>
      );
    if (tab === 'world')
      return (
        <div className="px-2 pb-2">
          <LightingPanel filming={filming} /><EnvironmentPicker runtime={runtime} variant="panel" onStyle={onStyle} />
        </div>
      );
    if (tab === 'avatar') return <CharacterControls editor={character} />;
    return (
      <div className="grid grid-cols-3 gap-1.5 px-2 pb-2">
        {toolsFor(rt())
          .filter((entry) => !NOT_IN_DOCK.has(entry.tool))
          .map((entry) => (
            <SidebarButton
              key={entry.label}
              label={entry.label}
              Icon={entry.Icon}
              active={entry.tool === status.tool}
              onClick={() => rt()?.setTool(entry.tool === status.tool ? null : entry.tool)}
            />
          ))}
      </div>
    );
  };

  return (
    <>
      {/* Top bar. While testing, the platform bar (menu and chat) sits at its left end; while
          building, the studio has no chat or player menu, only the way back to the place page. */}
      <header
        style={{ gridArea: 'top' }}
        className={`flex h-14 min-w-0 items-center gap-2 border-b border-ink/10 bg-surface pr-3 ${testing ? 'pl-[8.5rem]' : 'pl-3'}`}
      >
        {testing ? null : (
          <a
            href={`/places/${placeId}`}
            onClick={host.leave ? (event) => { event.preventDefault(); host.leave?.(); } : undefined}
            title="Leave the studio"
            aria-label="Leave the studio"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg hover:bg-ink/5"
          >
            <GenvrMark className="size-6" />
          </a>
        )}
        <div className="min-w-0 max-w-48 flex-1">
          <p className="truncate text-sm font-black">{title}</p>
          {saveText ? <p className="truncate text-[10px] font-semibold text-ink/50">{saveText}</p> : null}
        </div>
        {testing ? null : (
          <nav
            role="tablist"
            aria-label="Workspace mode"
            className="flex shrink-0 gap-1 rounded-xl bg-paper p-1"
          >
            {TABS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={tab === entry.id}
                onClick={() => { if(entry.id === 'filming'){ filming.studio.setWorkspace('shoot'); filming.studio.setPreviewing(false); runtime.current?.setTool(null); } onTab(entry.id); }}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold ${tab === entry.id ? 'bg-surface text-ink shadow' : 'text-ink/60 hover:text-ink'}`}
              >
                {entry.label}
              </button>
            ))}
          </nav>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {!testing && !filmWorkspace ? (
            <>
              <ToolbarMenu label="Snap">
                <SnapBar grid={layout.snapGrid} angle={layout.snapAngle} onChange={onLayout} />
              </ToolbarMenu>
              <button
                type="button"
                onClick={() => rt()?.undo()}
                aria-label="Undo (Ctrl+Z)"
                title="Undo (Ctrl+Z)"
                className="rounded-lg p-2 hover:bg-ink/5"
              >
                <Undo2 className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => rt()?.redo()}
                aria-label="Redo (Ctrl+Y)"
                title="Redo (Ctrl+Y)"
                className="rounded-lg p-2 hover:bg-ink/5"
              >
                <Redo2 className="size-4" aria-hidden />
              </button>
            </>
          ) : null}
          <ToolbarMenu label="Preview">
            <div className="[&>div]:flex-wrap">
              <DeviceBar preview={preview} onPreview={onPreview} devices={devices} />
            </div>
          </ToolbarMenu>
          {testing ? null : (
            <ToolbarMenu label="Panels" closeOnAction>
              <p className="text-xs text-ink/50">
                Drag a panel grip to an edge or into the view to float it.
              </p>
              {allowedPanels(layout.mode).map((id) => (
                <button
                  type="button"
                  key={id}
                  className="rounded-lg px-2 py-1 text-left hover:bg-ink/10"
                  onClick={() => onLayout(movePanel(layout, id, layout.docks[id]))}
                >
                  Show {PANEL_TITLES[id](tab)}
                </button>
              ))}
              {(['left', 'right', 'bottom'] as const).map((side) => (
                <button
                  key={side}
                  type="button"
                  aria-pressed={layout[`${side}Open`]}
                  className="rounded-lg px-2 py-1 text-left hover:bg-ink/10"
                  onClick={() => onLayout({ [`${side}Open`]: !layout[`${side}Open`] })}
                >
                  {layout[`${side}Open`] ? 'Hide' : 'Show'} {side} dock
                </button>
              ))}
              <button
                type="button"
                className="rounded-lg border-t border-ink/10 px-2 py-2 text-left font-bold hover:bg-ink/10"
                onClick={() =>
                  onLayout({
                    ...defaultLayout(layout.mode),
                    snapGrid: layout.snapGrid,
                    snapAngle: layout.snapAngle,
                    worldSounds: layout.worldSounds,
                  })
                }
              >
                Reset {filmWorkspace ? 'Filming' : 'Build'} layout
              </button>
            </ToolbarMenu>
          )}
          {isOwner && host.platform && !testing ? (
            <ToolbarMenu label="More">
              <CaptureButton runtime={runtime} placeId={placeId} />
            </ToolbarMenu>
          ) : null}
          <ToolbarMenu label="Settings">
            {host.platform ? <fieldset aria-label="MCP connection" className="space-y-2 rounded-lg border border-ink/10 p-2">
              <legend className="px-1 text-xs font-bold">MCP connection</legend>
              <p role="status" className="text-xs text-ink/60">
                {filming.connected ? 'Connected to this Studio session' : 'Disconnected'}
              </p>
              <p className="text-xs text-ink/50">
                One connection for your assistant in this open Studio. Camera, photos and video run in
                the Filming tab.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={filming.connected || filming.busy}
                  onClick={() => void filming.connect()}
                  className="rounded-lg bg-paper px-2 py-1.5 text-xs font-bold disabled:opacity-40"
                >
                  Connect MCP
                </button>
                <button
                  type="button"
                  disabled={!filming.connected || filming.busy}
                  onClick={filming.disconnect}
                  className="rounded-lg bg-paper px-2 py-1.5 text-xs font-bold disabled:opacity-40"
                >
                  Disconnect MCP
                </button>
              </div>
            </fieldset> : null}
            {isOwner && !testing ? (
              <>
                {host.settings ? <button type="button" onClick={host.settings} className="flex items-center gap-2 rounded-lg p-2 hover:bg-ink/10">
                  <Settings2 aria-hidden className="size-4" />Place settings
                </button> : <a
                  href={`/places/${placeId}/settings`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 rounded-lg p-2 hover:bg-ink/10"
                >
                  <Settings2 aria-hidden className="size-4" />
                  Place settings
                </a>}
              </>
            ) : null}
            {testing ? null : (
              <button
                type="button"
                aria-pressed={layout.worldSounds}
                onClick={() => onLayout({ worldSounds: !layout.worldSounds })}
                className="flex items-center gap-2 rounded-lg p-2 text-left hover:bg-ink/10"
              >
                {layout.worldSounds ? (
                  <Volume2 aria-hidden className="size-4" />
                ) : (
                  <VolumeX aria-hidden className="size-4" />
                )}
                World sounds {layout.worldSounds ? 'on' : 'off'}
              </button>
            )}
            <div className="flex items-center justify-between text-xs">
              Theme
              <ThemeToggle className="size-8 rounded-lg" />
            </div>
          </ToolbarMenu>
          {isOwner && host.platform && !testing ? (
            // Publishing stays the owner's own step: it opens the place to visitors (and its scroll stories).
            <a
              href={`/places/${placeId}/publish`}
              target="_blank"
              rel="noreferrer"
              className="ml-1 inline-flex items-center gap-1.5 rounded-lg border border-ink/20 px-3 py-1.5 text-xs font-bold hover:bg-ink/10"
            >
              <Globe className="size-4" aria-hidden />
              Publish
            </a>
          ) : null}
          <button
            type="button"
            onClick={(event) => {
              rt()?.setTool(null);
              onTesting(!testing);
              event.currentTarget.blur();
            }}
            className="ml-1 inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-on-brand"
          >
            {testing ? <Square className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
            {testing ? 'Stop test' : 'Test'}
          </button>
        </div>
      </header>

      {filmWorkspace ? (
        <div
          id="genvr-film-stage"
          aria-hidden={!filming.studio.previewing}
          style={testing ? { position: 'absolute', inset: '4rem 0 20rem' } : { gridArea: 'viewport' }}
          className={`relative min-h-0 min-w-0 ${filming.studio.previewing ? 'z-20 bg-black' : 'pointer-events-none opacity-0'}`}
        />
      ) : null}

      {filmWorkspace && !testing ? <div style={{gridArea:'viewport'}} className="pointer-events-none relative z-40 min-h-0 min-w-0"><div role="toolbar" aria-label="Filming quick tools" className="pointer-events-auto absolute inset-x-2 top-2 flex flex-wrap items-center justify-center gap-1 rounded-lg border border-ink/15 bg-surface/95 p-1 shadow-md">
        <ToolbarMenu label="Characters" icon={Users}><p className="text-xs font-semibold">Choose the live character</p><BodySection editor={character}/>{host.userAvatarControls?.('characters','',body=>character.change(recipe=>({...recipe,body})))}</ToolbarMenu>
        {filming.voiceAvailable ? <ToolbarMenu label="Voice" icon={Mic}><QuickVoice filming={filming}/></ToolbarMenu> : null}
        <ToolbarMenu label="Camera" icon={Camera} closeOnAction>{([{id:'static',label:'Static'},{id:'handheld',label:'Handheld'},{id:'running',label:'Running camera'},{id:'drone',label:'Drone'},{id:'follow',label:'Follow character'},{id:'side',label:'Side tracking'},{id:'orbit',label:'Orbit'}] as const).map(preset=><button key={preset.id} className="rounded px-2 py-2 text-left text-xs hover:bg-ink/10" disabled={filming.busy||filming.studio.rendering} onClick={()=>{filming.studio.setPreviewing(false);filming.preset(preset.id);}}>{preset.label}</button>)}</ToolbarMenu>
        <button type="button" aria-label="Follow character" aria-pressed={filming.camera?.follow_player??false} disabled={filming.busy||filming.studio.rendering} className="flex items-center gap-1 rounded px-2 py-1.5 text-xs font-bold hover:bg-ink/10 aria-pressed:bg-brand/20" onClick={()=>{filming.studio.setPreviewing(false);if(filming.camera)filming.apply({...filming.camera,follow_player:!filming.camera.follow_player});else filming.preset('follow');}}><Focus className="size-4"/>Follow</button>
        <ToolbarMenu label="Lighting" icon={Lightbulb}><LightingPanel filming={filming}/></ToolbarMenu>
        <button type="button" aria-label="Record take" disabled={!filming.studio.ready||filming.busy||filming.studio.rendering} className="flex items-center gap-1 rounded border border-red-500/40 px-2 py-1.5 text-xs font-bold disabled:opacity-40" onClick={()=>{filming.studio.setWorkspace('shoot');filming.studio.setPreviewing(false);if(filming.studio.mode==='gameplay')filming.reset();const[w,h]=filming.output.size.split('x').map(Number);void filming.take('video',filming.output.seconds,w!,h!,true,undefined,filming.studio.plan);}}><Circle className="size-3 fill-red-500 text-red-500"/>Record · {filming.output.seconds}s</button>
      </div></div> : null}

      {characterWorkspace ? (
        <div style={{ gridArea: 'viewport' }} className="relative z-20 min-h-0 min-w-0">
          <CharacterStageView editor={character} />
        </div>
      ) : null}

      {testing && tab === 'filming' ? (
        <aside
          aria-label="Filming"
          className="absolute top-20 right-3 z-30 max-h-[calc(100dvh-6rem)] w-80 overflow-y-auto rounded-xl bg-surface shadow-xl"
        >
          <PanelTitle>Filming</PanelTitle>
          <FilmingPanel filming={filming} />
        </aside>
      ) : null}
      {testing && filming.studio.open ? (
        <div className="absolute right-0 bottom-0 left-0 z-30 h-80 bg-surface shadow-xl">
          <DockedTimeline filming={filming} />
        </div>
      ) : null}

      {testing ? null : (
        <DockWorkspace
          key={layout.mode}
          layout={layout}
          onLayout={onLayout}
          title={(id) => PANEL_TITLES[id](tab)}
          content={panelContent}
        />
      )}
    </>
  );
}
