import { readSkySettings, type WorldDocument } from '@genvr/contracts';
import {
  getWeather,
  SKY_SHAPES,
  type SkyShapes,
  type StyleLook,
  type WeatherLook,
} from '@genvr/core-library';
import {
  BackSide,
  BoxGeometry,
  BufferAttribute,
  CircleGeometry,
  Color,
  StorageTexture,
  HalfFloatType,
  LinearFilter,
  DirectionalLight,
  Fog,
  FogExp2,
  Group,
  HemisphereLight,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
  SphereGeometry,
  Vector3,
  Vector2,
  TSL,
  type Camera,
  type Node,
  type BufferGeometry,
  type Scene,
  type WebGPURenderer,
} from 'three/webgpu';
import { realisticQuality, type RealisticQuality } from './realistic-quality.js';
import { cycleSky, presetSky, timeOfDay, type SkyState } from './sky-cycle.js';
import { SkyLight } from './sky-light.js';
import { PhysicalSky } from './sky-physical.js';
import { TidewaterSky } from './tidewater-sky/index.js';

/** Weather particles live in a box of this size around the player (meters). */
const BOX = { x: 50, y: 30, z: 50 } as const;
const SKY_RADIUS = 4000;
/** Stars and the moon sit just inside the sky dome. */
const STAR_RADIUS = 3600;
const STARS = 1200;
/** How often a cycling sky recolors (seconds); the change is slow, so this is invisible. */
const CYCLE_STEP = 0.5;
/** Cube clouds (P2-26): a wrapping field around the player, drifting with the wind. */
const CLOUDS = { count: 34, field: 900, height: 118, cube: 13, speed: 2.5 } as const;
/** The drawn sun: a square facing the player just inside the sky dome, with a soft glow. */
const SUN_SIZE = 240;
const MOON_SIZE = 180;
/** Styles lit by the sky keep a little of the hemisphere light under the environment map (P2-36). */
const SKY_LIT_HEMISPHERE = 0.15;
/** ...and more of it at night, when the sky gives almost no light. */
const NIGHT_HEMISPHERE = 1;
/** How much farther one sees through realistic air than through the stylized fog, and the least. */
const AIR_FAR = 2.5;
const AIR_MIN_FAR = 1200;

/** A small seeded random generator, so every player sees the same stars. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Sky, light, fog, and weather of a place (tasks P2-02, P2-06). `apply` reads the world's sky and
 * weather presets (Core Library items) and the style; it runs again whenever `set_sky` or
 * `set_weather` changes them, so changes show live for everyone. Weather particles (rain, snow,
 * dust) follow the player; storms flash lightning. Nights have stars and a moon; with a
 * day-night cycle (`set_sky` params `cycle`, minutes per day) the sun crosses the sky and the
 * colors follow the time of day.
 */
