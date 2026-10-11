import {
  DoubleSide,
  FrontSide,
  MeshPhysicalNodeMaterial,
  MeshStandardNodeMaterial,
  TSL,
  type Node,
  type NodeBuilder,
} from 'three/webgpu';
import { CLAM_CLOSE_SHARPNESS } from './motion.js';

/* eslint-disable @typescript-eslint/no-explicit-any -- native TSL node graph boundary (as in vegetation/palm-material.ts) */
type N = any;
const t = TSL as N;

/**
 * Sea-life materials (SEALIFE-01): plain TSL node materials, so the same graph compiles to WGSL on WebGPU and to
 * GLSL on the WebGL2 backend (no `wgslFn`, no stand-ins needed). Everything that differs per item lives in vertex
 * attributes written by `sealife/mesh.ts`, so one material per kind draws every size, palette and seed:
 *
 * - colour `color`, back-side colour `aInner` (inside of a shell or a tube), spot colour and amount `aSpot`;
 * - `aPattern` = (spot frequency 1/m, line amount, roughness, bump strength); `uv.y` is the line coordinate;
 * - `aMotion` (see `sealife/motion.ts`): the offset is computed from the raw geometry position in the item's own
 *   frame and turned by the copy's instance matrix, so it follows the item's turn and lean.
 *
 * Spots are worley cells in the item's own (rest) coordinates, lines are bands on whole numbers of `uv.y`; both
 * tint towards the spot colour and raise a small bump (screen-space derivative normal, as three's bump map).
 * Pattern detail fades out where a cell gets smaller than a few pixels, so far copies do not shimmer.
 *
 * The motion lives in `positionNode` (and the shadow caster position), so shadows move with the shape.
 */

export type SeaMotionKind = 'none' | 'lift' | 'hinge';

/** How far the shadow casters of double-sided sheets are pushed away from the light (m). */
export const SHADOW_INSET = 0.012;

export interface SeaMaterialOptions {
  motion: SeaMotionKind;
  doubleSided: boolean;
  /** Physical material with clearcoat on glossy (low-roughness) vertices. */
  gloss: boolean;
}

/** The hinge motion's close amount and angle (shared by position and normal). */
function hinge(motion: N): { close: N; c: N; s: N } {
  const close = t.pow(t.cos(t.time.mul(motion.z).add(motion.y)).mul(0.5).add(0.5), CLAM_CLOSE_SHARPNESS);
  const angle = motion.x.mul(close);
  return { close, c: t.cos(angle), s: t.sin(angle) };
}

/**
 * The instance matrix of the copy being drawn, read the way three's own instancing reads it (a uniform buffer
 * indexed by the instance), or null outside an InstancedMesh or past the uniform-buffer limit (then the copy keeps
 * its rest pose). Motion is computed in the item's own frame and turned into the placed frame with it.
 */
const instanceMatrix = (builder: NodeBuilder): N => {
  const object = (builder as N).object;
  const matrices = object?.isInstancedMesh ? object.instanceMatrix : null;
  if (!matrices || matrices.isStorageInstancedBufferAttribute) return null;
  const count = Math.max(matrices.count, 1);
  if (count * 64 > (builder as N).getUniformBufferLimit()) return null;
  return t.buffer(matrices.array, 'mat4', count).element(t.instanceIndex);
};

/**
 * The moved position as a `positionNode` (after the instance transform, so the shadow pass, which only carries
 * `positionNode` / `castShadowPositionNode`, draws the same moving shape). The offset is computed from the raw
 * geometry position in the item's own frame, then turned by the instance matrix.
 */
function movedPosition(kind: SeaMotionKind): N {
  if (kind === 'none') return null;
  return t.Fn((builder: NodeBuilder) => {
    const motion = t.attribute('aMotion', 'vec4');
    const p = t.positionGeometry;
    let offset: N;
    if (kind === 'lift') offset = t.vec3(0, motion.x.mul(t.sin(t.time.mul(motion.z).add(motion.y)).mul(0.5).add(0.5)), 0);
    else {
      const { close, c, s } = hinge(motion);
      offset = t.vec3(0, p.y.mul(c).sub(p.z.mul(s)).sub(motion.w.mul(close)), p.y.mul(s).add(p.z.mul(c))).sub(t.vec3(0, p.y, p.z));
    }
    const matrix = instanceMatrix(builder);
    const placed = matrix ? matrix.mul(t.vec4(offset, 0)).xyz : offset;
    return t.positionLocal.add(placed);
  })();
}

/** Hinge normals turn with the valves (before instancing; three's instancing then turns them into place). */
function turnNormals(kind: SeaMotionKind): void {
  if (kind !== 'hinge') return;
  const { c, s } = hinge(t.attribute('aMotion', 'vec4'));
  const n = t.normalLocal.toVar();
  t.normalLocal.assign(t.vec3(n.x, n.y.mul(c).sub(n.z.mul(s)), n.y.mul(s).add(n.z.mul(c))));
}

