'use client';

import type { PointerEvent as ReactPointerEvent } from 'react';

/**
 * Drag handle between studio panels. `edge` says which side the panel is on: dragging away from
 * the 3D view makes the panel smaller.
 */
export function Splitter({
  area,
  edge,
  size,
  limits,
  onResize,
}: {
  area: string;
  edge: 'left' | 'right' | 'bottom';
  size: number;
  limits: readonly [number, number];
  onResize: (size: number) => void;
}) {
  const vertical = edge !== 'bottom';
  const start = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const origin = vertical ? event.clientX : event.clientY;
    const from = size;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const move = (next: PointerEvent) => {
      const delta = (vertical ? next.clientX : next.clientY) - origin;
      const signed = edge === 'left' ? delta : -delta;
      onResize(Math.round(Math.min(limits[1], Math.max(limits[0], from + signed))));
    };
    const end = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', end);
      target.removeEventListener('pointercancel', end);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
  };
  return (
    <div
      role="separator"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      aria-label="Drag to resize"
      onPointerDown={start}
      style={{ gridArea: area }}
      className={`relative z-10 bg-ink/5 transition-colors after:absolute hover:bg-ink/20 ${
        vertical
          ? 'cursor-col-resize after:inset-y-0 after:-right-1 after:-left-1'
          : 'cursor-row-resize after:inset-x-0 after:-top-1 after:-bottom-1'
      }`}
    />
  );
}
