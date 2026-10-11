import { describe, expect, it } from 'vitest';
import { ItemInstance } from '../src/index.js';

describe('item instance params (decision 130)', () => {
  const transform = { position: [1, 2, 3], rotation: [0, 0, 0, 1], scale: [1, 1, 1] };

  it('an old instance without params parses unchanged, with empty params', () => {
    const parsed = ItemInstance.parse({ instanceId: 'a', itemId: 'genvr.core.crate', transform });
    expect(parsed.params).toEqual({});
    expect(parsed.transform).toEqual(transform);
  });

  it('keeps generator parameters next to the other settings as they are', () => {
    const params = { width: 2.5, colour: 'mint', stilts: true, seed: 7, color: '#ffffff' };
    const parsed = ItemInstance.parse({ instanceId: 'a', itemId: 'genvr.core.tidewater.test-box', transform, params });
    expect(parsed.params).toEqual(params);
  });
});
