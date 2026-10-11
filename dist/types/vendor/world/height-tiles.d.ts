/**
 * Height tiles for MCP `set_ground_heights` / `get_ground_heights` (Tidewater world, task 2): heights in metres as
 * little-endian int16 centimetres relative to a base height, in base64. One 129 x 129 tile is 33 KB of bytes.
 */
export declare const HEIGHT_TILE_RANGE = 327.67;
/** Heights (metres, row by row) as base64 int16 centimetres from `base`; throws past +-327.67 m from it. */
export declare function encodeHeightTile(metres: readonly number[], base: number): string;
/** `count` heights in metres from a tile; throws when the bytes do not hold exactly `count` heights. */
export declare function decodeHeightTile(text: string, count: number, base: number): number[];
