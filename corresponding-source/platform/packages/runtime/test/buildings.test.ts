import type { Wall } from '@genvr/contracts';
import { describe, expect, it } from 'vitest';
import { buildingParts, resolvedLook } from '../src/building-view.js';

const outline: Array<[number, number]> = [
  [0, 0],
  [12, 0],
  [12, 8],
  [0, 8],
];
const house = (building: Wall['building'], height = 6): Wall => ({
  id: 'rp-1-0',
  points: outline,
  height,
  closed: true,
  materialId: 'genvr.core.wall.building',
  openings: [],
  ...(building ? { building } : {}),
});
const flat = () => 0;
const ys = (positions: readonly number[]) => positions.filter((_, i) => i % 3 === 1);

describe('real buildings (R4b)', () => {
  it('puts a gabled roof from the map on the walls, gable ends following it', () => {
    const parts = buildingParts(
      house({ roofShape: 'gabled', roofHeight: 3, roofMaterial: 'slate' }),
      flat,
      0.05,
    );
    expect(parts.roofSurface).toBe('slate');
    // Ridge 3 m over the 6 m eaves (plus 2 cm over the wall top), eaves at the long sides.
    expect(Math.max(...ys(parts.roof.positions))).toBeCloseTo(0.05 + 6 + 3 + 0.02, 5);
    expect(Math.min(...ys(parts.roof.positions))).toBeCloseTo(0.05 + 6 + 0.02, 5);
    // The facade reaches the ridge at the gable ends.
    expect(Math.max(...ys(parts.facade.positions))).toBeCloseTo(0.05 + 6 + 3, 5);
    // Roof and facade faces point outward or up.
    for (let i = 1; i < parts.roof.normals.length; i += 3) expect(parts.roof.normals[i]!).toBeGreaterThan(0);
    expect(parts.collider.indices.length).toBe(parts.roof.indices.length);
    // Every roof triangle faces up (its winding agrees with its normal).
    const { positions: pos, indices } = parts.roof;
    for (let i = 0; i < indices.length; i += 3) {
      const [a, b, c] = [indices[i]! * 3, indices[i + 1]! * 3, indices[i + 2]! * 3];
      const cross =
        (pos[b + 2]! - pos[a + 2]!) * (pos[c]! - pos[a]!) - (pos[b]! - pos[a]!) * (pos[c + 2]! - pos[a + 2]!);
      expect(cross).toBeGreaterThan(0);
    }
  });

  it('draws window rows by storeys and one door on the ground floor', () => {
    const parts = buildingParts(house({ levels: 2 }), flat, 0.05);
    // 12 m sides: 3 bays; 8 m sides: 2 bays; 2 storeys: 20 openings, one of them the door (a leaf, no glass).
    const glassPanes = parts.glass.indices.length / 6;
    expect(glassPanes).toBe(19);
    // No window below the ground, none above the eaves on a flat-roofed house.
    expect(Math.min(...ys(parts.glass.positions))).toBeGreaterThan(0.2);
    expect(Math.max(...ys(parts.frames.positions))).toBeLessThan(0.05 + 6);
    // Flat roof without a material: a flat roof membrane.
    expect(parts.roofSurface).toBe('concrete');
    expect(new Set(ys(parts.roof.positions)).size).toBe(1);
  });

  it('gives a tall storey (a church) tall windows', () => {
    const parts = buildingParts(house({ levels: 2 }, 18), flat, 0.05);
    const glass = ys(parts.glass.positions);
    // 9 m storeys: windows 5.4 m tall.
    expect(Math.max(...glass) - Math.min(...glass)).toBeGreaterThan(9 + 5);
    let tallest = 0;
    for (let i = 0; i < glass.length; i += 4)
      tallest = Math.max(tallest, Math.max(...glass.slice(i, i + 4)) - Math.min(...glass.slice(i, i + 4)));
    expect(tallest).toBeCloseTo(5.4, 5);
  });

  it('keeps old buildings without a look plain plaster with storeys of 3 m, rows cut to a lower wall', () => {
    const look = resolvedLook(house(undefined, 12));
    expect(look.facade).toBe('plaster');
    expect(look.levels).toBe(4);
    expect(resolvedLook(house({ levels: 20 }, 12)).levels).toBe(5);
    // A mapped roof colour picks the roof surface it only shades.
    expect(resolvedLook(house({ roofShape: 'gabled', roofColor: '#4a4c50' })).roofMaterial).toBe('slate');
    expect(resolvedLook(house({ roofShape: 'gabled', roofColor: '#a8483a' })).roofMaterial).toBe('tiles');
    expect(resolvedLook(house({ roofShape: 'gabled', roofColor: '#4f8584' })).roofMaterial).toBe('metal');
  });

  it('faces the facade outward whichever way the outline goes round', () => {
    for (const points of [outline, [...outline].reverse()]) {
      const parts = buildingParts({ ...house(undefined), points }, flat, 0.05);
      const { positions, normals } = parts.facade;
      for (let v = 0; v < positions.length; v += 3) {
        // Outward: away from the middle (6, 4).
        const out = (positions[v]! - 6) * normals[v]! + (positions[v + 2]! - 4) * normals[v + 2]!;
        expect(out).toBeGreaterThan(0);
      }
    }
  });
});
