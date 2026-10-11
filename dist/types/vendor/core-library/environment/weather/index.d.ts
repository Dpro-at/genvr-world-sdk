import type { WeatherItem } from './_weather.js';
export * from './_weather.js';
/** Every Core weather, in picker order (one file per weather). */
export declare const CORE_WEATHER: readonly WeatherItem[];
/** The weather item of a world's weather preset. */
export declare const getWeather: (preset: WeatherItem["preset"]) => WeatherItem;
