import { describe, it, expect } from 'vitest';
import { HAZE, layerOpticalDepth, hazeInScatter, hazePhase, marchHaze, aoDepthWeight,
  aoMultiBounce, historyAccepts } from '../src/post/air-math.js';
describe('Tidewater physical air and AO reference equations',()=>{
 it('integrates a horizontal exponential layer without the near-zero division',()=>{
  const expected=HAZE.marineSigma*Math.exp(-20/HAZE.marineHeight)*2000;
  expect(layerOpticalDepth(HAZE.marineSigma,HAZE.marineHeight,20,0,2000)).toBeCloseTo(expected,12);
  for(const y of [-1e-7,1e-7])expect(layerOpticalDepth(HAZE.marineSigma,HAZE.marineHeight,20,y,2000)).toBeCloseTo(expected,9);
 });
 it('matches numerical integration for rising and descending rays',()=>{
  for(const vertical of [-.05,.1,.5]){
   let sum=0;const distance=1800,steps=10000,dt=distance/steps;
   for(let i=0;i<steps;i++)sum+=HAZE.aerosolSigma*Math.exp(-(300+vertical*(i+.5)*dt)/HAZE.aerosolHeight)*dt;
   expect(layerOpticalDepth(HAZE.aerosolSigma,HAZE.aerosolHeight,300,vertical,distance)).toBeCloseTo(sum,8);
  }
 });
 it('preserves zero density and fades greater distances toward the actual horizon',()=>{
  expect(hazeInScatter(10,0,1000,0)).toBe(0);expect(hazeInScatter(10,0,0)).toBe(0);
  expect(hazeInScatter(10,0,12000)).toBeGreaterThan(hazeInScatter(10,0,1200));
  expect(hazeInScatter(2000,0,1200)).toBeLessThan(hazeInScatter(10,0,1200));
 });
 it('uses the source Cornette-Shanks forward lobe with isotropic share',()=>{
  expect(hazePhase(1)).toBeCloseTo(.810154889,6);
  expect(hazePhase(1)).toBeGreaterThan(hazePhase(0)*10);
  expect(hazePhase(-1)).toBeGreaterThan(0);
 });
 it('marches exact lit fractions, bounds distance and source quadrature ratio',()=>{
  for(const jitter of [.1,.5,.9]){
   const lit=marchHaze(10,0,2500,jitter,()=>1),shadow=marchHaze(10,0,2500,jitter,()=>0);
   expect(lit[0]).toBeCloseTo(1,12);expect(shadow[0]).toBe(0);
   expect(lit[1]).toBeGreaterThan(.8);expect(lit[1]).toBeLessThan(1.1);
   expect(marchHaze(10,0,60000,jitter,()=>.3)).toEqual(marchHaze(10,0,2500,jitter,()=>.3));
  }
 });
 it('rejects disoccluded history using the source distance window',()=>{
  expect(historyAccepts(100,100)).toBe(true);expect(historyAccepts(106,100)).toBe(false);
  expect(historyAccepts(100.4,100)).toBe(true);expect(historyAccepts(.6,0)).toBe(false);
 });
 it('bilateral AO retains contact darkness without bleeding across depth edges',()=>{
  expect(aoDepthWeight(0)).toBe(1);expect(aoDepthWeight(.5)).toBeLessThan(.003);
  expect(aoMultiBounce(0)).toBe(0);expect(aoMultiBounce(1)).toBe(1);
  for(const ao of [.1,.3,.6,.9])expect(aoMultiBounce(ao)).toBeGreaterThanOrEqual(ao);
 });
});
