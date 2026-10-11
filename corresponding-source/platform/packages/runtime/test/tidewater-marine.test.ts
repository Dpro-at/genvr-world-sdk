import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as M from '../src/tidewater-marine/index.js';
import * as geo from '../src/tidewater-village/geo-builder.js';
import * as props from '../src/tidewater-village/props.js';

// Executes the ORIGINAL pinned Tidewater source (read only, commit 4811ba48) against the installed three.js
// ("Tidewater on three.js"), one module at a time with its imports injected, and compares the port
// bit-exact. Engine-only parts are stubbed with the same records on both sides: Material / ShaderModule /
// UniformBlock (the port's WgslMaterial / WgslModule / WgslUniformBlock), ReefBatch (a recording batch),
// GPU.frame, WhaleWater, loadTexture and fetch (the whale's baked files are read from the source tree).
vi.setConfig( { testTimeout: 300_000 } ); // frame-by-frame parity runs of ~2000 fish and the whale
type Mod = Record<string, unknown>;
type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const root = new URL( '../../../../tooling/other-programs/tidewater/', import.meta.url );
const read = ( path:string ) => readFileSync( new URL( 'src/' + path, root ), 'utf8' );
const strip = ( text:string ) => text
	.replace( /^import[\s\S]*?from\s*'[^']*';\r?\n/gm, '' )
	.replace( /^export \{[^}]*\};?\r?\n/gm, '' )
	.replace( /^export /gm, '' )
	.replace( /import\.meta\.env/g, 'undefined' );
function load( path:string, deps:Mod, names:string[] ):Mod {

	return new Function( ...Object.keys( deps ), strip( read( path ) ) + `;return {${ names.join( ',' ) }};` )( ...Object.values( deps ) ) as Mod;

}

// one exported function cut out of a module whose other imports are engine-only
function cut( path:string, name:string ) {

	const src = read( path );
	const s = src.indexOf( `export function ${ name }` );
	const e = src.indexOf( '\n}', s ) + 2;
	return new Function( src.slice( s, e ).replace( /^export /, '' ) + `;return ${ name };` )() as ( ...a:Any[] ) => Any;

}

// ---------------------------------------------------------------------------
// stubs shared by both sides

const prefixOf = ( name:string ) => name.split( /[^A-Za-z0-9]+/ ).filter( Boolean ).map( ( p, i ) => i === 0 ? p[ 0 ]!.toLowerCase() + p.slice( 1 ) : p[ 0 ]!.toUpperCase() + p.slice( 1 ) ).join( '' );

/** Records every call the owner makes (ReefBatch API). */
class FakeBatch {

	name:string; kinds:Any[]; options:Any; prefix:string;
	data:Float32Array; dataAttr:{ needsUpdate:boolean }; fadeMesh:THREE.Object3D | null = null; mesh:THREE.Object3D | null = null;
	module:Any; log:Any[] = []; meshOptions:Any = null; materials:Any[] = [];

	constructor( name:string, kinds:Any[], options:Any ) {

		this.name = name;
		this.kinds = kinds;
		this.options = options;
		this.prefix = prefixOf( name );
		this.module = { name: 'batch-' + this.prefix };
		this.data = new Float32Array( options.maxInstances * 16 );
		const log = this.log;
		this.dataAttr = { set needsUpdate( v:boolean ) { if ( v ) log.push( [ 'upload' ] ); } } as Any;

	}

	upload() { this.log.push( [ 'upload' ] ); }
	begin() { this.log.push( [ 'begin' ] ); }
	add( k:number, id:number ) { this.log.push( [ 'add', k, id ] ); }
	addFade( k:number, id:number, f:number, o:boolean ) { this.log.push( [ 'fade', k, id, f, o ] ); }
	commit() { this.log.push( [ 'commit' ] ); }
	createMesh( material:Any, options:Any ) {

		this.materials.push( material );
		this.meshOptions = options ?? null;
		const m = new THREE.Mesh();
		m.name = this.name;
		this.mesh = m;
		return m;

	}

	createFadeMesh( material:Any ) {

		this.materials.push( material );
		this.fadeMesh = new THREE.Object3D();
		return this.fadeMesh;

	}

	fadeEntry() { return `${ this.prefix }FadeEntry( u32( v.aKind ), v.instance )`; }
	recordIndex() { return `${ this.prefix }RecordIndex( u32( v.aKind ), v.instance )`; }
	record( index:string ) { return [ 0, 1, 2, 3 ].map( ( k ) => `${ this.prefix }Record( ${ index }, ${ k }u )` ); }
	dispose() { this.log.push( [ 'dispose' ] ); }

}

const GPU = { frame: 0 };

// ---------------------------------------------------------------------------
// the original modules

