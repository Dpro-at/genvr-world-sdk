'use client';

import { useEffect, useState } from 'react';
import { BookOpen, Bot, Check, Info, Mic, MoreHorizontal, PenLine, Play, Plus, Trash2, UserRound, X } from 'lucide-react';
import { filmSettings, type CastMember, type CastVoice, type ScriptLine } from '@genvr/film';
import type { StudioFilming } from '../../../lib/use-studio-filming';
import { castSelection, useCastSelection } from './cast-selection';
import { VoiceTakes } from './voice-takes';

const button = 'inline-flex items-center justify-center gap-1.5 rounded-md border border-ink/10 bg-paper px-2.5 py-1.5 text-xs font-semibold hover:bg-ink/10 disabled:opacity-35';
const icon = 'inline-flex size-7 items-center justify-center rounded-md hover:bg-ink/10 disabled:opacity-35';
const input = 'mt-1 w-full rounded-md border border-ink/10 bg-paper px-2 py-1.5 text-xs';
const COLOURS = ['#8B7CF6', '#38BDF8', '#F59E0B', '#34D399', '#F472B6', '#F87171', '#A3E635', '#FB923C'];
type SavedVoice = { id: string; name: string; language?: string };

const Help = ({ text }: { text: string }) => <span title={text} aria-label={text} className="inline-flex text-ink/45"><Info className="size-3.5" /></span>;
const colourOf = (cast: CastMember[], id: string) => COLOURS[Math.max(0, cast.findIndex((c) => c.id === id)) % COLOURS.length]!;
const Face = ({ colour, size = 28 }: { colour: string; size?: number }) => <span aria-hidden className="flex shrink-0 items-end justify-center rounded-lg" style={{ width: size, height: size, background: `${colour}33` }}>
  <span className="rounded-t" style={{ width: size * 0.38, height: size * 0.66, background: colour }} /></span>;
/** Status dot (design rule 8): green ready, yellow missing, grey not needed. */
const Dot = ({ state, title }: { state: 'ok' | 'missing' | 'off'; title: string }) =>
  <span title={title} aria-label={title} className={`inline-block size-1.5 rounded-full ${state === 'ok' ? 'bg-green-500' : state === 'missing' ? 'bg-amber-400' : 'bg-ink/25'}`} />;

function attempt(filming: StudioFilming, id: string, args: unknown) {
  const result = filming.studio.run(id, args);
  if (!result.ok) filming.studio.setMessage(result.reason);
  return result.ok ? result.result : undefined;
}