/** Surface nodes shared by every kind. */
function surface(material: MeshStandardNodeMaterial, gloss: boolean): void {
  const pattern = t.attribute('aPattern', 'vec4');
  const spot = t.attribute('aSpot', 'vec4');
  const base = t.attribute('color', 'vec3');
  const inner = t.attribute('aInner', 'vec3');
  const cellPos = t.positionGeometry.mul(pattern.x);
  // How many cells a pixel spans: fade the detail before it shimmers.
  const detail = t.smoothstep(0.7, 0.25, t.length(t.fwidth(cellPos)));
  const cell = t.mx_worley_noise_float(cellPos);
  const spots = t.smoothstep(0.5, 0.2, cell).mul(spot.w);
  const lineDistance = t.abs(t.fract(t.uv().y.add(0.5)).sub(0.5));
  const lines = t.smoothstep(0.3, 0.06, lineDistance).mul(pattern.y);
  const front = t.faceDirection.greaterThan(0);
  const tint = t.mix(spot.w.mul(0.3).add(pattern.y.mul(0.25)), t.max(spots, lines), detail);
  const outer = t.mix(base, spot.xyz, t.clamp(tint, 0, 1));
  material.colorNode = t.select(front, outer, inner);
  const height = spots.add(lines.mul(0.6)).mul(detail).mul(pattern.w);
  // Bump: three's perturbNormalArb with the pattern height.
  material.normalNode = t.Fn(() => {
    const dHdx = t.clamp(t.dFdx(height), -0.4, 0.4).mul(0.25);
    const dHdy = t.clamp(t.dFdy(height), -0.4, 0.4).mul(0.25);
    const sigmaX = t.dFdx(t.positionView).normalize();
    const sigmaY = t.dFdy(t.positionView).normalize();
    const normal = t.normalView;
    const r1 = sigmaY.cross(normal);
    const r2 = normal.cross(sigmaX);
    const det = sigmaX.dot(r1).mul(t.faceDirection);
    const gradient = det.sign().mul(dHdx.mul(r1).add(dHdy.mul(r2)));
    return det.abs().mul(normal).sub(gradient).normalize();
  })();
  const roughness = pattern.z.add(tint.mul(0.08));
  material.roughnessNode = t.clamp(t.select(front, roughness, t.max(roughness, 0.45)), 0.05, 1);
  material.metalness = 0;
  if (gloss && material instanceof MeshPhysicalNodeMaterial) {
    material.clearcoatNode = t.select(front, t.smoothstep(0.4, 0.12, pattern.z), 0);
    material.clearcoatRoughnessNode = t.float(0.08);
  }
}

class SeaStandardMaterial extends MeshStandardNodeMaterial {
  constructor(private readonly motionKind: SeaMotionKind) {
    super();
  }

  override setupPosition(builder: NodeBuilder): Node {
    turnNormals(this.motionKind);
    return super.setupPosition(builder);
  }
}

class SeaPhysicalMaterial extends MeshPhysicalNodeMaterial {
  constructor(private readonly motionKind: SeaMotionKind) {
    super();
  }

  override setupPosition(builder: NodeBuilder): Node {
    turnNormals(this.motionKind);
    return super.setupPosition(builder);
  }
}

export function createSeaMaterial(options: SeaMaterialOptions): MeshStandardNodeMaterial {
  const material = options.gloss ? new SeaPhysicalMaterial(options.motion) : new SeaStandardMaterial(options.motion);
  material.side = options.doubleSided ? DoubleSide : FrontSide;
  material.name = `sealife.${options.motion}${options.gloss ? '.gloss' : ''}`;
  surface(material, options.gloss);
  const moved = movedPosition(options.motion);
  if (moved) material.positionNode = moved;
  // Thin double-sided sheets (shell valves, tubes) would shadow themselves at their own depth (acne and hard
  // patches under the lips). Their shadow casters are pushed a little away from the light instead (the shadow
  // pass draws from the light's camera): a per-material depth bias, independent of the world's shadow settings.
  if (options.doubleSided) {
    const view = t.cameraViewMatrix;
    // Row 2 of the view matrix is the camera's z axis in world space; the camera looks along -z.
    const away = t.vec3(view.element(0).z, view.element(1).z, view.element(2).z).negate();
    const local = t.modelWorldMatrixInverse.mul(t.vec4(away, 0)).xyz.normalize();
    material.castShadowPositionNode = (moved ?? t.positionLocal).add(local.mul(SHADOW_INSET));
  }
  return material;
}

/** Shared material keys (`registerGeneratorMaterial`). */
export const SEALIFE_MATERIALS = {
  starfish: 'sealife.starfish',
  clam: 'sealife.clam',
  shell: 'sealife.shell',
} as const;

export const SEALIFE_MATERIAL_OPTIONS: Readonly<Record<keyof typeof SEALIFE_MATERIALS, SeaMaterialOptions>> = {
  starfish: { motion: 'lift', doubleSided: false, gloss: false },
  clam: { motion: 'hinge', doubleSided: true, gloss: true },
  shell: { motion: 'none', doubleSided: true, gloss: true },
};