const T = { THREE };
const mulberry32 = cut( 'util/Noise.js', 'mulberry32' );
const bandFade = cut( 'materials/LODFade.js', 'bandFade' );
const oSpecies = load( 'world/fish/FishSpecies.js', {}, [ 'PATTERN', 'SPECIES', 'SKIN' ] ) as Any;
const oGeo = load( 'world/fish/FishGeometry.js', T, [ 'PART', 'prof', 'section', 'surfaceX', 'fishGeometry', 'splitFishGeometry' ] ) as Any;
const oCreature = load( 'world/fish/CreatureGeometry.js', { ...T, PART: oGeo.PART }, [ 'rayGeometry', 'turtleGeometry' ] ) as Any;
const oMaterial = load( 'world/fish/FishMaterial.js', {
	Color: THREE.Color, Vector4: THREE.Vector4, Material: M.WgslMaterial, ShaderModule: M.WgslModule, UniformBlock: M.WgslUniformBlock,
	commonModule: M.COMMON_MODULE, lodFadeModule: M.LOD_FADE_MODULE, SPECIES: oSpecies.SPECIES, SKIN: oSpecies.SKIN, PATTERN: oSpecies.PATTERN,
	PART: oGeo.PART,
}, [ 'FISH_SPECULAR', 'skinTable', 'fishModule', 'createSwimMaterial', 'createPropMaterial' ] ) as Any;
const oProps = load( 'world/fish/FishProps.js', {
	...T, ReefBatch: FakeBatch, GPU, SPECIES: oSpecies.SPECIES, fishGeometry: oGeo.fishGeometry, splitFishGeometry: oGeo.splitFishGeometry,
	section: oGeo.section, PART: oGeo.PART, createPropMaterial: oMaterial.createPropMaterial, bandFade,
}, [ 'FishProps', 'iceGeometry', 'leafGeometry', 'lobsterGeometry' ] ) as Any;
const WORLD = ( load( 'world/WorldLayout.js', T, [ 'WORLD' ] ) as Any ).WORLD;
class FakeWhaleWater { update() { /* the ocean port owns the whale's water marks */ } }
const oFish = load( 'world/Fish.js', {
	...T, mulberry32, ReefBatch: FakeBatch, WORLD, SPECIES: oSpecies.SPECIES, fishGeometry: oGeo.fishGeometry,
	rayGeometry: oCreature.rayGeometry, turtleGeometry: oCreature.turtleGeometry, createSwimMaterial: oMaterial.createSwimMaterial, bandFade,
	WhaleWater: FakeWhaleWater, FrameUniforms: { fields: { resolution: { value: { y: 1267 } } } },
}, [ 'FishSchools' ] ) as Any;
const oBrain = load( 'world/marine/WhaleBrain.js', T, [ 'WhaleBrain' ] ) as Any;
const oTextures = load( 'world/marine/WhaleTextures.js', { Texture: null, generateMipmaps: null }, [ 'decodePNG' ] ) as Any;
const fakeTexture = async ( url:string, srgb:boolean ) => ( { url, srgb } );
const oWhale = load( 'world/marine/Whale.js', {
	...T, Material: M.WgslMaterial, ShaderModule: M.WgslModule, LAYERS: { OPAQUE: 0 }, SPRAY: M.SPRAY, WhaleBrain: oBrain.WhaleBrain,
	loadTexture: fakeTexture,
}, [ 'Whale' ] ) as Any;

// ---------------------------------------------------------------------------
// comparison helpers

const bits = ( array:ArrayLike<number> ) => new Uint32Array( Float32Array.from( array ).buffer );
function expectSameGeometry( actual:THREE.BufferGeometry, expected:THREE.BufferGeometry, label = '' ) {

	const names = Object.keys( expected.attributes );
	expect( Object.keys( actual.attributes ), label ).toEqual( names );
	for ( const name of names ) {

		const a = actual.getAttribute( name ) as THREE.BufferAttribute, b = expected.getAttribute( name ) as THREE.BufferAttribute;
		expect( [ a.itemSize, a.count, a.array.constructor.name, a.normalized ], `${ label } ${ name }` )
			.toEqual( [ b.itemSize, b.count, b.array.constructor.name, b.normalized ] );
		if ( a.array instanceof Float32Array ) expect( bits( a.array ), `${ label } ${ name } bits` ).toEqual( bits( b.array ) );
		else expect( Array.from( a.array ), `${ label } ${ name }` ).toEqual( Array.from( b.array ) );

	}

	expect( actual.index?.array.constructor.name, label ).toBe( expected.index?.array.constructor.name );
	if ( expected.index ) expect( Array.from( actual.index!.array ), `${ label } index` ).toEqual( Array.from( expected.index.array ) );
	expect( actual.boundingSphere, label ).toEqual( expected.boundingSphere );

}

// plain data: vectors / quaternions as arrays, typed arrays as Float32 bits (or values), functions dropped
const plain = ( v:unknown, depth = 0 ):unknown => {

	if ( depth > 6 ) return '<deep>';
	if ( v instanceof THREE.Vector2 || v instanceof THREE.Vector3 || v instanceof THREE.Vector4 || v instanceof THREE.Quaternion ) return v.toArray();
	if ( v instanceof Float32Array ) return Array.from( bits( v ) );
	if ( ArrayBuffer.isView( v ) ) return Array.from( v as unknown as ArrayLike<number> );
	if ( Array.isArray( v ) ) return v.map( ( x ) => plain( x, depth + 1 ) );
	if ( typeof v === 'function' ) return '<fn>';
	if ( v && typeof v === 'object' ) return Object.fromEntries( Object.entries( v ).map( ( [ k, x ] ) => [ k, plain( x, depth + 1 ) ] ) );
	return v;

};

const triangles = ( g:THREE.BufferGeometry ) => g.index!.count / 3;
const FISH_NAMES = Object.keys( M.SPECIES ).filter( ( k ) => 'top' in ( M.SPECIES as Any )[ k ] ) as M.FishName[];

// ---------------------------------------------------------------------------

describe( 'Tidewater marine: species tables and shared helpers', () => {

	it( 'copies the anatomy and skin tables verbatim', () => {

		expect( M.PATTERN ).toEqual( oSpecies.PATTERN );
		expect( M.SPECIES ).toEqual( oSpecies.SPECIES );
		expect( M.SKIN ).toEqual( oSpecies.SKIN );
		expect( FISH_NAMES.length ).toBe( 18 );

	} );

	it( 'matches mulberry32 and bandFade', () => {

		for ( const seed of [ 0, 1, 23, 1967949337, 4294967295 ] ) {

			const a = M.mulberry32( seed ), b = mulberry32( seed );
			for ( let i = 0; i < 50; i ++ ) expect( a() ).toBe( b() );

		}

		for ( const d of [ - 5, 0, 10, 80.9, 81, 85.4, 90, 95 ] ) for ( const [ s, e ] of [ [ 81, 90 ], [ 10, 10 ], [ - 368, - 320 ] ] ) {

			expect( Object.is( M.bandFade( d, s!, e! ), bandFade( d, s, e ) ) ).toBe( true );

		}

	} );

} );

