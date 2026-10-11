import { describe, expect, it } from 'vitest';
import { commandParamsError, generatedParamsError } from '../src/index.js';

const BOX = 'genvr.core.tidewater.test-box';

describe('generator parameters of placed items (decision 130)', () => {
  it('accepts no parameters, the defaults and values inside the limits', () => {
    expect(generatedParamsError(BOX, {})).toBeNull();
    expect(generatedParamsError(BOX, { width: 3, height: 0.5, depth: 20, seed: 7 })).toBeNull();
  });

  it('refuses a number outside its range, with the item and the limit in the message', () => {
    expect(generatedParamsError(BOX, { width: 25 })).toMatch(/width.*0\.1.*20/);
    expect(generatedParamsError(BOX, { height: 0 })).toMatch(/height/);
  });

  it('refuses the wrong type for a parameter', () => {
    expect(generatedParamsError(BOX, { width: 'wide' })).toMatch(/width.*number/);
  });

  it('refuses more than 16 keys in all', () => {
    const many = Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`k${i}`, i]));
    expect(generatedParamsError(BOX, many)).toMatch(/16/);
  });

  it('leaves the other keys of an instance alone (color, material, zone)', () => {
    expect(generatedParamsError(BOX, { color: '#ff0000', material: 'wood' })).toBeNull();
  });

  it('says nothing about ordinary items', () => {
    expect(generatedParamsError('genvr.core.crate', { width: 999 })).toBeNull();
    expect(generatedParamsError('no.such.item', { width: 999 })).toBeNull();
  });

  it('checks place_item commands and set_item_params against the placed item', () => {
    const place = (itemParams: Record<string, unknown>) => ({
      type: 'place_item' as const,
      params: { instanceId: 'b1', itemId: BOX, position: [0, 0, 0] as [number, number, number], itemParams },
    });
    const instances = [{ instanceId: 'b1', itemId: BOX, params: { width: 2 } }];
    expect(commandParamsError(place({ width: 2 }), [])).toBeNull();
    expect(commandParamsError(place({ width: 200 }), [])).toMatch(/width/);
    expect(
      commandParamsError(
        { type: 'set_item_params', params: { instanceId: 'b1', params: { depth: 50 } } },
        instances,
      ),
    ).toMatch(/depth/);
    // null removes a key: always allowed (the default comes back).
    expect(
      commandParamsError(
        { type: 'set_item_params', params: { instanceId: 'b1', params: { width: null } } },
        instances,
      ),
    ).toBeNull();
    expect(commandParamsError({ type: 'remove_item', params: { instanceId: 'b1' } }, instances)).toBeNull();
  });
});
