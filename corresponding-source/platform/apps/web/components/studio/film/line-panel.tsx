'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Activity, Armchair, ArrowRight, Cloud, Crosshair, Droplets, FileUp, Footprints, Hand, Info, Languages, LocateFixed, Mic, MoreHorizontal, Music, PartyPopper,
  PersonStanding, Play, Plus, Pointer, Rabbit, RefreshCw, Sparkles, Sun, Trash2, Waves, X, Zap, type LucideIcon } from 'lucide-react';
import { SCENE_ACTOR, SCENE_FX_ACTIONS, filmSettings, toSeconds, type FilmProject, type Media } from '@genvr/film';
import type { StudioFilming } from '../../../lib/use-studio-filming';
import { cueToSeconds, type SceneCue } from '../../../lib/video-studio/model';
import { mediaDuration } from '../../../lib/video-studio/render';
import { useSceneSelection } from '../../../lib/video-studio/scene-selection';
import { DragNumber } from './drag-number';
import { ContextMenu, type MenuItem } from './context-menu';

const button = 'inline-flex items-center justify-center gap-1.5 rounded-md border border-ink/10 bg-paper px-2.5 py-1.5 text-xs font-semibold hover:bg-ink/10 disabled:opacity-35';
const icon = 'inline-flex size-7 items-center justify-center rounded-md hover:bg-ink/10 disabled:opacity-35';
const input = 'w-full rounded-md border border-ink/10 bg-paper px-2 py-1.5 text-xs';
const chip = (on: boolean) => `inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[11px] font-semibold disabled:opacity-35 ${on ? 'border-ink bg-ink text-paper' : 'border-ink/10 bg-paper hover:bg-ink/10'}`;
const seg = (on: boolean) => `inline-flex h-7 min-w-7 items-center justify-center gap-1 rounded px-1.5 text-[11px] font-semibold disabled:opacity-35 ${on ? 'bg-ink text-paper' : 'hover:bg-ink/10'}`;
const Help = ({ text }: { text: string }) => <span title={text} aria-label={text} className="inline-flex text-ink/45"><Info className="size-3.5" /></span>;
type Spot = { x: number; z: number };
type SavedVoice = { id: string; name: string; language?: string; voiceType?: string; model: string };
type Model = { id: string; languages: string[] };

/** Clock time with tenths: 0:04.5. */
const clock = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
const spotText = (p: Spot) => `x ${p.x.toFixed(1)}, z ${p.z.toFixed(1)}`;
const sameSpot = (a: Spot, b: Spot) => Math.abs(a.x - b.x) < 0.005 && Math.abs(a.z - b.z) < 0.005;

/** A folding section (design rule 10): closed, it still shows its value. */
function Fold({ title, icon: Icon, value, open = true, help, children }: { title: string; icon: LucideIcon; value?: ReactNode; open?: boolean; help?: string; children: ReactNode }) {
  return <details open={open} className="group border-b border-ink/10">
    <summary className="flex h-9 cursor-pointer list-none items-center gap-2 px-3 text-xs font-bold [&::-webkit-details-marker]:hidden">
      <span className="text-ink/45 group-open:rotate-90">›</span><Icon className="size-3.5" />{title}{help ? <Help text={help} /> : null}
      {value !== undefined ? <span className="ml-auto flex min-w-0 items-center gap-1.5 truncate font-normal text-ink/55">{value}</span> : null}</summary>
    <div className="space-y-2 px-3 pb-3">{children}</div>
  </details>;
}

/** Common actions as icon tiles (design rule 4); keywords are matched against the action ids the avatar has. */
const COMMON: Array<[string, string, LucideIcon]> = [['wave', 'Wave', Hand], ['walk', 'Walk', Footprints], ['run', 'Run', Rabbit], ['sit', 'Sit', Armchair],
  ['point', 'Point', Pointer], ['dance', 'Dance', Music], ['clap', 'Clap', Sparkles]];
