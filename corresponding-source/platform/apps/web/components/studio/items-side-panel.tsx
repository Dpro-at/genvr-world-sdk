'use client';

import { CORE_SURFACES, getCoreItem, getGround, getOceanResource, itemModelLook, priceLabel, type LibraryEntry } from '@genvr/core-library';
import type { GenvrRuntime, ToolStatus } from '@genvr/runtime';
import { Box, RotateCw, Square, X } from 'lucide-react';
import type { RefObject } from 'react';
import { kindName, setLibraryDetails, STYLE_NAMES, useLibraryDetails } from '../../lib/library-details';
import { isStoreEntry } from '../../lib/store-items';
import { useStructureFocus } from '../../lib/structure-focus';
import { LibraryPicture } from './library-panel';
import { OriginLine } from './free-sources';
import { OceanResourceControls } from './ocean-resource-controls';
import { PALETTE, PropertiesPanel } from './properties-panel';
import { OPTION_TOOLS, ToolOptionsPanel } from './tool-options-panel';

type Style = 'blocky' | 'realistic' | 'anime' | 'voxel';
const label = 'text-[11px] font-black tracking-wide text-ink/50 uppercase';

/** Facts of a library item in plain words (ITEMS-I7). */
function Facts({ entry, style }: { entry: LibraryEntry; style: Style }) {
  const { manifest } = entry;
  const core = getCoreItem(manifest.id);
  const look = core ? itemModelLook(core, style) : null;
  const ground = getGround(manifest.id);
  const rows: Array<[string, string]> = [
    ['Kind', `${kindName(manifest.subcategory)}`],
    ['Price', priceLabel(manifest)],
    ['Made by', manifest.author.name],
    ['Styles', manifest.styles.map((one) => STYLE_NAMES[one] ?? one).join(', ')],
    ...(look ? ([['Size', look.model.levels.map((level) => `${level.triangles.toLocaleString()} tri · ${(level.bytes / 1e6).toFixed(1)} MB`).join(' / ')]] as Array<[string, string]>) : []),
    ...(ground ? ([['Size', ground.files.map((files) => `${files.size}: ${(files.bytes / 1e6).toFixed(1)} MB`).join(', ')]] as Array<[string, string]>) : []),
  ];
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
      {rows.map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="text-ink/55">{key}</dt>
          <dd className="min-w-0 font-semibold">{value}</dd>
        </div>
      ))}
      {manifest.origin ? <OriginLine origin={manifest.origin} /> : null}
      {isStoreEntry(entry) && entry.caption ? <dd className="col-span-2 mt-1 line-clamp-3 text-ink/70">{entry.caption}</dd> : null}
    </dl>
  );
}

/** The item being placed (ITEMS-I1): what the next click puts down, and Stop. */
function PlacingPanel({ runtime, status, entry, style }: { runtime: RefObject<GenvrRuntime | null>; status: ToolStatus; entry: LibraryEntry | null; style: Style }) {
  const rt = runtime.current;
  if (!rt || !status.placeItemId) return null;
  const place = status.place ?? { turn: 0 };
  const name = entry?.manifest.name ?? rt.itemName(status.placeItemId);
  return (
    <div className="flex flex-col gap-3 px-3 pb-3 text-ink" aria-label="Placing">
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-paper"><Box className="size-4" aria-hidden /></span>
        <span className="min-w-0 flex-1">
          <b className="block truncate text-sm">Placing: {name}</b>
          <span className="block text-[11px] text-ink/55">Click the ground · R turns · Esc stops</span>
        </span>
      </div>
      {entry ? (
        <div className="flex gap-2 rounded-xl border border-ink/10 p-2">
          <div className="shrink-0 overflow-hidden rounded-lg bg-paper"><LibraryPicture entry={entry} runtime={runtime} style={style} selected={false} /></div>
          <Facts entry={entry} style={style} />
        </div>
      ) : null}
      <h3 className={label}>Before you place it</h3>
      <div className="flex items-end gap-2">
        <label className="flex flex-1 flex-col gap-1 text-xs font-bold text-ink/70">
          <span className="flex justify-between">Turn<span className="text-ink tabular-nums">{place.turn}°</span></span>
          <input type="range" aria-label="Turn" min={0} max={345} step={15} value={place.turn} onChange={(event) => rt.setPlaceOptions({ turn: Number(event.target.value) })} className="accent-ink" />
        </label>
        <button type="button" aria-label="Turn by the snap step (R)" title="Turn (R)" onClick={() => rt.rotateItem()} className="rounded-lg bg-paper p-2 hover:bg-ink/10">
          <RotateCw className="size-4" aria-hidden />
        </button>
      </div>
      <label className="flex flex-col gap-1 text-xs font-bold text-ink/70">
        <span className="flex justify-between">Size<span className="text-ink tabular-nums">{Math.round((place.size ?? 1) * 100)}%</span></span>
        <input type="range" aria-label="Size" min={20} max={400} step={10} value={Math.round((place.size ?? 1) * 100)} onChange={(event) => rt.setPlaceOptions({ size: Number(event.target.value) / 100 })} className="accent-ink" />
      </label>
      <section className="flex flex-col gap-1.5">
        <h3 className={label}>Colour</h3>
        <div className="grid grid-cols-7 gap-1.5">
          <button type="button" aria-pressed={!place.color} onClick={() => rt.setPlaceOptions({ color: null })} title="Its own colour" className={`flex aspect-square items-center justify-center rounded-md bg-paper text-[9px] font-bold ${!place.color ? 'ring-2 ring-ink' : 'ring-1 ring-ink/15'}`}>Own</button>
          {PALETTE.map((swatch) => (
            <button key={swatch} type="button" aria-label={`Colour ${swatch}`} aria-pressed={place.color === swatch} onClick={() => rt.setPlaceOptions({ color: swatch })}
              className={`aspect-square rounded-md ${place.color === swatch ? 'ring-2 ring-ink' : 'ring-1 ring-ink/15'}`} style={{ backgroundColor: swatch }} />
          ))}
        </div>
      </section>
      <section className="flex flex-col gap-1.5">
        <h3 className={label}>Material</h3>
        <div className="grid grid-cols-3 gap-1.5">
          {CORE_SURFACES.map((surface) => {
            const on = (place.material ?? 'plastic') === surface.key;
            return (
              <button key={surface.key} type="button" aria-pressed={on} onClick={() => rt.setPlaceOptions({ material: surface.key === 'plastic' ? null : surface.key })}
                className={`rounded-md py-1.5 text-[11px] font-bold ${on ? 'bg-ink text-on-brand' : 'bg-paper text-ink hover:bg-ink/10'}`}>
                {surface.manifest.name}
              </button>
            );
          })}
        </div>
      </section>
      <p className="text-[11px] text-ink/55">Each click places one more with these settings. It rests on the ground, a floor or another item; Snap is in the top bar.</p>
      <button type="button" onClick={() => rt.setTool('select')} className="flex items-center justify-center gap-1.5 rounded-lg bg-paper py-2 text-sm font-bold hover:bg-ink/10">
        <Square className="size-3.5" aria-hidden />
        Stop placing
      </button>
    </div>
  );
}

