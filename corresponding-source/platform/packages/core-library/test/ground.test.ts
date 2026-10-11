import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GROUND,
  getGround,
  GROUND_MATERIALS,
  groundRef,
  LIBRARY,
  STARTER_GROUND,
  starterGroundMaterials,
  styleCoverage,
} from '../src/index.js';
import { SoilName } from '@genvr/contracts';

describe('realistic ground materials (P2-37)', () => {
  it('has every imported material with both sizes and their sizes', () => {
    const imageMaterials = GROUND_MATERIALS.filter((material) => !material.procedural);
    // 40 photo sets (36 ambientCG and Poly Haven, 4 Poly Haven streets and sidewalks, R2h), 10 Poly Haven facades
    // and roofs (R4b), and the Baseplate and Pavement drawn by code (small files: plain surfaces and a grid).
    expect(imageMaterials).toHaveLength(52);
    expect(new Set(GROUND_MATERIALS.map((m) => m.manifest.id)).size).toBe(GROUND_MATERIALS.length);
    for (const material of imageMaterials) {
      expect(material.manifest.id).toBe(`genvr.core.ground.${material.name}`);
      expect(material.files.map((files) => files.size)).toEqual([1024, 512]);
      const minBytes = material.source.name.startsWith('Genvr') ? 200 : 10_000;
      for (const files of material.files) expect(files.bytes, material.name).toBeGreaterThan(minBytes);
      expect(material.source.license).toBe('CC0');
    }
  });

  it('has a default material for every soil, counting as that soil', () => {
    for (const [soil, name] of Object.entries(DEFAULT_GROUND)) expect(getGround(name)?.soil, name).toBe(soil);
  });

  it('is in the library and drawn only in Realistic places', () => {
    const grass = getGround('grass-004')!;
    expect(LIBRARY).toContain(grass);
    expect(styleCoverage(grass, 'realistic')).toBe('own');
    expect(styleCoverage(grass, 'blocky')).toBe('not-needed');
    expect(groundRef(grass)).toEqual({ id: 'genvr.core.ground.grass-004', soil: 'grass' });
  });
});

describe('the ground each kind of starter world begins with (P2-40 task 7)', () => {
  it('puts each material in the slot of its own soil, which is what placement rules read', () => {
    for (const kind of Object.keys(STARTER_GROUND) as Array<keyof typeof STARTER_GROUND>)
      for (const [slot, material] of Object.entries(starterGroundMaterials(kind))) {
        expect(material.soil, `${kind} slot ${slot}`).toBe(SoilName.options[Number(slot)]);
        expect(getGround(material.id), material.id).toBeTruthy();
      }
  });

  it('gives the kinds different ground, and leaves the plain on the defaults', () => {
    expect(starterGroundMaterials('plain')).toEqual({});
    const grass = (kind: keyof typeof STARTER_GROUND) => starterGroundMaterials(kind)['0']?.id;
    expect(new Set([grass('valley'), grass('island'), grass('mountains')]).size).toBe(3);
  });
});

describe('Tidewater procedural ground resources', () => {
  it('adds selectable MIT resources with existing compatible image fallbacks', () => {
    const procedural = GROUND_MATERIALS.filter((m) => m.procedural);
    expect(procedural.map((m) => m.procedural!.variant)).toEqual(['beach-sand', 'seabed-sand', 'rock', 'grass', 'dirt', 'rubble', 'seagrass']);
    for (const material of procedural) {
      expect(LIBRARY).toContain(material);
      expect(material.source.license).toBe('MIT');
      expect(material.files).toEqual([]);
      const fallback = getGround(material.procedural!.fallback)!;
      expect(fallback.procedural).toBeUndefined();
      expect(fallback.soil).toBe(material.soil);
      expect(fallback.files.length).toBeGreaterThan(0);
      expect(groundRef(material).id).toBe(material.manifest.id);
    }
  });
});
