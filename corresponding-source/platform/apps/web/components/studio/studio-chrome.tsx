'use client';
import { CharacterTabs } from './character-editor/character-tabs';
import { avatarStudioBridge } from '../../lib/avatar-studio';
import type { CharacterEditor } from './character-editor/use-character-editor';
import { QuickVoice } from './film/quick-voice';
import { BodySection } from './character-editor/character-controls';


import { recipeLook } from '@genvr/contracts';

import type { PlayDevice } from '@genvr/contracts';
import type { GenvrRuntime, ToolStatus } from '@genvr/runtime';
import { Share2, Mic, Camera, Users, Focus, Lightbulb, Circle, Globe, Play, Redo2, Square, Undo2, type LucideIcon, Settings2, Volume2, VolumeX } from 'lucide-react';
import { useEffect, type ReactNode, type RefObject, useRef } from 'react';
import { toolsFor } from '../build-panel';
import { ThemeToggle } from '../theme-toggle';
import { ConsolePanel, type LogEntry } from './console-panel';
import { DeviceBar, type PreviewState } from './device-bar';
import { allowedPanels, defaultLayout, movePanel, panelShown, type DockPanel, type StudioLayout } from './layout';
import { DockWorkspace } from './dock-workspace';
import { ToolbarMenu } from './toolbar-menu';
import { LibraryPanel } from './library-panel';
import { AssistantPanel } from './assistant-panel';
import { CaptureButton } from './capture-button';
import { ExplorerPanel } from './explorer-panel';
import { PropertiesPanel } from './properties-panel';
import { OPTION_TOOLS, ToolOptionsPanel } from './tool-options-panel';
import { ItemsSidePanel } from './items-side-panel';
import { setWorldPart, WorldPartsList, WorldSidePanel } from './world-panel';
import { setStructureFocus } from '../../lib/structure-focus';
import { SnapBar } from './snap-bar';
import { GenvrMark } from '../genvr-mark';
import { FilmingPanel } from './filming-panel';
import { RecordingBar, RecordingFrame } from './film/recording-bar';
import { WorkflowView } from './film/workflow-view';
import { useWorkflowOpen } from '../../lib/video-studio/scene-selection';
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
import { LabLeft, LabRight, LabRunBar, LabRunStrip } from './lab/lab-panels';
import { LabStage } from './lab/lab-stage';
import { motionLabBridge, type LabController } from '../../lib/motion-lab';

