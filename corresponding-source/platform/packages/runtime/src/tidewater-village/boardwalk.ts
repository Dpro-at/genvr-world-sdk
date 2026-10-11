/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
// Source: src/world/village/Boardwalk.js 1-185.
import { CatmullRomCurve3, Color, Vector3 } from 'three';
import { WOOD, pathLight } from './props.js';
import type { VillageContext } from './context.js';

// Raised timber boardwalk following a smooth curve over the terrain.
// pts: [[x, z], ...] world control points. Returns the sampled centerline (for layout checks).

const _v = new Vector3();
const _h = new Vector3();

export interface BoardwalkOptions { width?:number; lift?:number; startY?:number; lightEvery?:number }

export interface BoardwalkSample { p:Vector3; tan:Vector3; nx:number; nz:number; g:number; gLow:number; yaw:number }

export const BOARDWALK_WIDTH = 1.8;

export function buildBoardwalk( ctx:Omit<VillageContext, 'inst'>, pts:readonly ( readonly [number, number] )[], opts:BoardwalkOptions = {} ) {

	const { B, terrain, colliders, rand, lights, checks } = ctx;
	const width = opts.width ?? BOARDWALK_WIDTH;
	const lift = opts.lift ?? 0.26;
	const curve = new CatmullRomCurve3( pts.map( ( p ) => new Vector3( p[ 0 ], 0, p[ 1 ] ) ), false, 'centripetal' );
	const L = curve.getLength();
	const pitch = 0.2;
	const n = Math.floor( L / pitch );

	const S:BoardwalkSample[] = [];
	for ( let i = 0; i <= n; i ++ ) {

		const t = i / n;
		const p = curve.getPointAt( t );
		const tan = curve.getTangentAt( t );
		tan.y = 0;
		tan.normalize();
		const nx = - tan.z, nz = tan.x;
		let g = - Infinity, gLow = Infinity;
		for ( const o of [ - width / 2 - 0.1, - width / 4, 0, width / 4, width / 2 + 0.1 ] ) {

			const h = terrain.heightAt( p.x + nx * o, p.z + nz * o );
			g = Math.max( g, h );
			gLow = Math.min( gLow, h );

		}

		S.push( { p, tan, nx, nz, g, gLow, yaw: Math.atan2( tan.x, tan.z ) } );

	}

	const s = ( i:number ) => S[ i ]!;

	// deck profile: local max of the ground, smoothed, never closer than 12 cm to the ground
	const raw = S.map( ( _s, i ) => {

		let m = - Infinity;
		for ( let k = Math.max( 0, i - 4 ); k <= Math.min( n, i + 4 ); k ++ ) m = Math.max( m, s( k ).g );
		return m + lift;

	} );
	let deck = raw.slice();
	for ( let pass = 0; pass < 3; pass ++ ) {

		const nd = deck.slice();
		for ( let i = 0; i <= n; i ++ ) {

			let sum = 0, c = 0;
			for ( let k = Math.max( 0, i - 6 ); k <= Math.min( n, i + 6 ); k ++ ) {

				sum += deck[ k ]!;
				c ++;

			}

			nd[ i ] = Math.max( sum / c, s( i ).g + 0.12 );

		}

		deck = nd;

	}

	if ( opts.startY !== undefined ) {

		for ( let i = 0; i <= Math.min( n, 12 ); i ++ ) {

			const k = i / 12;
			deck[ i ] = Math.max( s( i ).g + 0.1, opts.startY * ( 1 - k ) + deck[ i ]! * k );

		}

	}

	const dk = ( i:number ) => deck[ i ]!;

	// planks
	for ( let i = 0; i <= n; i ++ ) {

		const si = s( i );
		const a = dk( Math.max( 0, i - 1 ) ), b = dk( Math.min( n, i + 1 ) );
		const slope = ( b - a ) / ( pitch * ( Math.min( n, i + 1 ) - Math.max( 0, i - 1 ) ) );
		const newer = rand.chance( 0.05 );
		B.box( 'wood', si.p.x + rand.range( - 0.02, 0.02 ) * si.nx, dk( i ) - 0.021 - rand.range( 0, 0.005 ), si.p.z + rand.range( - 0.02, 0.02 ) * si.nz, width + rand.range( - 0.04, 0.03 ), 0.042, 0.182, {
			grain: 0, skip: 8, ry: si.yaw + rand.range( - 0.01, 0.01 ), rx: - Math.atan( slope ),
			tint: newer ? [ 1.06, 1.0, 0.93 ] : ( ( k:number, w:number ) => [ k * ( 1 + w ), k, k * ( 1 - w ) ] )( rand.range( 0.86, 1.08 ), rand.range( - 0.01, 0.04 ) ),
			data: WOOD( rand.next(), newer ? 0.35 : rand.range( 0.6, 1.0 ), 0, 7 ),
		} );

	}

	// stringers + posts
	const seg = 6; // samples per stringer piece (1.2 m)
	for ( let i = 0; i < n; i += seg ) {

		const j = Math.min( n, i + seg );
		for ( const o of [ - width / 2 + 0.18, width / 2 - 0.18 ] ) {

			const a = s( i ), b = s( j );
			B.beam( 'wood', [ a.p.x + a.nx * o, dk( i ) - 0.042 - 0.07, a.p.z + a.nz * o ], [ b.p.x + b.nx * o, dk( j ) - 0.042 - 0.07, b.p.z + b.nz * o ], 0.08, 0.14, { extend: 0.06, data: WOOD( rand.next(), 0.85 ) } );

		}

	}

	for ( let i = 0; i <= n; i += 9 ) {

		const si = s( i );
		for ( const o of [ - width / 2 + 0.18, width / 2 - 0.18 ] ) {

			const px = si.p.x + si.nx * o, pz = si.p.z + si.nz * o;
			const g = terrain.heightAt( px, pz );
			const top = dk( i ) - 0.18;
			if ( top - g > - 0.05 ) {

				B.box( 'wood', px, ( top + g - 0.3 ) / 2, pz, 0.11, top - g + 0.3, 0.11, { grain: 1, ry: si.yaw, data: WOOD( rand.next(), 0.9 ) } );
				checks.push( { x: px, y: g - 0.3, z: pz } );

			}

		}

	}

	// edge kick boards for a finished look
	for ( let i = 0; i < n; i += seg ) {

		const j = Math.min( n, i + seg );
		for ( const sgn of [ - 1, 1 ] ) {

			const o = sgn * ( width / 2 + 0.01 );
			const a = s( i ), b = s( j );
			B.beam( 'wood', [ a.p.x + a.nx * o, dk( i ) - 0.1, a.p.z + a.nz * o ], [ b.p.x + b.nx * o, dk( j ) - 0.1, b.p.z + b.nz * o ], 0.03, 0.12, { extend: 0.03, data: WOOD( rand.next(), 0.8 ) } );

		}

	}

	// walkable colliders (1 m long pieces)
	const cs = 5;
	for ( let i = 0; i < n; i += cs ) {

		const j = Math.min( n, i + cs );
		const a = s( i ), b = s( j );
		let top = - Infinity, gl = Infinity;
		for ( let k = i; k <= j; k ++ ) {

			top = Math.max( top, dk( k ) );
			gl = Math.min( gl, s( k ).gLow );

		}

		const cx = ( a.p.x + b.p.x ) / 2, cz = ( a.p.z + b.p.z ) / 2;
		const len = Math.hypot( b.p.x - a.p.x, b.p.z - a.p.z );
		const bot = gl - 0.3;
		colliders.addBox( _v.set( cx, ( top + bot ) / 2, cz ), _h.set( width / 2, ( top - bot ) / 2, len / 2 + 0.02 ), Math.atan2( b.p.x - a.p.x, b.p.z - a.p.z ), { walkable: true, solid: true, tag: 'boardwalk' } );

	}

	// path lights
	const every = opts.lightEvery ?? 60;
	let side = 1;
	for ( let i = Math.floor( every * 0.4 ); i < n - 10; i += every ) {

		const si = s( i );
		const o = side * ( width / 2 + 0.2 );
		const px = si.p.x + si.nx * o, pz = si.p.z + si.nz * o;
		const g = terrain.heightAt( px, pz );
		const w = pathLight( B, px, g - 0.25, pz, rand.next() );
		lights.push( { position: w, color: new Color( 1.0, 0.7, 0.4 ), intensity: 2.5, kind: 'pathLight' } );
		colliders.addCylinder( px, pz, 0.1, g - 0.25, g + 0.95, { tag: 'pathLight' } );
		checks.push( { x: px, y: g - 0.25, z: pz } );
		side = - side;

	}

	return { samples: S, deck, length: L, width };

}
