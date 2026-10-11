/*
 * Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC,
 * MIT (see ./LICENSE-tidewater.md). Source: src/ocean/WaterMaterial.js (waterFresnelModule L13-39, the shading
 * L286-588, the GGX helpers L649-657) and the water optics in src/engine/render/Frame.js L50-52.
 *
 * The sea's own shading (no three lighting model): exact dielectric Fresnel, the sky reflection with horizon
 * occlusion, the GGX sun glint, Cox-Munk roughness from unresolved slopes, the refracted view ray traced to the
 * sea floor, absorption and single + multiple scattering of sun and sky light (HG phase), crest glow and lit foam.
 *
 * Where we differ (three.js, our scene): the sky comes from the scene's environment map (our physical sky drawn
 * into a PMREM, no clouds, no sun disc) instead of their sky module; no screen-space reflection march and no sun
 * shadow map on the water yet; the sea floor comes from our baked depth map instead of their terrain module, and
 * the refracted picture from three's viewport copy instead of their separate refraction pass, so objects in front
 * of the floor do not shorten the water path. The swash edge, shore medium and crest path come with plan task 5.
 */
import { TSL } from 'three/webgpu';

/* eslint-disable @typescript-eslint/no-explicit-any -- TSL's typings are too narrow for these node chains */
type AnyNode = any;

const {
  cameraPosition,
  cameraProjectionMatrix,
  cameraViewMatrix,
  clamp,
  dot,
  exp,
  float,
  max,
  min,
  mix,
  normalize,
  pow,
  reflect,
  refract,
  select,
  smoothstep,
  sqrt,
  vec2,
  vec3,
  vec4,
} = TSL as AnyNode;


/**
 * `cond ? a : b` without TSL's `select`: outside uniform control flow `select` becomes an if/else, and a `toVar()`
 * first built inside one branch is then only assigned in that branch (the other reads zero). The 0/1 weight here
 * has constant branches, and `mix` evaluates both sides in the main flow.
 */
export function pick(cond: AnyNode, a: AnyNode, b: AnyNode): AnyNode {
  return mix(b, a, select(cond, float(1), float(0)));
}

/** Index of refraction of sea water (L6). */
export const IOR = 1.333;
/** Absorption per metre, red goes first (Frame.js L50). */
export const WATER_ABSORPTION = [0.42, 0.075, 0.035] as const;
/** Scattering per metre (Frame.js L52). */
export const WATER_SCATTERING = [0.012, 0.018, 0.024] as const;
/** Wind speed at 10 m for the Cox-Munk slope variance (Frame.js L51). */
export const WIND_SPEED = 7;
/** Material numbers (L72-77). */
export const BACKSCATTER = 0.035;
export const WATER_ROUGHNESS = 0.035;
/** Henyey-Greenstein asymmetry of the water's forward scattering. */
export const PHASE_G = 0.86;
/** Light through thin crests (L523). */
export const CREST_GLOW = [0.12 * 0.06, 0.55 * 0.06, 0.45 * 0.06] as const;
/** The sun glint is ~1e5 x the sky; clamp it (L373). */
export const GLINT_CLAMP = 400;

/** Exact unpolarised dielectric Fresnel, cosI > 0, eta = n2 / n1 (`fresnelDielectric`). */
export function fresnelDielectric(cosI: number, eta: number): number {
  const c = Math.min(1, Math.max(0, cosI));
  const g2 = eta * eta - 1 + c * c;
  if (g2 < 0) return 1;
  const g = Math.sqrt(g2);
  const a = (g - c) / (g + c);
  const b = (c * (g + c) - 1) / (c * (g - c) + 1);
  return 0.5 * a * a * (b * b + 1);
}

/** Henyey-Greenstein phase function (`waterPhaseHG`). */
export function waterPhaseHG(cosT: number, g: number): number {
  const g2 = g * g;
  return (1 - g2) / (4 * Math.PI) / Math.pow(Math.max(1 + g2 - cosT * 2 * g, 1e-4), 1.5);
}

