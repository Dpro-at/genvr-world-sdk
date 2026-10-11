/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
// Tidewater grass field (src/world/vegetation/GrassField.js) and its density mask (Scatter.js
// buildGrassMask). Plan task 14. Not wired into the runtime yet: no TSL material (the WGSL is kept as
// text), no Core item, no view; grass.ts stays the phone / lighter path. CPU parts are bit-exact with
// the pinned source on three.js (test/tidewater-grass.test.ts); see docs/reference/tidewater-world/14-grass-field.
export { mulberry32, Noise2D, smoothstep, clamp, type Rng } from './grass-noise.js';
export {
	CELL, R_NEAR, R_MID, R_FAR, FADE_T2, FADE_T1, FADE_T0, MAX_NEAR, MAX_MID, MAX_FAR, CLUMPS, BLADES, BLADE_TIER, TIER_N,
	OATS, VINES, KIND, blueNoise, PatchBuilder, clumpParams, buildPatch,
	type P2, type GrassBlade, type GrassClump, type GrassLevel,
} from './grass-patch.js';
export {
	f, C, MEADOW, VEG_MODULE_REF, grassModule, grassMaterialOptions, standInGrassMaterial, grassTierFade, grassWidthCompensation,
	grassTierZeroCut,
	type GrassWgslModule, type GrassMaterialSource, type GrassMaterialOptions, type GrassMaterialFactory,
} from './grass-material.js';
export {
	GrassField, RecordedGrassTexture, recordGrassTexture,
	type GrassTerrain, type GrassMask, type GrassTextureOptions, type GrassTexture, type GrassTextureFactory, type GrassCamera,
	type GrassLevelMesh, type GrassFieldOptions,
} from './grass-field.js';
export {
	GRASS_MASK_TEXEL, GRASS_MASK_RULES, buildGrassMask, soilGrassSite,
	type GrassCover, type GrassNoise, type GrassMaskSite, type GrassMaskOptions, type GrassMaskResult, type SoilGrassInputs,
} from './grass-mask.js';
