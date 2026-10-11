import * as THREE from 'three';
import * as math from '../src/tidewater-shore/shore-math.js';
import * as nature from '../src/tidewater-shore/nature-material.js';
import * as pebbles from '../src/tidewater-shore/pebble-field.js';
import * as shore from '../src/tidewater-shore/index.js';
import * as ReefGeo from '../src/tidewater-shore/reef-geometry.js';
import * as ReefNoise from '../src/tidewater-shore/reef-noise.js';
import * as geo from '../src/tidewater-village/geo-builder.js';
import * as props from '../src/tidewater-village/props.js';
import * as shapes from '../src/tidewater-shore/debris-shapes.js';
import * as placement from '../src/tidewater-shore/debris-placement.js';
import * as reefMat from '../src/tidewater-shore/reef-materials.js';
import { readFileSync } from 'node:fs';
import { describe, expect, it, beforeAll } from 'vitest';
import { buildRockGeometry, ROCK_STYLES } from '../src/tidewater-shore/rock-geometry.js';
import { Rocks, rocksMaterialSpec, type RockTerrain } from '../src/tidewater-shore/rocks.js';
import { parseGLB } from '../src/tidewater-shore/glb.js';
import { ScannedDebris, SCAN_ASSETS, type ScanInstance, type ScanPixels, SCAN, SCAN_SIZE } from '../src/tidewater-shore/scanned-debris.js';
import { RECORDING_ENGINE } from '../src/tidewater-shore/shore-engine.js';
import { mulberry32 as reefGeoPortRng, PATHS, polylineDistance, mulberry32 as debrisMulberry } from '../src/tidewater-shore/shore-math.js';
import { PebbleField, blueNoise, chipPart, buildPatch } from '../src/tidewater-shore/pebble-field.js';
import { Debris } from '../src/tidewater-shore/debris.js';
import { ReefBatch, prefixOf, RecordingStorageBuffer, type ReefKind } from '../src/tidewater-shore/reef-batch.js';
import { Reef, type ReefFishOptions, type ReefTerrain } from '../src/tidewater-shore/reef.js';

// Executes the ORIGINAL pinned Tidewater source (read only, commit 4811ba48) against the installed
// three.js, one module at a time with its imports injected, and compares the port with it bit-exact.
// Only engine GPU objects (ShaderModule, Texture, standard(), mipmaps) are stubs; both sides get the
// same stubs or record the same data.
type Mod = Record<string, unknown>;
type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any -- results of the untyped original source
const ROOT = new URL( '../../../../tooling/other-programs/tidewater/', import.meta.url );
const SRC = new URL( 'src/', ROOT );
const read = ( path:string ) => readFileSync( new URL( path, SRC ), 'utf8' ).replace( /\r\n/g, '\n' );
const strip = ( text:string ) => text.replace( /^import[\s\S]*?from\s*'[^']*';\n/gm, '' ).replace( /^export /gm, '' );
function load( path:string, deps:Mod, names:string[], patch:( s:string ) => string = ( s ) => s ):Any {

	return new Function( ...Object.keys( deps ), patch( strip( read( path ) ) ) + `;return {${ names.join( ',' ) }};` )( ...Object.values( deps ) );

}

class StubShaderModule { constructor( o:Mod ) { Object.assign( this, o ); } }
const N = load( 'util/Noise.js', {}, [ 'mulberry32', 'Noise2D', 'smoothstep', 'clamp', 'lerp' ] );
const TN = load( 'world/terrain/TerrainNoise.js', {}, [ 'hash2' ] );
const LF = load( 'materials/LODFade.js', { ShaderModule: StubShaderModule }, [ 'bandFade', 'lodFadeModule' ] );
const IS = load( 'world/terrain/IslandShape.js', {}, [ 'PATHS', 'polylineDistance' ] );
const W = load( 'world/WorldLayout.js', { THREE }, [ 'WORLD' ] );
const tsText = read( 'world/terrain/TerrainShading.js' );
const TS = new Function( 'Color', 'SRGBColorSpace', strip( tsText.slice( tsText.indexOf( 'export const srgb' ), tsText.indexOf( '// ---- palette' ) ) ) + ';return { srgb, rot2 };' )( THREE.Color, THREE.SRGBColorSpace ) as Any;
const RG = load( 'world/terrain/RockGeometry.js', { THREE, hash2: TN.hash2 }, [ 'buildRockGeometry', 'ROCK_STYLES' ] );

// ---------------------------------------------------------------------------- comparison helpers

const f32bits = ( a:ArrayLike<number> ) => new Uint32Array( Float32Array.from( a ).buffer );
const f64bits = ( a:ArrayLike<number> ) => new Uint32Array( Float64Array.from( a ).buffer );

function expectSameGeometry( a:THREE.BufferGeometry, b:THREE.BufferGeometry, label:string ) {

	expect( Object.keys( a.attributes ), label ).toEqual( Object.keys( b.attributes ) );
	for ( const name of Object.keys( b.attributes ) ) {

		const x = a.getAttribute( name ) as THREE.BufferAttribute, y = b.getAttribute( name ) as THREE.BufferAttribute;
		expect( [ x.itemSize, x.count, x.array.constructor.name, x.normalized ], `${ label } ${ name }` ).toEqual( [ y.itemSize, y.count, y.array.constructor.name, y.normalized ] );
		expect( f32bits( x.array ), `${ label } ${ name } bits` ).toEqual( f32bits( y.array ) );

	}

	expect( a.index?.array.constructor.name, label ).toBe( b.index?.array.constructor.name );
	if ( b.index ) expect( Array.from( a.index!.array ), `${ label } index` ).toEqual( Array.from( b.index.array ) );
	expect( a.boundingSphere, label ).toEqual( b.boundingSphere );

}

// ---------------------------------------------------------------------------- deterministic test ground

// An island-like test ground on the source's 2048 m domain (texel 1 m): land rising to the north (-z),
// sea to the south, ridges and coves along x; a rock mask, a seabed rubble mask, two sea stacks and the
// island footpaths. The same object feeds the port and the original.
const RES = 2048, ORIGIN = - 1024;
const groundH = ( x:number, z:number ) => - ( z + 40 ) * 0.08 + 6 * Math.sin( x * 0.031 ) * Math.cos( z * 0.027 ) + 2 * Math.sin( x * 0.13 + z * 0.11 );
function makeGround():RockTerrain & { heights:Float32Array; size:number } {

	const rock = new Float32Array( RES * RES ), rubble = new Uint8Array( RES * RES ), heights = new Float32Array( RES * RES );
	for ( let j = 0; j < RES; j ++ ) for ( let i = 0; i < RES; i ++ ) {

		const x = ORIGIN + i + 0.5, z = ORIGIN + j + 0.5;
		rock[ j * RES + i ] = 0.5 + 0.5 * Math.sin( x * 0.05 ) * Math.cos( z * 0.045 );
		rubble[ j * RES + i ] = Math.round( 128 + 127 * Math.sin( x * 0.07 + z * 0.05 ) );
		heights[ j * RES + i ] = groundH( x, z );

	}

	return {
		origin: ORIGIN, texel: 1, res: RES, size: RES, rock, rubble, heights,
		heightAt: groundH,
		normalAt: ( x:number, z:number, out:THREE.Vector3 ) => out.set( groundH( x - 0.5, z ) - groundH( x + 0.5, z ), 1, groundH( x, z - 0.5 ) - groundH( x, z + 0.5 ) ).normalize(),
		pathDistance: ( x:number, z:number ) => Math.min( ...math.PATHS.map( ( p ) => math.polylineDistance( p.pts, x, z )[ 0 ] - p.w ) ),
		rockSites: [ { kind: 'stack', x: - 260, z: 120, r: 9 }, { kind: 'arch', x: 0, z: 0, r: 5 }, { kind: 'stack', x: 300, z: 60, r: 14 } ],
	};

}
const GROUND = makeGround();
const VILLAGE = { getFootprints: () => [ { x: 40, z: - 118, r: 6 }, { x: 70, z: - 95, r: 4 } ] };

// ---------------------------------------------------------------------------- shared sources

describe( 'Tidewater shore: folder index', () => {

	it( 'exports the classes and one namespace per source module', () => {

		expect( [ shore.Rocks, shore.Reef, shore.Debris, shore.PebbleField, shore.ScannedDebris, shore.DebrisPlacer, shore.ReefBatch ].every( ( c ) => typeof c === 'function' ) ).toBe( true );
		expect( typeof shore.ReefGeometry.createElkhorn ).toBe( 'function' );
		expect( typeof shore.DebrisShapes.stonePart ).toBe( 'function' );

	} );

} );

describe( 'Tidewater shore: shared sources (Noise.js, hash2, bandFade, WORLD, PATHS, srgb / rot2)', () => {

	it( 'matches mulberry32, Noise2D, smoothstep and hash2', () => {

		for ( const seed of [ 0, 1, 913, 4242, 0xdeadbeef ] ) {

			const a = math.mulberry32( seed ), b = N.mulberry32( seed );
			expect( f64bits( Array.from( { length: 64 }, a ) ) ).toEqual( f64bits( Array.from( { length: 64 }, b ) ) );
			const na = new math.Noise2D( seed ), nb = new N.Noise2D( seed );
			expect( na.perm ).toEqual( nb.perm );
			expect( f32bits( na.grad ) ).toEqual( f32bits( nb.grad ) );
			const xs = [ - 300.7, - 1.5, 0, 0.25, 3.9, 77.123, 511.5 ];
			const out:number[][] = [ [], [] ];
			for ( const x of xs ) for ( const y of xs ) {

				out[ 0 ]!.push( na.noise( x, y ), na.fbm( x / 7, y / 9 ), na.fbm( x, y, 3, 2.3, 0.4 ), na.ridged( x / 5, y / 3 ) );
				out[ 1 ]!.push( nb.noise( x, y ), nb.fbm( x / 7, y / 9 ), nb.fbm( x, y, 3, 2.3, 0.4 ), nb.ridged( x / 5, y / 3 ) );

			}

			expect( f64bits( out[ 0 ]! ) ).toEqual( f64bits( out[ 1 ]! ) );

		}

		const hs:number[][] = [ [], [] ];
		for ( const i of [ - 7, 0, 3, 99, 1e6 ] ) for ( const j of [ - 2, 0, 5, 83492791 ] ) for ( const s of [ 0, 1, 17, 118 ] ) {

			hs[ 0 ]!.push( math.hash2( i, j, s ) );
			hs[ 1 ]!.push( TN.hash2( i, j, s ) );

		}

		expect( f64bits( hs[ 0 ]! ) ).toEqual( f64bits( hs[ 1 ]! ) );
		for ( const x of [ - 1, 0, 0.3, 0.5, 1, 2 ] ) expect( Object.is( math.smoothstep( 0, 1, x ), N.smoothstep( 0, 1, x ) ) ).toBe( true );

	} );

	it( 'matches bandFade, polylineDistance, PATHS, WORLD, srgb and rot2', () => {

		for ( const d of [ - 5, 0, 52.8, 60, 63.6, 67.2, 700, 1e9 ] ) for ( const [ a, b ] of [ [ 52.8, 67.2 ], [ 616, 700 ], [ 5, 5 ] ] ) expect( Object.is( math.bandFade( d, a!, b! ), LF.bandFade( d, a, b ) ) ).toBe( true );
		expect( math.PATHS ).toEqual( IS.PATHS );
		for ( const p of math.PATHS ) for ( const [ x, z ] of [ [ 20, - 70 ], [ 0, 0 ], [ 60, - 85 ], [ - 100, - 90 ] ] ) expect( math.polylineDistance( p.pts, x!, z! ) ).toEqual( IS.polylineDistance( p.pts, x, z ) );
		const plain = ( v:unknown ):unknown => v instanceof THREE.Vector3 || v instanceof THREE.Vector2 ? v.toArray() : v && typeof v === 'object' ? Object.fromEntries( Object.entries( v ).map( ( [ k, x ] ) => [ k, plain( x ) ] ) ) : v;
		expect( plain( math.WORLD ) ).toEqual( plain( W.WORLD ) );
		expect( math.srgb( 0.33, 0.27, 0.18 ) ).toBe( TS.srgb( 0.33, 0.27, 0.18 ) );
		expect( math.rot2( 'p.xz', 2.3 ) ).toBe( TS.rot2( 'p.xz', 2.3 ) );

	} );

} );

// ---------------------------------------------------------------------------- rocks

describe( 'Tidewater shore: rock geometry (RockGeometry.js)', () => {

	it( 'matches every style, seed and subdivision bit for bit', () => {

		expect( ROCK_STYLES ).toEqual( RG.ROCK_STYLES );
		for ( let s = 0; s < 4; s ++ ) for ( const seed of [ 17 + s * 101, 1, 999 ] ) for ( const sub of [ 0, 1, 2, 3 ] ) {

			expectSameGeometry( buildRockGeometry( s, seed, sub ), RG.buildRockGeometry( s, seed, sub ), `style ${ s } seed ${ seed } subdiv ${ sub }` );

		}

	} );

	it( 'has 1280 near and 320 far triangles', () => {

		expect( buildRockGeometry( 0, 17, 3 ).index!.count / 3 ).toBe( 1280 );
		expect( buildRockGeometry( 0, 17, 2 ).index!.count / 3 ).toBe( 320 );

	} );

} );