export class EnvironmentView {
  readonly group = new Group();
  readonly hemisphere = new HemisphereLight();
  readonly sun = new DirectionalLight();
  /** Where the sun sits relative to the player. */
  readonly sunOffset = new Vector3();
  readonly #dome: Mesh<SphereGeometry, MeshBasicMaterial>;
  readonly #stars: InstancedMesh<PlaneGeometry, MeshBasicMaterial>;
  readonly #moon: Mesh<BufferGeometry, MeshBasicMaterial>;
  /** Direction toward the moon while it shows. */
  #moonDirection: [number, number, number] | null = null;
  readonly #sunDisc = new Group();
  #sunDirection: [number, number, number] = [0, 1, 0];
  #clouds: InstancedMesh<BoxGeometry, MeshLambertMaterial> | null = null;
  /** Per cloud cube: the cloud's field position (x, z) and the cube's offset in it (x, y, z). */
  #cloudCubes = new Float32Array(0);
  #cloudDrift = 0;
  /** Minutes per day of the cycle, or 0 for a fixed sky. */
  #cycle = 0;
  #cycleWait = 0;
  #phase: SkyState['phase'] = 'day';
  #night = 0;
  readonly #fog = new Fog(0xffffff, 60, 900);
  /** Air fog of styles lit by the sky: thickens with distance like real haze (P2-36). */
  readonly #airFog = new FogExp2(0xffffff, 0.002);
  #physical: PhysicalSky | null = null;
  #tidewater: TidewaterSky | null = null;
  readonly #cloudSunColor = TSL.uniform(new Color()).setGroup(TSL.renderGroup);
  readonly #cloudShadowEnabled = TSL.uniform(0).setGroup(TSL.renderGroup);
  readonly #cloudShadowValid = TSL.uniform(0).setGroup(TSL.renderGroup);
  readonly #cloudShadowCenter = TSL.uniform(new Vector2()).setGroup(TSL.renderGroup);
  readonly #cloudShadowMap = new StorageTexture(256, 256);
  readonly #cloudShadowTexture = TSL.texture(this.#cloudShadowMap);
  readonly #skyLight: SkyLight | null;
  #quality: RealisticQuality;
  readonly #fogFar: number;
  #signature = '';
  #environment: WorldDocument['environment'] | null = null;
  #weather: WeatherLook | null = null;
  /** How much rain, snow or sand falls (WORLD-W4): `weather.params.strength`, 0.2–2 of the preset's own. */
  #strength = 1;
  #particles: InstancedMesh | null = null;
  #offsets = new Float32Array(0);
  #baseLight = { hemisphere: 1, sun: 1 };
  #lightning = { next: 6, flash: 0 };
  /** Called at each lightning flash (the audio system plays thunder a moment later). */
  onLightning: (() => void) | null = null;
  readonly #dummy = new Object3D();