/** A library item picked that is not being placed (an ocean, the sky, a move): its details (ITEMS-I7). */
function DetailsPanel({ runtime, entry, style }: { runtime: RefObject<GenvrRuntime | null>; entry: LibraryEntry; style: Style }) {
  const ocean = getOceanResource(entry.manifest.id);
  const placeable = entry.manifest.type === 'model' && !ocean;
  return (
    <div className="flex flex-col gap-3 px-3 pb-3 text-ink" aria-label="Item details">
      <div className="flex items-center gap-2">
        <b className="min-w-0 flex-1 truncate text-sm">{entry.manifest.name}</b>
        <button type="button" aria-label="Close details" title="Close" onClick={() => setLibraryDetails(null)} className="rounded-lg p-1 text-ink/60 hover:bg-ink/10">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <div className="flex justify-center rounded-xl bg-paper p-2"><LibraryPicture entry={entry} runtime={runtime} style={style} selected={false} large /></div>
      <Facts entry={entry} style={style} />
      {placeable ? (
        <button type="button" onClick={() => { runtime.current?.setTool('place'); runtime.current?.setPlaceItem(entry.manifest.id); }} className="flex items-center justify-center gap-1.5 rounded-lg bg-ink py-2 text-sm font-bold text-on-brand">
          <Box className="size-4" aria-hidden />
          Place it
        </button>
      ) : null}
      {ocean ? <OceanResourceControls key={entry.manifest.id} runtime={runtime} resource={ocean} /> : null}
    </div>
  );
}

/**
 * The right dock on Items (ITEMS-I1, I6, I7): the Tool options of a tool started from the library, the Placing panel
 * while an item waits for a click, an item's details, or Properties as on Build.
 */
export function ItemsSidePanel({
  runtime,
  status,
  placeId,
  grid,
  angle,
  style,
  savePlaceId,
}: {
  runtime: RefObject<GenvrRuntime | null>;
  status: ToolStatus;
  placeId?: string | undefined;
  /** The place an owner on the platform may save items from (Save item in Properties). */
  savePlaceId?: string | undefined;
  grid: number;
  angle: number;
  style: Style;
}) {
  const details = useLibraryDetails();
  const structure = useStructureFocus();
  if (status.tool && OPTION_TOOLS.has(status.tool)) return <ToolOptionsPanel runtime={runtime} status={status} placeId={placeId} />;
  if (status.tool === 'place' && status.placeItemId)
    return <PlacingPanel runtime={runtime} status={status} entry={details?.manifest.id === status.placeItemId ? details : null} style={style} />;
  if (!status.selected && !status.water && !structure && details) return <DetailsPanel runtime={runtime} entry={details} style={style} />;
  return (
    <div className="px-3 pb-3">
      <PropertiesPanel placeId={savePlaceId} runtime={runtime} status={status} grid={grid} angle={angle} />
    </div>
  );
}
