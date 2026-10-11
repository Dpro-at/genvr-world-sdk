/** Tidewater4811ba48 canopy geometry adapter, MIT; LICENSE-tidewater.md. */
import { MeshStandardMaterial, type BufferGeometry } from 'three/webgpu';
import type { Generator } from '../generators.js';
import { type CanopyResourceDefinition } from './canopy-resource-geometry.js';
export declare const CANOPY_TREE_GENERATOR = "tidewater.tree";
export declare const CANOPY_SHRUB_GENERATOR = "tidewater.shrub";
export declare const CANOPY_PREVIEW_MATERIAL = "tidewater.canopy.preview";
export interface CanopyGeometryBinding {
    source: BufferGeometry;
    definition: CanopyResourceDefinition;
    level: 0 | 1;
    /** Full source bark envelope, separate from authored low-stem collider policy. */
    barkBounds: {
        min: [number, number, number];
        max: [number, number, number];
    };
}
export declare const canopyGeometryBinding: (geometry: BufferGeometry) => CanopyGeometryBinding | undefined;
/** Coarse static fallback only; the world owner supplies source atlas cutouts and lighting. */
export declare const createCanopyPreviewMaterial: () => MeshStandardMaterial;
/** Registration belongs to the runtime integration owner. No side effects on import. */
export declare const canopyTreeGenerator: Generator;
export declare const canopyShrubGenerator: Generator;
