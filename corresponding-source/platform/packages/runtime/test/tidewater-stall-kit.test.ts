import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import * as kit from '../src/tidewater-village/stall-kit.js';
import * as gm from '../src/tidewater-village/game-materials.js';

// Executes the ORIGINAL pinned Tidewater source (src/game/StallKit.js, src/game/GameMaterials.js, read only)
// against the installed three.js, with the engine-only GPU parts (Texture, generateMipmaps, ShaderModule,
// decodeImage, standard) stubbed, and runs the port with the same calls in the same order.
// The scanned props come from the source's own public/models/props/props.{json,bin}.
type Fn = ( ...args:never[] ) => unknown;
type Mod = Record<string, unknown>;
const root = new URL( '../../../../tooling/other-programs/tidewater/', import.meta.url );
const read = ( path:string ) => readFileSync( new URL( 'src/' + path, root ), 'utf8' );
const strip = ( text:string ) => text.replace( /^import[\s\S]*?from\s*'[^']*';\r?\n/gm, '' ).replace( /^export /gm, '' ).replace( /import\.meta/g, '__importMeta' );
function load( path:string, deps:Mod, names:string[] ):Mod {

	return new Function( ...Object.keys( deps ), strip( read( path ) ) + `;return {${ names.join( ',' ) }};` )( ...Object.values( deps ) ) as Mod;

}

const fileBuffer = ( path:string ) => {

	const b = readFileSync( new URL( path, root ) );
	return b.buffer.slice( b.byteOffset, b.byteOffset + b.byteLength ) as ArrayBuffer;

};

// ---------------------------------------------------------------------------- source stubs

class ShaderModule { name:string; deps:{ name:string }[]; code:string; constructor( o:{ name:string; deps?:{ name:string }[]; code:string } ) { this.name = o.name; this.deps = o.deps ?? []; this.code = o.code; } }
const commonModule = new ShaderModule( { name: 'common', code: '' } );
type SrcMaterial = Record<string, unknown> & { defines:Record<string, number>; setDefine( k:string, v:number ):void };
const standard = ( o:Record<string, unknown> ):SrcMaterial => ( { options: o, defines: {}, setDefine( k:string, v:number ) { this.defines[ k ] = v; } } );
class SrcTexture { o:Record<string, unknown>; gpu = false; constructor( o:Record<string, unknown> ) { this.o = o; } getGPU() { this.gpu = true; } }
const mipmapped:string[] = [];

/** Deterministic tiny "decoded image" from the file bytes (the stub asset files hold their url). */
function decodeImage( bytes:Uint8Array, mime:string ) {

	const text = new TextDecoder().decode( bytes );
	const size = text.includes( 'signs' ) ? 4 : text.includes( '/s_' ) ? 3 : 2;
	const data = new Uint8Array( size * size * 4 );
	let h = 2166136261;
	for ( const ch of text + mime ) h = Math.imul( h ^ ch.charCodeAt( 0 ), 16777619 ) >>> 0;
	for ( let i = 0; i < data.length; i ++ ) { h = Math.imul( h ^ i, 16777619 ) >>> 0; data[ i ] = h & 255; }
	return { width: size, height: size, data };

}

const { BufferGeometry, Float32BufferAttribute, Uint32BufferAttribute, Matrix4, Matrix3, Vector3, Quaternion, Euler, CylinderGeometry, TorusGeometry, SphereGeometry, LatheGeometry, Vector2 } = THREE;
const SK = load( 'game/StallKit.js', {
	BufferGeometry, Float32BufferAttribute, Uint32BufferAttribute, Matrix4, Matrix3, Vector3, Quaternion, Euler, CylinderGeometry, TorusGeometry, SphereGeometry, LatheGeometry, Vector2,
	Texture: SrcTexture, generateMipmaps: ( t:SrcTexture ) => mipmapped.push( t.o.label as string ), commonModule, ShaderModule, decodeImage, standard,
	__importMeta: { env: { BASE_URL: '/base/' } },
}, [ 'LAYER', 'SURF', 'ATLAS', 'RIBS', 'RIB_PHASE', 'RIB_AMP', 'BASE', 'loadStallAssets', 'createStallMaterial', 'kitModule', 'place', 'KitBuilder', 'propLayers', 'Shapes' ] );
const GM = load( 'game/GameMaterials.js', { standard, Vector3, ShaderModule, commonModule }, [ 'PAT', 'gameModule', 'createPropMaterial', 'createLineMaterial' ] );

