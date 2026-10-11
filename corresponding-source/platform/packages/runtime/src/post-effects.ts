import { TidewaterPost } from './post/index.js';
import type { PerspectiveCamera } from 'three/webgpu';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import {
  type Node,
  RenderPipeline,
  type Camera,
  type Scene,
  type Texture,
  TSL,
  type WebGPURenderer,
} from 'three/webgpu';

const { float, mix, pass, screenUV, sin, smoothstep, texture, time, uniform, vec2, vec3, vec4 } = TSL;

/**
 * Bloom settings: a soft glow around the sun only. The scene is measured before tone mapping, where
 * the physical sky's horizon is already bright, so the threshold is high (tuned live).
 */
const BLOOM = { strength: 0.25, radius: 0.4, threshold: 20 } as const;

/**
 * Under water (P2-39): what the world looks like with the camera below the surface. The far
 * distance fades into blue-green because water swallows the light over a few meters, caustics
 * play over everything, and the whole picture sways.
 */
const UNDERWATER = {
  /** Color the distance fades into. Kept light: the owner asked for crystal-clear water, so
   * being under it should read as clear blue-green, not as murk. */
  tint: [0.1, 0.38, 0.42] as const,
  /** Meters at which the view is fully that color. Far, for the same reason. */
  reach: 36,
  /** How far the picture sways, as a share of the screen. */
  wobble: 0.0035,
  /** How strongly the caustics play over the image. */
  caustics: 0.22,
  /** How bright the rays of light are (high quality only). */
  rays: 0.16,
  /** Seconds for the view to change when the head goes under or comes back up. */
  fade: 0.25,
} as const;

export interface UnderwaterSettings {
  /** Fog and caustics; the cheap part, on at every quality. */
  on: boolean;
  /** Rays of light slanting down through the water (high quality only). */
  rays: boolean;
}

/**
 * Screen effects after the scene is drawn (P2-36, P2-39): bloom for the realistic sky, and the
 * underwater view. A pipeline is built whenever either is wanted; with both off it draws the plain
 * way, so other styles pay nothing. Bloom and the underwater view are independent on purpose: a
 * phone runs with bloom off and must still be able to go under water.
 */
export class PostEffects {
  #pipeline: RenderPipeline | null = null;
  #tidewater: TidewaterPost | null = null;
  #worldLook: 'genvr' | 'tidewater' = 'genvr';
  #bloom = false;
  #underwater: UnderwaterSettings = { on: false, rays: false };
  /** 0 above water, 1 under it; moved gradually so breaking the surface is not a hard cut. */
  readonly #depth = uniform(0);
  #caustics: Texture | null = null;

  constructor(
    private readonly renderer: WebGPURenderer,
    private readonly scene: Scene,
    private readonly camera: Camera,
  ) {}

