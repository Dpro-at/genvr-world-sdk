import { AVATAR_BODIES, CORE_BLOCKS, CORE_SURFACES, CORE_WEARABLES, ROAD_TYPES } from '@genvr/core-library';
import { roadCenterline } from '@genvr/world';
import {
  AnimationMixer,
  Box3,
  BoxGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  NearestFilter,
  PerspectiveCamera,
  RenderTarget,
  Scene,
  Sphere,
  SRGBColorSpace,
  Vector3,
  WebGPURenderer,
  type Object3D,
} from 'three/webgpu';
import { createGenvrAvatar, DEFAULT_LOOK, preloadAvatarLook } from './avatar.js';
import { pixelsToDataUrl } from './previews.js';
import { buildRoad, RoadMaterials } from './road-view.js';
import { buildWallMeshes, createStructureMaterials } from './structures.js';

/** Visual resources that need a real engine picture instead of a nonvisual type icon. */
export const CATALOG_PICTURE_IDS = [
  ...AVATAR_BODIES.map((b) => b.manifest.id),
  ...CORE_WEARABLES.map((w) => w.manifest.id),
  ...CORE_BLOCKS.map((b) => b.manifest.id),
  ...CORE_SURFACES.map((s) => s.manifest.id),
  ...ROAD_TYPES.map((r) => r.manifest.id),
  'genvr.core.wall.basic',
  'genvr.core.opening.door',
  'genvr.core.opening.window',
];

async function subject(id: string): Promise<{ object: Object3D; dispose: () => void }> {
  const body = AVATAR_BODIES.find((b) => b.manifest.id === id);
  const wearable = CORE_WEARABLES.find((w) => w.manifest.id === id);
  if (body || wearable) {
    const look = { ...DEFAULT_LOOK, body: body?.id ?? ('classic' as const), wear: wearable ? [id] : [] };
    await preloadAvatarLook(look);
    const avatar = createGenvrAvatar(look);
    const idle = avatar.clips.find((c) => c.name === 'Idle');
    if (idle) {
      const mixer = new AnimationMixer(avatar.root);
      mixer.clipAction(idle).play();
      mixer.update(0.1);
    }
    if (wearable?.slot === 'back') avatar.root.rotation.y = Math.PI;
    avatar.root.updateMatrixWorld(true);
    return { object: avatar.root, dispose: () => avatar.dispose() };
  }
  const group = new Group();
  const owned: Array<{ dispose(): void }> = [];
  const block = CORE_BLOCKS.find((b) => b.manifest.id === id);
  const surface = CORE_SURFACES.find((s) => s.manifest.id === id);
  const road = ROAD_TYPES.find((r) => r.manifest.id === id);
  try {
    if (block) {
      const face = (pixels: readonly number[]) => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 16;
        const ctx = canvas.getContext('2d')!;
        pixels.forEach((c, i) => {
          ctx.fillStyle = `#${c.toString(16).padStart(6, '0')}`;
          ctx.fillRect(i % 16, Math.floor(i / 16), 1, 1);
        });
        const map = new CanvasTexture(canvas);
        map.colorSpace = SRGBColorSpace;
        map.magFilter = map.minFilter = NearestFilter;
        const mat = new MeshStandardMaterial({
          map,
          roughness: 0.85,
          opacity: block.look.opacity,
          transparent: block.look.opacity < 1,
        });
        owned.push(map, mat);
        return mat;
      };
      const side = face(block.look.side),
        top = face(block.look.top),
        bottom = face(block.look.bottom);
      const geometry = new BoxGeometry(1, 1, 1);
      owned.push(geometry);
      group.add(new Mesh(geometry, [side, side, top, bottom, side, side]));
    } else if (surface) {
      const { roughness, metalness, opacity, glow } = surface.look;
      const mat = new MeshStandardMaterial({
        color: 0x999999,
        roughness,
        metalness,
        opacity,
        transparent: opacity < 1,
        emissive: new Color(glow > 0 ? 0x999999 : 0),
        emissiveIntensity: glow,
      });
      const geometry = new BoxGeometry(1, 1, 1);
      owned.push(geometry, mat);
      group.add(new Mesh(geometry, mat));
    } else if (road) {
      const materials = new RoadMaterials();
      owned.push(materials);
      const line = roadCenterline([
        [-9, 3],
        [0, -2],
        [9, 3],
      ]);
      let distance = 0;
      const samples = line.map(([x, z], i) => {
        if (i) distance += Math.hypot(x - line[i - 1]![0], z - line[i - 1]![1]);
        return { x, z, distance, height: 0, bridge: false, overWater: false };
      });
      const built = buildRoad(
        { id: 'preview', width: road.width, materialId: road.id },
        samples,
        () => 0,
        materials,
      );
      built.meshes.forEach((m) => {
        group.add(m);
        owned.push(m.geometry);
      });
      // Photo road textures arrive asynchronously; wait for their actual image before rendering.
      const maps = built.meshes
        .flatMap((m) => (Array.isArray(m.material) ? m.material : [m.material]))
        .flatMap((m) => (m instanceof MeshStandardMaterial && m.map ? [m.map] : []));
      await Promise.all(
        maps.map((m) =>
          m.image instanceof HTMLImageElement && !m.image.complete ? m.image.decode() : Promise.resolve(),
        ),
      );
    } else if (id === 'genvr.core.wall.basic' || id.startsWith('genvr.core.opening.')) {
      const kind = id.endsWith('.door') ? 'door' : 'window';
      const materials = createStructureMaterials();
      owned.push(materials.wall, materials.floor);
      const built = buildWallMeshes(
        {
          id: 'preview',
          points: [
            [-2, 0],
            [2, 0],
          ],
          height: 3,
          closed: false,
          openings:
            id === 'genvr.core.wall.basic'
              ? []
              : [
                  {
                    id: 'opening',
                    kind,
                    segment: 0,
                    offset: 2,
                    width: 1.3,
                    height: kind === 'door' ? 2.2 : 1.3,
                    bottom: kind === 'door' ? 0 : 1,
                  },
                ],
        },
        () => 0,
        materials,
      );
      built.meshes.forEach((m) => {
        group.add(m);
        owned.push(m.geometry);
      });
      for (const mat of [materials.wall, materials.floor])
        if (mat instanceof MeshStandardMaterial && mat.map) owned.push(mat.map);
    } else {
      throw new Error(`No visual catalog resource ${id}`);
    }
    return { object: group, dispose: () => owned.forEach((x) => x.dispose()) };
  } catch (error) {
    owned.forEach((resource) => resource.dispose());
    throw error;
  }
}

