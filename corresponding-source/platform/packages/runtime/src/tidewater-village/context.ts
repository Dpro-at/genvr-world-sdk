/** Types shared by the ported Tidewater village builders (Tidewater commit 4811ba48, MIT; LICENSE-tidewater.md). */
// The source passes plain duck-typed objects; these interfaces name what the builders call on them.
import type { Color, Vector3 } from 'three';
import type { Builder } from './geo-builder.js';
import type { Rand } from './props.js';

export interface ColliderOptions { tag?:string; walkable?:boolean; solid?:boolean }

/** Source physics/Colliders.js surface used by the village (the builders reuse the vectors they pass). */
export interface VillageColliders {
	addBox( center:Vector3, half:Vector3, yaw:number, opts?:ColliderOptions ):unknown;
	addCylinder( x:number, z:number, r:number, y0:number, y1:number, opts?:ColliderOptions ):unknown;
}

/** Ground height in world metres (sea level 0). `flatten` / `buildMinMax` are optional (Village._flattenPads). */
export interface VillageTerrain {
	heightAt( x:number, z:number ):number;
	flatten?( x:number, z:number, r:number, h:number, falloff:number ):void;
	buildMinMax?():void;
}

export interface VillageLight { position:Vector3; color:Color; intensity:number; kind:string }

export interface FoundationCheck { x:number; y:number; z:number }

/** Instanced props target (Props.js InstancedProps.add). */
export interface InstanceSink {
	add( type:string, x:number, y:number, z:number, ry?:number, color?:readonly number[] | null, rx?:number, rz?:number ):void;
}

/** Source `ctx( B )` of Village.js 90. */
export interface VillageContext {
	B:Builder;
	terrain:VillageTerrain;
	colliders:VillageColliders;
	rand:Rand;
	lights:VillageLight[];
	inst:InstanceSink;
	checks:FoundationCheck[];
}
