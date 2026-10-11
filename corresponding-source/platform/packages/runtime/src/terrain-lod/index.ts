/** Tidewater4811ba48 MIT: Strugar continuous distance-dependent quadtree LOD. */
import {
  Box3,
  BufferAttribute,
  Frustum,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Matrix4,
  Sphere,
  Vector2,
  Vector3,
  Vector4,
  TSL,
  type Camera,
} from 'three/webgpu';
/* eslint-disable @typescript-eslint/no-explicit-any -- native TSL graph interface */
type N = any;
export interface TerrainLodOptions {
  gridSize?: number;
  leafSize?: number;
  levels?: number;
  rangeFactor?: number;
  morphStartRatio?: number;
  maxInstances?: number;
  minY?: number;
  maxY?: number;
  heightBounds?: ((x0: number, z0: number, x1: number, z1: number) => readonly [number, number]) | null;
  center?: { x: number; z: number; size: number } | null;
}
export interface TerrainLodVertex<T> {
  worldXZ: T;
  spacing: T;
  morphK: T;
  lod: T;
  size: T;
}
export interface TerrainLodCpuVertex {
  worldXZ: readonly [number, number];
  spacing: number;
  morphK: number;
  lod: number;
  size: number;
}

export class TerrainLod {
  readonly geometry: InstancedBufferGeometry;
  readonly G: number;
  readonly leafSize: number;
  readonly levels: number;
  readonly maxInstances: number;
  readonly ranges: number[] = [];
  readonly morph: Vector4[] = [];
  readonly uMorph: { array: Vector2[] };
  readonly uSpacing: { array: number[] };
  readonly viewPosition = TSL.uniform(new Vector3()).setGroup(TSL.renderGroup);
  readonly nodeArray: Float32Array;
  readonly nodeAttr: InstancedBufferAttribute;
  readonly lodCounts: number[];
  count = 0;
  overflowCount = 0;
  disposed = false;
  private readonly minY: number;
  private readonly maxY: number;
  private readonly heightBounds: TerrainLodOptions['heightBounds'];
  private readonly fixedRoot: TerrainLodOptions['center'];
  private readonly morphUniform: N;
  private readonly box = new Box3();
  private readonly frustum = new Frustum();
  private readonly matrix = new Matrix4();
  private readonly cam = new Vector3();
  private readonly order: { d: number; x: number; z: number; s: number; l: number }[] = [];
  constructor({
    gridSize = 64,
    leafSize = 8,
    levels = 12,
    rangeFactor = 2.5,
    morphStartRatio = 0.66,
    maxInstances = 1500,
    minY = -20,
    maxY = 20,
    heightBounds = null,
    center = null,
  }: TerrainLodOptions = {}) {
    // Explicit bounds avoid unbounded allocations/traversals while preserving all original presets.
    if (
      !Number.isInteger(gridSize) ||
      gridSize < 2 ||
      gridSize > 256 ||
      gridSize % 2 ||
      !Number.isInteger(levels) ||
      levels < 1 ||
      levels > 16 ||
      !Number.isInteger(maxInstances) ||
      maxInstances < 1 ||
      maxInstances > 16384 ||
      !Number.isFinite(leafSize) ||
      leafSize <= 0 ||
      leafSize > 1e6 ||
      !Number.isFinite(rangeFactor) ||
      rangeFactor <= 0 ||
      rangeFactor > 16 ||
      !Number.isFinite(morphStartRatio) ||
      morphStartRatio < 0 ||
      morphStartRatio >= 1 ||
      !Number.isFinite(minY) ||
      !Number.isFinite(maxY) ||
      minY > maxY
    )
      throw new RangeError('Invalid terrain LOD configuration');
    const rootSize = leafSize * 2 ** (levels - 1);
    if (
      center &&
      (!Number.isFinite(center.x) ||
        !Number.isFinite(center.z) ||
        !Number.isFinite(center.size) ||
        center.size <= 0 ||
        Math.ceil(center.size / rootSize) > 64)
    )
      throw new RangeError('Invalid or excessive terrain root domain');
    this.G = gridSize;
    this.leafSize = leafSize;
    this.levels = levels;
    this.maxInstances = maxInstances;
    this.minY = minY;
    this.maxY = maxY;
    this.heightBounds = heightBounds;
    this.fixedRoot = center ? { ...center } : null;
    let prev = 0;
    for (let l = 0; l < levels; l++) {
      const range = leafSize * 2 ** l * rangeFactor,
        start = prev + (range - prev) * morphStartRatio;
      this.ranges.push(range);
      this.morph.push(
        new Vector4(start, 1 / Math.max(1e-3, range - start), (leafSize * 2 ** l) / gridSize, 0),
      );
      prev = range;
    }
    this.uMorph = { array: this.morph.map((m) => new Vector2(m.x, m.y)) };
    this.uSpacing = { array: this.morph.map((m) => m.z) };
    this.morphUniform = TSL.uniformArray(this.morph, 'vec4').setGroup(TSL.renderGroup);
    const verts = new Float32Array((gridSize + 1) ** 2 * 3),
      indices = new Uint32Array(gridSize ** 2 * 6);
    let p = 0;
    for (let j = 0; j <= gridSize; j++)
      for (let i = 0; i <= gridSize; i++) {
        verts[p++] = i / gridSize;
        verts[p++] = 0;
        verts[p++] = j / gridSize;
      }
    p = 0;
    for (let i0 = 0; i0 < gridSize; i0 += 8)
      for (let j = 0; j < gridSize; j++)
        for (let i = i0; i < Math.min(i0 + 8, gridSize); i++) {
          const a = j * (gridSize + 1) + i,
            b = a + 1,
            c = a + gridSize + 1,
            d = c + 1;
          if ((i + j) % 2 === 0) {
            indices[p++] = a;
            indices[p++] = c;
            indices[p++] = b;
            indices[p++] = b;
            indices[p++] = c;
            indices[p++] = d;
          } else {
            indices[p++] = a;
            indices[p++] = c;
            indices[p++] = d;
            indices[p++] = a;
            indices[p++] = d;
            indices[p++] = b;
          }
        }
    this.geometry = new InstancedBufferGeometry();
    this.geometry.setAttribute('position', new BufferAttribute(verts, 3));
    this.geometry.setIndex(new BufferAttribute(indices, 1));
    this.nodeArray = new Float32Array(maxInstances * 4);
    this.nodeAttr = new InstancedBufferAttribute(this.nodeArray, 4);
    this.geometry.setAttribute('nodeData', this.nodeAttr);
    this.geometry.instanceCount = 0;
    // Shader transforms normalized grid vertices. Selection performs the precise world-space culling.
    this.geometry.boundingSphere = new Sphere(new Vector3(), 1e7);
    this.geometry.boundingBox = new Box3(new Vector3(-1e7, -1e7, -1e7), new Vector3(1e7, 1e7, 1e7));
    this.lodCounts = new Array(levels).fill(0);
  }
  /** Height must be sampled at snappedNode first. Use the view camera for every pass, including shadows. */
  snappedNode(node: N, grid: N): N {
    const h = this.morphUniform.element(TSL.int(node.w)).z;
    return node.xy.add(grid.mul(node.z)).div(h).add(0.001).floor().mul(h);
  }
  morphNode(node: N, grid: N, height: N = TSL.float(0), view: N = this.viewPosition): TerrainLodVertex<N> {
    const m = this.morphUniform.element(TSL.int(node.w)),
      h = m.z;
    const index = node.xy.add(grid.mul(node.z)).div(h).add(0.001).floor(),
      snapped = index.mul(h);
    const distance = view.sub(TSL.vec3(snapped.x, height, snapped.y)).length();
    const k = distance.sub(m.x).mul(m.y).clamp(0, 1),
      odd = index.mul(0.5).fract().mul(2);
    return {
      worldXZ: snapped.sub(odd.mul(h).mul(k)),
      spacing: h.mul(k.add(1)),
      morphK: k,
      lod: node.w,
      size: node.z,
    };
  }
  snapped(
    node: readonly [number, number, number, number],
    grid: readonly [number, number],
  ): readonly [number, number] {
    const m = this.morph[node[3]];
    if (!m) throw new RangeError('Invalid LOD');
    return [
      Math.floor((node[0] + grid[0] * node[2]) / m.z + 0.001) * m.z,
      Math.floor((node[1] + grid[1] * node[2]) / m.z + 0.001) * m.z,
    ];
  }
  morphVertex(
    node: readonly [number, number, number, number],
    grid: readonly [number, number],
    view: Vector3,
    y0 = 0,
  ): TerrainLodCpuVertex {
    const p = this.snapped(node, grid),
      m = this.morph[node[3]]!,
      h = m.z;
    const k = Math.max(0, Math.min(1, (Math.hypot(view.x - p[0], view.y - y0, view.z - p[1]) - m.x) * m.y));
    // fract must retain WGSL's nonnegative fraction for negative world lattice indices.
    const ix = Math.floor((node[0] + grid[0] * node[2]) / h + 0.001),
      iz = Math.floor((node[1] + grid[1] * node[2]) / h + 0.001);
    return {
      worldXZ: [
        p[0] - (ix * 0.5 - Math.floor(ix * 0.5)) * 2 * h * k,
        p[1] - (iz * 0.5 - Math.floor(iz * 0.5)) * 2 * h * k,
      ],
      spacing: h * (k + 1),
      morphK: k,
      lod: node[3],
      size: node[2],
    };
  }
  update(camera: Camera): void {
    if (this.disposed) return;
    camera.updateMatrixWorld();
    this.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.matrix, camera.coordinateSystem, camera.reversedDepth);
    camera.getWorldPosition(this.cam);
    this.viewPosition.value.copy(this.cam);
    this.count = 0;
    this.overflowCount = 0;
    this.lodCounts.fill(0);
    const top = this.levels - 1,
      rootSize = this.leafSize * 2 ** top;
    if (this.fixedRoot) {
      const { x, z, size } = this.fixedRoot,
        n = Math.ceil(size / rootSize);
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) this.select(x + i * rootSize, z + j * rootSize, rootSize, top);
    } else {
      const cx = Math.floor(this.cam.x / rootSize),
        cz = Math.floor(this.cam.z / rootSize);
      for (let j = -1; j <= 1; j++)
        for (let i = -1; i <= 1; i++) this.select((cx + i) * rootSize, (cz + j) * rootSize, rootSize, top);
    }
    this.order.length = this.count;
    for (let i = 0; i < this.count; i++) {
      const o = i * 4,
        s = this.nodeArray[o + 2]!,
        x = this.nodeArray[o]!,
        z = this.nodeArray[o + 1]!;
      const dx = Math.max(x - this.cam.x, 0, this.cam.x - x - s),
        dz = Math.max(z - this.cam.z, 0, this.cam.z - z - s);
      this.order[i] = { d: dx * dx + dz * dz, x, z, s, l: this.nodeArray[o + 3]! };
    }
    this.order.sort((a, b) => a.d - b.d);
    for (let i = 0; i < this.count; i++) {
      const o = this.order[i]!;
      this.nodeArray.set([o.x, o.z, o.s, o.l], i * 4);
    }
    this.geometry.instanceCount = this.count;
    this.nodeAttr.clearUpdateRanges();
    this.nodeAttr.addUpdateRange(0, this.count * 4);
    this.nodeAttr.needsUpdate = true;
  }
  private bounds(x: number, z: number, size: number): Box3 {
    const [a, b] = this.heightBounds ? this.heightBounds(x, z, x + size, z + size) : [this.minY, this.maxY];
    if (!Number.isFinite(a) || !Number.isFinite(b) || a > b)
      throw new RangeError('Invalid terrain height bounds');
    this.box.min.set(x, a, z);
    this.box.max.set(x + size, b, z + size);
    return this.box;
  }
  private intersectsSphere(box: Box3, r: number): boolean {
    const c = this.cam,
      dx = Math.max(box.min.x - c.x, 0, c.x - box.max.x),
      dy = Math.max(box.min.y - c.y, 0, c.y - box.max.y),
      dz = Math.max(box.min.z - c.z, 0, c.z - box.max.z);
    return dx * dx + dy * dy + dz * dz <= r * r;
  }
  private add(x: number, z: number, size: number, lod: number): void {
    if (this.count >= this.maxInstances) {
      this.overflowCount++;
      return;
    }
    this.nodeArray.set([x, z, size, lod], this.count * 4);
    this.count++;
    this.lodCounts[lod]!++;
  }
  private select(x: number, z: number, size: number, lod: number): boolean {
    const box = this.bounds(x, z, size);
    if (!this.intersectsSphere(box, this.ranges[lod]!)) return false;
    if (!this.frustum.intersectsBox(box)) return true;
    if (lod === 0 || !this.intersectsSphere(box, this.ranges[lod - 1]!)) {
      this.add(x, z, size, lod);
      return true;
    }
    const h = size * 0.5;
    for (const [cx, cz] of [
      [x, z],
      [x + h, z],
      [x, z + h],
      [x + h, z + h],
    ] as const) {
      if (!this.select(cx, cz, h, lod - 1)) {
        const b = this.bounds(cx, cz, h);
        if (this.frustum.intersectsBox(b)) this.add(cx, cz, h, lod);
      }
    }
    return true;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.count = 0;
    this.geometry.instanceCount = 0;
    this.geometry.dispose();
  }
}
