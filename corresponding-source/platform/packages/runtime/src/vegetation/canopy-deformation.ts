/** Tidewater4811ba48 near canopy deformation. MIT; LICENSE-tidewater.md. */
import { TSL } from 'three/webgpu';
import { TREE_VARIANTS } from './forest-tree-geometry.js';
import { LOBE_TABLE, SHRUB_VARIANTS } from './shrub-geometry.js';
import { vegetationWind, type VegetationWindProvider } from './wind.js';
/* eslint-disable @typescript-eslint/no-explicit-any -- native TSL graph boundary */
type N = any;
export const CANOPY_LOBE_WGSL = `
const twLobes = array<f32, ${LOBE_TABLE.length}>(${Array.from(LOBE_TABLE, (x) => `${x}`).join(',')});
fn twCanopyVariant(seed:f32,isShrub:bool)->f32 {
 return floor(fract(seed*7.77)*select(${TREE_VARIANTS}.0,${SHRUB_VARIANTS}.0,isShrub));
}
fn twCanopyLobe(seed:f32,li:f32,isShrub:bool)->f32 {
 let row=twCanopyVariant(seed,isShrub)+select(0.0,${TREE_VARIANTS}.0,isShrub);
 return twLobes[i32(row*8.0+max(li,0.0))];
}`;
export const CANOPY_DEFORMATION_WGSL =
  `
fn twCanopyDeform(P0:vec3f,N:vec3f,iPos:vec4f,iDat:vec4f,veg:vec4f,aMat:vec4f,aLobe:vec4f,time:f32,strength:f32,gust:f32,windDirection:vec3f,windPerpendicular:vec3f,camera:vec3f,nearRange:vec2f)->mat2x3f {
 let base=iPos.xyz;let sc=iPos.w;let Hh=iDat.z;let seed=iDat.w;
 let hf=veg.x;let flex=veg.y;let flut=veg.z;let ph=veg.w;var P=P0;
 let isShrubI=iDat.y<0.0;
 let isShrubPart=aMat.x>3.5;
 let keep=select(0.0,1.0,isShrubPart==isShrubI);
 let lobe=aLobe;
 let lk=select(0.0,1.0-twCanopyLobe(seed,lobe.w,isShrubI),lobe.w>=0.0);
 let ld=lobe.xyz*lk;
 let yaw=iDat.x;let cy=cos(yaw);let sy=sin(yaw);let sv=abs(iDat.y);
 P+=vec3f(ld.x*cy+ld.z*sy,ld.y*sv,ld.z*cy-ld.x*sy)*sc;
 let w=strength;let g=gust;let t=time;let ph0=seed*6.2832;let h2=hf*hf;
 let sway=(w*w*0.009*(g*0.8+0.3)+sin(t*0.9+ph0)*w*0.0045*(g+0.4))*Hh*h2;
 let swayP=sin(t*0.67+ph0*1.3)*w*0.002*Hh*h2;
 let branch=sin(t*(ph+1.7)+ph*20.0+ph0)*flex*w*sc*0.07*(g+0.5)-flex*w*w*sc*0.04*(g+0.3);
 let flutter=sin(t*9.5+ph*50.0+P.x*1.9+P.z*2.3)*flut*sc*(w*0.035+0.005);
 let pos=P+windDirection*sway+windPerpendicular*swayP+vec3f(0,1,0)*branch+N*flutter;
 let dCam=length(camera-base);
 let nearK=select(0.0,1.0,dCam<select(nearRange.x,nearRange.y,isShrubI)*(1.0+0.12/2.0));
 return mat2x3f(base+(pos-base)*(keep*nearK),N);
}` + CANOPY_LOBE_WGSL;

export interface CanopyDeformationInputs {
  /** Already instance-transformed position and source instance normal; no normalization is added. */
  position: N;
  normal: N;
  instancePosition: N;
  instanceData: N;
  vegetation: N;
  material: N;
  lobe: N;
  camera: N;
  time: N;
  /** Explicit tree/shrub near distances. Original defaults are75/45m. */
  nearRange: N;
}
/** Borrowed provider; one main camera for visible and shadow graphs. No owned GPU resources. */
export function canopyDeformation(
  provider: VegetationWindProvider,
  i: CanopyDeformationInputs,
): { position: N; normal: N } {
  const t = TSL as N,
    wind = vegetationWind(provider, i.instancePosition.xz);
  const result = t.wgslFn(CANOPY_DEFORMATION_WGSL)({
    P0: i.position,
    N: i.normal,
    iPos: i.instancePosition,
    iDat: i.instanceData,
    veg: i.vegetation,
    aMat: i.material,
    aLobe: i.lobe,
    time: i.time,
    strength: wind.strength,
    gust: wind.gust,
    windDirection: wind.direction,
    windPerpendicular: wind.perpendicular,
    camera: i.camera,
    nearRange: i.nearRange,
  });
  return { position: t.vec3(result.element(0)), normal: t.vec3(result.element(1)) };
}
