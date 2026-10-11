/**
 * Avatar animation library (task P2-19, docs/PLAYER-UI.md section 7). Every animation is an item
 * of type `animation`; the Core set below is free for everyone. The runtime plays the clip with
 * the same name, and the realtime room only accepts clip names from AVATAR_CLIPS.
 */
export interface AnimationDef {
    /** Item id, e.g. "genvr.core.anim.wave". */
    id: string;
    name: string;
    /** Clip on the avatar rig. */
    clip: string;
    /** `loop` plays until the player moves; `once` plays one time and returns to idle. */
    kind: 'loop' | 'once';
}
/** Sitting picks a bench when one is close, otherwise the ground (clips Sit / SitGround). */
export declare const SIT_ANIMATION_ID = "genvr.core.anim.sit";
export declare const CORE_ANIMATIONS: readonly AnimationDef[];
/** Favorites play with the keys 1-8 and sit on the quick wheel. */
export declare const MAX_FAVORITE_ANIMATIONS = 8;
/** Favorites until the player picks their own on the avatar page (P8-11). */
export declare const DEFAULT_FAVORITE_ANIMATIONS: readonly string[];
/** Clips chosen by movement (not from the library). */
export declare const LOCOMOTION_CLIPS: readonly ["Idle", "Walk", "Run", "Jump", "Swim", "SitGround"];
/** Every clip a player may report to the room. */
export declare const AVATAR_CLIPS: readonly string[];
export declare const findAnimation: (id: string) => AnimationDef | undefined;
