/** Tidewater4811ba48 MIT: exact CPU terrain noise and filtering helpers. */
export declare function hash2(i: number, j: number, s: number): number;
export declare const softRamp: (x: number, k: number) => number;
export declare const EROSION: {
    octaves: number;
    cell: number;
    amp: number;
    gain: number;
    lac: number;
    slope: number;
    branch: number;
    maxSlope: number;
};
export declare function erosionNoise(x: number, z: number, gx: number, gz: number, octaves?: number, cell0?: number, amp0?: number): number;
export declare function sampleGrid(g: Float32Array, n: number, o: number, t: number, x: number, z: number): number;
export declare function upsample2(src: Float32Array, n: number, cubic?: boolean): Float32Array<ArrayBuffer>;
export declare function boxBlur(src: Float32Array, w: number, h: number, r: number, out?: Float32Array<ArrayBuffer>): Float32Array<ArrayBuffer>;
