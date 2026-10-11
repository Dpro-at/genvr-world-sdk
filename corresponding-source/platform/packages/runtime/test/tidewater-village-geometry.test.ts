import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as geo from '../src/tidewater-village/geo-builder.js';
import * as props from '../src/tidewater-village/props.js';
import * as walk from '../src/tidewater-village/boardwalk.js';
import * as pier from '../src/tidewater-village/pier.js';
import * as bld from '../src/tidewater-village/buildings.js';
import * as village from '../src/tidewater-village/village.js';
import * as mats from '../src/tidewater-village/materials.js';
import * as baker from '../src/tidewater-village/texture-baker.js';
import type { VillageContext as VillageContextForTest } from '../src/tidewater-village/context.js';

// Executes the ORIGINAL pinned Tidewater source (read only) against the installed three.js, with the
// engine-only GPU dependencies (ShaderModule, ComputeKernel, Texture, materials, FishProps) stubbed.
// Every test runs the port and the original with the same calls in the same order: GeoBuilder caches
// parts by rounded keys, so both module caches must see the same history.
type Fn = ( ...args:never[] ) => unknown;
type Mod = Record<string, unknown>;
const root = new URL( '../../../../tooling/other-programs/tidewater/src/', import.meta.url );
const read = ( path:string ) => readFileSync( new URL( path, root ), 'utf8' );
const strip = ( text:string ) => text.replace( /^import[\s\S]*?from\s*'[^']*';\r?\n/gm, '' ).replace( /^export /gm, '' );
function load( path:string, deps:Mod, names:string[] ):Mod {

	return new Function( ...Object.keys( deps ), strip( read( path ) ) + `;return {${ names.join( ',' ) }};` )( ...Object.values( deps ) ) as Mod;

}

const noise = read( 'util/Noise.js' );
const ns = noise.indexOf( 'export function mulberry32' );
const mulberry32 = new Function( strip( noise.slice( ns, noise.indexOf( '\n}', ns ) + 2 ) ) + ';return mulberry32;' )() as ( s:number ) => () => number;

// fish displays (fish/FishProps.js, fish task) -> one recorder class shared by both sides
class StubFishProps {

	items:unknown[] = [];
	add( kind:string, species:string | null, m:THREE.Matrix4, pose:string, len:number, o:Record<string, unknown> ) {

		this.items.push( { kind, species, m: m.toArray(), pose, len, o: { ...o } } );

	}

	build() { const g = new THREE.Group(); g.userData.fishItems = this.items; return g; }
	static tailAnchor( s:string ) { return [ 0, 0, 0.5 - s.length * 0.031 ]; }
	static gillAnchor( s:string ) { return [ 0, s.length * 0.004, 0.5 - s.length * 0.02 ]; }
	static restHeight( s:string, L:number ) { return s.length * 0.003 * L; }

}

const { BufferGeometry, Euler, Float32BufferAttribute, Matrix3, Matrix4, Quaternion, Uint16BufferAttribute, Uint32BufferAttribute, Vector3, Color, CatmullRomCurve3, Group, Mesh } = THREE;
const G = load( 'world/village/GeoBuilder.js', { BufferGeometry, Euler, Float32BufferAttribute, Matrix3, Matrix4, Quaternion, Uint16BufferAttribute, Uint32BufferAttribute, Vector3 },
	[ 'Part', 'boxPart', 'gridPart', 'cylPart', 'lathePart', 'torusPart', 'tubePart', 'planePart', 'quad01Part', 'slabPart', 'fixWinding', 'gablePart', 'Batch', 'mat4', 'Builder', 'sagPoints', 'END_GRAIN_U', 'CAP_U' ] );
const PROPS = [ 'lin', 'mulc', 'WOOD', 'HARD', 'C', 'Rand', 'bollard', 'cleat', 'tireFender', 'ropeCoil', 'ropeLoop', 'lifeRing', 'lantern', 'wallLantern', 'lampPost', 'pathLight', 'bench', 'bucket',
	'fish', 'iceBed', 'bananaLeaf', 'lobster', 'fishTwine', 'sHook', 'cleaningTable', 'buoy', 'buoyString', 'oar', 'rowboat', 'wreck', 'netRack', 'fishRack', 'fence', 'waterTank', 'woodpile', 'flagPole', 'laundryLine', 'InstancedProps' ];
const P = load( 'world/Props.js', { Color, Matrix4, Vector3, Builder: G.Builder, mat4: G.mat4, gridPart: G.gridPart, slabPart: G.slabPart, sagPoints: G.sagPoints, FishProps: StubFishProps, mulberry32 }, PROPS );
const W = load( 'world/WorldLayout.js', { THREE }, [ 'WORLD' ] );
const BW = load( 'world/village/Boardwalk.js', { CatmullRomCurve3, Color, Vector3, WOOD: P.WOOD, pathLight: P.pathLight }, [ 'buildBoardwalk' ] );
const pick = ( src:Mod, names:string[] ) => Object.fromEntries( names.map( ( n ) => [ n, src[ n ] ] ) );
const PI = load( 'world/Pier.js', { Color, Vector3, WORLD: W.WORLD, ...pick( P, [ 'WOOD', 'HARD', 'C', 'lin', 'bollard', 'cleat', 'tireFender', 'ropeCoil', 'ropeLoop', 'lifeRing', 'lampPost', 'bench', 'cleaningTable', 'buoyString', 'bucket', 'lantern' ] ) }, [ 'buildPier', 'PIER' ] );
const BU = load( 'world/village/Buildings.js', { Color, Matrix4, Vector3, slabPart: G.slabPart, quad01Part: G.quad01Part, gridPart: G.gridPart, mulberry32,
	...pick( P, [ 'WOOD', 'HARD', 'C', 'lin', 'wallLantern', 'lantern', 'buoyString', 'waterTank', 'woodpile', 'rowboat', 'oar', 'flagPole', 'bucket', 'fish', 'iceBed', 'bananaLeaf', 'lobster', 'fishTwine', 'sHook', 'Rand' ] ) },
[ 'buildHouse', 'buildBoathouse', 'buildMarketStall', 'buildShed' ] );
const wind = { windSpeed: { value: 7 }, windDir: { value: { x: 0.35, y: 0.94 } } };
class StubTextures { bytes = 0; bakeMs = 0; baked = false; textures = {}; bake() {} dispose() {} }
const VI = load( 'world/Village.js', {
	BufferGeometry, Color, Euler, Group, Mesh, Vector3, mulberry32, Builder: G.Builder, Batch: G.Batch,
	createVillageMaterials: () => ( {} ), VillageTextures: StubTextures, ...BU, buildBoardwalk: BW.buildBoardwalk, buildPier: PI.buildPier, PIER: PI.PIER, G: wind,
	...pick( P, [ 'InstancedProps', 'Rand', 'lin', 'C', 'WOOD', 'rowboat', 'netRack', 'fishRack', 'fence', 'laundryLine', 'oar', 'buoy', 'bench', 'ropeCoil', 'pathLight', 'lampPost', 'bucket', 'wreck' ] ),
}, [ 'Village' ] );