  /** The caustics picture, shared with the water (it loads once). */
  setCaustics(caustics: Texture): void {
    if (this.#caustics === caustics) return;
    this.#caustics = caustics;
    if (this.#pipeline || this.#tidewater) this.#rebuild();
  }

  set(
    bloomOn: boolean,
    underwater: UnderwaterSettings = { on: false, rays: false },
    worldLook: 'genvr' | 'tidewater' = 'genvr',
  ): void {
    const same =
      worldLook === this.#worldLook &&
      bloomOn === this.#bloom &&
      underwater.on === this.#underwater.on &&
      underwater.rays === this.#underwater.rays;
    if (same) return;
    this.#worldLook = worldLook;
    this.#bloom = bloomOn;
    this.#underwater = { ...underwater };
    this.#rebuild();
  }

  /**
   * How far under the water the camera is, 0 to 1. Kept apart from `set` because it changes every
   * frame: moving it never rebuilds the pipeline, it only moves a number the shader already reads.
   */
  setSubmerged(amount: number): void {
    this.#depth.value = Math.max(0, Math.min(1, amount));
  }

  /** Seconds the view takes to go under or come back up. */
  get fadeSeconds(): number {
    return UNDERWATER.fade;
  }

  #rebuild(): void {
    this.#tidewater?.dispose();
    this.#tidewater = null;
    this.#pipeline?.dispose();
    this.#pipeline = null;
    if (!this.#bloom && !this.#underwater.on) return;

    const pipeline = new RenderPipeline(this.renderer);
    const scenePass = pass(this.scene, this.camera);
    let output: Node<'vec3'> = scenePass.getTextureNode('output').rgb;

    if (this.#underwater.on) {
      const under = this.#depth;
      // The picture sways, more the deeper the camera is under.
      const sway = vec2(
        sin(time.mul(1.7).add(screenUV.y.mul(9))).mul(UNDERWATER.wobble),
        sin(time.mul(2.3).add(screenUV.x.mul(7))).mul(UNDERWATER.wobble * 0.7),
      ).mul(under);
      let picture = scenePass.getTextureNode('output').sample(screenUV.add(sway)).rgb;

      // Caustics playing over everything, as if the surface were above the camera.
      if (this.#caustics) {
        const light = texture(this.#caustics, screenUV.mul(vec2(2.1, 1.4)).add(time.mul(0.03)))
          .r.mul(texture(this.#caustics, screenUV.mul(vec2(1.5, 1.1)).sub(time.mul(0.022))).r)
          .mul(UNDERWATER.caustics);
        picture = picture.add(light.mul(under));
      }

      // Rays slanting down through the water, brightest toward the top of the screen.
      if (this.#underwater.rays) {
        const beams = sin(screenUV.x.mul(18).add(screenUV.y.mul(6)).sub(time.mul(0.6)))
          .mul(0.5)
          .add(0.5);
        const fromTop = float(1).sub(screenUV.y);
        picture = picture.add(beams.mul(fromTop).mul(UNDERWATER.rays).mul(under));
      }

      // The distance swallowed by the water: everything past `reach` is the water's own color.
      const distance = scenePass.getViewZNode().negate();
      const swallowed = smoothstep(0, UNDERWATER.reach, distance).mul(under);
      const tint = vec3(UNDERWATER.tint[0], UNDERWATER.tint[1], UNDERWATER.tint[2]);
      output = mix(picture, tint, swallowed);
    }

    // Bloom wants the picture with an alpha channel; the underwater pass works in color alone.
    pipeline.outputNode = this.#bloom
      ? output.add(bloom(vec4(output, 1), BLOOM.strength, BLOOM.radius, BLOOM.threshold).rgb)
      : output;
    this.#pipeline = pipeline;
  }

  render(dt = 1 / 60): void {
    const sky = this.scene.userData.tidewaterSky,
      lighting = this.scene.userData.tidewaterLighting;
    if (
      this.#worldLook === 'tidewater' &&
      sky &&
      lighting &&
      (this.camera as PerspectiveCamera).isPerspectiveCamera
    ) {
      if (this.#tidewater && (this.#tidewater.sky !== sky || this.#tidewater.lighting !== lighting)) {
        this.#tidewater.dispose();
        this.#tidewater = null;
      }
      this.#tidewater ??= new TidewaterPost(
        this.renderer,
        this.scene,
        this.camera as PerspectiveCamera,
        sky,
        lighting,
        this.#caustics,
        this.#underwater.rays,
      );
      this.#tidewater.render(dt, this.#underwater.on ? this.#depth.value : 0);
      return;
    }
    this.#tidewater?.dispose();
    this.#tidewater = null;
    if (this.#pipeline) this.#pipeline.render();
    else this.renderer.render(this.scene, this.camera);
  }

  /** A filming cut must not blend pixels from the previous shot. */
  resetHistory(): void { this.#tidewater?.resetHistory(); }

  dispose(): void {
    this.#tidewater?.dispose();
    this.#tidewater = null;
    this.#pipeline?.dispose();
    this.#pipeline = null;
  }
}
