import { useState } from 'react';
import { Globe, Lock, Mail, User, Copy, X, Link2, Code, Monitor, Check, Eye, MessageCircle, Circle, AppWindow, RectangleHorizontal, ShieldCheck, Users } from 'lucide-react';
import { StudioShareRequest, type StudioSharing } from '../src/studio-sharing';
import { AVATAR_LIVE_LAYOUTS, avatarLiveEmbed } from '../src/avatar-live-embed';

type Access = 'public' | 'invite' | 'password';
const ACCESS = [
  { id: 'public', label: 'Anyone with the link', hint: 'No sign-in needed', Icon: Globe },
  { id: 'invite', label: 'Only invited people', hint: 'By email or account', Icon: Mail },
  { id: 'password', label: 'With a password', hint: 'Share the password separately', Icon: Lock },
] as const;
/** Website looks map to the stable display layouts. */
const LOOKS = [
  { id: 'circle', label: 'Bubble', Icon: Circle },
  { id: 'desktop', label: 'Side window', Icon: AppWindow },
  { id: 'banner', label: 'Banner', Icon: RectangleHorizontal },
] as const;
const field = 'mt-1 w-full rounded-lg border border-ink/20 bg-paper p-2 text-sm';
const tile = (on: boolean) => `flex min-h-14 flex-col items-start justify-center gap-1 rounded-xl border-2 px-3 py-2 text-left text-xs ${on ? 'border-ink bg-ink/5 font-bold' : 'border-ink/15 hover:bg-ink/5'}`;
const pill = (on: boolean) => `inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-xs font-bold ${on ? 'bg-ink text-on-brand' : 'hover:bg-ink/5'}`;

