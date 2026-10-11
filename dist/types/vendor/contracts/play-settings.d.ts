import { z } from 'zod';
import type { ExperienceType } from './common.js';
/**
 * How a place is played (task P9-15, decision 68): the phone orientation it is designed for and
 * the devices it suits. Play locks the orientation, the studio preview starts from it, the place
 * page shows it, and the feed can filter by device.
 */
export declare const PlayOrientation: z.ZodEnum<{
    any: "any";
    landscape: "landscape";
    portrait: "portrait";
}>;
export type PlayOrientation = z.infer<typeof PlayOrientation>;
/** VR comes later (P5 XR work); it can already be declared. */
export declare const PlayDevice: z.ZodEnum<{
    phone: "phone";
    tablet: "tablet";
    computer: "computer";
    tv: "tv";
    vr: "vr";
}>;
export type PlayDevice = z.infer<typeof PlayDevice>;
export declare const PLAY_DEVICES: readonly PlayDevice[];
/**
 * How players see the place (decision 93): `free` is the normal 3D camera; `side` is a 2D place
 * seen from the side like a platform game, where players move left and right and jump on one
 * line. Builders still build in 3D; Test and play show the side view.
 */
export declare const PlayView: z.ZodEnum<{
    free: "free";
    side: "side";
}>;
export type PlayView = z.infer<typeof PlayView>;
/**
 * Extra moves of side-view places (decision 95), chosen by the creator: a second jump in the
 * air, jumping off walls, and a short fast dash. Platforms players pass through from below work
 * in every side-view place.
 */
export declare const SideMove: z.ZodEnum<{
    "double-jump": "double-jump";
    "wall-jump": "wall-jump";
    dash: "dash";
}>;
export type SideMove = z.infer<typeof SideMove>;
export declare const SIDE_MOVES: readonly SideMove[];
/** Moves in the fixed order, each once. */
export declare const normalizeMoves: (moves: readonly SideMove[]) => SideMove[];
/**
 * How the blocks of a place made of blocks are drawn (decision 110): `plain` is the clean look
 * (one color per face with a shade per cube, decision 99), `pixel` the small pixel pictures.
 * The owner picks it in the place settings; everyone sees the same look.
 */
export declare const PlaceBlockLook: z.ZodEnum<{
    plain: "plain";
    pixel: "pixel";
}>;
export type PlaceBlockLook = z.infer<typeof PlaceBlockLook>;
export declare const PlaySettings: z.ZodObject<{
    orientation: z.ZodEnum<{
        any: "any";
        landscape: "landscape";
        portrait: "portrait";
    }>;
    view: z.ZodDefault<z.ZodEnum<{
        free: "free";
        side: "side";
    }>>;
    moves: z.ZodDefault<z.ZodArray<z.ZodEnum<{
        "double-jump": "double-jump";
        "wall-jump": "wall-jump";
        dash: "dash";
    }>>>;
    devices: z.ZodArray<z.ZodEnum<{
        phone: "phone";
        tablet: "tablet";
        computer: "computer";
        tv: "tv";
        vr: "vr";
    }>>;
}, z.core.$strip>;
export type PlaySettings = z.infer<typeof PlaySettings>;
/** Devices in the fixed order, each once. */
export declare const normalizeDevices: (devices: readonly PlayDevice[]) => PlayDevice[];
/**
 * Sensible defaults by kind of place until genres set their own (P9-14): games are landscape and
 * suit controllers on a TV; hangouts and events work either way.
 */
export declare function defaultPlaySettings(type?: ExperienceType | null): PlaySettings;
/**
 * Categories a place can be listed under (docs/GAME-GENRES.md): the creator picks up to three in
 * the place settings; the genre catalog (P9-14) later adds templates for each.
 */
export declare const PlaceGenre: z.ZodEnum<{
    social: "social";
    sandbox: "sandbox";
    horror: "horror";
    obby: "obby";
    arcade: "arcade";
    shooter: "shooter";
    fighting: "fighting";
    racing: "racing";
    "open-city": "open-city";
    adventure: "adventure";
    rpg: "rpg";
    simulator: "simulator";
    survival: "survival";
    puzzle: "puzzle";
    "tower-defense": "tower-defense";
    sports: "sports";
    party: "party";
    music: "music";
    educational: "educational";
}>;
export type PlaceGenre = z.infer<typeof PlaceGenre>;
export declare const MAX_PLACE_GENRES = 3;
