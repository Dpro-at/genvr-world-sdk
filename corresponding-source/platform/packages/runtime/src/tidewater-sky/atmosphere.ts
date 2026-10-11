/*
 * Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC,
 * MIT (see ./LICENSE-tidewater.md). Source: src/sky/Atmosphere.js (Hillaire 2020 physically based sky):
 * lines 21-29 (planet, illuminance, LUT sizes), 59-96 (medium, LUT uv, ray-sphere), 110-123 (parameters),
 * 166-216 (LUT lookups), 232-465 (transmittance, multiple scattering, sky view and irradiance kernels),
 * 471-512 (when each runs).
 *
 * The WGSL kernels become TSL compute kernels with the same steps and constants. Differences: the LUTs are three
 * `StorageTexture`s, the sky irradiance and horizon colour come back through `getArrayBufferAsync` (Tidewater's
 * Readback), and the sun transmittance for the key light is worked out on the CPU (atmosphere-math.ts).
 */
import {
  ClampToEdgeWrapping,
  Color,
  HalfFloatType,
  LinearFilter,
  RGBAFormat,
  StorageBufferAttribute,
  StorageTexture,
  TSL,
  Vector3,
  type WebGPURenderer,
} from 'three/webgpu';
import {
  ATMO_RG,
  ATMO_RT,
  GROUND_ALBEDO,
  MIE_G,
  MULTISCAT_SIZE,
  SKYVIEW_SIZE,
  SUN_ILLUMINANCE,
  TRANSMITTANCE_SIZE,
  TRANSMITTANCE_STEPS,
} from './atmosphere-math.js';

/* eslint-disable @typescript-eslint/no-explicit-any -- TSL's typings are too narrow for these node chains */
type AnyNode = any;
/** A TSL uniform node with its `value` (typed loosely, like the node chains). */
export type UniformOf<T> = AnyNode & { value: T };

const {
  Fn,
  If,
  Loop,
  abs,
  acos,
  clamp,
  cos,
  dot,
  exp,
  float,
  globalId,
  int,
  length,
  max,
  mix,
  normalize,
  pow,
  select,
  sin,
  sqrt,
  texture,
  textureLoad,
  textureStore,
  uniform,
  uvec2,
  ivec2,
  vec2,
  vec3,
  vec4,
} = TSL as AnyNode;

const PI = Math.PI;
const [T_W, T_H] = TRANSMITTANCE_SIZE;
const MS = MULTISCAT_SIZE;
const [SV_W, SV_H] = SKYVIEW_SIZE;
const LOG_STEP = Math.log(1.02);
/** Seconds between sky irradiance read-backs (Atmosphere.js `_irrTimer`). */
const IRRADIANCE_EVERY = 0.25;

/** `cond ? a : b` with both branches in the main flow (the TSL `select` trap, see the gamedev skill). */
const pick = (cond: AnyNode, a: AnyNode, b: AnyNode): AnyNode => mix(b, a, select(cond, float(1), float(0)));

function lut(width: number, height: number, name: string): StorageTexture {
  const tex = new StorageTexture(width, height);
  tex.name = name;
  tex.format = RGBAFormat;
  tex.type = HalfFloatType;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearFilter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  return tex;
}

/** Uniforms of the atmosphere (Atmosphere.js 110-123), three-style `{ value }` handles. */
export interface AtmosphereParams {
  rayleighScale: UniformOf<number>;
  mieScale: UniformOf<number>;
  mieG: UniformOf<number>;
  ozoneScale: UniformOf<number>;
  groundAlbedo: UniformOf<Color>;
  /** Height of the viewer, km from the planet's centre. */
  viewHeight: UniformOf<number>;
  sunIlluminance: UniformOf<number>;
  /** The real sun, which may be below the horizon (twilight, night). */
  sunDir: UniformOf<Vector3>;
}

/**
 * The atmosphere's lookup tables made by TSL compute: transmittance (256 x 64), multiple scattering (32 x 32) once,
 * the sky view (192 x 108) whenever the sun, the viewer's height or the air change. `skyLuminance(dir)` and
 * `transmittanceToSpace(dir)` are TSL functions for the materials that draw the sky.
 */
