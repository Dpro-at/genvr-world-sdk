import { expect, it } from 'vitest';
import { placePlay } from '../src/place-play.js';
import { LIVE_TOOLS } from '../src/mcp-live.js';

const start = { orientation: 'landscape' as const, view: 'free' as const, moves: [], devices: ['phone' as const, 'computer' as const, 'vr' as const] };

it('lists place_play as a live Studio tool', () => {
  expect(LIVE_TOOLS.map(tool => tool.name)).toContain('place_play');
});

it('reads and sets how the place is played with the Place settings rules', () => {
  expect(placePlay(start, { operation: 'get' })).toEqual({ play: start, changed: false });
  expect(() => placePlay(start, { operation: 'set', moves: ['dash'] })).toThrow(/side/);
  const side = placePlay(start, { operation: 'set', view: 'side', moves: ['dash', 'double-jump'], devices: ['tv', 'phone'] });
  expect(side).toEqual({ changed: true, play: { orientation: 'landscape', view: 'side', moves: ['double-jump', 'dash'], devices: ['phone', 'tv'] } });
  expect(placePlay(side.play, { operation: 'set', orientation: 'landscape' }).changed).toBe(false);
  expect(placePlay(side.play, { operation: 'set', orientation: 'portrait' }).play.orientation).toBe('portrait');
});

it('refuses empty, unknown and out-of-contract changes', () => {
  for (const raw of [{ operation: 'set' }, { operation: 'set', devices: [] }, { operation: 'set', view: 'top' }, { operation: 'set', devices: ['fridge'] }, { operation: 'get', view: 'free' }, { operation: 'publish' }, { operation: 'set', view: 'side', extra: 1 }])
    expect(() => placePlay(start, raw)).toThrow();
});
