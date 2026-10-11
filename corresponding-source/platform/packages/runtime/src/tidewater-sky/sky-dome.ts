/*
 * Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC,
 * MIT (see ./LICENSE-tidewater.md). Source: src/sky/Sky.js 24-28 (stars), 78-197 (sun disc, stars, moon, moonlit
 * sky, the sky radiance with and without the sun).
 *
 * The sky drawn around the camera: the atmosphere's sky view LUT, the sun disc (2500 x limb darkening 0.6, through
 * the air), the stars (one candidate per cube-face cell, power-law magnitudes, the Milky Way band), the moon and the
 * faint moonlit sky. Tidewater draws it as a full-screen background pass; here it is an inside-out sphere that
 * follows the camera, drawn first and never writing depth. The clouds (task 4) composite onto it later.
 */
import { BackSide, Mesh, MeshBasicNodeMaterial, SphereGeometry, TSL, Vector3 } from 'three/webgpu';
import type { Atmosphere } from './atmosphere.js';
import { SUN_ANGULAR_RADIUS } from './atmosphere-math.js';

/* eslint-disable @typescript-eslint/no-explicit-any -- TSL's typings are too narrow for these node chains */
type AnyNode = any;
/** A TSL uniform node with its `value` (typed loosely, like the node chains). */
type UniformOf<T> = AnyNode & { value: T };

const {
  Fn,
  abs,
  acos,
  clamp,
  dot,
  exp,
  float,
  floor,
  fract,
  length,
  log2,
  max,
  mix,
  normalize,
  positionLocal,
  pow,
  select,
  sign,
  sin,
  smoothstep,
  time,
  uniform,
  vec2,
  vec3,
  vec4,
} = TSL as AnyNode;

/** Cells per half cube face (one star candidate per cell). */
const STAR_CELLS = 160;
/** Star point spread (cells). */
const STAR_SIGMA = 0.1;
/** Pole of the Milky Way band. */
const MILKY_WAY = new Vector3(0.3, 0.2, 1).normalize();
/** Reflections and the environment keep only a trace of the stars. */
export const STAR_REFLECTION = 0.08;
/** Radius of the sky sphere: inside the camera's far plane (5000 m), outside everything drawn. */
const DOME_RADIUS = 4200;

const pick = (cond: AnyNode, a: AnyNode, b: AnyNode): AnyNode => mix(b, a, select(cond, float(1), float(0)));
const sat = (x: AnyNode) => clamp(x, 0, 1);

/** Hash without sine (D. Hoskins), as Sky.js `skyHash13`. */
const hash13 = Fn(([p]: [AnyNode]) => {
  const p3 = fract(p.mul(vec3(0.1031, 0.103, 0.0973))).toVar();
  p3.addAssign(dot(p3, p3.yzx.add(33.33)));
  return fract(p3.x.add(p3.y).mul(p3.z));
}).setLayout({ name: 'skyHash13', type: 'float', inputs: [{ name: 'p', type: 'vec3' }] });

/** Uniforms of the sky (Sky.js `SkyParams`). */
export interface SkyParams {
  moonDir: UniformOf<Vector3>;
  sunDiskIntensity: UniformOf<number>;
  starIntensity: UniformOf<number>;
  /** How much it is night (App.js `G.night`), for the moonlit sky. */
  night: UniformOf<number>;
  /** Weather dims the whole sky (1 clear). */
  dim: UniformOf<number>;
}

/** The sky's TSL functions on one atmosphere (Sky.js `_buildModule`). */
export class SkyShading {
  readonly params: SkyParams = {
    moonDir: uniform(new Vector3(-0.3, 0.5, 0.8).normalize()),
    sunDiskIntensity: uniform(1),
    starIntensity: uniform(0),
    night: uniform(0),
    dim: uniform(1),
  };

  constructor(readonly atmosphere: Atmosphere) {}

  /** Sun disc radiance along `dir`, the air's transmittance included. */
  sunDisk(dir: AnyNode): AnyNode {
    const sunDir = this.atmosphere.params.sunDir;
    const ang = acos(clamp(dot(dir, sunDir), -1, 1));
    const r = ang.div(SUN_ANGULAR_RADIUS);
    const mask = smoothstep(1, 0.9, r);
    const mu = (TSL as AnyNode).sqrt((TSL as AnyNode).max(float(1).sub(r.mul(r)), 0));
    const limb = float(1).sub(float(1).sub(mu).mul(0.6));
    const T = this.atmosphere.transmittanceToSpace(dir);
    // physically E / solid angle (~1.6e5); kept to 2500 for half-float targets
    return T.mul(mask)
      .mul(limb)
      .mul(2500)
      .mul(this.params.sunDiskIntensity)
      .mul(smoothstep(-0.02, 0, dir.y));
  }

