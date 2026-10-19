'use client';

import { SIZE_TIERS } from '@genvr/contracts';
import {
  CORE_ITEMS,
  DEFAULT_GROUND,
  getBlock,
  getGround,
  GROUND_MATERIALS,
  groundRef,
  getRoadType,
  ROAD_TYPES,
  type GroundKind,
  type ItemGroup,
} from '@genvr/core-library';
import {
  SOIL_COLORS,
  type BrushMode,
  type BrushSize,
  type Cover,
  STACKABLE_BLOCKS,
  type BuildTool,
  type GenvrRuntime,
  type RiverToolSettings,
  type RoadToolSettings,
  type ToolStatus,
} from '@genvr/runtime';
import {
  ArrowBigDown,
  ArrowBigUp,
  BrickWall,
  Check,
  CloudSun,
  Columns3,
  Copy,
  Delete,
  Boxes,
  DoorOpen,
  Droplets,
  Layers,
  Pickaxe,
  Equal,
  Eraser,
  Map as MapIcon,
  Footprints,
  Grid2x2,
  Mountain,
  MousePointer2,
  Move,
  Paintbrush,
  Play,
  Redo2,
  RotateCw,
  Route,
  Waves,
  Shapes,
  Spline,
  Trash,
  Undo2,
  X,
  type LucideIcon,
  PanelLeftClose,
  Search,
  Sparkles,
  Sprout,
  Grip,
  Leaf,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { itemIcon } from '../lib/item-icons';
import { fetchStoreItems, type StoreEntry } from '../lib/store-items';
import { playSound } from '../lib/sounds';
import { EnvironmentPicker } from './environment-picker';
import { CatalogPanel } from './catalog-panel';
import { AssistantPanel } from './studio/assistant-panel';
import { RealPlacePanel, buildStage } from './real-place-panel';
import { applyMapBuild, closeOpenEdit } from '../lib/map-build';
import { BuildContextMenu } from './studio/build-context-menu';

export const TOOLS: Array<{ tool: BuildTool | null; Icon: LucideIcon; label: string }> = [
  { tool: null, Icon: Footprints, label: 'Play' },
  { tool: 'place', Icon: Shapes, label: 'Items' },
  { tool: 'blocks', Icon: Boxes, label: 'Blocks' },
  { tool: 'select', Icon: MousePointer2, label: 'Select' },
  { tool: 'terrain', Icon: Mountain, label: 'Terrain' },
  { tool: 'cover', Icon: Sprout, label: 'Cover' },
  { tool: 'water', Icon: Droplets, label: 'Water' },
  { tool: 'river', Icon: Waves, label: 'River' },
  { tool: 'road', Icon: Route, label: 'Road' },
  { tool: 'wall', Icon: BrickWall, label: 'Wall' },
  { tool: 'door', Icon: DoorOpen, label: 'Door' },
  { tool: 'window', Icon: Grid2x2, label: 'Window' },
  { tool: 'eraser', Icon: Eraser, label: 'Eraser' },
  // Real place (plan 2026-10-06-real-place): a real area from the map, built into this place.
  { tool: 'map', Icon: MapIcon, label: 'Map' },
];

/** Tools that shape the height field; places with block ground get their own (P2-26). */
export const HEIGHT_FIELD_TOOLS = new Set<BuildTool | null>(['terrain', 'cover', 'water', 'river', 'map']);

/** Road types that work in this place (block ground has its own, P2-26 stage 2). */
export const roadTypesFor = (runtime: GenvrRuntime | null) => {
  const allowed = runtime?.blockRoadTypes;
  return allowed ? ROAD_TYPES.filter((type) => allowed.includes(type.id)) : ROAD_TYPES;
};

/** The build tools that work in this place (digging and stacking only on block ground). */
export const toolsFor = (runtime: GenvrRuntime | null) =>
  runtime?.blockGround
    ? TOOLS.filter((entry) => !HEIGHT_FIELD_TOOLS.has(entry.tool))
    : TOOLS.filter((entry) => entry.tool !== 'blocks');

/** A block's color for its picker swatch: the middle of its clean top face. */
export const blockColor = (name: string) => hex(getBlock(name)?.look.plain.top[8 * 16 + 8] ?? 0x888888);

export const HINTS: Partial<Record<BuildTool, string>> = {
  road: 'Tap the ground to add points. Tap the last point again, or Done, to finish.',
  wall: 'Tap to add corners. Tap the first corner to make a room.',
  door: 'Tap a wall to add a door.',
  window: 'Tap a wall to add a window.',
  eraser: 'Tap an item, water, road, or wall to remove it.',
  map: 'Find a real place on the map. Tap the ground to choose where it goes, then Build here.',
  blocks: 'Tap a block to stack or dig. Drag for a row or a floor.',
  select: 'Tap an item to select it.',
  terrain: 'Drag on the ground to shape it. Right-drag turns the camera.',
  cover: 'Drag on the ground to say what grows there. Clear takes away trees and grass.',
  water: 'Tap a hole to fill it with water, or tap flat ground to dig a pond.',
  river: 'Tap the ground to draw the river. It carves its bed and runs downhill on its own.',
};

export const GROUPS: Array<{ group: ItemGroup; label: string }> = [
  { group: 'parts', label: 'Parts' },
  { group: 'nature', label: 'Nature' },
  { group: 'props', label: 'Props' },
  { group: 'buildings', label: 'Buildings' },
];

export const BRUSH_MODES: Array<{ mode: BrushMode; Icon: LucideIcon; label: string }> = [
  { mode: 'raise', Icon: ArrowBigUp, label: 'Raise' },
  { mode: 'lower', Icon: ArrowBigDown, label: 'Lower' },
  { mode: 'flatten', Icon: Equal, label: 'Flatten' },
  { mode: 'smooth', Icon: Spline, label: 'Smooth' },
  { mode: 'paint', Icon: Paintbrush, label: 'Paint' },
];

/**
 * What the Cover brush writes (P2-40). These are the four values of the cover layer in the order a
 * creator meets them: put something here, take everything away, or hand the spot back to the world.
 *
 * "Clear" is the one that removes a scattered tree, because a rule has nothing to delete; "Let it
 * grow" is the way back, and the two are not the same thing. The design says in one place that the
 * eraser clears back to 0 and in another that 0 means the world's own rules, which cannot both
 * hold, so both are offered and each says what it does.
 */
export const COVER_BRUSHES: Array<{ cover: Cover; Icon: LucideIcon; label: string }> = [
  { cover: 'plants', Icon: Sprout, label: 'Plants' },
  { cover: 'pebbles', Icon: Grip, label: 'Pebbles' },
  { cover: 'cleared', Icon: Eraser, label: 'Clear' },
  { cover: 'default', Icon: Leaf, label: 'Let it grow' },
];

export const BRUSH_SIZES: Array<{ size: BrushSize; label: string }> = [
  { size: 'small', label: 'S' },
  { size: 'medium', label: 'M' },
  { size: 'large', label: 'L' },
];

export const SOILS = ['grass', 'dirt', 'sand', 'rock', 'snow', 'mud'] as const;

export const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;

function PillButton({
  onClick,
  Icon,
  children,
  tone = 'plain',
  disabled,
}: {
  onClick: () => void;
  Icon: LucideIcon;
  children: ReactNode;
  tone?: 'plain' | 'go' | 'danger';
  disabled?: boolean;
}) {
  const tones = {
    plain: 'bg-surface text-ink',
    go: 'bg-mint text-ink',
    danger: 'bg-coral text-on-brand',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-2xl px-4 py-2.5 text-sm font-bold shadow disabled:opacity-50 ${tones[tone]}`}
    >
      <Icon className="size-5" aria-hidden />
      {children}
    </button>
  );
}

/**
 * Item library in the left side panel: Genvr items grouped in tabs, and approved creator items
 * (P1-08) behind a Genvr / Creators switch that only shows when there are creator models.
 */
function ItemLibrary({
  runtime,
  selectedId,
  onPick,
  onTurn,
  onClose,
}: {
  runtime: RefObject<GenvrRuntime | null>;
  selectedId: string | null;
  onPick: (itemId: string) => void;
  onTurn: () => void;
  onClose: () => void;
}) {
  const [group, setGroup] = useState<ItemGroup>('nature');
  const [maker, setMaker] = useState<'genvr' | 'creators'>('genvr');
  const [store, setStore] = useState<StoreEntry[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    fetchStoreItems(controller.signal)
      .then((items) => setStore(items.filter(({ manifest }) => manifest.type === 'model')))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  const creators = maker === 'creators' && store.length > 0;
  const switchClass = (on: boolean) =>
    `flex-1 rounded-lg px-2 py-1 text-xs font-bold ${on ? 'bg-surface text-ink shadow' : 'text-ink/60'}`;
  return (
    <CatalogPanel
      title="Items"
      runtime={runtime}
      kind="item"
      entries={
        creators
          ? store.map(({ manifest, picture }) => ({
              id: manifest.id,
              name: manifest.name,
              Icon: itemIcon(manifest.id),
              picture,
            }))
          : CORE_ITEMS.filter((item) => item.group === group).map((item) => ({
              id: item.manifest.id,
              name: item.manifest.name,
              Icon: itemIcon(item.manifest.id),
            }))
      }
      selectedId={selectedId}
      onPick={(itemId) => {
        // Creator models start loading their package, so the ghost shows the real model.
        if (creators) runtime.current?.itemName(itemId);
        onPick(itemId);
      }}
      onClose={onClose}
      tabs={
        <>
          {store.length > 0 ? (
            <div role="group" aria-label="Made by" className="mb-2 flex gap-1 rounded-xl bg-paper p-1">
              <button
                type="button"
                aria-pressed={!creators}
                onClick={() => setMaker('genvr')}
                className={switchClass(!creators)}
              >
                Genvr
              </button>
              <button
                type="button"
                aria-pressed={creators}
                onClick={() => setMaker('creators')}
                className={switchClass(creators)}
              >
                Creators
              </button>
            </div>
          ) : null}
          {creators ? null : (
            <div className="mb-2 flex gap-1">
              {GROUPS.map((entry) => (
                <button
                  key={entry.group}
                  type="button"
                  onClick={() => setGroup(entry.group)}
                  className={`flex-1 rounded-xl px-2 py-1.5 text-xs font-bold ${
                    group === entry.group ? 'bg-ink text-on-brand' : 'text-ink/70 hover:bg-ink/5'
                  }`}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          )}
        </>
      }
      footer={
        selectedId ? (
          <button
            type="button"
            onClick={onTurn}
            className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-2xl bg-ink px-3 py-2 text-sm font-bold text-on-brand"
          >
            <RotateCw className="size-4" aria-hidden />
            Turn (R)
          </button>
        ) : null
      }
    />
  );
}

/** Kid-first build UI over the 3D view: tools, item library, brush options, selection actions. */
/**
 * The Real place tool (Map): find a real place and build it here. The phone shows it in a side sheet, the desktop
 * studio in the right dock (BUILD-B8). One undo step takes the whole build back.
 */
export function MapToolPanel({
  runtime,
  status,
  placeId,
}: {
  runtime: RefObject<GenvrRuntime | null>;
  status: ToolStatus;
  placeId: string;
}) {
  // The undo history size right after the last Map build: its Undo button takes back only that build.
  const mapBuildMark = useRef<number | null>(null);
  const rt = () => runtime.current;
  return (
    <RealPlacePanel
      placeId={placeId}
      placeSide={SIZE_TIERS[rt()?.world.sizeTier ?? 'small'].sideMeters}
      at={status.mapSpot ?? { x: 0, z: 0 }}
      onBuild={async (plan, _area, progress) => {
        const current = rt();
        if (!current) throw new Error('The place is not open.');
        // One undo step for the whole area, saved and shared like any other edit, applied in pieces so a big
        // area never freezes the studio (REAL-06). A build that is cancelled or fails keeps the mark of an
        // earlier build, which stays undoable.
        const mark = await applyMapBuild(current, plan.commands, {
          stage: buildStage,
          ...(progress ? { progress } : {}),
        });
        mapBuildMark.current = mark;
      }}
      onUndoBuild={() => {
        const current = rt();
        // An edit still open (a stroke, a drag) is closed first, so Undo never takes it back instead.
        if (current) closeOpenEdit(current);
        if (!current || mapBuildMark.current === null || current.undoMark() !== mapBuildMark.current)
          return 'Something else changed after the build. Use Undo at the top to step back.';
        mapBuildMark.current = null;
        return current.undo() ? null : 'The build could not be taken back.';
      }}
    />
  );
}

export function BuildPanel({
  runtime,
  status,
  leading,
  onChooseTool,
  studio = false,
  onTest,
  placeId,
  onAssistant,
  contextMenu = false,
}: {
  runtime: RefObject<GenvrRuntime | null>;
  status: ToolStatus;
  /** Desktop Build tab: right-click in the 3D view opens the selection menu (BUILD-B7). */
  contextMenu?: boolean;
  /** Shown first in the toolbar (the Avatar button). */
  leading?: ReactNode;
  /** Called when the player picks a tool (e.g. to close the avatar panel). */
  onChooseTool?: () => void;
  /**
   * Desktop studio (P3-06): tools and catalogs live in the studio's ribbon and sidebar, so only
   * the hints and the options of the active tool are shown over the 3D view.
   */
  studio?: boolean;
  /** Test the place as a player (hides the build tools until "Back to building"). */
  onTest?: () => void;
  /** The place being built: phones and tablets get the assistant in a side panel (P4-04). */
  placeId?: string;
  /** The assistant panel opened (the page closes the avatar panel). */
  onAssistant?: () => void;
}) {
  const [panelOpen, setPanelOpen] = useState(true);
  // Sky and weather bar (not a build tool: choices apply at once).
  const [skyOpen, setSkyOpen] = useState(false);
  // Assistant chat (the studio has it in its right dock; here it is a left side panel).
  const [assistantOpen, setAssistantOpen] = useState(false);
  const drawing =
    (status.tool === 'road' || status.tool === 'wall' || status.tool === 'river') && status.points > 0;
  const rt = () => runtime.current;
  const soilColors = SOIL_COLORS[rt()?.world.style.base ?? 'blocky'];

  let hint: string | null = status.tool ? (HINTS[status.tool] ?? null) : null;
  if (status.tool === 'place')
    hint = status.placeItemId ? 'Tap the ground to place it.' : 'Choose an item to place.';
  // The studio (mouse and keyboard) also has Shift for more items and a selection box.
  if (status.tool === 'select' && studio)
    hint = 'Click an item to select it. Shift-click adds more; Shift-drag draws a box.';
  if (status.tool === 'select' && status.moving) hint = 'Tap where it should go.';
  if (status.tool === 'select' && status.selected && !status.moving) hint = null;
  // The eraser names what a click takes away (BUILD-B8).
  if (status.tool === 'eraser' && status.eraseTarget) hint = `Remove: ${status.eraseTarget.name} · click`;
  // Drawing: how many points and how long so far (BUILD-B4).
  if (drawing) hint = `${status.points} point${status.points === 1 ? '' : 's'} · ${status.length ?? 0} m · ${hint ?? ''}`.replace(/ · $/, '');

  const chooseTool = (tool: BuildTool | null) => {
    if (tool === 'place' || tool === 'road') setPanelOpen(true);
    rt()?.setTool(tool);
    playSound('tap');
    setSkyOpen(false);
    setAssistantOpen(false);
    onChooseTool?.();
  };

  return (
    <>
      {status.tool === 'map' && placeId && !studio ? (
        <aside
          aria-label="Real place"
          className="pointer-events-auto absolute top-16 right-3 bottom-28 z-20 flex w-96 max-w-[calc(100vw-1.5rem)] flex-col rounded-3xl bg-surface/95 p-3 shadow-xl"
        >
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-base font-extrabold text-ink">Map</h2>
            <button
              type="button"
              onClick={() => chooseTool('select')}
              className="rounded-xl px-2 py-1 text-sm font-bold text-ink/70 hover:bg-ink/5"
            >
              Close
            </button>
          </div>
          <MapToolPanel runtime={runtime} status={status} placeId={placeId} />
        </aside>
      ) : null}
      {assistantOpen && placeId && !studio ? (
        <aside
          aria-label="Helper"
          className="pointer-events-auto absolute top-16 bottom-28 left-3 z-20 flex w-80 max-w-[calc(100vw-1.5rem)] flex-col rounded-3xl bg-surface/95 pt-3 shadow-xl"
        >
          <div className="mb-1 flex items-center justify-between px-3">
            <h2 className="text-base font-extrabold text-ink">Helper</h2>
            <button
              type="button"
              onClick={() => setAssistantOpen(false)}
              aria-label="Close the helper"
              className="rounded-xl p-1.5 text-ink/70 hover:bg-ink/5"
            >
              <PanelLeftClose className="size-5" aria-hidden />
            </button>
          </div>
          <AssistantPanel runtime={runtime} placeId={placeId} />
        </aside>
      ) : null}
      {status.tool === 'road' && panelOpen && !studio ? (
        <CatalogPanel
          title="Roads"
          runtime={runtime}
          kind="road"
          entries={roadTypesFor(rt()).map((type) => ({ id: type.id, name: type.name, Icon: Route }))}
          selectedId={status.roadType}
          onPick={(typeId) => rt()?.setRoadType(typeId)}
          onClose={() => setPanelOpen(false)}
        />
      ) : null}

      {!studio && status.tool === 'road' && getRoadType(status.roadType).look === 'street' ? (
        <RoadSettings road={status.road} onChange={(change) => rt()?.setRoad(change)} studio={studio} />
      ) : null}

      {!studio && status.tool === 'river' ? (
        <RiverSettings river={status.river} onChange={(change) => rt()?.setRiver(change)} studio={studio} />
      ) : null}

      {status.tool === 'place' && panelOpen && !studio ? (
        <ItemLibrary
          runtime={runtime}
          selectedId={status.placeItemId}
          onPick={(itemId) => rt()?.setPlaceItem(itemId)}
          onTurn={() => rt()?.rotateItem()}
          onClose={() => setPanelOpen(false)}
        />
      ) : null}

      {studio && contextMenu ? <BuildContextMenu runtime={runtime} status={status} /> : null}
      {studio && (status.message || hint) ? (
        <div className="pointer-events-none absolute top-3 left-3 z-10 max-w-[min(32rem,calc(100%-9rem))]">
          <div
            role="status"
            className={`rounded-xl px-3 py-1.5 text-xs font-bold shadow ${status.message ? 'bg-coral text-on-brand' : 'bg-surface/90 text-ink'}`}
          >
            {status.message ?? hint}
          </div>
        </div>
      ) : null}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 p-3">
        {studio ? null : status.message ? (
          <div className="rounded-2xl bg-coral px-4 py-2 text-sm font-bold text-on-brand shadow">
            {status.message}
          </div>
        ) : hint ? (
          <div className="max-w-md rounded-2xl bg-surface/90 px-4 py-2 text-center text-sm font-semibold text-ink shadow">
            {hint}
          </div>
        ) : null}

        {(status.tool === 'place' || (status.tool === 'road' && !drawing)) && !panelOpen && !studio ? (
          <div className="pointer-events-auto flex gap-2">
            <PillButton onClick={() => setPanelOpen(true)} Icon={status.tool === 'road' ? Route : Shapes}>
              {status.tool === 'road' ? 'Road types' : 'Open library'}
            </PillButton>
            {status.tool === 'place' && status.placeItemId ? (
              <PillButton onClick={() => rt()?.rotateItem()} Icon={RotateCw}>
                Turn
              </PillButton>
            ) : null}
          </div>
        ) : null}

        {drawing ? (
          <div className="pointer-events-auto flex flex-wrap justify-center gap-2">
            <PillButton
              onClick={() => rt()?.finishDrawing()}
              Icon={Check}
              tone="go"
              disabled={!status.canFinish}
            >
              Done
            </PillButton>
            <PillButton onClick={() => rt()?.removeLastPoint()} Icon={Delete}>
              Back a point
            </PillButton>
            <PillButton onClick={() => rt()?.cancelDrawing()} Icon={X}>
              Cancel
            </PillButton>
          </div>
        ) : null}

        {!studio && status.tool === 'cover' ? (
          <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1 rounded-3xl bg-surface/95 p-1.5 shadow-lg">
            {COVER_BRUSHES.map((entry) => {
              const selected = status.brush.cover === entry.cover;
              return (
                <button
                  key={entry.cover}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => rt()?.setBrush({ cover: entry.cover })}
                  className={`flex w-20 flex-col items-center rounded-2xl py-1.5 text-xs font-bold ${
                    selected ? 'bg-brand text-on-brand shadow' : 'text-ink hover:bg-ink/5'
                  }`}
                >
                  <entry.Icon className="my-0.5 size-5" aria-hidden />
                  {entry.label}
                </button>
              );
            })}
            <span className="mx-1 w-px self-stretch bg-ink/10" />
            {BRUSH_SIZES.map((entry) => (
              <button
                key={entry.size}
                type="button"
                aria-pressed={status.brush.size === entry.size}
                aria-label={`Brush size ${entry.size}`}
                onClick={() => rt()?.setBrush({ size: entry.size })}
                className={`size-10 rounded-full text-sm font-extrabold ${
                  status.brush.size === entry.size ? 'bg-ink text-on-brand' : 'bg-paper text-ink'
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>
        ) : null}

        {!studio && status.tool === 'terrain' ? (
          <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1 rounded-3xl bg-surface/95 p-1.5 shadow-lg">
            {BRUSH_MODES.map((entry) => {
              const selected = status.brush.mode === entry.mode;
              return (
                <button
                  key={entry.mode}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => rt()?.setBrush({ mode: entry.mode })}
                  className={`flex w-16 flex-col items-center rounded-2xl py-1.5 text-xs font-bold ${
                    selected ? 'bg-brand text-on-brand shadow' : 'text-ink hover:bg-ink/5'
                  }`}
                >
                  <entry.Icon className="my-0.5 size-5" aria-hidden />
                  {entry.label}
                </button>
              );
            })}
            <span className="mx-1 w-px self-stretch bg-ink/10" />
            {BRUSH_SIZES.map((entry) => (
              <button
                key={entry.size}
                type="button"
                aria-pressed={status.brush.size === entry.size}
                aria-label={`Brush size ${entry.size}`}
                onClick={() => rt()?.setBrush({ size: entry.size })}
                className={`size-10 rounded-full text-sm font-extrabold ${
                  status.brush.size === entry.size ? 'bg-ink text-on-brand' : 'bg-paper text-ink'
                }`}
              >
                {entry.label}
              </button>
            ))}
            {status.brush.mode === 'paint' && rt()?.world.style.base === 'realistic' ? (
              <>
                <span className="mx-1 w-px self-stretch bg-ink/10" />
                <GroundPicker
                  selected={status.brush.material?.id ?? null}
                  soil={status.brush.soil}
                  onPick={(name) => {
                    const material = getGround(name);
                    if (material) rt()?.setBrush({ soil: material.soil, material: groundRef(material) });
                  }}
                />
              </>
            ) : status.brush.mode === 'paint' ? (
              <>
                <span className="mx-1 w-px self-stretch bg-ink/10" />
                {SOILS.map((soil, index) => (
                  <button
                    key={soil}
                    type="button"
                    aria-pressed={status.brush.soil === soil}
                    aria-label={`Paint ${soil}`}
                    title={soil}
                    onClick={() => rt()?.setBrush({ soil })}
                    className={`size-9 rounded-full ring-2 ${
                      status.brush.soil === soil ? 'ring-ink ring-offset-2' : 'ring-ink/10'
                    }`}
                    style={{ backgroundColor: hex(soilColors[index] ?? 0) }}
                  />
                ))}
              </>
            ) : null}
          </div>
        ) : null}

        {!studio && status.tool === 'blocks' && status.blocks ? (
          <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1 rounded-3xl bg-surface/95 p-1.5 shadow-lg">
            {(
              [
                { mode: 'stack', Icon: Layers, label: 'Stack' },
                { mode: 'dig', Icon: Pickaxe, label: 'Dig' },
              ] as const
            ).map((entry) => {
              const selected = status.blocks?.mode === entry.mode;
              return (
                <button
                  key={entry.mode}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => rt()?.setBlockTool({ mode: entry.mode })}
                  className={`flex w-16 flex-col items-center rounded-2xl py-1.5 text-xs font-bold ${
                    selected ? 'bg-brand text-on-brand shadow' : 'text-ink hover:bg-ink/5'
                  }`}
                >
                  <entry.Icon className="my-0.5 size-5" aria-hidden />
                  {entry.label}
                </button>
              );
            })}
            {status.blocks.mode === 'stack' ? (
              <>
                <span className="mx-1 w-px self-stretch bg-ink/10" />
                {STACKABLE_BLOCKS.map((block) => (
                  <button
                    key={block}
                    type="button"
                    aria-pressed={status.blocks?.block === block}
                    aria-label={`Stack ${getBlock(block)?.manifest.name ?? block}`}
                    title={getBlock(block)?.manifest.name ?? block}
                    onClick={() => rt()?.setBlockTool({ block })}
                    className={`size-9 rounded-lg ring-2 ${
                      status.blocks?.block === block ? 'ring-ink ring-offset-2' : 'ring-ink/10'
                    }`}
                    style={{ backgroundColor: blockColor(block) }}
                  />
                ))}
              </>
            ) : null}
          </div>
        ) : null}

        {status.tool === 'select' && status.selected && !status.moving && !studio ? (
          <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-2">
            <span className="rounded-2xl bg-brand px-3 py-2.5 text-sm font-extrabold text-on-brand shadow">
              {status.selected.name}
            </span>
            <PillButton onClick={() => rt()?.rotateItem()} Icon={RotateCw}>
              Turn
            </PillButton>
            <PillButton onClick={() => rt()?.moveItem()} Icon={Move}>
              Move
            </PillButton>
            <PillButton onClick={() => rt()?.duplicateItem()} Icon={Copy}>
              Copy
            </PillButton>
            <PillButton onClick={() => rt()?.rowItems(4)} Icon={Columns3}>
              Row of 4
            </PillButton>
            <PillButton onClick={() => rt()?.deleteItem()} Icon={Trash} tone="danger">
              Delete
            </PillButton>
          </div>
        ) : null}

        {status.tool === 'select' && status.moving ? (
          <div className="pointer-events-auto flex gap-2">
            <PillButton onClick={() => rt()?.rotateItem()} Icon={RotateCw}>
              Turn
            </PillButton>
            <PillButton onClick={() => rt()?.cancelDrawing()} Icon={X}>
              Cancel
            </PillButton>
          </div>
        ) : null}

        {skyOpen && !studio ? <EnvironmentPicker runtime={runtime} variant="pills" /> : null}

        {studio ? null : (
          <div
            role="toolbar"
            aria-label="Build tools"
            className="scroll-row pointer-events-auto flex max-w-full gap-1 overflow-x-auto rounded-3xl bg-surface/90 p-1.5 shadow-lg"
          >
            {leading ? (
              <>
                {leading}
                <span className="mx-1 w-px shrink-0 self-stretch bg-ink/10" />
              </>
            ) : null}
            {placeId ? (
              <button
                type="button"
                aria-pressed={assistantOpen}
                onClick={() => {
                  if (!assistantOpen) {
                    rt()?.setTool(null);
                    setSkyOpen(false);
                    onAssistant?.();
                  }
                  setAssistantOpen(!assistantOpen);
                }}
                className={`flex w-16 shrink-0 flex-col items-center rounded-2xl py-1.5 text-xs font-bold transition ${
                  assistantOpen ? 'bg-brand text-on-brand shadow' : 'text-ink hover:bg-ink/5'
                }`}
              >
                <Sparkles className="my-1 size-6" strokeWidth={2.2} aria-hidden />
                Helper
              </button>
            ) : null}
            {toolsFor(rt()).map((entry) => {
              const selected = entry.tool === status.tool;
              return (
                <button
                  key={entry.label}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => chooseTool(entry.tool)}
                  className={`flex w-16 shrink-0 flex-col items-center rounded-2xl py-1.5 text-xs font-bold transition ${
                    selected ? 'bg-brand text-on-brand shadow' : 'text-ink hover:bg-ink/5'
                  }`}
                >
                  <entry.Icon className="my-1 size-6" strokeWidth={2.2} aria-hidden />
                  {entry.label}
                </button>
              );
            })}
            <button
              type="button"
              aria-pressed={skyOpen}
              onClick={() => {
                if (!skyOpen) rt()?.setTool(null);
                setSkyOpen(!skyOpen);
              }}
              className={`flex w-16 shrink-0 flex-col items-center rounded-2xl py-1.5 text-xs font-bold transition ${
                skyOpen ? 'bg-brand text-on-brand shadow' : 'text-ink hover:bg-ink/5'
              }`}
            >
              <CloudSun className="my-1 size-6" strokeWidth={2.2} aria-hidden />
              Sky
            </button>
            {onTest ? (
              <button
                type="button"
                onClick={onTest}
                className="flex w-16 shrink-0 flex-col items-center rounded-2xl py-1.5 text-xs font-bold text-ink transition hover:bg-ink/5"
              >
                <Play className="my-1 size-6" strokeWidth={2.2} aria-hidden />
                Test
              </button>
            ) : null}
            <span className="mx-1 w-px shrink-0 self-stretch bg-ink/10" />
            <button
              type="button"
              onClick={() => rt()?.undo()}
              className="flex w-14 shrink-0 flex-col items-center rounded-2xl py-1.5 text-xs font-bold text-ink hover:bg-ink/5"
            >
              <Undo2 className="my-1 size-6" strokeWidth={2.2} aria-hidden />
              Undo
            </button>
            <button
              type="button"
              onClick={() => rt()?.redo()}
              className="flex w-14 shrink-0 flex-col items-center rounded-2xl py-1.5 text-xs font-bold text-ink hover:bg-ink/5"
            >
              <Redo2 className="my-1 size-6" strokeWidth={2.2} aria-hidden />
              Redo
            </button>
          </div>
        )}
      </div>
    </>
  );
}

