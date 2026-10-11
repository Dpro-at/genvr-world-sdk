/** Source Tidewater palm material binding. MIT; LICENSE-tidewater.md. */
import { DoubleSide, MeshPhysicalNodeMaterial, TSL, type DirectionalLight } from 'three/webgpu';
import { PLANT_SURFACE_WGSL } from './plant-surface.js';
import { plantDeformation } from './deformation.js';
import { lodFadeNode } from '../tidewater-sky/lod-fade.js';
import type { VegetationWindProvider } from './wind.js';
import { registerPlantTransmission, copyPlantTransmission } from './transmission.js';
/* eslint-disable @typescript-eslint/no-explicit-any -- native TSL/material extension boundary */
type N=any;
export const PALM_SHADE_WGSL=`
fn twPalmShade(st:vec2f,aMat:vec4f,iDat:vec4f,trunkY:f32,trunkT:vec3f,P:vec3f,base:vec3f,N:vec3f,V:vec3f,front:bool,camera:vec3f,sunDirection:vec3f,night:f32)->mat4x4f {
 var s:PlantShade;

	let keep = vegPlantMask(st,aMat,iDat);
	
	let part = aMat.x;
	let age = aMat.y;
	let isStem = part < 0.5;
	let isNut = part > 4.5 && part < 5.5;
	let isLeaf = ! isStem && ! isNut;
	let isBroad = part > 5.5;
	var albedo = vegPlantAlbedo(st,aMat,iDat,trunkY,P.y-base.y);
	// the underside of fronds and leaves is duller and a little bluer than the waxy upper side
	let upper = front;
	albedo = select( albedo * vec3f( 0.74, 0.8, 0.84 ), albedo, upper || ! isLeaf );
	s.albedo = albedo;
	// stems: leaf-scar ring bump along the trunk axis; leaves: normals bent slightly towards
	// the viewer to soften grazing-angle Fresnel
	// palm trunks: bark relief (rings, fissures, roots, fibres) along the trunk axis (finite
	// difference of the bark height, faded with distance); leaves: normals bent towards the viewer
	var d = 0.0;
	var dA = 0.0;
	let fadeB = 1.0 - smoothstep( 10.0, 32.0, length( camera - P ) );
	if ( isStem && fadeB > 0.0 ) {
		let seed = iDat.w;
		let H = iDat.z;
		let y = trunkY;
		let a = st.x;
		let ivN = vegHash12( vec2f( seed * 37.1, 1.7 ) );
		let e = 0.004;
		let ea = 0.0015; // around the trunk (a: 0..1 over a ~1.1 m circumference)
		let h0 = vegPalmBark( y, a, H, seed, ivN ).hd;
		let slope = ( vegPalmBark( y + e, a, H, seed, ivN ).hd - h0 ) / e;
		let slopeA = ( vegPalmBark( y, a + ea, H, seed, ivN ).hd - h0 ) / ( ea * 1.1 );
		d = slope * fadeB * ( 1.0 - age );
		dA = slopeA * fadeB * ( 1.0 - age );
	}
	s.normal = normalize( N - trunkT * d - cross( N, trunkT ) * dA + V * select( 0.0, 0.15, isLeaf ) );
	// waxy but not glossy: a sharper, stronger sheen mirrored the bright sky near the sun and read as a
	// white film over backlit foliage
	// broadleaf: monstera glossy, elephant ear waxy-matte, heliconia satin, bracts glossy; dead
	// leaves dull
	let broadR = select( select( select( 0.45, 0.42, part > 7.5 ), 0.58, part > 6.5 && part < 7.5 ), 0.46, part < 6.5 );
	s.roughness = select( select( select( 0.7, 0.62, part < 1.5 || isNut ), 0.92, isStem ), mix( broadR, 0.85, smoothstep( 0.9, 0.98, age ) ), isBroad );
	s.metalness = 0.0;
	s.specularIntensity = select( select( 0.4, 0.3, isStem ), 0.42, isBroad );
	s.translucency = vec3f( 0.0 );
	if ( isLeaf ) { s.translucency = twTransmission(albedo,N,select(0.3,0.2,isBroad),P,camera,sunDirection,night); }
 return mat4x4f(vec4f(s.albedo,select(0.0,1.0,keep)),vec4f(s.normal,s.roughness),vec4f(s.translucency,s.specularIntensity),vec4f(0));
}
struct PlantShade{albedo:vec3f,normal:vec3f,roughness:f32,metalness:f32,specularIntensity:f32,translucency:vec3f};
fn twTransmission(albedo:vec3f,N:vec3f,strength:f32,P:vec3f,camera:vec3f,sunDirection:vec3f,night:f32)->vec3f{
 let V=normalize(camera-P);let back=sat(dot(-N,sunDirection));let forward=pow(sat(dot(-V,sunDirection)),3.0)*0.7+0.3;
 let tint=albedo*vec3f(1.25,1.45,0.55)+vec3f(0.012,0.018,0);
 return tint*(back*forward*strength)*(1.0-night);
}
`+PLANT_SURFACE_WGSL.slice(PLANT_SURFACE_WGSL.indexOf('fn sat('));

