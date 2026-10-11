/** Tidewater VegMaterials.js 4811ba48, ©2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { TSL } from 'three/webgpu';
/* eslint-disable @typescript-eslint/no-explicit-any -- native TSL graph boundary */
type N = any;
/** Source linear albedo and geometric cutout. Caller must combine cutout with LOD dither.
 * Fragment-stage only: leaflet widening uses screen-space derivatives. Does not apply
 * lighting, underside tint, bark bump, roughness or shadowed leaf transmission. */
export const PLANT_SURFACE_WGSL = `
fn twPlantSurface(st:vec2f,aMat:vec4f,iDat:vec4f,trunkY:f32,heightGround:f32)->vec4f{
 let keep=vegPlantMask(st,aMat,iDat);
 return vec4f(vegPlantAlbedo(st,aMat,iDat,trunkY,heightGround),select(0.0,1.0,keep));
}
fn sat(x:f32)->f32{return clamp(x,0.0,1.0);}
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

struct VegBark { bark: vec3f, hd: f32 };
// (the last evaluation is remembered: the albedo and the trunk bump both ask for the same point)
var<private> vegBarkMemoKey: vec4f = vec4f( 3.0e38 );
var<private> vegBarkMemoIv: f32 = 3.0e38;
var<private> vegBarkMemo: VegBark;
fn vegPalmBark( y: f32, a: f32, H: f32, seed: f32, iv: f32 ) -> VegBark {
	let key = vec4f( y, a, H, seed );
	if ( all( key == vegBarkMemoKey ) && iv == vegBarkMemoIv ) { return vegBarkMemo; }
	vegBarkMemoKey = key;
	vegBarkMemoIv = iv;
	vegBarkMemo = _vegPalmBark( y, a, H, seed, iv );
	return vegBarkMemo;
}
fn _vegPalmBark( y: f32, a: f32, H: f32, seed: f32, iv: f32 ) -> VegBark {
	let A = a * 6.2832;
	let ca = cos( A ); let sa = sin( A );
	let yn = y / H;
	// rings: phase grows faster toward the crown, jittered per ring band and around the trunk
	let wob = ( vegNoise( vec2f( ca * 1.3 + y * 0.35, sa * 1.3 + seed * 9.0 ) ) - 0.5 ) * 0.7
		+ sin( A * 2.0 + y * 1.1 + seed * 5.0 ) * 0.1;
	let phase = y * mix( 8.5, 11.0, iv ) + pow( yn, 2.2 ) * H * 5.5 + vegNoise( vec2f( y * 0.8, seed * 7.3 ) ) * 3.2
		+ vegNoise( vec2f( y * 3.1, seed * 2.9 ) ) * 0.9 + wob;
	let k0 = floor( phase );
	// ragged ring edges: the scar line wanders a little around the trunk
	let phaseR = phase + ( vegNoise( vec2f( a * 38.0, k0 * 2.3 + seed * 5.0 ) ) - 0.5 ) * 0.22;
	let k = floor( phaseR );
	let fr = phaseR - k;
	// each ring scar has its own width and depth
	let rk = vegHash12( vec2f( k, seed * 13.7 ) );
	let gw = mix( 0.05, 0.14, rk );
	let groove = ( smoothstep( gw, 0.0, fr ) + smoothstep( 1.0 - gw * 0.6, 1.0, fr ) ) * mix( 0.45, 1.0, vegHash12( vec2f( k * 1.3, seed * 3.1 ) ) );
	let ridge = smoothstep( 0.07, 0.15, fr ) * smoothstep( 0.45, 0.16, fr );
	// partial rings: each ring fades out around part of the circumference
	let amp = smoothstep( 0.28, 0.6, vegNoise( vec2f( ca * 1.8 + k * 3.17, sa * 1.8 + k * 1.71 + seed * 11.0 ) ) ) * 0.75 + 0.25;
	// fine vertical fissures (level set of a vertically stretched noise) and bark plates
	let nf = vegNoise( vec2f( a * 54.0, y * 1.6 + seed * 41.0 ) );
	let nf2 = vegNoise( vec2f( a * 110.0, y * 3.4 + seed * 29.0 ) );
	// fissures: short, broken vertical splits (not continuous grain lines)
	let segA = smoothstep( 0.45, 0.62, vegNoise( vec2f( a * 30.0, y * 4.5 + seed * 9.0 ) ) );
	let segB = smoothstep( 0.5, 0.66, vegNoise( vec2f( a * 60.0 + 3.7, y * 9.0 + seed * 21.0 ) ) );
	let crack = max( smoothstep( 0.09, 0.0, abs( nf - 0.5 ) ) * segA, smoothstep( 0.06, 0.0, abs( nf2 - 0.5 ) ) * segB * 0.7 );
	let plate = vegNoise( vec2f( a * 24.0, y * 3.5 + seed * 17.0 ) );
	let blotch = vegNoise( vec2f( a * 6.0, y * 0.4 + seed * 13.0 ) );
	// grey-brown bark weathering to silver-grey, per palm
	var bark = mix( vec3f( 0.111932, 0.090842, 0.068478 ), vec3f( 0.371238, 0.323143, 0.246201 ), sat( blotch * 0.55 + plate * 0.25 + ( iv - 0.5 ) * 0.5 + yn * 0.15 ) );
	// warmer tan on some trees and in patches, dark weathered (rain-soaked) blotches
	bark = mix( bark, bark * vec3f( 1.12, 1.0, 0.82 ), sat( ( vegNoise( vec2f( a * 4.0, y * 0.25 + seed * 31.0 ) ) - 0.4 ) * 2.0 ) * iv );
	bark = bark * mix( 1.0, 0.72, smoothstep( 0.6, 0.8, vegNoise( vec2f( a * 5.0, y * 0.7 + seed * 43.0 ) ) ) );
	// fine mottling (rough, fibrous surface) and pale sun-bleached patches
	let mott = vegNoise( vec2f( a * 90.0, y * 80.0 + seed * 7.0 ) ) * 0.6 + vegNoise( vec2f( a * 35.0, y * 30.0 + seed * 3.0 ) ) * 0.4;
	bark = bark * ( mott * 0.45 + 0.78 ) * ( plate * 0.25 + 0.88 );
	bark = mix( bark, vec3f( 0.450786, 0.417885, 0.346704 ), smoothstep( 0.55, 0.75, vegNoise( vec2f( a * 8.0, y * 1.3 + seed * 61.0 ) ) ) * 0.35 * ( 1.0 - yn * 0.5 ) );
	bark = bark * mix( 1.0, 0.7, groove * amp ) * ( ridge * amp * 0.1 + 1.0 ) * mix( 1.0, 0.5, crack );
	// lichen: pale grey-green crusts and white spots, a little orange; darker rain streaks
	let lic = smoothstep( 0.6, 0.72, vegNoise( vec2f( a * 9.0, y * 2.1 + seed * 23.0 ) ) + ( vegNoise( vec2f( a * 31.0, y * 7.0 ) ) - 0.5 ) * 0.3 ) * smoothstep( 0.9, 0.2, yn );
	let licC = mix( vec3f( 0.270498, 0.283149, 0.212231 ), vec3f( 0.396755, 0.386429, 0.318547 ), plate );
	bark = mix( bark, licC, lic * 0.5 );
	let streak = smoothstep( 0.62, 0.8, vegNoise( vec2f( a * 16.0, y * 0.12 + seed * 5.0 ) ) ) * smoothstep( 1.0, 0.6, yn );
	bark = bark * ( 1.0 - streak * 0.28 );
	// damp, dark base (splash of sand and soil) and the mass of exposed roots at the ground
	let baseK = smoothstep( 1.4, 0.2, y + ( blotch - 0.5 ) * 0.8 );
	bark = mix( bark, bark * vec3f( 0.62, 0.56, 0.48 ), baseK );
	let rootN = vegNoise( vec2f( a * 26.0, y * 2.2 + seed * 19.0 ) );
	let roots = smoothstep( 0.42, 0.05, y ) * smoothstep( 0.35, 0.6, rootN );
	bark = mix( bark, mix( vec3f( 0.042311, 0.027321, 0.015996 ), vec3f( 0.111932, 0.068478, 0.036889 ), rootN ), smoothstep( 0.5, 0.0, y ) * 0.85 );
	// fibrous old frond bases (boot) under the crown: criss-cross fibre mat, brown
	let boot = smoothstep( H - 1.0, H - 0.35, y + ( blotch - 0.5 ) * 0.3 );
	let fib = sin( A * 34.0 + y * 30.0 ) * sin( A * 34.0 - y * 30.0 ) * 0.5 + 0.5;
	bark = mix( bark, mix( vec3f( 0.074214, 0.038204, 0.015996 ), vec3f( 0.254152, 0.174647, 0.072272 ), fib * 0.6 + plate * 0.4 ), boot );
	var o: VegBark;
	o.bark = bark;
	o.hd = ( ridge * amp * 0.004 - groove * amp * 0.008 - crack * 0.006 + plate * 0.004 + mott * 0.004 + roots * 0.01 ) * ( 1.0 - boot ) + boot * fib * 0.004;
	return o;
}

// Broadleaf plants (parts 6 monstera, 7 elephant ear, 8 heliconia leaf, 9 heliconia bract). Blade
// coordinates: y along the midrib (0 back of the basal lobes .. 1 tip), x across in units of the
// half-width W (m). Returns the outline half-width (x units) at y and whether a hole / slit / tear is
// cut at (y, x).
struct VegBroad { w: f32, cut: bool };
fn vegBroadShape( part: f32, y: f32, x: f32, age: f32, W: f32, fseed: f32, seed: f32 ) -> VegBroad {
	let ax = abs( x );
	var w = 0.0;
	var cut = false;
	// ragged, slightly irregular margin on every leaf (more on old ones)
	let rag = 1.0 - ( vegNoise( vec2f( y * 38.0 + select( 0.0, 17.0, x > 0.0 ), fseed * 31.0 ) ) * 0.05 + age * age * 0.12 * vegNoise( vec2f( y * 11.0, fseed * 7.0 + x ) ) );
	if ( part < 6.5 ) {
		// monstera: cordate blade, basal lobes behind the petiole, V sinus; mature leaves are split
		// from the margin between the primary veins, with a row of holes (fenestrations) inside
		let yb = 0.16;
		let g = ( y - yb ) / ( 1.0 - yb );
		if ( y >= yb ) {
			w = pow( max( sin( 3.14159 * min( 1.0, 0.4 + 0.6 * g ) ), 0.0 ), 0.8 ) * ( 1.0 - 0.15 * smoothstep( 0.8, 1.0, g ) );
		} else {
			let q = ( yb - y ) / yb;
			w = sqrt( max( 1.0 - q * q * q, 0.0 ) ) * 0.96;
			cut = ax < 0.3 * ( 1.0 - y / yb );
		}
		w *= rag;
		let matK = smoothstep( 0.28, 0.45, age );
		if ( matK > 0.0 && y > yb * 0.4 && y < 0.93 ) {
			let L = W / 0.47;
			let X = ax * W;
			let Y = ( y - yb ) * L;
			let p = ( Y - 0.55 * X ) / ( L * 0.8 / 5.5 ) + fseed * 0.37;
			let k = floor( p + 0.5 );
			let e = abs( p - k ); // 0 on the gap between two primary veins
			let hk = vegHash12( vec2f( k + select( 0.0, 50.0, x > 0.0 ), fseed * 19.3 ) );
			let r = ax / max( w, 0.05 );
			let depth = mix( 0.42, 0.75, hk ) + ( 1.0 - matK ) * 0.4;
			// slits widen toward the margin, their inner end rounded
			let slit = e < 0.035 + 0.1 * smoothstep( depth, 1.0, r ) && r > depth - 0.03;
			// fenestrations: one or two elongated holes along the gap line, inside the slit
			let r0 = 0.14; let r1 = depth - 0.1;
			let qh = ( r - r0 ) / max( r1 - r0, 0.05 );
			let nh = select( 1.0, 2.0, hk > 0.45 );
			let qq = fract( qh * nh );
			let hole = qh > 0.0 && qh < 1.0 && e < 0.16 * pow( sin( 3.14159 * qq ), 0.6 ) * matK && hk > 0.12;
			cut = cut || slit || hole;
		}
	} else if ( part < 7.5 ) {
		// elephant ear: peltate blade (petiole joins inside it), rounded basal lobes, acute tip
		let yb = 0.3;
		let g = ( y - yb ) / ( 1.0 - yb );
		if ( y >= yb ) {
			w = pow( max( sin( 3.14159 * min( 1.0, 0.5 + 0.5 * g ) ), 0.0 ), 0.85 );
		} else {
			let q = ( yb - y ) / yb;
			w = sqrt( max( 1.0 - pow( q, 1.6 ), 0.0 ) ) * 0.98;
			cut = y < 0.1 && ax < 0.2 * ( 1.0 - y / 0.1 );
		}
		w *= rag;
	} else if ( part < 8.5 || ( part > 9.5 && part < 10.5 ) ) {
		// heliconia / bird of paradise: paddle blade, torn along the lateral veins (more on old leaves)
		w = pow( max( sin( 3.14159 * min( y * 1.02, 1.0 ) ), 0.0 ), 0.5 ) * ( 1.0 - 0.3 * smoothstep( 0.75, 1.0, y ) ) * rag;
		let xl = y * 22.0 + ax * 1.2 + sin( y * 31.0 + fseed * 10.0 ) * 0.3;
		let k = floor( xl );
		let r1 = vegHash12( vec2f( k + select( 0.0, 40.0, x > 0.0 ), fseed * 7.7 ) );
		let r2 = vegHash12( vec2f( k + 0.5, fseed * 3.3 + seed ) );
		let fx = abs( fract( xl ) - 0.5 );
		cut = r1 < select( 0.12, 0.2, part > 9.5 ) + age * 0.45 && ax / max( w, 0.05 ) > mix( 0.25, 0.8, r2 ) && fx > 0.44;
	} else if ( part < 9.5 ) {
		// bract: boat-shaped, pointed
		w = sin( 3.14159 * min( 1.0, 0.15 + y * 0.9 ) ) * ( 1.0 - 0.4 * smoothstep( 0.7, 1.0, y ) );
	} else {
		// bird of paradise flower pieces: pointed
		w = sin( 3.14159 * min( 1.0, 0.1 + y * 0.9 ) ) * ( 1.0 - 0.5 * smoothstep( 0.6, 1.0, y ) );
	}
	if ( part < 7.5 ) {
		let dmg = vegNoise( vec2f( y * 26.0 + fseed * 17.0, x * 11.0 + seed * 9.0 ) );
		cut = cut || dmg > 0.95 - age * 0.08;
	}
	var o: VegBroad;
	o.w = w;
	o.cut = cut;
	return o;
}

fn vegBroadAlbedo( part: f32, y: f32, x: f32, age: f32, W: f32, fseed: f32, seed: f32, iv: f32, hGround: f32 ) -> vec3f {
	let ax = abs( x );
	let fr = vegHash12( vec2f( fseed * 51.3, seed * 17.9 ) );
	let n1 = vegNoise( vec2f( y * 9.0 + fseed * 13.0, x * 4.0 ) );
	let n2 = vegNoise( vec2f( y * 37.0 + fseed * 3.0, x * 17.0 + seed * 5.0 ) );
	var c = vec3f( 0.0 );
	if ( part < 6.5 ) {
		// monstera: deep glossy green, juvenile leaves lighter yellow-green, old ones yellowing
		var g = mix( vec3f( 0.015996, 0.043735, 0.007499 ), vec3f( 0.031896, 0.078187, 0.012286 ), iv * 0.6 + fr * 0.4 );
		g = mix( vec3f( 0.078187, 0.158961, 0.021219 ), g, smoothstep( 0.1, 0.35, age ) );
		g = mix( g, vec3f( 0.323143, 0.283149, 0.048172 ), smoothstep( 0.85, 0.97, age ) * ( 0.6 + 0.4 * n1 ) );
		c = g * ( n1 * 0.16 + 0.92 );
		// primary veins a touch paler, midrib pale
		let L = W / 0.47;
		let p = ( ( y - 0.16 ) * L - 0.55 * ax * W ) / ( L * 0.8 / 5.5 ) + fseed * 0.37;
		let rib = smoothstep( 0.1, 0.0, abs( fract( p ) - 0.5 ) ) * step( 0.16, y );
		c = c * ( 1.0 + rib * 0.12 );
		c = mix( c, vec3f( 0.215861, 0.318547, 0.068478 ), smoothstep( 0.03, 0.0, ax * W ) * 0.7 );
	} else if ( part < 7.5 ) {
		// elephant ear: mid green, pale veins radiating from where the petiole joins
		var g = mix( vec3f( 0.033105, 0.097587, 0.012983 ), vec3f( 0.068478, 0.165132, 0.021219 ), iv * 0.6 + fr * 0.4 );
		g = mix( g, vec3f( 0.313989, 0.283149, 0.049707 ), smoothstep( 0.85, 0.97, age ) * ( 0.6 + 0.4 * n1 ) );
		let ang = atan2( ax * W, ( y - 0.3 ) * W / 0.4 );
		let vein = smoothstep( 0.1, 0.0, abs( fract( ang * 2.6 ) - 0.5 ) - 0.38 ) * 0.7;
		c = g * ( n1 * 0.14 + 0.93 );
		c = mix( c, vec3f( 0.212231, 0.304987, 0.097587 ), vein * 0.35 + smoothstep( 0.025, 0.0, ax * W ) * step( 0.3, y ) * 0.5 );
	} else if ( part > 10.5 ) {
		// bird of paradise flower: beak green-grey with a purple-red keel, orange sepals, blue tongue
		let beak = mix( mix( vec3f( 0.104616, 0.147027, 0.068478 ), vec3f( 0.147027, 0.028426, 0.042311 ), smoothstep( 0.3, 0.9, ax ) * 0.7 ), vec3f( 0.527115, 0.162029, 0.042311 ), smoothstep( 0.8, 1.0, y ) * 0.4 );
		let sepal = mix( vec3f( 0.745404, 0.174647, 0.011612 ), vec3f( 0.871367, 0.323143, 0.023153 ), n1 );
		let tongue = mix( vec3f( 0.025187, 0.049707, 0.323143 ), vec3f( 0.051269, 0.097587, 0.479320 ), n1 );
		return select( select( beak, sepal, age > 0.25 ), tongue, age > 0.75 );
	} else if ( part > 9.5 ) {
		// bird of paradise leaf: glaucous grey-green, pale midrib
		var g = mix( vec3f( 0.048172, 0.102242, 0.036889 ), vec3f( 0.078187, 0.144128, 0.056128 ), iv * 0.6 + fr * 0.4 );
		g = mix( g, vec3f( 0.274677, 0.254152, 0.068478 ), smoothstep( 0.8, 0.95, age ) );
		c = g * ( n1 * 0.1 + 0.95 );
		c = mix( c, vec3f( 0.366253, 0.391572, 0.187821 ), smoothstep( 0.015, 0.0, ax * W ) * 0.6 );
	} else if ( part < 8.5 ) {
		var g = mix( vec3f( 0.036889, 0.109462, 0.014444 ), vec3f( 0.070360, 0.168269, 0.022174 ), iv * 0.6 + fr * 0.4 );
		g = mix( g, vec3f( 0.274677, 0.254152, 0.042311 ), smoothstep( 0.8, 0.95, age ) );
		c = g * ( ( sin( y * 180.0 + ax * 30.0 ) * 0.5 + 0.5 ) * 0.06 + 0.95 ) * ( n1 * 0.12 + 0.94 );
		c = mix( c, vec3f( 0.401978, 0.479320, 0.155926 ), smoothstep( 0.02, 0.0, ax * W ) * 0.7 );
	} else {
		// heliconia bract: scarlet, yellow lip, green tip on the youngest (top) bracts
		c = mix( vec3f( 0.270498, 0.010330, 0.006049 ), vec3f( 0.508881, 0.023153, 0.010330 ), n1 * 0.6 + fr * 0.4 );
		c = mix( c, vec3f( 0.768151, 0.508881, 0.039546 ), smoothstep( 0.62, 0.9, ax ) );
		c = mix( c, vec3f( 0.149960, 0.254152, 0.027321 ), smoothstep( 0.8, 1.0, y ) * smoothstep( 0.6, 1.0, age ) * 0.7 );
		return c;
	}
	// weathering: browned dry margins and tips, fungal spots, splashed soil on low leaves
	let edge = smoothstep( 0.8, 1.0, ax + n2 * 0.25 - 0.1 ) * ( 0.25 + age * 0.9 );
	c = mix( c, mix( vec3f( 0.198069, 0.132868, 0.040915 ), vec3f( 0.102242, 0.059511, 0.021219 ), n2 ), sat( edge ) * 0.85 );
	let spot = vegNoise( vec2f( y * 14.0 + fseed * 9.0, x * 6.0 + seed * 3.0 ) );
	c = mix( c, vec3f( 0.111932, 0.088656, 0.033105 ), smoothstep( 0.86, 0.93, spot ) * 0.5 * ( 0.4 + age ) );
	c = mix( c, vec3f( 0.149960, 0.107023, 0.059511 ), smoothstep( 0.55, 0.0, hGround ) * smoothstep( 0.5, 0.75, n2 ) * 0.5 );
	// dead leaves: brown and papery
	c = mix( c, mix( vec3f( 0.155926, 0.093059, 0.034340 ), vec3f( 0.274677, 0.194618, 0.076185 ), n1 ), smoothstep( 0.93, 0.99, age ) );
	return c;
}

fn vegBroadStem( part: f32, a: f32, f: f32, seed: f32, age: f32 ) -> vec3f {
	let n = vegNoise( vec2f( a * 6.0, f * 30.0 + seed * 11.0 ) );
	if ( part < 6.5 ) { return mix( vec3f( 0.068478, 0.144128, 0.023153 ), vec3f( 0.107023, 0.201556, 0.033105 ), n ) * mix( 1.0, 0.8, smoothstep( 0.7, 1.0, age ) ); }
	if ( part < 7.5 ) { return mix( vec3f( 0.093059, 0.144128, 0.034340 ), vec3f( 0.109462, 0.068478, 0.045186 ), n * 0.5 ); }
	if ( part < 8.5 ) { return mix( mix( vec3f( 0.068478, 0.147027, 0.027321 ), vec3f( 0.119538, 0.184475, 0.042311 ), n ), vec3f( 0.102242, 0.068478, 0.029557 ), smoothstep( 0.6, 0.8, vegNoise( vec2f( a * 3.0, f * 8.0 + seed * 5.0 ) ) ) * 0.6 ); }
	if ( part > 9.5 ) { return mix( vec3f( 0.090842, 0.132868, 0.068478 ), vec3f( 0.152926, 0.181164, 0.097587 ), n ); }
	return vec3f( 0.270498, 0.010330, 0.006049 );
}

// alpha mask (fronds / pinnae / torn banana blades) + the LOD cross-fade of the instance
fn vegPlantMask( st: vec2f, aMat: vec4f, iDat: vec4f ) -> bool {

	let s = st.x;
	let t = st.y;
	let fwS = fwidth( s ); // evaluated in uniform control flow, before the branches

	let part = aMat.x; let age = aMat.y; let Ll = aMat.z; let fseed = aMat.w;
	let seed = iDat.w;
	var m = 1.0;
	if ( part > 0.5 && part < 1.5 ) {
		// coconut frond: ~95 narrow leaflets per side (100-125 on a real frond), separated by gaps
		// that show the sky; leaflets bunch and spread irregularly, some are short, split or torn
		// away (runs of missing leaflets, more on old fronds)
		let N = 95.0;
		let x = s * N + ( vegNoise( vec2f( s * 7.0, fseed * 23.0 + seed * 3.0 ) ) - 0.5 ) * 2.2;
		let k = floor( x );
		let r1 = vegHash12( vec2f( k, fseed * 91.7 ) );
		let r2 = vegHash12( vec2f( k * 1.37 + 3.1, fseed * 17.3 + seed * 5.0 ) );
		let fx = fract( x ) - 0.5 - ( r1 - 0.5 ) * 0.35;
		let tEnd = mix( 0.72, 1.0, r2 ) * select( 1.0, 0.45, r1 < 0.06 );
		let tt = t / tEnd;
		let hw = pow( max( 1.0 - tt, 0.0 ), 0.6 ) * 0.22 * ( smoothstep( 0.0, 0.1, tt ) * 0.4 + 0.6 );
		// split leaflets: a slit from the tip back along the midvein
		let split = r2 > 0.9 && tt > mix( 0.35, 0.7, r1 ) && abs( fx ) < hw * 0.3;
		// torn-out runs of leaflets
		let torn = vegNoise( vec2f( k * 0.21 + seed * 17.0, fseed * 37.0 ) ) > 0.83 - age * 0.2 && s > 0.3;
		// sub-pixel leaflets widen instead of aliasing (fronds turn solid in the distance)
		let hwE = max( hw, min( fwS * ( N * 0.6 ), 0.5 ) * select( 0.0, 1.0, tt < 1.0 ) );
		let leaf = abs( fx ) < hwE && tt < 1.0 && s > 0.06 && ! split && ! torn;
		let rachis = t * Ll < 0.026;
		m = select( 0.0, 1.0, leaf || rachis );
	} else if ( part > 1.5 && part < 2.5 ) {
		// fern: rounded pinnae
		let N = 26.0;
		let x = s * N;
		let k = floor( x );
		let r2 = vegHash12( vec2f( k, fseed * 31.1 ) );
		let fx = fract( x ) - 0.5;
		let tt = t / mix( 0.8, 1.0, r2 );
		let hw = sqrt( max( 1.0 - tt * tt, 0.0 ) ) * 0.34;
		let hwE = max( hw, min( fwS * ( N * 0.6 ), 0.5 ) * select( 0.0, 1.0, tt < 1.0 ) );
		let leaf = abs( fx ) < hwE && tt < 1.0 && s > 0.04;
		let rachis = t * Ll < 0.006;
		m = select( 0.0, 1.0, leaf || rachis );
	} else if ( part > 2.5 && part < 3.5 && s >= 0.0 ) {
		// banana: full blade, torn along lateral veins, ragged edge
		let x = s * 13.0 + sin( s * 31.0 + fseed * 10.0 ) * 0.35;
		let k = floor( x );
		let r1 = vegHash12( vec2f( k, fseed * 7.7 ) );
		let r2 = vegHash12( vec2f( k + 0.5, fseed * 3.3 + seed ) );
		let fx = abs( fract( x ) - 0.5 );
		// dead leaves are shredded
		let dead = step( 0.8, age );
		// wind-torn strips: most tears start at the margin and run in along the veins, more on older
		// leaves; dead leaves are shredded
		let tear = r1 < mix( 0.45 + age * 0.6, 0.95, dead ) && t > mix( 0.12, 0.75, r2 ) * mix( 1.0, 0.4, dead ) && fx > mix( 0.45, 0.37, r2 ) - dead * 0.12;
		let edge = t < 0.985 - vegNoise( vec2f( s * 60.0, fseed * 9.0 ) ) * 0.07;
		m = select( 0.0, 1.0, ! tear && edge );
	} else if ( part > 5.5 && s >= 0.0 ) {
		// broadleaf blades (petioles, s < 0, are kept whole)
		let sh = vegBroadShape( part, s, t, age, Ll, fseed, seed );
		m = select( 0.0, 1.0, abs( t ) < sh.w && ! sh.cut );
	}
	return m > 0.5;
}

fn vegPlantAlbedo( st: vec2f, aMat: vec4f, iDat: vec4f, trunkY: f32, heightGround: f32 ) -> vec3f {

	let s = st.x;
	let t = st.y;

	let part = aMat.x; let age = aMat.y; let Ll = aMat.z; let fseed = aMat.w;
	let seed = iDat.w;
	let H = iDat.z;
	var col = vec3f( 0.0 );
	let iv = vegHash12( vec2f( seed * 37.1, 1.7 ) );
	if ( part < 0.5 ) {
		// stems: age 0 -> weathered, ringed palm trunk; 1 -> green banana pseudostem
		let y = trunkY;
		let a = st.x;
		let bark = vegPalmBark( y, a, H, seed, iv ).bark;
		// (palm trunks have age 0: the pseudostem colour only where it is mixed in)
		var green = vec3f( 0.0 );
		if ( age > 0.0 ) {
			let fiss = vegNoise( vec2f( a * 46.0, y * 1.1 + seed * 50.0 ) );
			let blotch = vegNoise( vec2f( a * 7.0, y * 0.45 + seed * 13.0 ) );
			// banana pseudostem: overlapping sheaths (vertical streaks), dark blotches, dry brown
			// sheath strips peeling off low down (no leaf-scar rings)
			let streakS = vegNoise( vec2f( a * 24.0, y * 0.35 + seed * 7.0 ) );
			green = mix( vec3f( 0.076185, 0.144128, 0.023153 ), vec3f( 0.147027, 0.230740, 0.039546 ), streakS * 0.7 + fiss * 0.3 );
			green = mix( green, vec3f( 0.043735, 0.033105, 0.015996 ), smoothstep( 0.62, 0.82, blotch ) * 0.55 );
			green = mix( green, mix( vec3f( 0.155926, 0.090842, 0.034340 ), vec3f( 0.274677, 0.194618, 0.084376 ), fiss ), smoothstep( 0.55, 0.75, streakS ) * smoothstep( 1.1, 0.3, y ) );
		}
		col = mix( bark, green, age );
	} else if ( part < 1.5 ) {
		// age (aMat.y): 0 young upper fronds (lighter yellow-green) .. 0.55 old lower fronds (olive,
		// yellowing); 1 = the two hanging fronds, whose state is picked per tree and frond (one crown
		// mesh is shared): still olive, yellowing or dead brown
		let fr = vegHash12( vec2f( fseed * 51.3, seed * 17.9 ) );
		let a = sat( age / 0.55 );
		var g = mix( vec3f( 0.168269, 0.262251, 0.033105 ), vec3f( 0.057805, 0.114435, 0.020289 ), smoothstep( 0.0, 0.35, a ) );
		g = mix( g, vec3f( 0.141263, 0.162029, 0.028426 ), smoothstep( 0.55, 1.0, a ) );
		// per tree: yellower or bluer greens; per frond: value
		g = mix( g, g * vec3f( 1.12, 1.02, 0.78 ), iv * 0.8 );
		g = mix( g, g * vec3f( 0.86, 0.98, 1.08 ), ( 1.0 - iv ) * 0.5 );
		g = g * mix( 0.82, 1.1, fr );
		// leaflets: darker toward their tips, paler at the base, each a little different
		let kL = floor( s * 95.0 );
		let perLeaf = vegHash12( vec2f( kL, fseed * 13.1 ) );
		var c = g * mix( 1.08, 0.86, smoothstep( 0.2, 1.0, t ) ) * ( perLeaf * 0.22 + 0.9 );
		// browned, dried tips on some leaflets (more on old fronds)
		let tipK = smoothstep( 0.72, 0.97, t ) * step( 0.55 - a * 0.35, vegHash12( vec2f( kL * 1.7, fseed * 5.3 + seed ) ) );
		c = mix( c, mix( vec3f( 0.262251, 0.194618, 0.068478 ), vec3f( 0.155926, 0.104616, 0.040915 ), perLeaf ), tipK * 0.85 );
		// hanging fronds
		let hangK = smoothstep( 0.8, 0.95, age );
		let state = vegHash12( vec2f( fseed * 7.1, seed * 29.3 ) );
		let yellowing = mix( vec3f( 0.274677, 0.254152, 0.045186 ), vec3f( 0.351533, 0.254152, 0.059511 ), perLeaf );
		let deadC = mix( vec3f( 0.194618, 0.127438, 0.051269 ), vec3f( 0.107023, 0.068478, 0.029557 ), perLeaf );
		let hangC = select( select( c * 0.9, yellowing, state > 0.35 ), deadC, state > 0.62 );
		c = mix( c, hangC, hangK );
		// midrib: pale yellow on young fronds, straw on old, brown when dead
		let rachis = t * Ll < 0.026;
		let rib = mix( mix( vec3f( 0.450786, 0.381326, 0.116971 ), vec3f( 0.313989, 0.250158, 0.076185 ), a ), vec3f( 0.158961, 0.102242, 0.042311 ), hangK * step( 0.62, state ) );
		col = select( c, rib, rachis );
	} else if ( part < 2.5 ) {
		let c = mix( vec3f( 0.034340, 0.107023, 0.014444 ), vec3f( 0.090842, 0.215861, 0.025187 ), smoothstep( 0.1, 1.0, s ) * 0.6 + iv * 0.4 );
		col = c * mix( 0.85, 1.1, vegHash12( vec2f( floor( s * 26.0 ), fseed ) ) );
	} else if ( part < 3.5 ) {
		if ( s < 0.0 ) {
			// banana pseudostem: overlapping sheaths (vertical streaks), brown / purple-black blotches,
			// dry brown sheath fibre peeling low down
			let f = ( s + 1.0 ) * 2.0;
			let a = t;
			let streakS = vegNoise( vec2f( a * 26.0, f * 3.0 + fseed * 7.0 ) );
			let blotch = vegNoise( vec2f( a * 9.0, f * 6.0 + fseed * 13.0 ) );
			var gS = mix( vec3f( 0.090842, 0.135633, 0.027321 ), vec3f( 0.155926, 0.205079, 0.042311 ), streakS * 0.7 + iv * 0.3 );
			gS = mix( gS, vec3f( 0.042311, 0.023153, 0.021219 ), smoothstep( 0.6, 0.8, blotch ) * 0.6 );
			let dry = smoothstep( 0.45, 0.7, vegNoise( vec2f( a * 14.0 + 3.0, f * 2.5 + fseed * 19.0 ) ) ) * smoothstep( 0.8, 0.2, f );
			col = mix( gS, mix( vec3f( 0.144128, 0.084376, 0.033105 ), vec3f( 0.270498, 0.194618, 0.084376 ), streakS ), dry * 0.9 );
		} else {
			// blade: muted green (per plant and leaf), paler midrib, faint lateral veins; dried, browned
			// margins and torn strip edges; old leaves yellowing; dead ones brown and papery
			let lf = vegHash12( vec2f( fseed * 23.1, seed * 3.7 ) );
			var base = mix( vec3f( 0.049707, 0.114435, 0.017642 ), vec3f( 0.090842, 0.174647, 0.026241 ), iv * 0.55 + lf * 0.45 );
			base = mix( base, vec3f( 0.201556, 0.205079, 0.035601 ), smoothstep( 0.35, 0.6, age ) * 0.55 );
			let vein = ( sin( s * 260.0 ) * 0.5 + 0.5 ) * 0.07;
			let mott = vegNoise( vec2f( s * 11.0 + fseed * 3.0, t * 4.0 ) );
			var c = base * ( vein + 0.94 ) * ( mott * 0.14 + 0.93 );
			c = mix( c, vec3f( 0.396755, 0.434154, 0.155926 ), smoothstep( 0.05, 0.0, t ) * 0.75 ); // midrib
			let xs = s * 13.0 + sin( s * 31.0 + fseed * 10.0 ) * 0.35;
			let stripEdge = smoothstep( 0.36, 0.47, abs( fract( xs ) - 0.5 ) ) * smoothstep( 0.4, 0.8, t ) * ( 0.3 + age );
			let dryEdge = smoothstep( 0.72, 1.0, t + ( vegNoise( vec2f( s * 25.0, fseed * 4.0 ) ) - 0.5 ) * 0.3 ) * ( 0.45 + age * 0.8 );
			let brownC = mix( vec3f( 0.147027, 0.090842, 0.030713 ), vec3f( 0.274677, 0.194618, 0.064803 ), mott );
			c = mix( c, brownC, sat( max( dryEdge, stripEdge * 0.6 ) ) * 0.85 );
			let deadC = mix( vec3f( 0.111932, 0.068478, 0.025187 ), vec3f( 0.238398, 0.162029, 0.068478 ), vegNoise( vec2f( s * 18.0, t * 3.0 + fseed * 5.0 ) ) );
			c = mix( c, deadC, smoothstep( 0.85, 0.95, age ) );
			col = c;
		}
	} else if ( part > 5.5 ) {
		let hGround = heightGround;
		if ( s < 0.0 ) {
			col = vegBroadStem( part, t, ( s + 1.0 ) * 2.0, fseed, age );
		} else {
			col = vegBroadAlbedo( part, s, t, age, Ll, fseed, seed, iv, hGround );
		}
	} else {
		// coconuts: green -> yellow -> brown
		col = mix( mix( vec3f( 0.138432, 0.181164, 0.023153 ), vec3f( 0.332452, 0.254152, 0.034340 ), smoothstep( 0.3, 0.7, age ) ), vec3f( 0.107023, 0.052861, 0.015996 ), smoothstep( 0.82, 0.95, age ) );
	}
	return col;
}

`;
const surface = TSL.wgslFn(PLANT_SURFACE_WGSL);
export function plantSurface(input: {st:N; material:N; instanceData:N; trunkHeight:N; heightAboveGround:N}): {albedo:N; mask:N} {
 const value:N=surface({st:input.st,aMat:input.material,iDat:input.instanceData,trunkY:input.trunkHeight,heightGround:input.heightAboveGround});
 return {albedo:value.rgb,mask:value.a.greaterThan(0.5)};
}

