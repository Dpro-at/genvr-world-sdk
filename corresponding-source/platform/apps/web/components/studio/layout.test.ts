import { describe, expect, it } from 'vitest';
import {
  constrainFloating,
  defaultLayout,
  dockPanels,
  movePanel,
  normalizeLayout,
  readWorkspaces,
  studioGrid,
} from './layout';

describe('Studio workspaces', () => {
  it('migrates legacy preferences only into Build and keeps independent filming defaults', () => {
    const bank = readWorkspaces(null, {
      left: 420,
      bottom: 150,
      docks: { properties: 'left' },
      worldSounds: true,
    });
    expect(bank.build.left).toBe(420);
    expect(bank.build.docks.properties).toBe('left');
    expect(bank.filming.left).toBe(280);
    expect(bank.filming.bottom).toBe(320);
    expect(bank.filming.active.bottom).toBe('timeline');
    const restored = readWorkspaces({ ...bank, filming: movePanel(bank.filming, 'timeline', 'floating') });
    expect(restored.build).toEqual(bank.build);
    expect(restored.filming.docks.timeline).toBe('floating');
  });
  it('rejects corrupt dimensions and panel IDs rather than passing them to CSS', () => {
    const layout = normalizeLayout(
      {
        mode: 'wrong',
        left: Infinity,
        right: -500,
        bottom: 'wide',
        order: ['tab', 'evil', 'tab'],
        hidden: ['evil', 'output', 'output'],
        docks: { tab: 'unknown' },
        active: { left: 'evil' },
        floating: { tab: { width: NaN, height: -1 } },
      },
      'build',
    );
    expect(layout.mode).toBe('build');
    expect(layout.left).toBe(280);
    expect(layout.right).toBe(220);
    expect(layout.bottom).toBe(180);
    expect(layout.order).toEqual(['tab', 'outline', 'properties', 'assistant', 'output', 'timeline']);
    expect(layout.hidden).toEqual(['output']);
    expect(layout.docks.tab).toBe('left');
    expect(layout.floating.tab?.width).toBe(360);
    expect(layout.floating.tab?.height).toBe(160);
  });
  it('moves, restores and reorders a panel once, without mutating the previous layout', () => {
    const previous = { ...defaultLayout('build'), hidden: ['assistant'] as const };
    const next = movePanel({ ...previous, hidden: [...previous.hidden] }, 'assistant', 'left', 'outline');
    expect(dockPanels(next, 'left')).toEqual(['tab', 'assistant', 'outline']);
    expect(next.active.left).toBe('assistant');
    expect(next.hidden).toEqual([]);
    expect(previous.hidden).toEqual(['assistant']);
    expect(previous.docks.assistant).toBe('right');
    expect(
      movePanel(next, 'assistant', 'left', 'assistant').order.filter((id) => id === 'assistant'),
    ).toHaveLength(1);
  });
  it('collapses empty/hidden docks and excludes tools from the other workspace', () => {
    let layout = defaultLayout('build');
    expect(dockPanels(layout, 'bottom')).toEqual(['output']);
    layout = movePanel(layout, 'output', 'floating');
    expect(studioGrid(layout, false).gridTemplateRows).toContain('0px 0px');
    layout = { ...layout, hidden: ['tab', 'outline'] };
    expect(studioGrid(layout, false).gridTemplateColumns).toMatch(/^0px 0px/);
    expect(dockPanels(defaultLayout('filming'), 'right')).toEqual(['properties']);
    expect(studioGrid(defaultLayout('filming'), true).gridTemplateColumns).toBe(
      '0px 0px minmax(0, 1fr) 0px 0px',
    );
  });
  it('keeps the entire floating panel below the toolbar and inside resized viewports', () => {
    const rect = constrainFloating({ x: 1800, y: -20, width: 1700, height: 2000 }, 1100, 900);
    expect(rect).toEqual({ x: 0, y: 70, width: 1100, height: 830 });
    const small = constrainFloating({ x: NaN, y: Infinity, width: -1, height: -1 }, 1100, 900);
    expect(small).toEqual({ x: 50, y: 90, width: 240, height: 160 });
  });
});
