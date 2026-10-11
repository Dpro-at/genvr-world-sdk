/** Tidewater 4811ba48, MIT: engine/render/Shadows.js (stable frustum sphere and cadence). */
import { PerspectiveCamera, Vector3 } from 'three/webgpu';
export declare const TIDEWATER_SHADOW_SPLITS: readonly [10, 60, 400];
export declare const TIDEWATER_NORMAL_BIAS: readonly [0.015, 0.06, 0.3];
export declare const TIDEWATER_SHADOW_BIAS = 0.00002;
export declare const TIDEWATER_SUN_DIAMETER = 0.00925;
export declare const shadowMargin: (distance: number) => number;
export declare const cascadeDue: (frame: number, cascade: number) => boolean;
/** Camera-space slice widened by its seam bands, then a rotation-invariant enclosing sphere. */
export declare function shadowSphere(camera: PerspectiveCamera, cascade: number): {
    center: Vector3;
    radius: number;
};
/** Rounded (not floored) light-space texel grid. Eye sits radius+200 m toward the sun. */
export declare function shadowPose(center: Vector3, radius: number, sun: Vector3, size: number): {
    eye: Vector3;
    up: Vector3;
};