// ---------------------------------------------------------------------------- comparison helpers

/** First index where two number arrays differ bit for bit (float64, -0 and NaN included), or -1. */
function firstDiff( a:ArrayLike<number>, b:ArrayLike<number>, float32 = false ) {

	if ( a.length !== b.length ) return - 2;
	const A = float32 ? Float32Array.from( a ) : Float64Array.from( a ), B = float32 ? Float32Array.from( b ) : Float64Array.from( b );
	if ( Buffer.from( A.buffer ).equals( Buffer.from( B.buffer ) ) ) return - 1;
	for ( let i = 0; i < A.length; i ++ ) if ( ! Object.is( A[ i ], B[ i ] ) ) return i;
	return - 3;

}

type BatchLike = { pos:number[]; nrm:number[]; uv:number[]; tint:number[]; data:number[]; idx:number[]; vcount:number };
type BuilderLike = { batches:Record<string, BatchLike | undefined>; fishProps?:unknown };

function expectSameBatch( a:BatchLike, b:BatchLike, label:string ) {

	expect( a.vcount, label ).toBe( b.vcount );
	for ( const k of [ 'pos', 'nrm', 'uv', 'tint', 'data', 'idx' ] as const ) expect( firstDiff( a[ k ], b[ k ] ), `${ label }.${ k }` ).toBe( - 1 );

}

function expectSameBuilder( a:BuilderLike, b:BuilderLike ) {

	expect( Object.keys( a.batches ) ).toEqual( Object.keys( b.batches ) );
	for ( const k of Object.keys( a.batches ) ) expectSameBatch( a.batches[ k ]!, b.batches[ k ]!, k );
	expect( ( a.fishProps as StubFishProps | undefined )?.items ).toEqual( ( b.fishProps as StubFishProps | undefined )?.items );

}

function expectSameGeometry( a:THREE.BufferGeometry, b:THREE.BufferGeometry, label:string ) {

	expect( Object.keys( a.attributes ), label ).toEqual( Object.keys( b.attributes ) );
	for ( const name of Object.keys( a.attributes ) ) {

		const x = a.getAttribute( name ) as THREE.BufferAttribute, y = b.getAttribute( name ) as THREE.BufferAttribute;
		expect( [ x.itemSize, x.count ], `${ label }.${ name }` ).toEqual( [ y.itemSize, y.count ] );
		expect( x.array.constructor ).toBe( Float32Array );
		expect( firstDiff( x.array, y.array, true ), `${ label }.${ name }` ).toBe( - 1 );

	}

	expect( a.index!.array.constructor, label ).toBe( b.index!.array.constructor );
	expect( firstDiff( a.index!.array, b.index!.array ), `${ label }.index` ).toBe( - 1 );
	expect( a.boundingBox, label ).toEqual( b.boundingBox );
	expect( a.boundingSphere, label ).toEqual( b.boundingSphere );

}

/** Records collider calls (the builders reuse the vectors they pass, so values are copied). */
class ColliderLog {

	log:unknown[] = [];
	addBox( c:THREE.Vector3, h:THREE.Vector3, yaw:number, opts?:object ) { this.log.push( [ 'box', c.x, c.y, c.z, h.x, h.y, h.z, yaw, { ...opts } ] ); }
	addCylinder( x:number, z:number, r:number, y0:number, y1:number, opts?:object ) { this.log.push( [ 'cyl', x, z, r, y0, y1, { ...opts } ] ); }

}

/** Deterministic island-like test ground with optional pads (Village._flattenPads). */
class TestTerrain {

	pads:{ x:number; z:number; r:number; h:number; f:number }[] = [];
	minMax = 0;
	constructor( readonly k = 0 ) {}
	heightAt( x:number, z:number ) {

		let h = ( - z - 42 ) * ( 0.07 + this.k * 0.01 ) + 0.6 * Math.sin( x * 0.11 + this.k ) * Math.cos( z * 0.07 ) + 0.25 * Math.sin( x * 0.37 + z * 0.23 );
		for ( const p of this.pads ) {

			const d = Math.hypot( x - p.x, z - p.z );
			if ( d >= p.r + p.f ) continue;
			const t = d <= p.r ? 1 : 1 - ( d - p.r ) / p.f;
			h += ( p.h - h ) * t * t * ( 3 - 2 * t );

		}

		return h;

	}

	flatten( x:number, z:number, r:number, h:number, f:number ) { this.pads.push( { x, z, r, h, f } ); }
	buildMinMax() { this.minMax ++; }

}

const lightRows = ( lights:{ position:THREE.Vector3; color:THREE.Color; intensity:number; kind:string }[] ) => lights.map( ( l ) => [ ...l.position.toArray(), ...l.color.toArray(), l.intensity, l.kind ] );

/** Runs one builder function on the port and on the original with the same fresh context. */
function both<T>( seed:number, k:number, run:( side:'port' | 'orig', ctx:Record<string, unknown> ) => T ) {

	const make = ( side:'port' | 'orig' ) => {

		const B = side === 'port' ? new geo.Builder() : new ( G.Builder as new () => BuilderLike )();
		const ctx = {
			B, terrain: new TestTerrain( k ), colliders: new ColliderLog(), lights: [] as never[], checks: [] as unknown[],
			rand: side === 'port' ? new props.Rand( props.mulberry32( seed ) ) : new ( P.Rand as new ( f:() => number ) => unknown )( mulberry32( seed ) ),
			inst: side === 'port' ? new props.InstancedProps( B as geo.Builder ) : new ( P.InstancedProps as new ( b:unknown ) => unknown )( B ),
		};
		const result = run( side, ctx );
		return { ctx, result };

	};

	const a = make( 'port' ), b = make( 'orig' );
	expectSameBuilder( a.ctx.B as BuilderLike, b.ctx.B as BuilderLike );
	expect( ( a.ctx.colliders as ColliderLog ).log ).toEqual( ( b.ctx.colliders as ColliderLog ).log );
	expect( lightRows( a.ctx.lights ) ).toEqual( lightRows( b.ctx.lights ) );
	expect( a.ctx.checks ).toEqual( b.ctx.checks );
	expect( ( a.ctx.inst as props.InstancedProps ).counts ).toEqual( ( b.ctx.inst as props.InstancedProps ).counts );
	return { port: a, orig: b };

}

