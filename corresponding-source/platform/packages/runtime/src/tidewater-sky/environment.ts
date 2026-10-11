/* Tidewater Environment.js (commit 4811ba48), © 2026 DRG Software Solutions LLC, MIT.
 * Exact GGX96 / six roughness levels and cosine-convolved SH9 equations.
 * Array-texture cube faces are sampled seamlessly in WGSL. No PMREM approximation.
 * See LICENSE-tidewater.md. */
import { ClampToEdgeWrapping, HalfFloatType, FloatType, LinearFilter, RGBAFormat, StorageArrayTexture, StorageTextureNode,
  StorageBufferAttribute, Node as ThreeNode, TSL, Vector3, type WebGPURenderer } from 'three/webgpu';
import { type UniformOf } from './atmosphere.js';
import { ENVIRONMENT_LEVELS, ENVIRONMENT_SIZE } from './environment-math.js';
/* eslint-disable @typescript-eslint/no-explicit-any -- TSL native shader graph / contextual adapter */
type ShaderNode = any;
const { Fn, If, Loop, globalId, float, uint, int, vec3, vec4, ivec2, uvec2, uniform, texture,
  storage, wgslFn, clamp, mix, max, select, normalWorld, nodeObject } = TSL as ShaderNode;

/** Three's default texture hash aliases different storage mip views of the same resource. */
class EnvironmentMipNode extends StorageTextureNode {
  override getUniformHash(): string { return `${this.value.uuid}:env-mip:${this.mipLevel}:${this.access}`; }
}
const storageTexture = (value: StorageArrayTexture, uv?: ShaderNode, store?: ShaderNode): ShaderNode =>
  nodeObject(new EnvironmentMipNode(value, uv ?? null, store ?? null));

