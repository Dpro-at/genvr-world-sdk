'use client';

import { Check, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

/** The steps of entering a place, in order. */
export const LOADING_STEPS = [
  'Checking the way in',
  'Downloading the world',
  'Starting 3D',
  'Finding a room',
] as const;

const TIPS = [
  'Press 1 to 8 to dance, wave, and cheer.',
  'Press / to chat with everyone here.',
  'Press C to sit on a bench.',
  'Press Esc for the menu.',
  'Tap Avatar to see all your moves.',
];

/**
 * Stage 1 of entering a place (task P3-18, docs/PLAYER-UI.md section 1): the platform's own
 * screen with the place, its creator, and the real loading steps. Stage 2 (the place's own
 * loading screen from its GUI kit) comes with P9-04.
 */
export function LoadingScreen({
  placeId,
  title,
  creator,
  step,
  error,
}: {
  placeId: string;
  title: string | null;
  creator: string | null;
  /** Index into LOADING_STEPS of the step in progress. */
  step: number;
  error: string | null;
}) {
  const [tip, setTip] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setTip((current) => (current + 1) % TIPS.length), 3500);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute inset-0 z-40 flex items-center justify-center bg-paper p-4"
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-[2rem] border border-ink/10 bg-surface p-6 text-center text-ink shadow-2xl">
        {/* Three blocks that keep stacking: the world is being built. */}
        <div className="flex h-20 items-end gap-1.5" aria-hidden>
          {['bg-ink', 'bg-ink/60', 'bg-ink/30'].map((color, index) => (
            <span
              key={color}
              className={`size-8 rounded-xl ${color} shadow-[inset_0_-5px_0_0_rgba(0,0,0,0.15)] ${
                error ? '' : 'animate-bounce'
              }`}
              style={{ animationDelay: `${index * 150}ms` }}
            />
          ))}
        </div>
        <div>
          <h1 className="text-2xl leading-tight font-black">{title ?? 'Opening the place'}</h1>
          {creator ? <p className="text-sm font-bold text-ink/50">by {creator}</p> : null}
        </div>

        {error ? (
          <>
            <p className="font-bold text-coral">{error}</p>
            <Link
              href={title ? `/places/${placeId}` : '/'}
              className="rounded-2xl bg-brand px-5 py-3 font-bold text-on-brand shadow"
            >
              {title ? 'Back to the place' : 'Back home'}
            </Link>
          </>
        ) : (
          <>
            <ol className="flex w-full flex-col gap-1.5 text-left">
              {LOADING_STEPS.map((label, index) => (
                <li
                  key={label}
                  className={`flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-bold ${
                    index === step ? 'bg-brand/10 text-ink' : index < step ? 'text-ink/60' : 'text-ink/30'
                  }`}
                >
                  {index < step ? (
                    <Check className="size-4 text-mint" strokeWidth={3} aria-hidden />
                  ) : index === step ? (
                    <Loader2 className="size-4 animate-spin text-brand" aria-hidden />
                  ) : (
                    <span className="size-4 rounded-full border-2 border-ink/20" aria-hidden />
                  )}
                  {label}
                </li>
              ))}
            </ol>
            <div className="h-2 w-full overflow-hidden rounded-full bg-ink/10">
              <div
                className="h-full rounded-full bg-brand transition-[width] duration-500"
                style={{ width: `${((step + 0.5) / LOADING_STEPS.length) * 100}%` }}
              />
            </div>
            <p className="text-xs font-semibold text-ink/50">Tip: {TIPS[tip]}</p>
          </>
        )}
      </div>
    </div>
  );
}
