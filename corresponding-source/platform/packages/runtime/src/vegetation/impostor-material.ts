/** Tidewater4811ba48 Impostors.js createMaterial, MIT; LICENSE-tidewater.md. */
import { DoubleSide, MeshPhysicalNodeMaterial, TSL, type DirectionalLight } from 'three/webgpu';
import { CANOPY_SURFACE_WGSL } from './canopy-surface.js';
import { vegetationWind, type VegetationWindProvider } from './wind.js';
import type { ImpostorAtlas } from './impostor-atlas.js';
import { registerPlantTransmission, copyPlantTransmission } from './transmission.js';
/* eslint-disable @typescript-eslint/no-explicit-any -- native TSL graph boundary */
type N = any;
export const IMPOSTOR_VERTEX_WGSL = `fn twImpostorVertex(p:vec3f,iPos:vec4f,iDat:vec4f,group0:vec4f,group1:vec4f,variantCounts:vec2f,nearRange:vec2f,farDistance:f32,mainCamera:vec3f,camera:vec3f,time:f32,strength:f32,gust:f32,windDirection:vec3f)->mat4x4f{
	
	

	let g1Flag = iDat.y < 0.0;
	let R = select( group0.x, group1.x, g1Flag );
	let Rh = select( group0.y, group1.y, g1Flag );
	let Hv = select( group0.z, group1.z, g1Flag );
	let Cy = select( group0.w, group1.w, g1Flag );
	let vBase = select( 0.0, variantCounts.x, g1Flag );
	let base = iPos.xyz;
	let sy = abs( iDat.y );
	// LOD window: from the near plant's hand-over distance to the fade-out, else collapsed
	let d = length( mainCamera - base );
	let vis = select( 0.0, 1.0, d >= ( select(nearRange.x,nearRange.y,g1Flag) ) * ( 1.0 - IMP_VERTEX_LOD_BAND / 2.0 ) && d < select( farDistance, 180.0, g1Flag ) );
	// far away the forest is thinned out: fewer, proportionally larger crowns (grown about
	// the base) keep the canopy closed
	let thin = smoothstep( 140.0, 320.0, d );
	let keep = select( 1.0, 0.0, fract( iDat.w * 91.7 ) < thin * 0.5 );
	let grow = thin * 0.4142135623730949 + 1.0;
	let s = iPos.w * grow;
	let C = base + vec3f( 0.0, Cy * s * sy, 0.0 );
	// sway of the whole crown (matches the near plants' trunk sway amplitude)
	let w = strength;
	let g = gust;
	let ph0 = iDat.w * 6.2832;
	let sway = ( w * w * 0.009 * ( g * 0.8 + 0.3 ) + sin( time * 0.9 + ph0 ) * w * 0.0045 * ( g + 0.4 ) ) * iDat.z * 0.45;
	let swayV = windDirection * sway;
	let Cs = C + swayV;
	let imp = vec4f( swayV, s );
	
	
	let toCam = normalize( camera - Cs );
	let right = normalize( cross( IMP_VERTEX_UP, toCam ) + vec3f( 1e-4, 0.0, 0.0 ) );
	let up = cross( toCam, right );
	// quad fitted to the plant's projected extent: its horizontal radius across, from above
	// the crown disc, from the side the (stretched) height
	let k = s * vis * keep;
	let ty = abs( toCam.y );
	let halfW = Rh * k;
	let halfH = ( Hv * sy * sqrt( max( 1.0 - ty * ty, 0.0 ) ) + Rh * ty ) * k;
	
	
	let pos = Cs + right * ( p.x * halfW ) + up * ( p.y * halfH );
	// (three: the geometry normal is left as is, +Z of the quad)
	return mat4x4f(vec4f(pos,1),imp,vec4f(0),vec4f(0));}
const IMP_VERTEX_UP=vec3f(0,1,0);const IMP_VERTEX_LOD_BAND=0.12;`;
export const IMPOSTOR_SHADE_WGSL =
  `fn twImpostorShade(iPos:vec4f,iDat:vec4f,imp:vec4f,P:vec3f,N:vec3f,V:vec3f,pixel:vec2f,frameIndex:u32,group0:vec4f,group1:vec4f,variantCounts:vec2f,nearRange:vec2f,mainCamera:vec3f,camera:vec3f,sunDirection:vec3f,night:f32,atlasA:texture_2d<f32>,atlasB:texture_2d<f32>,smp:sampler,cells:f32)->mat4x4f{var s:ImpShade;
	
	

	let g1Flag = iDat.y < 0.0;
	let R = select( group0.x, group1.x, g1Flag );
	let Rh = select( group0.y, group1.y, g1Flag );
	let Hv = select( group0.z, group1.z, g1Flag );
	let Cy = select( group0.w, group1.w, g1Flag );
	let vBase = select( 0.0, variantCounts.x, g1Flag );
	let base = iPos.xyz;
	let si = imp.w;
	let sy = abs( iDat.y );
	let yaw = iDat.x;
	let cyw = cos( yaw ); let syw = sin( yaw );
	let C = base + vec3f( 0.0, Cy * si * sy, 0.0 ) + imp.xyz;
	// world -> plant-local (unstretched, centred): rotate by -yaw, divide by the scale
	let Ow = camera - C;
	let Dw = P - camera;
	let scl = vec3f( si, si * sy, si );
	let O = vec3f( Ow.x * cyw - Ow.z * syw, Ow.y, Ow.x * syw + Ow.z * cyw ) / scl;
	let D = vec3f( Dw.x * cyw - Dw.z * syw, Dw.y, Dw.x * syw + Dw.z * cyw ) / scl;
	let vdir = normalize( O );
	let vd = normalize( vec3f( vdir.x, max( vdir.y, 0.02 ), vdir.z ) );
	let gg = ( vegOctEncode( vd ) * 0.5 + 0.5 ) * 5.0;
	let gi = floor( clamp( gg, vec2f( 0.0 ), vec2f( 4.9990000000000006 ) ) );
	let fr = gg - gi;
	let upper = fr.x + fr.y > 1.0;
	// triangle of the cell containing g, barycentric weights
	let i0 = select( gi, gi + 1.0, upper );
	let i1 = select( gi + vec2f( 1.0, 0.0 ), gi + vec2f( 0.0, 1.0 ), upper );
	let i2 = select( gi + vec2f( 0.0, 1.0 ), gi + vec2f( 1.0, 0.0 ), upper );
	let w0 = select( 1.0 - fr.x - fr.y, fr.x + fr.y - 1.0, upper );
	let w1 = select( fr.x, 1.0 - fr.x, upper );
	let w2 = select( fr.y, 1.0 - fr.y, upper );
	let variant = vBase + floor(fract(iDat.w * 7.77) * select(variantCounts.x,variantCounts.y,g1Flag));
	var vA = vec4f( 0.0 ); var vB = vec4f( 0.0 );
	// near: blend the three frames around the view direction; far: the dominant frame only
	let blend = length( mainCamera - base ) < 100.0;
	if ( blend ) {
		let s0 = vegImpSample( i0, O, D, variant, R, atlasA, atlasB, smp, cells );
		let s1 = vegImpSample( i1, O, D, variant, R, atlasA, atlasB, smp, cells );
		let s2 = vegImpSample( i2, O, D, variant, R, atlasA, atlasB, smp, cells );
		vA = s0[ 0 ] * w0 + s1[ 0 ] * w1 + s2[ 0 ] * w2;
		vB = s0[ 1 ] * w0 + s1[ 1 ] * w1 + s2[ 1 ] * w2;
	} else {
		let iMax = select( select( i2, i1, w1 >= w2 ), i0, w0 >= max( w1, w2 ) );
		let sm = vegImpSample( iMax, O, D, variant, R, atlasA, atlasB, smp, cells );
		vA = sm[ 0 ];
		vB = sm[ 1 ];
	}
	// cross-fade from the near geometry (incoming level of the band around nearDist)
	let nd = select(nearRange.x,nearRange.y,g1Flag);
	let fade = smoothstep( nd * ( 1.0 - VEG_LOD_BAND / 2.0 ), nd * ( 1.0 + VEG_LOD_BAND / 2.0 ), length( mainCamera - base ) );
	let keep = vA.w > 0.42 && twBayer(pixel,frameIndex) < fade;

	let cov = max( vA.w, 1e-3 );
	let bright = vA.x / cov; let leaf = vA.y / cov; let cr = vA.z / cov;
	// exposure (baked crown AO): the inside and underside of the crown in deep shade
	let ex = vB.w / cov;
	let albedo = vegImpostorColor(iDat.w,cr,leaf,bright,g1Flag) * mix( 0.26, 1.0, ex * ex ) * ( bright * 0.6 + 0.7 );
	s.albedo = albedo;
	// B is written where A has coverage: un-premultiply the filtered edges by A's coverage
	let nl = vB.xyz / max( vA.w, 1e-3 ) * 2.0 - 1.0;
	// local -> world: inverse-transpose of the stretch, then the yaw rotation
	let ns = vec3f( nl.x, nl.y / sy, nl.z );
	let nw = normalize( vec3f( ns.x * cyw + ns.z * syw, ns.y, ns.z * cyw - ns.x * syw ) );
	s.normal = normalize( nw + V * 0.12 );
	s.roughness = 0.85;
	s.metalness = 0.0;
	s.specularIntensity = 0.12;
	// backlit crowns glow at the edges (light through the leaves), like the near canopy
	s.translucency = twImpTransmission(albedo,N,0.35,P,camera,sunDirection,night);
return mat4x4f(vec4f(s.albedo,select(0.0,1.0,keep)),vec4f(s.normal,s.roughness),vec4f(s.translucency,s.specularIntensity),vec4f(0));}
const VEG_UP=vec3f(0,1,0);const VEG_LOD_BAND=0.12;
struct ImpShade{albedo:vec3f,normal:vec3f,roughness:f32,metalness:f32,specularIntensity:f32,translucency:vec3f};
fn vegOctDecode( u: f32, v: f32 ) -> vec3f {
	let x = ( u - v ) * 0.5; let z = ( u + v ) * 0.5;
	return normalize( vec3f( x, 1.0 - abs( x ) - abs( z ), z ) );
}
fn vegOctEncode( d: vec3f ) -> vec2f {
	let p = d / ( abs( d.x ) + abs( d.y ) + abs( d.z ) );
	return vec2f( p.x + p.z, p.z - p.x );
}

fn vegImpSample( ij: vec2f, O: vec3f, D: vec3f, variant: f32, Rf: f32, vegImpA:texture_2d<f32>,vegImpB:texture_2d<f32>,smpLinearClamp:sampler,cells:f32 ) -> array<vec4f, 2> {
	let d = vegOctDecode( ij.x / 5.0 * 2.0 - 1.0, ij.y / 5.0 * 2.0 - 1.0 );
	let right = normalize( cross( VEG_UP, d ) );
	let up = cross( d, right );
	let t = - dot( O, d ) / dot( D, d );
	let P = O + D * t;
	let a = dot( P, right ) / Rf; let b = dot( P, up ) / Rf;
	let cu = variant * 6.0 + ij.x + ( a * 0.5 + 0.5 );
	let cv = ij.y + ( b * 0.5 + 0.5 );
	let inCell = abs( a ) < 1.0 && abs( b ) < 1.0;
	// render targets are stored top row first: flip v
	let st = vec2f( cu / cells, 1.0 - cv / 6.0 );
	let k = select( 0.0, 1.0, inCell );
	return array<vec4f, 2>( textureSample( vegImpA, smpLinearClamp, st ) * k, textureSample( vegImpB, smpLinearClamp, st ) * k );
}

fn twBayer(pixel:vec2f,f:u32)->f32{let p=vec2u(pixel)+vec2u(f*3u,f>>2u);let x0=p.x&1u;let x1=(p.x>>1u)&1u;let y0=p.y&1u;let y1=(p.y>>1u)&1u;let v=((x0^y0)<<3u)|(y0<<2u)|((x1^y1)<<1u)|y1;return(f32(v)+.5)/16.;}
fn twImpTransmission(albedo:vec3f,N:vec3f,strength:f32,P:vec3f,camera:vec3f,sunDirection:vec3f,night:f32)->vec3f{let V=normalize(camera-P);let back=sat(dot(-N,sunDirection));let forward=pow(sat(dot(-V,sunDirection)),3.)*.7+.3;let tint=albedo*vec3f(1.25,1.45,.55)+vec3f(.012,.018,0);return tint*(back*forward*strength)*(1.-night);}` +
  CANOPY_SURFACE_WGSL;
