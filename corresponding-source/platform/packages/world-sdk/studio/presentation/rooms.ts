import { Group, Mesh, PointLight, MeshStandardMaterial, BoxGeometry, PlaneGeometry, CylinderGeometry, ConeGeometry, SphereGeometry, type BufferGeometry } from 'three/webgpu';
import descriptors from './rooms.json';
type Node = { type: string; props: Record<string, unknown>; children: Node[] };
/** The original room geometry, rebuilt with the SDK renderer. No external avatar services. */
export function createLiveRoom(id: string): Group {
  const root = new Group();
  const build = (node: Node, parent: Group | Mesh) => {
    const p = node.props;
    if (node.type.endsWith('Geometry')) {
      const args = (p.args ?? []) as [number, number, number, number, number];
      const constructors: Record<string, new (...args: [number, number, number, number, number]) => BufferGeometry> = { boxGeometry: BoxGeometry, planeGeometry: PlaneGeometry, cylinderGeometry: CylinderGeometry, coneGeometry: class extends ConeGeometry { constructor(a:number,b:number,c:number,d:number){super(a,b,c,d);} }, sphereGeometry: SphereGeometry };
      if (parent instanceof Mesh && constructors[node.type]) parent.geometry = new constructors[node.type]!(...args);
      return;
    }
    if (node.type === 'meshStandardMaterial') { if (parent instanceof Mesh) parent.material = new MeshStandardMaterial(p); return; }
    const object = node.type === 'mesh' ? new Mesh() : node.type === 'pointLight' ? new PointLight(p.color as string, p.intensity as number, p.distance as number, p.decay as number) : new Group();
    if (Array.isArray(p.position)) object.position.fromArray(p.position as number[]);
    if (Array.isArray(p.rotation)) object.rotation.set(...p.rotation as [number, number, number]);
    object.castShadow = Boolean(p.castShadow); object.receiveShadow = Boolean(p.receiveShadow);
    parent.add(object);
    for (const child of node.children) build(child, object as Group | Mesh);
  };
  const descriptor = (descriptors as Record<string, unknown>)[id];
  if (descriptor) build(descriptor as Node, root);
  return root;
}
export function disposeLiveRoom(root: Group) {
  root.traverse(object => { if (object instanceof Mesh) { object.geometry.dispose(); for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose(); } });
}
