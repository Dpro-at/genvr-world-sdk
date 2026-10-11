import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { WebGPURenderer } from 'three/webgpu';
export type { GLTF };
export interface GltfLoaderOptions {
    /** Folder with the Draco decoder files (`draco_decoder.wasm`, `draco_wasm_wrapper.js`). */
    dracoPath?: string;
    /**
     * KTX2 (Basis) textures, which stay compressed on the GPU: the renderer that draws the models
     * (it tells which compressed formats this GPU takes) and the transcoder folder.
     */
    ktx2?: {
        renderer: Pick<WebGPURenderer, 'hasFeature'> & {
            isWebGPURenderer: true;
        };
        transcoderPath?: string;
    };
}
/** Draco decoder folder served by the web app (copied from three.js at dev and build). */
export declare const DEFAULT_DRACO_PATH = "/decoders/draco/";
/** Basis transcoder folder for KTX2 textures (copied from three.js like the Draco decoder). */
export declare const DEFAULT_BASIS_PATH = "/decoders/basis/";
/** A GLTFLoader with Draco and Meshopt decoders, and KTX2 textures when a renderer is given. */
export declare function createGltfLoader(options?: GltfLoaderOptions): GLTFLoader;
/** Parses a GLB or glTF (JSON) file already in memory; `path` resolves external files. */
export declare function parseGltf(loader: GLTFLoader, data: ArrayBuffer | string, path?: string): Promise<GLTF>;
