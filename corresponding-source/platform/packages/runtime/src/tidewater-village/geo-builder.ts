/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
// Source: src/world/village/GeoBuilder.js 1-902 (village procedural geometry toolkit).
// Operation order, cache keys and float expressions follow the source exactly (bit-exact parity test).
import { BufferGeometry, Euler, Float32BufferAttribute, Matrix3, Matrix4, Quaternion, Uint16BufferAttribute, Uint32BufferAttribute, Vector3 } from 'three';

// Procedural geometry toolkit for the village.
//
// Every primitive is generated as a small local-space "Part" (positions, normals,
// meter-scaled uvs, indices). Parts are transformed and appended to a per-material
// Batch, which becomes a single merged BufferGeometry (one draw call per material).
//
// Vertex attributes of every batch:
//   position, normal, uv (meters: u runs along the grain / main axis)
//   tint  (vec3) : base color (paint color, wood tone, rope color ...)
//   vdata (vec4) : material specific parameters (seed, wear, pattern, ...)

/** Three numbers (a colour or a point). */
export type Num3 = readonly number[];
export type TintFn = ( x:number, y:number, z:number, i:number ) => Num3;
export type DataFn = ( x:number, y:number, z:number, i:number ) => readonly number[];
export type ColorLike = { r:number; g:number; b:number };
export type Tint = Num3 | TintFn | ColorLike | null | undefined;
export type VData = readonly number[] | DataFn;

/** Options of the Builder emitters (source `o = {}`). */
export interface PartOptions {
	grain?:number | undefined; skip?:number | undefined;
	rx?:number | undefined; ry?:number | undefined; rz?:number | undefined;
	sx?:number | undefined; sy?:number | undefined; sz?:number | undefined;
	tint?:Tint; data?:VData | undefined;
	segs?:number | undefined; capTop?:boolean | undefined; capBot?:boolean | undefined; swapUV?:boolean | undefined;
	rRef?:number | null | undefined; radial?:number | undefined; tubular?:number | undefined; arc?:number | undefined;
	extend?:number | undefined; roll?:number | undefined; uDir?:Vector3 | null | undefined; up?:Vector3 | null | undefined;
}

const _m4 = new Matrix4();
const _m3 = new Matrix3();
const _q = new Quaternion();
const _e = new Euler( 0, 0, 0, 'YXZ' );
const _p = new Vector3();
const _s = new Vector3( 1, 1, 1 );
const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _d = new Vector3();
const _X = new Vector3( 1, 0, 0 );
const _Y = new Vector3( 0, 1, 0 );

// UV conventions shared with VillageMaterials:
//   box faces perpendicular to the grain (end grain) get u += END_GRAIN_U
//   cylinder caps get u += CAP_U (centered cap coordinates)
export const END_GRAIN_U = 1000;
export const CAP_U = 2000;

// Texture period (m) around the circumference per material, so round parts wrap seamlessly.
export const WRAP_PERIOD:Readonly<Record<string, number>> = { wood: 1.0, hard: 1.0, stone: 2.0, thatch: 1.0, roofMetal: 0.84, roofMetalSwap: 1.68 };

// scale factor for the around-coordinate so a circumference C maps onto whole texture periods
const wrapScale = ( C:number, P:number ) => ( P > 0 ? Math.max( 1, Math.round( C / P ) ) * P / C : 1 );

export class Part {

	p:Float32Array;
	n:Float32Array;
	uv:Float32Array;
	idx:number[];

	constructor( p:Float32Array | number[], n:Float32Array | number[], uv:Float32Array | number[], idx:number[] ) {

		this.p = p instanceof Float32Array ? p : new Float32Array( p );
		this.n = n instanceof Float32Array ? n : new Float32Array( n );
		this.uv = uv instanceof Float32Array ? uv : new Float32Array( uv );
		this.idx = idx;

	}

	get vertexCount() {

		return this.p.length / 3;

	}

}

// ---------------------------------------------------------------------------
// Primitive generators (local space)

// Source quirk kept: keys round sizes (toFixed), so the first call with a key decides the part.
const partCache = new Map<string, Part>();

function cached( key:string, fn:() => Part ) {

	let p = partCache.get( key );
	if ( p === undefined ) {

		p = fn();
		partCache.set( key, p );

	}

	return p;

}

