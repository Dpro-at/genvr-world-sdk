import { AnimationMixer, type AnimationClip, type Object3D } from 'three/webgpu';
/** Clips that play once and then return to the base clip (one-shot emotes such as Wave). */
export declare const ONE_SHOT_CLIPS: Set<string>;
/**
 * Avatar animation controller, ported from agent_player's AvatarAnimator: one AnimationMixer
 * per avatar, crossfades between clips, and one-shot clips that return to the base clip.
 * Unknown clip names are ignored so a missing clip never breaks the scene.
 */
export declare class AvatarAnimator {
    #private;
    private readonly fade;
    private readonly baseClip;
    constructor(root: Object3D, clips: readonly AnimationClip[], fade?: number, baseClip?: string);
    get mixer(): AnimationMixer;
    /**
     * The avatar changed its body type (another skeleton, P2-22): new clips on the same object,
     * continuing the clip that was playing.
     */
    rebind(root: Object3D, clips: readonly AnimationClip[]): void;
    get clipNames(): string[];
    get currentClip(): string | null;
    /** Length of a clip in seconds (0 when the avatar has no such clip). */
    duration(name: string): number;
    /** Crossfades to a clip; returns false when the avatar has no such clip. */
    play(name: string, fade?: number): boolean;
    /** Plays a clip from its start, even when it is already playing (a second strike right after one). */
    replay(name: string, fade?: number): boolean;
    /** Playback speed of the current clip (e.g. walk cycles follow the movement speed). */
    set speed(value: number);
    update(delta: number): void;
    dispose(): void;
}
export interface LocomotionInput {
    grounded: boolean;
    swimming: boolean;
    sitting: 'seat' | 'ground' | null;
    /** On a ladder: climbing speed in m/s (up positive), 0 while hanging still (P2-23). */
    climbing?: number | null;
    /** Horizontal speed in m/s. */
    speed: number;
    walkSpeed: number;
    runSpeed: number;
}
/** Swimming faster than this (m/s; sprint swims 2.5, normal 1.5) switches from breaststroke to the front crawl. */
export declare const SWIM_CRAWL_SPEED = 1.8;
/** Which clip fits the character's movement, and how fast it should play. */
export declare function locomotionClip(input: LocomotionInput): {
    clip: string;
    speed: number;
};
