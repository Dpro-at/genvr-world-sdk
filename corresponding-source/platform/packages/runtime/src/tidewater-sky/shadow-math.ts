/** Tidewater 4811ba48, MIT: engine/render/Shadows.js (stable frustum sphere and cadence). */
import { Matrix4, PerspectiveCamera, Vector3 } from 'three/webgpu';

export const TIDEWATER_SHADOW_SPLITS = [10, 60, 400] as const;
export const TIDEWATER_NORMAL_BIAS = [0.015, 0.06, 0.3] as const;
export const TIDEWATER_SHADOW_BIAS = 0.00002;
export const TIDEWATER_SUN_DIAMETER = 0.00925;
export const shadowMargin = (distance: number): number => {
  const e = distance / 400;
  return Math.max(0.25 * e * e, 0.25 * e) * 400;
};
export const cascadeDue = (frame: number, cascade: number): boolean =>
  (frame + cascade) % (cascade === 0 ? 1 : cascade === 1 ? 2 : 4) === 0;

/** Camera-space slice widened by its seam bands, then a rotation-invariant enclosing sphere. */
export function shadowSphere(
  camera: PerspectiveCamera,
  cascade: number,
): { center: Vector3; radius: number } {
  const x = cascade === 0 ? 0 : TIDEWATER_SHADOW_SPLITS[cascade - 1]!;
  const y = TIDEWATER_SHADOW_SPLITS[cascade]!;
  const near = Math.max(camera.near, x - shadowMargin(x) * 0.5);
  const far = cascade === 2 ? y : y + shadowMargin(y) * 0.5;
  const tanY = Math.tan((camera.fov * Math.PI) / 360);
  const tanX = tanY * camera.aspect;
  const zc = Math.min(far, ((near + far) / 2) * (1 + tanX * tanX + tanY * tanY));
  const center = new Vector3(0, 0, -zc).applyMatrix4(camera.matrixWorld);
  let radius = 0;
  for (const d of [near, far])
    for (const sx of [-1, 1])
      for (const sy of [-1, 1]) {
        radius = Math.max(
          radius,
          new Vector3(sx * tanX * d, sy * tanY * d, -d).applyMatrix4(camera.matrixWorld).distanceTo(center),
        );
      }
  return { center, radius: Math.ceil(radius * 16) / 16 };
}

/** Rounded (not floored) light-space texel grid. Eye sits radius+200 m toward the sun. */
export function shadowPose(
  center: Vector3,
  radius: number,
  sun: Vector3,
  size: number,
): { eye: Vector3; up: Vector3 } {
  const up = Math.abs(sun.y) > 0.99 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
  const rotation = new Matrix4().lookAt(sun, new Vector3(), up);
  const ls = center.clone().applyMatrix4(rotation.clone().invert());
  const texel = (2 * radius) / size;
  ls.x = Math.round(ls.x / texel) * texel;
  ls.y = Math.round(ls.y / texel) * texel;
  ls.z += radius + 200;
  return { eye: ls.applyMatrix4(rotation), up };
}