// Axis aligned box centered at the origin.
// grain: 0 = x, 1 = y, 2 = z, -1 = longest axis. u runs along the grain axis on faces containing it.
// skip: bitmask of faces to omit (1:+x 2:-x 4:+y 8:-y 16:+z 32:-z)
export function boxPart( sx:number, sy:number, sz:number, grain = - 1, skip = 0 ) {

	const key = `b${ sx.toFixed( 4 ) },${ sy.toFixed( 4 ) },${ sz.toFixed( 4 ) },${ grain },${ skip }`;
	return cached( key, () => {

		const s = [ sx, sy, sz ];
		let g = grain;
		if ( g < 0 ) g = sx >= sy && sx >= sz ? 0 : ( sy >= sz ? 1 : 2 );
		const p:number[] = [], n:number[] = [], uv:number[] = [], idx:number[] = [];
		const corners = [ [ - 1, - 1 ], [ 1, - 1 ], [ 1, 1 ], [ - 1, 1 ] ] as const;

		for ( let k = 0; k < 3; k ++ ) {

			for ( let si = 0; si < 2; si ++ ) {

				const sign = si === 0 ? 1 : - 1;
				if ( skip & ( 1 << ( k * 2 + si ) ) ) continue;
				const a = ( k + 1 ) % 3, b = ( k + 2 ) % 3;
				let ua = a, va = b;
				if ( g === b ) {

					ua = b; va = a;

				}

				const base = p.length / 3;
				// faces perpendicular to the grain are end grain: flagged by u + 1000 (see VillageMaterials)
				const endOff = k === g ? END_GRAIN_U : 0;
				for ( const [ ca, cb ] of corners ) {

					const v = [ 0, 0, 0 ];
					v[ k ] = sign * s[ k ]! / 2;
					v[ a ] = ca * s[ a ]! / 2;
					v[ b ] = cb * s[ b ]! / 2;
					p.push( v[ 0 ]!, v[ 1 ]!, v[ 2 ]! );
					const nn = [ 0, 0, 0 ];
					nn[ k ] = sign;
					n.push( nn[ 0 ]!, nn[ 1 ]!, nn[ 2 ]! );
					uv.push( v[ ua ]! + s[ ua ]! / 2 + endOff, v[ va ]! + s[ va ]! / 2 );

				}

				if ( sign > 0 ) idx.push( base, base + 1, base + 2, base, base + 2, base + 3 );
				else idx.push( base, base + 2, base + 1, base, base + 3, base + 2 );

			}

		}

		return new Part( p, n, uv, idx );

	} );

}

export interface GridVertex { p:Num3; n:Num3; uv:readonly number[] }

// Generic parametric grid surface. fn( i, j ) -> { p:[x,y,z], n:[x,y,z], uv:[u,v] }.
// Triangle winding is chosen per quad so faces agree with the supplied normals.
export function gridPart( cols:number, rows:number, fn:( i:number, j:number ) => GridVertex ) {

	const p:number[] = [], n:number[] = [], uv:number[] = [], idx:number[] = [];
	for ( let j = 0; j <= rows; j ++ ) {

		for ( let i = 0; i <= cols; i ++ ) {

			const v = fn( i, j );
			p.push( v.p[ 0 ]!, v.p[ 1 ]!, v.p[ 2 ]! );
			n.push( v.n[ 0 ]!, v.n[ 1 ]!, v.n[ 2 ]! );
			uv.push( v.uv[ 0 ]!, v.uv[ 1 ]! );

		}

	}

	const W = cols + 1;
	for ( let j = 0; j < rows; j ++ ) {

		for ( let i = 0; i < cols; i ++ ) {

			const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
			// geometric normal of triangle (a, b, d)
			_a.fromArray( p, a * 3 ); _b.fromArray( p, b * 3 ); _c.fromArray( p, d * 3 ); _d.fromArray( p, c * 3 );
			const e1 = _b.clone().sub( _a ), e2 = _c.clone().sub( _a ), e3 = _d.clone().sub( _a );
			const fn1 = e1.clone().cross( e2 ).add( e2.clone().cross( e3 ) );
			const ns = n[ a * 3 ]! + n[ b * 3 ]! + n[ c * 3 ]! + n[ d * 3 ]!;
			const nsy = n[ a * 3 + 1 ]! + n[ b * 3 + 1 ]! + n[ c * 3 + 1 ]! + n[ d * 3 + 1 ]!;
			const nsz = n[ a * 3 + 2 ]! + n[ b * 3 + 2 ]! + n[ c * 3 + 2 ]! + n[ d * 3 + 2 ]!;
			const dot = fn1.x * ns + fn1.y * nsy + fn1.z * nsz;
			if ( dot >= 0 ) idx.push( a, b, d, a, d, c );
			else idx.push( a, d, b, a, c, d );

		}

	}

	return new Part( p, n, uv, idx );

}