const layout = village.villageLayout( new props.Rand( props.mulberry32( village.VILLAGE_SEED ) ) );
let previousFish:props.FishPropsApi;
beforeAll( () => { previousFish = props.setFishProps( StubFishProps ); } );
afterAll( () => { props.setFishProps( previousFish ); } );

// ---------------------------------------------------------------------------- tests

describe( 'pinned source village geo builder', () => {

	it( 'keeps the source constants and colour conversion', () => {

		expect( [ geo.END_GRAIN_U, geo.CAP_U ] ).toEqual( [ G.END_GRAIN_U, G.CAP_U ] );
		expect( props.C ).toEqual( P.C );
		expect( props.lin( 0x5dbcb0 ) ).toEqual( ( P.lin as Fn )( 0x5dbcb0 as never ) );
		// three's colour management converts sRGB hex to linear, as the source engine's Color.setHex
		const s = 0x5d / 255;
		expect( props.lin( 0x5dbcb0 )[ 0 ] ).toBeCloseTo( Math.pow( s * 0.9478672986 + 0.0521327014, 2.4 ), 12 );
		expect( props.WOOD( 0.3, 0.8, 0.5, 7 ) ).toEqual( ( P.WOOD as Fn )( 0.3 as never, 0.8 as never, 0.5 as never, 7 as never ) );
		expect( props.HARD( 0.3 ) ).toEqual( ( P.HARD as Fn )( 0.3 as never ) );

	} );

	it.each( [ 1, 2, 3 ] )( 'matches every primitive part bit for bit (parameter set %i)', ( k ) => {

		const parts = ( g:Mod ) => {

			const f = ( n:string, ...a:unknown[] ) => ( g[ n ] as ( ...x:unknown[] ) => { p:Float32Array; n:Float32Array; uv:Float32Array; idx:number[] } )( ...a );
			const V = ( x:number, y:number, z:number ) => new Vector3( x, y, z );
			return [
				f( 'boxPart', 0.3 * k, 0.07, 1.2 + k ), f( 'boxPart', 0.11, 2.4 * k, 0.11, 1, 12 ), f( 'boxPart', 1.9, 0.52, 0.05, 0, 35 + k ), f( 'boxPart', 0.5, 0.5, 0.5, 2, 8 ),
				f( 'cylPart', 0.1 * k, 0.12, 3.1, 8 + k ), f( 'cylPart', 0.6, 0.6, 1.25, 20, false, false, true, 1.68 ), f( 'cylPart', 0.02, 0.12, 0.1, 6, true, true, false, 1 ), f( 'cylPart', 0, 0.2, 0.3, 5, true, true ),
				f( 'lathePart', [ [ 0, 0 ], [ 0.21, 0 ], [ 0.21, 0.045 ], [ 0.21, 0.045 ], [ 0.14, 0.075 ], [ 0.11 * k, 0.3 ], [ 0, 0.5 ] ], 14 ),
				f( 'lathePart', [ [ 0.25, 0 ], [ 0.27, 0.3 ], [ 0.25, 0.88 ] ], 14, 0.27, 1 ), f( 'lathePart', [ [ 0, 0 ], [ 0.05, 0.02 ], [ 0, 0.09 * k ] ], 8, null, 2 ),
				f( 'torusPart', 0.27, 0.1, 7, 16 ), f( 'torusPart', 0.14, 0.006, 4, 10, Math.PI * k / 2 ),
				f( 'tubePart', g.sagPoints === undefined ? [] : ( g.sagPoints as Fn )( [ - 0.05, 2.3, 0 ] as never, [ 0.12, 1.9, k * 0.1 ] as never, 0.02 as never, 4 as never ), 0.016 ),
				f( 'tubePart', [ V( 0, 0, 0 ), V( 0, 1, 0 ), V( 0, 2, 0.001 ), V( 0.3 * k, 3, 0 ) ], 0.05, 6 ),
				f( 'planePart', 1.2, 0.8 * k, 3, 4, true ), f( 'planePart', 0.5, 0.5, 1, 1 ), f( 'quad01Part', 0.46, 0.4 * k ),
				f( 'slabPart', [ V( - 1, 2, 1 ), V( 1, 2, 1 ), V( 1, 3, 0 ), V( - 1, 3, 0 ) ], 0.06 * k, V( 0, 1, - 1 ).normalize(), V( 0, 1, 0 ) ),
				f( 'slabPart', [ V( 0, 0, 0 ), V( 0.19, 0, - 0.004 ), V( 0, 0, - 0.01 ) ], 0.0016, null, V( 0, - 1, 0 ) ),
				f( 'slabPart', [ V( 0, 0, 1 ), V( 0, 1, 0.5 * k ), V( 0, 0, 0 ) ], 0, V( 0, 0, 1 ), V( 1, 0, 0 ) ),
				f( 'gablePart', 2 * k, 1.1, 0.14 ),
			];

		};

		const ours = parts( geo as unknown as Mod ), theirs = parts( G );
		expect( ours.length ).toBe( theirs.length );
		ours.forEach( ( a, i ) => {

			const b = theirs[ i ]!;
			for ( const key of [ 'p', 'n', 'uv' ] as const ) expect( firstDiff( a[ key ], b[ key ], true ), `part ${ i }.${ key }` ).toBe( - 1 );
			expect( a.idx, `part ${ i }.idx` ).toEqual( b.idx );
			expect( a.p.length / 3 ).toBe( a.n.length / 3 );
			for ( const j of a.idx ) expect( j ).toBeLessThan( a.p.length / 3 );

		} );

	} );

	it.each( [ 3, 17, 90210 ] )( 'builds the same merged batches with a transform stack (seed %i)', ( seed ) => {

		const scene = ( g:Mod, B:geo.Builder ) => {

			const r = mulberry32( seed );
			B.pushAt( r() * 9, r(), r() * 9, r() * 6, r() * 0.2, r() * 0.2 );
			B.box( 'wood', 0, 0.5, 0, 1.2, 0.4 + r(), 0.3, { grain: 1, skip: 8, rx: r(), tint: [ r(), r(), r() ], data: [ r(), 0.6, 7, 0.8 ] } );
			B.box( 'stone', 1, 0, 0, 0.3, 0.3, 0.3, { sx: - 1, tint: { r: 0.3, g: 0.2, b: 0.1 } } ); // mirrored: flipped winding
			B.cyl( 'roofMetal', 0, 1, 0, 0.6, 0.6, 1.25, { segs: 20, swapUV: true, capTop: false } );
			B.cyl( 'wood', 0, 1, 0, 0.1, 0.12, 2, { rx: r() * 0.03, tint: ( x, y ) => [ y, 0.5, x ] } );
			B.lathe( 'hard', 0, 0, 2, [ [ 0, 0 ], [ 0.1, 0 ], [ 0.1, 0 ], [ 0.135, 0.28 ], [ 0, 0.3 ] ], { segs: 12, data: ( x, y, z, i ) => [ i, x, y, z ] } );
			B.torus( 'rope', 0, 1, 0, 0.3, 0.02, { rx: 0.18, radial: 5, tubular: 14, data: [ r(), 0, 0, 0 ] } );
			B.torus( 'hard', 0, 1, 0, 0.3, 0.1, { arc: Math.PI, rz: Math.PI / 2 } );
			B.beam( 'wood', [ 0, 0, 0 ], [ 2, 1 + r(), 3 ], 0.05, 0.2, { roll: - 0.4, extend: 0.06 } );
			B.beam( 'wood', [ 0, 0, 0 ], [ 0, 3, 0.01 ], 0.1, 0.1 ); // nearly vertical: X as up
			B.beam( 'wood', [ 1, 1, 1 ], [ 1, 1, 1 ], 0.1, 0.1 ); // zero length: nothing
			B.rod( 'hard', [ 0, 0.1, 0 ], [ 0.2, 0.1 + r(), 0 ], 0.026, 0.013, { segs: 8 } );
			B.tube( 'rope', ( g.sagPoints as Fn )( [ 0, 2, 0 ] as never, [ 3, 2, 1 ] as never, 0.3 as never, 8 as never ) as THREE.Vector3[], 0.02, { tint: [ 1, 0, 0 ] } );
			B.slab( 'thatch', [ new Vector3( - 1, 2, 1 ), new Vector3( 1, 2, 1 ), new Vector3( 0, 3, 0 ) ], 0.28, { uDir: new Vector3( 0, 1, - 1 ).normalize(), up: new Vector3( 0, 1, 0 ) } );
			B.part( 'glass', ( g.quad01Part as Fn )( 0.5 as never, 0.7 as never ) as geo.Part, 0, 1.5, 0.01, { ry: 0.2, data: [ 0.1, 0, 1, 0 ] } );
			const w = B.toWorld( 1, 2, 3 );
			B.pop();
			return w.toArray();

		};

		const a = new geo.Builder(), b = new ( G.Builder as new () => geo.Builder )();
		expect( scene( geo as unknown as Mod, a ) ).toEqual( scene( G, b ) );
		expectSameBuilder( a as unknown as BuilderLike, b as unknown as BuilderLike );
		expect( a.triangles ).toBe( b.triangles );
		expect( a.stack.length ).toBe( 0 );
		for ( const key of Object.keys( a.batches ) ) {

			const ours = a.batches[ key ]!.build(), theirs = b.batches[ key ]!.build();
			expectSameGeometry( ours, theirs, key );
			// unit normals, index inside the vertex range
			const n = ours.getAttribute( 'normal' );
			for ( let i = 0; i < n.count; i ++ ) expect( Math.hypot( n.getX( i ), n.getY( i ), n.getZ( i ) ) ).toBeCloseTo( 1, 5 );
			expect( Math.max( ...ours.index!.array ) ).toBeLessThan( n.count );
			ours.dispose(); theirs.dispose();

		}

	} );

	it( 'stamps, appends and switches to 32-bit indices like the source', () => {

		const run = ( g:Mod ) => {

			const B = new ( g.Builder as new () => geo.Builder )();
			B.box( 'wood', 0, 0, 0, 1, 1, 1, { tint: [ 0.5, 0.6, 0.7 ], data: [ 0.25, 0.5, 2, 0.9 ] } );
			const big = new ( g.Batch as new () => geo.Batch )();
			const m = new Matrix4();
			for ( let i = 0; i < 2800; i ++ ) big.addBatch( B.batches.wood!, ( g.mat4 as typeof geo.mat4 )( i * 0.1, 0, - i * 0.05, i * 0.3, 0.1, - 0.2, m ), i % 2 ? [ 0.9, 1, 1.1 ] : null, i * 0.37 );
			big.append( B.batches.wood!, ( d ) => [ d[ 0 ]!, 0, 0, 2 + d[ 1 ]! ] );
			return big;

		};

		const ours = run( geo as unknown as Mod ), theirs = run( G );
		expectSameBatch( ours as unknown as BatchLike, theirs as unknown as BatchLike, 'stamped' );
		expect( ours.vcount ).toBeGreaterThan( 65535 );
		const a = ours.build(), b = theirs.build();
		expect( a.index!.array ).toBeInstanceOf( Uint32Array );
		expectSameGeometry( a, b, 'stamped' );

	} );

} );

