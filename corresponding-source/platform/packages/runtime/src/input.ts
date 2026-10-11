/**
 * Unified input layer (docs/INPUT-AND-DEVICES.md): every device produces the same MoveIntent,
 * so the character controller never knows whether input came from keys, touch, a gamepad,
 * a walking platform, or XR controllers.
 */
export interface MoveIntent {
  /** Camera-relative direction on the ground plane; length 0..1. x = right, z = forward. */
  direction: { x: number; z: number };
  /** 0..1 (walk .. run). */
  speed: number;
  jump: boolean;
  /** A dash in side-view places that allow it (decision 95); present only while pressed. */
  dash?: boolean;
  /** Down while riding an item that flies (movement modes); present only while pressed. */
  descend?: boolean;
  /** Explicit underwater descent; separate from aircraft Shift descent. */
  dive?: boolean;
  /**
   * Get on or off a rideable item (movement modes); present only while pressed. The runtime acts on
   * the press (edge), like jump.
   */
  interact?: boolean;
}

export interface InputSource {
  read(): MoveIntent;
  dispose(): void;
}

const clampLength = (x: number, z: number) => {
  const length = Math.hypot(x, z);
  return length > 1 ? { x: x / length, z: z / length } : { x, z };
};

/**
 * WASD / arrow keys, Shift to run, Space to jump, E to dash (side-view places) or to get on and off
 * a rideable item, Q or Shift to go down while riding an item that flies.
 */
