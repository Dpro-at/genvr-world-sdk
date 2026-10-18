import { AmbientLight, Box3, DirectionalLight, PerspectiveCamera, Scene, Vector3, WebGLRenderer, type Mesh, type Texture } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
let renderer: WebGLRenderer | undefined;
/** A static portrait rendered from the user's own embedded model, without a remote request. */
export async function userAvatarThumbnail(data: ArrayBuffer): Promise<string> {
  renderer ??= new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(160, 200); renderer.setPixelRatio(1); renderer.setClearColor(0, 0);
  const gltf = await new GLTFLoader().parseAsync(data, '');
  try {
    const scene = new Scene(); scene.add(gltf.scene, new AmbientLight(0xffffff, 2));
    const light = new DirectionalLight(0xffffff, 3); light.position.set(3, 5, 5); scene.add(light);
    gltf.scene.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(gltf.scene), center = bounds.getCenter(new Vector3()), size = bounds.getSize(new Vector3());
    const distance = Math.max(size.y, size.x / .8) * 1.65;
    if (!Number.isFinite(distance) || distance <= 0) throw new Error('Invalid portrait bounds.');
    const camera = new PerspectiveCamera(35, .8, distance / 100, distance * 10);
    camera.position.copy(center).add(new Vector3(distance * .15, size.y * .04, distance)); camera.lookAt(center);
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL('image/webp', .8);
  } finally {
    gltf.scene.traverse(node => { const mesh = node as Mesh; mesh.geometry?.dispose(); for (const material of Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []) { for (const value of Object.values(material)) if ((value as Texture | null)?.isTexture) (value as Texture).dispose(); material.dispose(); } });
    renderer.renderLists.dispose();
  }
}
