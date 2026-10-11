/** Tidewater4811ba48 resource preparation. MIT; LICENSE-tidewater.md. */
import { Box3 } from 'three/webgpu';
export type CanopyKind = 'tree' | 'shrub';
export interface CanopyResourceDefinition {
    kind: CanopyKind;
    /** Original continuous Scatter seed, independent of fixed topology seeds21/31. */
    appearanceSeed: number;
    size: number;
    stretch: number;
}
/** Exact source metadata mapping; fail invalid authoring inputs before allocating geometry. */
export declare function canopyResourceData(definition: CanopyResourceDefinition): {
    variant: number;
    lobeOffset: number;
    height: number;
    signedStretch: number;
};
/** Owned raw and static variant geometries for the future item generator/binding.
 * Static geometry is the source atlas pose, not a wind-deformed frame. Runtime
 * uses raw geometry and the same continuous seed; never applies lobe contraction twice.
 */
export declare function buildCanopyResourceGeometry(definition: CanopyResourceDefinition): {
    trunk: Box3;
    dispose(): void;
    variant: number;
    lobeOffset: number;
    height: number;
    signedStretch: number;
    source: import("three/webgpu").BufferGeometry<import("three/webgpu").NormalBufferAttributes, import("three/webgpu").BufferGeometryEventMap>;
    preview: import("three/webgpu").BufferGeometry<import("three/webgpu").NormalBufferAttributes, import("three/webgpu").BufferGeometryEventMap>;
    definition: {
        kind: CanopyKind;
        /** Original continuous Scatter seed, independent of fixed topology seeds21/31. */
        appearanceSeed: number;
        size: number;
        stretch: number;
    };
};
