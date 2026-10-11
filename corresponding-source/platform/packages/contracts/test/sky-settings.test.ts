import { describe, expect, it } from 'vitest';
import { readSkySettings } from '../src/index.js';

describe('sky settings in sky params (Tidewater world, task 2)', () => {
  it('reads the time of day, sun azimuth and wind', () => {
    expect(
      readSkySettings({ timeOfDay: 16.2, sunAzimuth: 0, windDirection: 200.5, windSpeed: 7, cycle: 20 }),
    ).toEqual({ timeOfDay: 16.2, sunAzimuth: 0, windDirection: 200.5, windSpeed: 7, cycle: 20 });
  });

  it('drops values that are not valid and keys it does not know', () => {
    expect(readSkySettings({ timeOfDay: 30, windSpeed: 'fast', other: 1 })).toEqual({});
    expect(readSkySettings(undefined)).toEqual({});
  });
});
