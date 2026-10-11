/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
// Source: src/world/debris/ScannedDebris.js 1-313 (photoscanned logs, branches and conch shells).
//
// Assets: the source loads four Poly Haven scans (Dead Quiver Trunk, Dead Quiver Branch 01 / 02,
// Lambis Shell; CC0 1.0 per the source's CREDITS.md and public/models/debris/CREDITS.md: decimated LOD
// GLBs + 1K albedo / normal / ARM JPEGs). NONE are copied into Genvr by this task: the loader takes
// `loadBytes` / `loadPixels` and the base URL as options, so whoever copies the CC0 files (plan task 17,
// public/models/realistic/tidewater/...) only passes the path. Until then nothing is loaded.
//
// CPU parts are the source code, compared bit-exact in the tests: the instance matrices and radii, the
// 2 x 2 atlas packing, the merged per-LOD geometry (uvs moved into atlas tiles, aAsset) and the per-frame
// LOD buckets (update / _put). The material is the source's engine record kept as DATA (vertex, surface
// and shadow WGSL; textures and mips through a `ShoreEngine`) and is NOT run; the meshes draw with a
// three.js material stand-in (no atlas sampling, no per-instance asset masking in three.js: every
// instance would show all four assets until a WebGPU backend runs the vertex WGSL).
import {
	Vector3, Quaternion, Euler, Matrix4, Frustum, Sphere, BufferGeometry, Float32BufferAttribute, Uint16BufferAttribute,
	Uint32BufferAttribute, InstancedBufferAttribute, InstancedMesh, DynamicDrawUsage, MeshStandardMaterial,
	type Camera, type Material, type Object3D,
} from 'three';
import { bandFade, srgb } from './shore-math.js';
import { parseGLB, type GlbMesh } from './glb.js';
import { RECORDING_ENGINE, type ShoreEngine, type ShoreMaterial, type ShoreTerrainGpu, type ShoreTexture } from './shore-engine.js';

// Photoscanned debris (CC0, Poly Haven; see public/models/debris/CREDITS.md): dead wood (logs,
// branches) and conch shells, instanced with three LODs.
//
// Each LOD level is ONE InstancedMesh holding the geometry of every asset (vertex attribute
// aAsset); an instance draws only its own asset (iData.x), the other assets' vertices collapse
// to a point. So the whole set costs 3 draw calls (+ 3 shadow draws for the near LOD) and one
// material. The asset textures (1K albedo / normal / AO-rough-metal) are packed into 2K atlases
// (2 x 2 tiles): 3 samplers.
// Instances are re-bucketed into the LODs (and distance culled) on the CPU when the camera moves.
// The .glb files are read by the minimal parser in GLB.js (three's GLTFLoader is gone).

export const SCAN_ASSETS = [ 'dead_quiver_trunk', 'dead_quiver_branch_02', 'dead_quiver_branch_01', 'lambis_shell' ] as const;
export const SCAN = { TRUNK: 0, BRANCH_A: 1, BRANCH_B: 2, SHELL: 3 } as const;
// size (m) of each asset after orientation (long axis x, up y), from the Blender export
export const SCAN_SIZE:readonly ( readonly [number, number, number] )[] = [ [ 1.994, 0.306, 0.268 ], [ 0.526, 0.287, 0.201 ], [ 0.439, 0.255, 0.227 ], [ 0.139, 0.047, 0.075 ] ];
export const LOD_DIST:readonly [number, number, number] = [ 22, 70, 260 ]; // m (+ 6 x instance size): LOD0 | LOD1 | LOD2 | faded out
export const BAND = 0.12; // cross-fade band (Bayer screen-door, see LODFade), share of the switch distance
/** Source: `( import.meta.env.BASE_URL || '/' ) + 'models/debris/'`. */
export const DEFAULT_BASE = '/models/debris/';

/** RGBA8 pixels of an image, top row first. */
export interface ScanPixels { data:Uint8Array; width:number; height:number }

// bytes of a file (fetch relative to the page). The headless test runner may provide a reader.
async function fetchBytes( url:string ) {

	const res = await fetch( url );
	if ( ! res.ok ) throw new Error( 'ScannedDebris: ' + url + ' ' + res.status );
	return res.arrayBuffer();

}

