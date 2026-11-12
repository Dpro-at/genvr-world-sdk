import { z } from 'zod';
import { PlaySettings, PlayDevice, PlayOrientation, PlayView, SideMove, normalizeDevices, normalizeMoves } from '@genvr/contracts';

/**
 * The place_play live tool: how the open place is played, with the same rules as the
 * PlaySettingsPicker in Place settings (moves only for a side place, devices in order, at least one).
 */
export const PlacePlayArgs = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('get') }).strict(),
  z.object({ operation: z.literal('set'), view: PlayView.optional(), moves: z.array(SideMove).max(3).optional(), orientation: PlayOrientation.optional(), devices: z.array(PlayDevice).min(1).max(5).optional() }).strict(),
]);

export function placePlay(current: PlaySettings, raw: unknown): { play: PlaySettings; changed: boolean } {
  const args = PlacePlayArgs.parse(raw);
  if (args.operation === 'get') return { play: current, changed: false };
  if (args.view === undefined && args.moves === undefined && args.orientation === undefined && args.devices === undefined) throw new Error('Give view, moves, orientation or devices.');
  const view = args.view ?? current.view ?? 'free';
  if (args.moves !== undefined && view !== 'side') throw new Error('Extra moves are for a side (2D) place; set view side first.');
  const play = PlaySettings.parse({
    orientation: args.orientation ?? current.orientation,
    view,
    moves: normalizeMoves(args.moves ?? current.moves ?? []),
    devices: normalizeDevices(args.devices ?? current.devices),
  });
  return { play, changed: JSON.stringify(play) !== JSON.stringify(current) };
}