describe( 'Tidewater shore: rocks (Rocks.js)', () => {

	const recStandard = ( p:Mod ) => ( { params: p, modules: [] as unknown[], defines: {} as Record<string, number>, dispose() {} } );
	const gpu = { module: { name: 'terrainGPU' }, sunModulationModule: { name: 'sun' } };
	const terrainShadingModule = () => ( { name: 'terrainShading' } );
	const R = load( 'world/Rocks.js', {
		THREE, Noise2D: N.Noise2D, mulberry32: N.mulberry32, sstep: N.smoothstep, standard: recStandard, WORLD: W.WORLD,
		buildRockGeometry: RG.buildRockGeometry, ROCK_STYLES: RG.ROCK_STYLES, rot2: TS.rot2, srgb: TS.srgb, terrainShadingModule,
		lodFadeModule: { name: 'lodFade' }, bandFade: LF.bandFade,
	}, [ 'Rocks' ], ( s ) => s.replace( 'import { Noise2D, mulberry32, smoothstep as sstep }', '' ) );
	const scene = () => ( { added: [] as THREE.Object3D[], add( o:THREE.Object3D ) { this.added.push( o ); }, remove() {} } );
	const colliders = () => ( { list: [] as unknown[], addCylinder( ...a:unknown[] ) { this.list.push( a ); } } );
	const runs = [ 4242, 7 ].map( ( seed ) => {

		const ca = colliders(), cb = colliders();
		const ours = new Rocks( { scene: scene(), terrain: { data: GROUND, gpu }, village: VILLAGE, colliders: ca, seed, terrainShadingModule, lodFadeModule: { name: 'lodFade' } } );
		const theirs = new R.Rocks( { scene: scene(), terrain: { data: GROUND, gpu }, village: VILLAGE, colliders: cb, seed } );
		return { seed, ours, theirs, ca, cb };

	} );

	it( 'places the same rocks and colliders (2 seeds)', () => {

		for ( const { seed, ours, theirs, ca, cb } of runs ) {

			const pick = ( list:Any[] ) => list.map( ( r ) => [ r.x, r.y, r.z, r.size, r.sy, r.style, r.radius, ...r.matrix.elements ] ).flat();
			expect( ours.instances.length, `seed ${ seed }` ).toBe( theirs.instances.length );
			expect( f64bits( pick( ours.instances ) ), `seed ${ seed }` ).toEqual( f64bits( pick( theirs.instances ) ) );
			expect( ca.list, `seed ${ seed }` ).toEqual( cb.list );
			// every source of rocks is exercised by the test ground
			expect( ours.instances.length ).toBeGreaterThan( 300 );
			expect( new Set( ours.instances.map( ( r ) => r.style ) ).size ).toBe( 4 );
			expect( ours.instances.some( ( r ) => r.y < - 2 ) && ours.instances.some( ( r ) => r.y > 10 ) ).toBe( true );

		}

	} );

	it( 'builds the same buckets and material record', () => {

		const { ours, theirs } = runs[ 0 ]!;
		expect( ours.buckets.length ).toBe( 4 );
		ours.buckets.forEach( ( b, s ) => {

			const t = theirs.buckets[ s ];
			expect( [ b.members.length, b.nearTris, b.farTris, b.near.name, b.far.name, b.near.castShadow, b.far.castShadow ] )
				.toEqual( [ t.members.length, t.nearTris, t.farTris, t.near.name, t.far.name, t.near.castShadow, t.far.castShadow ] );
			expectSameGeometry( b.near.geometry, t.near.geometry, `near ${ s }` );
			expectSameGeometry( b.far.geometry, t.far.geometry, `far ${ s }` );

		} );
		const spec = ours.materialSpec, mat = theirs.material;
		expect( spec.params ).toEqual( mat.params );
		expect( [ spec.modules, spec.defines, spec.attributes, spec.varyings, spec.vertex, spec.shadow, spec.surface ] )
			.toEqual( [ mat.modules, mat.defines, mat.attributes, mat.varyings, mat.vertex, mat.shadow, mat.surface ] );
		expect( rocksMaterialSpec( null, true ) ).toEqual( { params: mat.params, modules: [], defines: {} } );
		const noSun = new R.Rocks( { scene: scene(), terrain: { data: { ...GROUND, rockSites: [], rubble: null, rock: new Float32Array( RES * RES ) }, gpu }, sunShadow: false } ).material;
		const spec2 = rocksMaterialSpec( gpu, false, terrainShadingModule, { name: 'lodFade' } );
		expect( [ spec2.modules, spec2.defines, spec2.surface ] ).toEqual( [ noSun.modules, noSun.defines, noSun.surface ] );

	} );

	it( 'buckets and fades the same instances for fixed cameras (LOD switch at 60 + 6 x size)', () => {

		const { ours, theirs } = runs[ 0 ]!;
		const cams:[ number[], number[] ][] = [ [ [ 0, 40, 60 ], [ 0, 0, - 200 ] ], [ [ - 250, 6, 140 ], [ - 260, 0, 120 ] ], [ [ 300, 80, - 300 ], [ 0, 0, 0 ] ], [ [ 120, 3, 20 ], [ 300, 0, 60 ] ] ];
		let seen = 0;
		for ( const [ p, look ] of cams ) {

			for ( const R of [ ours, theirs ] ) {

				const cam = new THREE.PerspectiveCamera( 55, 16 / 9, 0.1, 5000 );
				cam.position.set( p[ 0 ]!, p[ 1 ]!, p[ 2 ]! );
				cam.lookAt( look[ 0 ]!, look[ 1 ]!, look[ 2 ]! );
				cam.updateMatrixWorld();
				R.update( cam );

			}

			ours.buckets.forEach( ( b, s ) => {

				const t = theirs.buckets[ s ];
				for ( const [ m, n ] of [ [ b.near, t.near ], [ b.far, t.far ] ] as [ THREE.InstancedMesh, Any ][] ) {

					expect( m.count ).toBe( n.count );
					seen += m.count;
					expect( f32bits( m.instanceMatrix.array.slice( 0, m.count * 16 ) ) ).toEqual( f32bits( n.instanceMatrix.array.slice( 0, n.count * 16 ) ) );
					expect( f32bits( m.geometry.attributes.iLod!.array.slice( 0, m.count * 2 ) ) ).toEqual( f32bits( n.geometry.attributes.iLod.array.slice( 0, n.count * 2 ) ) );

				}

			} );
			expect( ours.stats().triangles ).toBe( theirs.stats().triangles );

		}

		expect( seen ).toBeGreaterThan( 50 );
		// the near / far switch of one rock: fully near before 60 + 6 x size - band, fully far after
		const r = ours.instances[ 0 ]!, dn = 60 + r.size * 6;
		expect( math.bandFade( dn * 0.94 - 1e-6, dn * 0.94, dn * 1.06 ) ).toBe( 0 );
		expect( math.bandFade( dn * 1.06, dn * 0.94, dn * 1.06 ) ).toBe( 1 );

	} );

} );

// ---------------------------------------------------------------------------- GLB reader

const GLB = load( 'world/debris/GLB.js', { BufferGeometry: THREE.BufferGeometry, BufferAttribute: THREE.BufferAttribute, Matrix4: THREE.Matrix4, Matrix3: THREE.Matrix3, Vector3: THREE.Vector3, Quaternion: THREE.Quaternion }, [ 'parseGLB' ] );
const assetBytes = ( name:string ) => {

	const b = readFileSync( new URL( 'public/models/debris/' + name, ROOT ) );
	return b.buffer.slice( b.byteOffset, b.byteOffset + b.byteLength ) as ArrayBuffer;

};

// a small GLB with an interleaved, unaligned, normalized-integer layout and a node hierarchy (the
// fallback paths the scanned assets do not use)
function syntheticGLB() {

	const bin = new DataView( new ArrayBuffer( 256 ) );
	// interleaved buffer view at offset 2 (unaligned for floats): stride 20 = pos (3 x f32) + uv (2 x u16 norm) + normal (i8 x 3 norm, pad)
	const verts = [ [ 0, 0, 0, 0, 0, 0, 127, 0 ], [ 1, 0, 0, 65535, 0, 0, 127, 0 ], [ 0, 0, 1, 0, 65535, 0, 127, 0 ], [ 1, 0.5, 1, 65535, 65535, 0, 90, 90 ] ];
	verts.forEach( ( v, i ) => {

		const o = 2 + i * 20;
		bin.setFloat32( o, v[ 0 ]!, true ); bin.setFloat32( o + 4, v[ 1 ]!, true ); bin.setFloat32( o + 8, v[ 2 ]!, true );
		bin.setUint16( o + 12, v[ 3 ]!, true ); bin.setUint16( o + 14, v[ 4 ]!, true );
		bin.setInt8( o + 16, v[ 5 ]! ); bin.setInt8( o + 17, v[ 6 ]! ); bin.setInt8( o + 18, v[ 7 ]! );

	} );
	[ 0, 2, 1, 1, 2, 3 ].forEach( ( k, i ) => bin.setUint8( 100 + i, k ) );
	const json = {
		asset: { version: '2.0' }, scene: 0, scenes: [ { nodes: [ 0 ] } ],
		nodes: [ { name: 'root', translation: [ 1, 2, 3 ], rotation: [ 0, 0.38268343, 0, 0.92387953 ], scale: [ 2, 1, 2 ], children: [ 1, 2 ] }, { mesh: 0 }, { name: 'LOD1x', matrix: [ 1, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1, 0, 5, 0, 0, 1 ], mesh: 0 } ],
		meshes: [ { name: 'quad', primitives: [ { attributes: { POSITION: 0, TEXCOORD_0: 1, NORMAL: 2 }, indices: 3 }, { mode: 1, attributes: { POSITION: 0 } } ] } ],
		bufferViews: [ { buffer: 0, byteOffset: 2, byteLength: 80, byteStride: 20 }, { buffer: 0, byteOffset: 100, byteLength: 6 } ],
		accessors: [
			{ bufferView: 0, byteOffset: 0, componentType: 5126, count: 4, type: 'VEC3' },
			{ bufferView: 0, byteOffset: 12, componentType: 5123, normalized: true, count: 4, type: 'VEC2' },
			{ bufferView: 0, byteOffset: 16, componentType: 5120, normalized: true, count: 4, type: 'VEC3' },
			{ bufferView: 1, componentType: 5121, count: 6, type: 'SCALAR' },
		],
		buffers: [ { byteLength: 256 } ],
	};
	let text = JSON.stringify( json );
	while ( text.length % 4 ) text += ' ';
	const jb = new TextEncoder().encode( text );
	const out = new DataView( new ArrayBuffer( 12 + 8 + jb.length + 8 + 256 ) );
	out.setUint32( 0, 0x46546C67, true ); out.setUint32( 4, 2, true ); out.setUint32( 8, out.byteLength, true );
	out.setUint32( 12, jb.length, true ); out.setUint32( 16, 0x4E4F534A, true );
	new Uint8Array( out.buffer, 20, jb.length ).set( jb );
	out.setUint32( 20 + jb.length, 256, true ); out.setUint32( 24 + jb.length, 0x004E4942, true );
	new Uint8Array( out.buffer, 28 + jb.length, 256 ).set( new Uint8Array( bin.buffer ) );
	return out.buffer;

}

describe( 'Tidewater shore: GLB reader (GLB.js)', () => {

	it( 'reads the four scanned debris GLBs of the source repository identically', () => {

		for ( const id of SCAN_ASSETS ) {

			const bytes = assetBytes( id + '.glb' );
			const a = parseGLB( bytes ), b = GLB.parseGLB( bytes );
			expect( a.json ).toEqual( b.json );
			expect( a.meshes.map( ( m ) => m.name ) ).toEqual( b.meshes.map( ( m:Any ) => m.name ) );
			expect( a.meshes.map( ( m ) => m.name ) ).toEqual( [ 'LOD0', 'LOD1', 'LOD2' ] );
			a.meshes.forEach( ( m, k ) => expectSameGeometry( m.geometry, b.meshes[ k ].geometry, `${ id } ${ m.name }` ) );

		}

	} );

	it( 'reads interleaved, normalized and hierarchical layouts identically', () => {

		const bytes = syntheticGLB();
		const a = parseGLB( bytes ), b = GLB.parseGLB( bytes );
		expect( a.meshes.map( ( m ) => m.name ) ).toEqual( [ 'quad', 'LOD1x' ] );
		expect( a.meshes.map( ( m ) => m.name ) ).toEqual( b.meshes.map( ( m:Any ) => m.name ) );
		a.meshes.forEach( ( m, k ) => expectSameGeometry( m.geometry, b.meshes[ k ].geometry, m.name ) );
		const bad = new Uint8Array( bytes.slice( 0 ) ); bad[ 0 ] = 0;
		expect( () => parseGLB( bad.buffer ) ).toThrow( 'GLB: bad magic' );

	} );

} );

// ---------------------------------------------------------------------------- scanned debris

class StubTexture { o:Mod; destroyed = 0; constructor( o:Mod ) { this.o = o; } getGPU() {} destroy() { this.destroyed ++; } }
// deterministic 8 x 8 RGBA "images" per URL (JPEG decoding is a browser job; the atlas packing is not)
const fakePixels = ( url:string ):ScanPixels => {

	let h = 0;
	for ( let i = 0; i < url.length; i ++ ) h = Math.imul( h ^ url.charCodeAt( i ), 16777619 );
	const r = math.mulberry32( h ), data = new Uint8Array( 8 * 8 * 4 );
	for ( let i = 0; i < data.length; i ++ ) data[ i ] = Math.floor( r() * 256 );
	return { data, width: 8, height: 8 };

};
const fileOf = ( url:string ) => assetBytes( url.slice( url.lastIndexOf( '/' ) + 1 ) );

function scanInstances( seed:number ):ScanInstance[] {

	const r = math.mulberry32( seed ), out:ScanInstance[] = [];
	for ( let i = 0; i < 60; i ++ ) {

		const s = 0.6 + r() * 0.8;
		out.push( { asset: i % 4, x: ( r() - 0.5 ) * 400, y: r() * 2, z: ( r() - 0.5 ) * 400, yaw: r() * 6.28, ...( i % 3 ? { pitch: r() - 0.5, roll: r() - 0.5 } : {} ), sx: s, sy: s * ( 0.8 + r() * 0.4 ), sz: s, rnd: r() } );

	}

	return out;

}

describe( 'Tidewater shore: scanned debris (ScannedDebris.js)', () => {

	const SD = load( 'world/debris/ScannedDebris.js', {
		Vector3: THREE.Vector3, Quaternion: THREE.Quaternion, Euler: THREE.Euler, Matrix4: THREE.Matrix4, Frustum: THREE.Frustum, Sphere: THREE.Sphere,
		BufferGeometry: THREE.BufferGeometry, Float32BufferAttribute: THREE.Float32BufferAttribute, Uint16BufferAttribute: THREE.Uint16BufferAttribute,
		Uint32BufferAttribute: THREE.Uint32BufferAttribute, InstancedBufferAttribute: THREE.InstancedBufferAttribute, InstancedMesh: THREE.InstancedMesh,
		DynamicDrawUsage: THREE.DynamicDrawUsage, Texture: StubTexture, generateMipmaps: () => {}, commonModule: { name: 'common' }, lodFadeModule: { name: 'lodFade' },
		bandFade: LF.bandFade, standard: ( p:Mod ) => ( { params: p, dispose() {} } ), srgb: TS.srgb, parseGLB: GLB.parseGLB,
	}, [ 'ScannedDebris', 'SCAN_ASSETS', 'SCAN', 'SCAN_SIZE' ], ( s ) => s.replace( '( import.meta.env && import.meta.env.BASE_URL )', 'undefined' ) );
	const gpu = { module: { name: 'terrainGPU' }, sunModulationModule: { name: 'sun' } };
	const group = () => new THREE.Group();

	it( 'loads, packs and buckets the same as the source (2 instance sets)', async () => {

		Object.assign( globalThis, { __debrisFile: fileOf, __debrisImage: fakePixels } );
		try {

			for ( const seed of [ 3, 11 ] ) {

				const ours = new ScannedDebris( { gpu, instances: scanInstances( seed ), parent: group(), loadBytes: async ( u ) => fileOf( u ), loadPixels: async ( u ) => fakePixels( u ) } );
				const theirs = new SD.ScannedDebris( { gpu, instances: scanInstances( seed ), parent: group() } );
				await Promise.all( [ ours.promise, theirs.promise ] );
				expect( [ ours.ready, theirs.ready ] ).toEqual( [ true, true ] );
				expect( f64bits( ours.instances.flatMap( ( r ) => [ r.radius!, ...r.matrix!.elements ] ) ) ).toEqual( f64bits( theirs.instances.flatMap( ( r:Any ) => [ r.radius, ...r.matrix.elements ] ) ) );
				for ( const m of [ 'albedo', 'normal', 'arm' ] as const ) {

					const a = ours.textures![ m ].options, b = theirs.textures[ m ].o;
					expect( { ...a, data: null } ).toEqual( { ...b, data: null } );
					expect( Buffer.from( a.data ).equals( Buffer.from( b.data ) ) ).toBe( true );

				}

				ours.levels.forEach( ( L, l ) => {

					expectSameGeometry( L.mesh.geometry, theirs.levels[ l ].mesh.geometry, `lod ${ l }` );
					expect( [ L.tris, L.mesh.name, L.mesh.castShadow ] ).toEqual( [ theirs.levels[ l ].tris, theirs.levels[ l ].mesh.name, theirs.levels[ l ].mesh.castShadow ] );

				} );
				const { textures: ta, ...pa } = ours.materialSpec!.params as Any, { textures: tb, ...pb } = theirs.material.params;
				expect( pa ).toEqual( pb );
				expect( Object.keys( ta ) ).toEqual( Object.keys( tb ) );
				for ( const p of [ [ 0, 1.5, 0 ], [ 30, 4, 30 ], [ - 150, 20, 150 ], [ 0, 400, 0 ] ] ) {

					for ( const D of [ ours, theirs ] ) {

						const cam = new THREE.PerspectiveCamera( 60, 1.5, 0.1, 3000 );
						cam.position.set( p[ 0 ]!, p[ 1 ]!, p[ 2 ]! );
						cam.lookAt( 50, 0, 60 );
						cam.updateMatrixWorld();
						D.update( cam );

					}

					ours.levels.forEach( ( L, l ) => {

						const T = theirs.levels[ l ];
						expect( L.mesh.count ).toBe( T.mesh.count );
						expect( f32bits( L.mesh.instanceMatrix.array.slice( 0, L.mesh.count * 16 ) ) ).toEqual( f32bits( T.mesh.instanceMatrix.array.slice( 0, T.mesh.count * 16 ) ) );
						expect( f32bits( L.iData.array.slice( 0, L.mesh.count * 4 ) ) ).toEqual( f32bits( T.iData.array.slice( 0, T.mesh.count * 4 ) ) );

					} );
					expect( ours.triangles ).toBe( theirs.triangles );

				}

			}

		} finally {

			delete ( globalThis as Mod ).__debrisFile;
			delete ( globalThis as Mod ).__debrisImage;

		}

	} );

	it( 'loads nothing unless asked (no assets ship with Genvr)', () => {

		const d = new ScannedDebris( { gpu, instances: scanInstances( 1 ), parent: group(), autoLoad: false } );
		expect( [ d.promise, d.ready, d.triangles ] ).toEqual( [ null, false, 0 ] );

	} );

} );

