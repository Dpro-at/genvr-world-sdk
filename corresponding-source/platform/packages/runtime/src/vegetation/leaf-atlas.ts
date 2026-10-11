/** Tidewater LeafTextures.js4811ba48, ©2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { TSL, UnsignedByteType, LinearMipmapLinearFilter, LinearFilter, RepeatWrapping, type WebGPURenderer } from 'three/webgpu';
import { PostPass } from '../post/pass.js';
/* eslint-disable @typescript-eslint/no-explicit-any -- TSL atlas graph boundary */
type N = any;
export const LEAF_ATLAS_SIZE = 1024;
export const LEAF_TILES = [
 {grid:4,leaves:6,width:.34},{grid:4,leaves:8,width:.2},
 {grid:3,leaves:6,width:.45},{grid:3,leaves:8,width:.22},
] as const;
/** Source bake body, four samples per texel; input st is bottom-up card space. */
export const LEAF_BAKE_WGSL = `fn twLeafBake( st: vec2f ) -> vec4f {
	// three's quad uv: v up

	let tile = floor( st * 2.0 );
	let tid = tile.x + tile.y * 2.0;
	let local = fract( st * 2.0 );
	var cov = 0.0; var bright = 0.0; var cellR = 0.0;
	if ( tid == 0.0 ) {
		{
			let q = local + vec2f( -0.00048828125, -0.00048828125 );
			let A = vegRosette( q, 4.0, 6.0, 0.34, 0.0 );
			let B = vegRosette( q + 0.125, 4.0, 6.0, 0.34, 2.1 );
			let inA = A.d > 0.0; let inB = B.d > 0.0;
			if ( inA || inB ) {
				cov += 0.25;
				bright += select( B.bright, A.bright, inA ) * 0.25;
				cellR += select( B.cell, A.cell, inA ) * 0.25;
			}
		}
		{
			let q = local + vec2f( 0.00048828125, -0.00048828125 );
			let A = vegRosette( q, 4.0, 6.0, 0.34, 0.0 );
			let B = vegRosette( q + 0.125, 4.0, 6.0, 0.34, 2.1 );
			let inA = A.d > 0.0; let inB = B.d > 0.0;
			if ( inA || inB ) {
				cov += 0.25;
				bright += select( B.bright, A.bright, inA ) * 0.25;
				cellR += select( B.cell, A.cell, inA ) * 0.25;
			}
		}
		{
			let q = local + vec2f( -0.00048828125, 0.00048828125 );
			let A = vegRosette( q, 4.0, 6.0, 0.34, 0.0 );
			let B = vegRosette( q + 0.125, 4.0, 6.0, 0.34, 2.1 );
			let inA = A.d > 0.0; let inB = B.d > 0.0;
			if ( inA || inB ) {
				cov += 0.25;
				bright += select( B.bright, A.bright, inA ) * 0.25;
				cellR += select( B.cell, A.cell, inA ) * 0.25;
			}
		}
		{
			let q = local + vec2f( 0.00048828125, 0.00048828125 );
			let A = vegRosette( q, 4.0, 6.0, 0.34, 0.0 );
			let B = vegRosette( q + 0.125, 4.0, 6.0, 0.34, 2.1 );
			let inA = A.d > 0.0; let inB = B.d > 0.0;
			if ( inA || inB ) {
				cov += 0.25;
				bright += select( B.bright, A.bright, inA ) * 0.25;
				cellR += select( B.cell, A.cell, inA ) * 0.25;
			}
		}
	}
	if ( tid == 1.0 ) {
		{
			let q = local + vec2f( -0.00048828125, -0.00048828125 );
			let A = vegRosette( q, 4.0, 8.0, 0.2, 0.0 );
			let B = vegRosette( q + 0.125, 4.0, 8.0, 0.2, 2.1 );
			let inA = A.d > 0.0; let inB = B.d > 0.0;
			if ( inA || inB ) {
				cov += 0.25;
				bright += select( B.bright, A.bright, inA ) * 0.25;
				cellR += select( B.cell, A.cell, inA ) * 0.25;
			}
		}
		{
			let q = local + vec2f( 0.00048828125, -0.00048828125 );
			let A = vegRosette( q, 4.0, 8.0, 0.2, 0.0 );
			let B = vegRosette( q + 0.125, 4.0, 8.0, 0.2, 2.1 );
			let inA = A.d > 0.0; let inB = B.d > 0.0;
			if ( inA || inB ) {
				cov += 0.25;
				bright += select( B.bright, A.bright, inA ) * 0.25;
				cellR += select( B.cell, A.cell, inA ) * 0.25;
			}
		}
		{
			let q = local + vec2f( -0.00048828125, 0.00048828125 );
			let A = vegRosette( q, 4.0, 8.0, 0.2, 0.0 );
			let B = vegRosette( q + 0.125, 4.0, 8.0, 0.2, 2.1 );
			let inA = A.d > 0.0; let inB = B.d > 0.0;
			if ( inA || inB ) {
				cov += 0.25;
				bright += select( B.bright, A.bright, inA ) * 0.25;
				cellR += select( B.cell, A.cell, inA ) * 0.25;
			}
		}
		{
			let q = local + vec2f( 0.00048828125, 0.00048828125 );
			let A = vegRosette( q, 4.0, 8.0, 0.2, 0.0 );
			let B = vegRosette( q + 0.125, 4.0, 8.0, 0.2, 2.1 );
			let inA = A.d > 0.0; let inB = B.d > 0.0;
			if ( inA || inB ) {
				cov += 0.25;
				bright += select( B.bright, A.bright, inA ) * 0.25;
				cellR += select( B.cell, A.cell, inA ) * 0.25;
			}
		}
	}
	if ( tid == 2.0 ) {
		{
			let q = local + vec2f( -0.00048828125, -0.00048828125 );
			let A = vegRosette( q, 3.0, 6.0, 0.45, 0.0 );
			let B = vegRosette( q + 0.16666666666666666, 3.0, 6.0, 0.45, 2.1 );
			let inA = A.d > 0.0; let inB = B.d > 0.0;
			if ( inA || inB ) {
				cov += 0.25;
				bright += select( B.bright, A.bright, inA ) * 0.25;
				cellR += select( B.cell, A.cell, inA ) * 0.25;
			}
		}
		{
			let q = local + vec2f( 0.00048828125, -0.00048828125 );
			let A = vegRosette( q, 3.0, 6.0, 0.45, 0.0 );
			let B = vegRosette( q + 0.16666666666666666, 3.0, 6.0, 0.45, 2.1 );
			let inA = A.d > 0.0; let inB = B.d > 0.0;
			if ( inA || inB ) {
				cov += 0.25;
				bright += select( B.bright, A.bright, inA ) * 0.25;
				cellR += select( B.cell, A.cell, inA ) * 0.25;
			}
		}
		{
			let q = local + vec2f( -0.00048828125, 0.00048828125 );
			let A = vegRosette( q, 3.0, 6.0, 0.45, 0.0 );
			let B = vegRosette( q + 0.16666666666666666, 3.0, 6.0, 0.45, 2.1 );
			let inA = A.d > 0.0; let inB = B.d > 0.0;
			if ( inA || inB ) {
				cov += 0.25;
				bright += select( B.bright, A.bright, inA ) * 0.25;
				cellR += select( B.cell, A.cell, inA ) * 0.25;
			}
		}
		{
			let q = local + vec2f( 0.00048828125, 0.00048828125 );
			let A = vegRosette( q, 3.0, 6.0, 0.45, 0.0 );
			let B = vegRosette( q + 0.16666666666666666, 3.0, 6.0, 0.45, 2.1 );
			let inA = A.d > 0.0; let inB = B.d > 0.0;
			if ( inA || inB ) {
				cov += 0.25;
				bright += select( B.bright, A.bright, inA ) * 0.25;
				cellR += select( B.cell, A.cell, inA ) * 0.25;
			}
		}
	}
	if ( tid == 3.0 ) {
		{
			let q = local + vec2f( -0.00048828125, -0.00048828125 );
			let A = vegRosette( q, 3.0, 8.0, 0.22, 0.0 );
			let B = vegRosette( q + 0.16666666666666666, 3.0, 8.0, 0.22, 2.1 );
			let inA = A.d > 0.0; let inB = B.d > 0.0;
			if ( inA || inB ) {
				cov += 0.25;
				bright += select( B.bright, A.bright, inA ) * 0.25;
				cellR += select( B.cell, A.cell, inA ) * 0.25;
			}
		}
		{
			let q = local + vec2f( 0.00048828125, -0.00048828125 );
			let A = vegRosette( q, 3.0, 8.0, 0.22, 0.0 );
			let B = vegRosette( q + 0.16666666666666666, 3.0, 8.0, 0.22, 2.1 );
			let inA = A.d > 0.0; let inB = B.d > 0.0;
			if ( inA || inB ) {
				cov += 0.25;
				bright += select( B.bright, A.bright, inA ) * 0.25;
				cellR += select( B.cell, A.cell, inA ) * 0.25;
			}
		}
		{
			let q = local + vec2f( -0.00048828125, 0.00048828125 );
			let A = vegRosette( q, 3.0, 8.0, 0.22, 0.0 );
			let B = vegRosette( q + 0.16666666666666666, 3.0, 8.0, 0.22, 2.1 );
			let inA = A.d > 0.0; let inB = B.d > 0.0;
			if ( inA || inB ) {
				cov += 0.25;
				bright += select( B.bright, A.bright, inA ) * 0.25;
				cellR += select( B.cell, A.cell, inA ) * 0.25;
			}
		}
		{
			let q = local + vec2f( 0.00048828125, 0.00048828125 );
			let A = vegRosette( q, 3.0, 8.0, 0.22, 0.0 );
			let B = vegRosette( q + 0.16666666666666666, 3.0, 8.0, 0.22, 2.1 );
			let inA = A.d > 0.0; let inB = B.d > 0.0;
			if ( inA || inB ) {
				cov += 0.25;
				bright += select( B.bright, A.bright, inA ) * 0.25;
				cellR += select( B.cell, A.cell, inA ) * 0.25;
			}
		}
	}

	// colour channels are stored un-premultiplied (valid where covered)
	let inv = 1.0 / max( cov, 1e-3 );
	return vec4f( cov, bright * inv / 1.4, cellR * inv, 1.0 );
}


struct VegRosette { d: f32, bright: f32, cell: f32 };
fn vegRosette( st: vec2f, G: f32, nLeaves: f32, width: f32, rot: f32 ) -> VegRosette {
	let cuv = st * G;
	let cell = floor( cuv );
	let h1 = vegHash12( cell + rot * 17.3 );
	let h2 = vegHash12( cell * 1.7 + rot * 31.1 + 5.2 );
	let h3 = vegHash12( cell * 2.3 + rot * 7.7 + 1.9 );
	// whorls of different sizes, off the cell centres; some cells stay empty (sky holes)
	let sc = mix( 0.62, 1.05, h2 ) * select( 1.0, 0.001, h3 < 0.2 );
	let off = vec2f( h1 - 0.5, h3 - 0.5 ) * 0.34;
	let p = ( fract( cuv ) - 0.5 - off ) * 2.0 / sc;
	let r = length( p );
	let ang = atan2( p.y, p.x ) + rot + h1 * 6.2832;
	let sector = ang * ( nLeaves / 6.2832 );
	let k = floor( sector + 0.5 );
	// irregular leaf spacing and lengths so clusters don't read as flowers
	let lr = vegHash12( vec2f( k, h1 * 13.7 ) );
	let jit = ( lr - 0.5 ) * 0.8;
	let L = mix( 0.5, 1.0, fract( lr * 7.13 ) );
	// each blade curves a little to one side (leaves, not a star)
	let curve = ( fract( lr * 3.31 ) - 0.5 ) * 0.9;
	let da = ( sector - k - jit ) * ( 6.2832 / nLeaves ) - curve * ( r / L ) * ( r / L ) * 0.35;
	let along = r * cos( da );
	let across = abs( r * sin( da ) );
	let x = along / L;
	let bx = clamp( ( x - 0.18 ) / 0.82, 0.0, 1.0 ); // blade after a short petiole
	// obovate (widest beyond the middle) with a short pointed tip
	let shape = pow( max( sin( pow( bx, 0.62 ) * 3.14159 ), 0.0 ), 0.8 ) * ( smoothstep( 1.0, 0.86, bx ) * 0.25 + 0.75 );
	let hw = shape * width * L;
	let inBlade = x > 0.16 && x < 1.0;
	let dBlade = select( -1.0, hw - across, inBlade );
	let dPet = select( -1.0, 0.012 - across, x < 0.2 );
	var o: VegRosette;
	o.d = max( dBlade, dPet );
	let vein = smoothstep( 0.03, 0.0, across ) * smoothstep( 0.05, 0.25, bx ) * smoothstep( 1.0, 0.7, bx );
	o.bright = ( ( h1 * 0.7 + lr * 0.3 ) * 0.22 + 0.88 ) * mix( 0.82, 1.08, bx ) * ( vein * 0.09 + 1.0 );
	o.cell = h1 * 0.7 + lr * 0.3;
	return o;
}


fn vegHash12( p: vec2f ) -> f32 {
	var p3 = fract( vec3f( p.x, p.y, p.x ) * 0.1031 );
	p3 += dot( p3, p3.yzx + 33.33 );
	return fract( ( p3.x + p3.y ) * p3.z );
}`;
export class LeafAtlas {
 readonly pass:PostPass;
 private baked=false;
 private disposed=false;
 constructor(renderer:WebGPURenderer) {
  const t=TSL as N;
  this.pass=new PostPass(renderer,t.wgslFn(LEAF_BAKE_WGSL)({st:t.uv()}),'vegetation-leaf-atlas',LEAF_ATLAS_SIZE,LEAF_ATLAS_SIZE);
  const texture=this.pass.texture;
  texture.type=UnsignedByteType;
  texture.generateMipmaps=true;
  texture.minFilter=LinearMipmapLinearFilter;texture.magFilter=LinearFilter;
  texture.wrapS=texture.wrapT=RepeatWrapping;texture.anisotropy=4;
 }
 get texture(){return this.pass.texture;}
 bake():void {
  if(this.disposed)throw new Error('Leaf atlas is disposed');
  if(this.baked)return;
  this.pass.update();this.baked=true;
 }
 /** Preserve the source top-row render-target storage versus bottom-up card coordinates. */
 sample(st:N,tile:N):N {
  const t=TSL as N;
  const uv=t.vec2(t.fract(t.mul(tile,.5)).mul(2),t.floor(t.mul(tile,.5))).add(t.clamp(st,.004,.996)).mul(.5);
  return t.texture(this.texture,t.vec2(uv.x,uv.y.oneMinus()));
 }
 dispose():void{if(this.disposed)return;this.disposed=true;this.pass.dispose();}
}