// Cylinder / cone along +y from y = 0 to y = h.
// uv: u along the axis (m), v around the circumference (m). swapUV exchanges them.
export function cylPart( rTop:number, rBot:number, h:number, segs = 8, capTop = true, capBot = false, swapUV = false, period = 0 ) {

	const key = `c${ rTop.toFixed( 4 ) },${ rBot.toFixed( 4 ) },${ h.toFixed( 4 ) },${ segs },${ capTop },${ capBot },${ swapUV },${ period }`;
	return cached( key, () => {

		const p:number[] = [], n:number[] = [], uv:number[] = [], idx:number[] = [];
		const slope = ( rBot - rTop ) / h;
		const nl = Math.hypot( 1, slope );
		const rAvg = ( rTop + rBot ) / 2;
		const ws = wrapScale( Math.PI * 2 * rAvg, period );
		for ( let i = 0; i <= segs; i ++ ) {

			const t = i / segs * Math.PI * 2;
			const c = Math.cos( t ), s = Math.sin( t );
			for ( let j = 0; j < 2; j ++ ) {

				const r = j ? rTop : rBot, y = j ? h : 0;
				p.push( c * r, y, s * r );
				n.push( c / nl, slope / nl, s / nl );
				const U = y, V = t * rAvg * ws;
				if ( swapUV ) uv.push( V, U );
				else uv.push( U, V );

			}

		}

		for ( let i = 0; i < segs; i ++ ) {

			const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
			idx.push( a, b, c, b, d, c );

		}

		const cap = ( y:number, r:number, up:boolean ) => {

			if ( r <= 0 ) return;
			const base = p.length / 3;
			p.push( 0, y, 0 ); n.push( 0, up ? 1 : - 1, 0 ); uv.push( CAP_U, 0 );
			for ( let i = 0; i <= segs; i ++ ) {

				const t = i / segs * Math.PI * 2;
				p.push( Math.cos( t ) * r, y, Math.sin( t ) * r );
				n.push( 0, up ? 1 : - 1, 0 );
				uv.push( Math.cos( t ) * r + CAP_U, Math.sin( t ) * r );

			}

			for ( let i = 0; i < segs; i ++ ) {

				if ( up ) idx.push( base, base + 2 + i, base + 1 + i );
				else idx.push( base, base + 1 + i, base + 2 + i );

			}

		};

		if ( capTop ) cap( h, rTop, true );
		if ( capBot ) cap( 0, rBot, false );
		return new Part( p, n, uv, idx );

	} );

}

/** Lathe profile point [r, y]. */
export type ProfilePoint = readonly [number, number];

// Surface of revolution around +y. profile: [[r, y], ...] bottom to top.
// A repeated point creates a crease. uv: u along the profile (m), v around (m, at rRef).
export function lathePart( profile:readonly ProfilePoint[], segs = 12, rRef:number | null = null, period = 0 ) {

	const key = 'l' + profile.map( ( q ) => q[ 0 ].toFixed( 3 ) + ':' + q[ 1 ].toFixed( 3 ) ).join( ',' ) + '|' + segs + '|' + rRef + '|' + period;
	return cached( key, () => {

		const m = profile.length;
		const P = ( i:number ) => profile[ i ]!;
		const rr0 = rRef ?? Math.max( ...profile.map( ( q ) => q[ 0 ] ) );
		const rr = rr0 * wrapScale( Math.PI * 2 * rr0, period );
		// profile normals
		const pn:[number, number][] = [];
		const segN = ( i:number ) => {

			const dr = P( i + 1 )[ 0 ] - P( i )[ 0 ], dy = P( i + 1 )[ 1 ] - P( i )[ 1 ];
			const l = Math.hypot( dr, dy ) || 1;
			return [ dy / l, - dr / l ] as const;

		};

		const same = ( a:number, b:number ) => a >= 0 && b < m && P( a )[ 0 ] === P( b )[ 0 ] && P( a )[ 1 ] === P( b )[ 1 ];
		for ( let i = 0; i < m; i ++ ) {

			let nr = 0, ny = 0;
			if ( same( i, i + 1 ) ) {

				// crease start: previous segment only
				if ( i > 0 ) {

					const s = segN( i - 1 ); nr = s[ 0 ]; ny = s[ 1 ];

				}

			} else if ( same( i - 1, i ) ) {

				// crease end: next segment only
				if ( i < m - 1 ) {

					const s = segN( i ); nr = s[ 0 ]; ny = s[ 1 ];

				}

			} else {

				if ( i < m - 1 ) {

					const s = segN( i ); nr += s[ 0 ]; ny += s[ 1 ];

				}

				if ( i > 0 ) {

					const s = segN( i - 1 ); nr += s[ 0 ]; ny += s[ 1 ];

				}

			}

			const l = Math.hypot( nr, ny ) || 1;
			pn.push( [ nr / l, ny / l ] );

		}

		const len = [ 0 ];
		for ( let i = 1; i < m; i ++ ) len.push( len[ i - 1 ]! + Math.hypot( P( i )[ 0 ] - P( i - 1 )[ 0 ], P( i )[ 1 ] - P( i - 1 )[ 1 ] ) );

		return gridPart( m - 1, segs, ( i, j ) => {

			const t = j / segs * Math.PI * 2;
			const c = Math.cos( t ), s = Math.sin( t );
			const [ r, y ] = P( i );
			const [ nr, ny ] = pn[ i ]!;
			return { p: [ c * r, y, s * r ], n: [ c * nr, ny, s * nr ], uv: [ len[ i ]!, t * rr ] };

		} );

	} );

}

// Torus lying in the XZ plane (axis +y). arc < 2PI gives an open ring.
export function torusPart( R:number, r:number, radial = 6, tubular = 16, arc = Math.PI * 2 ) {

	const key = `t${ R.toFixed( 4 ) },${ r.toFixed( 4 ) },${ radial },${ tubular },${ arc.toFixed( 3 ) }`;
	return cached( key, () => gridPart( tubular, radial, ( i, j ) => {

		const phi = i / tubular * arc, psi = j / radial * Math.PI * 2;
		const cp = Math.cos( phi ), sp = Math.sin( phi ), cs = Math.cos( psi ), ss = Math.sin( psi );
		return {
			p: [ ( R + r * cs ) * cp, r * ss, ( R + r * cs ) * sp ],
			n: [ cs * cp, ss, cs * sp ],
			uv: [ phi * R, psi * r ],
		};

	} ) );

}

