/** Tidewater VegNodes.js 4811ba48, ©2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { TSL } from 'three/webgpu';
import { vegetationWind, type VegetationWindProvider } from './wind.js';
/* eslint-disable @typescript-eslint/no-explicit-any -- native TSL graph boundary */
type N = any;

/** Source equations preserved; global frame/wind inputs become explicit parameters. */
export const PLANT_DEFORMATION_WGSL = `
fn twPlant(P: vec3f, N0: vec3f, iPos: vec4f, iDat: vec4f, veg: vec4f, aMat: vec4f, aLobe: vec4f, lodRange: vec3f, time: f32, strength: f32, gust: f32, windDirection: vec3f, windPerpendicular: vec3f, camera: vec3f) -> mat4x3f {
 let result = vegPlantDeform(P,N0,iPos,iDat,veg,aMat,aLobe,lodRange,time,strength,gust,windDirection,windPerpendicular,camera);
 return mat4x3f(result.pos,result.normal,result.trunkT,vec3f(result.trunkY,0.0,0.0));
}
const VEG_UP = vec3f(0.0,1.0,0.0);
const VEG_LOD_BAND = 0.12;
struct VegPlant { pos: vec3f, normal: vec3f, trunkY: f32, trunkT: vec3f };
fn vegRotUpTo( v: vec3f, T: vec3f ) -> vec3f {
	let k = vec3f( T.z, 0.0, -T.x );
	let c1 = cross( k, v );
	return v + c1 + cross( k, c1 ) / ( T.y + 1.0 );
}
fn vegLodScale( base: vec3f, lodRange: vec3f, camera: vec3f ) -> f32 {
	let d = length( camera - base );
	let inside = d >= lodRange.x * ( 1.0 - VEG_LOD_BAND / 2.0 );
	let hardEnd = lodRange.z - lodRange.y < 0.05;
	let endK = select( 1.0 - smoothstep( lodRange.y, lodRange.z, d ), select( 0.0, 1.0, d < lodRange.y * ( 1.0 + VEG_LOD_BAND / 2.0 ) ), hardEnd );
	return select( 0.0, endK, inside );
}
fn vegPlantDeform( P: vec3f, N0: vec3f, iPos: vec4f, iDat: vec4f, veg: vec4f, aMat: vec4f, aLobe: vec4f, lodRange: vec3f, time: f32, strength: f32, gust: f32, windDirection: vec3f, windPerpendicular: vec3f, camera: vec3f ) -> VegPlant {
	let part = aMat.x;
	let base = iPos.xyz;
	let sc = iPos.w;
	let leanDir = vec3f( cos( iDat.x ), 0.0, sin( iDat.x ) );
	let lean = iDat.y;
	let H = iDat.z;
	// merged geometries (understory): the instance's plant kind is the integer part of the seed;
	// vertices of the other plants collapse onto the base
	let seed = fract( iDat.w );
	let kindI = floor( iDat.w );
	let kindV = -aLobe.w - 1.0;
	let keepKind = kindV < 0.5 || abs( kindV - kindI ) < 0.5;

	let u = veg.x;
	let s = veg.y;
	let flut = veg.z;
	let ph = veg.w;

	let t = time;
	let w = strength;
	let g = gust;
	let ph0 = seed * 6.2832;
	let windDir3 = windDirection;
	let windPerp3 = windPerpendicular;

	// stem sway: horizontal offset of the top as a fraction of H
	let sway = w * w * 0.014 * ( g * 0.9 + 0.3 ) + sin( t * 0.83 + ph0 ) * w * 0.0065 * ( g + 0.45 );
	let swayP = sin( t * 0.61 + ph0 * 1.7 ) * w * 0.0028;
	let windOff = windDir3 * sway + windPerp3 * swayP;

	// stem curve: mix of a straight tilt and a "banana" curve (vertical at the top)
	let c = fract( seed * 7.31 );
	let fc = mix( u, u * ( ( 1.0 - u ) + 1.0 ), c );
	let df = mix( 1.0, ( 1.0 - u ) * 2.0, c );
	let off = leanDir * ( lean * fc ) + windOff * ( u * u );
	let T = normalize( VEG_UP + leanDir * ( lean * df ) + windOff * ( u * 2.0 ) );

	let radial = vec3f( P.x - base.x, 0.0, P.z - base.z );
	let axisPt = base + vec3f( 0.0, u * H, 0.0 ) + off * H;
	let stemPos = axisPt + vegRotUpTo( radial, T );
	let stemN = vegRotUpTo( N0, T );

	// crown: follows the stem top, tilted half as much as the stem tip
	let Ttop = normalize( VEG_UP + leanDir * ( lean * ( 1.0 - c ) ) + windOff * 2.0 );
	let Ttilt = normalize( VEG_UP + Ttop );
	let C = base + vec3f( 0.0, H, 0.0 ) + ( leanDir * lean + windOff ) * H;
	let o1 = vegRotUpTo( P - base, Ttilt );
	let N1 = vegRotUpTo( N0, Ttilt );

	// frond / leaf motion: gust bending + slow bounce + leaflet flutter, applied as a
	// length preserving rotation about the crown centre so fronds stream downwind in storms.
	let s2 = s * s;
	let bend = s2 * sc * 4.5 * ( w * w * 0.16 * ( g * 0.8 + 0.35 )
		+ sin( t * ( ph * 0.5 + 1.3 ) + ph * 23.0 + ph0 ) * w * 0.075 * ( g + 0.3 ) );
	let bounce = sin( t * ( ph + 2.1 ) + ph * 41.0 ) * s2 * w * sc * 0.1;
	let flutter = flut * sc * ( sin( t * ( ph * 5.0 + 11.0 ) + ph * 60.0 + s * 9.0 ) * ( w * 0.045 + 0.008 )
		+ sin( t * 23.0 + ph * 13.0 + s * 17.0 ) * ( max( w - 1.0, 0.0 ) * 0.05 ) );
	let disp = windDir3 * bend + VEG_UP * ( bounce - bend * 0.3 ) + N1 * flutter;
	let L = length( o1 );
	let o2 = normalize( o1 + disp + vec3f( 0.0, 1e-5, 0.0 ) ) * L;
	let crownPos = C + o2;

	// the dead (hanging) frond is only kept on some palms
	let hideDead = part > 0.5 && part < 1.5 && aMat.y > 0.95 && fract( seed * 13.7 ) > 0.4;
	let crownPos2 = select( crownPos, C, hideDead );

	let isStem = part < 0.5;
	let pos = select( crownPos2, stemPos, isStem );

	var out: VegPlant;
	out.normal = select( N1, stemN, isStem );
	out.trunkY = u * H;
	out.trunkT = T;

	// LOD window / distance fade: shrink around the base (ferns fade out earlier)
	let dCam = length( camera - base );
	let fernFade = select( 1.0, 1.0 - smoothstep( 42.0, 58.0, dCam ), kindI > 2.5 && kindI < 3.5 );
	let k = vegLodScale( base, lodRange, camera ) * fernFade * select( 0.0, 1.0, keepKind );
	out.pos = base + ( pos - base ) * k;
	return out;
}
`;

export interface PlantDeformationInputs {
  /** Position/normal after instance transform, in world space; source crown positions remain crown-local about base. */
  position: N;
  normal: N;
  instancePosition: N;
  instanceData: N;
  vegetation: N;
  material: N;
  lobe: N;
  lodRange: N;
  /** Main camera for visible AND shadow passes, never the shadow camera. */
  camera: N;
  time: N;
}
export function plantDeformation(provider: VegetationWindProvider, input: PlantDeformationInputs): {
  position: N; normal: N; trunkDirection: N; trunkHeight: N;
} {
  const t = TSL as N;
  const wind = vegetationWind(provider, input.instancePosition.xz);
  const result = t.wgslFn(PLANT_DEFORMATION_WGSL)({
    P: input.position, N0: input.normal, iPos: input.instancePosition, iDat: input.instanceData,
    veg: input.vegetation, aMat: input.material, aLobe: input.lobe, lodRange: input.lodRange,
    time: input.time, strength: wind.strength, gust: wind.gust, windDirection: wind.direction,
    windPerpendicular: wind.perpendicular, camera: input.camera,
  });
  return { position: result.element(0), normal: result.element(1),
    trunkDirection: result.element(2), trunkHeight: t.vec3(result.element(3)).x };
}
