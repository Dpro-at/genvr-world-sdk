/*
 * Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC,
 * MIT (see ./LICENSE-tidewater.md). Sources: src/sky/Atmosphere.js 21-29, 59-96, 232-260 (the medium, the
 * transmittance integral and its LUT parameterization), src/sky/Sky.js 258-268 (sunDirectionFromTime) and
 * src/App.js 441-475 (sun and moon as the key light, the sunlight colour).
 *
 * The CPU side of the physically based sky (Hillaire 2020): the same numbers the TSL compute kernels use
 * (atmosphere.ts), pure and node-testable. Distances in km inside the atmosphere. World: +x east, -z north, +y up.
 */

export type Vec3 = [number, number, number];

export const ATMO_RG = 6360;
export const ATMO_RT = 6460;
/** Sun irradiance outside the atmosphere in scene units (Atmosphere.js `SUN_ILLUMINANCE`). */
export const SUN_ILLUMINANCE = 11;
/** Angular radius of the drawn sun disc (radians), a little larger than the real 0.004675. */
export const SUN_ANGULAR_RADIUS = 0.004675 * 1.15;
/** LUT sizes: transmittance, multiple scattering, sky view. */
export const TRANSMITTANCE_SIZE: readonly [number, number] = [256, 64];
export const MULTISCAT_SIZE = 32;
export const SKYVIEW_SIZE: readonly [number, number] = [192, 108];
/** Steps of the transmittance integral. */
export const TRANSMITTANCE_STEPS = 40;
/** Ground albedo seen from above (Atmosphere.js `groundAlbedo`). */
export const GROUND_ALBEDO: Vec3 = [0.06, 0.08, 0.1];
/** Mie phase asymmetry (Cornette-Shanks). */
export const MIE_G = 0.8;

export interface Medium {
  rayScat: Vec3;
  mieScat: number;
  extinction: Vec3;
  scattering: Vec3;
}

/** Rayleigh, Mie and ozone at a height above the ground in km (Atmosphere.js `atmosphereMedium`). */
export function atmosphereMedium(hKm: number, rayleighScale = 1, mieScale = 1, ozoneScale = 1): Medium {
  const rayDensity = Math.exp(-hKm / 8);
  const mieDensity = Math.exp(-hKm / 1.2);
  const ozoneDensity = Math.max(0, 1 - Math.abs(hKm - 25) / 15);
  const rayScat: Vec3 = [5.802e-3, 13.558e-3, 33.1e-3].map((v) => v * rayDensity * rayleighScale) as Vec3;
  const mieScat = 3.996e-3 * mieDensity * mieScale;
  const mieExt = 4.44e-3 * mieDensity * mieScale;
  const ozone = [0.65e-3, 1.881e-3, 0.085e-3].map((v) => v * ozoneDensity * ozoneScale);
  return {
    rayScat,
    mieScat,
    extinction: [0, 1, 2].map((c) => rayScat[c]! + mieExt + ozone[c]!) as Vec3,
    scattering: [0, 1, 2].map((c) => rayScat[c]! + mieScat) as Vec3,
  };
}

/** Nearest positive distance from `ro` along `rd` to a sphere about the planet's centre, -1 when none. */
export function raySphereNearest(ro: Vec3, rd: Vec3, radius: number): number {
  const b = ro[0] * rd[0] + ro[1] * rd[1] + ro[2] * rd[2];
  const c = ro[0] * ro[0] + ro[1] * ro[1] + ro[2] * ro[2] - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const sq = Math.sqrt(disc);
  const t0 = -b - sq;
  const t1 = -b + sq;
  return t0 > 0 ? t0 : t1 > 0 ? t1 : -1;
}

/** Transmittance from radius `r` (km) toward the top of the atmosphere at zenith cosine `mu` (40 midpoint steps). */
export function transmittance(r: number, mu: number, steps = TRANSMITTANCE_STEPS): Vec3 {
  const ro: Vec3 = [0, r, 0];
  const rd: Vec3 = [Math.sqrt(Math.max(1 - mu * mu, 0)), mu, 0];
  // The outer intersection (including zero at the boundary), rather than the nearest positive root.
  const tMax = Math.max(0, -r * mu + Math.sqrt(Math.max(0, r * r * (mu * mu - 1) + ATMO_RT * ATMO_RT)));
  const dt = tMax / steps;
  const od: Vec3 = [0, 0, 0];
  for (let i = 0; i < steps; i += 1) {
    const t = (i + 0.5) * dt;
    const p: Vec3 = [ro[0] + rd[0] * t, ro[1] + rd[1] * t, ro[2] + rd[2] * t];
    const h = Math.hypot(...p) - ATMO_RG;
    const e = atmosphereMedium(h).extinction;
    for (let c = 0; c < 3; c += 1) od[c]! += e[c]! * dt;
  }
  return od.map((v) => Math.exp(-v)) as Vec3;
}

