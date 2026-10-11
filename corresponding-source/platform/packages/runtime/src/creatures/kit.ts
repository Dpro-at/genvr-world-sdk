/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
// Source: src/world/wildlife/Kit.js 1-188 (shared math, CPU quaternions, instance records, instanced mesh),
// plus mulberry32 of src/util/Noise.js 3-16 (the seeded generator every wildlife module draws from).
//
// The source renders with its own WebGPU engine (StorageBuffer, ShaderModule, Material taking WGSL
// snippets). Genvr renders with three.js, so the engine parts are injected: storage buffers through a
// `StorageBufferFactory` (default: a recorder that keeps the last upload), materials through a
// `WildlifeMaterialFactory` (default: a three.js stand-in that carries the source's WGSL options as
// data in `userData.wgsl`). The WGSL itself is kept 1:1 as text; it is not run by any test here.
import { BufferGeometry, Matrix4, Mesh, MeshStandardMaterial, Quaternion, Sphere, Vector3, type Camera, type Material } from 'three';

export type Q4 = [ number, number, number, number ];
export type V3 = [ number, number, number ];

export const TAU = Math.PI * 2;

export const clamp = ( x:number, a:number, b:number ) => x < a ? a : x > b ? b : x;
export const lerp = ( a:number, b:number, t:number ) => a + ( b - a ) * t;
export const smooth = ( a:number, b:number, x:number ) => {

	const t = clamp( ( x - a ) / ( b - a ), 0, 1 );
	return t * t * ( 3 - 2 * t );

};

// shortest signed angle a - b
export const angleDiff = ( a:number, b:number ) => {

	let d = ( a - b ) % TAU;
	if ( d > Math.PI ) d -= TAU;
	else if ( d < - Math.PI ) d += TAU;
	return d;

};

// exponential approach factor for a rate (1/s)
export const approach = ( rate:number, dt:number ) => 1 - Math.exp( - rate * dt );

/** Source util/Noise.js mulberry32: seeded uniform [0, 1) generator. */
export type Rng = () => number;
export function mulberry32( seed:number ):Rng {

	let a = seed >>> 0;
	return function () {

		a = ( a + 0x6D2B79F5 ) >>> 0;
		let t = a;
		t = Math.imul( t ^ ( t >>> 15 ), t | 1 );
		t ^= t + Math.imul( t ^ ( t >>> 7 ), t | 61 );
		return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;

	};

}

/** A WGSL module of the source engine (ShaderModule options), kept as data. */
export interface WgslModule { name:string; code:string; deps?:WgslModule[] }

// WGSL: rotate v by the unit quaternion q ( fn rotateQ( q: vec4f, v: vec3f ) -> vec3f )
export const kitModule:WgslModule = {
	name: 'wildlifeKit',
	code: /* wgsl */`
fn rotateQ( q: vec4f, v: vec3f ) -> vec3f { return v + cross( q.xyz, cross( q.xyz, v ) + v * q.w ) * 2.0; }
`,
};

// Motion vectors for animated instances: the camera motion (as for static geometry) plus the
// object's own motion. The three.js version added the object's own motion under the current
// camera to the static (camera) velocity; the engine's mesh shader projects the previous world
// position with the previous camera, which is the same to first order. Vertex snippets set the
// world position directly and hand the previous one:
//   v.useWorld = true; v.worldPos = world; v.worldNormal = n; v.prevWorldPos = world - delta;

// ---------------------------------------------------------------- CPU quaternions (plain arrays)

// q = [ x, y, z, w ]
export function qAxis( out:Q4, ax:number, ay:number, az:number, angle:number ) {

	const s = Math.sin( angle / 2 );
	out[ 0 ] = ax * s; out[ 1 ] = ay * s; out[ 2 ] = az * s; out[ 3 ] = Math.cos( angle / 2 );
	return out;

}

