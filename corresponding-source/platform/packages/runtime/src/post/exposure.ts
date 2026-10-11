/** Tidewater PostFX.js 394-456, pinned4811ba48 MIT: centre-weighted log-luminance reduction. */
import { StorageBufferAttribute, TSL, type Texture, type WebGPURenderer } from 'three/webgpu';
/* eslint-disable @typescript-eslint/no-explicit-any -- native WGSL and workgroup graph */
type Node=any;
const {Fn,If,uint,float,uniform,texture,storage,localId,workgroupArray,workgroupBarrier,wgslFn}=TSL as Node;
const meter=wgslFn(`fn twExposureMeter(t:texture_2d<f32>,lane:u32)->vec2f{
 let size=textureDimensions(t);let n=size.x*size.y;var acc=vec2f(0.0);
 for(var i=0u;i<160u;i++){let idx=lane+i*256u;if(idx<n){let x=idx%size.x;let y=idx/size.x;
 let c=textureLoad(t,vec2i(i32(x),i32(y)),0).rgb;
 let l=log2(max(dot(c,vec3f(.2126,.7152,.0722)),1e-4));
 let uvc=(vec2f(f32(x),f32(y))+.5)/vec2f(size)-.5;
 let w=max(1.0-length(uvc*vec2f(1.0,1.4))*1.2,.15);acc+=vec2f(l*w,w);}}
 return acc;
}`);
const adapt=wgslFn(`fn twExposureAdapt(sum:vec2f,cur:f32,dt:f32,night:f32,enabled:f32,refLum:f32,lo:f32,hi:f32,up:f32,down:f32)->f32{
 let avg=exp2(sum.x/max(sum.y,1e-4));let ratio=refLum/avg;let partial=select(ratio,pow(ratio,.8),ratio>1.0);
 let tgt=clamp(partial,lo,mix(hi,2.0,night));let rate=select(down,up,tgt>cur);let k=1.0-exp(-dt*rate);
 let next=exp2(mix(log2(max(cur,1e-3)),log2(tgt),k));return select(1.0,next,enabled>.5);
}`);
export class TidewaterExposure {
 readonly buffer=new StorageBufferAttribute(new Float32Array([1]),1);
 readonly node:Node=storage(this.buffer,'float',1).element(0);
 readonly params={enabled:uniform(1),refLum:uniform(.25),min:uniform(.6),max:uniform(6),up:uniform(1.6),down:uniform(1.1)};
 readonly dt=uniform(0);readonly night=uniform(0);
 #kernel:Node;#reset:Node;#resetPending=false;#disposed=false;
 constructor(readonly input:Texture){
  for(const value of [...Object.values(this.params),this.dt,this.night])value.setGroup(TSL.renderGroup);
  const sums=workgroupArray('vec2',256),src=texture(input),p=this.params;
  this.#kernel=Fn(()=>{
   const lane=localId.x;sums.element(lane).assign(meter(src,lane));workgroupBarrier();
   for(let step=128;step>0;step>>=1){If(lane.lessThan(uint(step)),()=>{sums.element(lane).addAssign(sums.element(lane.add(uint(step))));});workgroupBarrier();}
   If(lane.equal(uint(0)),()=>{this.node.assign(adapt(sums.element(uint(0)),this.node,this.dt,this.night,p.enabled,p.refLum,p.min,p.max,p.up,p.down));});
  })().computeKernel([256,1,1]);
  this.#reset=Fn(()=>{this.node.assign(float(1));})().compute(1,[1,1,1]);
 }
 update(renderer:WebGPURenderer,dt:number,night=0):void{
  if(this.#disposed)return;this.dt.value=dt;this.night.value=night;
  if(this.#resetPending){renderer.compute(this.#reset);this.#resetPending=false;}
  renderer.compute(this.#kernel,[1,1,1]);
 }
 reset():void{this.#resetPending=true;}
 dispose():void{if(this.#disposed)return;this.#disposed=true;this.#kernel.dispose();this.#reset.dispose();this.buffer.dispose();}
}
