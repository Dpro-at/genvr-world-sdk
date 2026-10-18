import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {HUMAN_FACE_LANDMARKS} from '@genvr/core-library';
import {decodeHuman} from '../../../src/character/human/format.js';
import {generateHuman} from '../../../src/character/human/generate.js';
import {fitEyelidBlink} from '../../../src/character/human/eyelids.js';
const bytes = readFileSync(new URL('../../../../../apps/web/public/human/human-base.bin',import.meta.url));
const data=decodeHuman(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
describe('eyelid closure on our generated face',()=>{
 it.each([0,.5])('fits the actual eye opening with eye size %s',size=>{
  const body=generateHuman(data,'anime','boy',HUMAN_FACE_LANDMARKS,{'face.eyeSize+':size,'face.eyeOpen+':size})!;
  const blink=fitEyelidBlink(body);
  let moving=0, lashes=0;
  for(let v=0;v<body.region.length;v++){
   const dx=blink[v*3]!,dy=blink[v*3+1]!,dz=blink[v*3+2]!;
   expect([dx,dy,dz].every(Number.isFinite)).toBe(true);
   if(body.region[v]===2)expect(Math.hypot(dx,dy,dz)).toBe(0);
   if(Math.hypot(dx,dy,dz)>.00001){
    moving++;if(body.region[v]===3)lashes++;
    expect(body.positions[v*3+1]!).toBeGreaterThan(1.5);
    const centre=body.face[body.positions[v*3]!>0?'leftEye':'rightEye']!;
    const y=body.positions[v*3+1]!-centre[1],z=body.positions[v*3+2]!-centre[2];
    expect(Math.hypot(y+dy,z+dz)).toBeCloseTo(Math.hypot(y,z),6);
   }
  }
  expect(moving).toBeGreaterThan(100);expect(lashes).toBeGreaterThan(10);
  const edges=new Map<string,number>();
  for(let q=0;q<body.quads.length;q+=4){
   const ids=Array.from(body.quads.subarray(q,q+4));if(ids.some(v=>body.region[v]!==0))continue;
   for(let k=0;k<4;k++){const a=ids[k]!,b=ids[(k+1)%4]!,key=a<b?`${a}:${b}`:`${b}:${a}`;edges.set(key,(edges.get(key)??0)+1);}
  }
  const boundary=new Set<number>();for(const [key,count]of edges)if(count===1)for(const v of key.split(':').map(Number))boundary.add(v);
  for(const side of ['left','right']){
   const eye=body.face[side+'Eye']!;
   const central=[...boundary].filter(v=>Math.abs(body.positions[v*3]!-eye[0])<.0025&&Math.hypot(body.positions[v*3+1]!-eye[1],body.positions[v*3+2]!-eye[2])<.03);
   expect(central.length).toBeGreaterThan(3);
   const open=central.map(v=>body.positions[v*3+1]!);
   const closed=central.map(v=>body.positions[v*3+1]!+blink[v*3+1]!);
   expect(Math.max(...closed)-Math.min(...closed)).toBeLessThan((Math.max(...open)-Math.min(...open))*.2);
   const upper=body.face[side+'UpperLid']!,lower=body.face[side+'LowerLid']!;
   expect(upper[1]).toBeGreaterThan(lower[1]);
   expect(upper[2]-body.face[side+'Eye']![2]).toBeLessThan(.025);
  }
 });
});