export class Atmosphere {
  readonly transmittanceLUT = lut(T_W, T_H, 'atmoTransmittance');
  readonly multiScatLUT = lut(MS, MS, 'atmoMultiScat');
  readonly skyViewLUT = lut(SV_W, SV_H, 'atmoSkyView');
  readonly params: AtmosphereParams;
  /** Sky irradiance / PI, sun transmittance at sea level, horizon colour (read back every 0.25 s; null before). */
  skyIrradiance: [number, number, number] | null = null;
  sunTransmittance: [number, number, number] | null = null;
  horizon: [number, number, number] | null = null;
  readonly #irrBuffer = new StorageBufferAttribute(new Float32Array(12), 4);
  readonly #kernels: { transmittance: AnyNode; multiScat: AnyNode; skyView: AnyNode; irradiance: AnyNode };
  #needsStatic = true;
  #lastKey = '';
  #irrTimer = 0;
  #irrPending = false;
  #disposed = false;

  constructor() {
    this.params = {
      rayleighScale: uniform(1),
      mieScale: uniform(1),
      mieG: uniform(MIE_G),
      ozoneScale: uniform(1),
      groundAlbedo: uniform(new Color(...GROUND_ALBEDO)),
      viewHeight: uniform(ATMO_RG + 0.002),
      sunIlluminance: uniform(SUN_ILLUMINANCE),
      sunDir: uniform(new Vector3(0.3, 0.6, -0.7).normalize()),
    };
    this.#kernels = {
      transmittance: this.#transmittanceKernel(),
      multiScat: this.#multiScatKernel(),
      skyView: this.#skyViewKernel(),
      irradiance: this.#irradianceKernel(),
    };
  }

  // ------------------------------------------------------------------ shared node helpers

  /** Rayleigh scattering at a height (km). */
  #rayScat(h: AnyNode): AnyNode {
    return vec3(5.802e-3, 13.558e-3, 33.1e-3)
      .mul(exp(h.div(-8)))
      .mul(this.params.rayleighScale);
  }

  #mieDensity(h: AnyNode): AnyNode {
    return exp(h.div(-1.2)).mul(this.params.mieScale);
  }

  #extinction(h: AnyNode): AnyNode {
    const ozone = max(float(0), float(1).sub(abs(h.sub(25)).div(15)));
    return this.#rayScat(h)
      .add(this.#mieDensity(h).mul(4.44e-3))
      .add(vec3(0.65e-3, 1.881e-3, 0.085e-3).mul(ozone).mul(this.params.ozoneScale));
  }

  #scattering(h: AnyNode): AnyNode {
    return this.#rayScat(h).add(this.#mieDensity(h).mul(3.996e-3));
  }

  /** Nearest positive ray-sphere distance from `ro` (km, planet centred), -1 when none. */
  static raySphere = Fn(([ro, rd, radius]: [AnyNode, AnyNode, AnyNode]) => {
    const b = dot(ro, rd).toVar();
    const c = dot(ro, ro).sub(radius.mul(radius)).toVar();
    const disc = b.mul(b).sub(c).toVar();
    const sq = sqrt(max(disc, 0)).toVar();
    const t0 = b.negate().sub(sq).toVar();
    const t1 = b.negate().add(sq).toVar();
    const far = pick(t1.greaterThan(0), t1, float(-1));
    const near = pick(t0.greaterThan(0), t0, far);
    return pick(disc.lessThan(0), float(-1), near);
  }).setLayout({
    name: 'atmoRaySphere',
    type: 'float',
    inputs: [
      { name: 'ro', type: 'vec3' },
      { name: 'rd', type: 'vec3' },
      { name: 'radius', type: 'float' },
    ],
  });

  /** (r, mu) -> transmittance LUT uv (Atmosphere.js `atmosphereTransmittanceUV`). */
  static transmittanceUV = Fn(([r, mu]: [AnyNode, AnyNode]) => {
    const top = Math.sqrt(ATMO_RT * ATMO_RT - ATMO_RG * ATMO_RG);
    const rho = sqrt(max(r.mul(r).sub(ATMO_RG * ATMO_RG), 0)).toVar();
    const disc = r
      .mul(r)
      .mul(mu.mul(mu).sub(1))
      .add(ATMO_RT * ATMO_RT);
    const d = max(
      float(0),
      r
        .negate()
        .mul(mu)
        .add(sqrt(max(disc, 0))),
    ).toVar();
    const dMin = float(ATMO_RT).sub(r);
    const dMax = rho.add(top);
    const xMu = d.sub(dMin).div(dMax.sub(dMin));
    const xR = rho.div(top);
    return vec2(xMu.add(0.5 / T_W).mul(T_W / (T_W + 1)), xR.add(0.5 / T_H).mul(T_H / (T_H + 1)));
  }).setLayout({
    name: 'atmoTransmittanceUV',
    type: 'vec2',
    inputs: [
      { name: 'r', type: 'float' },
      { name: 'mu', type: 'float' },
    ],
  });

  /** Transmittance from radius r (km) toward zenith cosine mu, from the LUT. */
  sampleTransmittance(r: AnyNode, mu: AnyNode): AnyNode {
    return texture(this.transmittanceLUT, Atmosphere.transmittanceUV(r, mu)).level(0).rgb;
  }

  /** Transmittance from the viewer toward `dir` (sun disc, sun light colour). */
  transmittanceToSpace(dir: AnyNode): AnyNode {
    return this.sampleTransmittance(this.params.viewHeight, dir.y);
  }

  #sampleMultiScat(r: AnyNode, cosSun: AnyNode): AnyNode {
    const uv = vec2(cosSun.mul(0.5).add(0.5), r.sub(ATMO_RG).div(ATMO_RT - ATMO_RG));
    return texture(this.multiScatLUT, uv.mul((MS - 1) / MS).add(0.5 / MS)).level(0).rgb;
  }

  /** Sky luminance toward `dir` (normalized world direction), no sun disc, from the sky view LUT. */
  skyLuminance(dir: AnyNode): AnyNode {
    const viewH = this.params.viewHeight;
    const vHorizon = sqrt(max(viewH.mul(viewH).sub(ATMO_RG * ATMO_RG), 0));
    const beta = acos(vHorizon.div(viewH));
    const zenithHorizonAngle = float(PI).sub(beta);
    const viewZenithAngle = acos(clamp(dir.y, -1, 1));
    const vA = float(1)
      .sub(sqrt(max(float(1).sub(viewZenithAngle.div(zenithHorizonAngle)), 0)))
      .mul(0.5);
    const vB = sqrt(max(viewZenithAngle.sub(zenithHorizonAngle).div(beta), 0))
      .mul(0.5)
      .add(0.5);
    const v = pick(viewZenithAngle.lessThan(zenithHorizonAngle), vA, vB);
    const sun = this.params.sunDir;
    const sunH = normalize(vec2(sun.x, sun.z).add(vec2(1e-5, 0)));
    const dirH = normalize(vec2(dir.x, dir.z).add(vec2(1e-5, 0)));
    const u = sqrt(clamp(dot(sunH, dirH).mul(-0.5).add(0.5), 0, 1));
    const uv = vec2(u.mul((SV_W - 1) / SV_W).add(0.5 / SV_W), v.mul((SV_H - 1) / SV_H).add(0.5 / SV_H));
    return texture(this.skyViewLUT, uv).level(0).rgb;
  }

  // ------------------------------------------------------------------ kernels

  #transmittanceKernel(): AnyNode {
    const out = this.transmittanceLUT;
    return Fn(() => {
      const px: AnyNode = uvec2(globalId.x, globalId.y);
      const uv = vec2(px).add(0.5).div(vec2(T_W, T_H)).toVar();
      const xMu = uv.x.sub(0.5 / T_W).mul(T_W / (T_W - 1));
      const xR = uv.y.sub(0.5 / T_H).mul(T_H / (T_H - 1));
      const top = Math.sqrt(ATMO_RT * ATMO_RT - ATMO_RG * ATMO_RG);
      const rho = xR.mul(top).toVar();
      const r = sqrt(rho.mul(rho).add(ATMO_RG * ATMO_RG)).toVar();
      const dMin = float(ATMO_RT).sub(r).toVar();
      const dMax = rho.add(top);
      const d = dMin.add(xMu.mul(dMax.sub(dMin))).toVar();
      // The outward ray at the top boundary has zero length. Keep both select branches finite on the GPU.
      const muRaw = float(top * top)
        .sub(rho.mul(rho))
        .sub(d.mul(d))
        .div(max(r.mul(d).mul(2), 1e-6));
      const mu = clamp(pick(d.equal(0), float(1), muRaw), -1, 1).toVar();
      const ro = vec3(0, r, 0).toVar();
      const rd = vec3(sqrt(max(float(1).sub(mu.mul(mu)), 0)), mu, 0).toVar();
      // The LUT mapping already gives the distance to the outer boundary. Re-solving a sphere at r = Rt
      // loses the inward segment through float32 cancellation and can select a spurious near-zero root.
      const tMax = max(d, 0);
      const dt = tMax.div(TRANSMITTANCE_STEPS).toVar();
      const od = vec3(0).toVar();
      Loop(
        { start: int(0), end: int(TRANSMITTANCE_STEPS), type: 'int', condition: '<', name: 'ti' },
        ({ ti }: AnyNode) => {
          const t = float(ti).add(0.5).mul(dt);
          const p = ro.add(rd.mul(t));
          od.addAssign(this.#extinction(length(p).sub(ATMO_RG)).mul(dt));
        },
      );
      textureStore(out, px, vec4(exp(od.negate()), 1));
    })().computeKernel([8, 8, 1]);
  }

  #multiScatKernel(): AnyNode {
    const out = this.multiScatLUT;
    const SQ = 8;
    const STEPS = 20;
    return Fn(() => {
      const px: AnyNode = uvec2(globalId.x, globalId.y);
      const uv = vec2(px)
        .add(0.5)
        .div(MS)
        .sub(0.5 / MS)
        .mul(MS / (MS - 1))
        .toVar();
      const cosSun = uv.x.mul(2).sub(1).toVar();
      const r = float(ATMO_RG)
        .add(clamp(uv.y, 0.001, 0.999).mul(ATMO_RT - ATMO_RG))
        .toVar();
      const sunDir = normalize(
        vec3(0, cosSun, sqrt(max(float(1).sub(cosSun.mul(cosSun)), 0)).negate()),
      ).toVar();
      const ro = vec3(0, r, 0).toVar();
      const lSum = vec3(0).toVar();
      const fmsSum = vec3(0).toVar();
      const isoPhase = 1 / (4 * PI);
      Loop(
        { start: int(0), end: int(SQ * SQ), type: 'int', condition: '<', name: 'di' },
        ({ di }: AnyNode) => {
          const ii = float(di.mod(SQ)).add(0.5).div(SQ);
          const jj = float(di.div(SQ)).add(0.5).div(SQ);
          const theta = ii.mul(2 * PI);
          const phi = acos(float(1).sub(jj.mul(2)));
          const rd = vec3(cos(theta).mul(sin(phi)), cos(phi), sin(theta).mul(sin(phi))).toVar();
          const tBottom = Atmosphere.raySphere(ro, rd, float(ATMO_RG)).toVar();
          const tTop = Atmosphere.raySphere(ro, rd, float(ATMO_RT)).toVar();
          const hitGround = tBottom.greaterThan(0);
          const tMax = pick(hitGround, tBottom, tTop).toVar();
          const dt = tMax.div(STEPS).toVar();
          const throughput = vec3(1).toVar();
          const L = vec3(0).toVar();
          const fms = vec3(0).toVar();
          Loop(
            { start: int(0), end: int(STEPS), type: 'int', condition: '<', name: 'si' },
            ({ si }: AnyNode) => {
              const t = float(si).add(0.3).mul(dt);
              const p = ro.add(rd.mul(t)).toVar();
              const pr = length(p).toVar();
              const h = pr.sub(ATMO_RG).toVar();
              const ext = max(this.#extinction(h), vec3(1e-6)).toVar();
              const scat = this.#scattering(h).toVar();
              const cosSunP = dot(p.div(pr), sunDir);
              const tSun = this.sampleTransmittance(pr, cosSunP);
              const shadowT = Atmosphere.raySphere(p, sunDir, float(ATMO_RG));
              const earthShadow = pick(shadowT.greaterThan(0), float(0), float(1));
              const S = tSun.mul(earthShadow).mul(scat).mul(isoPhase).toVar();
              const tStep = exp(ext.negate().mul(dt)).toVar();
              L.addAssign(throughput.mul(S.sub(S.mul(tStep))).div(ext));
              fms.addAssign(throughput.mul(scat.sub(scat.mul(tStep))).div(ext));
              throughput.mulAssign(tStep);
            },
          );
          If(hitGround, () => {
            const p = ro.add(rd.mul(tMax));
            const cosS = dot(normalize(p), sunDir);
            const tSun = this.sampleTransmittance(float(ATMO_RG), cosS);
            L.addAssign(tSun.mul(throughput).mul(max(cosS, 0)).mul(this.params.groundAlbedo).div(PI));
          });
          lSum.addAssign(L.mul((4 * PI) / (SQ * SQ)));
          fmsSum.addAssign(fms.mul((4 * PI) / (SQ * SQ)));
        },
      );
      const lIn = lSum.mul(isoPhase);
      const fmsAvg = fmsSum.mul(isoPhase);
      textureStore(out, px, vec4(lIn.div(vec3(1).sub(fmsAvg)), 1));
    })().computeKernel([8, 8, 1]);
  }

  #skyViewKernel(): AnyNode {
    const out = this.skyViewLUT;
    const STEPS = 32;
    return Fn(() => {
      const px: AnyNode = uvec2(globalId.x, globalId.y);
      If(px.x.lessThan(SV_W).and(px.y.lessThan(SV_H)), () => {
        const uv0 = vec2(px).add(0.5).div(vec2(SV_W, SV_H));
        const u = uv0.x
          .sub(0.5 / SV_W)
          .mul(SV_W / (SV_W - 1))
          .toVar();
        const v = uv0.y
          .sub(0.5 / SV_H)
          .mul(SV_H / (SV_H - 1))
          .toVar();
        const viewH = this.params.viewHeight;
        const vHorizon = sqrt(max(viewH.mul(viewH).sub(ATMO_RG * ATMO_RG), 0));
        const beta = acos(vHorizon.div(viewH)).toVar();
        const zenithHorizonAngle = float(PI).sub(beta).toVar();
        // v < 0.5: above the horizon (squared toward it), else below
        const cA = float(1).sub(
          float(1)
            .sub(v.mul(2))
            .mul(float(1).sub(v.mul(2))),
        );
        const cB = v.mul(2).sub(1);
        const vzA = pick(
          v.lessThan(0.5),
          zenithHorizonAngle.mul(cA),
          zenithHorizonAngle.add(beta.mul(cB.mul(cB))),
        ).toVar();
        const cosViewZenith = cos(vzA);
        const sinViewZenith = sin(vzA);
        const lightViewCos = u.mul(u).mul(2).sub(1).negate().toVar();
        const lightViewSin = sqrt(max(float(1).sub(lightViewCos.mul(lightViewCos)), 0));
        const sunCosZ = this.params.sunDir.y;
        const sunSinZ = sqrt(max(float(1).sub(sunCosZ.mul(sunCosZ)), 0));
        const sunDir = vec3(sunSinZ, sunCosZ, 0).toVar();
        const rd = vec3(
          sinViewZenith.mul(lightViewCos),
          cosViewZenith,
          sinViewZenith.mul(lightViewSin),
        ).toVar();
        const ro = vec3(0, viewH, 0).toVar();
        const tBottom = Atmosphere.raySphere(ro, rd, float(ATMO_RG)).toVar();
        const tTop = Atmosphere.raySphere(ro, rd, float(ATMO_RT)).toVar();
        const tMax = pick(tBottom.greaterThan(0), tBottom, tTop).toVar();
        const cosTheta = dot(rd, sunDir).toVar();
        const rayPhase = cosTheta
          .mul(cosTheta)
          .add(1)
          .mul(3 / (16 * PI))
          .toVar();
        const g = this.params.mieG;
        const g2 = g.mul(g);
        // Cornette-Shanks
        const miePhase = g2
          .oneMinus()
          .mul(cosTheta.mul(cosTheta).add(1))
          .mul(3 / (8 * PI))
          .div(g2.add(2).mul(pow(max(g2.add(1).sub(g.mul(cosTheta).mul(2)), 1e-4), 1.5)))
          .toVar();
        const throughput = vec3(1).toVar();
        const L = vec3(0).toVar();
        Loop(
          { start: int(0), end: int(STEPS), type: 'int', condition: '<', name: 'vi' },
          ({ vi }: AnyNode) => {
            // quadratic step distribution
            const t0 = float(vi).div(STEPS);
            const t1 = float(vi).add(1).div(STEPS);
            const ta = t0.mul(t0).mul(tMax);
            const tb = t1.mul(t1).mul(tMax);
            const t = mix(ta, tb, 0.3);
            const dt = tb.sub(ta).toVar();
            const p = ro.add(rd.mul(t)).toVar();
            const pr = length(p).toVar();
            const h = pr.sub(ATMO_RG).toVar();
            const ext = max(this.#extinction(h), vec3(1e-6)).toVar();
            const cosSunP = dot(p.div(pr), sunDir).toVar();
            const tSun = this.sampleTransmittance(pr, cosSunP);
            const shadowT = Atmosphere.raySphere(p, sunDir, float(ATMO_RG));
            const earthShadow = pick(shadowT.greaterThan(0), float(0), float(1));
            const ms = this.#sampleMultiScat(pr, cosSunP);
            const phaseScat = this.#rayScat(h)
              .mul(rayPhase)
              .add(vec3(this.#mieDensity(h).mul(3.996e-3).mul(miePhase)));
            const S = tSun
              .mul(earthShadow)
              .mul(phaseScat)
              .add(ms.mul(this.#scattering(h)))
              .toVar();
            const tStep = exp(ext.negate().mul(dt)).toVar();
            L.addAssign(throughput.mul(S.sub(S.mul(tStep))).div(ext));
            throughput.mulAssign(tStep);
          },
        );
        textureStore(out, px, vec4(L.mul(this.params.sunIlluminance), 1));
      });
    })().computeKernel([8, 8, 1]);
  }

  #irradianceKernel(): AnyNode {
    const irr = TSL.storage(this.#irrBuffer, 'vec4', 3);
    const N = 16;
    return Fn(() => {
      const sum = vec3(0).toVar();
      Loop({ start: int(0), end: int(N * N), type: 'int', condition: '<', name: 'ri' }, ({ ri }: AnyNode) => {
        const a = float(ri.mod(N)).add(0.5).div(N);
        const b = float(ri.div(N)).add(0.5).div(N);
        // cosine-weighted hemisphere
        const r = sqrt(b);
        const phi = a.mul(2 * PI);
        sum.addAssign(
          this.skyLuminance(vec3(r.mul(cos(phi)), sqrt(max(float(1).sub(b), 0)), r.mul(sin(phi)))),
        );
      });
      irr.element(0).assign(vec4(sum.div(N * N), 1));
      irr.element(1).assign(vec4(this.sampleTransmittance(float(ATMO_RG + 0.001), this.params.sunDir.y), 1));
      const hs = vec3(0).toVar();
      Loop({ start: int(0), end: int(16), type: 'int', condition: '<', name: 'hi' }, ({ hi }: AnyNode) => {
        const phi = float(hi).mul((2 * PI) / 16);
        hs.addAssign(this.skyLuminance(normalize(vec3(cos(phi), 0.03, sin(phi)))));
      });
      irr.element(2).assign(vec4(hs.div(16), 1));
    })().computeKernel([1, 1, 1]);
  }

  // ------------------------------------------------------------------ update

  /**
   * Runs the kernels that are due (Atmosphere.js `update`): the static LUTs once, the sky view when the sun, the
   * viewer's height (quantized: 2 m near the sea, 2 % higher up) or the air changed, and the irradiance read-back
   * every 0.25 s. Returns true when the sky view LUT was made again.
   */
  update(renderer: WebGPURenderer, dt: number, cameraY: number): boolean {
    const y = Math.max(0.5, cameraY + 0.5);
    const yq = y < 100 ? Math.round(y / 2) * 2 : Math.exp(Math.round(Math.log(y) / LOG_STEP) * LOG_STEP);
    this.params.viewHeight.value = ATMO_RG + Math.max(0.001, yq / 1000);
    let dirty = false;
    if (this.#needsStatic) {
      this.#needsStatic = false;
      dirty = true;
      renderer.compute(this.#kernels.transmittance, [T_W / 8, T_H / 8, 1]);
      renderer.compute(this.#kernels.multiScat, [MS / 8, MS / 8, 1]);
    }
    const p = this.params;
    const s = p.sunDir.value;
    const key = [
      p.rayleighScale.value,
      p.mieScale.value,
      p.mieG.value,
      p.ozoneScale.value,
      p.groundAlbedo.value.getHexString(),
      p.viewHeight.value,
      p.sunIlluminance.value,
      s.x.toFixed(5),
      s.y.toFixed(5),
      s.z.toFixed(5),
    ].join('|');
    if (dirty || key !== this.#lastKey) {
      this.#lastKey = key;
      renderer.compute(this.#kernels.skyView, [SV_W / 8, Math.ceil(SV_H / 8), 1]);
      dirty = true;
    }
    this.#irrTimer -= dt;
    if (this.#irrTimer <= 0 && !this.#irrPending) {
      this.#irrTimer = IRRADIANCE_EVERY;
      renderer.compute(this.#kernels.irradiance, [1, 1, 1]);
      this.#irrPending = true;
      void renderer
        .getArrayBufferAsync(this.#irrBuffer)
        .then((buffer) => {
          if (this.#disposed) return;
          const f = new Float32Array(buffer);
          this.skyIrradiance = [f[0]!, f[1]!, f[2]!];
          this.sunTransmittance = [f[4]!, f[5]!, f[6]!];
          this.horizon = [f[8]!, f[9]!, f[10]!];
        })
        .catch(() => undefined)
        .finally(() => {
          this.#irrPending = false;
        });
    }
    return dirty;
  }

  /** The LUTs are made again on the next update (e.g. after the air changed). */
  invalidate(): void {
    this.#needsStatic = true;
    this.#lastKey = '';
  }

  /** Copies the transmittance LUT into a buffer for checks against the CPU reference (tests). */
  readTransmittance(renderer: WebGPURenderer): Promise<Float32Array> {
    const copy = new StorageBufferAttribute(new Float32Array(T_W * T_H * 4), 4);
    const target = TSL.storage(copy, 'vec4', T_W * T_H);
    const kernel = Fn(() => {
      const px: AnyNode = ivec2(globalId.x, globalId.y);
      target.element(globalId.y.mul(T_W).add(globalId.x)).assign(textureLoad(this.transmittanceLUT, px));
    })().computeKernel([8, 8, 1]);
    renderer.compute(kernel, [T_W / 8, T_H / 8, 1]);
    return renderer.getArrayBufferAsync(copy).then((buffer) => new Float32Array(buffer));
  }

  dispose(): void {
    this.#disposed = true;
    this.transmittanceLUT.dispose();
    this.multiScatLUT.dispose();
    this.skyViewLUT.dispose();
  }
}
