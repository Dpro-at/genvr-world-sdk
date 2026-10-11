import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  LightingModel,
  MeshBasicNodeMaterial,
  MeshToonNodeMaterial,
  TSL,
  type Material,
  type Node,
  type NodeBuilder,
} from 'three/webgpu';

type DirectLightInput = Parameters<LightingModel['direct']>[0];
type Vec3 = ReturnType<typeof TSL.vec3>;
type ShadeNode = Node<'vec3'>;
type IndirectContext = {
  ambientOcclusion: ReturnType<typeof TSL.float>;
  irradiance: Vec3;
  reflectedLight: { indirectDiffuse: Vec3 };
};
import { HUMAN_FACE_LANDMARKS, type SkinMaterial } from '@genvr/core-library';
import { drawEyeball, drawFace, faceMask, faceUniforms, type FaceUniforms } from './face.js';
import { decodeHuman, type HumanData } from './format.js';
import { animeShapeWeights, buildWeights, generateHuman, type HumanGender, type HumanStyle } from './generate.js';

/**
 * Our generated human body in three.js (CHAR-02): the baked data is fetched once, the generator builds the body for
 * a style and gender, and this turns it into one skinned geometry (joint order of the Core `human` body) and the
 * style's material: anime cel shading with warm shadows and an outline, base shorts as a test garment.
 */


const loads = new Map<string, Promise<HumanData>>();

/** The baked data at a URL, fetched and read once. */
export function loadHumanData(url: string): Promise<HumanData> {
  let load = loads.get(url);
  if (!load) {
    load = fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`Human data: HTTP ${response.status}`);
        return response.arrayBuffer();
      })
      .then(decodeHuman);
    load.catch(() => loads.delete(url));
    loads.set(url, load);
  }
  return load;
}

/** Default colours of the base body. */
export const HUMAN_SKIN = '#f0c4a6';
export const HUMAN_SHORTS = '#2f3446';

/**
 * The colour a surface takes in shadow, as a share of its own colour per channel: warm and rosy, never grey
 * (owner's ChatGPT anime palette: shadows go to rose and terracotta; fitted to its skin/shadow pairs, a little
 * deeper so the form reads).
 */
export const ANIME_SHADOW = new Color(0.8, 0.66, 0.64);
/** Light bands on dot(normal, light): the shadow edge and the highlight edge (soft, anime cel shading). */
const BANDS = { shadow: [-0.06, 0.06], highlight: [0.55, 0.65], highlightShare: 0.25 };
/** How much the light shapes the face (anime faces stay mostly in the light colour). */
const FACE_LIGHT = 0.3;
/** How much of the ambient light reaches the body (less keeps the cel shading readable under bright skies). */
const AMBIENT_SHARE = 0.45;
/** Rim light along the outline: falloff power and strength (a share of the base colour). */
const RIM = { power: 3, strength: 0.22 };
/**
 * Outline (inverted hull): width in metres at `reference` metres from the camera, growing with distance within
 * `scale` so it stays a steady line on screen; its colour as a (linear) share of the surface colour.
 */
export const OUTLINE = { width: 0.002, shade: 0.2, reference: 2.5, scale: [0.7, 5] as const };
/**
 * How much of each lash strip is drawn, from the lid rim (0) to the tip (1): a line at the root, the rest cut
 * away (owner note 53: the whole strip drawn solid read as a grey band over the lid). The lower lashes are not
 * drawn at all (owner: the lower lid needs no line).
 */
export const LASH_KEEP = { upper: 0.6, lower: -1 };

const {
  attribute,
  diffuseColor,
  dot,
  float,
  max,
  mix,
  mx_fractal_noise_float,
  mx_noise_float,
  mx_worley_noise_float,
  mx_worley_noise_vec2,
  normalView,
  positionViewDirection,
  pow,
  smoothstep,
  time,
  uniform,
  vec3,
  BRDF_Lambert,
} = TSL;

