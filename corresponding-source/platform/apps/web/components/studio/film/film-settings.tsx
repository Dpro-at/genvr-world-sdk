'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, Bot, Captions, Clapperboard, Film, Info, Languages, Lock, Mic, Search, Settings2, Trash2, Type, Volume2, X } from 'lucide-react';
import { filmSettings, languageStatus, type FilmSettings as Settings } from '@genvr/film';
import type { StudioFilming } from '../../../lib/use-studio-filming';
import { SUBTITLE_LANGUAGES } from '../../../lib/video-studio/subtitles';
import { DragNumber } from './drag-number';

const button = 'inline-flex items-center justify-center gap-1.5 rounded-md border border-ink/10 bg-paper px-2.5 py-1.5 text-xs font-semibold hover:bg-ink/10 disabled:opacity-35';
const input = 'mt-1 w-full rounded-md border border-ink/10 bg-paper px-2 py-1.5 text-xs';
const SIZES = [['1920x1080', 'Full HD', '1920×1080'], ['1280x720', 'HD', '1280×720'], ['3840x2160', '4K', '3840×2160'], ['1080x1920', 'Portrait', '1080×1920']] as const;

type SectionKey = 'film' | 'languages' | 'story' | 'director' | 'video' | 'sound' | 'caption' | 'titles';
const SECTIONS: Array<{ key: SectionKey; label: string; icon: typeof Film; soon?: boolean }> = [
  { key: 'film', label: 'Film or series', icon: Clapperboard }, { key: 'languages', label: 'Languages', icon: Languages },
  { key: 'story', label: 'Story', icon: BookOpen }, { key: 'director', label: 'AI director', icon: Bot, soon: true },
  { key: 'video', label: 'Video', icon: Film }, { key: 'sound', label: 'Sound', icon: Volume2 },
  { key: 'caption', label: 'Caption look', icon: Captions }, { key: 'titles', label: 'Titles & credits', icon: Type, soon: true },
];

const Help = ({ text }: { text: string }) => <span title={text} aria-label={text} className="inline-flex text-ink/50"><Info className="size-3.5" /></span>;
/** Two to four choices as one segmented control (design rule 3). */
function Segment<T extends string>({ label, value, options, onChange, disabled }: { label: string; value: T; options: ReadonlyArray<readonly [T, string]>; onChange: (v: T) => void; disabled?: boolean }) {
  return <div role="radiogroup" aria-label={label} className="inline-flex gap-0.5 rounded-md border border-ink/10 bg-paper p-0.5">
    {options.map(([v, text]) => <button key={v} type="button" role="radio" aria-checked={value === v} disabled={disabled}
      className={`rounded px-2.5 py-1 text-xs font-semibold disabled:opacity-35 ${value === v ? 'bg-ink text-paper' : 'hover:bg-ink/10'}`} onClick={() => onChange(v)}>{text}</button>)}
  </div>;
}
/** On / off inside a settings window (design rule 2 allows switches here). */
function Switch({ label, help, checked, onChange, disabled, id }: { label: string; help?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; id?: string }) {
  return <label className="flex items-center justify-between gap-3 py-1.5 text-xs" data-film-id={id}>
    <span className="flex items-center gap-1.5">{label}{help ? <Help text={help} /> : null}</span>
    <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="size-4" />
  </label>;
}