/** Cast tab (board 1/2): the film's characters as compact rows; click one to edit it on the right. */
export function CastList({ filming }: { filming: StudioFilming }) {
  const studio = filming.studio, cast = studio.project.cast ?? [], lines = studio.project.lines ?? [];
  const languages = filmSettings(studio.project).languages, chosen = useCastSelection(), off = filming.busy || studio.rendering;
  const [adding, setAdding] = useState(''), [open, setOpen] = useState(false);
  const add = () => {
    const name = adding.trim(); if (!name) return;
    const id = attempt(filming, 'cast.add', { name, actor: 'self' }) as string | undefined;
    if (id) { setAdding(''); setOpen(false); castSelection.set(id); }
  };
  return <section aria-label="Cast" className="border-b border-ink/10 px-2 py-2">
    <div className="flex items-center gap-1 px-1 pb-1"><span className="flex-1 text-xs font-bold uppercase tracking-wide text-ink/60">Cast · {cast.length}</span>
      <button type="button" className={icon} aria-label="Add a character" title="Add a character" disabled={off} onClick={() => setOpen(!open)}><Plus className="size-4" /></button>
      <Help text="Each character has a name, who plays it, a voice per language and who writes its lines. Click = edit on the right · Esc = none." /></div>
    {open ? <div className="flex gap-1 px-1 pb-2"><input aria-label="New character name" autoFocus className={`${input} mt-0`} maxLength={60} placeholder="Name" value={adding}
      onChange={(e) => setAdding(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); if (e.key === 'Escape') setOpen(false); }} />
      <button type="button" className={button} disabled={!adding.trim()} onClick={add}>Add</button></div> : null}
    {cast.length ? <ul className="space-y-0.5">{cast.map((member) => {
      const count = lines.filter((l) => l.cast === member.id).length, waiting = lines.filter((l) => l.cast === member.id && l.status === 'draft').length;
      return <li key={member.id}><button type="button" aria-pressed={chosen === member.id} onClick={() => castSelection.set(chosen === member.id ? null : member.id)}
        className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left text-xs hover:bg-ink/5 aria-pressed:bg-ink/10 aria-pressed:ring-1 aria-pressed:ring-ink/40">
        <Face colour={colourOf(cast, member.id)} /><b className="min-w-0 flex-1 truncate">{member.name}</b>
        {languages.map((l) => <span key={l.lang} className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-ink/55" title={`${l.lang.toUpperCase()} voice: ${member.voices[l.lang]?.name ?? (l.level === 'text' ? 'captions only' : 'not chosen')}`}>
          {l.lang.toUpperCase()}<Dot state={member.voices[l.lang] ? 'ok' : l.level === 'text' ? 'off' : 'missing'} title={member.voices[l.lang] ? 'voice chosen' : l.level === 'text' ? 'captions only' : 'voice missing'} /></span>)}
        <span title={member.linesBy.kind === 'agent' ? `Lines by ${member.linesBy.name}` : 'You write the lines'} className="text-ink/55">{member.linesBy.kind === 'agent' ? <Bot className="size-3.5" /> : <PenLine className="size-3.5" />}</span>
        {waiting ? <span title={`${waiting} lines wait for your approval`} className="rounded bg-amber-400/20 px-1 text-[10px] font-bold text-amber-500">{waiting}</span> : count ? <span className="text-[10px] text-ink/45">{count}</span> : null}
      </button></li>; })}</ul>
      : <p className="px-1 pb-1 text-xs text-ink/60">No characters yet. Add the people of this film; each one gets a voice per language and someone who writes its lines.</p>}
  </section>;
}

