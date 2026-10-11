/**
 * Small deterministic helpers for the sea-life generators (SEALIFE-01). Own code; the same seed always gives the
 * same numbers on every device, so a placed copy looks the same for every player.
 */
/** mulberry32: a fast 32-bit generator returning numbers in [0, 1). */
export declare function mulberry32(seed: number): () => number;
/** A seeded random source with range helpers. `salt` separates the streams of different item kinds. */
export declare function seeded(seed: number, salt: number): {
    next: () => number;
    range: (min: number, max: number) => number;
    int: (min: number, max: number) => number;
};
export type Seeded = ReturnType<typeof seeded>;
/** A stable hash of a 3D point to [0, 1) (colour variation that does not depend on build order). */
export declare function hash3(x: number, y: number, z: number): number;
export declare const clamp: (value: number, min: number, max: number) => number;
export declare const smoothstep: (edge0: number, edge1: number, x: number) => number;
export declare const mix: (a: number, b: number, t: number) => number;
/** A number parameter read defensively (generators also run on old or bad data). */
export declare function numberParam(params: Readonly<Record<string, unknown>>, key: string, fallback: number, min: number, max: number): number;
/** A string parameter limited to its listed values. */
export declare function choiceParam<T extends string>(params: Readonly<Record<string, unknown>>, key: string, values: readonly T[], fallback: T): T;
