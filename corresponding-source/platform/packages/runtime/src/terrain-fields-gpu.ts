import { TERRAIN_FIELD_TILE_SIZE, type TerrainFieldDescriptor } from '@genvr/contracts';
import { decodeTerrainFieldTile, type TerrainFieldStore } from '@genvr/world';
import { DataTexture, FloatType, NearestFilter, RedFormat, TSL, UnsignedByteType } from 'three/webgpu';

/* eslint-disable @typescript-eslint/no-explicit-any -- TSL's dynamic node graph API. */
type Node = any;
const t = TSL as Node;
const DEFER_SNAPSHOT = Symbol('defer terrain snapshot');
type FieldArrays = Map<string, Float32Array | Uint8Array>;
export interface TerrainFieldTexturePreparation {
  signal?: AbortSignal;
  /** Schedule a browser task, not just a microtask, to keep input/rendering responsive. */
  yieldControl?: () => Promise<void>;
}

/** An explicit, complete GPU snapshot. Staged persistence never activates it implicitly. */
export class TerrainFieldTextures {
  readonly descriptor: TerrainFieldDescriptor;
  readonly channels: readonly string[];
  readonly textures = new Map<string, DataTexture>();
  readonly byteLength: number;
  #revision = -1;
  #disposed = false;
  #preparing = false;

  constructor(
    readonly store: TerrainFieldStore,
    channels: readonly string[] = store.descriptor.channels.map((c) => c.id),
    defer?: typeof DEFER_SNAPSHOT,
  ) {
    this.descriptor = store.descriptor;
    if (
      !channels.length ||
      new Set(channels).size !== channels.length ||
      channels.some((id) => !this.descriptor.channels.some((c) => c.id === id))
    )
      throw new RangeError('Choose unique declared terrain field channels');
    this.channels = Object.freeze([...channels]);
    this.byteLength =
      this.descriptor.width *
      this.descriptor.height *
      this.channels.reduce(
        (sum, id) => sum + (this.descriptor.channels.find((c) => c.id === id)!.encoding === 'f32le' ? 4 : 1),
        0,
      );
    if (defer !== DEFER_SNAPSHOT) this.refresh();
  }

  /** Never returns a partially prepared snapshot. GPU upload still occurs on first render. */
  static async createAsync(
    store: TerrainFieldStore,
    channels: readonly string[] = store.descriptor.channels.map((c) => c.id),
    options: TerrainFieldTexturePreparation = {},
  ): Promise<TerrainFieldTextures> {
    const snapshot = new TerrainFieldTextures(store, channels, DEFER_SNAPSHOT);
    try {
      await snapshot.refreshAsync(options);
      return snapshot;
    } catch (error) {
      snapshot.dispose();
      throw error;
    }
  }

  get revision(): number {
    return this.#revision;
  }

