'use client';

import { GripVertical, Maximize2, X } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import {
  constrainFloating,
  dockPanels,
  LIMITS,
  movePanel,
  type DockEdge,
  type DockPanel,
  type DockSide,
  type FloatingRect,
  type StudioLayout,
} from './layout';
import { Splitter } from './splitter';
import { ToolbarMenu } from './toolbar-menu';

const EDGES: DockEdge[] = ['left', 'right', 'bottom'];
const START_RECT: FloatingRect = { x: 100, y: 100, width: 380, height: 420 };
export function DockWorkspace({
  layout,
  onLayout,
  title,
  content,
}: {
  layout: StudioLayout;
  onLayout: (change: Partial<StudioLayout>) => void;
  title: (id: DockPanel) => string;
  content: (id: DockPanel) => ReactNode;
}) {
  const [drag, setDrag] = useState<{ id: DockPanel; x: number; y: number } | null>(null);
  const [transient, setTransient] = useState<Partial<Record<DockPanel, FloatingRect>>>({});
  const cleanup = useRef<(() => void) | null>(null);
  const current = useRef({ layout, onLayout });
  current.current = { layout, onLayout };
  useEffect(() => {
    const resize = () => {
      const { layout, onLayout } = current.current;
      const floating = { ...layout.floating };
      for (const id of dockPanels(layout, 'floating'))
        floating[id] = constrainFloating(floating[id] ?? START_RECT, innerWidth, innerHeight);
      onLayout({ floating });
    };
    resize();
    window.addEventListener('resize', resize);
    return () => {
      cleanup.current?.();
      window.removeEventListener('resize', resize);
    };
  }, [layout.mode]);
  const place = (id: DockPanel, side: DockSide) => {
    const next = movePanel(layout, id, side);
    if (side === 'floating')
      next.floating = {
        ...next.floating,
        [id]: constrainFloating(next.floating[id] ?? START_RECT, innerWidth, innerHeight),
      };
    onLayout(next);
  };
  const start = (event: ReactPointerEvent<HTMLElement>, id: DockPanel, resizing = false) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    cleanup.current?.();
    const origin = { x: event.clientX, y: event.clientY },
      target = event.currentTarget,
      pointerId = event.pointerId;
    const from = constrainFloating(layout.floating[id] ?? START_RECT, innerWidth, innerHeight);
    const wasFloating = layout.docks[id] === 'floating';
    let moved = false,
      rect = from;
    target.setPointerCapture(pointerId);
    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      const dx = next.clientX - origin.x,
        dy = next.clientY - origin.y;
      if (!moved && Math.hypot(dx, dy) < 5) return;
      moved = true;
      rect = constrainFloating(
        resizing
          ? { ...from, width: from.width + dx, height: from.height + dy }
          : {
              ...from,
              x: wasFloating ? from.x + dx : next.clientX - 100,
              y: wasFloating ? from.y + dy : next.clientY - 20,
            },
        innerWidth,
        innerHeight,
      );
      if (wasFloating || resizing) setTransient({ [id]: rect });
      if (!resizing) setDrag({ id, x: next.clientX, y: next.clientY });
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', key);
      if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
      setDrag(null);
      setTransient({});
      cleanup.current = null;
    };
    const cancel = () => stop();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        stop();
      }
    };
    const finish = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      if (moved) {
        const { layout, onLayout } = current.current;
        if (resizing) onLayout({ floating: { ...layout.floating, [id]: rect } });
        else {
          const hit = document
            .elementFromPoint(next.clientX, next.clientY)
            ?.closest<HTMLElement>('[data-dock-target]');
          const side = hit?.dataset.dockTarget as DockSide | undefined;
          const before = hit?.dataset.panelTarget as DockPanel | undefined;
          const updated = movePanel(layout, id, side ?? 'floating', before);
          if (!side) updated.floating = { ...updated.floating, [id]: rect };
          onLayout(updated);
        }
      }
      stop();
    };
    cleanup.current = stop;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', key);
  };
  const actions = (id: DockPanel) => (
    <ToolbarMenu compact closeOnAction label={`Position ${title(id)}`}>
      {([...EDGES, 'floating'] as const).map((side) => (
        <button
          key={side}
          type="button"
          className="rounded-lg px-2 py-1 text-left hover:bg-ink/10"
          onClick={() => place(id, side)}
        >
          {side === 'floating' ? 'Float panel' : `Move to ${side}`}
        </button>
      ))}
      <button
        type="button"
        className="rounded-lg px-2 py-1 text-left hover:bg-ink/10"
        onClick={() => onLayout({ hidden: [...layout.hidden, id] })}
      >
        Hide panel
      </button>
    </ToolbarMenu>
  );
  const body = (id: DockPanel) => (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">{content(id)}</div>
  );
  return (
    <>
      {EDGES.map((side) => {
        const panels = dockPanels(layout, side);
        if (!panels.length || !layout[`${side}Open`]) return null;
        const active = panels.includes(layout.active[side]) ? layout.active[side] : panels[0]!;
        return (
          <div key={side} className="contents">
            <section
              aria-label={`${side} panels`}
              data-dock-target={side}
              style={{ gridArea: side === 'bottom' ? 'console' : side }}
              className="flex min-h-0 min-w-0 flex-col bg-surface"
            >
              <div className="flex shrink-0 items-center border-b border-ink/10">
                <div
                  role="tablist"
                  aria-label={`${side} panel tabs`}
                  className="flex min-w-0 flex-1 overflow-x-auto"
                >
                  {panels.map((id) => (
                    <div
                      key={id}
                      data-dock-target={side}
                      data-panel-target={id}
                      className="flex shrink-0 items-center"
                    >
                      <button
                        type="button"
                        aria-label={`Drag ${title(id)}`}
                        title="Drag to dock or float"
                        onPointerDown={(event) => start(event, id)}
                        className="cursor-grab touch-none p-1 text-ink/40"
                      >
                        <GripVertical aria-hidden className="size-3" />
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={id === active}
                        onClick={() => onLayout({ active: { ...layout.active, [side]: id } })}
                        className={`border-b-2 px-2 py-2 text-xs font-bold ${id === active ? 'border-brand text-ink' : 'border-transparent text-ink/50'}`}
                      >
                        {title(id)}
                      </button>
                    </div>
                  ))}
                </div>
                {actions(active)}
              </div>
              {body(active)}
            </section>
            <Splitter
              area={side === 'left' ? 'lsplit' : side === 'right' ? 'rsplit' : 'bsplit'}
              edge={side}
              size={layout[side]}
              limits={LIMITS[side]}
              onResize={(size) => onLayout({ [side]: size })}
            />
          </div>
        );
      })}
      {dockPanels(layout, 'floating').map((id) => {
        const rect = transient[id] ?? layout.floating[id] ?? START_RECT;
        return (
          <section
            key={id}
            aria-label={`${title(id)} floating panel`}
            style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
            className="fixed z-40 flex min-h-0 flex-col overflow-visible rounded-xl border border-ink/20 bg-surface text-ink shadow-2xl"
          >
            <div className="flex shrink-0 items-center rounded-t-xl border-b border-ink/10">
              <button
                type="button"
                aria-label={`Drag ${title(id)}`}
                onPointerDown={(event) => start(event, id)}
                className="flex min-w-0 flex-1 cursor-grab touch-none items-center gap-2 px-2 py-2 text-left text-xs font-bold"
              >
                <GripVertical className="size-4" aria-hidden />
                {title(id)}
              </button>
              {actions(id)}
              <button
                type="button"
                aria-label={`Hide ${title(id)}`}
                className="p-2"
                onClick={() => onLayout({ hidden: [...layout.hidden, id] })}
              >
                <X aria-hidden className="size-3" />
              </button>
            </div>
            {body(id)}
            <button
              type="button"
              aria-label={`Resize ${title(id)}`}
              title="Drag to resize"
              onPointerDown={(event) => start(event, id, true)}
              className="absolute right-0 bottom-0 cursor-nwse-resize touch-none rounded-tl-lg bg-surface p-1 text-ink/60"
            >
              <Maximize2 aria-hidden className="size-3" />
            </button>
          </section>
        );
      })}
      {drag ? (
        <>
          <div
            className="pointer-events-none fixed z-[60] rounded-lg bg-brand px-3 py-2 text-xs font-bold text-on-brand shadow-xl"
            style={{ left: drag.x + 12, top: drag.y + 12 }}
          >
            {title(drag.id)} · release in the view to float
          </div>
          {EDGES.map((side) => (
            <div
              key={side}
              data-dock-target={side}
              className="fixed z-50 flex items-center justify-center rounded-lg border-2 border-brand bg-brand/20 text-xs font-black text-ink"
              style={
                side === 'bottom'
                  ? { left: '30%', right: '30%', bottom: 10, height: 60 }
                  : { [side]: 10, top: '35%', width: 64, height: 160 }
              }
            >
              Dock {side}
            </div>
          ))}
        </>
      ) : null}
    </>
  );
}
