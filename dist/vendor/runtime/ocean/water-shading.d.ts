type AnyNode = any;
/**
 * `cond ? a : b` without TSL's `select`: outside uniform control flow `select` becomes an if/else, and a `toVar()`
 * first built inside one branch is then only assigned in that branch (the other reads zero). The 0/1 weight here
 * has constant branches, and `mix` evaluates both sides in the main flow.
 */
export declare function pick(cond: AnyNode, a: AnyNode, b: AnyNode): AnyNode;
/** Index of refraction of sea water (L6). */
export declare const IOR = 1.333;
/** Absorption per metre, red goes first (Frame.js L50). */
export declare const WATER_ABSORPTION: readonly [0.42, 0.075, 0.035];
/** Scattering per metre (Frame.js L52). */
export declare const WATER_SCATTERING: readonly [0.012, 0.018, 0.024];
/** Wind speed at 10 m for the Cox-Munk slope variance (Frame.js L51). */
export declare const WIND_SPEED = 7;
/** Material numbers (L72-77). */
export declare const BACKSCATTER = 0.035;
export declare const WATER_ROUGHNESS = 0.035;
/** Henyey-Greenstein asymmetry of the water's forward scattering. */
export declare const PHASE_G = 0.86;
/** Light through thin crests (L523). */
export declare const CREST_GLOW: readonly [number, number, number];
/** The sun glint is ~1e5 x the sky; clamp it (L373). */
export declare const GLINT_CLAMP = 400;
/** Exact unpolarised dielectric Fresnel, cosI > 0, eta = n2 / n1 (`fresnelDielectric`). */
export declare function fresnelDielectric(cosI: number, eta: number): number;
/** Henyey-Greenstein phase function (`waterPhaseHG`). */
export declare function waterPhaseHG(cosT: number, g: number): number;
export declare function fresnelDielectricNode(cosI: AnyNode, eta: number): AnyNode;
export declare function waterPhaseHGNode(cosT: AnyNode, g: number): AnyNode;
export interface WaterShadeInputs {
    /** Short-wave roughness multiplier from the sea detail (gusts > 1, slicks < 1); absent: 1. */
    rough?: AnyNode;
    /** World position of the pixel. */
    position: AnyNode;
    /** Undisplaced world xz (the FFT lookup point). */
    lagXZ: AnyNode;
    /** Sea depth under the vertex (m). */
    depth: AnyNode;
    /** Wave height of the vertex above the mean level (m). */
    height: AnyNode;
    normal: AnyNode;
    foam: AnyNode;
    jacobian: AnyNode;
    footprint: AnyNode;
    /** Unit vector toward the sun. */
    sunDir: AnyNode;
    /** Sun irradiance at the surface (three's light colour x intensity). */
    sunColor: AnyNode;
    /** Sky radiance in a direction, blurred by a roughness 0..1. */
    sky: (dir: AnyNode, roughness: AnyNode | number) => AnyNode;
    /** Hemispherical sky irradiance / PI (Tidewater's `skyIrradiance`). */
    skyIrradiance: AnyNode;
    /** Average horizon colour. */
    horizonColor: AnyNode;
    /** Sea floor depth below mean sea level at a world xz (m). */
    seaDepthAt: (xz: AnyNode) => AnyNode;
    /** The drawn scene behind the water at a screen uv (y down). */
    sceneColor: (uv: AnyNode) => AnyNode;
    /** View-space z (negative) of the drawn opaque scene at a screen uv. */
    sceneViewZ: (uv: AnyNode) => AnyNode;
    /** This pixel's screen uv. */
    screenUV: AnyNode;
    /** 1 where the surface is seen from below, else 0. */
    fromBelow: AnyNode;
    /** Extra scattering and absorption per metre in the surf zone (`shoreSurfMedium`). */
    medium?: {
        scatter: AnyNode;
        absorb: AnyNode;
    };
    /** Bubbles mixed into the water, 0..1 (raise the backscatter). */
    aeration?: AnyNode;
    /**
     * The swash edge (WaterMaterial.js L245-283, L520-540): the film thickness (m), the distance to the swash front
     * (m, > 0 on the water side), the uprush weight, the meniscus weight, and how wet the sand beyond the front is.
     */
    edge?: {
        thickness: AnyNode;
        frontD: AnyNode;
        uprush: AnyNode;
        lipW: AnyNode;
        wet: AnyNode;
    };
    /** Debug view: one of the terms instead of the colour. */
    debug?: string | undefined;
}
/** The water's colour at a pixel (radiance, before tone mapping). */
export declare function waterShade(i: WaterShadeInputs): AnyNode;
export {};
