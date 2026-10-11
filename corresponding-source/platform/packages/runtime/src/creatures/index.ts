/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
// Tidewater wildlife (src/world/wildlife/*.js and src/world/Gulls.js), one file per source module.
// Plan tasks 19-20 (creature core, birds, shorebirds, crabs). Not wired into the runtime yet: no Core
// item, no CreatureView, no three.js shading of the WGSL materials. CPU parts are bit-exact with the
// pinned source on three.js (test/tidewater-wildlife.test.ts); see docs/reference/tidewater-world/19-wildlife.
export {
	TAU, clamp, lerp, smooth, angleDiff, approach, mulberry32, qAxis, qMul, qYawPitchRoll, qRotate, qGround, kitModule,
	InstanceRecords, instancedMesh, RecordedStorageBuffer, recordStorageBuffer, standInMaterial,
	type Q4, type V3, type Rng, type WgslModule, type StorageBufferOptions, type WildlifeStorageBuffer, type StorageBufferFactory,
	type WildlifeMaterialOptions, type WildlifeMaterialFactory, type CascadeShadows, type InstancedTemplate,
} from './kit.js';
export {
	wildlifeGlobals, TIDEWATER_WILDLIFE_LAYOUT, SPRAY, RecordedSpray,
	type WildlifeGlobals, type WildlifeLayout, type WildlifeTerrain, type WildlifeColliders, type WildlifeVillage,
	type WildlifeVegetation, type WildlifeBoat, type WildlifeBoatModel, type WildlifeSpray, type SprayEmitOptions,
	type WildlifeWaterQuery, type Viewer, type WildlifeCamera,
} from './context.js';
export { BIRD, SPECIES, wingJoints, buildBird, type BirdSpecies, type BirdTemplate, type P2 } from './bird-shapes.js';
export {
	createPose, storePrevious, resetPrevious, setWings, flapWings, solveLeg, setLegs, tuckLegs, setHead, standHeight, clampAngle,
	groundPose, type BirdPoseRecord, type WingGlide,
} from './bird-pose.js';
export { FLIGHT, Flyer, type FlightConfig } from './flight.js';
export { BirdBatch, type BirdBatchOptions } from './bird-batch.js';
export { CRITTER, NU, NV, BODY_VERTS, LIMBS, buildCritters, type CritterTemplate } from './critter-shapes.js';
export { CritterBatch, type CritterRecord, type CritterBatchOptions } from './critter-batch.js';
export { ShadowBlobs, LAYER_TRANSPARENT, type ShadowBlobsOptions } from './shadow-blobs.js';
export {
	SwashProbe, RecordedKernel, RecordedReadback, recordedSwashGpu,
	type SwashProbeGpu, type SwashKernel, type SwashReadback, type ComputeKernelOptions, type SwashShore, type SwashTerrainGpu,
	type SwashSample,
} from './swash-probe.js';
export { Birds, type BirdAgent, type BirdKind, type Perch, type BirdWater, type SquadPath, type BirdsOptions } from './birds.js';
export { Shorebirds, type ShoreProbe, type Flock, type Shorebird, type ShorebirdsOptions } from './shorebirds.js';
export { Crabs, type Burrow, type HermitHome, type CrabHome, type Crab, type CrabsOptions } from './crabs.js';
export { Wildlife, WaterHeights, type WildlifePlayer, type WildlifeTest, type WildlifeOptions } from './wildlife.js';
export { Gulls, gullGeometry, type GullsOptions } from './gulls.js';