// ---------------------------------------------------------------------------- nature material

describe( 'Tidewater shore: nature material (NatureMaterial.js)', () => {

	const NM = load( 'world/debris/NatureMaterial.js', {
		ShaderModule: StubShaderModule, commonModule: RECORDING_ENGINE.commonModule, standard: ( p:Mod ) => ( { params: p } ),
		lodFadeModule: RECORDING_ENGINE.lodFadeModule, srgb: TS.srgb, terrainShadingModule: RECORDING_ENGINE.terrainShadingModule,
	}, [ 'aTint', 'aData', 'stoneSurfaceModule', 'NATURE_SURFACE', 'createNatureMaterial' ] );
	const gpu = { module: { name: 'terrainGPU' }, sunModulationModule: { name: 'sun' } };

	it( 'keeps the WGSL and the material record', () => {

		expect( [ nature.aTint, nature.aData ] ).toEqual( [ NM.aTint, NM.aData ] );
		expect( nature.stoneSurfaceModule.name ).toBe( NM.stoneSurfaceModule.name );
		expect( nature.stoneSurfaceModule.code ).toBe( NM.stoneSurfaceModule.code );
		expect( nature.NATURE_SURFACE ).toBe( NM.NATURE_SURFACE );
		for ( const sunShadow of [ true, false ] ) {

			const a = nature.createNatureMaterial( gpu, { sunShadow } ).params as Any, b = NM.createNatureMaterial( gpu, { sunShadow } ).params;
			const names = ( m:Any[] ) => m.map( ( x ) => x.name );
			expect( { ...a, modules: names( a.modules ) } ).toEqual( { ...b, modules: names( b.modules ) } );

		}

	} );

} );

// Executes the ORIGINAL pinned Tidewater reef geometry / noise source (read only) against the installed
// three.js (injected as the engine namespace) and compares the port bit-exact.
type ReefGeoMod = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- untyped original module
const reefGeoRoot = new URL('../../../../tooling/other-programs/tidewater/src/', import.meta.url);
const reefGeoRead = (path: string) => readFileSync(new URL(path, reefGeoRoot), 'utf8');
function reefGeoLoad(path: string, deps: Record<string, unknown>, names: string[]): ReefGeoMod {
  const body = reefGeoRead(path).replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/^export /gm, '');
  const keys = Object.keys(deps);
  return new Function(...keys, `${body}\n;return {${names.join(',')}};`)(...keys.map(k => deps[k])) as ReefGeoMod;
}

const reefGeoNoiseUtil = reefGeoLoad('util/Noise.js', {}, ['mulberry32']);
const reefGeoOrigRng = reefGeoNoiseUtil.mulberry32 as (seed: number) => () => number;
const REEF_GEO_NAMES = ['rand', 'perpendicular', 'randomUnitVector', 'waveNoise', 'MeshBuilder', 'bakeOcclusion', 'tube', 'lathe',
  'icosphere', 'blob', 'sheet', 'smoothNormals', 'branch', 'path', 'createMound', 'createLobes', 'createDome', 'createPillars',
  'createElkhorn', 'createStaghorn', 'createFingers', 'createBlades', 'createPlates', 'createSeaRod', 'createWhips', 'createBarrel',
  'createTubes', 'createRopes', 'createUrchin', 'createAnemone', 'createRubble', 'createSeagrass', 'createSeaFan', 'createSeaPlume',
  'createMeadow', 'createHalimeda', 'createPenicillus', 'createSargassum', 'createLettuce', 'createWallPlates', 'createWireCoral',
  'createBlackCoral', 'createEarSponge', 'createStarfish', 'createCucumber', 'createConch'];
const reefGeoOrig = reefGeoLoad('world/reef/ReefGeometry.js', { THREE }, REEF_GEO_NAMES);
class ReefGeoFakeTexture { options: unknown; constructor(o: unknown) { this.options = o; } }
const reefNoiseOrig = reefGeoLoad('world/reef/ReefNoise.js', { Texture: ReefGeoFakeTexture, mulberry32: reefGeoOrigRng },
  ['NOISE_SCALE', 'createNoiseVolume']);

const reefGeoBits = (array: ArrayLike<number>) => new Uint32Array(Float32Array.from(array).buffer);
const reefGeoBits64 = (array: ArrayLike<number>) => new Uint32Array(Float64Array.from(array).buffer);
function reefGeoSame(actual: THREE.BufferGeometry, expected: THREE.BufferGeometry, label: string) {
  const names = Object.keys(expected.attributes);
  expect(Object.keys(actual.attributes), label).toEqual(names);
  for (const name of names) {
    const a = actual.getAttribute(name) as THREE.BufferAttribute, b = expected.getAttribute(name) as THREE.BufferAttribute;
    expect([a.itemSize, a.count, a.array.constructor.name], `${label} ${name}`).toEqual([b.itemSize, b.count, b.array.constructor.name]);
    expect(reefGeoBits(a.array), `${label} ${name} bits`).toEqual(reefGeoBits(b.array));
  }
  expect(actual.index?.array.constructor.name, label).toBe(expected.index?.array.constructor.name);
  expect(Array.from(actual.index!.array), `${label} index`).toEqual(Array.from(expected.index!.array));
  expect(actual.boundingBox, label).toEqual(expected.boundingBox);
  expect(actual.boundingSphere, label).toEqual(expected.boundingSphere);
}
// MeshBuilder state: JS number arrays compared as Float64 bits (so -0 and every ulp count)
type ReefGeoBuilderLike = { position: number[]; normal: number[]; data: number[]; index: number[] };
function reefGeoSameBuilder(a: ReefGeoBuilderLike, b: ReefGeoBuilderLike, label: string) {
  for (const k of ['position', 'normal', 'data'] as const) expect(reefGeoBits64(a[k]), `${label} ${k}`).toEqual(reefGeoBits64(b[k]));
  expect(a.index, `${label} index`).toEqual(b.index);
}
const reefGeoVec = (v: THREE.Vector3) => reefGeoBits64([v.x, v.y, v.z]);
// large byte volumes: Buffer equality (vitest deep equal on 1M-element arrays is slow)
function reefGeoSameBytes(a: Uint8Array, b: Uint8Array, label: string) {
  expect([a.constructor.name, a.length], label).toEqual([b.constructor.name, b.length]);
  expect(Buffer.from(a.buffer, a.byteOffset, a.length).equals(Buffer.from(b.buffer, b.byteOffset, b.length)), label).toBe(true);
}
const reefGeoOptsNoData = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'data'));

// Reef.js MODELS table (src/world/Reef.js 52-93): generator and level-of-detail count ( lods ?? 3 )
type ReefGeoGen = (m: ReefGeoMod, rng: () => number, lod: number) => THREE.BufferGeometry;
const REEF_GEO_MODELS: [string, ReefGeoGen, number][] = [
  ['rock', (m, r, l) => m.createMound(r, l, 'rock'), 3],
  ['slab', (m, r, l) => m.createMound(r, l, 'slab'), 4],
  ['boulder', (m, r, l) => m.createMound(r, l, 'boulder'), 3],
  ['knobby', (m, r, l) => m.createMound(r, l, 'knobby'), 3],
  ['smooth (not in MODELS)', (m, r, l) => m.createMound(r, l, 'smooth'), 3],
  ['dome', (m, r, l) => m.createDome(r, l), 3],
  ['lobes', (m, r, l) => m.createLobes(r, l), 3],
  ['pillars', (m, r, l) => m.createPillars(r, l), 3],
  ['elkhorn', (m, r, l) => m.createElkhorn(r, l), 3],
  ['staghorn', (m, r, l) => m.createStaghorn(r, l), 3],
  ['fingers', (m, r, l) => m.createFingers(r, l), 3],
  ['blades', (m, r, l) => m.createBlades(r, l), 2],
  ['plates', (m, r, l) => m.createPlates(r, l), 3],
  ['rod', (m, r, l) => m.createSeaRod(r, l), 3],
  ['whip', (m, r, l) => m.createWhips(r, l), 3],
  ['barrel', (m, r, l) => m.createBarrel(r, l), 3],
  ['tubes', (m, r, l) => m.createTubes(r, l, false), 3],
  ['vase', (m, r, l) => m.createTubes(r, l, true), 3],
  ['rope', (m, r, l) => m.createRopes(r, l), 3],
  ['urchin', (m, r, l) => m.createUrchin(r, l), 2],
  ['anemone', (m, r, l) => m.createAnemone(r, l), 2],
  ['rubble', (m, r, l) => m.createRubble(r, l), 3],
  ['grass', (m, r, l) => m.createSeagrass(r, l), 2],
  ['fan', (m, r, l) => m.createSeaFan(r, l), 3],
  ['plume', (m, r, l) => m.createSeaPlume(r, l), 3],
  ['lettuce', (m, r, l) => m.createLettuce(r, l), 3],
  ['wallPlates', (m, r, l) => m.createWallPlates(r, l), 3],
  ['wire', (m, r, l) => m.createWireCoral(r, l), 3],
  ['blackCoral', (m, r, l) => m.createBlackCoral(r, l), 3],
  ['ear', (m, r, l) => m.createEarSponge(r, l), 3],
  ['meadow', (m, r, l) => m.createMeadow(r, l), 3],
  ['halimeda', (m, r, l) => m.createHalimeda(r, l), 3],
  ['penicillus', (m, r, l) => m.createPenicillus(r, l), 2],
  ['sargassum', (m, r, l) => m.createSargassum(r, l), 3],
  ['starfish', (m, r, l) => m.createStarfish(r, l), 2],
  ['cucumber', (m, r, l) => m.createCucumber(r, l), 2],
  ['conch', (m, r, l) => m.createConch(r, l), 2],
];
// several seeds, incl. the Reef.js build seeds ( seed ++ * 7919 )
const REEF_GEO_SEEDS = [1, 7, 12345, 0xdeadbeef, 7919, 3 * 7919];

