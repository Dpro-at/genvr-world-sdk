/* Port of Tidewater SkyProClouds.js (commit 4811ba48), © 2026 DRG Software Solutions LLC, MIT.
 * Density, adaptive march, cone light and shadow equations are preserved as native WGSL.
 * Three.js TSL supplies bindings, cache dispatch and temporal reconstruction.
 * See LICENSE-tidewater.md. */
import { ClampToEdgeWrapping, RepeatWrapping, HalfFloatType, LinearFilter, RGBAFormat, StorageTexture, TSL,
  Vector2, Vector3, Vector4, type Camera, type WebGPURenderer } from 'three/webgpu';
import { Atmosphere, type UniformOf } from './atmosphere.js';
import { CLOUD_PRESET, cloudLattice } from './cloud-math.js';
import { CloudNoise } from './cloud-noise.js';
/* eslint-disable @typescript-eslint/no-explicit-any -- native TSL node graph */
type Node = any;
const { Fn, If, texture, texture3D, sampler, textureLoad, textureStore, uniform, wgslFn,
  globalId, vec2, vec3, vec4, ivec2, uvec2, float, uint, normalize, dot, max, min, clamp,
  mix, sqrt, sin, cos, asin, atan, exp, abs, floor, fract, select, smoothstep, length } = TSL as Node;
