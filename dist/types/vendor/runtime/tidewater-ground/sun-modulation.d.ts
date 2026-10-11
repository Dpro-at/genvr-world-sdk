/** Tidewater4811ba48 Terrain.js: meadow self shade affects only key direct sunlight. */
import { type DirectionalLight, type MeshStandardNodeMaterial } from 'three/webgpu';
type N = any;
export declare function meadowSunFactor(height: number, weight: number): number;
/** Register the source meadow mask on the original; the lighting adapter supplies its actual sun. */
export declare function attachGroundSunModulation(material: MeshStandardNodeMaterial, meadowWeightNode: N): void;
/** NodeMaterial.clone does not copy custom setup functions, so transfer explicitly when installing. */
export declare function copyGroundSunModulation(source: MeshStandardNodeMaterial, target: MeshStandardNodeMaterial, sun: DirectionalLight, sunDirection: N, terrainVisibility?: N): (() => void) | null;
export {};
