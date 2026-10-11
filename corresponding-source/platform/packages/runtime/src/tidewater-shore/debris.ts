/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
// Source: src/world/Debris.js 1-252 (ground clutter: wrack line, cove stones, fronds, village clutter, pebbles,
// photoscanned logs and shells).
//
// Divergences (injected, CPU behaviour unchanged): the terrain, village (its three.js materials and
// texture baker), vegetation, rocks, colliders and scene are parameters; the nature, pebble and scan
// materials are the source's engine records kept as DATA (`ShoreEngine`, not run) and their meshes draw
// with three.js stand-ins (`natureMaterial` option, default MeshStandardMaterial with vertex colours off).
// LAYERS.TRANSPARENT of the source engine (2) is kept as the three.js layer number of the fabric mesh.
// The assembly (_assemble: batch merge, contact occlusion bake, caster-first nature triangles, shared
// buffers and draw ranges) is the source code and compared bit-exact in the tests.
import { Group, BufferGeometry, Mesh, MeshStandardMaterial, type Camera, type Material, type Object3D } from 'three';
import { Builder, Batch } from '../tidewater-village/geo-builder.js';
import { InstancedProps } from '../tidewater-village/props.js';
import { DebrisPlacer, type DebrisPlacerOptions, type DebrisTerrain } from './debris-placement.js';
import { createNatureMaterial } from './nature-material.js';
import { PebbleField, type PebbleTerrain } from './pebble-field.js';
import { KIND } from './debris-shapes.js';
import { ScannedDebris, type ScannedDebrisOptions } from './scanned-debris.js';
import { RECORDING_ENGINE, type ShoreEngine, type ShoreMaterial, type ShoreTerrainGpu } from './shore-engine.js';

/** Source engine render layers (src/engine/render/SceneRenderer.js 15-20). */
export const LAYERS = { OPAQUE: 0, WATER: 1, TRANSPARENT: 2, REFLECT_ONLY: 3 } as const;

type PlacerOptions = DebrisPlacerOptions;

/** What the debris reads of the village: its shared materials and the texture baker. */
export interface DebrisVillageMaterials {
	materials:{ wood:Material; hard:Material; fabric:Material };
	textures?:{ bake?:() => void } | null;
}

export interface DebrisOptions {
	scene:{ add( o:Object3D ):unknown; remove( o:Object3D ):unknown };
	terrain:{ data:PebbleTerrain & DebrisTerrain; gpu:ShoreTerrainGpu };
	village:DebrisVillageMaterials & NonNullable<PlacerOptions[ 'village' ]>;
	vegetation?:PlacerOptions[ 'vegetation' ];
	rocks?:PlacerOptions[ 'rocks' ];
	colliders?:PlacerOptions[ 'colliders' ];
	seed?:number;
	engine?:ShoreEngine;
	/** three.js material for the nature mesh (default: a MeshStandardMaterial stand-in). */
	natureMaterial?:Material;
	/** ScannedDebris loader options (base URL, file readers); default: nothing is loaded. */
	scan?:Pick<ScannedDebrisOptions, 'base' | 'loadBytes' | 'loadPixels' | 'material' | 'autoLoad'>;
}

type DebrisMesh = Mesh & { staticVelocity?:boolean };
interface DrawRange { start:number; count:number }

export class Debris {

	scene:DebrisOptions[ 'scene' ];
	terrainData:PebbleTerrain & DebrisTerrain;
	gpu:ShoreTerrainGpu;
	engine:ShoreEngine;
	natureStandIn:Material | undefined;
	group:Group;
	counts:unknown;
	newColliders:unknown;
	meshes:DebrisMesh[] = [];
	materials:{ nature:ShoreMaterial } | null = null;
	natureMaterial:Material | null = null;
	natureCasterTris = 0;
	shadowTriangles = 0;
	pebbles:PebbleField;
	scanned:ScannedDebris;
	timings:Record<string, number>;

