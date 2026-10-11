import type {ItemInstance} from '@genvr/contracts';
import {Box3,Color,Group,Mesh,MeshStandardMaterial,Vector3,type Material} from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {itemGeometry,type ItemModel} from './items.js';

/** A detached static assembly. Shared engine geometry/materials are never mutated or disposed. */
export function builderAssembly(instances:readonly ItemInstance[],model:(i:ItemInstance)=>ItemModel) {
  if(!instances.length||instances.length>100)throw new Error('Select between 1 and 100 item parts.');
  const root=new Group();
  const ownedGeometries:ReturnType<typeof itemGeometry>[]=[];
  const ownedMaterials:MeshStandardMaterial[]=[];
  try {
    for(const i of instances) {
      const shape=model(i);
      if(shape.animation||shape.sounds?.length||shape.meshes?.some(p=>p.setupInstance))throw new Error('Save static items here. Animated or procedural items need their original package.');
      if(!shape.parts.length&&!shape.meshes?.length)throw new Error('The selected model is not loaded yet.');
      const group=new Group();group.name=i.name??shape.name;
      group.position.fromArray(i.transform.position);group.quaternion.fromArray(i.transform.rotation);group.scale.fromArray(i.transform.scale);
      const tint=new Color(typeof i.params.color==='string'?i.params.color:0xffffff);
      const materialOf=(base?:Material)=>{
        const m=base as MeshStandardMaterial|undefined;
        if(m && !('color' in m))throw new Error('This shader cannot be saved as a static item.');
        const out=new MeshStandardMaterial({vertexColors:true,color:m?.color?.clone().multiply(tint)??tint,roughness:m?.roughness??0.85,metalness:m?.metalness??0,map:m?.map??null,normalMap:m?.normalMap??null,roughnessMap:m?.roughnessMap??null,metalnessMap:m?.metalnessMap??null,emissive:m?.emissive??0,emissiveMap:m?.emissiveMap??null,opacity:m?.opacity??1,transparent:m?.transparent??false,alphaTest:m?.alphaTest??0,side:m?.side??0});
        ownedMaterials.push(out);return out;
      };
      if(shape.meshes)for(const p of shape.meshes){const mesh=new Mesh(p.geometry,materialOf(p.material));mesh.applyMatrix4(p.matrix);group.add(mesh);}
      else {const geometry=itemGeometry(shape.parts);ownedGeometries.push(geometry);group.add(new Mesh(geometry,materialOf()));}
      root.add(group);
    }
    root.updateMatrixWorld(true);
    const bounds=new Box3().setFromObject(root);const center=bounds.getCenter(new Vector3());center.y=bounds.min.y;
    for(const child of root.children)child.position.sub(center);
    root.updateMatrixWorld(true);
    return {root,dispose:()=>{ownedGeometries.forEach(g=>g.dispose());ownedMaterials.forEach(m=>m.dispose());}};
  }catch(e){ownedGeometries.forEach(g=>g.dispose());ownedMaterials.forEach(m=>m.dispose());throw e;}
}
export async function exportBuilderSelection(instances:readonly ItemInstance[],model:(i:ItemInstance)=>ItemModel):Promise<ArrayBuffer> {
  const assembly=builderAssembly(instances,model);
  try {
    const result=await new GLTFExporter().parseAsync(assembly.root,{binary:true,onlyVisible:true});
    if(!(result instanceof ArrayBuffer))throw new Error('The item export failed.');
    if(result.byteLength>20*1024*1024)throw new Error('This item is too large to save.');
    return result;
  } finally {assembly.dispose();}
}