// RGBA8 pixels of an image (top row first). The headless test runner may provide a decoder.
async function fetchPixels( url:string ):Promise<ScanPixels> {

	const blob = await ( await fetch( url ) ).blob();
	const bmp = await createImageBitmap( blob );
	const cv = new OffscreenCanvas( bmp.width, bmp.height );
	const ctx = cv.getContext( '2d', { willReadFrequently: true } )!;
	ctx.drawImage( bmp, 0, 0 );
	const d = ctx.getImageData( 0, 0, bmp.width, bmp.height ).data;
	return { data: new Uint8Array( d.buffer, d.byteOffset, d.byteLength ), width: bmp.width, height: bmp.height };

}

/** One placed scan (DebrisPlacement output); matrix and radius are filled in by the constructor. */
export interface ScanInstance {
	asset:number;
	x:number; y:number; z:number;
	yaw:number; pitch?:number; roll?:number;
	sx:number; sy:number; sz:number;
	rnd:number;
	matrix?:Matrix4;
	radius?:number;
}

export interface ScannedDebrisOptions {
	gpu:ShoreTerrainGpu;
	instances:ScanInstance[];
	parent:{ add( o:Object3D ):unknown; remove( o:Object3D ):unknown };
	engine?:ShoreEngine;
	/** URL of the folder holding the GLBs and JPEGs (source: BASE_URL + 'models/debris/'). */
	base?:string;
	loadBytes?:( url:string ) => Promise<ArrayBuffer>;
	loadPixels?:( url:string ) => Promise<ScanPixels>;
	/** three.js material the meshes draw with (default: a MeshStandardMaterial stand-in). */
	material?:Material;
	/** Start loading in the constructor like the source (default true). */
	autoLoad?:boolean;
}

export interface ScanLevel { mesh:InstancedMesh; iData:InstancedBufferAttribute; tris:number }
type StaticVelocityMesh = InstancedMesh & { staticVelocity?:boolean };
type ScanMap = 'albedo' | 'normal' | 'arm';

// 2 x 2 atlas of four equal tiles (ScannedDebris._load)
export function packAtlas( tiles:readonly ScanPixels[] ) {

	const T = tiles[ 0 ]!.width;
	const data = new Uint8Array( T * 2 * T * 2 * 4 );
	tiles.forEach( ( t, k ) => {

		const ox = ( k % 2 ) * T, oy = Math.floor( k / 2 ) * T;
		for ( let y = 0; y < T; y ++ ) data.set( t.data.subarray( y * T * 4, ( y + 1 ) * T * 4 ), ( ( oy + y ) * T * 2 + ox ) * 4 );

	} );
	return { T, data };

}

// merged geometry per LOD: all assets, uvs moved into their atlas tile (ScannedDebris._load)
export function mergeScanLods( glbs:readonly { meshes:GlbMesh[] }[] ) {

	const lodGeos:BufferGeometry[] = [];
	for ( let l = 0; l < 3; l ++ ) {

		const pos:number[] = [], nor:number[] = [], uvs:number[] = [], asset:number[] = [], idx:number[] = [];
		glbs.forEach( ( g, k ) => {

			// (node transforms are already applied by parseGLB)
			const found = g.meshes.find( ( o ) => o.name.startsWith( 'LOD' + l ) );
			if ( ! found ) return;
			const geo = found.geometry;
			const P = geo.attributes.position!, N = geo.attributes.normal!, U = geo.attributes.uv!;
			const base = pos.length / 3;
			const ox = ( k % 2 ) * 0.5, oy = Math.floor( k / 2 ) * 0.5;
			for ( let i = 0; i < P.count; i ++ ) {

				pos.push( P.getX( i ), P.getY( i ), P.getZ( i ) );
				nor.push( N.getX( i ), N.getY( i ), N.getZ( i ) );
				const u = Math.min( 0.998, Math.max( 0.002, U.getX( i ) ) ), v = Math.min( 0.998, Math.max( 0.002, U.getY( i ) ) );
				uvs.push( u * 0.5 + ox, v * 0.5 + oy );
				asset.push( k );

			}

			const I = geo.index!;
			for ( let i = 0; i < I.count; i ++ ) idx.push( base + I.getX( i ) );

		} );
		const geo = new BufferGeometry();
		geo.setAttribute( 'position', new Float32BufferAttribute( pos, 3 ) );
		geo.setAttribute( 'normal', new Float32BufferAttribute( nor, 3 ) );
		geo.setAttribute( 'uv', new Float32BufferAttribute( uvs, 2 ) );
		geo.setAttribute( 'aAsset', new Float32BufferAttribute( asset, 1 ) );
		geo.setIndex( pos.length / 3 > 65535 ? new Uint32BufferAttribute( idx, 1 ) : new Uint16BufferAttribute( idx, 1 ) );
		lodGeos.push( geo );

	}

	return lodGeos;

}