describe( 'Tidewater marine: fish geometry', () => {

	it( 'matches the profiles and sections of every species', () => {

		for ( const name of FISH_NAMES ) {

			const S = M.SPECIES[ name ], O = oSpecies.SPECIES[ name ];
			for ( const u of [ 0, 0.003, 0.05, 0.27, 0.5, 0.731, 0.99, 1, 1.2 ] ) {

				expect( M.section( S, u ) ).toEqual( oGeo.section( O, u ) );
				for ( const y of [ - 0.2, - 0.03, 0, 0.011, 0.07, 0.3 ] ) expect( M.surfaceX( M.section( S, u ), y ) ).toBe( oGeo.surfaceX( oGeo.section( O, u ), y ) );

			}

		}

	} );

	it( 'matches every species at every level of detail, swimming and dead (eyes, mouth, fins)', () => {

		for ( const name of FISH_NAMES ) {

			const S = M.SPECIES[ name ], O = oSpecies.SPECIES[ name ];
			for ( const lod of [ 0, 1, 2, 3 ] ) for ( const pose of [ 'swim', 'dead' ] as const ) {

				expectSameGeometry( M.fishGeometry( S, { lod, pose } ), oGeo.fishGeometry( O, { lod, pose } ), `${ name } ${ lod } ${ pose }` );

			}

		}

	} );

	it( 'matches cut pieces, explicit options and split salted fish', () => {

		for ( const name of FISH_NAMES ) {

			const S = M.SPECIES[ name ], O = oSpecies.SPECIES[ name ];
			const cutAt = S.opercle + 0.02;
			for ( const lod of [ 0, 1 ] ) {

				const cases:M.FishGeometryOptions[] = [
					{ lod, pose: 'dead', u1: cutAt, eyes: lod === 0 }, { lod, pose: 'dead', u0: cutAt }, { lod, mouth: true, fins: false },
					{ lod, pose: 'swim', eyes: true, u0: 0.3, u1: 0.7 },
				];
				for ( const o of cases ) expectSameGeometry( M.fishGeometry( S, o ), oGeo.fishGeometry( O, o ), `${ name } ${ JSON.stringify( o ) }` );
				expectSameGeometry( M.splitFishGeometry( S, { lod } ), oGeo.splitFishGeometry( O, { lod } ), `${ name } split ${ lod }` );

			}

		}

	} );

	it( 'keeps the triangle budget of the README (swimming fish per level, creatures)', () => {

		const swim = ( n:M.FishName ) => [ 0, 1, 2, 3 ].map( ( lod ) => triangles( M.fishGeometry( M.SPECIES[ n ], { lod, pose: 'swim' } ) ) );
		expect( swim( 'silverside' ) ).toEqual( [ 3402, 798, 226, 76 ] );
		expect( swim( 'mahi' ) ).toEqual( [ 4658, 766, 210, 76 ] );
		expect( swim( 'tuna' ) ).toEqual( [ 3904, 844, 226, 76 ] );
		expect( [ 0, 1 ].map( ( lod ) => triangles( M.rayGeometry( { lod, eagle: true } ) ) ) ).toEqual( [ 1661, 307 ] );
		expect( [ 0, 1 ].map( ( lod ) => triangles( M.turtleGeometry( { lod } ) ) ) ).toEqual( [ 1412, 338 ] );
		expect( [ 0, 1 ].map( ( lod ) => triangles( M.splitFishGeometry( M.SPECIES.mullet, { lod } ) ) ) ).toEqual( [ 1216, 300 ] );

	} );

	it( 'matches the rays and the turtle', () => {

		for ( const lod of [ 0, 1 ] ) {

			for ( const eagle of [ false, true ] ) expectSameGeometry( M.rayGeometry( { lod, eagle } ), oCreature.rayGeometry( { lod, eagle } ), `ray ${ lod } ${ eagle }` );
			expectSameGeometry( M.turtleGeometry( { lod } ), oCreature.turtleGeometry( { lod } ), `turtle ${ lod }` );

		}

	} );

} );

describe( 'Tidewater marine: fish material records', () => {

	const batch = () => new FakeBatch( 'Fish', [], { maxInstances: 1 } ) as unknown as M.MarineBatch;

	it( 'matches the skin table (8 linear-colour rows per species)', () => {

		const ours = M.skinTable(), theirs = oMaterial.skinTable();
		expect( ours.name ).toBe( theirs.name );
		expect( ours.options ).toEqual( theirs.options );
		expect( ours.fields.rows![ 0 ] ).toBe( theirs.fields.rows[ 0 ] );
		expect( ( M.skinRows() ).map( ( v ) => Array.from( bits( v.toArray() ) ) ) ).toEqual( theirs.fields.rows[ 1 ].map( ( v:THREE.Vector4 ) => Array.from( bits( v.toArray() ) ) ) );

	} );

	it( 'generates the same WGSL module and materials (swim / prop, main / fade)', () => {

		const ours = M.fishModule(), theirs = oMaterial.fishModule();
		expect( ours.code ).toBe( theirs.code );
		expect( [ ours.name, ours.uniformName, ours.deps ] ).toEqual( [ theirs.name, theirs.uniformName, theirs.deps ] );
		expect( M.FISH_SPECULAR ).toBe( oMaterial.FISH_SPECULAR );
		for ( const fade of [ false, true ] ) {

			for ( const kind of [ 'createSwimMaterial', 'createPropMaterial' ] as const ) {

				const a = M[ kind ]( batch(), { fade } ), b = oMaterial[ kind ]( batch(), { fade } );
				const strip = ( m:M.WgslMaterial ) => ( { ...m.options, modules: ( m.options.modules as Any[] ).map( ( x ) => x.name ) } );
				expect( strip( a ), `${ kind } ${ fade }` ).toEqual( strip( b ) );
				expect( typeof a.options.vertex ).toBe( 'string' );

			}

		}

	} );

} );

