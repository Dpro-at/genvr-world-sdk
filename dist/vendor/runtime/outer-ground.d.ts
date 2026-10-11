import { BufferGeometry } from 'three/webgpu';
/**
 * The ground beyond the playable square (R2k). It starts at the place's own border heights and eases out to their
 * mean, so a real place built high above 0 (a town on a hill) no longer ends in a cliff down to a flat sheet at 0.
 * A frame of quads around the square, never under it; `tile` metres per texture repeat.
 */
export declare function outerGroundGeometry(heightAt: (x: number, z: number) => number, half: number, tile: number): BufferGeometry;