describe( 'pinned source props, pier, boardwalk and buildings', () => {

	it.each( [ 5, 77 ] )( 'matches every prop emitter (seed %i)', ( seed ) => {

		both( seed, 0, ( side, ctx ) => {

			const M = side === 'port' ? props as unknown as Mod : P;
			const B = ctx.B, R = ctx.rand, call = ( n:string, ...a:unknown[] ) => ( M[ n ] as ( ...x:unknown[] ) => unknown )( B, ...a );
			const out:unknown[] = [];
			call( 'bollard', 1, 2, 3, 0.4 ); call( 'cleat', 0, 2, 1, 0.5, 0.2 ); call( 'tireFender', 0, 2.2, 0, 0.3, 0.7, 0.1 );
			call( 'ropeCoil', 1, 0, 1, 0.08, 0.3, 4, 0.2 ); call( 'ropeLoop', 0, 2, 0, 0.155, [ 1, 0.5, 0.2 ], 0.3 ); call( 'ropeLoop', 0, 2, 0, 0.1 );
			call( 'lifeRing', 2, 2.8, 1, 0.3, 0.6 ); out.push( call( 'lantern', 0, 3, 0, 0.4, 0.9 ) ); out.push( ( call( 'wallLantern', 0, 2, 0, 0.3 ) as THREE.Vector3 ).toArray() );
			out.push( ( call( 'lampPost', 1, 2.3, 1, - 1.57, 3.1, 0.7 ) as THREE.Vector3 ).toArray() ); out.push( ( call( 'pathLight', 3, 0, 3, 0.2 ) as THREE.Vector3 ).toArray() );
			call( 'bench', 0, 2.3, 39, 0, 1.7, 0.5 ); call( 'bench', 0, 0, 0, 0.9, 1.6, 0.1, ( M.lin as Fn )( 0x4f8fa0 as never ) );
			call( 'bucket', 0, 0, 0 ); call( 'cleaningTable', 58.3, 2.3, 39.1, 0.2, 0.4 );
			for ( const kind of [ 0, 1, 2 ] ) call( 'buoy', kind, 0, 0, ( M.C as typeof props.C ).orange, ( M.C as typeof props.C ).white, kind, 0.3, { rz: 0.2, ry: 1 } );
			call( 'buoyString', [ 48, 3.27, 34 ], [ 48, 3.27, 35.9 ], 4, R, 0.22 );
			call( 'oar', [ 0, 0, 0 ], [ 0.3, 0.2, 2.6 ], 0.3 ); call( 'oar', [ 0, 0, 0 ], [ 0, 2, 0.2 ], 0.4, ( M.lin as Fn )( 0xc23b2e as never ) );
			call( 'rowboat', 1, 0, 1, 0.4, { seed: 0.3, rz: 0.1 } ); call( 'rowboat', 5, 0, 1, 1.2, { upsideDown: true, seed: 0.6 } );
			call( 'rowboat', 9, 0, 1, - 0.3, { seed: 0.9, oars: false, length: 4.2, interior: false, upsideDown: true } );
			call( 'wreck', 2, - 0.1, 3, 0.95, R, { rz: 0.22, beam: 3.1, depth: 1.05 } );
			const gf = ( x:number, z:number ) => Math.sin( x ) * 0.2 + z * 0.01;
			call( 'netRack', 4, 0.3, 4, 0.25, 3.2, ( M.lin as Fn )( 0x3f6f5f as never ), 0.4, gf ); call( 'netRack', 0, 0.3, 0, 0.1 );
			call( 'fishRack', 3, 0.2, - 2, 0.2, 2.6, 0.31, R ); call( 'fishRack', 3, 0.2, - 2, - 0.25, 2.4, 0.71 );
			call( 'fence', [ [ 5.2, - 1.5 ], [ 5.6, - 8.5 ], [ 9.0, - 11.2 ] ], gf, 'picket', ( M.C as typeof props.C ).white, 0.4, ctx.colliders, ( x:number, z:number ) => new Vector3( x, 0, z ) );
			call( 'fence', [ [ 1, 1 ], [ 3, 7 ] ], gf, 'rail' );
			out.push( call( 'waterTank', 1, 0.2, 1, 0.5, true ), call( 'waterTank', 4, 0.2, 1, 0.6, false ) );
			call( 'woodpile', 0, 0, 0, 0.4, R ); call( 'flagPole', 2, 0.3, 2, 5.5, ( M.lin as Fn )( 0x2f6fb0 as never ), 0.8 );
			call( 'laundryLine', [ 7.8, 2.1, - 12 ], [ 12.6, 2.2, - 14 ], R, [ ( M.C as typeof props.C ).red, ( M.C as typeof props.C ).blue ] );
			out.push( call( 'sHook', 0, 2.5, 0, 0.06, 0.3 ) ); call( 'fishTwine', [ 0, 2, 0 ], [ 0, 1.8, 0 ], 0.3, 0.012 );
			call( 'fish', 0, 1, 0, { species: 'tuna', pose: 'tail', kind: 'split', ry: 0.3 } ); call( 'fish', 0, 1, 0, { pose: 'gill' } ); call( 'fish', 0, 1, 0, { flip: true, len: 0.3 } );
			call( 'iceBed', 0, 1, 0, 0.25, 0.3 ); call( 'bananaLeaf', 0, 1, 0, 0.3, 0.44, 0.2, 0.5 ); call( 'lobster', 0, 1, 0, 0.6, 0.26, 0.5, 0.1 );
			const inst = ctx.inst as props.InstancedProps;
			for ( let i = 0; i < 4; i ++ ) for ( const t of [ 'barrel', 'crate', 'trap' ] ) inst.add( t, i, 0, - i, i * 0.4, i % 2 ? [ 0.9, 0.85, 0.8 ] : null, 0.1, - 0.1 );
			return out;

		} );

	} );

	it( 'builds the source pier: piles, bents, deck, T-head, sign, hung lanterns', () => {

		const { port, orig } = both( 90210, 0, ( side, ctx ) => {

			const signB = side === 'port' ? new geo.Builder() : new ( G.Builder as new () => BuilderLike )();
			const hung:BuilderLike[] = [];
			const hang = () => { const b = side === 'port' ? new geo.Builder() : new ( G.Builder as new () => BuilderLike )(); hung.push( b as BuilderLike ); return b; };
			const info = ( side === 'port' ? pier.buildPier : PI.buildPier as typeof pier.buildPier )( { ...ctx, signB, hang } as never );
			return { info, signB, hung };

		} );
		expectSameBuilder( port.result.signB as unknown as BuilderLike, orig.result.signB as unknown as BuilderLike );
		expect( port.result.hung.length ).toBe( 11 ); // 9 lamp posts + 2 arch lanterns
		port.result.hung.forEach( ( b, i ) => expectSameBuilder( b, orig.result.hung[ i ]! ) );
		const pi = port.result.info, oi = orig.result.info as pier.PierInfo;
		const vec = ( v:THREE.Vector3 | undefined ) => v?.toArray();
		expect( pi.lamps.map( vec ) ).toEqual( oi.lamps.map( vec ) );
		expect( pi.bollards.map( vec ) ).toEqual( oi.bollards.map( vec ) );
		expect( [ vec( pi.signPivot ), vec( pi.stepFoot ), vec( pi.ladder ) ] ).toEqual( [ vec( oi.signPivot ), vec( oi.stepFoot ), vec( oi.ladder ) ] );
		expect( pi.hung.map( ( h ) => [ ...h.pivot.toArray(), ...h.rest.toArray(), ...h.live.toArray() ] ) ).toEqual( oi.hung.map( ( h ) => [ ...h.pivot.toArray(), ...h.rest.toArray(), ...h.live.toArray() ] ) );
		expect( pier.PIER ).toEqual( PI.PIER );
		expect( pier.WORLD_PIER ).toEqual( ( W.WORLD as { pier:unknown } ).pier );
		// plan task 16: pier at x 55 from z -64 to 40 (length 104), deck 2.3 m, bents every ~3 m, T-head 3 x 5 piles
		expect( [ pier.PIER.x, pier.PIER.zStart, pier.PIER.zEnd, pier.PIER.deck ] ).toEqual( [ 55, - 64, 40, 2.3 ] );
		const piles = ( port.ctx.colliders as ColliderLog ).log.filter( ( c ) => ( c as unknown[] )[ 6 ] && ( ( c as unknown[] )[ 6 ] as { tag:string } ).tag === 'pile' ) as number[][];
		const walkway = piles.filter( ( c ) => Math.abs( Math.abs( c[ 1 ]! - 55 ) - pier.PIER.pileOff ) < 1e-9 );
		const bentZ = [ ...new Set( walkway.map( ( c ) => c[ 2 ]! ) ) ];
		expect( bentZ.length ).toBe( 33 );
		const gaps = bentZ.slice( 1 ).map( ( z, i ) => z - bentZ[ i ]! );
		for ( const g of gaps ) expect( g ).toBeCloseTo( ( 33.25 + 63.65 ) / 32, 10 );
		expect( walkway.length ).toBe( 66 );
		expect( piles.length - walkway.length ).toBe( 14 ); // 3 rows x 5 minus the walkway slot
		expect( new Set( walkway.map( ( c ) => c[ 1 ] ) ) ).toEqual( new Set( [ 55 - pier.PIER.pileOff, 55 + pier.PIER.pileOff ] ) );

	} );

	it( 'builds the pier without separate sign / lantern builders like the source', () => {

		both( 4242, 1, ( side, ctx ) => ( side === 'port' ? pier.buildPier : PI.buildPier as typeof pier.buildPier )( ctx as never ) );

	} );

	it.each( [ [ 11, 0 ], [ 12, 1 ] ] )( 'lays the same boardwalks (seed %i, terrain %i)', ( seed, k ) => {

		const { port, orig } = both( seed, k, ( side, ctx ) => {

			const fn = ( side === 'port' ? walk.buildBoardwalk : BW.buildBoardwalk ) as typeof walk.buildBoardwalk;
			return [
				fn( ctx as never, [ [ 55, - 66 ], ...village.BOARDWALK_MAIN ], { width: 1.8, startY: 1.6, lightEvery: 70 } ),
				fn( ctx as never, village.BOARDWALK_SIDE_PATHS[ 0 ], { width: 1.1, lift: 0.2, lightEvery: 1e9 } ),
				fn( ctx as never, [ [ 0, 0 ], [ 3, - 4 ], [ 1, - 9 ] ] ),
			];

		} );
		port.result.forEach( ( r, i ) => {

			const o = orig.result[ i ]!;
			expect( [ r.length, r.width, r.samples.length ] ).toEqual( [ o.length, o.width, o.samples.length ] );
			expect( firstDiff( r.deck, o.deck ) ).toBe( - 1 );
			expect( r.samples.map( ( s ) => [ ...s.p.toArray(), ...s.tan.toArray(), s.nx, s.nz, s.g, s.gLow, s.yaw ] ) ).toEqual( o.samples.map( ( s ) => [ ...s.p.toArray(), ...s.tan.toArray(), s.nx, s.nz, s.g, s.gLow, s.yaw ] ) );

		} );
		expect( port.result[ 0 ]!.width ).toBe( walk.BOARDWALK_WIDTH );

	} );

	it.each( layout.houses.map( ( h, i ) => [ h.name!, i ] as const ) )( 'builds house %s like the source (porch, roof, foundation, extras)', ( _name, i ) => {

		const spec = layout.houses[ i ]!;
		const alt:bld.HouseSpec = { ...spec, x: 0, z: - 120, yaw: 0.7, porch: null, annex: { w: 2.6 }, foundation: 'stilts', chimney: 1, roof: spec.roof === 'hip' ? 'gable' : 'hip', gutter: true, stovepipe: true, antenna: true, buoys: 1, lantern: false, litChance: 1 };
		delete alt.floorY;
		const variants:bld.HouseSpec[] = [ spec, alt ];
		variants.forEach( ( s, v ) => {

			const { port, orig } = both( 31 + i * 7 + v, v, ( side, ctx ) => ( side === 'port' ? bld.buildHouse : BU.buildHouse as typeof bld.buildHouse )( ctx as never, s as bld.HouseSpec ) );
			expect( port.result ).toEqual( orig.result );
			// footprint radius follows the spec (plan task 16)
			const pd = s.porch ? s.porch.depth : 0, ad = s.annex ? ( s.annex.d ?? 2.2 ) : 0;
			expect( port.result.footprint ).toEqual( { x: s.x, z: s.z, r: Math.hypot( s.w, s.d + Math.max( pd, ad ) * 2 ) / 2 + 0.8, kind: 'building' } );

		} );

	} );

	it.each( [ 1, 2 ] )( 'builds the boathouse, market stall and sheds like the source (seed %i)', ( seed ) => {

		const { port, orig } = both( seed, seed - 1, ( side, ctx ) => {

			const M = ( side === 'port' ? bld : BU ) as typeof bld;
			return [
				M.buildBoathouse( ctx as never, layout.boathouse ), M.buildBoathouse( ctx as never, { x: 10, z: - 70, yaw: 1.2, w: 6, d: 8 } ),
				M.buildMarketStall( ctx as never, layout.stall ), M.buildMarketStall( ctx as never, { x: 0, z: - 90, yaw: - 0.6 } ),
				...layout.sheds.map( ( s ) => M.buildShed( ctx as never, s ) ),
			];

		} );
		expect( port.result ).toEqual( orig.result );
		expect( ( port.ctx.B as geo.Builder ).fishProps ).toBeInstanceOf( StubFishProps );

	} );

} );

