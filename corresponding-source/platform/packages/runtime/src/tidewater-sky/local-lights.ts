/* Tidewater LocalLights.js, ©2026 DRG Software Solutions LLC, MIT (LICENSE-tidewater.md).
 * Native three physical lighting model evaluates GGX; slot attenuation and CPU selection match source. */
import { Color, Vector3, Vector4, LightingNode, TSL, type Camera, type PointLight, type SpotLight,
  type MeshStandardNodeMaterial } from 'three/webgpu';
import { attachMaterialLighting } from './ground-bounce.js';
/* eslint-disable @typescript-eslint/no-explicit-any -- native physical lighting context and TSL */
type Node=any;
const {Loop,If,uniform,uniformArray,vec3,vec4,max,dot,length,normalize,exp,clamp,
 smoothstep,positionWorld,cameraViewMatrix}=TSL as Node;
const sat=(v:number)=>Math.max(0,Math.min(1,v));
const smooth=(a:number,b:number,v:number)=>{if(a===b)return v>=b?1:0;const t=sat((v-a)/(b-a));return t*t*(3-2*t);};
export function localSpotProfile(cosine:number,inner:number,outer:number):number{
 const m=smooth(outer,inner,cosine);return Math.max(m*m,smooth(outer-0.55,outer,cosine)*0.05);
}
export function localAttenuation(distanceSquared:number,range:number,spot=1):number{
 if(distanceSquared>=range*range||range<=0)return 0;
 const x=distanceSquared/(range*range),window=sat(1-x*x);
 return window*window*spot/(distanceSquared+0.15);
}
export function localWaterTransmission(receiverHeight:number,lightHeight:number,distance:number,seaLevel:number,extinction:readonly number[]):number[]{
 const under=sat((seaLevel-Math.min(receiverHeight,lightHeight))/Math.max(Math.abs(lightHeight-receiverHeight),1e-3));
 return extinction.map(v=>Math.exp(-v*distance*under));
}
export interface LocalLightSource{
 position:Vector3;color:Color;intensity:number;range:number;dir?:Vector3;
 cosInner?:number;cosOuter?:number;enabled?:boolean;flicker?:number;phase?:number;scale?:number;
 update?:()=>void;
}
export class LocalLights {
 readonly sources:LocalLightSource[]=[];
 enabled=true;strength=1;active=0;time=0;
 readonly positions=Array.from({length:8},()=>new Vector4());
 readonly colors=Array.from({length:8},()=>new Vector4());
 readonly directions=Array.from({length:8},()=>new Vector4());
 readonly count=uniform(0,'int');
 readonly seaLevel=uniform(0);readonly waterExtinction=uniform(new Vector3());
 readonly positionArray=uniformArray(this.positions,'vec4');
 readonly colorArray=uniformArray(this.colors,'vec4');
 readonly directionArray=uniformArray(this.directions,'vec4');
 readonly flashlight={on:false,intensity:55,range:30,color:new Color(1,0.71,0.49),
  cosInner:Math.cos(9*Math.PI/180),cosOuter:Math.cos(35*Math.PI/180),
  position:new Vector3(),dir:new Vector3(0,0,-1),primed:false};
 #restores=new Map<MeshStandardNodeMaterial,()=>void>();
 constructor(){for(const node of [this.count,this.seaLevel,this.waterExtinction,this.positionArray,this.colorArray,this.directionArray])node.setGroup(TSL.renderGroup);}
 add(source:LocalLightSource):LocalLightSource{
  source.phase??=this.sources.length*23.791;this.sources.push(source);return source;
 }
 remove(source:LocalLightSource):void{const i=this.sources.indexOf(source);if(i>=0)this.sources.splice(i,1);}
 /** Bind an existing scene lamp. Caller hides its original Three light while this gate is active. */
 addLight(light:PointLight|SpotLight):LocalLightSource{
  const spot=(light as SpotLight).isSpotLight?light as SpotLight:undefined;
  const source:LocalLightSource={position:new Vector3(),color:light.color,intensity:light.intensity,
   range:light.distance||30,enabled:light.visible,...(spot?{dir:new Vector3()}:{}),
   update:()=>{
    light.getWorldPosition(source.position);source.intensity=light.intensity;source.range=light.distance||30;
    if(spot){const target=new Vector3();spot.target.getWorldPosition(target);source.dir!.subVectors(target,source.position).normalize();
     source.cosInner=Math.cos(spot.angle*(1-spot.penumbra));source.cosOuter=Math.cos(spot.angle);}
   }};
  source.update!();return this.add(source);
 }
 toggleFlashlight(on=!this.flashlight.on):boolean{this.flashlight.on=on;this.flashlight.primed=false;return on;}
 update(camera:Camera,dt:number,night:number):void{
  this.time+=dt;let n=0;const cp=new Vector3();camera.getWorldPosition(cp);
  const put=(source:LocalLightSource,k:number)=>{
   this.positions[n]!.set(source.position.x,source.position.y,source.position.z,source.range*source.range);
   this.colors[n]!.set(source.color.r*k,source.color.g*k,source.color.b*k,source.cosInner??-1.5);
   const d=source.dir;this.directions[n]!.set(d?.x??0,d?.y??-1,d?.z??0,source.cosOuter??-2);n++;
  };
  const fl=this.flashlight;
  if(fl.on&&this.enabled){
   camera.updateMatrixWorld();const e=camera.matrixWorld.elements;
   const right=new Vector3(e[0],e[1],e[2]).normalize(),up=new Vector3(e[4],e[5],e[6]).normalize();
   const forward=new Vector3(-e[8]!,-e[9]!,-e[10]!).normalize();
   if(!fl.primed){fl.dir.copy(forward);fl.primed=true;}
   fl.dir.lerp(forward,1-Math.exp(-dt/0.06)).normalize();
   fl.position.copy(cp).addScaledVector(right,0.2).addScaledVector(up,-0.22).addScaledVector(forward,0.15);
   put(fl,fl.intensity*(0.08+0.92*smooth(0,0.6,night)));
  }
  const on=smooth(0.15,0.75,night)*this.strength;
  if(on>0.002&&this.enabled){
   const list=this.sources.filter(s=>s.enabled!==false).map(source=>{source.update?.();return {source,d2:source.position.distanceToSquared(cp)};}).sort((a,b)=>a.d2-b.d2);
   const slots=8-n,cut=list.length>slots?Math.sqrt(list[slots]!.d2):Infinity;
   for(let i=0;i<Math.min(slots,list.length);i++){
    const {source:s,d2}=list[i]!;const fade=Number.isFinite(cut)&&cut>1e-6?smooth(cut,cut*0.8,Math.sqrt(d2)):1;
    const phase=s.phase??0;const flicker=s.flicker?1+s.flicker*Math.sin(this.time*9+phase)*Math.sin(this.time*5.3+phase*0.37):1;
    const k=s.intensity*on*fade*flicker*(s.scale??1);if(k>1e-4)put(s,k);
   }
  }
  for(let i=n;i<8;i++)this.colors[i]!.set(0,0,0,0);
  this.active=n;this.count.value=n;
 }
 attach(material:MeshStandardNodeMaterial):void{
  if(this.#restores.has(material)||material.userData.noLocalLights)return;
  const node=new LocalLightingNode(this);
  this.#restores.set(material,attachMaterialLighting(material,this,()=>node));
 }
 detach(material:MeshStandardNodeMaterial):void{this.#restores.get(material)?.();this.#restores.delete(material);}
 dispose():void{for(const material of this.#restores.keys())this.detach(material);this.sources.length=0;this.count.value=0;this.active=0;}
}
class LocalLightingNode extends LightingNode{
 static get type():string{return 'TidewaterLocalLightingNode';}
 constructor(readonly owner:LocalLights){super();}
 override setup(builder:Node):Node{
  const owner=this.owner;
  // PhysicalLightingModel's accumulators are lazy vars: initialize before the dynamic loop,
  // otherwise their first use inside the body resets accumulated light on every iteration.
  builder.context.reflectedLight.directDiffuse.addAssign(vec3(0));
  builder.context.reflectedLight.directSpecular.addAssign(vec3(0));
  Loop({start:0,end:owner.count,type:'int'},({i}:Node)=>{
    const p=owner.positionArray.element(i),c=owner.colorArray.element(i),sd=owner.directionArray.element(i);
    const d=p.xyz.sub(positionWorld),d2=dot(d,d);
    If(d2.lessThan(p.w),()=>{
     const L=d.div(max(length(d),0.001));const x=d2.div(p.w);const win=clamp(x.mul(x).oneMinus(),0,1);
     const cd=dot(L.negate(),sd.xyz);const profile=smoothstep(sd.w,c.w,cd).toVar();
     If(c.w.equal(sd.w),()=>{profile.assign(cd.greaterThanEqual(c.w).select(1,0));});
     const spot=max(profile.mul(profile),smoothstep(sd.w.sub(0.55),sd.w,cd).mul(0.05));
     const under=clamp(owner.seaLevel.sub(positionWorld.y.min(p.y)).div(max(p.y.sub(positionWorld.y).abs(),0.001)),0,1);
     const water=exp(owner.waterExtinction.mul(length(d)).mul(under).negate());
     const color=c.xyz.mul(water).mul(win.mul(win).mul(spot).div(d2.add(0.15)));
     const direction=normalize(cameraViewMatrix.mul(vec4(L,0)).xyz);
     builder.context.lightingModel.direct({lightDirection:direction,lightColor:color,reflectedLight:builder.context.reflectedLight},builder);
    });
  });
 }
}
