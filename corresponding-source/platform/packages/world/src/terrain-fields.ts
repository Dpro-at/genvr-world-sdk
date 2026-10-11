import {
  TERRAIN_FIELD_TILE_MAX_BYTES,
  TERRAIN_FIELD_TILE_SIZE,
  TerrainFieldDescriptor,
  TerrainFieldTile,
  type TerrainFieldChannel,
} from '@genvr/contracts';
import { MIN_HEIGHT, MAX_HEIGHT, fromBase64, toBase64 } from './terrain-data.js';

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
const stride = (channel: TerrainFieldChannel) => (channel.encoding === 'u8' ? 1 : 4);
const canonicalBase64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const base64Codes = new Uint8Array(128);
for (const [index, char] of [...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'].entries())
  base64Codes[char.charCodeAt(0)] = index;
/** Private fast path only for canonical channel strings already validated before store mutation. */
function decodeStoredChannel(text: string): Uint8Array {
  const padding = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  const bytes = new Uint8Array((text.length / 4) * 3 - padding);
  let cursor = 0;
  for (let i = 0; i < text.length; i += 4) {
    const bits =
      (base64Codes[text.charCodeAt(i)]! << 18) |
      (base64Codes[text.charCodeAt(i + 1)]! << 12) |
      (base64Codes[text.charCodeAt(i + 2)]! << 6) |
      base64Codes[text.charCodeAt(i + 3)]!;
    bytes[cursor++] = bits >> 16;
    if (cursor < bytes.length) bytes[cursor++] = bits >> 8;
    if (cursor < bytes.length) bytes[cursor++] = bits;
  }
  return bytes;
}

export function terrainFieldTileShape(
  descriptor: TerrainFieldDescriptor,
  tx: number,
  tz: number,
): { cols: number; rows: number } {
  if (
    !Number.isInteger(tx) ||
    !Number.isInteger(tz) ||
    tx < 0 ||
    tz < 0 ||
    tx * TERRAIN_FIELD_TILE_SIZE >= descriptor.width ||
    tz * TERRAIN_FIELD_TILE_SIZE >= descriptor.height
  )
    throw new RangeError('Field tile coordinates are outside the descriptor');
  return {
    cols: Math.min(TERRAIN_FIELD_TILE_SIZE, descriptor.width - tx * TERRAIN_FIELD_TILE_SIZE),
    rows: Math.min(TERRAIN_FIELD_TILE_SIZE, descriptor.height - tz * TERRAIN_FIELD_TILE_SIZE),
  };
}
/** Namespaced alongside legacy height chunks and v: voxel rows; never decode these as ChunkData. */
export function terrainFieldTileKey(descriptor: TerrainFieldDescriptor, tx: number, tz: number): string {
  terrainFieldTileShape(descriptor, tx, tz);
  return `f:${descriptor.id}:${tx},${tz}`;
}
function validateBytes(
  descriptor: TerrainFieldDescriptor,
  channel: TerrainFieldChannel,
  bytes: Uint8Array,
  count: number,
): void {
  if (bytes.length !== count * stride(channel)) throw new Error(`Wrong byte count for ${channel.id}`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < count; i++) {
    const value = channel.encoding === 'u8' ? bytes[i]! : view.getFloat32(i * 4, true);
    if (!Number.isFinite(value)) throw new Error(`Non-finite value in ${channel.id}`);
    if (channel.range && (value < channel.range[0] || value > channel.range[1]))
      throw new RangeError(`Value outside ${channel.id} range`);
    if (descriptor.heightBinding?.channel === channel.id) {
      const height = value + descriptor.heightBinding.offset;
      if (height < MIN_HEIGHT || height > MAX_HEIGHT)
        throw new RangeError('Effective height is outside the platform terrain range');
    }
  }
}
/** Validate metadata, exact complete channel bundle, canonical base64 and every float before mutation. */
export function validateTerrainFieldTile(
  descriptor: TerrainFieldDescriptor,
  input: unknown,
): TerrainFieldTile {
  const d = TerrainFieldDescriptor.parse(descriptor),
    tile = TerrainFieldTile.parse(input);
  if (tile.setId !== d.id) throw new Error('Field tile belongs to another set');
  const { cols, rows } = terrainFieldTileShape(d, tile.tx, tile.tz);
  if (tile.cols !== cols || tile.rows !== rows) throw new Error('Field tile shape does not match descriptor');
  if (
    Object.keys(tile.channels).length !== d.channels.length ||
    d.channels.some((c) => !Object.hasOwn(tile.channels, c.id))
  )
    throw new Error('Field tile must contain every declared channel exactly once');
  let size = 0;
  for (const channel of d.channels) {
    const text = tile.channels[channel.id]!;
    const count = cols * rows,
      expected = count * stride(channel);
    if (text.length !== Math.ceil(expected / 3) * 4 || !canonicalBase64.test(text))
      throw new Error('Invalid base64 or byte length');
    const bytes = fromBase64(text);
    // Decoder alone accepts nonzero trailing pad bits; canonical encoding rejects aliases.
    if (toBase64(bytes) !== text) throw new Error('Non-canonical base64 padding');
    validateBytes(d, channel, bytes, count);
    size += bytes.length;
  }
  if (size > TERRAIN_FIELD_TILE_MAX_BYTES) throw new RangeError('Field tile exceeds byte budget');
  return tile;
}
export function encodeTerrainFieldTile(
  descriptor: TerrainFieldDescriptor,
  raw: RawTerrainFieldTile,
): TerrainFieldTile {
  const d = TerrainFieldDescriptor.parse(descriptor),
    shape = terrainFieldTileShape(d, raw.tx, raw.tz);
  if (
    Object.keys(raw.channels).length !== d.channels.length ||
    d.channels.some((c) => !Object.hasOwn(raw.channels, c.id))
  )
    throw new Error('Field tile must contain every declared channel exactly once');
  for (const channel of d.channels) {
    const bytes = raw.channels[channel.id];
    if (!(bytes instanceof Uint8Array)) throw new TypeError('Raw channel must be a Uint8Array');
    validateBytes(d, channel, bytes, shape.cols * shape.rows);
  }
  const channels = Object.fromEntries(
    Object.entries(raw.channels).map(([id, bytes]) => [id, toBase64(bytes)]),
  );
  return validateTerrainFieldTile(d, {
    kind: 'terrain-fields-v1',
    setId: d.id,
    tx: raw.tx,
    tz: raw.tz,
    ...shape,
    channels,
  });
}
export function decodeTerrainFieldTile(
  descriptor: TerrainFieldDescriptor,
  input: unknown,
): RawTerrainFieldTile {
  const tile = validateTerrainFieldTile(descriptor, input);
  return {
    tx: tile.tx,
    tz: tile.tz,
    channels: Object.fromEntries(Object.entries(tile.channels).map(([id, text]) => [id, fromBase64(text)])),
  };
}
/** JSON storage envelope retains original channel byte strings; no float conversion occurs. */
export function serializeTerrainFieldTile(
  descriptor: TerrainFieldDescriptor,
  input: TerrainFieldTile,
): string {
  return JSON.stringify(validateTerrainFieldTile(descriptor, input));
}
export function parseTerrainFieldTile(descriptor: TerrainFieldDescriptor, text: string): TerrainFieldTile {
  if (text.length > (TERRAIN_FIELD_TILE_MAX_BYTES * 4) / 3 + 8192)
    throw new RangeError('Stored field tile is too large');
  return validateTerrainFieldTile(descriptor, JSON.parse(text) as unknown);
}
/** Endianness-independent convenience for a newly authored numeric Float32 channel. */
export function terrainFieldFloat32Bytes(values: Float32Array): Uint8Array {
  const bytes = new Uint8Array(values.length * 4),
    view = new DataView(bytes.buffer);
  for (let i = 0; i < values.length; i++) view.setFloat32(i * 4, values[i]!, true);
  return bytes;
}

/** In-memory lazy tile foundation; persistence/version/auth/command wiring are a later slice. */
export class TerrainFieldStore {
  readonly #descriptor: TerrainFieldDescriptor;
  readonly #tiles = new Map<string, TerrainFieldTile>();
  readonly #decoded = new Map<string, Map<string, DataView>>();
  readonly #channels: ReadonlyMap<string, TerrainFieldChannel>;
  #revision = 0;
  constructor(descriptor: TerrainFieldDescriptor) {
    this.#descriptor = TerrainFieldDescriptor.parse(descriptor);
    this.#channels = new Map(this.#descriptor.channels.map((channel) => [channel.id, channel]));
  }
  get descriptor(): TerrainFieldDescriptor {
    return TerrainFieldDescriptor.parse(this.#descriptor);
  }
  get revision(): number {
    return this.#revision;
  }
  get tileCount(): number {
    return this.#tiles.size;
  }
  get complete(): boolean {
    return (
      this.tileCount ===
      Math.ceil(this.#descriptor.width / TERRAIN_FIELD_TILE_SIZE) *
        Math.ceil(this.#descriptor.height / TERRAIN_FIELD_TILE_SIZE)
    );
  }
  getTile(tx: number, tz: number): TerrainFieldTile | null {
    const tile = this.#tiles.get(terrainFieldTileKey(this.#descriptor, tx, tz));
    return tile ? TerrainFieldTile.parse(tile) : null;
  }
  /** Scalar access never exposes mutable storage bytes. Decode validated channels once, on demand. */
  readValue(channelId: string, col: number, row: number): number | null {
    const channel = this.#channels.get(channelId);
    if (
      !channel ||
      !Number.isInteger(col) ||
      !Number.isInteger(row) ||
      col < 0 ||
      row < 0 ||
      col >= this.#descriptor.width ||
      row >= this.#descriptor.height
    )
      return null;
    const tx = Math.floor(col / TERRAIN_FIELD_TILE_SIZE);
    const tz = Math.floor(row / TERRAIN_FIELD_TILE_SIZE);
    const key = `f:${this.#descriptor.id}:${tx},${tz}`;
    const tile = this.#tiles.get(key);
    if (!tile) return null;
    let channels = this.#decoded.get(key);
    if (!channels) {
      channels = new Map();
      this.#decoded.set(key, channels);
    }
    let view = channels.get(channelId);
    if (!view) {
      const bytes = decodeStoredChannel(tile.channels[channelId]!);
      view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      channels.set(channelId, view);
    }
    const index = (row - tz * TERRAIN_FIELD_TILE_SIZE) * tile.cols + col - tx * TERRAIN_FIELD_TILE_SIZE;
    return channel.encoding === 'u8' ? view.getUint8(index) : view.getFloat32(index * 4, true);
  }
  /** Lossless raw row into caller-owned Float64 storage. Invalid/missing input leaves target untouched. */
  readRow(channelId: string, row: number, startCol: number, target: Float64Array): boolean {
    const channel = this.#channels.get(channelId);
    if (
      !channel ||
      !Number.isInteger(row) ||
      row < 0 ||
      row >= this.#descriptor.height ||
      !Number.isInteger(startCol) ||
      startCol < 0 ||
      startCol + target.length > this.#descriptor.width
    )
      return false;
    const tz = Math.floor(row / TERRAIN_FIELD_TILE_SIZE);
    const segments: Array<{ view: DataView; index: number; count: number }> = [];
    let col = startCol;
    while (col < startCol + target.length) {
      const tx = Math.floor(col / TERRAIN_FIELD_TILE_SIZE),
        key = `f:${this.#descriptor.id}:${tx},${tz}`;
      const tile = this.#tiles.get(key);
      if (!tile) return false;
      let channels = this.#decoded.get(key);
      if (!channels) {
        channels = new Map();
        this.#decoded.set(key, channels);
      }
      let view = channels.get(channelId);
      if (!view) {
        const bytes = decodeStoredChannel(tile.channels[channelId]!);
        view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        channels.set(channelId, view);
      }
      const localCol = col - tx * TERRAIN_FIELD_TILE_SIZE;
      const count = Math.min(tile.cols - localCol, startCol + target.length - col);
      segments.push({ view, index: (row - tz * TERRAIN_FIELD_TILE_SIZE) * tile.cols + localCol, count });
      col += count;
    }
    let cursor = 0;
    for (const segment of segments) {
      const { view, index, count } = segment;
      if (channel.encoding === 'u8')
        for (let n = 0; n < count; n++) target[cursor++] = view.getUint8(index + n);
      else for (let n = 0; n < count; n++) target[cursor++] = view.getFloat32((index + n) * 4, true);
    }
    return true;
  }
  /** Shared scalar-read cache; total bytes cannot exceed the loaded raw channel bytes. */
  get decodedByteLength(): number {
    let bytes = 0;
    for (const channels of this.#decoded.values())
      for (const view of channels.values()) bytes += view.byteLength;
    return bytes;
  }
  clearDecodedCache(): void {
    this.#decoded.clear();
  }
  /** Suitable for inverse payloads; expectedRevision guards this store only, not a DB transaction. */
  replace(input: unknown, expectedRevision: number): TerrainFieldTileChange {
    this.#guardRevision(expectedRevision);
    const tile = validateTerrainFieldTile(this.#descriptor, input);
    const key = terrainFieldTileKey(this.#descriptor, tile.tx, tile.tz);
    const previous = this.getTile(tile.tx, tile.tz);
    this.#tiles.set(key, tile);
    this.#decoded.delete(key);
    this.#revision++;
    return { key, previous, revision: this.#revision };
  }
  restore(
    tx: number,
    tz: number,
    previous: TerrainFieldTile | null,
    expectedRevision: number,
  ): TerrainFieldTileChange {
    this.#guardRevision(expectedRevision);
    const key = terrainFieldTileKey(this.#descriptor, tx, tz),
      before = this.getTile(tx, tz);
    const validated = previous ? validateTerrainFieldTile(this.#descriptor, previous) : null;
    if (validated && (validated.tx !== tx || validated.tz !== tz))
      throw new Error('Inverse coordinates mismatch');
    if (validated) this.#tiles.set(key, validated);
    else this.#tiles.delete(key);
    this.#decoded.delete(key);
    this.#revision++;
    return { key, previous: before, revision: this.#revision };
  }
  #guardRevision(expected: number): void {
    if (
      !Number.isSafeInteger(expected) ||
      expected !== this.#revision ||
      this.#revision === Number.MAX_SAFE_INTEGER
    )
      throw new Error('Field revision conflict');
  }
}
