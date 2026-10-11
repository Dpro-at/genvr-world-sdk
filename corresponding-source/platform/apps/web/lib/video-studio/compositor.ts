'use client';
/**
 * FILM-05 GPU compositor: stacks the picture layers of one film moment with three.js (WebGPU, or
 * WebGL2 where WebGPU is missing). Per layer: source -> effects -> transform -> blend. An adjustment
 * layer (effect track) applies its effect to everything drawn below it. The CPU references in
 * `@genvr/film` (`effects.ts`) define what each effect and blend mode must do.
 */
import {
  CanvasTexture, Color, CustomBlending, Mesh, MeshBasicNodeMaterial, NormalBlending, OneFactor, OneMinusSrcColorFactor, OrthographicCamera,
  PlaneGeometry, RenderTarget, SRGBColorSpace, Scene, SrcAlphaFactor, SrcColorFactor, VideoTexture, WebGPURenderer, ZeroFactor,
  type Texture,
} from 'three/webgpu';
import * as TSL from 'three/tsl';
import type { BlendMode, CaptionClip, ClipEffect, EffectClip, EffectValues, MediaClip, Transform, TransitionSpec } from '@genvr/film';
import { IDENTITY_TRANSFORM, shakeOffset } from '@genvr/film';

/* eslint-disable @typescript-eslint/no-explicit-any -- TSL node graphs are untyped here, as in runtime/src/post */
const { texture, uv, uniform, vec2, vec3, vec4, float, mix, dot, clamp, smoothstep, length, step, abs, sqrt, cos, sin, atan, floor, fract, max } = TSL as any;

export type MediaLayer = { kind: 'media'; clip: MediaClip; video: HTMLVideoElement; /** seconds since the clip start (shake) */ local?: number };
export type Layer =
  | MediaLayer
  | { kind: 'adjust'; clip: EffectClip; local?: number }
  /** A title (FILM-01) or particles (FILM-03a): drawn into a frame-sized canvas, placed with the clip's transform. */
  | { kind: 'title'; clip: CaptionClip | EffectClip; canvas: HTMLCanvasElement }
  /** A transition (FILM-01): both clips, mixed by `progress` 0 (all `a`) .. 1 (all `b`). */
  | { kind: 'transition'; clip: MediaClip; spec: TransitionSpec; progress: number; a: MediaLayer; b: MediaLayer };

/** The mask of a transition kind at `at` for progress `p` (matches `transitionMask` in `@genvr/film`). */
function transitionColour(kind: TransitionSpec['kind'], a: any, b: any, at: any, p: any, u: Record<string, any>, aspect: number) {
  if (kind === 'dissolve') return mix(a, b, p);
  if (kind === 'dip_black' || kind === 'dip_white') {
    const c = kind === 'dip_black' ? vec3(0) : vec3(1);
    return mix(mix(a, c, clamp(p.mul(2), 0, 1)), mix(c, b, clamp(p.sub(0.5).mul(2), 0, 1)), step(0.5, p));
  }
  let mask: any;
  const soft = u.softness ?? float(0);
  if (kind === 'wipe') {
    const angle = u.angle.mul(Math.PI / 180);
    const d = dot(at.sub(0.5), vec2(cos(angle), sin(angle))).add(0.5);
    const edge = p.mul(soft.add(1));
    mask = float(1).sub(smoothstep(edge.sub(soft), edge, d));
  } else if (kind === 'iris') {
    const r = length(at.sub(vec2(u.x, u.y)).mul(vec2(aspect, 1)));
    const edge = p.mul(soft.add(Math.hypot(aspect, 1)));
    mask = float(1).sub(smoothstep(edge.sub(soft), edge, r));
  } else if (kind === 'shape') {
    const q = at.sub(0.5).mul(vec2(aspect, 1));
    const r = length(q);
    const shape = u.shapeName as string;
    const dist = shape === 'circle' ? r : shape === 'diamond' ? abs(q.x).add(abs(q.y))
      : shape === 'heart' ? length(vec2(q.x.mul(1.2), q.y.sub(sqrt(abs(q.x)).mul(0.5)).add(0.1)))
      : r.div(cos(atan(q.y, q.x).mul(5)).mul(0.25).add(0.75)); // star
    const edge = p.mul(soft.add(Math.hypot(aspect, 1) * 1.6));
    mask = float(1).sub(smoothstep(edge.sub(soft), edge, dist));
  } else { // blocks
    const cell = floor(at.mul(vec2(aspect, 1)).div(u.size.div(720)));
    const h = fract(sin(dot(cell.add(u.seed), vec2(12.9898, 78.233))).mul(43758.5453));
    mask = step(h, p);
  }
  return mix(a, b, max(0, mask));
}