  constructor(
    private readonly scene: Scene,
    private style: StyleLook,
    /** Far end of clear-air fog for this map size. */
    fogFar: number,
    /** Fewer particles on phones and tablets. */
    private readonly quality = 1,
    /** Needed for light from the sky (Realistic); without it styles lit by the sky show the sky only. */
    private readonly renderer?: WebGPURenderer,
  ) {
    this.#fogFar = fogFar;
    this.#skyLight = renderer ? new SkyLight(renderer, scene) : null;
    this.#quality = realisticQuality({ quality: 0, touchDevice: quality < 1 });
    this.#cloudShadowMap.name = 'tidewaterCloudShadow';
    this.#cloudShadowMap.type = HalfFloatType;
    this.#cloudShadowMap.minFilter = this.#cloudShadowMap.magFilter = LinearFilter;
    this.#cloudShadowMap.generateMipmaps = false;
    // DirectionalLightNode captures colorNode on first render. Keep the node stable across quality changes.
    const shadowUV = TSL.positionWorld.xz.sub(this.#cloudShadowCenter).div(12000).add(0.5);
    const edge = TSL.clamp(
      TSL.min(
        TSL.min(shadowUV.x, shadowUV.y),
        TSL.min(TSL.float(1).sub(shadowUV.x), TSL.float(1).sub(shadowUV.y)),
      ).mul(32),
      0,
      1,
    );
    const shadow = this.#cloudShadowTexture.sample(shadowUV).r;
    (this.sun as DirectionalLight & { colorNode?: Node }).colorNode = this.#cloudSunColor.mul(
      TSL.mix(1, shadow, this.#cloudShadowEnabled.mul(this.#cloudShadowValid).mul(edge).mul(0.85)),
    );
    this.group.name = 'environment';
    this.#dome = new Mesh(
      new SphereGeometry(SKY_RADIUS, 32, 16),
      new MeshBasicMaterial({ vertexColors: true, side: BackSide, fog: false }),
    );
    this.#dome.name = 'sky';
    this.#dome.geometry.setAttribute(
      'color',
      new BufferAttribute(new Float32Array(this.#dome.geometry.getAttribute('position').count * 3), 3),
    );
    this.group.add(this.#dome);

    // Stars: small squares facing the middle, spread over the upper sky (fewer on phones).
    const random = seeded(7);
    const count = Math.round(STARS * Math.max(0.5, quality));
    this.#stars = new InstancedMesh(
      new PlaneGeometry(1, 1),
      new MeshBasicMaterial({ color: 0xffffff, transparent: true, fog: false, depthWrite: false }),
      count,
    );
    this.#stars.name = 'stars';
    this.#stars.frustumCulled = false;
    const star = new Color();
    for (let i = 0; i < count; i += 1) {
      const azimuth = random() * Math.PI * 2;
      const height = 0.05 + random() * 0.95; // above the horizon haze
      const flat = Math.sqrt(1 - height * height);
      this.#dummy.position.set(
        Math.cos(azimuth) * flat * STAR_RADIUS,
        height * STAR_RADIUS,
        Math.sin(azimuth) * flat * STAR_RADIUS,
      );
      this.#dummy.lookAt(0, 0, 0);
      this.#dummy.scale.setScalar(5 + random() * random() * 14);
      this.#dummy.updateMatrix();
      this.#stars.setMatrixAt(i, this.#dummy.matrix);
      this.#stars.setColorAt(i, star.setScalar(0.45 + random() * 0.55));
    }
    this.#stars.visible = false;
    this.group.add(this.#stars);

    this.#moon = new Mesh(
      this.#moonGeometry(),
      new MeshBasicMaterial({ color: 0xe9edf7, transparent: true, fog: false, depthWrite: false }),
    );
    this.#moon.name = 'moon';
    this.#moon.visible = false;
    this.group.add(this.#moon);

    // The drawn sun: a bright square with a larger, faint one behind it as a glow.
    const glow = new Mesh(
      new PlaneGeometry(SUN_SIZE * 1.9, SUN_SIZE * 1.9),
      new MeshBasicMaterial({
        color: 0xfff6d8,
        transparent: true,
        opacity: 0.3,
        fog: false,
        depthWrite: false,
      }),
    );
    const disc = new Mesh(
      new PlaneGeometry(SUN_SIZE, SUN_SIZE),
      new MeshBasicMaterial({ color: 0xfff2a8, transparent: true, fog: false, depthWrite: false }),
    );
    disc.position.z = 1;
    this.#sunDisc.add(glow, disc);
    this.#sunDisc.name = 'sun';
    this.#sunDisc.visible = false;
    this.group.add(this.#sunDisc);
    this.#buildClouds();
    this.scene.fog = this.#fog;
    this.#applyLighting();
  }

  /** True for styles lit by a physical sky (Realistic, P2-36). */
  get realistic(): boolean {
    return this.style.lighting === 'sky';
  }

  /** Quality of the realistic sky and light; applies at once. */
  setRealisticQuality(quality: RealisticQuality): void {
    this.#quality = quality;
    this.#applyLighting();
    this.#signature = '';
    if (this.#environment) this.apply(this.#environment);
  }

  /** Switches between the gradient dome with a hemisphere light and the physical sky. */
  #applyLighting(): void {
    const realistic = this.realistic;
    const tropical = realistic && this.#quality.worldLook === 'tidewater' && !!this.renderer;
    if (!tropical) this.#tidewater?.enable(false);
    this.#cloudShadowEnabled.value = tropical ? 1 : 0;
    if (tropical && !this.#tidewater) {
      this.#tidewater = new TidewaterSky(this.renderer!, this.scene, this.#cloudShadowMap);
      this.group.add(this.#tidewater.group);
    }
    this.#tidewater?.setEnvironmentQuality(this.#quality.envSize, this.#quality.envEveryDeg);
    if (realistic && !tropical && !this.#physical) {
      this.#physical = new PhysicalSky();
      this.group.add(this.#physical.group);
    } else if ((!realistic || tropical) && this.#physical) {
      this.group.remove(this.#physical.group);
      this.#physical.dispose();
      this.#physical = null;
    }
    this.#dome.visible = !realistic;
    this.scene.fog = realistic ? this.#airFog : this.#fog;
    this.#skyLight?.enable(realistic && !tropical);
    this.#tidewater?.enable(tropical);
  }

  get #shapes(): SkyShapes {
    return this.style.sky ?? SKY_SHAPES;
  }

  #moonGeometry(): BufferGeometry {
    return this.#shapes.moon === 'square'
      ? new PlaneGeometry(MOON_SIZE, MOON_SIZE)
      : new CircleGeometry(MOON_SIZE / 2, 32);
  }

  /** Cube clouds for styles that have them: small flat heaps of cubes on a seeded layout. */
  #buildClouds(): void {
    if (this.#clouds) {
      this.group.remove(this.#clouds);
      this.#clouds.geometry.dispose();
      this.#clouds.material.dispose();
      this.#clouds = null;
    }
    if (this.#shapes.clouds !== 'cubes') return;
    const random = seeded(11);
    const cubes: number[] = [];
    for (let cloud = 0; cloud < CLOUDS.count; cloud += 1) {
      const cx = random() * CLOUDS.field;
      const cz = random() * CLOUDS.field;
      const cy = CLOUDS.height + (random() - 0.5) * 30;
      // A lower layer of 3-6 by 2-4 cubes with gaps at the corners, and a smaller layer on top.
      const w = 3 + Math.floor(random() * 5);
      const d = 2 + Math.floor(random() * 3);
      for (let i = 0; i < w; i += 1)
        for (let k = 0; k < d; k += 1) {
          const corner = (i === 0 || i === w - 1) && (k === 0 || k === d - 1);
          if (corner && random() < 0.7) continue;
          cubes.push(cx, cz, (i - w / 2) * CLOUDS.cube, cy, (k - d / 2) * CLOUDS.cube);
        }
      for (let i = 1; i < w - 1; i += 1)
        if (random() < 0.6) cubes.push(cx, cz, (i - w / 2) * CLOUDS.cube, cy + CLOUDS.cube * 0.5, 0);
    }
    this.#cloudCubes = new Float32Array(cubes);
    const count = cubes.length / 5;
    this.#clouds = new InstancedMesh(
      new BoxGeometry(CLOUDS.cube, CLOUDS.cube * 0.5, CLOUDS.cube),
      new MeshLambertMaterial({ color: 0xffffff, emissive: 0x8e9aa8, fog: false }),
      count,
    );
    this.#clouds.name = 'clouds';
    this.#clouds.frustumCulled = false;
    this.group.add(this.#clouds);
  }

  /** Applies the world's sky and weather; cheap when nothing changed. */
  apply(environment: WorldDocument['environment']): void {
    this.#environment = environment;
    const cycle = Number(environment.sky.params.cycle ?? 0);
    this.#cycle = Number.isFinite(cycle) && cycle > 0 ? cycle : 0;
    const signature = `${environment.sky.preset}/${environment.weather.preset}/${JSON.stringify(environment.sky.params)}/${JSON.stringify(environment.weather.params ?? {})}`;
    if (signature === this.#signature) return;
    this.#signature = signature;
    const strength = Number(environment.weather.params?.strength ?? 1);
    this.#strength = Number.isFinite(strength) ? Math.min(2, Math.max(0.2, strength)) : 1;
    this.#weather = getWeather(environment.weather.preset).look;
    this.#showSky(this.#skyNow());
    this.#setWeather(this.#weather);
  }

  /** The sky right now: the preset, or the cycle's time of day (a storm sky keeps its clouds). */
  #skyNow(): SkyState {
    const preset = this.#environment?.sky.preset ?? 'day';
    if (!this.#cycle) return presetSky(preset, this.#environment?.sky.params);
    if (preset === 'tropical')
      return presetSky(preset, {
        ...this.#environment?.sky.params,
        timeOfDay: timeOfDay(Date.now(), this.#cycle) * 24,
      });
    const sky = cycleSky(timeOfDay(Date.now(), this.#cycle));
    if (preset !== 'storm') return sky;
    // Storm clouds all day; the cycle only darkens them at night.
    const storm = presetSky('storm').look;
    const dim = 1 - sky.night * 0.7;
    return {
      ...sky,
      phase: 'storm',
      look: {
        ...storm,
        sun: { ...storm.sun, intensity: storm.sun.intensity * dim },
        ambient: { ...storm.ambient, intensity: storm.ambient.intensity * dim },
      },
    };
  }

  /** Sky dome, fog, lights, stars, and moon for one sky state under the current weather. */
  #showSky(state: SkyState): void {
    this.#phase = state.phase;
    this.#night = state.night;
    const sky = state.look;
    const weather = this.#weather ?? getWeather('clear').look;

    // Sky dome: horizon to top gradient, darker in bad weather.
    const top = new Color(sky.skyTop).multiplyScalar(weather.light);
    const horizon = new Color(sky.skyHorizon).lerp(new Color(sky.fog), 1 - weather.light);
    const positions = this.#dome.geometry.getAttribute('position');
    const colors = this.#dome.geometry.getAttribute('color') as BufferAttribute;
    const color = new Color();
    for (let i = 0; i < positions.count; i += 1) {
      const t = Math.max(0, positions.getY(i) / SKY_RADIUS);
      color.copy(horizon).lerp(top, Math.pow(t, 0.6));
      colors.setXYZ(i, color.r, color.g, color.b);
    }
    colors.needsUpdate = true;

    // Fog: weather brings it closer and may tint it (sandstorm).
    this.#fog.color.set(weather.fogColor ?? sky.fog).multiplyScalar(Math.max(0.55, weather.light));
    this.#fog.near = weather.fogNear;
    this.#fog.far = Math.max(weather.fogNear + 20, this.#fogFar * weather.fogScale);

    // Light: the style brightens toon looks, the weather dims storms; the sun by day, the moon
    // by night.
    const light = weather.light * this.style.light;
    this.hemisphere.color.set(sky.ambient.sky);
    this.hemisphere.groundColor.set(sky.ambient.ground);
    this.hemisphere.intensity = sky.ambient.intensity * light;
    this.sun.color.set(sky.sun.color);
    this.sun.intensity = sky.sun.intensity * light * state.lightShare;
    this.#baseLight = { hemisphere: this.hemisphere.intensity, sun: this.sun.intensity };
    this.sunOffset.set(...state.light).multiplyScalar(120);

    // Stars and the moon at night, hidden behind clouds, rain, and fog.
    const clear = Math.min(1, Math.max(0, (weather.light - 0.55) / 0.4));
    const stars = state.night * clear;
    this.#stars.material.opacity = stars;
    this.#stars.visible = stars > 0.02;
    const moon = state.moon ? Math.min(1, state.night * 2 + 0.25) * clear : 0;
    this.#moon.material.opacity = moon;
    this.#moon.visible = moon > 0.02;
    this.#moonDirection = state.moon;

    // The drawn sun (Voxel): while the light comes from the sun, fading behind clouds and rain.
    const sunShows = this.#shapes.sun === 'square' && state.night < 0.5 ? state.lightShare * clear : 0;
    this.#sunDisc.visible = sunShows > 0.02;
    for (const part of this.#sunDisc.children as Mesh<PlaneGeometry, MeshBasicMaterial>[])
      part.material.opacity = sunShows * (part === this.#sunDisc.children[0] ? 0.3 : 1);
    this.#sunDirection = state.light;

    // Clouds: white on clear days, grey in bad weather, dark at night.
    if (this.#clouds) {
      const cloud = new Color(0xffffff).lerp(new Color(0x7d8794), Math.min(1, (1 - weather.light) * 1.6));
      cloud.multiplyScalar(1 - state.night * 0.75);
      this.#clouds.material.color.copy(cloud);
      this.#clouds.material.emissive.copy(cloud).multiplyScalar(0.55);
    }

    if (this.#physical) this.#showPhysical(state, weather);
    if (this.#tidewater && this.#quality.worldLook === 'tidewater' && this.realistic) {
      const settings = readSkySettings(this.#environment?.sky.params);
      const windAngle = ((settings.windDirection ?? sky.tidewater?.windDirection ?? 200.42) * Math.PI) / 180;
      this.#tidewater.show({
        sun: state.sun,
        exposure: sky.tidewater?.exposure ?? sky.physical.exposure,
        dim: weather.light,
        windDirection: [-Math.sin(windAngle), -Math.cos(windAngle)],
        windSpeed: (settings.windSpeed ?? sky.tidewater?.windSpeed ?? 7) * (12 / 7),
      });
      this.sunOffset.copy(this.#tidewater.light.direction).multiplyScalar(120);
      this.sun.color.copy(this.#tidewater.light.color);
      this.sun.intensity = weather.light * this.style.light;
      this.hemisphere.intensity = 0; // Tidewater SH9 supplies diffuse sky illumination.
      this.#baseLight = { sun: this.sun.intensity, hemisphere: this.hemisphere.intensity };
      this.#stars.visible = false;
      this.#moon.visible = false;
      this.#airFog.color.set(weather.fogColor ?? sky.fog);
      this.#airFog.density = 2.15 / Math.max(AIR_MIN_FAR, this.#fogFar * AIR_FAR);
    }
    this.#cloudSunColor.value.copy(this.sun.color).multiplyScalar(this.sun.intensity);
  }

  /** The physical sky, its light, and the air fog for one sky state (Realistic, P2-36). */
  #showPhysical(state: SkyState, weather: WeatherLook): void {
    const physical = this.#physical!;
    physical.show(state, weather.light, Date.now());
    // Under storm clouds the sun only comes through weakly (soft light, faint shadows).
    const dim = physical.tint.dim.value;
    this.sun.intensity *= dim * dim;
    this.#baseLight.sun = this.sun.intensity;
    // The moon of the physical sky replaces the flat one.
    this.#moon.visible = false;
    // By day the environment map lights the scene; at night some hemisphere light stays (moonlight).
    this.hemisphere.intensity *= SKY_LIT_HEMISPHERE + (NIGHT_HEMISPHERE - SKY_LIT_HEMISPHERE) * state.night;
    this.#baseLight.hemisphere = this.hemisphere.intensity;
    this.#airFog.color.set(weather.fogColor ?? state.look.fog).multiplyScalar(Math.max(0.35, weather.light));
    // Real air is clearer than the stylized fog: see about 2.5 times farther, at least 1.2 km.
    const clearAir = Math.max(AIR_MIN_FAR, this.#fogFar * AIR_FAR);
    const far = Math.max(weather.fogNear + 40, clearAir * this.#quality.fogScale * weather.fogScale);
    // About 99% hidden at the far distance: exp(-(density * far)^2) = 0.01.
    this.#airFog.density = 2.15 / far;
    this.#skyLight?.show(state, physical.sky, physical.tint, this.sun, this.#quality, weather.light);
  }

  /** A new style (its light changes the scene); applies the current sky and weather again. */
  setStyle(style: StyleLook): void {
    const before = this.#shapes;
    this.style = style;
    const after = this.#shapes;
    if (before.moon !== after.moon) {
      this.#moon.geometry.dispose();
      this.#moon.geometry = this.#moonGeometry();
    }
    if (before.clouds !== after.clouds) this.#buildClouds();
    this.#applyLighting();
    this.#signature = '';
    if (this.#environment) this.apply(this.#environment);
  }

  #setWeather(weather: WeatherLook): void {
    this.#weather = weather;
    if (this.#particles) {
      this.group.remove(this.#particles);
      this.#particles.geometry.dispose();
      (this.#particles.material as MeshBasicMaterial).dispose();
      this.#particles = null;
    }
    const count = Math.round(weather.count * this.quality * this.#strength);
    if (weather.particles === 'none' || count === 0) return;
    // Pixel drops (Voxel): short square raindrops and cube snowflakes instead of thin streaks.
    const pixel = this.#shapes.drops === 'pixel';
    const size: [number, number, number] =
      weather.particles === 'rain'
        ? pixel
          ? [0.07, 0.32, 0.07]
          : [0.025, 0.55, 0.025]
        : weather.particles === 'snow'
          ? pixel
            ? [0.16, 0.16, 0.16]
            : [0.09, 0.09, 0.09]
          : pixel
            ? [0.1, 0.1, 0.1]
            : [0.05, 0.05, 0.05];
    const material = new MeshBasicMaterial({
      color: pixel && weather.particles === 'rain' ? 0xa8d8ff : weather.particleColor,
      transparent: true,
      opacity: weather.particles === 'snow' ? 0.95 : pixel ? 0.8 : 0.6,
    });
    this.#particles = new InstancedMesh(new BoxGeometry(...size), material, count);
    this.#particles.name = `weather:${weather.particles}`;
    this.#particles.frustumCulled = false;
    this.#offsets = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      this.#offsets[i * 3] = Math.random() * BOX.x;
      this.#offsets[i * 3 + 1] = Math.random() * BOX.y;
      this.#offsets[i * 3 + 2] = Math.random() * BOX.z;
    }
    this.group.add(this.#particles);
  }

  /** How much night it is now: 0 by day, 1 in deep night (lamps shine from about a quarter). */
  get night(): number {
    return this.#night;
  }

  /** The sky shown now, by name (a cycling sky moves through day, sunset, and night). */
  get lightingNight(): number { return this.#tidewater?.light.night ?? 0; }

  get skyPhase(): SkyState['phase'] {
    return this.#phase;
  }

  /** The time of day in the cycle (0 midnight, 0.5 noon), or null for a fixed sky. */
  get timeOfDay(): number | null {
    return this.#cycle ? timeOfDay(Date.now(), this.#cycle) : null;
  }

  /** Call every frame with the player's and the camera's positions. */
  update(dt: number, center: Vector3, time: number, eye?: Vector3, camera?: Camera): void {
    this.#dome.position.copy(center);
    this.#stars.position.copy(center);
    this.#physical?.update(eye ?? center);
    this.#tidewater?.update(dt, eye ?? center, camera);
    if (this.#cycle) {
      this.#cycleWait -= dt;
      if (this.#cycleWait <= 0) {
        this.#cycleWait = CYCLE_STEP;
        this.#showSky(this.#skyNow());
        // The stars turn with the night.
        this.#stars.rotation.set(0.4, (this.timeOfDay ?? 0) * Math.PI * 2, 0);
      }
    }
    if (this.#moonDirection) {
      this.#moon.position
        .set(...this.#moonDirection)
        .multiplyScalar(STAR_RADIUS)
        .add(center);
      this.#moon.lookAt(center);
    }
    if (this.#sunDisc.visible) {
      this.#sunDisc.position
        .set(...this.#sunDirection)
        .multiplyScalar(STAR_RADIUS)
        .add(center);
      this.#sunDisc.lookAt(center);
    }
    if (this.#clouds) this.#moveClouds(dt, center);
    const weather = this.#weather;
    const particles = this.#particles;
    if (weather && particles) {
      // Particles move in a box that wraps around the player, so they never run out.
      const tilt = weather.particles === 'rain' ? Math.atan2(weather.wind, weather.fall) : 0;
      const wrap = (value: number, size: number) => ((value % size) + size) % size;
      for (let i = 0; i < particles.count; i += 1) {
        const o = i * 3;
        const sway = weather.particles === 'snow' ? Math.sin(time * 0.8 + i) * 0.3 : 0;
        this.#offsets[o] = (this.#offsets[o] ?? 0) + (weather.wind + sway) * dt;
        this.#offsets[o + 1] = (this.#offsets[o + 1] ?? 0) - weather.fall * dt;
        this.#dummy.position.set(
          center.x - BOX.x / 2 + wrap((this.#offsets[o] ?? 0) - center.x, BOX.x),
          center.y - 5 + wrap(this.#offsets[o + 1] ?? 0, BOX.y),
          center.z - BOX.z / 2 + wrap((this.#offsets[o + 2] ?? 0) - center.z, BOX.z),
        );
        this.#dummy.rotation.set(0, 0, -tilt);
        // Too close to the camera a particle fills the screen: hide it for this frame.
        this.#dummy.scale.setScalar(eye && this.#dummy.position.distanceToSquared(eye) < 4 ? 0.0001 : 1);
        this.#dummy.updateMatrix();
        particles.setMatrixAt(i, this.#dummy.matrix);
      }
      particles.instanceMatrix.needsUpdate = true;
    }
    // Lightning: a short double flash every few seconds in storms.
    if (weather?.lightning) {
      this.#lightning.next -= dt;
      if (this.#lightning.next <= 0) {
        this.#lightning = { next: 4 + Math.random() * 7, flash: 0.35 };
        this.onLightning?.();
      }
      if (this.#lightning.flash > 0) {
        this.#lightning.flash -= dt;
        const on =
          this.#lightning.flash > 0.25 || (this.#lightning.flash > 0.05 && this.#lightning.flash < 0.15);
        this.hemisphere.intensity = this.#baseLight.hemisphere * (on ? 4 : 1);
        this.sun.intensity = this.#baseLight.sun * (on ? 2.5 : 1);
      }
    }
    this.#cloudSunColor.value.copy(this.sun.color).multiplyScalar(this.sun.intensity);
    if (this.#tidewater) {
      this.#cloudShadowCenter.value.copy(this.#tidewater.clouds.shadowCenter.value);
      this.#cloudShadowValid.value = this.#tidewater.clouds.viewValid.value;
    }
  }

  /** Clouds drift with the wind in a field that wraps around the player, so they never run out. */
  #moveClouds(dt: number, center: Vector3): void {
    const clouds = this.#clouds!;
    const wind = (this.#weather?.wind ?? 0) * 2 + CLOUDS.speed;
    this.#cloudDrift += wind * dt;
    const field = CLOUDS.field;
    const wrap = (value: number) => ((value % field) + field) % field;
    const cubes = this.#cloudCubes;
    this.#dummy.rotation.set(0, 0, 0);
    this.#dummy.scale.setScalar(1);
    for (let i = 0; i < clouds.count; i += 1) {
      const o = i * 5;
      this.#dummy.position.set(
        center.x - field / 2 + wrap(cubes[o]! + this.#cloudDrift - center.x) + cubes[o + 2]!,
        cubes[o + 3]!,
        center.z - field / 2 + wrap(cubes[o + 1]! - center.z) + cubes[o + 4]!,
      );
      this.#dummy.updateMatrix();
      clouds.setMatrixAt(i, this.#dummy.matrix);
    }
    clouds.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.#cloudShadowMap.dispose();
    this.#tidewater?.dispose();
    this.#physical?.dispose();
    this.#skyLight?.dispose();
    if (this.#clouds) {
      this.#clouds.geometry.dispose();
      this.#clouds.material.dispose();
    }
    for (const part of this.#sunDisc.children as Mesh<PlaneGeometry, MeshBasicMaterial>[]) {
      part.geometry.dispose();
      part.material.dispose();
    }
    this.#dome.geometry.dispose();
    this.#dome.material.dispose();
    this.#stars.geometry.dispose();
    this.#stars.material.dispose();
    this.#moon.geometry.dispose();
    this.#moon.material.dispose();
    if (this.#particles) {
      this.#particles.geometry.dispose();
      (this.#particles.material as MeshBasicMaterial).dispose();
    }
  }
}
