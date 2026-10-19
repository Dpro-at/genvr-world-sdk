'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { LucideIcon } from 'lucide-react';

/** One item of a right-click / ⋯ menu (board 30): most used first, danger last in red, keys on the right. */
export type MenuItem = { label: string; icon: LucideIcon; run: () => void; keys?: string; danger?: boolean; disabled?: boolean; why?: string } | 'divider';

/**
 * The menu right-click and the ⋯ button open (design rule 11: both show the same menu). Closes on Esc, a click
 * outside, or after an item runs.
 */
export function ContextMenu({ at, items, close, title }: { at: { x: number; y: number }; items: MenuItem[]; close: () => void; title?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const outside = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) close(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', esc);
    ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', esc); };
  }, [close]);
  const x = Math.min(at.x, window.innerWidth - 230), y = Math.min(at.y, window.innerHeight - 40 - items.length * 30);
  return createPortal(<div ref={ref} role="menu" className="fixed z-[100] w-56 rounded-lg border border-ink/15 bg-surface p-1 text-ink shadow-2xl" style={{ left: Math.max(4, x), top: Math.max(4, y) }}>
    {title ? <div className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink/50">{title}</div> : null}
    {items.map((item, i) => item === 'divider' ? <hr key={i} className="my-1 border-ink/10" />
      : <button key={i} type="button" role="menuitem" disabled={item.disabled} title={item.disabled ? item.why : undefined}
        className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-ink/10 focus:bg-ink/10 focus:outline-none disabled:opacity-35 ${item.danger ? 'text-red-500' : ''}`}
        onClick={() => { close(); item.run(); }}><item.icon className="size-3.5" />{item.label}{item.keys ? <kbd className="ml-auto font-mono text-[10px] text-ink/45">{item.keys}</kbd> : null}</button>)}
  </div>, document.body);
}
