'use client';
import { useEffect, useState } from 'react';
import { FileUp, Scissors, Volume2, Waves, Trash2, MapPin } from 'lucide-react';
import { toSeconds, type MediaClip, type Media, type Track } from '@genvr/film';
import type { StudioFilming } from '../../../lib/use-studio-filming';
import { soundEditSteps } from '../../../lib/video-studio/sound-edit';
const button='inline-flex items-center justify-center gap-1.5 rounded-md border border-ink/15 bg-paper px-2.5 py-2 text-xs font-semibold hover:bg-ink/10 disabled:opacity-35';
const input='w-24 rounded border border-ink/15 bg-paper px-2 py-1.5 text-xs';
export function SoundEditor({filming}:{filming:StudioFilming}) {
 const s=filming.studio, off=s.rendering||filming.busy;
 const sounds=s.project.tracks.filter(t=>t.kind==='sound').flatMap(track=>track.clips.flatMap(clip=>clip.type==='media'?[{track,clip,media:s.project.media.find(m=>m.id===clip.media)!}]:[]));
 const selected=sounds.find(row=>row.clip.id===s.selected)??sounds[0];
 return <section aria-label="Audio editor" className="space-y-3 rounded-lg border border-ink/15 p-3">
  <h3 className="flex items-center gap-2 text-xs font-semibold"><Volume2 className="size-4"/>Audio editor</h3>
  <label className={`${button} flex w-full cursor-pointer`}><FileUp className="size-4"/>Import audio file<input aria-label="Import audio file" type="file" accept="audio/*" className="hidden" disabled={off} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void s.addSound(file).catch(e=>s.setMessage(e instanceof Error?e.message:'Could not import audio.'));}}/></label>
  <p className="text-[10px] text-ink/55">MP3, WAV, OGG or M4A · up to 20 MB · placed at the playhead on this device.</p>
  <label className="block text-xs font-semibold">Audio clip<select aria-label="Audio clip" className="mt-1 w-full rounded border border-ink/15 bg-paper p-2 text-xs" disabled={off||!sounds.length} value={selected?.clip.id??''} onChange={e=>s.select(e.target.value)}>
    {!sounds.length?<option value="">Import audio to begin</option>:null}{sounds.map(({track,clip,media})=><option key={clip.id} value={clip.id}>{track.name} · {media.name} · {toSeconds(clip.start).toFixed(2)}s</option>)}
  </select></label>
  {selected?<ClipEditor key={`${selected.clip.id}:${selected.clip.start}:${selected.clip.in}:${selected.clip.duration}`} filming={filming} {...selected}/>:null}
 </section>;
}
function ClipEditor({filming,clip,track,media}:{filming:StudioFilming;clip:MediaClip;track:Track;media:Media}) {
 const s=filming.studio, off=s.rendering||filming.busy||track.locked;
 const [sourceIn,setIn]=useState(toSeconds(clip.in)),[sourceOut,setOut]=useState(toSeconds(clip.in+clip.duration)),[start,setStart]=useState(toSeconds(clip.start)),[gain,setGain]=useState(clip.volume);
 useEffect(()=>setGain(clip.volume),[clip.volume]);
 const volume=(value:number)=>{if(Number.isFinite(value)&&value>=0&&value<=2)s.run('clip.set',{clip:clip.id,volume:value});};
 const fade=(edge:'in'|'out',value:number)=>s.run('clip.fade',{clip:clip.id,[edge]:value});
 return <fieldset disabled={off} className="space-y-3">
  <div className="space-y-2"><h4 className="flex items-center gap-1 text-xs font-semibold"><Scissors className="size-3.5"/>Trim & position</h4>
   <label className="flex items-center justify-between text-xs">Source in (s)<input aria-label="Audio source in" className={input} type="number" min={0} step={.01} value={sourceIn} onChange={e=>setIn(Number(e.target.value))}/></label>
   <label className="flex items-center justify-between text-xs">Source out (s)<input aria-label="Audio source out" className={input} type="number" min={0} max={toSeconds(media.duration)} step={.01} value={sourceOut} onChange={e=>setOut(Number(e.target.value))}/></label>
   <label className="flex items-center justify-between text-xs">Timeline start (s)<input aria-label="Audio timeline start" className={input} type="number" min={0} step={.01} value={start} onChange={e=>setStart(Number(e.target.value))}/></label>
   <button className={`${button} w-full`} onClick={()=>{try{s.batch(soundEditSteps(clip,{sourceIn,sourceOut,start},toSeconds(media.duration)),{label:'Trim and position audio'});}catch(e){s.setMessage(e instanceof Error?e.message:'Could not edit audio.');}}}>Apply trim & position</button>
   <p className="text-[10px] text-ink/55">Selected length: {(sourceOut-sourceIn).toFixed(2)}s · source range stays inside the original recording. Overlapping edits on this track overwrite footage.</p>
   <div className="flex gap-1"><button className={button} onClick={()=>s.setPlayhead(toSeconds(clip.start))}><MapPin className="size-3.5"/>Go to sound</button><button className={button} disabled={off||s.playhead<=toSeconds(clip.start)||s.playhead>=toSeconds(clip.start+clip.duration)} onClick={()=>s.run('clip.split',{clips:[clip.id],at:s.playhead})}>Split at playhead</button><button className={button} aria-label="Remove audio clip" onClick={()=>s.run('clip.remove',{clips:[clip.id],ripple:false})}><Trash2 className="size-3.5"/></button></div>
  </div>
  <label className="block space-y-1 text-xs font-semibold">Volume · {Math.round(gain*100)}%<input aria-label="Audio volume" className="w-full" type="range" min={0} max={2} step={.05} value={gain} onChange={e=>setGain(Number(e.target.value))} onPointerUp={()=>volume(gain)} onKeyUp={()=>volume(gain)} onBlur={()=>volume(gain)}/></label>
  <div className="flex gap-1">{[0,.5,1,1.5,2].map(value=><button key={value} className={button} onClick={()=>volume(value)}>{value===0?'Mute':`${value*100}%`}</button>)}</div>
  <div className="flex gap-2 text-xs"><label>Fade in (s)<input aria-label="Audio fade in seconds" className={`${input} mt-1`} type="number" min={0} max={10} step={.1} defaultValue={toSeconds(clip.fade?.in??0)} onBlur={e=>fade('in',Number(e.target.value))}/></label><label>Fade out (s)<input aria-label="Audio fade out seconds" className={`${input} mt-1`} type="number" min={0} max={10} step={.1} defaultValue={toSeconds(clip.fade?.out??0)} onBlur={e=>fade('out',Number(e.target.value))}/></label></div>
  {track.lang&&track.muted?<button className={button} onClick={()=>s.run('subtitles.show',{lang:track.lang})}>Activate {track.lang.toUpperCase()} audio & captions</button>:null}
 </fieldset>;
}