/** The value a closed section shows in the side list (design rule 10). */
function summary(key: SectionKey, s: Settings, size: string) {
  switch (key) {
    case 'film': return `${s.kind === 'series' ? 'Series' : 'Film'}${s.name ? ` · ${s.name}` : ''}`;
    case 'languages': return s.languages.length ? s.languages.map((l) => l.lang.toUpperCase()).join(' · ') : 'none yet';
    case 'story': return s.story ? `${s.story.slice(0, 26)}${s.story.length > 26 ? '…' : ''}` : 'empty';
    case 'director': return { auto: 'Fully automatic', end: 'Check at the end', each: 'Each step' }[s.director.autonomy];
    case 'video': return `${SIZES.find(([v]) => v === size)?.[1] ?? size} · new shot ${s.shotSeconds} s`;
    case 'sound': return `World ${s.worldSound ? 'on' : 'off'} · room ${s.roomVoices ? 'on' : 'off'}`;
    case 'caption': return `${s.caption.size} · ${s.caption.place}${s.caption.inExport ? ' · in export' : ''}`;
    case 'titles': return [s.titles.intro && 'intro', s.titles.episodeCard && 'title card', s.titles.credits && 'credits'].filter(Boolean).join(' · ') || 'none';
  }
}

/**
 * Film settings (FILM-A2, boards 11 and 11a–g): things set once for the whole film or series, one section at a
 * time with its value shown in the list. Every change is the `project.settings` command, so it can be undone and
 * agents make the same change through MCP.
 */
