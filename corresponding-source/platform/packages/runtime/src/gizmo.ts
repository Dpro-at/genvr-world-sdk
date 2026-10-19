import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Plane,
  TorusGeometry,
  Vector3,
  type Object3D,
  type Ray,
} from 'three/webgpu';

export type GizmoHandle = 'x' | 'y' | 'z' | 'turn' | 'size';
/** Which handles show (ITEMS-I2, the parts way): all of them, or only move arrows, the size corner or the turn ring. */
export type GizmoMode = 'all' | 'move' | 'size' | 'turn';

/** Handle colors: the usual axis colors, a little softer; always drawn on top. */
const COLORS: Record<GizmoHandle, number> = {
  x: 0xe0605a,
  y: 0x5fb85f,
  z: 0x5a88e0,
  turn: 0xe6c24a,
  size: 0xf2f2f2,
};

/**
 * Drag handles for the selected item (task P3-24): arrows move it along X, Z, or up and down,
 * the ring turns it, the corner cube makes it bigger or smaller. The gizmo only shows and measures; ItemTools turns drags into commands.
 */
export class TransformGizmo {
  readonly group = new Group();
  readonly #handles = new Map<GizmoHandle, Object3D>();
  #size = 1;
  #mode: GizmoMode = 'all';
  #resize = true;

  constructor() {
    this.group.name = 'gizmo';
    this.group.visible = false;
    this.group.renderOrder = 1000;
    const material = (handle: GizmoHandle) =>
      new MeshBasicMaterial({ color: COLORS[handle], depthTest: false, transparent: true, opacity: 0.95 });
    const arrow = (handle: 'x' | 'y' | 'z') => {
      const arm = new Group();
      const shaft = new Mesh(new CylinderGeometry(0.035, 0.035, 1, 8), material(handle));
      shaft.position.y = 0.5;
      const tip = new Mesh(new ConeGeometry(0.11, 0.3, 12), material(handle));
      tip.position.y = 1.1;
      // Thicker invisible grip, so the thin arrow is easy to catch.
      const grip = new Mesh(
        new CylinderGeometry(0.16, 0.16, 1.3, 6),
        new MeshBasicMaterial({ visible: false }),
      );
      grip.position.y = 0.65;
      arm.add(shaft, tip, grip);
      if (handle === 'x') arm.rotation.z = -Math.PI / 2;
      if (handle === 'z') arm.rotation.x = Math.PI / 2;
      arm.name = `gizmo:${handle}`;
      for (const part of arm.children) {
        part.name = arm.name;
        part.renderOrder = 1000;
      }
      return arm;
    };
    for (const handle of ['x', 'y', 'z'] as const) {
      const arm = arrow(handle);
      this.#handles.set(handle, arm);
      this.group.add(arm);
    }
    const ring = new Mesh(new TorusGeometry(0.9, 0.035, 8, 48), material('turn'));
    ring.rotation.x = Math.PI / 2;
    ring.name = 'gizmo:turn';
    ring.renderOrder = 1000;
    const ringGrip = new Mesh(new TorusGeometry(0.9, 0.14, 6, 32), new MeshBasicMaterial({ visible: false }));
    ringGrip.rotation.x = Math.PI / 2;
    ringGrip.name = 'gizmo:turn';
    this.#handles.set('turn', ring);
    this.group.add(ring, ringGrip);
    // Size handle: a cube on the corner outside the ring (drag away to grow, inward to shrink).
    const cube = new Mesh(new BoxGeometry(0.2, 0.2, 0.2), material('size'));
    const cubeGrip = new Mesh(new BoxGeometry(0.42, 0.42, 0.42), new MeshBasicMaterial({ visible: false }));
    for (const part of [cube, cubeGrip]) {
      part.position.set(1, 0.1, 1);
      part.name = 'gizmo:size';
      part.renderOrder = 1000;
    }
    this.#handles.set('size', cube);
    this.group.add(cube, cubeGrip);
  }

  /** Shows the handles at an item (its base), sized to it; null hides them. */
  place(at: { x: number; y: number; z: number; size: number; resize?: boolean } | null): void {
    this.group.visible = at !== null;
    if (!at) return;
    // Resizing works on one item at a time.
    this.#resize = at.resize ?? true;
    this.#showHandles();
    this.#size = Math.max(1.2, at.size * 0.75);
    this.group.position.set(at.x, at.y, at.z);
    this.group.scale.setScalar(this.#size);
  }

  get mode(): GizmoMode {
    return this.#mode;
  }

  setMode(mode: GizmoMode): void {
    this.#mode = mode;
    this.#showHandles();
  }

  #showHandles(): void {
    for (const child of this.group.children) {
      const handle = child.name.startsWith('gizmo:') ? (child.name.slice(6) as GizmoHandle) : null;
      if (!handle) continue;
      const wanted =
        this.#mode === 'all' ||
        (this.#mode === 'move' && (handle === 'x' || handle === 'y' || handle === 'z')) ||
        this.#mode === handle;
      child.visible = wanted && (handle !== 'size' || this.#resize);
    }
  }

  /** Every mesh that can be grabbed (for raycasting). */
  get targets(): Object3D[] {
    return this.group.visible
      ? this.group.children.filter((child) => child.visible).flatMap((child) => [child, ...child.children])
      : [];
  }

  /** Which handle a hit object belongs to. */
  handleOf(object: Object3D): GizmoHandle | null {
    const name = object.name.startsWith('gizmo:') ? object.name.slice(6) : null;
    return name === 'x' || name === 'y' || name === 'z' || name === 'turn' || name === 'size' ? name : null;
  }

  /**
   * Where the pointer ray meets the drag plane of a handle: the ground plane through the gizmo
   * for X, Z, and turning; for up and down a standing plane that faces the camera.
   */
  dragPoint(handle: GizmoHandle, ray: Ray, pivot: Vector3): Vector3 | null {
    const plane = new Plane();
    if (handle === 'y') {
      const facing = new Vector3(ray.direction.x, 0, ray.direction.z);
      if (facing.lengthSq() < 1e-6) return null;
      plane.setFromNormalAndCoplanarPoint(facing.normalize(), pivot);
    } else {
      plane.setFromNormalAndCoplanarPoint(new Vector3(0, 1, 0), pivot);
    }
    return ray.intersectPlane(plane, new Vector3());
  }

  dispose(): void {
    this.group.traverse((object) => {
      if (object instanceof Mesh) {
        object.geometry.dispose();
        (object.material as MeshBasicMaterial).dispose();
      }
    });
  }
}
