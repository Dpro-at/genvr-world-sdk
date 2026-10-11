/** Tidewater PostFX.js (4811ba48), MIT: exact Jimenez13/Karis down and nine-tap tent up. */
import { StorageTexture, HalfFloatType, ClampToEdgeWrapping, Vector2, TSL, type Texture, type WebGPURenderer } from 'three/webgpu';
/* eslint-disable @typescript-eslint/no-explicit-any -- native WGSL entry nodes */
type Node=any;
const {Fn,If,globalId,uvec2,vec2,vec4,float,uniform,texture,sampler,storageTexture,wgslFn}=TSL as Node;
const TAP=`fn twBTap(t:texture_2d<f32>,s:sampler,uv:vec2f,texel:vec2f,x:f32,y:f32)->vec3f{return textureSampleLevel(t,s,uv+texel*vec2f(x,y),0.0).rgb;}
fn twBLum(c:vec3f)->f32{return dot(c,vec3f(.2126,.7152,.0722));}
fn twBKaris(c:vec3f)->vec3f{return c/(twBLum(c)+1.0);}`;
const down=wgslFn(`
fn twBloomDown(t:texture_2d<f32>,s:sampler,uv:vec2f,first:f32)->vec3f{
 let texel=1.0/vec2f(textureDimensions(t));
 let a=twBTap(t,s,uv,texel,-2.0,-2.0);let b=twBTap(t,s,uv,texel,0.0,-2.0);let c=twBTap(t,s,uv,texel,2.0,-2.0);
 let d=twBTap(t,s,uv,texel,-2.0,0.0);let e=twBTap(t,s,uv,texel,0.0,0.0);let f=twBTap(t,s,uv,texel,2.0,0.0);
 let g=twBTap(t,s,uv,texel,-2.0,2.0);let h=twBTap(t,s,uv,texel,0.0,2.0);let i=twBTap(t,s,uv,texel,2.0,2.0);
 let j=twBTap(t,s,uv,texel,-1.0,-1.0);let k=twBTap(t,s,uv,texel,1.0,-1.0);let l=twBTap(t,s,uv,texel,-1.0,1.0);let m=twBTap(t,s,uv,texel,1.0,1.0);
 if(first>0.5){let sum=twBKaris((j+k+l+m)*.25)*.5+twBKaris((a+b+d+e)*.25)*.125+twBKaris((b+c+e+f)*.25)*.125+twBKaris((d+e+g+h)*.25)*.125+twBKaris((e+f+h+i)*.25)*.125;return sum/max(1.0-twBLum(sum),.02);}
 return e*.125+(a+c+g+i)*.03125+(b+d+f+h)*.0625+(j+k+l+m)*.125;
}${TAP}`);
// Separate names prevent helper collisions in pipelines that reuse both native entry functions.
const up=wgslFn(`
fn twBloomUp(t:texture_2d<f32>,s:sampler,base:texture_2d<f32>,bs:sampler,uv:vec2f)->vec3f{
 let texel=1.0/vec2f(textureDimensions(t));
 let sum=(twUTap(t,s,uv,texel,0.0,0.0)*4.0+(twUTap(t,s,uv,texel,-1.0,0.0)+twUTap(t,s,uv,texel,1.0,0.0)+twUTap(t,s,uv,texel,0.0,-1.0)+twUTap(t,s,uv,texel,0.0,1.0))*2.0+
 twUTap(t,s,uv,texel,-1.0,-1.0)+twUTap(t,s,uv,texel,1.0,-1.0)+twUTap(t,s,uv,texel,-1.0,1.0)+twUTap(t,s,uv,texel,1.0,1.0))/16.0;
 return textureSampleLevel(base,bs,uv,0.0).rgb+sum;
}${TAP.replaceAll('twB','twU')}`);
export class TidewaterBloom {
 readonly down=Array.from({length:5},()=>this.#texture());
 readonly up=Array.from({length:4},()=>this.#texture());
 readonly texture=this.up[0]!;
 readonly half=this.down[0]!;
 readonly meterTexture=this.down[3]!;
 #passes:Array<{kernel:Node;size:Node;target:StorageTexture}>=[];
 #disposed=false;
 constructor(readonly input:Texture){
  for(let i=0;i<5;i++){
   const src=texture(i===0?input:this.down[i-1]!),target=this.down[i]!,size=uniform(new Vector2());
   const kernel=Fn(()=>{const p=globalId.xy;If(p.x.lessThan(size.x).and(p.y.lessThan(size.y)),()=>{
    const uv=vec2(p).add(.5).div(size);storageTexture(target,p,vec4(down(src,sampler(src),uv,float(i===0?1:0)),1)).toStack();
   });})().computeKernel([8,8,1]);this.#passes.push({kernel,size,target});
  }
  for(let i=3;i>=0;i--){
   const src=texture(i===3?this.down[4]!:this.up[i+1]!),base=texture(this.down[i]!),target=this.up[i]!,size=uniform(new Vector2());
   const kernel=Fn(()=>{const p=globalId.xy;If(p.x.lessThan(size.x).and(p.y.lessThan(size.y)),()=>{
    storageTexture(target,uvec2(p),vec4(up(src,sampler(src),base,sampler(base),vec2(p).add(.5).div(size)),1)).toStack();
   });})().computeKernel([8,8,1]);this.#passes.push({kernel,size,target});
  }
  this.resize(1,1);
 }
 #texture():StorageTexture{const t=new StorageTexture();t.type=HalfFloatType;t.wrapS=t.wrapT=ClampToEdgeWrapping;(t as Node).mipmapsAutoUpdate=false;return t;}
 resize(w:number,h:number):void{
  for(let i=0;i<5;i++){const scale=2**(-i-1),x=Math.max(1,Math.round(w*scale)),y=Math.max(1,Math.round(h*scale));(this.down[i] as Node).setSize(x,y);if(i<4)(this.up[i] as Node).setSize(x,y);}
  for(const p of this.#passes){const image=p.target.image as {width:number;height:number};p.size.value.set(image.width,image.height);}
 }
 update(renderer:WebGPURenderer):void{if(this.#disposed)return;for(const p of this.#passes){const image=p.target.image as {width:number;height:number};renderer.compute(p.kernel,[Math.ceil(image.width/8),Math.ceil(image.height/8),1]);}}
 dispose():void{if(this.#disposed)return;this.#disposed=true;for(const p of this.#passes)p.kernel.dispose();for(const t of [...this.down,...this.up])t.dispose();}
}
