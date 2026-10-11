import { BLOCK_PIXELS, getBlock, type BlockStyle } from '@genvr/core-library';
import { BLOCKS } from '@genvr/world';
import { DataArrayTexture, NearestFilter, RepeatWrapping, SRGBColorSpace } from 'three/webgpu';
import { faceLayer } from './voxel-mesh.js';

/**
 * One texture with a layer per block face (`faceLayer`), drawn from the Core Library block
 * pictures (environment/blocks), or their plain versions: sharp pixels (nearest filtering, no
 * blur), repeating on merged faces. Blocks without a picture (air) stay empty.
 */
export function createBlockTexture(style: BlockStyle = 'pixel'): DataArrayTexture {
  const n = BLOCK_PIXELS;
  const layers = BLOCKS.length * 3;
  const data = new Uint8Array(n * n * 4 * layers);
  BLOCKS.forEach((name, block) => {
    const look = getBlock(name)?.look;
    if (!look) return;
    for (const face of ['top', 'side', 'bottom'] as const) {
      const pixels = style === 'plain' ? look.plain[face] : look[face];
      const offset = faceLayer(block, face) * n * n * 4;
      for (let row = 0; row < n; row += 1)
        for (let x = 0; x < n; x += 1) {
          // Pictures list rows from the top; texture rows start at the bottom (v = 0).
          const color = pixels[(n - 1 - row) * n + x] ?? 0xff00ff;
          const o = offset + (row * n + x) * 4;
          data[o] = (color >> 16) & 0xff;
          data[o + 1] = (color >> 8) & 0xff;
          data[o + 2] = color & 0xff;
          data[o + 3] = Math.round(look.opacity * 255);
        }
    }
  });
  const texture = new DataArrayTexture(data, n, n, layers);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
