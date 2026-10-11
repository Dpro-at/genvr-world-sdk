/** How much of the realistic sky and light a device draws (P2-36). */
export interface RealisticQuality {
    /** Shadow cascades; 1 is a single shadow map. */
    cascades: number;
    /** Shadow map size per cascade. */
    shadowMapSize: number;
    /** How far shadows reach from the camera (meters). */
    shadowFar: number;
    /** Glow around the sun and bright highlights. */
    bloom: boolean;
    /** Face size of the environment map made from the sky. */
    envSize: number;
    /** How far the sun moves (degrees) before the environment map is made again. */
    envEveryDeg: number;
    /** Multiplies how far one sees through the air before the fog closes. */
    fogScale: number;
    /** Texture size of the realistic ground materials (P2-37). */
    groundSize: 1024 | 512;
    /** How far grass grows from the camera (meters) and grass cards per square meter near it (P2-38). */
    grassRadius: number;
    grassDensity: number;
    /** Water surface vertices per meter; more means finer waves (P2-39). */
    waterGrid: number;
    /** Waves that really move the surface; 0 keeps the flat normal-map look. */
    waterWaves: number;
    /** Bend what is seen under the water. Reads the drawn scene, so it costs no extra pass. */
    waterRefraction: boolean;
    /** Light patterns on the bed. */
    waterCaustics: boolean;
    /** Bodies of water that mirror the world; each one costs a whole pass over the scene. */
    waterReflect: number;
    /** Rays of light slanting down while the camera is under water. */
    waterRays: boolean;
    /** Specks of spray at the foot of each waterfall. */
    waterSpray: number;
    /** Rings a swimmer's wake keeps at once; each one is a little maths on every water pixel. */
    waterWake: number;
    /**
     * How the sea is drawn (Tidewater sea, plan task 2): today's Gerstner waves, or the FFT deep sea ported from
     * Tidewater. Only High and Ultra on a WebGPU computer get the FFT sea; phones, tablets and WebGL2 never do.
     */
    waterOcean: 'gerstner' | 'tidewater';
    /** FFT cascades of the deep sea: 0 (Gerstner), 3 at High (the 7.1 m one dropped), 4 at Ultra. */
    oceanCascades: 0 | 3 | 4;
    /** Cells per side of the deep sea's camera grid. */
    oceanGrid: number;
    /** Near-camera ripples (the finest cascade re-sampled at small tiles), Ultra only. */
    oceanRipples: boolean;
    /** Gusts, slicks and windrows on the deep sea (ocean/sea-detail.ts), Ultra only (plan task 7). */
    oceanDetail: boolean;
    /**
     * How the realistic world is drawn (Tidewater world, decision 130): today's Genvr look, or the look ported from
     * Tidewater (its sky, light, clouds, post, ground and plants). The same gate as `waterOcean`: only High and Ultra
     * on a WebGPU computer; phones, tablets, WebGL2 and graphics 1-6 draw the same place with the lighter look.
     */
    worldLook: 'genvr' | 'tidewater';
}
/**
 * Realistic settings for the graphics setting (0 = Automatic, 1 fastest to 10 sharpest) and the
 * device, so every choice lives in one place and can be tested.
 */
export declare function realisticQuality({ quality, touchDevice, webgpu, }: {
    quality: number;
    touchDevice: boolean;
    /** The renderer runs on WebGPU (not the WebGL2 fallback). */
    webgpu?: boolean;
}): RealisticQuality;
