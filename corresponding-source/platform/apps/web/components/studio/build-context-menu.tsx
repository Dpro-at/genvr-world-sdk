'use client';

import type { GenvrRuntime, ToolStatus } from '@genvr/runtime';
import { ArrowDownToLine, Columns3, Copy, Lock, LockOpen, MousePointer2, Move, Redo2, RotateCw, Trash, Undo2, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { setSelectionFlags } from './selection-actions';

type Entry = { label: string; Icon: LucideIcon; keys?: string; danger?: boolean; disabled?: boolean; run: () => void } | 'line';

/**
 * Right-click in the Build 3D view (BUILD-B7): the actions of the Properties panel for the selection, plus Undo and
 * Redo. A right-drag still turns the camera: the menu opens only when the pointer did not travel.
 */
export function BuildContextMenu({ runtime, status }: { runtime: RefObject<GenvrRuntime | null>; status: ToolStatus }) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const press = useRef<{ x: number; y: number } | null>(null);
  const menu = useRef<HTMLDivElement>(null);
  const live = useRef(status);
  live.current = status;

  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      if (event.button === 2) press.current = { x: event.clientX, y: event.clientY };
      else if (!menu.current?.contains(event.target as Node)) setAt(null);
    };
    const onMenu = (event: MouseEvent) => {
      if (event.defaultPrevented || !(event.target instanceof HTMLCanvasElement) || event.target.closest('[data-character-stage]')) return;
      const tool = live.current.tool;
      // The blocks way digs with the right button (ITEMS-I3): no browser menu there.
      if (tool === 'blocks') {
        event.preventDefault();
        return;
      }
      if (tool && tool !== 'select') return;
      const start = press.current;
      press.current = null;
      if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return;
      event.preventDefault();
      setAt({ x: event.clientX, y: event.clientY });
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAt(null);
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('contextmenu', onMenu);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('contextmenu', onMenu);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  useEffect(() => {
    if (at) menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [at]);

  const rt = runtime.current;
  if (!at || !rt) return null;
  const selection = status.selected;
  const locked = selection ? selection.instanceIds.every((id) => rt.world.instances.find((i) => i.instanceId === id)?.locked) : false;
  const many = (selection?.instanceIds.length ?? 0) > 1;
  const entries: Entry[] = selection
    ? [
        { label: 'Move', Icon: Move, disabled: locked || many, run: () => rt.moveItem() },
        { label: 'Turn', Icon: RotateCw, keys: 'R', disabled: locked, run: () => rt.rotateItem() },
        { label: 'Copy', Icon: Copy, disabled: locked || many, run: () => rt.duplicateItem() },
        { label: 'Row of 4', Icon: Columns3, disabled: locked || many, run: () => rt.rowItems(4) },
        'line',
        { label: locked ? 'Unlock' : 'Lock', Icon: locked ? LockOpen : Lock, run: () => setSelectionFlags(rt, selection, { locked: !locked }) },
        { label: many ? 'Let them fall' : 'Let it fall', Icon: ArrowDownToLine, disabled: locked, run: () => rt.settleItems(selection.instanceIds) },
        { label: 'Delete', Icon: Trash, keys: 'Del', danger: true, disabled: locked, run: () => rt.deleteItem() },
        'line',
        { label: 'Undo', Icon: Undo2, keys: 'Ctrl+Z', run: () => rt.undo() },
        { label: 'Redo', Icon: Redo2, keys: 'Ctrl+Y', run: () => rt.redo() },
      ]
    : [
        ...(status.tool !== 'select' ? [{ label: 'Select tool', Icon: MousePointer2, keys: 'V', run: () => rt.setTool('select') }] : []),
        { label: 'Undo', Icon: Undo2, keys: 'Ctrl+Z', run: () => rt.undo() },
        { label: 'Redo', Icon: Redo2, keys: 'Ctrl+Y', run: () => rt.redo() },
      ];

  return (
    <div
      ref={menu}
      role="menu"
      aria-label={selection ? 'Selection' : 'Build'}
      style={{ left: Math.min(at.x, window.innerWidth - 220), top: Math.min(at.y, window.innerHeight - 320) }}
      className="pointer-events-auto fixed z-50 w-52 rounded-xl bg-surface p-1 text-xs font-semibold text-ink shadow-xl ring-1 ring-ink/10"
    >
      {entries.map((entry, index) =>
        entry === 'line' ? (
          <div key={`line-${index}`} className="my-1 h-px bg-ink/10" />
        ) : (
          <button
            key={entry.label}
            type="button"
            role="menuitem"
            disabled={entry.disabled}
            onClick={() => {
              entry.run();
              setAt(null);
            }}
            className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-ink/10 disabled:opacity-35 ${entry.danger ? 'text-coral' : ''}`}
          >
            <entry.Icon className="size-3.5" aria-hidden />
            <span className="flex-1">{entry.label}</span>
            {entry.keys ? <kbd className="font-mono text-[10px] opacity-55">{entry.keys}</kbd> : null}
          </button>
        ),
      )}
    </div>
  );
}
