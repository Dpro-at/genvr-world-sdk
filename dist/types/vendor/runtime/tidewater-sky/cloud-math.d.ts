/** Tidewater / sky-pro partly-cloudy preset. Distances are metres, optical density is m^-1. */
export declare const CLOUD_PRESET: Readonly<{
    altitude: 4000;
    thickness: 5200;
    density: 0.019;
    coverage: 0.49;
    weatherScale: 29000;
    baseScale: 7500;
    baseStrength: 0.69;
    erosionScale: 0.13;
    erosionBase: 0.24;
    erosionPeak: 2.15;
    edgeSoftness: 0.095;
    windSpeed: 12;
    evolutionSpeed: number;
    windSkew: 1750;
    maxSteps: 256;
    lightTaps: 6;
    stepMeters: 25;
    historyWeight: 0.9;
    panoramaWidth: 512;
    panoramaHeight: 160;
    shadowResolution: 256;
    shadowSize: 12000;
    shadowStrength: 0.85;
}>;
export type CloudVector = readonly [number, number, number];
export declare const cloudSmoothstep: (a: number, b: number, x: number) => number;
/** Stable shell intersection from Tidewater scShellRoots (avoids cancellation near the surface). */
export declare function cloudShellRoots(directionY: number, altitude: number, originHeight: number): [number, number];
export declare function cloudInterval(directionY: number, originHeight: number): [number, number];
export declare function cloudPhase(mu: number, g: number): number;
export declare function cloudPhases(mu: number): CloudVector;
/** Three orders of multiple scattering: asymmetry and optical depth halve on each order. */
export declare function cloudLightEnergy(opticalDepth: number, mu: number): number;
export declare function cloudLattice(frame: number): [number, number];
/** Exact density shape, given the procedural weather and Perlin-Worley RGB samples. */
export declare function cloudDensity(height: number, weather: number, base: CloudVector, detail: CloudVector, coverage?: number): number;
