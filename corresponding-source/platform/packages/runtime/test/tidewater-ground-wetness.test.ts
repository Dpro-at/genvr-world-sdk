import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GroundWetness, SHORE_SIM_STEP_WGSL, GROUND_WETNESS_WGSL } from '../src/ocean/ground-wetness.js';
import { createLaceMipmaps } from '../src/ocean/surf-lace.js';
import { SHORE_EVALUATOR_WGSL } from '../src/ocean/shore-evaluator.js';
const source = (name: string) => readFileSync(new URL(`../../../../tooling/other-programs/tidewater/src/${name}`, import.meta.url), 'utf8');
const stripImports = (text: string) => text.replace(/^import .*;\r?\n/gm, '');
function laceOracle(size: number): Array<{data:Uint8Array;width:number;height:number}> {
  class TextureStub { userData: Record<string,unknown>={}; constructor(_options:unknown){void _options;} upload():void{} }
  return new Function('Texture','size', stripImports(source('ocean/SurfFoam.js')).replace(/export /g,'')+';return makeLaceTexture(size).userData.mips;')(TextureStub,size);
}
function functions(text: string): Map<string,string> {
  const result=new Map<string,string>(),re=/\bfn\s+(\w+)\s*\(/g;let match;
  while((match=re.exec(text))){const start=match.index;let end=text.indexOf('{',re.lastIndex)+1,depth=1;
    while(depth){if(text[end]==='{')depth++;if(text[end]==='}')depth--;end++;}
    result.set(match[1]!,text.slice(start,end));re.lastIndex=end;
  }return result;
}
const normalize=(text:string)=>text.replace(/\/\/[^\n]*/g,'').replace(/\s+/g,'');
describe('source ShoreSim dependencies and stable bridge',()=>{
 it('matches executable SurfFoam original lace and every source-rounded mip byte',()=>{
  const expected=laceOracle(512),actual=createLaceMipmaps();expect(actual.length).toBe(10);
  for(let i=0;i<actual.length;i++)expect(Buffer.compare(Buffer.from(actual[i]!.data),Buffer.from(expected[i]!.data))).toBe(0);
 });
 it('retains every reachable source world-wave equation with only explicit provider parameters',()=>{
  const shore=new Function('GRAVITY',stripImports(source('ocean/ShoreWaves.js')).replace('export class','class')+';return ShoreWaves.prototype._code.call({});')(9.81) as string;
  const common=source('engine/render/wgsl/common.js');const all=functions(shore+common),port=functions(SHORE_EVALUATOR_WGSL);
  let count=0;
  for(const [name,body] of port){if(!all.has(name))continue;let restored=body;
   if(name.startsWith('shore')){
    restored=restored.replace(/ctx: ShoreContext, ht: texture_2d<f32>, st: texture_2d<f32>, /g,'')
      .replace(/\b(shore\w+)\(ctx, ht, st, /g,'$1(')
      .replace(/shoreHeight\(ctx, ht, /g,'terrainHeightAt( ')
      .replace(/shoreField\(ctx, st, /g,'terrainShoreSample( ')
      .replace(/ctx\.(time|seaLevel)/g,'frame.$1').replace(/ctx\./g,'shoreP.');
   }
   expect(normalize(restored),name).toBe(normalize(all.get(name)!));count++;
  }expect(count).toBe(20);
 });
 it('preserves source decay, residue and exact App static band constants',()=>{
  expect(SHORE_SIM_STEP_WGSL).toContain('28.0');expect(SHORE_SIM_STEP_WGSL).toContain('2.6');
  expect(SHORE_SIM_STEP_WGSL).toContain('4.5');expect(SHORE_SIM_STEP_WGSL).toContain('5.0');
  expect(GROUND_WETNESS_WGSL).toContain('smoothstep(0.45,0.0,h)');
  const bridge=new GroundWetness(8),state=bridge.state,dir=bridge.swellDirectionNode;
  bridge.deactivate();bridge.invalidate();expect(bridge.availableNode.value).toBe(0);
  expect(bridge.state).toBe(state);expect(bridge.swellDirectionNode).toBe(dir);
  bridge.dispose();bridge.dispose();expect(bridge.availableNode.value).toBe(0);
 });
});
