import { describe, it, expect } from 'vitest';
import { describeGeneratedControls, describeGeneratedLookControls, generatedControlValueError } from '../src/index.js';
describe('discoverable generated Core controls', () => {
  it('preserves source defaults and limits without exposing unrelated settings', () => {
    const info = describeGeneratedControls('genvr.core.tidewater.test-box')!;
    expect(info.generator).toBe('genvr.test-box');
    expect(info.source.license).toBe('MIT');
    expect(info.controls.length).toBeGreaterThan(0);
    expect(info.controls.find(c=>c.key==='width')).toMatchObject({group:'appearance',label:'Width',unit:'m'});
    expect(info.controls.find(c=>c.key==='seed')).toMatchObject({group:'general'});
    expect(info.controls.find(c=>c.key==='seed')?.unit).toBeUndefined();
    expect(info.controls.find(c=>c.key==='seed')?.description).toContain('does not use');
    expect(info.controls.some(c=>c.group==='motion'||c.group==='behavior')).toBe(false);
    for(const c of info.controls) {
      expect(c.label.length).toBeGreaterThan(0);expect(c.description).toContain('Default:');
      expect(generatedControlValueError(c,c.default)).toBeNull();
      expect(generatedControlValueError(c,{})).not.toBeNull();
      if(c.type==='number') {
        expect(generatedControlValueError(c,NaN)).not.toBeNull();
        if(c.min!==undefined)expect(generatedControlValueError(c,c.min-1)).not.toBeNull();
        if(c.max!==undefined)expect(generatedControlValueError(c,c.max+1)).not.toBeNull();
      }
    }
  });
  it('uses author groups only, with General fallback and no fabricated units', () => {
    const generated = { generator:'fixture',params:{swimSpeed:2},limits:{swimSpeed:{min:0,max:4}},
      source:{name:'Fixture',page:'https://example.com',license:'MIT'},bounds:{min:[0,0,0] as [number,number,number],max:[1,1,1] as [number,number,number]},picture:'' };
    expect(describeGeneratedLookControls({generated}).controls[0]).toMatchObject({group:'general'});
    expect(describeGeneratedLookControls({generated}).controls[0]?.unit).toBeUndefined();
    const documented={...generated,controls:{swimSpeed:{group:'motion' as const,label:'Swim speed',help:'Author-specified swimming rate.',unit:'m/s'},unknown:{group:'behavior' as const,label:'Ignored',help:'Not a parameter'}}};
    const info=describeGeneratedLookControls({generated:documented});
    expect(info.controls).toHaveLength(1);
    expect(info.controls[0]).toMatchObject({group:'motion',unit:'m/s',label:'Swim speed',min:0,max:4});
    expect(info.controls[0]?.description).toContain('Author-specified');
  });
  it('reports no custom controls for missing or non-generated Core resources', () => {
    expect(describeGeneratedControls('missing')).toBeNull();
    expect(describeGeneratedControls('genvr.core.ground.tidewater-seagrass')).toBeNull();
  });
  it('shares boolean and enum validation without changing reset semantics', () => {
    expect(generatedControlValueError({key:'active',label:'Active',description:'',group:'general' as const,type:'boolean',default:true},false)).toBeNull();
    const c={key:'kind',label:'Kind',description:'',group:'general' as const,type:'string' as const,default:'a',values:['a','b']};
    expect(generatedControlValueError(c,'b')).toBeNull();expect(generatedControlValueError(c,'c')).not.toBeNull();
    expect(generatedControlValueError(c,null)).not.toBeNull(); // caller handles null reset by deleting override
  });
});