/**
 * Anime cel lighting: each light paints the surface between its shadow colour and its full colour in soft bands
 * (shadow, lit, highlight) instead of darkening it; ambient light falls on the shadow colour. So a skin keeps its
 * warmth in shadow on every tone (owner, CHAR-02: "the colours look bad").
 */
class AnimeLightingModel extends LightingModel {
  constructor(
    private readonly shadow: ShadeNode,
    private readonly soft: Node<'float'>,
    private readonly flat: Node<'float'>,
  ) {
    super();
  }

  override direct(input: DirectLightInput): void {
    // three's TSL types are loose here; the inputs are vec3 nodes.
    const { lightDirection, lightColor, reflectedLight } = input as unknown as {
      lightDirection: Vec3;
      lightColor: Vec3;
      reflectedLight: { directDiffuse: Vec3 };
    };
    const nl = dot(normalView, lightDirection);
    const lit = smoothstep(float(BANDS.shadow[0]), float(BANDS.shadow[1]), nl)
      .mul(1 - BANDS.highlightShare)
      .add(smoothstep(float(BANDS.highlight[0]), float(BANDS.highlight[1]), nl).mul(BANDS.highlightShare));
    // The face is lit softly: most of it stays in the light colour whatever its sculpt (FACE_LIGHT).
    const facing = mix(lit, lit.mul(FACE_LIGHT).add(1 - FACE_LIGHT), this.soft);
    // Eyes and lashes take no cel shadow at all (owner: the eye's shadow changing as he moved looked wrong).
    const painted = mix(this.shadow, diffuseColor.rgb, mix(facing, float(1), this.flat));
    reflectedLight.directDiffuse.addAssign(lightColor.mul(BRDF_Lambert({ diffuseColor: painted }) as unknown as Vec3));
  }

  override indirect(builder: NodeBuilder): void {
    const { ambientOcclusion, irradiance, reflectedLight } = builder.context as unknown as IndirectContext;
    reflectedLight.indirectDiffuse.addAssign(
      irradiance.mul(BRDF_Lambert({ diffuseColor: this.shadow }) as unknown as Vec3).mul(AMBIENT_SHARE),
    );
    reflectedLight.indirectDiffuse.mulAssign(ambientOcclusion);
  }
}

class AnimeToonMaterial extends MeshToonNodeMaterial {
  constructor(
    private readonly shadow: ShadeNode,
    private readonly soft: Node<'float'>,
    private readonly flat: Node<'float'>,
  ) {
    super();
  }

  override setupLightingModel(): LightingModel {
    return new AnimeLightingModel(this.shadow, this.soft, this.flat);
  }
}

/**
 * A fantasy skin material's colour and glow (owner, CHAR-02): procedural patterns in the body's rest space (the
 * bind-pose position), so the pattern stays on the skin when it moves. Returns the skin colour node, the glow node
 * and the shadow colour node.
 */
