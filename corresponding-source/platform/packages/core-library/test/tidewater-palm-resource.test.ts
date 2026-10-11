import { describe, expect, it } from 'vitest';
import {
  createTidewaterPalmResource,
  TIDEWATER_PALM_CONTROLS,
  TIDEWATER_PALM_DEFAULTS,
  TIDEWATER_PALM_ID,
} from '../src/3d-models/tidewater/nature/palm.js';
import { describeGeneratedLookControls, generatedControlValueError } from '../src/generated-controls.js';
import { isGeneratedLook } from '../src/3d-models/_parts.js';
import { getCoreItem } from '../src/3d-models/index.js';
import { restRule } from '../src/rest-rules.js';

const bounds = { min: [-6, -1, -6] as [number, number, number], max: [6, 14, 6] as [number, number, number] };
const blocks = { min: [-1, -1, -1] as [number, number, number], max: [1, 10, 1] as [number, number, number] };

describe('reusable source palm resource', () => {
  it('allows coastal sand and rests upright at the root rather than the leaning crown center', () => {
    const palm = createTidewaterPalmResource(bounds, blocks);
    expect(palm.manifest.placement?.soils).toContain('sand');
    expect(palm.manifest.placement?.stands).toEqual(['ground']);
    const rule = restRule(palm, { min: [-2, -1, -3], max: [10, 15, 8] });
    expect(rule.mode).toBe('upright');
    expect(rule.base).toEqual({ min: [-0.35, -0.35], max: [0.35, 0.35] });
  });
  it('keeps exact source controls and supplied bounds without catalog or mobile acceptance', () => {
    const item = createTidewaterPalmResource(bounds, blocks);
    expect(item.manifest.id).toBe(TIDEWATER_PALM_ID);
    expect(item.manifest.styles).toEqual(['realistic']);
    expect(item.manifest.budget).toMatchObject({ triangles: 1602, mobileReady: false });
    expect(item.experimental).toBeUndefined();
    expect(getCoreItem(TIDEWATER_PALM_ID)?.manifest.id).toBe(TIDEWATER_PALM_ID);
    const look = item.looks!.realistic!;
    expect(isGeneratedLook(look)).toBe(true);
    if (!isGeneratedLook(look)) throw new Error('Missing generated look');
    expect(look.generated.bounds).toBe(bounds);
    expect(look.generated.blocks).toBe(blocks);
    expect(look.generated.params).toEqual(TIDEWATER_PALM_DEFAULTS);
    expect(look.generated.source.license).toBe('MIT');
    expect(look.generated.source.page).toContain('4811ba48');
  });
  it('exposes author tabs, units, floor-seed semantics and shared range validation', () => {
    const look = createTidewaterPalmResource(bounds, blocks).looks!.realistic!;
    if (!isGeneratedLook(look)) throw new Error('Missing generated look');
    const info = describeGeneratedLookControls(look);
    expect(info.generator).toBe('tidewater.palm');
    expect(info.controls.map((c) => c.key)).toEqual(['seed', 'height', 'lean', 'leanAngle']);
    for (const control of info.controls) {
      expect(control.group).toBe(
        TIDEWATER_PALM_CONTROLS[control.key as keyof typeof TIDEWATER_PALM_CONTROLS].group,
      );
      expect(generatedControlValueError(control, control.default)).toBeNull();
      expect(generatedControlValueError(control, Infinity)).not.toBeNull();
      expect(generatedControlValueError(control, control.max! + 1)).not.toBeNull();
    }
    expect(info.controls.find((c) => c.key === 'leanAngle')).toMatchObject({ unit: 'rad', max: 2 * Math.PI });
    expect(info.controls.find((c) => c.key === 'height')).toMatchObject({ unit: 'm' });
    expect(info.controls[0]!.description).toContain('rounded down');
    expect(info.controls.some((c) => c.key.toLowerCase().includes('wind'))).toBe(false);
  });
});
