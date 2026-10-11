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

/** What Automatic means: computers get quality 8, phones and tablets quality 3. */
const AUTOMATIC = { computer: 8, touch: 3 } as const;

/**
 * Realistic settings for the graphics setting (0 = Automatic, 1 fastest to 10 sharpest) and the
 * device, so every choice lives in one place and can be tested.
 */
export function realisticQuality({
  quality,
  touchDevice,
  webgpu = false,
}: {
  quality: number;
  touchDevice: boolean;
  /** The renderer runs on WebGPU (not the WebGL2 fallback). */
  webgpu?: boolean;
}): RealisticQuality {
  const q =
    quality === 0 ? (touchDevice ? AUTOMATIC.touch : AUTOMATIC.computer) : Math.min(10, Math.max(1, quality));
  const tidewater = webgpu && !touchDevice && q >= 7;
  return {
    cascades: q >= 8 ? 4 : q >= 5 ? 3 : q >= 3 ? 2 : 1,
    shadowMapSize: q >= 6 ? 2048 : 1024,
    shadowFar: 150 + q * 45,
    bloom: q >= 7,
    envSize: q >= 6 ? 256 : 64,
    envEveryDeg: q >= 6 ? 1 : 4,
    fogScale: 0.6 + q * 0.04,
    groundSize: q >= 5 ? 1024 : 512,
    grassRadius: q >= 7 ? 50 : q >= 4 ? 35 : 20,
    grassDensity: q >= 7 ? 9 : q >= 4 ? 4 : 1.5,
    // Water (P2-39). The rule that matters: nothing below quality 7 costs an extra pass over the
    // scene, so phones keep the water they can afford. Clear water needs neither, because it
    // comes from the light extinction, so no device loses it.
    waterGrid: q >= 7 ? 1 : q >= 4 ? 0.5 : 0.25,
    waterWaves: q >= 7 ? 4 : q >= 4 ? 2 : 0,
    waterRefraction: q >= 4,
    waterCaustics: q >= 4,
    waterReflect: q >= 7 ? 2 : 0,
    waterRays: q >= 7,
    waterSpray: q >= 7 ? 200 : q >= 4 ? 80 : 30,
    waterWake: q >= 7 ? 24 : q >= 4 ? 12 : 6,
    waterOcean: tidewater ? 'tidewater' : 'gerstner',
    oceanCascades: tidewater ? (q >= 9 ? 4 : 3) : 0,
    oceanGrid: tidewater ? (q >= 9 ? 768 : 512) : 0,
    oceanRipples: tidewater && q >= 9,
    oceanDetail: tidewater && q >= 9,
    worldLook: tidewater ? 'tidewater' : 'genvr',
  };
}
