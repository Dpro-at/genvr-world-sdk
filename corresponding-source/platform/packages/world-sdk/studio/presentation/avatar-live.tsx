import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Monitor, X, Share2, Settings, Maximize2, Minimize2, User, Mic, Image, Globe, ShieldCheck, Bell, MapPin, MessageSquare, Activity } from 'lucide-react';
import { type CharacterRecipe } from '@genvr/contracts';
import type { CharacterStage } from '@genvr/runtime/character';
import { AvatarPresentation } from '../../src/avatar-presentation';
import { AVATAR_LIVE_LAYOUTS } from '../../src/avatar-live-embed';
import { PresentationViewport } from './viewport';
import { WorldBackground } from './world-background';
import type { StudioStorage, StudioProject } from '../../src/studio-project';
import { createLiveRoom, disposeLiveRoom } from './rooms';
export { AVATAR_LIVE_LAYOUTS, avatarLiveEmbed } from '../../src/avatar-live-embed';

/** How the page shows the agent. Each view uses one of the stable display layouts. */
const VIEWS = [
  { id: 'chat', label: 'Chat + avatar', hint: 'Face and messages', layout: 'desktop' },
  { id: 'call', label: 'Video call', hint: 'Face and microphone only', layout: 'large' },
  { id: 'compact', label: 'Compact', hint: 'Small face, messages below', layout: 'compact' },
  { id: 'watch', label: 'Watch', hint: 'Small circle, voice only', layout: 'watch' },
] as const;
type ViewId = typeof VIEWS[number]['id'];
const viewOf = (layout: string): ViewId => layout === 'large' ? 'call' : layout === 'compact' ? 'compact' : layout === 'watch' || layout === 'circle' ? 'watch' : 'chat';
const SIZES = [{ id: 's', label: 'Small', scale: .75 }, { id: 'm', label: 'Medium', scale: 1 }, { id: 'l', label: 'Large', scale: 1.25 }] as const;
const FRAMINGS = [{ id: 'full', label: 'Full body' }, { id: 'bust', label: 'Upper body' }, { id: 'face', label: 'Face' }] as const;
/** Notification groups the owner can switch on or off. */
const NOTICE_GROUPS = [
  { id: 'approvals', label: 'Approvals waiting', hint: 'A card when your agent needs your OK', types: ['approval'] },
  { id: 'tasks', label: 'Task finished', hint: 'Short card when work is done', types: ['task'] },
  { id: 'messages', label: 'New messages', hint: 'Messages from your channels', types: ['msg', 'email', 'whatsapp', 'facebook', 'instagram', 'telegram', 'discord', 'twitter', 'tiktok', 'linkedin', 'snapchat', 'youtube', 'reddit', 'twitch'] },
  { id: 'calendar', label: 'Calendar reminders', hint: 'Before a meeting starts', types: ['calendar'] },
  { id: 'other', label: 'Other alerts', hint: 'Payments, stocks, codes, terminal', types: [] as string[] },
] as const;
type NoticeGroup = typeof NOTICE_GROUPS[number]['id'];
type Prefs = { size: 's' | 'm' | 'l'; speak: boolean; notifications: boolean; effects: boolean; sidePanel: boolean; notice: Record<NoticeGroup, boolean>; mode: 'me' | 'customers' };
const DEFAULT_PREFS: Prefs = { size: 'm', speak: true, notifications: true, effects: true, sidePanel: true, notice: { approvals: true, tasks: true, messages: true, calendar: true, other: true }, mode: 'me' };
const PREFS_KEY = 'genvr-avatar-live-page';
function readPrefs(): Prefs { try { const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null'); return raw && typeof raw === 'object' ? { ...DEFAULT_PREFS, ...raw, notice: { ...DEFAULT_PREFS.notice, ...(raw.notice ?? {}) } } : DEFAULT_PREFS; } catch { return DEFAULT_PREFS; } }
const SECTIONS = [
  { id: 'agent', label: 'Agent', Icon: User },
  { id: 'look', label: 'Look & voice', Icon: Mic },
  { id: 'background', label: 'Background', Icon: Image },
  { id: 'display', label: 'Display', Icon: Monitor },
  { id: 'where', label: 'Where it shows', Icon: Globe },
  { id: 'allowed', label: 'What it may do', Icon: ShieldCheck },
  { id: 'notifications', label: 'Notifications', Icon: Bell },
] as const;
type SectionId = typeof SECTIONS[number]['id'];
const tile = (on: boolean) => `flex min-h-14 flex-col items-start justify-center gap-1 rounded-xl border-2 px-3 py-2 text-left text-xs ${on ? 'border-ink bg-ink/5 font-bold' : 'border-ink/15 hover:bg-ink/5'}`;
const pill = (on: boolean) => `min-h-9 rounded-lg px-3 text-xs font-bold ${on ? 'bg-ink text-on-brand' : 'hover:bg-ink/5'}`;
function Switch({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-ink/15 px-3 py-2 text-xs"><span><span className="block font-bold">{label}</span>{hint ? <span className="block text-ink/60">{hint}</span> : null}</span><input type="checkbox" className="size-5" checked={checked} onChange={e => onChange(e.target.checked)}/></label>;
}
/** Small drawing of each view, so the shape is clear at a glance. */
function ViewDrawing({ view }: { view: ViewId }) {
  const face = 'rounded bg-ink/60', line = 'h-1 rounded bg-ink/25';
  return <span aria-hidden="true" className="mb-1 flex h-11 w-full rounded-md border border-ink/15 bg-paper p-1.5">
    {view === 'chat' ? <span className="flex w-full gap-1"><span className={`${face} flex-1`}/><span className="flex flex-1 flex-col justify-center gap-1"><span className={line}/><span className={`${line} w-2/3`}/><span className={line}/></span></span> : null}
    {view === 'call' ? <span className="flex w-full flex-col items-center gap-1"><span className={`${face} w-full flex-1`}/><span className="size-2 rounded-full bg-ink/70"/></span> : null}
    {view === 'compact' ? <span className="flex w-full flex-col items-center gap-1"><span className={`${face} h-4 w-1/2`}/><span className={`${line} w-11/12`}/><span className={`${line} w-2/3`}/></span> : null}
    {view === 'watch' ? <span className="flex w-full items-center justify-center"><span className="size-7 rounded-full border-2 border-ink/40 bg-ink/60"/></span> : null}
  </span>;
}

/** Page choices a host app can read back (for example to speak replies or size its frame). */
export type AvatarLivePrefs = Prefs;
/** What a host app (for example an agent app) supplies to an embedded Avatar Live, and how it hears the owner's choices. */
export interface AvatarLiveHost {
  /** Saved voices the agent may speak with; shown in Settings → Look & voice. */
  voices?: readonly { id: string; name: string; language?: string | null }[];
  voiceId?: string;
  onVoice?: (voiceId: string) => void;
  /** Called with the page choices on start and after every change. */
  onPrefs?: (prefs: AvatarLivePrefs) => void;
  /** Called when Settings opens or closes, so the host can give the frame room. */
  onSettings?: (open: boolean) => void;
  /** Bumped by the host to open Settings from its own button. */
  settingsRequest?: number;
}
export function AvatarLive({ controller, recipe, onStage, projectId, characters, voice, embedded = false, onShare, playerHost, worldViewport, worldStorage, currentProject, onWorldRendered, agent, conversation, activity, permissions, host }: {
  controller: AvatarPresentation; recipe: CharacterRecipe; onStage: (stage: CharacterStage | null) => void; projectId: string;
  onWorldRendered?:(canvas:HTMLCanvasElement)=>void; worldStorage?: StudioStorage; currentProject?: ()=>StudioProject;
  characters?: ReactNode; voice?: ReactNode; embedded?: boolean; onShare?: () => void; playerHost?: (element:HTMLDivElement|null)=>void; worldViewport?: HTMLElement|null;
  /** Host app (for example an agent app) supplies the agent, its conversation, its live activity and its visitor permissions. */
  agent?: { name: string; detail?: string }; conversation?: ReactNode; activity?: ReactNode; permissions?: ReactNode;
  /** Embedded hosts that pass this get the same Settings window as the full page. */
  host?: AvatarLiveHost;
}) {
  const { display } = useSyncExternalStore(controller.subscribe, controller.snapshot);
  const dialog=useRef<HTMLElement>(null);
  const worldBackground=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(display.background!=='world'||display.worldId||!worldViewport||!worldBackground.current)return;const parent=worldViewport.parentNode,next=worldViewport.nextSibling;worldBackground.current.appendChild(worldViewport);return()=>{if(parent)parent.insertBefore(worldViewport,next?.parentNode===parent?next:null);};},[display.background,display.worldId,worldViewport]);
  const container = useRef<HTMLDivElement>(null), stage = useRef<CharacterStage | null>(null);
  const [faceSupported,setFaceSupported]=useState<boolean|null>(null);
  const [ready,setReady]=useState(false), [error,setError]=useState('');
  const [exploring,setExploring]=useState(false);
  const [settingsOpen,setSettingsOpen]=useState(false),[section,setSection]=useState<SectionId>('agent');
  const [bgHost,setBgHost]=useState<HTMLDivElement|null>(null),[spotHost,setSpotHost]=useState<HTMLDivElement|null>(null);
  const [prefs,setPrefsState]=useState<Prefs>(readPrefs);
  const setPrefs=(patch:Partial<Prefs>)=>setPrefsState(current=>{const next={...current,...patch};try{localStorage.setItem(PREFS_KEY,JSON.stringify(next));}catch{/* preferences stay for this session */}return next;});
  const player=useRef<HTMLDivElement|null>(null);
  const hostRef=useRef(host);hostRef.current=host;
  useEffect(()=>{hostRef.current?.onPrefs?.(prefs);},[prefs]);
  useEffect(()=>{hostRef.current?.onSettings?.(settingsOpen);},[settingsOpen]);
  useEffect(()=>{if(host?.settingsRequest)setSettingsOpen(true);},[host?.settingsRequest]);
  // Full screen (page header only): real full screen where the browser allows it.
  const [full,setFull]=useState(false);
  const setFullscreen=(on:boolean)=>{setFull(on);if(on)void dialog.current?.requestFullscreen?.().catch(()=>{/* the host or page view stays */});else if(document.fullscreenElement)void document.exitFullscreen().catch(()=>{});};
  useEffect(()=>{const sync=()=>{if(!document.fullscreenElement&&full)setFullscreen(false);};document.addEventListener('fullscreenchange',sync);return()=>document.removeEventListener('fullscreenchange',sync);},[full]);
  useEffect(()=>{if(!embedded||!settingsOpen)return;const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')setSettingsOpen(false);};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[embedded,settingsOpen]);
  const current = useRef({ recipe, onStage, framing:display.framing, round:display.layout==='circle'||display.layout==='watch' }); current.current={recipe,onStage,framing:display.framing,round:display.layout==='circle'||display.layout==='watch'};
  const change = (patch: Record<string,unknown>) => setError(controller.execute({kind:'display',...patch})??'');
  const preset=AVATAR_LIVE_LAYOUTS.find(row=>row.id===display.layout)!;
  const round=display.layout==='circle'||display.layout==='watch';
  const view=viewOf(display.layout), scale=SIZES.find(s=>s.id===prefs.size)?.scale??1;
  // Choosing a spot closes Settings; the world fills the stage until "Use this spot" or "Cancel".
  useEffect(()=>{if(exploring)setSettingsOpen(false);},[exploring]);
  useEffect(()=>{const host=player.current;if(!host)return;const apply=()=>host.querySelectorAll('audio,video').forEach(media=>{(media as HTMLMediaElement).muted=!prefs.speak;});apply();const watch=new MutationObserver(apply);watch.observe(host,{childList:true,subtree:true});return()=>watch.disconnect();},[prefs.speak,display.open]);
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
    const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){if(settingsOpen){setSettingsOpen(false);return;}if(exploring)return;change({open:false});}if(e.key==='Tab'){const nodes=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,textarea,a[href]')??[]);const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};
    window.addEventListener('keydown',escape);return()=>{window.removeEventListener('keydown',escape);if(previous?.isConnected)previous.focus();};
  },[display.open,embedded,settingsOpen,exploring]);
  if(!display.open)return null;
  const allowedNotice=(type:string)=>{const group=NOTICE_GROUPS.find(g=>(g.types as readonly string[]).includes(type))?.id??'other';return prefs.notice[group];};
  const style={background: display.background==='transparent'?'transparent':display.color};
  const width=Math.round(preset.width*(embedded?1:scale)), height=Math.round(preset.height*(embedded?1:scale));
  const frame=<div data-avatar-live-frame data-layout={display.layout} className={`relative flex shrink-0 overflow-hidden ${exploring?'outline-dashed outline-[3px] outline-white':''} ${!embedded&&view!=='watch'?'rounded-2xl':''}`} style={{...style,width:'100%',maxWidth:width,height:embedded?'100%':`min(${height}px,65vh)`,minHeight:180,boxShadow:exploring?'0 0 0 9999px rgba(5,6,9,.35)':undefined}}>
    {display.background==='world'?<><div ref={worldBackground} className="absolute inset-0" aria-label="Current world background"/>{worldStorage&&currentProject?<WorldBackground storage={worldStorage} current={currentProject} display={display} change={change} embedded={embedded} onExploring={setExploring} onRendered={onWorldRendered} controlsHost={exploring?spotHost:bgHost}/>:null}</>:null}
    {display.media&&display.background==='image'?<img alt="Avatar background" src={display.media} className="absolute inset-0 h-full w-full object-cover"/>:null}
    {display.media&&display.background==='video'?<video key={display.media} src={display.media} muted autoPlay loop playsInline className="absolute inset-0 h-full w-full object-cover"/>:null}
    <div className="relative flex h-full items-center justify-center" style={{width:round?'55%':'100%',minWidth:0,pointerEvents:exploring?'none':undefined,visibility:exploring?'hidden':undefined}}>
      <div ref={container} aria-label="Live avatar viewport" className="relative overflow-hidden" style={{height:round?'auto':'100%',maxHeight:'100%',width:'100%',maxWidth:round?210:undefined,aspectRatio:round?'1':undefined,borderRadius:round?'50%':undefined,background:round?'radial-gradient(ellipse at 50% 30%, #1e293b, #0c1120)':undefined,border:round?'2px solid #6366f166':undefined}}/>
      {!ready?<span role="status" className="absolute text-xs text-white">Loading avatar…</span>:null}
    </div>
    {exploring?<div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-end justify-center"><svg viewBox="0 0 200 400" className="h-[88%] opacity-40"><g fill="#ffffff"><rect x="62" y="122" width="76" height="150" rx="30"/><rect x="34" y="132" width="26" height="110" rx="13"/><rect x="140" y="132" width="26" height="110" rx="13"/><rect x="70" y="262" width="26" height="118" rx="12"/><rect x="104" y="262" width="26" height="118" rx="12"/><circle cx="100" cy="72" r="44"/></g></svg><span className="absolute left-3 top-3 rounded-full bg-black/70 px-3 py-1 text-xs font-bold text-white">{VIEWS.find(v=>v.id===view)!.label} frame</span></div>:null}
    <div className="absolute right-0 top-0 h-full min-w-0" style={{width:'45%'}} aria-label="Live notifications"><PresentationViewport controller={controller} compact showEffects={prefs.effects} showNotifications={prefs.notifications} notificationFilter={allowedNotice}/></div>
  </div>;
  const backgroundLabel=display.background==='world'?'My worlds':display.background==='color'?'Color':display.background==='transparent'?'Transparent':`${display.background.replace('_',' ')} (older option)`;
  const settingsDialog=settingsOpen?<div className="absolute inset-0 z-10 flex items-start justify-center bg-black/60 p-4 pt-16" onClick={event=>{if(event.target===event.currentTarget)setSettingsOpen(false);}}>
      <section role="dialog" aria-modal="true" aria-label="Avatar Live settings" className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-ink/15 bg-surface shadow-2xl">
        <header className="flex items-center justify-between border-b border-ink/10 px-5 py-3"><h2 className="text-base font-bold">Settings</h2><button aria-label="Close settings" onClick={()=>setSettingsOpen(false)} className="rounded-lg p-2 hover:bg-ink/10"><X className="size-4"/></button></header>
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <nav aria-label="Settings sections" className="flex shrink-0 gap-1 overflow-auto border-b border-ink/10 p-2 md:w-52 md:flex-col md:border-b-0 md:border-r">{SECTIONS.map(({id,label,Icon})=><button key={id} aria-pressed={section===id} onClick={()=>setSection(id)} className={`flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-left text-xs font-bold ${section===id?'bg-ink text-on-brand':'hover:bg-ink/5'}`}><Icon className="size-4 shrink-0"/>{label}</button>)}</nav>
          <div className="min-w-0 flex-1 space-y-4 overflow-auto p-5">
            {section==='agent'?<div className="space-y-3">{agent?<div className="rounded-xl border border-ink/15 p-4"><span className="block text-xs text-ink/60">Linked agent</span><strong className="block text-base">{agent.name}</strong>{agent.detail?<span className="text-xs text-ink/70">{agent.detail}</span>:null}</div>:<p className="rounded-xl border border-ink/15 p-4 text-xs text-ink/70">No agent app is connected. This Studio shows the avatar on its own; an agent app (for example Dpro) links its agent, conversation and activity here.</p>}<p className="text-xs text-ink/60">The agent's memory, tools and permissions stay in its app. This page only gives it a face and a voice.</p></div>:null}
            {section==='look'?<div className="space-y-4"><div><h3 className="mb-2 text-xs font-bold">Character</h3>{characters??<p className="text-xs text-ink/60">The agent's character is chosen in its app.</p>}</div><div><h3 className="mb-2 text-xs font-bold">Voice</h3>{voice??(host?.voices?<label className="block text-xs font-bold">Voice for {agent?.name??'the agent'}<select aria-label="Agent voice" className="mt-1 w-full rounded-lg border border-ink/20 bg-paper p-2 text-sm" value={host.voiceId??''} onChange={e=>host.onVoice?.(e.target.value)}><option value="">No voice</option>{host.voices.map(v=><option key={v.id} value={v.id}>{v.name}{v.language?` · ${v.language}`:''}</option>)}</select><span className="mt-1 block font-normal text-ink/60">Saved voices from your voice library. Speech is made on this device.</span></label>:null)}{faceSupported===false?<p className="mt-2 text-xs text-ink/60">This character has no face controls: the voice plays, but the mouth cannot move.</p>:null}</div></div>:null}
            {section==='background'?<div className="space-y-4">
              <p className="text-xs text-ink/70">Now: <b>{backgroundLabel}</b></p>
              <div className="grid grid-cols-3 gap-2">{([['world','My worlds'],['color','Color'],['transparent','Transparent']] as const).map(([id,label])=><button key={id} aria-pressed={display.background===id} disabled={id==='world'&&!worldStorage&&!worldViewport} className={`${tile(display.background===id)} disabled:opacity-40`} onClick={()=>change({background:id})}>{label}</button>)}</div>
              {display.background==='world'?<div className="space-y-2"><p className="text-xs text-ink/70">Pick one of your worlds, then <b>Choose a spot</b>: walk to the view you like and keep it behind your agent. Your world is not changed.</p><div ref={setBgHost}/></div>:null}
              {display.background==='color'?<label className="flex items-center gap-3 text-xs font-bold">Color<input aria-label="Avatar Live color" type="color" value={display.color} onChange={e=>change({color:e.target.value})}/></label>:null}
              {display.background==='transparent'?<p className="text-xs text-ink/60">No background: the avatar shows over your website or screen.</p>:null}
            </div>:null}
            {section==='display'?<div className="space-y-4">
              <fieldset><legend className="mb-2 text-xs font-bold">Show as</legend><div className="grid grid-cols-2 gap-2">{VIEWS.map(row=><button key={row.id} aria-pressed={view===row.id} className={tile(view===row.id)} onClick={()=>change({layout:row.layout,framing:row.id==='watch'?'bust':display.framing})}><ViewDrawing view={row.id}/><span className="font-bold">{row.label}</span><span className="text-ink/60">{row.hint}</span></button>)}</div></fieldset>
              <fieldset><legend className="mb-2 text-xs font-bold">Size</legend><div className="inline-flex gap-1 rounded-xl border border-ink/15 p-1">{SIZES.map(row=><button key={row.id} aria-pressed={prefs.size===row.id} className={pill(prefs.size===row.id)} onClick={()=>setPrefs({size:row.id})}>{row.label}</button>)}</div></fieldset>
              <fieldset><legend className="mb-2 text-xs font-bold">Framing</legend><div className="inline-flex gap-1 rounded-xl border border-ink/15 p-1">{FRAMINGS.map(row=><button key={row.id} aria-pressed={display.framing===row.id} className={pill(display.framing===row.id)} onClick={()=>change({framing:row.id})}>{row.label}</button>)}</div></fieldset>
              <fieldset className="space-y-2"><legend className="mb-2 text-xs font-bold">Switches</legend>
                <Switch label="Speak replies" hint="The agent's voice plays aloud" checked={prefs.speak} onChange={v=>setPrefs({speak:v})}/>
                <Switch label="Notifications" hint="Cards from your agent on the right" checked={prefs.notifications} onChange={v=>setPrefs({notifications:v})}/>
                <Switch label="Effects" hint="Small screen effects your agent may show" checked={prefs.effects} onChange={v=>setPrefs({effects:v})}/>
                <Switch label="Side panel" hint="What it's doing, beside the chat" checked={prefs.sidePanel} onChange={v=>setPrefs({sidePanel:v})}/>
              </fieldset>
            </div>:null}
            {section==='where'?<div className="space-y-3"><p className="text-xs text-ink/70">Exact sizes for screens and websites. Use <b>Share</b> to get a link or the website code.</p><div className="grid grid-cols-2 gap-2">{AVATAR_LIVE_LAYOUTS.map(row=><button key={row.id} aria-label={`Layout ${row.name}`} aria-pressed={display.layout===row.id} className={tile(display.layout===row.id)} onClick={()=>change({layout:row.id,framing:['circle','watch','banner'].includes(row.id)?'bust':display.framing})}><span className="font-bold">{row.name}</span><span className="text-ink/60">{row.width} × {row.height}</span></button>)}</div></div>:null}
            {section==='allowed'?<div className="space-y-3"><p className="text-xs text-ink/70">What the agent may do when other people talk to it.</p>{permissions??<p className="rounded-xl border border-ink/15 p-4 text-xs text-ink/60">Set by your agent app. Visitors never see your files, approvals or other chats.</p>}</div>:null}
            {section==='notifications'?<div className="space-y-2"><p className="text-xs text-ink/70">What your agent shows on screen by itself.</p><Switch label="Show notifications" checked={prefs.notifications} onChange={v=>setPrefs({notifications:v})}/>{NOTICE_GROUPS.map(group=><Switch key={group.id} label={group.label} hint={group.hint} checked={prefs.notice[group.id]} onChange={v=>setPrefs({notice:{...prefs.notice,[group.id]:v}})}/>)}</div>:null}
          </div>
        </div>
        <footer className="flex justify-end border-t border-ink/10 px-5 py-3"><button onClick={()=>setSettingsOpen(false)} className="min-h-10 rounded-lg bg-ink px-5 text-xs font-bold text-on-brand">Done</button></footer>
      </section>
    </div>:null;
  if(embedded)return <section ref={dialog} role="region" aria-label="Avatar Live" className="relative min-h-0 flex-1 h-full w-full"><style>{`[data-avatar-live-frame] [aria-label="View directions"]{display:none}`}</style><div className="h-full w-full">{frame}</div><div ref={element=>{player.current=element;playerHost?.(element);}} className="shrink-0 empty:hidden"/>{host?<button onClick={()=>setSettingsOpen(true)} aria-haspopup="dialog" aria-label="Avatar Live settings" className="absolute left-2 top-2 z-[5] inline-flex min-h-9 items-center gap-2 rounded-lg bg-black/60 px-3 text-xs font-bold text-white hover:bg-black/80"><Settings className="size-4"/>Settings</button>:null}{error&&host?<p role="alert" className="absolute inset-x-0 top-0 bg-coral px-3 py-2 text-xs text-white">{error}</p>:null}{host?settingsDialog:null}</section>;
  const talking=view==='chat'||view==='compact', side=prefs.sidePanel&&talking;
  return <section ref={dialog} role="dialog" aria-modal="true" aria-label="Avatar Live" className="fixed inset-0 z-[100] flex flex-col bg-paper text-ink">
    <style>{`[data-avatar-live-frame] [aria-label="View directions"]{display:none}`}</style>
    <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-3 border-b border-ink/15 bg-surface px-4 py-2">
      <Monitor className="size-4"/><strong className="text-sm">Avatar Live</strong>
      {agent?<span className="rounded-full border border-ink/15 px-3 py-1 text-xs font-bold">{agent.name}</span>:null}
      <div role="group" aria-label="Who it talks to" className="flex gap-1 rounded-xl border border-ink/15 p-1">{([['me','For me'],['customers','For my customers']] as const).map(([id,label])=><button key={id} aria-pressed={prefs.mode===id} className={pill(prefs.mode===id)} onClick={()=>setPrefs({mode:id})}>{label}</button>)}</div>
      <span className="flex-1"/>
      <button onClick={()=>setFullscreen(!full)} aria-pressed={full} aria-label={full?'Exit full screen':'Full screen'} title={full?'Exit full screen':'Full screen'} className="inline-flex min-h-10 items-center rounded-lg border border-ink/15 px-3">{full?<Minimize2 className="size-4"/>:<Maximize2 className="size-4"/>}</button>
      <button onClick={()=>setSettingsOpen(true)} aria-haspopup="dialog" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-ink/15 px-3 text-xs font-bold"><Settings className="size-4"/>Settings</button>
      {onShare?<button onClick={onShare} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-ink px-4 text-xs font-bold text-on-brand"><Share2 className="size-4"/>Share</button>:null}
      <button aria-label="Close Avatar Live" onClick={()=>change({open:false})} className="rounded p-2"><X className="size-4"/></button>
    </header>
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <main className="flex min-h-0 min-w-0 flex-1 flex-col items-center gap-4 overflow-auto bg-ink/5 p-4">
        {exploring?<div className="w-full max-w-4xl rounded-xl border border-ink/15 bg-surface p-3 text-xs"><strong className="flex items-center gap-2 text-sm"><MapPin className="size-4"/>Choosing the background spot</strong><p className="mt-1 text-ink/70">Walk to the view you want behind your agent: <b>W A S D</b> or arrows to walk, drag to look, scroll for closer or farther. The dashed frame shows what will be behind your agent. Your world is not changed.</p></div>:null}
        {frame}
        {exploring?<div ref={setSpotHost} className="w-full max-w-4xl" aria-label="Spot controls"/>:null}
        {!exploring&&talking?<div aria-label="Conversation" className="w-full max-w-3xl">{conversation??<p className="rounded-xl border border-dashed border-ink/20 p-4 text-center text-xs text-ink/60"><MessageSquare className="mx-auto mb-2 size-5"/>Connect an agent app to talk here. The agent answers with this face and voice.</p>}</div>:null}
      </main>
      {side&&!exploring?<aside className="w-full shrink-0 overflow-auto border-l border-ink/15 p-4 md:w-80">
        {prefs.mode==='me'?<><h2 className="mb-3 flex items-center gap-2 text-sm font-bold"><Activity className="size-4"/>What it's doing</h2>{activity??<p className="text-xs text-ink/60">Your agent's live work and approvals appear here when an agent app is connected.</p>}</>
        :<><h2 className="mb-2 text-sm font-bold">For your customers</h2><p className="mb-3 text-xs text-ink/70">Put this agent on your website. Visitors talk to it; it answers with its own voice and face.</p>{permissions??<p className="rounded-lg border border-ink/15 p-3 text-xs text-ink/60">What it may do for visitors is set by your agent app.</p>}{onShare?<button onClick={onShare} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg bg-ink px-4 text-xs font-bold text-on-brand"><Share2 className="size-4"/>Get the link or website code</button>:null}</>}
      </aside>:null}
    </div>
    <div ref={element=>{player.current=element;playerHost?.(element);}} className="shrink-0 border-t border-ink/10 bg-surface p-3 empty:hidden"/>{error?<p role="alert" className="bg-coral px-3 py-2 text-xs text-white">{error}</p>:null}
    {settingsDialog}
  </section>;
}
