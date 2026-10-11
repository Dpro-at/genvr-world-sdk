import { getGround, type GroundMaterial } from '@genvr/core-library';
import {
  DataArrayTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three/webgpu';

/** Reads an image file into RGBA bytes (the browser decodes; tests pass their own). */
export type ReadPixels = (url: string, size: number) => Promise<Uint8Array>;

/** Decodes an opaque image with the browser (the maps have no alpha, so nothing is premultiplied). */
export const browserPixels: ReadPixels = async (url, size) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  const bitmap = await createImageBitmap(await response.blob(), { colorSpaceConversion: 'none' });
  const canvas = new OffscreenCanvas(size, size);
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.drawImage(bitmap, 0, 0, size, size);
  bitmap.close();
  return new Uint8Array(context.getImageData(0, 0, size, size).data.buffer);
};

function arrayTexture(layers: number, size: number, color: boolean): DataArrayTexture {
  const texture = new DataArrayTexture(new Uint8Array(size * size * 4 * layers), size, size, layers);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  texture.colorSpace = color ? SRGBColorSpace : NoColorSpace;
  return texture;
}

/**
 * The realistic ground's textures (P2-37): two texture arrays (color, surface) holding only the
 * materials a place uses, at 1024 on computers and 512 on phones. A layer shows flat grey until its
 * files arrive, so the ground never waits on the network to appear.
 */
export class GroundTextures {
  color: DataArrayTexture;
  surface: DataArrayTexture;
  #names: string[] = [];
  #size: 1024 | 512 = 1024;
  #loading = 0;

  constructor(private readonly read: ReadPixels = browserPixels) {
    this.color = arrayTexture(1, 4, true);
    this.surface = arrayTexture(1, 4, false);
  }

  get names(): readonly string[] {
    return this.#names;
  }

  /** Meters each layer's texture covers. */
  get tiles(): number[] {
    return this.#names.map((name) => getGround(name)?.tile ?? 3);
  }

  /** True when these layers at this size are already loaded or loading. */
  holds(names: readonly string[], size: 1024 | 512): boolean {
    return (
      size === this.#size &&
      names.length === this.#names.length &&
      names.every((n, i) => n === this.#names[i])
    );
  }

  /**
   * Makes new arrays for these materials (the old ones stay valid for materials still using them
   * until `onReady`), then fills each layer as its files arrive.
   */
  load(names: readonly string[], size: 1024 | 512, onLayer: () => void): void {
    this.#names = [...names];
    this.#size = size;
    const run = ++this.#loading;
    this.color = arrayTexture(names.length, size, true);
    this.surface = arrayTexture(names.length, size, false);
    const layerBytes = size * size * 4;
    // Mid grey color and a flat normal until the files arrive.
    (this.color.image.data as Uint8Array).fill(128);
    const surface = this.surface.image.data as Uint8Array;
    for (let i = 0; i < surface.length; i += 4) surface.set([128, 128, 230, 255], i);
    names.forEach((name, layer) => {
      const material: GroundMaterial | undefined = getGround(name);
      const imageMaterial = material?.procedural ? getGround(material.procedural.fallback) : material;
      const files = imageMaterial?.files.find((f) => f.size === size) ?? imageMaterial?.files[0];
      if (!files) return;
      void Promise.all([this.read(files.color, size), this.read(files.surface, size)])
        .then(([color, surfaceBytes]) => {
          if (run !== this.#loading) return;
          (this.color.image.data as Uint8Array).set(color, layer * layerBytes);
          (this.surface.image.data as Uint8Array).set(surfaceBytes, layer * layerBytes);
          this.color.addLayerUpdate(layer);
          this.surface.addLayerUpdate(layer);
          this.color.needsUpdate = true;
          this.surface.needsUpdate = true;
          onLayer();
        })
        .catch((error: unknown) => console.warn(`Ground material ${name} did not load:`, error));
    });
  }

  dispose(): void {
    this.#loading += 1;
    this.color.dispose();
    this.surface.dispose();
  }
}