// Tube along a polyline (array of Vector3). uv: u along the length, v around.
export function tubePart( points:readonly Vector3[], radius:number, radial = 5 ) {

	const m = points.length;
	const pt = ( i:number ) => points[ i ]!;
	const T:Vector3[] = [], N:Vector3[] = [], Bn:Vector3[] = [];
	for ( let i = 0; i < m; i ++ ) {

		const a = pt( Math.max( 0, i - 1 ) ), b = pt( Math.min( m - 1, i + 1 ) );
		T.push( b.clone().sub( a ).normalize() );

	}

	// initial normal
	const T0 = T[ 0 ]!;
	let n0 = Math.abs( T0.y ) < 0.9 ? new Vector3( 0, 1, 0 ) : new Vector3( 1, 0, 0 );
	n0 = n0.sub( T0.clone().multiplyScalar( n0.dot( T0 ) ) ).normalize();
	N.push( n0 );
	Bn.push( T0.clone().cross( n0 ) );
	for ( let i = 1; i < m; i ++ ) {

		const prev = N[ i - 1 ]!, Ti = T[ i ]!;
		const nn = prev.clone().sub( Ti.clone().multiplyScalar( prev.dot( Ti ) ) );
		if ( nn.lengthSq() < 1e-8 ) nn.copy( prev );
		nn.normalize();
		N.push( nn );
		Bn.push( Ti.clone().cross( nn ) );

	}

	const len = [ 0 ];
	for ( let i = 1; i < m; i ++ ) len.push( len[ i - 1 ]! + pt( i ).distanceTo( pt( i - 1 ) ) );

	return gridPart( radial, m - 1, ( i, j ) => {

		const t = i / radial * Math.PI * 2;
		const c = Math.cos( t ), s = Math.sin( t );
		const Nj = N[ j ]!, Bj = Bn[ j ]!;
		const nx = Nj.x * c + Bj.x * s, ny = Nj.y * c + Bj.y * s, nz = Nj.z * c + Bj.z * s;
		const P = pt( j );
		return { p: [ P.x + nx * radius, P.y + ny * radius, P.z + nz * radius ], n: [ nx, ny, nz ], uv: [ len[ j ]!, t * radius ] };

	} );

}

// Planar subdivided rectangle in the XY plane facing +z, centered horizontally, from y = 0 down to y = -h
// when hang = true (useful for cloth / nets), otherwise centered. uv in meters.
export function planePart( w:number, h:number, sw = 1, sh = 1, hang = false ) {

	const key = `p${ w.toFixed( 3 ) },${ h.toFixed( 3 ) },${ sw },${ sh },${ hang }`;
	return cached( key, () => gridPart( sw, sh, ( i, j ) => {

		const x = ( i / sw - 0.5 ) * w;
		const y = hang ? - j / sh * h : ( j / sh - 0.5 ) * h;
		return { p: [ x, y, 0 ], n: [ 0, 0, 1 ], uv: [ x + w / 2, hang ? h + y : y + h / 2 ] };

	} ) );

}

// Single quad in the XY plane facing +z, centered, with normalized 0..1 uvs (window panes).
export function quad01Part( w:number, h:number ) {

	const key = `q${ w.toFixed( 3 ) },${ h.toFixed( 3 ) }`;
	return cached( key, () => new Part(
		[ - w / 2, - h / 2, 0, w / 2, - h / 2, 0, w / 2, h / 2, 0, - w / 2, h / 2, 0 ],
		[ 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1 ],
		[ 0, 0, 1, 0, 1, 1, 0, 1 ],
		[ 0, 1, 2, 0, 2, 3 ]
	) );

}