describe('Tidewater reef geometry port (ReefGeometry.js)', () => {
  it('exports every source name', () => {
    for (const n of REEF_GEO_NAMES) expect(typeof (ReefGeo as Record<string, unknown>)[n], n).toBe(typeof reefGeoOrig[n]);
  });

  for (const [name, gen, lods] of REEF_GEO_MODELS) {
    it(`${name}: every lod over several seeds is bit-exact`, () => {
      for (const seed of REEF_GEO_SEEDS) for (let l = 0; l < lods; l++) {
        const rp = reefGeoPortRng(seed), ro = reefGeoOrigRng(seed);
        const a = gen(ReefGeo, rp, l), b = gen(reefGeoOrig, ro, l);
        reefGeoSame(a, b, `${name} seed ${seed} lod ${l}`);
        expect(rp(), `${name} rng state`).toBe(ro());
      }
    });
  }

  it('rand / perpendicular / randomUnitVector / waveNoise', () => {
    const rp = reefGeoPortRng(42), ro = reefGeoOrigRng(42);
    for (let i = 0; i < 20; i++) expect(ReefGeo.rand(rp, -0.3, 1.7)).toBe(reefGeoOrig.rand(ro, -0.3, 1.7));
    for (const v of [[0, 1, 0], [0.3, -0.95, 0.1], [1, 0.2, -0.4], [0, 0.89, 0.2]] as const) {
      const p = new THREE.Vector3(...v);
      expect(reefGeoVec(ReefGeo.perpendicular(p))).toEqual(reefGeoVec(reefGeoOrig.perpendicular(p)));
    }
    for (let i = 0; i < 10; i++) expect(reefGeoVec(ReefGeo.randomUnitVector(rp))).toEqual(reefGeoVec(reefGeoOrig.randomUnitVector(ro)));
    const wp = ReefGeo.waveNoise(rp, 7, 3, 11), wo = reefGeoOrig.waveNoise(ro, 7, 3, 11);
    for (let i = 0; i < 30; i++) expect(Object.is(wp(i * 0.37, -i * 0.11, i * 0.05 - 1), wo(i * 0.37, -i * 0.11, i * 0.05 - 1))).toBe(true);
    expect(rp()).toBe(ro());
  });

  it('MeshBuilder vertex / tri / quad / backfaces / build ( normals, ao )', () => {
    const make = (M: ReefGeoMod) => {
      const b = new M.MeshBuilder();
      const v = (x: number, y: number, z: number) => b.vertex(new THREE.Vector3(x, y, z), new THREE.Vector3(0, 1, 0), x, 1, z, y);
      v(0, 0, 0); v(1, 0.2, 0); v(1, 0.5, 1); v(0, 0.1, 1); v(0.5, 0.9, 0.5);
      b.quad(0, 1, 2, 3); b.tri(0, 1, 4); b.tri(2, 3, 4);
      b.backfaces(1, 3);
      return b;
    };
    const p = make(ReefGeo), o = make(reefGeoOrig);
    expect(p.count).toBe(o.count);
    reefGeoSameBuilder(p, o, 'builder');
    reefGeoSame(p.build(), o.build(), 'build plain');
    reefGeoSame(make(ReefGeo).build({ normals: true }), make(reefGeoOrig).build({ normals: true }), 'build normals');
    reefGeoSame(make(ReefGeo).build({ normals: true, ao: { radius: 0.8, strength: 0.7 } }),
      make(reefGeoOrig).build({ normals: true, ao: { radius: 0.8, strength: 0.7 } }), 'build ao');
    reefGeoSame(make(ReefGeo).build({ ao: { radius: 2, ground: false } }), make(reefGeoOrig).build({ ao: { radius: 2, ground: false } }), 'build ao no ground');
  });

  it('bakeOcclusion on a fixed geometry (with and without ground)', () => {
    for (const [r, s, g] of [[0.3, 1, true], [0.15, 0.55, true], [0.5, 2, false]] as const) {
      const ga = new THREE.TorusKnotGeometry(0.3, 0.1, 40, 6), gb = new THREE.TorusKnotGeometry(0.3, 0.1, 40, 6);
      for (const geo of [ga, gb]) {
        geo.translate(0, 0.35, 0);
        const n = geo.attributes.position!.count, d = new Float32Array(n * 4);
        for (let i = 0; i < n; i++) d[i * 4 + 1] = 1 - (i % 7) * 0.01;
        geo.setAttribute('aData', new THREE.Float32BufferAttribute(d, 4));
      }
      ReefGeo.bakeOcclusion(ga, r, s, g);
      reefGeoOrig.bakeOcclusion(gb, r, s, g);
      expect(reefGeoBits(ga.attributes.aData!.array)).toEqual(reefGeoBits(gb.attributes.aData!.array));
    }
  });

  it('tube with sides / cap / capLength / ellipse / axis / twist / data', () => {
    const pts = (M: ReefGeoMod) => M.path(new THREE.Vector3(0.1, 0, -0.2), new THREE.Vector3(0.2, 1, 0.1), 0.8, 7,
      (i: number, d: THREE.Vector3) => { d.x += Math.sin(i) * 0.2; d.z -= 0.05 * i; });
    const radii = [0.05, 0.048, 0.045, 0.04, 0.035, 0.03, 0.024, 0.02];
    const cases: ((M: ReefGeoMod) => Record<string, unknown>)[] = [
      () => ({}),
      () => ({ sides: 9, cap: true }),
      () => ({ sides: 5, cap: true, capLength: 0.4, ellipse: 0.6, twist: 0.3 }),
      () => ({ axis: new THREE.Vector3(1, 0, 0), ellipse: 0.3, data: (i: number, t: number) => [t * 2, i, 0.25] }),
      () => ({ axis: (i: number) => new THREE.Vector3(Math.cos(i), 0.2, Math.sin(i)), cap: true, data: (i: number, t: number) => [t, 1, i * 0.1] }),
      () => ({ axis: new THREE.Vector3(0.2, 1, 0.1) }), // degenerate hint along the tangent -> perpendicular fallback
    ];
    for (const [k, c] of cases.entries()) {
      const bp = new ReefGeo.MeshBuilder(), bo = new reefGeoOrig.MeshBuilder();
      bp.vertex(new THREE.Vector3(), new THREE.Vector3(0, 1, 0)); bo.vertex(new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
      const fp = ReefGeo.tube(bp, pts(ReefGeo), radii, c(ReefGeo) as ReefGeo.TubeOptions), fo = reefGeoOrig.tube(bo, pts(reefGeoOrig), radii, c(reefGeoOrig));
      reefGeoSameBuilder(bp, bo, `tube ${k}`);
      expect(fp.length).toBe(fo.length);
      for (const key of ['T', 'N', 'B'] as const) expect(fp[key].map(reefGeoVec), `tube ${k} ${key}`).toEqual(fo[key].map(reefGeoVec));
    }
  });

  it('lathe (with / without radial and offsets), blob, sheet, smoothNormals', () => {
    const prof = [{ r: 0.2, y: -0.02 }, { r: 0.3, y: 0.2, d: [0.2, 0, 0.5] }, { r: 0.25, y: 0.5, d: [0.5, 1, 0] }, { r: 0.05, y: 0.4, d: [0.4, 1, 0] }];
    const run = (M: ReefGeoMod) => {
      const b = new M.MeshBuilder();
      M.lathe(b, prof, 9);
      M.lathe(b, prof, 13, (phi: number, i: number) => 1 + 0.1 * Math.sin(phi * 3 + i), 0.3, -0.2);
      M.blob(b, 2, (d: THREE.Vector3, out: THREE.Vector3) => { out.copy(d).multiplyScalar(0.3 + 0.05 * d.x); return d.y > 0 ? [d.y, 0, 0.5] : undefined; });
      const f = b.count, fi = b.index.length;
      M.sheet(b, 6, 4, (u: number, v: number, out: THREE.Vector3) => { out.set(u - 0.5, v * 0.4 + u * u * 0.1, Math.sin(u * 3) * 0.05); return [v, 0, u]; });
      M.sheet(b, 3, 5, (u: number, v: number, out: THREE.Vector3) => { out.set(u, v, u * v); }, false);
      M.smoothNormals(b, f, fi);
      M.smoothNormals(b);
      return b;
    };
    const p = run(ReefGeo), o = run(reefGeoOrig);
    reefGeoSameBuilder(p, o, 'primitives');
    reefGeoSame(p.build({ ao: { radius: 0.2 } }), o.build({ ao: { radius: 0.2 } }), 'primitives build');
  });

  it('icosphere levels 0..4 (verts, faces, winding)', () => {
    for (let d = 0; d <= 4; d++) {
      const a = ReefGeo.icosphere(d), b = reefGeoOrig.icosphere(d);
      expect(a.verts.map(reefGeoVec), `ico ${d}`).toEqual(b.verts.map(reefGeoVec));
      expect(a.faces, `ico ${d}`).toEqual(b.faces);
      expect(ReefGeo.icosphere(d)).toBe(a); // cached
    }
  });

  it('branch (breadth-first order, budget) and path', () => {
    const run = (M: ReefGeoMod) => {
      const log: number[] = [];
      M.branch([{ id: 1, depth: 0 }, { id: 2, depth: 0 }], 9, (s: { id: number; depth: number }) => {
        log.push(s.id);
        return s.depth < 3 ? [{ id: s.id * 10, depth: s.depth + 1 }, { id: s.id * 10 + 1, depth: s.depth + 1 }] : null;
      });
      const pts = M.path(new THREE.Vector3(1, 2, 3), new THREE.Vector3(0, 2, 1), 1.3, 5, (i: number, d: THREE.Vector3) => { d.y -= 0.1 * i; });
      const plain = M.path(new THREE.Vector3(), new THREE.Vector3(1, 1, 0), 2, 3);
      return [log, pts.map(reefGeoVec), plain.map(reefGeoVec)];
    };
    expect(run(ReefGeo)).toEqual(run(reefGeoOrig));
  });

  it('reef model triangle / vertex counts (seed 1)', () => {
    const rows: string[] = [];
    for (const [name, gen, lods] of REEF_GEO_MODELS) {
      const cells: string[] = [];
      for (let l = 0; l < lods; l++) {
        const g = gen(ReefGeo, reefGeoPortRng(1), l);
        cells.push(`${g.index!.count / 3}/${g.attributes.position!.count}`);
      }
      rows.push(`${name}: ${cells.join(' | ')}`);
    }
    expect(rows.length).toBe(REEF_GEO_MODELS.length);
  });
});

describe('Tidewater reef noise port (ReefNoise.js)', () => {
  it('NOISE_SCALE', () => expect(ReefNoise.NOISE_SCALE).toBe(reefNoiseOrig.NOISE_SCALE));

  for (const [size, cells, seed] of [[64, 8, 90210], [16, 4, 1], [24, 6, 0xdeadbeef], [32, 5, 7]] as const) {
    it(`volume data and Texture options size ${size} cells ${cells} seed ${seed}`, { timeout: 60000 }, () => {
      const orig = reefNoiseOrig.createNoiseVolume(size, cells, seed) as ReefGeoFakeTexture;
      const o = orig.options as ReefNoise.NoiseVolumeTextureOptions;
      const data = ReefNoise.createNoiseVolumeData(size, cells, seed);
      reefGeoSameBytes(data, o.data, 'volume');
      const recorded: ReefNoise.NoiseVolumeTextureOptions[] = [];
      const tex = ReefNoise.createNoiseVolume((opts) => { recorded.push(opts); return { opts }; }, size, cells, seed);
      expect(tex.opts).toBe(recorded[0]);
      expect(recorded).toHaveLength(1);
      expect(Object.keys(recorded[0]!)).toEqual(Object.keys(o));
      expect(reefGeoOptsNoData({ ...recorded[0]! })).toEqual(reefGeoOptsNoData({ ...o }));
      reefGeoSameBytes(recorded[0]!.data, o.data, 'texture data');
    });
  }

  it('defaults match the source ( 64, 8, 90210 )', { timeout: 60000 }, () => {
    const o = (reefNoiseOrig.createNoiseVolume() as ReefGeoFakeTexture).options as ReefNoise.NoiseVolumeTextureOptions;
    const p = ReefNoise.createNoiseVolume((opts) => opts);
    expect(reefGeoOptsNoData({ ...p })).toEqual(reefGeoOptsNoData({ ...o }));
    expect(p.width).toBe(64);
    reefGeoSameBytes(p.data, o.data, 'default volume');
  });
});

// Executes the ORIGINAL pinned Tidewater debris source (read only) against the installed three.js and
// compares it with the port bit for bit. GeoBuilder / DebrisShapes cache parts by keys, so every test
// calls the port and the original with the same arguments in the same order (same cache history).
type DebrisMod = Record<string, unknown>;
const debrisRoot = new URL( '../../../../tooling/other-programs/tidewater/src/', import.meta.url );
const debrisRead = ( path:string ) => readFileSync( new URL( path, debrisRoot ), 'utf8' );
const debrisStrip = ( text:string ) => text.replace( /^import[\s\S]*?from\s*'[^']*';\r?\n/gm, '' ).replace( /^export /gm, '' );
function debrisLoad( path:string, deps:DebrisMod, names:string[] ):DebrisMod {

	return new Function( ...Object.keys( deps ), debrisStrip( debrisRead( path ) ) + `;return {${ names.join( ',' ) }};` )( ...Object.values( deps ) ) as DebrisMod;

}

const debrisPick = ( src:DebrisMod, names:string[] ) => Object.fromEntries( names.map( ( n ) => [ n, src[ n ] ] ) );
class DebrisStubFish { add() {} build() { return new THREE.Group(); } }
const { BufferGeometry, Euler, Float32BufferAttribute, Matrix3, Matrix4, Quaternion, Uint16BufferAttribute, Uint32BufferAttribute, Vector3, Color } = THREE;
const debrisN = debrisLoad( 'util/Noise.js', {}, [ 'mulberry32', 'Noise2D', 'smoothstep' ] );
const debrisG = debrisLoad( 'world/village/GeoBuilder.js', { BufferGeometry, Euler, Float32BufferAttribute, Matrix3, Matrix4, Quaternion, Uint16BufferAttribute, Uint32BufferAttribute, Vector3 },
	[ 'Part', 'mat4', 'fixWinding', 'slabPart', 'CAP_U', 'Builder', 'gridPart', 'sagPoints', 'Batch' ] );
const debrisP = debrisLoad( 'world/Props.js', { Color, Matrix4, Vector3, Builder: debrisG.Builder, mat4: debrisG.mat4, gridPart: debrisG.gridPart, slabPart: debrisG.slabPart, sagPoints: debrisG.sagPoints, FishProps: DebrisStubFish, mulberry32: debrisN.mulberry32 },
	[ 'WOOD', 'HARD', 'C', 'lin', 'mulc', 'buoy', 'ropeCoil', 'bucket', 'rowboat', 'oar', 'woodpile', 'InstancedProps' ] );
const debrisW = debrisLoad( 'world/WorldLayout.js', { THREE }, [ 'WORLD' ] );
// ScannedDebris.js asset table (lines 24-27; the rest of the module is GPU / GLB loading)
const debrisScanText = debrisRead( 'world/debris/ScannedDebris.js' );
const debrisScanTable = debrisScanText.slice( debrisScanText.indexOf( 'export const SCAN_ASSETS' ), debrisScanText.indexOf( 'const LOD_DIST' ) );
const debrisScan = new Function( debrisStrip( debrisScanTable ) + ';return { SCAN_ASSETS, SCAN, SCAN_SIZE };' )() as DebrisMod;
const DEBRIS_SHAPE_NAMES = [ 'KIND', 'nat', 'hash1', 'vnoise3', 'gridMesh', 'mergeParts', 'taperTube', 'stonePart', 'stone', 'minGround', 'driftLog', 'branch', 'plank', 'coconut', 'husk', 'weedMat',
	'seagrassWrack', 'frond', 'shell', 'coralPiece', 'tyre', 'bottle', 'flipFlop', 'ropeScrap', 'netScrap', 'floatBuoy', 'wheelbarrow', 'plankPile' ];
const debrisOS = debrisLoad( 'world/debris/DebrisShapes.js', { Vector3, Matrix4, ...debrisPick( debrisG, [ 'Part', 'mat4', 'fixWinding', 'slabPart', 'CAP_U' ] ), ...debrisPick( debrisP, [ 'WOOD', 'HARD', 'C', 'lin', 'mulc', 'buoy' ] ) },
	DEBRIS_SHAPE_NAMES ) as unknown as typeof shapes;
const debrisOP = debrisLoad( 'world/debris/DebrisPlacement.js', {
	Vector3, Noise2D: debrisN.Noise2D, mulberry32: debrisN.mulberry32, sstep: debrisN.smoothstep, WORLD: debrisW.WORLD,
	...debrisPick( debrisP, [ 'C', 'lin', 'mulc', 'WOOD', 'buoy', 'ropeCoil', 'bucket', 'rowboat', 'oar', 'woodpile' ] ),
	...debrisPick( debrisOS as unknown as DebrisMod, DEBRIS_SHAPE_NAMES ), SCAN: debrisScan.SCAN, SCAN_SIZE: debrisScan.SCAN_SIZE,
}, [ 'DebrisPlacer' ] ) as unknown as typeof placement;
const debrisOrigMulberry = debrisN.mulberry32 as ( s:number ) => () => number;

// ---------------------------------------------------------------------------- comparison helpers

/** First index where two number arrays differ bit for bit (float64, -0 and NaN included), or -1. */
function debrisDiff( a:ArrayLike<number>, b:ArrayLike<number> ) {

	if ( a.length !== b.length ) return - 2;
	const A = Float64Array.from( a ), B = Float64Array.from( b );
	if ( Buffer.from( A.buffer ).equals( Buffer.from( B.buffer ) ) ) return - 1;
	for ( let i = 0; i < A.length; i ++ ) if ( ! Object.is( A[ i ], B[ i ] ) ) return i;
	return - 3;

}

function debrisSamePart( a:geo.Part, b:geo.Part, label:string ) {

	for ( const k of [ 'p', 'n', 'uv', 'idx' ] as const ) expect( debrisDiff( a[ k ], b[ k ] ), `${ label }.${ k }` ).toBe( - 1 );

}

function debrisSameBuilder( a:geo.Builder, b:geo.Builder, label:string ) {

	expect( Object.keys( a.batches ), label ).toEqual( Object.keys( b.batches ) );
	for ( const key of Object.keys( a.batches ) ) {

		const x = a.batches[ key ]!, y = b.batches[ key ]!;
		expect( x.vcount, `${ label }.${ key }` ).toBe( y.vcount );
		for ( const k of [ 'pos', 'nrm', 'uv', 'tint', 'data', 'idx' ] as const ) expect( debrisDiff( x[ k ], y[ k ] ), `${ label }.${ key }.${ k }` ).toBe( - 1 );

	}

	expect( a.stack.length, label ).toBe( 0 );
	expect( b.stack.length, label ).toBe( 0 );

}

/** Deep bit-exact comparison of plain values (numbers via Object.is, arrays, objects, Vector3). */
function debrisSameValue( a:unknown, b:unknown, label:string ) {

	const norm = ( v:unknown ):unknown => {

		if ( v instanceof THREE.Vector3 ) return [ 'V3', v.x, v.y, v.z ];
		if ( v instanceof Float32Array ) return Array.from( v );
		if ( Array.isArray( v ) ) return v.map( norm );
		if ( v && typeof v === 'object' ) return Object.fromEntries( Object.entries( v ).map( ( [ k, x ] ) => [ k, norm( x ) ] ) );
		return v;

	};

	const flat = ( v:unknown, out:unknown[] ) => {

		if ( Array.isArray( v ) ) { out.push( '[' ); for ( const x of v ) flat( x, out ); out.push( ']' ); } else if ( v && typeof v === 'object' ) { for ( const [ k, x ] of Object.entries( v ) ) { out.push( k ); flat( x, out ); } } else out.push( v );
		return out;

	};

	const A = flat( norm( a ), [] ), B = flat( norm( b ), [] );
	expect( A.length, label ).toBe( B.length );
	for ( let i = 0; i < A.length; i ++ ) if ( ! Object.is( A[ i ], B[ i ] ) ) expect( [ i, A[ i ] ], label ).toEqual( [ i, B[ i ] ] );

}

// ---------------------------------------------------------------------------- test world

const debrisSmooth = ( a:number, b:number, x:number ) => {

	const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );

};

/** Analytic test island: a bay beach sloping into the sea (+z), rocky coves to the west, a village up the slope. */
class DebrisTestTerrain implements placement.DebrisTerrain {

	size = 2048; res = 1024; texel = 2; origin = - 1024;
	heights:Float32Array; rock:Float32Array; sand:Uint8Array; path:Uint8Array;

	constructor() {

		const n = this.res * this.res;
		this.heights = new Float32Array( n ); this.rock = new Float32Array( n ); this.sand = new Uint8Array( n ); this.path = new Uint8Array( n );
		for ( let j = 0; j < this.res; j ++ ) for ( let i = 0; i < this.res; i ++ ) {

			const x = this.origin + ( i + 0.5 ) * this.texel, z = this.origin + ( j + 0.5 ) * this.texel, k = j * this.res + i;
			const h = this.heightAt( x, z );
			const rock = this.rockAt( x, z );
			this.heights[ k ] = h;
			this.rock[ k ] = rock;
			this.sand[ k ] = Math.round( 255 * ( 1 - rock ) * debrisSmooth( 9, 4, h ) );
			const pd = Math.abs( x - 20 - 0.08 * z ) - 0.8;
			this.path[ k ] = z < - 60 && z > - 140 ? Math.round( 255 * debrisSmooth( 2, 0, pd ) ) : 0;

		}

	}