const CLOUD_KERNEL = wgslFn(`fn tidewaterCloudKernel(noiseMap: texture_3d<f32>, weatherMap: texture_2d<f32>, boundsMap: texture_2d<f32>, repeatSampler: sampler,
 origin: vec3f, cameraOrigin: vec3f, ray: vec3f, shell: vec4f, wind: vec3f, windDir: vec2f, light: vec3f, direct: vec3f,
 zenith: vec3f, horizon: vec3f, skyRay: vec3f, cone: vec2f, dither: f32, maxSteps: u32, mode: u32) -> mat3x3f {
 twPosition=vec4f(cameraOrigin,0.0); twShell=shell; twWind=vec4f(wind,0.0); twWindDirection=vec4f(windDir,1750.0,0.0);
 twLight=light; twDirect=direct; twZenith=zenith; twHorizon=horizon; twSkyRay=skyRay;
 var tangent=vec3f(light.z,0.0,-light.x);
 if (abs(light.y)>0.99) { tangent=vec3f(0.0,-light.z,light.y); }
 tangent=normalize(tangent); let bitangent=cross(light,tangent);
 twLightOffsets[0]=vec4f(0.0,0.0,0.0,25.0); twLightLods[0]=vec4f(0.0);
 for(var i=1u;i<8u;i++) {
  let growth=pow(1.7,f32(i));let mid=25.0*((growth-1.0)/0.7+growth*0.5);
  let angle=f32(i)*2.399963;let radius=sqrt((f32(i)+0.5)/6.0);
  let u=cos(angle)*radius*0.05*mid;let v=sin(angle)*radius*0.05*mid;
  twLightOffsets[i]=vec4f(light*mid+tangent*u+bitangent*v,25.0*growth);
  let footprint=mid*0.1;
  twLightLods[i]=vec4f(max(0.0,log2(footprint*64.0/7500.0)),max(0.0,log2(footprint*64.0/975.0)),0.0,0.0);
 }
 if(mode==1u) {
  let ly=max(light.y,0.08);let t0=shell.x/ly;let t1=(shell.x+shell.y)/ly;let dt=(t1-t0)/16.0;var tau=0.0;
  for(var i=0u;i<16u;i++) {
   let p=origin+vec3f(light.x,ly,light.z)*(t0+(f32(i)+0.5)*dt);
   tau+=scLightDensity(noiseMap,weatherMap,boundsMap,repeatSampler,p,shell.w,vec2f(2.0),false)*shell.z*dt;
   if(tau>12.0){break;}
  }
  let transmittance=exp(-tau)*0.8+exp(-tau*0.25)*0.2;
  return mat3x3f(vec3f(transmittance),vec3f(0.0),vec3f(0.0));
 }
 let result=scMarch(noiseMap,weatherMap,boundsMap,repeatSampler,origin,ray,dither,cone.x,cone.y,maxSteps,true);
 return mat3x3f(result.color,vec3f(1.0-result.alpha,result.depth*0.001,f32(result.steps)),vec3f(0.0));
}
var<private> twPosition:vec4f;
var<private> twShell:vec4f;
var<private> twWind:vec4f;
var<private> twWindDirection:vec4f;
var<private> twLight:vec3f;
var<private> twDirect:vec3f;
var<private> twZenith:vec3f;
var<private> twHorizon:vec3f;
var<private> twSkyRay:vec3f;
var<private> twLightOffsets:array<vec4f,8>;
var<private> twLightLods:array<vec4f,8>;

const SC_EARTH: f32 = 6371.0;
const SC_FAR: f32 = 250000.0;
const SC_AP_DIST: f32 = 30000.0;

fn scHG( mu: f32, g: f32 ) -> f32 {
	let d = max( 1.0 + g * g - 2.0 * g * mu, 0.001 );
	return ( 1.0 - g * g ) / ( 4.0 * 3.141592653589793 * d * sqrt( d ) );
}
// normalized droplet phase: 80% forward / 20% backscatter; each higher order halves the asymmetry
fn scPhases( mu: f32 ) -> vec3f {
	return vec3f( scHG( mu, 0.8 ), scHG( mu, 0.4 ), scHG( mu, 0.2 ) ) * 0.8
		+ vec3f( scHG( mu, -0.2 ), scHG( mu, -0.1 ), scHG( mu, -0.05 ) ) * 0.2;
}

// ---- density (sky-pro density.wgsl)
struct ScCandidate {
	conservative: f32, edge: f32, top: f32, floorMask: f32,
	shellHeight: f32, localHeight: f32, coverage: f32, position: vec3f,
};
fn scShellHeight( p: vec3f ) -> f32 {
	let horizontal = p.xz - twPosition.xz;
	// parabolic radial height avoids subtracting two ~6,371,000 m f32 values
	let altitude = p.y + dot( horizontal, horizontal ) / ( 2.0 * SC_EARTH * 1000.0 );
	return ( altitude - twShell.x ) / twShell.y;
}
fn scConeLod( footprint: f32, scale: f32 ) -> f32 { return max( 0.0, log2( max( footprint * 64.0 / scale, 1.0 ) ) ); }
fn scCandidate(twNoise: texture_3d<f32>, twWeather: texture_2d<f32>, twBounds: texture_2d<f32>, twSampler: sampler,  p: vec3f, coverage: f32, lod: f32 ) -> ScCandidate {
	let h = scShellHeight( p );
	var result: ScCandidate;
	result.conservative = 0.0;
	if ( h < -0.1 || h > 1.3 || coverage <= 0.0 ) { return result; }
	let windDirection = twWindDirection.xy;
	let shapePosition = p - vec3f( twWind.x, 0.0, twWind.y )
		- vec3f( windDirection.x, 0.0, windDirection.y ) * ( twWindDirection.z * max( h, 0.0 ) - twWind.z );
	let weather = textureSampleLevel( twWeather, twSampler, ( p.xz - twWind.xy ) / vec4f(29000.0,7500.0,0.69,0.13).x, 0.0 ).r;
	let edge = max( vec4f(0.54,0.095,0.0,0.0).y * exp2( -max( h, 0.0 ) * vec4f(0.54,0.095,0.0,0.0).z ), 0.0001 );
	// an all-one noise sample bounds top dilation; a failed bound avoids the volume fetch
	let maximumTop = weather + coverage - 1.0 + 1.34 * vec4f(29000.0,7500.0,0.69,0.13).z * coverage;
	if ( maximumTop < h - edge ) { return result; }
	let required = ( 1.0 - smoothstep( vec4f(0.54,0.095,0.0,0.0).w, max( vec4f(0.24,2.15,1.0,0.13).w, vec4f(0.54,0.095,0.0,0.0).w + 0.001 ), h ) ) * vec4f(0.54,0.095,0.0,0.0).x;
	let floorMask = smoothstep( required - 0.1, required, weather );
	if ( floorMask <= 0.0 ) { return result; }
	let baseSample = textureSampleLevel( twNoise, twSampler, shapePosition / vec4f(29000.0,7500.0,0.69,0.13).y, lod ).rgb;
	let dilation = dot( baseSample, vec3f( 0.7, 0.41, 0.23 ) ) * vec4f(29000.0,7500.0,0.69,0.13).z;
	let top = weather + coverage - 1.0 + dilation * coverage;
	result.conservative = smoothstep( -edge, edge, top - h ) * smoothstep( -edge, edge, h ) * floorMask;
	result.edge = edge; result.top = top; result.floorMask = floorMask;
	result.shellHeight = h; result.localHeight = clamp( h / max( top, 0.001 ), 0.0, 1.0 );
	result.coverage = coverage; result.position = shapePosition;
	return result;
}
fn scErodedDensity(twNoise: texture_3d<f32>, twWeather: texture_2d<f32>, twBounds: texture_2d<f32>, twSampler: sampler,  c: ScCandidate, lod: f32 ) -> f32 {
	if ( c.conservative <= 0.0 ) { return 0.0; }
	let strength = mix( vec4f(0.24,2.15,1.0,0.13).x, vec4f(0.24,2.15,1.0,0.13).y, c.localHeight );
	let maximumErosion = 0.173 * strength * c.coverage;
	if ( min( c.top - c.shellHeight, c.shellHeight ) >= maximumErosion + c.edge ) { return c.floorMask; }
	let s = textureSampleLevel( twNoise, twSampler, c.position / ( vec4f(29000.0,7500.0,0.69,0.13).y * vec4f(29000.0,7500.0,0.69,0.13).w ), lod ).rgb;
	let field = mix( 1.0 - s, s, vec4f(0.24,2.15,1.0,0.13).z );
	let erosion = dot( field, vec3f( 0.113, 0.04, 0.02 ) ) * strength * c.coverage;
	return smoothstep( -c.edge, c.edge, c.top - erosion - c.shellHeight )
		* smoothstep( -c.edge, c.edge, c.shellHeight - erosion ) * c.floorMask;
}
fn scLightDensity(twNoise: texture_3d<f32>, twWeather: texture_2d<f32>, twBounds: texture_2d<f32>, twSampler: sampler,  p: vec3f, coverage: f32, lods: vec2f, cheap: bool ) -> f32 {
	let c = scCandidate(twNoise, twWeather, twBounds, twSampler,  p, coverage, lods.x );
	if ( cheap ) { return c.conservative; }
	return scErodedDensity(twNoise, twWeather, twBounds, twSampler,  c, lods.y );
}
fn scShellRoots( direction: vec3f, altitude: f32, originHeight: f32 ) -> vec2f {
	let radius = SC_EARTH * 1000.0;
	let b = ( radius + originHeight ) * direction.y;
	let c = ( originHeight - altitude ) * ( 2.0 * radius + originHeight + altitude );
	let h = b * b - c;
	if ( h < 0.0 ) { return vec2f( -1.0 ); }
	let q = -b - select( -sqrt( h ), sqrt( h ), b >= 0.0 );
	let other = c / select( -0.0001, q, abs( q ) > 0.0001 );
	return vec2f( min( q, other ), max( q, other ) );
}
fn scCloudInterval( dir: vec3f, originHeight: f32 ) -> vec2f {
	let inner = scShellRoots( dir, twShell.x, originHeight );
	let outer = scShellRoots( dir, twShell.x + twShell.y, originHeight );
	var start = 0.0; var end = min( outer.y, SC_FAR );
	if ( outer.y <= 0.0 ) { return vec2f( 0.0 ); }
	if ( originHeight < twShell.x ) { start = max( inner.y, 0.0 ); }
	else {
		if ( originHeight > twShell.x + twShell.y ) { start = max( outer.x, 0.0 ); }
		if ( inner.x >= 0.0 ) { end = min( end, inner.x ); }
	}
	let ground = scShellRoots( dir, 0.0, originHeight );
	if ( ground.x > 0.0 ) { end = min( end, ground.x ); }
	return vec2f( start, end );
}

fn scCoverageAt( t: f32 ) -> f32 {
	return twShell.w + vec4f(20000.0,45000.0,0.12,0.0).z * smoothstep( vec4f(20000.0,45000.0,0.12,0.0).x, vec4f(20000.0,45000.0,0.12,0.0).x + max( vec4f(20000.0,45000.0,0.12,0.0).y, 1.0 ), t );
}
fn scHeightAlongRay( t: f32, dir: vec3f, originHeight: f32 ) -> f32 {
	let altitude = originHeight + dir.y * t + dot( dir.xz, dir.xz ) * t * t / ( 2.0 * SC_EARTH * 1000.0 );
	return ( altitude - twShell.x ) / twShell.y;
}
fn scCellIsEmpty( t: f32, end: f32, dir: vec3f, originHeight: f32, maximumWeather: f32 ) -> bool {
	let turningPoint = -dir.y * SC_EARTH * 1000.0 / max( dot( dir.xz, dir.xz ), 0.000001 );
	let minHeight = scHeightAlongRay( clamp( turningPoint, t, end ), dir, originHeight );
	let maxHeight = max( scHeightAlongRay( t, dir, originHeight ), scHeightAlongRay( end, dir, originHeight ) );
	let coverage = scCoverageAt( end );
	let maximumTop = maximumWeather + coverage - 1.0 + 1.34 * vec4f(29000.0,7500.0,0.69,0.13).z * coverage;
	let edgeHeight = select( maxHeight, minHeight, vec4f(0.54,0.095,0.0,0.0).z >= 0.0 );
	let edge = max( vec4f(0.54,0.095,0.0,0.0).y * exp2( -max( edgeHeight, 0.0 ) * vec4f(0.54,0.095,0.0,0.0).z ), 0.0001 );
	let required = ( 1.0 - smoothstep( vec4f(0.54,0.095,0.0,0.0).w, max( vec4f(0.24,2.15,1.0,0.13).w, vec4f(0.54,0.095,0.0,0.0).w + 0.001 ), maxHeight ) ) * vec4f(0.54,0.095,0.0,0.0).x;
	return maximumTop < minHeight - edge || maximumWeather <= required - 0.1;
}
fn scLightOpticalDepth(twNoise: texture_3d<f32>, twWeather: texture_2d<f32>, twBounds: texture_2d<f32>, twSampler: sampler,  p: vec3f, coverage: f32, lods: vec2f, cheap: bool ) -> f32 {
	var opticalDepth = 0.0;
	for ( var i = 1u; i < 8u; i++ ) {
		if ( i >= u32( vec4f(25.0,256.0,6.0,0.5).z ) ) { break; }
		let tap = twLightOffsets[ i ];
		opticalDepth += scLightDensity(twNoise, twWeather, twBounds, twSampler,  p + tap.xyz, coverage, max( lods, twLightLods[ i ].xy ), cheap ) * tap.w * twShell.z;
		if ( opticalDepth >= 32.0 ) { break; }
	}
	return opticalDepth;
}
fn scLightEnergy( opticalDepth: f32, phase: vec3f ) -> f32 {
	let quarter = exp( -opticalDepth * 0.25 );
	let halfT = quarter * quarter;
	return dot( vec3f( halfT * halfT, halfT * 0.5, quarter * 0.25 ), phase );
}

// Tidewater's sky (the atmosphere's sky view LUT; the night sky's ambient)
// key light: the sun while it is the app's key light, seen from cloud altitude, else the moon
fn scDirect() -> vec3f { return twDirect; }

struct ScMarch { color: vec3f, alpha: f32, depth: f32, steps: u32 };

fn scMarch(twNoise: texture_3d<f32>, twWeather: texture_2d<f32>, twBounds: texture_2d<f32>, twSampler: sampler,  origin: vec3f, dir: vec3f, dither: f32, pixelConeAngle: f32, stepConeAngle: f32, maxSteps: u32, useBounds: bool ) -> ScMarch {
	var out: ScMarch;
	out.color = vec3f( 0.0 ); out.alpha = 0.0; out.depth = SC_FAR; out.steps = 0u;
	let interval = scCloudInterval( dir, origin.y );
	var color = vec3f( 0.0 ); var transmission = 1.0; var weightedDepth = 0.0;
	var steps = 0u;
	if ( interval.y > interval.x && twShell.w > 0.0 && twShell.z > 0.0 ) {
		let L = twLight;
		let lightCosine = dot( dir, L );
		let phase = scPhases( lightCosine );
		let direct = scDirect();
		let zenith = twZenith;
		let horizon = twHorizon;
		let bounce = vec4f(0.0091340587,0.0152085144,0.01850022,0.0).rgb * direct * max( L.y, 0.0 );
		var t = interval.x + dither * vec4f(25.0,256.0,6.0,0.5).x;
		var coarse = true; var emptyRun = 0u; var accumulatedDepth = 0.0;
		var refineEnd = -1.0;
		var cellEnd = -1.0; var cellStart = -1.0; var maximumWeather = 1.0;
		var shadowAt = -SC_FAR; var shadowDensity = -1.0; var shadowTau = 0.0; var skyTau = 0.0; var shadowCheap = false;
		let hasDirectLight = max( direct.x, max( direct.y, direct.z ) ) > 0.00001;
		for ( var i = 0u; i < maxSteps; i++ ) {
			if ( t >= interval.y || transmission < 0.003 ) { break; }
			steps++;
			if ( coarse && useBounds ) {
				if ( t >= cellEnd || t < cellStart ) {
					let size = vec2i( textureDimensions( twBounds ) );
					let grid = ( origin.xz + dir.xz * t - twWind.xy ) / vec4f(29000.0,7500.0,0.69,0.13).x * vec2f( size );
					let cell = vec2i( floor( grid ) );
					maximumWeather = textureLoad( twBounds, ( ( cell % size ) + size ) % size, 0 ).r;
					let distance = select( fract( grid ), 1.0 - fract( grid ), dir.xz >= vec2f( 0.0 ) )
						/ max( abs( dir.xz ) * vec2f( size ) / vec4f(29000.0,7500.0,0.69,0.13).x, vec2f( 0.0000001 ) );
					cellStart = t; cellEnd = min( interval.y, t + max( min( distance.x, distance.y ), 0.05 ) );
				}
				if ( scCellIsEmpty( t, cellEnd, dir, origin.y, maximumWeather ) ) { t = cellEnd + 0.05; continue; }
			}
			let footprint = t * pixelConeAngle;
			let fineStep = max( vec4f(25.0,256.0,6.0,0.5).x, t * stepConeAngle * 1.5 );
			let p = origin + dir * t;
			let coverage = scCoverageAt( t );
			let baseLod = scConeLod( footprint, vec4f(29000.0,7500.0,0.69,0.13).y );
			let c = scCandidate(twNoise, twWeather, twBounds, twSampler,  p, coverage, baseLod );
			let erosionLod = scConeLod( footprint, vec4f(29000.0,7500.0,0.69,0.13).y * vec4f(29000.0,7500.0,0.69,0.13).w );
			if ( coarse ) {
				if ( c.conservative > 0.0 ) {
					if ( scErodedDensity(twNoise, twWeather, twBounds, twSampler,  c, erosionLod ) > 0.0 ) {
						refineEnd = t;
						t = max( interval.x, t - fineStep * 4.0 ) + fineStep;
						t = min( t, refineEnd );
						coarse = false; emptyRun = 0u;
						continue;
					}
				}
				t += fineStep * 4.0;
				continue;
			}
			let density = scErodedDensity(twNoise, twWeather, twBounds, twSampler,  c, erosionLod );
			if ( density <= 0.0 ) {
				shadowAt = -SC_FAR;
				emptyRun++;
				if ( t < refineEnd ) { t = min( t + fineStep, refineEnd ); continue; }
				if ( emptyRun >= 4u ) { coarse = true; }
				t += select( fineStep, fineStep * 4.0, coarse ); continue;
			}
			emptyRun = 0u; refineEnd = -1.0;
			let sigmaT = density * twShell.z;
			let surfaceStep = clamp( 0.5 / max( sigmaT, 0.000001 ), fineStep * 0.15, fineStep );
			let stepLength = min( mix( surfaceStep, fineStep * 3.0, smoothstep( 1.0, 3.0, accumulatedDepth ) ), interval.y - t );
			let height = clamp( c.shellHeight, 0.0, 1.0 );
			let baseShadow = mix( 1.0, mix( 0.15, 1.0, smoothstep( 0.0, max( vec4f(0.88,0.13,0.65,0.0).y, 0.001 ), height ) ), vec4f(0.88,0.13,0.65,0.0).x );
			// darken thin margins away from the sun; keep the forward scattered silver linings
			let powderWeight = vec4f(1.0,0.7,0.7,0.99).y * ( 1.0 - smoothstep( 0.2, 0.95, lightCosine ) );
			let powder = mix( 1.0, 1.0 - exp( -density * 2.0 ), powderWeight );
			var energy = 0.0;
			let cheap = ( 1.0 - transmission ) >= vec4f(25.0,256.0,6.0,0.5).w;
			let reuseDistance = min( fineStep * vec4f(0.0,3.0,0.0,0.0).y, max( 20.0, vec4f(29000.0,7500.0,0.69,0.13).y * vec4f(29000.0,7500.0,0.69,0.13).w * 0.03 ) );
			if ( abs( t - shadowAt ) >= reuseDistance || abs( density - shadowDensity ) > 0.08 || cheap != shadowCheap ) {
				let lods = vec2f( baseLod, erosionLod );
				if ( hasDirectLight ) { shadowTau = scLightOpticalDepth(twNoise, twWeather, twBounds, twSampler,  p, coverage, lods, cheap ); }
				let skyLods = lods + vec2f( 1.0 );
				skyTau = ( scLightDensity(twNoise, twWeather, twBounds, twSampler,  p + vec3f( 0.0, 125.0, 0.0 ), coverage, skyLods, true ) * 250.0
					+ scLightDensity(twNoise, twWeather, twBounds, twSampler,  p + vec3f( 0.0, 600.0, 0.0 ), coverage, skyLods, true ) * 700.0 ) * twShell.z;
				shadowAt = t; shadowDensity = density; shadowCheap = cheap;
			}
			if ( hasDirectLight ) {
				energy = scLightEnergy( shadowTau + sigmaT * twLightOffsets[ 0 ].w, phase );
			}
			let skyVisibility = 0.2 + 0.8 / ( 1.0 + ( skyTau + sigmaT * 25.0 ) * 0.35 );
			let ambient = ( mix( mix( zenith, horizon, 0.55 ), zenith, sqrt( height ) ) * skyVisibility + bounce * ( 1.0 - height ) )
				* vec4f(1.0,0.7,0.7,0.99).z * ( 1.0 + vec4f(1.0,0.7,0.7,0.99).w );
			let light = ( direct * energy * powder * baseShadow + ambient ) * vec4f(1.0,0.7,0.7,0.99).x;
			let stepT = exp( -sigmaT * stepLength );
			let alpha = transmission * ( 1.0 - stepT );
			color += alpha * light; weightedDepth += alpha * t;
			transmission *= stepT; accumulatedDepth += sigmaT * stepLength; t += stepLength;
		}
	}
	let alpha = 1.0 - transmission;
	var depth = SC_FAR;
	if ( alpha > 0.0 ) {
		depth = weightedDepth / alpha;
		// aerial perspective (distance toward the sky behind), then the far melt into the sky
		let sky = twSkyRay;
		let ap = exp( -depth / SC_AP_DIST );
		color = color * ap + sky * alpha * ( 1.0 - ap );
		let melt = smoothstep( vec4f(0.62,25000.0,45000.0,0.0).y, max( vec4f(0.62,25000.0,45000.0,0.0).z, vec4f(0.62,25000.0,45000.0,0.0).y + 1.0 ), depth );
		color = mix( color, sky * alpha, melt );
	}
	out.color = color; out.alpha = alpha; out.depth = depth; out.steps = steps;
	return out;
}
`);

