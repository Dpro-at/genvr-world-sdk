import { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js';
import { type DirectionalLight } from 'three/webgpu';
type Node = any;
export declare class TidewaterShadowNode extends CSMShadowNode {
    #private;
    readonly radii: number[];
    readonly rendered: boolean[];
    constructor(sun: DirectionalLight);
    invalidate(): void;
    _init(builder: Node): void;
    _setupFade(): Node;
    updateBefore(frame?: {
        frameId: number;
    }): undefined;
    dispose(): void;
}
export {};
