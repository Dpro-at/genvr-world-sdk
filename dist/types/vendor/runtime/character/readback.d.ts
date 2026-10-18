/** GPU readbacks may align rows to 256 bytes. Canvas ImageData always needs tightly packed rows. */
export declare function previewRGBA(source: Uint8Array, width: number, height: number, flipY?: boolean): Uint8ClampedArray<ArrayBuffer>;
