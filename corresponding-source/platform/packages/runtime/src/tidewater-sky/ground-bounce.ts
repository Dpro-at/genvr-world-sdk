/* GroundBounce.js equations, Tidewater4811ba48, ©2026 DRG Software Solutions LLC, MIT (LICENSE-tidewater.md).
 * Generic terrain callbacks keep world layout/content outside the runtime lighting module. */
import { StorageTexture, HalfFloatType, RGBAFormat, LinearFilter, ClampToEdgeWrapping, Vector2,
  Vector3, Color, SRGBColorSpace, IrradianceNode, TSL, type MeshStandardNodeMaterial, type WebGPURenderer } from 'three/webgpu';
/* eslint-disable @typescript-eslint/no-explicit-any -- TSL graph and custom lighting hooks */
type Node=any;
const lightingHooks=new WeakMap<MeshStandardNodeMaterial,{original:Node,hooks:Map<object,()=>Node>}>();
/** Compose additive material hooks and restore independently in any disposal order. */
export function attachMaterialLighting(material:MeshStandardNodeMaterial,owner:object,makeNode:()=>Node):()=>void{
 const m=material as Node;let entry=lightingHooks.get(material);
 if(!entry){
  entry={original:m.setupMaterialLightings,hooks:new Map()};lightingHooks.set(material,entry);
  const state=entry;m.setupMaterialLightings=(builder:Node)=>[...state.original.call(m,builder),...Array.from(state.hooks.values(),make=>make())];
 }
 entry.hooks.set(owner,makeNode);material.needsUpdate=true;
 return ()=>{
  const state=lightingHooks.get(material);if(!state)return;state.hooks.delete(owner);
  if(!state.hooks.size){m.setupMaterialLightings=state.original;lightingHooks.delete(material);}
  material.needsUpdate=true;
 };
}
const {Fn,wgslFn,globalId,vec2,vec3,vec4,ivec2,uvec2,uniform,texture,textureLoad,textureStore,
  mix,clamp,floor,fract,max,smoothstep,length,If,Loop,float,log2,positionWorld,normalWorld}=TSL as Node;
