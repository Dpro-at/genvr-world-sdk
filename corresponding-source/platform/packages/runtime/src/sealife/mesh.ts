import {
  BufferGeometry,
  Float32BufferAttribute,
  InterleavedBuffer,
  InterleavedBufferAttribute,
  Uint16BufferAttribute,
  Uint32BufferAttribute,
} from 'three/webgpu';

/**
 * Geometry builder of the sea-life generators (SEALIFE-01): indexed, smooth-shaded meshes with the attributes the
 * sea-life materials read (`sealife/material.ts`). Every vertex carries its own colours and pattern settings, so one
 * shared material draws every variant of a kind.
 */

export type Vec3 = [number, number, number];
export type Vec4 = [number, number, number, number];

/** One surface point. */
export interface SeaPoint {
  p: Vec3;
  /** Base colour (linear 0-1 sRGB components; converted once by the builder). */
  color: Vec3;
  /** Colour of the back side (inside of a shell or a tube). */
  inner?: Vec3;
  /** Colour of spots/tubercles and how strongly they show (0-1). */
  spot?: Vec4;
  /** Spot frequency (1/m), line amount (0-1), roughness (0-1), bump strength (0-1). */
  pattern?: Vec4;
  /** Line coordinate: growth lines or bands fall on whole numbers. */
  line?: number;
  /** Animation data; its meaning is the material's (see `sealife/motion.ts`). */
  motion?: Vec4;
}

const ZERO4: Vec4 = [0, 0, 0, 0];
/** Floats per vertex in the interleaved buffer: colour 3, inner 3, uv 2, spot 4, pattern 4, motion 4. */
const STRIDE = 20;
const PATTERN0: Vec4 = [0, 0, 0.6, 0];

/** sRGB component to linear (three's vertex colours are linear). */
const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

/** A hex colour such as '#e0662a' as 0-1 sRGB components. */
export function hex(color: string): Vec3 {
  const n = parseInt(color.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export const mixColor = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

export const scaleColor = (a: Vec3, s: number): Vec3 => [
  Math.min(1, a[0] * s),
  Math.min(1, a[1] * s),
  Math.min(1, a[2] * s),
];

export class SeaMesh {
  readonly position: number[] = [];
  readonly color: number[] = [];
  readonly inner: number[] = [];
  readonly spot: number[] = [];
  readonly pattern: number[] = [];
  readonly uv: number[] = [];
  readonly motion: number[] = [];
  readonly index: number[] = [];

  get vertexCount(): number {
    return this.position.length / 3;
  }

  get triangleCount(): number {
    return this.index.length / 3;
  }

  add(point: SeaPoint): number {
    const { p, color } = point;
    const inner = point.inner ?? color;
    const spot = point.spot ?? ZERO4;
    this.position.push(p[0], p[1], p[2]);
    this.color.push(toLinear(color[0]), toLinear(color[1]), toLinear(color[2]));
    this.inner.push(toLinear(inner[0]), toLinear(inner[1]), toLinear(inner[2]));
    this.spot.push(toLinear(spot[0]), toLinear(spot[1]), toLinear(spot[2]), spot[3]);
    this.pattern.push(...(point.pattern ?? PATTERN0));
    this.uv.push(0, point.line ?? 0);
    this.motion.push(...(point.motion ?? ZERO4));
    return this.vertexCount - 1;
  }

  tri(a: number, b: number, c: number): void {
    this.index.push(a, b, c);
  }

  /** Two triangles a-b-c, a-c-d (counter-clockwise seen from the front). */
  quad(a: number, b: number, c: number, d: number): void {
    this.index.push(a, b, c, a, c, d);
  }

  /** Quads between two rows of equal length; `wrap` closes the strip (last column joins the first). */
  stitch(rowA: readonly number[], rowB: readonly number[], wrap = false, flip = false): void {
    const n = rowA.length;
    const last = wrap ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const j = (i + 1) % n;
      if (flip) this.quad(rowA[i]!, rowA[j]!, rowB[j]!, rowB[i]!);
      else this.quad(rowA[i]!, rowB[i]!, rowB[j]!, rowA[j]!);
    }
  }

  /** Triangles from one centre vertex to a row. */
  fan(center: number, row: readonly number[], wrap = false, flip = false): void {
    const n = row.length;
    const last = wrap ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const j = (i + 1) % n;
      if (flip) this.tri(center, row[j]!, row[i]!);
      else this.tri(center, row[i]!, row[j]!);
    }
  }

  build(): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(this.position, 3));
    // Everything else in one interleaved buffer: WebGPU allows 8 vertex buffers per pipeline, and the instance
    // matrix and colour of an InstancedMesh need two of them.
    const count = this.vertexCount;
    const data = new Float32Array(count * STRIDE);
    for (let i = 0; i < count; i++) {
      const o = i * STRIDE;
      data.set(this.color.slice(i * 3, i * 3 + 3), o);
      data.set(this.inner.slice(i * 3, i * 3 + 3), o + 3);
      data.set(this.uv.slice(i * 2, i * 2 + 2), o + 6);
      data.set(this.spot.slice(i * 4, i * 4 + 4), o + 8);
      data.set(this.pattern.slice(i * 4, i * 4 + 4), o + 12);
      data.set(this.motion.slice(i * 4, i * 4 + 4), o + 16);
    }
    const buffer = new InterleavedBuffer(data, STRIDE);
    geometry.setAttribute('color', new InterleavedBufferAttribute(buffer, 3, 0));
    geometry.setAttribute('aInner', new InterleavedBufferAttribute(buffer, 3, 3));
    geometry.setAttribute('uv', new InterleavedBufferAttribute(buffer, 2, 6));
    geometry.setAttribute('aSpot', new InterleavedBufferAttribute(buffer, 4, 8));
    geometry.setAttribute('aPattern', new InterleavedBufferAttribute(buffer, 4, 12));
    geometry.setAttribute('aMotion', new InterleavedBufferAttribute(buffer, 4, 16));
    geometry.setIndex(
      this.vertexCount < 65536
        ? new Uint16BufferAttribute(this.index, 1)
        : new Uint32BufferAttribute(this.index, 1),
    );
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }
}