export class KeyboardInput implements InputSource {
  readonly #keys = new Set<string>();
  /** E pressed since the last read: a tap shorter than a frame still gets on or off. */
  #tapped = false;
  readonly #down = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    this.#keys.add(event.code);
    if (event.code === 'KeyE' && !event.repeat) this.#tapped = true;
  };
  readonly #up = (event: KeyboardEvent) => this.#keys.delete(event.code);
  readonly #blur = () => this.#keys.clear();

  /** `arrowsFree` false: arrow keys belong to the build tools (nudging the selection). */
  constructor(
    private readonly target: Window = window,
    private readonly arrowsFree: () => boolean = () => true,
  ) {
    target.addEventListener('keydown', this.#down);
    target.addEventListener('keyup', this.#up);
    target.addEventListener('blur', this.#blur);
  }

  read(): MoveIntent {
    const k = this.#keys;
    const arrows = this.arrowsFree();
    const key = (letter: string, arrow: string) => k.has(letter) || (arrows && k.has(arrow));
    const x = (key('KeyD', 'ArrowRight') ? 1 : 0) - (key('KeyA', 'ArrowLeft') ? 1 : 0);
    const z = (key('KeyW', 'ArrowUp') ? 1 : 0) - (key('KeyS', 'ArrowDown') ? 1 : 0);
    const direction = clampLength(x, z);
    const moving = direction.x !== 0 || direction.z !== 0;
    const shift = k.has('ShiftLeft') || k.has('ShiftRight');
    const tapped = this.#tapped;
    this.#tapped = false;
    return {
      direction,
      speed: moving ? (shift ? 1 : 0.5) : 0,
      jump: k.has('Space'),
      ...(k.has('KeyE') ? { dash: true } : {}),
      ...(k.has('KeyE') || tapped ? { interact: true } : {}),
      ...(k.has('KeyQ') || shift ? { descend: true } : {}),
      ...(k.has('KeyC') || k.has('ControlLeft') || k.has('ControlRight') ? { dive: true } : {}),
    };
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.#down);
    this.target.removeEventListener('keyup', this.#up);
    this.target.removeEventListener('blur', this.#blur);
  }
}

/** The first connected game controller (standard mapping), or null. */
export function firstGamepad(): Gamepad | null {
  return navigator.getGamepads?.().find((candidate) => candidate?.connected) ?? null;
}

/** Stick value with a small dead zone, so resting sticks do not drift. */
export const stickValue = (value: number | undefined) => (Math.abs(value ?? 0) < 0.15 ? 0 : (value ?? 0));

/**
 * Standard gamepads. Walk-in-place boards and omnidirectional treadmills usually appear as a
 * gamepad, so they work through this adapter without device-specific code.
 */
export class GamepadInput implements InputSource {
  read(): MoveIntent {
    const pad = navigator.getGamepads?.().find((candidate) => candidate?.connected);
    if (!pad) return { direction: { x: 0, z: 0 }, speed: 0, jump: false };
    const dead = (value: number) => (Math.abs(value) < 0.15 ? 0 : value);
    const direction = clampLength(dead(pad.axes[0] ?? 0), -dead(pad.axes[1] ?? 0));
    const magnitude = Math.hypot(direction.x, direction.z);
    return {
      direction,
      speed: magnitude,
      jump: Boolean(pad.buttons[0]?.pressed),
      // RB / R1 dashes in side-view places (decision 95).
      ...(pad.buttons[5]?.pressed ? { dash: true } : {}),
      // B / Circle goes down while riding (it sits on foot); Y / Triangle gets on and off.
      ...(pad.buttons[1]?.pressed ? { descend: true } : {}),
      ...(pad.buttons[1]?.pressed ? { dive: true } : {}),
      ...(pad.buttons[3]?.pressed ? { interact: true } : {}),
    };
  }

  dispose(): void {}
}

/** Virtual joystick for touch screens: drag anywhere on the left half of the screen. */
export class TouchJoystickInput implements InputSource {
  #pointerId: number | null = null;
  #origin = { x: 0, y: 0 };
  #vector = { x: 0, z: 0 };
  readonly #radius = 60;

  readonly #start = (event: PointerEvent) => {
    if ((event.pointerType !== 'touch' && !this.mouseAsFinger) || this.#pointerId !== null) return;
    if (!this.enabled()) return;
    if (this.mouseAsFinger && event.button !== 0 && event.pointerType === 'mouse') return;
    if (event.clientX > this.element.clientWidth / 2) return;
    this.#pointerId = event.pointerId;
    this.#origin = { x: event.clientX, y: event.clientY };
  };
  readonly #move = (event: PointerEvent) => {
    if (event.pointerId !== this.#pointerId) return;
    const dx = (event.clientX - this.#origin.x) / this.#radius;
    const dy = (event.clientY - this.#origin.y) / this.#radius;
    this.#vector = clampLength(dx, -dy);
  };
  readonly #end = (event: PointerEvent) => {
    if (event.pointerId !== this.#pointerId) return;
    this.#pointerId = null;
    this.#vector = { x: 0, z: 0 };
  };

  constructor(
    private readonly element: HTMLElement,
    /** Device emulator: a mouse drag on the left half works like a finger. */
    private readonly mouseAsFinger = false,
    /** Off while a build tool is active, so taps on the left half build instead of walking. */
    private readonly enabled: () => boolean = () => true,
  ) {
    element.addEventListener('pointerdown', this.#start);
    element.addEventListener('pointermove', this.#move);
    element.addEventListener('pointerup', this.#end);
    element.addEventListener('pointercancel', this.#end);
  }

  /** Lets go of the stick (a second finger starts a pinch or two-finger turn). */
  release(): void {
    this.#pointerId = null;
    this.#vector = { x: 0, z: 0 };
  }

  /** True while the given pointer drives the joystick (camera orbit ignores it). */
  owns(pointerId: number): boolean {
    return this.#pointerId === pointerId;
  }

  #up = false;
  #descend = false;

  /**
   * On-screen buttons held down (movement modes): the jump button held climbs while riding an item
   * that flies, the Down button descends. Released with false.
   */
  setButtons(buttons: { up?: boolean; descend?: boolean }): void {
    if (buttons.up !== undefined) this.#up = buttons.up;
    if (buttons.descend !== undefined) this.#descend = buttons.descend;
  }

  read(): MoveIntent {
    const magnitude = Math.hypot(this.#vector.x, this.#vector.z);
    const intent: MoveIntent = { direction: { ...this.#vector }, speed: magnitude, jump: this.#up };
    if (this.#descend) {
      intent.descend = true;
      intent.dive = true;
    }
    return intent;
  }

  dispose(): void {
    this.element.removeEventListener('pointerdown', this.#start);
    this.element.removeEventListener('pointermove', this.#move);
    this.element.removeEventListener('pointerup', this.#end);
    this.element.removeEventListener('pointercancel', this.#end);
  }
}

/** Combines sources: the strongest direction wins, jump (and dash) if any source does. */
export function mergeIntents(intents: MoveIntent[]): MoveIntent {
  let best: MoveIntent = { direction: { x: 0, z: 0 }, speed: 0, jump: false };
  for (const intent of intents) if (intent.speed > best.speed) best = intent;
  const merged: MoveIntent = {
    direction: best.direction,
    speed: best.speed,
    jump: intents.some((i) => i.jump),
  };
  if (intents.some((intent) => intent.dash)) merged.dash = true;
  if (intents.some((intent) => intent.descend)) merged.descend = true;
  if (intents.some((intent) => intent.dive)) merged.dive = true;
  if (intents.some((intent) => intent.interact)) merged.interact = true;
  return merged;
}