export function FilmSettings({ filming, close }: { filming: StudioFilming; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), studio = filming.studio, disabled = filming.busy || studio.rendering;
  const [open, setOpen] = useState<SectionKey>('languages'), [find, setFind] = useState('');
  const [error, setError] = useState(''), [making, setMaking] = useState(false), [how, setHow] = useState<'ai' | 'hand'>('ai');
  useEffect(() => { dialog.current?.showModal(); }, []);
  const s = filmSettings(studio.project);
  const set = (patch: Record<string, unknown>) => {
    const result = studio.run('project.settings', patch);
    setError(result.ok ? '' : result.reason);
  };
  const status = languageStatus(studio.project), gaps = status.filter((row) => row.missing.length);
  const MISSING: Record<string, string> = { captions: 'captions', voice: 'voice', words: 'script words' };
  /** FILM-B3: the same job agents run through MCP (studio_action kind "language"). */
  const makeMissing = async () => {
    if (how === 'hand') { studio.setWorkspace('captions'); dialog.current?.close(); return; }
    setMaking(true); setError('');
    try {
      const blob = await filming.handleStudio({ kind: 'language', action: 'make_missing', what: 'both' }, new AbortController().signal);
      const reply = JSON.parse(await blob.text()) as { result?: { done: Array<{ lang: string; made: string }>; skipped: Array<{ lang: string; reason: string }> } };
      const done = reply.result?.done ?? [], skipped = reply.result?.skipped ?? [];
      setError([done.length ? `Made: ${done.map((d) => `${d.lang.toUpperCase()} ${d.made}`).join(', ')}.` : '', ...skipped.map((x) => `${x.lang.toUpperCase()}: ${x.reason}`)].filter(Boolean).join(' '));
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not make the missing parts.'); }
    finally { setMaking(false); }
  };
  const languageCounts = (lang: string) => {
    const captions = studio.project.tracks.find((t) => t.kind === 'caption' && t.lang === lang)?.clips.length ?? 0;
    const voice = studio.project.tracks.some((t) => t.kind === 'sound' && t.lang === lang);
    return { captions, voice };
  };
  const shown = SECTIONS.filter((x) => !find.trim() || `${x.label} ${summary(x.key, s, filming.output.size)}`.toLowerCase().includes(find.trim().toLowerCase()));
  const unused = SUBTITLE_LANGUAGES.filter((l) => !s.languages.some((x) => x.lang === l.code));
  const body: Record<SectionKey, ReactNode> = {
    film: <div className="space-y-3">
      <Segment label="Film or series" value={s.kind} disabled={disabled} options={[['film', 'Film'], ['series', 'Series']]} onChange={(kind) => set({ kind })} />
      <label className="block text-xs text-ink/60">Name<input aria-label="Film name" className={input} maxLength={80} value={s.name} disabled={disabled} onChange={(e) => set({ name: e.target.value })} /></label>
      {studio.mode === 'gameplay' ? <div className="rounded-md border border-ink/10 p-2 text-xs"><p className="mb-2 text-ink/70">This project was made as a gameplay recording. Filming is now for films and series only.</p>
        <button className={button} disabled={disabled} onClick={() => studio.setMode('production')}><Film className="size-3.5" />Make it a film</button></div> : null}
    </div>,
    languages: <div className="space-y-2">
      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 gap-y-1.5 text-xs">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-ink/50">Language</span><span className="text-[10px] font-semibold uppercase tracking-wide text-ink/50">We provide</span><span />
        {s.languages.map((row, i) => { const info = SUBTITLE_LANGUAGES.find((l) => l.code === row.lang), count = languageCounts(row.lang);
          return <div key={row.lang} className="contents">
            <span className="flex items-center gap-2"><b className="rounded bg-ink/10 px-1.5 py-0.5 text-[10px]">{row.lang.toUpperCase()}</b>{info?.label ?? row.lang}{i === 0 ? <span className="text-ink/50">main</span> : null}
              <span className="text-ink/50" title={`${count.captions} captions${count.voice ? ', voice track' : ''}`}>· {count.captions} <Captions className="inline size-3" />{count.voice ? <Mic className="ml-1 inline size-3" /> : null}</span>
              {(() => { const gap = status.find((x) => x.lang === row.lang)?.missing ?? []; return <span title={gap.length ? `Missing: ${gap.map((g) => MISSING[g]).join(', ')}` : 'Complete'}
                className={`inline-block size-1.5 rounded-full ${gap.length ? 'bg-amber-400' : 'bg-green-500'}`} aria-label={gap.length ? `Missing: ${gap.map((g) => MISSING[g]).join(', ')}` : 'Complete'} />; })()}</span>
            <Segment label={`${row.lang} level`} value={row.level} disabled={disabled} options={[['text', 'Text'], ['text_voice', 'Text + voice']]}
              onChange={(level) => set({ languages: s.languages.map((x) => x.lang === row.lang ? { ...x, level } : x) })} />
            <button type="button" className={button} aria-label={`Remove ${info?.label ?? row.lang}`} title="Remove from the film settings (captions and voices stay on the timeline)" disabled={disabled}
              onClick={() => set({ languages: s.languages.filter((x) => x.lang !== row.lang) })}><Trash2 className="size-3.5" /></button>
          </div>; })}
      </div>
      {gaps.length ? <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-400/40 p-2 text-xs">
        <span className="flex-1">{gaps.map((g) => `${g.lang.toUpperCase()}: ${g.missing.map((m) => MISSING[m]).join(', ')}`).join(' · ')}</span>
        <Segment label="Make them" value={how} disabled={disabled || making} options={[['ai', 'AI'], ['hand', 'By hand']]} onChange={setHow} />
        <button type="button" className={button} disabled={disabled || making} onClick={() => void makeMissing()}>{making ? 'Making…' : 'Make the missing parts'}</button>
      </div> : null}
      {!s.languages.length ? <p className="text-xs text-ink/60">Add the languages of this film. The first one is the main language, the one you record in.</p> : null}
      <div className="flex items-center gap-2">
        <select aria-label="Add a language" className={`${input} mt-0 flex-1`} disabled={disabled || !unused.length || s.languages.length >= 12} value=""
          onChange={(e) => { if (e.target.value) set({ languages: [...s.languages, { lang: e.target.value, level: 'text' }] }); }}>
          <option value="">+ Add language…</option>{unused.map((l) => <option key={l.code} value={l.code}>{l.label} · {l.native}</option>)}
        </select>
        <button className={button} onClick={() => { studio.setWorkspace('captions'); dialog.current?.close(); }}><Languages className="size-3.5" />Captions &amp; dubbing</button>
      </div>
    </div>,
    story: <label className="block text-xs text-ink/60"><span className="flex items-center gap-1.5">Story of the {s.kind}<Help text="Agents read this story before they write any line." /></span>
      <textarea aria-label="Story" rows={8} maxLength={4000} className={input} value={s.story} disabled={disabled} onChange={(e) => set({ story: e.target.value })} /></label>,
    director: <div className="space-y-3 text-xs">
      <p className="rounded-md bg-ink/5 p-2 text-ink/70">The AI director comes in a later step. You can already choose how much it may decide alone; agents read this through MCP.</p>
      <Segment label="Decides alone" value={s.director.autonomy} disabled={disabled} options={[['auto', 'Fully automatic'], ['end', 'Check at the end'], ['each', 'Each step']]} onChange={(autonomy) => set({ director: { autonomy } })} />
      <p className="flex items-center gap-1.5 text-ink/60"><Lock className="size-3.5" />Never publishes or shares alone.</p>
    </div>,
    video: <div className="space-y-3">
      <div role="radiogroup" aria-label="Video size" className="grid grid-cols-4 gap-2">
        {SIZES.map(([v, name, px]) => { const [w, h] = v.split('x').map(Number) as [number, number];
          return <button key={v} type="button" role="radio" aria-checked={filming.output.size === v} disabled={disabled}
            className={`flex flex-col items-center gap-1 rounded-md border p-2 text-xs ${filming.output.size === v ? 'border-ink bg-ink/10' : 'border-ink/10 hover:bg-ink/5'}`}
            onClick={() => { filming.setOutput({ ...filming.output, size: v }); studio.run('project.size', { width: w, height: h }); }}>
            <span className="rounded-sm border border-ink/40" style={{ width: w > h ? 34 : 18, height: w > h ? 19 : 32 }} /><b>{name}</b><span className="text-ink/50">{px}</span></button>; })}
      </div>
      <div className="flex items-center gap-2 text-xs text-ink/60"><DragNumber label="New shot" value={s.shotSeconds} min={1} max={30} step={1} unit="s" width="w-36" disabled={disabled} commit={(shotSeconds) => set({ shotSeconds })} />
        <Help text="How long a new shot records; a shot can be up to 30 seconds." /></div>
    </div>,
    sound: <div className="divide-y divide-ink/10">
      <Switch id="film.record.sound" label="Record the world's sound" help="Rain, wind, steps and other sounds of the world go into each take." checked={s.worldSound} disabled={disabled} onChange={(worldSound) => set({ worldSound })} />
      <Switch id="film.record.actors" label="Record the voices of people in the room" help="People in this place's room are asked if their microphone may be recorded; their voices come back under the shot, one track each." checked={s.roomVoices} disabled={disabled} onChange={(roomVoices) => set({ roomVoices })} />
    </div>,
    caption: <div className="space-y-3 text-xs">
      <div className="flex flex-wrap items-center gap-3"><span className="w-12 text-ink/60">Size</span><Segment label="Caption size" value={s.caption.size} disabled={disabled} options={[['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']]} onChange={(size) => set({ caption: { size } })} /></div>
      <div className="flex flex-wrap items-center gap-3"><span className="w-12 text-ink/60">Place</span><Segment label="Caption place" value={s.caption.place} disabled={disabled} options={[['bottom', 'Bottom'], ['top', 'Top']]} onChange={(place) => set({ caption: { place } })} /></div>
      <Switch label="Show captions in the export" checked={s.caption.inExport} disabled={disabled} onChange={(inExport) => set({ caption: { inExport } })} />
      <div className="relative h-24 overflow-hidden rounded-md bg-neutral-700" aria-label="Caption preview">
        <span className={`absolute left-1/2 -translate-x-1/2 rounded bg-black/70 px-2 py-0.5 text-white ${s.caption.place === 'top' ? 'top-2' : 'bottom-2'} ${s.caption.size === 'small' ? 'text-[10px]' : s.caption.size === 'large' ? 'text-base' : 'text-xs'}`}>Welcome to our island</span>
      </div>
      <p className="text-ink/50">Size and place apply to the program view and the export. Colours and box of the captions are in Captions › Look.</p>
    </div>,
    titles: <div className="space-y-2 text-xs">
      <p className="rounded-md bg-ink/5 p-2 text-ink/70">These are saved now; the export adds them automatically in a later step. Until then add titles with Add › Title.</p>
      <div className="divide-y divide-ink/10">
        <Switch label="Intro in every episode" checked={s.titles.intro} disabled={disabled} onChange={(intro) => set({ titles: { intro } })} />
        <Switch label="Episode title card" checked={s.titles.episodeCard} disabled={disabled} onChange={(episodeCard) => set({ titles: { episodeCard } })} />
        <Switch label="End credits" checked={s.titles.credits} disabled={disabled} onChange={(credits) => set({ titles: { credits } })} />
      </div>
      {s.titles.credits ? <label className="block text-ink/60">Credits text<textarea aria-label="Credits text" rows={4} maxLength={2000} className={input} value={s.titles.creditsText} disabled={disabled} onChange={(e) => set({ titles: { creditsText: e.target.value } })} /></label> : null}
    </div>,
  };
  const current = SECTIONS.find((x) => x.key === open)!, CurrentIcon = current.icon;
  return createPortal(<dialog ref={dialog} aria-label="Film settings" onClose={close} onCancel={close}
    className="m-auto h-[min(40rem,85vh)] w-[min(56rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-ink/20 bg-paper p-0 text-ink shadow-xl backdrop:bg-black/60">
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-ink/10 px-4 py-3"><Settings2 className="size-4" /><h2 className="text-sm font-semibold">Film settings</h2>
        <Help text="Set these once; they apply to the whole film. Agents read and change the same settings through MCP." />
        <span className="flex-1" />
        <label className="relative"><Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-ink/50" /><input aria-label="Find a setting" placeholder="Find a setting" className="w-44 rounded-md border border-ink/10 bg-paper py-1.5 pl-7 pr-2 text-xs" value={find} onChange={(e) => setFind(e.target.value)} /></label>
        <button className={button} aria-label="Close film settings" onClick={() => dialog.current?.close()}><X className="size-3.5" /></button></div>
      <div className="flex min-h-0 flex-1">
        <nav aria-label="Film settings sections" className="w-56 shrink-0 space-y-0.5 overflow-y-auto border-r border-ink/10 p-2">
          {shown.map(({ key, label, icon: Icon, soon }) => <button key={key} type="button" aria-current={open === key} onClick={() => setOpen(key)}
            className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs ${open === key ? 'bg-ink/10 ring-1 ring-ink/30' : 'hover:bg-ink/5'}`}>
            <Icon className="mt-0.5 size-3.5 shrink-0" /><span className="min-w-0"><b className="block">{label}{soon ? <span className="ml-1 rounded bg-ink/10 px-1 text-[9px] font-semibold uppercase text-ink/60">soon</span> : null}</b>
              <span className="block truncate text-ink/55">{summary(key, s, filming.output.size)}</span></span></button>)}
          {!shown.length ? <p className="p-2 text-xs text-ink/50">No setting matches.</p> : null}
        </nav>
        <section aria-label={current.label} className="min-w-0 flex-1 overflow-y-auto p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><CurrentIcon className="size-4" />{current.label}</h3>
          {body[open]}
          {error ? <p role="status" className="mt-3 text-xs text-ink/70">{error}</p> : null}
        </section>
      </div>
      <div className="flex items-center justify-between border-t border-ink/10 px-4 py-3"><span className="flex items-center gap-1.5 text-xs text-ink/60"><span className="size-2 rounded-full bg-green-500" />Saved as you change · Undo works</span>
        <button className={button} onClick={() => dialog.current?.close()}>Done</button></div>
    </div>
  </dialog>, document.body);
}