export function fresnelDielectricNode(cosI: AnyNode, eta: number): AnyNode {
  const c = clamp(cosI, 0, 1);
  const g2 = float(eta * eta - 1).add(c.mul(c));
  const g = sqrt(max(g2, 0));
  const a = g.sub(c).div(g.add(c));
  const b = c.mul(g.add(c)).sub(1).div(c.mul(g.sub(c)).add(1));
  return pick(g2.lessThan(0), float(1), a.mul(a).mul(b.mul(b).add(1)).mul(0.5));
}

export function waterPhaseHGNode(cosT: AnyNode, g: number): AnyNode {
  const g2 = g * g;
  return float((1 - g2) / (4 * Math.PI)).div(pow(max(float(1 + g2).sub(cosT.mul(2 * g)), 1e-4), 1.5));
}

function dGGX(NdH: AnyNode, a2: AnyNode): AnyNode {
  const d = NdH.mul(NdH).mul(a2.sub(1)).add(1);
  return a2.div(d.mul(d).mul(Math.PI));
}

function vSmithGGX(NdL: AnyNode, NdV: AnyNode, a2: AnyNode): AnyNode {
  const gv = NdL.mul(sqrt(NdV.mul(NdV).mul(float(1).sub(a2)).add(a2)));
  const gl = NdV.mul(sqrt(NdL.mul(NdL).mul(float(1).sub(a2)).add(a2)));
  return float(0.5).div(max(gv.add(gl), 1e-5));
}

export interface WaterShadeInputs {
  /** Short-wave roughness multiplier from the sea detail (gusts > 1, slicks < 1); absent: 1. */
  rough?: AnyNode;
  /** World position of the pixel. */
  position: AnyNode;
  /** Undisplaced world xz (the FFT lookup point). */
  lagXZ: AnyNode;
  /** Sea depth under the vertex (m). */
  depth: AnyNode;
  /** Wave height of the vertex above the mean level (m). */
  height: AnyNode;
  normal: AnyNode;
  foam: AnyNode;
  jacobian: AnyNode;
  footprint: AnyNode;
  /** Unit vector toward the sun. */
  sunDir: AnyNode;
  /** Sun irradiance at the surface (three's light colour x intensity). */
  sunColor: AnyNode;
  /** Sky radiance in a direction, blurred by a roughness 0..1. */
  sky: (dir: AnyNode, roughness: AnyNode | number) => AnyNode;
  /** Hemispherical sky irradiance / PI (Tidewater's `skyIrradiance`). */
  skyIrradiance: AnyNode;
  /** Average horizon colour. */
  horizonColor: AnyNode;
  /** Sea floor depth below mean sea level at a world xz (m). */
  seaDepthAt: (xz: AnyNode) => AnyNode;
  /** The drawn scene behind the water at a screen uv (y down). */
  sceneColor: (uv: AnyNode) => AnyNode;
  /** View-space z (negative) of the drawn opaque scene at a screen uv. */
  sceneViewZ: (uv: AnyNode) => AnyNode;
  /** This pixel's screen uv. */
  screenUV: AnyNode;
  /** 1 where the surface is seen from below, else 0. */
  fromBelow: AnyNode;
  /** Extra scattering and absorption per metre in the surf zone (`shoreSurfMedium`). */
  medium?: { scatter: AnyNode; absorb: AnyNode };
  /** Bubbles mixed into the water, 0..1 (raise the backscatter). */
  aeration?: AnyNode;
  /**
   * The swash edge (WaterMaterial.js L245-283, L520-540): the film thickness (m), the distance to the swash front
   * (m, > 0 on the water side), the uprush weight, the meniscus weight, and how wet the sand beyond the front is.
   */
  edge?: { thickness: AnyNode; frontD: AnyNode; uprush: AnyNode; lipW: AnyNode; wet: AnyNode };
  /** Debug view: one of the terms instead of the colour. */
  debug?: string | undefined;
}

