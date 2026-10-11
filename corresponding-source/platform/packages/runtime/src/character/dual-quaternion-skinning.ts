import {
  Matrix4,
  NodeUpdateType,
  Quaternion,
  Vector3,
  Vector4,
  TSL,
  type Material,
  type Node,
  type SkinnedMesh,
} from 'three/webgpu';

/**
 * Dual quaternion skinning for a mesh body (owner, CHAR-02: "the shoulder gets smaller when he moves"). Three's
 * skinning blends bone matrices linearly, which shrinks a joint where two bones turn far apart: the upper arm near
 * the shoulder lost up to 29 % of its thickness in Climb (measured; Stretch 18 %, Swim 20 %). Blending the bones as
 * dual quaternions keeps it at 93-101 %.
 *
 * The mesh keeps three's skinning (CPU helpers, shadows and tests still use it); the material's `positionNode`
 * replaces the drawn position and normal with the dual quaternion result. Bones must be rigid (no scale), which
 * ours are. Per avatar: the material is the avatar's own copy, and its bone table follows that avatar's skeleton.
 */

const {
  Fn,
  attribute,
  cameraPosition,
  cross,
  dot,
  float,
  fract,
  int,
  mix,
  modelWorldMatrix,
  normalLocal,
  positionLocal,
  select,
  smoothstep,
  time,
  uniformArray,
  vec3,
  vec4,
} = TSL;

/**
 * Share of the dual quaternion result in the drawn skin; the rest is three's linear blend. Pure dual quaternions
 * bulge the shoulder when the arm goes far up (owner picture: arms straight up, shoulders swollen); pure linear
 * blend shrinks it. 0.7 with the lighter weight blur (4 passes) gave the cleanest arms-up shoulder by eye; the
 * shoulder thickness then stays 0.75-1.1 of rest in every clip (human-volume.test.ts).
 */
export const DQS_SHARE = 0.7;

const skin = new Matrix4();
const rotation = new Quaternion();
const translation = new Vector3();
const scale = new Vector3();
const dual = new Quaternion();

/** Writes each bone's skin transform (mesh space) as a dual quaternion: real part, then dual part. */
function writeBones(mesh: SkinnedMesh, table: Vector4[]): void {
  const { skeleton } = mesh;
  skeleton.update();
  for (let b = 0; b < skeleton.bones.length; b += 1) {
    skin.fromArray(skeleton.boneMatrices!, b * 16).premultiply(mesh.bindMatrixInverse).multiply(mesh.bindMatrix);
    skin.decompose(translation, rotation, scale);
    dual.set(translation.x, translation.y, translation.z, 0).multiply(rotation);
    table[b * 2]!.set(rotation.x, rotation.y, rotation.z, rotation.w);
    table[b * 2 + 1]!.set(dual.x * 0.5, dual.y * 0.5, dual.z * 0.5, dual.w * 0.5);
  }
}

/**
 * How far the eyes are closed now, 0..1: a quick blink every few seconds from the frame clock, so it costs no CPU.
 */
export const BLINK = { period: 4.2, closing: 0.06 };
function blinkAmount() {
  const phase = fract(time.div(BLINK.period));
  return smoothstep(float(1 - 2 * BLINK.closing), float(1 - BLINK.closing), phase).mul(
    float(1).sub(smoothstep(float(1 - BLINK.closing * 0.35), float(1), phase)),
  );
}

/**
 * Gives a skinned mesh's (own) node material dual quaternion skinning. `offset` pushes the skin out along its
 * normals by that many metres (the anime outline's inverted hull).
 */
export function useDualQuaternionSkinning(
  mesh: SkinnedMesh,
  offset?: { width: number; reference: number; scale: readonly [number, number] },
  /** How open the mouth is (0..1), driven by speech; shared by the body and its outline. */
  mouthOpen: Node<'float'> = float(0),
): void {
  const material = mesh.material as Material & { positionNode?: unknown; isNodeMaterial?: boolean };
  if (!material.isNodeMaterial) return;
  const table = Array.from({ length: mesh.skeleton.bones.length * 2 }, () => new Vector4(0, 0, 0, 1));
  writeBones(mesh, table);
  const bones = uniformArray(table, 'vec4').onUpdate(({ object }) => {
    if (object === mesh) writeBones(mesh, table);
  }, NodeUpdateType.OBJECT);

  // q v q* for a unit quaternion: v + 2 q.xyz x (q.xyz x v + q.w v).
  const rotate = (q: Node<'vec4'>, v: Node<'vec3'>): Node<'vec3'> =>
    v.add(cross(q.xyz, cross(q.xyz, v).add(v.mul(q.w))).mul(2));

  material.positionNode = Fn(() => {
    const index = attribute('skinIndex', 'uvec4');
    const weight = attribute('skinWeight', 'vec4');
    const parts = (['x', 'y', 'z', 'w'] as const).map((k) => {
      const bone = int(index[k]).mul(2);
      // The array holds vec4s; three's types do not carry the element type through.
      const element = (i: typeof bone) => bones.element(i) as unknown as ReturnType<typeof vec4>;
      return { real: element(bone), dual: element(bone.add(1)), weight: weight[k] };
    });
    const first = parts[0]!.real;
    // Each bone's quaternion is taken on the same side as the first one (q and -q are the same turn).
    const signed = parts.map((part) => ({
      ...part,
      weight: select(dot(part.real, first).lessThan(0), part.weight.negate(), part.weight),
    }));
    const [a, b, c, e] = signed as [(typeof signed)[0], (typeof signed)[0], (typeof signed)[0], (typeof signed)[0]];
    const real = a.real.mul(a.weight).add(b.real.mul(b.weight)).add(c.real.mul(c.weight)).add(e.real.mul(e.weight));
    const dualPart = a.dual.mul(a.weight).add(b.dual.mul(b.weight)).add(c.dual.mul(c.weight)).add(e.dual.mul(e.weight));
    const length = real.length().max(float(1e-6));
    const r = real.div(length).toVar();
    const d = dualPart.div(length).toVar();
    const moved = r.w.mul(d.xyz).sub(d.w.mul(r.xyz)).add(cross(r.xyz, d.xyz)).mul(2);
    // positionLocal and normalLocal hold three's linear blend result here (its skinning runs first).
    normalLocal.assign(mix(normalLocal, rotate(r, attribute('normal', 'vec3')), DQS_SHARE).normalize());
    // The blink shape (generated body): an offset of the rest position, turned with the skin (the lids follow the
    // head rigidly, so one rotation serves both blends).
    const face = mesh.geometry.getAttribute('blink')
      ? rotate(
          r,
          attribute('blink', 'vec3')
            .mul(blinkAmount())
            .add(attribute('mouthOpen', 'vec3').mul(mouthOpen)),
        )
      : vec3(0);
    const skinned = mix(positionLocal, rotate(r, attribute('position', 'vec3')).add(moved), DQS_SHARE).add(face);
    if (!offset) return skinned;
    // A width that grows with the distance to the camera keeps the outline a steady line on screen.
    const distance = cameraPosition.distance(modelWorldMatrix.mul(vec4(skinned, 1)).xyz);
    // No outline on the eyeballs (region 2 of the generated body).
    const outside = float(1).sub(smoothstep(float(1.5), float(1.6), attribute('region', 'float')));
    const width = distance.div(offset.reference).clamp(offset.scale[0], offset.scale[1]).mul(offset.width).mul(outside);
    return skinned.add(normalLocal.mul(width));
  })();
  material.needsUpdate = true;
}