function cloudTexture(width: number, height: number, name: string): StorageTexture {
  const result = new StorageTexture(width, height);
  result.name = name; result.type = HalfFloatType; result.format = RGBAFormat;
  result.minFilter = LinearFilter; result.magFilter = LinearFilter;
  result.wrapS = ClampToEdgeWrapping; result.wrapT = ClampToEdgeWrapping;
  result.generateMipmaps = false;
  return result;
}

/** View cache, reflection panorama and ground shadows for Tidewater's partly-cloudy preset. */
export class TidewaterClouds {
  readonly coverage: UniformOf<number> = uniform(CLOUD_PRESET.coverage);
  readonly windDirection: UniformOf<Vector2> = uniform(new Vector2(0, 1));
  readonly windSpeed: UniformOf<number> = uniform(CLOUD_PRESET.windSpeed);
  readonly night: UniformOf<number> = uniform(0);
  readonly keyLightDirection: UniformOf<Vector3>;
  readonly keyLightColor: UniformOf<Vector3> = uniform(new Vector3());
  readonly shadowStrength: UniformOf<number> = uniform(CLOUD_PRESET.shadowStrength);
  readonly viewValid: UniformOf<number> = uniform(0);
  readonly shadowCenter: UniformOf<Vector2> = uniform(new Vector2());
  readonly panorama = cloudTexture(512, 160, 'tidewaterCloudPanorama');
  readonly shadowMap: StorageTexture;
  readonly source = cloudTexture(1, 1, 'tidewaterCloudSource');
  readonly sourceMeta = cloudTexture(1, 1, 'tidewaterCloudSourceMeta');
  readonly histories = [cloudTexture(4, 4, 'tidewaterCloudHistoryA'), cloudTexture(4, 4, 'tidewaterCloudHistoryB')];
  readonly historyMetas = [cloudTexture(4, 4, 'tidewaterCloudMetaA'), cloudTexture(4, 4, 'tidewaterCloudMetaB')];
  readonly noise: CloudNoise;
  readonly ready: Promise<void>;
  resolutionScale = 1;
  historyValid = false;
  historyResetCount = 0;
  frameIndex = 0;
  get shadowTexture(): StorageTexture { return this.shadowMap; }
  #atmosphere: Atmosphere;
  #ownNoise: boolean;
  #ownShadowMap: boolean;
  #position: UniformOf<Vector3> = uniform(new Vector3());
  #right: UniformOf<Vector3> = uniform(new Vector3(1, 0, 0));
  #up: UniformOf<Vector3> = uniform(new Vector3(0, 1, 0));
  #forward: UniformOf<Vector3> = uniform(new Vector3(0, 0, -1));
  #tan: UniformOf<Vector2> = uniform(new Vector2(1, 1));
  #previousPosition: UniformOf<Vector3> = uniform(new Vector3());
  #previousRight: UniformOf<Vector3> = uniform(new Vector3());
  #previousUp: UniformOf<Vector3> = uniform(new Vector3());
  #previousForward: UniformOf<Vector3> = uniform(new Vector3());
  #previousTan: UniformOf<Vector2> = uniform(new Vector2(1, 1));
  #wind: UniformOf<Vector3> = uniform(new Vector3());
  #windDelta: UniformOf<Vector2> = uniform(new Vector2());
  #lattice: UniformOf<Vector2> = uniform(new Vector2());
  #panoPhase: UniformOf<Vector4> = uniform(new Vector4(0, 0, 1, 0));
  #shadowPhase: UniformOf<number> = uniform(-1);
  #historyValid: UniformOf<number> = uniform(0);
  #historyIndex: UniformOf<number> = uniform(0);
  #clock: UniformOf<number> = uniform(0);
  #evolutionLoss: UniformOf<number> = uniform(0);
  #nightAmbient: UniformOf<Vector3> = uniform(new Vector3());
  #sourceSize: UniformOf<Vector2> = uniform(new Vector2(1, 1));
  #outputHeight: UniformOf<number> = uniform(1);
  #historySize: UniformOf<Vector2> = uniform(new Vector2(4, 4));
  #kernels: { trace: Node; resolve: Node[]; panorama: Node; shadow: Node };
  #width = 0; #height = 0; #scale = 0; #pp = 0; #warm = true; #shadowInit = false;
  #lastCoverage = -1; #lastLight = new Vector3(); #disposed = false;

