/* Tidewater LODFade.js, ©2026 DRG Software Solutions LLC, MIT; LICENSE-tidewater.md. */
import { TSL, type NodeMaterial } from 'three/webgpu';
/* eslint-disable @typescript-eslint/no-explicit-any -- fragment mask node graph */
const {wgslFn,screenCoordinate,uniform,uint,bool}=TSL as any;
export function bayer4(x:number,y:number,frame=0):number{
 const px=(Math.trunc(x)+frame*3)>>>0,py=(Math.trunc(y)+(frame>>>2))>>>0;
 const x0=px&1,x1=(px>>>1)&1,y0=py&1,y1=(py>>>1)&1;
 return ((((x0^y0)<<3)|(y0<<2)|((x1^y1)<<1)|y1)+0.5)/16;
}
export function lodFadeVisible(x:number,y:number,fade:number,outgoing=false,frame=0):boolean{
 const t=bayer4(x,y,frame);return outgoing?t>=fade:t<fade;
}
export function bandFade(distance:number,start:number,end:number):number{
 const t=Math.max(0,Math.min(1,(distance-start)/Math.max(end-start,1e-6)));return t*t*(3-2*t);
}
const visible=wgslFn(`fn twLodVisible(pixel:vec2f,fade:f32,outgoing:bool,frame:u32)->bool {
 let p=vec2u(pixel)+vec2u(frame*3u,(frame>>2u));
 let x0=p.x&1u;let x1=(p.x>>1u)&1u;let y0=p.y&1u;let y1=(p.y>>1u)&1u;
 let v=((x0^y0)<<3u)|(y0<<2u)|((x1^y1)<<1u)|y1;
 let t=(f32(v)+0.5)/16.0;return select((t < fade),(t >= fade),outgoing);
}`);
export function lodFadeNode(fade:any,outgoing:any=false,frame:any=uint(0),pixel:any=screenCoordinate):any{
 return visible(pixel,fade,bool(outgoing),frame);
}
/** The same mask must be attached to the visible and shadow/depth materials. */
export function attachLodFade(material:NodeMaterial,fade:any,outgoing=false,frame:any=uniform(0,'uint'),shadowMaterials:NodeMaterial[]=[]):()=>void{
 const restores:Array<()=>void>=[];
 for(const m of [material,...shadowMaterials]){
  const previous=m.maskNode;const mask=lodFadeNode(fade,outgoing,frame);
  m.maskNode=previous?bool(previous).and(mask):mask;m.needsUpdate=true;
  restores.push(()=>{m.maskNode=previous;m.needsUpdate=true;});
 }
 return ()=>restores.forEach(restore=>restore());
}
