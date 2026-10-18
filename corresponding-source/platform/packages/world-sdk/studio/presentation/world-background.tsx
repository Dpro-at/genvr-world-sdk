import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {createRuntime,type GenvrRuntime} from '@genvr/runtime';
import type {AvatarLiveDisplay} from '@genvr/assistant';
import type {StudioProject,StudioStorage} from '../../src/studio-project';
type Spot=NonNullable<AvatarLiveDisplay['worldSpot']>;
/** Disposable preview: walking never modifies the source project. */
export function WorldBackground({storage,current,display,change,embedded,onExploring,onRendered,controlsHost}:{storage:StudioStorage;current:()=>StudioProject;display:AvatarLiveDisplay;change:(patch:Record<string,unknown>)=>void;embedded:boolean;onExploring:(on:boolean)=>void;onRendered?:(canvas:HTMLCanvasElement)=>void;controlsHost:HTMLElement|null}){
 const pendingExplore=useRef(false),beforeExploring=useRef<Spot|null>(null);
 const container=useRef<HTMLDivElement>(null),runtime=useRef<GenvrRuntime|null>(null),latest=useRef<Spot|null>(null),state=useRef({exploring:false,spot:display.worldSpot,onRendered});
 const [worlds,setWorlds]=useState<Array<{id:string;title:string}>>([]),[exploring,setExploring]=useState(false),[ready,setReady]=useState(false),[error,setError]=useState('');
 state.current={exploring,spot:display.worldSpot,onRendered};
 useEffect(()=>{let active=true;storage.list().then(rows=>{if(active)setWorlds(rows);}).catch(()=>{if(active)setError('Could not list your worlds.');});return()=>{active=false;};},[storage]);
 useEffect(()=>{onExploring(exploring);runtime.current?.setControlsEnabled(exploring);runtime.current?.setPresentationBackdrop(true,exploring);return()=>onExploring(false);},[exploring]);
 useEffect(()=>{
  if(!display.worldId)return;
  const abort=new AbortController();let view:GenvrRuntime|null=null;setReady(false);setError('');setExploring(false);
  const source=display.worldId===current().id?Promise.resolve(structuredClone(current())):storage.read(display.worldId);
  source.then(project=>createRuntime({container:container.current!,world:structuredClone(project.world),terrainChunks:project.terrainChunks,editable:false,forceWebGL:true,loadSignal:abort.signal,
   fetchPackage:async id=>{const asset=project.assets.find(a=>a.id===id);if(!asset)throw new Error('This world requires an unavailable local asset.');return{id,manifest:asset.manifest,files:asset.files.map(f=>({path:f.path,contentType:f.contentType,size:atob(f.data).length,url:`data:${f.contentType};base64,${f.data}`}))};},
   onRendered:()=>{const canvas=container.current?.querySelector('canvas');if(canvas)state.current.onRendered?.(canvas);},
   onFilmFrame:(camera,_dt,player)=>{
    const saved=state.current.spot;
    if(!state.current.exploring&&saved){camera.position.set(saved.position.x,saved.position.y,saved.position.z);camera.lookAt(saved.target.x,saved.target.y,saved.target.z);}
    const target=camera.position.clone().add(camera.getWorldDirection(camera.position.clone()).multiplyScalar(10));
    latest.current={position:{x:camera.position.x,y:camera.position.y,z:camera.position.z},target:{x:target.x,y:target.y,z:target.z},player:{...player}};
   }
  })).then(result=>{if(abort.signal.aborted){result.dispose();return;}view=result;runtime.current=result;result.setSimulating(false);result.setControlsEnabled(false);result.setPresentationBackdrop(true);if(state.current.spot)result.teleportPlayer(state.current.spot.player);setReady(true);if(pendingExplore.current){pendingExplore.current=false;setExploring(true);container.current?.focus();}}).catch(e=>{if(!abort.signal.aborted)setError(e instanceof Error?e.message:'World could not load.');});
  return()=>{abort.abort();view?.dispose();runtime.current=null;};
 },[display.worldId,storage]);
 return <div className="absolute inset-0" data-live-world-preview>
  {display.worldId?<div ref={container} className="absolute inset-0" tabIndex={0} aria-label="Explore background world"/>:null}
  {!embedded&&controlsHost?createPortal(<div className="flex flex-wrap items-center gap-2 rounded-lg border border-ink/15 p-2 text-xs text-ink">
   <label className="flex items-center gap-2">My worlds<select aria-label="Avatar background world" className="max-w-52 rounded border border-ink/20 bg-paper p-2" value={display.worldId??''} onChange={e=>change({worldId:e.target.value||null,worldSpot:null})}><option value="">Current world · live view</option>{worlds.map(w=><option key={w.id} value={w.id}>{w.title}</option>)}</select></label>
   {!exploring?<button className="rounded bg-ink px-3 py-2 font-bold text-on-brand" disabled={!!display.worldId&&!ready} onClick={()=>{if(!display.worldId){pendingExplore.current=true;change({worldId:current().id,worldSpot:null});return;}beforeExploring.current=latest.current;setExploring(true);container.current?.focus();}}>Choose a spot</button>:<><span>WASD / arrows: walk · drag: look · scroll: zoom</span><button className="rounded bg-ink px-3 py-2 font-bold text-on-brand" onClick={()=>{if(latest.current)change({worldSpot:latest.current});setExploring(false);}}>Use this spot</button><button className="rounded border border-ink/20 px-3 py-2" onClick={()=>{const previous=display.worldSpot??beforeExploring.current;if(previous){runtime.current?.teleportPlayer(previous.player);change({worldSpot:previous});}setExploring(false);}}>Cancel</button></>}
   {display.worldId&&!ready?<span role="status">Loading world…</span>:null}{display.worldSpot&&!exploring?<span>Saved viewpoint</span>:null}{error?<span role="alert">{error}</span>:null}
  </div>,controlsHost):null}
 </div>;
}
