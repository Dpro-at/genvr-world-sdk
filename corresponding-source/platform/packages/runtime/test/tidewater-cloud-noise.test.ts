import { describe, expect, it } from 'vitest';
import { cloudBlue, cloudHash, cloudPerlin, cloudShape, cloudWeather, cloudWorley } from '../src/tidewater-sky/cloud-noise-math.js';
describe('procedural cloud field reference',()=>{
 it('blue dither tiles and suppresses neighboring low frequency energy',()=>{
  let sum=0,neighbor=0,variance=0;
  for(let y=0;y<64;y++)for(let x=0;x<64;x++){
   const v=cloudBlue(x,y)-0.5;sum+=v;variance+=v*v;
   neighbor+=v*(cloudBlue(x+1,y)-0.5);
   expect(cloudBlue(x+64,y-64)).toBe(cloudBlue(x,y));
  }
  expect(sum/4096).toBeCloseTo(0,2);
  expect(variance/4096).toBeGreaterThan(0.02);
  expect(neighbor/variance).toBeLessThan(-0.1);
 });
 it('uses deterministic integer hashes',()=>{
  expect(cloudHash([3,7,11])).toEqual(cloudHash([3,7,11]));
  expect(cloudHash([3,7,11])).not.toEqual(cloudHash([3,7,12]));
 });
 it('tiles Perlin across positive and negative cell boundaries',()=>{
  const p=[-0.371,2.124,1.771];
  for(let axis=0;axis<3;axis++){
   const shifted=[...p];shifted[axis]!+=8;
   expect(cloudPerlin(shifted,8)).toBeCloseTo(cloudPerlin(p,8),12);
  }
 });
 it('tiles Worley and packed shape independently on all axes',()=>{
  const p=[0.123,-0.327,0.71];
  for(let axis=0;axis<3;axis++){
   const shifted=[...p];shifted[axis]!+=1;
   expect(cloudWorley(shifted,8)).toBeCloseTo(cloudWorley(p,8),12);
   cloudShape(shifted).forEach((v,i)=>expect(v).toBeCloseTo(cloudShape(p)[i]!,12));
  }
 });
 it('weather tiles in UV and remains finite in normalized range',()=>{
  for(let i=0;i<80;i++){
   const u=i*0.137,v=i*0.193;
   const w=cloudWeather(u,v);
   expect(w).toBeGreaterThanOrEqual(0);expect(w).toBeLessThanOrEqual(1);
   expect(cloudWeather(u+1,v-1)).toBeCloseTo(w,10);
  }
 });
 it('keeps the original raw weather mean separate from density coverage',()=>{
  let sum=0,sum2=0;
  for(let y=0;y<64;y++)for(let x=0;x<64;x++){
   const v=cloudWeather(x/64,y/64);sum+=v;sum2+=v*v;
  }
  const mean=sum/4096;
  expect(mean).toBeGreaterThan(0.23);expect(mean).toBeLessThan(0.29);
  expect(sum2/4096-mean*mean).toBeGreaterThan(0.001);
 });
 it('shape has variation and bounded channel values',()=>{
  const values=Array.from({length:32},(_,i)=>cloudShape([i/32,0.133,0.717])).flat();
  expect(Math.max(...values)-Math.min(...values)).toBeGreaterThan(0.2);
  values.forEach(v=>{expect(v).toBeGreaterThanOrEqual(0);expect(v).toBeLessThanOrEqual(1);});
 });
 it('matches the studied original shape channel distribution without baked assets',()=>{
  // Every position lies on the actual 64-cubed voxel grid; stratified across all axes.
  // Sampling every second coordinate would alias the highest (64-cell) octave.
  const sum=[0,0,0],sum2=[0,0,0];let count=0;
  for(let z=0;z<64;z++)for(let y=0;y<64;y++){
   const x=(z*37+y*17)%64;
   cloudShape([(x+0.5)/64,(y+0.5)/64,(z+0.5)/64]).forEach((v,c)=>{
    sum[c]!+=v;sum2[c]!+=v*v;
   });
   count++;
  }
  for(let c=0;c<3;c++){
   const mean=sum[c]!/count,sd=Math.sqrt(sum2[c]!/count-mean*mean);
   expect(mean).toBeGreaterThan(0.46);expect(mean).toBeLessThan(0.50);
   expect(sd).toBeGreaterThan(0.10);expect(sd).toBeLessThan(0.135);
  }
 });
});
