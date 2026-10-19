'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A number you drag to change (design rule 5): the label sits inside the field; drag left / right to change it
 * (Shift for big steps), click to type, Enter or leaving the field commits. `commit` runs once per change, so one
 * drag is one undo step.
 */
export function DragNumber({ label, value, commit, min = -Infinity, max = Infinity, step = 0.1, unit, disabled, title, width = 'w-24' }: {
  label: string; value: number; commit: (value: number) => void; min?: number; max?: number; step?: number; unit?: string; disabled?: boolean; title?: string; width?: string;
}) {
  const [draft, setDraft] = useState<number | null>(null), [typing, setTyping] = useState(false);
  const drag = useRef<{ x: number; start: number; moved: boolean } | null>(null);
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  const shown = draft ?? value, digits = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  useEffect(() => { if (!typing) setDraft(null); }, [value, typing]);
  if (typing) return <label className={`inline-flex h-8 items-center gap-1.5 rounded-md border border-ink/30 bg-paper px-2 ${width}`}>
    <b className="text-[9px] font-semibold uppercase tracking-wide text-ink/50">{label}</b>
    <input aria-label={label} autoFocus type="number" min={Number.isFinite(min) ? min : undefined} max={Number.isFinite(max) ? max : undefined} step={step}
      defaultValue={Number(value.toFixed(digits))} className="w-full min-w-0 bg-transparent font-mono text-xs outline-none"
      onBlur={(e) => { setTyping(false); const v = Number(e.target.value); if (Number.isFinite(v) && clamp(v) !== value) commit(clamp(v)); }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setTyping(false); } }} />
  </label>;
  return <button type="button" role="spinbutton" aria-label={label} aria-valuenow={value} aria-valuemin={Number.isFinite(min) ? min : undefined} aria-valuemax={Number.isFinite(max) ? max : undefined}
    disabled={disabled} title={title ?? `${label}: drag to change (Shift = big steps), click to type`}
    className={`inline-flex h-8 cursor-ew-resize touch-none select-none items-center gap-1.5 rounded-md border border-ink/10 bg-paper px-2 text-left disabled:opacity-35 ${width}`}
    onPointerDown={(e) => { if (disabled) return; e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, start: value, moved: false }; }}
    onPointerMove={(e) => { const d = drag.current; if (!d) return; const dx = e.clientX - d.x; if (Math.abs(dx) > 2) d.moved = true;
      if (d.moved) setDraft(clamp(d.start + Math.round(dx / 4) * step * (e.shiftKey ? 10 : 1))); }}
    onPointerUp={() => { const d = drag.current; drag.current = null; if (!d) return;
      if (!d.moved) { setTyping(true); return; } if (draft !== null && draft !== value) commit(draft); setDraft(null); }}
    onKeyDown={(e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); commit(clamp(value + step * (e.shiftKey ? 10 : 1))); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); commit(clamp(value - step * (e.shiftKey ? 10 : 1))); }
      if (e.key === 'Enter') setTyping(true); }}>
    <b className="text-[9px] font-semibold uppercase tracking-wide text-ink/50">{label}</b>
    <span className="ml-auto font-mono text-xs">{shown.toFixed(digits)}{unit ? <span className="text-ink/50"> {unit}</span> : null}</span>
  </button>;
}
