/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
// Source: src/world/debris/GLB.js 1-136 (minimal .glb reader of the scanned debris). Pure CPU; the tests
// parse the source repository's four debris GLBs (read in place, never copied) with both sides.
// Genvr already loads glTF with three's GLTFLoader (runtime/src/gltf.ts); this port exists so the
// ScannedDebris port stays 1:1 and is only needed if the debris keeps the source's packed LOD layout.
import { BufferGeometry, BufferAttribute, Matrix4, Matrix3, Vector3, Quaternion } from 'three';

// Minimal binary glTF (.glb) reader for the photoscanned debris (replaces three's GLTFLoader):
// JSON chunk + BIN chunk -> one engine BufferGeometry per mesh node, with the node's world
// transform applied (positions, normals). Handles POSITION / NORMAL / TEXCOORD_0 and the index
// accessor (float / normalized or plain 8 / 16 / 32-bit components, interleaved buffer views).
// Not handled (not used by the assets): Draco / meshopt / quantization extensions, skins, morph
// targets, sparse accessors, embedded images (the textures ship as separate JPEGs), materials.
//
//   parseGLB( arrayBuffer ) -> { meshes: [ { name, geometry } ], json }

type ComponentType = 5120 | 5121 | 5122 | 5123 | 5125 | 5126;
type GlbArray = Int8Array | Uint8Array | Int16Array | Uint16Array | Uint32Array | Float32Array;
interface GlbArrayType {
	new ( length:number ):GlbArray;
	new ( buffer:ArrayBufferLike, byteOffset:number, length:number ):GlbArray;
	readonly BYTES_PER_ELEMENT:number;
}

export interface GlbJson {
	extensionsRequired?:string[];
	accessors:{ type:keyof typeof COMPONENTS; componentType:ComponentType; count:number; bufferView?:number; byteOffset?:number; normalized?:boolean }[];
	bufferViews:{ buffer:number; byteOffset?:number; byteStride?:number }[];
	nodes:{ name?:string; mesh?:number; matrix?:number[]; translation?:[number, number, number]; rotation?:[number, number, number, number]; scale?:[number, number, number]; children?:number[] }[];
	meshes:{ name?:string; primitives:{ mode?:number; attributes:{ POSITION?:number; NORMAL?:number; TEXCOORD_0?:number }; indices?:number }[] }[];
	scenes?:{ nodes:number[] }[];
	scene?:number;
}

export interface GlbMesh { name:string; geometry:BufferGeometry }

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const ARRAYS:Record<ComponentType, GlbArrayType> = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NORM:Record<ComponentType, number> = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535, 5125: 1, 5126: 1 };

