import {
  LEGACY_GATE_ITEMS,
  LEGACY_GATE_REPLACEMENT,
  LEGACY_MELEE_TOOL_ID,
  MELEE_TOOL_REPLACEMENT,
} from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import {
  AVATAR_CLIPS,
  SPAWN_POINT_ID,
  MELEE_TOOL_ID,
  ZONE_AREA_ID,
  ZONE_GATE_ID,
  getCoreItem,
  getLibraryItem,
  itemBounds,
  zoneShapeOfItem,
} from '../src/index.js';

describe('gameplay entries', () => {
  it('has a Melee tool, a held tool with a neutral name', () => {
    const manifest = getLibraryItem(MELEE_TOOL_ID)?.manifest;
    expect(manifest?.name).toBe('Melee tool');
    expect(manifest?.tool).toEqual({
      kind: 'melee', damage: 25, reach: 2.5, arcDeg: 90, cooldownSec: 0.6,
    });
  });
  it('reads the old Sword item of stored worlds as the Melee tool, which the library has under its new id only', () => {
    expect(MELEE_TOOL_REPLACEMENT).toBe(MELEE_TOOL_ID);
    expect(getLibraryItem(LEGACY_MELEE_TOOL_ID)).toBeUndefined();
  });
  it('has a spawn point marker without a collider', () => {
    const manifest = getLibraryItem(SPAWN_POINT_ID)?.manifest;
    expect(manifest?.marker).toEqual({ kind: 'spawn' });
    expect(manifest?.physics?.collider).toBe('none');
  });
  it('has the Strike clip', () => {
    expect(AVATAR_CLIPS).toContain('Strike');
  });
});

describe('zone items', () => {
  it('has a zone gate and a zone area: resizable zone markers without colliders, one look', () => {
    for (const [id, name] of [
      [ZONE_GATE_ID, 'Zone Gate'],
      [ZONE_AREA_ID, 'Zone Area'],
    ] as const) {
      const item = getLibraryItem(id);
      expect(item?.manifest.name).toBe(name);
      expect(item?.manifest.marker).toEqual({ kind: 'zone' });
      expect(item?.manifest.physics?.collider).toBe('none');
      const core = getCoreItem(id)!;
      expect(core.resizable).toBe(true);
      expect(core.looks ?? {}).toEqual({});
    }
  });

  it('knows the shape each zone item has by itself, and none for other items', () => {
    expect(zoneShapeOfItem(ZONE_AREA_ID)).toBe('area');
    expect(zoneShapeOfItem(ZONE_GATE_ID)).toBe('gate');
    expect(zoneShapeOfItem(SPAWN_POINT_ID)).toBeUndefined();
  });

  it('reads the old gate items of stored worlds as the Zone Gate, which the library no longer has', () => {
    expect(LEGACY_GATE_REPLACEMENT).toBe(ZONE_GATE_ID);
    for (const id of Object.values(LEGACY_GATE_ITEMS)) expect(getLibraryItem(id)).toBeUndefined();
  });

  it('sizes them as the room reads them: the gate 12 m wide, the area 4 m by 4 m', () => {
    const gate = itemBounds(getCoreItem(ZONE_GATE_ID)!.parts);
    expect(gate.max[0] - gate.min[0]).toBeGreaterThanOrEqual(12);
    expect(gate.max[0] - gate.min[0]).toBeLessThan(13);
    const area = itemBounds(getCoreItem(ZONE_AREA_ID)!.parts);
    expect(area.max[0] - area.min[0]).toBeCloseTo(4);
    expect(area.max[2] - area.min[2]).toBeCloseTo(4);
    expect(area.max[1] - area.min[1]).toBeLessThan(0.5);
  });
});