// Convex planar polygon (array of Vector3, counter-clockwise seen from the outside / top)
// extruded by `thickness` against its normal. uDir: in-plane direction for u.
export function slabPart( pts:readonly Vector3[], thickness:number, uDir:Vector3 | null = null, upHint:Vector3 | null = null ) {

	const m = pts.length;
	const nrm = new Vector3();
	for ( let i = 0; i < m; i ++ ) {

		const a = pts[ i ]!, b = pts[ ( i + 1 ) % m ]!;
		nrm.x += ( a.y - b.y ) * ( a.z + b.z );
		nrm.y += ( a.z - b.z ) * ( a.x + b.x );
		nrm.z += ( a.x - b.x ) * ( a.y + b.y );

	}

	nrm.normalize();
	if ( upHint && nrm.dot( upHint ) < 0 ) {

		pts = pts.slice().reverse();
		nrm.negate();

	}
	const u = ( uDir ? uDir.clone() : pts[ 1 ]!.clone().sub( pts[ 0 ]! ) );
	u.sub( nrm.clone().multiplyScalar( u.dot( nrm ) ) ).normalize();
	const v = nrm.clone().cross( u );
	const off = nrm.clone().multiplyScalar( - thickness );
	const p:number[] = [], n:number[] = [], uv:number[] = [], idx:number[] = [];
	// uv origin at the minimum projection so u = distance from the lowest edge along uDir
	let uMin = Infinity, vMin = Infinity;
	for ( const q of pts ) {

		uMin = Math.min( uMin, q.dot( u ) );
		vMin = Math.min( vMin, q.dot( v ) );

	}

	const o = u.clone().multiplyScalar( uMin ).add( v.clone().multiplyScalar( vMin ) );

	// top
	let base = 0;
	for ( const q of pts ) {

		p.push( q.x, q.y, q.z ); n.push( nrm.x, nrm.y, nrm.z );
		_p.copy( q ).sub( o );
		uv.push( _p.dot( u ), _p.dot( v ) );

	}

	for ( let i = 1; i < m - 1; i ++ ) idx.push( base, base + i, base + i + 1 );

	// bottom (omitted for zero-thickness sheets, which are rendered double sided)
	if ( thickness > 0 ) {

		base = p.length / 3;
		for ( const q of pts ) {

			p.push( q.x + off.x, q.y + off.y, q.z + off.z ); n.push( - nrm.x, - nrm.y, - nrm.z );
			_p.copy( q ).sub( o );
			uv.push( _p.dot( u ), _p.dot( v ) );

		}

		for ( let i = 1; i < m - 1; i ++ ) idx.push( base, base + i + 1, base + i );

	}

	// sides
	if ( thickness > 0 ) {

		for ( let i = 0; i < m; i ++ ) {

			const a = pts[ i ]!, b = pts[ ( i + 1 ) % m ]!;
			const e = b.clone().sub( a );
			const L = e.length();
			const sn = e.clone().cross( nrm ).normalize();
			base = p.length / 3;
			p.push( a.x, a.y, a.z, b.x, b.y, b.z, b.x + off.x, b.y + off.y, b.z + off.z, a.x + off.x, a.y + off.y, a.z + off.z );
			for ( let k = 0; k < 4; k ++ ) n.push( sn.x, sn.y, sn.z );
			uv.push( 0, 0, 0, L, thickness, L, thickness, 0 );
			idx.push( base, base + 2, base + 1, base, base + 3, base + 2 );

		}

	}

	const part = new Part( p, n, uv, idx );
	// fix winding of every triangle against its vertex normals
	fixWinding( part );
	return part;

}

// Flip triangles whose geometric normal disagrees with the average vertex normal.
export function fixWinding( part:Part ) {

	const { p, n, idx } = part;
	for ( let t = 0; t < idx.length; t += 3 ) {

		const i0 = idx[ t ]!, i1 = idx[ t + 1 ]!, i2 = idx[ t + 2 ]!;
		_a.fromArray( p, i0 * 3 ); _b.fromArray( p, i1 * 3 ); _c.fromArray( p, i2 * 3 );
		_b.sub( _a ); _c.sub( _a );
		_b.cross( _c );
		const nx = n[ i0 * 3 ]! + n[ i1 * 3 ]! + n[ i2 * 3 ]!;
		const ny = n[ i0 * 3 + 1 ]! + n[ i1 * 3 + 1 ]! + n[ i2 * 3 + 1 ]!;
		const nz = n[ i0 * 3 + 2 ]! + n[ i1 * 3 + 2 ]! + n[ i2 * 3 + 2 ]!;
		if ( _b.x * nx + _b.y * ny + _b.z * nz < 0 ) {

			idx[ t + 1 ] = i2; idx[ t + 2 ] = i1;

		}

	}

	return part;

}

// Triangular prism: triangle (-w/2,0) (w/2,0) (0,h) in XY, extruded along z by depth (centered).
export function gablePart( w:number, h:number, depth:number ) {

	const key = `g${ w.toFixed( 3 ) },${ h.toFixed( 3 ) },${ depth.toFixed( 3 ) }`;
	return cached( key, () => {

		const d = depth / 2;
		const pts = [ new Vector3( - w / 2, 0, d ), new Vector3( w / 2, 0, d ), new Vector3( 0, h, d ) ];
		return slabPart( pts, depth, new Vector3( 1, 0, 0 ) );

	} );

}

// ---------------------------------------------------------------------------
// Batch: merged geometry for one material

export class Batch {

	pos:number[] = [];
	nrm:number[] = [];
	uv:number[] = [];
	tint:number[] = [];
	data:number[] = [];
	idx:number[] = [];
	vcount = 0;

	get triangles() {

		return this.idx.length / 3;

	}

