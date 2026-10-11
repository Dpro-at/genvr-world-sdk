/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { DataTexture } from 'three';
export declare function decodePNG(buffer: ArrayBuffer): Promise<{
    width: number;
    height: number;
    data: Uint8Array<ArrayBuffer>;
}>;
/** Decoded RGBA8 image as a three.js texture (sRGB colour for the albedo, linear data otherwise). */
export declare function whaleTexture(img: {
    width: number;
    height: number;
    data: Uint8Array;
}, srgb: boolean, label?: string): DataTexture;
export declare function loadTexture(url: string, srgb: boolean): Promise<DataTexture>;