describe( 'Tidewater marine: fish props (village displays)', () => {

	let prevBatch:M.MarineBatchClass | null = null, prevFrame:( () => number ) | null = null;
	beforeAll( () => {

		prevBatch = M.setMarineBatch( FakeBatch as unknown as M.MarineBatchClass );
		prevFrame = M.setMarineFrame( () => GPU.frame );

	} );
	afterAll( () => {

		M.setMarineBatch( prevBatch );
		M.setMarineFrame( prevFrame! );

	} );

	it( 'matches the ice, leaf and lobster models, the bend mirror and the anchors', () => {

		for ( const lod of [ 0, 1 ] ) {

			expectSameGeometry( M.iceGeometry( lod ), oProps.iceGeometry( lod ), `ice ${ lod }` );
			expectSameGeometry( M.leafGeometry( lod ), oProps.leafGeometry( lod ), `leaf ${ lod }` );
			expectSameGeometry( M.lobsterGeometry( lod ), oProps.lobsterGeometry( lod ), `lobster ${ lod }` );

		}

		for ( const name of FISH_NAMES ) {

			expect( M.FishProps.tailAnchor( name ) ).toEqual( oProps.FishProps.tailAnchor( name ) );
			expect( M.FishProps.gillAnchor( name ) ).toEqual( oProps.FishProps.gillAnchor( name ) );
			for ( const L of [ 0.3, 0.42 ] ) expect( M.FishProps.restHeight( name, L ) ).toBe( oProps.FishProps.restHeight( name, L ) );

		}

	} );

	// the village's fish(), iceBed(), bananaLeaf() and lobster() with the real collector plugged in
	function village( api:props.FishPropsApi ) {

		const prev = props.setFishProps( api );
		try {

			const B = new geo.Builder();
			B.frame.makeTranslation( 40, 1.2, - 110 );
			const species = [ 'redSnapper', 'yellowtail', 'parrot', 'grunt', 'jack', 'mullet', 'tuna', 'grouper', 'barracuda' ];
			species.forEach( ( s, i ) => {

				props.fish( B, i * 0.3, 0.9, 0.1 * i, { species: s, len: 0.3 + i * 0.02, ry: i, curl: ( i - 4 ) * 0.4, sag: 0.1 * i, jaw: 0.2, seed: i / 9, flip: i % 2 === 0 } );
				props.fish( B, i * 0.2, 2.1, 0.5, { species: s, len: 0.35, pose: 'tail', kind: i % 3 === 0 ? 'split' : 'whole', seed: 0.11 * i, dried: 0.7 } );
				props.fish( B, i * 0.25, 2.0, - 0.5, { species: s, len: 0.33, pose: 'gill', sag: - 0.3, seed: 0.05 * i, blood: 0.4 } );

			} );
			props.fish( B, 1, 0.9, 1, { species: 'mahi', kind: 'head', seed: 0.4 } );
			props.fish( B, 1.3, 0.9, 1, { species: 'mahi', kind: 'trunk', seed: 0.4, curl: 0.5 } );
			props.iceBed( B, - 1, 0.8, 0, 0.42, 0.3 );
			props.bananaLeaf( B, 0, 0.8, 0, 0.7, 0.9, 0.2, 0.1 );
			props.lobster( B, 1, 0.85, 0, 1.1, 0.3, 0.6, 0.05 );
			return B.fishProps as Any;

		} finally {

			props.setFishProps( prev );

		}

	}

	// the original class behind the village's interface
	class Original {

		inner = new oProps.FishProps();
		add( ...a:Any[] ) { this.inner.add( ...a ); }
		static tailAnchor( s:string ) { return oProps.FishProps.tailAnchor( s ); }
		static gillAnchor( s:string ) { return oProps.FishProps.gillAnchor( s ); }
		static restHeight( s:string, L:number ) { return oProps.FishProps.restHeight( s, L ); }

	}

	it( 'plugs into the village (setFishProps) and collects the same items as the source', () => {

		const ours = village( M.FishProps ) as M.FishProps, theirs = village( Original ).inner;
		expect( ours ).toBeInstanceOf( M.FishProps );
		expect( ours.items!.length ).toBe( 32 );
		expect( plain( ours.items ) ).toEqual( plain( theirs.items ) );

	} );

	it( 'builds the same batch (kinds, instance data, materials) and culls the same', () => {

		const ours = village( M.FishProps ) as M.FishProps, theirs = village( Original ).inner;
		const meshA = ours.build(), meshB = theirs.build();
		const A = ours.batch as unknown as FakeBatch, B = theirs.batch as FakeBatch;
		expect( [ A.name, A.options, A.meshOptions ] ).toEqual( [ B.name, B.options, B.meshOptions ] );
		expect( A.kinds.length ).toBe( B.kinds.length );
		A.kinds.forEach( ( k, i ) => {

			expectSameGeometry( k.geometry, B.kinds[ i ].geometry, `kind ${ i }` );
			expect( [ k.shadow, k.shadowOnly ] ).toEqual( [ B.kinds[ i ].shadow, B.kinds[ i ].shadowOnly ] );

		} );
		expect( bits( A.data ) ).toEqual( bits( B.data ) );
		expect( Array.from( ours.kind0! ) ).toEqual( Array.from( theirs.kind0 ) );
		expect( bits( ours.pos! ) ).toEqual( bits( theirs.pos ) );
		expect( meshA.name ).toBe( meshB.name );
		expect( A.materials.map( ( m ) => m.options ) ).toEqual( B.materials.map( ( m:Any ) => m.options ) );

		const camera = new THREE.PerspectiveCamera( 60, 16 / 9, 0.1, 2000 );
		const seen = new Set<string>();
		for ( const [ x, y, z, tx, tz ] of [ [ 40, 3, - 100, 40, - 110 ], [ 40, 2, - 108, 41, - 110 ], [ 20, 30, - 30, 40, - 110 ], [ 10, 2, - 40, 40, - 110 ], [ 40, 1.6, - 109.5, 40, - 112 ] ] ) {

			camera.position.set( x!, y!, z! );
			camera.lookAt( tx!, 1, tz! );
			GPU.frame ++;
			A.log.length = B.log.length = 0;
			meshA.onBeforeRender( null as Any, null as Any, camera, null as Any, null as Any, null as Any );
			meshB.onBeforeRender( null as Any, null as Any, camera, null as Any, null as Any, null as Any );
			meshA.onBeforeRender( null as Any, null as Any, camera, null as Any, null as Any, null as Any ); // once per frame
			expect( A.log ).toEqual( B.log );
			for ( const e of A.log ) seen.add( e[ 0 ] );

		}

		expect( [ ...seen ].sort() ).toEqual( [ 'add', 'begin', 'commit', 'fade' ] );

	} );

} );

// ---------------------------------------------------------------------------
// fish schools