	heightAt( x:number, z:number ) {

		return ( - z - 32 ) * 0.075 + 0.35 * Math.sin( x * 0.045 ) * Math.cos( z * 0.05 ) + 0.15 * Math.sin( x * 0.21 + z * 0.13 ) + ( x < - 120 ? ( - 120 - x ) * 0.01 : 0 );

	}

	rockAt( x:number, z:number ) {

		return Math.min( 1, Math.max( 0, ( - x - 85 ) / 30 + 0.25 * Math.sin( z * 0.3 ) ) );

	}

	pathDistance( x:number, z:number ) {

		let d = Infinity;
		for ( const p of PATHS ) d = Math.min( d, polylineDistance( p.pts, x, z )[ 0 ] - p.w / 2 );
		return Math.min( d, Math.abs( x - 20 - 0.08 * z ) );

	}

}

const debrisTerrain = new DebrisTestTerrain();
const debrisGround = ( x:number, z:number ) => debrisTerrain.heightAt( x, z );

const debrisVillage:placement.DebrisVillage = {
	buildings: [
		{ name: 'house1', x: 30, z: - 104, floorY: 6.2 }, { name: 'shed1', x: 62, z: - 112, floorY: 6.5 }, { name: 'house2', x: 8, z: - 120, floorY: 7.4 },
		{ name: 'house3', x: 52, z: - 94, floorY: 5.3 }, { name: 'hut1', x: - 12, z: - 70, stilts: true, floorY: 4 }, { name: 'hut2', x: 80, z: - 72, stilts: true, floorY: 4.2 },
	],
	path: { samples: [ - 20, 0, 20, 40, 60, 80 ].map( ( x ) => ( { p: { x, z: - 86 - x * 0.02 } } ) ), width: 1.8 },
	sidePaths: [ null, { samples: [ 0, 1, 2, 3 ].map( ( k ) => ( { p: { x: 40 + k * 3, z: - 100 - k * 6 } } ) ) } ],
	getFootprints: () => [ { kind: 'prop', x: 70, z: - 64, r: 3 }, { kind: 'house', x: 30, z: - 104, r: 4 } ],
};

const debrisBoxes:placement.DebrisColliderBox[] = [
	{ tag: 'house', center: { x: 30, z: - 104 }, half: { x: 3, z: 2.4 }, rotY: 0.2 },
	{ tag: 'shed', center: { x: 62, z: - 112 }, half: { x: 1.5, z: 1.2 }, rotY: - 0.4 },
	{ tag: 'house', center: { x: 8, z: - 120 }, half: { x: 2.8, z: 2.2 }, rotY: 1.1 },
	{ tag: 'house', center: { x: 52.2, z: - 94 }, half: { x: 2.5, z: 2 }, rotY: - 0.1 },
	{ tag: 'house', center: { x: - 12, z: - 70 }, half: { x: 2, z: 2 }, rotY: 0.5 },
	{ tag: 'house', center: { x: 80, z: - 72 }, half: { x: 2.2, z: 1.8 }, rotY: - 0.3 },
	{ tag: 'stairs', center: { x: 30.6, z: - 101 }, half: { x: 0.6, z: 0.5 }, rotY: 0.2 },
	{ tag: 'stoop', center: { x: 52, z: - 91.6 }, half: { x: 0.7, z: 0.4 }, rotY: - 0.1 },
	{ tag: 'porch', center: { x: 8, z: - 117 }, half: { x: 1.5, z: 0.8 }, rotY: 1.1 },
	{ tag: 'boardwalk', center: { x: 20, z: - 80 }, half: { x: 6, z: 0.9 }, rotY: 0 },
	{ tag: 'pierDeck', center: { x: 55, z: - 50 }, half: { x: 1.3, z: 10 }, rotY: 0 },
	{ tag: 'deck', center: { x: 0, z: - 110 }, half: { x: 2, z: 2 }, rotY: 0.3, walkable: true },
];

class DebrisColliderLog implements placement.DebrisColliders {

	boxes = debrisBoxes;
	cylinders = [ { x: - 11, z: - 69, radius: 0.12, tag: 'pile' }, { x: - 13, z: - 71, radius: 0.12, tag: 'pile' }, { x: 45, z: - 70, radius: 0.4, tag: 'post' } ];
	log:unknown[] = [];
	addBox( c:THREE.Vector3, h:THREE.Vector3, yaw:number, opts:{ tag:string } ) { this.log.push( [ 'box', c.x, c.y, c.z, h.x, h.y, h.z, yaw, opts.tag ] ); }
	addCylinder( x:number, z:number, r:number, y0:number, y1:number, opts:{ tag:string } ) { this.log.push( [ 'cyl', x, z, r, y0, y1, opts.tag ] ); }

}

const debrisRec = ( n:number, seed:number, fn:( r:() => number ) => placement.DebrisPlantRecord ) => {

	const r = debrisMulberry( seed );
	return Array.from( { length: n }, () => fn( r ) );

};

const debrisVegetation:placement.DebrisVegetation = { records: {
	palms: [
		...debrisRec( 70, 11, ( r ) => ( { x: - 150 + r() * 300, z: - 50 - r() * 40, s: 0.8 + r() * 0.5 } ) ),
		...debrisRec( 25, 12, ( r ) => ( { x: r() * 100 - 20, z: - 95 - r() * 50 } ) ),
		...debrisRec( 10, 13, ( r ) => ( { x: 300 + r() * 50, z: - 70 } ) ),
	],
	trees: debrisRec( 20, 14, ( r ) => ( { x: r() * 120 - 40, z: - 120 - r() * 40, s: 1.2 } ) ),
	bananas: debrisRec( 8, 15, ( r ) => ( { x: r() * 60, z: - 110 - r() * 20 } ) ),
} };

const debrisRocks:placement.DebrisRocks = { instances: debrisRec( 30, 16, ( r ) => ( { x: - 200 + r() * 120, z: - 30 - r() * 40 } ) ).map( ( p, i ) => ( { x: p.x, z: p.z, y: debrisGround( p.x, p.z ) + 0.3, size: 0.4 + ( i % 5 ) * 0.4 } ) ) };

// ---------------------------------------------------------------------------- tests

const DEBRIS_SEEDS = [ 1, 77, 4242 ];

/** Runs one emitter on the port and the original with fresh builders and the same rand seed. */
function debrisBoth( seed:number, label:string, run:( S:typeof shapes, B:geo.Builder, rand:() => number ) => unknown ) {

	const Bp = new geo.Builder(), Bo = new ( debrisG.Builder as typeof geo.Builder )();
	const rp = debrisMulberry( seed ), ro = debrisOrigMulberry( seed );
	const a = run( shapes, Bp, rp ), b = run( debrisOS, Bo, ro );
	debrisSameBuilder( Bp, Bo, label );
	debrisSameValue( a, b, label + ' result' );
	expect( rp(), label + ' rand state' ).toBe( ro() );
	return { port: Bp, orig: Bo, result: a };

}

describe( 'tidewater debris shapes (DebrisShapes.js)', () => {

	it( 'keeps the constants, hashes and the value noise', () => {

		expect( shapes.KIND ).toEqual( debrisOS.KIND );
		expect( shapes.nat( 0.3, 4, 0.7, 0.2 ) ).toEqual( debrisOS.nat( 0.3, 4, 0.7, 0.2 ) );
		expect( shapes.nat( 0.3, 4 ) ).toEqual( debrisOS.nat( 0.3, 4 ) );
		expect( [ SCAN_ASSETS, SCAN, SCAN_SIZE ] ).toEqual( [ debrisScan.SCAN_ASSETS, debrisScan.SCAN, debrisScan.SCAN_SIZE ] );
		const a:number[] = [], b:number[] = [];
		for ( let k = 0; k < 400; k ++ ) {

			const x = k * 0.731 - 90, y = Math.sin( k ) * 40, z = k * - 0.377;
			a.push( shapes.hash1( x ), shapes.vnoise3( x, y, z ), shapes.vnoise3( x * 0.1, y, z, k % 13 ) );
			b.push( debrisOS.hash1( x ), debrisOS.vnoise3( x, y, z ), debrisOS.vnoise3( x * 0.1, y, z, k % 13 ) );

		}

		expect( debrisDiff( a, b ) ).toBe( - 1 );

	} );

	it( 'matches gridMesh, mergeParts and taperTube on fixed inputs', () => {

		const grid = ( rows:number, cols:number, f:( j:number, i:number ) => number[] ) => Array.from( { length: rows }, ( _, j ) => Array.from( { length: cols }, ( __, i ) => f( j, i ) ) );
		const tubeP = grid( 5, 7, ( j, i ) => [ Math.cos( i / 7 * 6.283 ) * ( 0.3 + j * 0.05 ), j * 0.4, Math.sin( i / 7 * 6.283 ) * 0.3 ] );
		const sheet = grid( 4, 3, ( j, i ) => [ i * 0.2 + j * 0.01, Math.sin( i + j ) * 0.05, j * 0.3 ] );
		const inv = grid( 3, 6, ( j, i ) => [ - Math.cos( i ) * 0.2, j * 0.1, Math.sin( i ) * 0.2 ] );
		for ( const [ label, run ] of [
			[ 'tube', ( S:typeof shapes ) => S.gridMesh( tubeP, true, ( i, j ) => [ i * 0.1, j * 0.2 ] ) ],
			[ 'sheet', ( S:typeof shapes ) => S.gridMesh( sheet, false, ( i, j ) => [ i, j ] ) ],
			[ 'ref', ( S:typeof shapes ) => S.gridMesh( inv, true, ( i, j ) => [ i, j ], ( j, i, q ) => [ - q[ 0 ]!, 0, - q[ 2 ]! ] ) ],
			[ 'merge', ( S:typeof shapes ) => S.mergeParts( [ S.gridMesh( sheet, false, ( i, j ) => [ i, j ] ), S.gridMesh( tubeP, true, ( i, j ) => [ j, i ] ), S.stonePart( 3, 0, 0 ) ] ) ],
		] as const ) debrisSamePart( run( shapes ), run( debrisOS ), label );

		const pts = [ [ 0, 0, 0 ], [ 0.4, 0.1, 0.05 ], [ 0.9, 0.12, - 0.1 ], [ 1.3, 0.4, 0 ], [ 1.31, 0.9, 0.02 ] ];
		const vert = [ [ 0, 0, 0 ], [ 0, 1, 0 ], [ 0.01, 2, 0 ] ];
		for ( const [ label, run ] of [
			[ 'plain', ( S:typeof shapes ) => S.taperTube( pts, [ 0.1, 0.09, 0.08, 0.06, 0.03 ] ) ],
			[ 'rFn', ( S:typeof shapes ) => S.taperTube( pts, [ 0.2, 0.18, 0.15, 0.1, 0.05 ], 9, ( k, a ) => 1 + 0.1 * Math.sin( a * 3 + k ), 1.7 ) ],
			[ 'vertical', ( S:typeof shapes ) => S.taperTube( vert, [ 0.05, 0.04, 0.02 ], 4 ) ],
		] as const ) {

			const a = run( shapes ), b = run( debrisOS );
			debrisSamePart( a.part, b.part, label );
			debrisSameValue( [ a.rings, a.T, a.len ], [ b.rings, b.T, b.len ], label );

		}

	} );

	it( 'matches stonePart for every variant, detail and angularity', () => {

		for ( let v = 0; v < 12; v ++ ) for ( const detail of [ 0, 1, 2 ] ) for ( const ang of [ 0, 0.4, 0.6, 0.123, 0.4999 ] ) {

			debrisSamePart( shapes.stonePart( v, detail, ang ), debrisOS.stonePart( v, detail, ang ), `stone ${ v } ${ detail } ${ ang }` );

		}

		expect( shapes.stonePart( 2, 2, 0 ).vertexCount ).toBe( 162 );
		expect( shapes.stonePart( 2, 2, 0 ).idx.length / 3 ).toBe( 320 );

	} );

	it.each( DEBRIS_SEEDS )( 'matches every emitter bit for bit (seed %i)', ( seed ) => {

		const g = debrisGround;
		const at = [ [ 12.3, - 48.7 ], [ - 61.2, - 40.1 ], [ 88.8, - 55.5 ] ] as const;
		for ( const [ x, z ] of at ) {

			const tag = `${ seed } @${ x }`;
			debrisBoth( seed, 'minGround ' + tag, ( S ) => [ S.minGround( g, x, z, 0.7 ), S.minGround( g, x, z, 0.05 ) ] );
			debrisBoth( seed, 'stone ' + tag, ( S, B, r ) => [
				S.stone( B, g, x, z, 0.12, 0.08, 0.1, r ),
				S.stone( B, g, x + 1, z, 0.3, 0.2, 0.25, r, { palette: 0.4, sink: 0.3, tilt: 0.5, angular: r() * 0.5, detail: 0 } ),
				S.stone( B, g, x, z + 1, 0.1, 0.07, 0.1, r, { y: 3.3, angular: 0.6, tint: [ 1.08, 1.06, 1.02 ] } ),
			] );
			debrisBoth( seed, 'driftLog ' + tag, ( S, B, r ) => [
				S.driftLog( B, g, x, z, 0.7, r ), S.driftLog( B, g, x + 3, z, - 1.2, r, { len: 5.5, r0: 0.3, roots: true, stubs: 3 } ),
				S.driftLog( B, g, x, z + 3, 2.1, r, { len: 1.2, r0: 0.06, r1: 0.05, sink: 0.1, bend: 0.2, bark: 0.8, stubs: 0 } ),
			] );
			debrisBoth( seed, 'branch ' + tag, ( S, B, r ) => [ S.branch( B, g, x, z, 1.1, 1.4, 0.04, r ), S.branch( B, g, x, z, - 0.3, 0.5, 0.012, r, { tone: [ 0.16, 0.14, 0.13 ], twigs: 2 } ) ] );
			debrisBoth( seed, 'plank ' + tag, ( S, B, r ) => [ S.plank( B, g, x, z, 0.4, 1.3, 0.15, 0.025, r ), S.plank( B, g, x, z, 2.4, 0.8, 0.2, 0.03, r, { paint: 0.3, tint: [ 0.5, 0.7, 0.6 ], lift: 0.1, sink: 0 } ) ] );
			debrisBoth( seed, 'coconut ' + tag, ( S, B, r ) => { for ( let k = 0; k < 8; k ++ ) S.coconut( B, g, x + k * 0.3, z, r, k % 2 ? { age: 0.2 } : { scale: 1.2 } ); } );
			debrisBoth( seed, 'husk ' + tag, ( S, B, r ) => { for ( let k = 0; k < 8; k ++ ) S.husk( B, g, x + k * 0.3, z, r ); } );
			debrisBoth( seed, 'weedMat ' + tag, ( S, B, r ) => {

				S.weedMat( B, g, x, z, 0.25, 0.03, r );
				S.weedMat( B, g, x + 1, z, 0.5, 0.05, r, { dry: 0.8, aspect: 1.6, rot: 0.4, strands: 3 } );
				S.weedMat( B, g, x, z + 1, 0.15, 0.02, r, { fringe: false, tint: [ 0.9, 1, 0.9 ] } );

			} );
			debrisBoth( seed, 'seagrass ' + tag, ( S, B, r ) => { S.seagrassWrack( B, g, x, z, 0.2, r ); S.seagrassWrack( B, g, x, z, 0.3, r, { dir: 1, count: 5, lift: 0.02, minLen: 0.2, dry: 0.1 } ); } );
			debrisBoth( seed, 'frond ' + tag, ( S, B, r ) => { S.frond( B, g, x, z, 0.8, 3.2, r ); S.frond( B, g, x, z, - 2, 2.4, r, { dry: 0.9, arch: 0.5, leaflets: 6, broken: 0.6 } ); } );
			debrisBoth( seed, 'shell ' + tag, ( S, B, r ) => { for ( let k = 0; k < 6; k ++ ) S.shell( B, g, x + k * 0.2, z, 0.05 + k * 0.01, r ); S.shell( B, g, x, z, 0.1, r, { type: 1 } ); S.shell( B, g, x, z, 0.08, r, { type: 0 } ); } );
			debrisBoth( seed, 'coral ' + tag, ( S, B, r ) => { for ( let k = 0; k < 6; k ++ ) S.coralPiece( B, g, x + k * 0.2, z, 0.12, r ); S.coralPiece( B, g, x, z, 0.2, r, { head: true, bleach: 0.5 } ); } );
			debrisBoth( seed, 'tyre ' + tag, ( S, B, r ) => [ S.tyre( B, g, x, z, r ), S.tyre( B, g, x, z, r, { y: 2, sink: 0, lean: 0.4, ry: 1, R: 0.3, r: 0.1 } ) ] );
			debrisBoth( seed, 'litter ' + tag, ( S, B, r ) => { for ( let k = 0; k < 5; k ++ ) { S.bottle( B, g, x + k, z, r ); S.flipFlop( B, g, x, z + k, r ); } } );
			debrisBoth( seed, 'rope ' + tag, ( S, B, r ) => { S.ropeScrap( B, g, x, z, r ); S.ropeScrap( B, g, x, z, r, { tangle: true } ); S.ropeScrap( B, g, x, z, r, { len: 2, r: 0.01, tint: [ 1, 0, 0 ] } ); } );
			debrisBoth( seed, 'net ' + tag, ( S, B, r ) => { for ( let k = 0; k < 4; k ++ ) S.netScrap( B, g, x + k, z, r ); S.netScrap( B, g, x, z, r, { w: 1, d: 0.6, tint: [ 0.2, 0.3, 0.4 ] } ); } );
			debrisBoth( seed, 'float ' + tag, ( S, B, r ) => { for ( let k = 0; k < 8; k ++ ) S.floatBuoy( B, g, x + k * 0.3, z, r ); for ( const kind of [ 0, 1, 2 ] ) S.floatBuoy( B, g, x, z, r, { kind } ); } );
			debrisBoth( seed, 'wheelbarrow ' + tag, ( S, B, r ) => { S.wheelbarrow( B, g, x, z, 0.5, r ); S.wheelbarrow( B, g, x, z, - 1, r, { tint: [ 0.3, 0.3, 0.3 ] } ); } );
			debrisBoth( seed, 'plankPile ' + tag, ( S, B, r ) => [ S.plankPile( B, g, x, z, 0.3, r ), S.plankPile( B, g, x, z, 1.3, r, { n: 3, len: 2 } ) ] );

		}

	} );

} );