/** The (r, mu) a transmittance LUT texel stands for (the kernel's mapping, Atmosphere.js 236-245). */
export function transmittanceTexel(px: number, py: number): { r: number; mu: number } {
  const [W, H] = TRANSMITTANCE_SIZE;
  const u = (px + 0.5) / W;
  const v = (py + 0.5) / H;
  const xMu = (u - 0.5 / W) * (W / (W - 1));
  const xR = (v - 0.5 / H) * (H / (H - 1));
  const top = Math.sqrt(ATMO_RT * ATMO_RT - ATMO_RG * ATMO_RG);
  const rho = xR * top;
  const r = Math.sqrt(rho * rho + ATMO_RG * ATMO_RG);
  const dMin = ATMO_RT - r;
  const dMax = rho + top;
  const d = dMin + xMu * (dMax - dMin);
  const mu = d === 0 ? 1 : (top * top - rho * rho - d * d) / (2 * r * d);
  return { r, mu: Math.min(1, Math.max(-1, mu)) };
}

/** Where (r, mu) is sampled in the transmittance LUT (Atmosphere.js `atmosphereTransmittanceUV`, kept as it is). */
export function transmittanceUV(r: number, mu: number): [number, number] {
  const [W, H] = TRANSMITTANCE_SIZE;
  const top = Math.sqrt(ATMO_RT * ATMO_RT - ATMO_RG * ATMO_RG);
  const rho = Math.sqrt(Math.max(r * r - ATMO_RG * ATMO_RG, 0));
  const disc = r * r * (mu * mu - 1) + ATMO_RT * ATMO_RT;
  const d = Math.max(0, -r * mu + Math.sqrt(Math.max(disc, 0)));
  const dMin = ATMO_RT - r;
  const dMax = rho + top;
  const xMu = (d - dMin) / (dMax - dMin);
  const xR = rho / top;
  return [(xMu + 0.5 / W) * (W / (W + 1)), (xR + 0.5 / H) * (H / (H + 1))];
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Direction toward the sun at an hour of the day (Sky.js `sunDirectionFromTime`): a simple solar position at
 * latitude 24 and declination 6 degrees. +x east, -z north, +y up.
 */
export function sunDirectionFromTime(hours: number, latitudeDeg = 24, declinationDeg = 6): Vec3 {
  const phi = rad(latitudeDeg);
  const dec = rad(declinationDeg);
  const h = rad((hours - 12) * 15);
  const east = -Math.cos(dec) * Math.sin(h);
  const north = Math.cos(phi) * Math.sin(dec) - Math.sin(phi) * Math.cos(dec) * Math.cos(h);
  const up = Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(h);
  const length = Math.hypot(east, up, north);
  return [east / length, up / length, -north / length];
}

/** The sun at an hour, its daily path turned about the vertical by `azimuthDeg` (App.js `updateSun`). */
export function sunDirection(hours: number, azimuthDeg = 0): Vec3 {
  const [x, y, z] = sunDirectionFromTime(hours);
  const a = rad(azimuthDeg);
  // three's applyAxisAngle about +y: x' = x cos a + z sin a, z' = -x sin a + z cos a
  return [x * Math.cos(a) + z * Math.sin(a), y, -x * Math.sin(a) + z * Math.cos(a)];
}

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** How much it is night (0 day, 1 full night) for the sun's height `sunY` (App.js: smoothstep(-y; 0.02, 0.18)). */
export const nightFactor = (sunY: number): number => smoothstep(0.02, 0.18, -sunY);

/** The moon stands opposite the sun, always a little up (App.js `updateSun`). */
export function moonDirection(sun: Vec3): Vec3 {
  const m: Vec3 = [-sun[0], Math.abs(sun[1]) * 0.8 + 0.25, -sun[2]];
  const length = Math.hypot(...m);
  return [m[0] / length, m[1] / length, m[2] / length];
}

/**
 * The key light (App.js `updateSun` + `applyAtmosphereReadback`): the sun until it is well below the horizon, then
 * the moon. By day its colour is the sunlight through the air at sea level times `SUN_ILLUMINANCE`, faded at the
 * horizon; by night a faint blue moonlight.
 */
export function sunLight(sun: Vec3): { direction: Vec3; color: Vec3; night: number; moon: Vec3 } {
  const night = nightFactor(sun[1]);
  const moon = moonDirection(sun);
  const sunUp = sun[1] > -0.07;
  if (!sunUp)
    return { direction: moon, color: [0.6, 0.7, 1].map((v) => v * 0.12 * night) as Vec3, night, moon };
  const fade = smoothstep(-0.03, 0.02, sun[1]);
  const t = transmittance(ATMO_RG + 0.001, sun[1]);
  return { direction: sun, color: t.map((v) => v * SUN_ILLUMINANCE * fade) as Vec3, night, moon };
}
