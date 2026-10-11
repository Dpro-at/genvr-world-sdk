import type { TerrainActiveSurface } from '../../contracts/index.js';
import type { TerrainFieldStore } from '../../world/index.js';
import { MeshStandardNodeMaterial, type Texture } from 'three/webgpu';
import type { TerrainFieldTextures } from '../terrain-fields-gpu.js';
type Node = any;
export interface NativeGroundProviders {
    /** Borrowed source detail texture, shared with vegetation; caller owns disposal. */
    detailTexture?: Texture;
    wetFoam?: (seaRelativePosition: Node) => Node;
    windDirection?: Node;
    windSpeed?: Node;
    gustOffset?: Node;
    swellDirection?: Node;
}
/** No implicit source-channel names or palette normalization. */
export declare function validateNativeMaterialBindings(store: TerrainFieldStore, surface: TerrainActiveSurface): void;
export declare function createNativeGroundMaterial(gpu: TerrainFieldTextures, surface: TerrainActiveSurface, seaLevel: Node, providers?: NativeGroundProviders, sourceMaterial?: boolean): {
    material: MeshStandardNodeMaterial;
    sourceMaterial: MeshStandardNodeMaterial | null;
    fallbackMaterial: MeshStandardNodeMaterial;
    dispose: () => void;
};
export {};