// A sloping seabed (sea level 0, deeper toward +z) with wavy relief and a reef framework above it.
const heightAt = ( x:number, z:number ) => - ( 0.5 + Math.max( 0, z ) * 0.12 + 3 * Math.sin( x * 0.05 ) * Math.cos( z * 0.07 ) );
const terrain = { heightAt };
const floorAt = ( x:number, z:number ) => heightAt( x, z ) + 0.6 * Math.max( 0, Math.sin( x * 0.3 ) * Math.cos( z * 0.25 ) );
const reefCenter = new THREE.Vector3( - 78, 0, 58 );
const anchors = [ [ - 80, 55 ], [ - 70, 66 ], [ - 92, 48 ], [ - 60, 50 ], [ - 85, 75 ] ];

function schools( Cls:Any, seed:number, ours:boolean, bay = true ) {

	const parent = new THREE.Group();
	const o:Any = { parent, terrain, floorAt, center: reefCenter, radius: 68, anchors, seed, bay };
	if ( ours ) Object.assign( o, { pier: WORLD.pier, Batch: FakeBatch } );
	return new Cls( o );

}

// typed arrays byte for byte (fast path), the readable diff only on a mismatch
function expectSameArray( a:ArrayBufferView, b:ArrayBufferView, label:string ) {

	const same = a.constructor === b.constructor && Buffer.from( a.buffer, a.byteOffset, a.byteLength ).equals( Buffer.from( b.buffer, b.byteOffset, b.byteLength ) );
	if ( ! same ) expect( plain( a ), label ).toEqual( plain( b ) );

}

const FISH_STATE = [ 'pos', 'vel', 'head', 'roll', 'bend', 'phase', 'size', 'speedMul', 'panic', 'seed', 'kind', 'pattern', 'slot', 'jump', 'floorC',
	'shallowC', 'prev' ];
function expectSameSchools( a:Any, b:Any, label:string ) {

	expect( a.n, label ).toBe( b.n );
	for ( const k of FISH_STATE ) expectSameArray( a[ k ], b[ k ], `${ label } ${ k }` );
	expect( a.groups.length, label ).toBe( b.groups.length );
	a.groups.forEach( ( g:Any, i:number ) => {

		const h = b.groups[ i ];
		const pick = ( x:Any ) => plain( { sp: x.sp, count: x.count, offset: x.offset, zone: x.zone, home: x.home, goal: x.goal, center: x.center, heading: x.heading,
			timer: x.timer, alarm: x.alarm, spin: x.spin, active: x.active, radius: x.radius, ball: x.ball, rest: x.rest, breath: x.breath,
			jumpTimer: x.jumpTimer, pathIndex: x.pathIndex, pathDir: x.pathDir, attached: x.attached } );
		expect( pick( g ), `${ label } group ${ i } ${ g.sp.name }` ).toEqual( pick( h ) );

	} );
	expect( [ a.time, a._frame, a.dt ], label ).toEqual( [ b.time, b._frame, b.dt ] );

}

describe( 'Tidewater marine: fish schools', () => {

	it( 'lays out the same groups and models over several seeds (reef only and with the bay)', () => {

		for ( const [ seed, bay ] of [ [ 23, true ], [ 7, true ], [ 101, false ] ] as const ) {

			const a = schools( M.FishSchools, seed, true, bay ), b = schools( oFish.FishSchools, seed, false, bay );
			expectSameSchools( a, b, `seed ${ seed }` );
			expect( plain( a.dropPath ) ).toEqual( plain( b.dropPath ) );
			expect( a.modelKind ).toEqual( b.modelKind );
			const A = a.batch as FakeBatch, B = b.batch as FakeBatch;
			expect( [ A.name, A.options ] ).toEqual( [ B.name, B.options ] );
			expect( A.kinds.map( ( k ) => [ k.model, k.lod ] ) ).toEqual( B.kinds.map( ( k:Any ) => [ k.model, k.lod ] ) );
			if ( seed === 23 ) A.kinds.forEach( ( k, i ) => expectSameGeometry( k.geometry, B.kinds[ i ].geometry, `${ k.model } ${ k.lod }` ) );
			expect( A.materials.map( ( m ) => m.options ) ).toEqual( B.materials.map( ( m:Any ) => m.options ) );
			expect( a.n ).toBeGreaterThan( 1500 );

		}

	} );

	it( 'simulates and culls the same frame by frame (diver, wading, leaps, bait ball, jacks)', () => {

		let splashes = 0;
		for ( const [ seed, frames ] of [ [ 23, 1200 ], [ 7, 240 ] ] as const ) {

			const a = schools( M.FishSchools, seed, true ), b = schools( oFish.FishSchools, seed, false );
			const sprayA:Any[] = [], sprayB:Any[] = [];
			a.spray = { emit: ( ...x:Any[] ) => sprayA.push( plain( x ) ) };
			b.spray = { emit: ( ...x:Any[] ) => sprayB.push( plain( x ) ) };
			const cam = new THREE.PerspectiveCamera( 70, 16 / 9, 0.05, 500 );
			const drop = a.dropPath[ Math.floor( a.dropPath.length / 2 ) ];
			const drawn:Record<string, number> = {};
			for ( let f = 0; f < frames; f ++ ) {

				// the diver swims from the reef to the drop-off, then wades near the beach
				const t = Math.min( 1, f / 240 );
				const player = f < 30 ? null : f < 180
					? new THREE.Vector3( - 78 + ( drop[ 0 ] + 78 ) * t, - 3 - 2 * Math.sin( f * 0.05 ), 58 + ( drop[ 1 ] - 58 ) * t )
					: new THREE.Vector3( 20 + ( f % 240 ) * 0.1, 0.5, 12 );
				const dt = f % 37 === 5 ? 0.09 : f % 53 === 7 ? 0 : 1 / 60;
				a.update( dt, player );
				b.update( dt, player );
				if ( f % 3 === 0 ) {

					const p = player ?? new THREE.Vector3( - 78, - 4, 58 );
					cam.position.copy( p );
					cam.lookAt( p.x + Math.cos( f * 0.1 ) * 10, p.y - 0.5, p.z + Math.sin( f * 0.1 ) * 10 );
					cam.updateMatrixWorld();
					const A = a.batch as FakeBatch, B = b.batch as FakeBatch;
					A.log.length = B.log.length = 0;
					a.mesh.onBeforeRender( { domElement: { height: 1440 } }, null, cam, null, null, null );
					b.mesh.onBeforeRender( { domElement: { height: 1440 } }, null, cam, null, null, null );
					expect( A.log, `seed ${ seed } frame ${ f } cull` ).toEqual( B.log );
					for ( const e of A.log ) drawn[ e[ 0 ] ] = ( drawn[ e[ 0 ] ] ?? 0 ) + 1;
					expectSameArray( A.data, B.data, `seed ${ seed } frame ${ f } data` );

				}

				if ( f % 20 === 0 || f === frames - 1 ) expectSameSchools( a, b, `seed ${ seed } frame ${ f }` );

			}

			expect( sprayA ).toEqual( sprayB );
			splashes += sprayA.length;
			expect( drawn.add ).toBeGreaterThan( 1000 );
			expect( drawn.fade ).toBeGreaterThan( 100 );
			expectSameSchools( a, b, `seed ${ seed } end` );

		}

		expect( splashes ).toBeGreaterThan( 0 ); // mullet leaps

	} );

	it( 'keeps every fish in its water column (above the bottom clearance, below the ceiling)', () => {

		const a = schools( M.FishSchools, 23, true );
		for ( let f = 0; f < 600; f ++ ) a.update( 1 / 60, null );
		let checked = 0;
		for ( const g of a.groups as M.Group[] ) {

			if ( [ 'bait', 'jumper', 'escort', 'remora' ].includes( g.sp.mode ) ) continue;
			for ( let k = 0; k < g.count; k ++ ) {

				const i = g.offset + k;
				const y = a.pos[ i * 3 + 1 ];
				expect( y ).toBeLessThanOrEqual( g.sp.ceiling + 1e-6 );
				expect( y ).toBeGreaterThanOrEqual( a.floorC[ i ] + ( g.sp.mode === 'glide' ? 0.02 : 0.18 ) - 1e-4 );
				checked ++;

			}

		}

		expect( checked ).toBeGreaterThan( 500 );

	} );

	it( 'needs the pier for the bay, and a batch class', () => {

		expect( () => new M.FishSchools( { parent: new THREE.Group(), terrain, center: reefCenter, radius: 68, Batch: FakeBatch as Any } ) ).toThrow( /pier/ );
		const prev = M.setMarineBatch( null );
		try {

			expect( () => new M.FishSchools( { parent: new THREE.Group(), terrain, center: reefCenter, radius: 68, bay: false } ) ).toThrow( /setMarineBatch/ );

		} finally {

			M.setMarineBatch( prev );

		}

	} );

} );