// ---------------------------------------------------------------------------- shared assets

const info = JSON.parse( readFileSync( new URL( 'public/models/props/props.json', root ), 'utf8' ) ) as kit.StallAssetInfo;
const bin = fileBuffer( 'public/models/props/props.bin' );
const assets:kit.StallGeometryAssets = {
	info,
	verts: new Float32Array( bin, 0, info.vertexCount * info.vertexFloats ),
	index: new Uint32Array( bin, info.indexByteOffset, info.indexCount ),
};

// ---------------------------------------------------------------------------- comparison helpers

/** First index where two number arrays differ bit for bit (-0 and NaN included), or -1. */
function firstDiff( a:ArrayLike<number>, b:ArrayLike<number>, float32 = false ) {

	if ( a.length !== b.length ) return - 2;
	const A = float32 ? Float32Array.from( a ) : Float64Array.from( a ), B = float32 ? Float32Array.from( b ) : Float64Array.from( b );
	if ( Buffer.from( A.buffer ).equals( Buffer.from( B.buffer ) ) ) return - 1;
	for ( let i = 0; i < A.length; i ++ ) if ( ! Object.is( A[ i ], B[ i ] ) ) return i;
	return - 3;

}

function expectSameGeometry( a:THREE.BufferGeometry, b:THREE.BufferGeometry, label:string ) {

	expect( Object.keys( a.attributes ), label ).toEqual( Object.keys( b.attributes ) );
	for ( const name of Object.keys( a.attributes ) ) {

		const x = a.getAttribute( name ) as THREE.BufferAttribute, y = b.getAttribute( name ) as THREE.BufferAttribute;
		expect( [ x.itemSize, x.count ], `${ label }.${ name }` ).toEqual( [ y.itemSize, y.count ] );
		expect( x.array.constructor ).toBe( Float32Array );
		expect( firstDiff( x.array, y.array, true ), `${ label }.${ name }` ).toBe( - 1 );

	}

	expect( a.index!.array.constructor, label ).toBe( Uint32Array );
	expect( b.index!.array.constructor, label ).toBe( Uint32Array );
	expect( firstDiff( a.index!.array, b.index!.array ), `${ label }.index` ).toBe( - 1 );
	expect( a.boundingBox, label ).toEqual( b.boundingBox );
	expect( a.boundingSphere, label ).toEqual( b.boundingSphere );

}

type KitLike = { pos:number[]; nrm:number[]; uv:number[]; col:number[]; layer:number[]; uv2:number[]; idx:number[]; seed:number };
function expectSameKit( a:KitLike, b:KitLike, label:string ) {

	for ( const k of [ 'pos', 'nrm', 'uv', 'col', 'layer', 'uv2', 'idx' ] as const ) expect( firstDiff( a[ k ], b[ k ] ), `${ label }.${ k }` ).toBe( - 1 );
	expect( a.seed, `${ label }.seed` ).toBe( b.seed );

}

// ---------------------------------------------------------------------------- one stall-like scene

type PlaceFn = ( x:number, y:number, z:number, ry?:number, rx?:number, rz?:number, s?:number ) => THREE.Matrix4;
type ShapesLike = {
	cylinder:( rt:number, rb:number, h:number, seg?:number, open?:boolean ) => THREE.BufferGeometry;
	torus:( r:number, t:number, rs?:number, ts?:number ) => THREE.BufferGeometry;
	sphere:( r:number, ws?:number, hs?:number ) => THREE.BufferGeometry;
	lathe:( pts:number[][], seg?:number ) => THREE.BufferGeometry;
};
interface KitApi {
	rnd():number; jit( a:number ):number;
	box( w:number, h:number, d:number, m:THREE.Matrix4, o?:object ):void;
	geometry( g:THREE.BufferGeometry, m:THREE.Matrix4, o?:object ):void;
	rope( pts:THREE.Vector3[], r?:number, color?:number[], radial?:number ):void;
	coil( x:number, y:number, z:number, r?:number, turns?:number, rr?:number, color?:number[] ):void;
	corrugated( w:number, l:number, m:THREE.Matrix4, u0?:number, color?:number[] ):void;
	ice( w:number, d:number, m:THREE.Matrix4, lump?:number ):void;
	disc( r:number, m:THREE.Matrix4, o?:object ):void;
	prop( name:string, m:THREE.Matrix4 ):void;
	bounds( name:string ):unknown;
	build():THREE.BufferGeometry;
}
interface Side { K:KitApi; place:PlaceFn; Shapes:ShapesLike; LAYER:Record<string, number>; ATLAS:Record<string, number[]> }

