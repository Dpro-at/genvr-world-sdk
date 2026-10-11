import { TerrainFieldDescriptor, TerrainFieldTile } from '../contracts/index.js';
export interface RawTerrainFieldTile {
    tx: number;
    tz: number;
    /** Exact raw u8/f32le bytes, not normalized floating-point mask values. */
    channels: Readonly<Record<string, Uint8Array>>;
}
export interface TerrainFieldTileChange {
    key: string;
    previous: TerrainFieldTile | null;
    revision: number;
}
export declare function terrainFieldTileShape(descriptor: TerrainFieldDescriptor, tx: number, tz: number): {
    cols: number;
    rows: number;
};
/** Namespaced alongside legacy height chunks and v: voxel rows; never decode these as ChunkData. */
export declare function terrainFieldTileKey(descriptor: TerrainFieldDescriptor, tx: number, tz: number): string;
/** Validate metadata, exact complete channel bundle, canonical base64 and every float before mutation. */
export declare function validateTerrainFieldTile(descriptor: TerrainFieldDescriptor, input: unknown): TerrainFieldTile;
export declare function encodeTerrainFieldTile(descriptor: TerrainFieldDescriptor, raw: RawTerrainFieldTile): TerrainFieldTile;
export declare function decodeTerrainFieldTile(descriptor: TerrainFieldDescriptor, input: unknown): RawTerrainFieldTile;
/** JSON storage envelope retains original channel byte strings; no float conversion occurs. */
export declare function serializeTerrainFieldTile(descriptor: TerrainFieldDescriptor, input: TerrainFieldTile): string;
export declare function parseTerrainFieldTile(descriptor: TerrainFieldDescriptor, text: string): TerrainFieldTile;
/** Endianness-independent convenience for a newly authored numeric Float32 channel. */
export declare function terrainFieldFloat32Bytes(values: Float32Array): Uint8Array;
/** In-memory lazy tile foundation; persistence/version/auth/command wiring are a later slice. */
export declare class TerrainFieldStore {
    #private;
    constructor(descriptor: TerrainFieldDescriptor);
    get descriptor(): TerrainFieldDescriptor;
    get revision(): number;
    get tileCount(): number;
    get complete(): boolean;
    getTile(tx: number, tz: number): TerrainFieldTile | null;
    /** Scalar access never exposes mutable storage bytes. Decode validated channels once, on demand. */
    readValue(channelId: string, col: number, row: number): number | null;
    /** Lossless raw row into caller-owned Float64 storage. Invalid/missing input leaves target untouched. */
    readRow(channelId: string, row: number, startCol: number, target: Float64Array): boolean;
    /** Shared scalar-read cache; total bytes cannot exceed the loaded raw channel bytes. */
    get decodedByteLength(): number;
    clearDecodedCache(): void;
    /** Suitable for inverse payloads; expectedRevision guards this store only, not a DB transaction. */
    replace(input: unknown, expectedRevision: number): TerrainFieldTileChange;
    restore(tx: number, tz: number, previous: TerrainFieldTile | null, expectedRevision: number): TerrainFieldTileChange;
}
