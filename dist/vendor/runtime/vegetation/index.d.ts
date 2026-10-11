/** Tidewater 4811ba48, ©2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { Vector2, Vector3 } from 'three';
export declare const VEGETATION_LOD_BAND = 0.12;
export declare const IMPOSTOR_FRAMES = 6;
export declare const IMPOSTOR_FRAME_PIXELS = 128;
export declare const IMPOSTOR_BLEND_DISTANCE = 100;
export declare const SHRUB_MAX_DISTANCE = 180;
export type VegetationWindow = readonly [from: number, fadeStart: number, fadeEnd: number];
/** Source hemi-octahedral layout, not the full-sphere octahedral normal encoding. */
export declare function octDecode(u: number, v: number, out?: Vector3): Vector3;
/** Nonzero upper-hemisphere direction; mirrors source vegOctEncode WGSL. */
export declare function octEncode(direction: Vector3, out?: Vector2): Vector2;
export declare function frameBasis(direction: Vector3): {
    right: Vector3;
    up: Vector3;
};
/** Distance is full 3D distance from instance base to the MAIN camera, including in shadows. */
export declare function vegetationLodScale(distance: number, [from, start, end]: VegetationWindow): number;
/** Complementary near/far masks share pixel coordinates AND frame index. */
export declare function vegetationLodVisible(distance: number, [from, start, end]: VegetationWindow, x: number, y: number, frame?: number): boolean;
/** Source removes half of deterministic crowns at320m, enlarging survivors to preserve coverage. */
export declare function impostorThinning(distance: number, seed: number): {
    keep: boolean;
    scale: number;
};
