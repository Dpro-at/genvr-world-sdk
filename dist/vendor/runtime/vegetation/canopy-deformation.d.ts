import { type VegetationWindProvider } from './wind.js';
type N = any;
export declare const CANOPY_LOBE_WGSL: string;
export declare const CANOPY_DEFORMATION_WGSL: string;
export interface CanopyDeformationInputs {
    /** Already instance-transformed position and source instance normal; no normalization is added. */
    position: N;
    normal: N;
    instancePosition: N;
    instanceData: N;
    vegetation: N;
    material: N;
    lobe: N;
    camera: N;
    time: N;
    /** Explicit tree/shrub near distances. Original defaults are75/45m. */
    nearRange: N;
}
/** Borrowed provider; one main camera for visible and shadow graphs. No owned GPU resources. */
export declare function canopyDeformation(provider: VegetationWindProvider, i: CanopyDeformationInputs): {
    position: N;
    normal: N;
};
export {};
