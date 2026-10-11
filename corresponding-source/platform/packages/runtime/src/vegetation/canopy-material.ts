/** Source Tidewater4811ba48 near canopy binding. MIT; LICENSE-tidewater.md. */
import { DoubleSide, MeshPhysicalNodeMaterial, TSL, type DirectionalLight } from 'three/webgpu';
import { CANOPY_SURFACE_WGSL } from './canopy-surface.js';
import { canopyDeformation } from './canopy-deformation.js';
import type { VegetationWindProvider } from './wind.js';
import type { LeafAtlas } from './leaf-atlas.js';
import { lodFadeNode } from '../tidewater-sky/lod-fade.js';
import { registerPlantTransmission, copyPlantTransmission } from './transmission.js';
/* eslint-disable @typescript-eslint/no-explicit-any -- native shader boundary */
type N = any;
export const CANOPY_SHADE_WGSL =
  `
fn twCanopyShade(st:vec2f,aMat:vec4f,iDat:vec4f,hf:f32,sourceNormal:vec3f,N:vec3f,V:vec3f,P:vec3f,L0:vec4f,camera:vec3f,sunDirection:vec3f,night:f32)->mat4x4f{
 var in:CanopyInput;in.uv=st;in.vs.vMat=aMat;in.vs.vIDat=iDat;in.vs.vHf=hf;in.vs.normal=sourceNormal;in.N=N;in.V=V;in.P=P;twLeaf=L0;var s:CanopyShade;

	let part = aMat.x;
	let ao = aMat.y;
	let cr = aMat.z;
	let seed = in.vs.vIDat.w;
	let isBark = part < 0.5 || part > 4.5;
	let isShrub = part > 2.5;
	let spT = vegTreeSpecies( seed ); let spS = vegShrubSpecies( seed );
	// leaf cluster sampled once (first in the fragment shader), shared by the mask and the colour
	let L = vegCanopyLeaf( in );
	let keep=twCanopyCoverage(in,L);
	let bright = L.y * 1.4;
	let cell = L.z;
	var c = vegCanopyLeafColor( seed, cr, isShrub ) * bright;
	// species details: red-veined old leaves (sea grape), variegation (croton), flowers (hibiscus)
	let shrub0 = isShrub && spS < 0.5; let shrub1 = isShrub && spS == 1.0; let shrub2 = isShrub && spS > 1.5;
	c = mix( c, vec3f( 0.194618, 0.042311, 0.015996 ), smoothstep( 0.86, 0.98, cell ) * 0.55 * select( 0.0, 1.0, shrub0 ) );
	let vari = select( vec3f( 0.194618, 0.042311, 0.015996 ), vec3f( 0.323143, 0.254152, 0.029557 ), fract( cell * 7.3 ) > 0.5 );
	c = mix( c, vari, smoothstep( 0.72, 0.9, cell ) * 0.55 * select( 0.0, 1.0, shrub1 ) );
	c = select( c, vec3f( 0.450786, 0.019382, 0.012983 ), shrub2 && cell > 0.92 );
	// trees: a few old leaves turning red / yellow before they drop (sea almond)
	let treeK = select( 1.0, 0.0, isShrub );
	c = mix( c, mix( vec3f( 0.254152, 0.194618, 0.042311 ), vec3f( 0.208637, 0.048172, 0.015996 ), step( 0.992, fract( cell * 3.7 ) ) ), step( 0.984, fract( cell * 3.7 ) ) * treeK * 0.6 );
	// sunlit outer / upper leaves brighter and a little yellow-green; shaded interior kept for contrast
	let outer = smoothstep( 0.62, 1.0, ao );
	c = mix( c, c * vec3f( 1.16, 1.22, 0.92 ), outer * 0.7 );
	let leaf = c * mix( 0.55, 1.0, ao );
	// bark: grey-brown with vertical streaks, lichen patches
	let hfB = in.vs.vHf;
	var albedo = leaf;
	if ( isBark ) {
		let st = in.uv;
		let n2 = vegNoise( vec2f( st.x * 6.0, st.y * 0.7 ) );
		var bark = vegBarkColor( vegNoise( vec2f( st.x * 30.0, st.y * 2.5 + seed * 40.0 ) ), n2 );
		// moss and epiphytes on the humid lower trunk and the upper sides of the limbs
		bark = mix( bark, mix( vec3f( 0.025187, 0.042311, 0.009134 ), vec3f( 0.057805, 0.090842, 0.023153 ), n2 ), smoothstep( 0.45, 0.7, vegNoise( vec2f( st.x * 9.0, st.y * 1.3 + seed * 11.0 ) ) + ( 0.35 - hfB ) * 0.6 ) * 0.7 );
		albedo = bark;
	}
	s.albedo = albedo;
	// bark: the trunk under the crown sees little of the sky
	s.ao = select( mix( 0.35, 1.0, ao ), smoothstep( 0.0, 0.75, hfB ) * 0.45 + 0.4, isBark );
	s.roughness = select( select( 0.82, 0.65, ( isShrub && spS < 0.5 ) || ( ! isShrub && spT < 0.5 ) ), 0.92, isBark );
	s.metalness = 0.0;
	s.specularIntensity = 0.15;
	// leaves: canopy (spherical) normals, not flipped on back faces, bent towards the viewer
	// so they are never shaded at grazing angles (avoids a white Fresnel sheen when backlit)
	let geoN = normalize( in.vs.normal );
	s.normal = select( normalize( geoN + in.V * 0.7 ), in.N, isBark );
	s.translucency = vec3f( 0.0 );
	if ( ! isBark ) { s.translucency = twCanopyTransmission(albedo,geoN,0.5,in.P,camera,sunDirection,night) * ( ao * 0.6 + 0.4 ); }
 return mat4x4f(vec4f(s.albedo,select(0.0,1.0,keep)),vec4f(s.normal,s.roughness),vec4f(s.translucency,s.specularIntensity),vec4f(s.ao,0,0,0));
}
struct CanopyVs{vMat:vec4f,vIDat:vec4f,vHf:f32,normal:vec3f};
struct CanopyInput{uv:vec2f,vs:CanopyVs,P:vec3f,N:vec3f,V:vec3f};
struct CanopyShade{albedo:vec3f,normal:vec3f,ao:f32,roughness:f32,metalness:f32,specularIntensity:f32,translucency:vec3f};
var<private> twLeaf:vec4f;
fn vegCanopyLeaf(in:CanopyInput)->vec4f{return twLeaf;}
fn twCanopyCoverage(in:CanopyInput,L:vec4f)->bool {
 let part=in.vs.vMat.x;let isBark=part<0.5||part>4.5;
 let facing=abs(dot(normalize(cross(dpdx(in.P),dpdy(in.P))),in.V));
 let thr=vegCoverageThreshold(in.uv)+(1.0-smoothstep(0.08,0.35,facing))*0.45;
 return isBark||L.x>thr;
}
fn twCanopyTransmission( albedo: vec3f, N: vec3f, strength: f32, P: vec3f, camera:vec3f,sunDirection:vec3f,night:f32 ) -> vec3f {
	let V = normalize( camera - P );
	let L = sunDirection;
	let back = sat( dot( -N, L ) );
	let forward = pow( sat( dot( -V, L ) ), 3.0 ) * 0.7 + 0.3;
	let tint = albedo * vec3f( 1.25, 1.45, 0.55 ) + vec3f( 0.012, 0.018, 0.0 );
	return tint * ( back * forward * strength ) * ( 1.0 - night );
}
` + CANOPY_SURFACE_WGSL;

