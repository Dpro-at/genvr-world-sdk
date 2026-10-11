import {
  ACESFilmicToneMapping,
  Color,
  NoToneMapping,
  PMREMGenerator,
  Scene,
  Vector3,
  type DirectionalLight,
  type RenderTarget,
  type WebGPURenderer,
} from 'three/webgpu';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import type { RealisticQuality } from './realistic-quality.js';
import { addSkyTint, type SkyTint } from './sky-physical.js';
import type { SkyState } from './sky-cycle.js';

/** Share of the sky's light in the environment map (the sky's raw values are bright; tuned live). */
const ENV_INTENSITY = 0.35;
const WHITE = new Color(1, 0.98, 0.95);
const GOLD = new Color(1, 0.72, 0.42);
const RED = new Color(1, 0.42, 0.22);

/** Sunlight color from the sun's height (sine of its elevation): white high, golden low, red at the horizon. */
export function sunColor(elevationSin: number): Color {
  const h = Math.min(1, Math.max(0, elevationSin));
  if (h < 0.1) return RED.clone().lerp(GOLD, h / 0.1);
  if (h < 0.4) return GOLD.clone().lerp(WHITE, (h - 0.1) / 0.3);
  return WHITE.clone();
}

/** True when the sun moved more than `everyDeg` degrees since the last environment map (or there is none). */
export function envDue(last: Vector3 | null, now: Vector3, everyDeg: number): boolean {
  if (!last) return true;
  return last.angleTo(now) > (everyDeg * Math.PI) / 180;
}

/**
 * Light from the physical sky (P2-36): the sky is drawn into an environment map that lights and
 * reflects on every material; the camera's tone mapping and exposure follow the time of day; the
 * sunlight takes its color from the sun's height. `enable(false)` puts everything back for styles
 * lit by a hemisphere light.
 */
export class SkyLight {
  readonly #pmrem: PMREMGenerator;
  readonly #envScene = new Scene();
  readonly #envSky = new SkyMesh();
  readonly #envTint: SkyTint;
  #target: RenderTarget | null = null;
  #targetSize = 0;
  #lastSun: Vector3 | null = null;
  #on = false;

  constructor(
    private readonly renderer: WebGPURenderer,
    private readonly scene: Scene,
  ) {
    this.#pmrem = new PMREMGenerator(renderer);
    this.#envSky.scale.setScalar(50);
    this.#envSky.showSunDisc.value = 0; // the sun's own light comes from the directional light
    this.#envTint = addSkyTint(this.#envSky);
    this.#envScene.add(this.#envSky);
  }

  enable(on: boolean): void {
    if (on === this.#on) return;
    this.#on = on;
    this.renderer.toneMapping = on ? ACESFilmicToneMapping : NoToneMapping;
    this.scene.environmentIntensity = on ? ENV_INTENSITY : 1;
    if (!on) {
      this.renderer.toneMappingExposure = 1;
      this.scene.environment = null;
      this.#lastSun = null;
    }
  }

  /** Lights the scene for one sky state; makes the environment map again when the sun moved enough. */
  show(
    state: SkyState,
    sky: SkyMesh,
    glow: SkyTint,
    sun: DirectionalLight,
    quality: RealisticQuality,
    weatherLight: number,
  ): void {
    if (!this.#on) return;
    const physical = state.look.physical;
    this.renderer.toneMappingExposure = physical.exposure;
    // By day the sunlight follows the sun's height; at night the moon's light keeps the preset color.
    if (state.night < 0.5) sun.color.copy(sunColor(state.sun[1]));

    const env = this.#envSky;
    env.turbidity.value = sky.turbidity.value;
    env.rayleigh.value = sky.rayleigh.value;
    env.mieCoefficient.value = sky.mieCoefficient.value;
    env.cloudCoverage.value = sky.cloudCoverage.value;
    env.cloudDensity.value = sky.cloudDensity.value;
    env.cloudElevation.value = sky.cloudElevation.value;
    env.sunPosition.value.copy(sky.sunPosition.value);
    this.#envTint.top.value.copy(glow.top.value);
    this.#envTint.horizon.value.copy(glow.horizon.value);
    this.#envTint.amount.value = glow.amount.value;
    this.#envTint.dim.value = glow.dim.value;

    const now = new Vector3(...state.sun);
    const size = quality.envSize;
    const covered = `${weatherLight}/${state.phase}/${glow.amount.value.toFixed(2)}`;
    if (
      size !== this.#targetSize ||
      envDue(this.#lastSun, now, quality.envEveryDeg) ||
      covered !== this.#covered
    ) {
      this.#covered = covered;
      if (size !== this.#targetSize) {
        this.#target?.dispose();
        this.#target = null;
        this.#targetSize = size;
      }
      this.#lastSun = now;
      this.#target = this.#pmrem.fromScene(this.#envScene, 0, 0.1, 100, {
        size,
        ...(this.#target ? { renderTarget: this.#target } : {}),
      });
      this.scene.environment = this.#target.texture;
    }
  }

  #covered = '';

  dispose(): void {
    this.enable(false);
    this.#target?.dispose();
    this.#pmrem.dispose();
    this.#envSky.geometry.dispose();
    this.#envSky.material.dispose();
  }
}
