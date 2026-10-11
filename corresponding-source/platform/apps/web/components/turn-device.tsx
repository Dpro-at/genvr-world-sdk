'use client';

import type { PlayOrientation } from '@genvr/contracts';
import { Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';

type Lockable = ScreenOrientation & { lock?: (orientation: 'landscape' | 'portrait') => Promise<void> };

/**
 * Keeps a phone or tablet in the place's screen shape (P9-15): asks the device to lock the
 * orientation (works in the apps and in full screen), and otherwise covers the game with a
 * "turn your phone" note until the player turns it. Computers are never asked.
 */
export function TurnDeviceHint({ orientation }: { orientation: PlayOrientation }) {
  const [wrong, setWrong] = useState(false);

  useEffect(() => {
    if (orientation === 'any') {
      setWrong(false);
      return;
    }
    const touch = window.matchMedia('(pointer: coarse)');
    const portrait = window.matchMedia('(orientation: portrait)');
    const check = () => setWrong(touch.matches && portrait.matches !== (orientation === 'portrait'));
    check();
    portrait.addEventListener('change', check);
    // Browsers only lock in full screen or installed apps; elsewhere the note does the job.
    (screen.orientation as Lockable | undefined)?.lock?.(orientation).catch(() => undefined);
    return () => portrait.removeEventListener('change', check);
  }, [orientation]);

  if (!wrong) return null;
  return (
    <div
      role="alert"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-paper p-8 text-center text-ink"
    >
      <Smartphone
        className={`size-16 animate-pulse ${orientation === 'landscape' ? 'rotate-90' : ''} transition`}
        strokeWidth={1.5}
        aria-hidden
      />
      <p className="text-2xl font-black">
        Turn your {orientation === 'landscape' ? 'phone sideways' : 'phone upright'}
      </p>
      <p className="max-w-xs text-sm text-ink/60">
        This place is made for {orientation === 'landscape' ? 'a wide screen' : 'a tall screen'}.
      </p>
    </div>
  );
}