/** Ambience uses the same saved clip gain for manual editing, MCP, playback and export. */
export function EnvironmentSound({filming}:{filming:StudioFilming}) {
 const s=filming.studio, rows=s.project.tracks.filter(t=>t.kind==='sound').flatMap(track=>track.clips.flatMap(clip=>clip.type==='media'&&clip.soundType==='ambience'?[{track,clip}]:[]));
 return <section aria-label="Environment sound" data-film-id="film.sound.environment" className="space-y-2 rounded-lg border border-ink/15 p-3">
  <h3 className="flex items-center gap-2 text-xs font-semibold"><Waves className="size-4"/>Environment sound</h3>
  <p className="text-[10px] text-ink/60">Ocean, wind and other ambience. Independent of character voices; saved in the film and included in export.</p>
  {!rows.length?<p className="text-xs text-ink/55">Import an environment recording and set its Sound type to Ambience in the mixer.</p>:null}
  {rows.map(({track,clip})=><EnvironmentGain key={clip.id} filming={filming} clip={clip} track={track}/>)}
 </section>;
}
function EnvironmentGain({filming,clip,track}:{filming:StudioFilming;clip:MediaClip;track:Track}) {
 const s=filming.studio,[gain,setGain]=useState(clip.volume);useEffect(()=>setGain(clip.volume),[clip.volume]);
 const name=clip.name??s.project.media.find(m=>m.id===clip.media)?.name??'Ambience';
 const off=s.rendering||filming.busy||track.locked;
 const commit=(value:number)=>s.run('clip.set',{clip:clip.id,volume:value});
 return <fieldset disabled={off} className="space-y-2 border-t border-ink/10 pt-2">
  <div className="flex items-center justify-between gap-2 text-xs"><span className="truncate" title={name}>{name}</span><output className="font-mono">{Math.round(gain*100)}%</output></div>
  <input aria-label={`Environment volume · ${name}`} className="w-full" type="range" min={0} max={2} step={.05} value={gain} onChange={e=>setGain(Number(e.target.value))} onPointerUp={()=>commit(gain)} onKeyUp={()=>commit(gain)} onBlur={()=>{if(gain!==clip.volume)commit(gain);}}/>
  <div className="flex flex-wrap gap-1">{[0,.25,.5,1].map(value=><button key={value} className={button} aria-label={`Environment ${value===0?'mute':`${value*100}%`} · ${name}`} onClick={()=>commit(value)}>{value===0?'Mute':`${value*100}%`}</button>)}<button className={button} onClick={()=>s.select(clip.id)}>Edit ambience</button></div>
  {track.muted?<p className="text-xs text-amber-500">This track is muted. <button className="underline" onClick={()=>s.run('track.set',{track:track.id,muted:false})}>Unmute environment track</button></p>:null}
 </fieldset>;
}
