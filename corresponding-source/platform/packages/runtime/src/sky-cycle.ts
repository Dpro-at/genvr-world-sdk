import { readSkySettings, type SkyPreset } from '@genvr/contracts';
import { getSky, type SkyLook } from '@genvr/core-library';
import { sunDirection, sunLight } from './tidewater-sky/atmosphere-math.js';

export type Direction = [number, number, number];

/** What the sky shows at one moment: colors, where the light comes from, and how dark it is. */
export interface SkyState {
  look: SkyLook;
  /** Direction toward the light that casts shadows: the sun by day, the moon by night. */
  light: Direction;
  /** Share of the light's strength (it fades out while the light hands over from sun to moon). */
  lightShare: number;
  /** 0 by day, 1 at full night (stars). */
  night: number;
  /** Direction toward the moon while it is up, else null. */
  moon: Direction | null;
  /** Direction toward the sun where it really is, below the horizon at night (physical sky, P2-36). */
  sun: Direction;
  /** Which sky it is closest to (world sounds: birds by day, crickets at night). */
  phase: SkyPreset;
}

/** Highest the sun climbs at noon in the cycle (degrees). */
const NOON = 65;
/** Sun above this is full day; between 0 and this the light turns to sunset colors. */
const DAY_FROM = 15;
/** Sun below this is full night; between this and 0 dusk turns to night. */
const NIGHT_FROM = -10;
/** Where the light hands over from the sun to the moon (degrees of sun elevation). */
const HANDOVER = -5;
/** Lowest a light casts from, so shadows never lie flat along the ground (degrees). */
const MIN_LIGHT = 6;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

function direction(elevationDeg: number, azimuthDeg: number): Direction {
  const e = toRadians(elevationDeg);
  const a = toRadians(azimuthDeg);
  return [Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)];
}

function mixColor(a: number, b: number, t: number): number {
  const channel = (shift: number) =>
    Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t) << shift;
  return channel(16) | channel(8) | channel(0);
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

function mixLook(a: SkyLook, b: SkyLook, t: number): SkyLook {
  return {
    skyTop: mixColor(a.skyTop, b.skyTop, t),
    skyHorizon: mixColor(a.skyHorizon, b.skyHorizon, t),
    fog: mixColor(a.fog, b.fog, t),
    sun: {
      color: mixColor(a.sun.color, b.sun.color, t),
      intensity: mix(a.sun.intensity, b.sun.intensity, t),
      elevationDeg: mix(a.sun.elevationDeg, b.sun.elevationDeg, t),
      azimuthDeg: mix(a.sun.azimuthDeg, b.sun.azimuthDeg, t),
    },
    ambient: {
      sky: mixColor(a.ambient.sky, b.ambient.sky, t),
      ground: mixColor(a.ambient.ground, b.ambient.ground, t),
      intensity: mix(a.ambient.intensity, b.ambient.intensity, t),
    },
    physical: {
      turbidity: mix(a.physical.turbidity, b.physical.turbidity, t),
      rayleigh: mix(a.physical.rayleigh, b.physical.rayleigh, t),
      mie: mix(a.physical.mie, b.physical.mie, t),
      cloudCoverage: mix(a.physical.cloudCoverage, b.physical.cloudCoverage, t),
      cloudDensity: mix(a.physical.cloudDensity, b.physical.cloudDensity, t),
      exposure: mix(a.physical.exposure, b.physical.exposure, t),
    },
  };
}

/**
 * Time of day in a day-night cycle (P2-02): 0 is midnight, 0.25 sunrise, 0.5 noon, 0.75
 * sunset. It comes from the wall clock, so everyone in a place sees the same time without the
 * room sending it.
 */
export function timeOfDay(nowMs: number, cycleMinutes: number): number {
  const length = cycleMinutes * 60_000;
  return (((nowMs % length) + length) % length) / length;
}

/** The sky of a fixed preset (no cycle). */
export function presetSky(preset: SkyPreset, params?: Readonly<Record<string, unknown>>): SkyState {
  const { look } = getSky(preset);
  if (look.tidewater) {
    const settings = readSkySettings(params);
    const sun = sunDirection(
      settings.timeOfDay ?? look.tidewater.timeOfDay,
      settings.sunAzimuth ?? look.tidewater.sunAzimuth,
    );
    const key = sunLight(sun);
    return {
      look,
      light: key.direction,
      lightShare: 1,
      night: key.night,
      moon: key.night > 0 ? key.moon : null,
      sun,
      phase: preset,
    };
  }
  const light = direction(look.sun.elevationDeg, look.sun.azimuthDeg);
  const night = preset === 'night' ? 1 : 0;
  // At night the light is the moon's; the sun stands on the other side, under the horizon.
  const sun: Direction = night ? [-light[0], -light[1], -light[2]] : light;
  return { look, light, lightShare: 1, night, moon: night ? light : null, sun, phase: preset };
}

/**
 * The sky at a time of day in the cycle: the sun rises, climbs to 65° at noon, and sets on the
 * other side; colors go from night through sunset to day and back; the moon stands opposite
 * the sun and lights the night.
 */
export function cycleSky(time: number): SkyState {
  const elevation = NOON * Math.sin(2 * Math.PI * (time - 0.25));
  const azimuth = 360 * time; // once around the sky per day
  const day = getSky('day').look;
  const sunset = getSky('sunset').look;
  const night = getSky('night').look;
  const look =
    elevation >= DAY_FROM
      ? day
      : elevation >= 0
        ? mixLook(sunset, day, elevation / DAY_FROM)
        : elevation >= NIGHT_FROM
          ? mixLook(night, sunset, (elevation - NIGHT_FROM) / -NIGHT_FROM)
          : night;
  const sunUp = elevation >= HANDOVER;
  const light = sunUp
    ? direction(Math.max(elevation, MIN_LIGHT), azimuth)
    : direction(Math.max(-elevation, MIN_LIGHT), azimuth + 180);
  return {
    look,
    light,
    lightShare: clamp01(Math.abs(elevation - HANDOVER) / 5),
    night: clamp01(elevation / NIGHT_FROM),
    moon: -elevation > -3 ? direction(-elevation, azimuth + 180) : null,
    sun: direction(elevation, azimuth),
    phase: elevation >= DAY_FROM ? 'day' : elevation >= NIGHT_FROM ? 'sunset' : 'night',
  };
}
