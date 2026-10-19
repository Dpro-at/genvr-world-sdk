'use client';

import { getGround, groundRef } from '@genvr/core-library';
import {
  BRUSH_RADIUS,
  SOIL_COLORS,
  STACKABLE_BLOCKS,
  type BuildTool,
  type GenvrRuntime,
  type ToolStatus,
  WALL_SURFACES,
  type WallSurface,
} from '@genvr/runtime';
import { getBlock } from '@genvr/core-library';

import { DoorOpen, Grid2x2, Layers, MousePointer2, Pickaxe, RotateCcw } from 'lucide-react';
import type { RefObject } from 'react';
import {
  blockColor,
  BRUSH_MODES,
  BRUSH_SIZES,
  COVER_BRUSHES,
  GroundPicker,
  hex,
  MapToolPanel,
  RiverSettings,
  RoadSettings,
  roadTypesFor,
  SOILS,
  TOOLS,
} from '../build-panel';

/** Tools whose options live in the right dock (BUILD-B1): everything except Select, which shows Properties. */
export const OPTION_TOOLS = new Set<BuildTool>(['terrain', 'cover', 'water', 'river', 'road', 'wall', 'door', 'window', 'eraser', 'blocks', 'map']);

const SUBTITLE: Partial<Record<BuildTool, string>> = {
  terrain: 'Drag on the ground',
  cover: 'Say what grows on the ground',
  water: 'Tap a hole to fill it, or flat ground to dig a pond',
  river: 'Click points; it runs downhill',
  road: 'Click points; Done or the last point finishes',
  wall: 'Click corners; the first corner closes a room',
  door: 'Click a wall',
  window: 'Click a wall',
  eraser: 'Click what you want to remove',
  blocks: 'Click a block; drag for a row or a floor',
  map: 'Build a real place here',
};

const label = 'text-[11px] font-black tracking-wide text-ink/50 uppercase';
const tile = (on: boolean) =>
  `flex flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-bold ${on ? 'bg-ink text-on-brand' : 'bg-paper text-ink hover:bg-ink/10'}`;
const chip = (on: boolean) =>
  `rounded-lg px-2.5 py-1.5 text-xs font-bold ${on ? 'bg-ink text-on-brand' : 'bg-paper text-ink/75 hover:bg-ink/10'}`;

const WALL_LOOKS: Array<{ id: WallSurface | null; name: string }> = [
  { id: null, name: 'Plaster' },
  { id: 'brick', name: 'Brick' },
  { id: 'old-brick', name: 'Old brick' },
  { id: 'yellow-brick', name: 'Yellow brick' },
  { id: 'stone', name: 'Stone' },
  { id: 'old-stone', name: 'Old stone' },
  { id: 'concrete', name: 'Concrete' },
  { id: 'wood', name: 'Wood' },
];

/** A labelled range with its value, applied while dragging (cheap settings only). */
function Range({
  name,
  value,
  shown,
  min,
  max,
  step,
  onChange,
}: {
  name: string;
  value: number;
  shown: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-bold text-ink/70">
      <span className="flex justify-between gap-3">
        {name}
        <span className="text-ink tabular-nums">{shown}</span>
      </span>
      <input
        type="range"
        aria-label={name}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="accent-ink"
      />
    </label>
  );
}

