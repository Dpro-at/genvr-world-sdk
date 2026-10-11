/** Source leaf transmission multiplies shadowed sun light, never ambient/emissive. */
import { type DirectionalLight, type MeshStandardNodeMaterial } from 'three/webgpu';
type N = any;
/** Save the source graph separately: Three clone() does not copy custom setup methods. */
export declare function registerPlantTransmission(material: MeshStandardNodeMaterial, node: N): void;
/** Install after ground sun modulation; the added term needs its own terrain factor. */
export declare function copyPlantTransmission(source: MeshStandardNodeMaterial, target: MeshStandardNodeMaterial, sun: DirectionalLight, terrainVisibility?: N): (() => void) | null;
export {};
