/** Exact SurfFoam.js lace generator, MIT DRG Software Solutions LLC, pinned4811ba48.
 * Source CPU-rounded mip chain is retained (different from float GPU mip rounding). */
import { DataTexture } from 'three/webgpu';
export declare const LACE_TILE = 3.5;
export declare function createLacePixels(size?: number): Uint8Array;
export declare function createLaceMipmaps(size?: number): Array<{
    data: Uint8Array;
    width: number;
    height: number;
}>;
export declare function createLaceTexture(): DataTexture;
