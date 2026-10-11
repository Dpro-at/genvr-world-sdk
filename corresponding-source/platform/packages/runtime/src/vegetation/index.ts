/** Tidewater 4811ba48, ©2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { Vector2, Vector3 } from 'three';
import { bandFade, bayer4 } from '../tidewater-sky/lod-fade.js';

export const VEGETATION_LOD_BAND = 0.12;
export const IMPOSTOR_FRAMES = 6;
export const IMPOSTOR_FRAME_PIXELS = 128;
export const IMPOSTOR_BLEND_DISTANCE = 100;
export const SHRUB_MAX_DISTANCE = 180;
export type VegetationWindow = readonly [from: number, fadeStart: number, fadeEnd: number];

/** Source hemi-octahedral layout, not the full-sphere octahedral normal encoding. */
export function octDecode(u: number, v: number, out = new Vector3()): Vector3 {
  const x = (u - v) * 0.5, z = (u + v) * 0.5;
  return out.set(x, 1 - Math.abs(x) - Math.abs(z), z).normalize();
}

/** Nonzero upper-hemisphere direction; mirrors source vegOctEncode WGSL. */
export function octEncode(direction: Vector3, out = new Vector2()): Vector2 {
  const length = Math.abs(direction.x) + Math.abs(direction.y) + Math.abs(direction.z);
  return out.set((direction.x + direction.z) / length, (direction.z - direction.x) / length);
}

export function frameBasis(direction: Vector3): { right: Vector3; up: Vector3 } {
  const right = new Vector3().crossVectors(new Vector3(0, 1, 0), direction);
  if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
  right.normalize();
  return { right, up: new Vector3().crossVectors(direction, right).normalize() };
}

/** Distance is full 3D distance from instance base to the MAIN camera, including in shadows. */
export function vegetationLodScale(distance: number, [from, start, end]: VegetationWindow): number {
  if (distance < from * (1 - VEGETATION_LOD_BAND / 2)) return 0;
  return end - start < 0.05
    ? Number(distance < start * (1 + VEGETATION_LOD_BAND / 2))
    : 1 - bandFade(distance, start, end);
}

/** Complementary near/far masks share pixel coordinates AND frame index. */
export function vegetationLodVisible(
  distance: number, [from, start, end]: VegetationWindow, x: number, y: number, frame = 0,
): boolean {
  const threshold = bayer4(x, y, frame);
  const ramp = (switchDistance: number) => bandFade(
    distance, switchDistance * (1 - VEGETATION_LOD_BAND / 2),
    switchDistance * (1 + VEGETATION_LOD_BAND / 2),
  );
  return threshold < (from > 0 ? ramp(from) : 1)
    && threshold >= (end - start < 0.05 ? ramp(start) : 0);
}

/** Source removes half of deterministic crowns at320m, enlarging survivors to preserve coverage. */
export function impostorThinning(distance: number, seed: number): { keep: boolean; scale: number } {
  const thin = bandFade(distance, 140, 320);
  const hash = seed * 91.7 - Math.floor(seed * 91.7);
  return { keep: hash >= thin * 0.5, scale: 1 + thin * (1 / Math.sqrt(0.5) - 1) };
}