// ---------------------------------------------------------------------------
// whale

const query = () => {

	let t = 0;
	return {
		slots: 0, cpuValid: false, x: 0, z: 0,
		allocate() { return this.slots ++; },
		setPoint( _slot:number, x:number, z:number ) { this.x = x; this.z = z; t ++; this.cpuValid = t > 3; },
		get() { return { height: 0.35 * Math.sin( this.x * 0.07 + t * 0.02 ) + 0.2 * Math.cos( this.z * 0.05 ) }; },
	};

};
const seabed = { heightAt: ( x:number, z:number ) => - 18 + 4 * Math.sin( x * 0.02 ) + 3 * Math.cos( z * 0.015 ) };
const BRAIN_STATE = [ 'u', 'position', 'quaternion', 'velocity', 'speed', 'yaw', 'pitch', 'roll', 'rollV', 'breachRoll', 'breaches', 'splashes', 'bob',
	'y', 'vy', 'water', 'wetAge', 'strokePhase', 'strokeAmp', 'arch', 'headPitch', 'follow', 'blow', 'flukeUp', 'fin', 'slap', 'slapTimer', 'slaps',
	'yawRate', 'time', 'hArc', 'hQ', 'hHead', 'hCount', 'arc', 'seq', 'state', 'lastWrap' ];
const brainState = ( b:Any ) => plain( Object.fromEntries( BRAIN_STATE.map( ( k ) => [ k, k === 'hArc' ? Array.from( b.hArc ) : b[ k ] ] ) ) );

