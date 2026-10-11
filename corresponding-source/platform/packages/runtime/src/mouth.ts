import { MOUTH_SHAPES, type MouthShape } from '@genvr/contracts';
import {
  BufferAttribute,
  DataTexture,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  PlaneGeometry,
  RGBAFormat,
  SRGBColorSpace,
} from 'three/webgpu';

/**
 * The mouth of the block bodies (lip sync P2-44, plan Task 2): nine small pixel pictures, one per mouth shape, in one
 * strip, shown on a little surface on the face in place of the mouth block. Pixel art fits the block look; other styles
 * get their own pictures later. `.` is clear, `l` the lips, `d` the inside, `t` teeth, `u` the tongue.
 */
const W = 16;
const H = 8;
const PICTURES: Record<MouthShape, readonly string[]> = {
  // P, B, M: lips pressed.
  A: [
    '................',
    '................',
    '................',
    '..llllllllllll..',
    '..llllllllllll..',
    '................',
    '................',
    '................',
  ],
  // Most consonants: a little open.
  B: [
    '................',
    '................',
    '...llllllllll...',
    '..lddddddddddl..',
    '...llllllllll...',
    '................',
    '................',
    '................',
  ],
  // E as in "men": open, teeth showing.
  C: [
    '................',
    '...llllllllll...',
    '..lttttttttttl..',
    '..lddddddddddl..',
    '..lddddddddddl..',
    '...llllllllll...',
    '................',
    '................',
  ],
  // A as in "father": wide open, tongue low.
  D: [
    '...llllllllll...',
    '..lttttttttttl..',
    '.lddddddddddddl.',
    '.lddddddddddddl.',
    '.ldddduuuudddddl',
    '..lduuuuuuuudl..',
    '...llllllllll...',
    '................',
  ],
  // O: rounded.
  E: [
    '................',
    '.....llllll.....',
    '....lddddddl....',
    '...lddddddddl...',
    '...lddddddddl...',
    '....lddddddl....',
    '.....llllll.....',
    '................',
  ],
  // OO, W: puckered.
  F: [
    '................',
    '................',
    '......llll......',
    '.....lddddl.....',
    '.....lddddl.....',
    '......llll......',
    '................',
    '................',
  ],
  // F, V: upper teeth on the lower lip.
  G: [
    '................',
    '................',
    '...tttttttttt...',
    '..llllllllllll..',
    '..llllllllllll..',
    '................',
    '................',
    '................',
  ],
  // L: open, tongue up behind the teeth.
  H: [
    '................',
    '...llllllllll...',
    '..lttttttttttl..',
    '..lduuuuuuuudl..',
    '..lddddddddddl..',
    '...llllllllll...',
    '................',
    '................',
  ],
  // Silence: the rest line.
  X: [
    '................',
    '................',
    '................',
    '...llllllllll...',
    '................',
    '................',
    '................',
    '................',
  ],
};

const COLORS: Record<string, [number, number, number]> = {
  l: [0x9e, 0x3f, 0x3a],
  d: [0x3a, 0x14, 0x14],
  t: [0xf4, 0xf0, 0xea],
  u: [0xe0, 0x70, 0x7a],
};

let atlas: DataTexture | null = null;

/** The nine pictures side by side (shared by every mouth). */
export function mouthAtlas(): DataTexture {
  if (atlas) return atlas;
  const width = W * MOUTH_SHAPES.length;
  const data = new Uint8Array(width * H * 4);
  MOUTH_SHAPES.forEach((shape, frame) => {
    PICTURES[shape].forEach((row, y) => {
      for (let x = 0; x < W; x += 1) {
        const color = COLORS[row[x] ?? '.'];
        if (!color) continue;
        // Texture rows start at the bottom.
        const at = ((H - 1 - y) * width + frame * W + x) * 4;
        data.set([...color, 255], at);
      }
    });
  });
  atlas = new DataTexture(data, width, H, RGBAFormat);
  atlas.magFilter = NearestFilter;
  atlas.minFilter = NearestFilter;
  atlas.colorSpace = SRGBColorSpace;
  atlas.needsUpdate = true;
  return atlas;
}

/** A mouth surface: `setShape` shows one of the nine pictures. */
export interface MouthMesh {
  mesh: Mesh;
  shape: MouthShape;
  setShape(shape: MouthShape): void;
  dispose(): void;
}

/** How far in front of the face block the mouth surface floats, so it never flickers against it. */
export const MOUTH_GAP = 0.004;

/**
 * A mouth for a face block of `size` (meters, the old mouth block's): twice as tall as the block (the shapes open up
 * and down), the width of the block and a bit; placed by the caller on the head.
 */
export function createMouth(size: readonly [number, number, number]): MouthMesh {
  const width = size[0] * 1.15;
  const geometry = new PlaneGeometry(width, width / 2);
  const material = new MeshBasicMaterial({
    map: mouthAtlas(),
    transparent: true,
    alphaTest: 0.5,
    side: DoubleSide,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = 'avatar-mouth';
  const uv = geometry.getAttribute('uv') as BufferAttribute;
  const base = Array.from(uv.array as Float32Array);
  const mouth: MouthMesh = {
    mesh,
    shape: 'X',
    setShape(shape) {
      if (shape === mouth.shape && mouth.mesh.userData.drawn) return;
      const frame = MOUTH_SHAPES.indexOf(shape);
      for (let i = 0; i < uv.count; i += 1) uv.setX(i, (frame + base[i * 2]!) / MOUTH_SHAPES.length);
      uv.needsUpdate = true;
      mouth.shape = shape;
      mouth.mesh.userData.drawn = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
  mouth.setShape('X');
  return mouth;
}
