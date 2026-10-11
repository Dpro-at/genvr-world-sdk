import type { GenvrManifest, WeatherPreset } from '@genvr/contracts';
import { ALL_STYLES, coreManifest } from '../../manifest.js';

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
export function defineWeather(weather: {
  preset: WeatherPreset;
  name: string;
  look: WeatherLook;
}): WeatherItem {
  return {
    manifest: coreManifest({
      id: `genvr.core.weather.${weather.preset}`,
      name: weather.name,
      type: 'environment',
      category: 'environment',
      subcategory: 'weather',
      styles: ALL_STYLES,
    }),
    preset: weather.preset,
    look: weather.look,
  };
}

/** Clear air: the base every weather changes. */
export const CLEAR: WeatherLook = {
  particles: 'none',
  count: 0,
  fall: 0,
  wind: 0,
  particleColor: 0xffffff,
  fogNear: 60,
  fogScale: 1,
  light: 1,
  lightning: false,
};
