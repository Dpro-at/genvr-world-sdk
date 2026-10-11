'use client';

import type { GenvrRuntime } from '@genvr/runtime';
import { useEffect, useState, type RefObject } from 'react';

/**
 * Frame rate counter and the builders' developer console while playing (P3-21 settings):
 * read from `runtime.stats()` twice a second. The desktop studio has its own console.
 */
export function PlayStats({
  runtime,
  showFps,
  console: showConsole,
  backend,
  room,
}: {
  runtime: RefObject<GenvrRuntime | null>;
  showFps: boolean;
  console: boolean;
  backend: string | null;
  room: { state: string; players: number } | null;
}) {
  const [stats, setStats] = useState<ReturnType<GenvrRuntime['stats']> | null>(null);
  const on = showFps || showConsole;

  useEffect(() => {
    if (!on) return;
    const read = () => setStats(runtime.current?.stats() ?? null);
    read();
    const timer = window.setInterval(read, 500);
    return () => window.clearInterval(timer);
  }, [on, runtime]);

  if (!on || !stats) return null;
  if (!showConsole) {
    return (
      <p
        aria-label="Frame rate"
        className="pointer-events-none absolute top-3 right-3 z-20 rounded-lg bg-ink/70 px-2 py-1 font-mono text-xs font-bold text-on-brand"
      >
        {stats.fps} FPS
      </p>
    );
  }
  const rows: Array<[string, string]> = [
    ['Frame rate', `${stats.fps} FPS`],
    ['Draw calls', String(stats.drawCalls)],
    ['Triangles', stats.triangles.toLocaleString('en')],
    ['Objects', String(stats.objects)],
    ['Graphics', backend ?? '...'],
    ['Room', room ? `${room.state}, ${room.players} here` : 'alone'],
  ];
  return (
    <dl
      aria-label="Developer console"
      className="pointer-events-none absolute top-3 right-3 z-20 grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 rounded-xl bg-ink/75 px-3 py-2 font-mono text-[11px] text-on-brand"
    >
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="opacity-60">{label}</dt>
          <dd className="text-right font-bold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
