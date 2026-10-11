/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
// Source: src/world/wildlife/SwashProbe.js 1-133 (swash edge probe: inputs, dispatch cadence, CPU extrapolation).
// The engine compute kernel, storage buffers and readback are injected (`SwashProbeGpu`, recorder
// defaults); the WGSL kernel is kept as text and is not run here. The CPU side (set / clear / update
// cadence / get with the age extrapolation) is ported 1:1 and tested with recorded readbacks.
import { recordStorageBuffer, type StorageBufferFactory, type WgslModule, type WildlifeStorageBuffer } from './kit.js';
import { wildlifeGlobals, type WildlifeGlobals } from './context.js';

/** Source engine ComputeKernel options (gpu/Compute.js). */
export interface ComputeKernelOptions {
	label:string; modules:WgslModule[]; bindings:Record<string, { storage:WildlifeStorageBuffer; access:string }>;
	workgroupSize:[ number, number, number ]; code:string;
}
export interface SwashKernel { options?:ComputeKernelOptions; dispatch( x:number ):void }
/** Source engine Readback (gpu/Readback.js): request() returns whether a copy was queued. */
export interface SwashReadback { onData:( ( buf:ArrayBuffer ) => void ) | null; request( buffer:WildlifeStorageBuffer ):boolean }
export interface SwashProbeGpu {
	storageBuffer:StorageBufferFactory;
	computeKernel( options:ComputeKernelOptions ):SwashKernel;
	readback( options:{ byteLength:number; label:string } ):SwashReadback;
}

/** Recorder kernel: counts dispatches. */
export class RecordedKernel implements SwashKernel {

	options:ComputeKernelOptions;
	dispatches:number[] = [];
	constructor( options:ComputeKernelOptions ) { this.options = options; }
	dispatch( x:number ) { this.dispatches.push( x ); }

}

/** Recorder readback: queues every request; `deliver( data )` plays the GPU's answer. */
export class RecordedReadback implements SwashReadback {

	onData:( ( buf:ArrayBuffer ) => void ) | null = null;
	requests = 0;
	byteLength:number;
	constructor( options:{ byteLength:number; label:string } ) { this.byteLength = options.byteLength; }
	request() { this.requests ++; return true; }
	deliver( data:Float32Array ) { if ( this.onData ) this.onData( data.slice().buffer ); }

}

export const recordedSwashGpu = ():SwashProbeGpu => ( {
	storageBuffer: recordStorageBuffer,
	computeKernel: ( o ) => new RecordedKernel( o ),
	readback: ( o ) => new RecordedReadback( o ),
} );

/** Shore waves (ShoreWaves.js): its WGSL module and the swash period uniform. */
export interface SwashShore { module:WgslModule; period:{ value:number } }
export interface SwashTerrainGpu { module:WgslModule }
/** Result of SwashProbe.get. */
export interface SwashSample { runup:number; inland:number; speed:number; tau:number; x:number; z:number; age:number }

// Where is the edge of the swash? The run-up of the waves on the sand is analytic on the GPU
// (ShoreWaves); this evaluates it at a few points (the shorebirds) with the very same code the
// water uses, and reads the result back for the CPU (1-3 frames old, like WaterQuery).
//
// Per point: run-up of the current wave Rt and the point's own "inland" distance (both in metres
// up the beach, measured with the nominal beach slope), the speed of the leading edge (dRt/dt,
// > 0 while the water runs up) and the phase of the swash cycle.
//
// Consumes terrainHeightAt( xz ) (terrainGPU.module) and shoreEvaluateNoNormal( xz, depth, groundH )
// (shore.module). `renderer` is kept for the constructor signature (unused: the engine records the
// kernel into the frame encoder).

export class SwashProbe {

	renderer:unknown; shore:SwashShore; n:number; interval:number; _frame:number;
	inputs:Float32Array; inputBuffer:WildlifeStorageBuffer; results:WildlifeStorageBuffer; readback:SwashReadback;
	cpu:Float32Array; valid:boolean; issued:Float32Array; resultTime:number; _pending:boolean; _inputsCopy:Float32Array;
	active:boolean; kernel:SwashKernel; G:WildlifeGlobals; _issuedTime = 0;

