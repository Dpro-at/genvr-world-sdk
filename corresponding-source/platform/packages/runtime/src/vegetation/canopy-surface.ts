/** Tidewater VegMaterials.js / VegNodes.js 4811ba48, ©2026 DRG Software Solutions LLC, MIT.
 * See LICENSE-tidewater.md. Exact source canopy palette and surface helpers, in linear RGB.
 * Standalone dependencies included once; concatenate a caller entry function before this string.
 * vegCoverageThreshold uses derivatives and is fragment-stage only. No lighting or mask policy.
 */
export const CANOPY_SURFACE_WGSL = `
fn sat(x:f32)->f32{return clamp(x,0.0,1.0);}
fn luminance( c: vec3f ) -> f32 { return dot( c, vec3f( 0.2126, 0.7152, 0.0722 ) ); }
fn vegHash12( p: vec2f ) -> f32 {
	var p3 = fract( vec3f( p.x, p.y, p.x ) * 0.1031 );
	p3 += dot( p3, p3.yzx + 33.33 );
	return fract( ( p3.x + p3.y ) * p3.z );
}

fn vegNoise( p: vec2f ) -> f32 {
	let i = floor( p );
	let fr = fract( p );
	let u = fr * fr * ( fr * -2.0 + 3.0 );
	let a = vegHash12( i );
	let b = vegHash12( i + vec2f( 1.0, 0.0 ) );
	let c = vegHash12( i + vec2f( 0.0, 1.0 ) );
	let d = vegHash12( i + vec2f( 1.0, 1.0 ) );
	return mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y );
}


fn vegPick4( s4: f32, a: vec3f, b: vec3f, c: vec3f, d: vec3f ) -> vec3f { return select( select( select( d, c, s4 < 2.5 ), b, s4 < 1.5 ), a, s4 < 0.5 ); }
fn vegPick3( s3: f32, a: vec3f, b: vec3f, c: vec3f ) -> vec3f { return select( select( c, b, s3 < 1.5 ), a, s3 < 0.5 ); }
fn vegTreeSpecies( seed: f32 ) -> f32 { return floor( fract( seed * 5.31 ) * 4.0 ); }
// shrubs: 0 sea grape 45 %, 1 croton 15 %, 2 hibiscus 40 %
fn vegShrubSpecies( seed: f32 ) -> f32 {
	let h = fract( seed * 3.17 );
	return select( select( 2.0, 1.0, h < 0.6 ), 0.0, h < 0.45 );
}

// base leaf colour of an instance (species, per-card random cr, per-instance tint)
fn vegCanopyLeafColor( seed: f32, cr: f32, isShrub: bool ) -> vec3f {
	let spT = vegTreeSpecies( seed ); let spS = vegShrubSpecies( seed );
	// tree species: dark glossy (bronze flush), fresh mid green, yellow-green, blue-green
	// (Caribbean hillside forest: deep, olive and yellow-greens, muted, with a few dry / bronze
	// and flowering crowns)
	let t0 = mix( mix( vec3f( 0.021219, 0.042311, 0.010960 ), vec3f( 0.036889, 0.068478, 0.016807 ), cr ), vec3f( 0.111932, 0.068478, 0.027321 ), smoothstep( 0.96, 0.995, cr ) * 0.5 );
	let t1 = mix( vec3f( 0.034340, 0.066626, 0.013702 ), vec3f( 0.064803, 0.107023, 0.020289 ), cr );
	let t2 = mix( vec3f( 0.078187, 0.102242, 0.020289 ), vec3f( 0.127438, 0.144128, 0.030713 ), cr );
	let t3 = mix( vec3f( 0.023153, 0.043735, 0.023153 ), vec3f( 0.042311, 0.068478, 0.036889 ), cr );
	let s0 = mix( vec3f( 0.049707, 0.090842, 0.015996 ), vec3f( 0.084376, 0.132868, 0.023153 ), cr );
	let s1 = mix( vec3f( 0.025187, 0.054480, 0.012983 ), vec3f( 0.057805, 0.093059, 0.013702 ), cr );
	let s2 = mix( vec3f( 0.034340, 0.084376, 0.011612 ), vec3f( 0.061246, 0.132868, 0.017642 ), cr );
	let iv = vegHash12( vec2f( seed * 17.3, 4.1 ) );
	let iv2 = vegHash12( vec2f( seed * 5.9, 8.3 ) );
	var c = select( vegPick4( spT, t0, t1, t2, t3 ), vegPick3( spS, s0, s1, s2 ), isShrub ) * ( iv * 0.36 + 0.74 );
	// a few trees dry / dropping leaves (brown-olive), or flowering (flamboyant, orange-red)
	let treeK = select( 1.0, 0.0, isShrub );
	let dry = step( iv2, 0.035 ) * treeK;
	c = mix( c, mix( vec3f( 0.107023, 0.084376, 0.034340 ), vec3f( 0.155926, 0.102242, 0.042311 ), cr ), dry * 0.5 );
	let flower = step( 0.988, iv2 ) * treeK * step( 0.5, cr );
	c = mix( c, vec3f( 0.254152, 0.068478, 0.025187 ), flower * 0.5 );
	return mix( vec3f( luminance( c ) ), c, 0.85 );
}

fn vegBarkColor( n: f32, n2: f32 ) -> vec3f {
	return mix( mix( vec3f( 0.029557, 0.023153, 0.015996 ), vec3f( 0.107023, 0.090842, 0.066626 ), n * 0.6 + n2 * 0.4 ), vec3f( 0.198069, 0.198069, 0.144128 ), smoothstep( 0.64, 0.8, n2 ) * 0.3 );
}

// leaf-cluster tile of a card: trees broad / narrow leaves by species, shrubs round / narrow
fn vegLeafTile( seed: f32, isShrub: bool ) -> f32 {
	let spT = vegTreeSpecies( seed ); let spS = vegShrubSpecies( seed );
	return select( select( 0.0, 1.0, fract( spT * 0.5 ) > 0.25 ), select( 2.0, 3.0, spS == 1.0 ), isShrub );
}

// alpha-test threshold compensating the coverage loss of the minified (mipmapped) leaf texture
fn vegCoverageThreshold( st: vec2f ) -> f32 {
	let lod = log2( max( max( fwidth( st.x ), fwidth( st.y ) ) * 256.0, 1e-4 ) );
	return mix( 0.5, 0.3, sat( lod / 4.0 ) );
}

// Runtime colour of an impostor fragment (same palette as the near canopy)
fn vegImpostorColor( seed: f32, cr: f32, leaf: f32, bright: f32, isGroup1: bool ) -> vec3f {
	let leafC = vegCanopyLeafColor( seed, cr, isGroup1 ) * ( bright * 1.4 );
	// limbs and twigs seen through the crown gaps are in the crown's shade: dark and a little
	// green-brown, and the leaves dominate the blend (grey limbs made far crowns read grey-beige)
	let barkC = mix( vec3f( 0.011612, 0.010330, 0.006512 ), vec3f( 0.027321, 0.024158, 0.014444 ), ( bright - 0.4 ) / 0.5 );
	let c = mix( barkC, leafC, smoothstep( 0.05, 0.55, leaf ) );
	// far crowns keep their green through the haze (a little more saturated than the near canopy)
	return max( mix( vec3f( luminance( c ) ), c, 1.25 ), vec3f( 0.0 ) );
}
`;
