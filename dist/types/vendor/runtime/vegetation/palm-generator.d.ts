import { MeshStandardMaterial, type BufferGeometry } from 'three/webgpu';
import type { Generator } from '../generators.js';
import type { PalmInstanceDefinition } from './instance-attributes.js';
export declare const PALM_GENERATOR = "tidewater.palm";
export declare const PALM_PREVIEW_MATERIAL = "tidewater.palm.preview";
export interface PalmGeometryBinding {
    source: BufferGeometry;
    definition: PalmInstanceDefinition;
    level: number;
}
export declare const palmGeometryBinding: (geometry: BufferGeometry) => PalmGeometryBinding | undefined;
export declare const createPalmPreviewMaterial: () => MeshStandardMaterial;
/** Pure generated geometry; no world nodes, live shaders or borrowed textures enter this cache. */
export declare const palmGenerator: Generator;
