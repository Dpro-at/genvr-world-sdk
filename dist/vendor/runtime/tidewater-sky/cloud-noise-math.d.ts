/** Deterministic reference for Tidewater's periodic gradient weather field (MIT; LICENSE-tidewater.md). */
export declare function cloudHash(cell: readonly number[]): number[];
export declare function cloudPerlin(p: readonly number[], period: number): number;
export declare function cloudWeather(u: number, v: number): number;
/** Inverted nearest-feature distance, periodic in every axis. */
export declare function cloudWorley(p: readonly number[], cells: number): number;
export declare function cloudShape(p: readonly number[]): number[];
/** Tileable high-pass blue-noise dither; removes the local low-frequency component. */
export declare function cloudBlue(x: number, y: number): number;