export function parseGLB( buffer:ArrayBuffer ) {

	const dv = new DataView( buffer );
	if ( dv.getUint32( 0, true ) !== 0x46546C67 ) throw new Error( 'GLB: bad magic' );
	const length = dv.getUint32( 8, true );
	let json:GlbJson | null = null, bin:Uint8Array | null = null;
	for ( let o = 12; o < length; ) {

		const len = dv.getUint32( o, true ), type = dv.getUint32( o + 4, true );
		if ( type === 0x4E4F534A ) json = JSON.parse( new TextDecoder().decode( new Uint8Array( buffer, o + 8, len ) ) ) as GlbJson;
		else if ( type === 0x004E4942 ) bin = new Uint8Array( buffer, o + 8, len );
		o += 8 + len;

	}

	if ( ! json ) throw new Error( 'GLB: no JSON chunk' );
	const J:GlbJson = json;
	if ( J.extensionsRequired && J.extensionsRequired.length ) throw new Error( 'GLB: unsupported extensions ' + J.extensionsRequired.join( ', ' ) );

	// accessor -> tightly packed typed array (+ item size, normalized)
	const read = ( i:number ):{ array:GlbArray; itemSize:number; normalized?:boolean; componentType?:ComponentType } => {

		const a = J.accessors[ i ]!;
		const n = COMPONENTS[ a.type ];
		const Arr = ARRAYS[ a.componentType ];
		const out = new Arr( a.count * n );
		if ( a.bufferView === undefined ) return { array: out, itemSize: n };
		const bv = J.bufferViews[ a.bufferView ]!;
		if ( bv.buffer !== 0 || ! bin ) throw new Error( 'GLB: external buffers are not supported' );
		const base = bin.byteOffset + ( bv.byteOffset || 0 ) + ( a.byteOffset || 0 );
		const stride = bv.byteStride || n * Arr.BYTES_PER_ELEMENT;
		if ( stride === n * Arr.BYTES_PER_ELEMENT && base % Arr.BYTES_PER_ELEMENT === 0 ) {

			out.set( new Arr( bin.buffer, base, a.count * n ) );

		} else {

			const src = new DataView( bin.buffer );
			const get = {
				5120: ( o:number ) => src.getInt8( o ), 5121: ( o:number ) => src.getUint8( o ), 5122: ( o:number ) => src.getInt16( o, true ),
				5123: ( o:number ) => src.getUint16( o, true ), 5125: ( o:number ) => src.getUint32( o, true ), 5126: ( o:number ) => src.getFloat32( o, true ),
			}[ a.componentType ];
			for ( let k = 0; k < a.count; k ++ ) for ( let c = 0; c < n; c ++ ) out[ k * n + c ] = get( base + k * stride + c * Arr.BYTES_PER_ELEMENT );

		}

		return { array: out, itemSize: n, normalized: !! a.normalized, componentType: a.componentType };

	};

	// float attribute (normalized integers are expanded, as three does for its attributes)
	const floats = ( i:number ) => {

		const r = read( i );
		if ( r.array instanceof Float32Array ) return r as { array:Float32Array; itemSize:number };
		const f = new Float32Array( r.array.length );
		const k = r.normalized ? 1 / NORM[ r.componentType! ] : 1;
		for ( let j = 0; j < f.length; j ++ ) f[ j ] = r.array[ j ]! * k;
		return { array: f, itemSize: r.itemSize };

	};

	const meshes:GlbMesh[] = [];
	const nodeMatrix = ( node:GlbJson[ 'nodes' ][ number ] ) => {

		const m = new Matrix4();
		if ( node.matrix ) return m.fromArray( node.matrix );
		const t = node.translation || [ 0, 0, 0 ], r = node.rotation || [ 0, 0, 0, 1 ], s = node.scale || [ 1, 1, 1 ];
		return m.compose( new Vector3( ...t ), new Quaternion( ...r ), new Vector3( ...s ) );

	};

	const visit = ( ni:number, parent:Matrix4 ) => {

		const node = J.nodes[ ni ]!;
		const world = new Matrix4().multiplyMatrices( parent, nodeMatrix( node ) );
		if ( node.mesh !== undefined ) {

			const mesh = J.meshes[ node.mesh ]!;
			const nm = new Matrix3().getNormalMatrix( world );
			mesh.primitives.forEach( ( prim, pi ) => {

				if ( prim.mode !== undefined && prim.mode !== 4 ) return; // triangles only
				const g = new BufferGeometry();
				const at = prim.attributes;
				if ( at.POSITION !== undefined ) {

					const p = floats( at.POSITION );
					g.setAttribute( 'position', new BufferAttribute( p.array, 3 ).applyMatrix4( world ) );

				}

				if ( at.NORMAL !== undefined ) {

					const nr = floats( at.NORMAL );
					g.setAttribute( 'normal', new BufferAttribute( nr.array, 3 ).applyNormalMatrix( nm ) );

				}

				if ( at.TEXCOORD_0 !== undefined ) g.setAttribute( 'uv', new BufferAttribute( floats( at.TEXCOORD_0 ).array, 2 ) );
				if ( prim.indices !== undefined ) {

					const ix = read( prim.indices ).array;
					g.setIndex( new BufferAttribute( ix instanceof Uint8Array ? new Uint16Array( ix ) : ix, 1 ) );

				}

				meshes.push( { name: node.name || mesh.name || 'mesh' + node.mesh + ( pi ? '_' + pi : '' ), geometry: g } );

			} );

		}

		for ( const c of node.children || [] ) visit( c, world );

	};

	const scene = J.scenes ? J.scenes[ J.scene || 0 ]! : { nodes: J.nodes.map( ( _, i ) => i ) };
	for ( const ni of scene.nodes ) visit( ni, new Matrix4() );
	return { meshes, json: J };

}
