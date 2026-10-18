import { Color, TSL, Vector2, Vector3, Vector4, type Node } from 'three/webgpu';

/**
 * The drawn anime face (CHAR-02 face work; owner references docs/reference/character-anime/anime-style/): eyes with
 * a white, an iris in two tones, a pupil and two highlights, a thick upper lash line with an outer wing and a light
 * lower line, drawn brows, a small nose line and a mouth line that opens with speech. Drawn in the body's rest
 * space from the face landmarks of the shaped head (`HumanBody.face`), so it stays on the face in every move, and
 * painted over the skin colour (also over fantasy skins). The eyes blink by themselves.
 *
 * Sizes are metres on the head (the anime boy's eyes sit 3.4 cm either side of the middle).
 */

const { abs, attribute, float, max, mix, smoothstep, uniform, vec2, vec3 } = TSL;

type Vec3 = [number, number, number];
type F = Node<'float'>;

/** Shape of the anime eye and face parts (metres on the head). */
export const FACE_SHAPE = {
  eye: { halfWidth: 0.0185, halfHeight: 0.0145, lowerFlat: 0.75, raise: 0.002 },
  iris: { width: 0.55, height: 0.64 },
  pupil: 0.48,
  lash: { upper: 0.0016, lower: 0.0007, wing: 0.004, lowerStrength: 0.35, rim: 0.0208, rimSoft: 0.0014 },
  brow: { above: 0.014, halfLength: 0.018, thickness: 0.001, arch: 13 },
  nose: { below: 0.052, halfLength: 0.0035, strength: 0.18 },
  mouth: { y: -0.024, halfWidth: 0.018, thickness: 0.0006, open: 0.007, strength: 0.55 },
  /** Seconds between blinks and how long a blink takes (as a share of the period). */
  blink: { period: 4.2, closing: 0.035 },
};

/** A uniform node with its CPU value (three's types lose the node type of `uniform`). */
type Uniform<T extends 'float' | 'vec2' | 'vec3' | 'vec4', V> = Node<T> & { value: V };

export interface FaceUniforms {
  eyeColor: Uniform<'vec3', Color>;
  lineColor: Uniform<'vec3', Color>;
  browColor: Uniform<'vec3', Color>;
  /** Where the eyes look: -1..1 left/right, down/up. */
  look: Uniform<'vec2', Vector2>;
  /** Mouth opening 0..1 and width 0..1 (lip sync). */
  mouthOpen: Uniform<'float', number>;
  /** -1 automatic blinking; 0 open .. 1 closed for eyelid inspection. */
  eyeClosure: Uniform<'float', number>;
  leftEye: Uniform<'vec3', Vector3>;
  rightEye: Uniform<'vec3', Vector3>;
  expressions: Uniform<'vec4', Vector4>;
  thinking: Uniform<'float', number>;
  emotion: Uniform<'float', number>;
  browTilt: Uniform<'float', number>;
  surprise: Uniform<'float', number>;
  mouthWide: Uniform<'float', number>;
}

export function faceUniforms(eye = '#704a32', brow = '#2b1d18'): FaceUniforms {
  const make = <T extends 'float' | 'vec2' | 'vec3' | 'vec4', V>(value: V) => uniform(value as never) as unknown as Uniform<T, V>;
  return {
    eyeColor: make<'vec3', Color>(new Color(eye)),
    lineColor: make<'vec3', Color>(new Color('#1a1210')),
    browColor: make<'vec3', Color>(new Color(brow)),
    look: make<'vec2', Vector2>(new Vector2(0, 0)),
    mouthOpen: make<'float', number>(0),
    eyeClosure: make<'float', number>(-1),
    leftEye: make<'vec3', Vector3>(new Vector3()),
    rightEye: make<'vec3', Vector3>(new Vector3()),
    mouthWide: make<'float', number>(0.5),
    expressions: make<'vec4', Vector4>(new Vector4()), thinking: make<'float', number>(0),
    emotion: make<'float', number>(0), browTilt: make<'float', number>(0), surprise: make<'float', number>(0),
  };
}

/** A soft 0..1 band: 1 inside [from, to] of `value`, fading over `soft`. */
const band = (value: F, from: number | F, to: number | F, soft: number) =>
  smoothstep(float(from as number).sub(soft), float(from as number), value).mul(
    float(1).sub(smoothstep(float(to as number), float(to as number).add(soft), value)),
  );