describe( 'pinned source village (whole build)', () => {

	const randoms = Array.from( { length: 64 }, ( _, i ) => ( i * 0.618034 ) % 1 );
	it.each( [ 0, 1 ] )( 'builds the whole village bit for bit and swings sign and lanterns the same (terrain %i)', ( k ) => {

		const terrainA = new TestTerrain( k ), terrainB = new TestTerrain( k );
		const collA = new ColliderLog(), collB = new ColliderLog();
		const ours = village.buildVillage( { terrain: terrainA, colliders: collA } );
		type OrigVillage = {
			meshes:THREE.Mesh[]; sign:THREE.Group; lanterns:{ obj:THREE.Group; live:THREE.Vector3; t:number; ph:number }[]; lights:never[]; footprints:unknown[];
			foundationChecks:unknown[]; buildings:unknown[]; pierInfo:pier.PierInfo; shadowTriangles:number; group:THREE.Group;
			path:{ deck:number[] }; sidePaths:{ deck:number[] }[]; update( dt:number ):void; getStats():Record<string, number>;
		};
		const theirs = new ( VI.Village as new ( o:unknown ) => OrigVillage )( { scene: { add() {} }, terrain: terrainB, colliders: collB } );

		// layout, pads, records
		expect( terrainA.pads ).toEqual( terrainB.pads );
		expect( terrainA.pads.length ).toBe( 15 ); // 14 houses on the ground (huts on stilts skipped) + plaza
		expect( terrainA.minMax ).toBe( 1 );
		expect( collA.log ).toEqual( collB.log );
		expect( lightRows( ours.lights ) ).toEqual( lightRows( theirs.lights ) );
		expect( ours.footprints ).toEqual( theirs.footprints );
		expect( ours.foundationChecks ).toEqual( theirs.foundationChecks );
		expect( ours.buildings ).toEqual( theirs.buildings );
		expect( firstDiff( ours.path.deck, theirs.path.deck ) ).toBe( - 1 );
		ours.sidePaths.forEach( ( p, i ) => expect( firstDiff( p.deck, theirs.sidePaths[ i ]!.deck ) ).toBe( - 1 ) );
		const fishGroup = theirs.group.children.find( ( c ) => c.userData.fishItems );
		expect( ( ours.B.fishProps as StubFishProps ).items ).toEqual( fishGroup!.userData.fishItems );

		// merged meshes (_assemble)
		const asm = village.assembleVillage( ours.B );
		const byName = ( n:string ) => theirs.meshes.find( ( m ) => m.name === n )!;
		const wood = byName( 'village_wood' );
		expectSameGeometry( asm.shared, wood.geometry, 'opaque' );
		for ( const key of village.OPAQUE_KEYS ) {

			const mesh = byName( 'village_' + key );
			expect( mesh.geometry.attributes.position ).toBe( wood.geometry.attributes.position );
			expect( asm.ranges[ key ], key ).toEqual( { start: mesh.geometry.drawRange.start, count: mesh.geometry.drawRange.count } );

		}

		expect( asm.shadowTriangles ).toBe( theirs.shadowTriangles );
		expectSameGeometry( asm.fabric!, byName( 'village_fabric' ).geometry, 'fabric' );
		expectSameGeometry( asm.nets!, byName( 'village_nets' ).geometry, 'nets' );
		expect( theirs.meshes.map( ( m ) => m.name ) ).toEqual( [ ...village.OPAQUE_KEYS.map( ( k2 ) => 'village_' + k2 ), 'village_fabric', 'village_nets' ] );
		expect( Object.keys( ours.B.batches ).filter( ( key ) => ! [ ...village.OPAQUE_KEYS, 'fabric' ].includes( key as never ) ) ).toEqual( [] );

		// swinging sign and hung lanterns (geometry about their pivots, then the wind pendulums)
		const sign = village.buildSignGeometry( ours.signB, ours.pierInfo.signPivot! );
		expect( sign.map( ( s ) => 'village_sign_' + s.key ) ).toEqual( theirs.sign.children.map( ( c ) => c.name ) );
		sign.forEach( ( s, i ) => expectSameGeometry( s.geometry, ( theirs.sign.children[ i ] as THREE.Mesh ).geometry, 'sign ' + s.key ) );
		let q = 0;
		const lanterns = village.buildLanterns( ours.pierInfo.hung, () => randoms[ q ++ % randoms.length ]! );
		expect( lanterns.length ).toBe( theirs.lanterns.length );
		expect( lanterns.map( ( l ) => [ l.t, l.ph ] ) ).toEqual( lanterns.map( ( _l, i ) => [ randoms[ i * 2 ]! * 50, randoms[ i * 2 + 1 ]! * 6.28 ] ) );
		// the source draws the start phases from Math.random (three's uuids draw from it too): copy them
		lanterns.forEach( ( l, i ) => { l.t = theirs.lanterns[ i ]!.t; l.ph = theirs.lanterns[ i ]!.ph; } );
		lanterns.forEach( ( l, i ) => l.geometries.forEach( ( g, j ) => expectSameGeometry( g.geometry, ( theirs.lanterns[ i ]!.obj.children[ j ] as THREE.Mesh ).geometry, 'lantern ' + g.key ) ) );
		const swing = village.createSignSwing();
		const w = { speed: wind.windSpeed.value, dirX: wind.windDir.value.x, dirZ: wind.windDir.value.y };
		for ( const dt of [ 1 / 60, 1 / 60, 0.25, 1 / 30, 0.004 ] ) {

			theirs.update( dt );
			village.swingLanterns( lanterns, dt, w );
			village.swingSign( swing, dt, w );
			expect( [ swing.a, swing.b ] ).toEqual( [ theirs.sign.rotation.x, theirs.sign.rotation.y ] );
			lanterns.forEach( ( l, i ) => {

				expect( l.rotation.toArray() ).toEqual( [ theirs.lanterns[ i ]!.obj.rotation.x, theirs.lanterns[ i ]!.obj.rotation.y, theirs.lanterns[ i ]!.obj.rotation.z ] );
				expect( l.live.toArray() ).toEqual( theirs.lanterns[ i ]!.live.toArray() );

			} );

		}

		expect( Math.abs( swing.a ) + Math.abs( swing.b ) ).toBeGreaterThan( 0 );
		const stats = theirs.getStats();
		expect( stats.drawCalls ).toBe( 7 );
		if ( k === 0 ) console.info( 'village stats', JSON.stringify( { ...stats, opaqueVertices: asm.shared.getAttribute( 'position' ).count, ranges: asm.ranges, fabricTriangles: asm.fabric!.index!.count / 3, netTriangles: asm.nets!.index!.count / 3, lights: ours.lights.length, instanced: ours.inst.counts, fishDisplays: ( ours.B.fishProps as StubFishProps ).items.length } ) );

	}, 60000 );

} );