	constructor( { scene, terrain, village, vegetation = null, rocks = null, colliders = null, seed = 5150, engine = RECORDING_ENGINE, natureMaterial, scan = { autoLoad: false } }:DebrisOptions ) {

		this.scene = scene;
		this.terrainData = terrain.data;
		this.gpu = terrain.gpu;
		this.engine = engine;
		this.natureStandIn = natureMaterial;
		this.group = new Group();
		this.group.name = 'Debris';
		this.group.matrixAutoUpdate = false;
		const t0 = performance.now();

		const B = new Builder();
		const inst = new InstancedProps( B );
		const placer = new DebrisPlacer( { B, inst, terrain: this.terrainData, village, vegetation, rocks, colliders, seed } ).run();
		this.counts = placer.counts;
		this.newColliders = placer.newColliders;
		const t1 = performance.now();

		this._assemble( B, village );
		const t2 = performance.now();

		this.pebbles = new PebbleField( { terrain: this.terrainData, gpu: this.gpu, mask: placer.mask, engine } );
		this.group.add( this.pebbles.mesh );
		this.meshes.push( this.pebbles.mesh );
		// photoscanned logs, branches and shells (loaded asynchronously, added when ready)
		this.scanned = new ScannedDebris( { gpu: this.gpu, instances: placer.scanned, parent: this.group, engine, ...scan } );
		this.timings = { place: t1 - t0, ...placer.timings, assemble: t2 - t1, pebbles: performance.now() - t2, total: performance.now() - t0 };
		scene.add( this.group );

	}

	_assemble( B:Builder, village:DebrisVillageMaterials ) {

		const take = ( key:string ) => {

			const b = B.batches[ key ];
			delete B.batches[ key ];
			return b;

		};

		const wood = B.batch( 'wood' ), hard = B.batch( 'hard' ), nature = B.batch( 'nature' );
		const rope = take( 'rope' ), net = take( 'net' );
		if ( rope ) hard.append( rope, ( d ) => [ d[ 0 ]!, 0, 0, 2 + d[ 1 ]! ] );
		const fabric = new Batch();
		if ( net ) fabric.append( net, ( d ) => [ d[ 0 ]!, d[ 1 ]!, Math.max( 0.02, d[ 2 ]! ), 0 ] );

		// contact occlusion: darken what touches the ground (sides and undersides more than tops)
		for ( const b of [ wood, hard, nature, fabric ] ) this._bakeContact( b );

		// nature triangles: shadow casters (bigger stones, whole coconuts) first, then the rest
		{

			const cast:number[] = [], small:number[] = [];
			const D = nature.data, I = nature.idx;
			for ( let t = 0; t < I.length; t += 3 ) {

				const v = I[ t ]! * 4;
				const kind = D[ v + 1 ], size = D[ v + 3 ]!;
				const caster = ( kind === KIND.STONE && size >= 0.2 ) || ( kind === KIND.DRIFT && size >= 0.1 ) || ( kind === KIND.CORAL && size >= 0.15 && D[ v + 2 ]! >= 2 );
				( caster ? cast : small ).push( I[ t ]!, I[ t + 1 ]!, I[ t + 2 ]! );

			}

			nature.idx = cast.concat( small );
			this.natureCasterTris = cast.length / 3;

		}

		const opaque = new Batch();
		const ranges:Partial<Record<'wood' | 'hard' | 'nature', DrawRange>> = {};
		for ( const key of [ 'wood', 'hard', 'nature' ] as const ) {

			const b = key === 'wood' ? wood : key === 'hard' ? hard : nature;
			if ( b.vcount === 0 ) continue;
			const start = opaque.idx.length;
			opaque.append( b );
			ranges[ key ] = { start, count: opaque.idx.length - start };

		}

		const shared = opaque.build();
		const shadowCount = ( ranges.wood ? ranges.wood.count : 0 ) + ( ranges.hard ? ranges.hard.count : 0 ) + this.natureCasterTris * 3;
		const shadowStart = ranges.wood ? ranges.wood.start : 0;
		const natureMat = createNatureMaterial( this.gpu, {}, this.engine );
		this.materials = { nature: natureMat };
		this.natureMaterial = this.natureStandIn ?? new MeshStandardMaterial( { name: 'DebrisNature', roughness: 0.8, metalness: 0, vertexColors: true } );
		const mats = { wood: village.materials.wood, hard: village.materials.hard, nature: this.natureMaterial };
		this.meshes = [];
		// the village materials' baked textures: the TSL materials baked on first use (a trigger node);
		// the engine's village meshes call bake() themselves, so the debris meshes drawn with those
		// materials do too (records into the frame encoder during collection, once)
		const bakeVillage = () => {

			if ( village.textures && village.textures.bake ) village.textures.bake();

		};

		for ( const key of Object.keys( ranges ) as ( keyof typeof ranges )[] ) {

			const geo = new BufferGeometry();
			for ( const name in shared.attributes ) geo.setAttribute( name, shared.attributes[ name ]! );
			geo.setIndex( shared.index );
			geo.boundingBox = shared.boundingBox;
			geo.boundingSphere = shared.boundingSphere;
			const r = ranges[ key ]!;
			geo.setDrawRange( r.start, r.count );
			const mesh:DebrisMesh = new Mesh( geo, mats[ key ] );
			mesh.name = 'debris_' + key;
			mesh.receiveShadow = true;
			mesh.castShadow = key === 'wood';
			if ( key === 'wood' ) {

				// the shadow passes draw wood, hard and the nature casters with this mesh. (The
				// engine has no onBeforeShadow / onAfterShadow: onBeforeRender runs per pass with that
				// pass's camera, and the shadow cascade cameras are the only ones with standard depth.)
				const range = geo.drawRange;
				mesh.onBeforeRender = ( _renderer, _scene, camera ) => {

					bakeVillage();
					const shadow = !! camera && ( ( camera as Camera & { isShadowCamera?:boolean } ).isShadowCamera === true || camera.reversedDepth === false );
					range.start = shadow ? shadowStart : r.start;
					range.count = shadow ? shadowCount : r.count;

				};

			} else if ( key === 'hard' ) mesh.onBeforeRender = bakeVillage;

			// (the TSL version used staticVelocityMRT on the nature material)
			mesh.staticVelocity = true;
			this.meshes.push( mesh );

		}

		this.shadowTriangles = shadowCount / 3;

		if ( fabric.vcount > 0 ) {

			const mesh:DebrisMesh = new Mesh( fabric.build(), village.materials.fabric );
			mesh.name = 'debris_fabric';
			mesh.receiveShadow = true;
			mesh.castShadow = false;
			// alpha-tested nets are drawn in the late pass (see App: village_fabric)
			mesh.layers.set( LAYERS.TRANSPARENT );
			mesh.staticVelocity = true;
			mesh.onBeforeRender = bakeVillage;
			this.meshes.push( mesh );

		}

		for ( const mesh of this.meshes ) {

			// never culled: the pipelines compile with the village's during the loading screen
			mesh.frustumCulled = false;
			mesh.matrixAutoUpdate = false;
			mesh.updateMatrix();
			this.group.add( mesh );

		}

	}

