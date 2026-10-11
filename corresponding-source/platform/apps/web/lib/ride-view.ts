import type { RideModel, RideRefusal } from '@genvr/contracts';

/**
 * What the play screen shows for riding (movement modes, spec 9): which buttons, the words when the
 * room refuses, and the Speed display. Pure, so it is tested without a browser. Words are neutral:
 * the engine never names what an item is.
 */

/** What the local player rides, as the runtime reports it. */
export interface RidingView {
  instanceId: string;
  seat: number;
  model: RideModel;
}

/**
 * The ride buttons: Ride (the item to get on) when a rideable item is in reach on foot, Get off while
 * riding, Down while steering (seat 1) an item that moves in the air.
 */
export function rideButtons(state: {
  riding: RidingView | null;
  inReach: { instanceId: string; model: RideModel } | null;
  divingAvailable?: boolean;
}): { ride: string | null; getOff: boolean; down: boolean } {
  if (state.riding)
    return { ride: null, getOff: true, down: state.riding.model === 'air' && state.riding.seat === 1 };
  return { ride: state.inReach?.instanceId ?? null, getOff: false, down: state.divingAvailable ?? false };
}

const REFUSALS: Record<RideRefusal, string> = {
  not_rideable: 'This cannot be ridden.',
  too_far: 'Too far away. Walk closer.',
  full: 'No free seat.',
  cannot_move: 'You cannot get on right now.',
  side_view: 'Riding is not available in side view.',
  busy: 'One moment, then try again.',
  not_here: 'This cannot move from here.',
};

/** Why the room would not let the player get on, in words for the player. */
export function refusalText(reason: RideRefusal): string {
  return REFUSALS[reason] ?? REFUSALS.not_rideable;
}

/** A speed in m/s as the Speed display shows it, rounded, in the binding's unit. */
export function speedText(metresPerSecond: number, unit: 'km/h' | 'm/s'): string {
  const speed = Math.abs(metresPerSecond);
  return unit === 'km/h' ? `${Math.round(speed * 3.6)} km/h` : `${Math.round(speed)} m/s`;
}

/** The own row's `ride` and `seat` (movement modes). */
export interface SeatRow {
  ride: string;
  seat: number;
}

/**
 * What a change of the own row means for this device: `start` (got on, or another seat, or another
 * item), `end` (got off), or null (nothing changed).
 */
export function rideChange(before: SeatRow, after: SeatRow): 'start' | 'end' | null {
  if (after.ride === '') return before.ride === '' ? null : 'end';
  return after.ride !== before.ride || after.seat !== before.seat ? 'start' : null;
}

/**
 * What a `teleport` from the room means for this device (movement modes). One with an `epoch` is a
 * correction of the ridden item: applied at once (`correct`, or `place` on foot), and from then on
 * moves carry that epoch (the room drops moves with an older one, sent before it arrived). One
 * without is an exit spot: while riding, the own row says when the player is off (`await-row`); on
 * foot the player is placed there. The epoch never goes down.
 */
export function teleportAction(
  message: { epoch?: number },
  riding: boolean,
  epoch: number,
): { action: 'correct' | 'await-row' | 'place'; epoch: number } {
  const next = message.epoch === undefined ? epoch : Math.max(epoch, message.epoch);
  if (!riding) return { action: 'place', epoch: next };
  return { action: message.epoch === undefined ? 'await-row' : 'correct', epoch: next };
}
