/** Tidewater4811ba48 Impostors.js atlas/frame port, MIT; LICENSE-tidewater.md. */
import {
  Color,
  DepthFormat,
  DepthTexture,
  FloatType,
  InstancedMesh,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  NoColorSpace,
  OrthographicCamera,
  RenderTarget,
  Scene,
  UnsignedByteType,
  Vector3,
  type BufferGeometry,
  type Material,
  type WebGPURenderer,
} from 'three/webgpu';
import { frameBasis, IMPOSTOR_FRAME_PIXELS, IMPOSTOR_FRAMES, octDecode } from './index.js';

export interface ImpostorGroup {
  variants: readonly BufferGeometry[];
  center: Vector3;
  radius: number;
  rh: number;
  hv: number;
}
export interface IndexedImpostorGroup extends ImpostorGroup {
  variantBase: number;
}

/** Source bounds about the plant's vertical axis, including its frame padding. */
export function impostorAxisSphere(geometry: BufferGeometry): Omit<ImpostorGroup, 'variants'> {
  const p = geometry.getAttribute('position'),
    v = new Vector3();
  let y0 = Infinity,
    y1 = -Infinity;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    y0 = Math.min(y0, v.y);
    y1 = Math.max(y1, v.y);
  }
  const center = new Vector3(0, (y0 + y1) * 0.5, 0);
  let r = 0,
    rh = 0;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    r = Math.max(r, v.distanceTo(center));
    rh = Math.max(rh, Math.hypot(v.x, v.z));
  }
  return { center, radius: r * 1.02, rh: rh * 1.03, hv: (y1 - y0) * 0.5 * 1.03 };
}

/** Plant-local geometry to source atlas cell coordinates, before its group orthographic camera. */
export function impostorFrameMatrices(group: IndexedImpostorGroup, variant: number): Matrix4[] {
  const mats: Matrix4[] = [],
    R = group.radius,
    C = group.center,
    N = IMPOSTOR_FRAMES;
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const d = octDecode(-1 + (2 * i) / (N - 1), -1 + (2 * j) / (N - 1));
      const { right, up } = frameBasis(d);
      const cx = ((group.variantBase + variant) * N + i + 0.5) * 2 * R,
        cy = (j + 0.5) * 2 * R;
      mats.push(
        new Matrix4().set(
          right.x,
          right.y,
          right.z,
          -C.dot(right) + cx,
          up.x,
          up.y,
          up.z,
          -C.dot(up) + cy,
          d.x,
          d.y,
          d.z,
          -C.dot(d),
          0,
          0,
          0,
          1,
        ),
      );
    }
  return mats;
}

/** Two RGBA8 data atlases. Geometry/materials are borrowed; targets and batch buffers are owned.
 * Run bake before a live render frame (not concurrently on the same renderer).
 * Native Three uses its own depth convention instead of the source reversed-depth clear value. */
export class ImpostorAtlas {
  readonly groups: readonly IndexedImpostorGroup[];
  readonly variantCount: number;
  readonly width: number;
  readonly height = IMPOSTOR_FRAMES * IMPOSTOR_FRAME_PIXELS;
  readonly rtA: RenderTarget;
  readonly rtB: RenderTarget;
  baked = false;
  bakeMs = 0;
  private disposed = false;
  private pending: Promise<void> | null = null;

