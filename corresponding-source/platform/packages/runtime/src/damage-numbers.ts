import { CanvasTexture, Group, SRGBColorSpace, Sprite, SpriteMaterial } from 'three/webgpu';

/** How long a damage number shows, how far it rises, and when it starts to fade (P9-12). */
export const DAMAGE_NUMBER = { seconds: 0.8, rise: 0.6, fadeFrom: 0.5, height: 0.3 } as const;

interface Shown {
  sprite: Sprite;
  age: number;
  baseY: number;
}

/** A label: white bold text on a dark rounded plate (the calm black and white look). */
function labelTexture(text: string): { texture: CanvasTexture; aspect: number } {
  const canvas = typeof document === 'undefined' ? undefined : document.createElement('canvas');
  if (!canvas) return { texture: new CanvasTexture(undefined as never), aspect: 2 };
  const scale = 2;
  const context = canvas.getContext('2d')!;
  const font = `900 ${30 * scale}px Nunito, system-ui, sans-serif`;
  context.font = font;
  const width = Math.ceil(context.measureText(text).width) + 24 * scale;
  const height = 44 * scale;
  canvas.width = width;
  canvas.height = height;
  context.font = font;
  context.fillStyle = 'rgba(10, 10, 10, 0.78)';
  context.beginPath();
  context.roundRect(0, 0, width, height, height / 2);
  context.fill();
  context.fillStyle = '#ffffff';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, width / 2, height / 2 + scale);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return { texture, aspect: width / height };
}

/**
 * Damage numbers over hit players (P9-12): "-25" rises from the head and fades in under a second.
 * Each text's picture is made once; sprites are reused, so a hit makes nothing new after the first
 * few.
 */
export class DamageNumbers {
  readonly group = new Group();
  readonly #textures = new Map<string, { texture: CanvasTexture; aspect: number }>();
  readonly #shown: Shown[] = [];
  readonly #spare: Sprite[] = [];

  constructor() {
    this.group.name = 'damage-numbers';
    this.group.userData.helper = true;
  }

  get count(): number {
    return this.#shown.length;
  }

  /** Shows `-damage` with its bottom at `at` (above the victim's head). */
  show(at: { x: number; y: number; z: number }, damage: number): void {
    const text = `-${Math.round(damage)}`;
    let label = this.#textures.get(text);
    if (!label) {
      label = labelTexture(text);
      this.#textures.set(text, label);
    }
    const sprite =
      this.#spare.pop() ??
      new Sprite(new SpriteMaterial({ depthTest: false, depthWrite: false, transparent: true }));
    sprite.name = 'damage-number';
    sprite.renderOrder = 20;
    // Only a new sprite's material changes shape (no picture yet); swapping pictures does not.
    if (!sprite.material.map) sprite.material.needsUpdate = true;
    sprite.material.map = label.texture;
    sprite.material.opacity = 1;
    sprite.scale.set(DAMAGE_NUMBER.height * label.aspect, DAMAGE_NUMBER.height, 1);
    sprite.position.set(at.x, at.y + DAMAGE_NUMBER.height / 2, at.z);
    this.group.add(sprite);
    this.#shown.push({ sprite, age: 0, baseY: sprite.position.y });
  }

  update(dt: number): void {
    for (let i = this.#shown.length - 1; i >= 0; i -= 1) {
      const entry = this.#shown[i]!;
      entry.age += dt;
      const t = entry.age / DAMAGE_NUMBER.seconds;
      if (t >= 1) {
        entry.sprite.removeFromParent();
        this.#spare.push(entry.sprite);
        this.#shown.splice(i, 1);
        continue;
      }
      entry.sprite.position.y = entry.baseY + DAMAGE_NUMBER.rise * t;
      entry.sprite.material.opacity =
        t < DAMAGE_NUMBER.fadeFrom ? 1 : 1 - (t - DAMAGE_NUMBER.fadeFrom) / (1 - DAMAGE_NUMBER.fadeFrom);
    }
  }

  dispose(): void {
    for (const { sprite } of this.#shown) this.#spare.push(sprite);
    this.#shown.length = 0;
    for (const sprite of this.#spare) {
      sprite.removeFromParent();
      sprite.material.dispose();
    }
    this.#spare.length = 0;
    for (const { texture } of this.#textures.values()) texture.dispose();
    this.#textures.clear();
    this.group.removeFromParent();
  }
}