/**
 * Paints the face over `skin` (a colour node) and returns the new colour node. `face` holds the landmarks of the
 * shaped head; without them the skin is returned unchanged.
 */
export function drawFace(skin: Node<'vec3'>, face: Record<string, Vec3> | undefined, u: FaceUniforms): Node<'vec3'> {
  if (!face?.leftUpperLid || !face.rightUpperLid || !face.leftLowerLid || !face.jaw) return skin;
  const p = attribute('facePosition', 'vec3');
  const n = attribute('normal', 'vec3');
  const s = FACE_SHAPE;
  const lidZ = face.leftUpperLid[2];
  const eyeY = (face.leftUpperLid[1] + face.leftLowerLid[1]) / 2 + s.eye.raise;
  // Only the front of the head: the face plane and surfaces turned toward the front.
  const front = smoothstep(float(0.25), float(0.45), n.z).mul(smoothstep(float(lidZ - 0.05), float(lidZ - 0.03), p.z));


  let color: Node<'vec3'> = skin;
  const contour = attribute('lidDistance','vec2');
  const upperMargin = float(1).sub(smoothstep(float(.00025),float(.0011),contour.x));
  const lowerMargin = float(1).sub(smoothstep(float(.0002),float(.001),contour.y));
  const fold = band(contour.x,.0025,.0045,.0012).mul(front).mul(.12);
  color = mix(color,skin.mul(vec3(.7,.51,.48)),fold);
  color = mix(color,skin.mul(vec3(.8,.48,.46)),lowerMargin.mul(.22));
  color = mix(color,u.lineColor,upperMargin.mul(.75));
  for (const side of [1, -1] as const) {
    const upper = side > 0 ? face.leftUpperLid : face.rightUpperLid;
    const cx = upper[0];
    const dx = p.x.sub(cx).mul(side); // + toward the outer corner
    // Tapered hair density, with a softer inner edge and individual irregular strands.
    const bx = dx.add(.001);
    const t = bx.div(s.brow.halfLength).clamp(-1, 1);
    const archY = float(eyeY + s.brow.above + .001)
      .sub(bx.pow(2).mul(9)).add(bx.mul(.035))
      .add(bx.mul(u.browTilt).mul(.35)).add(u.surprise.mul(.005));
    const taper = float(1).sub(t.abs().pow(2)).max(0).pow(.55);
    const thickness = taper.mul(.002).mul(float(1).sub(t.mul(.28))).add(.00015);
    const by = p.y.sub(archY);
    const silhouette = band(by, thickness.negate(), thickness, .0007)
      .mul(band(bx, -s.brow.halfLength, s.brow.halfLength, .0025)).mul(front);
    const hairNoise = TSL.mx_noise_float(vec3(bx.add(by.mul(.6)).mul(4500), by.mul(250), float(7))).mul(.5).add(.5);
    const density = smoothstep(float(.18), float(.72), hairNoise).mul(.65).add(.27);
    color = mix(color, u.browColor, silhouette.mul(density));
  }

  // Nose: a short soft line below the eyes, slightly to one side (light from the left).
  const noseY = eyeY - s.nose.below;
  const nose = band(p.y.sub(noseY), -0.0006, 0.0006, 0.0005)
    .mul(band(p.x.sub(0.002), -s.nose.halfLength, s.nose.halfLength, 0.0008))
    .mul(front)
    .mul(s.nose.strength);
  color = mix(color, u.lineColor, nose);

  // Mouth: a line that opens into a dark-red shape with speech; wider or narrower by the viseme.
  const mouthY = (face.jaw[1] + eyeY) / 2 + s.mouth.y;
  const halfWidth = float(s.mouth.halfWidth).mul(float(0.75).add(u.mouthWide.mul(0.5)));
  const mx = p.x.div(halfWidth);
  const my = p.y.sub(mouthY).sub(mx.pow(2).mul(u.emotion).mul(.003));
  const openHeight = u.mouthOpen.max(u.surprise.mul(.6)).mul(s.mouth.open).max(0.0001);
  const inner = float(1)
    .sub(smoothstep(float(0.85), float(1), mx.pow(2).add(my.div(openHeight).pow(2))))
    .mul(front)
    .mul(smoothstep(float(0.05), float(0.2), u.mouthOpen));
  const line = band(my, -s.mouth.thickness, s.mouth.thickness, 0.0004)
    .mul(band(mx, -1, 1, 0.12))
    .mul(front)
    .mul(s.mouth.strength);
  // Cupid's bow and a fuller lower lip, softly tapered into the existing lip geometry.
  const lipX = p.x.div(halfWidth.mul(1.12));
  const taper = float(1).sub(lipX.pow(2)).max(0);
  const cupid = float(1).sub(smoothstep(float(.08), float(.3), lipX.abs())).mul(.0008);
  const upperLip = taper.mul(.003).sub(cupid);
  const lowerLip = taper.mul(-.0036);
  const lip = band(my, lowerLip, upperLip, .0012)
    .mul(band(lipX, -1, 1, .12)).mul(front);
  const lipTone = mix(skin.mul(vec3(.8, .43, .43)), skin.mul(vec3(.9, .58, .56)),
    float(1).sub(smoothstep(float(-.002), float(.001), my)));
  color = mix(color, lipTone, lip.mul(.65));
  color = mix(color, vec3(0.22, 0.055, 0.055), inner);
  color = mix(color, u.lineColor, line);
  return color;
}