function skinPattern(spec: SkinMaterial) {
  const rest = attribute('position', 'vec3');
  const drift = spec.animated ? time.mul(0.15) : float(0);
  const p = rest.mul(spec.patternScale).add(vec3(0, drift, 0));
  const base = uniform(new Color(spec.base));
  const secondary = uniform(new Color(spec.secondary));
  const ink = uniform(new Color(spec.patternColor));
  // The background drifts between the two colours on soft noise.
  const cloud = mx_fractal_noise_float(rest.mul(spec.patternScale * 0.35).add(vec3(drift, 0, 0)), 3)
    .mul(0.5)
    .add(0.5)
    .clamp(0, 1);
  let mask: Node<'float'>;
  switch (spec.pattern) {
    case 'cracks': {
      // Worley edges: where the nearest and second nearest cell points are almost equally far.
      const cells = mx_worley_noise_vec2(p);
      mask = float(1).sub(smoothstep(float(0), float(0.07), cells.y.sub(cells.x)));
      break;
    }
    case 'scales': {
      const cells = mx_worley_noise_vec2(p);
      mask = float(1).sub(smoothstep(float(0.02), float(0.12), cells.y.sub(cells.x))).max(cells.x.mul(0.6));
      break;
    }
    case 'stars': {
      const near = mx_worley_noise_float(p);
      const twinkle = spec.animated ? time.mul(2).add(cloud.mul(20)).sin().mul(0.25).add(0.75) : float(1);
      mask = float(1).sub(smoothstep(float(0.03), float(0.12), near)).mul(twinkle);
      break;
    }
    case 'spots': {
      const near = mx_worley_noise_float(p);
      mask = float(1).sub(smoothstep(float(0.25), float(0.3), near));
      break;
    }
    case 'freckles': {
      const near = mx_worley_noise_float(p);
      const where = smoothstep(float(0.15), float(0.55), mx_noise_float(rest.mul(3)));
      mask = float(1).sub(smoothstep(float(0.06), float(0.12), near)).mul(where).mul(0.8);
      break;
    }
    case 'stripes': {
      // Bands across the body, bent by noise.
      const bent = p.y.add(mx_noise_float(rest.mul(spec.patternScale * 0.6)).mul(1.4));
      mask = smoothstep(float(0.55), float(0.75), bent.mul(Math.PI).sin().abs());
      break;
    }
    case 'veins': {
      const line = mx_noise_float(p).abs();
      mask = float(1).sub(smoothstep(float(0.02), float(0.08), line));
      break;
    }
    case 'marble': {
      const swirl = p.x.add(mx_fractal_noise_float(p, 4).mul(3)).mul(Math.PI).sin().abs();
      mask = float(1).sub(smoothstep(float(0), float(0.12), swirl)).mul(0.8);
      break;
    }
    default:
      mask = float(0);
  }
  let color = mix(mix(base, secondary, cloud), ink, mask);
  if (spec.overlay) {
    // Moss or snow on the surfaces that face up, broken up by noise.
    const up = smoothstep(
      float(0.35),
      float(0.8),
      attribute('normal', 'vec3').y.add(mx_noise_float(rest.mul(6)).mul(0.5)),
    );
    color = mix(color, uniform(new Color(spec.overlay.color)), up.mul(spec.overlay.amount));
  }
  const pulse = spec.animated ? time.mul(1.6).sin().mul(0.2).add(0.8) : float(1);
  const glow = spec.emissive
    ? uniform(new Color(spec.emissive)).mul(mask).mul((spec.emissiveStrength ?? 0) * 0.35).mul(pulse)
    : vec3(0);
  return { color, glow, shadow: uniform(new Color(spec.shadow)) };
}

/**
 * The anime body material: cel shading with warm shadows, skin and shorts by region, rim light (one draw call);
 * `skinMaterial` paints a fantasy skin over the skin region.
 */
