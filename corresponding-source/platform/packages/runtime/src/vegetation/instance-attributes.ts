/** Per-batch source palm attributes; ordinary ItemsView matrices remain authoritative. */
import { BufferAttribute, DynamicDrawUsage, InstancedInterleavedBuffer, InterleavedBufferAttribute,
  Matrix4, Quaternion, Vector3, TSL, type BufferGeometry, type InstancedMesh } from 'three/webgpu';
export interface PalmInstanceDefinition { height:number; seed:number; lean:number; leanAngle:number }
const STRIDE = 25;

/** Requires an identity parent render group, matching ItemsView. Unsupported tilt/reflection/nonuniform
 * scaling selects the baked static pose in the shader; the user's transform is never discarded. */
export function bindPalmInstanceAttributes(mesh:InstancedMesh, source:BufferGeometry, definition:PalmInstanceDefinition) {
  if (!(definition.height>0) || !Object.values(definition).every(Number.isFinite)) throw new Error('Invalid palm instance definition');
  const original=mesh.geometry,position=source.getAttribute('position'),normal=source.getAttribute('normal');
  if(original.getAttribute('position').count!==position.count)throw new Error('Palm source and baked vertex counts differ');
  const geometry=original.clone(),data=new Float32Array(mesh.instanceMatrix.count*STRIDE);
  const buffer=new InstancedInterleavedBuffer(data,STRIDE).setUsage(DynamicDrawUsage);
  const attribute=(name:string,size:number,offset:number)=>geometry.setAttribute(name,new InterleavedBufferAttribute(buffer,size,offset));
  attribute('iPos',4,0);attribute('iDat',4,4);
  for(let j=0;j<4;j++)attribute(`twPalmMatrix${j}`,4,8+j*4);
  attribute('twPalmEnabled',1,24);
  for(const [name,sourceAttribute] of [['twPalmSourcePosition',position],['twPalmSourceNormal',normal]] as const){
    const values=new Float32Array(position.count*3);
    for(let n=0;n<position.count;n++)values.set([sourceAttribute.getX(n),sourceAttribute.getY(n),sourceAttribute.getZ(n)],n*3);
    geometry.setAttribute(name,new BufferAttribute(values,3));
  }
  mesh.geometry=geometry;
  const oldCulling=mesh.frustumCulled;mesh.frustumCulled=false;
  const matrix=new Matrix4(),translation=new Vector3(),rotation=new Quaternion(),scale=new Vector3();
  let version=-1,count=-1,disposed=false;
  const update=()=>{
    if(disposed||version===mesh.instanceMatrix.version&&count===mesh.count)return false;
    if(!Number.isInteger(mesh.count)||mesh.count<0||mesh.count>mesh.instanceMatrix.count)throw new Error('Palm instance count exceeds capacity');
    for(let n=0;n<mesh.count;n++){
      mesh.getMatrixAt(n,matrix);
      if (!matrix.elements.every(Number.isFinite)) throw new Error('Palm instance matrix must be finite');
      matrix.decompose(translation,rotation,scale);
      const e=matrix.elements,o=n*STRIDE;
      const upright=Math.abs(rotation.x)<1e-5&&Math.abs(rotation.z)<1e-5;
      const uniform=scale.x>1e-6&&Math.abs(scale.x-scale.y)<1e-5&&Math.abs(scale.x-scale.z)<1e-5;
      const enabled=upright&&uniform&&e.every(Number.isFinite);
      const yaw=Number.isFinite(rotation.y)&&Number.isFinite(rotation.w)?2*Math.atan2(rotation.y,rotation.w):0;
      data.set([translation.x,translation.y,translation.z,Math.max(Math.abs(scale.x),1e-6),
        // Source lean angle is atan2(z,x); positive Three Y rotation turns +X toward -Z.
        definition.leanAngle-yaw,definition.lean,definition.height*Math.max(Math.abs(scale.y),1e-6),definition.seed],o);
      data.set(e,o+8);data[o+24]=enabled?1:0;
    }
    buffer.clearUpdateRanges();buffer.addUpdateRange(0,mesh.count*STRIDE);buffer.needsUpdate=true;
    version=mesh.instanceMatrix.version;count=mesh.count;return true;
  };
  const beforeRender=mesh.onBeforeRender,beforeShadow=mesh.onBeforeShadow;
  const render:typeof mesh.onBeforeRender=function(this:InstancedMesh,...args){update();beforeRender.apply(this,args);};
  const shadow:typeof mesh.onBeforeShadow=function(this:InstancedMesh,...args){update();beforeShadow.apply(this,args);};
  mesh.onBeforeRender=render;mesh.onBeforeShadow=shadow;
  return {data,buffer,update,dispose:()=>{
    if(disposed)return;disposed=true;
    if(mesh.onBeforeRender===render)mesh.onBeforeRender=beforeRender;
    if(mesh.onBeforeShadow===shadow)mesh.onBeforeShadow=beforeShadow;
    if(mesh.geometry===geometry){mesh.geometry=original;mesh.frustumCulled=oldCulling;}
    geometry.dispose();
  }};
}

/* eslint-disable @typescript-eslint/no-explicit-any -- native TSL graph boundary */
/** World-space source position/normal from the original vertex and the existing instance matrix. */
export function palmInstanceNodes():{position:any;normal:any;enabled:any;trunkDirection:any} {
  const t=TSL as any,m=t.mat4(...[0,1,2,3].map(i=>t.attribute(`twPalmMatrix${i}`,'vec4')));
  const p=m.mul(t.vec4(t.attribute('twPalmSourcePosition','vec3'),1)).xyz;
  const a=m.element(0).xyz,b=m.element(1).xyz,c=m.element(2).xyz;
  const scale=t.vec3(t.dot(a,a),t.dot(b,b),t.dot(c,c)).max(1e-12);
  // Match Three's normalized instance normal before the deformation graph. Missing this
  // normalization changes wind-bent leaf lighting when an item is uniformly scaled.
  const n=t.mat3(a,b,c).mul(t.attribute('twPalmSourceNormal','vec3').div(scale)).normalize();
  return {position:p,normal:n,enabled:t.attribute('twPalmEnabled','float').greaterThan(.5),trunkDirection:b.normalize()};
}
