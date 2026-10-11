/** Port of Tidewater (github.com/dgreenheck/tidewater, commit 4811ba48), Copyright 2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
// Source: src/world/marine/WhaleTextures.js 1-89 (PNG decoder and the whale's texture loader).
//
// Divergence: loadTexture builds a three.js DataTexture (the source uploads an engine Texture and
// generates its mipmaps on the GPU): RGBA8, sRGB for the albedo, clamped, trilinear, anisotropy 8.
// decodePNG is unchanged and tested against the source.
import { ClampToEdgeWrapping, DataTexture, LinearFilter, LinearMipmapLinearFilter, LinearSRGBColorSpace, RGBAFormat, SRGBColorSpace,
	UnsignedByteType } from 'three';

// Minimal PNG decoder (8-bit RGBA, non-interlaced, all five filters) built on DecompressionStream,
// so the whale's baked maps load identically in the browser and in headless tests, and upload
// as plain data textures (no image element / ImageBitmap orientation or colour-space surprises).
export async function decodePNG( buffer:ArrayBuffer ) {

	const u8 = new Uint8Array( buffer );
	const dv = new DataView( buffer );
	let p = 8;
	let width = 0, height = 0;
	const idat:Uint8Array[] = [];
	while ( p < u8.length ) {

		const len = dv.getUint32( p );
		const type = String.fromCharCode( u8[ p + 4 ]!, u8[ p + 5 ]!, u8[ p + 6 ]!, u8[ p + 7 ]! );
		if ( type === 'IHDR' ) {

			width = dv.getUint32( p + 8 );
			height = dv.getUint32( p + 12 );
			if ( u8[ p + 16 ] !== 8 || u8[ p + 17 ] !== 6 || u8[ p + 20 ] !== 0 ) throw new Error( 'decodePNG: expects 8-bit RGBA, non-interlaced' );

		} else if ( type === 'IDAT' ) idat.push( u8.subarray( p + 8, p + 8 + len ) );
		else if ( type === 'IEND' ) break;
		p += 12 + len;

	}

	const stream = new Blob( idat as BlobPart[] ).stream().pipeThrough( new DecompressionStream( 'deflate' ) );
	const raw = new Uint8Array( await new Response( stream ).arrayBuffer() );
	const stride = width * 4;
	const out = new Uint8Array( stride * height );
	for ( let y = 0; y < height; y ++ ) {

		const f = raw[ y * ( stride + 1 ) ];
		const src = y * ( stride + 1 ) + 1, dst = y * stride, prev = dst - stride;
		if ( f === 0 ) out.set( raw.subarray( src, src + stride ), dst );
		else if ( f === 2 ) {

			if ( y === 0 ) out.set( raw.subarray( src, src + stride ), dst );
			else for ( let x = 0; x < stride; x ++ ) out[ dst + x ] = ( raw[ src + x ]! + out[ prev + x ]! ) & 255;

		} else {

			for ( let x = 0; x < stride; x ++ ) {

				const a = x >= 4 ? out[ dst + x - 4 ]! : 0, b = y > 0 ? out[ prev + x ]! : 0, c = x >= 4 && y > 0 ? out[ prev + x - 4 ]! : 0;
				let v = raw[ src + x ]!;
				if ( f === 1 ) v += a;
				else if ( f === 3 ) v += ( a + b ) >> 1;
				else if ( f === 4 ) {

					const pp = a + b - c, pa = Math.abs( pp - a ), pb = Math.abs( pp - b ), pc = Math.abs( pp - c );
					v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;

				}

				out[ dst + x ] = v & 255;

			}

		}

	}

	return { width, height, data: out };

}

/** Decoded RGBA8 image as a three.js texture (sRGB colour for the albedo, linear data otherwise). */
export function whaleTexture( img:{ width:number; height:number; data:Uint8Array }, srgb:boolean, label = '' ) {

	const tex = new DataTexture( img.data, img.width, img.height, RGBAFormat, UnsignedByteType );
	tex.name = label;
	tex.colorSpace = srgb ? SRGBColorSpace : LinearSRGBColorSpace;
	tex.wrapS = tex.wrapT = ClampToEdgeWrapping;
	tex.magFilter = LinearFilter;
	tex.minFilter = LinearMipmapLinearFilter;
	tex.generateMipmaps = true;
	tex.anisotropy = 8;
	tex.needsUpdate = true;
	return tex;

}

export async function loadTexture( url:string, srgb:boolean ) {

	const buf = await fetch( url ).then( ( r ) => r.arrayBuffer() );
	const img = await decodePNG( buf );
	// sampled with the shared anisotropic clamp sampler (was ClampToEdge, trilinear, anisotropy 8)
	return whaleTexture( img, srgb, url.split( '/' ).pop() );

}