export function humanMaterial(
  skin = HUMAN_SKIN,
  shorts = HUMAN_SHORTS,
  skinMaterial?: SkinMaterial,
  face?: Record<string, [number, number, number]>,
): Material {
  const skinColor = uniform(new Color(skin));
  const shortsColor = uniform(new Color(shorts));
  const region = attribute('region', 'float');
  const fantasy = skinMaterial ? skinPattern(skinMaterial) : null;
  // The drawn anime face over the skin (or the fantasy skin).
  const faceParts = faceUniforms();
  const skinNode = drawFace((fantasy ? fantasy.color : skinColor) as unknown as Node<'vec3'>, face, faceParts);
  // Regions: 0 skin, 1 shorts, 2 eyeballs, 3 upper lashes, 4 lower lashes (each part has its own vertices).
  const isShorts = float(1).sub(region.sub(1).abs()).clamp(0, 1);
  const isEye = float(1).sub(region.sub(2).abs()).clamp(0, 1);
  const isUpperLash = float(1).sub(region.sub(3).abs()).clamp(0, 1);
  const isLowerLash = float(1).sub(region.sub(4).abs()).clamp(0, 1);
  // The lashes: fine dark-brown hair, a soft line above and a faint one below (owner: light, realistic lashes;
  // the anime look's bolder line comes with the face styles).
  const upperLashColor = mix(skinNode, faceParts.lineColor, 0.72);
  const lowerLashColor = mix(skinNode, faceParts.lineColor, 0.22);
  const base = mix(
    mix(mix(mix(skinNode, shortsColor, isShorts), drawEyeball(face, faceParts), isEye), upperLashColor, isUpperLash),
    lowerLashColor,
    isLowerLash,
  );
  const isLash = isUpperLash.add(isLowerLash);
  // Past the root line the lash strip is not drawn (alpha test).
  const along = attribute('lash', 'float');
  const keep = mix(float(LASH_KEEP.upper), float(LASH_KEEP.lower), isLowerLash);
  const cut = isLash.mul(along.greaterThan(keep).select(float(1), float(0)));
  const animeShadow = uniform(ANIME_SHADOW) as unknown as Node<'vec3'>;
  const shadow = fantasy
    ? mix(
        mix(mix(fantasy.shadow, (shortsColor as unknown as Node<'vec3'>).mul(animeShadow), isShorts), base, isEye),
        base,
        isLash,
      )
    : mix(mix(base.mul(animeShadow), base, isEye), base, isLash);
  const material = new AnimeToonMaterial(
    shadow as unknown as ShadeNode,
    faceMask(face),
    isEye.add(isLash).clamp(0, 1) as unknown as Node<'float'>,
  );
  material.colorNode = base;
  material.opacityNode = float(1).sub(cut);
  material.alphaTest = 0.5;
  // A soft light along the body's outline (anime rim light): the form reads round instead of flat.
  const facing = max(dot(normalView, positionViewDirection), float(0));
  const rim = pow(float(1).sub(facing), float(RIM.power)).mul(RIM.strength);
  const glow = fantasy ? fantasy.glow.mul(float(1).sub(isShorts).sub(isEye).clamp(0, 1)) : vec3(0);
  // NodeMaterial reads `emissiveNode` for every material; three's types only declare it on the standard one.
  (material as unknown as { emissiveNode: unknown }).emissiveNode = base.mul(rim).add(glow);
  material.userData.skin = skinColor;
  material.userData.shorts = shortsColor;
  // The outline follows the fantasy base colour (a dark line of the material, not of the plain skin).
  material.userData.outlineSkin = fantasy ? uniform(new Color(skinMaterial!.shadow)) : skinColor;
  material.userData.skinMaterial = skinMaterial?.id ?? '';
  material.userData.face = faceParts;
  return material;
}

/**
 * The anime outline: the body drawn again from its back faces, pushed out along the normals (`OUTLINE.width`,
 * applied by the skinning node), in a dark shade of each surface's own colour. Shares the colour uniforms of the
 * body material so recolouring updates both.
 */
export function humanOutlineMaterial(body: Material): Material {
  const material = new MeshBasicNodeMaterial({ side: BackSide });
  const skin = body.userData.outlineSkin as Node<'color'>;
  const shorts = body.userData.shorts as Node<'color'>;
  const region = attribute('region', 'float');
  material.colorNode = mix(skin, shorts, float(1).sub(region.sub(1).abs()).clamp(0, 1)).mul(OUTLINE.shade);
  // No outline around the lash strips (they are thin cards, their hull drew a dark band over the lids).
  material.opacityNode = region.greaterThan(2.5).select(float(0), float(1));
  material.alphaTest = 0.5;
  material.userData.outline = true;
  return material;
}