describe( 'pinned source village materials and texture bake (data)', () => {

	class ShaderModule { name:string; deps:{ name:string }[]; code:string; constructor( o:{ name:string; deps?:{ name:string }[]; code:string } ) { this.name = o.name; this.deps = o.deps ?? []; this.code = o.code; } }
	const commonModule = { name: 'common', deps: [], code: '' };
	const T = new Proxy( {}, { get: ( _t, key ) => key } );
	const VM = load( 'world/village/VillageMaterials.js', {
		DoubleSide: THREE.DoubleSide, ShaderModule, commonModule, standard: ( o:object ) => ( { ...o } ),
		VillageTextures: class { textures = T; },
	}, [ 'villageMaterialModule', 'createVillageMaterials' ] );

	it( 'keeps every material parameter, binding and WGSL snippet', () => {

		type OrigMat = { name:string; surface:string; vertex:string; textures:Record<string, string>; modules:ShaderModule[]; attributes:unknown; varyings:unknown } & Record<string, unknown>;
		const theirs = ( VM.createVillageMaterials as () => Record<string, OrigMat> )();
		const ours = mats.villageMaterialSpecs();
		expect( Object.keys( ours ) ).toEqual( Object.keys( theirs ) );
		for ( const key of Object.keys( theirs ) ) {

			const a = ours[ key as keyof typeof ours ], b = theirs[ key ]!;
			expect( a.name ).toBe( b.name );
			expect( a.surface ).toBe( b.surface );
			expect( a.vertex ).toBe( b.vertex );
			expect( a.textures ).toEqual( b.textures );
			expect( a.attributes ).toEqual( b.attributes );
			expect( a.varyings ).toEqual( b.varyings );
			expect( a.modules ).toEqual( b.modules.map( ( m ) => m.name ) );
			const params = Object.fromEntries( [ 'roughness', 'metalness', 'side', 'alphaTest', 'transparent', 'depthWrite' ].filter( ( p ) => p in b ).map( ( p ) => [ p, b[ p ] ] ) );
			expect( a.params ).toEqual( params );
			for ( const m of b.modules.slice( 1 ) ) {

				const mine = [ mats.villageMaterialModule, mats.tidalModule, mats.glassModule ].find( ( x ) => x.name === m.name )!;
				expect( mine.code ).toBe( m.code );
				expect( mine.deps ).toEqual( m.deps.map( ( d ) => d.name ) );

			}

		}

		expect( mats.villageMaterialModule.code ).toBe( ( VM.villageMaterialModule as ShaderModule ).code );

	} );

	it( 'plans the same bake kernels, generators, derivation code and texture budget', () => {

		const kernels:{ label:string; code:string; bindings:Record<string, { storageTexture?:{ label:string }; texture?:{ label:string } }>; modules?:ShaderModule[]; groups?:number[] }[] = [];
		const mipmaps:string[] = [];
		class Texture { label:string; destroyed = false; constructor( o:{ label:string } ) { this.label = o.label; } destroy() { this.destroyed = true; } }
		class ComputeKernel {

			o:( typeof kernels )[ number ];
			constructor( o:( typeof kernels )[ number ] & { workgroupSize:number[] } ) { this.o = o; kernels.push( o ); expect( o.workgroupSize ).toEqual( [ ...baker.BAKE_WORKGROUP ] ); }
			groups( w:number, h:number ) { return [ w, h ]; }
			dispatch( g:number[] ) { this.o.groups = g; }

		}
		const submitted:( () => void )[] = [];
		const TB = load( 'world/village/TextureBaker.js', { GPU: { onSubmit: ( _e:unknown, fn:() => void ) => submitted.push( fn ) }, Texture, ComputeKernel, ShaderModule, generateMipmaps: ( t:Texture ) => mipmaps.push( t.label ) },
			[ 'VillageTextures', 'deriveCode', 'SETS', 'GENERATORS', 'noiseModule' ] );
		const vt = new ( TB.VillageTextures as new () => { bake():void; bytes:number; textures:Record<string, Texture>; baked:boolean } )();
		vt.bake();
		vt.bake(); // once only
		expect( vt.baked ).toBe( true );
		const plan = baker.villageBakePlan();
		const target = ( b:{ storageTexture?:{ label:string }; texture?:{ label:string } } ) => {

			const label = ( b.storageTexture ?? b.texture )!.label;
			return label.startsWith( 'vlgFields_' ) ? 'fields' : label;

		};
		expect( plan.map( ( p ) => p.label ) ).toEqual( kernels.map( ( k ) => k.label ) );
		plan.forEach( ( p, i ) => {

			const k = kernels[ i ]!;
			expect( p.code, p.label ).toBe( k.code );
			expect( p.bindings ).toEqual( Object.fromEntries( Object.entries( k.bindings ).map( ( [ n, b ] ) => [ n, target( b ) ] ) ) );
			expect( p.modules ).toEqual( ( k.modules ?? [] ).map( ( m ) => m.name ) );
			expect( [ p.width, p.height ] ).toEqual( k.groups );

		} );
		expect( plan.length ).toBe( 15 );
		expect( baker.SETS ).toEqual( TB.SETS );
		expect( baker.GENERATORS ).toEqual( TB.GENERATORS );
		expect( baker.noiseModule.code ).toBe( ( TB.noiseModule as ShaderModule ).code );
		for ( const set of baker.SETS ) if ( set.nra ) expect( baker.deriveCode( set ) ).toBe( ( TB.deriveCode as Fn )( set as never ) );
		expect( baker.villageTextureBytes() ).toBe( vt.bytes );
		expect( baker.villageTextureBytes() / 1048576 ).toBeCloseTo( 43.3, 1 );
		expect( Object.keys( vt.textures ).sort() ).toEqual( baker.SETS.flatMap( ( s ) => [ s.out, s.nra ] ).filter( Boolean ).sort() );
		const mats2 = mats.villageMaterialSpecs();
		for ( const m of Object.values( mats2 ) ) for ( const t of Object.values( m.textures ) ) expect( Object.keys( vt.textures ) ).toContain( t );
		expect( mipmaps.length ).toBe( Object.keys( vt.textures ).length );

	} );

} );