/** Runs the whole placer on the port and the original with the same injected world. */
function debrisRunPlacer( seed:number ) {

	const make = ( side:'port' | 'orig' ) => {

		const B = side === 'port' ? new geo.Builder() : new ( debrisG.Builder as typeof geo.Builder )();
		const inst = side === 'port' ? new props.InstancedProps( B ) : new ( debrisP.InstancedProps as typeof props.InstancedProps )( B );
		const colliders = new DebrisColliderLog();
		const Placer = side === 'port' ? placement.DebrisPlacer : debrisOP.DebrisPlacer;
		const placer = new Placer( { B, inst, terrain: debrisTerrain, village: debrisVillage, vegetation: debrisVegetation, rocks: debrisRocks, colliders, seed } ).run();
		return { B, inst, colliders, placer };

	};

	return { port: make( 'port' ), orig: make( 'orig' ) };

}

describe( 'tidewater debris placement (DebrisPlacement.js)', () => {

	it.each( [ 5150, 9 ] )( 'places the same debris, colliders, scans and pebble mask (seed %i)', ( seed ) => {

		const { port, orig } = debrisRunPlacer( seed );
		const a = port.placer, b = orig.placer;
		debrisSameBuilder( port.B, orig.B, 'placer' );
		expect( port.inst.counts ).toEqual( orig.inst.counts );
		debrisSameValue( port.colliders.log, orig.colliders.log, 'colliders' );
		expect( a.counts ).toEqual( b.counts );
		debrisSameValue( a.log, b.log, 'log' );
		debrisSameValue( a.scanned, b.scanned, 'scanned' );
		debrisSameValue( a.rockSpots, b.rockSpots, 'rockSpots' );
		debrisSameValue( [ a.houses, a.doorways, a.firePit ?? undefined, a.wrackPoints, a.newColliders, a.obs.count ], [ b.houses, b.doorways, b.firePit, b.wrackPoints, b.newColliders, b.obs.count ], 'state' );
		expect( Object.keys( a.timings ) ).toEqual( Object.keys( b.timings ) );
		expect( [ a.mask!.res, a.mask!.texel ] ).toEqual( [ b.mask!.res, b.mask!.texel ] );
		expect( Buffer.from( a.mask!.data.buffer ).equals( Buffer.from( b.mask!.data.buffer ) ) ).toBe( true );
		expect( port.B.triangles ).toBeGreaterThan( 50000 );

		// the test world exercises every part of the placer
		for ( const k of [ 'group:crates', 'hut:traps', 'skiff', 'wheelbarrow', 'logs:big', 'logs:mid', 'coconut', 'frond', 'wrack:twig', 'wrack:coral', 'wrack:shell', 'wrack:stone', 'coveStones' ] ) expect( a.counts[ k ], k ).toBeGreaterThan( 0 );
	}, 60000 );

	it( 'matches the branches the full run cannot reach (fire pit, weed mats, seagrass) and the queries', () => {

		const make = ( side:'port' | 'orig' ) => {

			const B = side === 'port' ? new geo.Builder() : new ( debrisG.Builder as typeof geo.Builder )();
			const inst = side === 'port' ? new props.InstancedProps( B ) : new ( debrisP.InstancedProps as typeof props.InstancedProps )( B );
			const colliders = new DebrisColliderLog();
			const Placer = side === 'port' ? placement.DebrisPlacer : debrisOP.DebrisPlacer;
			const placer = new Placer( { B, inst, terrain: debrisTerrain, village: debrisVillage, vegetation: debrisVegetation, rocks: debrisRocks, colliders, seed: 31 } );
			const q:number[] = [];
			for ( let k = 0; k < 50; k ++ ) {

				const x = - 150 + k * 6.1, z = - 30 - k * 1.7;
				q.push( placer.sand( x, z ), placer.rockM( x, z ), placer.pathM( x, z ), placer.slope( x, z ), ...placer.downhill( x, z ), placer.obs.dist( x, z ), placer._idx( x, z ) );

			}

			// Obstacles.dist() clamps at 2.5 m, so the source's clear( x, z, 2.6 ) for the fire pit never
			// passes: lift the clamp on both sides to exercise the fire pit branch
			const dist = placer.obs.dist.bind( placer.obs );
			placer.obs.dist = ( x, z, ignore ) => dist( x, z, ignore ) + 1;
			placer._boatsAndYards();
			placer.obs.dist = dist;
			for ( const [ k, type ] of [ 'weed', 'weedFresh', 'grass', 'weed', 'twig', 'plank', 'litter', 'rope', 'conch', 'scanBranch' ].entries() ) {

				const x = - 40 + k * 3.3, z = - 50 - k * 0.4;
				placer._wrackItem( type, x, z, debrisGround( x, z ), placer.rand );

			}

			return { B, colliders, placer, q };

		};

		const port = make( 'port' ), orig = make( 'orig' );
		expect( debrisDiff( port.q, orig.q ) ).toBe( - 1 );
		debrisSameBuilder( port.B, orig.B, 'branches' );
		debrisSameValue( port.colliders.log, orig.colliders.log, 'colliders' );
		expect( port.placer.counts ).toEqual( orig.placer.counts );
		debrisSameValue( [ port.placer.scanned, port.placer.firePit, port.placer.log ], [ orig.placer.scanned, orig.placer.firePit, orig.placer.log ], 'state' );
		expect( port.placer.counts.firePit ).toBe( 1 );
		expect( port.placer.counts[ 'wrack:weed' ] ).toBe( 2 );

	} );

} );

// ---------------------------------------------------------------------------- pebble field and the debris assembly

const pdGpu = { module: { name: 'terrainGPU' }, sunModulationModule: { name: 'sun' } };
const pdStandard = ( p:Mod ) => ( { params: p, dispose() {} } );
const PD_NM = load( 'world/debris/NatureMaterial.js', {
	ShaderModule: StubShaderModule, commonModule: RECORDING_ENGINE.commonModule, standard: pdStandard,
	lodFadeModule: RECORDING_ENGINE.lodFadeModule, srgb: TS.srgb, terrainShadingModule: RECORDING_ENGINE.terrainShadingModule,
}, [ 'stoneSurfaceModule', 'createNatureMaterial' ] );
const PD_PF = load( 'world/debris/PebbleField.js', {
	BufferGeometry: THREE.BufferGeometry, Float32BufferAttribute: THREE.Float32BufferAttribute, Uint16BufferAttribute: THREE.Uint16BufferAttribute,
	InstancedBufferAttribute: THREE.InstancedBufferAttribute, Mesh: THREE.Mesh, Frustum: THREE.Frustum, Matrix4: THREE.Matrix4, Box3: THREE.Box3,
	DynamicDrawUsage: THREE.DynamicDrawUsage, Texture: StubTexture, ShaderModule: StubShaderModule, commonModule: RECORDING_ENGINE.commonModule,
	standard: pdStandard, srgb: TS.srgb, terrainShadingModule: RECORDING_ENGINE.terrainShadingModule, stoneSurfaceModule: PD_NM.stoneSurfaceModule,
	stonePart: debrisOS.stonePart,
}, [ 'PebbleField', 'PCELL', 'R_FAR', 'blueNoise', 'chipPart', 'buildPatch', 'pebbleModule' ] );
const PD_SD = load( 'world/debris/ScannedDebris.js', {
	Vector3: THREE.Vector3, Quaternion: THREE.Quaternion, Euler: THREE.Euler, Matrix4: THREE.Matrix4, Frustum: THREE.Frustum, Sphere: THREE.Sphere,
	BufferGeometry: THREE.BufferGeometry, Float32BufferAttribute: THREE.Float32BufferAttribute, Uint16BufferAttribute: THREE.Uint16BufferAttribute,
	Uint32BufferAttribute: THREE.Uint32BufferAttribute, InstancedBufferAttribute: THREE.InstancedBufferAttribute, InstancedMesh: THREE.InstancedMesh,
	DynamicDrawUsage: THREE.DynamicDrawUsage, Texture: StubTexture, generateMipmaps: () => {}, commonModule: { name: 'common' }, lodFadeModule: { name: 'lodFade' },
	bandFade: LF.bandFade, standard: pdStandard, srgb: TS.srgb, parseGLB: GLB.parseGLB,
}, [ 'ScannedDebris' ], ( s ) => s.replace( '( import.meta.env && import.meta.env.BASE_URL )', 'undefined' ).replace( 'this.promise = this._load()', 'this.promise = Promise.resolve(); if ( false ) this._load()' ) );
const PD_D = load( 'world/Debris.js', {
	Group: THREE.Group, BufferGeometry: THREE.BufferGeometry, Mesh: THREE.Mesh, Builder: debrisG.Builder, Batch: debrisG.Batch, InstancedProps: debrisP.InstancedProps,
	LAYERS: { OPAQUE: 0, WATER: 1, TRANSPARENT: 2, REFLECT_ONLY: 3 }, DebrisPlacer: debrisOP.DebrisPlacer, createNatureMaterial: PD_NM.createNatureMaterial,
	PebbleField: PD_PF.PebbleField, KIND: ( debrisOS as unknown as Mod ).KIND, ScannedDebris: PD_SD.ScannedDebris,
}, [ 'Debris' ] );

function pdCamera( p:readonly number[], look:readonly number[] ) {

	const cam = new THREE.PerspectiveCamera( 60, 16 / 9, 0.1, 3000 );
	cam.position.set( p[ 0 ]!, p[ 1 ]!, p[ 2 ]! );
	cam.lookAt( look[ 0 ]!, look[ 1 ]!, look[ 2 ]! );
	cam.updateMatrixWorld();
	return cam;

}

const PD_CAMS:[ number[], number[] ][] = [ [ [ 10, 4, - 30 ], [ 10, 0, - 10 ] ], [ [ - 110, 3, - 20 ], [ - 100, 0, 0 ] ], [ [ 40, 1.7, - 60 ], [ 0, 0, - 60 ] ], [ [ 0, 300, 0 ], [ 0, 0, - 50 ] ] ];

describe( 'Tidewater shore: pebble field (PebbleField.js)', () => {

	it( 'matches the blue-noise slots, chips and the patch geometry', () => {

		for ( const seed of [ 1, 5 ] ) expect( blueNoise( math.mulberry32( seed ), 40, 4 ) ).toEqual( PD_PF.blueNoise( N.mulberry32( seed ), 40, 4 ) );
		for ( let v = 0; v < 7; v ++ ) expect( chipPart( v ) ).toEqual( PD_PF.chipPart( v ) );
		const a = buildPatch(), b = PD_PF.buildPatch();
		for ( const name of [ 'position', 'normal', 'aSlot' ] ) expect( f32bits( a.getAttribute( name ).array ), name ).toEqual( f32bits( b.getAttribute( name ).array ) );
		expect( Array.from( a.index!.array ) ).toEqual( Array.from( b.index.array ) );
		expect( a.index!.count / 3 ).toBe( b.index.count / 3 );
		expect( [ pebbles.PCELL, pebbles.R_FAR, pebbles.pebbleModule.code ] ).toEqual( [ PD_PF.PCELL, PD_PF.R_FAR, PD_PF.pebbleModule.code ] );

	} );

	it( 'marks the same cells and draws the same cells for fixed cameras', () => {

		const { port } = debrisRunPlacer( 5150 );
		const mask = port.placer.mask;
		const ours = new PebbleField( { terrain: debrisTerrain, gpu: pdGpu, mask } );
		const theirs = new PD_PF.PebbleField( { terrain: debrisTerrain, gpu: pdGpu, mask } );
		expect( ours.occupiedCells ).toBe( theirs.occupiedCells );
		expect( ours.occupiedCells ).toBeGreaterThan( 100 );
		expect( Buffer.from( ours.cellFlags ).equals( Buffer.from( theirs.cellFlags ) ) ).toBe( true );
		expect( f32bits( ours.cellMinY ) ).toEqual( f32bits( theirs.cellMinY ) );
		expect( f32bits( ours.cellMaxY ) ).toEqual( f32bits( theirs.cellMaxY ) );
		expect( ours.patchTris ).toBe( theirs.patchTris );
		const ta = { ...ours.maskTex.options, data: null }, tb = { ...( theirs.maskTex.o as Any ), data: null };
		expect( ta ).toEqual( tb );
		const pa = ours.materialSpec.params as Any, pb = theirs.material.params;
		const names = ( m:Any[] ) => m.map( ( x ) => x.name );
		expect( { ...pa, modules: names( pa.modules ), textures: null } ).toEqual( { ...pb, modules: names( pb.modules ), textures: null } );
		let drawn = 0;
		for ( const [ p, look ] of PD_CAMS ) {

			const cam = pdCamera( p, look );
			expect( ours.update( cam ) ).toBe( theirs.update( cam ) );
			expect( ours.update( cam ) ).toBe( false );
			expect( [ ours.count, ours.geometry.instanceCount, ours.triangles ] ).toEqual( [ theirs.count, theirs.geometry.instanceCount, theirs.triangles ] );
			expect( f32bits( ours.arr.slice( 0, ours.count * 4 ) ) ).toEqual( f32bits( theirs.arr.slice( 0, theirs.count * 4 ) ) );
			drawn += ours.count;

		}

		expect( drawn ).toBeGreaterThan( 10 );

	}, 60000 );

} );

