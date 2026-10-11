import { describe, expect, it } from 'vitest';
import {
  ATMO_RG,
  ATMO_RT,
  atmosphereMedium,
  moonDirection,
  nightFactor,
  raySphereNearest,
  SUN_ILLUMINANCE,
  sunDirection,
  sunDirectionFromTime,
  sunLight,
  TRANSMITTANCE_SIZE,
  transmittance,
  transmittanceTexel,
  transmittanceUV,
} from '../src/tidewater-sky/atmosphere-math.js';

const deg = (rad: number) => (rad * 180) / Math.PI;

describe('Tidewater atmosphere on the CPU (world plan task 3)', () => {
  it('transmits outward rays at the atmosphere boundary without losing inward paths', () => {
    expect(transmittance(ATMO_RT, 1)).toEqual([1, 1, 1]);
    const inward = transmittance(ATMO_RT, -0.15);
    expect(inward.every((channel) => Number.isFinite(channel) && channel <= 1)).toBe(true);
    expect(inward[2]).toBeLessThan(0.999);
  });
  it('keeps the planet, the illuminance and the LUT sizes of Atmosphere.js', () => {
    expect(ATMO_RG).toBe(6360);
    expect(ATMO_RT).toBe(6460);
    expect(SUN_ILLUMINANCE).toBe(11);
    expect(TRANSMITTANCE_SIZE).toEqual([256, 64]);
  });

  it('the medium at sea level: Rayleigh, Mie and no ozone', () => {
    const m = atmosphereMedium(0);
    expect(m.rayScat[0]!).toBeCloseTo(5.802e-3, 9);
    expect(m.rayScat[2]!).toBeCloseTo(33.1e-3, 9);
    expect(m.mieScat).toBeCloseTo(3.996e-3, 9);
    // extinction = rayleigh + mie extinction (+ ozone, none below 10 km)
    expect(m.extinction[1]!).toBeCloseTo(13.558e-3 + 4.44e-3, 9);
    // the ozone tent peaks at 25 km
    expect(atmosphereMedium(25).extinction[1]! - atmosphereMedium(25).scattering[1]!).toBeGreaterThan(1.8e-3);
  });

  it('ray against sphere: the top of the atmosphere straight up is 100 km away', () => {
    expect(raySphereNearest([0, ATMO_RG, 0], [0, 1, 0], ATMO_RT)).toBeCloseTo(100, 6);
    expect(raySphereNearest([0, ATMO_RG + 1, 0], [0, 1, 0], ATMO_RG)).toBe(-1);
  });

  it('transmittance straight up is high, toward the horizon low and red-shifted', () => {
    const up = transmittance(ATMO_RG + 0.002, 1);
    const flat = transmittance(ATMO_RG + 0.002, 0);
    for (let c = 0; c < 3; c += 1) expect(up[c]!).toBeGreaterThan(flat[c]!);
    expect(up[2]).toBeGreaterThan(0.6);
    expect(up[2]).toBeLessThan(up[0]);
    expect(flat[2]).toBeLessThan(0.05);
    expect(flat[0]).toBeGreaterThan(flat[2]);
  });

  it('a transmittance texel is the integral at its own (r, mu): zenith texel (0, 0), horizon texel (255, 0)', () => {
    const zenith = transmittanceTexel(0, 0);
    expect(zenith.r).toBeCloseTo(ATMO_RG, 3);
    expect(zenith.mu).toBeCloseTo(1, 3);
    const horizon = transmittanceTexel(255, 0);
    expect(horizon.mu).toBeCloseTo(0, 2);
    // the uv mapping takes (r, mu) back to the texel centre
    const [u, v] = transmittanceUV(zenith.r, zenith.mu);
    expect(u * 257 - 0.5).toBeCloseTo(0, 1);
    expect(v * 65 - 0.5).toBeCloseTo(0, 1);
  });

  it('sunDirectionFromTime(16.2) stands about 27 degrees high in the west (Sky.js 258-268)', () => {
    const d = sunDirectionFromTime(16.2);
    expect(deg(Math.asin(d[1]))).toBeCloseTo(27.06, 1);
    expect(d[0]).toBeLessThan(-0.8); // west is -x
    expect(Math.hypot(...d)).toBeCloseTo(1, 9);
    // noon: highest; midnight: below the horizon
    expect(sunDirectionFromTime(12)[1]).toBeGreaterThan(d[1]);
    expect(sunDirectionFromTime(0)[1]).toBeLessThan(0);
  });

  it('sun_azimuth turns the daily path about the vertical', () => {
    const base = sunDirection(16.2, 0);
    const turned = sunDirection(16.2, 90);
    expect(turned[1]).toBeCloseTo(base[1], 9);
    expect(Math.hypot(turned[0], turned[2])).toBeCloseTo(Math.hypot(base[0], base[2]), 9);
    expect(Math.abs(turned[0] - base[0]) + Math.abs(turned[2] - base[2])).toBeGreaterThan(0.5);
  });

  it('sunlight: illuminance times the transmittance by day, the moon by night (App.js applyAtmosphereReadback)', () => {
    const day = sunLight(sunDirectionFromTime(16.2));
    expect(day.night).toBe(0);
    expect(day.color[0]).toBeGreaterThan(day.color[2]);
    expect(day.color[0]).toBeLessThan(SUN_ILLUMINANCE);
    expect(day.color[0]).toBeGreaterThan(SUN_ILLUMINANCE * 0.5);
    const night = sunLight(sunDirectionFromTime(1));
    expect(night.night).toBeGreaterThan(0.9);
    expect(night.color[2]).toBeCloseTo(0.12 * night.night, 6);
    expect(night.direction[1]).toBeGreaterThan(0); // the moon is up as the key light
    expect(nightFactor(-0.5)).toBe(1);
    expect(nightFactor(0.3)).toBe(0);
    expect(moonDirection([0.5, -0.5, 0.2])[1]).toBeGreaterThan(0);
  });
});
