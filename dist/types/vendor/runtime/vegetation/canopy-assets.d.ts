/** Per-world source canopy GPU assets. MIT source attribution: LICENSE-tidewater.md. */
import type { WebGPURenderer } from 'three/webgpu';
import { LeafAtlas } from './leaf-atlas.js';
import { ImpostorAtlas } from './impostor-atlas.js';
/** Create once per world, outside a renderer frame; never store in global generator caches.
 * Await readiness before attaching live materials. If the world closes while awaiting,
 * dispose the resolved owner before attaching it. Renderer is borrowed and never disposed.
 */
export declare function createCanopyAssets(renderer: WebGPURenderer): Promise<{
    leaf: LeafAtlas;
    impostor: ImpostorAtlas;
    dispose: () => void;
}>;
export type CanopyAssets = Awaited<ReturnType<typeof createCanopyAssets>>;
