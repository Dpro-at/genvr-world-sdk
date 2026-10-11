/**
 * The baked human data (CHAR-02): one compact binary written by `tooling/human-bake/bake.ts` from CC0 base data and
 * read by our generator. Settings only reach the generator; the data never changes at runtime.
 *
 * Layout: `GVH1` (4 bytes), header length (u32 LE), header JSON (UTF-8), zero padding to 4 bytes, then the arrays
 * the header points at (offsets from the start of the array block, little endian).
 */
export declare const HUMAN_MAGIC = "GVH1";
export declare const HUMAN_FORMAT_VERSION = 1;
/** Where one typed array sits in the array block. */
export interface HumanArrayRef {
    offset: number;
    length: number;
}
/** A sparse shape target: vertex ids and int16 offsets (x, y, z) times `scale` metres. */
export interface HumanTargetRef {
    name: string;
    scale: number;
    indices: HumanArrayRef;
    deltas: HumanArrayRef;
}
/** A joint: its rest position is the mean of these vertices (drawn or helper) of the shaped body. */
export interface HumanJointRef {
    name: string;
    parent: string | null;
    vertices: HumanArrayRef;
}
export interface HumanHeader {
    version: number;
    /**
     * Bytes per stored vertex id (quads, joint vertices, target indices): 2 up to 65,536 vertices, 4 above (owner,
     * 2026-10-05: the 100k-quad body). Absent = 2 (older files). Decoded always as Uint32Array.
     */
    indexBytes?: 2 | 4;
    /** Every vertex (drawn first, then helper vertices that only place joints). */
    vertices: number;
    /** The first `drawn` vertices are drawn. */
    drawn: number;
    /** Quads of the drawn surface (four vertex ids each, counter-clockwise from outside). */
    quads: number;
    /** Quads of the lighter level of detail (the same vertices; the finer muscle areas merged back), when baked. */
    lodQuads?: number;
    /** Surface regions by vertex (0 skin, 1 base shorts). */
    regions: readonly string[];
    arrays: {
        /** Float32, metres, y up, facing +z, left +x. */
        positions: HumanArrayRef;
        /** Vertex ids (`indexBytes` each) x4 per quad. */
        quads: HumanArrayRef;
        /** Uint8 per drawn vertex. */
        region: HumanArrayRef;
        /** Uint8 x4 per drawn vertex (joint order of `joints`). */
        skinIndex: HumanArrayRef;
        /** Uint8 x4 per drawn vertex, sums to 255. */
        skinWeight: HumanArrayRef;
        /** Vertex ids used by the joints. */
        jointVertices: HumanArrayRef;
        /** Vertex ids x4 per quad of the lighter level of detail (optional). */
        lodQuads?: HumanArrayRef;
    };
    joints: readonly HumanJointRef[];
    targets: readonly HumanTargetRef[];
    /** Where the data came from (licence per source file). */
    sources: readonly {
        file: string;
        licence: string;
    }[];
}
export interface HumanTarget {
    name: string;
    indices: Uint32Array;
    /** Metres, x y z per entry. */
    deltas: Float32Array;
}
export interface HumanData {
    header: HumanHeader;
    positions: Float32Array;
    quads: Uint32Array;
    /** The lighter level of detail's quads (same vertices), when baked. */
    lodQuads?: Uint32Array;
    region: Uint8Array;
    skinIndex: Uint8Array;
    skinWeight: Uint8Array;
    joints: readonly {
        name: string;
        parent: string | null;
        vertices: Uint32Array;
    }[];
    targets: ReadonlyMap<string, HumanTarget>;
}
/** Reads the baked binary. */
export declare function decodeHuman(buffer: ArrayBuffer): HumanData;
/** What the bake hands to `encodeHuman`. */
export interface HumanSource {
    positions: Float32Array;
    drawn: number;
    quads: ArrayLike<number>;
    /** The lighter level of detail's quads (same vertices). */
    lodQuads?: ArrayLike<number>;
    regions: readonly string[];
    region: Uint8Array;
    skinIndex: Uint8Array;
    skinWeight: Uint8Array;
    joints: readonly {
        name: string;
        parent: string | null;
        vertices: readonly number[];
    }[];
    targets: readonly {
        name: string;
        indices: ArrayLike<number>;
        deltas: Float32Array;
    }[];
    sources: HumanHeader['sources'];
}
/** Writes the baked binary (deterministic for the same input). */
export declare function encodeHuman(source: HumanSource): Uint8Array;
