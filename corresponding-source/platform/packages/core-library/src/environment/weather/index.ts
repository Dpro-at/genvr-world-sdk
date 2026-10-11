import clear from './clear.js';
import rain from './rain.js';
import snow from './snow.js';
import storm from './storm.js';
import fog from './fog.js';
import sandstorm from './sandstorm.js';
import type { WeatherItem } from './_weather.js';

export * from './_weather.js';

/** Every Core weather, in picker order (one file per weather). */
export const CORE_WEATHER: readonly WeatherItem[] = [clear, rain, snow, storm, fog, sandstorm];

/** The weather item of a world's weather preset. */
export const getWeather = (preset: WeatherItem['preset']): WeatherItem =>
  CORE_WEATHER.find((weather) => weather.preset === preset)!;