/** The water's colour at a pixel (radiance, before tone mapping). */
export function waterShade(i: WaterShadeInputs): AnyNode {
  const pos = i.position;
  const seenFromBelow = i.fromBelow.greaterThan(0.5);
  const toCam = cameraPosition.sub(pos);
  const V = normalize(toCam).toVar();
  const L = i.sunDir;
  const sunLight = i.sunColor;

  // shading normal on the viewer's side; facets facing away are bent to grazing, not flipped (L297-303)
  const Nside = pick(seenFromBelow, i.normal.negate(), i.normal);
  const Nview = normalize(Nside.add(V.mul(max(dot(Nside, V).negate().add(0.03), 0)))).toVar();

  // roughness from unresolved slope variance (Cox-Munk: mss = 0.003 + 0.00512 U)
  const mss = 0.003 + WIND_SPEED * 0.00512;
  const kpx = float(Math.PI).div(i.footprint);
  const unresolved = clamp(TSL.log2(float(110).div(kpx)).div(9), 0, 1);
  // gusts roughen and slicks calm the unresolved slopes (sea-detail.ts; 1 without it)
  const roughVar = i.rough ? i.rough.mul(i.rough) : float(1);
  const alpha2 = float(WATER_ROUGHNESS * WATER_ROUGHNESS)
    .add(unresolved.mul(mss * 2).mul(roughVar))
    .add(i.foam.mul(0.2))
    .toVar();
  const sigmaUnres = sqrt(unresolved.mul(mss).mul(roughVar)).toVar();

  // the surf zone's sand and bubbles add scattering and blue absorption (turquoise, milky)
  const sigA = i.medium ? vec3(...WATER_ABSORPTION).add(i.medium.absorb) : vec3(...WATER_ABSORPTION);
  const sigS = i.medium ? vec3(...WATER_SCATTERING).add(i.medium.scatter) : vec3(...WATER_SCATTERING);
  const sigT = sigA.add(sigS);
  const phaseIso = 0.3 / (4 * Math.PI);

  // ================= ABOVE WATER =================
  const N = Nview;
  const NdV = max(dot(N, V), 1e-4);
  const F = fresnelDielectricNode(NdV, IOR).toVar();

  // ---- reflection: unresolved facets tilt the average reflection toward the higher, darker sky
  const Rraw = reflect(V.negate(), N).toVar();
  const Rup = max(Rraw.y, 0.004).add(sigmaUnres.mul(1.3).mul(float(1).sub(max(Rraw.y, 0))));
  const R = normalize(vec3(Rraw.x, Rup, Rraw.z));
  // reflections pointing below the horizon hit other waves: fade toward a dark sea colour
  const horizonOcc = smoothstep(-0.12, 0.08, Rraw.y);
  const skyRefl = i.sky(R, sigmaUnres.mul(2).add(0.02));
  const reflCol = mix(i.horizonColor.mul(0.35), skyRefl, horizonOcc);

  // ---- sun glint (GGX)
  const H = normalize(L.add(V));
  const NdL = max(dot(N, L), 0);
  const NdH = max(dot(N, H), 0);
  const VdH = max(dot(V, H), 0);
  const Fs = fresnelDielectricNode(VdH, IOR);
  const spec = dGGX(NdH, alpha2).mul(vSmithGGX(NdL, NdV, alpha2)).mul(Fs).mul(NdL);
  const sunSpec = sunLight.mul(min(spec, GLINT_CLAMP)).toVar();

  // ---- refraction: trace the refracted view ray to the sea floor (2 refinements, L381-394)
  const Tr = refract(V.negate(), N, 1 / IOR);
  const Tv = normalize(vec3(Tr.x, min(Tr.y, -0.08), Tr.z)).toVar();
  const tDown = max(Tv.y.negate(), 0.04);
  const groundBelow = (xz: AnyNode) => max(i.seaDepthAt(xz), 0);
  // water column from this pixel down to the floor: pos.y - floor = wave height + depth there, along the ray
  const level0 = groundBelow(pos.xz);
  const L0 = max(level0.add(i.height), 0).div(tDown).toVar();
  const L1 = max(groundBelow(pos.xz.add(Tv.xz.mul(min(L0, 200)))).add(i.height), 0).div(tDown);
  const Lt = pick(
    L0.lessThan(100),
    max(groundBelow(pos.xz.add(Tv.xz.mul(min(L1.mul(0.5).add(L0.mul(0.5)), 200)))).add(i.height), 0).div(tDown),
    L0,
  );
  const pathLen = clamp(Lt, 0, 400).toVar();

  // project the refracted end point to the screen; off screen: the unrefracted pixel
  const pEnd = pos.add(Tv.mul(min(pathLen, 80)));
  const clip = cameraProjectionMatrix.mul(cameraViewMatrix.mul(vec4(pEnd, 1)));
  const ndc = clip.xy.div(max(clip.w, 1e-4));
  const uvR = vec2(ndc.x.mul(0.5).add(0.5), ndc.y.mul(-0.5).add(0.5));
  const onScreen = uvR.x.greaterThan(0).and(uvR.x.lessThan(1)).and(uvR.y.greaterThan(0)).and(uvR.y.lessThan(1));
  // Only what lies behind this surface point can be seen through it (WATER_BEHIND, L427-456): the refracted end
  // point often projects onto the dry beach in front of shallow water, which would paste smeared sand into the sea.
  const surfViewZ = cameraViewMatrix.mul(vec4(pos, 1)).z;
  const behind = surfViewZ.sub(i.sceneViewZ(clamp(uvR, 0.0005, 0.9995))).greaterThan(0.05);
  // Thin water at the waterline (Tidewater's filmW, L458-468): the refraction offset is tiny there and its end
  // point is the first to fall on the beach in front, so fade to the pixel straight behind. The scene depth
  // check above is kept for objects in front of deeper water.
  const film = smoothstep(0.15, 1.5, i.seaDepthAt(pos.xz));
  const uvF = mix(i.screenUV, pick(onScreen.and(behind), uvR, i.screenUV), film);
  const sceneCol = i.sceneColor(uvF);

  // ---- the water volume: absorption, single scattering of sun and sky, multiple-scattering backscatter
  const Ls = refract(L.negate(), vec3(0, 1, 0), 1 / IOR).negate();
  const muS = max(Ls.y, 0.1);
  const muV = max(Tv.y.negate(), 0.15);
  const Tview = exp(sigT.negate().mul(pathLen));
  const sunIn = sunLight.mul(float(1).sub(fresnelDielectricNode(max(L.y, 0.02), IOR)));
  const kSun = sigT.mul(muV.div(muS).add(1));
  const kAmb = sigT.mul(muV.div(0.75).add(1));
  const phase = waterPhaseHGNode(dot(Tv, Ls), PHASE_G).mul(0.7).add(phaseIso);
  const bb = i.aeration ? sigS.mul(mix(float(BACKSCATTER), 0.06, clamp(i.aeration.mul(2), 0, 1))) : sigS.mul(BACKSCATTER);
  const albedoMS = bb.mul(0.33 * 4).div(sigA.add(bb));
  const inSun = sunIn
    .mul(sigS.mul(phase).add(albedoMS.mul(sigT).mul(1 / Math.PI)))
    .mul(float(1).sub(exp(kSun.negate().mul(pathLen))))
    .div(kSun);
  const inAmb = i.skyIrradiance
    .mul(sigS.mul(0.25).add(albedoMS.mul(sigT)))
    .mul(float(1).sub(exp(kAmb.negate().mul(pathLen))))
    .div(kAmb);

  // crest translucency: sun through thin wave tips, also side-lit
  const vH = normalize(vec2(V.x, V.z).add(1e-5));
  const lH = normalize(vec2(L.x, L.z).add(1e-5));
  const back = pow(clamp(dot(vH, lH.negate()).mul(0.6).add(0.4), 0, 1), 2.5);
  const crest = clamp(i.height.mul(0.9).add(0.1), 0, 1).mul(clamp(float(1).sub(N.y).mul(4), 0, 1).add(0.25));
  const sss = sunLight
    .mul(vec3(...CREST_GLOW))
    .mul(back)
    .mul(crest)
    .mul(smoothstep(0, 0.25, L.y));

  // the bead of the meniscus shades the sand right under it
  const lipShade = i.edge ? float(1).sub(i.edge.lipW.mul(0.3)) : float(1);
  const transmitted = sceneCol.mul(Tview).mul(lipShade).add(inSun).add(inAmb).add(sss);

  // ---- foam: a bright diffuse scatterer (albedo ~0.85), wrapped sun + sky
  const foamLit = sunLight
    .mul(max(dot(N, L), 0).mul(0.75).add(0.25))
    .mul(1 / Math.PI)
    .add(i.skyIrradiance.mul(0.95))
    .mul(0.85);
  let above: AnyNode;
  let edgeView: AnyNode = vec3(0, 0, 0);
  if (i.edge) {
    const { thickness, frontD, uprush, wet } = i.edge;
    // a thin bright rim just behind the edge: the rounded bead catches the sky
    const rim = smoothstep(0, 0.025, frontD).mul(smoothstep(0.1, 0.035, frontD)).mul(uprush);
    const water = mix(transmitted, reflCol, F).add(sunSpec).add(skyRefl.mul(rim.mul(0.22)));
    const shaded = mix(water, foamLit.add(sunSpec.mul(0.05)), clamp(i.foam, 0, 1));
    // fade into the sand right at the leading edge (anti-aliased by the film thickness)
    // (fwidth capped at 5 cm: where the sheet meets the wave surface the mesh can step steeply inside one pixel
    // quad, and an uncapped width faded the water to sand in a dashed line well away from the front)
    const edgeAA = smoothstep(0, TSL.clamp(TSL.fwidth(thickness).mul(1.5), 0.004, 0.05), thickness);
    // contact shadow: the sand just ahead of the advancing edge is darker (the bead's shadow, the wetting front);
    // further up, sand the last waves wetted stays darker (Genvr's stand-in for ShoreSim's wet sand)
    const contact = smoothstep(-0.16, -0.005, frontD).mul(float(1).sub(edgeAA)).mul(uprush);
    const sandC = i
      .sceneColor(i.screenUV)
      .mul(float(1).sub(contact.mul(0.3)))
      .mul(float(1).sub(clamp(wet, 0, 1).mul(0.32)));
    above = mix(sandC, shaded, edgeAA);
    edgeView = vec3(edgeAA, clamp(thickness.mul(5), 0, 1), clamp(frontD.mul(0.2), 0, 1));
  } else {
    const water = mix(transmitted, reflCol, F).add(sunSpec);
    above = mix(water, foamLit.add(sunSpec.mul(0.05)), clamp(i.foam, 0, 1));
  }

  // ================= BELOW WATER (looking up at the surface, L549-587) =================
  const Fb = fresnelDielectricNode(NdV, 1 / IOR);
  const Tt = refract(V.negate(), N, IOR);
  const Td = normalize(pick(dot(Tt, Tt).greaterThan(0.5), Tt, vec3(0, 1, 0)));
  const skyT = min(i.sky(Td, 0.05), vec3(60, 60, 60));
  const Rr = reflect(V.negate(), N);
  const muU = max(Ls.y, 0.15);
  const phR = waterPhaseHGNode(dot(Rr, Ls), PHASE_G).mul(0.7).add(phaseIso);
  const kS = sigT.mul(float(1).sub(min(Rr.y, 0).div(muU)));
  const kA = sigT.mul(float(1).sub(min(Rr.y, 0).div(0.8)));
  const deepCol = sunIn
    .mul(sigS.mul(phR).add(albedoMS.mul(sigT).mul(1 / Math.PI)))
    .div(kS)
    .add(i.skyIrradiance.mul(Math.PI).mul(sigS.mul(1 / (4 * Math.PI)).add(albedoMS.mul(sigT).mul(1 / Math.PI))).div(kA));
  const foamUnder = i.skyIrradiance.add(sunLight.mul(0.5)).mul(0.25);
  const below = mix(skyT.mul(float(1).sub(Fb)).add(deepCol.mul(Fb)), foamUnder, clamp(i.foam, 0, 1).mul(0.7));

  const views: Record<string, AnyNode> = {
    fresnel: vec3(F, F, F),
    reflection: reflCol,
    transmitted,
    glint: sunSpec,
    path: vec3(pathLen.mul(0.1), 0, 0),
    scene: i.sceneColor(i.screenUV),
    refracted: sceneCol,
    behind: vec3(pick(behind, float(1), float(0)), pick(onScreen, float(1), float(0)), 0),
    sceneZ: vec3(i.sceneViewZ(i.screenUV).negate().mul(0.01), surfViewZ.negate().mul(0.01), 0),
    below: vec3(i.fromBelow, 0, 0),
    mixref: mix(vec3(0, 0, 0), reflCol, F),
    above,
    edge: edgeView,
  };
  if (i.debug && views[i.debug]) return views[i.debug];
  return min(mix(above, below, i.fromBelow), vec3(16000, 16000, 16000));
}

