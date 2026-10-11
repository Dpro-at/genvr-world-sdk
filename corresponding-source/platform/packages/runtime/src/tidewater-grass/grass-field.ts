/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
// Source: src/world/vegetation/GrassField.js 400-625 (`GrassField`): height / mask textures, per-cell
// occupancy and height range, the three patch levels with their instance buffers, and `update(camera)`
// (camera-move skip, frustum test, nearest-point distance, near / mid / far assignment with caps).
//
// Engine parts are injected (the source draws with its own WebGPU engine): textures through a
// `GrassTextureFactory` (default: `RecordedGrassTexture`, keeps the options and the uploads) and the
// material through a `GrassMaterialFactory` (default: the three.js stand-in of grass-material.ts). The
// placement, size, wind and LOD fades of every blade happen in the WGSL vertex stage, which has no
// TSL port yet: the meshes are correct instanced geometry with correct per-cell instance data, but
// drawn with the stand-in they would show the patch at the cell corner without terrain height.
import { Box3, DynamicDrawUsage, Frustum, InstancedBufferAttribute, Matrix4, Mesh, type CoordinateSystem, type InstancedBufferGeometry, type Material } from 'three';
import { CELL, MAX_FAR, MAX_MID, MAX_NEAR, R_FAR, R_MID, R_NEAR, buildPatch, clumpParams } from './grass-patch.js';
import { grassMaterialOptions, standInGrassMaterial, type GrassMaterialFactory, type GrassWgslModule } from './grass-material.js';

/** The terrain grid the field reads (source TerrainData: square, `res` x `res` heights). */
export interface GrassTerrain {
	res:number;
	size:number;
	texel:number;
	origin:number;
	heights:Float32Array;
}

/** RGBA8 density mask over the terrain (grass-mask.ts `buildGrassMask`). */
export interface GrassMask { data:Uint8Array; res:number }

export interface GrassTextureOptions {
	label:string;
	width:number;
	height:number;
	format:'r32float' | 'rgba8unorm';
	data:Float32Array | Uint8Array;
	sampler?:'linearClamp';
}
export interface GrassTexture {
	upload( data:Float32Array | Uint8Array ):void;
	destroy():void;
}
export type GrassTextureFactory = ( options:GrassTextureOptions ) => GrassTexture;

/** Default texture: records the options and every upload; no GPU. */
export class RecordedGrassTexture implements GrassTexture {

	options:GrassTextureOptions;
	uploads:( Float32Array | Uint8Array )[] = [];
	destroyed = false;
	constructor( options:GrassTextureOptions ) {

		this.options = options;

	}

	upload( data:Float32Array | Uint8Array ) {

		this.uploads.push( data );

	}

	destroy() {

		this.destroyed = true;

	}

}
export const recordGrassTexture:GrassTextureFactory = ( options ) => new RecordedGrassTexture( options );

/** The camera fields `update` reads (three.js Camera). */
export interface GrassCamera {
	matrixWorld:Matrix4;
	matrixWorldInverse:Matrix4;
	projectionMatrix:Matrix4;
	coordinateSystem:CoordinateSystem;
	reversedDepth?:boolean;
}

export interface GrassLevelMesh {
	mesh:Mesh;
	geometry:InstancedBufferGeometry;
	attr:InstancedBufferAttribute;
	arr:Float32Array;
	max:number;
	count:number;
}

export interface GrassFieldOptions {
	terrain:GrassTerrain;
	mask:GrassMask;
	textures?:GrassTextureFactory;
	material?:GrassMaterialFactory;
	/** The source's `vegModule` (wind, hashes, detail texture); default a named placeholder. */
	vegModule?:GrassWgslModule;
}

export class GrassField {

	terrain:GrassTerrain;
	heightTex:GrassTexture & { needsUpdate?:boolean };
	maskTex:GrassTexture;
	cellsPerSide:number;
	cellFlags:Uint8Array;
	cellMinY:Float32Array;
	cellMaxY:Float32Array;
	material:Material;
	patchTris:number[];
	levels:GrassLevelMesh[];
	meshes:Mesh[];
	_frustum:Frustum;
	_mat:Matrix4;
	_box:Box3;
	_last:Float64Array;

