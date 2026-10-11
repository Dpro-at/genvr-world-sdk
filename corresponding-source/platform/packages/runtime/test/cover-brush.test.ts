import type { CommandPayload } from '@genvr/contracts';
import { TerrainData } from '@genvr/world';
import { describe, expect, it } from 'vitest';
import { Group } from 'three/webgpu';
import { BRUSH_RADIUS, TerrainTools } from '../src/terrain-tools.js';

/**
 * The Cover brush (P2-40 task 5). It is the ground brush with a different command at the end of the
 * stroke, so what is worth pinning is that it writes `paint_cover` and nothing else, that a whole
 * drag is one undo step like the sculpting modes, and that the four values reach the command.
 */
function tools(point: [number, number, number] | null = [10, 0, 20]) {
  const applied: CommandPayload[] = [];
  const groups: string[] = [];
  const brush = new TerrainTools({
    scene: new Group(),
    terrain: new TerrainData(250),
    apply: (command) => {
      applied.push(command);
      return true;
    },
    beginGroup: () => groups.push('begin'),
    endGroup: () => groups.push('end'),
    groundPoint: () => point,
  });
  return { brush, applied, groups };
}

describe('the Cover brush (P2-40)', () => {
  it('writes paint_cover where it is dragged, and nothing else', () => {
    const { brush, applied } = tools();
    brush.setSettings({ mode: 'cover', cover: 'plants', size: 'medium' });
    brush.start(1, 0, 0);
    expect(applied).toHaveLength(1);
    expect(applied[0]!.type).toBe('paint_cover');
    const params = (applied[0] as Extract<CommandPayload, { type: 'paint_cover' }>).params;
    expect(params.cover).toBe('plants');
    // The painted circle is the brush ring the creator can see, at the point they dragged over.
    const xs = params.area.map(([x]) => x);
    const zs = params.area.map(([, z]) => z);
    const radius = BRUSH_RADIUS.medium;
    expect(Math.min(...xs)).toBeCloseTo(10 - radius, 1);
    expect(Math.max(...zs)).toBeCloseTo(20 + radius, 1);
  });

  it('carries every one of the four values, so clearing and letting it grow both work', () => {
    for (const cover of ['plants', 'pebbles', 'cleared', 'default'] as const) {
      const { brush, applied } = tools();
      brush.setSettings({ mode: 'cover', cover });
      brush.start(1, 0, 0);
      const params = (applied[0] as Extract<CommandPayload, { type: 'paint_cover' }>).params;
      expect(params.cover).toBe(cover);
    }
  });

  it('makes a whole drag one undo step, like the sculpting modes', () => {
    const { brush, applied, groups } = tools();
    brush.setSettings({ mode: 'cover', cover: 'pebbles', size: 'small' });
    brush.start(1, 0, 0);
    brush.end(1);
    expect(groups).toEqual(['begin', 'end']);
    expect(applied.every((c) => c.type === 'paint_cover')).toBe(true);
  });

  it('does nothing when the drag does not start on the ground', () => {
    const { brush, applied, groups } = tools(null);
    brush.setSettings({ mode: 'cover', cover: 'plants' });
    expect(brush.start(1, 0, 0)).toBe(false);
    expect(applied).toEqual([]);
    // No group is opened either, or the next real edit would join an empty undo step.
    expect(groups).toEqual([]);
  });

  it('leaves the sculpting modes alone', () => {
    const { brush, applied } = tools();
    brush.setSettings({ mode: 'raise', cover: 'plants' });
    brush.start(1, 0, 0);
    expect(applied[0]!.type).toBe('sculpt_terrain');
  });
});
