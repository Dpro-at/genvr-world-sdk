import { type RuntimeOptions, type GenvrRuntime } from './vendor/runtime/index.js';
import { WorldSession } from './session.js';
export { createRuntime, type GenvrRuntime, type RuntimeOptions } from './vendor/runtime/index.js';
/** Browser-only subpath; the authoring core has no WebGL, DOM or React side effects. */
export declare function previewWorld(session: WorldSession, container: HTMLElement, options?: Omit<RuntimeOptions, 'container' | 'world' | 'terrainChunks' | 'onCommand'>): Promise<GenvrRuntime>;
