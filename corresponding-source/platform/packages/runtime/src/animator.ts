import {
  AnimationMixer,
  LoopOnce,
  LoopRepeat,
  type AnimationAction,
  type AnimationClip,
  type Object3D,
} from 'three/webgpu';
import { CORE_ANIMATIONS } from '@genvr/core-library';

/** Clips that play once and then return to the base clip (one-shot emotes such as Wave). */
export const ONE_SHOT_CLIPS = new Set(
  CORE_ANIMATIONS.filter((animation) => animation.kind === 'once').map((animation) => animation.clip),
);

/**
 * Avatar animation controller, ported from agent_player's AvatarAnimator: one AnimationMixer
 * per avatar, crossfades between clips, and one-shot clips that return to the base clip.
 * Unknown clip names are ignored so a missing clip never breaks the scene.
 */
export class AvatarAnimator {
  #mixer: AnimationMixer;
  readonly #actions = new Map<string, AnimationAction>();
  #current: AnimationAction | null = null;
  readonly #onFinished = (event: { action: AnimationAction }) => {
    if (event.action === this.#current) this.play(this.baseClip);
  };

  constructor(
    root: Object3D,
    clips: readonly AnimationClip[],
    private readonly fade = 0.2,
    private readonly baseClip = 'Idle',
  ) {
    this.#mixer = this.#bind(root, clips);
  }

  get mixer(): AnimationMixer {
    return this.#mixer;
  }

  /**
   * The avatar changed its body type (another skeleton, P2-22): new clips on the same object,
   * continuing the clip that was playing.
   */
  rebind(root: Object3D, clips: readonly AnimationClip[]): void {
    const playing = this.currentClip ?? this.baseClip;
    this.dispose();
    this.#mixer = this.#bind(root, clips);
    this.play(playing, 0);
  }

  #bind(root: Object3D, clips: readonly AnimationClip[]): AnimationMixer {
    const mixer = new AnimationMixer(root);
    this.#mixer = mixer;
    for (const clip of clips) {
      const action = mixer.clipAction(clip);
      if (ONE_SHOT_CLIPS.has(clip.name)) {
        action.setLoop(LoopOnce, 1);
        action.clampWhenFinished = true;
      } else {
        action.setLoop(LoopRepeat, Infinity);
      }
      this.#actions.set(clip.name, action);
    }
    mixer.addEventListener('finished', this.#onFinished as never);
    return mixer;
  }

  get clipNames(): string[] {
    return [...this.#actions.keys()];
  }

  get currentClip(): string | null {
    return this.#current?.getClip().name ?? null;
  }

  /** Length of a clip in seconds (0 when the avatar has no such clip). */
  duration(name: string): number {
    return this.#actions.get(name)?.getClip().duration ?? 0;
  }

  /** Crossfades to a clip; returns false when the avatar has no such clip. */
  play(name: string, fade = this.fade): boolean {
    const next = this.#actions.get(name);
    if (!next) return false;
    if (next === this.#current) return true;
    next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1);
    if (this.#current) next.crossFadeFrom(this.#current, fade, true);
    next.play();
    this.#current = next;
    return true;
  }

  /** Plays a clip from its start, even when it is already playing (a second strike right after one). */
  replay(name: string, fade = this.fade): boolean {
    const action = this.#actions.get(name);
    if (!action) return false;
    if (action === this.#current) {
      action.reset().play();
      return true;
    }
    return this.play(name, fade);
  }

  /** Playback speed of the current clip (e.g. walk cycles follow the movement speed). */
  set speed(value: number) {
    this.#current?.setEffectiveTimeScale(value);
  }

  update(delta: number): void {
    this.#mixer.update(delta);
  }

  dispose(): void {
    this.#mixer.removeEventListener('finished', this.#onFinished as never);
    this.#mixer.stopAllAction();
    this.#mixer.uncacheRoot(this.#mixer.getRoot());
    this.#actions.clear();
    this.#current = null;
  }
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
export const SWIM_CRAWL_SPEED = 1.8;

/** Which clip fits the character's movement, and how fast it should play. */
export function locomotionClip(input: LocomotionInput): { clip: string; speed: number } {
  if (input.sitting === 'seat') return { clip: 'Sit', speed: 1 };
  if (input.sitting === 'ground') return { clip: 'SitGround', speed: 1 };
  // The climb cycle covers about 0.7 m per loop; hanging still holds the pose.
  if (input.climbing != null) return { clip: 'Climb', speed: Math.min(1.8, Math.abs(input.climbing) / 0.9) };
  // Two swims (owner, CHAR-02): a calm breaststroke when slow or floating, the front crawl when going fast.
  if (input.swimming)
    return input.speed > SWIM_CRAWL_SPEED
      ? { clip: 'Swim', speed: Math.min(1.55, Math.max(1, input.speed / 1.8)) }
      : { clip: 'SwimBreast', speed: input.speed > 0.2 ? 1 : 0.55 };
  if (!input.grounded) return { clip: 'Jump', speed: 1 };
  if (input.speed < 0.3) return { clip: 'Idle', speed: 1 };
  const running = input.speed > (input.walkSpeed + input.runSpeed) / 2;
  const reference = running ? input.runSpeed : input.walkSpeed;
  return { clip: running ? 'Run' : 'Walk', speed: Math.min(1.6, Math.max(0.5, input.speed / reference)) };
}
