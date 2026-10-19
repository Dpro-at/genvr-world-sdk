'use client';

import type { GenvrRuntime } from '@genvr/runtime';
import { MousePointer2 } from 'lucide-react';
import { useEffect, useState, type RefObject } from 'react';

/**
 * What the right dock shows on Build and Items when nothing is selected (WORLD-W7, owner rule: no empty panel):
 * the place in numbers, its checks, and how to select — instead of only "Nothing selected".
 */
export function PlaceSummary({ runtime }: { runtime: RefObject<GenvrRuntime | null> }) {
  const [, redraw] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => redraw((n) => n + 1), 1500);
    return () => window.clearInterval(timer);
  }, []);
  const rt = runtime.current;
  if (!rt) return null;
  const world = rt.world;
  let warnings = 0;
  try {
    warnings = rt.checkWorld().findings.filter((finding) => finding.level === 'warning').length;
  } catch {
    warnings = 0;
  }
  const kinds = new Set(world.instances.map((i) => i.itemId)).size;
  const roadMetres = Math.round(world.roads.reduce((sum, road) => sum + road.points.reduce((len, p, i) => (i ? len + Math.hypot(p[0] - road.points[i - 1]![0], p[1] - road.points[i - 1]![1]) : 0), 0), 0));
  const openings = world.walls.reduce((sum, wall) => sum + wall.openings.length, 0);
  const rows: Array<[string, string]> = [
    ['Items', `${world.instances.length}${kinds ? ` · ${kinds} kinds` : ''}`],
    ['Roads', world.roads.length ? `${world.roads.length} · ${roadMetres} m` : 'None'],
    ['Walls', world.walls.length ? `${world.walls.length}${openings ? ` · ${openings} doors and windows` : ''}` : 'None'],
    ['Water', `${world.environment.water.length + world.environment.rivers.length ? `${world.environment.water.length} lakes · ${world.environment.rivers.length} rivers` : 'None'}${world.environment.sea ? ' · sea' : ''}`],
    ['Groups', world.groups.length ? `${world.groups.length}` : 'None'],
    ['Checks', warnings ? `${warnings} to look at (Debug › Checks)` : 'No problems'],
  ];
  return (
    <div className="flex flex-col gap-3 text-ink" aria-label="Place summary">
      <div>
        <b className="block text-sm">This place</b>
        <span className="block text-[11px] text-ink/55">Nothing is selected · the place in numbers</span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
        {rows.map(([key, value]) => (
          <div key={key} className="contents">
            <dt className="text-ink/55">{key}</dt>
            <dd className={`font-semibold ${key === 'Checks' && warnings ? 'text-coral' : ''}`}>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-[11px] leading-relaxed text-ink/55">Click an item in the view or in the Explorer to change it. Shift adds more; Shift-drag draws a box.</p>
      <button
        type="button"
        onClick={() => rt.setTool('select')}
        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-paper px-2.5 py-1.5 text-sm font-bold hover:bg-ink/10"
      >
        <MousePointer2 className="size-4" aria-hidden />
        Select tool (V)
      </button>
    </div>
  );
}
