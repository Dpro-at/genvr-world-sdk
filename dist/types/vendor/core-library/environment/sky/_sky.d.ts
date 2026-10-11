import type { GenvrManifest, SkyPreset } from '../../../contracts/index.js';
/** Physical sky of the Realistic style (P2-36): air, haze, clouds, and camera exposure. */
export interface PhysicalSkyLook {
    /** Haze in the air: 2 is clear, 10 hazy. */
    turbidity: number;
    /** How blue the air scatters. */
    rayleigh: number;
    /** Glow around the sun. */
    mie: number;
    /** 0 no clouds, 1 overcast. */
    cloudCoverage: number;
    /** How solid the clouds are. */
    cloudDensity: number;
    /** Camera exposure under tone mapping. */
    exposure: number;
}
/** Colors and light of a sky (hex colors as numbers). */
export interface SkyLook {
    skyTop: number;
    skyHorizon: number;
    fog: number;
    sun: {
        color: number;
        intensity: number;
        elevationDeg: number;
        azimuthDeg: number;
    };
    ambient: {
        sky: number;
        ground: number;
        intensity: number;
    };
    /** How the Realistic style draws this sky (styles lit by the sky, P2-36). */
    physical: PhysicalSkyLook;
    /** Tidewater atmosphere defaults; time and wind may be overridden by world sky params. */
    tidewater?: {
        timeOfDay: number;
        sunAzimuth: number;
        exposure: number;
        windDirection: number;
        windSpeed: number;
    };
}
export interface SkyItem {
    manifest: GenvrManifest;
    /** The world's `environment.sky.preset` this item stands for. */
    preset: SkyPreset;
    look: SkyLook;
}
/** One sky; the file lives at `environment/sky/<preset>.ts` (id `genvr.core.sky.<preset>`). */
export declare function defineSky(sky: {
    preset: SkyPreset;
    name: string;
    look: SkyLook;
}): SkyItem;
