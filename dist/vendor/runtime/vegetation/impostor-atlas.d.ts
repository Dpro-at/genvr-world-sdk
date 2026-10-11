/** Tidewater4811ba48 Impostors.js atlas/frame port, MIT; LICENSE-tidewater.md. */
import { Matrix4, RenderTarget, Vector3, type BufferGeometry, type Material, type WebGPURenderer } from 'three/webgpu';
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
export declare function impostorAxisSphere(geometry: BufferGeometry): Omit<ImpostorGroup, 'variants'>;
/** Plant-local geometry to source atlas cell coordinates, before its group orthographic camera. */
export declare function impostorFrameMatrices(group: IndexedImpostorGroup, variant: number): Matrix4[];
/** Two RGBA8 data atlases. Geometry/materials are borrowed; targets and batch buffers are owned.
 * Run bake before a live render frame (not concurrently on the same renderer).
 * Native Three uses its own depth convention instead of the source reversed-depth clear value. */
export declare class ImpostorAtlas {
    readonly bakeMaterials: {
        albedo: Material;
        normal: Material;
    };
    readonly groups: readonly IndexedImpostorGroup[];
    readonly variantCount: number;
    readonly width: number;
    readonly height: number;
    readonly rtA: RenderTarget;
    readonly rtB: RenderTarget;
    baked: boolean;
    bakeMs: number;
    private disposed;
    private pending;
    constructor(groups: readonly ImpostorGroup[], bakeMaterials: {
        albedo: Material;
        normal: Material;
    });
    bake(renderer: WebGPURenderer): Promise<void>;
    private render;
    dispose(): void;
    private releaseTargets;
}