/** Uniform nodes for one effect instance, updated every frame so dragging a slider never rebuilds a shader. */
interface EffectUniforms { index: number; values: Record<string, any> }

/** The colour chain for a layer: blur first (it samples the source), then colour effects in order. */
function chain(source: Texture, effects: { effect: string; params: EffectValues }[], size: { x: number; y: number }, flipY = false) {
  const uniforms: EffectUniforms[] = [];
  // A render target read back on WebGPU comes out upside down; flip the lookup for those sources.
  const base = flipY ? vec2(uv().x, float(1).sub(uv().y)) : uv();
  // Shockwave (FILM-03a) moves where the picture is read from, so it comes before any sampling.
  let at = base;
  const wave = effects.findIndex((e) => e.effect === 'shockwave');
  if (wave >= 0) {
    const p = effects[wave]!.params;
    const u = { x: uniform(Number(p.x)), y: uniform(Number(p.y)), radius: uniform(Number(p.radius)), thickness: uniform(Number(p.thickness)), strength: uniform(Number(p.strength)) };
    uniforms.push({ index: wave, values: u });
    const centre = vec2(u.x, float(1).sub(u.y)), off = base.sub(centre), d = length(off.mul(vec2(size.x / size.y, 1)));
    const x = d.sub(u.radius).div(u.thickness), inside = float(1).sub(step(1, abs(x)));
    const push = u.strength.mul(0.05).mul(float(1).sub(x.mul(x))).mul(TSL.sign(x)).mul(inside);
    at = base.sub(off.div(max(d, 1e-4)).mul(push));
  }
  const blur = effects.find((e) => e.effect === 'blur');
  let colour: any;
  if (blur) {
    const radius = uniform(Number(blur.params.radius)), pixel = uniform(vec2(1 / size.x, 1 / size.y));
    uniforms.push({ index: effects.indexOf(blur), values: { radius } });
    // 1 + 2 rings x 8 taps, weighted towards the centre.
    let sum = texture(source, at).rgb.mul(2), weight = float(2);
    for (const ring of [0.5, 1]) for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + ring;
      const offset = vec2(Math.cos(a) * ring, Math.sin(a) * ring).mul(radius).mul(pixel);
      const w = ring === 0.5 ? 1.5 : 1;
      sum = sum.add(texture(source, at.add(offset)).rgb.mul(w)); weight = weight.add(w);
    }
    colour = sum.div(weight);
  } else colour = texture(source, at).rgb;
  // Coverage of the source (titles are drawn on a transparent canvas; videos are opaque).
  const alpha = texture(source, at).a;
  effects.forEach((e, index) => {
    if (e.effect === 'brightness_contrast') {
      const brightness = uniform(Number(e.params.brightness)), contrast = uniform(Number(e.params.contrast));
      uniforms.push({ index, values: { brightness, contrast } });
      colour = clamp(colour.sub(0.5).mul(contrast).add(0.5).add(brightness), 0, 1);
    } else if (e.effect === 'tint') {
      const tintColour = uniform(new Color(String(e.params.color))), amount = uniform(Number(e.params.amount));
      uniforms.push({ index, values: { color: tintColour, amount } });
      const l = dot(colour, vec3(0.2126, 0.7152, 0.0722));
      colour = clamp(mix(colour, tintColour.mul(l), amount), 0, 1);
    } else if (e.effect === 'colour') {
      const u = Object.fromEntries(['exposure', 'contrast', 'saturation', 'temperature', 'tint', 'highlights', 'shadows', 'vignette']
        .map((k) => [k, uniform(Number(e.params[k] ?? (k === 'contrast' || k === 'saturation' ? 1 : 0)))])) as Record<string, any>;
      uniforms.push({ index, values: u });
      const luma3 = vec3(0.2126, 0.7152, 0.0722);
      let v = colour.mul(TSL.pow(float(2), u.exposure));
      const warm = u.temperature.mul(0.15), green = u.tint.mul(0.15);
      v = v.mul(vec3(warm.add(1).mul(green.mul(0.5).add(1)), float(1).sub(green), float(1).sub(warm).mul(green.mul(0.5).add(1))));
      const l0 = dot(v, luma3);
      v = v.mul(float(1).add(u.highlights.mul(0.5).mul(smoothstep(0.5, 1, l0))).add(u.shadows.mul(0.5).mul(float(1).sub(smoothstep(0, 0.5, l0)))));
      const l = dot(v, luma3);
      v = mix(vec3(l), v, u.saturation);
      v = clamp(v.sub(0.5).mul(u.contrast).add(0.5), 0, 1);
      const d = length(at.sub(0.5)).div(Math.SQRT1_2);
      colour = clamp(v.mul(float(1).sub(u.vignette.mul(smoothstep(0.5, 1, d)))), 0, 1);
    } else if (e.effect === 'light_burst') {
      const u = { x: uniform(Number(e.params.x)), y: uniform(Number(e.params.y)), strength: uniform(Number(e.params.strength)),
        decay: uniform(Number(e.params.decay)), color: uniform(new Color(String(e.params.color))) };
      uniforms.push({ index, values: u });
      const centre = vec2(u.x, float(1).sub(u.y)), d = length(at.sub(centre).mul(vec2(size.x / size.y, 1)));
      // Rays: the picture's bright parts smeared toward the centre (8 taps), plus a soft glow.
      let rays = vec3(0);
      for (let k = 1; k <= 8; k++) rays = rays.add(texture(source, mix(at, centre, k * 0.06)).rgb.mul(1 / k));
      const glow = u.strength.mul(TSL.exp(d.mul(-1).mul(u.decay.mul(10).add(2))));
      colour = clamp(colour.add(rays.mul(0.12).mul(u.strength)).add(u.color.mul(glow)), 0, 1);
    } else if (e.effect === 'vignette') {
      const amount = uniform(Number(e.params.amount)), edgeStart = uniform(Number(e.params.size));
      uniforms.push({ index, values: { amount, size: edgeStart } });
      const d = length(at.sub(0.5)).div(Math.SQRT1_2);
      const edge = smoothstep(edgeStart, 1, d);
      colour = colour.mul(float(1).sub(amount.mul(edge)));
    }
  });
  return { colour, uniforms, alpha };
}