const CUBE_WGSL = `
fn envCubeDir(face:u32,x:u32,y:u32,size:u32)->vec3f {
 let u=(f32(x)+0.5)/f32(size)*2.0-1.0;let v=(f32(y)+0.5)/f32(size)*2.0-1.0;
 return envFaceDirection(face,vec2f(u,v));
}
fn envFaceDirection(face:u32,uv:vec2f)->vec3f {
 let u=uv.x;let v=uv.y;var d:vec3f;
 switch(face) {
 case 0u:{d=vec3f(1.0,-v,-u);}case 1u:{d=vec3f(-1.0,-v,u);}
 case 2u:{d=vec3f(u,1.0,v);}case 3u:{d=vec3f(u,-1.0,-v);}
 case 4u:{d=vec3f(u,-v,1.0);}default:{d=vec3f(-u,-v,-1.0);}
 } return normalize(d);
}
fn envCoordinates(d:vec3f)->vec3f {
 let a=abs(d);var uv:vec2f;var face:f32;
 if(a.x>=a.y&&a.x>=a.z){
  if(d.x>=0.0){face=0.0;uv=vec2f(-d.z,-d.y)/a.x;}else{face=1.0;uv=vec2f(d.z,-d.y)/a.x;}
 }else if(a.y>=a.z){
  if(d.y>=0.0){face=2.0;uv=vec2f(d.x,d.z)/a.y;}else{face=3.0;uv=vec2f(d.x,-d.z)/a.y;}
 }else{
  if(d.z>=0.0){face=4.0;uv=vec2f(d.x,-d.y)/a.z;}else{face=5.0;uv=vec2f(-d.x,-d.y)/a.z;}
 }return vec3f(uv*0.5+0.5,face);
}
// Cross-face bilinear taps emulate cube-edge filtering instead of clamping each array layer.
fn envTap(map:texture_2d_array<f32>,face:u32,p:vec2i,mip:i32)->vec3f {
 let size=vec2i(textureDimensions(map,mip));
 if(all(p>=vec2i(0))&&all(p<size)){return textureLoad(map,p,i32(face),mip).rgb;}
 let ray=envFaceDirection(face,(vec2f(p)+0.5)/vec2f(size)*2.0-1.0);
 let adjacent=envCoordinates(ray);
 let q=clamp(vec2i(adjacent.xy*vec2f(size)),vec2i(0),size-1);
 return textureLoad(map,q,i32(adjacent.z),mip).rgb;
}
fn envBilinear(map:texture_2d_array<f32>,d:vec3f,mip:i32)->vec3f {
 let location=envCoordinates(d);let size=vec2f(textureDimensions(map,mip));
 let pixel=location.xy*size-0.5;let base=vec2i(floor(pixel));let fraction=fract(pixel);let face=u32(location.z);
 return mix(mix(envTap(map,face,base,mip),envTap(map,face,base+vec2i(1,0),mip),fraction.x),
  mix(envTap(map,face,base+vec2i(0,1),mip),envTap(map,face,base+vec2i(1,1),mip),fraction.x),fraction.y);
}
fn envSample(map:texture_2d_array<f32>,d:vec3f,lod:f32,maxLevel:f32)->vec3f {
 let level=clamp(lod,0.0,maxLevel);let lower=i32(floor(level));let upper=i32(min(f32(lower+1),maxLevel));
 return mix(envBilinear(map,d,lower),envBilinear(map,d,upper),fract(level));
}
fn envBasis(d:vec3f,k:u32)->f32 {
 switch(k){
 case 0u:{return 0.282095;}case 1u:{return 0.488603*d.y;}case 2u:{return 0.488603*d.z;}case 3u:{return 0.488603*d.x;}
 case 4u:{return 1.092548*d.x*d.y;}case 5u:{return 1.092548*d.y*d.z;}
 case 6u:{return 0.315392*(3.0*d.z*d.z-1.0);}case 7u:{return 1.092548*d.x*d.z;}
 default:{return 0.546274*(d.x*d.x-d.y*d.y);}}
}
`;
const cubeDirection = wgslFn(`fn tidewaterEnvDirection(face:u32,p:vec2u,size:u32)->vec3f {
 return envCubeDir(face,p.x,p.y,size);
}\n${CUBE_WGSL}`);
// Prefix the helper module per entry point: distinct native functions coexist in sampling kernels.
const sampleCube = wgslFn(`fn tidewaterEnvSample(map:texture_2d_array<f32>,d:vec3f,lod:f32,maxLevel:f32)->vec3f {
 return envSample(map,d,lod,maxLevel);
}\n${CUBE_WGSL.replaceAll('env', 'sampleEnv')}`.replace('return envSample(', 'return sampleEnvSample('));
const filterCube = wgslFn(`fn tidewaterEnvFilter(map:texture_2d_array<f32>,N:vec3f,rough:f32,size:f32,start:u32)->vec4f {
 if(rough==0.0){return vec4f(filterEnvSample(map,N,0.0,log2(size)),1.0);}
 let alpha=rough*rough;let a2=alpha*alpha;
 let sign=select(-1.0,1.0,N.z>=0.0);let a=-1.0/(sign+N.z);let b=N.x*N.y*a;
 let tangent=vec3f(1.0+sign*N.x*N.x*a,sign*b,-sign*N.x);
 let bitangent=vec3f(b,sign+N.y*N.y*a,-N.y);let basis=mat3x3f(tangent,bitangent,N);
 let saTexel=4.0*3.141592653589793/(6.0*size*size);var sum=vec3f(0.0);var weights=0.0;
 for(var i=start;i<min(start+32u,96u);i++){
  let xi=filterEnvHammersley(i);let phi=6.283185307179586*xi.x;
  let cosT=sqrt((1.0-xi.y)/(1.0+(a2-1.0)*xi.y));let sinT=sqrt(1.0-cosT*cosT);
  let H=basis*vec3f(sinT*cos(phi),sinT*sin(phi),cosT);let L=2.0*dot(N,H)*H-N;let NdL=dot(N,L);
  if(NdL>0.0){let d=cosT*cosT*(a2-1.0)+1.0;let D=a2/(3.141592653589793*d*d);let pdf=D*0.25;
   let saSample=1.0/(96.0*pdf+1e-4);let lod=clamp(0.5*log2(saSample/saTexel)+1.0,0.0,log2(size));
   sum+=filterEnvSample(map,L,lod,log2(size))*NdL;weights+=NdL;
  }
 }return vec4f(sum,weights);
}
fn filterEnvHammersley(i:u32)->vec2f {
 var b=i;b=(b<<16u)|(b>>16u);
 b=((b&0x55555555u)<<1u)|((b&0xAAAAAAAAu)>>1u);b=((b&0x33333333u)<<2u)|((b&0xCCCCCCCCu)>>2u);
 b=((b&0x0F0F0F0Fu)<<4u)|((b&0xF0F0F0F0u)>>4u);b=((b&0x00FF00FFu)<<8u)|((b&0xFF00FF00u)>>8u);
 return vec2f(f32(i)/96.0,f32(b)*2.3283064365386963e-10);
}\n${CUBE_WGSL.replaceAll('env', 'filterEnv')}`);
const partialSH = wgslFn(`fn tidewaterEnvSH(map:texture_2d_array<f32>,lane:u32,k:u32,mip:i32)->vec3f {
 var sum=vec3f(0.0);
 for(var index=lane;index<6144u;index+=128u){
  let face=index/1024u;let remainder=index%1024u;let x=remainder%32u;let y=remainder/32u;
  let d=shEnvCubeDir(face,x,y,32u);let u=(f32(x)+0.5)/32.0*2.0-1.0;let v=(f32(y)+0.5)/32.0*2.0-1.0;
  let tmp=1.0+u*u+v*v;let weight=4.0/(sqrt(tmp)*tmp)/1024.0;
  sum+=textureLoad(map,vec2i(i32(x),i32(y)),i32(face),mip).rgb*weight*shEnvBasis(d,k);
 }return sum;
}\n${CUBE_WGSL.replaceAll('env', 'shEnv')}`);
const shBasis = wgslFn(`fn tidewaterEnvSHBasis(d:vec3f,k:u32)->f32{return basisEnvBasis(d,k);}\n${CUBE_WGSL.replaceAll('env', 'basisEnv')}`);
const mipRead = wgslFn(`fn tidewaterEnvMipRead(map:texture_storage_2d_array<rgba16float,read>,p:vec2i,face:i32)->vec4f {
 return textureLoad(map,p,face);
}`);
const accumulateFilter = wgslFn(`fn tidewaterEnvAccumulate(map:texture_storage_2d_array<rgba32float,read_write>,p:vec2i,face:i32,value:vec4f,reset:bool)->vec4f {
 var result=value;if(!reset){result+=textureLoad(map,p,face);}textureStore(map,p,face,result);return result;
}`);

