import { WorldDocument, type ItemInstance } from '@genvr/contracts';
import { beforeAll, describe, expect, it } from 'vitest';
import { BoxGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, Ray, Vector3 } from 'three/webgpu';
import { ItemsView, resolveItem, type ItemModel } from '../src/items.js';
import { initPhysics, PhysicsWorld } from '../src/physics.js';

beforeAll(initPhysics);
const place = (id: string, x = 0): ItemInstance => ({instanceId:id,itemId:'test.plant',
  transform:{position:[x,0,0],rotation:[0,0,0,1],scale:[1,1,1]},params:{}});
const doc = (instances: ItemInstance[]) => WorldDocument.parse({schemaVersion:1,experienceId:'test',version:0,
  style:{base:'realistic'},sizeTier:'small',access:{mode:'private'},environment:{sky:{preset:'day'},weather:{preset:'clear'}},
  terrain:{},spawn:{position:[0,1,0]},instances});

function fixture(lod = false) {
  const geometry = new BoxGeometry(1,1,1), material = new MeshStandardMaterial();
  const prepared: InstancedMesh[] = [], cleaned: InstancedMesh[] = [];
  let sharedDisposals = 0;
  geometry.addEventListener('dispose',()=>{sharedDisposals++;});
  const part = {geometry,material,matrix:new Matrix4(),setupInstance:(mesh:InstancedMesh)=>{
    prepared.push(mesh);
    const ownedGeometry=geometry.clone(),ownedMaterial=material.clone();
    mesh.geometry=ownedGeometry;mesh.material=ownedMaterial;
    return ()=>{cleaned.push(mesh);ownedGeometry.dispose();ownedMaterial.dispose();};
  }};
  const model:ItemModel={...resolveItem('test.plant'),bounds:{min:[-.5,0,-.5],max:[.5,1,.5]},meshes:[part],...(lod?{lods:[[part]]}:{})};
  const physics=new PhysicsWorld(),view=new ItemsView(physics,()=>model);
  return {geometry,material,prepared,cleaned,model,physics,view,sharedDisposals:()=>sharedDisposals,
    dispose:()=>{view.dispose();physics.dispose();geometry.dispose();material.dispose();}};
}
describe('per-world instance binding lifecycle',()=>{
  it('binds each batch/LOD once while preserving normal matrices, instance IDs, picking and static preview',()=>{
    const f=fixture(true),world=doc([place('near'),place('far',100)]);
    f.view.sync(world);f.view.sync(world);
    expect(f.prepared).toHaveLength(2);
    f.view.updateLod(new Vector3(0,2,0));
    expect(f.prepared.map(m=>m.count)).toEqual([1,1]);
    expect(f.prepared.map(m=>f.view.instanceIdAt(m,0))).toEqual(['near','far']);
    const matrix=new Matrix4();f.prepared[1]!.getMatrixAt(0,matrix);
    expect(new Vector3().setFromMatrixPosition(matrix).x).toBe(100);
    expect(f.view.pick(new Ray(new Vector3(0,.5,5),new Vector3(0,0,-1)))).toBe('near');
    const preview=f.view.previewMesh('test.plant',f.material);preview.geometry.computeBoundingBox();
    expect(preview.geometry.boundingBox!.getSize(new Vector3()).x).toBe(1);
    expect(f.prepared).toHaveLength(2);preview.geometry.dispose();
    f.view.sync(doc([]));expect(f.cleaned).toHaveLength(2);expect(f.sharedDisposals()).toBe(0);
    f.prepared[0]!.dispose();expect(f.cleaned).toHaveLength(2);
    f.dispose();
  });
  it('cleans old bindings on capacity replacement and final view disposal exactly once',()=>{
    const f=fixture();f.view.sync(doc([place('one')]));const old=f.prepared[0]!;
    f.view.sync(doc(Array.from({length:9},(_,i)=>place('item'+i,i))));
    expect(f.prepared).toHaveLength(2);expect(f.cleaned).toEqual([old]);
    f.view.dispose();expect(f.cleaned).toHaveLength(2);expect(f.sharedDisposals()).toBe(0);
    f.dispose();expect(f.cleaned).toHaveLength(2);
  });
  it('keeps owned bindings isolated across two simultaneous world views',()=>{
    const a=fixture(),b=fixture();a.view.sync(doc([place('a')]));b.view.sync(doc([place('b')]));
    expect(a.prepared[0]!.material).not.toBe(b.prepared[0]!.material);
    expect(a.prepared[0]!.geometry).not.toBe(a.geometry);
    a.view.dispose();expect(b.cleaned).toHaveLength(0);
    expect(b.view.instanceIdAt(b.prepared[0]!,0)).toBe('b');a.dispose();b.dispose();
  });
});