/**
 * The eyeball (region 2 of the generated body, MakeHuman's CC0 eyeball in the opening of the lids): a white with an
 * anime iris in two tones, a pupil and two highlights, drawn from the direction of each point seen from the
 * eyeball's centre (`face.leftEye` / `face.rightEye`), turned by the look.
 */
export function drawEyeball(face: Record<string, Vec3> | undefined, u: FaceUniforms): Node<'vec3'> {
  const white = vec3(0.96, 0.95, 0.94);
  if (!face?.leftEye || !face.rightEye) return white;
  const p = attribute('facePosition', 'vec3');
  const s = FACE_SHAPE;
  const left = p.x.greaterThan(0);
  const centre = left.select(vec3(...face.leftEye), vec3(...face.rightEye));
  const d = p.sub(centre).normalize();
  const side = left.select(float(1), float(-1));
  // Looking: the iris centre moves over the ball.
  const ix = d.x.sub(u.look.x.mul(side).mul(0.25)).mul(side);
  const iy = d.y.sub(u.look.y.mul(0.2));
  const facing = smoothstep(float(0.1), float(0.3), d.z);
  const irisE = ix.div(s.iris.width * 0.75).pow(2).add(iy.div(s.iris.height * 0.75).pow(2));
  const iris = float(1).sub(smoothstep(float(0.85), float(1), irisE)).mul(facing);
  const pupil = float(1).sub(smoothstep(float(0.8), float(1), irisE.div(s.pupil * s.pupil))).mul(facing);
  const radial = vec2(ix, iy).length().max(.001);
  const fibers = ix.div(radial).mul(93).add(radial.mul(28)).sin().mul(.09).add(.91);
  const tone = mix(u.eyeColor.mul(0.4), u.eyeColor.mul(1.25), float(1).sub(smoothstep(float(-0.45), float(0.35), iy))).mul(fibers);
  const limbal = smoothstep(float(.62), float(.95), irisE).mul(iris).mul(.72);
  const shine = (x: number, y: number, r: number) =>
    float(1).sub(smoothstep(float(r * 0.7), float(r), vec2(ix.sub(x), iy.sub(y)).length())).mul(facing);
  let color: Node<'vec3'> = white;
  color = mix(color, tone, iris);
  color = mix(color, u.eyeColor.mul(.22), limbal);
  color = mix(color, vec3(0.05, 0.04, 0.05), pupil);
  color = mix(color, vec3(1, 1, 1), max(shine(-0.14, 0.22, 0.09), shine(0.14, -0.2, 0.045)));
  return color;
}

/**
 * Where the face is (0..1, rest space): the front of the head around the eyes, nose and mouth. Anime faces are lit
 * softly there (the ChatGPT review: face light influence 0.35), so the realistic sculpt of cheeks, nose and lips
 * does not break into cel-shading patches.
 */
export function faceMask(face: Record<string, Vec3> | undefined): Node<'float'> {
  if (!face?.leftEye || !face.rightEye || !face.jaw) return float(0);
  const p = attribute('facePosition', 'vec3');
  const centre = vec3(0, (face.leftEye[1] + face.jaw[1]) / 2, face.leftEye[2]);
  const reach = (face.leftEye[1] - face.jaw[1]) * 1.1;
  const near = float(1).sub(smoothstep(float(reach * 0.75), float(reach), p.sub(centre).length()));
  return near.mul(smoothstep(float(face.leftEye[2] - 0.06), float(face.leftEye[2] - 0.02), p.z));
}
