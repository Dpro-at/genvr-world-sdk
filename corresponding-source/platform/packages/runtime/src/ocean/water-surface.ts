/*
 * Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC,
 * MIT (see ./LICENSE-tidewater.md). Source: src/ocean/WaterSurface.js (constructor L39-63, vertex L120-236,
 * fragment L241-383).
 *
 * Sums the FFT cascades into the sea surface: per vertex the displacement (each cascade faded in shallow water
 * first, sampled at a mip level matched to the mesh spacing) and the persistent foam; per pixel the slopes, the
 * near-camera ripples, the Jacobian whitecaps and the thresholded foam pattern.
 *
 * The shore waves' part of the pixel (task 5, L314-336): the large shore wave's normal (per vertex) carries the
 * FFT detail by reoriented normal mapping, its whitewater joins the foam and fills the water with bubbles.
 * Sea detail (gusts, slicks, windrows) comes in through `options.detail` (task 7). Not here yet: the wake, ShoreSim and the surf foam look. Where Tidewater
 * reads the terrain per vertex we read our baked sea depth map.
 */
import type { Node, Texture } from 'three/webgpu';
import { TSL } from 'three/webgpu';
import { FFT_SIZE } from './ocean-spectrum.js';
import type { OceanFFT } from './ocean-fft.js';

/* eslint-disable @typescript-eslint/no-explicit-any -- TSL's typings are too narrow for these node chains */
type AnyNode = any;

const { clamp, float, fwidth, length, log2, max, mix, normalize, smoothstep, texture, vec2, vec3 } = TSL as AnyNode;


/** Per-cascade foam weights (L53). */
export const FOAM_WEIGHTS = [0.35, 0.45, 0.5, 0.25] as const;
/** Foam look (L39-45): coverage gain, pattern repeats per meter. */
export const FOAM_SCALE = 0.09;
/** Near-field ripple tiles: the finest cascade re-sampled at size / 7.3 and size / 3.1, rotated 0.63 and 2.14 rad. */
export const RIPPLES = [
  { tiles: 7.3, angle: 0.63, weight: 0.55 },
  { tiles: 3.1, angle: 2.14, weight: 0.35 },
] as const;

/** How each cascade fades in shallow water: the depth it reaches full height and the floor it keeps (L55-63). */
export function cascadeAttenuationTable(sizes: readonly number[]): Array<{ d0: number; floor: number }> {
  return sizes.map((size, c) => ({
    d0: Math.min(40, size * 0.08),
    floor: [0, 0.05, 0.25, 0.5][c] ?? 0.5,
  }));
}

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/**
 * `waterSurfaceCascadeAttenuation`: long cascades vanish in shallow water, short ones persist until very shallow.
 * `mix(floor x smoothstep(0, 0.6, depth), 1, smoothstep(0, d0, depth))`.
 */
export function cascadeAttenuation(sizes: readonly number[], cascade: number, depth: number): number {
  const { d0, floor } = cascadeAttenuationTable(sizes)[cascade]!;
  const a = smooth(0, d0, depth);
  const low = floor * smooth(0, 0.6, depth);
  return low + (1 - low) * a;
}

/** The TSL version of `cascadeAttenuation`. */
export function cascadeAttenuationNode(sizes: readonly number[], cascade: number, depth: AnyNode): AnyNode {
  const { d0, floor } = cascadeAttenuationTable(sizes)[cascade]!;
  return mix(float(floor).mul(smoothstep(0, 0.6, depth)), float(1), smoothstep(0, d0, depth));
}

/** Rotates a vec2 node by a fixed angle. */
function rotate(v: AnyNode, angle: number): AnyNode {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return vec2(v.x.mul(c).sub(v.y.mul(s)), v.x.mul(s).add(v.y.mul(c)));
}

export interface SurfaceVertex {
  /** Displacement of the vertex (m), already faded by depth. */
  displacement: AnyNode;
  /** Persistent whitecap foam carried by the vertex. */
  foam: AnyNode;
}

