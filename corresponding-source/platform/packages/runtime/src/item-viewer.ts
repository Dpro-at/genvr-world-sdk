import {
  AnimationMixer,
  Box3,
  Box3Helper,
  CircleGeometry,
  Clock,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  SkeletonHelper,
  ShadowMaterial,
  Sphere,
  Vector3,
  WebGPURenderer,
  type Material,
  type Object3D,
} from 'three/webgpu';
import { getCoreItem } from '@genvr/core-library';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ItemPackages, type PackageFetcher } from './item-packages.js';
import { itemGeometry, resolveItem } from './items.js';
import { FACE_DIRECTIONS, ViewCube, type ViewFace } from './view-cube.js';

export interface ItemViewerOptions {
  container: HTMLElement;
  itemId: string;
  /** Loads packages of items that are not in the Core Library (P2-16). */
  fetchPackage?: PackageFetcher;
  dracoPath?: string;
  /** Background behind the item: a number or any CSS color (e.g. the page's paper color). */
  background?: number | string;
  /** The view cube in the corner (default true; small previews leave it out). */
  viewCube?: boolean;
}

/** What a reviewer wants to know about a model (counted from what is drawn). */
export interface ItemFacts {
  triangles: number;
  vertices: number;
  meshes: number;
  materials: number;
  /** Skeleton bones (0 for models without a rig). */
  bones: number;
  /** Width, height, depth in meters. */
  size: [number, number, number];
}

export interface ItemViewer {
  /** The item's name, or null when there is no model to show. */
  readonly name: string | null;
  /** Sound name to link, from the package manifest. */
  readonly sounds: Record<string, string>;
  /** Names of the model's animations; the first plays in a loop. */
  readonly animations: string[];
  readonly backend: 'WebGPU' | 'WebGL';
  /** Model facts (null when there is no model). */
  readonly facts: ItemFacts | null;
  /** Shows the triangles of the model as lines. */
  setWireframe(on: boolean): void;
  /** Shows the skeleton's bones (models with a rig). */
  setBones(on: boolean): void;
  /** Shows the box the model fits in (its size in meters). */
  setSizeBox(on: boolean): void;
  /** Turns the camera to look from one side (the view cube does this too). */
  lookFrom(face: ViewFace): void;
  /** Plays an animation of the model by name (loops). */
  playAnimation(name: string): void;
  /** Called each time the playing animation starts again (e.g. to sound every bounce). */
  onAnimationLoop(listener: () => void): () => void;
  /** Puts the camera back to the first view. */
  resetView(): void;
  dispose(): void;
}

/**
 * An interactive 3D view of one item (reviewers' preview): drag to turn, scroll or pinch to
 * zoom, right-drag to pan. Core items use the same geometry as in worlds; packages show their
 * glTF scene with its materials, and the first animation loops.
 */
