import { describe, expect, it } from 'vitest';
import { rideButtons, rideChange, refusalText, speedText, teleportAction } from './ride-view';

describe('ride buttons', () => {
  it('shows Ride only with a rideable item in reach, and nothing else on foot', () => {
    expect(rideButtons({ riding: null, inReach: { instanceId: 'a', model: 'ground' } })).toEqual({
      ride: 'a',
      getOff: false,
      down: false,
    });
    expect(rideButtons({ riding: null, inReach: null })).toEqual({ ride: null, getOff: false, down: false });
  });

  it('shows Get off while riding, and Down only to seat 1 of an item in the air', () => {
    expect(rideButtons({ riding: { instanceId: 'a', seat: 1, model: 'ground' }, inReach: null })).toEqual({
      ride: null,
      getOff: true,
      down: false,
    });
    expect(rideButtons({ riding: { instanceId: 'a', seat: 1, model: 'air' }, inReach: null }).down).toBe(
      true,
    );
    expect(rideButtons({ riding: { instanceId: 'a', seat: 2, model: 'air' }, inReach: null }).down).toBe(
      false,
    );
  });
});

describe('refusal texts', () => {
  it('says why in plain, neutral words for every reason', () => {
    const reasons = ['not_rideable', 'too_far', 'full', 'cannot_move', 'side_view', 'busy', 'not_here'] as const;
    const texts = reasons.map(refusalText);
    expect(new Set(texts).size).toBe(reasons.length);
    expect(refusalText('too_far')).toBe('Too far away. Walk closer.');
    expect(refusalText('full')).toBe('No free seat.');
    expect(refusalText('not_here')).toBe('This cannot move from here.');
    for (const text of texts) expect(text).toMatch(/^[A-Z].*\.$/);
  });
});

describe('speed text', () => {
  it('shows m/s as km/h or m/s, rounded', () => {
    expect(speedText(20, 'km/h')).toBe('72 km/h');
    expect(speedText(20, 'm/s')).toBe('20 m/s');
    expect(speedText(0.2, 'km/h')).toBe('1 km/h');
    expect(speedText(-3, 'm/s')).toBe('3 m/s');
  });
});

describe('ride changes of the own row', () => {
  it('tells when to start, move seat and end', () => {
    expect(rideChange({ ride: '', seat: 0 }, { ride: 'a', seat: 2 })).toBe('start');
    expect(rideChange({ ride: 'a', seat: 2 }, { ride: 'a', seat: 1 })).toBe('start');
    expect(rideChange({ ride: 'a', seat: 1 }, { ride: 'b', seat: 1 })).toBe('start');
    expect(rideChange({ ride: 'a', seat: 1 }, { ride: '', seat: 0 })).toBe('end');
    expect(rideChange({ ride: 'a', seat: 1 }, { ride: 'a', seat: 1 })).toBeNull();
    expect(rideChange({ ride: '', seat: 0 }, { ride: '', seat: 0 })).toBeNull();
  });
});

describe('teleports from the room while riding', () => {
  it('applies a correction (it carries an epoch) at once and sends moves under that epoch from then on', () => {
    expect(teleportAction({ epoch: 3 }, true, 2)).toEqual({ action: 'correct', epoch: 3 });
    // A late, older correction still puts the item back, and never lowers the epoch.
    expect(teleportAction({ epoch: 1 }, true, 2)).toEqual({ action: 'correct', epoch: 2 });
  });

  it('waits for the row on an exit spot (no epoch) while riding; on foot any teleport places the player', () => {
    expect(teleportAction({}, true, 2)).toEqual({ action: 'await-row', epoch: 2 });
    expect(teleportAction({}, false, 0)).toEqual({ action: 'place', epoch: 0 });
    expect(teleportAction({ epoch: 4 }, false, 2)).toEqual({ action: 'place', epoch: 4 });
  });
});