/**
 * The vertex part (L120-171): every cascade sampled at `level = max(log2(spacing / texel) + 0.7, 0)`, faded by
 * depth; foam per vertex at a fixed detail level (1.5) where the displacement sample is finer.
 */
export function waterSurfaceVertex(fft: OceanFFT, worldXZ: AnyNode, spacing: AnyNode, depth: AnyNode): SurfaceVertex {
  let displacement: AnyNode = vec3(0, 0, 0);
  let foam: AnyNode = float(0);
  for (let c = 0; c < fft.cascades; c += 1) {
    const texel = fft.size(c) / FFT_SIZE;
    const level = max(log2(spacing.div(texel)).add(0.7), 0);
    const att = cascadeAttenuationNode(fft.sizes, c, depth);
    const s: AnyNode = fft.sampleDisplacement(c, worldXZ, level);
    displacement = displacement.add(s.xyz.mul(att));
    const foamLevel = max(level, 1.5);
    const fv: AnyNode = (fft.sampleDisplacement(c, worldXZ, foamLevel) as AnyNode).w;
    foam = foam.add(fv.mul((FOAM_WEIGHTS[c] ?? 0.25) * 1).mul(att));
  }
  return { displacement, foam };
}

export interface SurfaceFragment {
  normal: AnyNode;
  foam: AnyNode;
  coverage: AnyNode;
  slopes: AnyNode;
  jacobian: AnyNode;
  /** Pixel footprint on the surface (m). */
  footprint: AnyNode;
  /** Bubbles mixed into the water (milky, hides the bottom): the surf. */
  aeration: AnyNode;
}

export interface SurfaceFragmentOptions {
  /** Near-camera capillary ripples (Ultra). */
  ripples: boolean;
  foamTexture: Texture;
  foamBias: AnyNode;
  /** Foam sharpness and coverage gain (`waterSurface.foamCoverage`). */
  foamCoverage?: number;
  /** The shore waves here: their normal (per vertex), whitewater + swash foam, clear plunging face (0..1). */
  shore?: { normal: AnyNode; foam: AnyNode; face: AnyNode };
  /** Gusts, slicks and windrows here (sea-detail.ts, Ultra): short-wave roughness and extra whitecaps. */
  detail?: { rough: AnyNode; gust: AnyNode; streak: AnyNode };
}

/**
 * The pixel part (L274-383) without shore, wake, sea detail and ShoreSim: slopes from the derivative cascades,
 * the near ripples, the Jacobian, whitecaps (persistent + fresh), and the foam pattern thresholded by coverage.
 */