/** World is not a tab of its own any more: it is a panel in the Build left dock, Tools · World · Explorer (WORLD-W10). */
export type StudioTab = 'build' | 'items' | 'avatar' | 'filming' | 'lab';
const TABS: Array<{ id: StudioTab; label: string }> = [
  { id: 'build', label: 'Build' },
  { id: 'items', label: 'Items' },
  { id: 'avatar', label: 'Avatar' },
  { id: 'filming', label: 'Filming' },
  // MOTION-LAB: only in a motion lab project.
  { id: 'lab', label: 'Lab' },
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
const NOT_IN_DOCK = new Set<string | null>([null, 'place']);
/** The Build dock in groups with a key on each tool (BUILD-B1); R stays Turn and Delete stays Delete. */
const DOCK_GROUPS: Array<{ label: string; tools: Array<{ tool: string; key: string }> }> = [
  { label: 'Edit', tools: [{ tool: 'select', key: 'V' }, { tool: 'eraser', key: 'E' }] },
  { label: 'Land', tools: [{ tool: 'terrain', key: 'T' }, { tool: 'cover', key: 'G' }, { tool: 'water', key: 'L' }, { tool: 'river', key: 'I' }] },
  { label: 'Build', tools: [{ tool: 'road', key: 'D' }, { tool: 'wall', key: 'W' }, { tool: 'door', key: 'O' }, { tool: 'window', key: 'N' }, { tool: 'blocks', key: 'B' }] },
  { label: 'Real place', tools: [{ tool: 'map', key: 'M' }] },
];
const TOOL_KEYS = new Map(DOCK_GROUPS.flatMap((group) => group.tools.map((one) => [one.key.toLowerCase(), one.tool] as const)));

/** Panel titles; the tab panel is named after the open tab. */
const PANEL_TITLES: Record<DockPanel, (tab: StudioTab) => string> = {
  tab: (tab) =>
    ({ build: 'Tools', items: 'Library', avatar: 'Avatar', filming: 'Filming', lab: 'Course' })[tab],
  world: () => 'World',
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
  shortcut,
  onClick,
}: {
  label: string;
  Icon: LucideIcon;
  active?: boolean;
  shortcut?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-keyshortcuts={shortcut}
      title={shortcut ? `${label} (${shortcut})` : label}
      onClick={onClick}
      className={`relative flex flex-col items-center gap-1 rounded-xl py-2.5 text-[11px] font-bold ${
        active ? 'bg-ink text-on-brand' : 'bg-paper text-ink hover:bg-ink/10'
      }`}
    >
      {shortcut ? <span aria-hidden className="absolute top-1 right-1.5 font-mono text-[9px] font-medium opacity-50">{shortcut}</span> : null}
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
  onCharacter,
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
  lab,
}: {
  runtime: RefObject<GenvrRuntime | null>;
  filming: StudioFilming;
  /** The motion lab of a lab project (MOTION-LAB); absent in other projects, which then have no Lab tab. */
  lab?: LabController;
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
  onCharacter?: (editor: CharacterEditor) => void;
  testing: boolean;
  onTesting: (testing: boolean) => void;
  logs: LogEntry[];
  onClearLogs: () => void;
  /** The place's style changed (Build → World → Style and place). */
  onStyle: (style: 'blocky' | 'realistic' | 'anime' | 'voxel') => void;
}) {
  const rt = () => runtime.current;
  const host = useStudioHost();
  const filmWorkspace = tab === 'filming';
  // The Avatar tab is the character editor (CHAR-01): its own stage over the viewport, the world rests meanwhile.
  const character = useCharacterEditor();
  useEffect(() => avatarStudioBridge.register(character), [character]);
  useEffect(() => motionLabBridge.register(lab ?? null), [lab]);
  // A road or wall picked in the Explorer stays only while selecting in the same tab (BUILD-B7).
  useEffect(() => {
    if (status.tool !== 'select' && status.tool !== null) setStructureFocus(null);
  }, [status.tool]);
  useEffect(() => setStructureFocus(null), [tab]);
  // A Build or Items tool does not follow into another tab (ITEMS-I0: the Map hint stayed on Items).
  const lastTab = useRef(tab);
  const toolNow = useRef(status.tool);
  toolNow.current = status.tool;
  useEffect(() => {
    if (lastTab.current === tab) return;
    lastTab.current = tab;
    if (toolNow.current && (toolNow.current !== 'select' || tab === 'avatar' || tab === 'filming')) runtime.current?.setTool(tab === 'build' || tab === 'items' ? 'select' : null);
  }, [tab, runtime]);
  // The World panel only belongs to Build (WORLD-W10): Items, Avatar and Lab keep their left dock as it was.
  const visiblePanel = (id: DockPanel) => id !== 'world' || tab === 'build';
  const worldOpen = !testing && tab === 'build' && layout.mode === 'build' && panelShown(layout, 'world', visiblePanel);
  // World has no tools in the view (WORLD-W9): opening it puts the tool away, leaving it gives Select back.
  const worldWas = useRef(worldOpen);
  useEffect(() => {
    if (worldWas.current === worldOpen) return;
    worldWas.current = worldOpen;
    if (worldOpen) { if (toolNow.current) runtime.current?.setTool(null); return; }
    setWorldPart(null);
    if (tab === 'build' && !testing && !toolNow.current) runtime.current?.setTool('select');
  }, [worldOpen, tab, testing, runtime]);
  // Picking a tool while World is open (a key, the assistant) shows the Tools panel again.
  const toolWas = useRef(status.tool);
  useEffect(() => {
    const changed = toolWas.current !== status.tool;
    toolWas.current = status.tool;
    if (!changed || !status.tool || !worldOpen) return;
    const side = layout.docks.world;
    if (side !== 'floating' && layout.docks.tab === side) onLayout({ active: { ...layout.active, [side]: 'tab' } });
  }, [status.tool, worldOpen, layout, onLayout]);
  // Esc in World goes back to Tools (WORLD-W10); placing a light or the start point keeps its own Esc.
  useEffect(() => {
    if (!worldOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="alertdialog"]')) return;
      const side = layout.docks.world;
      if (side === 'floating' || layout.docks.tab !== side) { setWorldPart(null); return; }
      onLayout({ active: { ...layout.active, [side]: 'tab' } });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [worldOpen, layout, onLayout]);
  // Build keys (BUILD-B1): a letter picks a tool; Ctrl/Cmd+Z undoes, Ctrl+Y or Shift+Ctrl/Cmd+Z redoes.
  useEffect(() => {
    if (testing || (tab !== 'build' && tab !== 'items' && tab !== 'avatar')) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      const key = event.key.toLowerCase();
      if (event.ctrlKey || event.metaKey) {
        if (event.altKey) return;
        // The Avatar tab steps through the character's edits (AV-UNDO), the other tabs through the world's.
        if (key === 'z' && !event.shiftKey) { event.preventDefault(); if (tab === 'avatar') character.undo(); else runtime.current?.undo(); }
        else if (key === 'y' || (key === 'z' && event.shiftKey)) { event.preventDefault(); if (tab === 'avatar') character.redo(); else runtime.current?.redo(); }
        return;
      }
      if (tab !== 'build' || event.altKey || event.shiftKey || event.repeat) return;
      const tool = TOOL_KEYS.get(key);
      const runtimeNow = runtime.current;
      if (!tool || !runtimeNow || !toolsFor(runtimeNow).some((entry) => entry.tool === tool)) return;
      event.preventDefault();
      runtimeNow.setTool(tool as Parameters<typeof runtimeNow.setTool>[0]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tab, testing, runtime, character]);
  const workflowOpen = useWorkflowOpen();
  useEffect(()=>{onCharacter?.(character);},[character]);
  useEffect(() => host.characterBody?.(body => character.change(recipe => ({ ...recipe, body }))), [host.characterBody]);
  useEffect(() => { host.characterRecipe?.(character.recipe); }, [character.recipe, host.characterRecipe]);
  useEffect(() => { host.characterLook?.(recipeLook(character.recipe)); }, [character.recipe, host.characterLook]);
  const characterWorkspace = tab === 'avatar' && !testing;
  // The Lab draws its own stage too (MOTION-LAB): the world rests meanwhile.
  const labWorkspace = tab === 'lab' && Boolean(lab) && !testing;
  useEffect(() => {
    if (!characterWorkspace && !labWorkspace) return;
    runtime.current?.setPaused(true);
    return () => runtime.current?.setPaused(false);
  }, [characterWorkspace, labWorkspace, runtime]);
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
    if (tab === 'lab' && lab) { if (id === 'properties') return <LabRight lab={lab} />; if (id === 'tab') return <LabLeft lab={lab} />; }
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
    if (id === 'properties' && tab === 'build' && status.tool && OPTION_TOOLS.has(status.tool))
      return <ToolOptionsPanel runtime={runtime} status={status} placeId={placeId} />;
    if (id === 'world')
      return (
        <div className="px-2 pb-2">
          <WorldPartsList runtime={runtime} />
        </div>
      );
    // The right dock on Build: the tool's options, else the picked world part while World is open, else the
    // selection's Properties or the place summary — never empty (WORLD-W7, W10).
    if (id === 'properties' && worldOpen)
      return (
        <WorldSidePanel
          runtime={runtime}
          placeId={placeId}
          busy={filming.busy || filming.studio.rendering}
          actors={filming.sceneActors()}
          message={filming.studio.setMessage}
          onStyle={() => onStyle?.(runtime.current?.world.style.base ?? 'blocky')}
          fallback={status.selected || status.water ? (
            <PropertiesPanel placeId={isOwner && host.platform ? placeId : undefined} runtime={runtime} status={status} grid={layout.snapGrid} angle={layout.snapAngle} />
          ) : undefined}
        />
      );
    if (id === 'properties' && tab === 'items')
      return (
        <ItemsSidePanel
          runtime={runtime}
          status={status}
          placeId={placeId}
          savePlaceId={isOwner && host.platform ? placeId : undefined}
          grid={layout.snapGrid}
          angle={layout.snapAngle}
          style={style}
        />
      );
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
    if (tab === 'avatar') return <CharacterTabs editor={character} />;
    const available = toolsFor(rt()).filter((entry) => !NOT_IN_DOCK.has(entry.tool));
    return (
      <div className="flex flex-col gap-1 px-2 pb-2">
        {DOCK_GROUPS.map((group) => {
          const entries = group.tools.flatMap((one) => {
            const entry = available.find((tool) => tool.tool === one.tool);
            return entry ? [{ ...entry, key: one.key }] : [];
          });
          if (!entries.length) return null;
          return (
            <section key={group.label} aria-label={group.label}>
              <h3 className="mt-1 mb-1 px-1 text-[10px] font-black tracking-wide text-ink/45 uppercase">{group.label}</h3>
              <div className="grid grid-cols-3 gap-1.5">
                {entries.map((entry) => (
                  <SidebarButton
                    key={entry.label}
                    label={entry.label}
                    Icon={entry.Icon}
                    shortcut={entry.key}
                    active={entry.tool === status.tool}
                    onClick={() => rt()?.setTool(entry.tool === status.tool ? null : entry.tool)}
                  />
                ))}
              </div>
            </section>
          );
        })}
        <p className="mt-2 px-1 text-[11px] text-ink/50">Keys pick a tool · Esc stops drawing · each tool's options are on the right. Sky, lights, weather, water and the start point are in World.</p>
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
            {TABS.filter((entry) => entry.id !== 'lab' || lab).map((entry) => (
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
                onClick={() => (tab === 'avatar' ? character.undo() : rt()?.undo())}
                aria-label="Undo (Ctrl+Z)"
                title="Undo (Ctrl+Z)"
                className="rounded-lg p-2 hover:bg-ink/5"
              >
                <Undo2 className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => (tab === 'avatar' ? character.redo() : rt()?.redo())}
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
              {allowedPanels(layout.mode).filter(visiblePanel).map((id) => (
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
          {host.share ? <button type="button" onClick={host.share} className="ml-1 inline-flex items-center gap-1.5 rounded-lg border border-ink/20 px-3 py-1.5 text-xs font-bold"><Share2 className="size-4"/>Share</button> : null}
          {host.avatarLive ? <button type="button" onClick={host.avatarLive} className="ml-1 inline-flex items-center gap-1.5 rounded-lg border border-ink/20 px-3 py-1.5 text-xs font-bold"><Users className="size-4"/>Avatar Live</button> : null}
          <button
            type="button"
            onClick={(event) => {
              if (tab === 'avatar' && host.avatarLive) { host.avatarLive(); return; }
              if (labWorkspace && lab) { try { lab.run(); } catch { /* the run bar shows problems */ } return; }
              if (filmWorkspace) { if(filming.studio.filmPlaying)filming.studio.transport.current?.stop();else filming.studio.transport.current?.play(); return; }
              rt()?.setTool(null);
              onTesting(!testing);
              event.currentTarget.blur();
            }}
            className="ml-1 inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-on-brand"
          >
            {testing ? <Square className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
            {filmWorkspace ? (filming.studio.filmPlaying ? 'Pause film' : 'Play film') : labWorkspace ? 'Run lab' : tab === 'avatar' && host.avatarLive ? 'Preview avatar' : testing ? 'Stop test' : 'Test world'}
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

      {filmWorkspace && !testing ? <div style={{ gridArea: 'viewport' }} className="pointer-events-none relative z-30 min-h-0 min-w-0"><RecordingFrame filming={filming} /></div> : null}
      {/* Workflow (board 7) takes the whole centre column: the recording bar, the world and the timeline go behind it. */}
      {filmWorkspace && !testing && workflowOpen ? <div style={{ gridColumn: '3 / 4', gridRow: '3 / -1' }} className="relative z-[45] min-h-0 min-w-0"><WorkflowView filming={filming} /></div> : null}

      {/* Scene tools sit in their own fixed row above the world view (grid area "scenebar"), never over the picture. */}
      {filmWorkspace && !testing ? <div style={{gridArea:'scenebar'}} className="relative z-40 min-w-0 border-b border-ink/15 bg-surface"><div className="flex flex-wrap items-center justify-center">
        {host.userAvatarControls ? null : <ToolbarMenu label="Characters" icon={Users}><p className="text-xs font-semibold">Choose the live character</p><BodySection editor={character}/></ToolbarMenu>}
        <RecordingBar filming={filming}/>
      </div></div> : null}

      {labWorkspace && lab ? (
        <div style={{ gridArea: 'viewport' }} className="relative z-20 flex min-h-0 min-w-0 flex-col bg-surface">
          <div className="relative min-h-0 flex-1"><LabStage lab={lab} /><LabRunBar lab={lab} /></div>
          <div className="h-48 shrink-0 border-t border-ink/10"><LabRunStrip lab={lab} /></div>
        </div>
      ) : null}

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
          <div className="border-b border-ink/10"><RecordingBar filming={filming} /></div>
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
          visible={visiblePanel}
        />
      )}
    </>
  );
}
