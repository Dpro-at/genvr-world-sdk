'use client';

import type { GenvrRuntime } from '@genvr/runtime';
import { ArrowBigUp, FastForward, Zap } from 'lucide-react';
import { useEffect, useState, type RefObject } from 'react';
import { DownButton, RideButton, RideHint } from './ride-buttons';

/**
 * The Jump button on touch screens (which have no Space key), bottom right, and a Dash button
 * beside it in side-view places with the dash move (decision 95), and an Attack button above it
 * while a game tool is in hand (P9-12). Riding (movement modes): Ride or Get off above them, Down
 * beside Jump while steering an item in the air, and Jump held climbs; computers get a quiet E hint.
 * Sitting and other animations live in the player menu of the platform bar (docs/PLAYER-UI.md).
 */
export function PlayControls({
  runtime,
  raised,
  forceTouch = false,
  dash = false,
  attack = null,
  ride = null,
  down = false,
}: {
  runtime: RefObject<GenvrRuntime | null>;
  /** Leave room for the build toolbar. */
  raised: boolean;
  /** Studio device emulator: show touch controls even with a mouse. */
  forceTouch?: boolean;
  /** Show the Dash button. */
  dash?: boolean;
  /** Uses the game tool in hand, a strike (P9-12); null hides the Attack button. */
  attack?: (() => void) | null;
  /** Get on (an item is in reach) or off (riding); null hides the button. */
  ride?: { getOff: boolean; onPress: () => void } | null;
  /** Show the Down button (steering an item in the air). */
  down?: boolean;
}) {
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(pointer: coarse)');
    setTouch(query.matches);
    const onChange = (event: MediaQueryListEvent) => setTouch(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  const hold = (up: boolean) => runtime.current?.setRideButtons({ up });

  if (!touch && !forceTouch) return ride ? <RideHint getOff={ride.getOff} raised={raised} /> : null;
  return (
    <div
      className={`pointer-events-none absolute right-4 flex items-end gap-3 ${raised ? 'bottom-32' : 'bottom-6'}`}
    >
      {dash ? (
        <button
          type="button"
          aria-label="Dash"
          className="pointer-events-auto flex size-12 items-center justify-center rounded-full bg-surface/90 text-ink shadow-lg active:scale-95"
          onPointerDown={() => runtime.current?.dash()}
        >
          <FastForward className="size-6" aria-hidden />
        </button>
      ) : null}
      {down ? <DownButton runtime={runtime} /> : null}
      <div className="flex flex-col items-end gap-3">
        {ride ? <RideButton getOff={ride.getOff} onPress={ride.onPress} /> : null}
        {attack ? (
          <button
            type="button"
            aria-label="Attack"
            className="pointer-events-auto flex size-16 items-center justify-center rounded-full bg-surface/90 text-ink shadow-lg active:scale-95"
            onPointerDown={attack}
          >
            <Zap className="size-8" aria-hidden />
          </button>
        ) : null}
        <button
          type="button"
          aria-label="Jump"
          className="pointer-events-auto flex size-16 items-center justify-center rounded-full bg-brand text-on-brand shadow-lg active:scale-95"
          onPointerDown={() => {
            runtime.current?.jump();
            // Held while riding an item in the air, it climbs.
            hold(true);
          }}
          onPointerUp={() => hold(false)}
          onPointerCancel={() => hold(false)}
          onPointerLeave={() => hold(false)}
        >
          <ArrowBigUp className="size-8" aria-hidden />
        </button>
      </div>
    </div>
  );
}