  constructor(atmosphere: Atmosphere, noise?: CloudNoise, shadowMap?: StorageTexture) {
    this.#atmosphere = atmosphere;
    this.#ownShadowMap = !shadowMap;
    this.shadowMap = shadowMap ?? cloudTexture(256, 256, 'tidewaterCloudShadow');
    this.panorama.wrapS = RepeatWrapping;
    this.keyLightDirection = uniform(atmosphere.params.sunDir.value.clone());
    this.#ownNoise = !noise;
    this.noise = noise ?? new CloudNoise();
    this.ready = this.noise.ready;
    this.#kernels = { trace: this.#traceKernel(), resolve: [this.#resolveKernel(0), this.#resolveKernel(1)],
      panorama: this.#panoramaKernel(), shadow: this.#shadowKernel() };
  }

  #ray(uv: Node): Node {
    const ndc = uv.mul(vec2(2, -2)).add(vec2(-1, 1));
    return normalize(this.#forward.add(this.#right.mul(ndc.x.mul(this.#tan.x))).add(this.#up.mul(ndc.y.mul(this.#tan.y))));
  }

  #march(origin: Node, ray: Node, dither: Node, cone: Node, steps: number, shadow = false): Node {
    const atmo = this.#atmosphere;
    const L = this.keyLightDirection;
    const zenith = atmo.skyLuminance(vec3(0, 1, 0)).add(this.#nightAmbient);
    const horizon = atmo.skyLuminance(normalize(vec3(L.x, 0.03, L.z).add(vec3(1e-5, 0, 0)))).add(this.#nightAmbient);
    const skyRay = atmo.skyLuminance(ray).add(this.#nightAmbient);
    const sunlight = atmo.sampleTransmittance(float(6364), L.y).mul(atmo.params.sunIlluminance);
    const direct = mix(sunlight, this.keyLightColor, select(dot(L, atmo.params.sunDir).lessThan(0.9999), float(1), float(0)));
    return CLOUD_KERNEL({ noiseMap: texture3D(this.noise.noiseTexture), weatherMap: texture(this.noise.weatherTexture),
      boundsMap: texture(this.noise.boundsTexture), repeatSampler: sampler(this.noise.noiseTexture),
      origin, cameraOrigin: this.#position, ray, shell: vec4(4000, 5200, 0.019, this.coverage), wind: this.#wind, windDir: this.windDirection,
      light: L, direct, zenith, horizon, skyRay, cone, dither, maxSteps: uint(steps), mode: uint(shadow ? 1 : 0) });
  }

  #traceKernel(): Node {
    return Fn(() => {
      const pixel = globalId.xy;
      If(pixel.x.lessThan(uint(this.#sourceSize.x)).and(pixel.y.lessThan(uint(this.#sourceSize.y))), () => {
        const uv = vec2(pixel).mul(4).add(this.#lattice).add(0.5).div(this.#historySize);
        const ray = this.#ray(uv).toVar();
        const cone = vec2(this.#tan.y.mul(2).div(this.#outputHeight), this.#tan.y.mul(2).div(this.#historySize.y));
        const blue = textureLoad(this.noise.blueTexture, ivec2(pixel.mod(64))).r;
        const dither = fract(blue.add(this.#clock.mul(0.61803398875)));
        const result = this.#march(this.#position, ray, dither, cone, 256).toVar();
        textureStore(this.source, pixel, vec4(result.element(0), result.element(1).x));
        textureStore(this.sourceMeta, pixel, vec4(result.element(1).y, 1, result.element(1).z.div(256), 0));
      });
    })().computeKernel([8, 8, 1]);
  }

  #resolveKernel(index: number): Node {
    const current = this.histories[index]!, previous = this.histories[1 - index]!;
    const currentMeta = this.historyMetas[index]!, previousMeta = this.historyMetas[1 - index]!;
    return Fn(() => {
      const pixel = globalId.xy;
      If(pixel.x.lessThan(uint(this.#historySize.x)).and(pixel.y.lessThan(uint(this.#historySize.y))), () => {
        const uv = vec2(pixel).add(0.5).div(this.#historySize).toVar();
        const sourcePos = vec2(pixel).sub(this.#lattice).div(4).toVar();
        const sourcePixel = ivec2(clamp(floor(sourcePos.add(0.5)), vec2(0), this.#sourceSize.sub(1))).toVar();
        const central = textureLoad(this.source, sourcePixel).toVar();
        const metadata = textureLoad(this.sourceMeta, sourcePixel).toVar();
        const color = vec4(0).toVar(), weightSum = float(0).toVar();
        const base = floor(sourcePos).toVar(), fraction = fract(sourcePos).toVar();
        for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
          const pos = ivec2(clamp(base.add(vec2(x, y)), vec2(0), this.#sourceSize.sub(1)));
          const tap = textureLoad(this.source, pos).toVar(), tapDepth = textureLoad(this.sourceMeta, pos).x;
          const bilinear = (x ? fraction.x : float(1).sub(fraction.x)).mul(y ? fraction.y : float(1).sub(fraction.y));
          const weight = bilinear.mul(exp(abs(tapDepth.sub(metadata.x)).negate().div(max(0.1, metadata.x.mul(0.1)))
            .sub(abs(tap.a.sub(central.a)).mul(4))));
          color.addAssign(tap.mul(weight)); weightSum.addAssign(weight);
        }
        color.assign(color.div(max(weightSum, 1e-5)));
        If(weightSum.lessThanEqual(1e-5), () => { color.assign(central); });
        const depth = max(metadata.x, 0.001).toVar();
        const stored = textureLoad(previousMeta, ivec2(pixel)).toVar();
        const fresh = pixel.x.mod(4).equal(uint(this.#lattice.x)).and(pixel.y.mod(4).equal(uint(this.#lattice.y)));
        If(fresh, () => { color.assign(central); });
        const carriedDepth = depth.toVar();
        If(this.#historyValid.greaterThan(0.5), () => {
          const low = color.toVar(), high = color.toVar();
          const reprojectionDepth = mix(float(250), stored.y, select(stored.y.greaterThanEqual(0.001), float(1), float(0))).toVar();
          for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
            const tap = textureLoad(this.source, ivec2(clamp(vec2(sourcePixel).add(vec2(x, y)), vec2(0), this.#sourceSize.sub(1))));
            low.assign(min(low, tap)); high.assign(max(high, tap));
            const oldDepth = textureLoad(previousMeta, ivec2(clamp(vec2(pixel).add(vec2(x, y)), vec2(0), this.#historySize.sub(1)))).y;
            If(oldDepth.greaterThanEqual(0.001), () => { reprojectionDepth.assign(min(reprojectionDepth, oldDepth)); });
          }
          If(stored.y.lessThan(0.001), () => { reprojectionDepth.assign(min(reprojectionDepth, depth)); });
          const world = this.#position.add(this.#ray(uv).mul(reprojectionDepth.mul(1000)))
            .sub(vec3(this.#windDelta.x, 0, this.#windDelta.y)).toVar();
          const relative = world.sub(this.#previousPosition).toVar();
          const z = dot(relative, this.#previousForward).toVar();
          const previousUV = vec2(dot(relative, this.#previousRight).div(max(z, 0.001).mul(this.#previousTan.x)),
            dot(relative, this.#previousUp).negate().div(max(z, 0.001).mul(this.#previousTan.y))).mul(0.5).add(0.5).toVar();
          const oldMeta = textureLoad(previousMeta, ivec2(clamp(previousUV.mul(this.#historySize), vec2(0), this.#historySize.sub(1)))).toVar();
          const valid = z.greaterThan(0).and(previousUV.x.greaterThanEqual(0)).and(previousUV.x.lessThanEqual(1))
            .and(previousUV.y.greaterThanEqual(0)).and(previousUV.y.lessThanEqual(1)).and(oldMeta.y.greaterThanEqual(0.001));
          If(valid, () => {
            const history = clamp(this.#historyAt(previous, previousUV), low, high).toVar();
            const retained = mix(mix(0.25, 0.65, smoothstep(8, 30, depth)), float(0.25),
              select(central.a.greaterThan(0.9999), float(1), float(0)));
            const freshWeight = min(0.9, retained).mul(float(1).sub(this.#evolutionLoss));
            const weight = mix(float(1), freshWeight, select(fresh, float(1), float(0)));
            color.assign(mix(color, history, weight));
            const motion = length(previousUV.sub(uv).mul(this.#historySize));
            const expectedDepth = length(world.sub(this.#previousPosition)).mul(0.001);
            If(fresh.not().and(motion.lessThanEqual(0.5).or(abs(oldMeta.y.sub(expectedDepth)).lessThan(max(0.001, expectedDepth.mul(0.15))))),
              () => { carriedDepth.assign(oldMeta.y); });
          });
        });
        textureStore(current, pixel, vec4(max(color.rgb, vec3(0)), clamp(color.a, 0, 1)));
        textureStore(currentMeta, pixel, vec4(depth, carriedDepth, metadata.z, 0));
      });
    })().computeKernel([8, 8, 1]);
  }

  /** Tidewater's five-tap Catmull-Rom history filter preserves detail during repeated reprojection. */
  #historyAt(map: StorageTexture, uv: Node): Node {
    const position = uv.mul(this.#historySize), center = floor(position.sub(0.5)).add(0.5);
    const f = position.sub(center), f2 = f.mul(f);
    const w0 = f.mul(f.mul(f.mul(-0.5).add(1)).sub(0.5));
    const w1 = f2.mul(f.mul(1.5).sub(2.5)).add(1);
    const w2 = f.mul(f.mul(f.mul(-1.5).add(2)).add(0.5));
    const w3 = f2.mul(f.mul(0.5).sub(0.5)), w12 = w1.add(w2);
    const uv0 = center.sub(1).div(this.#historySize), uv3 = center.add(2).div(this.#historySize);
    const uv12 = center.add(w2.div(w12)).div(this.#historySize);
    const weights = vec4(w12.x.mul(w0.y), w0.x.mul(w12.y), w12.x.mul(w12.y), w3.x.mul(w12.y));
    const bottom = w12.x.mul(w3.y);
    return texture(map, vec2(uv12.x, uv0.y)).level(0).mul(weights.x)
      .add(texture(map, vec2(uv0.x, uv12.y)).level(0).mul(weights.y))
      .add(texture(map, uv12).level(0).mul(weights.z))
      .add(texture(map, vec2(uv3.x, uv12.y)).level(0).mul(weights.w))
      .add(texture(map, vec2(uv12.x, uv3.y)).level(0).mul(bottom))
      .div(dot(weights, vec4(1)).add(bottom));
  }

  #panoramaKernel(): Node {
    return Fn(() => {
      const pixel = globalId.xy.mul(uint(this.#panoPhase.z)).add(uvec2(this.#panoPhase.xy));
      If(pixel.x.lessThan(512).and(pixel.y.lessThan(160)), () => {
        const uv = vec2(pixel).add(0.5).div(vec2(512, 160));
        const elevation = uv.y.mul(uv.y).mul(94 * Math.PI / 180).sub(4 * Math.PI / 180);
        const azimuth = uv.x.mul(2 * Math.PI);
        const ray = vec3(cos(elevation).mul(cos(azimuth)), sin(elevation), cos(elevation).mul(sin(azimuth)));
        const result = this.#march(this.#position, ray, float(0.5), vec2(2 * Math.PI / 512), 128).toVar();
        textureStore(this.panorama, pixel, vec4(result.element(0), result.element(1).x));
      });
    })().computeKernel([8, 8, 1]);
  }

  #shadowKernel(): Node {
    return Fn(() => {
      const pixel = globalId.xy.toVar();
      If(this.#shadowPhase.greaterThanEqual(0), () => { pixel.y.assign(pixel.y.mul(4).add(uint(this.#shadowPhase))); });
      If(pixel.x.lessThan(256).and(pixel.y.lessThan(256)), () => {
        const xz = this.shadowCenter.add(vec2(pixel).add(0.5).div(256).sub(0.5).mul(12000));
        const result = this.#march(vec3(xz.x, 0, xz.y), vec3(0, 1, 0), float(0.5), vec2(0), 16, true).toVar();
        textureStore(this.shadowMap, pixel, vec4(result.element(0).x, 0, 0, 1));
      });
    })().computeKernel([8, 8, 1]);
  }

  sampleEnvironment(direction: Node): Node {
    const uv = vec2(fract(atan(direction.z, direction.x).div(2 * Math.PI).add(1)),
      sqrt(clamp(asin(clamp(direction.y, -1, 1)).add(4 * Math.PI / 180).div(94 * Math.PI / 180), 0, 1)));
    return mix(vec4(0, 0, 0, 1), texture(this.panorama, uv).level(0), this.viewValid);
  }

  sampleView(direction: Node): Node {
    const z = dot(direction, this.#forward);
    const uv = vec2(dot(direction, this.#right).div(max(z, 1e-4).mul(this.#tan.x)),
      dot(direction, this.#up).negate().div(max(z, 1e-4).mul(this.#tan.y))).mul(0.5).add(0.5);
    const cached = mix(texture(this.histories[0], uv).level(0), texture(this.histories[1], uv).level(0), this.#historyIndex);
    const valid = z.greaterThan(0).and(uv.x.greaterThanEqual(0)).and(uv.x.lessThanEqual(1))
      .and(uv.y.greaterThanEqual(0)).and(uv.y.lessThanEqual(1));
    const sample = mix(this.sampleEnvironment(direction), cached, select(valid, float(1), float(0)));
    return mix(vec4(0, 0, 0, 1), sample, this.viewValid);
  }

  cloudShadow(worldXZ: Node): Node {
    const uv = worldXZ.sub(this.shadowCenter).div(12000).add(0.5);
    const edge = clamp(min(min(uv.x, uv.y), min(float(1).sub(uv.x), float(1).sub(uv.y))).mul(32), 0, 1);
    const T = texture(this.shadowMap, uv).level(0).r;
    return mix(float(1), T, this.shadowStrength.mul(edge).mul(this.viewValid));
  }

  update(renderer: WebGPURenderer, dt: number, camera: Camera): void {
    if (this.#disposed) return;
    if (!this.noise.isReady) { void this.noise.update(renderer); return; }
    const size = renderer.getDrawingBufferSize(new Vector2());
    if (size.x !== this.#width || size.y !== this.#height || this.resolutionScale !== this.#scale) {
      this.#width = size.x; this.#height = size.y; this.#scale = this.resolutionScale;
      const width = Math.max(1, Math.ceil(size.x * this.resolutionScale / 8));
      const height = Math.max(1, Math.ceil(size.y * this.resolutionScale / 8));
      this.source.setSize(width, height, 1); this.sourceMeta.setSize(width, height, 1);
      for (const map of [...this.histories, ...this.historyMetas]) map.setSize(width * 4, height * 4, 1);
      this.#sourceSize.value.set(width, height); this.#historySize.value.set(width * 4, height * 4);
      this.#outputHeight.value = size.y * this.resolutionScale;
      this.resetHistory();
    }
    dt = Math.max(0, Math.min(0.1, dt));
    camera.updateMatrixWorld();
    const position = new Vector3().setFromMatrixPosition(camera.matrixWorld);
    const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    const up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    const forward = new Vector3().setFromMatrixColumn(camera.matrixWorld, 2).negate().normalize();
    // Projection-matrix values cover perspective cameras, zoom and asymmetric view offsets.
    const matrix = camera.projectionMatrix.elements;
    const tan = new Vector2(1 / matrix[0]!, 1 / matrix[5]!);
    if (position.distanceTo(this.#position.value) > 1000) this.invalidate();
    else if (forward.dot(this.#forward.value) < 0.7 || tan.distanceTo(this.#tan.value) > 0.01) this.resetHistory();
    if (this.coverage.value !== this.#lastCoverage || this.#lastLight.dot(this.keyLightDirection.value) < 0.999) this.invalidate();
    this.#lastCoverage = this.coverage.value; this.#lastLight.copy(this.keyLightDirection.value);
    this.#previousPosition.value.copy(this.#position.value); this.#previousRight.value.copy(this.#right.value);
    this.#previousUp.value.copy(this.#up.value); this.#previousForward.value.copy(this.#forward.value); this.#previousTan.value.copy(this.#tan.value);
    this.#position.value.copy(position); this.#right.value.copy(right); this.#up.value.copy(up); this.#forward.value.copy(forward); this.#tan.value.copy(tan);
    this.windDirection.value.normalize();
    const dx = this.windDirection.value.x * this.windSpeed.value * dt;
    const dz = this.windDirection.value.y * this.windSpeed.value * dt;
    this.#wind.value.x += dx; this.#wind.value.y += dz;
    this.#wind.value.z += CLOUD_PRESET.evolutionSpeed * this.windSpeed.value / 12 * dt;
    this.#evolutionLoss.value = Math.min(1, CLOUD_PRESET.evolutionSpeed * this.windSpeed.value / 12 * dt / 100);
    this.#windDelta.value.set(dx, dz);
    this.#clock.value = this.frameIndex % 4096;
    const [lx, ly] = cloudLattice(this.frameIndex); this.#lattice.value.set(lx, ly);
    this.#historyValid.value = this.historyValid ? 1 : 0;
    const ambient = this.#atmosphere.skyIrradiance;
    this.#nightAmbient.value.set(...(ambient ?? [0, 0, 0]))
      .add(new Vector3(0.6, 0.7, 1).multiplyScalar(0.012 * this.night.value)).multiplyScalar(this.night.value);
    if (this.frameIndex % 4 === 0 || !this.#shadowInit) {
      const cell = 12000 / 256 * 4;
      const nextCenter = new Vector2(Math.round(position.x / cell) * cell, Math.round(position.z / cell) * cell);
      if (!nextCenter.equals(this.shadowCenter.value)) this.#shadowInit = false;
      this.shadowCenter.value.copy(nextCenter);
    }
    this.#shadowPhase.value = this.#shadowInit ? this.frameIndex % 4 : -1;
    renderer.compute(this.#kernels.shadow, [32, this.#shadowInit ? 8 : 32, 1]); this.#shadowInit = true;
    if (this.#warm) this.#panoPhase.value.set(0, 0, 1, 0);
    else { const k = this.frameIndex % 16; this.#panoPhase.value.set(k % 4, Math.floor(k / 4), 4, 0); }
    renderer.compute(this.#kernels.panorama, this.#warm ? [64, 20, 1] : [16, 5, 1]); this.#warm = false;
    renderer.compute(this.#kernels.trace, [Math.ceil(this.#sourceSize.value.x / 8), Math.ceil(this.#sourceSize.value.y / 8), 1]);
    renderer.compute(this.#kernels.resolve[this.#pp]!, [Math.ceil(this.#historySize.value.x / 8), Math.ceil(this.#historySize.value.y / 8), 1]);
    this.#historyIndex.value = this.#pp; this.#pp = 1 - this.#pp;
    this.viewValid.value = 1; this.historyValid = true; this.frameIndex++;
  }

  resetHistory(): void { this.historyValid = false; this.historyResetCount++; }
  invalidate(): void { this.#warm = true; this.#shadowInit = false; this.resetHistory(); }
  dispose(): void {
    if (this.#disposed) return; this.#disposed = true; this.viewValid.value = 0;
    for (const map of [this.source, this.sourceMeta, this.panorama, ...this.histories, ...this.historyMetas]) map.dispose();
    if (this.#ownShadowMap) this.shadowMap.dispose();
    for (const kernel of [this.#kernels.trace, ...this.#kernels.resolve, this.#kernels.panorama, this.#kernels.shadow]) kernel.dispose();
    if (this.#ownNoise) this.noise.dispose();
  }
}
