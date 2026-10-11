import { DataArrayTexture } from 'three/webgpu';
/** Reads an image file into RGBA bytes (the browser decodes; tests pass their own). */
export type ReadPixels = (url: string, size: number) => Promise<Uint8Array>;
/** Decodes an opaque image with the browser (the maps have no alpha, so nothing is premultiplied). */
export declare const browserPixels: ReadPixels;
/**
 * The realistic ground's textures (P2-37): two texture arrays (color, surface) holding only the
 * materials a place uses, at 1024 on computers and 512 on phones. A layer shows flat grey until its
 * files arrive, so the ground never waits on the network to appear.
 */
export declare class GroundTextures {
    #private;
    private readonly read;
    color: DataArrayTexture;
    surface: DataArrayTexture;
    constructor(read?: ReadPixels);
    get names(): readonly string[];
    /** Meters each layer's texture covers. */
    get tiles(): number[];
    /** True when these layers at this size are already loaded or loading. */
    holds(names: readonly string[], size: 1024 | 512): boolean;
    /**
     * Makes new arrays for these materials (the old ones stay valid for materials still using them
     * until `onReady`), then fills each layer as its files arrive.
     */
    load(names: readonly string[], size: 1024 | 512, onLayer: () => void): void;
    dispose(): void;
}
