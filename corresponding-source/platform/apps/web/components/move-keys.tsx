'use client';

import { DEFAULT_FAVORITE_ANIMATIONS, findAnimation } from '@genvr/core-library';
import type { GenvrRuntime } from '@genvr/runtime';
import { useEffect, type RefObject } from 'react';

/** The move on a key 1–8: the place's made motion (board M19), else the player's favourite. */
export function moveForSlot(runtime: Pick<GenvrRuntime, 'moveSlot'> | null | undefined, slot: number): string | undefined {
  return runtime?.moveSlot?.(slot) ?? DEFAULT_FAVORITE_ANIMATIONS[slot - 1];
}

const typing = (target: EventTarget | null) => target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;

/**
 * Keys 1–8 and the move bar while testing or previewing a place (board M19): each key plays its move; a made motion
 * set on a key by the place shows its name and a "made" mark.
 */
export function MoveKeys({ runtime, made, active }: { runtime: RefObject<GenvrRuntime | null>; made: Readonly<Record<number, string>>; active: boolean }) {
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (typing(event.target) || event.ctrlKey || event.metaKey || event.altKey || document.querySelector('dialog[open]')) return;
      const slot = /^Digit([1-8])$/.exec(event.code);
      const id = slot ? moveForSlot(runtime.current, Number(slot[1])) : undefined;
      if (id) runtime.current?.playAnimation(id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, runtime]);
  if (!active) return null;
  return (
    <div role="toolbar" aria-label="Moves (keys 1–8)" className="pointer-events-auto absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 gap-1">
      {Array.from({ length: 8 }, (_, i) => i + 1).map((slot) => {
        const name = made[slot] ?? findAnimation(DEFAULT_FAVORITE_ANIMATIONS[slot - 1] ?? '')?.manifest.name ?? '';
        return (
          <button key={slot} type="button" title={`${name} (${slot})`} onClick={() => { const id = moveForSlot(runtime.current, slot); if (id) runtime.current?.playAnimation(id); }}
            className={`flex h-11 w-14 flex-col items-center justify-center rounded-lg text-[10px] font-bold ring-1 ${made[slot] ? 'bg-amber-500/25 ring-amber-500' : 'bg-surface/90 ring-ink/15'}`}>
            <span className="font-mono text-ink/60">{slot}</span><span className="max-w-full truncate px-1">{name || '·'}</span>
            {made[slot] ? <span className="text-[8px] text-amber-700 dark:text-amber-300">made</span> : null}
          </button>
        );
      })}
    </div>
  );
}
