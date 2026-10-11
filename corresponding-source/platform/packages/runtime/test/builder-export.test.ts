import {expect,it} from 'vitest';
import {Box3,Vector3} from 'three';
import {ItemInstance} from '@genvr/contracts';
import {builderAssembly} from '../src/builder-export.js';
import {resolveItem} from '../src/items.js';
const part=(id:string,x:number,color:string)=>ItemInstance.parse({instanceId:id,itemId:'genvr.core.part.box',transform:{position:[x,5,3],scale:[2,1,1]},params:{color}});
it('preserves relative geometry and tints without changing world instances or shared models',()=>{
 const inputs=[part('part-a',10,'#ff0000'),part('part-b',13,'#0000ff')],before=JSON.stringify(inputs);
 const result=builderAssembly(inputs,i=>resolveItem(i.itemId,undefined,'blocky',undefined,i.params));
 const bounds=new Box3().setFromObject(result.root),center=bounds.getCenter(new Vector3());
 expect(bounds.min.y).toBe(0);expect(center.x).toBe(0);expect(center.z).toBe(0);
 expect(result.root.children[1]!.position.x-result.root.children[0]!.position.x).toBe(3);
 expect((result.root.children[0]!.children[0] as any).material.color.getHexString()).toBe('ff0000');
 expect(JSON.stringify(inputs)).toBe(before);result.dispose();
});
it('refuses missing and animated packages instead of saving a placeholder',()=>{
 const i=part('part-a',0,'#ffffff'),model=resolveItem(i.itemId);
 expect(()=>builderAssembly([],()=>model)).toThrow();
 expect(()=>builderAssembly([i],()=>({...model,parts:[],meshes:[]}))).toThrow('not loaded');
 expect(()=>builderAssembly([i],()=>({...model,animation:{scene:null,clips:[]} as never}))).toThrow('static');
});