function setUniforms(uniforms: EffectUniforms[], effects: { effect: string; params: EffectValues }[]) {
  for (const u of uniforms) {
    const params = effects[u.index]?.params; if (!params) continue;
    for (const [key, node] of Object.entries(u.values)) {
      if (key === 'color') node.value.set(String(params[key])); else node.value = Number(params[key]);
    }
  }
}

/** Output and blending per mode, so the hardware blend does what `blend()` in `@genvr/film` describes. */
function finish(material: MeshBasicNodeMaterial, colour: any, mode: BlendMode, opacity: any) {
  material.transparent = true; material.depthTest = false; material.depthWrite = false;
  if (mode === 'normal') { material.blending = NormalBlending; material.colorNode = vec4(colour, opacity); return; }
  material.blending = CustomBlending;
  if (mode === 'add') { material.blendSrc = SrcAlphaFactor; material.blendDst = OneFactor; material.colorNode = vec4(colour, opacity); }
  else if (mode === 'multiply') { material.blendSrc = ZeroFactor; material.blendDst = SrcColorFactor; material.colorNode = vec4(mix(vec3(1), colour, opacity), 1); }
  else { material.blendSrc = OneFactor; material.blendDst = OneMinusSrcColorFactor; material.colorNode = vec4(colour.mul(opacity), 1); }
}