	constructor( renderer:unknown, { shore, terrainGPU, count = 32, interval = 6, gpu = recordedSwashGpu(), globals = wildlifeGlobals() }:{
		shore:SwashShore; terrainGPU:SwashTerrainGpu; count?:number; interval?:number; gpu?:SwashProbeGpu; globals?:WildlifeGlobals;
	} ) {

		this.renderer = renderer;
		this.G = globals;
		this.shore = shore;
		this.n = count;
		this.interval = interval; // frames between dispatches (the owner extrapolates in between)
		this._frame = 0;
		this.inputs = new Float32Array( count * 4 );
		this.inputBuffer = gpu.storageBuffer( { label: 'swashProbeIn', count, type: 'vec4f' } );
		this.results = gpu.storageBuffer( { label: 'swashProbe', count, type: 'vec4f' } );
		this.readback = gpu.readback( { byteLength: count * 16, label: 'swashProbe' } );
		this.cpu = new Float32Array( count * 4 );
		this.valid = false;
		this.issued = new Float32Array( count * 4 ); // inputs of the latest result
		this.resultTime = 0;
		this._pending = false;
		this._inputsCopy = new Float32Array( count * 4 );
		this.active = false;

		this.kernel = gpu.computeKernel( {
			label: 'Swash Probe',
			modules: [ terrainGPU.module, shore.module ],
			bindings: {
				swashIn: { storage: this.inputBuffer, access: 'read' },
				swashOut: { storage: this.results, access: 'read_write' },
			},
			workgroupSize: [ 32, 1, 1 ],
			code: /* wgsl */`
@compute @workgroup_size( WG_X, WG_Y, WG_Z )
fn main( @builtin( global_invocation_id ) gid: vec3u ) {
	let i = gid.x;
	if ( i >= ${ count }u ) { return; }
	let q = swashIn[ i ];
	if ( q.w > 0.5 ) {
		let p = q.xy;
		let ground = terrainHeightAt( p );
		let sw = shoreEvaluateNoNormal( p, frame.seaLevel - ground, ground );
		swashOut[ i ] = vec4f( sw.runup, sw.inland, sw.dRdt, sw.tau );
	}
}
`,
		} );
		this.readback.onData = ( buf ) => {

			this.cpu.set( new Float32Array( buf ) );
			this.issued.set( this._inputsCopy );
			this.resultTime = this._issuedTime;
			this.valid = true;
			this._pending = false;

		};

	}

	set( i:number, x:number, z:number ) {

		const o = i * 4;
		this.inputs[ o ] = x;
		this.inputs[ o + 1 ] = z;
		this.inputs[ o + 3 ] = 1;
		this.active = true;

	}

	clear( i:number ) {

		this.inputs[ i * 4 + 3 ] = 0;

	}

	update() {

		if ( ! this.active ) return;
		this.active = false;
		if ( this._pending || ( this._frame ++ ) % this.interval !== 0 ) return;
		this.inputBuffer.write( this.inputs );
		this.kernel.dispatch( Math.ceil( this.n / 32 ) );
		this._issuedTime = this.G.time.value;
		this._inputsCopy.set( this.inputs );
		this._pending = this.readback.request( this.results );

	}

	// latest result for point i: { runup, inland, speed, tau, age } (null until one arrives)
	get( i:number, out:SwashSample ) {

		if ( ! this.valid || this.issued[ i * 4 + 3 ]! < 0.5 ) return null;
		const c = this.cpu, o = i * 4;
		const age = this.G.time.value - this.resultTime;
		const tau = c[ o + 3 ]! + age / Math.max( this.shore.period.value, 1 );
		out.inland = c[ o + 1 ]!;
		out.x = this.issued[ o ]!;
		out.z = this.issued[ o + 1 ]!;
		out.age = age;
		if ( tau < 1 ) {

			out.runup = c[ o ]! + c[ o + 2 ]! * age;
			out.speed = c[ o + 2 ]!;

		} else {

			// the next wave has reached the shoreline since: its edge races up the beach
			const t = ( tau - 1 ) * this.shore.period.value;
			out.speed = 3.2 * Math.max( 0.2, 1 - t / 3 );
			out.runup = 0.35 + 3.2 * t * ( 1 - t / 6 );

		}

		out.tau = tau % 1;
		return out;

	}

}