  /** Stars: one candidate per cube-face cell, power-law magnitudes, denser along the Milky Way (Sky.js 101-136). */
  stars(dir: AnyNode): AnyNode {
    const a = abs(dir);
    const onX = a.x.greaterThan(a.y).and(a.x.greaterThan(a.z));
    const onY = a.y.greaterThan(a.z);
    const faceZY = pick(onY, sign(dir.y).add(5), sign(dir.z).add(8));
    const face = pick(onX, sign(dir.x).add(2), faceZY);
    const uvZY = pick(onY, dir.xz.div(max(a.y, 1e-6)), dir.xy.div(max(a.z, 1e-6)));
    const uv = pick(onX, dir.yz.div(max(a.x, 1e-6)), uvZY)
      .mul(STAR_CELLS)
      .toVar();
    const cell = vec3(floor(uv), face).toVar();
    const h = hash13(cell).toVar();
    const bx = dot(dir, vec3(MILKY_WAY.x, MILKY_WAY.y, MILKY_WAY.z)).mul(4);
    const band = exp(bx.mul(bx).negate()).toVar();
    const has = h.lessThan(band.mul(0.035).add(0.025));
    const uc = (TSL as AnyNode).max(hash13(cell.add(7.7)), 2e-4).toVar();
    const m = log2(uc).mul(0.602).add(6.5).toVar();
    const dark = float(1).sub(smoothstep(-0.28, -0.1, this.atmosphere.params.sunDir.y));
    const vis = smoothstep(m.sub(0.6), m.add(0.6), dark.mul(7.5).sub(1)).mul(select(has, float(1), float(0)));
    const sp = floor(uv)
      .add(
        vec2(hash13(cell.add(3.1)), hash13(cell.add(5.7)))
          .mul(0.4)
          .add(0.3),
      )
      .div(STAR_CELLS)
      .toVar();
    const sdirZY = pick(onY, vec3(sp.x, sign(dir.y), sp.y), vec3(sp, sign(dir.z)));
    const sdir = normalize(pick(onX, vec3(sign(dir.x), sp), sdirZY));
    const d = length(dir.sub(sdir)).mul(STAR_CELLS);
    const flux = pow(uc, -0.8).toVar();
    const size = log2(flux).mul(0.08).add(1).toVar();
    const psf = exp(
      d
        .mul(d)
        .div(size.mul(size))
        .mul(-0.5 / (STAR_SIGMA * STAR_SIGMA)),
    ).div(size.mul(size));
    const tw = sin(time.mul(hash13(cell.add(13.3)).mul(9).add(5)).add(h.mul(60)))
      .mul(mix(0.18, 0.06, sat(dir.y.mul(2))))
      .add(1);
    const col = mix(vec3(1, 0.8, 0.6), vec3(0.75, 0.85, 1), hash13(cell.add(17)))
      .mul(0.5)
      .add(0.5);
    const star = col.mul(psf.mul(flux).mul(vis).mul(tw).mul(0.0075));
    const glow = vec3(0.55, 0.6, 0.75).mul(band.mul(dark).mul(0.0035));
    return star
      .add(glow)
      .mul(this.params.starIntensity)
      .mul(smoothstep(0, 0.2, dir.y));
  }

  moon(dir: AnyNode): AnyNode {
    const ang = acos(clamp(dot(dir, this.params.moonDir), -1, 1));
    const mask = smoothstep(1, 0.92, ang.div(0.0048));
    return vec3(0.9, 0.92, 1)
      .mul(mask)
      .mul(3)
      .mul(this.params.starIntensity)
      .mul(smoothstep(-0.02, 0.02, dir.y));
  }

  /** Faint blue-grey moonlit sky and the moon's aureole (Sky.js 148-155). */
  moonSky(dir: AnyNode): AnyNode {
    const ang = acos(clamp(dot(dir, this.params.moonDir), -1, 1));
    const aureole = exp(ang.mul(-14))
      .mul(2.4)
      .add(exp(ang.mul(-2.5)).mul(0.9));
    const grad = mix(1.7, 1, sat(dir.y.mul(3)));
    const up = smoothstep(-0.05, 0.15, this.params.moonDir.y);
    return vec3(0.005, 0.0068, 0.0105).mul(grad.add(aureole)).mul(this.params.night).mul(up);
  }

  /** Everything behind the clouds except the sun and moon discs (night terms weighted by the star intensity). */
  background(dir: AnyNode, starK: number): AnyNode {
    const night = select(this.params.starIntensity.greaterThan(0.001), float(1), float(0));
    return this.atmosphere
      .skyLuminance(dir)
      .add(this.moonSky(dir).add(this.stars(dir).mul(starK)).mul(night));
  }

  /** The main view: background, moon and sun disc (Sky.js `skyViewRadiance`, no clouds yet). */
  viewRadiance(dir: AnyNode): AnyNode {
    return this.background(dir, 1).add(this.moon(dir)).add(this.sunDisk(dir)).mul(this.params.dim);
  }

  /** The environment map's sky: no sun or moon disc (the key light is lit directly), a trace of stars. */
  environmentRadiance(dir: AnyNode): AnyNode {
    return this.background(dir, STAR_REFLECTION).mul(this.params.dim);
  }
}

/** An inside-out sphere around the camera drawing `radiance(dir)`; drawn first, never writing depth. */
export function skyDome(radiance: (dir: AnyNode) => AnyNode, name: string, radius = DOME_RADIUS): Mesh {
  const material = new MeshBasicNodeMaterial({ side: BackSide, depthWrite: false, fog: false });
  // Below the horizon the dome shows the horizon's own colour: the atmosphere's dark planet ground there
  // showed as a navy band wherever the sea or ground stopped short of the true horizon (SCROLL-01).
  const dir = normalize(positionLocal);
  material.colorNode = vec4(radiance(normalize(vec3(dir.x, max(dir.y, 0.001), dir.z))), 1);
  const mesh = new Mesh(new SphereGeometry(radius, 48, 24), material);
  mesh.name = name;
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  return mesh;
}