	add( part:Part, m:Matrix4, tint:Num3 | TintFn, data:VData ) {

		_m3.getNormalMatrix( m );
		const e = m.elements, ne = _m3.elements;
		const P = part.p, N = part.n, U = part.uv;
		const base = this.vcount;
		const nv = P.length / 3;
		for ( let i = 0; i < nv; i ++ ) {

			const x = P[ i * 3 ]!, y = P[ i * 3 + 1 ]!, z = P[ i * 3 + 2 ]!;
			this.pos.push(
				e[ 0 ] * x + e[ 4 ] * y + e[ 8 ] * z + e[ 12 ],
				e[ 1 ] * x + e[ 5 ] * y + e[ 9 ] * z + e[ 13 ],
				e[ 2 ] * x + e[ 6 ] * y + e[ 10 ] * z + e[ 14 ]
			);
			const nx = N[ i * 3 ]!, ny = N[ i * 3 + 1 ]!, nz = N[ i * 3 + 2 ]!;
			const tx = ne[ 0 ] * nx + ne[ 3 ] * ny + ne[ 6 ] * nz;
			const ty = ne[ 1 ] * nx + ne[ 4 ] * ny + ne[ 7 ] * nz;
			const tz = ne[ 2 ] * nx + ne[ 5 ] * ny + ne[ 8 ] * nz;
			const l = Math.hypot( tx, ty, tz ) || 1;
			this.nrm.push( tx / l, ty / l, tz / l );
			this.uv.push( U[ i * 2 ]!, U[ i * 2 + 1 ]! );
			const t = typeof tint === 'function' ? tint( x, y, z, i ) : tint;
			this.tint.push( t[ 0 ]!, t[ 1 ]!, t[ 2 ]! );
			const d = typeof data === 'function' ? data( x, y, z, i ) : data;
			this.data.push( d[ 0 ]!, d[ 1 ]!, d[ 2 ]!, d[ 3 ]! );

		}

		const flip = m.determinant() < 0;
		const I = part.idx;
		for ( let k = 0; k < I.length; k += 3 ) {

			if ( flip ) this.idx.push( base + I[ k ]!, base + I[ k + 2 ]!, base + I[ k + 1 ]! );
			else this.idx.push( base + I[ k ]!, base + I[ k + 1 ]!, base + I[ k + 2 ]! );

		}

		this.vcount += nv;

	}

	// Stamp another batch (a prop prototype) into this one: positions / normals transformed by m,
	// tint multiplied by tintMul, the per-vertex seed (vdata.x) offset so every copy looks different.
	addBatch( src:Batch, m:Matrix4, tintMul:Num3 | null = null, seedOffset = 0 ) {

		_m3.getNormalMatrix( m );
		const e = m.elements, ne = _m3.elements;
		const base = this.vcount;
		const P = src.pos, N = src.nrm;
		const nv = src.vcount;
		for ( let i = 0; i < nv; i ++ ) {

			const x = P[ i * 3 ]!, y = P[ i * 3 + 1 ]!, z = P[ i * 3 + 2 ]!;
			this.pos.push(
				e[ 0 ] * x + e[ 4 ] * y + e[ 8 ] * z + e[ 12 ],
				e[ 1 ] * x + e[ 5 ] * y + e[ 9 ] * z + e[ 13 ],
				e[ 2 ] * x + e[ 6 ] * y + e[ 10 ] * z + e[ 14 ]
			);
			const nx = N[ i * 3 ]!, ny = N[ i * 3 + 1 ]!, nz = N[ i * 3 + 2 ]!;
			const tx = ne[ 0 ] * nx + ne[ 3 ] * ny + ne[ 6 ] * nz;
			const ty = ne[ 1 ] * nx + ne[ 4 ] * ny + ne[ 7 ] * nz;
			const tz = ne[ 2 ] * nx + ne[ 5 ] * ny + ne[ 8 ] * nz;
			const l = Math.hypot( tx, ty, tz ) || 1;
			this.nrm.push( tx / l, ty / l, tz / l );
			this.uv.push( src.uv[ i * 2 ]!, src.uv[ i * 2 + 1 ]! );
			const t = src.tint;
			if ( tintMul ) this.tint.push( t[ i * 3 ]! * tintMul[ 0 ]!, t[ i * 3 + 1 ]! * tintMul[ 1 ]!, t[ i * 3 + 2 ]! * tintMul[ 2 ]! );
			else this.tint.push( t[ i * 3 ]!, t[ i * 3 + 1 ]!, t[ i * 3 + 2 ]! );
			const d = src.data;
			this.data.push( d[ i * 4 ]! + seedOffset, d[ i * 4 + 1 ]!, d[ i * 4 + 2 ]!, d[ i * 4 + 3 ]! );

		}

		const flip = m.determinant() < 0;
		const I = src.idx;
		for ( let k = 0; k < I.length; k += 3 ) {

			if ( flip ) this.idx.push( base + I[ k ]!, base + I[ k + 2 ]!, base + I[ k + 1 ]! );
			else this.idx.push( base + I[ k ]!, base + I[ k + 1 ]!, base + I[ k + 2 ]! );

		}

		this.vcount += nv;

	}