describe( 'Tidewater shore: debris assembly (Debris.js)', () => {

	it( 'assembles the same shared buffers, draw ranges, shadow ranges and stats (2 seeds)', () => {

		for ( const seed of [ 5150, 9 ] ) {

			const village = ( mats:Mod ) => ( { ...debrisVillage, materials: mats, textures: { baked: 0, bake() { this.baked ++; } } } );
			const mats = { wood: new THREE.MeshStandardMaterial(), hard: new THREE.MeshStandardMaterial(), fabric: new THREE.MeshStandardMaterial() };
			const scene = () => ( { add() {}, remove() {} } );
			const opts = { terrain: { data: debrisTerrain, gpu: pdGpu }, vegetation: debrisVegetation, rocks: debrisRocks, seed };
			const ours = new Debris( { ...opts, scene: scene(), village: village( mats ) as Any, colliders: new DebrisColliderLog() } );
			const theirs = new PD_D.Debris( { ...opts, scene: scene(), village: village( mats ), colliders: new DebrisColliderLog() } );
			expect( ours.meshes.map( ( m ) => [ m.name, m.castShadow, m.layers.mask, m.geometry.drawRange.start, m.geometry.drawRange.count ] ) )
				.toEqual( theirs.meshes.map( ( m:Any ) => [ m.name, m.castShadow, m.layers.mask, m.geometry.drawRange.start, m.geometry.drawRange.count ] ) );
			ours.meshes.forEach( ( m, k ) => {

				if ( m === ours.pebbles.mesh ) return;
				const g = m.geometry, h = theirs.meshes[ k ].geometry;
				expect( Object.keys( g.attributes ) ).toEqual( Object.keys( h.attributes ) );
				for ( const name of Object.keys( g.attributes ) ) expect( f32bits( g.getAttribute( name ).array ), `${ m.name } ${ name }` ).toEqual( f32bits( h.getAttribute( name ).array ) );
				expect( Array.from( g.index!.array ) ).toEqual( Array.from( h.index.array ) );
				expect( g.boundingSphere ).toEqual( h.boundingSphere );

			} );
			expect( [ ours.natureCasterTris, ours.shadowTriangles ] ).toEqual( [ theirs.natureCasterTris, theirs.shadowTriangles ] );
			// the wood mesh widens its draw range in the shadow passes only
			const wood = ours.meshes.find( ( m ) => m.name === 'debris_wood' )!, twood = theirs.meshes.find( ( m:Any ) => m.name === 'debris_wood' );
			for ( const shadowCam of [ true, false ] ) {

				const cam = Object.assign( new THREE.PerspectiveCamera(), { isShadowCamera: shadowCam } );
				( wood.onBeforeRender as Any )( null, null, cam );
				twood.onBeforeRender( null, null, cam );
				expect( [ wood.geometry.drawRange.start, wood.geometry.drawRange.count ] ).toEqual( [ twood.geometry.drawRange.start, twood.geometry.drawRange.count ] );

			}

			const na = ours.materials!.nature.params as Any, nb = theirs.materials.nature.params;
			expect( na.surface ).toBe( nb.surface );
			for ( const [ p, look ] of PD_CAMS ) {

				const cam = pdCamera( p, look );
				ours.update( cam ); theirs.update( cam );
				const sa = { ...ours.stats(), timings: null }, sb = { ...theirs.stats(), timings: null };
				expect( sa ).toEqual( sb );

			}


		}

	}, 120000 );

} );

// Executes the ORIGINAL pinned Tidewater reef sources (read only: Reef.js, reef/ReefBatch.js, reef/ReefMaterials.js,
// reef/ReefGeometry.js, reef/ReefNoise.js, util/Noise.js, WorldLayout.js, materials/LODFade.js) against the
// installed three.js with recording stand-ins for the engine GPU classes, and compares the port bit-exact.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the original modules are untyped JS
type ReefPortAny = any;
type ReefPortMod = Record<string, ReefPortAny>;
const reefPortRoot = new URL('../../../../tooling/other-programs/tidewater/src/', import.meta.url);
const reefPortRead = (path: string) => readFileSync(new URL(path, reefPortRoot), 'utf8');
const reefPortDeps = (src: string) => [
  ...[...src.matchAll(/^import\s*\{([^}]*)\}\s*from/gm)].flatMap(m => m[1]!.split(',').map(s => s.trim()).filter(Boolean)),
  ...[...src.matchAll(/^import\s*\*\s*as\s+(\w+)\s+from/gm)].map(m => m[1]!),
];
function reefPortLoad(path: string, pool: ReefPortMod, names?: string[]): ReefPortMod {
  const src = reefPortRead(path);
  const deps = reefPortDeps(src);
  for (const d of deps) if (!(d in pool)) throw new Error(`${path}: no ${d}`);
  const exported = names ?? [...src.matchAll(/^export\s+(?:function|const|class)\s+(\w+)/gm)].map(m => m[1]!);
  const body = src.replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/^export /gm, '');
  return new Function(...deps, `${body}\n;return {${exported.join(',')}};`)(...deps.map(d => pool[d])) as ReefPortMod;
}

// recording stand-ins for the source's engine classes (same records as the port's defaults)
class ReefPortStorage {
  label: string; count: number; type: string; usage: string[] | undefined; writes = 0; last: number[] | null = null; destroyed = false;
  constructor(o: ReefPortAny) { this.label = o.label; this.count = o.count; this.type = o.type; this.usage = o.usage; }
  write(d: ArrayLike<number>) { this.writes++; this.last = Array.from(d); }
  destroy() { this.destroyed = true; }
}
class ReefPortShaderModule {
  name: string; deps: unknown[]; bindings: Record<string, unknown>; code: string;
  constructor(o: ReefPortAny) { this.name = o.name; this.deps = o.deps ?? []; this.bindings = o.bindings ?? {}; this.code = o.code; }
}
class ReefPortUniformBlock {
  structName: string; fields: Record<string, { value: unknown }> = {};
  constructor(structName: string, fields: Record<string, unknown[]>) {
    this.structName = structName;
    for (const k in fields) this.fields[k] = { value: fields[k]!.length > 1 ? fields[k]![1] : null };
  }
}
class ReefPortMaterial { options: ReefPortAny; disposed = 0; constructor(o: ReefPortAny) { this.options = o; } dispose() { this.disposed++; } }
class ReefPortTexture { options: ReefPortAny; destroyed = 0; constructor(o: ReefPortAny) { this.options = o; } destroy() { this.destroyed++; } }
class ReefPortFish {
  opts: ReefPortAny; mesh = { visible: true }; batch = { visibleInstances: 0 }; fishCount = 0; updates = 0;
  constructor(o: ReefPortAny) { this.opts = o; }
  update() { this.updates++; } cull() {} dispose() {} setWhale() {}
}

const reefPortPool: ReefPortMod = { THREE, ...THREE, StorageBuffer: ReefPortStorage, ShaderModule: ReefPortShaderModule,
  UniformBlock: ReefPortUniformBlock, Material: ReefPortMaterial, Texture: ReefPortTexture, FishSchools: ReefPortFish,
  commonModule: { name: 'common' } };
Object.assign(reefPortPool, reefPortLoad('util/Noise.js', reefPortPool));
Object.assign(reefPortPool, reefPortLoad('world/WorldLayout.js', reefPortPool));
Object.assign(reefPortPool, reefPortLoad('materials/LODFade.js', reefPortPool));
Object.assign(reefPortPool, reefPortLoad('world/reef/ReefNoise.js', reefPortPool));
reefPortPool.Geo = reefPortLoad('world/reef/ReefGeometry.js', reefPortPool);
Object.assign(reefPortPool, reefPortLoad('world/reef/ReefBatch.js', reefPortPool));
const reefPortMat = reefPortLoad('world/reef/ReefMaterials.js', reefPortPool);
Object.assign(reefPortPool, reefPortMat);
const reefPortSrc = reefPortLoad('world/Reef.js', reefPortPool);

// ---- comparison helpers
const reefPortBits32 = (a: ArrayLike<number>) => new Uint32Array(Float32Array.from(a).buffer);
const reefPortBits64 = (a: ArrayLike<number>) => new Uint32Array(Float64Array.from(a).buffer);
function reefPortSameBits(actual: Uint32Array, expected: Uint32Array, label: string) {
  expect(actual.length, `${label} length`).toBe(expected.length);
  let first = -1;
  for (let i = 0; i < expected.length; i++) if (actual[i] !== expected[i]) { first = i; break; }
  expect(first, `${label}: first mismatch`).toBe(-1);
}
const reefPortSame32 = (a: ArrayLike<number>, b: ArrayLike<number>, label: string) => reefPortSameBits(reefPortBits32(a), reefPortBits32(b), label);
const reefPortSame64 = (a: ArrayLike<number>, b: ArrayLike<number>, label: string) => reefPortSameBits(reefPortBits64(a), reefPortBits64(b), label);
function reefPortSameGeometry(a: THREE.BufferGeometry, b: THREE.BufferGeometry, label: string) {
  expect(Object.keys(a.attributes), label).toEqual(Object.keys(b.attributes));
  for (const k of Object.keys(b.attributes)) {
    const x = a.getAttribute(k), y = b.getAttribute(k);
    expect([x.itemSize, x.count, x.array.constructor.name], `${label} ${k}`).toEqual([y.itemSize, y.count, y.array.constructor.name]);
    reefPortSame32(x.array, y.array, `${label} ${k}`);
  }
  expect(a.index!.array.constructor.name, label).toBe(b.index!.array.constructor.name);
  expect(Array.from(a.index!.array), `${label} index`).toEqual(Array.from(b.index!.array));
}
const reefPortStorageRecord = (s: ReefPortAny) => ({ label: s.label, count: s.count, type: s.type, usage: s.usage, writes: s.writes, last: s.last });
function reefPortSameStorage(a: ReefPortAny, b: ReefPortAny, label: string) {
  const x = reefPortStorageRecord(a), y = reefPortStorageRecord(b);
  expect({ ...x, last: null }, label).toEqual({ ...y, last: null });
  if (y.last) reefPortSame64(x.last!, y.last, `${label} data`);
  else expect(x.last, label).toBe(null);
}

// ---- ReefBatch on small hand-made kinds
function reefPortKinds(seed: number): ReefKind[] {
  const geos = [new THREE.BoxGeometry(1, 2, 1, 2, 1, 1), new THREE.SphereGeometry(0.5, 6, 4), new THREE.ConeGeometry(0.4, 1, 5), new THREE.BoxGeometry(1, 1, 1)];
  geos.forEach((g, i) => {
    if (i === 3) return;
    const n = g.attributes.position!.count, d = new Float32Array(n * 4);
    for (let k = 0; k < d.length; k++) d[k] = Math.sin(k * 1.37 + seed + i);
    g.setAttribute('aData', new THREE.BufferAttribute(d, 4));
  });
  return geos.map((geometry, i) => ({ geometry, type: 't' + i, lod: i, shadow: i === 1 || i === 3, shadowOnly: i === 3 }));
}
function reefPortDriveBatch(b: ReefPortAny, frame: number) {
  b.begin();
  for (let i = 0; i < 37 + frame * 5; i++) {
    const kind = (i * 7 + frame) % 4;
    b.add(kind, (i * 13 + frame) % 50);
    if (b.fadeList && i % 3 === 0) b.addFade((kind + 1) % 4, i * 977 + frame, (i % 11) / 7 - 0.3, i % 2 === 0);
  }
  b.commit();
}
function reefPortSameBatchFrame(a: ReefPortAny, b: ReefPortAny, label: string) {
  expect([a.visibleInstances, a.visibleTriangles, a.shadowTriangles, a.fadeInstances], label)
    .toEqual([b.visibleInstances, b.visibleTriangles, b.shadowTriangles, b.fadeInstances]);
  expect(Array.from(a.list.subarray(0, a.visibleInstances)), `${label} list`).toEqual(Array.from(b.list.subarray(0, b.visibleInstances)));
  expect(Array.from(a.baseArray), `${label} base`).toEqual(Array.from(b.baseArray));
  expect(Array.from(a.commands), `${label} commands`).toEqual(Array.from(b.commands));
  expect([a.mainOffsets, a.shadowOffsets], `${label} offsets`).toEqual([b.mainOffsets, b.shadowOffsets]);
  expect(a.geometry.indirect.offsets, `${label} indirect`).toEqual(b.geometry.indirect.offsets);
  for (const k of ['listBuffer', 'baseBuffer', 'indirectBuffer', 'instanceBuffer']) reefPortSameStorage(a[k], b[k], `${label} ${k}`);
  if (b.fadeList) {
    expect(Array.from(a.fadeList.subarray(0, a.fadeInstances)), `${label} fadeList`).toEqual(Array.from(b.fadeList.subarray(0, b.fadeInstances)));
    expect(Array.from(a.fadeBaseArray), `${label} fadeBase`).toEqual(Array.from(b.fadeBaseArray));
    expect(Array.from(a.fadeCommands), `${label} fadeCommands`).toEqual(Array.from(b.fadeCommands));
    expect(a.fadeOffsets, `${label} fadeOffsets`).toEqual(b.fadeOffsets);
    expect(a.fadeGeometry.indirect.offsets, `${label} fade indirect`).toEqual(b.fadeGeometry.indirect.offsets);
    expect(a.fadeMesh?.visible, label).toBe(b.fadeMesh?.visible);
    for (const k of ['fadeListBuffer', 'fadeBaseBuffer', 'fadeIndirectBuffer']) reefPortSameStorage(a[k], b[k], `${label} ${k}`);
  }
}

describe('Tidewater reef batch port (ReefBatch.js)', () => {
  it('derives the same WGSL prefixes', () => {
    const src = reefPortLoad('world/reef/ReefBatch.js', reefPortPool, ['prefixOf']);
    for (const name of ['Reef.hard', 'Reef.soft', 'Fish', 'my-batch_name.x2', 'a.B.c']) expect(prefixOf(name)).toBe(src.prefixOf(name));
  });

  for (const fade of [false, true]) {
    it(`merges kinds, packs instances and writes the draw commands (fade ${fade})`, () => {
      const kindsA = reefPortKinds(3), kindsB = reefPortKinds(3);
      const ours: ReefPortAny = new ReefBatch('Reef.hard', kindsA, { maxInstances: 60, fade });
      const theirs: ReefPortAny = new reefPortPool.ReefBatch('Reef.hard', kindsB, { maxInstances: 60, fade });
      reefPortSameGeometry(ours.geometry, theirs.geometry, 'merged');
      expect([ours.prefix, ours.vertexCount, ours.maxInstances, ours.dynamic]).toEqual([theirs.prefix, theirs.vertexCount, theirs.maxInstances, theirs.dynamic]);
      for (const k of ['firstIndex', 'indexCount', 'baseVertex']) expect(Array.from(ours[k]), k).toEqual(Array.from(theirs[k]));
      expect(kindsA.map(k => [k.triangles, k.vertices])).toEqual(kindsB.map(k => [k.triangles, k.vertices]));
      expect([ours.module.name, ours.module.code, Object.keys(ours.module.bindings)])
        .toEqual([theirs.module.name, theirs.module.code, Object.keys(theirs.module.bindings)]);
      for (const [k, v] of Object.entries(theirs.module.bindings as Record<string, ReefPortAny>)) {
        expect([ours.module.bindings[k].access, ours.module.bindings[k].storage.label]).toEqual([v.access, v.storage.label]);
      }
      expect([ours.recordIndex(), ours.record('idx'), ours.fadeEntry()]).toEqual([theirs.recordIndex(), theirs.record('idx'), theirs.fadeEntry()]);
      ours.createMesh({ m: 1 }, { castShadow: true }); theirs.createMesh({ m: 1 }, { castShadow: true });
      if (fade) { ours.createFadeMesh({ m: 2 }); theirs.createFadeMesh({ m: 2 }); }
      for (let i = 0; i < ours.data.length; i++) ours.data[i] = theirs.data[i] = Math.cos(i * 0.71) * 40;
      ours.dataAttr.needsUpdate = true; theirs.dataAttr.needsUpdate = true;
      expect(ours.instanceBuffer).toBeInstanceOf(RecordingStorageBuffer);
      for (let frame = 0; frame < 4; frame++) {
        reefPortDriveBatch(ours, frame); reefPortDriveBatch(theirs, frame);
        reefPortSameBatchFrame(ours, theirs, `frame ${frame}`);
      }
      // shadow cameras draw the shadow offsets
      const ortho = new THREE.OrthographicCamera();
      ours.mesh.onBeforeRender(null, null, ortho); theirs.mesh.onBeforeRender(null, null, ortho);
      expect(ours.geometry.indirect.offsets).toEqual(theirs.geometry.indirect.offsets);
      expect(ours.geometry.indirect.offsets).toBe(ours.shadowOffsets);
      ours.dispose(); theirs.dispose();
      expect(ours.listBuffer.destroyed).toBe(theirs.listBuffer.destroyed);
    });
  }
});

