import {
  Color,
  Group,
  Mesh,
  MeshBasicNodeMaterial,
  SphereGeometry,
  TSL,
  Vector3,
  type Node,
} from 'three/webgpu';
import { SkyMesh } from 'three/addons/objects/SkyMesh.js';
import { moonPhase } from './celestial.js';
import type { SkyState } from './sky-cycle.js';

const {
  float,
  max,
  mix,
  mx_fractal_noise_float,
  normalWorld,
  normalize,
  positionLocal,
  smoothstep,
  uniform,
  vec3,
  vec4,
} = TSL;

/** The sky box follows the camera; SkyMesh draws at the far plane, so its size only has to hold the camera. */
const SKY_SCALE = 1000;
/** The sun position is a direction; SkyMesh fades the sun with this distance (as in the three.js example). */
const SUN_DISTANCE = 1000;
const MOON_DISTANCE = 3600;
const MOON_SIZE = 180;
const UP = new Vector3(0, 1, 0);
/** Strength of the night sky's glow in the sky's light units (tuned live). */
const NIGHT_GLOW = 1;

/** Uniforms added to a physical sky: the night glow, and how much clouds and storms darken it. */
export interface SkyTint {
  top: { value: Color };
  horizon: { value: Color };
  amount: { value: number };
  /** 1 clear; lower under storm clouds and in bad weather. */
  dim: { value: number };
}

/**
 * Adds to a `SkyMesh` (P2-36) the night sky's own glow (the physical sky is black once the sun is
 * down, while a real night sky stays deep blue with a lighter horizon; the colors come from the
 * sky preset) and a dimmer for storm clouds and bad weather (the sky's clouds are lit like fair
 * weather clouds, so an overcast sky would glow white).
 */
export function addSkyTint(sky: SkyMesh): SkyTint {
  const glow = {
    top: uniform(new Color(0x05081f)),
    horizon: uniform(new Color(0x1c2550)),
    amount: uniform(0),
    dim: uniform(1),
  };
  const base = sky.material.colorNode as Node<'vec4'>;
  const up = smoothstep(float(0), float(0.6), normalize(positionLocal).y);
  const night = mix(glow.horizon, glow.top, up).mul(glow.amount);
  sky.material.colorNode = vec4(base.xyz.mul(glow.dim).add(night), 1);
  return glow;
}

/** How much an overcast sky and bad weather darken the sky: 1 clear, about 0.3 in a rainy storm. */
export function skyDim(cloudCoverage: number, weatherLight: number): number {
  const overcast = Math.min(1, Math.max(0, (cloudCoverage - 0.6) / 0.4));
  return Math.max(0.3, Math.min(1, weatherLight)) * (1 - 0.55 * overcast);
}

/**
 * The Realistic style's sky (P2-36): air that scatters light (blue by day, orange and red at
 * sunrise and sunset), the sun disc, a moving cloud layer (three.js `SkyMesh`), and a moon lit by
 * the real sun, so its phase is right. Stars stay with `EnvironmentView`.
 */
export class PhysicalSky {
  readonly group = new Group();
  readonly sky = new SkyMesh();
  readonly moon: Mesh<SphereGeometry, MeshBasicNodeMaterial>;
  readonly tint: SkyTint;
  readonly #sunDirection = uniform(new Vector3(0, 1, 0));
  #moonDirection: Vector3 | null = null;

  constructor() {
    this.group.name = 'physical-sky';
    this.sky.name = 'sky';
    this.sky.scale.setScalar(SKY_SCALE);
    this.sky.frustumCulled = false;
    this.sky.cloudElevation.value = 0.6;
    this.tint = addSkyTint(this.sky);
    this.group.add(this.sky);

    // The moon: dark seas and bright highlands from noise, lit only where the sun shines on it.
    const surface = mx_fractal_noise_float(positionLocal.mul(0.035), 4, 2, 0.5);
    const seas = smoothstep(float(-0.05), float(0.2), surface);
    const albedo = mix(vec3(0.38, 0.38, 0.4), vec3(0.93, 0.92, 0.88), seas);
    const light = max(normalWorld.dot(this.#sunDirection), 0).pow(0.8);
    const material = new MeshBasicNodeMaterial({ fog: false, depthWrite: false });
    material.colorNode = albedo.mul(light.mul(1.4).add(0.03));
    this.moon = new Mesh(new SphereGeometry(MOON_SIZE / 2, 48, 24), material);
    this.moon.name = 'moon';
    this.moon.visible = false;
    this.group.add(this.moon);
  }

  /** Shows one sky state; `weatherLight` below 1 (rain, fog) covers more of the sky. */
  show(state: SkyState, weatherLight: number, nowMs: number): void {
    const physical = state.look.physical;
    const sky = this.sky;
    sky.turbidity.value = physical.turbidity;
    sky.rayleigh.value = physical.rayleigh;
    sky.mieCoefficient.value = physical.mie;
    sky.sunPosition.value.set(...state.sun).multiplyScalar(SUN_DISTANCE);
    const covered = Math.min(1, Math.max(0, 1 - weatherLight));
    sky.cloudCoverage.value = physical.cloudCoverage + (1 - physical.cloudCoverage) * covered;
    sky.cloudDensity.value = physical.cloudDensity + (1 - physical.cloudDensity) * covered * 0.8;
    // No sun disc behind a covered sky.
    sky.showSunDisc.value = sky.cloudCoverage.value < 0.9 ? 1 : 0;
    this.tint.top.value.set(state.look.skyTop);
    this.tint.horizon.value.set(state.look.skyHorizon);
    this.tint.amount.value = state.night * Math.max(0.3, weatherLight) * NIGHT_GLOW;
    this.tint.dim.value = skyDim(sky.cloudCoverage.value, weatherLight);

    // The sky places the moon opposite the sun; its phase comes from the date. The sunlight on
    // it arrives from the angle of that phase: from behind the viewer at full moon, from behind
    // the moon at new moon, from the side at half moon.
    const phase = moonPhase(nowMs);
    const clear = Math.min(1, Math.max(0, (weatherLight - 0.55) / 0.4));
    const up = state.moon ? new Vector3(...state.moon).normalize() : null;
    this.#moonDirection = up && up.y > -0.02 && phase > 0.03 && phase < 0.97 ? up : null;
    if (up) {
      const side = new Vector3().crossVectors(up, UP);
      if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
      side.normalize();
      const angle = phase * Math.PI * 2;
      this.#sunDirection.value
        .copy(up)
        .multiplyScalar(Math.cos(angle))
        .addScaledVector(side, Math.sin(angle));
    }
    this.moon.visible = this.#moonDirection !== null && state.night > 0.2 && clear > 0.2;
  }

  /** Direction the sunlight comes from on the moon's surface (follows the moon's phase). */
  get moonLight(): Vector3 {
    return this.#sunDirection.value;
  }

  /** Call every frame: the sky and the moon stay around the camera. */
  update(center: Vector3): void {
    this.sky.position.copy(center);
    if (this.#moonDirection) {
      this.moon.position.copy(this.#moonDirection).multiplyScalar(MOON_DISTANCE).add(center);
      this.moon.lookAt(center);
    }
  }

  dispose(): void {
    this.sky.geometry.dispose();
    this.sky.material.dispose();
    this.moon.geometry.dispose();
    this.moon.material.dispose();
  }
}