export class ScannedDebris {

	gpu:ShoreTerrainGpu;
	instances:ScanInstance[];
	parent:ScannedDebrisOptions[ 'parent' ];
	engine:ShoreEngine;
	base:string;
	loadBytes:( url:string ) => Promise<ArrayBuffer>;
	loadPixels:( url:string ) => Promise<ScanPixels>;
	standIn:Material | undefined;
	meshes:InstancedMesh[];
	ready:boolean;
	textures?:Record<ScanMap, ShoreTexture>;
	materialSpec?:ShoreMaterial;
	material?:Material;
	levels:ScanLevel[];
	loadMs?:number;
	promise:Promise<void> | null;
	_lastCam:Vector3;
	_lastQuat:Quaternion;
	_frustum:Frustum;
	_m4:Matrix4;
	_sphere:Sphere;
	_v:Vector3;

	// instances: [ { asset, x, y, z, yaw, pitch, roll, sx, sy, sz, rnd } ]
	constructor( { gpu, instances, parent, engine = RECORDING_ENGINE, base = DEFAULT_BASE, loadBytes = fetchBytes, loadPixels = fetchPixels, material, autoLoad = true }:ScannedDebrisOptions ) {

		this.gpu = gpu;
		this.instances = instances;
		this.parent = parent;
		this.engine = engine;
		this.base = base;
		this.loadBytes = loadBytes;
		this.loadPixels = loadPixels;
		this.standIn = material;
		this.meshes = [];
		this.levels = [];
		this.ready = false;
		this._lastCam = new Vector3( 1e9, 0, 0 );
		this._lastQuat = new Quaternion();
		this._frustum = new Frustum();
		this._m4 = new Matrix4();
		this._sphere = new Sphere();
		this._v = new Vector3();
		for ( const r of instances ) {

			const q = new Quaternion().setFromEuler( new Euler( r.roll || 0, r.yaw, r.pitch || 0, 'YXZ' ) );
			r.matrix = new Matrix4().compose( new Vector3( r.x, r.y, r.z ), q, new Vector3( r.sx, r.sy, r.sz ) );
			const s = SCAN_SIZE[ r.asset ]!;
			r.radius = Math.hypot( s[ 0 ] * r.sx, s[ 1 ] * r.sy, s[ 2 ] * r.sz ) / 2;

		}

		this.promise = autoLoad ? this._load().catch( ( e ) => console.error( 'ScannedDebris: load failed', e ) ) : null;

	}