/** Size in metres (1–100, as agents send it) with the S / M / L presets, and the strength of one stroke. */
function BrushFields({ status, runtime, strength = true }: { status: ToolStatus; runtime: GenvrRuntime; strength?: boolean }) {
  const radius = status.brush.radius ?? BRUSH_RADIUS[status.brush.size];
  return (
    <section className="flex flex-col gap-2">
      <h3 className={label}>Brush</h3>
      <div className="flex gap-1" role="group" aria-label="Brush size preset">
        {BRUSH_SIZES.map((entry) => (
          <button
            key={entry.size}
            type="button"
            aria-pressed={status.brush.radius === undefined && status.brush.size === entry.size}
            aria-label={`Brush size ${entry.size}`}
            title={`${BRUSH_RADIUS[entry.size]} m`}
            onClick={() => runtime.setBrush({ size: entry.size })}
            className={`${chip(status.brush.radius === undefined && status.brush.size === entry.size)} flex-1`}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <Range name="Size" value={radius} shown={`${radius} m`} min={1} max={100} step={1} onChange={(value) => runtime.setBrush({ radius: value })} />
      {strength ? (
        <Range
          name="Strength"
          value={Math.round((status.brush.strength ?? 1) * 100)}
          shown={`${Math.round((status.brush.strength ?? 1) * 100)}%`}
          min={10}
          max={100}
          step={5}
          onChange={(value) => runtime.setBrush({ strength: value / 100 })}
        />
      ) : null}
    </section>
  );
}

/**
 * The right dock while a build tool is active (BUILD-B1–B8): every option of the tool that used to float over the
 * 3D view, plus the exact brush size and strength agents already had, road width and sidewalks, wall height and
 * look, door and window sizes, and the whole Map panel.
 */
export function ToolOptionsPanel({
  runtime,
  status,
  placeId,
}: {
  runtime: RefObject<GenvrRuntime | null>;
  status: ToolStatus;
  placeId?: string | undefined;
}) {
  const rt = runtime.current;
  const tool = status.tool;
  if (!rt || !tool) return null;
  const entry = TOOLS.find((one) => one.tool === tool);
  const Icon = entry?.Icon ?? MousePointer2;
  const soilColors = SOIL_COLORS[rt.world.style.base ?? 'blocky'];
  const wall = status.wall;

  return (
    <div className="flex flex-col gap-3 px-3 pb-3 text-ink" aria-label="Tool options">
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-paper">
          <Icon className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <b className="block text-sm">{entry?.label ?? tool}</b>
          <span className="block truncate text-[11px] text-ink/55">{SUBTITLE[tool]}</span>
        </span>
        <button
          type="button"
          aria-label="Back to Select"
          title="Back to Select (Esc)"
          onClick={() => rt.setTool('select')}
          className="rounded-lg p-1.5 text-ink/60 hover:bg-ink/10"
        >
          <MousePointer2 className="size-4" aria-hidden />
        </button>
      </div>

      {tool === 'terrain' ? (
        <>
          <div role="group" aria-label="Terrain mode" className="grid grid-cols-5 gap-1">
            {BRUSH_MODES.map((one) => (
              <button
                key={one.mode}
                type="button"
                aria-pressed={status.brush.mode === one.mode}
                onClick={() => rt.setBrush({ mode: one.mode })}
                className={tile(status.brush.mode === one.mode)}
              >
                <one.Icon className="size-4" aria-hidden />
                {one.label}
              </button>
            ))}
          </div>
          <BrushFields status={status} runtime={rt} strength={status.brush.mode !== 'paint'} />
          {status.brush.mode === 'paint' ? (
            <section className="flex flex-col gap-2">
              <h3 className={label}>Paint with</h3>
              {rt.world.style.base === 'realistic' ? (
                <GroundPicker
                  selected={status.brush.material?.id ?? null}
                  soil={status.brush.soil as (typeof SOILS)[number]}
                  onPick={(name) => {
                    const material = getGround(name);
                    if (material) rt.setBrush({ soil: material.soil, material: groundRef(material) });
                  }}
                />
              ) : (
                <div role="group" aria-label="Soil" className="flex flex-col gap-0.5">
                  {SOILS.map((soil, index) => (
                    <button
                      key={soil}
                      type="button"
                      aria-pressed={status.brush.soil === soil}
                      aria-label={`Paint ${soil}`}
                      onClick={() => rt.setBrush({ soil })}
                      className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-bold capitalize ${status.brush.soil === soil ? 'bg-ink/10 ring-1 ring-ink' : 'hover:bg-ink/5'}`}
                    >
                      <span className="size-5 rounded-md ring-1 ring-ink/10" style={{ backgroundColor: hex(soilColors[index] ?? 0) }} />
                      {soil}
                    </button>
                  ))}
                </div>
              )}
            </section>
          ) : null}
          <p className="text-[11px] text-ink/55">Right-drag turns the camera. Undo takes back a whole drag.</p>
        </>
      ) : null}

      {tool === 'cover' ? (
        <>
          <div role="group" aria-label="Cover" className="grid grid-cols-4 gap-1">
            {COVER_BRUSHES.map((one) => (
              <button
                key={one.cover}
                type="button"
                aria-pressed={status.brush.cover === one.cover}
                onClick={() => rt.setBrush({ cover: one.cover })}
                className={tile(status.brush.cover === one.cover)}
              >
                <one.Icon className="size-4" aria-hidden />
                {one.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-ink/55">Plants: trees and grass grow here · Clear: nothing grows · Let it grow: back to the place's own rule.</p>
          <BrushFields status={status} runtime={rt} strength={false} />
        </>
      ) : null}

      {tool === 'water' ? (
        <p className="text-xs text-ink/70">Tap a hole to fill it with water, or tap flat ground to dig a pond. Select a lake afterwards to change its level or remove it.</p>
      ) : null}

      {tool === 'river' ? (
        <>
          <RiverSettings river={status.river} onChange={(change) => rt.setRiver(change)} studio />
          <p className="text-[11px] text-ink/55">Select a river afterwards to change its width, widening and current.</p>
        </>
      ) : null}

      {tool === 'road' ? (
        <>
          <section className="flex flex-col gap-1">
            <h3 className={label}>Kind</h3>
            <div role="radiogroup" aria-label="Road kind" className="grid grid-cols-2 gap-1">
              {roadTypesFor(rt).map((type) => (
                <button
                  key={type.id}
                  type="button"
                  role="radio"
                  aria-checked={status.roadType === type.id}
                  onClick={() => rt.setRoadType(type.id)}
                  className={`${chip(status.roadType === type.id)} truncate text-left`}
                >
                  {type.name}
                </button>
              ))}
            </div>
          </section>
          <RoadSettings road={status.road} onChange={(change) => rt.setRoad(change)} studio />
        </>
      ) : null}

      {(tool === 'wall' || tool === 'door' || tool === 'window') && wall ? (
        <>
          {tool === 'wall' ? (
            <>
              <Range name="Height" value={wall.height} shown={`${wall.height} m`} min={0.5} max={12} step={0.5} onChange={(value) => rt.setWall({ height: value })} />
              <section className="flex flex-col gap-1">
                <h3 className={label}>Look</h3>
                <div role="radiogroup" aria-label="Wall look" className="grid grid-cols-4 gap-1.5">
                  {WALL_LOOKS.map((look) => {
                    const on = (wall.surface ?? null) === look.id;
                    const picture = look.id ? getGround(WALL_SURFACES[look.id])?.picture : undefined;
                    return (
                      <button
                        key={look.name}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        title={look.name}
                        onClick={() => rt.setWall({ surface: look.id ?? undefined })}
                        className={`flex flex-col items-center gap-1 rounded-lg p-1 text-[10px] font-semibold ${on ? 'bg-ink/10 ring-2 ring-ink' : 'hover:bg-ink/5'}`}
                      >
                        {picture ? (
                          <img src={picture} alt="" loading="lazy" className="aspect-square w-full rounded-md object-cover" />
                        ) : (
                          <span className="aspect-square w-full rounded-md bg-[#e8dfcf] ring-1 ring-ink/10" />
                        )}
                        <span className="w-full truncate text-center">{look.name}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
              <p className="text-[11px] text-ink/55">Click the first corner again to close a room with a floor. The same looks as the wall textures in Items.</p>
            </>
          ) : null}
          <section className="flex flex-col gap-2">
            <h3 className={label}>Openings · click a wall</h3>
            <div className="flex gap-1">
              <button type="button" aria-pressed={tool === 'door'} onClick={() => rt.setTool('door')} className={`${chip(tool === 'door')} flex flex-1 items-center justify-center gap-1.5`}>
                <DoorOpen className="size-3.5" aria-hidden />
                Door
              </button>
              <button type="button" aria-pressed={tool === 'window'} onClick={() => rt.setTool('window')} className={`${chip(tool === 'window')} flex flex-1 items-center justify-center gap-1.5`}>
                <Grid2x2 className="size-3.5" aria-hidden />
                Window
              </button>
            </div>
            {tool === 'window' ? (
              <>
                <Range name="Window width" value={wall.window.width} shown={`${wall.window.width} m`} min={0.4} max={6} step={0.1} onChange={(value) => rt.setWall({ window: { ...wall.window, width: value } })} />
                <Range name="Window height" value={wall.window.height} shown={`${wall.window.height} m`} min={0.4} max={6} step={0.1} onChange={(value) => rt.setWall({ window: { ...wall.window, height: value } })} />
                <Range name="Above the floor" value={wall.window.bottom} shown={`${wall.window.bottom} m`} min={0} max={6} step={0.1} onChange={(value) => rt.setWall({ window: { ...wall.window, bottom: value } })} />
              </>
            ) : (
              <>
                <Range name="Door width" value={wall.door.width} shown={`${wall.door.width} m`} min={0.4} max={6} step={0.1} onChange={(value) => rt.setWall({ door: { ...wall.door, width: value } })} />
                <Range name="Door height" value={wall.door.height} shown={`${wall.door.height} m`} min={0.4} max={6} step={0.1} onChange={(value) => rt.setWall({ door: { ...wall.door, height: value } })} />
              </>
            )}
          </section>
        </>
      ) : null}

      {tool === 'eraser' ? (
        <div className="flex flex-col gap-2 text-xs">
          <p className="text-ink/70">Click an item, water, river, road or wall to remove it. Undo takes it back.</p>
          <p role="status" className="rounded-lg bg-paper px-2.5 py-2 font-bold">
            {status.eraseTarget ? `Under the pointer: ${status.eraseTarget.name}` : 'Point at something to see what goes.'}
          </p>
        </div>
      ) : null}

      {tool === 'blocks' && status.blocks ? (
        <>
          <div role="group" aria-label="Blocks mode" className="grid grid-cols-2 gap-1">
            {([
              { mode: 'stack', Icon: Layers, label: 'Stack' },
              { mode: 'dig', Icon: Pickaxe, label: 'Dig' },
            ] as const).map((one) => (
              <button
                key={one.mode}
                type="button"
                aria-pressed={status.blocks?.mode === one.mode}
                onClick={() => rt.setBlockTool({ mode: one.mode })}
                className={tile(status.blocks?.mode === one.mode)}
              >
                <one.Icon className="size-4" aria-hidden />
                {one.label}
              </button>
            ))}
          </div>
          {status.blocks.mode === 'stack' ? (
            <div role="group" aria-label="Block" className="grid grid-cols-6 gap-1.5">
              {STACKABLE_BLOCKS.map((block) => (
                <button
                  key={block}
                  type="button"
                  aria-pressed={status.blocks?.block === block}
                  aria-label={`Stack ${getBlock(block)?.manifest.name ?? block}`}
                  title={getBlock(block)?.manifest.name ?? block}
                  onClick={() => rt.setBlockTool({ block })}
                  className={`aspect-square rounded-lg ring-2 ${status.blocks?.block === block ? 'ring-ink ring-offset-2' : 'ring-ink/10'}`}
                  style={{ backgroundColor: blockColor(block) }}
                />
              ))}
            </div>
          ) : null}
        </>
      ) : null}

      {tool === 'map' ? (
        placeId ? (
          <MapToolPanel runtime={runtime} status={status} placeId={placeId} />
        ) : (
          <p className="text-xs text-ink/60">The Map needs a saved place.</p>
        )
      ) : null}

      {tool === 'terrain' || tool === 'cover' ? (
        <button
          type="button"
          onClick={() => rt.setBrush({ size: 'medium', strength: 1 })}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-paper py-1.5 text-xs font-bold hover:bg-ink/10"
        >
          <RotateCcw className="size-3.5" aria-hidden />
          Reset brush
        </button>
      ) : null}
    </div>
  );
}
