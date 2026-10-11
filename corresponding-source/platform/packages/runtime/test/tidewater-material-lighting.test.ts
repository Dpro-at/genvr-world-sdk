import { describe,expect,it } from 'vitest';
import { Color,PerspectiveCamera,Vector3,MeshStandardNodeMaterial } from 'three/webgpu';
import { reflectedGround,bounceIrradiance,bounceAlbedo,attachMaterialLighting } from '../src/tidewater-sky/ground-bounce.js';
import { LocalLights,localAttenuation,localSpotProfile,localWaterTransmission } from '../src/tidewater-sky/local-lights.js';
import { bayer4,lodFadeVisible,bandFade } from '../src/tidewater-sky/lod-fade.js';
describe('Tidewater material lighting equations',()=>{
 it('composes additive hooks and restores either independently without retaining stale maps',()=>{
  const material=new MeshStandardNodeMaterial();
  const m=material as unknown as {setupMaterialLightings:()=>unknown[]};
  const original=()=>['original'];m.setupMaterialLightings=original;
  const restoreBounce=attachMaterialLighting(material,{},()=>1),restoreLights=attachMaterialLighting(material,{},()=>2);
  expect(m.setupMaterialLightings()).toEqual(['original',1,2]);
  restoreBounce();expect(m.setupMaterialLightings()).toEqual(['original',2]);
  restoreLights();expect(m.setupMaterialLightings).toBe(original);material.dispose();
 });
 it('detaches individual local receivers and can attach them again after scene deletion',()=>{
  const lights=new LocalLights(),material=new MeshStandardNodeMaterial();
  const m=material as unknown as {setupMaterialLightings:()=>unknown[]};
  const original=()=>[];m.setupMaterialLightings=original;
  lights.attach(material);expect(m.setupMaterialLightings()).toHaveLength(1);
  lights.detach(material);expect(m.setupMaterialLightings).toBe(original);
  lights.attach(material);expect(m.setupMaterialLightings()).toHaveLength(1);
  lights.dispose();expect(m.setupMaterialLightings).toBe(original);material.dispose();
 });
 it('subtracts environment ground energy and blocks night/occluded ground',()=>{
  expect(reflectedGround([0.7,0.6,0.5],[0,1,0],[0,1,0])).toEqual([0.62,0.52,0.42]);
  expect(reflectedGround([0.7,0.6,0.5],[0,1,0],[0,1,0],0)).toEqual([0,0,0]);
  expect(reflectedGround([0.7,0.6,0.5],[0,1,0],[0,-1,0])).toEqual([0,0,0]);
 });
 it('uses source damp coral sand and attenuates seabed bounce through water',()=>{
  const dry=bounceAlbedo(2,[0,1,0],0,[1,0],0,[0.5,0.1,0.05]);
  const damp=bounceAlbedo(0.1,[0,1,0],0,[1,0],0,[0.5,0.1,0.05]);
  expect(dry[0]).toBeGreaterThan(dry[2]!);expect(damp[0]).toBeCloseTo(dry[0]!*0.6);
  const deep=bounceAlbedo(-10,[0,1,0],0,[1,0],0,[0.5,0.1,0.05]);
  expect(deep[0]).toBeLessThan(deep[2]!);expect(deep.every(Number.isFinite)).toBe(true);
 });
 it('adds warm lower hemisphere bounce while upward and underwater receivers reject it',()=>{
  const sample=[0.62,0.52,0.42,0],sun=[0,1,0],color=[4,3,2];
  const down=bounceIrradiance(sample,1,[0,-1,0],sun,color,0);
  expect(down[0]).toBeCloseTo(0.62*4*0.6);
  expect(bounceIrradiance(sample,1,[0,1,0],sun,color,0)).toEqual([0,0,0]);
  expect(bounceIrradiance(sample,-0.4,[0,-1,0],sun,color,0)).toEqual([0,0,0]);
  expect(bounceIrradiance(sample,50,[0,-1,0],sun,color,0)[0]).toBeCloseTo(down[0]!*0.4);
  expect(bounceIrradiance(sample,1,[0,-1,0],sun,color,0,0.5)[0]).toBeCloseTo(down[0]!*0.5);
 });
 it('softens finite lamps, squares the range window and cuts exactly at range',()=>{
  expect(localAttenuation(0,10)).toBeCloseTo(1/0.15);
  expect(localAttenuation(25,10)).toBeCloseTo((1-0.25**2)**2/25.15);
  expect(localAttenuation(100,10)).toBe(0);expect(localAttenuation(101,10)).toBe(0);
  expect(localSpotProfile(1,0.99,0.82)).toBe(1);
  expect(localSpotProfile(-1,0.99,0.82)).toBe(0);
  expect(localSpotProfile(0.7,0.99,0.82)).toBeGreaterThan(0);
  expect(localSpotProfile(0.9,0.9,0.9)).toBe(1);
 });
 it('attenuates only the submerged path and loses red fastest',()=>{
  expect(localWaterTransmission(1,2,10,0,[0.5,0.1,0.05])).toEqual([1,1,1]);
  const t=localWaterTransmission(-2,2,4,0,[0.5,0.1,0.05]);
  expect(t[0]).toBeCloseTo(Math.exp(-1));expect(t[0]).toBeLessThan(t[1]!);expect(t[1]).toBeLessThan(t[2]!);
 });
 it('packs the eight nearest enabled lamps and reserves flashlight priority',()=>{
  const lights=new LocalLights(),camera=new PerspectiveCamera();
  for(let i=10;i>=1;i--)lights.add({position:new Vector3(i,0,0),color:new Color(1,1,1),intensity:2,range:20});
  lights.update(camera,0.016,0);expect(lights.active).toBe(0);
  lights.update(camera,0.016,1);expect(lights.active).toBe(8);
  expect(lights.positions.slice(0,8).map(p=>p.x)).toEqual([1,2,3,4,5,6,7,8]);
  lights.toggleFlashlight(true);lights.update(camera,0.016,1);expect(lights.active).toBe(8);
  expect(lights.positions[0]!.x).toBeCloseTo(0.2);
  expect(lights.positions.slice(1).map(p=>p.x)).toEqual([1,2,3,4,5,6,7]);
  lights.enabled=false;lights.update(camera,0.016,1);expect(lights.active).toBe(0);expect(lights.count.value).toBe(0);
 });
 it('Bayer thresholds cover16 ranks and incoming/outgoing complement at every frame',()=>{
  for(let frame=0;frame<16;frame++){
   const ranks=[];
   for(let y=0;y<4;y++)for(let x=0;x<4;x++){
    ranks.push(bayer4(x,y,frame));
    for(const fade of [0,0.1,0.5,0.9375,1])expect(Number(lodFadeVisible(x,y,fade,false,frame))+Number(lodFadeVisible(x,y,fade,true,frame))).toBe(1);
   }
   expect(ranks.sort((a,b)=>a-b)).toEqual(Array.from({length:16},(_,i)=>(i+0.5)/16));
  }
 });
 it('LOD band endpoints and smooth middle remain stable',()=>{
  expect(bandFade(5,10,20)).toBe(0);expect(bandFade(15,10,20)).toBe(0.5);expect(bandFade(25,10,20)).toBe(1);
 });
});