	constructor( { terrain, mask, textures = recordGrassTexture, material = standInGrassMaterial, vegModule }:GrassFieldOptions ) {

		this.terrain = terrain;
		const res = terrain.res;
		const maskData = mask.data, mres = mask.res;

		// terrain heights (float, loaded + bilinearly filtered manually) and density mask
		this.heightTex = textures( { label: 'grassHeights', width: res, height: res, format: 'r32float', data: terrain.heights } );
		// three-style handle: `heightTex.needsUpdate = true` re-uploads terrain.heights (Vegetation.refreshTerrain)
		Object.defineProperty( this.heightTex, 'needsUpdate', { set: ( v ) => {

			if ( v ) this.heightTex.upload( terrain.heights );

		} } );
		this.maskTex = textures( { label: 'grassMask', width: mres, height: mres, format: 'rgba8unorm', data: maskData, sampler: 'linearClamp' } );

		// per-cell occupancy + height range (for skipping empty cells and frustum tests)
		const cellsPerSide = Math.ceil( terrain.size / CELL );
		this.cellsPerSide = cellsPerSide;
		this.cellFlags = new Uint8Array( cellsPerSide * cellsPerSide );
		this.cellMinY = new Float32Array( cellsPerSide * cellsPerSide );
		this.cellMaxY = new Float32Array( cellsPerSide * cellsPerSide );
		const mpc = CELL / ( terrain.size / mres ); // mask texels per cell
		const hpc = CELL / terrain.texel; // height texels per cell
		for ( let cj = 0; cj < cellsPerSide; cj ++ ) {

			for ( let ci = 0; ci < cellsPerSide; ci ++ ) {

				let any = 0, mn = Infinity, mx = - Infinity;
				const i0 = Math.max( 0, Math.floor( ci * mpc ) - 1 ), i1 = Math.min( mres - 1, Math.ceil( ( ci + 1 ) * mpc ) + 1 );
				const j0 = Math.max( 0, Math.floor( cj * mpc ) - 1 ), j1 = Math.min( mres - 1, Math.ceil( ( cj + 1 ) * mpc ) + 1 );
				for ( let j = j0; j <= j1 && ! any; j ++ ) for ( let i = i0; i <= i1; i ++ ) {

					const o = ( j * mres + i ) * 4;
					if ( maskData[ o ]! > 8 || maskData[ o + 1 ]! > 8 || maskData[ o + 2 ]! > 8 || maskData[ o + 3 ]! > 8 ) {

						any = 1;
						break;

					}

				}

				const c = cj * cellsPerSide + ci;
				this.cellFlags[ c ] = any;
				if ( ! any ) continue;
				const hi0 = Math.max( 0, Math.floor( ci * hpc ) - 1 ), hi1 = Math.min( res - 1, Math.ceil( ( ci + 1 ) * hpc ) + 1 );
				const hj0 = Math.max( 0, Math.floor( cj * hpc ) - 1 ), hj1 = Math.min( res - 1, Math.ceil( ( cj + 1 ) * hpc ) + 1 );
				for ( let j = hj0; j <= hj1; j ++ ) for ( let i = hi0; i <= hi1; i ++ ) {

					const h = terrain.heights[ j * res + i ]!;
					if ( h < mn ) mn = h;
					if ( h > mx ) mx = h;

				}

				this.cellMinY[ c ] = mn;
				this.cellMaxY[ c ] = mx;

			}

		}

		this.material = material( grassMaterialOptions( this, vegModule ) );

		const clumps = clumpParams( 7 );
		const patches = [ buildPatch( 0, clumps ), buildPatch( 1, clumps ), buildPatch( 2, clumps ) ] as const;
		this.patchTris = patches.map( ( p ) => p.triangles );
		this.levels = [
			this._createMesh( patches[ 0 ].build(), MAX_NEAR, 'veg-grass-near' ),
			this._createMesh( patches[ 1 ].build(), MAX_MID, 'veg-grass-mid' ),
			this._createMesh( patches[ 2 ].build(), MAX_FAR, 'veg-grass-far' ),
		];
		this.meshes = this.levels.map( ( l ) => l.mesh );

		this._frustum = new Frustum();
		this._mat = new Matrix4();
		this._box = new Box3();
		this._last = new Float64Array( 8 ).fill( NaN );

	}

	// back-compat accessors (stats)
	get near() {

		return this.levels[ 0 ]!;

	}

	get far() {

		return this.levels[ 2 ]!;

	}

	get nearTris() {

		return this.patchTris[ 0 ]!;

	}

	get farTris() {

		return this.patchTris[ 2 ]!;

	}

	_createMesh( geometry:InstancedBufferGeometry, max:number, name:string ):GrassLevelMesh {

		const arr = new Float32Array( max * 4 );
		const attr = new InstancedBufferAttribute( arr, 4 );
		attr.setUsage( DynamicDrawUsage );
		geometry.setAttribute( 'iCell', attr );
		geometry.instanceCount = 0;
		const mesh = new Mesh( geometry, this.material );
		mesh.name = name;
		mesh.frustumCulled = false;
		mesh.castShadow = false;
		mesh.receiveShadow = true;
		mesh.matrixAutoUpdate = false;
		return { mesh, geometry, attr, arr, max, count: 0 };

	}