/** The skinned geometry of a generated body; `userData.quadEdges` holds the quad wireframe index. */
export function humanGeometry(
  data: HumanData,
  style: HumanStyle = 'anime',
  gender: HumanGender = 'boy',
  animeShape = 0,
  build: Readonly<Record<string, number>> = {},
): BufferGeometry {
  const body = generateHuman(data, style, gender, HUMAN_FACE_LANDMARKS, {
    ...animeShapeWeights(animeShape),
    ...buildWeights(build),
  });
  if (!body) throw new Error(`No ${style} ${gender} body yet`);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(body.positions, 3));
  geometry.setAttribute('skinIndex', new BufferAttribute(body.skinIndex, 4));
  geometry.setAttribute('skinWeight', new BufferAttribute(body.skinWeight, 4));
  geometry.setAttribute('region', new BufferAttribute(body.region, 1));
  // The closed-eye shape, played by the skinning node (`blinkAmount`).
  geometry.setAttribute('blink', new BufferAttribute(body.blink, 3));
  geometry.setAttribute('mouthOpen', new BufferAttribute(body.mouthOpen, 3));
  geometry.setAttribute('lash', new BufferAttribute(body.lash, 1));
  geometry.setAttribute('muscleMap', new BufferAttribute(body.muscleMap, 1));
  geometry.setAttribute('fatMap', new BufferAttribute(body.fatMap, 1));
  geometry.setAttribute('muscleGroup', new BufferAttribute(body.muscleGroup, 1));
  geometry.setAttribute('fatRegion', new BufferAttribute(body.fatRegion, 1));
  geometry.setIndex(new BufferAttribute(body.triangles, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.userData.quadEdges = body.quadEdges;
  geometry.userData.quads = body.quads.length / 4;
  geometry.userData.face = body.face;
  // The lighter level of detail (same vertices, the finer muscle areas merged back): swapped in by `humanDetail`.
  if (body.lodTriangles) geometry.userData.lodIndex = new BufferAttribute(body.lodTriangles, 1);
  return geometry;
}

/**
 * A generated body's geometry at a level of detail: `full`, or `lite` (the same vertex buffers with the lighter
 * index; made once and kept on the full geometry). Bodies baked without a lighter index stay full.
 */
export function humanDetail(full: BufferGeometry, detail: 'full' | 'lite'): BufferGeometry {
  const index = full.userData.lodIndex as BufferAttribute | undefined;
  if (detail === 'full' || !index) return full;
  let lite = full.userData.lite as BufferGeometry | undefined;
  if (!lite) {
    lite = new BufferGeometry();
    for (const [key, attribute] of Object.entries(full.attributes)) lite.setAttribute(key, attribute);
    lite.setIndex(index);
    lite.boundingSphere = full.boundingSphere?.clone() ?? null;
    lite.userData = { ...full.userData, full };
    full.userData.lite = lite;
  }
  return lite;
}

/** Recolours a generated body's own material (skin and shorts; owner, CHAR-02: skin colour per character). */
export function setHumanColors(material: Material, skin: string, shorts: string): void {
  (material.userData.skin as { value: Color } | undefined)?.value.set(skin);
  (material.userData.shorts as { value: Color } | undefined)?.value.set(shorts);
}

/**
 * Mouth shapes (the game's lip sync visemes, contracts `MOUTH_SHAPES`) as the drawn mouth's opening and width:
 * X rest and A (M, B, P) closed; B slightly open; C open; D wide open; E rounded; F "oo"; G "f"/"v"; H "l".
 */
const MOUTH: Record<string, [open: number, wide: number]> = {
  X: [0, 0.5],
  A: [0, 0.45],
  B: [0.3, 0.55],
  C: [0.6, 0.65],
  D: [1, 0.8],
  E: [0.5, 0.3],
  F: [0.35, 0.15],
  G: [0.15, 0.5],
  H: [0.45, 0.55],
};

/** Shapes the drawn mouth of a generated body for a lip sync viseme. */
export function setHumanMouth(material: Material, shape: string): void {
  const face = material.userData.face as FaceUniforms | undefined;
  const [open, wide] = MOUTH[shape] ?? MOUTH.X!;
  if (!face) return;
  face.mouthOpen.value = open;
  face.mouthWide.value = wide;
}
