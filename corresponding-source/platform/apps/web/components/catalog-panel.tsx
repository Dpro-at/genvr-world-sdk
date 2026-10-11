'use client';

import type { GenvrRuntime } from '@genvr/runtime';
import { PanelLeftClose, type LucideIcon } from 'lucide-react';
import { useEffect, useState, type ReactNode, type RefObject } from 'react';

export interface CatalogEntry {
  id: string;
  name: string;
  /** Shown until the engine-rendered preview is ready (or if it fails). */
  Icon: LucideIcon;
  /** A stored picture (creator items, P1-08) instead of an engine-rendered preview. */
  picture?: string | null;
}

/** Engine-rendered picture of a catalog entry, with the icon as a placeholder. */
export function Preview({
  runtime,
  kind,
  entry,
  selected,
  large = false,
}: {
  runtime: RefObject<GenvrRuntime | null>;
  kind: 'item' | 'road';
  entry: CatalogEntry;
  selected: boolean;
  /** Bigger picture (studio details). */
  large?: boolean;
}) {
  const [url, setUrl] = useState<string | null>(entry.picture ?? null);
  // A stored picture that fails to load (e.g. an old signed link) gives way to the engine's.
  const [pictureFailed, setPictureFailed] = useState(false);
  const stored = entry.picture && !pictureFailed ? entry.picture : null;
  useEffect(() => {
    let alive = true;
    // Creator items bring their picture from item analysis; the engine draws Core items, roads,
    // and creator items without a picture (from their package, P1-08).
    if (stored) {
      setUrl(stored);
      return;
    }
    setUrl(null);
    runtime.current
      ?.preview(kind, entry.id)
      .then((value) => {
        if (alive) setUrl(value);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [runtime, kind, entry.id, stored]);
  // A plain img: the source is a data URL rendered by the engine or a signed storage link.
  const size = large ? 'size-40' : 'size-20';
  if (url)
    return (
      <img
        src={url}
        alt=""
        className={`${size} rounded-xl object-contain`}
        draggable={false}
        onError={() => {
          if (url === entry.picture) setPictureFailed(true);
        }}
      />
    );
  return (
    <span className={`flex ${size} items-center justify-center`}>
      <entry.Icon
        className={`size-8 ${selected ? 'text-on-brand' : 'text-ink/60'}`}
        strokeWidth={1.8}
        aria-hidden
      />
    </span>
  );
}

/**
 * Left side panel for choosing from a catalog (items, road types, later materials): each entry
 * shows a 3D preview rendered by the engine, so players see it before placing it.
 */
export function CatalogPanel({
  title,
  runtime,
  kind,
  entries,
  selectedId,
  onPick,
  onClose,
  tabs,
  footer,
}: {
  title: string;
  runtime: RefObject<GenvrRuntime | null>;
  kind: 'item' | 'road';
  entries: CatalogEntry[];
  selectedId: string | null;
  onPick: (id: string) => void;
  onClose: () => void;
  tabs?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <aside
      aria-label={title}
      className="pointer-events-auto absolute top-16 bottom-28 left-3 flex w-64 max-w-[70vw] flex-col rounded-3xl bg-surface/95 p-3 shadow-xl"
    >
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-base font-extrabold text-ink">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${title.toLowerCase()}`}
          className="rounded-xl p-1.5 text-ink/70 hover:bg-ink/5"
        >
          <PanelLeftClose className="size-5" aria-hidden />
        </button>
      </div>
      {tabs}
      <div className="grid flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto pr-1">
        {entries.map((entry) => {
          const selected = selectedId === entry.id;
          return (
            <button
              key={entry.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onPick(entry.id)}
              className={`flex flex-col items-center gap-1 rounded-2xl px-1 pt-1 pb-2 text-xs font-bold transition ${
                selected ? 'bg-brand text-on-brand shadow' : 'bg-paper text-ink hover:bg-ink/5'
              }`}
            >
              <Preview runtime={runtime} kind={kind} entry={entry} selected={selected} />
              <span className="text-center leading-tight">{entry.name}</span>
            </button>
          );
        })}
      </div>
      {footer}
    </aside>
  );
}