	// Recompute visible cells (cheap; skipped when the camera did not change).
	update( camera:GrassCamera ):boolean {

		// skip when the camera has not moved / turned noticeably
		const e = camera.matrixWorld.elements;
		const L = this._last;
		const pe = camera.projectionMatrix.elements;
		if ( Math.abs( e[ 12 ]! - L[ 0 ]! ) < 0.05 && Math.abs( e[ 13 ]! - L[ 1 ]! ) < 0.05 && Math.abs( e[ 14 ]! - L[ 2 ]! ) < 0.05 &&
			Math.abs( e[ 8 ]! - L[ 3 ]! ) < 1e-3 && Math.abs( e[ 9 ]! - L[ 4 ]! ) < 1e-3 && Math.abs( e[ 10 ]! - L[ 5 ]! ) < 1e-3 &&
			pe[ 0 ] === L[ 6 ] && pe[ 5 ] === L[ 7 ] ) return false;
		L[ 0 ] = e[ 12 ]!; L[ 1 ] = e[ 13 ]!; L[ 2 ] = e[ 14 ]!;
		L[ 3 ] = e[ 8 ]!; L[ 4 ] = e[ 9 ]!; L[ 5 ] = e[ 10 ]!;
		L[ 6 ] = pe[ 0 ]!; L[ 7 ] = pe[ 5 ]!;

		this._mat.multiplyMatrices( camera.projectionMatrix, camera.matrixWorldInverse );
		this._frustum.setFromProjectionMatrix( this._mat, camera.coordinateSystem, camera.reversedDepth ?? false );

		const cx = e[ 12 ]!, cz = e[ 14 ]!;
		const t = this.terrain;
		const n = this.cellsPerSide;
		const i0 = Math.max( 0, Math.floor( ( cx - R_FAR - t.origin ) / CELL ) ), i1 = Math.min( n - 1, Math.floor( ( cx + R_FAR - t.origin ) / CELL ) );
		const j0 = Math.max( 0, Math.floor( ( cz - R_FAR - t.origin ) / CELL ) ), j1 = Math.min( n - 1, Math.floor( ( cz + R_FAR - t.origin ) / CELL ) );
		const [ near, mid, far ] = this.levels as [ GrassLevelMesh, GrassLevelMesh, GrassLevelMesh ];
		let nc = 0, mc = 0, fc = 0;

		for ( let j = j0; j <= j1; j ++ ) {

			for ( let i = i0; i <= i1; i ++ ) {

				const c = j * n + i;
				if ( ! this.cellFlags[ c ] ) continue;
				const x0 = t.origin + i * CELL, z0 = t.origin + j * CELL;
				// nearest point of the cell (horizontal, like the shader's LOD distance)
				const dx = Math.max( x0 - cx, 0, cx - x0 - CELL );
				const dz = Math.max( z0 - cz, 0, cz - z0 - CELL );
				const d = Math.hypot( dx, dz );
				if ( d > R_FAR ) continue;
				this._box.min.set( x0, this.cellMinY[ c ]! - 0.5, z0 );
				this._box.max.set( x0 + CELL, this.cellMaxY[ c ]! + 1.8, z0 + CELL );
				if ( ! this._frustum.intersectsBox( this._box ) ) continue;
				if ( d < R_NEAR && nc < near.max ) {

					near.arr[ nc * 4 ] = x0;
					near.arr[ nc * 4 + 1 ] = z0;
					nc ++;

				} else if ( d < R_MID && mc < mid.max ) {

					mid.arr[ mc * 4 ] = x0;
					mid.arr[ mc * 4 + 1 ] = z0;
					mc ++;

				} else if ( d >= R_MID && fc < far.max ) {

					far.arr[ fc * 4 ] = x0;
					far.arr[ fc * 4 + 1 ] = z0;
					fc ++;

				}

			}

		}

		for ( const [ lvl, count ] of [ [ near, nc ], [ mid, mc ], [ far, fc ] ] as const ) {

			lvl.count = count;
			lvl.geometry.instanceCount = count;
			lvl.attr.clearUpdateRanges();
			lvl.attr.addUpdateRange( 0, Math.max( 1, count ) * 4 );
			lvl.attr.needsUpdate = true;

		}

		return true;

	}

	get triangles() {

		return this.levels.reduce( ( a, l, k ) => a + l.count * this.patchTris[ k ]!, 0 );

	}

	dispose() {

		this.heightTex.destroy();
		this.maskTex.destroy();
		this.material.dispose();
		for ( const m of this.meshes ) m.geometry.dispose();

	}

}