function arrayCube(size: number, levels: number, name: string): StorageArrayTexture {
  const cube = new StorageArrayTexture(size, size, 6);
  cube.name = name; cube.type = HalfFloatType; cube.format = RGBAFormat;
  cube.wrapS = cube.wrapT = ClampToEdgeWrapping; cube.minFilter = cube.magFilter = LinearFilter;
  cube.generateMipmaps = false;
  cube.mipmaps = Array.from({ length: levels }, (_, level) => ({ width: size >> level, height: size >> level, depth: 6, data: new Uint8Array(0) }));
  return cube;
}

/** Context-aware adapter for Three's EnvironmentNode: SH irradiance and exact GGX radiance. */
class TidewaterEnvironmentAdapter extends ThreeNode {
  constructor(readonly environment: TidewaterEnvironment) { super('vec3'); }
  override setup(builder: ShaderNode): ShaderNode {
    const direction = builder.context.getUV?.() ?? normalWorld;
    // EnvironmentNode's irradiance context supplies the shared normalWorld node;
    // specular/clearcoat contexts supply their transformed reflection direction.
    return direction === normalWorld ? this.environment.sampleDiffuse(direction)
      : this.environment.sampleSpecular(direction, builder.context.getTextureLevel?.() ?? float(0));
  }
}