export async function createItemViewer({
  container,
  itemId,
  fetchPackage,
  dracoPath,
  background = 0xe8e8e4,
  viewCube: showCube = true,
}: ItemViewerOptions): Promise<ItemViewer> {
  // The renderer first: KTX2 textures need to know which compressed formats the GPU takes.
  const renderer = new WebGPURenderer({ antialias: true });
  await renderer.init();
  const packages = fetchPackage
    ? new ItemPackages(fetchPackage, { ...(dracoPath ? { dracoPath } : {}), ktx2: { renderer } })
    : undefined;
  const loaded = packages ? await packages.whenSettled(itemId) : null;
  const model = resolveItem(itemId, packages);
  const missing = !loaded && !getCoreItem(itemId);

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  const backdrop = new Color(background);
  renderer.setClearColor(backdrop, 1);
  renderer.shadowMap.enabled = true;
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.touchAction = 'none';
  container.appendChild(renderer.domElement);

  const scene = new Scene();
  scene.add(new HemisphereLight(0xffffff, 0x8a9a7a, 1.4));
  const sun = new DirectionalLight(0xffffff, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);

  let object: Object3D;
  let ownedMaterial: MeshStandardMaterial | null = null;
  if (loaded) {
    object = loaded.scene;
  } else if (missing) {
    // Nothing to draw: no placeholder box (the page says there is no model).
    object = new Group();
  } else {
    ownedMaterial = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8 });
    object = new Mesh(itemGeometry(model.parts), ownedMaterial);
  }
  object.traverse((child) => {
    child.castShadow = true;
    child.receiveShadow = true;
  });
  scene.add(object);

  const box = new Box3().setFromObject(object);
  if (box.isEmpty()) box.set(new Vector3(-0.5, 0, -0.5), new Vector3(0.5, 1, 0.5));
  const sphere = box.getBoundingSphere(new Sphere());
  const radius = Math.max(sphere.radius, 0.1);

  // Model facts and inspection helpers (owner note, docs/reference/genvr/05).
  const materials = new Set<Material>();
  let triangles = 0;
  let vertices = 0;
  let meshes = 0;
  let bones = 0;
  object.traverse((child) => {
    if ((child as { isBone?: boolean }).isBone) bones += 1;
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    meshes += 1;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
      materials.add(material);
    const position = mesh.geometry.getAttribute('position');
    vertices += position?.count ?? 0;
    triangles += (mesh.geometry.index?.count ?? position?.count ?? 0) / 3;
  });
  const dimensions = box.getSize(new Vector3());
  const round = (value: number) => Math.round(value * 100) / 100;
  const facts: ItemFacts | null = missing
    ? null
    : {
        triangles,
        vertices,
        meshes,
        materials: materials.size,
        bones,
        size: [round(dimensions.x), round(dimensions.y), round(dimensions.z)],
      };
  const skeleton = bones > 0 ? new SkeletonHelper(object) : null;
  if (skeleton) {
    skeleton.visible = false;
    scene.add(skeleton);
  }
  const sizeBox = new Box3Helper(box.clone(), 0x7a7a80);
  sizeBox.visible = false;
  scene.add(sizeBox);
  // Only the item's shadow on an invisible floor, so it does not float.
  const floor = new Mesh(new CircleGeometry(radius * 6, 48), new ShadowMaterial({ opacity: 0.25 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = box.min.y - 0.001;
  floor.receiveShadow = true;
  scene.add(floor);
  sun.position.set(radius * 3, radius * 6, radius * 4).add(sphere.center);
  sun.target.position.copy(sphere.center);
  scene.add(sun.target);
  Object.assign(sun.shadow.camera, {
    left: -radius * 3,
    right: radius * 3,
    top: radius * 3,
    bottom: -radius * 3,
  });
  sun.shadow.camera.far = radius * 20;
  sun.shadow.camera.updateProjectionMatrix();

  const camera = new PerspectiveCamera(
    35,
    container.clientWidth / Math.max(1, container.clientHeight),
    0.01,
    1000,
  );
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = radius * 0.6;
  controls.maxDistance = radius * 12;
  const resetView = () => {
    // Room around the item for animations that move it (a bounce, a swing).
    const distance = (radius / Math.sin((camera.fov * Math.PI) / 360)) * 1.8;
    const direction = new Vector3(Math.sin(Math.PI / 5), 0.45, Math.cos(Math.PI / 5)).normalize();
    camera.position.copy(sphere.center).addScaledVector(direction, distance);
    controls.target.copy(sphere.center);
    controls.update();
  };
  resetView();
  const lookFrom = (face: ViewFace) => {
    const [x, y, z] = FACE_DIRECTIONS[face];
    const distance = camera.position.distanceTo(controls.target);
    // Straight up or down needs a hair of tilt, or the camera cannot tell which way is forward.
    const direction = new Vector3(x, y, z + (y !== 0 ? 0.001 : 0)).normalize();
    camera.position.copy(controls.target).addScaledVector(direction, distance);
    controls.update();
  };
  const viewCube =
    missing || !showCube ? null : new ViewCube(container, lookFrom, { corner: 'top-right', size: 56 });

  const clips = loaded?.animations ?? [];
  const mixer = clips.length > 0 ? new AnimationMixer(object) : null;
  const playAnimation = (name: string) => {
    const clip = clips.find((entry) => entry.name === name);
    if (!mixer || !clip) return;
    mixer.stopAllAction();
    mixer.clipAction(clip).play();
  };
  const idle = clips.find((clip) => clip.name === 'idle') ?? clips[0];
  if (idle) playAnimation(idle.name);

  const clock = new Clock();
  renderer.setAnimationLoop(() => {
    mixer?.update(clock.getDelta());
    controls.update();
    viewCube?.update(camera);
    renderer.render(scene, camera);
  });
  const resize = new ResizeObserver(() => {
    camera.aspect = container.clientWidth / Math.max(1, container.clientHeight);
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });
  resize.observe(container);

  return {
    name: missing ? null : model.name,
    sounds: loaded?.sounds ?? {},
    animations: clips.map((clip) => clip.name),
    backend: (renderer.backend as { isWebGLBackend?: boolean }).isWebGLBackend ? 'WebGL' : 'WebGPU',
    playAnimation,
    onAnimationLoop(listener) {
      if (!mixer) return () => {};
      mixer.addEventListener('loop', listener);
      return () => mixer.removeEventListener('loop', listener);
    },
    resetView,
    facts,
    setWireframe(on) {
      for (const material of materials) (material as Material & { wireframe?: boolean }).wireframe = on;
    },
    setBones(on) {
      if (skeleton) skeleton.visible = on;
    },
    setSizeBox(on) {
      sizeBox.visible = on;
    },
    lookFrom,
    dispose() {
      viewCube?.dispose();
      skeleton?.dispose();
      sizeBox.dispose();
      renderer.setAnimationLoop(null);
      resize.disconnect();
      controls.dispose();
      mixer?.stopAllAction();
      floor.geometry.dispose();
      (floor.material as ShadowMaterial).dispose();
      if (ownedMaterial) {
        (object as Mesh).geometry.dispose();
        ownedMaterial.dispose();
      }
      packages?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
