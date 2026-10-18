
'use client';
import { useEffect,useState } from 'react';
import { Lightbulb,Plus,Trash2 } from 'lucide-react';
import { SceneLight, type SceneLight as Light } from '@genvr/contracts';
import type { StudioFilming } from '../../lib/use-studio-filming';
const button='inline-flex items-center gap-1 rounded border border-ink/15 px-2 py-1.5 text-xs hover:bg-ink/10 disabled:opacity-40';
export function LightingPanel({filming}:{filming:StudioFilming}){
 const [lights,setLights]=useState<Light[]>(()=>filming.sceneLights());
 useEffect(()=>{const timer=setInterval(()=>setLights(old=>{const next=filming.sceneLights();return JSON.stringify(old)===JSON.stringify(next)?old:next;}),400);return()=>clearInterval(timer);},[filming.sceneLights]);
 const save=(next:Light[])=>{try{filming.setSceneLights(next);setLights(next);}catch(e){filming.studio.setMessage(e instanceof Error?e.message:'Lighting failed.');}};
 return <section aria-label="Scene lighting" className="space-y-2 rounded-lg border border-ink/15 p-3 text-ink"><h3 className="flex items-center gap-2 text-xs font-semibold"><Lightbulb className="size-4"/>Lighting</h3><p className="text-[10px] text-ink/60">Shared by Build and Filming. Actor lights follow the character. Record a new take to capture changed lighting.</p>
 <button className={button} disabled={lights.length>=4||filming.busy} onClick={()=>save([...lights,SceneLight.parse({id:crypto.randomUUID(),name:`Character light ${lights.length+1}`})])}><Plus className="size-3"/>Add spotlight</button>
 {!lights.length?<p className="text-xs text-ink/50">Add a key light for the face, then a softer fill or back light.</p>:null}
 {lights.map(light=><LightEditor key={light.id+JSON.stringify(light)} light={light} filming={filming} save={value=>save(lights.map(l=>l.id===value.id?value:l))} remove={()=>save(lights.filter(l=>l.id!==light.id))}/>)}
 </section>;
}
function LightEditor({light,filming,save,remove}:{light:Light;filming:StudioFilming;save:(l:Light)=>void;remove:()=>void}){
 const[d,set]=useState(light),change=(patch:Partial<Light>)=>set(old=>({...old,...patch}));
 const num=(label:string,value:number,update:(n:number)=>void,min:number,max:number)=><label className="flex items-center justify-between gap-2 text-xs">{label}<input aria-label={`${label} · ${light.id}`} className="w-20 rounded border border-ink/15 bg-paper p-1" type="number" min={min} max={max} step={.1} value={value} onChange={e=>update(Number(e.target.value))}/></label>;
 return <fieldset disabled={filming.busy||filming.studio.rendering} className="space-y-2 border-t border-ink/15 pt-2"><div className="flex items-center justify-between"><label className="text-xs"><input type="checkbox" checked={d.enabled} onChange={e=>{change({enabled:e.target.checked});save({...d,enabled:e.target.checked});}}/> {d.name}</label><button aria-label={`Remove light · ${light.id}`} className={button} onClick={remove}><Trash2 className="size-3"/></button></div>
 <label className="block text-xs">Target<select aria-label={`Light target · ${light.id}`} className="w-full rounded border border-ink/15 bg-paper p-1" value={d.actor??''} onChange={e=>change({actor:e.target.value||null})}><option value="">World position</option>{filming.actors().filter(a=>a.id!=='scene').map(a=><option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
 <label className="flex items-center justify-between text-xs">Colour<input aria-label={`Light colour · ${light.id}`} type="color" value={d.color} onChange={e=>change({color:e.target.value})}/></label>
 {num('Intensity',d.intensity,n=>change({intensity:n}),0,200)}{num('Beam angle',d.angle,n=>change({angle:n}),5,85)}{num('Soft edge',d.softness,n=>change({softness:n}),0,1)}{num('Range',d.distance,n=>change({distance:n}),1,200)}
 <p className="text-[10px] text-ink/55">Position and aim are offsets from the actor’s feet, or absolute world metres.</p>
 {(['position','target'] as const).map(key=><div key={key} className="space-y-1">{d[key].map((v,i)=>num(`${key==='position'?'Light':'Aim'} ${'XYZ'[i]}`,v,n=>{const p=[...d[key]] as [number,number,number];p[i]=n;change({[key]:p});},-60000,60000))}</div>)}
 <button className={button} onClick={()=>{const parsed=SceneLight.safeParse(d);if(parsed.success)save(parsed.data);else filming.studio.setMessage('Check light values before applying.');}}>Apply lighting</button>
 </fieldset>;
}
