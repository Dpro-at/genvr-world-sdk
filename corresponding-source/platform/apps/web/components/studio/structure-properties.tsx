'use client';

import type { GenvrRuntime } from '@genvr/runtime';
import { getRoadType } from '@genvr/core-library';
import { WALL_SURFACES } from '@genvr/runtime';
import { DoorOpen, Grid2x2, Trash, X } from 'lucide-react';
import { useEffect, useState, type RefObject } from 'react';
import { setStructureFocus, type StructureFocus } from '../../lib/structure-focus';

const length = (points: ReadonlyArray<readonly [number, number]>, closed = false) => {
  let sum = 0;
  for (let i = 1; i < points.length; i++) sum += Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]);
  if (closed && points.length > 2) sum += Math.hypot(points[0]![0] - points.at(-1)![0], points[0]![1] - points.at(-1)![1]);
  return Math.round(sum * 10) / 10;
};

/**
 * A road or a wall picked in the Explorer (BUILD-B7): its name, what it is, its doors and windows, and Remove. Every
 * change is a world command, so Undo takes it back. Roads cannot change width after drawing yet (no command).
 */
export function StructureProperties({ runtime, focus }: { runtime: RefObject<GenvrRuntime | null>; focus: NonNullable<StructureFocus> }) {
  const [, redraw] = useState(0);
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => {
    const timer = window.setInterval(() => redraw((n) => n + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => setDraft(null), [focus.kind, focus.id]);
  const rt = runtime.current;
  if (!rt) return null;
  const road = focus.kind === 'road' ? rt.world.roads.find((r) => r.id === focus.id) : undefined;
  const wall = focus.kind === 'wall' ? rt.world.walls.find((w) => w.id === focus.id) : undefined;
  if (!road && !wall) {
    return (
      <p className="text-sm text-ink/60">
        That {focus.kind} is gone.{' '}
        <button type="button" className="font-bold underline" onClick={() => setStructureFocus(null)}>
          Close
        </button>
      </p>
    );
  }
  const name = road?.name ?? wall?.name ?? '';
  const fallback = road ? getRoadType(road.materialId ?? '').name : wall?.closed ? 'Room' : 'Wall';
  const look = wall ? (Object.entries(WALL_SURFACES).find(([, id]) => id === wall.materialId)?.[0] ?? (wall.building ? `house · ${wall.building.facade ?? 'plaster'}` : 'plaster')) : '';
  const apply = (command: Parameters<GenvrRuntime['applyBatch']>[0][number]) => {
    rt.applyBatch([command]);
    redraw((n) => n + 1);
  };
  const commit = () => {
    if (draft === null) return;
    const next = draft.trim();
    apply({ type: 'rename', params: { kind: focus.kind, id: focus.id, name: next ? next.slice(0, 64) : null } });
    setDraft(null);
  };
  const facts: Array<[string, string]> = road
    ? [
        ['Kind', fallback],
        ['Width', `${road.width} m`],
        ['Length', `${length(road.points)} m`],
        ...(road.lanes ? ([['Lanes', `${road.lanes}${road.oneway ? ' · one way' : ''}`]] as Array<[string, string]>) : []),
        ...(road.sidewalk ? ([['Sidewalk', `${road.sidewalk} m · ${road.sidewalkSide ?? 'both'}`]] as Array<[string, string]>) : []),
      ]
    : [
        ['Kind', wall!.closed ? 'Room' : 'Wall'],
        ['Height', `${wall!.height} m`],
        ['Length', `${length(wall!.points, wall!.closed)} m`],
        ['Look', look],
      ];
  return (
    <div className="flex flex-col gap-3 text-ink">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-[11px] font-black tracking-wide text-ink/50 uppercase">{focus.kind === 'road' ? 'Road' : 'Wall'}</span>
        <button type="button" aria-label="Close" title="Close" onClick={() => setStructureFocus(null)} className="rounded-lg p-1 text-ink/60 hover:bg-ink/10">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <label className="flex flex-col gap-1 text-xs font-bold text-ink/70">
        Name
        <input
          aria-label="Name"
          value={draft ?? name}
          placeholder={fallback}
          maxLength={64}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit();
            if (event.key === 'Escape') setDraft(null);
          }}
          className="rounded-lg bg-paper px-2.5 py-1.5 text-sm font-semibold text-ink ring-1 ring-ink/10 outline-none focus:ring-ink/40"
        />
      </label>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        {facts.map(([key, value]) => (
          <div key={key} className="contents">
            <dt className="text-ink/55">{key}</dt>
            <dd className="font-semibold">{value.charAt(0).toUpperCase() + value.slice(1)}</dd>
          </div>
        ))}
      </dl>
      {wall ? (
        <section className="flex flex-col gap-1">
          <h3 className="text-[11px] font-black tracking-wide text-ink/50 uppercase">Doors and windows · {wall.openings.length}</h3>
          {wall.openings.length === 0 ? <p className="text-xs text-ink/55">Use the Door or Window tool and click this wall.</p> : null}
          {wall.openings.map((opening) => (
            <div key={opening.id} className="flex items-center gap-2 rounded-lg bg-paper px-2 py-1 text-xs">
              {opening.kind === 'door' ? <DoorOpen className="size-3.5" aria-hidden /> : <Grid2x2 className="size-3.5" aria-hidden />}
              <span className="flex-1 capitalize">
                {opening.kind} · {opening.width} × {opening.height} m
              </span>
              <button
                type="button"
                aria-label={`Remove this ${opening.kind}`}
                title="Remove"
                onClick={() => apply({ type: 'remove_wall_opening', params: { wallId: wall.id, openingId: opening.id } })}
                className="rounded p-1 text-ink/60 hover:bg-ink/10"
              >
                <Trash className="size-3.5" aria-hidden />
              </button>
            </div>
          ))}
        </section>
      ) : null}
      <button
        type="button"
        onClick={() => {
          apply(road ? { type: 'remove_road', params: { roadId: road.id } } : { type: 'remove_wall', params: { wallId: wall!.id } });
          setStructureFocus(null);
        }}
        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-coral/10 py-1.5 text-sm font-bold text-coral hover:bg-coral/20"
      >
        <Trash className="size-4" aria-hidden />
        Remove
      </button>
    </div>
  );
}
