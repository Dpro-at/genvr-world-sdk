import { fromBase64, toBase64 } from './terrain-data.js';

/**
 * Height tiles for MCP `set_ground_heights` / `get_ground_heights` (Tidewater world, task 2): heights in metres as
 * little-endian int16 centimetres relative to a base height, in base64. One 129 x 129 tile is 33 KB of bytes.
 */
export const HEIGHT_TILE_RANGE = 327.67;

/** Heights (metres, row by row) as base64 int16 centimetres from `base`; throws past +-327.67 m from it. */
export function encodeHeightTile(metres: readonly number[], base: number): string {
  const bytes = new Uint8Array(metres.length * 2);
  const view = new DataView(bytes.buffer);
  metres.forEach((h, i) => {
    const cm = Math.round((h - base) * 100);
    if (!Number.isFinite(cm) || cm < -32768 || cm > 32767)
      throw new Error(
        `Height ${h} m is more than ${HEIGHT_TILE_RANGE} m from the base ${base} m; pick another base.`,
      );
    view.setInt16(i * 2, cm, true);
  });
  return toBase64(bytes);
}

/** `count` heights in metres from a tile; throws when the bytes do not hold exactly `count` heights. */
export function decodeHeightTile(text: string, count: number, base: number): number[] {
  const bytes = fromBase64(text);
  if (bytes.length !== count * 2)
    throw new Error(`The heights hold ${Math.floor(bytes.length / 2)} values; ${count} were expected.`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Array.from({ length: count }, (_, i) => base + view.getInt16(i * 2, true) / 100);
}