/** Every KitBuilder emitter with every option branch (box layers / along / off / uv2Rect / params,
 * indexed and non-indexed geometry, uvScale, uv2FromUV, vertical rope, all scanned props). */
function scene( { K, place, Shapes, LAYER, ATLAS }:Side, propNames:string[] ) {

	const V = ( x:number, y:number, z:number ) => new Vector3( x, y, z );
	const J = ( a:number ) => K.jit( a );
	const tone = () => [ 0.85 + K.rnd() * 0.2, 0.83 + K.rnd() * 0.2, 0.8 + K.rnd() * 0.2 ];
	K.box( 2.6, 0.04, 1.62, place( 0, 0.33, - 0.02 ), { layer: LAYER.DECK, along: 'x', color: tone() } );
	for ( const [ x, z ] of [ [ - 1.3, - 0.8 ], [ 1.3, 0.8 ] ] ) K.box( 0.1, 2.4, 0.1, place( x!, 1.2, z!, J( 0.2 ), J( 0.03 ), J( 0.03 ) ), { layer: LAYER.DECK, along: 'y', color: tone() } );
	for ( const along of [ 'x', 'y', 'z' ] ) for ( const layer of [ LAYER.WALL, LAYER.DECK, LAYER.TIN, LAYER.PAINTED ] ) {

		K.box( 0.7 + K.rnd(), 0.3 + K.rnd(), 0.05 + K.rnd() * 0.4, place( K.rnd() * 3, K.rnd() * 2, K.rnd() * 3, J( 3 ), J( 1 ), J( 1 ), 0.8 + K.rnd() * 0.4 ), { layer, along, color: tone() } );

	}
	K.box( 1.0, 0.5, 0.2, place( 0, 1, 0 ), { layer: LAYER.WALL, off: [ 0.25, 0.5 ] } );
	K.box( 2.3, 0.32, 0.035, place( 0, 2.13, 0.855, 0, 0, J( 0.01 ) ), { layer: LAYER.SIGN, along: 'x', uv2Rect: ATLAS.joe } );
	K.box( 0.55, 0.78, 0.012, place( 1.95, 0.45, 1.45, - 0.35, - 0.1 ), { layer: LAYER.CHALK, uv2Rect: ATLAS.prices } );
	K.box( 0.05, 1.2, 0.05, place( 0.6, 0.6, 0.6 ), { layer: LAYER.PLAIN, color: [ 0.55, 0.57, 0.56 ], params: [ 0.45, 1 ] } );
	K.box( 0.005, 0.075, 0.003, place( 0.2, 1.7, 0.3, 0, 0, - 0.9 ).multiply( new Matrix4().makeTranslation( 0, 0.03, 0 ) ), { layer: LAYER.PLAIN, color: [ 0.08, 0.07, 0.06 ], params: [ 0.4, 0 ] } );
	K.box( 0.4, 0.4, 0.4, place( 0, 0, 0 ) );
	const steel = { layer: LAYER.PLAIN, color: [ 0.5, 0.5, 0.5 ], params: [ 0.3, 1 ] };
	K.geometry( Shapes.cylinder( 0.004, 0.004, 0.5, 6 ), place( 0.5, 2.06, 0.2 ), steel );
	K.geometry( Shapes.cylinder( 0.1, 0.1, 0.05, 28, true ), place( 0.5, 1.7, 0.2, 0, Math.PI / 2 ), { layer: LAYER.FLOAT, color: [ 0.55, 0.1, 0.07 ] } );
	K.geometry( Shapes.torus( 0.093, 0.009, 8, 32 ), place( 0.5, 1.7, 0.226 ), { layer: LAYER.PLAIN, color: [ 0.62, 0.6, 0.56 ], params: [ 0.36, 1 ] } );
	K.geometry( Shapes.torus( 0.018, 0.004 ), place( 0.5, 1.82, 0.2, Math.PI / 2 ) );
	K.geometry( Shapes.sphere( 0.07 ), place( - 0.2, 1.3, 0.1, 0.3, 0.2, 0.1, 1.3 ), { layer: LAYER.FLOAT, color: [ 0.8, 0.78, 0.7 ], uvScale: [ 3, 2 ] } );
	K.geometry( Shapes.sphere( 0.05, 8, 6 ), place( - 0.3, 1.3, 0.1 ), { layer: LAYER.DIAL, uv2FromUV: ATLAS.dial } );
	K.geometry( Shapes.lathe( [ [ 0.0, 0.0 ], [ 0.12, 0.008 ], [ 0.15, 0.035 ], [ 0.155, 0.04 ] ], 24 ), place( 0.5, 1.43, 0.2 ), { layer: LAYER.PLAIN, color: [ 0.72, 0.72, 0.7 ], params: [ 0.5, 1 ] } );
	K.geometry( Shapes.lathe( [ [ 0.02, 0 ], [ 0.03, 0.1 ] ] ), place( 0.1, 0.1, 0.1 ) );
	K.geometry( Shapes.torus( 0.006, 0.0015, 4, 8 ).toNonIndexed(), new Matrix4(), steel );
	const noUv = Shapes.cylinder( 0.01, 0.01, 0.1, 5 ); noUv.deleteAttribute( 'uv' );
	K.geometry( noUv, place( 0.3, 0.3, 0.3 ), { uv2FromUV: ATLAS.dial } );
	K.rope( [ V( - 1.31, 2.25, 0.8 ), V( - 1.0, 1.7, 0.7 ) ], 0.005 );
	K.rope( [ V( - 0.9, 2.32, 0.1 ), V( - 0.9, 2.16, 0.1 ) ], 0.004 );
	K.rope( [ V( 0, 1, 0 ), V( 0.2, 1.1, 0 ), V( 0.4, 1.0, 0.1 ), V( 0.6, 1.3, 0.2 ) ], 0.0022, [ 0.3, 0.3, 0.3 ], 3 );
	K.coil( - 0.95, 0.33, - 0.5, 0.2, 5, 0.012, [ 0.66, 0.58, 0.42 ] );
	K.coil( 0.95, 0.33, - 0.5 );
	for ( let i = 0; i < 3; i ++ ) K.corrugated( 0.98, 2.12, place( - 0.9 + i * 0.9, 2.405 + i * 0.006, 0.04, J( 0.02 ), - 0.16, J( 0.02 ) ), K.rnd(), [ 1, 1, 1 ] );
	K.corrugated( 0.5, 1.0, place( 0, 3, 0 ) );
	K.ice( 0.9, 0.6, place( 1.0, 1.245, 0.6 ), 0.02 );
	K.ice( 0.5, 0.4, place( 1.0, 1.245, 0.6, 0.3 ) );
	K.disc( 0.088, place( 0.5, 1.7, 0.2265 ), { layer: LAYER.DIAL, uv2Rect: ATLAS.dial } );
	K.disc( 0.2, place( 0, 0, 0, 0.4, 0.2 ) );
	let i = 0;
	for ( const name of propNames ) {

		K.prop( name, place( i * 0.7 - 2, 0.1 * i, J( 1 ), K.rnd() * 6, J( 0.2 ), J( 0.2 ), 0.9 + K.rnd() * 0.2 ) );
		i ++;

	}
	K.prop( 'wooden_lantern_01', place( - 0.9, 1.64, 0.1, 0.4 ) );
	return K.build();

}

