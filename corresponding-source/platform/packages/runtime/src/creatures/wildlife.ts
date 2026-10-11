/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
// Source: src/world/wildlife/Wildlife.js 1-173 (WaterHeights slots, the wildlife owner: batches, viewer, update order).
// Scene, renderer and world objects are passed in as in the source; the engine pieces (storage buffers,
// materials, swash GPU) and the module singletons (G, WORLD) are extra options with recorder defaults.
import type { Object3D } from 'three';
import { BirdBatch } from './bird-batch.js';
import { Birds } from './birds.js';
import { CritterBatch } from './critter-batch.js';
import { Crabs } from './crabs.js';
import { ShadowBlobs } from './shadow-blobs.js';
import { SwashProbe, recordedSwashGpu, type SwashProbeGpu, type SwashShore, type SwashTerrainGpu } from './swash-probe.js';
import { Shorebirds } from './shorebirds.js';
import { recordStorageBuffer, standInMaterial, type CascadeShadows, type StorageBufferFactory, type WildlifeMaterialFactory } from './kit.js';
import {
	TIDEWATER_WILDLIFE_LAYOUT, wildlifeGlobals,
	type Viewer, type WildlifeBoat, type WildlifeBoatModel, type WildlifeCamera, type WildlifeColliders, type WildlifeGlobals,
	type WildlifeLayout, type WildlifeSpray, type WildlifeTerrain, type WildlifeVegetation, type WildlifeVillage, type WildlifeWaterQuery,
} from './context.js';

/** The walker / swimmer / boat the animals react to (Player.js position and mode). */
export interface WildlifePlayer { position:{ x:number; y:number; z:number }; mode:string }
export type WildlifeTest = ( birds:BirdBatch, dt:number, critters:CritterBatch, blobs:ShadowBlobs ) => void;

export interface WildlifeOptions {
	scene:{ add( o:Object3D ):unknown }; renderer?:unknown; terrain:WildlifeTerrain; terrainGPU?:SwashTerrainGpu | null;
	shore?:SwashShore | null; village?:WildlifeVillage | null; colliders?:WildlifeColliders | null;
	vegetation?:WildlifeVegetation | null; boat?:WildlifeBoat | null; boatModel?:WildlifeBoatModel | null;
	query?:WildlifeWaterQuery | null; spray?:WildlifeSpray | null; csm?:CascadeShadows | null;
	globals?:WildlifeGlobals; layout?:WildlifeLayout; storageBuffer?:StorageBufferFactory; material?:WildlifeMaterialFactory;
	swashGpu?:SwashProbeGpu; now?:() => number;
}

// Water heights for birds on / just above the sea (pelicans skimming, floating, diving): a few
// WaterQuery slots handed out to whoever asks, read back 1-3 frames later. Falls back to sea level.
export class WaterHeights {

	query:WildlifeWaterQuery | null; n:number; start:number; keys:unknown[]; used:Int32Array; since:Int32Array; frame:number;

	constructor( query:WildlifeWaterQuery | null, n = 8 ) {

		this.query = query;
		this.n = n;
		this.start = - 1;
		try {

			if ( query ) this.start = query.allocate( 'wildlife', n );

		} catch ( e ) {

			console.warn( 'Wildlife: no water query slots', e );

		}

		this.keys = new Array( n ).fill( null );
		this.used = new Int32Array( n ).fill( - 1e6 );
		this.since = new Int32Array( n );
		this.frame = 0;

	}

	height( key:unknown, x:number, z:number ) {

		const q = this.query;
		if ( this.start < 0 ) return 0;
		let k = this.keys.indexOf( key );
		if ( k < 0 ) {

			// take the slot unused for longest
			k = 0;
			for ( let i = 1; i < this.n; i ++ ) if ( this.used[ i ]! < this.used[ k ]! ) k = i;
			this.keys[ k ] = key;
			this.since[ k ] = this.frame;

		}

		this.used[ k ] = this.frame;
		const slot = this.start + k;
		q!.setPoint( slot, x, z );
		const h = q!.cpu[ slot * 4 ]!;
		// the result is valid once the point has been in the queue for a few frames
		return q!.cpuValid && this.frame - this.since[ k ]! > 4 && Number.isFinite( h ) ? h : 0;

	}

	endFrame() {

		this.frame ++;

	}

}