// ---- materials
describe('Tidewater reef materials port (ReefMaterials.js)', () => {
  it('keeps the constants and CPU helpers', () => {
    expect(reefMat.SURFACE).toEqual(reefPortMat.SURFACE);
    expect(reefMat.VARYINGS).toEqual(reefPortMat.VARYINGS);
    expect(reefMat.V).toEqual(reefPortMat.V);
    expect(reefMat.aData).toBe(reefPortMat.aData);
    expect(reefMat.reefColors()).toEqual(reefPortMat.reefColors());
    expect([reefMat.rotateQ('q', 'v'), reefMat.bumpNormal('h')]).toEqual([reefPortMat.rotateQ('q', 'v'), reefPortMat.bumpNormal('h')]);
    for (const hex of [0, 0xffffff, 0x5e5234, 0xa89e88, 0x8c7a68, 0x010203, 0x0a0b0c, 0xc8a02c]) {
      expect(reefMat.srgb(hex)).toBe(reefPortMat.srgb(hex));
      const c = new THREE.Color(hex).offsetHSL(0.013, -0.04, 0.03);
      expect(reefMat.packColor(c)).toBe(reefPortMat.packColor(c));
    }
    expect(reefMat.reefCommonModule.code).toBe(reefPortMat.reefCommonModule.code);
    expect(reefMat.reefCommonModule.name).toBe(reefPortMat.reefCommonModule.name);
  });

  it('generates the same surge modules', () => {
    for (const ocean of [null, () => null, () => ({ module: { name: 'oceanFFT' }, cascades: 3, sizes: [250, 37.5, 9] }), () => ({ module: { name: 'oceanFFT' }, cascades: 1, sizes: [64] })]) {
      const a = reefMat.makeSurge(ocean), b = reefPortMat.makeSurge(ocean);
      expect([a.module.name, (a.module as ReefPortAny).code, (a.module as ReefPortAny).deps.map((d: ReefPortAny) => d.name)])
        .toEqual([b.module.name, b.module.code, b.module.deps.map((d: ReefPortAny) => d.name)]);
      expect(a.call('xz', 'd', 't')).toBe(b.call('xz', 'd', 't'));
    }
  });

  it('generates the same materials (vertex and surface WGSL, options, modules)', () => {
    for (const fade of [false, true]) {
      const kinds = () => reefPortKinds(1);
      const ours = { hard: new ReefBatch('Reef.hard', kinds(), { maxInstances: 4, fade: true }), soft: new ReefBatch('Reef.soft', kinds(), { maxInstances: 4, fade: true }) };
      const theirs = { hard: new reefPortPool.ReefBatch('Reef.hard', kinds(), { maxInstances: 4, fade: true }), soft: new reefPortPool.ReefBatch('Reef.soft', kinds(), { maxInstances: 4, fade: true }) };
      const view = reefMat.createReefView(), viewTheirs = reefPortMat.createReefView();
      expect([view.structName, view.fields]).toEqual([viewTheirs.structName, viewTheirs.fields]);
      const ocean = () => ({ module: { name: 'oceanFFT' }, cascades: 2, sizes: [250, 37.5] });
      const a = reefMat.createReefMaterials({ ...ours, getOcean: ocean, noise: 'tex', view, fade }) as ReefPortAny;
      const b = reefPortMat.createReefMaterials({ ...theirs, getOcean: ocean, noise: 'tex', view: viewTheirs, fade });
      for (const k of ['hard', 'soft']) {
        const x = a[k].options, y = b[k].options;
        for (const f of ['name', 'vertex', 'surface', 'side', 'alphaTest', 'roughness', 'metalness', 'attributes', 'varyings']) expect(x[f], `${k} ${f}`).toEqual(y[f]);
        expect(x.modules.map((m: ReefPortAny) => m.name), k).toEqual(y.modules.map((m: ReefPortAny) => m.name));
        for (let i = 0; i < y.modules.length; i++) if (y.modules[i].name !== 'lodFade') expect(x.modules[i].code, `${k} module ${y.modules[i].name}`).toBe(y.modules[i].code);
        expect(x.textures).toEqual(y.textures);
        expect(x.bindings.reefView.uniform.structName).toBe(y.bindings.reefView.uniform.structName);
      }
      // the view may also be passed as { block }
      const c = reefMat.createReefMaterials({ ...ours, noise: 'tex', view: { block: view }, fade }) as ReefPortAny;
      const d = reefPortMat.createReefMaterials({ ...theirs, noise: 'tex', view: { block: viewTheirs }, fade });
      expect(c.hard.options.vertex).toBe(d.hard.options.vertex);
      expect(c.soft.options.modules.map((m: ReefPortAny) => m.code)[3]).toBe(d.soft.options.modules.map((m: ReefPortAny) => m.code)[3]);
    }
  });
});

// ---- the whole reef on a deterministic test terrain
const REEF_PORT_RES = 512, REEF_PORT_ORIGIN = -256;
function reefPortTerrain(): ReefTerrain {
  // beach near z = -40, a seabed sloping seaward (+z) and a shallow reef platform around WORLD.reef
  const heightAt = (x: number, z: number) => {
    const base = -(z + 40) * 0.075;
    const px = (x + 78) / 55, pz = (z - 50) / 35;
    const plat = 4.8 * Math.exp(-(px * px + pz * pz));
    return base + plat + 0.35 * Math.sin(x * 0.13 + z * 0.07) + 0.2 * Math.sin(z * 0.21 - x * 0.05);
  };
  const seagrass = new Uint8Array(REEF_PORT_RES * REEF_PORT_RES);
  for (let j = 0; j < REEF_PORT_RES; j++) for (let i = 0; i < REEF_PORT_RES; i++) {
    seagrass[j * REEF_PORT_RES + i] = Math.round(255 * Math.max(0, Math.min(1, 0.5 + 0.7 * Math.sin(i * 0.045) * Math.sin(j * 0.061 + 1.3))));
  }
  return {
    heightAt,
    normalAt: (x, z, out) => {
      const e = 0.5;
      return out.set(-(heightAt(x + e, z) - heightAt(x - e, z)), 2 * e, -(heightAt(x, z + e) - heightAt(x, z - e))).normalize();
    },
    seagrass, res: REEF_PORT_RES, origin: REEF_PORT_ORIGIN,
  };
}

const reefPortCameras: [string, [number, number, number], [number, number, number]][] = [
  ['underwater on the crest', [-78, -2.5, 40], [-78, -5, 80]],
  ['diver on the fore reef', [-70, -6, 75], [-90, -9, 95]],
  ['above the water', [-60, 6, 10], [-78, -4, 60]],
  ['high above the bay', [-40, 45, 0], [-78, -6, 70]],
  ['near the pier', [55, 1.5, 20], [40, -3, 60]],
  ['far away', [600, 20, 600], [0, 0, 0]],
];
const reefPortCamera = (p: [number, number, number], t: [number, number, number]) => {
  const c = new THREE.PerspectiveCamera(60, 1.6, 0.1, 600);
  c.position.set(...p);
  c.lookAt(...t);
  c.updateMatrixWorld();
  return c;
};

describe('Tidewater reef port (Reef.js) on a test terrain', () => {
  let ours: Reef & ReefPortAny, theirs: ReefPortAny;
  const fishOpts: ReefFishOptions[] = [];
  beforeAll(() => {
    const terrain = reefPortTerrain();
    ours = new Reef({ scene: { add() {} }, terrain, shoreField: 'shore', fish: (o) => { fishOpts.push(o); return new ReefPortFish(o); } }) as Reef & ReefPortAny;
    theirs = new reefPortSrc.Reef({ scene: { add() {} }, terrain, shoreField: 'shore' });
  }, 120000);

  it('builds the same models and kinds', () => {
    expect(Object.keys(ours.models)).toEqual(Object.keys(theirs.models));
    for (const name of Object.keys(theirs.models)) {
      const a = ours.models[name], b = theirs.models[name];
      expect(a.length, name).toBe(b.length);
      for (let v = 0; v < b.length; v++) {
        reefPortSame64([a[v].kind0, a[v].lods, a[v].radius, a[v].top, a[v].proxy], [b[v].kind0, b[v].lods, b[v].radius, b[v].top, b[v].proxy], `${name} ${v}`);
      }
    }
    for (const which of ['hard', 'soft']) {
      const a = ours.kinds[which], b = theirs.kinds[which];
      expect(a.map((k: ReefPortAny) => [k.type, k.lod, k.shadow, k.shadowOnly, k.triangles, k.vertices]), which)
        .toEqual(b.map((k: ReefPortAny) => [k.type, k.lod, k.shadow, k.shadowOnly, k.triangles, k.vertices]));
      reefPortSameGeometry(ours.batches[which].geometry, theirs.batches[which].geometry, `${which} merged geometry`);
    }
  });

  it('samples the same habitat', () => {
    const hab = ['f', 'depth', 'w0', 'w1', 'w2', 'w3', 'w4', 'u', 'v'];
    const xs: number[] = [], ys: number[] = [];
    for (let z = -20; z < 180; z += 3.7) for (let x = -205; x < 50; x += 4.1) {
      const a = ours.habitat(x, z), b = theirs.habitat(x, z);
      for (const k of hab) { xs.push(a[k]); ys.push(b[k]); }
      expect(ours.frameUV(x, z)).toEqual(theirs.frameUV(x, z));
    }
    reefPortSame64(xs, ys, 'habitat');
  });

  it('places the same instances (types, transforms, colours) and counts', () => {
    expect(ours.counts).toEqual(theirs.counts);
    for (const which of ['hard', 'soft']) {
      const a = ours.items[which], b = theirs.items[which];
      expect(a.length, which).toBe(b.length);
      expect(a.map((it: ReefPortAny) => it.name), which).toEqual(b.map((it: ReefPortAny) => it.name));
      const nums = (r: ReefPortAny, it: ReefPortAny) => {
        const model = Object.values(r.models as Record<string, ReefPortAny[]>).flat().indexOf(it.model);
        return [model, it.x, it.y, it.z, it.s, it.sx, it.sy, it.sz, it.q.x, it.q.y, it.q.z, it.q.w, it.c1, it.c2, it.seed, it.flex, it.radius, it.range];
      };
      reefPortSame64(a.flatMap((it: ReefPortAny) => nums(ours, it)), b.flatMap((it: ReefPortAny) => nums(theirs, it)), `${which} items`);
    }
    expect(ours.anchors).toEqual(theirs.anchors);
    expect(fishOpts[0]!.anchors).toBe(ours.anchors);
    expect([fishOpts[0]!.radius, fishOpts[0]!.center.toArray(), fishOpts[0]!.shoreField]).toEqual([theirs.fish.opts.radius, theirs.fish.opts.center.toArray(), 'shore']);
    expect(fishOpts[0]!.floorAt(-80, 60)).toBe(theirs.fish.opts.floorAt(-80, 60));
    expect(ours.items.hard.length + ours.items.soft.length).toBeGreaterThan(1000);
  });

  it('rasterizes the same height field and floor heights', () => {
    expect([ours.hx0, ours.hz0, ours.hfW, ours.hfH, ours.x0, ours.z0, ours.x1, ours.z1]).toEqual([theirs.hx0, theirs.hz0, theirs.hfW, theirs.hfH, theirs.x0, theirs.z0, theirs.x1, theirs.z1]);
    reefPortSame32(ours.hf, theirs.hf, 'height field');
    const a: number[] = [], b: number[] = [];
    for (let z = -60; z < 200; z += 0.73) for (let x = -215; x < 150; x += 1.91) { a.push(ours.floorHeightAt(x, z)); b.push(theirs.floorHeightAt(x, z)); }
    reefPortSame64(a, b, 'floorHeightAt');
    const n = new THREE.Vector3(), m = new THREE.Vector3();
    for (const [x, z] of [[-78, 58], [-60, 70], [-100, 30], [10, 0]] as const) {
      expect(ours.groundNormal(x, z, n).toArray()).toEqual(theirs.groundNormal(x, z, m).toArray());
    }
  });

  it('packs the same instance records and culling cells', () => {
    for (const which of ['hard', 'soft']) {
      reefPortSame32(ours.batches[which].data, theirs.batches[which].data, `${which} data`);
      reefPortSameStorage(ours.batches[which].instanceBuffer, theirs.batches[which].instanceBuffer, `${which} upload`);
      const A = ours[which + 'Cull'], B = theirs[which + 'Cull'];
      for (const k of Object.keys(B)) {
        expect(A[k].constructor.name, k).toBe(B[k].constructor.name);
        reefPortSame64(A[k], B[k], `${which} cull ${k}`);
      }
    }
    expect(ours.cellList.length).toBe(theirs.cellList.length);
    const cellNums = (c: ReefPortAny) => [c.x, c.z, c.ymin, c.ymax, c.r, c.hard.length, ...c.hard, c.soft.length, ...c.soft];
    reefPortSame64(ours.cellList.flatMap(cellNums), theirs.cellList.flatMap(cellNums), 'cells');
    expect(ours.extent).toEqual(theirs.extent);
    expect([ours.view.range.value, ours.viewBlock.structName]).toEqual([theirs.view.range.value, theirs.viewBlock.structName]);
    expect(ours.noise3D.options.data).toEqual(theirs.noise3D.options.data);
    expect(ours.materials.hard.options.vertex).toBe(theirs.materials.hard.options.vertex);
    expect(ours.fadeMaterials.soft.options.surface).toBe(theirs.fadeMaterials.soft.options.surface);
  });

  it('culls and picks the same levels of detail per camera', () => {
    let fades = 0, shadows = 0, soft = 0;
    reefPortCameras.forEach(([label, p, t], i) => {
      const ca = reefPortCamera(p, t), cb = reefPortCamera(p, t);
      ours.camera = ca; theirs.camera = cb;
      ours.update(0.016, ca.position); theirs.update(0.016, cb.position);
      for (const which of ['hard', 'soft']) {
        reefPortSameBatchFrame(ours.batches[which], theirs.batches[which], `${label} ${which}`);
        expect([ours.batches[which].mesh.visible, ours.batches[which].fadeMesh.visible], `${label} ${which}`)
          .toEqual([theirs.batches[which].mesh.visible, theirs.batches[which].fadeMesh.visible]);
      }
      expect(ours.batches.hard.mesh.castShadow).toBe(theirs.batches.hard.mesh.castShadow);
      expect([ours.view.range.value, ...ours.view.position.value.toArray()]).toEqual([theirs.view.range.value, ...theirs.view.position.value.toArray()]);
      const sa = { ...ours.stats, timings: null, fish: null }, sb = { ...theirs.stats, timings: null, fish: null };
      expect(sa, label).toEqual(sb);
      if (i < 3) expect(ours.batches.hard.visibleInstances, `${label} draws something`).toBeGreaterThan(0);
      fades += ours.batches.hard.fadeInstances + ours.batches.soft.fadeInstances;
      shadows += ours.batches.hard.shadowOffsets.length;
      soft += ours.batches.soft.visibleInstances;
    });
    // the cameras exercise the fade channel, the shadow proxies and the soft batch
    expect([fades > 0, shadows > 0, soft > 0]).toEqual([true, true, true]);
    expect(theirs.fish.updates).toBe(reefPortCameras.length);
  });
});
