import { type BlockStyle } from '../core-library/index.js';
import { DataArrayTexture } from 'three/webgpu';
/**
 * One texture with a layer per block face (`faceLayer`), drawn from the Core Library block
 * pictures (environment/blocks), or their plain versions: sharp pixels (nearest filtering, no
 * blur), repeating on merged faces. Blocks without a picture (air) stay empty.
 */
export declare function createBlockTexture(style?: BlockStyle): DataArrayTexture;
