export type Vec3 = [number, number, number];
export declare const ATMO_RG = 6360;
export declare const ATMO_RT = 6460;
/** Sun irradiance outside the atmosphere in scene units (Atmosphere.js `SUN_ILLUMINANCE`). */
export declare const SUN_ILLUMINANCE = 11;
/** Angular radius of the drawn sun disc (radians), a little larger than the real 0.004675. */
export declare const SUN_ANGULAR_RADIUS: number;
/** LUT sizes: transmittance, multiple scattering, sky view. */
export declare const TRANSMITTANCE_SIZE: readonly [number, number];
export declare const MULTISCAT_SIZE = 32;
export declare const SKYVIEW_SIZE: readonly [number, number];
/** Steps of the transmittance integral. */
export declare const TRANSMITTANCE_STEPS = 40;
/** Ground albedo seen from above (Atmosphere.js `groundAlbedo`). */
export declare const GROUND_ALBEDO: Vec3;
/** Mie phase asymmetry (Cornette-Shanks). */
export declare const MIE_G = 0.8;
export interface Medium {
    rayScat: Vec3;
    mieScat: number;
    extinction: Vec3;
    scattering: Vec3;
}
/** Rayleigh, Mie and ozone at a height above the ground in km (Atmosphere.js `atmosphereMedium`). */
export declare function atmosphereMedium(hKm: number, rayleighScale?: number, mieScale?: number, ozoneScale?: number): Medium;
/** Nearest positive distance from `ro` along `rd` to a sphere about the planet's centre, -1 when none. */
export declare function raySphereNearest(ro: Vec3, rd: Vec3, radius: number): number;
/** Transmittance from radius `r` (km) toward the top of the atmosphere at zenith cosine `mu` (40 midpoint steps). */
export declare function transmittance(r: number, mu: number, steps?: number): Vec3;
/** The (r, mu) a transmittance LUT texel stands for (the kernel's mapping, Atmosphere.js 236-245). */
export declare function transmittanceTexel(px: number, py: number): {
    r: number;
    mu: number;
};
/** Where (r, mu) is sampled in the transmittance LUT (Atmosphere.js `atmosphereTransmittanceUV`, kept as it is). */
export declare function transmittanceUV(r: number, mu: number): [number, number];
/**
 * Direction toward the sun at an hour of the day (Sky.js `sunDirectionFromTime`): a simple solar position at
 * latitude 24 and declination 6 degrees. +x east, -z north, +y up.
 */
export declare function sunDirectionFromTime(hours: number, latitudeDeg?: number, declinationDeg?: number): Vec3;
/** The sun at an hour, its daily path turned about the vertical by `azimuthDeg` (App.js `updateSun`). */
export declare function sunDirection(hours: number, azimuthDeg?: number): Vec3;
/** How much it is night (0 day, 1 full night) for the sun's height `sunY` (App.js: smoothstep(-y; 0.02, 0.18)). */
export declare const nightFactor: (sunY: number) => number;
/** The moon stands opposite the sun, always a little up (App.js `updateSun`). */
export declare function moonDirection(sun: Vec3): Vec3;
/**
 * The key light (App.js `updateSun` + `applyAtmosphereReadback`): the sun until it is well below the horizon, then
 * the moon. By day its colour is the sunlight through the air at sea level times `SUN_ILLUMINANCE`, faded at the
 * horizon; by night a faint blue moonlight.
 */
export declare function sunLight(sun: Vec3): {
    direction: Vec3;
    color: Vec3;
    night: number;
    moon: Vec3;
};
