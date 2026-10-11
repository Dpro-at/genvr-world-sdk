import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import { bakePlantPose, deformPlantCpu, type PlantCpuInputs } from '../src/vegetation/deformation-cpu.js';
import { buildPalmNear, buildPalmFar, buildYoungPalm } from '../src/vegetation/palm-geometry.js';

const input = (): PlantCpuInputs => ({position:new Vector3(2,0,0),normal:new Vector3(0,1,0),
  instancePosition:[0,0,0,1],instanceData:[0,0,8,.05],vegetation:[1,.5,1,.3],material:[1,0,1,.3],lobe:[0,0,0,0],
  lodRange:[0,90,100],camera:new Vector3(0,10,0),time:0,strength:.03,gust:0,
  windDirection:new Vector3(1,0,0),windPerpendicular:new Vector3(0,0,1)});
describe('plant authoring shape', () => {
  it('preserves frond length and collapses hidden kinds/dead fronds/LOD without mutating inputs', () => {
    const i=input(),before=i.position.clone(),d=deformPlantCpu(i);
    const anchor=deformPlantCpu({...i,position:new Vector3(),vegetation:[1,0,0,.3]});
    expect(d.position.distanceTo(anchor.position)).toBeCloseTo(2,8);
    expect(i.position.equals(before)).toBe(true);
    expect(deformPlantCpu({...i,lobe:[0,0,0,-6]}).position.length()).toBe(0);
    expect(deformPlantCpu({...i,camera:new Vector3(0,101,0)}).position.length()).toBe(0);
    expect(deformPlantCpu({...i,material:[1,1,1,.3]}).position.distanceTo(anchor.position)).toBeCloseTo(0,8);
  });
  it('builds independent bounds-ready poses for all palm builders without editing source buffers', () => {
    for(const builder of [buildPalmNear,buildPalmFar,buildYoungPalm]) {
      const source=builder().geometry,raw=Array.from(source.getAttribute('position').array);
      const height = builder === buildYoungPalm ? .6 : 8;
      const pose=bakePlantPose(source,height,.37),short=bakePlantPose(source,height/2,.37);
      expect(Array.from(source.getAttribute('position').array)).toEqual(raw);
      expect(pose.getAttribute('position').count).toBe(source.getAttribute('position').count);
      expect(pose.index!.count).toBe(source.index!.count);
      expect(pose.boundingBox!.max.y).toBeGreaterThan(height);
      expect(pose.boundingBox!.max.y-short.boundingBox!.max.y).toBeCloseTo(height/2,3);
      // Source stem rows extend below zero to bury the root, rather than floating on the surface.
      expect(pose.boundingBox!.min.y).toBeCloseTo((builder===buildYoungPalm?-.2:-.03)*height,3);
      expect(pose.boundingSphere!.radius).toBeGreaterThan(0);
      expect(Array.from(pose.getAttribute('position').array).every(Number.isFinite)).toBe(true);
      pose.dispose();short.dispose();source.dispose();
    }
  });
  it('rejects invalid authoring height or nonfinite parameters', () => {
    const source=buildPalmNear().geometry;
    for(const height of [0,-1,NaN,Infinity])expect(()=>bakePlantPose(source,height,.37)).toThrow();
    expect(()=>bakePlantPose(source,8,NaN)).toThrow();source.dispose();
  });
});