	async _load() {

		const t0 = performance.now();
		const BASE = this.base;
		const glbs = await Promise.all( SCAN_ASSETS.map( async ( id ) => parseGLB( await this.loadBytes( BASE + id + '.glb' ) ) ) );
		// 2 x 2 atlas per map
		const maps:ScanMap[] = [ 'albedo', 'normal', 'arm' ];
		const atlases:Partial<Record<ScanMap, ShoreTexture>> = {};
		await Promise.all( maps.map( async ( m ) => {

			const tiles = await Promise.all( SCAN_ASSETS.map( ( id ) => this.loadPixels( BASE + id + '_' + m + '.jpg' ) ) );
			const { T, data } = packAtlas( tiles );
			// sRGB albedo (decoded to linear by the sampler), linear normal / arm; trilinear +
			// anisotropic (smpAnisoClamp), full mip chain
			const tex = this.engine.texture( { label: 'debrisScan_' + m, width: T * 2, height: T * 2, format: m === 'albedo' ? 'rgba8unorm-srgb' : 'rgba8unorm', mips: true, usage: [ 'sample', 'copyDst' ], data } );
			tex.getGPU();
			this.engine.generateMipmaps( tex );
			atlases[ m ] = tex;

		} ) );
		this.textures = atlases as Record<ScanMap, ShoreTexture>;

		const lodGeos = mergeScanLods( glbs );

		this.materialSpec = this._createMaterial();
		const material = this.material = this.standIn ?? new MeshStandardMaterial( { name: 'DebrisScanned', roughness: 0.85, metalness: 0 } );
		const n = Math.max( 1, this.instances.length );
		this.levels = lodGeos.map( ( geo, l ) => {

			const iData = new InstancedBufferAttribute( new Float32Array( n * 4 ), 4 );
			iData.setUsage( DynamicDrawUsage );
			geo.setAttribute( 'iData', iData );
			const mesh:StaticVelocityMesh = new InstancedMesh( geo, material, n );
			mesh.name = 'debris-scan-lod' + l;
			mesh.count = 0;
			mesh.castShadow = l === 0;
			mesh.receiveShadow = true;
			mesh.frustumCulled = false;
			mesh.instanceMatrix.setUsage( DynamicDrawUsage );
			// (the TSL material used staticVelocityMRT)
			mesh.staticVelocity = true;
			this.parent.add( mesh );
			this.meshes.push( mesh );
			return { mesh, iData, tris: geo.index!.count / 3 };

		} );
		this.loadMs = performance.now() - t0;
		this.ready = true;
		this._lastCam.set( 1e9, 0, 0 );

	}

	_createMaterial() {

		const gpu = this.gpu;
		const A = this.textures!;
		const { commonModule, lodFadeModule } = this.engine;
		const mat = this.engine.standard( {
			name: 'DebrisScanned',
			roughness: 0.85, metalness: 0,
			underwaterLighting: 'lite',
			// the former TerrainLightingModel (heightfield sun shadow on the key light)
			modules: [ commonModule, lodFadeModule, gpu.module, gpu.sunModulationModule ],
			defines: { MATERIAL_SUN_MODULATION: 1 },
			appliesHillShadow: true, // (applied above: the lighting hook must not apply it again)
			textures: { scanAlbedo: A.albedo, scanNormal: A.normal, scanArm: A.arm },
			attributes: { aAsset: 'f32', iData: 'vec4f' }, // iData: asset, random, LOD fade, outgoing
			varyings: { vIData: 'vec4f' },
			// an instance keeps only its own asset's vertices (the rest collapse to a point); the
			// vertex stage runs in the shadow passes too (castShadowPositionNode = positionNode)
			vertex: /* wgsl */`
	if ( abs( v.aAsset - v.iData.x ) >= 0.5 ) { v.position = vec3f( 0.0 ); }
	o.vIData = v.iData;
`,
			surface: /* wgsl */`
	let iData = in.vs.vIData;
	let st = in.uv;
	let albedo = textureSample( scanAlbedo, smpAnisoClamp, st );
	let arm = textureSample( scanArm, smpAnisoClamp, st );
	let nmap = textureSample( scanNormal, smpAnisoClamp, st ).xyz * 2.0 - 1.0;
	let rnd = iData.y;
	let isWood = iData.x < 2.5;
	if ( ! lodFadeVisible( in.pixel, iData.z, iData.w > 0.5 ) ) { discard; }
	let p = in.P;
	var c = albedo.rgb;
	// driftwood: sun-bleached toward silver-grey, per instance
	let grey = vec3f( luminance( c ) ) * vec3f( 1.04, 1.02, 0.98 ) * 1.12;
	c = mix( c, grey, select( 0.0, rnd * 0.4 + 0.45, isWood ) );
	// ground contact: dusted with sand and darker where it touches / is buried
	let ground = terrainHeightAt( p.xz );
	let contact = 1.0 - smoothstep( 0.0, 0.1, p.y - ground );
	let sandy = smoothstep( 0.6, 1.6, ground );
	c = mix( c, ${ srgb( 0.8, 0.72, 0.58 ) }, contact * sandy * 0.45 );
	// wet below the swash line: darker (and glossier, see roughness)
	let wet = 1.0 - smoothstep( 0.4, 1.1, p.y );
	c = c * ( 1.0 - wet * 0.45 );
	s.albedo = c;
	s.roughness = mix( max( arm.g, 0.35 ), 0.22, wet * 0.85 );
	s.metalness = 0.0;
	let contactAO = 1.0 - smoothstep( 0.0, 0.12, p.y - ground );
	s.ao = sat( arm.r * ( 1.0 - contactAO * 0.4 ) );
	// tangent-space normal map (derivative TBN, as three's normalMap without tangents)
	s.normal = perturbNormalByMap( p, in.N, st, nmap );
`,
			// the LOD cross-fade discarded in the shadow pass too (three evaluated colorNode.a there)
			shadow: /* wgsl */`
	return lodFadeVisible( in.pixel, in.vs.vIData.z, in.vs.vIData.w > 0.5 );
`,
		} );
		return mat;

	}

