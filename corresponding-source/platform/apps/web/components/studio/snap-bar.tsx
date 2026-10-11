'use client';

import { Grid3x3, RotateCw } from 'lucide-react';

const GRIDS: Array<[number, string]> = [
  [0, 'Free'],
  [0.25, '0.25 m'],
  [0.5, '0.5 m'],
  [1, '1 m'],
  [2, '2 m'],
];
const ANGLES = [15, 45, 90];

const select =
  'h-8 rounded-lg bg-paper px-1.5 text-xs font-bold text-ink outline-none focus:ring-2 focus:ring-ink/30';

/** Studio snapping (P3-24): grid step for placing and moving, turn step for rotating. */
export function SnapBar({
  grid,
  angle,
  onChange,
}: {
  grid: number;
  angle: number;
  onChange: (change: { snapGrid?: number; snapAngle?: number }) => void;
}) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Snapping">
      <label className="flex items-center gap-1" title="Grid step for placing and moving">
        <Grid3x3 className="size-4 text-ink/50" aria-hidden />
        <select
          aria-label="Grid step"
          value={grid}
          onChange={(event) => onChange({ snapGrid: Number(event.target.value) })}
          className={select}
        >
          {GRIDS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1" title="Turn step">
        <RotateCw className="size-4 text-ink/50" aria-hidden />
        <select
          aria-label="Turn step"
          value={angle}
          onChange={(event) => onChange({ snapAngle: Number(event.target.value) })}
          className={select}
        >
          {ANGLES.map((value) => (
            <option key={value} value={value}>
              {value}°
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