const FX_ICONS: Record<string, LucideIcon> = { fx_shake: Activity, fx_confetti: PartyPopper, fx_snow: Cloud, fx_bubbles: Droplets, fx_burst: Sun, fx_shockwave: Zap };
const OBJECT_ICONS: Record<string, LucideIcon> = { dance: Music, bob: Activity, spin: RefreshCw, sway: Waves, run: Rabbit };
const keyword = (word: string) => new RegExp(`(^|[.:/_-])${word}$`, 'i');

/** Where the cue lives: the draft of the next take, or a recorded shot. Times in seconds. */
function locate(project: FilmProject, cueId: string, shotMedia?: string): { media?: Media; cues: SceneCue[] } | null {
  if (shotMedia) {
    const media = project.media.find((m) => m.id === shotMedia);
    return media?.cues.some((c) => c.id === cueId) ? { media, cues: media.cues.map(cueToSeconds) } : null;
  }
  if (project.draft.some((c) => c.id === cueId)) return { cues: project.draft.map(cueToSeconds) };
  const media = project.media.find((m) => m.cues.some((c) => c.id === cueId));
  return media ? { media, cues: media.cues.map(cueToSeconds) } : null;
}

/**
 * Board 5: one scene cue (a line of dialogue and/or an action) on the right. Draft cues belong to the next take;
 * a recorded shot's cues are changed with `cues.set` on that shot (motion changes need a re-record).
 */