export function waterSurfaceFragment(
  fft: OceanFFT,
  lagXZ: AnyNode,
  depth: AnyNode,
  vertexFoam: AnyNode,
  options: SurfaceFragmentOptions,
): SurfaceFragment {
  const footprint = max(length(fwidth(lagXZ)), 1e-4).toVar();
  let d: AnyNode = TSL.vec4(0, 0, 0, 0);
  const C = fft.cascades;
  const rough: AnyNode = options.detail ? options.detail.rough.toVar() : null;
  for (let c = 0; c < C; c += 1) {
    let att = cascadeAttenuationNode(fft.sizes, c, depth);
    // the short waves follow the gusts and slicks (L245-246)
    if (rough && c >= C - 2) att = att.mul(rough);
    else if (rough && c === C - 3) att = att.mul(mix(float(1), rough, 0.4));
    d = d.add((fft.sampleDerivatives(c, lagXZ) as AnyNode).mul(att));
  }
  d = d.toVar();
  let slopes: AnyNode = vec2(d.x.div(max(d.z.add(1), 0.2)), d.y.div(max(d.w.add(1), 0.2)));
  if (options.ripples) {
    // Within a few metres a pixel covers less than the finest cascade's texel: re-sample that cascade at
    // ~1 m and ~2.3 m tiles, rotated, wherever the footprint is small (explicit LOD, L293-305).
    const cN = fft.cascades - 1;
    const Lf = fft.size(cN);
    const near = rough ? smoothstep(0.04, 0.01, footprint).mul(rough) : smoothstep(0.04, 0.01, footprint);
    let g: AnyNode = vec2(0, 0);
    for (const r of RIPPLES) {
      const texel = Lf / r.tiles / FFT_SIZE;
      const uvWorld = rotate(lagXZ, r.angle).mul(r.tiles);
      const level = max(log2(footprint.div(texel)), 0);
      const sample: AnyNode = fft.sampleDerivatives(cN, uvWorld, level);
      g = g.add(rotate(sample.xy, -r.angle).mul(r.weight));
    }
    slopes = slopes.add(g.mul(near));
  }
  slopes = slopes.toVar();
  const jacobian = d.z.add(1).mul(d.w.add(1)).toVar();
  let normal: AnyNode = normalize(vec3(slopes.x.negate(), 1, slopes.y.negate()));
  let foamSum: AnyNode = float(0);
  let aeration: AnyNode = float(0);
  if (options.shore) {
    // A coarse mesh can flip the shore normal between the vertices of a folding crest: keep it finite and up.
    const sn = clamp(options.shore.normal, vec3(-1, -1, -1), vec3(1, 1, 1)).add(vec3(0, 1e-3, 0));
    const ns0 = sn.div(max(length(sn), 1e-4));
    const ns = normalize(vec3(ns0.x, max(ns0.y, 0.12), ns0.z));
    // the ripples ride on the wave: the detail normal is rotated onto the tilted face (reoriented normal mapping)
    const nd = normalize(vec3(slopes.x.negate(), 1, slopes.y.negate()));
    const tq = ns.add(vec3(0, 1, 0));
    const uq = vec3(slopes.x, 1, slopes.y).mul(nd.y);
    normal = normalize(tq.mul(tq.dot(uq).div(tq.y)).sub(uq));
    foamSum = foamSum.add(options.shore.foam);
    // the roller and the water behind the plunge point are full of bubbles; the clear face of a plunging wave is not
    aeration = clamp(options.shore.foam.mul(1.2), 0, 1)
      .mul(float(1).sub(clamp(options.shore.face, 0, 1)))
      .mul(smoothstep(-0.1, 0.3, depth));
  }
  normal = normal.toVar();

  // whitecaps: persistent (per vertex) + fresh where the surface is compressed right now
  const fresh = clamp(options.foamBias.sub(0.15).sub(jacobian).mul(2), 0, 1);
  // (more of them inside gusts, plus windrow lines in fresh wind, L345)
  const whitecaps = options.detail
    ? vertexFoam.add(fresh).mul(mix(float(0.5), 1.5, options.detail.gust)).add(options.detail.streak.mul(0.5))
    : vertexFoam.add(fresh);
  const coverage = clamp(foamSum.add(whitecaps).mul(options.foamCoverage ?? 1), 0, 1).toVar();

  // foam pattern: an irregular bubbly mat thresholded by coverage (grows, tears into lace, dissolves)
  const fuv = lagXZ.mul(FOAM_SCALE);
  const p1: AnyNode = texture(options.foamTexture, fuv);
  const r2 = vec2(fuv.x.mul(0.8).sub(fuv.y.mul(0.6)), fuv.x.mul(0.6).add(fuv.y.mul(0.8)));
  const p2: AnyNode = texture(options.foamTexture, r2.mul(2.37).add(vec2(0.31, 0.77)));
  const pattern = p1.x.mul(0.62).add(p2.x.mul(0.38));
  const thresh = float(1.05).sub(coverage.mul(1.1));
  const soft = footprint.mul(0.1).add(0.06);
  const detail = smoothstep(thresh.sub(soft), thresh.add(soft), pattern).mul(p1.y.mul(0.25).add(0.8));
  // at distance the pattern averages out: use the coverage directly
  const far = smoothstep(0.15, 1.2, footprint);
  const foam = mix(detail, coverage.mul(0.85), far).toVar();
  return { normal, foam, coverage, slopes, jacobian, footprint, aeration: clamp(aeration, 0, 1) };
}

export type { Node };
