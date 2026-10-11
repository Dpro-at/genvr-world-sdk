/** Port of Tidewater DetailTextures.js + TerrainNoise.hash2 (MIT).
 * Copyright DRG Software Solutions LLC. Source pinned 4811ba48d795197de5621985f404e765c0b7c0ef.
 * See docs/other-programs/tidewater.md and tooling/other-programs/tidewater/LICENSE.
 * These are height/data channels, not colour; preserve source executable constants and byte truncation.
 */
import { DataTexture } from 'three/webgpu';
export declare const DETAIL_TEXTURE_SIZE = 512;
export declare function createDetailPixels(): Uint8Array;
/** Create one shared ground/rock texture. The caller owns sharing and disposal.
 * Three generates the same box-filtered RGBA8 mip chain on upload; no sRGB conversion.
 * CPU image.data remains available for source-style vegetation placement sampling.
 */
export declare function createDetailTexture(): DataTexture;
