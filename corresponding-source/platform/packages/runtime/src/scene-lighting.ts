import { SpotLight, Object3D, Vector3, type Scene } from 'three/webgpu';
import type { SceneLight } from '@genvr/contracts';
/** Shared world lights: actor-relative offsets follow a live character; null actor uses world coordinates. */
export class SceneLighting {
 private entries=new Map<string,{light:SpotLight;target:Object3D}>();
 constructor(private scene:Scene){}
 update(settings:SceneLight[],anchor:(id:string)=>{x:number;y:number;z:number}|null){
  const ids=new Set(settings.map(s=>s.id));
  for(const[id,row]of this.entries)if(!ids.has(id)){row.light.removeFromParent();row.target.removeFromParent();row.light.dispose();this.entries.delete(id);}
  for(const s of settings){let row=this.entries.get(s.id);if(!row){const light=new SpotLight(),target=new Object3D();light.target=target;light.decay=2;light.castShadow=false;this.scene.add(light,target);row={light,target};this.entries.set(s.id,row);}
   const at=s.actor?anchor(s.actor):{x:0,y:0,z:0};row.light.visible=s.enabled&&at!==null;if(!at)continue;
   const origin=new Vector3(at.x,at.y,at.z);row.light.position.fromArray(s.position).add(origin);row.target.position.fromArray(s.target).add(origin);row.light.color.set(s.color);row.light.intensity=s.intensity;row.light.distance=s.distance;row.light.angle=s.angle*Math.PI/180;row.light.penumbra=s.softness;
  }
 }
 dispose(){for(const row of this.entries.values()){row.light.removeFromParent();row.target.removeFromParent();row.light.dispose();}this.entries.clear();}
}
