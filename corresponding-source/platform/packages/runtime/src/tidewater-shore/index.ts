/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
// Tidewater shore (plan task 17): scattered rocks (src/world/Rocks.js + terrain/RockGeometry.js), the coral
// reef (src/world/Reef.js + reef/*) and the ground debris (src/world/Debris.js + debris/*), one file per
// source module. Not wired into the runtime yet: Core items, cover sets and the WebGPU shading come later
// (docs/reference/tidewater-world/17-rocks-reef-debris/README.md). Several modules share source names
// (srgb, aData, branch, ScanInstance, ...), so each module is also exported as a namespace.
export { Rocks } from './rocks.js';
export { Reef } from './reef.js';
export { Debris } from './debris.js';
export { PebbleField } from './pebble-field.js';
export { ScannedDebris } from './scanned-debris.js';
export { DebrisPlacer } from './debris-placement.js';
export { ReefBatch } from './reef-batch.js';
export { parseGLB } from './glb.js';
export { RECORDING_ENGINE, type ShoreEngine } from './shore-engine.js';

export * as ShoreMath from './shore-math.js';
export * as ShoreEngineTypes from './shore-engine.js';
export * as RockGeometry from './rock-geometry.js';
export * as RocksModule from './rocks.js';
export * as ReefModule from './reef.js';
export * as ReefGeometry from './reef-geometry.js';
export * as ReefBatchModule from './reef-batch.js';
export * as ReefMaterials from './reef-materials.js';
export * as ReefNoise from './reef-noise.js';
export * as DebrisModule from './debris.js';
export * as DebrisShapes from './debris-shapes.js';
export * as DebrisPlacement from './debris-placement.js';
export * as NatureMaterial from './nature-material.js';
export * as PebbleFieldModule from './pebble-field.js';
export * as ScannedDebrisModule from './scanned-debris.js';
export * as GLB from './glb.js';
