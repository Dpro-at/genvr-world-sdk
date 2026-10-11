import { getCoreItem, getRoadType } from '@genvr/core-library';
import { roadCenterline, type RoadSample } from '@genvr/world';
import {
  Box3,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  RenderTarget,
  Scene,
  Sphere,
  Vector3,
  type Object3D,
  type WebGPURenderer,
} from 'three/webgpu';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import type { ItemPackages } from './item-packages.js';
import type { ItemsView } from './items.js';
import { buildRoad, type RoadMaterials } from './road-view.js';

/** What one picture shows: the objects, the camera's height angle, and what to frame. */
interface Picture {
  objects: Object3D[];
  elevation: number;
  focus?: Object3D;
}

/** Preview images are square; 192 px rows are 768 bytes, already aligned for GPU readback. */
const SIZE = 192;

/**
 * Renders small 3D pictures of library entries (items, road types) with the real engine, for
 * the side-panel catalogs. Results are cached; renders run one at a time. Creator items are drawn
 * from their glTF package with its own materials, once it has loaded (P1-08).
 */
export class PreviewRenderer {
  readonly #cache = new Map<string, Promise<string>>();
  #queue: Promise<unknown> = Promise.resolve();
  readonly #target = new RenderTarget(SIZE, SIZE);
  readonly #scene = new Scene();
  readonly #camera = new PerspectiveCamera(30, 1, 0.1, 200);

  constructor(
    private readonly renderer: WebGPURenderer,
    private readonly items: ItemsView,
    private readonly roadMaterials: RoadMaterials,
    private readonly packages?: ItemPackages,
  ) {
    this.#scene.add(new HemisphereLight(0xffffff, 0x8a9a7a, 1.4));
    const sun = new DirectionalLight(0xffffff, 2.2);
    sun.position.set(5, 10, 7);
    this.#scene.add(sun);
  }

  /** Data URL of a picture of a library item. */
  item(itemId: string): Promise<string> {
    return this.#cached(`item:${itemId}`, async () => {
      if (!getCoreItem(itemId) && this.packages) {
        const loaded = await this.packages.whenSettled(itemId);
        if (!loaded) throw new Error(`No package for ${itemId}`);
        // A copy of the glTF scene at rest; it shares the package's geometry and materials.
        const root = cloneSkinned(loaded.scene);
        root.rotation.y = -Math.PI / 6;
        root.userData.shared = true;
        return { objects: [root], elevation: 0.45 };
      }
      const mesh = this.items.previewMesh(itemId, this.items.material);
      mesh.rotation.y = -Math.PI / 6;
      return { objects: [mesh], elevation: 0.45 };
    });
  }

  /** Data URL of a picture of a short curved piece of a road type. */
  selection(root: Object3D): Promise<string> {
    const run = this.#queue.then(async () => {
      const target = new RenderTarget(512, 512);
      try {
        return await this.#render({ objects: [root], elevation: 0.45 }, target, 512);
      } finally {
        target.dispose();
      }
    });
    this.#queue = run.catch(() => undefined);
    return run;
  }

  road(typeId: string): Promise<string> {
    return this.#cached(`road:${typeId}`, () => {
      const type = getRoadType(typeId);
      const line = roadCenterline([
        [-9, 3],
        [0, -2],
        [9, 3],
      ]);
      let distance = 0;
      const samples: RoadSample[] = line.map(([x, z], i) => {
        if (i > 0) distance += Math.hypot(x - line[i - 1]![0], z - line[i - 1]![1]);
        return { x, z, distance, height: 0, bridge: false, overWater: false };
      });
      const built = buildRoad(
        { id: 'preview', width: type.width, materialId: type.id },
        samples,
        () => 0,
        this.roadMaterials,
      );
      const ground = new Mesh(new PlaneGeometry(22, 14), new MeshStandardMaterial({ color: 0x5cc26a }));
      ground.rotation.x = -Math.PI / 2;
      ground.position.z = 1;
      ground.userData.ownMaterial = true;
      return { objects: [ground, ...built.meshes], elevation: 0.9, focus: built.meshes[0]! };
    });
  }

  #cached(key: string, build: () => Picture | Promise<Picture>) {
    let result = this.#cache.get(key);
    if (!result) {
      const run = this.#queue.then(async () => this.#render(await build()));
      this.#queue = run.catch(() => undefined);
      result = run;
      this.#cache.set(key, result);
    }
    return result;
  }

  async #render({ objects, elevation, focus }: Picture, target = this.#target, size = SIZE) {
    for (const object of objects) this.#scene.add(object);
    try {
      // Frame the subject: look at its bounding sphere from the front, slightly from above.
      const sphere = new Box3().setFromObject(focus ?? objects[0]!).getBoundingSphere(new Sphere());
      const distance = (sphere.radius / Math.sin((this.#camera.fov * Math.PI) / 360)) * 0.85;
      this.#camera.position
        .copy(sphere.center)
        .add(new Vector3(0, Math.sin(elevation), Math.cos(elevation)).multiplyScalar(distance));
      this.#camera.lookAt(sphere.center);

      const renderer = this.renderer;
      const previousTarget = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(this.#scene, this.#camera);
      renderer.setRenderTarget(previousTarget);
      renderer.setClearColor(0x000000, 1);
      const pixels = (await renderer.readRenderTargetPixelsAsync(target, 0, 0, size, size)) as Uint8Array;
      return pixelsToDataUrl(
        pixels,
        size,
        (renderer.backend as { isWebGLBackend?: boolean }).isWebGLBackend === true,
      );
    } finally {
      for (const object of objects) {
        this.#scene.remove(object);
        if (!(object instanceof Mesh) || object.userData.shared) continue;
        object.geometry.dispose();
        if (object.userData.ownMaterial) (object.material as MeshStandardMaterial).dispose();
      }
    }
  }

  dispose(): void {
    this.#target.dispose();
  }
}

/** RGBA pixels (linear) of a square picture to a PNG data URL; WebGL rows come bottom-up. */
export function pixelsToDataUrl(pixels: Uint8Array, size: number, bottomUp: boolean): string {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d')!;
  const image = context.createImageData(size, size);
  // The render target holds linear colors; encode to sRGB for the image.
  const encode = new Uint8Array(256);
  for (let v = 0; v < 256; v += 1) {
    const c = v / 255;
    encode[v] = Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055));
  }
  for (let y = 0; y < size; y += 1) {
    const source = bottomUp ? size - 1 - y : y;
    for (let x = 0; x < size * 4; x += 4) {
      const from = source * size * 4 + x;
      const to = y * size * 4 + x;
      image.data[to] = encode[pixels[from]!]!;
      image.data[to + 1] = encode[pixels[from + 1]!]!;
      image.data[to + 2] = encode[pixels[from + 2]!]!;
      image.data[to + 3] = pixels[from + 3]!;
    }
  }
  context.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}