// out = a * b
export function qMul( out:Q4, a:Q4, b:Q4 ) {

	const ax = a[ 0 ], ay = a[ 1 ], az = a[ 2 ], aw = a[ 3 ];
	const bx = b[ 0 ], by = b[ 1 ], bz = b[ 2 ], bw = b[ 3 ];
	out[ 0 ] = ax * bw + aw * bx + ay * bz - az * by;
	out[ 1 ] = ay * bw + aw * by + az * bx - ax * bz;
	out[ 2 ] = az * bw + aw * bz + ax * by - ay * bx;
	out[ 3 ] = aw * bw - ax * bx - ay * by - az * bz;
	return out;

}

// rotation from yaw (about y), pitch (about the rotated x: nose up > 0) and roll (about the
// rotated z: right wing down > 0), for a body whose forward axis is +z
const _qa:Q4 = [ 0, 0, 0, 1 ], _qb:Q4 = [ 0, 0, 0, 1 ];
export function qYawPitchRoll( out:Q4, yaw:number, pitch:number, roll:number ) {

	qAxis( out, 0, 1, 0, yaw );
	qMul( out, out, qAxis( _qa, 1, 0, 0, - pitch ) );
	return qMul( out, out, qAxis( _qb, 0, 0, 1, roll ) );

}

// rotate the vector (x, y, z) by q into out ([ x, y, z ])
export function qRotate( out:V3, q:Q4, x:number, y:number, z:number ) {

	const qx = q[ 0 ], qy = q[ 1 ], qz = q[ 2 ], qw = q[ 3 ];
	const tx = 2 * ( qy * z - qz * y ), ty = 2 * ( qz * x - qx * z ), tz = 2 * ( qx * y - qy * x );
	out[ 0 ] = x + qw * tx + qy * tz - qz * ty;
	out[ 1 ] = y + qw * ty + qz * tx - qx * tz;
	out[ 2 ] = z + qw * tz + qx * ty - qy * tx;
	return out;

}

// quaternion that turns the +y axis onto the unit vector n and faces +z along the heading yaw
// (ground-aligned bodies)
const _m = new Matrix4(), _q = new Quaternion();
const _x = new Vector3(), _y = new Vector3(), _z = new Vector3();
export function qGround( out:Q4, yaw:number, nx:number, ny:number, nz:number ) {

	_y.set( nx, ny, nz );
	_z.set( Math.sin( yaw ), 0, Math.cos( yaw ) );
	_x.crossVectors( _y, _z ).normalize();
	_z.crossVectors( _x, _y );
	_m.makeBasis( _x, _y, _z );
	_q.setFromRotationMatrix( _m );
	out[ 0 ] = _q.x; out[ 1 ] = _q.y; out[ 2 ] = _q.z; out[ 3 ] = _q.w;
	return out;

}

// ---------------------------------------------------------------- engine stand-ins (injected)

/** Source engine StorageBuffer options (gpu/Texture.js). */
export interface StorageBufferOptions { label:string; count:number; type:string; data?:Float32Array }
/** What the wildlife code calls on a storage buffer. */
export interface WildlifeStorageBuffer { write( data:Float32Array ):void }
export type StorageBufferFactory = ( options:StorageBufferOptions ) => WildlifeStorageBuffer;

/** Default storage buffer: records the options, the initial data and a copy of the latest upload. */
export class RecordedStorageBuffer implements WildlifeStorageBuffer {

	options:StorageBufferOptions;
	data:Float32Array | null;
	writes = 0;

	constructor( options:StorageBufferOptions ) {

		this.options = options;
		this.data = options.data ?? null;

	}

	write( data:Float32Array ) {

		this.data = data.slice();
		this.writes ++;

	}

}

export const recordStorageBuffer:StorageBufferFactory = ( options ) => new RecordedStorageBuffer( options );

