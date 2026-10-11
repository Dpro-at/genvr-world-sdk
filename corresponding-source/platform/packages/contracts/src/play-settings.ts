import { z } from 'zod';
import type { ExperienceType } from './common.js';

/**
 * How a place is played (task P9-15, decision 68): the phone orientation it is designed for and
 * the devices it suits. Play locks the orientation, the studio preview starts from it, the place
 * page shows it, and the feed can filter by device.
 */
export const PlayOrientation = z.enum(['landscape', 'portrait', 'any']);
export type PlayOrientation = z.infer<typeof PlayOrientation>;

/** VR comes later (P5 XR work); it can already be declared. */
export const PlayDevice = z.enum(['phone', 'tablet', 'computer', 'tv', 'vr']);
export type PlayDevice = z.infer<typeof PlayDevice>;

export const PLAY_DEVICES: readonly PlayDevice[] = PlayDevice.options;

/**
 * How players see the place (decision 93): `free` is the normal 3D camera; `side` is a 2D place
 * seen from the side like a platform game, where players move left and right and jump on one
 * line. Builders still build in 3D; Test and play show the side view.
 */
export const PlayView = z.enum(['free', 'side']);
export type PlayView = z.infer<typeof PlayView>;

/**
 * Extra moves of side-view places (decision 95), chosen by the creator: a second jump in the
 * air, jumping off walls, and a short fast dash. Platforms players pass through from below work
 * in every side-view place.
 */
export const SideMove = z.enum(['double-jump', 'wall-jump', 'dash']);
export type SideMove = z.infer<typeof SideMove>;
export const SIDE_MOVES: readonly SideMove[] = SideMove.options;

/** Moves in the fixed order, each once. */
export const normalizeMoves = (moves: readonly SideMove[]): SideMove[] =>
  SIDE_MOVES.filter((move) => moves.includes(move));

/**
 * How the blocks of a place made of blocks are drawn (decision 110): `plain` is the clean look
 * (one color per face with a shade per cube, decision 99), `pixel` the small pixel pictures.
 * The owner picks it in the place settings; everyone sees the same look.
 */
export const PlaceBlockLook = z.enum(['plain', 'pixel']);
export type PlaceBlockLook = z.infer<typeof PlaceBlockLook>;

export const PlaySettings = z.object({
  orientation: PlayOrientation,
  view: PlayView.default('free'),
  /** Side-view moves the creator turned on (only used when `view` is `side`). */
  moves: z.array(SideMove).max(SIDE_MOVES.length).default([]),
  /** At least one device; kept in PLAY_DEVICES order without repeats. */
  devices: z.array(PlayDevice).min(1).max(PLAY_DEVICES.length),
});
export type PlaySettings = z.infer<typeof PlaySettings>;

/** Devices in the fixed order, each once. */
export const normalizeDevices = (devices: readonly PlayDevice[]): PlayDevice[] =>
  PLAY_DEVICES.filter((device) => devices.includes(device));

/**
 * Sensible defaults by kind of place until genres set their own (P9-14): games are landscape and
 * suit controllers on a TV; hangouts and events work either way.
 */
export function defaultPlaySettings(type?: ExperienceType | null): PlaySettings {
  if (type === 'social' || type === 'event')
    return { orientation: 'any', view: 'free', moves: [], devices: ['phone', 'tablet', 'computer'] };
  return {
    orientation: 'landscape',
    view: 'free',
    moves: [],
    devices: ['phone', 'tablet', 'computer', 'tv'],
  };
}

/**
 * Categories a place can be listed under (docs/GAME-GENRES.md): the creator picks up to three in
 * the place settings; the genre catalog (P9-14) later adds templates for each.
 */
export const PlaceGenre = z.enum([
  'obby',
  'arcade',
  'shooter',
  'fighting',
  'racing',
  'open-city',
  'adventure',
  'rpg',
  'simulator',
  'survival',
  'horror',
  'puzzle',
  'tower-defense',
  'sports',
  'party',
  'sandbox',
  'social',
  'music',
  'educational',
]);
export type PlaceGenre = z.infer<typeof PlaceGenre>;
export const MAX_PLACE_GENRES = 3;
