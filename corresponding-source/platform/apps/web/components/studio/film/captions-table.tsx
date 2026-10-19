'use client';

import { useEffect, useState } from 'react';
import { Captions, ChevronDown, Info, Languages, Mic, MoreHorizontal, Sparkles, Trash2, Wrench } from 'lucide-react';
import { filmSettings, languageStatus, toSeconds, type CaptionClip, type Track } from '@genvr/film';
import type { StudioFilming } from '../../../lib/use-studio-filming';
import { languageOf } from '../../../lib/video-studio/subtitles';
import { CaptionsPanel } from './panels';
import { DragNumber } from './drag-number';
import { ContextMenu, type MenuItem } from './context-menu';
import { castSelection } from './cast-selection';

const button = 'inline-flex items-center justify-center gap-1.5 rounded-md border border-ink/10 bg-paper px-2.5 py-1.5 text-xs font-semibold hover:bg-ink/10 disabled:opacity-35';
const icon = 'inline-flex size-7 items-center justify-center rounded-md hover:bg-ink/10 disabled:opacity-35';
const input = 'mt-1 w-full rounded-md border border-ink/10 bg-paper px-2 py-1.5 text-xs';
const label = 'text-[10px] font-semibold uppercase tracking-wide text-ink/50';
const MISSING: Record<string, string> = { captions: 'captions', voice: 'voice', words: 'script words' };

const Help = ({ text }: { text: string }) => <span title={text} aria-label={text} className="inline-flex text-ink/45"><Info className="size-3.5" /></span>;
type DotState = 'ok' | 'missing' | 'off';
const Dot = ({ state, title }: { state: DotState; title?: string }) =>
  <span title={title} aria-label={title} className={`inline-block size-1.5 shrink-0 rounded-full ${state === 'ok' ? 'bg-green-500' : state === 'missing' ? 'bg-amber-400' : 'bg-ink/25'}`} />;