// Port-only size report for the README (kept last: it changes the port's part cache history only).
describe( 'tidewater village sizes', () => {

	it( 'reports triangle counts per structure on the test ground', () => {

		const sizes:Record<string, number> = {};
		const run = ( name:string, fn:( ctx:VillageContextForTest ) => void ) => {

			const B = new geo.Builder();
			fn( { B, terrain: new TestTerrain( 0 ), colliders: new ColliderLog(), rand: new props.Rand( props.mulberry32( 90210 ) ), lights: [], checks: [], inst: new props.InstancedProps( B ) } );
			sizes[ name ] = B.triangles;

		};

		run( 'pier', ( c ) => { pier.buildPier( { ...c, signB: c.B, hang: () => c.B } ); } );
		run( 'boardwalk main', ( c ) => { walk.buildBoardwalk( c, [ [ 55, - 66.2 ], ...village.BOARDWALK_MAIN ], { width: 1.8, startY: 1.6, lightEvery: 70 } ); } );
		for ( const h of layout.houses ) run( 'house ' + h.name, ( c ) => { bld.buildHouse( c, h ); } );
		run( 'boathouse', ( c ) => { bld.buildBoathouse( c, layout.boathouse ); } );
		run( 'market stall', ( c ) => { bld.buildMarketStall( c, layout.stall ); } );
		run( 'shed', ( c ) => { bld.buildShed( c, layout.sheds[ 0 ]! ); } );
		console.info( 'sizes', JSON.stringify( sizes ) );
		expect( sizes.pier ).toBeGreaterThan( 10000 );

	} );

} );

