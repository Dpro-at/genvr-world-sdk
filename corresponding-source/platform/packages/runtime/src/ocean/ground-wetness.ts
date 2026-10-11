/** Tidewater ShoreSim.js and App.terrainWetness, MIT DRG Software Solutions LLC,4811ba48.
 * Persistent bridge: the stable read texture survives sea renderer recreation. Unavailable uses
 * exact App static band; history resets on invalidation rather than synthesising recent waves.
 */
import { DataTexture, FloatType, HalfFloatType, RGBAFormat, RedFormat, StorageTexture, NearestFilter,
 Vector2, Vector4, TSL, type Texture, type WebGPURenderer } from 'three/webgpu';
import { createLaceTexture } from './surf-lace.js';
import { SHORE_EVALUATOR_WGSL } from './shore-evaluator.js';
/* eslint-disable @typescript-eslint/no-explicit-any -- native TSL graph */
type Node=any;
const t=TSL as Node;
export const SHORE_SIM_STEP_WGSL=`fn wetStep(stateTex:texture_2d<f32>,uv:vec2f,here:vec4f,sw:mat4x4f,region:vec4f,depth:f32,dt:f32,mott:f32,drops:f32)->vec4f {
 let cov=select(clamp((sw[0].z-sw[0].w)/(region.z/region.w)+0.5,0.0,1.0),1.0,depth>0.03);
 let covered=cov>0.5;let vel=select(vec2f(0.0),sw[1].xy,covered);
 let back=uv-vel*dt/region.z;let prev=wetStateAt(stateTex,back);
	// foam: made where the bore roller / plunge point / swash front pass, torn into patches by
	// the mottling of the lace texture, then it decays (bubbles rising and popping) and drains
	// into the sand once the water has gone
	// mott is exact source lace mip2 supplied by caller.
	let patchK = smoothstep( 0.25, 0.75, mott ) * 0.8 + 0.35;
	let swashy = smoothstep( 0.35, 0.05, depth );
	// dense foam collapses within a second or two (big bubbles burst first), the lace it leaves lingers
	let lace = mix( 2.6, 4.5, swashy );
	let life = mix( 0.7, mix( lace, 0.8, smoothstep( 0.3, 0.8, prev.x ) ), cov );
	let gen = ( sw[0].x * 2.2 + sw[0].y * 1.4 ) * patchK * cov;
	// the foam is diluted where the flow spreads it out (the uprush thinning as it climbs, the
	// backwash draining): d(foam)/dt = - foam * du/ds along the flow
	let h = region.z / region.w;
	let dirH = sw[1].zw * ( h / region.z );
	let uAhead = wetStateAt(stateTex,uv+dirH).w;
	let uBehind = wetStateAt(stateTex,uv-dirH).w;
	let spreadRate = max( ( uAhead - uBehind ) / ( 2.0 * h ), 0.0 );
	let splash = drops * 0.02 * cov;
	let foam = min( prev.x * exp( - dt * ( 1.0 / life + spreadRate ) ) + gen * 1.0 * dt + splash, 1.0 );

	// wetness: saturated while covered, then dries
	let wet = max( here.y * exp( - dt / 28.0 ), cov );

	// residue: foam stranded on the sand when the water leaves (the draining film gathers its
	// bubbles into lines, so it concentrates); washed away by the next uprush
	let stranded = min( here.x * 2.4, 1.0 ) * ( 1.0 - cov );
	let residue = max( here.z * mix( exp( - dt / 5.0 ), 0.85, cov ), stranded );

 return vec4f(foam,wet,residue,dot(vel,sw[1].zw));
}
fn wetStateAt(tex:texture_2d<f32>,uv:vec2f)->vec4f {
 let res=vec2f(textureDimensions(tex));let fp=clamp(uv*res-0.5,vec2f(0.0),res-1.001);let i=vec2i(floor(fp));let t=fract(fp);
 return mix(mix(textureLoad(tex,i,0),textureLoad(tex,i+vec2i(1,0),0),t.x),mix(textureLoad(tex,i+vec2i(0,1),0),textureLoad(tex,i+vec2i(1,1),0),t.x),t.y);
}
`;
export const GROUND_WETNESS_WGSL=`fn wetSample(tex:texture_2d<f32>,lace:texture_2d<f32>,xz:vec2f,h:f32,region:vec4f,available:f32)->vec2f {
 let uv=(xz-region.xy)/region.z;
 let inside=smoothstep(0.0,0.02,uv.x)*smoothstep(1.0,0.98,uv.x)*smoothstep(0.0,0.02,uv.y)*smoothstep(1.0,0.98,uv.y)*available;
 var s=vec4f(0.0);if(uv.x>0.0&&uv.x<1.0&&uv.y>0.0&&uv.y<1.0){s=wetSampleAt(tex,uv)*inside;}
 let band=smoothstep(0.45,0.0,h);
 let fp=length(fwidth(xz))/3.5*512.0;var foam=0.0;
 if(s.z>0.01){let r=s.z;let q=(xz+11.3)/3.5*512.0-0.5;let i=vec2i(floor(q));let t=fract(q);let m=vec2i(511);
 let a=textureLoad(lace,i&m,0);let b=textureLoad(lace,(i+vec2i(1,0))&m,0);let c=textureLoad(lace,(i+vec2i(0,1))&m,0);let d=textureLoad(lace,(i+vec2i(1,1))&m,0);
 let l=mix(mix(a,b,t.x),mix(c,d,t.x),t.y);let near=smoothstep(3.0,1.2,fp);let keep=smoothstep(l.w*0.55,l.w*0.55+0.08,r);
 let lw=r*0.1+0.06;let strand=(1.0-smoothstep(lw,lw+0.07,l.x))*(l.z*0.5+0.6);
 let lines=max(strand*smoothstep(0.02,0.25,r)*keep,l.y*keep*0.8);foam=mix(smoothstep(0.08,0.6,r)*0.12,lines,near)*0.85;}
 return vec2f(max(s.y,band*(1.0-inside)),foam);
}
fn wetSampleAt(tex:texture_2d<f32>,uv:vec2f)->vec4f {
 let res=vec2f(textureDimensions(tex));let fp=clamp(uv*res-0.5,vec2f(0.0),res-1.001);let i=vec2i(floor(fp));let t=fract(fp);
 return mix(mix(textureLoad(tex,i,0),textureLoad(tex,i+vec2i(1,0),0),t.x),mix(textureLoad(tex,i+vec2i(0,1),0),textureLoad(tex,i+vec2i(1,1),0),t.x),t.y);
}
`;
export interface GroundWetnessInputs {
 fieldTexture: Texture; depthTexture: Texture; extent: number; level: number; time: number;
 period: number; amplitude: number; enabled: number; swellDirection: readonly [number,number] | null;
}
export class GroundWetness {
 readonly availableNode=t.uniform(0).setGroup(t.renderGroup);
 readonly swellDirectionNode=t.uniform(new Vector2(-.11914522,-.99287684)).setGroup(t.renderGroup);
 readonly region=t.uniform(new Vector4(-190,-190,380,768)).setGroup(t.renderGroup);
 readonly state: StorageTexture;
 readonly #next: StorageTexture;
 readonly #clock=t.uniform(new Vector4(0,0,9,.34)).setGroup(t.renderGroup);
 readonly #origin=t.uniform(new Vector2(-1,-1)).setGroup(t.renderGroup);
 readonly #size=t.uniform(2).setGroup(t.renderGroup);
 readonly #enabled=t.uniform(0).setGroup(t.renderGroup);
 readonly #dt=t.uniform(0).setGroup(t.renderGroup);
 readonly #placeholder=new DataTexture(new Float32Array([0,0,0,0]),2,2,RedFormat,FloatType);
 readonly #depth: Node;readonly #field: Node;
 #lace: DataTexture|null=null;#kernel:Node|null=null;#clear:Node|null=null;#reset=true;#disposed=false;
 constructor(readonly resolution=768) {
  if(!Number.isInteger(resolution)||resolution<8)throw new RangeError('Shore simulation resolution must be >=8.');
  this.region.value.w=resolution;
  const make=()=>{const s=new StorageTexture(resolution,resolution);s.type=HalfFloatType;s.format=RGBAFormat;s.minFilter=s.magFilter=NearestFilter;return s;};
  this.state=make();this.#next=make();this.#placeholder.needsUpdate=true;
  this.#depth=t.texture(this.#placeholder);this.#field=t.texture(this.#placeholder);
 }
 #ensure():void {
  if(this.#lace)return;this.#lace=createLaceTexture();
  const n=this.resolution,evaluate=t.wgslFn(SHORE_EVALUATOR_WGSL),step=t.wgslFn(SHORE_SIM_STEP_WGSL);
  const height=t.wgslFn(`fn wetHeight(tex:texture_2d<f32>,uv:vec2f,level:f32)->f32 {let size=vec2f(textureDimensions(tex));let fp=clamp(uv*size-.5,vec2f(0.0),size-1.001);let i=vec2i(floor(fp));let f=fract(fp);return level-mix(mix(textureLoad(tex,i,0).r,textureLoad(tex,i+vec2i(1,0),0).r,f.x),mix(textureLoad(tex,i+vec2i(0,1),0).r,textureLoad(tex,i+vec2i(1,1),0).r,f.x),f.y);}`);
  const run=(body:()=>void)=>t.Fn(()=>{t.If(t.globalId.x.lessThan(n).and(t.globalId.y.lessThan(n)),body);})().compute([Math.ceil(n/8),Math.ceil(n/8)],[8,8,1]);
  this.#clear=run(()=>{t.textureStore(this.state,t.uvec2(t.globalId.xy),t.vec4(0));t.textureStore(this.#next,t.uvec2(t.globalId.xy),t.vec4(0));});
  this.#kernel=run(()=>{
   const uv=t.vec2(t.globalId.xy).add(.5).div(n),p=this.region.xy.add(uv.mul(this.region.z));
   const ground=height(this.#depth,p.sub(this.#origin).div(this.#size),this.#clock.y),depth=this.#clock.y.sub(ground);
   const here=t.textureLoad(this.state,t.globalId.xy),out=t.vec4(0).toVar();
   t.If(depth.greaterThan(7).or(ground.sub(this.#clock.y).greaterThan(3.2)),()=>{
    const k=this.#dt.div(2).negate().exp();out.assign(t.vec4(here.x.mul(k),here.y.mul(this.#dt.div(28).negate().exp()),here.z.mul(k),0));
   }).Else(()=>{
    const sw=evaluate(p,ground,this.#depth,this.#field,this.#origin,this.#size,this.#clock,this.#enabled);
    const mott=t.texture(this.#lace!,p.div(3.5*4.3)).level(2).z;
    out.assign(step(t.texture(this.state),uv,here,sw,this.region,depth,this.#dt,mott,t.float(0)));
   });
   t.textureStore(this.#next,t.uvec2(t.globalId.xy),out);
  });
 }
 wetFoamNode(xz:Node,heightSeaRelative:Node):Node {
  if(this.#disposed)return t.vec2(t.smoothstep(.45,0,heightSeaRelative),0);
  this.#ensure();return t.wgslFn(GROUND_WETNESS_WGSL)(t.texture(this.state),t.texture(this.#lace!),xz,heightSeaRelative,this.region,this.availableNode);
 }
 /** Current source simulation has no spray emitter in Genvr: deposit is explicitly zero. */
 update(renderer:WebGPURenderer,dt:number,input:GroundWetnessInputs):void {
  if(this.#disposed)return;
  if(!Number.isFinite(dt)||dt<=0)return;
  this.#ensure();this.#dt.value=dt;this.#clock.value.set(input.time,input.level,input.period,input.amplitude);
  this.#origin.value.set(-input.extent,-input.extent);this.#size.value=input.extent*2;
  this.#depth.value=input.depthTexture;this.#field.value=input.fieldTexture;this.#enabled.value=input.enabled;
  this.availableNode.value=input.enabled>0?1:0;
  if(input.swellDirection)this.swellDirectionNode.value.set(...input.swellDirection);
  if(this.#reset){renderer.compute(this.#clear);this.#reset=false;}
  if(!this.availableNode.value)return;
  renderer.compute(this.#kernel);renderer.copyTextureToTexture(this.#next,this.state);
 }
 invalidate():void {this.#reset=true;this.availableNode.value=0;}
 deactivate():void {this.invalidate();this.swellDirectionNode.value.set(-.11914522,-.99287684);}
 dispose():void {if(this.#disposed)return;this.#disposed=true;this.availableNode.value=0;this.#kernel?.dispose();this.#clear?.dispose();this.#lace?.dispose();this.state.dispose();this.#next.dispose();this.#placeholder.dispose();}
}
