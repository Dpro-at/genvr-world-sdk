'use client';

import type { GenvrRuntime } from '@genvr/runtime';
import { Camera } from 'lucide-react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { api, errorMessage } from '../../lib/api';

/**
 * "Take a picture of this view" (owner): saves the studio's current 3D view, without build
 * helpers, as the place thumbnail or a screenshot. Like uploaded pictures, it waits for review
 * before players see it.
 */
export function CaptureButton({
  runtime,
  placeId,
}: {
  runtime: RefObject<GenvrRuntime | null>;
  placeId: string;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);

  const take = async (kind: 'thumbnail' | 'screenshot') => {
    const rt = runtime.current;
    if (!rt) return;
    setBusy(true);
    setMessage(null);
    const data = rt.capture();
    const { error } = await api.POST('/v1/experiences/{id}/images', {
      params: { path: { id: placeId } },
      body: { kind, data },
    });
    setBusy(false);
    setMessage(
      error
        ? errorMessage(error)
        : kind === 'thumbnail'
          ? 'Saved as the thumbnail. Players see it after review.'
          : 'Added as a screenshot. Players see it after review.',
    );
  };

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          setMessage(null);
        }}
        aria-expanded={open}
        aria-label="Take a picture of this view"
        title="Take a picture of this view"
        className={`flex size-8 items-center justify-center rounded-lg ${open ? 'bg-ink/10 text-ink' : 'text-ink/70 hover:bg-ink/5 hover:text-ink'}`}
      >
        <Camera className="size-4" aria-hidden />
      </button>
      {open ? (
        <div className="absolute top-10 right-0 z-30 flex w-64 flex-col gap-1.5 rounded-2xl bg-surface p-3 shadow-xl ring-1 ring-ink/10">
          <p className="text-sm font-black">Picture of this view</p>
          <p className="text-xs text-ink/60">Turn the camera first. Selection and handles are left out.</p>
          {(
            [
              ['thumbnail', 'Use as thumbnail'],
              ['screenshot', 'Add as screenshot'],
            ] as const
          ).map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              disabled={busy}
              onClick={() => void take(kind)}
              className="rounded-lg bg-paper px-3 py-2 text-left text-sm font-bold text-ink hover:bg-ink/10 disabled:opacity-50"
            >
              {busy ? 'Saving…' : label}
            </button>
          ))}
          {message ? <p className="text-xs font-bold text-ink/70">{message}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
