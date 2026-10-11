/** Exact reachable ShoreWaves.js world evaluator + common Perlin (MIT DRG Software Solutions LLC,4811ba48).
 * Source global providers become explicit parameters. No wave equation or executable constant is tuned.
 * Height/shore fields are caller-supplied cell-centred float textures in world coordinates.
 */
export const SHORE_EVALUATOR_WGSL = `fn groundShoreEval(p:vec2f,ground:f32,ht:texture_2d<f32>,st:texture_2d<f32>,origin:vec2f,size:f32,clock:vec4f,enabled:f32)->mat4x4f {
 let ctx=ShoreContext(clock.x,clock.y,clock.z,clock.w,enabled,0.55,0.78,0.13,1.0,1.0,origin,size);
 let s=shoreEvaluateWorld(ctx,ht,st,p,ctx.seaLevel-ground,ground);
 return mat4x4f(vec4f(s.foam,s.swashFoam,s.runup,s.inland),vec4f(s.flow,s.dir),vec4f(s.disp,s.env),vec4f(s.tau,s.dRdt,s.flowSpeed,s.thick));
}
struct ShoreContext {time:f32,seaLevel:f32,period:f32,amplitude:f32,enabled:f32,variation:f32,gamma:f32,breakSpan:f32,curl:f32,runup:f32,origin:vec2f,size:f32};
fn shoreLookup(tex:texture_2d<f32>,uv:vec2f)->vec4f {
 let size=vec2f(textureDimensions(tex));let fp=clamp(uv*size-0.5,vec2f(0.0),size-1.001);let i=vec2i(floor(fp));let t=fract(fp);
 return mix(mix(textureLoad(tex,i,0),textureLoad(tex,i+vec2i(1,0),0),t.x),mix(textureLoad(tex,i+vec2i(0,1),0),textureLoad(tex,i+vec2i(1,1),0),t.x),t.y);
}
fn shoreHeight(ctx:ShoreContext,tex:texture_2d<f32>,p:vec2f)->f32{return ctx.seaLevel-shoreLookup(tex,(p-ctx.origin)/ctx.size).r;}
fn shoreField(ctx:ShoreContext,tex:texture_2d<f32>,p:vec2f)->vec4f{return shoreLookup(tex,(p-ctx.origin)/ctx.size);}
const PI: f32 = 3.141592653589793;
const SHORE_GRAVITY: f32 = 9.81;
const SHORE_TAU: f32 = 6.283185307179586;
const SHORE_BEACH_SLOPE: f32 = 0.066;
const SHORE_SWASH_UP: f32 = 0.4;
const SHORE_SWASH_DOWN: f32 = 0.55;
const SHORE_SWASH_OVERSHOOT: f32 = 1.2;
struct ShoreSample {
	disp: vec3f,
	nShore: vec3f,
	env: f32,
	foam: f32,
	breaking: f32,
	u: f32,
	dir: vec2f,
	exposure: f32,
	swashLevel: f32,
	swashCovered: f32,
	thick: f32,
	swashFoam: f32,
	runup: f32,
	inland: f32,
	dRdt: f32,
	tau: f32,
	flow: vec2f,
	flowSpeed: f32,
	face: f32,
	roller: f32,
};
struct ShoreMedium { scatter: vec3f, absorb: vec3f };
struct ShorePhase { sh: vec4f, T: f32, dir: vec2f, exposure: f32, along: f32, s: f32 };
struct ShoreBreak {
	db: f32, b: f32, Ash: f32, p: f32, meanP: f32, crestPeak: f32, yc: f32, yt: f32,
	H: f32, wBore: f32, Xi: f32, Hb: f32, ycB: f32, ytB: f32, Xc: f32, Wt: f32,
};
struct ShoreProfile { x: f32, y: f32, b: f32, foam: f32, face: f32, roller: f32 };
struct ShorePair { s0: vec4f, s1: vec4f };
struct ShoreRunup { tau: f32, Rt: f32, inland: f32, RhMax: f32, su: f32, sb: f32, isUp: bool };
struct ShoreBar { k: f32, rip: f32 };
fn shoreEvaluateWorld(ctx: ShoreContext, ht: texture_2d<f32>, st: texture_2d<f32>,  xz: vec2f, depth: f32, groundH: f32 ) -> ShoreSample {
	let ph = shorePhaseAt(ctx, ht, st,  xz );
	let sh = ph.sh;
	let exposure = ph.exposure;
	let along = ph.along;
	let dir = ph.dir;
	let Tp = ctx.period;

	let d = depth;
	let c = sqrt( clamp( d, 0.3, 25.0 ) * SHORE_GRAVITY );
	let lam = c * Tp;

	let s = ph.s;
	let m = floor( s + 0.5 );
	let u = s - m;

	// wave height with smooth hand-over between consecutive waves at the trough
	let A0 = shoreWaveAmp(ctx, ht, st,  m, along );
	let An = shoreWaveAmp(ctx, ht, st,  m + sign( u ), along );
	let A = mix( A0, An, smoothstep( 0.32, 0.5, abs( u ) ) * 0.5 );
	// the breaking state of the whole wave comes from the depth under its crest
	let dB = shoreBreakDepth(ctx, ht, st,  xz, dir, u, lam, d );

	// offshore fade-in (FFT covers deep water) and fade on land (the swash sheet takes over there)
	let env = smoothstep( 26.0, 13.0, d ) * smoothstep( -0.25, 0.05, d ) * sat( exposure * 1.4 ) * ctx.enabled;

	// finite difference along the propagation direction for the normal
	let e = 0.15;
	var face = 0.0;
	var roller = 0.0;
	let r = shoreWorld(ctx, ht, st,  u, A, dB, lam, env );
	let s0 = vec4f( r.z, r.y, r.x, r.w );

	var disp = vec3f( dir.x * s0.x, s0.y, dir.y * s0.x ) * env;

	var nShore = vec3f( 0.0, 1.0, 0.0 );


	// ---- swash: run-up of the most recent wave on the sand
	let swr = shoreSwashRunup(ctx, ht, st,  sh, along, groundH );
	let front = swr.Rt - swr.inland; // signed distance to the leading edge (m), > 0 under the sheet
	let covered = front > 0.0;
	// leading edge velocity along the slope (m/s), positive = uphill
	let dRdt = select( pow( max( swr.sb, 1e-3 ), 0.6 ) * ( - 1.6 / SHORE_SWASH_DOWN ), pow( 1.0 - swr.su, 0.5 ) * ( 1.5 / SHORE_SWASH_UP ), swr.isUp ) * swr.RhMax / Tp;
	// thin sheet (a few cm, thickening behind the leading edge). The mesh sheet overshoots the
	// leading edge a little; the water shader cuts it exactly on the front (swashClip), so the edge
	// doesn't follow the mesh triangles.
	let fm = front + SHORE_SWASH_OVERSHOOT;
	let thick = clamp( min( fm * 0.3, max( fm - 0.1, 0.0 ) * ( SHORE_BEACH_SLOPE * 0.22 ) + 0.03 ), -0.1, 0.12 );
	let swashLevel = groundH + thick;
	// bubbly foam line riding the leading edge all the way up (left behind as the swash mark)
	let uprush = smoothstep( 0.46, 0.32, swr.tau );
	let edge = smoothstep( 0.8, 0.0, front ) * smoothstep( -0.05, 0.05, front ) * uprush * smoothstep( 0.0, 1.0, swr.Rt );
	let swashFoam = edge * 0.9;

	// ---- depth-averaged water velocity (along dir), for foam advection
	// waves / bores: shallow-water particle velocity c * eta / h; swash sheet: the tip moves at
	// dR/dt, slower toward the shoreline during uprush, faster there while it drains
	let eta = disp.y;
	let uWave = clamp( c * eta / ( max( d, 0.0 ) + max( eta, d * -0.8 ) + 0.15 ), -2.5, 4.0 );
	let rel = sat( swr.inland / max( swr.Rt, 0.5 ) );
	let uSwash = dRdt * select( ( 1.0 - rel ) * 0.6 + 0.9, clamp( ( swr.inland + 3.0 ) / ( swr.Rt + 3.0 ), 0.15, 1.0 ), swr.isUp );
	let wSwash = smoothstep( 0.3, 0.05, d );
	let uFlow = mix( uWave, uSwash, wSwash ) * select( 0.0, 1.0, covered || d > 0.02 );

	var o: ShoreSample;
	// the churn of a bore is uneven along the crest: dense in some stretches, torn into patches and
	// lace in others (different for every wave, drifting slowly along it)
	var wwPatch = 0.0;
	if ( s0.z * env != 0.0 ) { wwPatch = smoothstep( -0.5, 0.45, perlin2( vec2f( along * 0.06 + ctx.time * 0.05, m * 2.9 + 0.4 ) ) ); }
	o.disp = disp; o.nShore = nShore; o.env = env; o.foam = s0.z * env * mix( 0.3, 1.0, wwPatch ); o.breaking = s0.w; o.u = u; o.dir = dir;
	o.exposure = exposure; o.swashLevel = swashLevel; o.swashCovered = select( 0.0, 1.0, covered ); o.thick = thick;
	o.swashFoam = swashFoam; o.runup = swr.Rt; o.inland = swr.inland; o.dRdt = dRdt; o.tau = swr.tau;
	o.flow = dir * uFlow; o.flowSpeed = uFlow; o.face = face; o.roller = roller;
	return o;
}

fn shoreWaveAmp(ctx: ShoreContext, ht: texture_2d<f32>, st: texture_2d<f32>,  m: f32, along: f32 ) -> f32 {
	// sets: groups of ~7 waves with larger ones in the middle, plus per-wave randomness
	let waveSet = abs( sin( m * 0.4487989505128276 ) ) * 0.6 + 0.55;
	let rnd = ( shoreHash1(ctx, ht, st,  m ) - 0.5 ) * 2.0;
	// along-shore variation so waves peel instead of closing out
	// peaks ~40-50 m wide with lower shoulders between them, different for every wave (the warp keeps
	// them from repeating along the beach); each peak breaks first and peels outward from it
	let warp = sin( along * 0.016 + m * 0.9 ) * 1.6;
	let a1 = sin( along * 0.062 + m * 1.7 + warp );
	let a2 = sin( along * 0.13 + m * 4.1 + 1.3 - warp * 0.7 );
	// (plus a shorter ~20 m variation: bores that rise and sag along the crest, more peel sections)
	let a3 = sin( along * 0.29 + m * 2.3 + warp * 0.5 ) * 0.6 + sin( along * 0.47 + m * 5.9 + 0.8 ) * 0.4;
	let alongV = a1 * 0.6 + a2 * 0.4 + a3 * 0.28;
	return max( ctx.amplitude * waveSet * ( 1.0 + rnd * ctx.variation * 0.5 + alongV * ctx.variation * 0.7 ) * shoreBar(ctx, ht, st,  along ).k, 0.02 );
}

fn shoreHash1(ctx: ShoreContext, ht: texture_2d<f32>, st: texture_2d<f32>,  x: f32 ) -> f32 { return fract( sin( x * 127.1 + 311.7 ) * 43758.5453 ); }

fn shoreBar(ctx: ShoreContext, ht: texture_2d<f32>, st: texture_2d<f32>,  along: f32 ) -> ShoreBar {
	let w = sin( along * 0.021 + 1.9 ) * 1.4 + sin( along * 0.009 + 0.3 ) * 0.9;
	let r = sin( along * 0.059 + w );
	let width = 0.8 + sin( along * 0.017 + 4.1 ) * 0.08; // channels of different width
	let rip = smoothstep( width, 0.985, r );
	// the bar itself is uneven: broad peaks and lower shoulders
	let bar = 0.9 + ( sin( along * 0.031 + 7.3 ) * 0.6 + sin( along * 0.083 + 1.1 ) * 0.4 ) * 0.14;
	return ShoreBar( bar * ( 1.0 - rip * 0.58 ), rip );
}

fn shoreWorld(ctx: ShoreContext, ht: texture_2d<f32>, st: texture_2d<f32>,  u: f32, A: f32, d: f32, lam: f32, env: f32 ) -> vec4f {
	let P = shoreBreakParams(ctx, ht, st,  A, d );
	let s0 = shoreProfile(ctx, ht, st,  u, lam, P, false );
	let s1 = shoreProfile(ctx, ht, st,  u + s0.x * env / lam, lam, P, false );
	return vec4f( shoreWhitewater(ctx, ht, st,  - u * lam, lam, P ), s1.y, s0.x, P.b );
}

fn shoreBreakParams(ctx: ShoreContext, ht: texture_2d<f32>, st: texture_2d<f32>,  A: f32, d: f32 ) -> ShoreBreak {
	var P: ShoreBreak;
	// break depth for this wave (Green's law shoaling, H = gamma d)
	P.db = pow( A * 3.556 / ctx.gamma, 0.8 );
	P.b = ( P.db - d ) / ( P.db * ctx.breakSpan ); // <0 shoaling, 0..1 plunging, >1 bore
	let shoal = pow( 10.0 / clamp( d, 0.35, 10.0 ), 0.25 );
	P.Ash = A * shoal;
	P.p = mix( 1.0, 3.0, smoothstep( -2.5, 0.0, P.b ) );
	P.meanP = 1.0 / sqrt( ( P.p + 0.25 ) * PI );
	P.crestPeak = 1.0 + smoothstep( -1.0, 0.3, P.b ) * 0.22;
	P.yc = P.Ash * 2.0 * ( 1.0 - P.meanP ) * P.crestPeak; // crest height
	P.yt = P.Ash * -2.0 * P.meanP * P.crestPeak; // trough level
	P.H = P.yc - P.yt;
	P.wBore = smoothstep( 0.85, 1.35, P.b );
	P.Xi = P.H * 0.8; // lip throw at impact
	// bore height, limited by the depth and fading out in the last few decimetres
	P.Hb = min( P.H * 0.6, max( d, 0.0 ) * 0.75 ) * ( smoothstep( 0.0, 0.3, d ) * 0.7 + 0.3 );
	P.ycB = mix( P.yc, P.yt * 0.6 + P.Hb, P.wBore ); // crest / roller top
	P.ytB = mix( P.yt, P.yt * 0.6, P.wBore ); // trough
	// the collapsing crest moves to where the lip landed (no shift once the bore has run out of height)
	P.Xc = mix( 0.0, P.Xi - P.Hb * 0.55, P.wBore ) * smoothstep( 0.03, 0.3, P.Hb );
	// horizontal extent of the face: concave tube face while plunging, short convex roller front on the bore
	P.Wt = mix( P.H * mix( 0.25, 0.55, smoothstep( 0.1, 0.9, P.b ) ), P.Hb * 0.6 + 0.08, P.wBore );
	return P;
}

fn shoreWhitewater(ctx: ShoreContext, ht: texture_2d<f32>, st: texture_2d<f32>,  xi: f32, lam: f32, P: ShoreBreak ) -> f32 {
	let landed = smoothstep( 0.86, 0.99, P.b );
	let spread = sat( ( P.b - 0.9 ) / 0.45 );
	let reach = P.Xi * 0.25 + spread * ( P.Xi * 0.9 + 1.0 ); // radius around the plunge point
	let impact = landed * smoothstep( reach, reach * 0.6, abs( xi - P.Xi ) ) * ( 1.0 - smoothstep( 1.4, 1.9, P.b ) );
	let toe = P.Xc + P.Wt;
	// the collapsing tube turns white from its foot (next to the plunge point) up to the crest
	let faceFill = shoreFaceFill(ctx, ht, st,  P.b, sat( ( xi - P.Xc ) / max( P.Wt, 0.05 ) ) );
	let ahead = exp( ( xi - toe ) * -3.0 ) * P.wBore;
	let behind = exp( ( P.Xc - xi ) / lam * -16.0 ) * P.wBore;
	let roller = select( select( max( faceFill, P.wBore ), behind, xi < P.Xc ), ahead, xi > toe );
	return sat( max( impact, roller ) );
}

fn shoreFaceFill(ctx: ShoreContext, ht: texture_2d<f32>, st: texture_2d<f32>,  b: f32, s: f32 ) -> f32 {
	// the foot turns white first (where the lip lands), the top of the face last: along a peeling
	// crest the edge of the broken section slants down and forward instead of standing vertical
	let k = ( 1.0 - s ) * 0.45;
	return smoothstep( k + 0.9, k + 1.08, b );
}

fn sat( x: f32 ) -> f32 { return clamp( x, 0.0, 1.0 ); }

fn shoreProfile(ctx: ShoreContext, ht: texture_2d<f32>, st: texture_2d<f32>,  u: f32, lam: f32, P: ShoreBreak, withFoam: bool ) -> ShoreProfile {
	// --- shoaling: peaked (cnoidal-like) crest, the front compressed by a phase skew
	let skew = smoothstep( -3.0, 0.0, P.b ) * 0.55;
	let phi = u - skew * ( 1.0 - cos( u * SHORE_TAU ) ) / SHORE_TAU;
	let c = max( ( cos( phi * SHORE_TAU ) + 1.0 ) * 0.5, 0.0 ); // pow() of a rounding-negative base is NaN
	let yPre = P.Ash * 2.0 * ( pow( c, P.p ) - P.meanP ) * P.crestPeak;
	let Q = smoothstep( -3.0, 0.0, P.b ) * 0.25 + 0.1;
	let xPre = sin( u * SHORE_TAU ) * P.Ash * Q;

	// --- plunging / bore profile. Front: the upper uf of the phase is an elliptic arc from the
	// crest down to the trough (concave tube face -> convex roller front), the rest of the
	// front is trough, stretched to meet the next wave. Back: the shoaling back, decaying
	// exponentially behind the bore.
	let uf = 0.09;
	let inFace = u > - uf;
	let th = clamp( - u / uf, 0.0, 1.0 ) * 1.5707963267948966;
	let fx = mix( 1.0 - cos( th ), sin( th ), P.wBore );
	let fy = mix( 1.0 - sin( th ), cos( th ), P.wBore );
	let sTr = clamp( ( - u - uf ) / ( 0.5 - uf ), 0.0, 1.0 );
	let ul = u * lam;
	let xFront = select( mix( P.Xc + P.Wt, lam * 0.5, sTr ), P.Xc + P.Wt * fx, inFace ) + ul;
	let yFront = select( P.ytB, P.ytB + ( P.ycB - P.ytB ) * fy, inFace );
	let cb = pow( max( ( cos( u * ( SHORE_TAU * 0.85 ) ) + 1.0 ) * 0.5, 0.0 ), P.p );
	let yBack = P.ytB + ( P.ycB - P.ytB ) * mix( cb, exp( u * -7.0 ), P.wBore );
	let xBack = P.Xc * exp( u * -6.0 ) * smoothstep( 0.5, 0.35, u ) + xPre * ( 1.0 - P.wBore );
	let front = u < 0.0;
	let wC = smoothstep( -0.35, 0.25, P.b ) * ctx.curl;
	var r: ShoreProfile;
	r.x = mix( xPre, select( xBack, xFront, front ), wC );
	r.y = mix( yPre, select( yBack, yFront, front ), wC );
	r.b = P.b;
	if ( withFoam ) {
		// --- whitewater (a function of where the parcel is now, see shoreWhitewater) and, per parcel, the
		// clear face of the plunging wave and the relief of the roller
		r.foam = shoreWhitewater(ctx, ht, st,  r.x - u * lam, lam, P );
		let onFace = front && inFace;
		let faceFill = shoreFaceFill(ctx, ht, st,  P.b, fx );
		// the clear, concave face of a plunging wave (WaterSurface keeps the foam carried by the water off it)
		r.face = select( 0.0, 1.0, onFace ) * smoothstep( -0.4, 0.0, P.b ) * ( 1.0 - faceFill );
		// turbulent relief of the whitewater roller (m): its front and the top it tumbles over
		r.roller = select( exp( u * -25.0 ), select( 0.0, 1.0, inFace ), front ) * P.wBore * P.Hb * wC;
	}
	return r;
}

fn shoreBreakDepth(ctx: ShoreContext, ht: texture_2d<f32>, st: texture_2d<f32>,  xz: vec2f, dir: vec2f, u: f32, lam: f32, d: f32 ) -> f32 {
	let pc = xz + dir * ( u * lam );
	let dc = ctx.seaLevel - shoreHeight(ctx, ht, pc );
	return mix( dc, d, smoothstep( 0.3, 0.5, abs( u ) ) );
}

fn shorePhaseAt(ctx: ShoreContext, ht: texture_2d<f32>, st: texture_2d<f32>,  xz: vec2f ) -> ShorePhase {
	let sh = shoreField(ctx, st, xz );
	let T = sh.x;
	let dirE = vec2f( sh.y, sh.z );
	let exposure = length( dirE );
	let dir = dirE / max( exposure, 1e-4 );
	let along = dot( xz, vec2f( - dir.y, dir.x ) );
	let s = ( ctx.time - T ) / ctx.period + shoreWobble(ctx, ht, st,  along );
	return ShorePhase( sh, T, dir, exposure, along, s );
}

fn shoreWobble(ctx: ShoreContext, ht: texture_2d<f32>, st: texture_2d<f32>,  along: f32 ) -> f32 {
	return sin( along * 0.029 + 0.7 ) * 0.07 + sin( along * 0.083 + 2.1 ) * 0.035
		+ sin( along * 0.19 + 0.4 ) * 0.022 + sin( along * 0.37 + 2.6 ) * 0.011
		+ shoreBar(ctx, ht, st,  along ).rip * 0.045;
}

fn shoreSwashRunup(ctx: ShoreContext, ht: texture_2d<f32>, st: texture_2d<f32>,  sh: vec4f, along: f32, groundH: f32 ) -> ShoreRunup {
	let Tp = ctx.period;
	let exposure = length( vec2f( sh.y, sh.z ) );
	let Ts = sh.w;
	let inland = max( groundH - ctx.seaLevel, 0.0 ) / SHORE_BEACH_SLOPE;
	let ss = ( ctx.time - Ts ) / Tp + shoreWobble(ctx, ht, st,  along );
	let ms = floor( ss );
	let tau = ss - ms; // 0..1 time since that wave's bore reached the shoreline
	let Am = shoreWaveAmp(ctx, ht, st,  ms, along );
	// vertical run-up ~ H on this gentle beach, converted to a horizontal excursion
	let RhMax = Am * 2.1 * ctx.runup * sat( exposure * 1.4 ) / SHORE_BEACH_SLOPE;
	// decelerating uprush, then a backwash that starts slowly and accelerates as the sheet drains
	let su = sat( tau / SHORE_SWASH_UP );
	let sb = sat( ( tau - SHORE_SWASH_UP ) / SHORE_SWASH_DOWN );
	let isUp = tau < SHORE_SWASH_UP;
	let Rh = select( 1.0 - pow( sb, 1.6 ), 1.0 - pow( 1.0 - su, 1.5 ), isUp ) * RhMax - 0.3;
	// the front is lobed, not a straight line: each wave runs up a little differently along the beach
	let lobes = sin( along * 0.61 + ms * 2.3 ) * 0.5 + sin( along * 1.73 + ms * 5.1 ) * 0.3 + sin( along * 4.3 + ms * 1.7 ) * 0.2;
	// the backwash never quite exposes the lower beach face: a film of water always covers the
	// first decimetres past the shoreline, so the sea never meets the sand along mesh triangles
	let Rt = max( Rh + lobes * ( max( Rh, 0.0 ) * 0.07 + 0.35 ), 0.35 ) * ctx.enabled;
	return ShoreRunup( tau, Rt, inland, RhMax, su, sb, isUp );
}

fn perlin2( p: vec2f ) -> f32 {
	let fl = floor( p );
	let X = i32( fl.x ); let Y = i32( fl.y );
	let fx = p.x - fl.x; let fy = p.y - fl.y;
	let u = _fade3( vec3f( fx, fy, 0.0 ) );
	let v0 = _mxGrad2( mxHash2( X, Y ), fx, fy );
	let v1 = _mxGrad2( mxHash2( X + 1, Y ), fx - 1.0, fy );
	let v2 = _mxGrad2( mxHash2( X, Y + 1 ), fx, fy - 1.0 );
	let v3 = _mxGrad2( mxHash2( X + 1, Y + 1 ), fx - 1.0, fy - 1.0 );
	let s1 = 1.0 - u.x;
	return ( ( 1.0 - u.y ) * ( v0 * s1 + v1 * u.x ) + u.y * ( v2 * s1 + v3 * u.x ) ) * 0.6616;
}

fn mxHash2( x: i32, y: i32 ) -> u32 { let s = 0xdeadbeefu + ( 2u << 2u ) + 13u; return _mxFinal( s + u32( x ), s + u32( y ), s ); }

fn _mxFinal( a0: u32, b0: u32, c0: u32 ) -> u32 {
	var a = a0; var b = b0; var c = c0;
	c ^= b; c -= _mxRotl( b, 14u );
	a ^= c; a -= _mxRotl( c, 11u );
	b ^= a; b -= _mxRotl( a, 25u );
	c ^= b; c -= _mxRotl( b, 16u );
	a ^= c; a -= _mxRotl( c, 4u );
	b ^= a; b -= _mxRotl( a, 14u );
	c ^= b; c -= _mxRotl( b, 24u );
	return c;
}

fn _mxRotl( x: u32, k: u32 ) -> u32 { return ( x << k ) | ( x >> ( 32u - k ) ); }

fn _mxGrad2( hash: u32, x: f32, y: f32 ) -> f32 {
	let h = hash & 7u;
	let u = select( y, x, h < 4u );
	let v = 2.0 * select( x, y, h < 4u );
	return select( u, - u, ( h & 1u ) != 0u ) + select( v, - v, ( h & 2u ) != 0u );
}

fn _fade3( t: vec3f ) -> vec3f { return t * t * t * ( t * ( t * 6.0 - 15.0 ) + 10.0 ); }`;