export function LinePanel({ filming, cueId, shotMedia, onClose }: { filming: StudioFilming; cueId: string; shotMedia?: string; onClose?: () => void }) {
  const studio = filming.studio, project = studio.project, off = filming.busy || studio.rendering;
  const chosenScene = useSceneSelection();
  const where = locate(project, cueId, shotMedia), cue = where?.cues.find((c) => c.id === cueId);
  const settings = filmSettings(project), languages = settings.languages;
  const line = (project.lines ?? []).find((l) => l.cue === cueId);
  const cueLang = cue?.voice?.language ?? languages[0]?.lang ?? '';
  const [lang, setLang] = useState(cueLang), [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [voices, setVoices] = useState<SavedVoice[]>([]), [models, setModels] = useState<Model[]>([]), [voiceId, setVoiceId] = useState(''), [working, setWorking] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null), importing = useRef(new Set<AbortController>());
  useEffect(() => { setLang(cueLang); }, [cueId, cueLang]);
  useEffect(() => () => { for (const c of importing.current) c.abort(); importing.current.clear(); }, [cueId]);
  useEffect(() => {
    if (!filming.voiceAvailable) return;
    let active = true;
    void filming.voiceLibrary().then((r) => { if (active) { setVoices(r.voices); setModels(r.models); } }).catch((e) => { if (active) studio.setMessage(e instanceof Error ? e.message : 'Voice library unavailable.'); });
    return () => { active = false; };
  }, [filming.voiceAvailable, studio.identity]);
  // The voice to make the line with: the one it has, else the character's AI voice for that language, else the actor's saved voice.
  useEffect(() => {
    if (!cue) return;
    if (cue.voice) { setVoiceId(cue.voice.id); return; }
    const member = (project.cast ?? []).find((c) => c.actor === cue.actor), cast = member?.voices[cueLang];
    if (cast?.kind === 'ai') { setVoiceId(cast.voiceId); return; }
    let active = true;
    void filming.selectedVoice(cue.actor).then((id) => { if (active) setVoiceId(id); }).catch(() => {});
    return () => { active = false; };
  }, [cueId, cue?.voice?.id, cue?.actor, cueLang]);
  useEffect(() => {
    if (!onClose) return;
    const esc = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape' && !(e.target as HTMLElement | null)?.closest('input,textarea,select')) onClose(); };
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  if (!where || !cue) return null;

  const media = where.media, recorded = Boolean(media), limit = media ? toSeconds(media.duration) : 30;
  const shotClip = media ? project.tracks.flatMap((t) => t.clips).find((c) => c.type === 'media' && c.media === media.id)?.id : undefined;
  const scene = media ? (project.scenes ?? []).find((s) => s.shots.includes(media.id)) : (project.scenes ?? []).find((s) => s.id === chosenScene);
  const spots = scene?.spots ?? [];
  const actors = filming.actors(), speakerOf = (id: string) => (project.cast ?? []).find((c) => c.actor === id)?.name ?? actors.find((a) => a.id === id)?.label ?? id;
  const isFx = cue.actor === SCENE_ACTOR, isSelf = cue.actor === 'self';

  const save = (next: SceneCue[]) => {
    if (media) return studio.run('cues.set', { media: media.id, cues: next }).ok;
    try { studio.setPlan(next); return true; } catch (e) { studio.setMessage(e instanceof Error ? e.message : 'Could not change the cue.'); return false; }
  };
  const update = (patch: Partial<SceneCue>) => save(where.cues.map((c) => c.id === cue.id ? { ...c, ...patch } : c));
  const remove = () => { if (save(where.cues.filter((c) => c.id !== cue.id))) onClose?.(); };

  // Words: the cue holds the spoken words of one language; the script line (when there is one) holds every language.
  const wordsOf = (l: string) => l === cueLang ? cue.text : line?.text[l] ?? '';
  const setWords = (l: string, text: string) => {
    if (text === wordsOf(l)) return;
    if (l !== cueLang) { if (line) studio.run('line.set', { line: line.id, text: { [l]: text } }); return; }
    // New words drop the old voice (it said the old words), as in the scene editor.
    const next = where.cues.map((c) => c.id === cue.id ? { ...c, text, audio: undefined, voice: undefined } : c);
    if (!line) { save(next); return; }
    studio.batch([{ id: 'line.set', args: { line: line.id, text: { [l]: text } } }, { id: 'cues.set', args: { ...(media ? { media: media.id } : {}), cues: next } }], { label: 'Change line' });
  };

  // Actions this actor can do (same lists as the take checks).
  const fullList: Array<{ id: string; label: string }> = isSelf ? filming.actions.filter((a) => !a.id.startsWith('face:'))
    : isFx ? [...SCENE_FX_ACTIONS] : ['dance', 'bob', 'spin', 'sway', 'run'].map((id) => ({ id, label: id === 'run' ? 'run (walk its spots faster)' : id }));
  const tiles: Array<{ id: string; label: string; Icon: LucideIcon }> = [{ id: 'none', label: isFx ? 'No effect' : 'Idle · no movement', Icon: isFx ? X : PersonStanding },
    ...(isSelf ? COMMON.flatMap(([word, label, Icon]) => { const found = fullList.find((a) => keyword(word).test(a.id) || a.label.toLowerCase() === word); return found ? [{ id: found.id, label, Icon }] : []; })
      : fullList.map((a) => ({ id: a.id, label: a.label, Icon: (isFx ? FX_ICONS[a.id] : OBJECT_ICONS[a.id]) ?? Sparkles })))];
  const faces = isSelf ? filming.actions.filter((a) => a.id.startsWith('face:')) : [];
  const actionLabel = cue.action === 'none' ? (isFx ? 'no effect' : 'idle') : filming.actions.find((a) => a.id === cue.action)?.label ?? fullList.find((a) => a.id === cue.action)?.label ?? cue.action;

  // Places (FILM-10): start spot and walk-to spots, by the scene's named spots or by x / z.
  const nameOf = (p: Spot) => spots.find((s) => sameSpot(s, p))?.name;
  const placeText = (p: Spot) => nameOf(p) ? `${nameOf(p)} (${spotText(p)})` : spotText(p);
  const here = () => { const p = filming.avatarSpot(); if (!p) { studio.setMessage('The avatar is not in the world yet.'); return null; } return p; };
  const pick = (use: (p: Spot) => void) => void filming.pickSpot().then((p) => { if (p) use(p); });
  const path = cue.to ?? [];
  const setPath = (next: Spot[]) => update({ to: next.length ? next.slice(0, 8) : undefined });

  // Voice (scene dialogue): play the attached audio, or make it again with a saved voice.
  const profile = voices.find((v) => v.id === voiceId), modelLanguages = models.find((m) => m.id === profile?.model)?.languages ?? [];
  const voiceOp = async (preview: boolean) => {
    setWorking(true);
    try {
      await filming.handleStudio(preview ? { kind: 'dialogue_preview', cue_id: cue.id, ...(shotClip ? { shot_id: shotClip } : {}) }
        : { kind: 'dialogue_voice', cue_id: cue.id, voice_id: voiceId, language: cueLang, ...(shotClip ? { shot_id: shotClip } : {}) }, new AbortController().signal);
    } catch (e) { studio.setMessage(e instanceof Error ? e.message : 'Scene voice failed.'); }
    finally { setWorking(false); }
  };
  const noShot = recorded && !shotClip ? 'Put this shot on the timeline first.' : null;
  const makeWhy = !filming.voiceAvailable ? 'Connect the local voice service first.' : noShot ?? (!voiceId ? 'Choose a saved voice.' : !cue.text.trim() ? 'Write the words first.'
    : profile && cueLang && !modelLanguages.includes(cueLang) ? `This voice cannot speak ${cueLang.toUpperCase()}.` : null);
  const playWhy = noShot ?? (!cue.audio ? 'Make or import the voice first.' : null);
  const importAudio = (file: File) => {
    const controller = new AbortController(); importing.current.add(controller);
    void mediaDuration(file, controller.signal).then((duration) => {
      if (controller.signal.aborted) return;
      if (duration > 180) throw new Error('Choose audio up to 180 seconds.');
      update({ audio: studio.addAudio(file), voice: undefined });
    }).catch((e) => { if (!controller.signal.aborted) studio.setMessage(e instanceof Error ? e.message : 'Audio could not be decoded.'); })
      .finally(() => importing.current.delete(controller));
  };

  const items: MenuItem[] = [
    { label: 'Play voice', icon: Play, run: () => void voiceOp(true), disabled: Boolean(playWhy) || working, ...(playWhy ? { why: playWhy } : {}) },
    { label: 'Import voice file', icon: FileUp, run: () => fileInput.current?.click(), disabled: off || isFx },
    { label: 'Captions & dubbing', icon: Languages, run: () => studio.setWorkspace('captions') },
    'divider',
    { label: 'Delete cue', icon: Trash2, run: remove, danger: true, keys: 'Del', disabled: off },
  ];
  const summary = [actionLabel, `${cue.start.toFixed(1)}–${cue.end.toFixed(1)} s`, cue.at ? placeText(cue.at) : null, path.length ? `→ ${path.map(placeText).join(' → ')}` : null,
    cue.action.startsWith('face:') ? cue.action.replace('face:', 'face ') : null, cue.volume !== 1 ? `vol ${Math.round(cue.volume * 100)} %` : null].filter(Boolean).join(' · ');

  return <div className="text-xs text-ink" aria-label={`Cue ${cue.label}`}>
    <input ref={fileInput} type="file" accept="audio/*" className="hidden" aria-label={`Voice file for ${cue.label}`} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importAudio(f); }} />
    <div className="flex items-start gap-2 border-b border-ink/10 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-ink/50">{cue.text.trim() ? 'Line' : 'Cue'}{recorded ? ` · ${media!.name}` : ' · next take'}
          {recorded ? <Help text="A recorded shot: words, voice and volume change now; a new action or place needs a re-record of the shot." /> : null}</div>
        <select aria-label="Speaker" title="Who says or does it" disabled={off} className="-ml-1 max-w-full rounded bg-transparent px-1 text-sm font-bold hover:bg-ink/5"
          value={cue.actor} onChange={(e) => { const actor = e.target.value; const fx = actor === SCENE_ACTOR || isFx; update({ actor, label: speakerOf(actor), ...(fx ? { action: 'none', at: undefined, to: undefined } : {}) }); }}>
          {actors.some((a) => a.id === cue.actor) ? null : <option value={cue.actor}>{cue.label}</option>}
          {actors.map((a) => <option key={a.id} value={a.id}>{speakerOf(a.id)}{cue.text.trim() && a.id !== SCENE_ACTOR ? ' says' : ''}</option>)}
        </select>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <DragNumber label="Start" value={cue.start} min={0} max={Math.max(0, cue.end - 0.1)} step={0.1} unit="s" width="w-24" disabled={off} commit={(start) => update({ start })} />
          <ArrowRight className="size-3.5 text-ink/45" />
          <DragNumber label="End" value={cue.end} min={cue.start + 0.1} max={limit} step={0.1} unit="s" width="w-24" disabled={off} commit={(end) => update({ end })} />
          <span className="font-mono text-[11px] text-ink/55" title={`${clock(cue.start)} → ${clock(cue.end)}`}>· {(cue.end - cue.start).toFixed(1)} s</span>
        </div>
      </div>
      <button type="button" className={icon} aria-label="More" title="More — same menu as right-click" onClick={(e) => setMenu({ x: e.clientX, y: e.clientY })}><MoreHorizontal className="size-4" /></button>
      {onClose ? <button type="button" className={icon} aria-label="Close" title="Close (Esc)" onClick={onClose}><X className="size-4" /></button> : null}
    </div>
    {menu ? <ContextMenu at={menu} items={items} close={() => setMenu(null)} title={cue.label} /> : null}

    {!isFx ? <Fold title="Words & voice" icon={Mic} value={<>{cueLang ? <b className="rounded bg-ink/10 px-1 text-[10px]">{cueLang.toUpperCase()}</b> : null}<span className="truncate">{cue.text.trim() ? `${cue.text.trim().slice(0, 24)}${cue.text.trim().length > 24 ? '…' : ''}` : 'no words'}</span></>}
      help="One language at a time. The cue speaks its own language; the other languages live in the script line made from it.">
      {languages.length > 1 ? <div role="radiogroup" aria-label="Language" className="flex flex-wrap items-center gap-1">
        {languages.map((l) => { const has = Boolean(wordsOf(l.lang).trim());
          return <button key={l.lang} type="button" role="radio" aria-checked={lang === l.lang} className={chip(lang === l.lang)} title={`${l.lang.toUpperCase()} · ${has ? 'written' : 'missing'}${l.lang === cueLang ? ' · spoken in this cue' : ''}`}
            onClick={() => setLang(l.lang)}>{l.lang.toUpperCase()}<span className={`size-1.5 rounded-full ${has ? 'bg-green-500' : 'bg-amber-400'}`} /></button>; })}
        <button type="button" className={`${icon} ml-auto`} aria-label="Translate the missing languages" title="Translate the missing languages (Captions & dubbing)" onClick={() => studio.setWorkspace('captions')}><Languages className="size-3.5" /></button>
      </div> : null}
      <textarea key={`${cue.id}:${lang}:${wordsOf(lang)}`} aria-label={`Words ${lang.toUpperCase()}`} dir="auto" rows={3} maxLength={500} className={input} defaultValue={wordsOf(lang)}
        disabled={off || (lang !== cueLang && !line)} title={lang !== cueLang && !line ? 'Only the spoken language: this cue has no script line for translations.' : undefined}
        placeholder={lang !== cueLang && !line ? 'No script line for this cue' : 'What the character says…'} onBlur={(e) => setWords(lang, e.target.value)} />
      <div className="flex items-center gap-1">
        <Mic className="size-3.5 text-ink/50" />
        <span className="min-w-0 flex-1 truncate text-ink/70" title={cue.voice ? `${cue.voice.name} · ${cue.voice.language}` : cue.audio ? 'Imported sound file' : 'No voice yet'}>
          {cue.voice ? `${cue.voice.name} · ${cue.voice.language.toUpperCase()}` : cue.audio ? 'Sound file' : 'No voice yet'} · {(cue.end - cue.start).toFixed(1)} s</span>
        <span className={`size-1.5 rounded-full ${cue.audio ? 'bg-green-500' : cue.text.trim() ? 'bg-amber-400' : 'bg-ink/25'}`} title={cue.audio ? 'voice ready' : 'voice missing'} />
        <button type="button" className={icon} aria-label="Play" title={playWhy ?? 'Play'} disabled={Boolean(playWhy) || working} onClick={() => void voiceOp(true)}><Play className="size-3.5" /></button>
        <button type="button" className={icon} aria-label="Make the voice again" title={makeWhy ?? 'Make the voice again'} disabled={Boolean(makeWhy) || working || off} onClick={() => void voiceOp(false)}>
          <RefreshCw className={`size-3.5 ${working ? 'animate-spin' : ''}`} /></button>
        <button type="button" className={icon} aria-label="Import voice file" title="Import a sound file for this line" disabled={off} onClick={() => fileInput.current?.click()}><FileUp className="size-3.5" /></button>
      </div>
      {filming.voiceAvailable ? <div className="flex items-center gap-1">
        <select aria-label="Saved voice" className={input} value={voiceId} disabled={off || working} onChange={(e) => setVoiceId(e.target.value)}>
          <option value="">Choose a saved voice</option>
          {voices.map((v) => <option key={v.id} value={v.id}>{v.name}{v.language ? ` · ${v.language}` : ''}</option>)}
        </select>
        <button type="button" className={icon} aria-label="Listen to saved voice" title="Listen to the saved voice" disabled={!voiceId || working}
          onClick={() => { setWorking(true); void filming.previewSavedVoice(voiceId).catch((e) => studio.setMessage(e instanceof Error ? e.message : 'Voice preview failed.')).finally(() => setWorking(false)); }}><Play className="size-3.5" /></button>
      </div> : null}
      <DragNumber label="Volume" value={Math.round(cue.volume * 100)} min={0} max={200} step={1} unit="%" width="w-full" disabled={off} commit={(v) => update({ volume: v / 100 })} />
    </Fold> : null}

    <Fold title={isFx ? 'Effect' : 'Action'} icon={isFx ? Sparkles : PersonStanding} value={actionLabel}>
      <div role="radiogroup" aria-label="Action" className="grid grid-cols-4 gap-1">
        {tiles.map(({ id, label, Icon }) => <button key={id} type="button" role="radio" aria-checked={cue.action === id} aria-label={label} title={label} disabled={off}
          className={`flex h-10 items-center justify-center rounded-md border ${cue.action === id ? 'border-ink bg-ink text-paper' : 'border-ink/10 bg-paper hover:bg-ink/10'} disabled:opacity-35`}
          onClick={() => update({ action: id })}><Icon className="size-4" /></button>)}
      </div>
      <select aria-label="All actions" className={input} value={cue.action} disabled={off} onChange={(e) => update({ action: e.target.value })}>
        <option value="none">{isFx ? 'No effect' : 'No movement'}</option>
        {fullList.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        {isSelf ? faces.map((a) => <option key={a.id} value={a.id}>{a.label}</option>) : null}
        {cue.action !== 'none' && !fullList.some((a) => a.id === cue.action) && !faces.some((a) => a.id === cue.action) ? <option value={cue.action}>{cue.action}</option> : null}
      </select>
    </Fold>

    {!isFx ? <Fold title="Places" icon={Footprints} value={`${cue.at ? nameOf(cue.at) ?? 'spot' : 'where it stands'}${path.length ? ` → ${path.length}` : ''}`}
      help={isSelf ? 'Pick, then click the ground in the world; or Here for where your avatar stands. Named spots come from the scene.' : 'Pick, then click the ground in the world. The object walks there (Run: faster).'}>
      <div className="space-y-1">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-ink/50">Start</div>
        <div className="flex flex-wrap items-center gap-1">
          <div role="radiogroup" aria-label="Start spot" className="inline-flex flex-wrap gap-0.5 rounded-md border border-ink/10 p-0.5">
            <button type="button" role="radio" aria-checked={!cue.at} title="Where it stands" disabled={off} className={seg(!cue.at)} onClick={() => update({ at: undefined })}>Stands</button>
            {spots.map((s) => <button key={s.name} type="button" role="radio" aria-checked={Boolean(cue.at && sameSpot(cue.at, s))} title={`${s.name} · ${spotText(s)}`} disabled={off}
              className={seg(Boolean(cue.at && sameSpot(cue.at, s)))} onClick={() => update({ at: { x: s.x, z: s.z } })}>{s.name}</button>)}
          </div>
          <button type="button" className={icon} aria-label="Pick a spot" title="Pick a spot in the world" disabled={off} onClick={() => pick((p) => update({ at: p }))}><Crosshair className="size-3.5" /></button>
          {isSelf ? <button type="button" className={icon} aria-label="Here" title="Here (where the avatar stands)" disabled={off} onClick={() => { const p = here(); if (p) update({ at: p }); }}><LocateFixed className="size-3.5" /></button> : null}
        </div>
        {cue.at ? <div className="flex gap-1">
          <DragNumber label="x" value={cue.at.x} step={0.1} min={-100000} max={100000} width="w-full" disabled={off} commit={(x) => update({ at: { ...cue.at!, x } })} />
          <DragNumber label="z" value={cue.at.z} step={0.1} min={-100000} max={100000} width="w-full" disabled={off} commit={(z) => update({ at: { ...cue.at!, z } })} />
        </div> : null}
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-ink/50">Walk to<span className="font-normal normal-case">{path.length ? `· ${path.length} of 8` : '· nowhere'}</span>
          {path.length ? <button type="button" className="ml-auto text-[10px] font-semibold normal-case text-ink/60 underline" disabled={off} onClick={() => setPath([])}>Clear</button> : null}</div>
        {path.map((p, i) => <div key={i} className="flex items-center gap-1">
          <b className="w-4 text-center text-[10px] text-ink/50" title={nameOf(p)}>{i + 1}</b>
          <DragNumber label="x" value={p.x} step={0.1} min={-100000} max={100000} width="w-full" disabled={off} commit={(x) => setPath(path.map((q, j) => j === i ? { ...q, x } : q))} />
          <DragNumber label="z" value={p.z} step={0.1} min={-100000} max={100000} width="w-full" disabled={off} commit={(z) => setPath(path.map((q, j) => j === i ? { ...q, z } : q))} />
          <button type="button" className={icon} aria-label={`Remove spot ${i + 1}`} title="Remove" disabled={off} onClick={() => setPath(path.filter((_, j) => j !== i))}><X className="size-3.5" /></button>
        </div>)}
        <div className="flex flex-wrap items-center gap-1">
          {spots.map((s) => <button key={s.name} type="button" className={chip(false)} disabled={off || path.length >= 8} title={`Walk to ${s.name} · ${spotText(s)}`}
            onClick={() => setPath([...path, { x: s.x, z: s.z }])}><Plus className="size-3" />{s.name}</button>)}
          <button type="button" className={icon} aria-label="Pick a walk-to spot" title="Pick a spot in the world" disabled={off || path.length >= 8} onClick={() => pick((p) => setPath([...path, p]))}><Crosshair className="size-3.5" /></button>
          {isSelf ? <button type="button" className={icon} aria-label="Walk to here" title="Here (where the avatar stands)" disabled={off || path.length >= 8} onClick={() => { const p = here(); if (p) setPath([...path, p]); }}><LocateFixed className="size-3.5" /></button> : null}
        </div>
      </div>
    </Fold> : null}

    {faces.length ? <Fold title="Face" icon={Hand} value={cue.action.startsWith('face:') ? cue.action.slice(5) : 'as the action'} open={cue.action.startsWith('face:')}
      help="A cue has one action: a move or a face. For both, add a second cue at the same time.">
      <div role="radiogroup" aria-label="Face" className="flex flex-wrap gap-1">
        {faces.map((a) => <button key={a.id} type="button" role="radio" aria-checked={cue.action === a.id} disabled={off} className={chip(cue.action === a.id)}
          onClick={() => update({ action: cue.action === a.id ? 'none' : a.id })}>{a.id.slice(5)}</button>)}
      </div>
    </Fold> : null}

    <p className="break-words px-3 py-2 font-mono text-[10px] text-ink/55" aria-label="Cue summary">{summary}</p>
  </div>;
}
