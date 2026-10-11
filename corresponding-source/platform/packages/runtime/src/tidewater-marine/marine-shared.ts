/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
// Shared pieces the marine modules take from outside src/world/fish and src/world/marine:
//  - mulberry32: src/util/Noise.js 3-15 (seeded random), bandFade: src/materials/LODFade.js 45-50;
//  - MarineBatch: the instance API of src/world/reef/ReefBatch.js the fish use (the reef port owns the
//    real class; it is injected with setMarineBatch, or per FishSchools with the `Batch` option);
//  - WgslMaterial / WgslModule / WgslUniformBlock: plain records of what the source hands to its own
//    WebGPU engine (Material, ShaderModule, UniformBlock). Genvr renders with three.js, so the WGSL text
//    and parameters are kept as data (compared with the source in the tests) and no shader is run here.
import type { BufferGeometry, Object3D } from 'three';

export function mulberry32( seed:number ) {

	let a = seed >>> 0;
	return function () {

		a = ( a + 0x6D2B79F5 ) >>> 0;
		let t = a;
		t = Math.imul( t ^ ( t >>> 15 ), t | 1 );
		t ^= t + Math.imul( t ^ ( t >>> 7 ), t | 61 );
		return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;

	};

}

/** Smoothstep share of `dist` over [start, end] (0 before, 1 after). */
export function bandFade( dist:number, start:number, end:number ) {

	const t = ( dist - start ) / Math.max( end - start, 1e-6 );
	return t <= 0 ? 0 : t >= 1 ? 1 : t * t * ( 3 - 2 * t );

}

// ---------------------------------------------------------------------------
// engine records

/** A WGSL module record (the source's ShaderModule options). */
export class WgslModule {

	declare name:string;
	declare deps?:unknown[];
	declare uniforms?:unknown;
	declare uniformName?:string;
	declare bindings?:unknown;
	declare code:string;

	constructor( options:{ name:string; code:string; deps?:unknown[]; uniforms?:unknown; uniformName?:string; bindings?:unknown } ) {

		Object.assign( this, options );

	}

}

/** A uniform block record (the source's UniformBlock( name, fields, options )). */
export class WgslUniformBlock {

	name:string;
	fields:Record<string, [ string, unknown ]>;
	options:Record<string, unknown>;

	constructor( name:string, fields:Record<string, [ string, unknown ]>, options:Record<string, unknown> = {} ) {

		this.name = name;
		this.fields = fields;
		this.options = options;

	}

}

/** A material record (the source's engine Material options), with `{ value }` uniform handles. */
export class WgslMaterial {

	name:string;
	options:Record<string, unknown>;
	uniforms:Record<string, { value:unknown }> = {};
	disposed = 0;

	constructor( options:Record<string, unknown> ) {

		this.options = options;
		this.name = options.name as string;
		for ( const [ k, v ] of Object.entries( ( options.uniforms ?? {} ) as Record<string, [ string, unknown ]> ) ) this.uniforms[ k ] = { value: v[ 1 ] };

	}

	dispose() {

		this.disposed ++;

	}

}

/** Engine modules the fish material depends on (src/engine/render/wgsl/common.js, materials/LODFade.js). */
export const COMMON_MODULE = { name: 'common' };
export const LOD_FADE_MODULE = { name: 'lodFade' };

// ---------------------------------------------------------------------------
// instance batch (src/world/reef/ReefBatch.js API used by Fish.js and FishProps.js)

/** One model at one level of detail ("kind") of a batch. */
export interface MarineBatchKind {
	geometry:BufferGeometry;
	model?:string;
	lod?:number;
	shadow?:boolean;
	shadowOnly?:boolean;
}

export interface MarineBatchOptions { maxInstances:number; dynamic?:boolean; fade?:boolean }

/** Many instanced models in one render object: per-instance data (16 floats), per-frame kind lists. */
export interface MarineBatch {
	/** 16 floats per instance: four vec4 records. */
	data:Float32Array;
	/** three-style handle: `needsUpdate = true` uploads the data. */
	dataAttr:{ needsUpdate:boolean };
	fadeMesh:Object3D | null;
	/** WGSL module with the instance storage and lookups (added to the material's modules). */
	module:unknown;
	upload():void;
	begin():void;
	add( kind:number, id:number ):void;
	addFade( kind:number, id:number, fade:number, outgoing:boolean ):void;
	commit():void;
	createMesh( material:unknown, options?:{ castShadow?:boolean; receiveShadow?:boolean } ):Object3D;
	createFadeMesh( material:unknown ):Object3D;
	/** WGSL expressions for a vertex snippet (see ReefBatch.js 182-230). */
	fadeEntry():string;
	recordIndex():string;
	record( index:string ):string[];
	dispose():void;
}

export type MarineBatchClass = new ( name:string, kinds:MarineBatchKind[], options:MarineBatchOptions ) => MarineBatch;

let batchClass:MarineBatchClass | null = null;

/** Inject the batch class (the reef port's ReefBatch); returns the previous one. */
export function setMarineBatch( cls:MarineBatchClass | null ) {

	const prev = batchClass;
	batchClass = cls;
	return prev;

}

export function marineBatchClass():MarineBatchClass {

	if ( ! batchClass ) throw new Error( 'tidewater-marine: no batch class (setMarineBatch with the reef port\'s ReefBatch)' );
	return batchClass;

}

// GPU frame number (the source's GPU.frame), used to cull once per frame. Without a source every call
// culls (NaN never equals the last frame).
let frameSource:() => number = () => NaN;

/** Inject the renderer's frame counter; returns the previous source. */
export function setMarineFrame( fn:() => number ) {

	const prev = frameSource;
	frameSource = fn;
	return prev;

}

export const marineFrame = () => frameSource();
