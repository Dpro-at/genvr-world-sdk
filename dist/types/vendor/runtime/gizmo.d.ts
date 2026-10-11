import { Group, Vector3, type Object3D, type Ray } from 'three/webgpu';
export type GizmoHandle = 'x' | 'y' | 'z' | 'turn' | 'size';
/**
 * Drag handles for the selected item (task P3-24): arrows move it along X, Z, or up and down,
 * the ring turns it, the corner cube makes it bigger or smaller. The gizmo only shows and measures; ItemTools turns drags into commands.
 */
export declare class TransformGizmo {
    #private;
    readonly group: Group<import("three/webgpu").Object3DEventMap>;
    constructor();
    /** Shows the handles at an item (its base), sized to it; null hides them. */
    place(at: {
        x: number;
        y: number;
        z: number;
        size: number;
        resize?: boolean;
    } | null): void;
    /** Every mesh that can be grabbed (for raycasting). */
    get targets(): Object3D[];
    /** Which handle a hit object belongs to. */
    handleOf(object: Object3D): GizmoHandle | null;
    /**
     * Where the pointer ray meets the drag plane of a handle: the ground plane through the gizmo
     * for X, Z, and turning; for up and down a standing plane that faces the camera.
     */
    dragPoint(handle: GizmoHandle, ray: Ray, pivot: Vector3): Vector3 | null;
    dispose(): void;
}