/** Groups of the ground picker, in the order a builder looks for them. */
const GROUND_GROUPS: Array<{ kind: GroundKind; label: string }> = [
  { kind: 'grass', label: 'Grass' },
  { kind: 'ground', label: 'Ground' },
  { kind: 'sand', label: 'Sand' },
  { kind: 'rock', label: 'Rock' },
  { kind: 'snow', label: 'Snow' },
  { kind: 'road', label: 'Roads' },
  { kind: 'bricks', label: 'Bricks' },
];

/**
 * Realistic ground materials for the paint brush (P2-37): one button with the chosen material's
 * picture; it opens the materials from the library, grouped and searchable.
 */
export function GroundPicker({
  selected,
  soil,
  onPick,
}: {
  selected: string | null;
  soil: (typeof SOILS)[number];
  onPick: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const current = (selected ? getGround(selected) : undefined) ?? getGround(DEFAULT_GROUND[soil]);
  const words = query.trim().toLowerCase();
  const matches = GROUND_MATERIALS.filter(
    (material) =>
      !words || `${material.manifest.name} ${material.kind} ${material.soil}`.toLowerCase().includes(words),
  );
  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-label={`Ground material: ${current?.manifest.name ?? soil}. Choose another`}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-2xl py-1 pr-3 pl-1 text-xs font-bold text-ink hover:bg-ink/5"
      >
        {current ? (
          <img src={current.picture} alt="" className="size-9 rounded-xl object-cover ring-1 ring-ink/10" />
        ) : null}
        <span className="max-w-24 truncate">{current?.manifest.name ?? soil}</span>
      </button>
      {open ? (
        <button
          type="button"
          aria-label="Close ground materials"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 cursor-default"
        />
      ) : null}
      {open ? (
        <div
          role="dialog"
          aria-label="Ground materials"
          className="fixed top-1/2 left-1/2 z-40 flex max-h-[min(28rem,calc(100dvh-2rem))] w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-2 rounded-3xl bg-surface p-3 shadow-xl"
        >
          <label className="flex items-center gap-2 rounded-2xl bg-paper px-3 py-2 text-sm text-ink">
            <Search className="size-4 text-ink/50" aria-hidden />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find grass, rock, snow..."
              className="w-full bg-transparent outline-none"
            />
          </label>
          <div className="flex flex-col gap-3 overflow-y-auto [scrollbar-width:none]">
            {GROUND_GROUPS.map(({ kind, label }) => {
              const list = matches.filter((material) => material.kind === kind);
              if (!list.length) return null;
              return (
                <section key={kind} className="flex flex-col gap-1.5">
                  <h3 className="text-xs font-bold text-ink/60">{label}</h3>
                  <div className="grid grid-cols-4 gap-1.5">
                    {list.map((material) => {
                      const chosen = material.name === current?.name;
                      return (
                        <button
                          key={material.name}
                          type="button"
                          aria-pressed={chosen}
                          title={material.manifest.name}
                          onClick={() => {
                            onPick(material.name);
                            setOpen(false);
                            playSound('tap');
                          }}
                          className={`flex flex-col items-center gap-1 rounded-xl p-1 text-[10px] font-semibold text-ink ${
                            chosen ? 'bg-ink/10 ring-2 ring-ink' : 'hover:bg-ink/5'
                          }`}
                        >
                          <img
                            src={material.picture}
                            alt=""
                            loading="lazy"
                            className="aspect-square w-full rounded-lg object-cover"
                          />
                          <span className="w-full truncate text-center">{material.manifest.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
            {matches.length === 0 ? (
              <p className="py-4 text-center text-sm text-ink/60">No ground matches.</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * What the river tool draws (P2-39). Width matters most and is not only a look: depth follows
 * from it, and swimming starts at 1.1 m, so a river narrower than about 11 m is waded rather
 * than swum and its current carries nobody. The panel says so rather than leaving it a surprise.
 */
/** From this width a river is deep enough to swim in, so its current carries players (P2-39). */
export const SWIMMABLE_WIDTH = 11;

/** Lanes and direction of the streets the road tool draws (R2g): lane lines are painted from them. */
export function RoadSettings({
  road,
  onChange,
  studio,
}: {
  road: RoadToolSettings;
  onChange: (change: Partial<RoadToolSettings>) => void;
  studio?: boolean;
}) {
  const choice = (selected: boolean) =>
    `rounded-lg px-2 py-1 text-xs font-bold ${selected ? 'bg-ink text-surface' : 'bg-ink/5 text-ink/70 hover:bg-ink/10'}`;
  return (
    <div
      className={`pointer-events-auto flex w-56 max-w-[70vw] flex-col gap-2 rounded-2xl bg-surface/95 p-3 shadow-lg ${
        studio ? '' : 'absolute top-16 left-3'
      }`}
    >
      <h3 className="text-[11px] font-black tracking-wide text-ink/50 uppercase">Size</h3>
      <label className="flex flex-col gap-1 text-xs font-bold text-ink/70">
        <span className="flex justify-between gap-3">
          Width<span className="text-ink">{road.width ? `${road.width} m` : 'Auto'}</span>
        </span>
        <input
          type="range"
          aria-label="Road width"
          min={1}
          max={16}
          step={0.5}
          value={road.width ?? 1}
          onChange={(event) => {
            const value = Number(event.target.value);
            onChange({ width: value < 2 ? undefined : value });
          }}
          className="accent-ink"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-bold text-ink/70">
        <span className="flex justify-between gap-3">
          Sidewalk<span className="text-ink">{road.sidewalk ? `${road.sidewalk} m` : 'None'}</span>
        </span>
        <input
          type="range"
          aria-label="Sidewalk"
          min={0}
          max={6}
          step={0.5}
          value={road.sidewalk ?? 0}
          onChange={(event) => {
            const value = Number(event.target.value);
            onChange({ sidewalk: value < 0.5 ? undefined : value });
          }}
          className="accent-ink"
        />
      </label>
      {road.sidewalk ? (
        <div className="flex gap-1" role="group" aria-label="Sidewalk sides">
          {(['both', 'left', 'right'] as const).map((side) => (
            <button
              key={side}
              type="button"
              aria-pressed={(road.sidewalkSide ?? 'both') === side}
              onClick={() => onChange({ sidewalkSide: side })}
              className={`${choice((road.sidewalkSide ?? 'both') === side)} capitalize`}
            >
              {side}
            </button>
          ))}
        </div>
      ) : null}
      <h3 className="text-[11px] font-black tracking-wide text-ink/50 uppercase">Street</h3>
      <div className="flex flex-col gap-1 text-xs font-bold text-ink/70">
        Lanes
        <div className="flex flex-wrap gap-1" role="group" aria-label="Lanes">
          {[undefined, 1, 2, 3, 4, 6].map((lanes) => (
            <button
              key={lanes ?? 'auto'}
              type="button"
              aria-pressed={road.lanes === lanes}
              onClick={() => onChange({ lanes })}
              className={choice(road.lanes === lanes)}
            >
              {lanes ?? 'Auto'}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1 text-xs font-bold text-ink/70">
        Traffic
        <div className="flex gap-1" role="group" aria-label="Traffic">
          <button type="button" aria-pressed={!road.oneway} onClick={() => onChange({ oneway: false })} className={choice(!road.oneway)}>
            Both ways
          </button>
          <button type="button" aria-pressed={road.oneway} onClick={() => onChange({ oneway: true })} className={choice(road.oneway)}>
            One way
          </button>
        </div>
      </div>
    </div>
  );
}

export function RiverSettings({
  river,
  onChange,
  studio,
}: {
  river: RiverToolSettings;
  onChange: (change: Partial<RiverToolSettings>) => void;
  studio?: boolean;
}) {
  const [draft, setDraft] = useState<Partial<RiverToolSettings>>({});
  const shown = { ...river, ...draft };
  const commit = (key: keyof RiverToolSettings) => () => {
    const value = draft[key];
    if (value !== undefined && value !== river[key]) onChange({ [key]: value });
    setDraft((current) => ({ ...current, [key]: undefined }));
  };
  const slider = (
    key: keyof RiverToolSettings,
    label: string,
    value: string,
    min: number,
    max: number,
    step: number,
  ) => (
    <label className="flex flex-col gap-1 text-xs font-bold text-ink/70">
      <span className="flex justify-between gap-3">
        {label}
        <span className="text-ink">{value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={shown[key]}
        onChange={(event) => setDraft((c) => ({ ...c, [key]: Number(event.target.value) }))}
        onPointerUp={commit(key)}
        onKeyUp={commit(key)}
        onBlur={commit(key)}
        className="accent-ink"
      />
    </label>
  );
  return (
    <div
      className={`pointer-events-auto flex w-56 max-w-[70vw] flex-col gap-2 overflow-y-auto rounded-2xl bg-surface/95 p-3 shadow-lg ${
        // Clear of the logo and chat button in the top-left corner, and never taller than the
        // room left above the tool bar on a phone held sideways.
        studio ? '' : 'absolute top-16 left-3 max-h-[44vh]'
      }`}
    >
      <h3 className="text-[11px] font-black tracking-wide text-ink/50 uppercase">River</h3>
      {/* Width is not only a look: depth follows from it, and swimming starts at 1.1 m, so the
          answer a builder needs sits on the slider itself rather than in a paragraph under it. */}
      {slider(
        'width',
        'Width',
        `${shown.width} m · ${shown.width >= SWIMMABLE_WIDTH ? 'swim' : 'wade'}`,
        2,
        40,
        1,
      )}
      {slider('widen', 'Wider downstream', `${Math.round((shown.widen - 1) * 100)}%`, 1, 2, 0.1)}
      {slider('flow', 'Current', shown.flow < 1 ? 'Slow' : shown.flow < 3 ? 'Normal' : 'Fast', 0, 6, 0.5)}
    </div>
  );
}