	// Append another batch verbatim, optionally remapping each vertex's vdata (used to merge
	// several emitter keys into one material / draw call).
	append( src:Batch, dataFn:( ( d:number[] ) => readonly number[] ) | null = null ) {

		const base = this.vcount;
		for ( let i = 0; i < src.pos.length; i ++ ) this.pos.push( src.pos[ i ]! );
		for ( let i = 0; i < src.nrm.length; i ++ ) this.nrm.push( src.nrm[ i ]! );
		for ( let i = 0; i < src.uv.length; i ++ ) this.uv.push( src.uv[ i ]! );
		for ( let i = 0; i < src.tint.length; i ++ ) this.tint.push( src.tint[ i ]! );
		for ( let i = 0; i < src.vcount; i ++ ) {

			const d = [ src.data[ i * 4 ]!, src.data[ i * 4 + 1 ]!, src.data[ i * 4 + 2 ]!, src.data[ i * 4 + 3 ]! ];
			const o = dataFn ? dataFn( d ) : d;
			this.data.push( o[ 0 ]!, o[ 1 ]!, o[ 2 ]!, o[ 3 ]! );

		}

		for ( let i = 0; i < src.idx.length; i ++ ) this.idx.push( base + src.idx[ i ]! );
		this.vcount += src.vcount;

	}

	build() {

		const g = new BufferGeometry();
		g.setAttribute( 'position', new Float32BufferAttribute( this.pos, 3 ) );
		g.setAttribute( 'normal', new Float32BufferAttribute( this.nrm, 3 ) );
		g.setAttribute( 'uv', new Float32BufferAttribute( this.uv, 2 ) );
		g.setAttribute( 'tint', new Float32BufferAttribute( this.tint, 3 ) );
		g.setAttribute( 'vdata', new Float32BufferAttribute( this.data, 4 ) );
		const Idx = this.vcount > 65535 ? Uint32BufferAttribute : Uint16BufferAttribute;
		g.setIndex( new Idx( this.idx, 1 ) );
		g.computeBoundingBox();
		g.computeBoundingSphere();
		return g;

	}

}

// ---------------------------------------------------------------------------
// Builder: transform stack + convenience emitters for all material batches

// rope vdata carries the rope radius in .y so the shader can normalise its uvs to strands
const ropeData = ( d:VData | undefined, r:number ) => {

	const a = Array.isArray( d ) ? d as readonly number[] : [ 0, 0, 0, 0 ];
	return [ a[ 0 ]!, r, a[ 2 ]!, a[ 3 ]! ];

};

const toArr = ( c:Tint ):Num3 | TintFn => ( c === undefined || c === null ) ? [ 1, 1, 1 ] : ( Array.isArray( c ) || typeof c === 'function' ? c as Num3 | TintFn : [ ( c as ColorLike ).r, ( c as ColorLike ).g, ( c as ColorLike ).b ] );

export function mat4( x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, out = new Matrix4() ) {

	_e.set( rx, ry, rz, 'YXZ' );
	_q.setFromEuler( _e );
	_p.set( x, y, z );
	return out.compose( _p, _q, _s );

}