const sourceSide = ( seed:number ):Side => ( { K: new ( SK.KitBuilder as new ( a:unknown, s:number ) => KitApi )( assets, seed ), place: SK.place as PlaceFn, Shapes: SK.Shapes as ShapesLike, LAYER: SK.LAYER as Record<string, number>, ATLAS: SK.ATLAS as Record<string, number[]> } );
const portSide = ( seed:number ):Side => ( { K: new kit.KitBuilder( assets, seed ) as unknown as KitApi, place: kit.place, Shapes: kit.Shapes as unknown as ShapesLike, LAYER: kit.LAYER as unknown as Record<string, number>, ATLAS: kit.ATLAS as unknown as Record<string, number[]> } );

// ---------------------------------------------------------------------------- tests

describe( 'tidewater stall kit (StallKit.js) is bit-exact with the pinned source', () => {

	it( 'keeps the layer ids, surfaces, sign atlas and rib constants', () => {

		expect( kit.LAYER ).toEqual( SK.LAYER );
		expect( kit.SURF ).toEqual( SK.SURF );
		expect( kit.ATLAS ).toEqual( SK.ATLAS );
		expect( [ kit.RIBS, kit.RIB_PHASE, kit.RIB_AMP ] ).toEqual( [ SK.RIBS, SK.RIB_PHASE, SK.RIB_AMP ] );
		expect( SK.BASE ).toBe( '/base/models/props/' );
		expect( kit.STALL_ASSET_BASE ).toBe( '/models/props/' );

	} );

	it( 'places with the same matrices (YXZ yaw / pitch / roll, uniform scale)', () => {

		const src = SK.place as PlaceFn;
		let s = 12345;
		const r = () => { s = ( s * 16807 ) % 2147483647; return ( s / 2147483647 - 0.5 ) * 8; };
		for ( let i = 0; i < 64; i ++ ) {

			const args = [ r(), r(), r(), r(), r(), r(), Math.abs( r() ) + 0.1 ] as const;
			expect( firstDiff( kit.place( ...args ).elements, src( ...args ).elements ) ).toBe( - 1 );

		}
		expect( firstDiff( kit.place( 1, 2, 3 ).elements, src( 1, 2, 3 ).elements ) ).toBe( - 1 );

	} );

	it( 'draws the same random sequence (Park-Miller) for several seeds', () => {

		for ( const seed of [ 1, 7, 42, 2147483646, 987654321 ] ) {

			const a = new kit.KitBuilder( null, seed ), b = new ( SK.KitBuilder as new ( a:unknown, s:number ) => KitApi )( null, seed );
			const x:number[] = [], y:number[] = [];
			for ( let i = 0; i < 200; i ++ ) { x.push( a.rnd(), a.jit( 0.3 ) ); y.push( b.rnd(), b.jit( 0.3 ) ); }
			expect( firstDiff( x, y ) ).toBe( - 1 );

		}

	} );

	const names = Object.keys( info.props );
	for ( const seed of [ 1, 7, 42, 2147483646, 987654321 ] ) {

		it( `builds the same merged stall mesh for seed ${ seed } (every emitter and every scanned prop)`, () => {

			const ours = portSide( seed ), theirs = sourceSide( seed );
			const order = seed === 7 ? names : [ ...names ].reverse();
			const a = scene( ours, order ), b = scene( theirs, order );
			expectSameKit( ours.K as unknown as KitLike, theirs.K as unknown as KitLike, `seed ${ seed }` );
			expectSameGeometry( a, b, `seed ${ seed }` );
			expect( a.getAttribute( 'color' ).itemSize ).toBe( 4 );
			expect( a.index!.count % 3 ).toBe( 0 );

		} );

	}

	it( 'emits each primitive exactly as the source (one builder per call)', () => {

		const calls:[ string, ( s:Side ) => void ][] = [
			[ 'box sign', ( s ) => s.K.box( 1.2, 0.4, 0.05, s.place( 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 1.1 ), { layer: s.LAYER.SIGN, uv2Rect: s.ATLAS.marta, along: 'z' } ) ],
			[ 'box tin along y', ( s ) => s.K.box( 0.9, 1.8, 0.02, s.place( - 1, 1, 2, 1.2 ), { layer: s.LAYER.TIN, along: 'y', off: [ 0.1, 0.9 ] } ) ],
			[ 'rope vertical', ( s ) => s.K.rope( [ new Vector3( 0, 0, 0 ), new Vector3( 0, 1, 0 ), new Vector3( 0.01, 2, 0 ) ] ) ],
			[ 'corrugated', ( s ) => s.K.corrugated( 1.3, 0.7, s.place( 0, 1, 0, 0.2, - 0.3 ), 0.37, [ 0.9, 0.8, 0.7 ] ) ],
			[ 'ice', ( s ) => s.K.ice( 1.1, 0.5, s.place( 0, 1, 0, 0.7 ), 0.03 ) ],
			[ 'disc', ( s ) => s.K.disc( 0.3, s.place( 0, 1, 0, 0, 0, 0, 2 ), { layer: s.LAYER.SIGN, uv2Rect: s.ATLAS.prices, color: [ 0.5, 0.4, 0.3 ] } ) ],
			[ 'lantern prop', ( s ) => s.K.prop( 'wooden_lantern_01', s.place( 1, 2, 3, 0.5, 0.1, - 0.2, 1.5 ) ) ],
		];
		for ( const [ label, fn ] of calls ) {

			const ours = portSide( 99 ), theirs = sourceSide( 99 );
			fn( ours ); fn( theirs );
			expectSameKit( ours.K as unknown as KitLike, theirs.K as unknown as KitLike, label );
			expectSameGeometry( ours.K.build(), theirs.K.build(), label );

		}

	} );

	it( 'finds the lantern glass panes like the source (layers and pane uv2)', () => {

		const P = info.props.wooden_lantern_01!;
		const ours = kit.propLayers( assets, 'wooden_lantern_01', P )!, theirs = ( SK.propLayers as Fn )( assets as never, 'wooden_lantern_01' as never, P as never ) as { layer:Float32Array; uv2:Float32Array };
		expect( firstDiff( ours.layer, theirs.layer, true ) ).toBe( - 1 );
		expect( firstDiff( ours.uv2, theirs.uv2, true ) ).toBe( - 1 );
		const glass = info.layers.indexOf( 'wooden_lantern_01_1' );
		const panes = ours.layer.filter( ( l ) => l === glass ).length;
		expect( panes ).toBeGreaterThan( 0 );
		expect( panes ).toBeLessThan( P.vCount );
		expect( kit.propLayers( assets, 'wooden_crate_01', info.props.wooden_crate_01! ) ).toBeNull();
		expect( kit.propLayers( assets, 'wooden_lantern_01', P ) ).toBe( ours ); // cached
		expect( kit.KitBuilder.prototype.bounds.call( new kit.KitBuilder( assets ), 'fish_knife' ) ).toBe( info.props.fish_knife );
		expect( () => new kit.KitBuilder( assets ).prop( 'no_such_prop', new Matrix4() ) ).toThrow( 'StallKit: no prop no_such_prop' );

	} );

	it( 'builds the same shape helpers as the source Shapes', () => {

		const S = SK.Shapes as ShapesLike;
		expectSameGeometry( toIndexed( kit.Shapes.cylinder( 0.1, 0.2, 0.3, 9, true ) ), toIndexed( S.cylinder( 0.1, 0.2, 0.3, 9, true ) ), 'cylinder' );
		expectSameGeometry( toIndexed( kit.Shapes.torus( 0.1, 0.02 ) ), toIndexed( S.torus( 0.1, 0.02 ) ), 'torus' );
		expectSameGeometry( toIndexed( kit.Shapes.sphere( 0.3 ) ), toIndexed( S.sphere( 0.3 ) ), 'sphere' );
		expectSameGeometry( toIndexed( kit.Shapes.lathe( [ [ 0, 0 ], [ 0.1, 0.2 ], [ 0.05, 0.3 ] ], 7 ) ), toIndexed( S.lathe( [ [ 0, 0 ], [ 0.1, 0.2 ], [ 0.05, 0.3 ] ], 7 ) ), 'lathe' );

	} );

} );