interface Built { key: string; mesh: Mesh; material: MeshBasicNodeMaterial; uniforms: EffectUniforms[]; opacity: any }

export class FilmCompositor {
  readonly canvas: HTMLCanvasElement;
  private readonly camera: OrthographicCamera;
  private readonly plane = new PlaneGeometry(1, 1);
  private readonly videos = new Map<HTMLVideoElement, VideoTexture>();
  private readonly built = new Map<string, Built>();
  private readonly targets: [RenderTarget, RenderTarget];
  /** Pairs of targets for transitions (one pair per transition drawn at the same moment). */
  private readonly pairs: [RenderTarget, RenderTarget][] = [];
  private readonly canvases = new Map<HTMLCanvasElement, CanvasTexture>();
  private constructor(private readonly renderer: WebGPURenderer, readonly width: number, readonly height: number) {
    this.canvas = renderer.domElement;
    this.camera = new OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, -10, 10);
    this.targets = [new RenderTarget(width, height), new RenderTarget(width, height)];
  }
  /** null when this browser cannot run the GPU path (the editor then draws the top picture only). */
  static async create(width: number, height: number): Promise<FilmCompositor | null> {
    try {
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const renderer = new WebGPURenderer({ canvas, antialias: false, alpha: false });
      await renderer.init();
      renderer.setPixelRatio(1); renderer.setSize(width, height, false);
      renderer.setClearColor(0x000000, 1);
      return new FilmCompositor(renderer, width, height);
    } catch { return null; }
  }

  private videoTexture(video: HTMLVideoElement) {
    let tex = this.videos.get(video);
    if (!tex) { tex = new VideoTexture(video); tex.colorSpace = SRGBColorSpace; this.videos.set(video, tex); }
    // VideoTexture uploads on new video frames only; a seeked, paused video (scrubbing, frame pictures) needs a push.
    tex.needsUpdate = true;
    return tex;
  }
  private layerMesh(id: string, source: Texture, effects: { effect: string; params: EffectValues }[], mode: BlendMode, sourceKey: string, flipY = false) {
    // The source texture is part of the key: a shader keeps the texture it was built with.
    const key = `${sourceKey}:${source.uuid}|${mode}|${effects.map((e) => e.effect).join(',')}`;
    let built = this.built.get(id);
    if (!built || built.key !== key) {
      built?.material.dispose();
      const material = new MeshBasicNodeMaterial();
      const opacity = uniform(1);
      const { colour, uniforms, alpha } = chain(source, effects, { x: this.width, y: this.height }, flipY);
      finish(material, colour, mode, opacity.mul(alpha));
      built = { key, mesh: new Mesh(this.plane, material), material, uniforms, opacity };
      this.built.set(id, built);
    }
    setUniforms(built.uniforms, effects);
    return built;
  }

  private flip() { return (this.renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend === true; }
  /** A picture layer's mesh, sized to fit the frame and placed with its transform; null until the video has a frame. */
  private mediaMesh(layer: MediaLayer, opacityScale = 1) {
    const video = layer.video, t: Transform = layer.clip.transform ?? IDENTITY_TRANSFORM;
    if (!video.videoWidth) return null;
    const effects = (layer.clip.effects ?? []).filter((e: ClipEffect) => e.enabled);
    const built = this.layerMesh(layer.clip.id, this.videoTexture(video), effects, layer.clip.blend ?? 'normal', 'video');
    const fit = Math.min(this.width / video.videoWidth, this.height / video.videoHeight);
    built.mesh.scale.set(video.videoWidth * fit * t.scale, video.videoHeight * fit * t.scale, 1);
    built.mesh.position.set((t.x * this.width) / 2, (t.y * this.height) / 2, 0);
    built.mesh.rotation.set(0, 0, (-t.rotation * Math.PI) / 180);
    const shake = effects.find((e) => e.effect === 'shake');
    if (shake) {
      const o = shakeOffset(Number(shake.params.seed), layer.local ?? 0, Number(shake.params.amount), Number(shake.params.frequency));
      built.mesh.position.x += o.x * this.width; built.mesh.position.y += o.y * this.height; built.mesh.rotation.z += (-o.rotation * Math.PI) / 180;
    }
    built.opacity.value = t.opacity * opacityScale;
    return built.mesh;
  }
  private titleMesh(layer: Extract<Layer, { kind: 'title' }>) {
    let tex = this.canvases.get(layer.canvas);
    if (!tex) { tex = new CanvasTexture(layer.canvas); tex.colorSpace = SRGBColorSpace; this.canvases.set(layer.canvas, tex); }
    tex.needsUpdate = true;
    const t: Transform = (layer.clip.type === 'caption' ? layer.clip.transform : undefined) ?? IDENTITY_TRANSFORM;
    const built = this.layerMesh(`title:${layer.clip.id}`, tex, [], (layer.clip.type === 'caption' ? layer.clip.blend : undefined) ?? 'normal', 'canvas');
    built.mesh.scale.set(this.width * t.scale, this.height * t.scale, 1);
    built.mesh.position.set((t.x * this.width) / 2, (t.y * this.height) / 2, 0);
    built.mesh.rotation.set(0, 0, (-t.rotation * Math.PI) / 180);
    built.opacity.value = t.opacity;
    return built.mesh;
  }
  /** Renders both sides of a transition into a pair of targets, then returns the full-frame mixing mesh. */
  private transitionMesh(layer: Extract<Layer, { kind: 'transition' }>, pairIndex: number) {
    while (this.pairs.length <= pairIndex) this.pairs.push([new RenderTarget(this.width, this.height), new RenderTarget(this.width, this.height)]);
    const pair = this.pairs[pairIndex]!;
    [layer.a, layer.b].forEach((side, n) => {
      const scene = new Scene(), mesh = this.mediaMesh(side);
      if (mesh) scene.add(mesh);
      this.renderer.setRenderTarget(pair[n]!);
      this.renderer.render(scene, this.camera);
    });
    const spec = layer.spec, key = `transition:${layer.clip.id}:${pairIndex}:${spec.kind}:${String(spec.params.shape ?? '')}`;
    let built = this.built.get(key);
    if (!built || built.key !== key) {
      built?.material.dispose();
      const material = new MeshBasicNodeMaterial();
      const at = this.flip() ? vec2(uv().x, float(1).sub(uv().y)) : uv();
      const progress = uniform(0), params: Record<string, any> = {};
      for (const [name, value] of Object.entries(spec.params)) if (typeof value === 'number') params[name] = uniform(value);
      params.shapeName = spec.params.shape;
      const colour = transitionColour(spec.kind, texture(pair[0]!.texture, at).rgb, texture(pair[1]!.texture, at).rgb, at, progress, params, this.width / this.height);
      material.transparent = false; material.depthTest = false; material.depthWrite = false; material.colorNode = vec4(colour, 1);
      built = { key, mesh: new Mesh(this.plane, material), material, uniforms: [{ index: 0, values: params }], opacity: progress };
      this.built.set(key, built);
    }
    built.opacity.value = layer.progress;
    for (const [name, node] of Object.entries(built.uniforms[0]!.values)) if (name !== 'shapeName' && typeof spec.params[name] === 'number') node.value = spec.params[name];
    built.mesh.scale.set(this.width, this.height, 1); built.mesh.position.set(0, 0, 0); built.mesh.rotation.set(0, 0, 0);
    return built.mesh;
  }

  /**
   * Draws one film moment; layers are listed bottom first. Resolves once the GPU has finished, so the
   * returned canvas can be copied (a copy taken earlier reads an empty picture).
   */
  async compose(layers: Layer[]): Promise<HTMLCanvasElement> {
    const groups: { adjust?: EffectClip; local?: number; media: Exclude<Layer, { kind: 'adjust' }>[] }[] = [{ media: [] }];
    for (const layer of layers) {
      if (layer.kind === 'adjust') groups.push({ adjust: layer.clip, ...(layer.local !== undefined ? { local: layer.local } : {}), media: [] });
      else groups.at(-1)!.media.push(layer);
    }
    let previous: Texture | null = null, order = 0;
    groups.forEach((group, index) => {
      const scene = new Scene();
      if (group.adjust && previous) {
        const sourceKey = `rt${index % 2 ? 1 : 0}`;
        const base = this.layerMesh(`adjust:${group.adjust.id}:${sourceKey}`, previous, [{ effect: group.adjust.effect, params: group.adjust.params }], 'normal', sourceKey, this.flip());
        base.mesh.scale.set(this.width, this.height, 1); base.mesh.position.set(0, 0, 0); base.mesh.rotation.set(0, 0, 0);
        if (group.adjust.effect === 'shake') {
          const p = group.adjust.params, o = shakeOffset(Number(p.seed), group.local ?? 0, Number(p.amount), Number(p.frequency));
          const grow = 1 + Number(p.amount) ** 2 * 0.12;
          base.mesh.scale.set(this.width * grow, this.height * grow, 1);
          base.mesh.position.set(o.x * this.width, o.y * this.height, 0); base.mesh.rotation.set(0, 0, (-o.rotation * Math.PI) / 180);
        }
        base.opacity.value = 1; base.mesh.renderOrder = order++; scene.add(base.mesh);
      }
      let pairs = 0;
      for (const layer of group.media) {
        const mesh = layer.kind === 'media' ? this.mediaMesh(layer) : layer.kind === 'title' ? this.titleMesh(layer) : this.transitionMesh(layer, pairs++);
        if (!mesh) continue;
        mesh.renderOrder = order++;
        scene.add(mesh);
      }
      const last = index === groups.length - 1;
      const target = last ? null : this.targets[index % 2]!;
      this.renderer.setRenderTarget(target);
      this.renderer.render(scene, this.camera);
      if (target) previous = target.texture;
    });
    this.renderer.setRenderTarget(null);
    const device = (this.renderer.backend as { device?: GPUDevice }).device;
    if (device) await device.queue.onSubmittedWorkDone();
    return this.canvas;
  }

  /** Forgets the shaders of clips that are gone (a layer key holds its clip id among its parts). */
  prune(liveIds: Set<string>) {
    for (const [id, built] of this.built) {
      if (!id.split(/[:|]/).some((part) => liveIds.has(part))) { built.material.dispose(); this.built.delete(id); }
    }
  }
  /** Frees the GPU device and everything made on it. */
  dispose() {
    for (const built of this.built.values()) built.material.dispose();
    this.built.clear();
    for (const tex of this.videos.values()) tex.dispose();
    this.videos.clear();
    for (const tex of this.canvases.values()) tex.dispose();
    this.canvases.clear();
    for (const target of [...this.targets, ...this.pairs.flat()]) target.dispose();
    this.plane.dispose();
    this.renderer.dispose();
  }
  /** Frees the textures of these video elements (after playback ends). */
  releaseVideos(videos: Iterable<HTMLVideoElement>) {
    for (const video of videos) { this.videos.get(video)?.dispose(); this.videos.delete(video); }
  }
}

const shared = new Map<string, Promise<FilmCompositor | null>>();
/** Output sizes kept at once; the least recently used one is freed (MCP frames can ask for many sizes). */
const KEEP_SIZES = 3;
/** One compositor per output size, reused (GPU devices are costly to start), at most `KEEP_SIZES` alive. */
export function compositorFor(width: number, height: number): Promise<FilmCompositor | null> {
  const key = `${width}x${height}`;
  let made = shared.get(key);
  if (made) { shared.delete(key); shared.set(key, made); return made; } // most recently used last
  made = typeof document === 'undefined' ? Promise.resolve(null) : FilmCompositor.create(width, height);
  shared.set(key, made);
  while (shared.size > KEEP_SIZES) {
    const [oldest, old] = shared.entries().next().value as [string, Promise<FilmCompositor | null>];
    shared.delete(oldest);
    void old.then((c) => c?.dispose()).catch(() => {});
  }
  return made;
}
