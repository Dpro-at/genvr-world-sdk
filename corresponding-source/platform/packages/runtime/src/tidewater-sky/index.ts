/*
 * Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC,
 * MIT (see ./LICENSE-tidewater.md). Sources: src/App.js 75-81 (sky defaults), 441-475 (`updateSun`,
 * `applyAtmosphereReadback`), src/sky/Atmosphere.js, src/sky/Sky.js.
 *
 * `TidewaterSky`: the Tidewater world's sky (decision 130, plan task 3) for WebGPU High and Ultra
 * (`worldLook: 'tidewater'`). One public entry: the atmosphere LUTs, the sky dome around the camera, the key light
 * (sun by day, moon by night) and an environment map of the sky for image based light. Clouds (task 4), the GGX/SH
 * environment (task 5) and the post chain (task 6) build on it. Phones, WebGL2 and graphics 1-6 never make one.
 */
import {
  ACESFilmicToneMapping,
  Color,
  Group,
  Scene,
  TSL,
  Vector3,
  type Camera,
  type Mesh,
  type StorageTexture,
  type WebGPURenderer,
} from 'three/webgpu';
import { Atmosphere } from './atmosphere.js';
import { sunLight, type Vec3 } from './atmosphere-math.js';
import { SkyShading, skyDome } from './sky-dome.js';
import { TidewaterClouds } from './clouds.js';
import { TidewaterEnvironment } from './environment.js';

export { Atmosphere } from './atmosphere.js';
export {
  ATMO_RG,
  ATMO_RT,
  moonDirection,
  nightFactor,
  SUN_ILLUMINANCE,
  sunDirection,
  sunDirectionFromTime,
  sunLight,
  transmittance,
  type Vec3,
} from './atmosphere-math.js';

/** Tidewater's camera exposure (App.js `settings.exposure`). */
export const TIDEWATER_EXPOSURE = 0.55;

export interface TidewaterSkyState {
  /** Direction toward the real sun (may be below the horizon). */
  sun: Vec3;
  /** Camera exposure (Tidewater 0.55). */
  exposure: number;
  /** Weather light: 1 clear, lower dims the sky and the sun. */
  dim: number;
  windDirection?: [number, number];
  windSpeed?: number;
}

export class TidewaterSky {
  readonly group = new Group();
  readonly atmosphere = new Atmosphere();
  readonly shading = new SkyShading(this.atmosphere);
  readonly clouds: TidewaterClouds;
  readonly dome: Mesh;
  /** The key light now: direction toward it, its colour (illuminance), and how much it is night. */
  readonly light = { direction: new Vector3(0, 1, 0), color: new Color(1, 1, 1), night: 0 };
  readonly environment: TidewaterEnvironment;
  #envDim = -1;
  #on = false;
  #previousToneMapping: WebGPURenderer['toneMapping'] = ACESFilmicToneMapping;
  #previousExposure = 1;

  constructor(
    private readonly renderer: WebGPURenderer,
    private readonly scene: Scene,
    shadowMap?: StorageTexture,
  ) {
    this.clouds = new TidewaterClouds(this.atmosphere, undefined, shadowMap);
    this.group.name = 'tidewater-sky';
    this.dome = skyDome((dir) => {
      const cloud = this.clouds.sampleView(dir);
      const sunTransmission = cloud.a.mul(TSL.smoothstep(0.004, 0.04, cloud.a));
      return this.shading
        .background(dir, 1)
        .mul(cloud.a)
        .add(this.shading.moon(dir).mul(cloud.a))
        .add(this.shading.sunDisk(dir).mul(sunTransmission))
        .add(cloud.rgb)
        .mul(this.shading.params.dim);
    }, 'tidewater-sky-dome');
    this.group.add(this.dome);
    this.environment = new TidewaterEnvironment((dir) => {
      const cloud = this.clouds.sampleEnvironment(dir);
      return this.shading.environmentRadiance(dir).mul(cloud.a).add(cloud.rgb.mul(this.shading.params.dim));
    });
  }

