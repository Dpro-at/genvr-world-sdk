/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
// Glue for the source's own WebGPU engine objects the debris and pebble materials are made of
// (src/engine/gpu/Shader.js ShaderModule, src/engine/gpu/Texture.js Texture, src/materials/Materials.js
// standard(), src/engine/render/wgsl/common.js, src/materials/LODFade.js lodFadeModule,
// src/world/terrain/TerrainShading.js terrainShadingModule()). Genvr renders with three.js, so the ports
// keep what the source passes to these as DATA: the default engine below only records it. A WebGPU
// backend that runs the WGSL (not part of this task) supplies a real `ShoreEngine`.

/** A WGSL module as the source declares it (`new ShaderModule( { name, deps, code } )`). */
export interface ShoreShaderModule { name:string; deps?:readonly unknown[]; code?:string }

/** Options of the source's `new Texture( { ... } )` (plus the pixel data). */
export interface ShoreTextureOptions {
	label:string;
	width:number;
	height:number;
	format:string;
	usage:readonly string[];
	mips?:boolean;
	data:Uint8Array;
}

/** What the materials read of the source's TerrainGPU (opaque WGSL modules). */
export interface ShoreTerrainGpu { module:unknown; sunModulationModule:unknown }

/** Parameters the source passes to `standard()`. */
export type ShoreMaterialParams = Record<string, unknown> & { name:string };

export interface ShoreMaterial { params:ShoreMaterialParams; dispose():void }
export interface ShoreTexture { options:ShoreTextureOptions; destroyed:number; getGPU():void; destroy():void }

export interface ShoreEngine {
	standard( params:ShoreMaterialParams ):ShoreMaterial;
	texture( options:ShoreTextureOptions ):ShoreTexture;
	generateMipmaps( texture:ShoreTexture ):void;
	commonModule:unknown;
	lodFadeModule:unknown;
	terrainShadingModule():unknown;
}

/** Records the engine calls (materials and textures as data); nothing is drawn with them. */
export const RECORDING_ENGINE:ShoreEngine = {
	standard: ( params ) => ( { params, dispose() {} } ),
	texture: ( options ) => ( { options, destroyed: 0, getGPU() {}, destroy() { this.destroyed ++; } } ),
	generateMipmaps: () => {},
	commonModule: { name: 'common' },
	lodFadeModule: { name: 'lodFade' },
	terrainShadingModule: () => ( { name: 'terrainShading' } ),
};
