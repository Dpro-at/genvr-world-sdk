import type { GenvrManifest, WeatherPreset } from '../../../contracts/index.js';
/** How a weather looks: falling particles around the player, fog, light, and lightning. */
export interface WeatherLook {
    particles: 'none' | 'rain' | 'snow' | 'dust';
    /** Particles around the player at full quality (phones use fewer). */
    count: number;
    /** Meters per second down, and sideways with the wind. */
    fall: number;
    wind: number;
    particleColor: number;
    /** Fog starts at `fogNear` meters; the far end is scaled by `fogScale` (1 = clear air). */
    fogNear: number;
    fogScale: number;
    /** Fog color instead of the sky's (sandstorm). */
    fogColor?: number;
    /** Sun and sky light multiplier (dark storms below 1). */
    light: number;
    lightning: boolean;
}
export interface WeatherItem {
    manifest: GenvrManifest;
    /** The world's `environment.weather.preset` this item stands for. */
    preset: WeatherPreset;
    look: WeatherLook;
}
/** One weather; the file lives at `environment/weather/<preset>.ts` (id `genvr.core.weather.<preset>`). */
export declare function defineWeather(weather: {
    preset: WeatherPreset;
    name: string;
    look: WeatherLook;
}): WeatherItem;
/** Clear air: the base every weather changes. */
export declare const CLEAR: WeatherLook;