/** Shapes' raw three geometries carry Uint16 indices: compare them through the Uint32 helper. */
function toIndexed( g:THREE.BufferGeometry ) {

	g.setIndex( new Uint32BufferAttribute( Array.from( g.index!.array ), 1 ) );
	g.computeBoundingBox();
	g.computeBoundingSphere();
	return g;

}

describe( 'tidewater stall kit assets and material (data)', () => {

	it( 'loads the same prop buffers and texture arrays as the source loader', async () => {

		const files = ( url:string ) => url.endsWith( 'props.json' ) ? fileBuffer( 'public/models/props/props.json' ) : url.endsWith( 'props.bin' ) ? bin.slice( 0 ) : new TextEncoder().encode( url ).buffer as ArrayBuffer;
		const g = globalThis as { __assetFile?:( url:string ) => ArrayBuffer };
		g.__assetFile = ( url ) => files( url.replace( '/base/models/props/', '/models/props/' ) );
		type SrcAssets = { info:unknown; verts:Float32Array; index:Uint32Array; surf:Record<'a' | 'n' | 'r', SrcTexture>; prop:Record<'a' | 'n' | 'r', SrcTexture>; signs:SrcTexture; material:SrcMaterial; loadMs:number };
		let theirs:SrcAssets;
		try {

			theirs = await ( SK.loadStallAssets as () => Promise<SrcAssets> )();

		} finally {

			delete g.__assetFile;

		}
		const urls:string[] = [];
		const io:kit.StallAssetIO = { bytes: async ( url ) => { urls.push( url ); return files( url ); }, decode: decodeImage };
		const ours = await kit.loadStallAssets( io );
		expect( kit.loadStallAssets( io ) ).toBe( kit.loadStallAssets( io ) ); // loaded once per io
		expect( urls.length ).toBe( 2 + 3 * ( kit.SURF.length + info.layers.length ) + 1 );
		expect( ours.info ).toEqual( theirs.info );
		expect( firstDiff( ours.verts, theirs.verts, true ) ).toBe( - 1 );
		expect( firstDiff( ours.index, theirs.index ) ).toBe( - 1 );
		const pairs:[ THREE.DataArrayTexture, SrcTexture ][] = [
			[ ours.surf.a, theirs.surf.a ], [ ours.surf.n, theirs.surf.n ], [ ours.surf.r, theirs.surf.r ],
			[ ours.prop.a, theirs.prop.a ], [ ours.prop.n, theirs.prop.n ], [ ours.prop.r, theirs.prop.r ], [ ours.signs, theirs.signs ],
		];
		for ( const [ a, b ] of pairs ) {

			const o = b.o as { label:string; width:number; height:number; depth:number; format:string; data:Uint8Array; dimension:string; mips:boolean };
			expect( a.name ).toBe( o.label );
			expect( [ a.image.width, a.image.height, a.image.depth ] ).toEqual( [ o.width, o.height, o.depth ] );
			expect( a.colorSpace === THREE.SRGBColorSpace ).toBe( o.format === 'rgba8unorm-srgb' );
			expect( [ o.dimension, o.mips, b.gpu ] ).toEqual( [ '2d-array', true, true ] );
			expect( a.generateMipmaps ).toBe( true );
			expect( firstDiff( a.image.data as Uint8Array, o.data ) ).toBe( - 1 );

		}
		expect( mipmapped ).toEqual( pairs.map( ( [ , b ] ) => b.o.label ) );
		expect( ours.material.name ).toBe( 'stall' );
		expect( ours.loadMs ).toBeGreaterThanOrEqual( 0 );
		await expect( kit.loadStallAssets( { bytes: async () => new ArrayBuffer( 0 ), decode: decodeImage } ) ).rejects.toThrow();

	} );

	it( 'keeps the stall material: WGSL module, surface, vertex, bindings, defines', () => {

		const texture = ( label:string ) => new SrcTexture( { label } );
		const fake = {
			surf: { a: texture( 'stallSurfA' ), n: texture( 'stallSurfN' ), r: texture( 'stallSurfR' ) },
			prop: { a: texture( 'stallPropA' ), n: texture( 'stallPropN' ), r: texture( 'stallPropR' ) },
			signs: texture( 'stallSigns' ),
		};
		const m = ( SK.createStallMaterial as Fn )( fake as never ) as SrcMaterial & { name:string; surface:string };
		const o = m.options as { vertexColors:boolean; modules:ShaderModule[]; attributes:unknown; varyings:unknown; textures:Record<string, SrcTexture>; vertex:string };
		const spec = kit.stallMaterialSpec();
		expect( spec.name ).toBe( m.name );
		expect( spec.surface ).toBe( m.surface );
		expect( spec.vertex ).toBe( o.vertex );
		expect( spec.vertexColors ).toBe( o.vertexColors );
		expect( spec.attributes ).toEqual( o.attributes );
		expect( spec.varyings ).toEqual( o.varyings );
		expect( spec.defines ).toEqual( m.defines );
		expect( spec.textures ).toEqual( Object.fromEntries( Object.entries( o.textures ).map( ( [ k, t ] ) => [ k, t.o.label ] ) ) );
		expect( spec.modules.map( ( x ) => x.name ) ).toEqual( o.modules.map( ( x ) => x.name ) );
		const src = SK.kitModule as ShaderModule;
		expect( kit.kitModule.code ).toBe( src.code );
		expect( kit.kitModule.deps ).toEqual( src.deps.map( ( d ) => d.name ) );
		const standIn = kit.createStallMaterial();
		expect( standIn.vertexColors ).toBe( true );
		expect( standIn.userData.spec ).toEqual( spec );

	} );

} );