	// multiply the vertex tint by a ground-contact occlusion term
	_bakeContact( b:Batch ) {

		const T = this.terrainData;
		const P = b.pos, N = b.nrm, C = b.tint;
		for ( let i = 0; i < b.vcount; i ++ ) {

			const x = P[ i * 3 ]!, y = P[ i * 3 + 1 ]!, z = P[ i * 3 + 2 ]!;
			const above = y - T.heightAt( x, z );
			if ( above > 0.14 ) continue;
			const t = Math.max( 0, Math.min( 1, above / 0.14 ) );
			const k = 1 - t * t * ( 3 - 2 * t );
			const up = Math.max( 0, N[ i * 3 + 1 ]! );
			const ao = 1 - 0.38 * k * ( 1 - 0.8 * up );
			C[ i * 3 ]! *= ao; C[ i * 3 + 1 ]! *= ao; C[ i * 3 + 2 ]! *= ao;

		}

	}

	update( camera:Camera ) {

		this.pebbles.update( camera );
		this.scanned.update( camera );

	}

	stats() {

		let triangles = 0;
		for ( const m of this.meshes ) {

			if ( m === this.pebbles.mesh ) continue;
			const total = m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position!.count;
			triangles += Math.min( total, m.geometry.drawRange.count ) / 3;

		}

		return {
			triangles, pebbleTriangles: this.pebbles.triangles, pebbleCells: this.pebbles.count, occupiedCells: this.pebbles.occupiedCells,
			scannedInstances: this.scanned.instances.length, scannedTriangles: this.scanned.triangles, scannedReady: this.scanned.ready,
			drawCalls: this.meshes.length, shadowCasters: 1, shadowTriangles: this.shadowTriangles, colliders: this.newColliders,
			counts: this.counts, timings: this.timings,
		};

	}

	dispose() {

		for ( const m of this.meshes ) if ( m !== this.pebbles.mesh ) m.geometry.dispose();
		this.materials!.nature.dispose();
		this.natureMaterial!.dispose();
		this.pebbles.dispose();
		this.scanned.dispose();
		this.scene.remove( this.group );

	}

}
