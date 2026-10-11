/** Tidewater PostFX.js (4811ba48), MIT: RCAS, grading, fitted ACES, sRGB and temporal dither.
 * Returns display-encoded color. The caller MUST disable Three's output transform/tone mapping. */
import { type Texture } from 'three/webgpu';
type Node = any;
export declare function createFinalParams(): Record<"bloom" | "vignette" | "saturation" | "contrast" | "warmth" | "grain" | "sharpen" | "exposure" | "frameIndex", any>;
export interface FinalOptions {
    resolved: Texture;
    depth: Texture;
    bloom: Texture;
    half: Texture;
    exposureNode: Node;
    /** Three uses standardZ; set true only for an explicitly reversed depth attachment. */
    depthReversed?: boolean;
    params?: ReturnType<typeof createFinalParams>;
    /** Source motion blur gathers around the already sharpened center. */
    motionApply?: (sharp: Node, uv: Node) => Node;
    flare?: (uv: Node) => Node;
    /** Lens droplets call sharp/blurred callbacks at displaced UVs; absent means dry lens. */
    lens?: (uv: Node, sharp: (uv: Node) => Node, blurred: (uv: Node) => Node) => Node;
}
/** Public RCAS node also lets a deterministic GPU fixture test the HDR proxy independently. */
export declare function rcasNode(resolved: Texture, depth: Texture, coord: Node, sharpen: Node, reversedDepth?: boolean): Node;
export declare function gradeNode(color: Node, coord: Node, pixel: Node, adaptation: Node, params?: Record<"bloom" | "vignette" | "saturation" | "contrast" | "warmth" | "grain" | "sharpen" | "exposure" | "frameIndex", any>): Node;
export declare function createFinalNode(options: FinalOptions): Node;
export {};