export function ShareDialog({projectId,layout,display,initialSurface,sharing,close}:{projectId:string;layout:string;display?:import('@genvr/assistant').AvatarLiveDisplay;preview?:Record<string,string>;preparing?:boolean;previewError?:string;requestPreview?:()=>void;initialSurface?:'world'|'avatar-live';sharing?:StudioSharing;close:()=>void}){
 const [surface,setSurface]=useState<'world'|'avatar-live'>(initialSurface??'avatar-live');
 const [access,setAccess]=useState<Access>('public'),[guests,setGuests]=useState(''),[password,setPassword]=useState('');
 const [talk,setTalk]=useState(true);
 const [look,setLook]=useState<string>(LOOKS.some(l=>l.id===layout)?layout:'circle');
 const [result,setResult]=useState<{url:string;id:string}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[copied,setCopied]=useState('');
 const reset=()=>{setResult(null);setCopied('');};
 const shareLayout=surface==='world'?undefined:look;
 const code=surface==='avatar-live'?avatarLiveEmbed(result?.url??window.location.href,projectId,look,{...display,framing:['circle','watch','banner'].includes(look)?'bust':(display?.framing??'full')}):null;
 const create=async()=>{if(!sharing)return;setBusy(true);setError('');try{
  if(display?.media?.startsWith('blob:')&&['image','video'].includes(display.background))throw new Error('Use hosted background media before creating public links.');
  if(access==='password'&&password.length<4)throw new Error('Use a password of at least 4 characters.');
  const request=StudioShareRequest.parse({projectId,surface,access:access==='password'?'public':access,layout:shareLayout,guests:access==='invite'?guests.split(/[\n,]/).map(s=>s.trim()).filter(Boolean):[],password:access==='password'?password:undefined,allowJoining:talk});
  const next=await sharing.create(request),url=new URL(next.url);if(!['https:','http:'].includes(url.protocol)||url.username||url.password||typeof next.id!=='string')throw new Error('The hosting service returned an invalid share.');
  setResult(next);setPassword('');
 }catch(e){setError(e instanceof Error?e.message:'Sharing failed.');}finally{setBusy(false);}};
 const copy=async(text:string,label:string)=>{try{await navigator.clipboard.writeText(text);setCopied(label);}catch{setError('Select and copy the text below.');}};
 const size=AVATAR_LIVE_LAYOUTS.find(l=>l.id===look);
 return <div onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();close();}}} className="fixed inset-0 z-[150] flex items-start justify-center overflow-auto bg-black/70 p-4 pt-12">
  <section role="dialog" aria-modal="true" aria-label="Share" className="flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-ink/15 bg-surface text-ink shadow-2xl">
   <header className="flex items-center gap-3 border-b border-ink/10 px-5 py-4"><Link2 className="size-5"/><div className="flex-1"><h2 className="text-base font-bold">{surface==='avatar-live'?'Share your agent':'Share your world'}</h2><p className="mt-1 text-xs text-ink/60">{surface==='avatar-live'?'People open a page where they can see and talk to your agent.':'Share the world you built with the access you choose.'}</p></div><button aria-label="Close sharing" onClick={close} className="rounded-lg p-2 hover:bg-ink/10"><X className="size-4"/></button></header>
   <div className="space-y-5 overflow-auto p-5">
    <div role="group" aria-label="What to share" className="inline-flex gap-1 rounded-xl border border-ink/15 p-1">{([['avatar-live','Avatar Live',Monitor],['world','World',Globe]] as const).map(([id,label,Icon])=><button key={id} aria-pressed={surface===id} className={pill(surface===id)} onClick={()=>{setSurface(id);reset();}}><Icon className="size-4"/>{label}</button>)}</div>
    <fieldset><legend className="mb-2 flex items-center gap-2 text-xs font-bold"><ShieldCheck className="size-4"/>Who can open it</legend>
     <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">{ACCESS.map(({id,label,hint,Icon})=><button key={id} aria-pressed={access===id} className={tile(access===id)} onClick={()=>{setAccess(id);reset();}}><span className="flex items-center gap-2 font-bold"><Icon className="size-4"/>{label}</span><span className="text-ink/60">{hint}</span></button>)}</div>
     <p className="mt-2 flex items-center gap-2 text-[11px] text-ink/55"><User className="size-3.5"/>"Signed-in people only" comes with Genvr hosting.</p>
     {access==='invite'?<label className="mt-3 block text-xs font-bold">Invite people<textarea aria-label="Invited people" className={field} value={guests} onChange={e=>{setGuests(e.target.value);reset();}} placeholder="One email or account per line"/></label>:null}
     {access==='password'?<label className="mt-3 block text-xs font-bold">Password for the link<input aria-label="Share password" type="password" autoComplete="new-password" className={field} value={password} onChange={e=>{setPassword(e.target.value);reset();}}/></label>:null}
    </fieldset>
    <fieldset><legend className="mb-2 flex items-center gap-2 text-xs font-bold"><Users className="size-4"/>{surface==='avatar-live'?'Visitors can':'People can'}</legend>
     <div className="inline-flex gap-1 rounded-xl border border-ink/15 p-1">{([[false,surface==='avatar-live'?'Watch only':'Look around',Eye],[true,surface==='avatar-live'?'Talk to the agent':'Join and play',MessageCircle]] as const).map(([value,label,Icon])=><button key={label} aria-pressed={talk===value} className={pill(talk===value)} onClick={()=>{setTalk(value);reset();}}><Icon className="size-4"/>{label}</button>)}</div>
     {surface==='avatar-live'?<p className="mt-2 text-[11px] text-ink/55">Talking follows Settings → What it may do. Visitors never see your files or approvals.</p>:null}
    </fieldset>
    <div><h3 className="mb-2 flex items-center gap-2 text-xs font-bold"><Link2 className="size-4"/>Link</h3>
     {result?<div className="flex gap-2"><input aria-label="Share link" readOnly className="w-full rounded-lg border border-ink/20 bg-paper p-2 text-sm" value={result.url}/><button onClick={()=>void copy(result.url,'link')} className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg bg-ink px-4 text-xs font-bold text-on-brand">{copied==='link'?<Check className="size-4"/>:<Copy className="size-4"/>}{copied==='link'?'Copied':'Copy link'}</button></div>
     :<p className="rounded-lg border border-ink/15 bg-paper p-3 text-xs text-ink/70">{sharing?'Press "Create link" to make the link with these rules.':'Local preview. A public link needs a hosting service (for example Genvr hosting). Private libraries stay on your device.'}</p>}
    </div>
    {code?<div><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-xs font-bold"><Code className="size-4"/>Add to your website</h3><div role="group" aria-label="Website look" className="inline-flex gap-1 rounded-xl border border-ink/15 p-1">{LOOKS.map(({id,label,Icon})=><button key={id} aria-pressed={look===id} className={pill(look===id)} onClick={()=>{setLook(id);setCopied('');}}><Icon className="size-4"/>{label}</button>)}</div></div>
     <textarea aria-label="Website code" readOnly className={`${field} h-24 text-[11px]`} value={code.iframe}/>
     <div className="mt-2 flex flex-wrap items-center gap-3"><button onClick={()=>void copy(code.iframe,'code')} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-ink/20 px-3 text-xs font-bold">{copied==='code'?<Check className="size-4"/>:<Copy className="size-4"/>}{copied==='code'?'Copied':'Copy code'}</button>{code.localOnly?<span className="text-[11px] text-ink/55">Local preview code: it works only on this computer until the link is hosted.</span>:<span className="text-[11px] text-ink/55">{size?.width} × {size?.height}</span>}</div>
    </div>:null}
    {error?<p role="alert" className="text-xs text-red-500">{error}</p>:null}
   </div>
   <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-ink/10 px-5 py-3"><button onClick={close} className="min-h-10 rounded-lg px-4 text-xs">Close</button><button onClick={()=>void create()} disabled={!sharing||busy} className="min-h-10 rounded-lg bg-ink px-4 text-xs font-bold text-on-brand disabled:opacity-40">{busy?'Creating…':'Create link'}</button></footer>
  </section>
 </div>;
}
