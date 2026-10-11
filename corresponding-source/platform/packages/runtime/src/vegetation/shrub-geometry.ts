/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
// Source: src/world/vegetation/PlantGeometry.js 473-480 and 771-870 (shrub, crown variant table,
// CPU variant copy for the impostor bake, merged tree + shrub canopy).
import * as THREE from 'three';
import { GeoBuilder } from './geometry-builder.js';
import {
	TREE_LOBES, TREE_VARIANTS, addBranch, buildTreeNear, emitCards, lobeCards, mulberry32,
	type CardSpec, type Lobe,
} from './forest-tree-geometry.js';

export const SHRUB_H = 1.6;
export const SHRUB_LOBES:readonly Lobe[] = [
	[ 0.0, 0.85, 0.0, 0.8 ],
	[ 0.75, 0.6, 0.35, 0.6 ],
	[ - 0.6, 0.55, 0.55, 0.6 ],
	[ - 0.25, 0.65, - 0.75, 0.62 ],
	[ 0.35, 1.25, - 0.25, 0.48 ],
];
export const SHRUB_VARIANTS = 2;

// Shrub: a few leafy lobes on short stems. Canopy parts (aMat.x): 4 shrub leaf-cluster card,
// 5 shrub stem (bark of a shrub).
export function buildShrubNear( seed = 31, b = new GeoBuilder() ) {

	const rand = mulberry32( seed );
	const crownC = new THREE.Vector3( 0, 0.7, 0 );
	const crownR = new THREE.Vector3( 1.1, 0.75, 1.1 );
	const flex = ( p:THREE.Vector3 ) => Math.min( 1, p.y / 1.3 );
	// a few bare stems at the foot
	for ( let i = 0; i < 3; i ++ ) {

		const L = SHRUB_LOBES[ i + 1 ]!;
		addBranch( b, new THREE.Vector3( 0, - 0.1, 0 ), new THREE.Vector3( L[ 0 ] * 0.6, L[ 1 ] * 0.7, L[ 2 ] * 0.6 ), 0.035, 0.015, 3, 1, [ 5, 0, 0, 0 ], SHRUB_H, flex );

	}

	const cards:CardSpec[] = [];
	SHRUB_LOBES.forEach( ( L, i ) => cards.push( ...lobeCards( L, i, {
		count: Math.round( 15 * L[ 3 ] ), size: 0.85, crownC, crownR, rand, flexFn: flex, hScale: SHRUB_H, part: 4, flatten: 0.8,
	} ) ) );
	emitCards( b, cards, crownC );

	return { geometry: b.build( 2.2, new THREE.Vector3( 0, 0.7, 0 ) ), triangles: b.triangles };

}

// Per-variant lobe scales (0 = dropped), generated once: trees 3 variants x 8 lobes, then shrubs
// 2 variants x 8 lobes. The near canopy (vertex shader) and the impostor bake read the same table.
// Row offset of a variant = variant * 8; shrub variants start at TREE_VARIANTS * 8.
export const LOBE_TABLE = ( () => {

	const rand = mulberry32( 4711 );
	const t = new Float32Array( ( TREE_VARIANTS + SHRUB_VARIANTS ) * 8 );
	for ( let v = 0; v < TREE_VARIANTS + SHRUB_VARIANTS; v ++ ) {

		const shrub = v >= TREE_VARIANTS;
		const n = shrub ? SHRUB_LOBES.length : TREE_LOBES.length;
		let dropped = 0;
		for ( let k = 0; k < 8; k ++ ) {

			if ( k >= n ) continue;
			const drop = k >= 2 && rand() < 0.3 && dropped < ( shrub ? 1 : 3 );
			if ( drop ) dropped ++;
			t[ v * 8 + k ] = drop ? 0 : 0.74 + 0.44 * rand();

		}

	}

	return t;

} )();

// Copy of a lobed geometry with the lobe scales of one variant applied on the CPU (for the bake).
// The copy shares the index of `geometry`; the input buffers are not changed.
export function lobeVariantGeometry( geometry:THREE.BufferGeometry, table:ArrayLike<number>, offset:number ) {

	const pos = geometry.attributes.position as THREE.InterleavedBufferAttribute;
	const lobe = geometry.attributes.aLobe as THREE.InterleavedBufferAttribute;
	const src = pos.data.array as Float32Array;
	const stride = pos.data.stride;
	const data = new Float32Array( src );
	for ( let i = 0; i < pos.count; i ++ ) {

		const o = i * stride;
		const id = src[ o + lobe.offset + 3 ]!;
		if ( id < 0 ) continue;
		const k = 1 - table[ offset + id ]!;
		for ( let c = 0; c < 3; c ++ ) data[ o + pos.offset + c ] = data[ o + pos.offset + c ]! + src[ o + lobe.offset + c ]! * k;

	}

	const ib = new THREE.InterleavedBuffer( data, stride );
	const g = new THREE.BufferGeometry();
	for ( const name of Object.keys( geometry.attributes ) ) {

		const a = geometry.attributes[ name ] as THREE.InterleavedBufferAttribute;
		g.setAttribute( name, new THREE.InterleavedBufferAttribute( ib, a.itemSize, a.offset ) );

	}

	g.setIndex( geometry.index );
	g.boundingSphere = geometry.boundingSphere!.clone();
	return g;

}

// Merged near geometry of trees + shrubs (one draw call): the vertex shader keeps the tree parts
// (0, 1) for tree instances and the shrub parts (4, 5) for shrub instances.
export function buildCanopyNear() {

	const b = new GeoBuilder();
	// the source keeps the intermediate geometries built by the shared builder; they are unused,
	// so they are disposed here (CPU-only, never uploaded)
	buildTreeNear( 21, b ).geometry.dispose();
	const trees = b.triangles;
	buildShrubNear( 31, b ).geometry.dispose();
	return { geometry: b.build( 14, new THREE.Vector3( 0, 6.5, 0 ) ), triangles: b.triangles, treeTriangles: trees, shrubTriangles: b.triangles - trees };

}