describe( 'Tidewater marine: whale brain', () => {

	it( 'builds the same route tables', () => {

		const a = new M.WhaleBrain( { terrain: seabed } ), b = new oBrain.WhaleBrain( { terrain: seabed } );
		expect( [ a.length, a.rN, a.yawWrap ] ).toEqual( [ b.length, b.rN, b.yawWrap ] );
		expect( Array.from( a.rPos ) ).toEqual( Array.from( b.rPos ) );
		expect( Array.from( a.rYaw ) ).toEqual( Array.from( b.rYaw ) );
		expect( brainState( a ) ).toEqual( brainState( b ) );
		for ( const u of [ - 30, 0, 17.3, 500, 1234.5, 5000 ] ) {

			expect( a.routeAt( u, new THREE.Vector3() ).toArray() ).toEqual( b.routeAt( u, new THREE.Vector3() ).toArray() );
			expect( a.routeYaw( u ) ).toBe( b.routeYaw( u ) );

		}

		expect( Math.abs( a.yawWrap ) ).toBeCloseTo( Math.PI * 2, 2 );

	} );

	it( 'runs the same state machine over several seeds (surfacing, blows, breach, slaps, fluke dive)', () => {

		for ( const [ seed, forceBreach, withQuery ] of [ [ 1, false, true ], [ 2, true, true ], [ 9, true, false ], [ 77, false, false ] ] as const ) {

			const a = new M.WhaleBrain( { terrain: seabed, query: withQuery ? query() : null, seed } );
			const b = new oBrain.WhaleBrain( { terrain: seabed, query: withQuery ? query() : null, seed } );
			a.forceBreach = b.forceBreach = forceBreach;
			let blowsA = 0, blowsB = 0;
			a.onBlow = () => blowsA ++;
			b.onBlow = () => blowsB ++;
			const states = new Set<string>();
			let maxBlow = 0, maxFluke = 0;
			for ( let f = 0; f < 6000; f ++ ) {

				const dt = f % 97 === 3 ? 0.25 : f % 41 === 0 ? 1 / 144 : 1 / 30;
				a.update( dt );
				b.update( dt );
				states.add( a.state );
				maxBlow = Math.max( maxBlow, a.blow );
				maxFluke = Math.max( maxFluke, a.flukeUp );
				if ( f % 250 === 0 ) expect( brainState( a ), `seed ${ seed } frame ${ f }` ).toEqual( brainState( b ) );
				if ( f % 400 === 0 ) {

					for ( const d of [ 0, 1.5, 4, 9.3, 40 ] ) expect( a.pathRotation( d, new THREE.Quaternion() ).toArray() ).toEqual( b.pathRotation( d, new THREE.Quaternion() ).toArray() );
					for ( const s of [ 0, 1 ] ) expect( a.flipperRotation( s, new THREE.Quaternion() ).toArray() ).toEqual( b.flipperRotation( s, new THREE.Quaternion() ).toArray() );

				}

			}

			expect( brainState( a ) ).toEqual( brainState( b ) );
			expect( blowsA ).toBe( blowsB );
			expect( blowsA ).toBeGreaterThanOrEqual( 3 );
			expect( [ ...states ].sort() ).toEqual( [ 'cruise', 'surface' ] );
			expect( maxBlow ).toBeGreaterThan( 0.9 );
			expect( maxFluke ).toBe( 1 );
			if ( forceBreach ) expect( a.breaches ).toBeGreaterThan( 0 );

		}

	} );

	it( 'loops the route in about 4.5 minutes (3.96 at cruise speed, ~4.9 with one surfacing)', () => {

		const a = new M.WhaleBrain( { terrain: seabed } );
		expect( a.length / 2.6 / 60 ).toBeCloseTo( 3.96, 2 );
		const u0 = a.u;
		let t = 0;
		while ( a.u - u0 < a.length ) {

			a.update( 1 / 30 );
			t += 1 / 30;

		}

		expect( t / 60 ).toBeGreaterThan( 4.5 );
		expect( t / 60 ).toBeLessThan( 5.5 );

	} );

	it( 'takes a route option (the place\'s own loop)', () => {

		const route = [ [ 0, 0 ], [ 100, 0 ], [ 100, 100 ], [ 0, 100 ] ];
		const a = new M.WhaleBrain( { terrain: seabed, route } );
		expect( a.length ).toBeGreaterThan( 300 );
		expect( a.length ).toBeLessThan( 440 );

	} );

} );

// a tiny RGBA PNG with every filter type, written with zlib (the decoder is the subject)
function pngFile( w:number, h:number, seed:number ) {

	const rnd = M.mulberry32( seed );
	const rows:number[] = [];
	for ( let y = 0; y < h; y ++ ) {

		rows.push( y % 5 );
		for ( let x = 0; x < w * 4; x ++ ) rows.push( Math.floor( rnd() * 256 ) );

	}

	const chunk = ( type:string, data:Buffer ) => {

		const head = Buffer.alloc( 8 );
		head.writeUInt32BE( data.length, 0 );
		head.write( type, 4, 'ascii' );
		return Buffer.concat( [ head, data, Buffer.alloc( 4 ) ] ); // CRC is not checked by the decoder

	};

	const ihdr = Buffer.alloc( 13 );
	ihdr.writeUInt32BE( w, 0 );
	ihdr.writeUInt32BE( h, 4 );
	ihdr[ 8 ] = 8; ihdr[ 9 ] = 6; ihdr[ 10 ] = 0; ihdr[ 11 ] = 0; ihdr[ 12 ] = 0;
	const z = deflateSync( Buffer.from( rows ) );
	const idat = [ chunk( 'IDAT', z.subarray( 0, 40 ) ), chunk( 'IDAT', z.subarray( 40 ) ) ];
	const png = Buffer.concat( [ Buffer.from( [ 137, 80, 78, 71, 13, 10, 26, 10 ] ), chunk( 'IHDR', ihdr ), ...idat, chunk( 'IEND', Buffer.alloc( 0 ) ) ] );
	return png.buffer.slice( png.byteOffset, png.byteOffset + png.byteLength ) as ArrayBuffer;

}

describe( 'Tidewater marine: whale textures', () => {

	it( 'decodes PNG data the same as the source (all five filters, split IDAT)', async () => {

		for ( const [ w, h, seed ] of [ [ 7, 11, 1 ], [ 16, 9, 2 ], [ 1, 6, 3 ] ] ) {

			const buf = pngFile( w!, h!, seed! );
			const a = await M.decodePNG( buf ), b = await oTextures.decodePNG( buf );
			expect( [ a.width, a.height ] ).toEqual( [ w, h ] );
			expect( Array.from( a.data ) ).toEqual( Array.from( b.data ) );

		}

		await expect( M.decodePNG( ( () => {

			const buf = pngFile( 2, 2, 4 );
			new Uint8Array( buf )[ 8 + 8 + 9 ] = 2; // colour type 2: RGB
			return buf;

		} )() ) ).rejects.toThrow( /RGBA/ );

	} );

	it( 'makes a three.js data texture (sRGB albedo, linear height)', () => {

		const tex = M.whaleTexture( { width: 2, height: 1, data: new Uint8Array( 8 ) }, true, 'a.png' );
		expect( [ tex.colorSpace, tex.anisotropy, tex.generateMipmaps, tex.name ] ).toEqual( [ THREE.SRGBColorSpace, 8, true, 'a.png' ] );
		expect( M.whaleTexture( { width: 1, height: 1, data: new Uint8Array( 4 ) }, false ).colorSpace ).toBe( THREE.LinearSRGBColorSpace );

	} );

} );

