import type { Camera } from 'three/webgpu';
/** A face of the view cube; clicking it turns the camera to look from that side. */
export type ViewFace = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';
/** Direction from the target to the camera for each face (world axes, +Y up, front = +Z). */
export declare const FACE_DIRECTIONS: Record<ViewFace, readonly [number, number, number]>;
/**
 * The camera's rotation as a CSS matrix: the rotation part of the view matrix with the y axis
 * flipped on both sides (CSS y points down), so the cube turns exactly like the world.
 */
export declare function cssRotation(viewMatrix: ArrayLike<number>): string;
/**
 * Orientation compass for 3D views (owner note, docs/reference/tools/01): a small cube in a
 * corner that turns with the camera, with the X (red), Y (green), and Z (blue) axes. Clicking a
 * face looks at the scene from that side. Plain HTML and CSS 3D (no second renderer), themed
 * with the page's `--surface` and `--ink` colors when they exist.
 */
export declare class ViewCube {
    #private;
    readonly element: HTMLDivElement;
    constructor(container: HTMLElement, onPick: (face: ViewFace) => void, { size, corner }?: {
        size?: number;
        corner?: 'bottom-left' | 'top-right';
    });
    /** Turns the cube and the axes with the camera (call every frame; cheap when nothing moved). */
    update(camera: Camera): void;
    set visible(on: boolean);
    dispose(): void;
}
