'use client';

import type { GenvrRuntime } from '@genvr/runtime';
import { ArrowDown, Armchair, LogOut } from 'lucide-react';
import { useEffect, useState, type RefObject } from 'react';
import { rideButtons, type RidingView } from '../lib/ride-view';
import type { RideModel } from '@genvr/contracts';

/** How often the play screen asks the runtime what is in reach and what is ridden (ms). */
const POLL_MS = 200;

/**
 * What the ride buttons show (movement modes): read from the runtime a few times a second while
 * `on`, and only re-rendered when it changes.
 */
export function useRideButtons(runtime: RefObject<GenvrRuntime | null>, on: boolean) {
  const [state, setState] = useState<{
    riding: RidingView | null;
    inReach: { instanceId: string; model: RideModel } | null;
    divingAvailable?: boolean;
  }>({ riding: null, inReach: null });
  useEffect(() => {
    if (!on) {
      setState({ riding: null, inReach: null });
      return;
    }
    let key = '';
    const read = () => {
      const rt = runtime.current;
      const next = {
        riding: rt?.riding ?? null,
        inReach: rt?.rideableInReach() ?? null,
        divingAvailable: rt?.divingAvailable ?? false,
      };
      const nextKey = JSON.stringify(next);
      if (nextKey === key) return;
      key = nextKey;
      setState(next);
    };
    read();
    const timer = window.setInterval(read, POLL_MS);
    return () => window.clearInterval(timer);
  }, [runtime, on]);
  return { ...rideButtons(state), riding: state.riding };
}

const ROUND =
  'pointer-events-auto flex h-11 min-w-11 items-center justify-center gap-2 rounded-full bg-surface/90 px-4 text-sm font-bold text-ink shadow-lg active:scale-95';

/** Ride / Get off on touch screens (above the jump button): plain words with an icon. */
export function RideButton({ getOff, onPress }: { getOff: boolean; onPress: () => void }) {
  const Icon = getOff ? LogOut : Armchair;
  return (
    <button type="button" className={ROUND} onPointerDown={onPress}>
      <Icon className="size-5" aria-hidden />
      {getOff ? 'Get off' : 'Ride'}
    </button>
  );
}

/** Held descent while flying or free diving, next to the existing ascent/jump button. */
export function DownButton({ runtime }: { runtime: RefObject<GenvrRuntime | null> }) {
  const set = (down: boolean) => runtime.current?.setRideButtons({ descend: down });
  // Let go when the button goes away while held.
  useEffect(() => () => void runtime.current?.setRideButtons({ descend: false }), [runtime]);
  return (
    <button
      type="button"
      aria-label="Down"
      className="pointer-events-auto flex size-12 items-center justify-center rounded-full bg-surface/90 text-ink shadow-lg active:scale-95"
      onPointerDown={() => set(true)}
      onPointerUp={() => set(false)}
      onPointerCancel={() => set(false)}
      onPointerLeave={() => set(false)}
    >
      <ArrowDown className="size-6" aria-hidden />
    </button>
  );
}

/** Computers: a quiet hint which key gets on or off. */
export function RideHint({ getOff, raised }: { getOff: boolean; raised: boolean }) {
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 flex justify-center ${raised ? 'bottom-40' : 'bottom-24'}`}
    >
      <p className="flex items-center gap-2 rounded-2xl bg-ink/70 px-3 py-1.5 text-sm font-bold text-on-brand">
        <kbd className="rounded-md bg-paper px-1.5 font-mono text-xs text-ink">E</kbd>
        {getOff ? 'Get off' : 'Ride'}
      </p>
    </div>
  );
}