/** Offline thumbnail page uses one renderer serially; Marketplace serves only the saved images. */
export async function renderCatalogPictures(
  onPicture: (id: string, url: string) => void,
  ids: readonly string[] = CATALOG_PICTURE_IDS,
): Promise<void> {
  const renderer = new WebGPURenderer({ antialias: true });
  try {
    await renderer.init();
  } catch (error) {
    renderer.dispose();
    throw error;
  }
  const size = 384,
    target = new RenderTarget(size, size, { samples: 4 });
  const scene = new Scene();
  scene.add(new HemisphereLight(0xffffff, 0x8a9a7a, 1.4));
  const sun = new DirectionalLight(0xffffff, 2.2);
  sun.position.set(5, 10, 7);
  scene.add(sun);
  const camera = new PerspectiveCamera(30, 1, 0.01, 1000);
  try {
    for (const id of ids) {
      if (!CATALOG_PICTURE_IDS.includes(id)) throw new Error(`Unknown catalog picture id ${id}`);
      const made = await subject(id);
      scene.add(made.object);
      try {
        made.object.updateMatrixWorld(true);
        const sphere = new Box3().setFromObject(made.object).getBoundingSphere(new Sphere());
        if (!Number.isFinite(sphere.radius) || sphere.radius <= 0) throw new Error(`Empty resource ${id}`);
        const distance = (sphere.radius / Math.sin((camera.fov * Math.PI) / 360)) * 1.12;
        const elevation = id.includes('.road.') ? 0.9 : 0.3;
        camera.position
          .copy(sphere.center)
          .addScaledVector(new Vector3(0.45, Math.sin(elevation), Math.cos(elevation)).normalize(), distance);
        camera.lookAt(sphere.center);
        renderer.setRenderTarget(target);
        renderer.setClearColor(0xe8e8e4, 1);
        renderer.clear();
        renderer.render(scene, camera);
        const pixels = (await renderer.readRenderTargetPixelsAsync(target, 0, 0, size, size)) as Uint8Array;
        onPicture(
          id,
          pixelsToDataUrl(
            pixels,
            size,
            (renderer.backend as { isWebGLBackend?: boolean }).isWebGLBackend === true,
          ),
        );
      } finally {
        scene.remove(made.object);
        made.dispose();
      }
    }
  } finally {
    renderer.setRenderTarget(null);
    target.dispose();
    renderer.dispose();
  }
}