export interface CanopyMaterialBindings {
  wind: VegetationWindProvider;
  atlas: Pick<LeafAtlas, 'sample'>;
  time: N;
  mainCamera: N;
  nearRange: N;
  frame: N;
  sun: DirectionalLight;
  sunDirection: N;
  night: N;
  /** Exact raw-source instance transform, before deformation; normal must remain unnormalized. */
  instance?: { position: N; normal: N; enabled: N };
}
/** Source instance-transformed near geometry; identity world group. No owned atlas/provider.
 * Spherical leaf normals are not flipped on back faces. Shader can consume merged tree/shrub parts. */
export function createCanopyMaterial(b: CanopyMaterialBindings): MeshPhysicalNodeMaterial {
  const t = TSL as N,
    mat = new MeshPhysicalNodeMaterial({ side: DoubleSide });
  const iPos = t.attribute('iPos', 'vec4'),
    iDat = t.attribute('iDat', 'vec4'),
    aMat = t.attribute('aMat', 'vec4'),
    veg = t.attribute('aVeg', 'vec4');
  const geoN = t.varyingProperty('vec3', 'twCanopyNormal');
  mat.positionNode = t.Fn(() => {
    const d = canopyDeformation(b.wind, {
      position: b.instance?.position ?? t.positionLocal,
      normal: b.instance?.normal ?? t.normalLocal,
      instancePosition: iPos,
      instanceData: iDat,
      vegetation: veg,
      material: aMat,
      lobe: t.attribute('aLobe', 'vec4'),
      camera: b.mainCamera,
      time: b.time,
      nearRange: b.nearRange,
    });
    geoN.assign(b.instance ? t.select(b.instance.enabled, d.normal, t.normalLocal) : d.normal);
    return b.instance ? t.select(b.instance.enabled, d.position, t.positionLocal) : d.position;
  })();
  const tile = t.wgslFn(
    'fn twTile(seed:f32,shrub:bool)->f32{let spT=floor(fract(seed*5.31)*4.0);let p=fract(seed*3.17);let spS=select(select(2.0,1.0,p<0.6),0.0,p<0.45);return select(select(0.0,1.0,fract(spT*.5)>.25),select(2.0,3.0,spS==1.0),shrub);}',
  )({ seed: iDat.w, shrub: aMat.x.greaterThan(2.5) });
  const shade = t.wgslFn(CANOPY_SHADE_WGSL)({
    st: t.uv(),
    aMat,
    iDat,
    hf: veg.x,
    sourceNormal: geoN,
    N: geoN.normalize().mul(t.select(t.frontFacing, 1, -1)),
    V: t.positionViewDirection.transformDirection(t.cameraWorldMatrix),
    P: t.positionWorld,
    L0: b.atlas.sample(t.uv(), tile),
    camera: t.cameraPosition,
    sunDirection: b.sunDirection,
    night: b.night,
  });
  const near = t.select(iDat.y.lessThan(0), b.nearRange.y, b.nearRange.x),
    distance = t.distance(b.mainCamera, iPos.xyz);
  const fade = t.smoothstep(near.mul(0.94), near.mul(1.06), distance);
  mat.colorNode = shade.element(0).rgb;
  mat.maskNode = shade
    .element(0)
    .a.greaterThan(0.5)
    .and(lodFadeNode(fade, true, b.frame));
  if (b.instance)
    mat.maskNode = t.select(b.instance.enabled, mat.maskNode, shade.element(0).a.greaterThan(0.5));
  mat.normalNode = t.cameraViewMatrix.mul(t.vec4(shade.element(1).xyz, 0)).xyz;
  mat.roughnessNode = shade.element(1).w;
  mat.aoNode = shade.element(3).x;
  mat.metalness = 0;
  mat.specularIntensityNode = shade.element(2).w;
  registerPlantTransmission(mat, shade.element(2).rgb);
  copyPlantTransmission(mat, mat, b.sun);
  return mat;
}
