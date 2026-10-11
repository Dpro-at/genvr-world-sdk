/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
// Tidewater fish and humpback (src/world/Fish.js, src/world/fish/*, src/world/marine/*), one file per
// source module (plan task 20). CPU parts are bit-exact with the pinned source on three.js
// (test/tidewater-marine.test.ts); the WGSL materials are kept as data records, not run here.
// Not wired into the runtime yet. Village fish displays: setFishProps( FishProps ) (tidewater-village).
export * from './marine-shared.js';
export * from './fish-species.js';
export * from './fish-geometry.js';
export * from './creature-geometry.js';
export * from './fish-material.js';
export * from './fish-props.js';
export * from './fish.js';
export * from './whale-brain.js';
export * from './whale-textures.js';
export * from './whale.js';