describe( 'Tidewater marine: whale', () => {

	const files = new URL( 'public/models/whale/', root );
	const tinyPng = pngFile( 4, 2, 9 );
	const realFetch = globalThis.fetch;
	beforeAll( () => {

		globalThis.fetch = ( async ( url:string ) => {

			const name = String( url ).split( '/' ).pop()!;
			const body = name.endsWith( '.png' ) ? tinyPng : readFileSync( new URL( name, files ) );
			const buf = body instanceof ArrayBuffer ? body : body.buffer.slice( body.byteOffset, body.byteOffset + body.byteLength );
			return { json: async () => JSON.parse( new TextDecoder().decode( buf as ArrayBuffer ) ), arrayBuffer: async () => buf };

		} ) as Any;

	} );
	afterAll( () => {

		globalThis.fetch = realFetch;

	} );

	async function whales( spray = true ) {

		const sprayA:Any[] = [], sprayB:Any[] = [];
		const a = new M.Whale( { scene: new THREE.Scene(), terrain: seabed, query: query(), ...( spray ? { spray: { emit: ( ...x:Any[] ) => sprayA.push( plain( x ) ) } } : {} ), url: '/w/' } );
		const b = new oWhale.Whale( { scene: new THREE.Scene(), terrain: seabed, query: query(), spray: spray ? { emit: ( ...x:Any[] ) => sprayB.push( plain( x ) ) } : null, url: '/w/' } );
		await a.load();
		await b.load();
		return { a, b, sprayA, sprayB };

	}

	const rig = ( w:Any ) => plain( { zHead: w.zHead, dz: w.dz, rest: w.rest, rootIndex: w.rootIndex, uPos: w.uPos, uRot: w.uRot, uFlip: w.uFlip, pos: w.pos,
		rot: w.rot, pecRoot: w.pecRoot, pecBasis: w.pecBasis.map( ( m:THREE.Matrix3 ) => m.elements ), blowLocal: w.blowLocal, lod: w.lod, _lod: w._lod,
		vis: w.meshes.map( ( m:THREE.Mesh ) => m.visible ), centre: w.meshes.map( ( m:THREE.Mesh ) => m.geometry.boundingSphere!.center ),
		water: w.uWater.value, wet: w.uWet.value, acc: [ w._blowAcc, w._dropAcc, w._slaps ] } );

	it( 'loads the baked levels and sets up the same rig and material record', async () => {

		const { a, b } = await whales();
		expect( a.meshes.length ).toBe( 3 );
		expect( a.meshes.map( ( m ) => triangles( m.geometry ) ) ).toEqual( [ 79870, 11602, 1734 ] );
		a.meshes.forEach( ( m, i ) => {

			expect( [ m.name, m.castShadow, m.receiveShadow, m.matrixAutoUpdate, m.layers.mask ] )
				.toEqual( [ b.meshes[ i ].name, b.meshes[ i ].castShadow, b.meshes[ i ].receiveShadow, b.meshes[ i ].matrixAutoUpdate, b.meshes[ i ].layers.mask ] );
			expectSameGeometry( m.geometry, b.meshes[ i ].geometry, m.name );
			expect( m.geometry.boundingBox ).toEqual( b.meshes[ i ].geometry.boundingBox );

		} );
		expect( rig( a ) ).toEqual( rig( b ) );
		const opts = ( w:Any ) => ( { ...w.material.options, textures: Object.keys( w.material.options.textures ), modules: w.material.options.modules.map( ( x:Any ) => ( { ...x } ) ) } );
		expect( plain( opts( a ) ) ).toEqual( plain( opts( b ) ) );
		expect( ( a.material.options.defines as Any ).WHALE_TEX ).toBe( 1 );
		expect( a.albedoTex!.colorSpace ).toBe( THREE.SRGBColorSpace );
		expect( [ a.ready, b.ready ] ).toEqual( [ true, true ] );

	} );

	it( 'poses, culls and sprays the same frame by frame; toWorld matches', async () => {

		const { a, b, sprayA, sprayB } = await whales();
		a.brain.forceBreach = b.brain.forceBreach = true;
		const realRandom = Math.random;
		const ra = M.mulberry32( 5 ), rb = M.mulberry32( 5 );
		const cam = new THREE.PerspectiveCamera();
		try {

			for ( let f = 0; f < 4200; f ++ ) {

				const dt = f % 89 === 1 ? 0.2 : 1 / 30;
				const p = a.brain.position;
				cam.position.set( p.x + 30 * Math.cos( f * 0.002 ), f % 600 < 300 ? 3 : - 4, p.z + ( 20 + ( f % 400 ) ) * Math.sin( f * 0.002 ) );
				Math.random = ra;
				a.update( dt, f % 13 === 0 ? null : cam );
				Math.random = rb;
				b.update( dt, f % 13 === 0 ? null : cam );
				if ( f % 150 === 0 ) {

					expect( rig( a ), `frame ${ f }` ).toEqual( rig( b ) );
					expect( brainState( a.brain ) ).toEqual( brainState( b.brain ) );
					for ( const q of [ [ 0, 1.15, 3 ], [ 1.2, - 0.3, 1.1 ], [ - 2, 0, - 8.6 ], [ 0, 0, 9 ], [ 0.3, 0.2, - 20 ] ] ) {

						const local = new THREE.Vector3( q[ 0 ], q[ 1 ], q[ 2 ] );
						expect( a.toWorld( local, new THREE.Vector3() ).toArray() ).toEqual( b.toWorld( local, new THREE.Vector3() ).toArray() );

					}

				}

			}

		} finally {

			Math.random = realRandom;

		}

		expect( rig( a ) ).toEqual( rig( b ) );
		expect( sprayA.length ).toBeGreaterThan( 100 );
		expect( sprayA ).toEqual( sprayB );

	} );

	it( 'is followed by the same escort (pilot fish, juveniles, remoras on the belly)', async () => {

		const { a: wa, b: wb } = await whales( false );
		const a = schools( M.FishSchools, 23, true ), b = schools( oFish.FishSchools, 23, false );
		a.setWhale( wa );
		b.setWhale( wb );
		for ( let f = 0; f < 900; f ++ ) {

			const dt = 1 / 30;
			wa.update( dt, null );
			wb.update( dt, null );
			const player = wa.brain.position.clone().add( new THREE.Vector3( 10, 0, 0 ) );
			a.update( dt, player );
			b.update( dt, player );
			if ( f % 100 === 0 ) expectSameSchools( a, b, `escort frame ${ f }` );

		}

		const escort = a.escort as M.Group[];
		expect( escort.map( ( g ) => g.attached ) ).toEqual( [ true, true, true ] );
		expectSameSchools( a, b, 'escort end' );

	} );

} );