/** Options the source passes to its engine `new Material( ... )` (render/Material.js), kept as data. */
export interface WildlifeMaterialOptions {
	name:string;
	roughness?:number;
	metalness?:number;
	lit?:boolean;
	transparent?:boolean;
	blending?:string;
	depthWrite?:boolean;
	velocityWeight?:number;
	vertexColors?:boolean;
	underwaterLighting?:string;
	modules?:WgslModule[];
	uniforms?:Record<string, [ string, unknown ]>;
	storage?:Record<string, WildlifeStorageBuffer>;
	attributes?:Record<string, string>;
	varyings?:Record<string, string>;
	vertex?:string;
	surface?:string;
}
export type WildlifeMaterialFactory = ( options:WildlifeMaterialOptions ) => Material;

/** Default material: a three.js stand-in (the WGSL vertex animation is not ported) carrying the options. */
export const standInMaterial:WildlifeMaterialFactory = ( options ) => {

	const m = new MeshStandardMaterial( { roughness: options.roughness ?? 1, metalness: options.metalness ?? 0 } );
	m.name = options.name;
	m.userData.wgsl = options;
	return m;

};

// ---------------------------------------------------------------- instance records

// Per-instance data of an instanced template: `stride` vec4 per instance in a storage buffer
// (written on the CPU every frame, only the used part is uploaded).
export class InstanceRecords {

	max:number;
	stride:number;
	name:string;
	data:Float32Array;
	buffer:WildlifeStorageBuffer;
	count:number;

	constructor( name:string, max:number, stride:number, makeBuffer:StorageBufferFactory = recordStorageBuffer ) {

		this.max = max;
		this.stride = stride;
		this.name = name;
		this.data = new Float32Array( max * stride * 4 );
		this.buffer = makeBuffer( { label: name, count: max * stride, type: 'vec4f' } );
		this.count = 0;

	}

	// WGSL expression: the k-th vec4 of the current instance (in a vertex snippet; the material
	// binds `storage: { [ name ]: records.buffer }`)
	field( k:number ) {

		return `${ this.name }[ v.instance * ${ this.stride }u + ${ k }u ]`;

	}

	begin() {

		this.count = 0;

	}

	// float offset of a new record (or -1 when full)
	push() {

		if ( this.count >= this.max ) return - 1;
		return ( this.count ++ ) * this.stride * 4;

	}

	commit() {

		this.buffer.write( this.data.subarray( 0, Math.max( 1, this.count ) * this.stride * 4 ) );

	}

}

/** SunShadows surface read by instancedMesh (cascade cameras). */
export interface CascadeShadows { cascades?:{ camera:unknown }[] }

export type InstancedTemplate = BufferGeometry & { instanceCount:number };

// Instanced mesh drawing `records.count` instances; with a csm (SunShadows), shadows are cast into
// the near cascade only (the far cascades never see these small things).
export function instancedMesh( name:string, geometry:BufferGeometry, material:Material, records:InstanceRecords,
	{ csm = null, castShadow = false }:{ csm?:CascadeShadows | null; castShadow?:boolean } = {} ) {

	const g = new BufferGeometry() as InstancedTemplate;
	g.index = geometry.index;
	for ( const k in geometry.attributes ) g.setAttribute( k, geometry.attributes[ k ]! );
	g.instanceCount = 0;
	g.boundingSphere = new Sphere( new Vector3(), 1e5 );
	const mesh = new Mesh( g, material );
	mesh.name = name;
	mesh.frustumCulled = false;
	mesh.matrixAutoUpdate = false;
	mesh.castShadow = castShadow;
	mesh.receiveShadow = true;
	mesh.onBeforeRender = ( _renderer, _scene, camera:Camera ) => {

		let n = records.count;
		if ( csm && csm.cascades && camera ) {

			const i = csm.cascades.findIndex( ( c ) => c.camera === camera );
			if ( i > 0 ) n = 0;

		}

		g.instanceCount = n;

	};

	return mesh;

}