  /** Validate/build all new arrays before swapping textures. Failed refresh retains the old snapshot. */
  refresh(): boolean {
    if (this.#preparing) throw new Error('Terrain field snapshot preparation already in progress');
    const work = this.#prepare();
    for (;;) {
      const next = work.next();
      if (next.done) return next.value;
    }
  }

  /** One bounded source tile per task; all old textures remain usable until the final swap. */
  async refreshAsync(options: TerrainFieldTexturePreparation = {}): Promise<boolean> {
    if (this.#preparing) throw new Error('Terrain field snapshot preparation already in progress');
    this.#preparing = true;
    const revision = this.store.revision;
    const check = () => {
      options.signal?.throwIfAborted();
      if (this.#disposed) throw new Error('Terrain field textures are disposed');
      if (revision !== this.store.revision)
        throw new Error('Terrain fields changed while building GPU snapshot');
    };
    const work = this.#prepare();
    try {
      check();
      for (;;) {
        const next = work.next();
        if (next.done) return next.value;
        await (options.yieldControl?.() ?? new Promise<void>((resolve) => setTimeout(resolve, 0)));
        check();
      }
    } finally {
      work.return(false);
      this.#preparing = false;
    }
  }

  *#prepare(): Generator<void, boolean, void> {
    if (this.#disposed) throw new Error('Terrain field textures are disposed');
    if (this.#revision === this.store.revision) return false;
    if (!this.store.complete) throw new Error('A GPU field snapshot requires every tile');
    const revision = this.store.revision;
    const d = this.descriptor;
    const arrays: FieldArrays = new Map(
      this.channels.map((id) => [
        id,
        d.channels.find((c) => c.id === id)!.encoding === 'f32le'
          ? new Float32Array(d.width * d.height)
          : new Uint8Array(d.width * d.height),
      ]),
    );
    for (let tz = 0; tz * TERRAIN_FIELD_TILE_SIZE < d.height; tz++) {
      for (let tx = 0; tx * TERRAIN_FIELD_TILE_SIZE < d.width; tx++) {
        const tile = this.store.getTile(tx, tz);
        if (!tile) throw new Error('Missing terrain field tile');
        const raw = decodeTerrainFieldTile(d, tile);
        for (const id of this.channels) {
          const target = arrays.get(id)!;
          const bytes = raw.channels[id]!;
          const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
          for (let row = 0; row < tile.rows; row++) {
            const offset = (tz * TERRAIN_FIELD_TILE_SIZE + row) * d.width + tx * TERRAIN_FIELD_TILE_SIZE;
            for (let col = 0; col < tile.cols; col++) {
              const index = row * tile.cols + col;
              target[offset + col] =
                target instanceof Float32Array ? view.getFloat32(index * 4, true) : bytes[index]!;
            }
          }
        }
        yield;
      }
    }
    if (revision !== this.store.revision)
      throw new Error('Terrain fields changed while building GPU snapshot');
    for (const [id, data] of arrays) {
      const existing = this.textures.get(id);
      if (existing) existing.image = { data, width: d.width, height: d.height };
      else {
        const texture = new DataTexture(
          data,
          d.width,
          d.height,
          RedFormat,
          data instanceof Float32Array ? FloatType : UnsignedByteType,
        );
        texture.name = `terrain-field:${d.id}:${id}`;
        texture.minFilter = texture.magFilter = NearestFilter;
        texture.generateMipmaps = false;
        texture.unpackAlignment = 1;
        this.textures.set(id, texture);
      }
      this.textures.get(id)!.needsUpdate = true;
    }
    this.#revision = revision;
    return true;
  }

  /** Raw channel units, manual filtering (no float32-filterable feature required).
   * Default clamps to sample centres; supplying outside explicitly selects an out-of-domain value.
   * Height offsets and u8/255 mask normalization belong to the consumer's declared binding.
   */
  sampleNode(
    channel: string,
    xz: Node,
    options: { filter?: 'nearest' | 'bilinear'; outside?: Node } = {},
  ): Node {
    if (this.#disposed) throw new Error('Terrain field textures are disposed');
    const texture = this.textures.get(channel);
    if (!texture) throw new Error(`Field channel ${channel} was not uploaded`);
    const d = this.descriptor,
      shift = d.sampling === 'cell-center' ? 0.5 : 0;
    const fp = xz
      .sub(t.vec2(...d.origin))
      .div(d.spacing)
      .sub(shift);
    const maximum = t.vec2(d.width - 1, d.height - 1);
    const clamped = fp.clamp(t.vec2(0), maximum);
    const read = (p: Node) => {
      const value = t.textureLoad(texture, t.ivec2(p)).r;
      return texture.type === UnsignedByteType ? value.mul(255).round() : value;
    };
    let value: Node;
    if (options.filter === 'nearest') value = read(clamped.add(0.5).floor());
    else {
      const low = clamped.floor(),
        high = low.add(1).min(maximum),
        fraction = clamped.sub(low);
      const a = read(low),
        b = read(t.vec2(high.x, low.y));
      const c = read(t.vec2(low.x, high.y)),
        e = read(high);
      const top = a.mul(t.float(1).sub(fraction.x)).add(b.mul(fraction.x));
      const bottom = c.mul(t.float(1).sub(fraction.x)).add(e.mul(fraction.x));
      value = top.mul(t.float(1).sub(fraction.y)).add(bottom.mul(fraction.y));
    }
    if (options.outside !== undefined) {
      const valid = fp.x
        .greaterThanEqual(0)
        .and(fp.y.greaterThanEqual(0))
        .and(fp.x.lessThanEqual(d.width - 1))
        .and(fp.y.lessThanEqual(d.height - 1));
      return t.select(valid, value, options.outside);
    }
    return value;
  }

  dispose(): void {
    if (this.#disposed) return;
    for (const texture of this.textures.values()) texture.dispose();
    this.textures.clear();
    this.#disposed = true;
  }
}
