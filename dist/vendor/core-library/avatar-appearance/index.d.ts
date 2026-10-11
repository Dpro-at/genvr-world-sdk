import type { AnimationItem } from './_animation.js';
export * from './_animation.js';
export * from './_joint-limits.js';
export * from './_joint-constraints.js';
export * from './_skin-materials.js';
export { HUMAN_FACE_LANDMARKS } from './bodies/_human-joints.js';
export * from './_wearable.js';
export * from './_wearables.js';
export * from './_body-type.js';
export * from './_body.js';
export * from './_look-preset.js';
export * from './_item-body.js';
/** Movement clips the engine picks by itself (walk, run, swim, ...). */
export declare const MOVEMENT_ANIMATIONS: readonly AnimationItem[];
/** Moves players choose from their library (the Avatar panel), in library order. */
export declare const CORE_EMOTES: readonly AnimationItem[];
/** Every Core animation: the clip set of the Genvr avatar. */
export declare const CORE_ANIMATIONS: readonly AnimationItem[];
/** Sitting picks a bench when one is close, otherwise the ground (clip SitGround). */
export declare const SIT_ANIMATION_ID: string;
/** Favorites play with the keys 1-8. */
export declare const MAX_FAVORITE_ANIMATIONS = 8;
/** Favorites until the player picks their own on the avatar page (P8-11). */
export declare const DEFAULT_FAVORITE_ANIMATIONS: readonly string[];
/** Every clip a player may report to the realtime room. */
export declare const AVATAR_CLIPS: readonly string[];
export declare const findAnimation: (id: string) => AnimationItem | undefined;