/** Board 2/3: the chosen character on the right — Details (who plays it, voices, lines by) and Story & script. */
export function CastInspector({ filming }: { filming: StudioFilming }) {
  const studio = filming.studio, chosen = useCastSelection(), off = filming.busy || studio.rendering;
  const cast = studio.project.cast ?? [], member = cast.find((c) => c.id === chosen);
  const [tab, setTab] = useState<'details' | 'story'>('details'), [menu, setMenu] = useState(false);
  const [voices, setVoices] = useState<SavedVoice[]>([]);
  useEffect(() => { if (filming.voiceAvailable) void filming.voiceLibrary().then((v) => setVoices(v.voices)).catch(() => setVoices([])); }, [filming.voiceAvailable, studio.identity]);
  useEffect(() => { const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !(e.target as HTMLElement | null)?.closest('input,textarea,select')) castSelection.set(null); };
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc); }, []);
  if (!member) return null;
  const settings = filmSettings(studio.project), lines = (studio.project.lines ?? []).filter((l) => l.cast === member.id);
  const set = (patch: Record<string, unknown>) => attempt(filming, 'cast.set', { cast: member.id, ...patch });
  const remove = () => {
    if (lines.length && !window.confirm(`Remove ${member.name} and ${lines.length} line${lines.length === 1 ? '' : 's'}?`)) return;
    const result = studio.run('cast.remove', { cast: member.id, confirm: true });
    if (result.ok) castSelection.set(null); else studio.setMessage(result.reason);
  };
  return <div className="text-ink" aria-label={`Character ${member.name}`}>
    <div className="flex items-center gap-2 border-b border-ink/10 px-3 py-2">
      <Face colour={colourOf(cast, member.id)} size={34} />
      <div className="min-w-0 flex-1"><div className="text-[10px] font-semibold uppercase tracking-wide text-ink/50">Character</div>
        <input aria-label="Character name" className="w-full bg-transparent text-sm font-bold outline-none focus:ring-1 focus:ring-ink/30" maxLength={60} defaultValue={member.name} key={member.id + member.name}
          title="Click to rename" onBlur={(e) => { const name = e.target.value.trim(); if (name && name !== member.name) set({ name }); }} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} /></div>
      <div className="relative"><button type="button" className={icon} aria-label="More" aria-expanded={menu} onClick={() => setMenu(!menu)}><MoreHorizontal className="size-4" /></button>
        {menu ? <div role="menu" className="absolute right-0 top-full z-30 mt-1 w-44 rounded-lg border border-ink/10 bg-surface p-1 shadow-xl">
          <button role="menuitem" type="button" className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-red-500 hover:bg-ink/10" onClick={() => { setMenu(false); remove(); }}><Trash2 className="size-3.5" />Remove from film</button></div> : null}</div>
      <button type="button" className={icon} aria-label="Close character" title="Close (Esc)" onClick={() => castSelection.set(null)}><X className="size-4" /></button>
    </div>
    <div role="tablist" className="flex gap-0.5 border-b border-ink/10 p-1.5">
      {([['details', 'Details', UserRound], ['story', 'Story & script', BookOpen]] as const).map(([id, label, Icon]) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
        className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-bold ${tab === id ? 'bg-ink text-paper' : 'text-ink/60 hover:bg-ink/5'}`}><Icon className="size-3.5" />{label}</button>)}
    </div>
    {tab === 'details' ? <div className="divide-y divide-ink/10">
      <section className="space-y-1 px-3 py-3"><h3 className="flex items-center gap-2 text-xs font-bold"><UserRound className="size-3.5" />Played by<Help text="The actor in the scene who plays this character. My avatar's look is chosen in the Cast tab." /></h3>
        <select aria-label="Played by" className={input} value={member.actor} disabled={off} onChange={(e) => set({ actor: e.target.value })}>
          {filming.sceneActors().map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select></section>
      <section className="space-y-1.5 px-3 py-3"><h3 className="flex items-center gap-2 text-xs font-bold"><Mic className="size-3.5" />Voice per language<Help text="An AI voice from the voice library, or a person who records it. Languages come from Film settings." /></h3>
        {settings.languages.length ? settings.languages.map((l) => <VoiceRow key={l.lang} lang={l.lang} level={l.level} voice={member.voices[l.lang]} voices={voices} disabled={off}
          change={(voice) => attempt(filming, 'cast.voice', { cast: member.id, lang: l.lang, voice })} />)
          : <p className="text-xs text-ink/60">Add the film's languages in Film settings first.</p>}
      </section>
      <section className="space-y-1 px-3 py-3"><h3 className="flex items-center gap-2 text-xs font-bold"><Bot className="size-3.5" />Lines written by<Help text="An agent may write this character's lines; you approve each line before it is used." /></h3>
        <div className="flex gap-1.5">
          <select aria-label="Lines written by" className={`${input} mt-0 w-28`} value={member.linesBy.kind} disabled={off}
            onChange={(e) => set({ linesBy: e.target.value === 'owner' ? { kind: 'owner' } : { kind: 'agent', name: 'Main agent' } })}><option value="owner">Me</option><option value="agent">An agent</option></select>
          {member.linesBy.kind === 'agent' ? <input aria-label="Agent name" className={`${input} mt-0 flex-1`} maxLength={80} defaultValue={member.linesBy.name} key={member.linesBy.name}
            onBlur={(e) => { const name = e.target.value.trim(); if (name && member.linesBy.kind === 'agent' && name !== member.linesBy.name) set({ linesBy: { kind: 'agent', name } }); }} /> : null}
        </div></section>
      <section className="px-3 py-3 text-xs text-ink/60">In this film: {lines.length} line{lines.length === 1 ? '' : 's'} · {lines.filter((l) => l.status === 'approved').length} approved</section>
    </div> : <StoryTab filming={filming} member={member} lines={lines} />}
  </div>;
}

function VoiceRow({ lang, level, voice, voices, change, disabled }: { lang: string; level: 'text' | 'text_voice'; voice?: CastVoice | undefined; voices: SavedVoice[]; change: (v: CastVoice | null) => void; disabled: boolean }) {
  const mode = voice?.kind ?? (level === 'text' ? 'none' : 'ai');
  return <div className="flex items-center gap-1.5 text-xs">
    <b className="w-7 rounded bg-ink/10 py-0.5 text-center text-[10px]">{lang.toUpperCase()}</b>
    <div role="radiogroup" aria-label={`${lang} voice by`} className="inline-flex rounded-md border border-ink/10 p-0.5">
      <button type="button" role="radio" aria-checked={mode === 'ai'} title="AI voice" aria-label="AI voice" disabled={disabled} className={`rounded p-1 ${mode === 'ai' ? 'bg-ink text-paper' : ''}`}
        onClick={() => { if (voice?.kind !== 'ai') change(null); }}><Bot className="size-3.5" /></button>
      <button type="button" role="radio" aria-checked={mode === 'person'} title="A person records it" aria-label="A person" disabled={disabled} className={`rounded p-1 ${mode === 'person' ? 'bg-ink text-paper' : ''}`}
        onClick={() => { if (voice?.kind !== 'person') change({ kind: 'person', name: 'Voice actor' }); }}><UserRound className="size-3.5" /></button>
    </div>
    {voice?.kind === 'person'
      ? <input aria-label={`${lang} voice actor`} className={`${input} mt-0 flex-1`} maxLength={80} defaultValue={voice.name} key={voice.name}
        onBlur={(e) => { const name = e.target.value.trim(); if (name && name !== voice.name) change({ kind: 'person', name }); }} />
      : <select aria-label={`${lang} AI voice`} className={`${input} mt-0 flex-1`} disabled={disabled} value={voice?.kind === 'ai' ? voice.voiceId : ''}
        onChange={(e) => { const v = voices.find((x) => x.id === e.target.value); change(v ? { kind: 'ai', voiceId: v.id, name: v.name } : null); }}>
        <option value="">{level === 'text' ? 'Captions only' : 'Choose a saved voice…'}</option>
        {voices.map((v) => <option key={v.id} value={v.id}>{v.name}{v.language ? ` · ${v.language.toUpperCase()}` : ''}</option>)}
      </select>}
    <Dot state={voice ? 'ok' : level === 'text' ? 'off' : 'missing'} title={voice ? 'ready' : level === 'text' ? 'captions only' : 'voice missing'} />
  </div>;
}

/** Story & script (board 3): role, personality, arc, and the character's lines with approval. */
function StoryTab({ filming, member, lines }: { filming: StudioFilming; member: CastMember; lines: ScriptLine[] }) {
  const studio = filming.studio, off = filming.busy || studio.rendering, languages = filmSettings(studio.project).languages;
  const [lang, setLang] = useState(languages[0]?.lang ?? 'en'), [draft, setDraft] = useState('');
  const set = (patch: Record<string, unknown>) => attempt(filming, 'cast.set', { cast: member.id, ...patch });
  return <div className="divide-y divide-ink/10">
    <section className="space-y-2 px-3 py-3">
      <div role="radiogroup" aria-label="Role" className="inline-flex rounded-md border border-ink/10 p-0.5">{(['lead', 'support', 'extra'] as const).map((r) =>
        <button key={r} type="button" role="radio" aria-checked={member.role === r} disabled={off} onClick={() => set({ role: r })} className={`rounded px-2.5 py-1 text-xs font-semibold capitalize ${member.role === r ? 'bg-ink text-paper' : 'hover:bg-ink/10'}`}>{r}</button>)}</div>
      <label className="block text-xs text-ink/60"><span className="flex items-center gap-1.5">Personality<Help text="Agents read this before they write the character's lines." /></span>
        <textarea aria-label="Personality" rows={2} maxLength={1000} className={input} defaultValue={member.personality} key={member.id + 'p'} onBlur={(e) => { if (e.target.value !== member.personality) set({ personality: e.target.value }); }} /></label>
      <label className="block text-xs text-ink/60">Arc in the {filmSettings(studio.project).kind}
        <textarea aria-label="Arc" rows={2} maxLength={1000} className={input} defaultValue={member.arc} key={member.id + 'a'} onBlur={(e) => { if (e.target.value !== member.arc) set({ arc: e.target.value }); }} /></label>
    </section>
    <section className="space-y-2 px-3 py-3">
      <div className="flex items-center gap-2"><h3 className="flex-1 text-xs font-bold">Lines · {lines.length}</h3>
        {languages.length > 1 ? <div role="radiogroup" aria-label="Line language" className="inline-flex gap-0.5">{languages.map((l) =>
          <button key={l.lang} type="button" role="radio" aria-checked={lang === l.lang} onClick={() => setLang(l.lang)} className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${lang === l.lang ? 'bg-ink text-paper' : 'bg-ink/10'}`}>{l.lang.toUpperCase()}</button>)}</div> : null}</div>
      {lines.map((line) => <LineRow key={line.id} filming={filming} line={line} lang={lang} languages={languages.map((l) => l.lang)} person={member.voices[lang]?.kind === 'person' ? member.voices[lang]!.name : null} />)}
      {!lines.length ? <p className="text-xs text-ink/60">{member.linesBy.kind === 'agent' ? `${member.linesBy.name} writes ${member.name}'s lines through MCP; they appear here for your approval. You can also write one.` : `Write ${member.name}'s lines here.`}</p> : null}
      <div className="flex gap-1.5"><textarea aria-label="New line" rows={2} maxLength={500} className={`${input} mt-0 flex-1`} placeholder={`What ${member.name} says (${lang.toUpperCase()})`} value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button type="button" className={button} disabled={off || !draft.trim()} onClick={() => { if (attempt(filming, 'line.write', { cast: member.id, text: { [lang]: draft.trim() } }) !== undefined) setDraft(''); }}><Plus className="size-3.5" />Line</button></div>
    </section>
  </div>;
}