// transform from an options object { ry, rx, rz, sx, sy, sz }
function optMat( x:number, y:number, z:number, o:PartOptions ) {

	_e.set( o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ' );
	_q.setFromEuler( _e );
	_p.set( x, y, z );
	_d.set( o.sx ?? 1, o.sy ?? 1, o.sz ?? 1 );
	return new Matrix4().compose( _p, _q, _d );

}

/** Local point [x, y, z] of the Builder emitters. */
export type P3 = readonly number[];

export class Builder {

	batches:Record<string, Batch | undefined> = {};
	frame = new Matrix4();
	stack:Matrix4[] = [];
	/** Fish display collector (Props.js fish(), set lazily; see props.ts setFishProps). */
	fishProps?:unknown;

	batch( key:string ) {

		return this.batches[ key ] || ( this.batches[ key ] = new Batch() );

	}

	push( m:Matrix4 ) {

		this.stack.push( this.frame );
		this.frame = this.frame.clone().multiply( m );
		return this;

	}

	pushAt( x:number, y:number, z:number, ry = 0, rx = 0, rz = 0 ) {

		return this.push( mat4( x, y, z, ry, rx, rz ) );

	}

	pop() {

		this.frame = this.stack.pop()!;
		return this;

	}

	// local -> world point
	toWorld( x:number, y:number, z:number, out = new Vector3() ) {

		return out.set( x, y, z ).applyMatrix4( this.frame );

	}

	add( key:string, part:Part, local:Matrix4, tint?:Tint, data?:VData ) {

		_m4.multiplyMatrices( this.frame, local );
		this.batch( key ).add( part, _m4, toArr( tint ), data || [ 0, 0, 0, 0 ] );

	}

	// box centered at (x, y, z)
	box( key:string, x:number, y:number, z:number, sx:number, sy:number, sz:number, o:PartOptions = {} ) {

		const part = boxPart( sx, sy, sz, o.grain ?? - 1, o.skip ?? 0 );
		this.add( key, part, optMat( x, y, z, o ), o.tint, o.data );

	}

	// cylinder standing on (x, y, z)
	cyl( key:string, x:number, y:number, z:number, rTop:number, rBot:number, h:number, o:PartOptions = {} ) {

		const swap = o.swapUV ?? false;
		const period = WRAP_PERIOD[ key === 'roofMetal' && swap ? 'roofMetalSwap' : key ] ?? 0;
		const part = cylPart( rTop, rBot, h, o.segs ?? 8, o.capTop ?? true, o.capBot ?? false, swap, period );
		this.add( key, part, optMat( x, y, z, o ), o.tint, o.data );

	}

	// lathe standing on (x, y, z)
	lathe( key:string, x:number, y:number, z:number, profile:readonly ProfilePoint[], o:PartOptions = {} ) {

		const part = lathePart( profile, o.segs ?? 12, o.rRef ?? null, WRAP_PERIOD[ key ] ?? 0 );
		this.add( key, part, optMat( x, y, z, o ), o.tint, o.data );

	}

	torus( key:string, x:number, y:number, z:number, R:number, r:number, o:PartOptions = {} ) {

		const part = torusPart( R, r, o.radial ?? 6, o.tubular ?? 16, o.arc ?? Math.PI * 2 );
		this.add( key, part, optMat( x, y, z, o ), o.tint, key === 'rope' ? ropeData( o.data, r ) : o.data );

	}

	part( key:string, part:Part, x:number, y:number, z:number, o:PartOptions = {} ) {

		this.add( key, part, optMat( x, y, z, o ), o.tint, o.data );

	}

	// rectangular beam between two local points; w = width (horizontal), h = height (vertical-ish)
	beam( key:string, p0:P3, p1:P3, w:number, h:number, o:PartOptions = {} ) {

		_a.set( p1[ 0 ]! - p0[ 0 ]!, p1[ 1 ]! - p0[ 1 ]!, p1[ 2 ]! - p0[ 2 ]! );
		const L = _a.length();
		if ( L < 1e-5 ) return;
		_a.divideScalar( L );
		const up = Math.abs( _a.y ) > 0.98 ? _X : _Y;
		// local x -> dir, local y -> up-ish, local z -> x cross y
		_c.crossVectors( _a, up ).normalize(); // z axis
		_b.crossVectors( _c, _a ).normalize(); // y axis
		if ( o.roll ) {

			const cr = Math.cos( o.roll ), sr = Math.sin( o.roll );
			const by = _b.clone(), bz = _c.clone();
			_b.copy( by ).multiplyScalar( cr ).addScaledVector( bz, sr );
			_c.copy( bz ).multiplyScalar( cr ).addScaledVector( by, - sr );

		}

		const m = new Matrix4().makeBasis( _a, _b, _c );
		m.setPosition( ( p0[ 0 ]! + p1[ 0 ]! ) / 2, ( p0[ 1 ]! + p1[ 1 ]! ) / 2, ( p0[ 2 ]! + p1[ 2 ]! ) / 2 );
		const part = boxPart( L + ( o.extend || 0 ), h, w, 0, o.skip ?? 0 );
		this.add( key, part, m, o.tint, o.data );

	}

	// round rod between two local points
	rod( key:string, p0:P3, p1:P3, r0:number, r1 = r0, o:PartOptions = {} ) {

		_a.set( p1[ 0 ]! - p0[ 0 ]!, p1[ 1 ]! - p0[ 1 ]!, p1[ 2 ]! - p0[ 2 ]! );
		const L = _a.length();
		if ( L < 1e-5 ) return;
		_a.divideScalar( L );
		_q.setFromUnitVectors( _Y, _a );
		const m = new Matrix4().compose( _p.set( p0[ 0 ]!, p0[ 1 ]!, p0[ 2 ]! ), _q, _s );
		const part = cylPart( r1, r0, L, o.segs ?? 6, o.capTop ?? true, o.capBot ?? false, false, WRAP_PERIOD[ key ] ?? 0 );
		this.add( key, part, m, o.tint, o.data );

	}

	// tube (rope) along local points
	tube( key:string, points:readonly Vector3[], radius:number, o:PartOptions = {} ) {

		const part = tubePart( points, radius, o.radial ?? 5 );
		this.add( key, part, new Matrix4(), o.tint, key === 'rope' ? ropeData( o.data, radius ) : o.data );

	}

	slab( key:string, pts:readonly Vector3[], thickness:number, o:PartOptions = {} ) {

		const part = slabPart( pts, thickness, o.uDir || null, o.up || null );
		this.add( key, part, new Matrix4(), o.tint, o.data );

	}

	get triangles() {

		let t = 0;
		for ( const k in this.batches ) t += this.batches[ k ]!.triangles;
		return t;

	}

}

// Catmull-Rom sampled sagging rope between two points (catenary approximation).
export function sagPoints( a:P3, b:P3, sag:number, n = 8 ) {

	const pts:Vector3[] = [];
	for ( let i = 0; i <= n; i ++ ) {

		const t = i / n;
		pts.push( new Vector3(
			a[ 0 ]! + ( b[ 0 ]! - a[ 0 ]! ) * t,
			a[ 1 ]! + ( b[ 1 ]! - a[ 1 ]! ) * t - sag * 4 * t * ( 1 - t ),
			a[ 2 ]! + ( b[ 2 ]! - a[ 2 ]! ) * t
		) );

	}

	return pts;

}
