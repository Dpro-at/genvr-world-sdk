import { type NodeMaterial } from 'three/webgpu';
export declare function bayer4(x: number, y: number, frame?: number): number;
export declare function lodFadeVisible(x: number, y: number, fade: number, outgoing?: boolean, frame?: number): boolean;
export declare function bandFade(distance: number, start: number, end: number): number;
export declare function lodFadeNode(fade: any, outgoing?: any, frame?: any, pixel?: any): any;
/** The same mask must be attached to the visible and shadow/depth materials. */
export declare function attachLodFade(material: NodeMaterial, fade: any, outgoing?: boolean, frame?: any, shadowMaterials?: NodeMaterial[]): () => void;