function LineRow({ filming, line, lang, languages, person }: { filming: StudioFilming; line: ScriptLine; lang: string; languages: string[]; person: string | null }) {
  const studio = filming.studio, off = filming.busy || studio.rendering, approved = line.status === 'approved';
  return <div className={`space-y-1 rounded-lg border p-2 ${approved ? 'border-ink/10' : 'border-amber-400/50'}`}>
    <div className="flex items-center gap-1.5 text-[10px] text-ink/55">
      <span title={approved ? 'Approved' : 'Waiting for your approval'} className={`rounded px-1 font-bold ${approved ? 'bg-green-500/15 text-green-600' : 'bg-amber-400/20 text-amber-600'}`}>{approved ? 'approved' : 'draft'}</span>
      <span>{line.by === 'agent' ? 'by agent' : 'by you'} · ep {line.episode}</span><span className="flex-1" />
      {languages.map((l) => <Dot key={l} state={line.text[l]?.trim() ? 'ok' : 'missing'} title={`${l.toUpperCase()} ${line.text[l]?.trim() ? 'written' : 'missing'}`} />)}
    </div>
    <textarea aria-label={`Line in ${lang}`} rows={2} maxLength={500} dir="auto" className="w-full rounded border border-ink/10 bg-paper px-2 py-1 text-xs" defaultValue={line.text[lang] ?? ''} key={line.id + lang + (line.text[lang] ?? '')}
      placeholder={`No words in ${lang.toUpperCase()} yet`} onBlur={(e) => { const text = e.target.value; if (text !== (line.text[lang] ?? '')) attempt(filming, 'line.set', { line: line.id, text: { [lang]: text } }); }} />
    <div className="flex items-center gap-1">
      {approved ? <button type="button" className={button} disabled={off || !line.text[lang]?.trim()} title="Add this line as a cue of the next take"
        onClick={() => attempt(filming, 'line.place', { line: line.id, lang })}><Play className="size-3.5" />Use in next take</button>
        : <button type="button" className={`${button} !border-green-600/40`} disabled={off} title="Only you can approve a line" onClick={() => attempt(filming, 'line.approve', { line: line.id })}><Check className="size-3.5" />Approve</button>}
      <span className="flex-1" />
      {approved ? <button type="button" className={icon} aria-label="Back to draft" title="Back to draft" disabled={off} onClick={() => attempt(filming, 'line.approve', { line: line.id, approved: false })}><PenLine className="size-3.5" /></button> : null}
      <button type="button" className={icon} aria-label="Delete line" title="Delete line" disabled={off} onClick={() => attempt(filming, 'line.remove', { line: line.id })}><Trash2 className="size-3.5" /></button>
    </div>
    {person && approved && line.text[lang]?.trim() ? <VoiceTakes filming={filming} line={line} lang={lang} person={person} /> : null}
  </div>;
}

