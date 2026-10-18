import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Monitor, X, Share2, Users, Mic, Activity, Smile, Sparkles, Bell, PanelsTopLeft, LayoutTemplate, AppWindow, RectangleHorizontal, Circle, Watch } from 'lucide-react';
import { type CharacterRecipe } from '@genvr/contracts';
import type { CharacterStage } from '@genvr/runtime/character';
import { AvatarPresentation } from '../../src/avatar-presentation';
import { AVATAR_LIVE_LAYOUTS, avatarLiveEmbed } from '../../src/avatar-live-embed';
import { PresentationViewport } from './viewport';
import { PresentationControls } from './controls';
import { WorldBackground } from './world-background';
import type { StudioStorage, StudioProject } from '../../src/studio-project';
import { createLiveRoom, disposeLiveRoom } from './rooms';
export { AVATAR_LIVE_LAYOUTS, avatarLiveEmbed } from '../../src/avatar-live-embed';
const backgrounds = [['world','My worlds'],['color','Color'],['transparent','Transparent'],['office','Office'],['living_room','Living Room'],['conference','Conference Room'],['stage','Stage'],['studio','Studio'],['classroom','Classroom'],['image','Image / GIF'],['video','Video']] as const;
const tools = [{id:'display',label:'Display',Icon:Monitor},{id:'characters',label:'Character',Icon:Users},{id:'voice',label:'Voice',Icon:Mic},{id:'motions',label:'Motions',Icon:Activity},{id:'expressions',label:'Expressions',Icon:Smile},{id:'effects',label:'Effects',Icon:Sparkles},{id:'notifications',label:'Notifications',Icon:Bell},{id:'cards',label:'UI cards',Icon:PanelsTopLeft}];
const layoutIcons=[Monitor,AppWindow,PanelsTopLeft,LayoutTemplate,RectangleHorizontal,Circle,Watch];
const input = 'w-full rounded-lg border border-ink/20 bg-paper p-2 text-xs';
export function AvatarLive({ controller, recipe, onStage, projectId, characters, voice, embedded = false, onShare, playerHost, worldViewport, worldStorage, currentProject, onWorldRendered }: {
  controller: AvatarPresentation; recipe: CharacterRecipe; onStage: (stage: CharacterStage | null) => void; projectId: string;
  onWorldRendered?:(canvas:HTMLCanvasElement)=>void; worldStorage?: StudioStorage; currentProject?: ()=>StudioProject;
  characters?: ReactNode; voice?: ReactNode; embedded?: boolean; onShare?: () => void; playerHost?: (element:HTMLDivElement|null)=>void; worldViewport?: HTMLElement|null;
}) {
  const { display } = useSyncExternalStore(controller.subscribe, controller.snapshot);
  const dialog=useRef<HTMLElement>(null);
  const worldBackground=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(display.background!=='world'||display.worldId||!worldViewport||!worldBackground.current)return;const parent=worldViewport.parentNode,next=worldViewport.nextSibling;worldBackground.current.appendChild(worldViewport);return()=>{if(parent)parent.insertBefore(worldViewport,next?.parentNode===parent?next:null);};},[display.background,display.worldId,worldViewport]);
  const container = useRef<HTMLDivElement>(null), stage = useRef<CharacterStage | null>(null);
  const [faceSupported,setFaceSupported]=useState<boolean|null>(null);
  const [ready,setReady]=useState(false), [error,setError]=useState(''), [section,setSection]=useState('display'),[search,setSearch]=useState('');
  const [mediaUrl,setMediaUrl]=useState('');
  const [exploring,setExploring]=useState(false);
  const [worldControls,setWorldControls]=useState<HTMLDivElement|null>(null);
  const current = useRef({ recipe, onStage, framing:display.framing, round:display.layout==='circle'||display.layout==='watch' }); current.current={recipe,onStage,framing:display.framing,round:display.layout==='circle'||display.layout==='watch'};
  const change = (patch: Record<string,unknown>) => setError(controller.execute({kind:'display',...patch})??'');
  const preset=AVATAR_LIVE_LAYOUTS.find(row=>row.id===display.layout)!;
  const round=display.layout==='circle'||display.layout==='watch';
  useEffect(()=>{
    let cancelled=false, made:CharacterStage|null=null, stop=()=>{};
    if(!display.open)return;
    setReady(false);
    void import('@genvr/runtime/character').then(async({createCharacterStage})=>{
      if(cancelled||!container.current)return;
      made=await createCharacterStage({container:container.current,recipe:current.current.recipe,viewCube:false,forceWebGL:embedded});
      if(cancelled){made.dispose();return;}
      stage.current=made; made.setGrid(false); made.lookFrom('front'); made.frameAvatar(display.framing,round?.5:.28); current.current.onStage(made);setFaceSupported(made.info.expressionSupported); let signature='';stop=made.onChange(info=>{setFaceSupported(info.expressionSupported);const next=`${info.body}:${info.ready}:${info.height}`;if(next!==signature){signature=next;made?.frameAvatar(current.current.framing,current.current.round?.5:.28);}}); setReady(true);
    }).catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:'Avatar could not load.');});
    return()=>{cancelled=true;stop();current.current.onStage(null);stage.current=null;made?.dispose();};
  },[display.open]);
  useEffect(()=>{if(ready){stage.current?.setRecipe(recipe);stage.current?.frameAvatar(display.framing,round?.5:.28);}},[recipe,ready]);
  useEffect(()=>{stage.current?.frameAvatar(display.framing,round?.5:.28);},[display.framing,display.layout,ready]);
  useEffect(()=>{
    if(!ready)return;
    const room=createLiveRoom(display.background);stage.current?.setEnvironment(room);
    return()=>{stage.current?.setEnvironment(null);disposeLiveRoom(room);};
  },[display.background,ready]);
  useEffect(()=>{
    if(!display.open||embedded)return;
    const previous=document.activeElement as HTMLElement|null;dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')change({open:false});if(e.key==='Tab'){const nodes=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,textarea,a[href]')??[]);const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};
    window.addEventListener('keydown',escape);return()=>{window.removeEventListener('keydown',escape);if(previous?.isConnected)previous.focus();};
  },[display.open,embedded]);
  if(!display.open)return null;
  const style={background: display.background==='transparent'?'transparent':display.color};
  const frame=<div data-avatar-live-frame data-layout={display.layout} className="relative flex shrink-0 overflow-hidden" style={{...style,width:'100%',maxWidth:preset.width,height:embedded?'100%':`min(${preset.height}px,65vh)`,minHeight:180}}>
    {display.background==='world'?<><div ref={worldBackground} className="absolute inset-0" aria-label="Current world background"/>{worldStorage&&currentProject?<WorldBackground storage={worldStorage} current={currentProject} display={display} change={change} embedded={embedded} onExploring={setExploring} onRendered={onWorldRendered} controlsHost={worldControls}/>:null}</>:null}
    {display.media&&display.background==='image'?<img alt="Avatar background" src={display.media} className="absolute inset-0 h-full w-full object-cover"/>:null}
    {display.media&&display.background==='video'?<video key={display.media} src={display.media} muted autoPlay loop playsInline className="absolute inset-0 h-full w-full object-cover"/>:null}
    <div className="relative flex h-full items-center justify-center" style={{width:round?'55%':'100%',minWidth:0,pointerEvents:exploring?'none':undefined,visibility:exploring?'hidden':undefined}}>
      <div ref={container} aria-label="Live avatar viewport" className="relative overflow-hidden" style={{height:round?'auto':'100%',maxHeight:'100%',width:'100%',maxWidth:round?210:undefined,aspectRatio:round?'1':undefined,borderRadius:round?'50%':undefined,background:round?'radial-gradient(ellipse at 50% 30%, #1e293b, #0c1120)':undefined,border:round?'2px solid #6366f166':undefined}}/>
      {!ready?<span role="status" className="absolute text-xs text-white">Loading avatar…</span>:null}
    </div>
    <div className="absolute right-0 top-0 h-full min-w-0" style={{width:'45%'}} aria-label="Live notifications"><PresentationViewport controller={controller} compact/></div>
  </div>;
  return <section ref={dialog} role={embedded?'region':'dialog'} aria-modal={embedded?undefined:true} aria-label="Avatar Live" className={embedded?'relative min-h-0 flex-1 h-full w-full':'fixed inset-0 z-[100] flex flex-col bg-paper text-ink'}>
    <style>{`[data-avatar-live-frame] [aria-label="View directions"]{display:none}`}</style>
    {!embedded?<header className="flex h-12 shrink-0 items-center gap-2 border-b border-ink/15 bg-surface px-3"><Monitor className="size-4"/><strong className="flex-1 text-sm">Avatar Live</strong><span className="mr-3 text-xs text-ink/60">{preset.name}</span>{onShare?<button onClick={onShare} className="mr-2 inline-flex items-center gap-2 rounded-lg border border-ink/15 px-3 py-1.5 text-xs font-bold"><Share2 className="size-3.5"/>Share</button>:null}<button aria-label="Close Avatar Live" onClick={()=>change({open:false})} className="rounded p-2"><X className="size-4"/></button></header>:null}
    <div className={embedded?'h-full w-full':'flex min-h-0 flex-1 flex-col md:flex-row'}>
      {!embedded?<aside className="w-full shrink-0 overflow-auto border-r border-ink/15 p-3 md:w-72"><nav aria-label="Avatar Live tools" className="sticky top-0 z-10 mb-4 grid bg-paper pb-2 grid-cols-2 gap-1">{tools.map(({id,label,Icon})=><button key={id} onClick={()=>setSection(id)} aria-pressed={section===id} className={`flex items-center gap-2 rounded-lg px-2 py-2.5 text-xs font-bold ${section===id?'bg-ink text-on-brand':'hover:bg-ink/5'}`}><Icon className="size-4 shrink-0"/>{label}</button>)}</nav>
        {section==='display'?<div className="space-y-3"><fieldset><legend className="mb-2 text-xs font-bold">Display layout</legend><div className="grid grid-cols-2 gap-2">{AVATAR_LIVE_LAYOUTS.map((row,index)=>{const Icon=layoutIcons[index]!;return <button key={row.id} aria-label={`Layout ${row.name}`} aria-pressed={display.layout===row.id} className={`flex min-h-16 flex-col items-start justify-center gap-2 rounded-lg border px-3 py-2 text-left text-xs ${display.layout===row.id?'border-ink bg-ink/5 font-bold':'border-ink/15 hover:bg-ink/5'}`} onClick={()=>change({layout:row.id,framing:['circle','watch','banner'].includes(row.id)?'bust':'full'})}><Icon className="size-5"/>{row.name}</button>})}</div></fieldset><label className="block text-xs font-bold">Background<select aria-label="Avatar Live background" className={input} value={display.background} onChange={e=>{if(['image','video'].includes(e.target.value)&&!display.media){setMediaUrl('');setSection('media');}else change({background:e.target.value});}}>{backgrounds.map(([id,label])=><option key={id} value={id} disabled={id==='world'&&!worldViewport&&!worldStorage}>{label}</option>)}</select></label>{display.background==='world'?<div ref={setWorldControls}/>:null}<label className="block text-xs font-bold">Background color<input aria-label="Avatar Live color" type="color" value={display.color} onChange={e=>change({color:e.target.value})}/></label><label className="block text-xs font-bold">Camera framing<select aria-label="Avatar Live framing" className={input} value={display.framing} onChange={e=>change({framing:e.target.value})}><option value="full">Full body</option><option value="bust">Upper body</option><option value="face">Face</option></select></label><p className="text-xs text-ink/60">{display.background==='world'?'Your Build world is live behind the avatar. ':''}Drag to orbit. Scroll to zoom. Notifications have their own space on the right.</p></div>:null}
        {section==='media'?<div className="space-y-2"><label className="block text-xs font-bold">Upload background<input aria-label="Upload live background" type="file" accept="image/*,video/*" className={`${input} mt-2`} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;if(file.size>20*1024*1024){setError('Choose media smaller than 20 MB.');return;}if(!/^(image|video)\//.test(file.type)){setError('Choose an image or video.');return;}const media=controller.localMedia(file);change({background:file.type.startsWith('video/')?'video':'image',media});setSection('display');}}/></label><label className="text-xs">Image, GIF or video URL<input className={input} aria-label="Avatar Live media URL" value={mediaUrl} onChange={e=>setMediaUrl(e.target.value)}/></label>{['image','video'].map(background=><button key={background} className={input} onClick={()=>{const result=controller.execute({kind:'display',background,media:mediaUrl});setError(result??'');if(!result)setSection('display');}}>Use {background}</button>)}<p className="text-xs">Use a hosted media URL for sharing.</p></div>:null}
        {section==='characters'?characters:null}{section==='voice'?<>{voice}{faceSupported===false?<p className="mt-3 text-xs text-ink/60">This avatar has no facial rig. Audio plays, but its mouth cannot animate.</p>:null}</>:null}{section==='expressions'&&faceSupported===false?<p role="status" className="mb-3 text-xs text-ink/60">This avatar has no facial controls. Choose a compatible character such as Standard robot to preview expressions.</p>:null}
        {['motions','expressions','effects','notifications','cards'].includes(section)?<><input aria-label="Search live controls" className={`${input} mb-3`} placeholder="Search" value={search} onChange={e=>setSearch(e.target.value)}/><PresentationControls controller={controller} section={section as 'motions'} agents={[]} search={search} includeAvailableMotions/></>:null}

      </aside>:null}
      <div className={embedded?'h-full w-full':'flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-auto bg-ink/5 p-4'}>{frame}</div>
    </div><div ref={playerHost} className="shrink-0 border-t border-ink/10 bg-surface p-3 empty:hidden"/>{error?<p role="alert" className="bg-coral px-3 py-2 text-xs text-white">{error}</p>:null}
  </section>;
}
