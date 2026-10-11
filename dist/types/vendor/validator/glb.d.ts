/**
 * Model facts read straight from a GLB file (P2-12): the JSON chunk and the image headers,
 * without decoding geometry or rendering. Works the same in the API, the worker, and the browser.
 */
export interface ModelStats {
    /** Triangles drawn, counting every node that uses a mesh. */
    triangles: number;
    vertices: number;
    /** One per mesh primitive per node that uses it (roughly the draw calls). */
    drawCalls: number;
    materials: number;
    /** Joints of all skins. */
    bones: number;
    animations: string[];
    textures: number;
    /** Estimated GPU memory of the textures (RGBA with mipmaps), in megabytes. */
    textureMB: number;
    /** glTF extensions the file needs (Draco, Meshopt, KTX2, ...). */
    extensions: string[];
    /**
     * The model's box in its own space (meters), from the position bounds of every drawn mesh
     * and the node transforms (P2-11: the server's size of an uploaded item). Skinned meshes are
     * measured in their bind pose. Null when the file has no drawn mesh with position bounds.
     */
    bounds?: {
        min: [number, number, number];
        max: [number, number, number];
    } | null;
}
export declare class GlbError extends Error {
}
interface GltfJson {
    scene?: number;
    scenes?: Array<{
        nodes?: number[];
    }>;
    nodes?: Array<{
        mesh?: number;
        children?: number[];
        matrix?: number[];
        translation?: number[];
        rotation?: number[];
        scale?: number[];
    }>;
    meshes?: Array<{
        primitives: Array<{
            attributes: Record<string, number>;
            indices?: number;
            mode?: number;
        }>;
    }>;
    accessors?: Array<{
        count: number;
        min?: number[];
        max?: number[];
    }>;
    materials?: unknown[];
    skins?: Array<{
        joints: number[];
    }>;
    animations?: Array<{
        name?: string;
    }>;
    images?: Array<{
        bufferView?: number;
        uri?: string;
        mimeType?: string;
    }>;
    bufferViews?: Array<{
        byteOffset?: number;
        byteLength: number;
    }>;
    extensionsRequired?: string[];
    extensionsUsed?: string[];
}
/** Splits a GLB into its JSON and binary chunk. */
export declare function chunks(bytes: Uint8Array): {
    json: GltfJson;
    bin: Uint8Array | null;
};
/** A KTX2 texture (GPU-compressed, KHR_texture_basisu). */
export declare const isKtx2: (bytes: Uint8Array) => boolean;
/** Width and height from a PNG or JPEG header; null for other formats. */
export declare function imageSize(bytes: Uint8Array): {
    width: number;
    height: number;
} | null;
/** Reads the model facts of a GLB file. Throws GlbError when the file is not a usable GLB. */
export declare function inspectGlb(bytes: Uint8Array): ModelStats;
export {};
