/* Procedural cloud fields. Weather equations ported from Tidewater SkyProClouds.js (MIT,
 * Copyright 2026 DRG Software Solutions LLC; LICENSE-tidewater.md). Shape is generated
 * Worley base with Perlin weather, not the original baked asset. Read-only study of original
 * channel histograms identified inverted Worley FBM4/8/16 (mean .478, SD .119), without
 * positive Perlin dilation. Seven box-filtered volume mips preserve LOD sampling. */
import { Storage3DTexture, StorageTexture, RepeatWrapping, LinearFilter, LinearMipmapLinearFilter,
  RGBAFormat, UnsignedByteType, TSL, type WebGPURenderer } from 'three/webgpu';
/* eslint-disable @typescript-eslint/no-explicit-any -- native TSL shader graph */
const { Fn, wgslFn, globalId, vec2, vec3, vec4, ivec3, uvec2, texture,
  textureStore, texture3D, storageTexture3D } = TSL as any;
const NOISE_WGSL = `
fn scHash33( cell: vec3u ) -> vec3u {
	var p = cell * 1664525u + 1013904223u;
	p.x += p.y * p.z; p.y += p.z * p.x; p.z += p.x * p.y;
	p = p ^ ( p >> vec3u( 16u ) );
	p.x += p.y * p.z; p.y += p.z * p.x; p.z += p.x * p.y;
	return p;
}
fn scGradient( cell: vec3i, period: i32, offset: vec3f ) -> f32 {
	let wrapped = vec3u( ( ( cell % vec3i( period ) ) + vec3i( period ) ) % vec3i( period ) );
	let h = ( scHash33( wrapped ).x >> 24u ) & 15u;
	let u = select( offset.y, offset.x, h < 8u );
	let v = select( select( offset.z, offset.x, h == 12u || h == 14u ), offset.y, h < 4u );
	return select( -u, u, ( h & 1u ) == 0u ) + select( -v, v, ( h & 2u ) == 0u );
}
fn scPerlin( p: vec3f, period: i32 ) -> f32 {
	let cell = vec3i( floor( p ) ); let fr = fract( p ); let w = fr * fr * fr * ( fr * ( fr * 6.0 - 15.0 ) + 10.0 );
	return mix( mix( mix( scGradient( cell, period, fr ), scGradient( cell + vec3i( 1, 0, 0 ), period, fr - vec3f( 1, 0, 0 ) ), w.x ),
		mix( scGradient( cell + vec3i( 0, 1, 0 ), period, fr - vec3f( 0, 1, 0 ) ), scGradient( cell + vec3i( 1, 1, 0 ), period, fr - vec3f( 1, 1, 0 ) ), w.x ), w.y ),
		mix( mix( scGradient( cell + vec3i( 0, 0, 1 ), period, fr - vec3f( 0, 0, 1 ) ), scGradient( cell + vec3i( 1, 0, 1 ), period, fr - vec3f( 1, 0, 1 ) ), w.x ),
		mix( scGradient( cell + vec3i( 0, 1, 1 ), period, fr - vec3f( 0, 1, 1 ) ), scGradient( cell + vec3i( 1, 1, 1 ), period, fr - vec3f( 1, 1, 1 ) ), w.x ), w.y ), w.z );
}
fn scFbm( uv: vec2f, profile: vec4f ) -> f32 {
	var frequency = max( 1.0, round( profile.x ) ); var weight = 0.5;
	var sum = 0.0; var weights = 0.0;
	for ( var i = 0u; i < u32( profile.y ); i++ ) {
		sum += scPerlin( vec3f( uv, profile.z * 13.37 + 0.5 ) * frequency, i32( frequency ) ) * weight;
		weights += weight; weight *= 0.5; frequency *= 2.0;
	}
	return sum / max( weights, 0.001 ) * 0.5 + 0.5;
}

fn twWorley(p:vec3f,cells:f32)->f32 {
 let q=p*cells;let ip=vec3i(floor(q));let fp=fract(q);var d=1000.0;
 for(var z=-1;z<=1;z++){for(var y=-1;y<=1;y++){for(var x=-1;x<=1;x++){
  let o=vec3i(x,y,z);let period=vec3i(i32(cells));let cell=vec3u(((ip+o)%period+period)%period);
  let h=vec3f(scHash33(cell))/4294967296.0;d=min(d,length(vec3f(o)+h-fp));
 }}}
 return clamp(1.0-d,0.0,1.0);
}
fn twShapeChannel(p:vec3f,c:f32)->f32 {
 let b=twWorley(p,c)*0.625+twWorley(p,c*2.0)*0.25+twWorley(p,c*4.0)*0.125;
 return clamp(b,0.0,1.0);
}
`;
const shape = wgslFn(`fn twShape(p:vec3f)->vec4f {
 return vec4f(twShapeChannel(p,4.0),twShapeChannel(p,8.0),twShapeChannel(p,16.0),1.0);
}\n${NOISE_WGSL}`);
const weather = wgslFn(`fn twWeather(uv:vec2f)->vec4f {
 let mass=clamp((scFbm(uv,vec4f(4.0,5.0,0.0,1.32))-0.5)*1.32+0.5,0.0,1.0);
 let detail=(scFbm(uv,vec4f(6.0,6.0,1.0,0.13))*2.0-1.0)*0.13;
 return vec4f(clamp(mass+detail+0.26-0.5,0.0,1.0),0.0,0.0,1.0);
}\n${NOISE_WGSL}`);
const bounds = wgslFn(`fn twBounds(map:texture_2d<f32>,id:vec2u)->vec4f {
 let sourceSize=vec2i(1024);let lo=vec2i(id)*16-vec2i(1);let hi=vec2i(id+1u)*16;
 var maximum=0.0;
 for(var y=lo.y;y<=hi.y;y++){for(var x=lo.x;x<=hi.x;x++){
  let p=((vec2i(x,y)%sourceSize)+sourceSize)%sourceSize;
  maximum=max(maximum,textureLoad(map,p,0).r);
 }}
 return vec4f(min(1.0,maximum+1.0/255.0),0.0,0.0,1.0);
}`);
const blue = wgslFn(`fn twBlue(id:vec2u)->vec4f {
 // Remove local low-frequency energy from deterministic white noise, wrapping the tile.
 let p=vec2i(id);var neighbors=0.0;
 for(var y=-1;y<=1;y++){for(var x=-1;x<=1;x++){
  if(x!=0||y!=0){let q=((p+vec2i(x,y))%vec2i(64)+vec2i(64))%vec2i(64);
   neighbors+=f32(scHash33(vec3u(vec2u(q),17u)).x)/4294967296.0;}
 }}
 let center=f32(scHash33(vec3u(id,17u)).x)/4294967296.0;
 let n=clamp(0.5+(center-neighbors/8.0)*0.9,0.0,1.0);
 return vec4f(n,n,n,1.0);
}\n${NOISE_WGSL}`);
export class CloudNoise {
 readonly noiseTexture = new Storage3DTexture(64,64,64);
 readonly weatherTexture = new StorageTexture(1024,1024);
 readonly boundsTexture = new StorageTexture(64,64);
 readonly blueTexture = new StorageTexture(64,64);
 /** Graph setup is synchronous; update(renderer) prepares GPU resources before sampling. */
 readonly ready = Promise.resolve();
 isReady = false;
 #pending: Promise<void> | undefined;
 #disposed = false;
 #kernels: any[] = [];
 #mipTextures: Storage3DTexture[] = [];
 constructor() {
  for(const t of [this.noiseTexture,this.weatherTexture,this.boundsTexture,this.blueTexture]) {
   t.type=UnsignedByteType;t.format=RGBAFormat;t.minFilter=LinearFilter;t.magFilter=LinearFilter;
   t.wrapS=t.wrapT=RepeatWrapping;t.generateMipmaps=false;
  }
  this.noiseTexture.wrapR=RepeatWrapping;
  this.noiseTexture.minFilter=LinearMipmapLinearFilter;
  this.noiseTexture.mipmaps=Array.from({length:7},(_,level)=>({width:64>>level,height:64>>level,depth:64>>level,data:new Uint8Array(0)}));
  this.#kernels.push(Fn(()=>{
   storageTexture3D(this.noiseTexture,ivec3(globalId),shape(vec3(globalId).add(0.5).div(64))).toWriteOnly().toStack();
  })().compute([16,16,16],[4,4,4]));
  for(let level=1;level<7;level++) {
   const size=64>>level;
   const previous=level===1?this.noiseTexture:this.#mipTextures[level-2]!;
   const target=new Storage3DTexture(size,size,size);
   target.type=UnsignedByteType;target.format=RGBAFormat;target.minFilter=LinearFilter;
   target.magFilter=LinearFilter;target.generateMipmaps=false;
   this.#mipTextures.push(target);
   this.#kernels.push(Fn(()=>{
    const p=vec3(globalId).mul(2);let sum=vec4(0);
    for(let z=0;z<2;z++)for(let y=0;y<2;y++)for(let x=0;x<2;x++) {
     sum=sum.add(texture3D(previous,p.add(vec3(x,y,z)).add(0.5).div(size*2)).level(0));
    }
    storageTexture3D(target,ivec3(globalId),sum.div(8)).toWriteOnly().toStack();
   })().compute([size,size,size],[1,1,1]));
  }
  this.#kernels.push(Fn(()=>textureStore(this.weatherTexture,uvec2(globalId.xy),weather(vec2(globalId.xy).div(1024))))().compute([128,128],[8,8,1]));
  this.#kernels.push(Fn(()=>textureStore(this.boundsTexture,uvec2(globalId.xy),bounds(texture(this.weatherTexture),uvec2(globalId.xy))))().compute([8,8],[8,8,1]));
  this.#kernels.push(Fn(()=>textureStore(this.blueTexture,uvec2(globalId.xy),blue(uvec2(globalId.xy))))().compute([8,8],[8,8,1]));
 }
 update(renderer:WebGPURenderer):Promise<void> {
  if(this.#disposed||this.isReady)return Promise.resolve();
  if(!this.#pending)this.#pending=(async()=>{
   for(const kernel of this.#kernels) {
    if(this.#disposed)return;
    await renderer.computeAsync(kernel);
   }
   if(this.#disposed)return;
   this.#mipTextures.forEach((source,i)=>renderer.copyTextureToTexture(source,this.noiseTexture,null,null,0,i+1));
   if(!this.#disposed)this.isReady=true;
  })().catch(error=>{this.#pending=undefined;throw error;});
  return this.#pending;
 }
 dispose():void {
  this.#disposed=true;this.isReady=false;
  for(const t of [this.noiseTexture,this.weatherTexture,this.boundsTexture,this.blueTexture])t.dispose();
  for(const t of this.#mipTextures)t.dispose();
  for(const k of this.#kernels)k.dispose();
 }
}