	// LOD buckets + frustum / distance culling (only when the camera moved)
	update( camera:Camera ) {

		if ( ! this.ready ) return;
		const cam = camera.getWorldPosition( this._v );
		if ( cam.distanceToSquared( this._lastCam ) < 0.25 && camera.quaternion.equals( this._lastQuat ) ) return;
		this._lastCam.copy( cam );
		this._lastQuat.copy( camera.quaternion );
		camera.updateMatrixWorld();
		this._m4.multiplyMatrices( camera.projectionMatrix, camera.matrixWorldInverse );
		this._frustum.setFromProjectionMatrix( this._m4, camera.coordinateSystem, camera.reversedDepth );
		const counts = [ 0, 0, 0 ];
		for ( const r of this.instances ) {

			this._sphere.center.set( r.x, r.y, r.z );
			this._sphere.radius = r.radius! + 6; // shadow casters just outside the view
			if ( ! this._frustum.intersectsSphere( this._sphere ) ) continue;
			const d = Math.hypot( r.x - cam.x, r.y - cam.y, r.z - cam.z ) - r.radius! * 6;
			const [ a, b, c ] = LOD_DIST;
			const t01 = bandFade( d, a * ( 1 - BAND / 2 ), a * ( 1 + BAND / 2 ) );
			const t12 = bandFade( d, b * ( 1 - BAND / 2 ), b * ( 1 + BAND / 2 ) );
			const out = bandFade( d, c * ( 1 - BAND ), c );
			if ( out >= 1 ) continue;
			// ( level, fade, outgoing ): an instance is in two levels only inside a band
			if ( t01 < 1 ) this._put( 0, counts, r, t01, 1 );
			if ( t01 > 0 && t12 < 1 ) this._put( 1, counts, r, t12 > 0 ? t12 : t01, t12 > 0 ? 1 : 0 );
			if ( t12 > 0 ) this._put( 2, counts, r, t12 * ( 1 - out ), 0 );

		}

		this.levels.forEach( ( L, l ) => {

			L.mesh.count = counts[ l ]!;
			L.mesh.instanceMatrix.clearUpdateRanges();
			L.mesh.instanceMatrix.addUpdateRange( 0, Math.max( 1, counts[ l ]! ) * 16 );
			L.mesh.instanceMatrix.needsUpdate = true;
			L.iData.clearUpdateRanges();
			L.iData.addUpdateRange( 0, Math.max( 1, counts[ l ]! ) * 4 );
			L.iData.needsUpdate = true;

		} );

	}

	_put( l:number, counts:number[], r:ScanInstance, fade:number, outgoing:number ) {

		const L = this.levels[ l ]!;
		const i = counts[ l ]! ++;
		L.mesh.setMatrixAt( i, r.matrix! );
		( L.iData.array as Float32Array ).set( [ r.asset, r.rnd, fade, outgoing ], i * 4 );

	}

	get triangles() {

		if ( ! this.ready ) return 0;
		// each instance processes its LOD's merged geometry (other assets collapse)
		return this.levels.reduce( ( a, L ) => a + L.mesh.count * L.tris, 0 );

	}

	dispose() {

		for ( const m of this.meshes ) {

			m.geometry.dispose();
			this.parent.remove( m );

		}

		if ( this.materialSpec ) this.materialSpec.dispose();
		if ( this.material ) this.material.dispose();
		if ( this.textures ) for ( const k in this.textures ) this.textures[ k as ScanMap ].destroy();

	}

}
