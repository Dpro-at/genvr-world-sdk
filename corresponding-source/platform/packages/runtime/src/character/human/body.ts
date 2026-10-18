import { fitEyelidBlink } from './eyelids.js';
import { interleaveAttributes } from 'three/addons/utils/BufferGeometryUtils.js';
import { humanExpressionTargets } from './expression-targets.js';
import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  LightingModel,
  type InterleavedBufferAttribute,
  MeshBasicNodeMaterial,
  MeshToonNodeMaterial,
  MeshStandardNodeMaterial,
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
const BANDS = { shadow: [-0.3, 0.65], highlight: [0.7, 0.95], highlightShare: 0.25 };
/** How much the light shapes the face (anime faces stay mostly in the light colour). */
const FACE_LIGHT = 0.78;
/** How much of the ambient light reaches the body (less keeps the cel shading readable under bright skies). */
const AMBIENT_SHARE = 0.3;
/** Rim light along the outline: falloff power and strength (a share of the base colour). */
const RIM = { power: 3, strength: 0.22 };
/**
 * Outline (inverted hull): width in metres at `reference` metres from the camera, growing with distance within
 * `scale` so it stays a steady line on screen; its colour as a (linear) share of the surface colour.
 */
export const OUTLINE = { width: 0.0012, shade: 0.2, reference: 2.5, scale: [0.7, 5] as const };
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
  brow = '#2b1d18',
): Material {
  const skinColor = uniform(new Color(skin));
  const shortsColor = uniform(new Color(shorts));
  const region = attribute('region', 'float');
  const fantasy = skinMaterial ? skinPattern(skinMaterial) : null;
  // The drawn anime face over the skin (or the fantasy skin).
  const faceParts = faceUniforms(undefined, brow);
  if (face?.leftEye) faceParts.leftEye.value.set(...face.leftEye);
  if (face?.rightEye) faceParts.rightEye.value.set(...face.rightEye);
  const skinNode = drawFace((fantasy ? fantasy.color : skinColor) as unknown as Node<'vec3'>, face, faceParts);
  // Regions: 0 skin, 1 shorts, 2 eyeballs, 3 upper lashes, 4 lower lashes (each part has its own vertices).
  const isShorts = float(1).sub(region.sub(1).abs()).clamp(0, 1);
  const isEye = float(1).sub(region.sub(2).abs()).clamp(0, 1);
  const isUpperLash = float(1).sub(region.sub(3).abs()).clamp(0, 1);
  const isLowerLash = float(1).sub(region.sub(4).abs()).clamp(0, 1);
  // The lashes: fine dark-brown hair, a soft line above and a faint one below (owner: light, realistic lashes;
  // the anime look's bolder line comes with the face styles).
  const upperLashColor = mix(skinNode, faceParts.browColor, 0.85);
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
  // Keep the dense root; split the outer strip into tapered fine lash strands.
  const lashPosition = attribute('facePosition', 'vec3');
  const strand = lashPosition.x.mul(6200).add(along.mul(2.5)).sin().abs();
  const strandWidth = float(.5).add(along.mul(.65));
  const betweenStrands = strand.lessThan(strandWidth).select(float(1), float(0)).mul(smoothstep(float(.06), float(.16), along));
  const cut = isLash.mul(along.greaterThan(keep).select(float(1), betweenStrands));
  const animeShadow = uniform(ANIME_SHADOW) as unknown as Node<'vec3'>;
  const shadow = fantasy
    ? mix(
        mix(mix(fantasy.shadow, (shortsColor as unknown as Node<'vec3'>).mul(animeShadow), isShorts), base, isEye),
        base,
        isLash,
      )
    : mix(mix(base.mul(animeShadow), base, isEye), base, isLash);
  const material = fantasy ? new AnimeToonMaterial(
    shadow as unknown as ShadeNode,
    faceMask(face),
    isEye.add(isLash).clamp(0, 1) as unknown as Node<'float'>,
  ) : new MeshStandardNodeMaterial({ roughness: .64, metalness: 0 });
  if (material instanceof MeshStandardNodeMaterial) material.roughnessNode = mix(float(.64), float(.24), isEye);
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
  // Physical skin uses its actual silhouette; an inflated hull can pierce small facial folds.
  if (body instanceof MeshStandardNodeMaterial) material.visible = false;
  const skin = body.userData.outlineSkin as Node<'color'>;
  const shorts = body.userData.shorts as Node<'color'>;
  const region = attribute('region', 'float');
  material.colorNode = mix(skin, shorts, float(1).sub(region.sub(1).abs()).clamp(0, 1)).mul(OUTLINE.shade);
  // No outline around the lash strips (they are thin cards, their hull drew a dark band over the lids).
  material.opacityNode = region.greaterThan(2.5).select(float(0), float(1));
  material.alphaTest = 0.5;
  material.userData.outline = true;
  material.userData.face = body.userData.face;
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
  // Facial paint keeps its bind-space coordinates when the editor reshapes the body.
  geometry.setAttribute('facePosition', new BufferAttribute(body.positions.slice(), 3));
  geometry.setAttribute('skinIndex', new BufferAttribute(body.skinIndex, 4));
  geometry.setAttribute('skinWeight', new BufferAttribute(body.skinWeight, 4));
  geometry.setAttribute('region', new BufferAttribute(body.region, 1));
  // The closed-eye shape, played by the skinning node (`blinkAmount`).
  geometry.setAttribute('blink', new BufferAttribute(fitEyelidBlink(body), 3));
  geometry.setAttribute('lidDistance',new BufferAttribute(body.lidDistance ?? new Float32Array(body.positions.length/3*2).fill(1),2));
  geometry.setAttribute('mouthOpen', new BufferAttribute(body.mouthOpen, 3));
  for (const [name, values] of Object.entries(humanExpressionTargets(data, body.positions.length / 3))) geometry.setAttribute(name, new BufferAttribute(values, 3));
  geometry.setAttribute('lash', new BufferAttribute(body.lash, 1));
  geometry.setAttribute('muscleMap', new BufferAttribute(body.muscleMap, 1));
  geometry.setAttribute('fatMap', new BufferAttribute(body.fatMap, 1));
  geometry.setAttribute('muscleGroup', new BufferAttribute(body.muscleGroup, 1));
  geometry.setAttribute('fatRegion', new BufferAttribute(body.fatRegion, 1));
  geometry.setIndex(new BufferAttribute(body.triangles, 1));
  geometry.computeVertexNormals();
  // Smooth local shading discontinuities on the dense head while retaining eyelid and eye boundaries.
  const normals = geometry.getAttribute('normal');
  const eye = body.face.leftEye;
  const neighbors = new Map<number, Set<number>>();
  if (eye) {
    for (let i = 0; i < body.quads.length; i += 4) {
      const ids = Array.from(body.quads.subarray(i, i + 4));
      for (let k = 0; k < 4; k++) {
        const a = ids[k]!, b = ids[(k + 1) % 4]!;
        if (body.region[a] !== 0 || body.region[b] !== 0 || body.positions[a * 3 + 1]! < eye[1] - .16) continue;
        if (!neighbors.has(a)) neighbors.set(a, new Set());
        if (!neighbors.has(b)) neighbors.set(b, new Set());
        neighbors.get(a)!.add(b); neighbors.get(b)!.add(a);
      }
    }
  }
  const smoothHead = (attribute: BufferAttribute) => {
    for (let pass = 0; pass < 3; pass++) {
      const previous = Float32Array.from(attribute.array);
      for (const [v, adjacent] of neighbors) {
        let x = previous[v * 3]!, y = previous[v * 3 + 1]!, z = previous[v * 3 + 2]!;
        for (const n of adjacent) { x += previous[n * 3]!; y += previous[n * 3 + 1]!; z += previous[n * 3 + 2]!; }
        const length = Math.hypot(x, y, z) || 1;
        attribute.setXYZ(v, x / length, y / length, z / length);
      }
    }
  };
  smoothHead(normals as BufferAttribute);
  // The closed lid has its own surface normals, not the open eye socket's shading.
  const closure = geometry.getAttribute('blink');
  const closedPositions = body.positions.slice();
  for (let v=0;v<closure.count;v++) {
    closedPositions[v*3] = closedPositions[v*3]! + closure.getX(v);
    closedPositions[v*3+1] = closedPositions[v*3+1]! + closure.getY(v);
    closedPositions[v*3+2] = closedPositions[v*3+2]! + closure.getZ(v);
  }
  const closed = new BufferGeometry();
  closed.setAttribute('position',new BufferAttribute(closedPositions,3));
  closed.setIndex(new BufferAttribute(body.triangles,1));closed.computeVertexNormals();
  const closedNormals=closed.getAttribute('normal'), normalDelta=new Float32Array(body.positions.length);
  smoothHead(closedNormals as BufferAttribute);
  for(let v=0;v<closure.count;v++) {
    if(Math.hypot(closure.getX(v),closure.getY(v),closure.getZ(v))<.000001)continue;
    normalDelta[v*3]=closedNormals.getX(v)-normals.getX(v);
    normalDelta[v*3+1]=closedNormals.getY(v)-normals.getY(v);
    normalDelta[v*3+2]=closedNormals.getZ(v)-normals.getZ(v);
  }
  closed.dispose();geometry.setAttribute('blinkNormal',new BufferAttribute(normalDelta,3));
  // Share one vertex buffer so facial deformation stays within WebGPU's eight-buffer baseline.
  const faceAttributes = ['blink', 'mouthOpen', 'faceSmile', 'faceAngry', 'faceSad', 'faceSurprised', 'faceThinking', 'blinkNormal', 'lidDistance'];
  const interleaved = interleaveAttributes(faceAttributes.map(name => geometry.getAttribute(name) as BufferAttribute)) as unknown as InterleavedBufferAttribute[] | null;
  if (interleaved) faceAttributes.forEach((name, i) => geometry.setAttribute(name, interleaved[i]!));
  geometry.computeBoundingSphere();
  geometry.userData.quadEdges = body.quadEdges;
  geometry.userData.quads = body.quads.length / 4;
  geometry.userData.face = body.face;
  geometry.userData.joints = body.joints;
  geometry.userData.height = body.height;
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
export function setHumanColors(material: Material, skin: string, shorts: string, brow?: string): void {
  (material.userData.skin as { value: Color } | undefined)?.value.set(skin);
  (material.userData.shorts as { value: Color } | undefined)?.value.set(shorts);
  if (brow) (material.userData.face as FaceUniforms | undefined)?.browColor.value.set(brow);
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