// Island wildlife: gulls, terns, pelicans, frigatebirds and sanderlings (one instanced draw, plus
// the near shadow cascade), ghost crabs, hermit crabs and burrows (one draw), and soft contact
// shadows under the small ones (one draw in the late pass). Everything is simulated on the CPU
// near the viewer only; far away the crabs and shorebirds cost nothing and draw nothing.
//
// csm: the SunShadows instance (birds cast into its near cascade only).
//
// update( dt, camera, player ): player = null for the free camera (it only scares animals when
// it is near the ground).
export class Wildlife {

	terrain:WildlifeTerrain; birdBatch:BirdBatch; critterBatch:CritterBatch; crabs:Crabs; blobs:ShadowBlobs;
	shorebirds:Shorebirds; water:WaterHeights; birds:Birds; viewer:Viewer; test:WildlifeTest | null; cpuMs:number;
	now:() => number;

	constructor( {
		scene, renderer = null, terrain, terrainGPU = null, shore = null, village = null, colliders = null, vegetation = null,
		boat = null, boatModel = null, query = null, spray = null, csm = null,
		globals = wildlifeGlobals(), layout = TIDEWATER_WILDLIFE_LAYOUT, storageBuffer = recordStorageBuffer, material = standInMaterial,
		swashGpu = recordedSwashGpu(), now = () => performance.now(),
	}:WildlifeOptions ) {

		this.now = now;
		this.terrain = terrain;
		this.birdBatch = new BirdBatch( { csm, storageBuffer, material } );
		scene.add( this.birdBatch.mesh );
		this.critterBatch = new CritterBatch( { storageBuffer, material } );
		scene.add( this.critterBatch.mesh );
		this.crabs = new Crabs( { terrain, village, colliders, vegetation, globals, layout } );
		this.blobs = new ShadowBlobs( { storageBuffer, material } );
		scene.add( this.blobs.mesh );
		let probe:SwashProbe | null = null;
		if ( shore && terrainGPU ) {

			try {

				probe = new SwashProbe( renderer, { shore, terrainGPU, gpu: swashGpu, globals } );

			} catch ( e ) {

				console.warn( 'Wildlife: swash probe unavailable', e );

			}

		}

		this.shorebirds = new Shorebirds( { terrain, probe, globals, layout } );
		this.water = new WaterHeights( query );
		this.birds = new Birds( { terrain, village, colliders, boat, boatModel, water: this.water, spray, globals, layout } );
		this.viewer = { x: 0, y: 0, z: 0, speed: 0, mode: 'walk', px: 0, pz: 0, init: false };
		this.test = null;
		this.cpuMs = 0;

	}

	// who the animals react to: the walker / swimmer / boat, or the free camera when near the ground
	updateViewer( dt:number, camera:WildlifeCamera, player:WildlifePlayer | null ) {

		const v = this.viewer;
		let x:number, y:number, z:number;
		if ( player ) {

			x = player.position.x; y = player.position.y; z = player.position.z;
			v.mode = player.mode;

		} else {

			x = camera.position.x; y = camera.position.y - 1.6; z = camera.position.z;
			v.mode = 'fly';

		}

		if ( ! v.init ) {

			v.px = x; v.pz = z;
			v.init = true;

		}

		const sp = Math.hypot( x - v.px, z - v.pz ) / Math.max( dt, 1e-3 );
		v.speed += ( Math.min( sp, 20 ) - v.speed ) * ( 1 - Math.exp( - dt * 4 ) );
		v.px = x; v.pz = z;
		v.x = x; v.y = y; v.z = z;
		// a camera flying well above the ground scares nothing
		const g = Math.max( this.terrain.heightAt( x, z ), 0 );
		return v.mode === 'fly' && y - g > 3 ? null : v;

	}

	update( dt:number, camera:WildlifeCamera, player:WildlifePlayer | null = null ) {

		const t0 = this.now();
		const viewer = this.updateViewer( dt, camera, player );
		this.birdBatch.begin();
		this.critterBatch.begin();
		this.blobs.begin();
		if ( this.test ) this.test( this.birdBatch, dt, this.critterBatch, this.blobs );
		else {

			this.birds.update( dt, viewer, this.birdBatch, camera );
			this.shorebirds.update( dt, viewer, this.birdBatch, camera, this.blobs );
			this.crabs.update( dt, viewer, this.critterBatch, camera, this.blobs );

		}

		this.birdBatch.commit();
		this.critterBatch.commit();
		this.blobs.commit();
		this.water.endFrame();
		this.cpuMs += ( this.now() - t0 - this.cpuMs ) * 0.05;

	}

}