export interface ImpostorMaterialBindings {
  atlas: Pick<ImpostorAtlas, 'groups' | 'rtA' | 'rtB' | 'variantCount'>;
  wind: VegetationWindProvider;
  time: N;
  mainCamera: N;
  nearRange: N;
  farDistance: N;
  frame: N;
  sun: DirectionalLight;
  sunDirection: N;
  night: N;
  /** Raw quad inputs; never apply ordinary item's instanceMatrix to the source billboard. */
  quad?: { position: N; normal: N };
}
/** Source world-space iPos/iDat attributes on the source quad. Keep object transform identity.
 * Atlas, wind, camera, sun and clock are borrowed; caller disposes only the returned material. */
export function createImpostorMaterial(b: ImpostorMaterialBindings): MeshPhysicalNodeMaterial {
  const [g0, g1] = b.atlas.groups;
  if (b.atlas.groups.length !== 2 || !g0 || !g1)
    throw new Error('Canopy impostors require tree and shrub groups');
  const t = TSL as N,
    mat = new MeshPhysicalNodeMaterial({ side: DoubleSide });
  mat.name = 'tidewater-canopy-impostor';
  const iPos = t.attribute('iPos', 'vec4'),
    iDat = t.attribute('iDat', 'vec4'),
    imp = t.varyingProperty('vec4', 'twImpostorSwayScale');
  const group = (g: ImpostorMaterialBindings['atlas']['groups'][number]) =>
    t.vec4(g.radius, g.rh, g.hv, g.center.y);
  const common = {
    iPos,
    iDat,
    group0: group(g0),
    group1: group(g1),
    variantCounts: t.vec2(g0.variants.length, g1.variants.length),
    nearRange: b.nearRange,
    mainCamera: b.mainCamera,
    camera: t.cameraPosition,
  };
  const wind = vegetationWind(b.wind, iPos.xz);
  mat.positionNode = t.Fn(() => {
    const v = t.wgslFn(IMPOSTOR_VERTEX_WGSL)({
      ...common,
      p: b.quad?.position ?? t.attribute('position', 'vec3'),
      farDistance: b.farDistance,
      time: b.time,
      strength: wind.strength,
      gust: wind.gust,
      windDirection: wind.direction,
    });
    imp.assign(v.element(1));
    return t.vec3(v.element(0).xyz);
  })();
  const texA = t.texture(b.atlas.rtA.texture),
    texB = t.texture(b.atlas.rtB.texture);
  const shade = t.wgslFn(IMPOSTOR_SHADE_WGSL)({
    ...common,
    imp,
    P: t.positionWorld,
    N: (b.quad?.normal ?? t.attribute('normal', 'vec3')).normalize().mul(t.select(t.frontFacing, 1, -1)),
    V: t.positionViewDirection.transformDirection(t.cameraWorldMatrix),
    pixel: t.screenCoordinate,
    frameIndex: b.frame,
    sunDirection: b.sunDirection,
    night: b.night,
    atlasA: texA,
    atlasB: texB,
    smp: t.sampler(texA),
    cells: t.float(b.atlas.variantCount * 6),
  });
  mat.colorNode = shade.element(0).rgb;
  mat.maskNode = shade.element(0).a.greaterThan(0.5);
  mat.normalNode = t.cameraViewMatrix.mul(t.vec4(shade.element(1).xyz, 0)).xyz;
  mat.roughnessNode = shade.element(1).w;
  mat.metalness = 0;
  mat.specularIntensityNode = shade.element(2).w;
  registerPlantTransmission(mat, shade.element(2).rgb);
  copyPlantTransmission(mat, mat, b.sun);
  return mat;
}
