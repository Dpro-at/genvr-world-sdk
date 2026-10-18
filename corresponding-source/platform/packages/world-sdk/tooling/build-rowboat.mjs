import * as T from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { writeFile } from 'node:fs/promises';
class FileReader { readAsArrayBuffer(blob) { blob.arrayBuffer().then(data=>{this.result=data;this.onloadend?.();}); } readAsDataURL(blob){blob.arrayBuffer().then(data=>{this.result='data:'+blob.type+';base64,'+Buffer.from(data).toString('base64');this.onloadend?.();});} }
globalThis.FileReader=FileReader;
const scene=new T.Group();scene.name='Wooden rowboat';
const wood=new T.MeshStandardMaterial({color:0x825137,roughness:.82,metalness:0}),dark=new T.MeshStandardMaterial({color:0x42291f,roughness:.9}),trim=new T.MeshStandardMaterial({color:0xb18a60,roughness:.7});
const outline=[[-.56,-1.8],[-.79,-1.05],[-.82,0],[-.65,1.25],[0,2.1],[.65,1.25],[.82,0],[.79,-1.05],[.56,-1.8]];
const pos=[],idx=[];const n=outline.length;
for(const [scale,y] of [[1,.68],[.52,.12],[.9,.65],[.47,.23]])for(const [x,z]of outline)pos.push(x*scale,y,z*(scale<.6?.83:.99));
for(let i=0;i<n;i++){let j=(i+1)%n;for(const [a,b]of[[0,n],[n*2,n*3],[0,n*2],[n,n*3]]){idx.push(a+i,a+j,b+j,a+i,b+j,b+i);}}
const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(pos,3));geometry.setIndex(idx);geometry.computeVertexNormals();const hull=new T.Mesh(geometry,wood);hull.material.side=T.DoubleSide;scene.add(hull);
function box(size,p,mat=wood){const m=new T.Mesh(new T.BoxGeometry(...size),mat);m.position.set(...p);scene.add(m);return m;}
for(let i=0;i<7;i++)box([.105,.06,2.55],[(i-3)*.112,.24,-.05],i%2?wood:trim);
for(const z of[-.85,.55])box([1.32,.1,.3],[0,.59,z],trim);
box([1.08,.1,.25],[0,.6,-1.6],trim);
for(let i=0;i<n;i++){const j=(i+1)%n,a=new T.Vector3(outline[i][0],.7,outline[i][1]),b=new T.Vector3(outline[j][0],.7,outline[j][1]);const edge=new T.Mesh(new T.CylinderGeometry(.045,.045,a.distanceTo(b),8),dark);edge.position.copy(a.clone().add(b).multiplyScalar(.5));edge.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),b.sub(a).normalize());scene.add(edge);}
for(const side of[-1,1]){const oar=new T.Group(),shaft=new T.Mesh(new T.CylinderGeometry(.027,.027,2.55,8),trim);shaft.rotation.z=Math.PI/2;oar.add(shaft);const blade=new T.Mesh(new T.BoxGeometry(.55,.045,.17),wood);blade.position.x=1.3;oar.add(blade);oar.rotation.y=side*.55;oar.position.set(side*.22,.78,side*.35);scene.add(oar);}
scene.position.y = -.12; scene.updateMatrixWorld(true);const glb=await new GLTFExporter().parseAsync(scene,{binary:true});await writeFile(new URL('../../../apps/web/public/models/realistic/rowboat/lod0.glb', import.meta.url),Buffer.from(glb));console.log('rowboat',glb.byteLength,new T.Box3().setFromObject(scene));
