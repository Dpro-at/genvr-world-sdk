 'use client';
import {useEffect,useState} from 'react';
import {Play,RefreshCw} from 'lucide-react';
import type {StudioFilming} from '../../../lib/use-studio-filming';
type Voice={id:string;name:string;language?:string;voiceType?:string;model:string};
export function QuickVoice({filming}:{filming:StudioFilming}){
 const[voices,setVoices]=useState<Voice[]>([]),[selected,setSelected]=useState(''),[busy,setBusy]=useState(false);
 const refresh=async()=>{const[library,id]=await Promise.all([filming.voiceLibrary(),filming.selectedVoice()]);setVoices(library.voices);setSelected(id);};
 useEffect(()=>{void refresh().catch(e=>filming.studio.setMessage(e.message));},[filming.studio.identity]);
 const run=async(action:()=>Promise<unknown>)=>{setBusy(true);try{await action();}catch(e){filming.studio.setMessage(e instanceof Error?e.message:'Voice selection failed.');}finally{setBusy(false);}};
 const chosen=voices.find(v=>v.id===selected);
 return <section aria-label="Quick character voice" className="space-y-2"><div className="flex items-center justify-between"><strong className="text-xs">Character voice</strong><button aria-label="Refresh quick voices" onClick={()=>void run(refresh)} disabled={busy}><RefreshCw className="size-3.5"/></button></div><label className="block text-xs">My avatar<select aria-label="Quick saved voice" className="mt-1 w-full rounded border border-ink/15 bg-paper p-2" value={selected} disabled={busy||filming.busy} onChange={e=>{const id=e.target.value;if(id)void run(async()=>{await filming.assignSavedVoice(id);setSelected(id);filming.studio.setMessage('Saved voice assigned to My avatar. New dialogue uses this voice; existing audio stays unchanged.');});}}><option value="">Choose saved voice</option>{voices.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label>{chosen?<><p className="text-xs text-ink/60">{chosen.language?.toUpperCase()??'Multilingual'} · {chosen.voiceType??'Reference'}</p><button className="flex items-center gap-1 rounded border border-ink/15 px-2 py-1.5 text-xs" disabled={busy||filming.busy} onClick={()=>void run(()=>filming.previewSavedVoice(chosen.id))}><Play className="size-3.5"/>Listen</button></>:<p className="text-xs text-ink/55">Create or import a saved voice in Avatar voice.</p>}<p className="text-[10px] text-ink/50">New dialogue defaults to this voice. Generate scene dialogue to create speech; recorded audio is unchanged.</p></section>;
}