  constructor(
    groups: readonly ImpostorGroup[],
    readonly bakeMaterials: { albedo: Material; normal: Material },
  ) {
    let count = 0;
    if (!groups.length) throw new Error('Impostor atlas requires groups');
    this.groups = groups.map((g) => {
      if (
        !g.variants.length ||
        !Number.isFinite(g.radius) ||
        g.radius <= 0 ||
        !g.center.toArray().every(Number.isFinite) ||
        ![g.rh, g.hv].every((x) => Number.isFinite(x) && x > 0)
      )
        throw new Error('Invalid impostor group');
      const indexed = { ...g, center: g.center.clone(), variants: [...g.variants], variantBase: count };
      count += g.variants.length;
      return indexed;
    });
    this.variantCount = count;
    this.width = count * this.height;
    const make = (name: string) => {
      const target = new RenderTarget(this.width, this.height, {
        type: UnsignedByteType,
        minFilter: LinearMipmapLinearFilter,
        magFilter: LinearFilter,
        generateMipmaps: true,
      });
      target.texture.name = name;
      target.texture.colorSpace = NoColorSpace;
      target.depthTexture = new DepthTexture(this.width, this.height, FloatType);
      target.depthTexture.format = DepthFormat;
      return target;
    };
    this.rtA = make('tidewater-impostor-albedo');
    this.rtB = make('tidewater-impostor-normal');
  }

  bake(renderer: WebGPURenderer): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('Impostor atlas is disposed'));
    if (this.baked) return Promise.resolve();
    if (this.pending) return this.pending;
    this.pending = this.render(renderer).finally(() => {
      this.pending = null;
      if (this.disposed) this.releaseTargets();
    });
    return this.pending;
  }

  private async render(renderer: WebGPURenderer): Promise<void> {
    const started = performance.now(),
      previousTarget = renderer.getRenderTarget();
    const previousMrt = renderer.getMRT();
    const previousColor = renderer.getClearColor(new Color()),
      previousAlpha = renderer.getClearAlpha();
    const previousAutoClear = renderer.autoClear;
    try {
      await renderer.init();
      if (this.disposed) throw new Error('Impostor atlas disposed during bake');
      const maxSize = (
        renderer.backend as unknown as {
          device?: { limits: { maxTextureDimension2D: number } };
        }
      ).device?.limits.maxTextureDimension2D;
      if (maxSize !== undefined && this.width > maxSize)
        throw new Error('Impostor atlas exceeds texture size limit');
      renderer.setMRT(null);
      renderer.autoClear = false;
      renderer.setClearColor(0, 0);
      for (const [target, material] of [
        [this.rtA, this.bakeMaterials.albedo],
        [this.rtB, this.bakeMaterials.normal],
      ] as const) {
        renderer.setRenderTarget(target);
        renderer.clear(true, true, false);
        for (const group of this.groups) {
          if (this.disposed) throw new Error('Impostor atlas disposed during bake');
          const R = group.radius,
            camera = new OrthographicCamera(
              0,
              this.variantCount * IMPOSTOR_FRAMES * 2 * R,
              IMPOSTOR_FRAMES * 2 * R,
              0,
              0.1,
              6 * R + 10,
            );
          camera.position.set(0, 0, 3 * R + 2);
          camera.lookAt(0, 0, -1);
          camera.updateMatrixWorld();
          const scene = new Scene(),
            meshes: InstancedMesh[] = [];
          try {
            group.variants.forEach((geometry, variant) => {
              const matrices = impostorFrameMatrices(group, variant);
              const mesh = new InstancedMesh(geometry, material, matrices.length);
              matrices.forEach((matrix, k) => mesh.setMatrixAt(k, matrix));
              mesh.instanceMatrix.needsUpdate = true;
              mesh.frustumCulled = false;
              scene.add(mesh);
              meshes.push(mesh);
            });
            renderer.clear(false, true, false);
            await renderer.renderAsync(scene, camera);
          } finally {
            for (const mesh of meshes) mesh.dispose();
          }
        }
      }
      if (this.disposed) throw new Error('Impostor atlas disposed during bake');
      this.baked = true;
      this.bakeMs = performance.now() - started;
    } finally {
      renderer.setRenderTarget(previousTarget);
      renderer.setClearColor(previousColor, previousAlpha);
      renderer.setMRT(previousMrt);
      renderer.autoClear = previousAutoClear;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (!this.pending) this.releaseTargets();
  }
  private releaseTargets(): void {
    this.rtA.dispose();
    this.rtB.dispose();
  }
}
