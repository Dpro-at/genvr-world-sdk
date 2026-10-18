'use client';
import { useEffect, useState } from 'react';
import { Mic, Play, RefreshCw } from 'lucide-react';
import type { StudioFilming } from '../../../lib/use-studio-filming';
import type { SceneCue } from '../../../lib/video-studio/model';
const button = 'inline-flex items-center justify-center gap-1.5 rounded-md border border-ink/10 bg-paper px-2 py-1.5 text-xs font-semibold hover:bg-ink/10 disabled:opacity-35';
const field = 'mt-1 w-full rounded-md border border-ink/10 bg-paper px-2 py-1.5 text-xs';
type Voice = { id: string; name: string; language?: string; voiceType?: string; model: string };
type Model = { id: string; languages: string[] };
export function SceneVoice({ filming, cue, disabled }: { filming: StudioFilming; cue: SceneCue; disabled: boolean }) {
  const [voices, setVoices] = useState<Voice[]>([]), [models, setModels] = useState<Model[]>([]);
  const [selected, setSelected] = useState(cue.voice?.id ?? ''), [language, setLanguage] = useState(cue.voice?.language ?? 'ar');
  const [working, setWorking] = useState(false);
  useEffect(() => { if (cue.voice) { setSelected(cue.voice.id); setLanguage(cue.voice.language); } }, [cue.voice?.id, cue.voice?.language]);
  const refresh = async () => { const result = await filming.voiceLibrary(); setVoices(result.voices); setModels(result.models); };
  useEffect(() => { let active = true; void filming.voiceLibrary().then(result => { if (active) { setVoices(result.voices); setModels(result.models); if(!cue.voice) void filming.selectedVoice(cue.actor).then(id=>{if(active&&id){setSelected(id);const profile=result.voices.find(v=>v.id===id);if(profile?.language)setLanguage(profile.language);}}).catch(error=>{if(active)filming.studio.setMessage(error.message);}); } }).catch(error => { if (active) filming.studio.setMessage(error.message); }); return () => { active = false; }; }, [filming.studio.identity]);
  if (!filming.voiceAvailable) return null;
  const profile = voices.find(row => row.id === selected), languages = models.find(row => row.id === profile?.model)?.languages ?? [];
  const run = async (preview: boolean) => {
    setWorking(true);
    try { await filming.handleStudio(preview ? { kind: 'dialogue_preview', cue_id: cue.id } : { kind: 'dialogue_voice', cue_id: cue.id, voice_id: selected, language }, new AbortController().signal); }
    catch (error) { filming.studio.setMessage(error instanceof Error ? error.message : 'Scene voice failed.'); }
    finally { setWorking(false); }
  };
  return <section aria-label={`Saved voice for ${cue.label}`} className="space-y-2 rounded-lg border border-ink/10 p-2">
    <div className="flex items-center justify-between gap-2"><strong className="text-xs">Saved voice</strong><button aria-label="Refresh saved voices" className={button} disabled={working || disabled} onClick={() => void refresh().catch(error => filming.studio.setMessage(error.message))}><RefreshCw className="size-3" /></button></div>
    <label className="block text-xs">Saved voice<select aria-label={`Voice for ${cue.id}`} className={field} value={selected} disabled={working || disabled} onChange={event => { setSelected(event.target.value); const voice = voices.find(row => row.id === event.target.value); if (voice?.language) setLanguage(voice.language); }}><option value="">Choose a saved voice</option>{voices.map(row => <option key={row.id} value={row.id}>{row.name}{row.language ? ` · ${row.language}` : ''} · {row.voiceType === 'child' ? 'Child-style' : row.voiceType ?? 'Reference'}</option>)}</select></label>
    <label className="block text-xs">Dialogue language<select aria-label={`Dialogue language for ${cue.id}`} className={field} value={language} disabled={working || disabled} onChange={event => setLanguage(event.target.value)}>{languages.map(code => <option key={code} value={code}>{new Intl.DisplayNames([code], { type: 'language' }).of(code)}</option>)}</select></label>
    {profile ? <p className="text-[10px] text-ink/50">{profile.name} · {language} · {profile.voiceType === 'child' ? 'Child-style' : profile.voiceType ?? 'Reference voice'}</p> : <p className="text-[10px] text-ink/50">Create and save voices in Avatar voice first.</p>}
    <button className={button + ' w-full'} disabled={working || disabled || !selected} onClick={() => { setWorking(true); void filming.previewSavedVoice(selected).catch(error => filming.studio.setMessage(error instanceof Error ? error.message : 'Voice preview failed.')).finally(() => setWorking(false)); }}><Play className="size-3" />Listen to saved voice</button>
    <button className={button + ' w-full'} disabled={working || disabled || !selected || !languages.includes(language) || !cue.text.trim()} onClick={() => void run(false)}><Mic className="size-3" />{working ? 'Preparing dialogue…' : 'Generate scene dialogue'}</button>
    {cue.audio ? <button className={button + ' w-full'} disabled={working || disabled} onClick={() => void run(true)}><Play className="size-3" />Listen to scene line</button> : null}
    {cue.voice ? <p className="text-[10px] text-emerald-600">Attached: {cue.voice.name} · {cue.voice.language} · {cue.voice.voiceType === 'child' ? 'Child-style' : cue.voice.voiceType ?? 'Reference voice'}</p> : null}
  </section>;
}
