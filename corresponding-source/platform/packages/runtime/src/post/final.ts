/** Tidewater PostFX.js (4811ba48), MIT: RCAS, grading, fitted ACES, sRGB and temporal dither.
 * Returns display-encoded color. The caller MUST disable Three's output transform/tone mapping. */
import { TSL, type Texture } from 'three/webgpu';
import { FINAL_DEFAULTS } from './final-math.js';
/* eslint-disable @typescript-eslint/no-explicit-any -- extensible native post node graph */
type Node=any;
const {Fn,uniform,texture,wgslFn,uv,screenCoordinate,uvec2,vec4}=TSL as Node;
export function createFinalParams(){
 const p={...Object.fromEntries(Object.entries(FINAL_DEFAULTS).map(([key,value])=>[key,uniform(value)])),frameIndex:uniform(0,'uint')} as Record<keyof typeof FINAL_DEFAULTS|'frameIndex',Node>;
 for(const node of Object.values(p))node.setGroup(TSL.renderGroup);return p;
}
const tm=wgslFn(`fn twTm(c:vec3f)->vec3f{return c/(max(c.r,max(c.g,c.b))+1.0);}`);
const RCAS_WGSL=`fn twRCAS(t:texture_2d<f32>,depth:texture_2d<f32>,uvIn:vec2f,sharpen:f32,reversedZ:f32)->vec3f{
 let size=vec2i(textureDimensions(t));let pc=clamp(vec2i(uvIn*vec2f(size)),vec2i(1),max(size-2,vec2i(1)));
 let e=twTm(textureLoad(t,pc,0).rgb);let b=twTm(textureLoad(t,pc+vec2i(0,-1),0).rgb);
 let d=twTm(textureLoad(t,pc+vec2i(-1,0),0).rgb);let f=twTm(textureLoad(t,pc+vec2i(1,0),0).rgb);let h=twTm(textureLoad(t,pc+vec2i(0,1),0).rgb);
 let mn4=min(min(b,d),min(f,h));let mx4=max(max(b,d),max(f,h));
 let hitMin=min(mn4,e)/(mx4*4.0+1e-5);let hitMax=(vec3f(1.0)-max(mx4,e))/(mn4*4.0-4.0);
 let lobeRGB=max(-hitMin,hitMax);
 let ds=vec2i(textureDimensions(depth));let z=textureLoad(depth,clamp(vec2i(uvIn*vec2f(ds)),vec2i(0),ds-1),0).r;
 let skyK=select(1.0,.3,select((z>=.9999999),(z<1e-7),(reversedZ>.5)));let lobe=max(-.1875,min(max(lobeRGB.r,max(lobeRGB.g,lobeRGB.b)),0.0))*sharpen*skyK;
 let r=max(((b+d+f+h)*lobe+e)/(lobe*4.0+1.0),vec3f(0.0));return r/max(1.0-max(r.r,max(r.g,r.b)),1e-3);
}`;
const rcas=wgslFn(RCAS_WGSL,[tm]);
const rcasDepth=wgslFn(RCAS_WGSL.replace('twRCAS(', 'twRCASDepth(').replace('depth:texture_2d<f32>','depth:texture_depth_2d').replace('ds-1),0).r','ds-1),0)'),[tm]);
const hash=wgslFn(`fn twPostHash(p:vec2u,f:u32)->f32{
 var x=p.x*1664525u+p.y*1013904223u+f*2654435761u;x^=x>>16u;x*=0x7feb352du;x^=x>>15u;x*=0x846ca68bu;x^=x>>16u;return f32(x>>8u)/16777216.0;
}`);
const aces=wgslFn(`fn twACES(colorIn:vec3f,exposure:f32)->vec3f{
 let input=transpose(mat3x3f(.59719,.35458,.04823,.07600,.90834,.01566,.02840,.13383,.83777));
 let output=transpose(mat3x3f(1.60475,-.53108,-.07367,-.10208,1.10813,-.00605,-.00327,-.07276,1.07602));
 var color=input*(colorIn*exposure/.6);let a=color*(color+.0245786)-.000090537;let b=color*(.983729*color+.4329510)+.238081;
 color=output*(a/b);return clamp(color,vec3f(0.0),vec3f(1.0));
}`);
const grade=wgslFn(`fn twFinalGrade(input:vec3f,uvIn:vec2f,pixel:vec2u,fi:u32,adaptation:f32,exposure:f32,warmth:f32,saturation:f32,contrast:f32,vignette:f32,grain:f32)->vec3f{
 var c=input*adaptation*vec3f(1.0+warmth,1.0,1.0-warmth);let l=dot(c,vec3f(.2126,.7152,.0722));c=mix(vec3f(l),c,saturation);
 c=pow(max(c,vec3f(0.0))/.18,vec3f(contrast))*.18;let dv=(uvIn-.5)*vec2f(1.0,.8);c*=1.0-smoothstep(.25,.75,length(dv))*vignette;
 let n=(twPostHash(pixel,fi)+twPostHash(pixel+vec2u(7919u,104729u),fi)-1.0)*.5;c+=c*(n*grain);
 let t=twACES(c,exposure);let srgb=select(1.055*pow(t,vec3f(1.0/2.4))-.055,t*12.92,t<=vec3f(.0031308));
 let dq=(twPostHash(pixel+vec2u(31337u,271u),fi)+twPostHash(pixel+vec2u(1013u,65537u),fi)-1.0)/255.0;
 return srgb+vec3f(dq);
}`,[hash,aces]);
export interface FinalOptions {
 resolved:Texture;depth:Texture;bloom:Texture;half:Texture;exposureNode:Node;
 /** Three uses standardZ; set true only for an explicitly reversed depth attachment. */
 depthReversed?:boolean;
 params?:ReturnType<typeof createFinalParams>;
 /** Source motion blur gathers around the already sharpened center. */
 motionApply?:(sharp:Node,uv:Node)=>Node;
 flare?:(uv:Node)=>Node;
 /** Lens droplets call sharp/blurred callbacks at displaced UVs; absent means dry lens. */
 lens?:(uv:Node,sharp:(uv:Node)=>Node,blurred:(uv:Node)=>Node)=>Node;
}
/** Public RCAS node also lets a deterministic GPU fixture test the HDR proxy independently. */
export function rcasNode(resolved:Texture,depth:Texture,coord:Node,sharpen:Node,reversedDepth=false):Node{
 return ((depth as Texture&{isDepthTexture?:boolean}).isDepthTexture?rcasDepth:rcas)(texture(resolved),texture(depth),coord,sharpen,TSL.float(reversedDepth?1:0));
}
export function gradeNode(color:Node,coord:Node,pixel:Node,adaptation:Node,params= createFinalParams()):Node{
 return grade(color,coord,pixel,params.frameIndex,adaptation,params.exposure,params.warmth,params.saturation,params.contrast,params.vignette,params.grain);
}
export function createFinalNode(options:FinalOptions):Node{
 const p=options.params??createFinalParams();
 // Source LOD0 avoids undefined implicit derivatives inside pixel-dependent lens branches.
 const bloom=(coord:Node)=>texture(options.bloom,coord).level(0).rgb.mul(p.bloom);
 const sharp=(coord:Node)=>{
  let c=rcasNode(options.resolved,options.depth,coord,p.sharpen,options.depthReversed);
  if(options.motionApply)c=options.motionApply(c,coord);
  c=c.add(bloom(coord));if(options.flare)c=c.add(options.flare(coord));return c;
 };
 const blurred=(coord:Node)=>texture(options.half,coord).level(0).rgb.add(bloom(coord));
 return Fn(()=>{const coord=uv();const color=options.lens?options.lens(coord,sharp,blurred):sharp(coord);
  return vec4(gradeNode(color,coord,uvec2(screenCoordinate.xy),options.exposureNode,p),1);
 })();
}
