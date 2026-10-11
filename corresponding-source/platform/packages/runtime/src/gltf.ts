// glTF loading for `.genvr` packages (P2-16). The three.js addons import `three`, the
// runtime `three/webgpu`; both builds share `three.core.js` (same classes), and the web
// bundler aliases `three` to `three/webgpu` so the WebGL-only build is not bundled too.
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
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
    renderer: Pick<WebGPURenderer, 'hasFeature'> & { isWebGPURenderer: true };
    transcoderPath?: string;
  };
}

/** Draco decoder folder served by the web app (copied from three.js at dev and build). */
export const DEFAULT_DRACO_PATH = '/decoders/draco/';
/** Basis transcoder folder for KTX2 textures (copied from three.js like the Draco decoder). */
export const DEFAULT_BASIS_PATH = '/decoders/basis/';

/** A GLTFLoader with Draco and Meshopt decoders, and KTX2 textures when a renderer is given. */
export function createGltfLoader(options: GltfLoaderOptions = {}): GLTFLoader {
  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath(options.dracoPath ?? DEFAULT_DRACO_PATH);
  loader.setDRACOLoader(draco);
  loader.setMeshoptDecoder(MeshoptDecoder);
  if (options.ktx2) {
    const ktx2 = new KTX2Loader();
    ktx2.setTranscoderPath(options.ktx2.transcoderPath ?? DEFAULT_BASIS_PATH);
    ktx2.detectSupport(options.ktx2.renderer as never);
    loader.setKTX2Loader(ktx2);
  }
  return loader;
}

/** Parses a GLB or glTF (JSON) file already in memory; `path` resolves external files. */
export function parseGltf(loader: GLTFLoader, data: ArrayBuffer | string, path = ''): Promise<GLTF> {
  return loader.parseAsync(data, path);
}
