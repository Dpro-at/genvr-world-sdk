import { z } from 'zod';
/** Generic raster surface binding. Heights use only the referenced descriptor's heightBinding. */
export declare const TerrainActiveSurface: z.ZodObject<{
    setId: z.ZodString;
    outsideHeight: z.ZodNumber;
    edge: z.ZodEnum<{
        clamp: "clamp";
        constant: "constant";
    }>;
    farEdge: z.ZodEnum<{
        inclusive: "inclusive";
        exclusive: "exclusive";
    }>;
    materialBindings: z.ZodOptional<z.ZodArray<z.ZodObject<{
        itemId: z.ZodString;
        inputs: z.ZodRecord<z.ZodString, z.ZodObject<{
            channel: z.ZodString;
            scale: z.ZodNumber;
        }, z.core.$strict>>;
    }, z.core.$strict>>>;
}, z.core.$strict>;
export type TerrainActiveSurface = z.infer<typeof TerrainActiveSurface>;
/** Generic lossless terrain rasters; coordinates are world metres, never place-size scaled. */
export declare const TERRAIN_FIELD_TILE_SIZE = 128;
export declare const TERRAIN_FIELD_MAX_BYTES: number;
export declare const TERRAIN_FIELD_TILE_MAX_BYTES: number;
export declare const TERRAIN_FIELD_TILE_MAX_BASE64: number;
export declare const TerrainFieldId: z.ZodString;
export declare const TerrainFieldEncoding: z.ZodEnum<{
    u8: "u8";
    f32le: "f32le";
}>;
export type TerrainFieldEncoding = z.infer<typeof TerrainFieldEncoding>;
export declare const TerrainFieldChannel: z.ZodObject<{
    id: z.ZodString;
    encoding: z.ZodEnum<{
        u8: "u8";
        f32le: "f32le";
    }>;
    range: z.ZodOptional<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
}, z.core.$strict>;
export type TerrainFieldChannel = z.infer<typeof TerrainFieldChannel>;
export declare const TerrainFieldDescriptor: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    id: z.ZodString;
    origin: z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>;
    spacing: z.ZodNumber;
    width: z.ZodNumber;
    height: z.ZodNumber;
    sampling: z.ZodEnum<{
        "cell-center": "cell-center";
        vertex: "vertex";
    }>;
    channels: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        encoding: z.ZodEnum<{
            u8: "u8";
            f32le: "f32le";
        }>;
        range: z.ZodOptional<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
    }, z.core.$strict>>;
    heightBinding: z.ZodOptional<z.ZodObject<{
        channel: z.ZodString;
        offset: z.ZodNumber;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type TerrainFieldDescriptor = z.infer<typeof TerrainFieldDescriptor>;
/** Wire/storage envelope; geometry-dependent lengths/coverage are checked by the lossless codec. */
export declare const TerrainFieldTile: z.ZodObject<{
    kind: z.ZodLiteral<"terrain-fields-v1">;
    setId: z.ZodString;
    tx: z.ZodNumber;
    tz: z.ZodNumber;
    cols: z.ZodNumber;
    rows: z.ZodNumber;
    channels: z.ZodRecord<z.ZodString, z.ZodString>;
}, z.core.$strict>;
export type TerrainFieldTile = z.infer<typeof TerrainFieldTile>;
/** Staged references only: descriptors do not activate height or material consumers. */
export declare const TerrainFieldTileCoordinate: z.ZodString;
export declare const TerrainFieldSetMetadata: z.ZodObject<{
    descriptor: z.ZodObject<{
        schemaVersion: z.ZodLiteral<1>;
        id: z.ZodString;
        origin: z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>;
        spacing: z.ZodNumber;
        width: z.ZodNumber;
        height: z.ZodNumber;
        sampling: z.ZodEnum<{
            "cell-center": "cell-center";
            vertex: "vertex";
        }>;
        channels: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            encoding: z.ZodEnum<{
                u8: "u8";
                f32le: "f32le";
            }>;
            range: z.ZodOptional<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
        }, z.core.$strict>>;
        heightBinding: z.ZodOptional<z.ZodObject<{
            channel: z.ZodString;
            offset: z.ZodNumber;
        }, z.core.$strict>>;
    }, z.core.$strict>;
    tiles: z.ZodArray<z.ZodString>;
}, z.core.$strict>;
export type TerrainFieldSetMetadata = z.infer<typeof TerrainFieldSetMetadata>;
export declare const TerrainFieldSets: z.ZodRecord<z.ZodString, z.ZodObject<{
    descriptor: z.ZodObject<{
        schemaVersion: z.ZodLiteral<1>;
        id: z.ZodString;
        origin: z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>;
        spacing: z.ZodNumber;
        width: z.ZodNumber;
        height: z.ZodNumber;
        sampling: z.ZodEnum<{
            "cell-center": "cell-center";
            vertex: "vertex";
        }>;
        channels: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            encoding: z.ZodEnum<{
                u8: "u8";
                f32le: "f32le";
            }>;
            range: z.ZodOptional<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>>;
        }, z.core.$strict>>;
        heightBinding: z.ZodOptional<z.ZodObject<{
            channel: z.ZodString;
            offset: z.ZodNumber;
        }, z.core.$strict>>;
    }, z.core.$strict>;
    tiles: z.ZodArray<z.ZodString>;
}, z.core.$strict>>;
export type TerrainFieldSets = z.infer<typeof TerrainFieldSets>;