  /** Takes over tone mapping and the scene's environment while on (EnvironmentView switches it). */
  enable(on: boolean): void {
    if (on === this.#on) return;
    this.#on = on;
    this.group.visible = on;
    if (on) {
      this.#previousToneMapping = this.renderer.toneMapping;
      this.#previousExposure = this.renderer.toneMappingExposure;
      this.renderer.toneMapping = ACESFilmicToneMapping;
      this.scene.environmentIntensity = 1;
      this.environment.timer = 0;
      this.scene.environmentNode = this.environment.environmentNode;
      this.scene.userData.tidewaterEnvironment = this.environment;
      this.scene.userData.tidewaterClouds = this.clouds;
      this.scene.userData.tidewaterSky = this;
      this.clouds.resetHistory();
    } else {
      this.renderer.toneMapping = this.#previousToneMapping;
      this.renderer.toneMappingExposure = this.#previousExposure;
      if (this.scene.environmentNode === this.environment.environmentNode) this.scene.environmentNode = null;
      if (this.scene.userData.tidewaterEnvironment === this.environment)
        delete this.scene.userData.tidewaterEnvironment;
      if (this.scene.userData.tidewaterClouds === this.clouds) delete this.scene.userData.tidewaterClouds;
      if (this.scene.userData.tidewaterSky === this) delete this.scene.userData.tidewaterSky;
    }
  }

  /** Environment map size and how far the sun moves before it is made again (the quality table). */
  setEnvironmentQuality(size: number, everyDeg: number): void {
    // Tidewater uses the same 128-face environment at both enabled quality levels.
    void size;
    void everyDeg;
  }

  /** The sky for a sun direction (App.js `updateSun`): the sky follows the real sun, the light switches to the moon. */
  show(state: TidewaterSkyState): void {
    const [x, y, z] = state.sun;
    this.atmosphere.params.sunDir.value.set(x, y, z).normalize();
    const key = sunLight(state.sun);
    this.shading.params.night.value = key.night;
    this.shading.params.starIntensity.value = key.night;
    this.shading.params.moonDir.value.set(...key.moon);
    this.shading.params.dim.value = Math.max(0.3, Math.min(1, state.dim));
    this.light.direction.set(...key.direction);
    this.light.color.setRGB(key.color[0], key.color[1], key.color[2]);
    this.light.night = key.night;
    this.clouds.night.value = key.night;
    this.clouds.keyLightDirection.value.copy(this.light.direction);
    this.clouds.keyLightColor.value.set(key.color[0], key.color[1], key.color[2]);
    this.clouds.windDirection.value.set(...(state.windDirection ?? [0.35, 0.94])).normalize();
    this.clouds.windSpeed.value = state.windSpeed ?? 12;
    this.renderer.toneMappingExposure = state.exposure;
  }

  /** Call every frame: the dome follows the camera, the LUTs and the environment map are made when due. */
  update(dt: number, camera: Vector3, viewCamera?: Camera): void {
    if (!this.#on) return;
    this.dome.position.copy(camera);
    this.atmosphere.update(this.renderer, dt, camera.y);
    if (viewCamera) this.clouds.update(this.renderer, dt, viewCamera);
    const dim = this.shading.params.dim.value;
    this.environment.update(this.renderer, dt, this.atmosphere.params.sunDir.value, dim !== this.#envDim);
    this.#envDim = dim;
  }

  /** Average sky colour just above the horizon (read back from the GPU; null before the first read-back). */
  get horizon(): Color | null {
    const h = this.atmosphere.horizon;
    return h ? new Color(h[0], h[1], h[2]).multiplyScalar(this.shading.params.dim.value) : null;
  }

  dispose(): void {
    this.enable(false);
    this.environment.dispose();
    this.atmosphere.dispose();
    this.clouds.dispose();
    for (const mesh of [this.dome]) {
      mesh.geometry.dispose();
      (mesh.material as { dispose(): void }).dispose();
    }
  }
}
