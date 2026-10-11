/** Tidewater AirHaze.js, MIT, DRG Software Solutions LLC, 4811ba48 (LICENSE-tidewater.md).
 * Source16-step shadow march, temporal reprojection, depth-aware upsample, and 3x8 radial god rays.
 * Camera reconstruction adapts reversed-Z source to ordinary Three/WebGPU depth. */
import { StorageTexture, HalfFloatType, RGBAFormat, LinearFilter, Matrix4, Vector2, Vector3, TSL,
  type Texture, type Camera, type WebGPURenderer } from 'three/webgpu';
/* eslint-disable @typescript-eslint/no-explicit-any -- TSL callbacks and graph */
type Node = any;
const { Fn, If, Loop, globalId, uniform, uvec2, ivec2, vec2, vec3, vec4, float, texture, textureLoad,
  textureStore, normalize, max, min, clamp, exp, fract, dot, length, smoothstep, wgslFn } = TSL as Node;
// ComputeNode array counts are workgroups, not pixel counts. Guard padded odd-size edges.
function computePixels(width: number, height: number, body: () => Node | void): Node {
  return Fn(() => {
    If(globalId.x.lessThan(width).and(globalId.y.lessThan(height)), () => { body(); });
  })().compute([Math.ceil(width / 8), Math.ceil(height / 8)], [8, 8, 1]);
}
export interface AirHazeOptions {
  inputTexture: Texture; depthTexture: Texture; camera: Camera;
  sunDirectionNode: Node; sunColorNode: Node; seaLevelNode: Node;
  skyLuminanceNode: (direction: Node) => Node;
  skyIrradianceNode: Node;
  shadowNode?: (position: Node) => Node;
  terrainShadowNode?: (position: Node) => Node;
  cloudShadowNode?: (xz: Node) => Node;
  /** Cloud alpha is transmittance, as in source cloudsSampleView().a. */
  cloudViewNode?: (direction: Node) => Node;
  mediumTexture?: Texture; underwaterNode?: Node;
  /** Source haze rays and history use the pre-jitter camera; root copies this before TAA beginFrame. */
  unjitteredProjectionMatrix?: Matrix4;
}
const layer = wgslFn(`fn hazeLayer(sigma:f32,height:f32,hc:f32,vy:f32,d:f32)->f32 {
  let k=vy*d/height;var integral=d;if(abs(k)>=1e-3){integral=height*(1.0-exp(-k))/vy;}
  return exp(-hc/height)*sigma*integral;}`);
const phase = wgslFn(`fn hazePhase(c:f32)->f32 {let g=0.62;let g2=g*g;
  return 0.7*3.0*(1.0-g2)/(8.0*3.141592653589793*(2.0+g2))*(c*c+1.0)/pow(max(1.0+g2-2.0*g*c,1e-4),1.5)+0.3/(4.0*3.141592653589793);}`);
const bilinear = wgslFn(`fn hazeBilinear(map:texture_2d<f32>,uv:vec2f)->vec4f {
  let size=vec2i(textureDimensions(map));let q=uv*vec2f(size)-0.5;let p=vec2i(floor(q));let f=fract(q);
  return mix(mix(textureLoad(map,clamp(p,vec2i(0),size-1),0),textureLoad(map,clamp(p+vec2i(1,0),vec2i(0),size-1),0),f.x),
    mix(textureLoad(map,clamp(p+vec2i(0,1),vec2i(0),size-1),0),textureLoad(map,clamp(p+vec2i(1,1),vec2i(0),size-1),0),f.x),f.y);}`);
