import {
  Box3,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  RenderTarget,
  Scene,
  Sphere,
  Vector3,
  WebGPURenderer,
  type BufferGeometry,
  type Object3D,
} from 'three/webgpu';
import { ItemPackages, type PackageFetcher } from './item-packages.js';
import { itemGeometry, resolveItem } from './items.js';
import { pixelsToDataUrl } from './previews.js';

/** The six pictures of item analysis (P4-06, docs/ITEM-ANALYSIS.md). */
export const ITEM_VIEWS = ['front', 'back', 'left', 'right', 'top', 'three-quarter'] as const;
export type ItemView = (typeof ITEM_VIEWS)[number];

/** Camera direction per view: turn around the item (radians from the front) and height angle. */
const ANGLES: Record<ItemView, { yaw: number; elevation: number }> = {
  front: { yaw: 0, elevation: 0.12 },
  back: { yaw: Math.PI, elevation: 0.12 },
  left: { yaw: -Math.PI / 2, elevation: 0.12 },
  right: { yaw: Math.PI / 2, elevation: 0.12 },
  top: { yaw: 0, elevation: 1.45 },
  'three-quarter': { yaw: Math.PI / 5, elevation: 0.45 },
};

export interface ItemPictures {
  /** PNG data URLs, one per view. */
  views: Record<ItemView, string>;
  stats: {
    triangles: number;
    /** Width, height, depth in meters. */
    size: [number, number, number];
    parts: number;
    /** What drew the pictures (headless browsers often fall back to WebGL). */
    backend: 'WebGPU' | 'WebGL';
  };
}

/**
 * Draws a library item from six angles with the real engine (same geometry and material as in
 * worlds), on a neutral background with a fixed camera, so reviewers and the vision model
 * compare like with like. Runs without a world; used by the render page the worker opens.
 * Items that are not in the Core Library are drawn from their glTF package (P2-16), at rest.
 */
export async function renderItemPictures(
  itemId: string,
  {
    size = 512,
    background = 0xe8e8e4,
    fetchPackage,
  }: { size?: number; background?: number; fetchPackage?: PackageFetcher } = {},
): Promise<ItemPictures> {
  // The renderer first: KTX2 textures need to know which compressed formats the GPU takes.
  const renderer = new WebGPURenderer({ antialias: true });
  await renderer.init();
  const packages = fetchPackage ? new ItemPackages(fetchPackage, { ktx2: { renderer } }) : undefined;
  const loaded = packages ? await packages.whenSettled(itemId) : null;
  const model = resolveItem(itemId, packages);
  const target = new RenderTarget(size, size, { samples: 4 });
  const scene = new Scene();
  scene.add(new HemisphereLight(0xffffff, 0x8a9a7a, 1.4));
  const sun = new DirectionalLight(0xffffff, 2.2);
  sun.position.set(5, 10, 7);
  scene.add(sun);
  const material = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8 });
  // Core items: their parts as in worlds; packages: the glTF scene with its own materials.
  const geometry: BufferGeometry | null = loaded ? null : itemGeometry(model.parts);
  const mesh: Object3D = loaded ? loaded.scene : new Mesh(geometry!, material);
  scene.add(mesh);
  try {
    const box = new Box3().setFromObject(mesh);
    const sphere = box.getBoundingSphere(new Sphere());
    const camera = new PerspectiveCamera(30, 1, 0.05, 500);
    // The whole item fits from every side.
    const distance = (sphere.radius / Math.sin((camera.fov * Math.PI) / 360)) * 1.05;
    const bottomUp = (renderer.backend as { isWebGLBackend?: boolean }).isWebGLBackend === true;
    const views = {} as Record<ItemView, string>;
    for (const view of ITEM_VIEWS) {
      const { yaw, elevation } = ANGLES[view];
      camera.position
        .copy(sphere.center)
        .add(
          new Vector3(
            Math.sin(yaw) * Math.cos(elevation),
            Math.sin(elevation),
            Math.cos(yaw) * Math.cos(elevation),
          ).multiplyScalar(distance),
        );
      camera.lookAt(sphere.center);
      renderer.setRenderTarget(target);
      renderer.setClearColor(background, 1);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      const pixels = (await renderer.readRenderTargetPixelsAsync(target, 0, 0, size, size)) as Uint8Array;
      views[view] = pixelsToDataUrl(pixels, size, bottomUp);
    }
    const dimensions = box.getSize(new Vector3());
    const round = (value: number) => Math.round(value * 100) / 100;
    return {
      views,
      stats: {
        triangles: (loaded ? loaded.meshes.map((part) => part.geometry) : [geometry!]).reduce(
          (sum, part) => sum + (part.index ? part.index.count : part.getAttribute('position').count) / 3,
          0,
        ),
        size: [round(dimensions.x), round(dimensions.y), round(dimensions.z)],
        parts: loaded ? loaded.meshes.length : model.parts.length,
        backend: bottomUp ? 'WebGL' : 'WebGPU',
      },
    };
  } finally {
    geometry?.dispose();
    material.dispose();
    packages?.dispose();
    target.dispose();
    renderer.dispose();
  }
}
