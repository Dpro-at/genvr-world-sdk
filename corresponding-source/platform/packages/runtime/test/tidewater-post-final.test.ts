import { describe,it,expect } from 'vitest';
import { acesFilmic,adaptExposure,postHash,gradeDisplay,bloomDown13,rcasHDR,FINAL_DEFAULTS } from '../src/post/final-math.js';
describe('Tidewater final source equations',()=>{
 it('preserves source settings and exposure/.6 fitted ACES',()=>{
  expect(FINAL_DEFAULTS.sharpen).toBe(.45);expect(FINAL_DEFAULTS.bloom).toBe(.05);
  expect(acesFilmic([0,0,0])).toEqual([0,0,0]);
  expect(acesFilmic([.18,.18,.18])[0]).toBeCloseTo(.0927443885,8);
  expect(acesFilmic([1,1,1],.6)[0]).toBeCloseTo(.619115,5);
  expect(acesFilmic([1000,1000,1000])).toEqual([1,1,1]);
 });
 it('adapts in log stops with asymmetric rates and partial/night compensation',()=>{
  const up=adaptExposure(1,.01,1),down=adaptExposure(1,1,1);
  expect(up).toBeCloseTo(2**(Math.log2(6)*(1-Math.exp(-1.6))),8);
  expect(down).toBeCloseTo(2**(Math.log2(.6)*(1-Math.exp(-1.1))),8);
  expect(adaptExposure(1,.001,100,1)).toBeCloseTo(2);
  expect(adaptExposure(3,.001,0)).toBe(3);expect(adaptExposure(3,.001,1,0,false)).toBe(1);
 });
 it('changes integer grain by frame and keeps final gradients finite',()=>{
  expect(postHash(0,0,0)).toBe(0);expect(postHash(100,200,3)).not.toBe(postHash(100,200,4));
  for(const value of [0,.001,.1,1,50])expect(gradeDisplay([value,value*.7,value*.3],[.2,.8],[32,17],5).every(Number.isFinite)).toBe(true);
 });
 it('preserves13tap DC energy and suppresses a lone firefly by Karis groups',()=>{
  const taps=Array.from({length:13},()=>[.3,.4,.6]);expect(bloomDown13(taps)).toEqual([.3,.4,.6]);
  const first=bloomDown13(taps,true);for(let c=0;c<3;c++)expect(first[c]).toBeCloseTo(taps[0]![c]!);
  taps[0]=[30,40,60];expect(bloomDown13(taps,true)[0]).toBeLessThan(bloomDown13(taps)[0]!);
 });
 it('RCAS proxy keeps DC flat, and softens sky sharpening',()=>{
  const center=[.3,.4,.6],neighbors=Array.from({length:4},()=>[...center]);
  rcasHDR(center,neighbors).forEach((v,c)=>expect(v).toBeCloseTo(center[c]!));
  const edge=[[.1,.1,.1],[.15,.15,.15],[.6,.6,.6],[.7,.7,.7]];
  expect(Math.abs(rcasHDR([.3,.3,.3],edge,.45,true)[0]!-.3)).toBeLessThan(Math.abs(rcasHDR([.3,.3,.3],edge)[0]!-.3));
 });
});