const clamp01=(v:number)=>Math.max(0,Math.min(1,v));
const smooth=(a:number,b:number,v:number)=>{const t=clamp01((v-a)/(b-a));return t*t*(3-2*t);};
export function bounceAlbedo(height:number,normal:readonly number[],rock:number,splat:readonly number[],seaLevel:number,extinction:readonly number[]):number[]{
 const rgb=(r:number,g:number,b:number)=>{const c=new Color().setRGB(r,g,b,SRGBColorSpace);return [c.r,c.g,c.b];};
 const blend=(a:readonly number[],b:readonly number[],t:number)=>a.map((v,i)=>v+(b[i]!-v)*t);
 const slope=1-normal[1]!,rockW=clamp01(smooth(0.35,0.6,rock*0.7+smooth(0.3,0.62,slope)*0.5));
 const sandW=smooth(0.3,0.72,splat[0]!)*(1-rockW),jungle=clamp01(smooth(9,24,height)+smooth(0.18,0.36,slope));
 const vegetation=blend(rgb(0.3,0.36,0.16),rgb(0.12,0.17,0.07),jungle);
 const sand=rgb(0.86,0.79,0.66).map(v=>v*(0.6+0.4*smooth(0.2,1.2,height)));
 const land=blend(blend(vegetation,sand,sandW),[0.08,0.075,0.065],rockW);
 const bed=blend(rgb(0.62,0.58,0.48),rgb(0.25,0.3,0.22),smooth(0.3,0.7,splat[1]!));
 const depth=Math.max(seaLevel-height,0),sea=bed.map((v,i)=>v*Math.exp(extinction[i]!*depth*-2.4)*0.9+[0.01,0.025,0.03][i]!);
 return blend(land,sea,smooth(0.05,-0.1,height-seaLevel));
}
export function reflectedGround(albedo:readonly number[],normal:readonly number[],sun:readonly number[],visibility=1):number[]{
 const e=Math.max(normal.reduce((s,v,i)=>s+v*sun[i]!,0),0)*visibility*smooth(-0.02,0.05,sun[1]!);
 return albedo.map(v=>Math.max(v*e-0.08*Math.max(sun[1]!,0),0));
}
export function bounceIrradiance(sample:readonly number[],height:number,normal:readonly number[],sun:readonly number[],sunColor:readonly number[],seaLevel:number,cloud=1,strength=1):number[]{
 const view=clamp01(normal[1]!*-0.5+0.5);
 if(view<=0.03||height<=seaLevel-0.3||strength<=0)return [0,0,0];
 const above=height-sample[3]!;
 const fade=smooth(-0.3,0.3,above)*(0.4+0.6*smooth(30,4,above));
 const len=Math.max(Math.hypot(sun[0]!,sun[2]!),1e-3);
 const self=1-clamp01(-(normal[0]!*sun[0]!+normal[2]!*sun[2]!)/len)*clamp01(1-sun[1]!)*0.6;
 return sample.slice(0,3).map((v,i)=>v*sunColor[i]!*cloud*view*fade*self*strength*0.6);
}
const bakeEquation=wgslFn(`fn twGroundReflect(albedo:vec3f,N:vec3f,L:vec3f,visibility:f32)->vec3f {
 let E=max(dot(N,L),0.0)*visibility*smoothstep(-0.02,0.05,L.y);
 return max(albedo*E-vec3f(0.08*max(L.y,0.0)),vec3f(0.0));
}`);
const receiveEquation=wgslFn(`fn twGroundReceive(s:vec4f,P:vec3f,N:vec3f,L:vec3f,color:vec3f,sea:f32,cloud:f32,strength:f32,ready:f32)->vec3f {
 let view=clamp(N.y*-0.5+0.5,0.0,1.0);
 if(view<=0.03||P.y<=sea-0.3||strength<=0.0||ready<0.5){return vec3f(0.0);}
 let above=P.y-s.w;
 let fade=smoothstep(-0.3,0.3,above)*mix(0.4,1.0,smoothstep(30.0,4.0,above));
 let Lh=L.xz/max(length(L.xz),1e-3);
 let selfShade=1.0-clamp(-dot(N.xz,Lh),0.0,1.0)*clamp(1.0-L.y,0.0,1.0)*0.6;
 return s.xyz*color*cloud*(view*fade*selfShade*strength*0.6);
}`);
const linear=(r:number,g:number,b:number)=>{const c=new Color().setRGB(r,g,b,SRGBColorSpace);return `vec3f(${c.r},${c.g},${c.b})`;};
const albedoEquation=wgslFn(`fn twBounceAlbedo(h:f32,n:vec3f,rock:f32,splat:vec2f,seaLevel:f32,extinction:vec3f)->vec3f {
 let slope=1.0-n.y;
 let rockW=clamp(smoothstep(0.35,0.6,rock*0.7+smoothstep(0.3,0.62,slope)*0.5),0.0,1.0);
 let sandW=smoothstep(0.3,0.72,splat.x)*(1.0-rockW);
 let jungleW=clamp(smoothstep(9.0,24.0,h)+smoothstep(0.18,0.36,slope),0.0,1.0);
 let veg=mix(${linear(0.3,0.36,0.16)},${linear(0.12,0.17,0.07)},jungleW);
 let sand=${linear(0.86,0.79,0.66)}*mix(0.6,1.0,smoothstep(0.2,1.2,h));
 let land=mix(mix(veg,sand,sandW),vec3f(0.08,0.075,0.065),rockW);
 let depth=max(seaLevel-h,0.0);
 let seabed=mix(${linear(0.62,0.58,0.48)},${linear(0.25,0.3,0.22)},smoothstep(0.3,0.7,splat.y));
 let sea=seabed*exp(extinction*depth*-2.4)*0.9+vec3f(0.01,0.025,0.03);
 return mix(land,sea,smoothstep(0.05,-0.1,h-seaLevel));
}`);
/** Source coarse sand/grass/forest/rock palette including sea-column attenuation. */
export function bounceAlbedoNode(height:Node,normal:Node,rock:Node,splat:Node,seaLevel:Node,waterExtinction:Node=vec3(0)):Node{
 return albedoEquation(height,normal,rock,splat,seaLevel,waterExtinction);
}
export interface GroundBounceOptions {
 /** Node callbacks sample the current terrain; height includes actual displacement. */
 heightNode:(xz:Node,lod?:Node)=>Node;normalNode:(xz:Node)=>Node;albedoNode:(xz:Node)=>Node;
 groundShadowNode?:(position:Node)=>Node;cloudShadowNode?:(xz:Node)=>Node;
 sunDirection:Node;sunColor:Node;seaLevel:Node;
 origin?:Vector2;size?:number;resolution?:number;
}
export class GroundBounce {
 readonly raw:StorageTexture;readonly map:StorageTexture;readonly shadowMap:StorageTexture;
 readonly strength=uniform(1).setGroup(TSL.renderGroup);readonly ready=uniform(0).setGroup(TSL.renderGroup);
 readonly origin:Node;readonly size:Node;
 #options:GroundBounceOptions;#bake:Node;#blur:Node;#sun=new Vector3(Infinity,Infinity,Infinity);#dirty=true;
 #restores=new Map<MeshStandardNodeMaterial,()=>void>();
 constructor(options:GroundBounceOptions){
  this.#options=options;this.origin=uniform(options.origin?.clone()??new Vector2(-1024,-1024));this.size=uniform(options.size??2048);
  // Custom lighting hooks are outside NodeMaterialObserver.containsNode's property scan.
  // Shared render UBOs keep their live uniforms updating even when object/material transforms stay fixed.
  for(const node of [this.origin,this.size,options.sunDirection,options.sunColor,options.seaLevel])node.setGroup?.(TSL.renderGroup);
  const n=options.resolution??512;
  this.raw=new StorageTexture(n,n);this.map=new StorageTexture(n,n);this.shadowMap=new StorageTexture(n,n);
  for(const t of [this.raw,this.map,this.shadowMap]){t.type=HalfFloatType;t.format=RGBAFormat;t.minFilter=t.magFilter=LinearFilter;t.wrapS=t.wrapT=ClampToEdgeWrapping;t.generateMipmaps=false;}
  this.#bake=Fn(()=>{
   const xz=vec2(globalId.xy).add(0.5).div(n).mul(this.size).add(this.origin);
   const height=options.heightNode(xz);const wet=smoothstep(0.05,-0.1,height.sub(options.seaLevel));
   const normal=mix(options.normalNode(xz),vec3(0,1,0),wet);const top=max(height,options.seaLevel);
   const pos=vec3(xz.x,top,xz.y);
   const field=(options.groundShadowNode?vec2(-1e4,0):this.#heightfieldOccluderNode(pos)).toVar();
   textureStore(this.shadowMap,uvec2(globalId.xy),vec4(field,0,1));
   const width=field.y.mul(0.012).add(0.35);
   const visibility=options.groundShadowNode?.(pos)??smoothstep(width.negate(),width,pos.y.sub(field.x));
   const reflect=bakeEquation(options.albedoNode(xz),normal,options.sunDirection,visibility);
   textureStore(this.raw,uvec2(globalId.xy),vec4(reflect,top));
  })().compute([Math.ceil(n/8),Math.ceil(n/8)],[8,8,1]);
  this.#blur=Fn(()=>{
   const p=ivec2(globalId.xy);let sum=vec4(0);const w=[1,4,6,4,1];
   for(let y=-2;y<=2;y++)for(let x=-2;x<=2;x++)sum=sum.add(textureLoad(this.raw,clamp(p.add(ivec2(x,y)),ivec2(0),ivec2(n-1)),0).mul(w[x+2]!*w[y+2]!/256));
   textureStore(this.map,uvec2(globalId.xy),sum);
  })().compute([Math.ceil(n/8),Math.ceil(n/8)],[8,8,1]);
 }
 invalidate():void{this.#dirty=true;}
 /** Source24-step growing heightfield shadow; provider should supply max-height mips for conservative far taps. */
 #heightfieldOccluderNode(position:Node):Node{
  const o=this.#options;
  return Fn(()=>{
   const horizontal=max(length(o.sunDirection.xz),0.0001),direction=o.sunDirection.xz.div(horizontal);
   const elevation=o.sunDirection.y.div(horizontal);
   const top=float(-1e4).toVar(),occluder=float(0).toVar(),t=float(24).toVar(),dt=float(6).toVar();
   Loop(24,()=>{
    const q=position.xz.add(direction.mul(t));const lod=log2(max(dt.div(this.size.div((this.map.image as {width:number}).width)),1));
    const v=o.heightNode(q,lod).sub(t.mul(elevation));
    If(v.greaterThan(top),()=>{top.assign(v);occluder.assign(t);});dt.mulAssign(1.22);t.addAssign(dt);
   });
   return vec2(top,occluder);
  })();
 }
 /** AirHaze.hazeTerrainSun: one filtered fetch of the cached terrain occluder field. */
 heightfieldVisibilityNode(position:Node):Node{
  if(this.#options.groundShadowNode)return this.#options.groundShadowNode(position);
  const field=texture(this.shadowMap,position.xz.sub(this.origin).div(this.size)).level(0);
  const width=field.y.mul(0.012).add(0.35);
  return mix(float(1),smoothstep(width.negate(),width,position.y.sub(field.x)),this.ready);
 }
 update(renderer:WebGPURenderer,force=false):boolean{
  const sun=this.#options.sunDirection.value as Vector3;
  // TerrainGPU.updateSunShadow's source angular threshold; avoid rebuilding every animated sun frame.
  if(!force&&!this.#dirty&&this.#sun.angleTo(sun)<0.0015)return false;
  renderer.compute(this.#bake);renderer.compute(this.#blur);this.ready.value=1;this.#sun.copy(sun);this.#dirty=false;return true;
 }
 irradianceNode(position:Node=positionWorld,normal:Node=normalWorld):Node{
  const n=(this.map.image as {width:number}).width;
  const st=clamp(position.xz.sub(this.origin).div(this.size).mul(n).sub(0.5),vec2(0),vec2(n-1.001));
  const i=ivec2(floor(st)),f=fract(st);
  const sample=mix(mix(textureLoad(this.map,i,0),textureLoad(this.map,i.add(ivec2(1,0)),0),f.x),
   mix(textureLoad(this.map,i.add(ivec2(0,1)),0),textureLoad(this.map,i.add(ivec2(1,1)),0),f.x),f.y);
  const o=this.#options;
  // IrradianceNode's physical model applies diffuse/PI and AO, so no second INV_PI here.
  return receiveEquation(sample,position,normal,o.sunDirection,o.sunColor,o.seaLevel,o.cloudShadowNode?.(position.xz)??1,this.strength,this.ready);
 }
 attach(material:MeshStandardNodeMaterial):void{
  if(this.#restores.has(material)||material.userData.noGroundBounce)return;
  this.#restores.set(material,attachMaterialLighting(material,this,()=>new IrradianceNode(this.irradianceNode())));
 }
 detach(material:MeshStandardNodeMaterial):void{this.#restores.get(material)?.();this.#restores.delete(material);}
 dispose():void{for(const material of this.#restores.keys())this.detach(material);this.raw.dispose();this.map.dispose();this.shadowMap.dispose();this.#bake.dispose();this.#blur.dispose();this.ready.value=0;}
}
