/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
// What the ported wildlife reads from outside src/world/wildlife: the engine's frame globals
// (src/core/Globals.js `G`), the world layout (src/world/WorldLayout.js `WORLD`), the spray kinds
// (src/fx/Spray.js `SPRAY`) and the duck-typed terrain, colliders, village, vegetation, boat, spray,
// water query and camera objects. The source imports the first three as module singletons; the port
// takes them as constructor options with these defaults, so a Genvr place can hand in its own.
import { Quaternion, Vector2, Vector3 } from 'three';

/** The `G` handles the wildlife reads (each a `{ value }` uniform in the source engine). */
export interface WildlifeGlobals {
	time:{ value:number };
	night:{ value:number };
	seaLevel:{ value:number };
	windDir:{ value:Vector2 };
	windSpeed:{ value:number };
	sunDir:{ value:Vector3 };
}

/** Default globals: noon, sea level 0, the plan's reference wind (0.35, 0.94) at 7 m/s. */
export function wildlifeGlobals():WildlifeGlobals {

	return {
		time: { value: 0 },
		night: { value: 0 },
		seaLevel: { value: 0 },
		windDir: { value: new Vector2( 0.35, 0.94 ).normalize() },
		windSpeed: { value: 7 },
		sunDir: { value: new Vector3( 0, 1, 0 ) },
	};

}

/** The parts of the source WORLD layout the wildlife uses (world metres, sea level 0, island to -z). */
export interface WildlifeLayout {
	beach:{ xMin:number; xMax:number };
	pier:{ x:number; zEnd:number; deckHeight:number; headDepth:number };
}

/** Source WorldLayout.js 11-20 (beach, pier). A Genvr place passes its own layout. */
export const TIDEWATER_WILDLIFE_LAYOUT:WildlifeLayout = {
	beach: { xMin: - 150, xMax: 170 },
	pier: { x: 55, zEnd: 40, deckHeight: 2.3, headDepth: 7 },
};

/** Source fx/Spray.js 46 SPRAY kinds (there is no FOAM: Birds.splash passes SPRAY.FOAM, i.e. undefined, as in the source). */
export const SPRAY = { DROPLET: 0, MIST: 1, LIGAMENT: 2, SPRAY: 3, SHEET: 4 } as const;

/** Ground height in world metres. Crabs also read the sand weight map (sandAt). */
export interface WildlifeTerrain {
	heightAt( x:number, z:number ):number;
	origin?:number;
	texel?:number;
	res?:number;
	sand?:ArrayLike<number>;
}

/** Source physics/Colliders.js surface: tagged boxes (pier rails) and the deck height query. */
export interface WildlifeColliders {
	boxes:{ tag?:string; center:Vector3; half:Vector3 }[];
	groundHeightAt( x:number, z:number, maxY:number ):number;
}

export interface WildlifeVillage {
	buildings?:{ x:number; z:number; stilts?:boolean; roofTop?:number }[];
	getFootprints?():{ x:number; z:number; r:number }[];
}

export interface WildlifeVegetation { records?:{ palms:{ x:number; y:number; z:number }[] } }

/** The moored boat (Boat.js) and its model (BoatModel.dimensions.houseRoofHeight). */
export interface WildlifeBoat {
	quaternion:Quaternion;
	driven?:boolean;
	speed:number;
	toWorld( local:Vector3, out:Vector3 ):Vector3;
}
export interface WildlifeBoatModel { dimensions?:{ houseRoofHeight:number } }

export interface SprayEmitOptions { spread:number; jitter:number; life:number }
/** Source fx/Spray.js emit( position, velocity, count, size, kind, options ). */
export interface WildlifeSpray {
	emit( position:Vector3, velocity:Vector3, count:number, size:number, kind:number | undefined, options:SprayEmitOptions ):void;
}

/** Recorder default for the spray: keeps every emit call (copies of the vectors). */
export class RecordedSpray implements WildlifeSpray {

	calls:{ position:number[]; velocity:number[]; count:number; size:number; kind:number | undefined; options:SprayEmitOptions }[] = [];

	emit( position:Vector3, velocity:Vector3, count:number, size:number, kind:number | undefined, options:SprayEmitOptions ) {

		this.calls.push( { position: position.toArray(), velocity: velocity.toArray(), count, size, kind, options: { ...options } } );

	}

}

/** Source WaterQuery surface (allocate slots, set points, CPU results 1-3 frames old). */
export interface WildlifeWaterQuery {
	allocate( owner:string, n:number ):number;
	setPoint( slot:number, x:number, z:number ):void;
	cpu:ArrayLike<number>;
	cpuValid:boolean;
}

/** Who the animals react to (Wildlife.viewer); null when nobody is near the ground. */
export interface Viewer { x:number; y:number; z:number; speed:number; mode:string; px:number; pz:number; init:boolean }

export interface WildlifeCamera { position:{ x:number; y:number; z:number } }