/** Source-faithful GGX96, amortized as three32-sample sums to stay within the frame budget. */
export class TidewaterEnvironment {
  readonly source: StorageArrayTexture;
  readonly targets: StorageArrayTexture[];
  readonly sh: StorageBufferAttribute[];
  readonly environmentNode: ShaderNode;
  readonly intensity: UniformOf<number> = uniform(1);
  readonly frontIndex: UniformOf<number> = uniform(0);
  readonly size: number;
  front = 0; step = -1; primed = false; interval = 3; timer = 0; refreshCount = 0;
  readonly totalSteps = 25;
  #sampleStart: UniformOf<number> = uniform(0);
  #filterAccumulator: StorageArrayTexture;
  #lastSun = new Vector3(0, -2, 0);
  #faces: ShaderNode[] = []; #mips: ShaderNode[] = []; #filters: ShaderNode[][] = [[], []];
  #partial: ShaderNode; #reductions: ShaderNode[] = [];
  #shNodes: ShaderNode[];
  #partialBuffer = new StorageBufferAttribute(new Float32Array(128 * 9 * 4), 4);
  #disposed = false;
  constructor(radiance: (direction: ShaderNode) => ShaderNode, size = ENVIRONMENT_SIZE) {
    // Scene-level lighting nodes are outside the material observer's object-node scan.
    // Render uniforms must refresh even when the receiver mesh remains static.
    this.intensity.setGroup(TSL.renderGroup);
    this.frontIndex.setGroup(TSL.renderGroup);
    if (size < 32 || (size & (size - 1)) !== 0) throw new Error('Environment cube size must be a power of two >=32');
    this.size = size;
    this.source = arrayCube(size, Math.log2(size) + 1, 'tidewaterEnvironmentSource');
    this.targets = [arrayCube(size, ENVIRONMENT_LEVELS, 'tidewaterEnvironmentA'), arrayCube(size, ENVIRONMENT_LEVELS, 'tidewaterEnvironmentB')];
    this.#filterAccumulator = arrayCube(size, ENVIRONMENT_LEVELS, 'tidewaterEnvironmentGGXAccumulator');
    this.#filterAccumulator.type = FloatType;
    const initial = new Float32Array(36); initial.set([0.3 / 0.282095, 0.4 / 0.282095, 0.6 / 0.282095]);
    this.sh = [new StorageBufferAttribute(initial, 4), new StorageBufferAttribute(initial.slice(), 4)];
    this.#shNodes = this.sh.map(attribute => storage(attribute, 'vec4', 9));
    this.environmentNode = nodeObject(new TidewaterEnvironmentAdapter(this));
    for (let face = 0; face < 6; face++) this.#faces.push(Fn(() => {
      const p = globalId.xy;
      If(p.x.lessThan(size).and(p.y.lessThan(size)), () => {
        const direction = cubeDirection(uint(face), uvec2(p), uint(size));
        storageTexture(this.source, ivec2(p), vec4(radiance(direction), 1)).depth(int(face)).toWriteOnly().toStack();
      });
    })().computeKernel([8, 8, 1]));
    for (let level = 1; level <= Math.log2(size); level++) {
      const n = size >> level;
      this.#mips.push(Fn(() => {
        const p = ivec2(globalId.xy), face = int(globalId.z);
        If(globalId.x.lessThan(n).and(globalId.y.lessThan(n)).and(globalId.z.lessThan(6)), () => {
          const sum = vec4(0).toVar();
          for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++)
            sum.addAssign(mipRead(storageTexture(this.source).setMipLevel(level - 1).toReadOnly(), p.mul(2).add(ivec2(x, y)), face));
          storageTexture(this.source, p, sum.mul(0.25)).setMipLevel(level).depth(face).toWriteOnly().toStack();
        });
      })().computeKernel([8, 8, 1]));
    }
    for (let target = 0; target < 2; target++) for (let level = 0; level < 6; level++) {
      const n = size >> level;
      this.#filters[target]!.push(Fn(() => {
        const p = globalId.xy;
        If(p.x.lessThan(n).and(p.y.lessThan(n)).and(globalId.z.lessThan(6)), () => {
          const face = globalId.z;
          const direction = cubeDirection(face, uvec2(p), uint(n));
          const part = filterCube(texture(this.source), direction, float(level / 5), float(size), uint(this.#sampleStart)).toVar();
          if (level === 0) storageTexture(this.targets[target]!, ivec2(p), part).setMipLevel(level).depth(int(face)).toWriteOnly().toStack();
          else {
            const sum = accumulateFilter(storageTexture(this.#filterAccumulator).setMipLevel(level).toReadWrite(),
              ivec2(p), int(face), part, this.#sampleStart.equal(0)).toVar();
            If(this.#sampleStart.equal(64), () => {
              storageTexture(this.targets[target]!, ivec2(p), vec4(sum.rgb.div(max(sum.a, 1e-4)), 1))
                .setMipLevel(level).depth(int(face)).toWriteOnly().toStack();
            });
          }
        });
      })().computeKernel([8, 8, 1]));
    }
    const partial = storage(this.#partialBuffer, 'vec4', 128 * 9);
    this.#partial = Fn(() => {
      const index = globalId.x, k = index.div(128), lane = index.mod(128);
      partial.element(index).assign(vec4(partialSH(texture(this.source), lane, k, int(Math.log2(size / 32))), 0));
    })().compute(128 * 9, [128, 1, 1]);
    for (let target = 0; target < 2; target++) {
      const out = storage(this.sh[target], 'vec4', 9);
      this.#reductions.push(Fn(() => {
        const k = globalId.x;
        If(k.lessThan(9), () => {
          const sum = vec4(0).toVar();
          Loop(128, ({ i }: ShaderNode) => { sum.addAssign(partial.element(k.mul(128).add(uint(i)))); });
          const factor = select(k.equal(0), float(1), select(k.lessThan(4), float(0.6666667), float(0.25)));
          out.element(k).assign(sum.mul(factor));
        });
      })().computeKernel([16, 1, 1]));
    }
  }

  sampleSpecular(direction: ShaderNode, roughness: ShaderNode): ShaderNode {
    const lod = clamp(roughness, 0, 1).mul(5);
    return mix(sampleCube(texture(this.targets[0]), direction, lod, float(5)),
      sampleCube(texture(this.targets[1]), direction, lod, float(5)), this.frontIndex).mul(this.intensity);
  }
  sampleDiffuse(normal: ShaderNode): ShaderNode {
    const [a, b] = this.#shNodes;
    let sum = vec3(0);
    for (let k = 0; k < 9; k++) sum = sum.add(mix(a.element(k).rgb, b.element(k).rgb, this.frontIndex).mul(shBasis(normal, uint(k))));
    return max(sum, vec3(0)).mul(this.intensity);
  }
  get texture(): StorageArrayTexture { return this.targets[this.front]!; }

  #dispatchStep(renderer: WebGPURenderer, step: number): void {
    const back = 1 - this.front;
    if (step < 6) renderer.compute(this.#faces[step], [this.size / 8, this.size / 8, 1]);
    else if (step === 6) for (let i = 0; i < this.#mips.length; i++) {
      const n = Math.max(1, Math.ceil((this.size >> (i + 1)) / 8)); renderer.compute(this.#mips[i], [n, n, 6]);
    }
    else if (step < 23) {
      const level = step === 7 ? 0 : 1 + Math.floor((step - 8) / 3);
      this.#sampleStart.value = step === 7 ? 0 : ((step - 8) % 3) * 32;
      const n = Math.max(1, Math.ceil((this.size >> level) / 8));
      renderer.compute(this.#filters[back]![level], [n, n, 6]);
    }
    else if (step === 23) { renderer.compute(this.#partial); renderer.compute(this.#reductions[back], [1, 1, 1]); }
    else { this.front = back; this.frontIndex.value = back; this.refreshCount++; }
  }
  update(renderer: WebGPURenderer, dt: number, sun: Vector3, force = false): void {
    if (this.#disposed) return;
    this.timer -= Math.max(0, dt);
    if (force || !this.primed) {
      this.primed = true; this.timer = this.interval; this.#lastSun.copy(sun);
      for (let step = 0; step < this.totalSteps; step++) this.#dispatchStep(renderer, step);
      this.step = -1; return;
    }
    if (this.step < 0) {
      if (sun.angleTo(this.#lastSun) <= 0.004 && this.timer > 0) return;
      this.timer = this.interval; this.#lastSun.copy(sun); this.step = 0;
    }
    this.#dispatchStep(renderer, this.step++); if (this.step === this.totalSteps) this.step = -1;
  }
  dispose(): void {
    if (this.#disposed) return; this.#disposed = true; this.intensity.value = 0;
    this.source.dispose(); this.#filterAccumulator.dispose(); for (const target of this.targets) target.dispose();
    for (const kernel of [...this.#faces, ...this.#mips, ...this.#filters.flat(), this.#partial, ...this.#reductions]) kernel.dispose();
    this.#partialBuffer.dispose(); for (const sh of this.sh) sh.dispose();
  }
}
