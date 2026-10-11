import idle from './animations/idle.js';
import build from './animations/build.js';
import strike from './animations/strike.js';
import climb from './animations/climb.js';
import jump from './animations/jump.js';
import run from './animations/run.js';
import sitGround from './animations/sit-ground.js';
import swim from './animations/swim.js';
import swimBreast from './animations/swim-breast.js';
import walk from './animations/walk.js';
import backpedal from './animations/backpedal.js';
import crouchIdle from './animations/crouch-idle.js';
import crouchWalk from './animations/crouch-walk.js';
import sneak from './animations/sneak.js';
import strafeLeft from './animations/strafe-left.js';
import strafeRight from './animations/strafe-right.js';
import sprintStart from './animations/sprint-start.js';
import sprintStop from './animations/sprint-stop.js';
import turnLeft90 from './animations/turn-left-90.js';
import turnRight90 from './animations/turn-right-90.js';
import turn180 from './animations/turn-180.js';
import jumpForward from './animations/jump-forward.js';
import jumpBackward from './animations/jump-backward.js';
import longJump from './animations/long-jump.js';
import softLanding from './animations/soft-landing.js';
import hardLanding from './animations/hard-landing.js';
import slide from './animations/slide.js';
import cheer from './emotes/cheer.js';
import clap from './emotes/clap.js';
import dance from './emotes/dance.js';
import laugh from './emotes/laugh.js';
import point from './emotes/point.js';
import robotDance from './emotes/robot-dance.js';
import salute from './emotes/salute.js';
import sit from './emotes/sit.js';
import stretch from './emotes/stretch.js';
import think from './emotes/think.js';
import wave from './emotes/wave.js';
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
export const MOVEMENT_ANIMATIONS: readonly AnimationItem[] = [
  idle,
  walk,
  run,
  jump,
  swim,
  swimBreast,
  climb,
  sitGround,
  build,
  strike,
  // The owner's ChatGPT move files (docs/reference/character-anime/moves/), built by tooling/moves/build-moves.ts.
  backpedal,
  crouchIdle,
  crouchWalk,
  sneak,
  strafeLeft,
  strafeRight,
  sprintStart,
  sprintStop,
  turnLeft90,
  turnRight90,
  turn180,
  jumpForward,
  jumpBackward,
  longJump,
  softLanding,
  hardLanding,
  slide,
];

/** Moves players choose from their library (the Avatar panel), in library order. */
export const CORE_EMOTES: readonly AnimationItem[] = [
  sit,
  wave,
  clap,
  cheer,
  dance,
  robotDance,
  point,
  think,
  salute,
  laugh,
  stretch,
];

/** Every Core animation: the clip set of the Genvr avatar. */
export const CORE_ANIMATIONS: readonly AnimationItem[] = [...MOVEMENT_ANIMATIONS, ...CORE_EMOTES];

/** Sitting picks a bench when one is close, otherwise the ground (clip SitGround). */
export const SIT_ANIMATION_ID = sit.manifest.id;

/** Favorites play with the keys 1-8. */
export const MAX_FAVORITE_ANIMATIONS = 8;

/** Favorites until the player picks their own on the avatar page (P8-11). */
export const DEFAULT_FAVORITE_ANIMATIONS: readonly string[] = CORE_EMOTES.slice(
  0,
  MAX_FAVORITE_ANIMATIONS,
).map((animation) => animation.manifest.id);

/** Every clip a player may report to the realtime room. */
export const AVATAR_CLIPS: readonly string[] = CORE_ANIMATIONS.map((animation) => animation.clip);

const byId = new Map(CORE_ANIMATIONS.map((animation) => [animation.manifest.id, animation]));

export const findAnimation = (id: string): AnimationItem | undefined => byId.get(id);