const time = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(0).padStart(2, '0')}`;
const captionsOf = (track: Track | undefined) => (track?.clips ?? []).filter((c): c is CaptionClip => c.type === 'caption').sort((a, b) => a.start - b.start);
/** The caption of another language that matches a main-language line: the one that overlaps it most. */
function matchOf(clips: CaptionClip[], start: number, end: number) {
  let best: CaptionClip | undefined, most = 0;
  for (const c of clips) { const overlap = Math.min(end, c.start + c.duration) - Math.max(start, c.start); if (overlap > most) { most = overlap; best = c; } }
  return best;
}

/**
 * Captions and dubbing (board 20): every caption line of the main language as a row, one column per film language,
 * each cell a caption dot and a voice dot. Click a cell to edit that language's line below. Everything the old
 * Captions panel did stays in "More caption tools".
 */
export function CaptionsTable({ filming }: { filming: StudioFilming }) {
  const studio = filming.studio, project = studio.project, off = filming.busy || studio.rendering;
  const settings = filmSettings(project), status = languageStatus(project);
  const langTracks = project.tracks.filter((t) => t.kind === 'caption' && t.lang);
  const langs = settings.languages.length ? settings.languages.map((l) => l.lang) : langTracks.map((t) => t.lang!);
  const main = langs.find((l) => langTracks.some((t) => t.lang === l)) ?? langs[0] ?? null;
  const trackOf = (lang: string) => project.tracks.find((t) => t.kind === 'caption' && t.lang === lang);
  const voiceOf = (lang: string) => project.tracks.find((t) => t.kind === 'sound' && t.lang === lang);
  const levelOf = (lang: string) => settings.languages.find((l) => l.lang === lang)?.level ?? 'text';
  const rows = captionsOf(main ? trackOf(main) : undefined);

  const [cell, setCell] = useState<{ row: string; lang: string } | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [how, setHow] = useState<'ai' | 'hand'>('ai'), [making, setMaking] = useState(false), [note, setNote] = useState('');
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null), [more, setMore] = useState(false);
  useEffect(() => { setDraft(null); }, [cell?.row, cell?.lang]);

  /** What a cell shows: is there a caption in that language for the line, and a voice under it. */
  const cellOf = (row: CaptionClip, lang: string) => {
    const caption = lang === main ? row : matchOf(captionsOf(trackOf(lang)), row.start, row.start + row.duration);
    const voice = voiceOf(lang)?.clips.some((c) => c.start < row.start + row.duration && c.start + c.duration > row.start) ?? false;
    const level = levelOf(lang);
    return { caption, voice: (voice ? 'ok' : level === 'text_voice' ? 'missing' : 'off') as DotState, level };
  };
  const speaker = (row: CaptionClip) => {
    const line = (project.lines ?? []).find((l) => main && l.text[main]?.trim() === row.text.trim());
    return line ? project.cast?.find((c) => c.id === line.cast)?.name : undefined;
  };

  const makeMissing = async () => {
    if (how === 'hand') {
      const gap = rows.flatMap((row) => langs.map((lang) => ({ row, lang }))).find(({ row, lang }) => !cellOf(row, lang).caption);
      if (gap) { setCell({ row: gap.row.id, lang: gap.lang }); setNote(`Write the ${gap.lang.toUpperCase()} caption below.`); } else setNote('Every caption is there; record or import the missing voices in Sound.');
      return;
    }
    setMaking(true); setNote('');
    try {
      const blob = await filming.handleStudio({ kind: 'language', action: 'make_missing', what: 'both' }, new AbortController().signal);
      const reply = JSON.parse(await blob.text()) as { result?: { done: Array<{ lang: string; made: string }>; skipped: Array<{ lang: string; reason: string }> } };
      const done = reply.result?.done ?? [], skipped = reply.result?.skipped ?? [];
      setNote([done.length ? `Made: ${done.map((d) => `${d.lang.toUpperCase()} ${d.made}`).join(', ')}.` : 'Nothing to make.', ...skipped.map((x) => `${x.lang.toUpperCase()}: ${x.reason}`)].join(' '));
    } catch (e) { setNote(e instanceof Error ? e.message : 'Could not make the missing parts.'); }
    finally { setMaking(false); }
  };

  const gaps = status.filter((s) => s.missing.length);
  const row = rows.find((r) => r.id === cell?.row), editing = row && cell ? { ...cellOf(row, cell.lang), lang: cell.lang } : null;
  const runOrSay = (id: string, args: unknown) => { const r = studio.run(id, args); if (!r.ok) setNote(r.reason); return r; };
  /** Saves the edited text: changes the caption, or adds the missing one on that language's track. */
  const saveText = () => {
    if (!row || !editing || draft === null) return;
    const text = draft.trim(); setDraft(null);
    if (editing.caption) { if (text && text !== editing.caption.text) runOrSay('clip.set', { clip: editing.caption.id, text }); return; }
    if (!text) return;
    const track = trackOf(editing.lang), start = toSeconds(row.start), end = toSeconds(row.start + row.duration);
    if (track) runOrSay('caption.add', { text, start, duration: end - start, track: track.id });
    else runOrSay('subtitles.set', { lang: editing.lang, name: (languageOf(editing.lang)?.native ?? editing.lang.toUpperCase()).slice(0, 40), show: false, lines: [{ start, end, text }] });
  };
  const counts = (lang: string) => rows.filter((r) => cellOf(r, lang).caption).length;
  const items: MenuItem[] = [
    { label: 'Add caption at playhead', icon: Captions, disabled: off, run: () => { runOrSay('caption.add', { text: 'New caption', ...(main && trackOf(main) ? { track: trackOf(main)!.id } : {}) }); } },
    { label: 'Show this language on the film', icon: Languages, disabled: off || !cell || !trackOf(cell.lang), why: 'Pick a cell of a language with captions', run: () => { if (cell) runOrSay('subtitles.show', { lang: cell.lang }); } },
    { label: 'Hide captions on the film', icon: Captions, disabled: off, run: () => { runOrSay('subtitles.show', { lang: null }); } },
    { label: 'More caption tools', icon: Wrench, run: () => setMore(true) },
    'divider',
    { label: 'Delete this caption', icon: Trash2, danger: true, disabled: off || !editing?.caption, why: 'Pick a cell with a caption', run: () => {
      if (editing?.caption) { runOrSay('clip.remove', { clips: [editing.caption.id], ripple: false }); setCell(null); } } },
  ];

  return <section aria-label="Captions and dubbing" data-film-id="film.captions-table" className="text-ink">
    <div className="flex items-center gap-2 border-b border-ink/10 px-3 py-2">
      <Languages className="size-4 text-ink/60" />
      <div className="min-w-0 flex-1"><p className={label}>Captions &amp; dubbing</p>
        <p className="text-xs font-semibold">All lines · {rows.length}</p>
        <p className="flex flex-wrap items-center gap-1.5 text-[10px] text-ink/55">{status.map((s) => <span key={s.lang} className="inline-flex items-center gap-1"><Dot state={s.missing.length ? 'missing' : 'ok'} title={s.missing.length ? `Missing: ${s.missing.map((m) => MISSING[m]).join(', ')}` : 'Complete'} />{s.lang.toUpperCase()}</span>)}</p></div>
      <button type="button" className={icon} aria-label="More" title="More — same menu as right-click" onClick={(e) => setMenu({ x: e.clientX, y: e.clientY })}><MoreHorizontal className="size-4" /></button>
    </div>

    <div className="px-2 py-2" onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }); }}>
      {!langs.length || !main ? <p className="px-1 text-xs text-ink/60">No captions yet. Add the film's languages in Film settings, then make the captions from the voices (More caption tools) or with Make the missing parts.</p> : <>
        <div className="grid items-center gap-x-1 gap-y-0.5 text-xs" style={{ gridTemplateColumns: `minmax(0,1fr) repeat(${langs.length}, 2.75rem)` }}>
          <span className="flex items-center gap-1 px-1"><span className={label}>Line</span><Help text="Click a cell to edit it below (or click a line on the timeline). Each cell: caption dot + voice dot. A new line at the playhead: ⋯ › Add caption." /></span>
          {langs.map((lang) => <span key={lang} className="flex flex-col items-center" title={`${languageOf(lang)?.label ?? lang}${lang === main ? ' · main' : ''}`}>
            <b className="rounded bg-ink/10 px-1 text-[10px]">{lang.toUpperCase()}</b><span className="font-mono text-[9px] text-ink/50">{counts(lang)}/{rows.length}</span></span>)}
          {rows.map((r) => { const who = speaker(r);
            return <div key={r.id} className="contents">
              <button type="button" className={`min-w-0 rounded px-1 py-1 text-left hover:bg-ink/5 ${cell?.row === r.id ? 'bg-ink/10' : ''}`}
                onClick={() => { setCell({ row: r.id, lang: main }); studio.setPlayhead(toSeconds(r.start)); }}>
                <span className="block font-mono text-[10px] text-ink/50">{time(toSeconds(r.start))} → {time(toSeconds(r.start + r.duration))}{who ? <> · <b className="font-sans text-ink/70">{who}</b></> : null}</span>
                <span className="block truncate" dir="auto">{r.text}</span></button>
              {langs.map((lang) => { const c = cellOf(r, lang), chosen = cell?.row === r.id && cell.lang === lang;
                const title = `caption ${c.caption ? 'ready' : 'missing'} · voice ${c.voice === 'ok' ? 'ready' : c.voice === 'missing' ? 'missing' : 'text only'}`;
                return <button key={lang} type="button" title={title} aria-label={`${lang.toUpperCase()} line: ${title}`} aria-pressed={chosen}
                  onClick={() => { setCell({ row: r.id, lang }); studio.setPlayhead(toSeconds(r.start)); }}
                  className={`flex h-8 items-center justify-center gap-1 rounded hover:bg-ink/5 ${chosen ? 'bg-ink/10 ring-1 ring-ink/30' : ''}`}>
                  <Captions className="size-3 text-ink/45" /><Dot state={c.caption ? 'ok' : 'missing'} /><Mic className="size-3 text-ink/45" /><Dot state={c.voice} /></button>; })}
            </div>; })}
        </div>
        {!rows.length ? <p className="px-1 pt-1 text-xs text-ink/60">The main language ({main.toUpperCase()}) has no caption lines yet.</p> : null}
      </>}
    </div>

    {editing && row ? <details open className="border-t border-ink/10 px-3 py-2">
      <summary className="flex cursor-pointer items-center gap-2 text-xs font-semibold"><ChevronDown className="size-3.5" />Edit cell<span className="ml-auto font-normal text-ink/55">Line {rows.indexOf(row) + 1} · {editing.lang.toUpperCase()}</span></summary>
      <div className="mt-2 space-y-2 text-xs">
        <p className="flex items-center gap-2"><b className="rounded bg-ink/10 px-1.5 py-0.5 text-[10px]">{editing.lang.toUpperCase()}</b>
          <span className="text-ink/60">Line {rows.indexOf(row) + 1}{speaker(row) ? ` · ${speaker(row)}` : ''}</span></p>
        {editing.caption ? <div className="flex items-center gap-1.5">
          <DragNumber label="In" unit="s" value={toSeconds(editing.caption.start)} min={0} disabled={off}
            commit={(v) => { runOrSay('clip.trim', { clip: editing.caption!.id, edge: 'start', to: v }); }} />
          <span className="text-ink/45">→</span>
          <DragNumber label="Out" unit="s" value={toSeconds(editing.caption.start + editing.caption.duration)} min={0} disabled={off}
            commit={(v) => { runOrSay('clip.trim', { clip: editing.caption!.id, edge: 'end', to: v }); }} />
        </div> : <p className="text-ink/55">No {editing.lang.toUpperCase()} caption for this line yet · {time(toSeconds(row.start))} → {time(toSeconds(row.start + row.duration))}</p>}
        {editing.lang !== main ? <p className="rounded-md bg-ink/5 p-2 text-ink/60" dir="auto">{row.text}</p> : null}
        <textarea aria-label={`${editing.lang} caption text`} rows={2} maxLength={500} disabled={off} className={input} dir="auto"
          placeholder={editing.caption ? undefined : `Write the ${languageOf(editing.lang)?.label ?? editing.lang} line`}
          value={draft ?? editing.caption?.text ?? ''} onChange={(e) => setDraft(e.target.value)} onBlur={saveText}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur(); } if (e.key === 'Escape') setDraft(null); }} />
        <p className="flex items-center gap-1.5 text-ink/55"><Mic className="size-3" />Voice {editing.voice === 'ok' ? 'ready' : editing.voice === 'missing' ? 'missing' : 'not needed (captions only)'}
          {voiceOf(editing.lang) ? <span className="truncate">· {voiceOf(editing.lang)!.name}</span> : null}</p>
      </div>
    </details> : null}

    <section aria-label="Make the missing parts" className="space-y-2 border-t border-ink/10 px-3 py-2 text-xs">
      <p className="flex items-center gap-2"><Sparkles className="size-3.5 text-ink/60" /><b className="flex-1">Make the missing parts</b>
        {gaps.length ? <span className="rounded bg-amber-400/20 px-1.5 text-[10px] font-bold text-amber-500">{gaps.length} language{gaps.length === 1 ? '' : 's'}</span> : <Dot state="ok" title="Nothing missing" />}</p>
      {gaps.map((g) => <p key={g.lang} className="flex items-center gap-2 text-ink/70"><Dot state="missing" /><b className="text-[10px]">{g.lang.toUpperCase()}</b>{g.missing.map((m) => MISSING[m]).join(', ')}</p>)}
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Make them" className="inline-flex gap-0.5 rounded-md border border-ink/10 bg-paper p-0.5">
          {([['ai', 'AI'], ['hand', 'By hand']] as const).map(([v, text]) => <button key={v} type="button" role="radio" aria-checked={how === v} disabled={off || making}
            className={`rounded px-2.5 py-1 text-xs font-semibold disabled:opacity-35 ${how === v ? 'bg-ink text-paper' : 'hover:bg-ink/10'}`} onClick={() => setHow(v)}>{text}</button>)}
        </div>
        <button type="button" className={button} disabled={off || making || !gaps.length} onClick={() => void makeMissing()}><Sparkles className="size-3.5" />{making ? 'Making…' : 'Make the missing parts'}</button>
      </div>
      {note ? <p role="status" className="text-ink/70">{note}</p> : null}
    </section>

    <section aria-label="Who speaks which language" className="border-t border-ink/10 px-3 py-2 text-xs">
      {(() => { const cast = project.cast ?? [], toChoose = cast.reduce((n, m) => n + langs.filter((l) => levelOf(l) === 'text_voice' && !m.voices[l]).length, 0);
        return <>
          <p className="mb-1 flex items-center gap-2"><b className="flex-1">Who speaks which language</b>{toChoose ? <span className="text-[10px] text-amber-500">{toChoose} to choose</span> : null}
            <Help text="Click a character to choose its voice per language on the right." /></p>
          {!cast.length ? <p className="text-ink/60">No characters yet. Add them in Cast.</p>
            : <div className="grid items-center gap-x-1 gap-y-0.5" style={{ gridTemplateColumns: `6rem repeat(${langs.length}, minmax(0,1fr))` }}>
              <span />{langs.map((l) => <b key={l} className="text-center text-[10px] text-ink/60">{l.toUpperCase()}</b>)}
              {cast.map((m) => <div key={m.id} className="contents">
                <span className="truncate font-semibold">{m.name}</span>
                {langs.map((l) => { const v = m.voices[l], text = levelOf(l) === 'text';
                  return <button key={l} type="button" disabled={off} onClick={() => castSelection.set(m.id)}
                    title={v ? `${m.name} ${l.toUpperCase()}: ${v.name}` : text ? 'Captions only in this language' : 'Choose a voice'}
                    className={`truncate rounded px-1 py-1 text-[11px] hover:bg-ink/5 ${v ? '' : text ? 'text-ink/40' : 'text-amber-500'}`}>
                    {v ? v.name : text ? 'text' : 'choose ▾'}</button>; })}
              </div>)}
            </div>}
        </>; })()}
    </section>

    <details open={more} onToggle={(e) => setMore(e.currentTarget.open)} className="border-t border-ink/10 py-2">
      <summary className="cursor-pointer px-3 pb-2 text-xs font-semibold">More caption tools</summary>
      <CaptionsPanel filming={filming} />
    </details>
    {menu ? <ContextMenu at={menu} items={items} close={() => setMenu(null)} title="Captions" /> : null}
  </section>;
}

