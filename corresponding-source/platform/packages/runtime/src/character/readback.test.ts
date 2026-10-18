import {describe,it,expect} from 'vitest';
import {previewRGBA} from './readback.js';
describe('preview pixel readback',()=>{
 it('removes WebGPU alignment for a watch portrait',()=>{
  const width=210,height=2,stride=1024,source=new Uint8Array(stride+width*4);source.fill(17,0,width*4);source.fill(99,stride);
  const pixels=previewRGBA(source,width,height);expect(pixels.length).toBe(width*height*4);expect(pixels[0]).toBe(17);expect(pixels[width*4]).toBe(99);expect(pixels.at(-1)).toBe(99);
 });
 it('flips bottom-up WebGL rows without adding GPU padding',()=>{expect([...previewRGBA(new Uint8Array([1,2,3,4,5,6,7,8]),1,2,true)]).toEqual([5,6,7,8,1,2,3,4]);});
});
