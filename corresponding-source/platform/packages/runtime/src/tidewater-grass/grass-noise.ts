/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
// Source: src/util/Noise.js 3-16 (mulberry32), 18-62 (Noise2D constructor and gradient noise), 102-109
// (smoothstep, clamp). Only what the grass field and its mask use; private to this folder like the
// other Tidewater ports (see the building notes on merging the copies later).

/** Seeded uniform [0, 1) generator (Noise.js mulberry32). */
export type Rng = () => number;
export function mulberry32( seed:number ):Rng {

	let a = seed >>> 0;
	return function () {

		a = ( a + 0x6D2B79F5 ) >>> 0;
		let t = a;
		t = Math.imul( t ^ ( t >>> 15 ), t | 1 );
		t ^= t + Math.imul( t ^ ( t >>> 7 ), t | 61 );
		return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;

	};

}

/** Seeded 2D gradient noise (Noise.js Noise2D: constructor and `noise`). */
export class Noise2D {

	perm:Uint8Array;
	grad:Float32Array;

	constructor( seed = 1 ) {

		const rand = mulberry32( seed );
		const p = new Uint8Array( 256 );
		for ( let i = 0; i < 256; i ++ ) p[ i ] = i;
		for ( let i = 255; i > 0; i -- ) {

			const j = Math.floor( rand() * ( i + 1 ) );
			const t = p[ i ]!; p[ i ] = p[ j ]!; p[ j ] = t;

		}

		this.perm = new Uint8Array( 512 );
		for ( let i = 0; i < 512; i ++ ) this.perm[ i ] = p[ i & 255 ]!;
		this.grad = new Float32Array( 512 );
		for ( let i = 0; i < 256; i ++ ) {

			const a = rand() * Math.PI * 2;
			this.grad[ i * 2 ] = Math.cos( a );
			this.grad[ i * 2 + 1 ] = Math.sin( a );

		}

	}

	// gradient noise, roughly in [-1, 1]
	noise( x:number, y:number ):number {

		const xi = Math.floor( x ), yi = Math.floor( y );
		const xf = x - xi, yf = y - yi;
		const X = xi & 255, Y = yi & 255;
		const perm = this.perm, g = this.grad;
		const h00 = perm[ X + perm[ Y ]! ]!, h10 = perm[ X + 1 + perm[ Y ]! ]!;
		const h01 = perm[ X + perm[ Y + 1 ]! ]!, h11 = perm[ X + 1 + perm[ Y + 1 ]! ]!;
		const d00 = g[ h00 * 2 ]! * xf + g[ h00 * 2 + 1 ]! * yf;
		const d10 = g[ h10 * 2 ]! * ( xf - 1 ) + g[ h10 * 2 + 1 ]! * yf;
		const d01 = g[ h01 * 2 ]! * xf + g[ h01 * 2 + 1 ]! * ( yf - 1 );
		const d11 = g[ h11 * 2 ]! * ( xf - 1 ) + g[ h11 * 2 + 1 ]! * ( yf - 1 );
		const u = xf * xf * xf * ( xf * ( xf * 6 - 15 ) + 10 );
		const v = yf * yf * yf * ( yf * ( yf * 6 - 15 ) + 10 );
		const a = d00 + ( d10 - d00 ) * u;
		const b = d01 + ( d11 - d01 ) * u;
		return ( a + ( b - a ) * v ) * 1.414;

	}

}

export const smoothstep = ( a:number, b:number, x:number ) => {

	const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );

};

export const clamp = ( x:number, a:number, b:number ) => Math.min( b, Math.max( a, x ) );
