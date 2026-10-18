import {it,expect} from 'vitest';
import {Scene,SpotLight} from 'three/webgpu';
import {SceneLight,SceneLights} from '@genvr/contracts';
import {SceneLighting} from '../src/scene-lighting.js';
it('follows an actor, keeps world lights fixed and removes disabled targets safely',()=>{
 const scene=new Scene(),rig=new SceneLighting(scene);const settings=[SceneLight.parse({id:'key',name:'Key'})];
 rig.update(settings,()=>({x:10,y:4,z:20}));const light=scene.children.find(o=>o instanceof SpotLight) as SpotLight;
 expect(light.position.toArray()).toEqual([12,7,23]);expect(light.target.position.toArray()).toEqual([10,5.5,20]);
 rig.update(settings,()=>({x:15,y:4,z:20}));expect(light.position.x).toBe(17);
 rig.update(settings,()=>null);expect(light.visible).toBe(false);
 rig.update([{...settings[0]!,actor:null}],()=>null);expect(light.visible).toBe(true);expect(light.position.toArray()).toEqual([2,3,3]);
 rig.update([],()=>null);expect(scene.children).toHaveLength(0);rig.dispose();
 expect(SceneLights.safeParse([settings[0],settings[0]]).success).toBe(false);
 expect(SceneLight.safeParse({...settings[0],intensity:Infinity}).success).toBe(false);
});
