'use client';

import { useEffect, useState, type CSSProperties } from 'react';

export type WorkspaceMode = 'build' | 'filming';
export type DockPanel = 'tab' | 'world' | 'outline' | 'properties' | 'assistant' | 'output' | 'timeline';
export type DockEdge = 'left' | 'right' | 'bottom';
export type DockSide = DockEdge | 'floating';
export interface FloatingRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface StudioLayout {
  mode: WorkspaceMode;
  docks: Record<DockPanel, DockSide>;
  order: DockPanel[];
  hidden: DockPanel[];
  active: Record<DockEdge, DockPanel>;
  floating: Partial<Record<DockPanel, FloatingRect>>;
  snapGrid: number;
  snapAngle: number;
  left: number;
  right: number;
  bottom: number;
  leftOpen: boolean;
  rightOpen: boolean;
  bottomOpen: boolean;
  worldSounds: boolean;
}
export const DOCK_ORDER: readonly DockPanel[] = [
  'tab',
  // The world's parts sit in the Build left dock between Tools and Explorer (WORLD-W10).
  'world',
  'outline',
  'properties',
  'assistant',
  'output',
  'timeline',
];
export const LIMITS = { left: [200, 520], right: [220, 520], bottom: [100, 480] } as const;
export const STORAGE_KEY = 'genvr-studio-workspaces-v2';
export function defaultLayout(mode: WorkspaceMode): StudioLayout {
  return {
    mode,
    docks: {
      tab: 'left',
      world: 'left',
      outline: 'left',
      properties: 'right',
      assistant: 'right',
      output: 'bottom',
      timeline: 'bottom',
    },
    order: [...DOCK_ORDER],
    hidden: mode === 'filming' ? ['outline'] : [],
    active: { left: 'tab', right: 'properties', bottom: mode === 'filming' ? 'timeline' : 'output' },
    floating: {},
    snapGrid: 0.5,
    snapAngle: 90,
    left: 280,
    right: 300,
    bottom: mode === 'filming' ? 320 : 180,
    leftOpen: true,
    rightOpen: true,
    // Debug starts folded into the status bar (ITEMS-I10); Filming keeps its timeline open.
    bottomOpen: mode === 'filming',
    worldSounds: false,
  };
}
export const DEFAULT_LAYOUT = defaultLayout('build');
export function allowedPanels(mode: WorkspaceMode): readonly DockPanel[] {
  return DOCK_ORDER.filter((id) => (mode === 'filming' ? id !== 'assistant' && id !== 'world' : id !== 'timeline'));
}
export function dockPanels(layout: StudioLayout, side: DockSide): DockPanel[] {
  return layout.order.filter(
    (id) =>
      allowedPanels(layout.mode).includes(id) && !layout.hidden.includes(id) && layout.docks[id] === side,
  );
}
/** Whether a panel is on screen now: floating, or the open tab of an open dock (`visible` hides panels of other tabs). */
export function panelShown(layout: StudioLayout, id: DockPanel, visible: (id: DockPanel) => boolean = () => true): boolean {
  const side = layout.docks[id];
  if (!allowedPanels(layout.mode).includes(id) || layout.hidden.includes(id) || !visible(id)) return false;
  if (side === 'floating') return true;
  if (!layout[`${side}Open`]) return false;
  const panels = dockPanels(layout, side).filter(visible);
  return (panels.includes(layout.active[side]) ? layout.active[side] : panels[0]) === id;
}
const finite = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
export function constrainFloating(rect: FloatingRect, width: number, height: number): FloatingRect {
  const w = finite(rect.width, 360, Math.min(240, width), Math.max(240, width));
  const h = finite(rect.height, 380, Math.min(160, height - 70), Math.max(160, height - 70));
  return {
    width: w,
    height: h,
    x: finite(rect.x, 50, 0, Math.max(0, width - w)),
    y: finite(rect.y, 90, 70, Math.max(70, height - h)),
  };
}
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
/** Validate persisted data, including legacy two-sided layouts, before it reaches CSS. */
export function normalizeLayout(value: unknown, mode: WorkspaceMode): StudioLayout {
  const base = defaultLayout(mode),
    saved = object(value),
    docks = object(saved.docks),
    active = object(saved.active);
  for (const id of DOCK_ORDER)
    if (['left', 'right', 'bottom', 'floating'].includes(String(docks[id])))
      base.docks[id] = docks[id] as DockSide;
  const validPanels = (value: unknown) =>
    Array.isArray(value) ? value.filter((id): id is DockPanel => DOCK_ORDER.includes(id)) : [];
  const savedOrder = validPanels(saved.order);
  // Layouts saved before WORLD-W10 have no World panel: it goes right after Tools, not at the end.
  if (savedOrder.length && !savedOrder.includes('world')) savedOrder.splice(savedOrder.indexOf('tab') + 1, 0, 'world');
  base.order = [...new Set([...savedOrder, ...DOCK_ORDER])];
  if (Array.isArray(saved.hidden)) base.hidden = [...new Set(validPanels(saved.hidden))];
  for (const side of ['left', 'right', 'bottom'] as const)
    if (DOCK_ORDER.includes(active[side] as DockPanel)) base.active[side] = active[side] as DockPanel;
  for (const side of ['left', 'right', 'bottom'] as const) {
    base[side] = finite(saved[side], base[side], LIMITS[side][0], LIMITS[side][1]);
    const key = `${side}Open` as const;
    if (typeof saved[key] === 'boolean') base[key] = saved[key];
  }
  base.snapGrid = finite(saved.snapGrid, base.snapGrid, 0, 100);
  base.snapAngle = finite(saved.snapAngle, base.snapAngle, 0, 360);
  if (typeof saved.worldSounds === 'boolean') base.worldSounds = saved.worldSounds;
  for (const id of DOCK_ORDER) {
    const rect = object(object(saved.floating)[id]);
    if (Object.keys(rect).length)
      base.floating[id] = {
        x: finite(rect.x, 50, 0, 10000),
        y: finite(rect.y, 90, 70, 10000),
        width: finite(rect.width, 360, 240, 2000),
        height: finite(rect.height, 380, 160, 2000),
      };
  }
  return base;
}
export function movePanel(
  layout: StudioLayout,
  id: DockPanel,
  side: DockSide,
  before?: DockPanel,
): StudioLayout {
  const order = layout.order.filter((entry) => entry !== id);
  const index = before ? order.indexOf(before) : -1;
  order.splice(index < 0 ? order.length : index, 0, id);
  return {
    ...layout,
    docks: { ...layout.docks, [id]: side },
    order,
    hidden: layout.hidden.filter((entry) => entry !== id),
    ...(side === 'floating' ? {} : { active: { ...layout.active, [side]: id }, [`${side}Open`]: true }),
  };
}
type WorkspaceBank = Record<WorkspaceMode, StudioLayout>;
export function readWorkspaces(saved: unknown, legacy?: unknown): WorkspaceBank {
  const value = object(saved);
  return {
    build: normalizeLayout(value.build ?? legacy, 'build'),
    filming: normalizeLayout(value.filming, 'filming'),
  };
}
export function useStudioLayout(
  mode: WorkspaceMode = 'build',
): [StudioLayout, (change: Partial<StudioLayout>) => void] {
  const [bank, setBank] = useState<WorkspaceBank>(() => readWorkspaces(null));
  useEffect(() => {
    try {
      const read = (key: string): unknown => {
        try {
          return JSON.parse(localStorage.getItem(key) ?? 'null');
        } catch {
          return null;
        }
      };
      setBank(readWorkspaces(read(STORAGE_KEY), read('genvr-studio-layout')));
    } catch {
      /* Keep usable defaults when storage is blocked or invalid. */
    }
  }, []);
  return [
    bank[mode],
    (change) =>
      setBank((current) => {
        const next = { ...current, [mode]: normalizeLayout({ ...current[mode], ...change }, mode) };
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          /* The current visit still works without storage. */
        }
        return next;
      }),
  ];
}
export function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(min-width: 1024px) and (pointer: fine)');
    setDesktop(query.matches);
    const onChange = (event: MediaQueryListEvent) => setDesktop(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return desktop;
}
/** `sceneBar`: Filming keeps its scene tools in a fixed row above the world view, so they never cover the picture. */
export function studioGrid(layout: StudioLayout, testing: boolean, sceneBar = false): CSSProperties {
  const size = (side: DockEdge) =>
    !testing && layout[`${side}Open`] && dockPanels(layout, side).length ? layout[side] : 0;
  const left = size('left'),
    right = size('right'),
    bottom = size('bottom');
  const split = (size: number) => (size > 0 ? '5px' : '0px');
  // Remember requested sizes, but keep room for the world on narrower desktops.
  const column = (size: number) => (size ? `min(${size}px, 32%)` : '0px');
  return {
    display: 'grid',
    gridTemplateColumns: `${column(left)} ${split(left)} minmax(0, 1fr) ${split(right)} ${column(right)}`,
    gridTemplateRows: `auto ${testing ? '0px' : 'auto'} ${sceneBar && !testing ? 'auto' : '0px'} minmax(0, 1fr) ${split(bottom)} ${bottom ? `min(${bottom}px, 55dvh)` : '0px'}`,
    gridTemplateAreas: [
      '"top top top top top"',
      '"ribbon ribbon ribbon ribbon ribbon"',
      '"left lsplit scenebar rsplit right"',
      '"left lsplit viewport rsplit right"',
      '"left lsplit bsplit rsplit right"',
      '"left lsplit console rsplit right"',
    ].join(' '),
  };
}