export interface PalmMaterialBindings {
 wind:VegetationWindProvider;time:N;mainCamera:N;lodRange:N;frame:N;
 sun:DirectionalLight;sunDirection:N;night:N;
 /** Optional ItemsView source-vertex adapter. Unsupported transforms keep the baked pose. */
 instance?:{position:N;normal:N;enabled:N;trunkDirection:N};
}
/** Instanced source palm geometry; iPos/iDat are world-space. Group/object transform must be identity.
 * Lighting adapters must explicitly transfer registered transmission after cloning.
 * Caller owns all borrowed bindings and material disposal. */
export function createPalmMaterial(b:PalmMaterialBindings):MeshPhysicalNodeMaterial {
 const t=TSL as N,mat=new MeshPhysicalNodeMaterial({side:DoubleSide});
 const iPos=t.attribute('iPos','vec4'),iDat=t.attribute('iDat','vec4'),aMat=t.attribute('aMat','vec4');
 const vN=t.varyingProperty('vec3','twPalmNormal'),vT=t.varyingProperty('vec3','twPalmTrunkT'),vY=t.varyingProperty('float','twPalmTrunkY');
 mat.positionNode=t.Fn(()=>{
  const d=plantDeformation(b.wind,{position:b.instance?.position??t.positionLocal,normal:b.instance?.normal??t.normalLocal,instancePosition:iPos,instanceData:iDat,vegetation:t.attribute('aVeg','vec4'),material:aMat,lobe:t.attribute('aLobe','vec4'),lodRange:b.lodRange,camera:b.mainCamera,time:b.time});
  vN.assign(b.instance?t.select(b.instance.enabled,d.normal,t.normalLocal):d.normal);
  vT.assign(b.instance?t.select(b.instance.enabled,d.trunkDirection,b.instance.trunkDirection):d.trunkDirection);vY.assign(d.trunkHeight);
  return b.instance?t.select(b.instance.enabled,d.position,t.positionLocal):d.position;
 })();
 const normal=vN.normalize().mul(t.select(t.frontFacing,1,-1));
 const shade=t.wgslFn(PALM_SHADE_WGSL)({st:t.uv(),aMat,iDat,trunkY:vY,trunkT:vT,P:t.positionWorld,base:iPos.xyz,N:normal,V:t.positionViewDirection.transformDirection(t.cameraWorldMatrix),front:t.frontFacing,camera:b.mainCamera,sunDirection:b.sunDirection,night:b.night});
 const d=t.distance(b.mainCamera,iPos.xyz),range=b.lodRange;
 const fadeIn=t.select(range.x.greaterThan(0),t.smoothstep(range.x.mul(.94),range.x.mul(1.06),d),1);
 const fadeOut=t.select(range.z.sub(range.y).lessThan(.05),t.smoothstep(range.y.mul(.94),range.y.mul(1.06),d),0);
 mat.colorNode=shade.element(0).rgb;
 mat.maskNode=shade.element(0).a.greaterThan(.5).and(lodFadeNode(fadeIn,false,b.frame)).and(lodFadeNode(fadeOut,true,b.frame));
 mat.normalNode=t.cameraViewMatrix.mul(t.vec4(shade.element(1).xyz,0)).xyz;
 mat.roughnessNode=shade.element(1).w;mat.metalness=0;mat.specularIntensityNode=shade.element(2).w;
 registerPlantTransmission(mat,shade.element(2).rgb);
 copyPlantTransmission(mat,mat,b.sun);
 return mat;
}