export class AirHaze {
  readonly texture = this.#make();
  readonly low = this.#make();
  readonly histories = [this.#make(),this.#make()];
  readonly godRayTextures = [this.#make(),this.#make(),this.#make(),this.#make()];
  readonly density = uniform(1.6).setGroup(TSL.renderGroup);
  readonly shafts = uniform(1).setGroup(TSL.renderGroup);
  readonly enabled = uniform(1).setGroup(TSL.renderGroup);
  readonly frame = uniform(0).setGroup(TSL.renderGroup);
  readonly sunUV = uniform(new Vector2(0.5,0.5)).setGroup(TSL.renderGroup);
  readonly screenFade = uniform(0).setGroup(TSL.renderGroup);
  readonly historyValid = uniform(0).setGroup(TSL.renderGroup);
  #invProjection = uniform(new Matrix4()).setGroup(TSL.renderGroup);
  #cameraWorld = uniform(new Matrix4()).setGroup(TSL.renderGroup);
  #cameraPosition = uniform(new Vector3()).setGroup(TSL.renderGroup);
  #previousVP = uniform(new Matrix4()).setGroup(TSL.renderGroup);
  #previousPosition = uniform(new Vector3()).setGroup(TSL.renderGroup);
  #previousMatrix = new Matrix4(); #previousCamera = new Vector3();
  #kernels: Node[] = []; #temporal: Node[] = []; #composite: Node[] = []; #radial: Node[] = [];
  #width = 1; #height = 1; #front = 0; #valid = false; #disposed = false;
  godRays = true;
  constructor(readonly options: AirHazeOptions) {
    for(const node of [options.sunDirectionNode,options.sunColorNode,options.seaLevelNode,options.skyIrradianceNode,options.underwaterNode])
      node?.setGroup?.(TSL.renderGroup);
  }
  #make(): StorageTexture { const t=new StorageTexture(1,1);t.type=HalfFloatType;t.format=RGBAFormat;
    t.minFilter=t.magFilter=LinearFilter;return t; }
  get historyTexture(): StorageTexture { return this.histories[this.#front]!; }
  invalidate(): void { this.#valid=false;this.historyValid.value=0; }
  #ray(uv: Node): {direction: Node;distance: Node;sky: Node} {
    const o=this.options;
    const p=ivec2(clamp(uv,0,0.9999).mul(TSL.textureSize(texture(o.depthTexture))));
    const depth=textureLoad(o.depthTexture,p).r;
    const sky=depth.greaterThanEqual(0.9999999);
    // Reconstruct the sky ray at a finite depth; do not clamp geometry depth (that shortened far rays).
    const view=this.#invProjection.mul(vec4(uv.mul(vec2(2,-2)).add(vec2(-1,1)),sky.select(float(.5),depth),1));
    const direction=normalize(this.#cameraWorld.mul(vec4(normalize(view.xyz.div(view.w)),0)).xyz);
    return {direction,distance:sky.select(float(60000),min(length(view.xyz.div(view.w)),60000)),sky};
  }
  #scatter(height: Node,vertical: Node,distance: Node): Node {
    return float(1).sub(exp(layer(1.5e-4,110,height,vertical,distance).add(layer(3.2e-5,1400,height,vertical,distance)).mul(this.density).negate()));
  }
  #active(): Node { return this.enabled.greaterThan(0.5).and((this.options.underwaterNode ?? float(0)).lessThan(0.5)); }
  resize(width: number,height: number): void {
    width=Math.max(1,Math.round(width));height=Math.max(1,Math.round(height));
    if(width===this.#width&&height===this.#height&&this.#kernels.length)return;
    this.#width=width;this.#height=height;this.invalidate();
    this.texture.setSize(width,height,1);const w=Math.max(1,Math.round(width*.5)),h=Math.max(1,Math.round(height*.5));
    this.low.setSize(w,h,1);this.histories.forEach(t=>t.setSize(w,h,1));
    const sw=Math.max(1,Math.round(width*.25)),sh=Math.max(1,Math.round(height*.25));
    this.godRayTextures.forEach(t=>t.setSize(sw,sh,1));
    [...this.#kernels,...this.#temporal,...this.#composite,...this.#radial].forEach(k=>k.dispose());
    this.#kernels=[];this.#temporal=[];this.#composite=[];this.#radial=[];
    const o=this.options;
    const jitter=(p:Node,offset=0)=>fract(TSL.interleavedGradientNoise(p).add(this.frame.mul(.61803398875)).add(offset));
    this.#kernels.push(computePixels(w,h,()=>{
      const uv=vec2(globalId.xy).add(.5).div(vec2(w,h));const ray=this.#ray(uv);
      const output=vec4(0,0,ray.distance,1).toVar();
      If(this.#active().and(this.shafts.greaterThan(0)),()=>{
        const end=min(ray.distance,2500),jit=jitter(vec2(globalId.xy).add(.5));
        const lit=float(0).toVar(),all=float(0).toVar(),tau=float(0).toVar(),previous=float(0).toVar();
        Loop(16,({i}:{i:Node})=>{
          const u=float(i).add(jit).div(16),t=u.mul(u).mul(end),dt=u.mul(2/16).mul(end);
          const position=this.#cameraPosition.add(ray.direction.mul(t));
          const height=max(position.y.sub(o.seaLevelNode),0);
          const sigma=exp(height.div(-110)).mul(1.5e-4).add(exp(height.div(-1400)).mul(3.2e-5)).mul(this.density);
          tau.addAssign(sigma.mul(t.sub(previous)));previous.assign(t);
          const weight=sigma.mul(exp(tau.negate())).mul(dt);const visibility=float(1).toVar();
          if(o.shadowNode)visibility.mulAssign(o.shadowNode(position));
          if(o.terrainShadowNode)visibility.mulAssign(o.terrainShadowNode(position));
          if(o.cloudShadowNode){const L=o.sunDirectionNode;
            const ground=position.xz.sub(L.xz.mul(max(position.y,0).div(max(L.y,.08))));visibility.mulAssign(o.cloudShadowNode(ground));}
          lit.addAssign(weight.mul(visibility));all.addAssign(weight);
        });
        const exact=this.#scatter(max(this.#cameraPosition.y.sub(o.seaLevelNode),0),ray.direction.y,end);
        output.assign(vec4(lit.div(max(all,1e-12)),all.div(max(exact,1e-12)),ray.distance,1));
      });
      textureStore(this.low,uvec2(globalId.xy),output);
    }));
    // Source temporal: 3x3 clamp, previous world-point projection and 5%+.3m disocclusion threshold.
    const temporal=wgslFn(`fn hazeTemporal(curTex:texture_2d<f32>,prevTex:texture_2d<f32>,p:vec2u,world:vec3f,previousVP:mat4x4f,previousCamera:vec3f,valid:f32)->vec4f {
      let size=vec2i(textureDimensions(curTex));let cur=textureLoad(curTex,vec2i(p),0);var out=cur;
      if(valid>0.5){var lo=cur.xy;var hi=cur.xy;
        for(var k=0;k<9;k++){let s=textureLoad(curTex,clamp(vec2i(p)+vec2i(k%3-1,k/3-1),vec2i(0),size-1),0).xy;lo=min(lo,s);hi=max(hi,s);}
        let clip=previousVP*vec4f(world,1.0);
        if(clip.w>1e-4){let uv=clip.xy/clip.w*vec2f(.5,-.5)+.5;
          if(all(uv>=vec2f(0.0))&&all(uv<=vec2f(1.0))){let prev=hazeBilinear(prevTex,uv);let expect=length(world-previousCamera);
            if(abs(prev.z-expect)<expect*.05+.3){out=vec4f(mix(clamp(prev.xy,lo,hi),cur.xy,.12),cur.z,1.0);}}}}
      return out;}`, [bilinear]);
    for(let source=0;source<2;source++)this.#temporal.push(computePixels(w,h,()=>{
      const uv=vec2(globalId.xy).add(.5).div(vec2(w,h)),ray=this.#ray(uv);
      const world=this.#cameraPosition.add(ray.direction.mul(textureLoad(this.low,globalId.xy).z));
      textureStore(this.histories[1-source],uvec2(globalId.xy),temporal(texture(this.low),texture(this.histories[source]),
        uvec2(globalId.xy),world,this.#previousVP,this.#previousPosition,this.historyValid));
    }));
    this.#kernels.push(computePixels(sw,sh,()=>{
      const uv=vec2(globalId.xy).add(.5).div(vec2(sw,sh)),ray=this.#ray(uv);
      const cosine=dot(ray.direction,o.sunDirectionNode),glow=exp(cosine.sub(1).mul(600)).add(exp(cosine.sub(1).mul(50)).mul(.25));
      const cloudAlpha=o.cloudViewNode ? o.cloudViewNode(ray.direction).a : float(1);
      const transmittance=cloudAlpha.mul(smoothstep(.004,.04,cloudAlpha));
      const value=ray.sky.and(this.screenFade.greaterThan(.001)).select(glow.mul(transmittance),float(0));
      textureStore(this.godRayTextures[0],uvec2(globalId.xy),vec4(value,0,0,1));
    }));
    for(let pass=0;pass<3;pass++)this.#radial.push(computePixels(sw,sh,()=>{
      const uv=vec2(globalId.xy).add(.5).div(vec2(sw,sh)),step=this.sunUV.sub(uv).mul(.95/8**pass/8);
      const jit=jitter(vec2(globalId.xy).add(.5),pass*.37).sub(.5),sum=float(0).toVar();
      let total=0;const decay=[.9,.97,1][pass]!;
      for(let tap=0;tap<8;tap++){const weight=decay**tap;total+=weight;
        sum.addAssign(bilinear(texture(this.godRayTextures[pass]),uv.add(step.mul(jit.add(tap)))).r.mul(weight));}
      textureStore(this.godRayTextures[pass+1],uvec2(globalId.xy),vec4(sum.div(total),0,0,1));
    }));
    const upsample=wgslFn(`fn hazeUpsample(low:texture_2d<f32>,uv:vec2f,d:f32)->vec2f {
      let size=vec2i(textureDimensions(low));let pa=uv*vec2f(size)-.5;let base=vec2i(floor(pa));let fr=fract(pa);var acc=vec2f(0.0);var weights=1e-6;
      for(var k=0;k<4;k++){let o=vec2i(k&1,k>>1);let s=textureLoad(low,clamp(base+o,vec2i(0),size-1),0);
        let bil=mix(1.0-fr.x,fr.x,f32(o.x))*mix(1.0-fr.y,fr.y,f32(o.y));let rel=abs(s.z-d)/max(d,.5);
        let wt=bil/pow(rel*10.0+1.0,2.0)+1e-5;acc+=s.xy*wt;weights+=wt;}
      return acc/weights;}`);
    for(let front=0;front<2;front++)this.#composite.push(computePixels(width,height,()=>{
      const uv=vec2(globalId.xy).add(.5).div(vec2(width,height)),ray=this.#ray(uv);
      const color=textureLoad(o.inputTexture,globalId.xy),out=color.rgb.toVar();
      const inAir=o.mediumTexture?textureLoad(o.mediumTexture,globalId.xy).r.lessThanEqual(.5):float(1).greaterThan(0);
      If(this.#active().and(inAir),()=>{
        const camH=max(this.#cameraPosition.y.sub(o.seaLevelNode),0),dir=ray.direction;
        const horizon=normalize(vec3(dir.x,max(dir.y,.02),dir.z));const fog=o.skyLuminanceNode(horizon);
        const ep=o.sunColorNode.mul(phase(dot(dir,o.sunDirectionNode)));
        const eL=dot(ep,vec3(.2126,.7152,.0722));const fSun=eL.div(eL.add(dot(o.skyIrradianceNode,vec3(.2126,.7152,.0722))).add(1e-5)).mul(min(this.shafts,1));
        const handover=ray.sky.select(float(1),smoothstep(0,900,ray.distance));
        If(ray.sky.not(),()=>{const scatter=this.#scatter(camH,dir.y,ray.distance);
          out.assign(out.mul(float(1).sub(scatter)).add(fog.mul(scatter).mul(float(1).sub(fSun.mul(float(1).sub(handover))))));});
        If(this.shafts.greaterThan(0),()=>{
          const sh=upsample(texture(this.histories[front]),uv,ray.distance);
          const all=sh.y.mul(this.#scatter(camH,dir.y,min(ray.distance,2500))),lit=clamp(sh.x,0,1).mul(all);
          const near=ep.mul(lit).mul(float(1).sub(handover)).mul(this.shafts);
          const deficit=fog.mul(fSun).mul(all.sub(lit)).mul(handover);
          out.assign(max(out.add(near).sub(deficit),vec3(0)));
        });
        If(this.screenFade.greaterThan(.001),()=>{
          const rays=bilinear(texture(this.godRayTextures[3]),uv).r;
          const k=float(1).sub(exp(this.density.mul(-1.5e-4*300)));
          out.addAssign(ep.mul(rays).mul(k).mul(this.shafts).mul(this.screenFade).mul(3.5));
        });
      });
      textureStore(this.texture,uvec2(globalId.xy),vec4(out,color.a));
    }));
  }
  update(renderer: WebGPURenderer,_dt=0,camera=this.options.camera): void {
    void _dt;
    if(this.#disposed)return;if(!this.#kernels.length)this.resize(this.#width,this.#height);
    const projection=this.options.unjitteredProjectionMatrix ?? camera.projectionMatrix;
    this.#invProjection.value.copy(projection).invert();this.#cameraWorld.value.copy(camera.matrixWorld);
    this.#cameraPosition.value.setFromMatrixPosition(camera.matrixWorld);
    this.#previousVP.value.copy(this.#previousMatrix);this.#previousPosition.value.copy(this.#previousCamera);
    const L=this.options.sunDirectionNode.value as Vector3;
    const view=L.clone().transformDirection(camera.matrixWorldInverse);let fade=0;
    if(view.z<-.02){const p=projection.elements,u=.5+.5*view.x/-view.z*p[0]!,v=.5-.5*view.y/-view.z*p[5]!;
      this.sunUV.value.set(u,v);const ss=(x:number,a:number,b:number)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
      fade=(1-ss(Math.max(Math.abs(u-.5),Math.abs(v-.5)),.6,1.15))*ss(-view.z,.02,.25)*(1-ss(L.y,.3,.75));}
    if(!this.godRays||this.enabled.value<.5||this.shafts.value<=0||(this.options.underwaterNode?.value??0)>.5)fade=0;
    this.screenFade.value=fade;this.frame.value=(this.frame.value+1)%1024;
    this.historyValid.value=this.#valid&&this.enabled.value>.5&&this.shafts.value>0?1:0;
    renderer.compute(this.#kernels[0]);renderer.compute(this.#temporal[this.#front]);this.#front=1-this.#front;
    this.#valid=this.enabled.value>.5&&this.shafts.value>0;
    if(fade>.001){renderer.compute(this.#kernels[1]);this.#radial.forEach(k=>renderer.compute(k));}
    renderer.compute(this.#composite[this.#front]);
    this.#previousMatrix.multiplyMatrices(projection,camera.matrixWorldInverse);this.#previousCamera.copy(this.#cameraPosition.value);
  }
  dispose(): void {if(this.#disposed)return;this.#disposed=true;this.invalidate();
    [...this.#kernels,...this.#temporal,...this.#composite,...this.#radial].forEach(k=>k.dispose());
    [this.texture,this.low,...this.histories,...this.godRayTextures].forEach(t=>t.dispose());}
}