describe( 'tidewater game prop materials (GameMaterials.js, data)', () => {

	it( 'keeps PAT and the gameProps WGSL module', () => {

		expect( gm.PAT ).toEqual( GM.PAT );
		const src = GM.gameModule as ShaderModule;
		expect( gm.gameModule.name ).toBe( src.name );
		expect( gm.gameModule.code ).toBe( src.code );
		expect( gm.gameModule.deps ).toEqual( src.deps.map( ( d ) => d.name ) );

	} );

	const extras:[ string | undefined, gm.PropMaterialExtra | undefined ][] = [
		[ undefined, undefined ],
		[ 'fishStand', {} ],
		[ 'rod', { uniforms: { bend: [ 'f32', 0.25 ], tip: [ 'vec3f', new Vector3( 1, 2, 3 ) ] }, vertex: '\tlet q = v.position;\n', clearcoat: true } ],
		[ 'vendor', { vertex: '\to.vLocal = v.position * 2.0;\n', clearcoat: false } ],
	];
	for ( const [ name, extra ] of extras ) {

		it( `records createPropMaterial( ${ name ?? 'default' } ) like the source`, () => {

			const b = ( GM.createPropMaterial as ( n?:string, e?:object ) => SrcMaterial & { name:string; surface:string } )( name, extra );
			const a = gm.propMaterialSpec( name, extra );
			const o = b.options as Record<string, unknown> & { modules:ShaderModule[] };
			expect( a.name ).toBe( b.name );
			expect( a.surface ).toBe( b.surface );
			expect( a.defines ).toEqual( b.defines );
			expect( { ...a.options, modules: a.options.modules.map( ( x ) => x.name ) } ).toEqual( { ...o, modules: o.modules.map( ( x ) => x.name ) } );
			const standIn = gm.createPropMaterial( name, extra );
			expect( standIn.name ).toBe( b.name );
			expect( standIn.vertexColors ).toBe( true );
			expect( standIn instanceof THREE.MeshPhysicalMaterial ).toBe( b.defines.CLEARCOAT === 1 );
			expect( standIn.userData.spec ).toEqual( a );

		} );

	}

	it( 'records createLineMaterial like the source (uniform handles shared)', () => {

		const b = ( GM.createLineMaterial as ( s:number ) => SrcMaterial & { name:string; receiveShadows:boolean; surface?:string } )( 24 );
		const a = gm.lineMaterialSpec();
		expect( a.name ).toBe( b.name );
		expect( a.receiveShadows ).toBe( b.receiveShadows );
		expect( a.options ).toEqual( b.options );
		expect( b.surface ).toBeUndefined();
		expect( a.uniforms.lineA.value ).toBe( a.options.uniforms.lineA[ 1 ] );
		expect( a.uniforms.lineShow.value ).toBe( 0 );

	} );

} );

// Port-only size report for the README.
describe( 'tidewater stall kit sizes', () => {

	it( 'reports triangle counts of the scanned props and the test scene', () => {

		const sizes:Record<string, number> = {};
		for ( const name of Object.keys( info.props ) ) {

			const K = new kit.KitBuilder( assets );
			K.prop( name, new Matrix4() );
			sizes[ name ] = K.idx.length / 3;

		}
		const s = portSide( 7 );
		sizes.scene = scene( s, Object.keys( info.props ) ).index!.count / 3;
		console.info( 'stall kit sizes', JSON.stringify( sizes ) );
		expect( sizes.wooden_lantern_01 ).toBeGreaterThan( 100 );

	} );

} );
