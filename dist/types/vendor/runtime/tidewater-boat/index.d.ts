/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
export { BoatModel, STATIC_BUCKETS, WHEEL_TURNS, THROTTLE_ANGLE, RADAR_RPM, PROP_DISPLAY_RPS, BOAT_WIND_DEFAULT, transverseInertia, type BoatWind, type BoatCollider, } from './boat-model.js';
export { HullLines, RHO_SEAWATER, sstep, lerp, clamp01, type HullSample, type HullField, type Stem, type P2 } from './hull-lines.js';
export { GeoKit, prepare, mergePrepared, triangleCount, mat4, alignY, linearColor, box, roundedBox, cylinder, rod, sphere, torus, lathe, tube, gridSurface, fanCap, orientTowards, planarUV, slab, loft, paintVertices, auxVertices, type PartOptions, } from './geo-kit.js';
export { PALETTE, buildHull, buildHullVolume, keelBottomAt, KEEL, keelVolume, foredeckY, houseHalfWidth } from './hull-builder.js';
export { HOUSE, wsZ, wallX, roofTopY, buildWheelhouse, panelFrame, wheelGeometry, throttleGeometry, radarArrayGeometry, } from './wheelhouse.js';
export { buoyGeometry, buildDeckGear, TRAP, TRAPS, HAULER, FENDERS, FLAG, type BoatParts } from './deck-gear.js';
export { PROP, RUDDER, propellerGeometry, rudderGeometry } from './running.js';
export { BoatMaterials, BoatMaterialSpecs, boatMaterialSpecs, BOAT_BUCKETS, BOAT_WGSL_MODULE, AUX_VERTEX, wgslColor, wgslFloat, type BoatBucket, type WgslMaterialSpec, type WgslMaterialOptions, type HullShape, } from './boat-materials.js';
