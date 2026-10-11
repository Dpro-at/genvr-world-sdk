import { StorageTexture, type WebGPURenderer } from 'three/webgpu';
/** Texture side (Tidewater: 1024). */
export declare const FOAM_TEXTURE_SIZE = 1024;
/** Makes the foam pattern once; the caller owns (and disposes) the texture. */
export declare function createFoamTexture(renderer: WebGPURenderer, size?: number): StorageTexture;
