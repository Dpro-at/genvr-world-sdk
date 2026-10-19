'use client';

import { useState } from 'react';
import { Captions, Info, Mic, MousePointer2, Plus, Settings2, Sparkles, Type, UserRound } from 'lucide-react';
import { filmSettings, languageStatus } from '@genvr/film';
import type { StudioFilming } from '../../../lib/use-studio-filming';
import { languageOf } from '../../../lib/video-studio/subtitles';
import { castSelection } from './cast-selection';

const button = 'inline-flex items-center justify-center gap-1.5 rounded-md border border-ink/10 bg-paper px-2.5 py-1.5 text-xs font-semibold hover:bg-ink/10 disabled:opacity-35';
const icon = 'inline-flex size-7 items-center justify-center rounded-md hover:bg-ink/10 disabled:opacity-35';
const label = 'text-[10px] font-semibold uppercase tracking-wide text-ink/50';
const MISSING: Record<string, string> = { captions: 'captions', voice: 'voice', words: 'script words' };

const Help = ({ text }: { text: string }) => <span title={text} aria-label={text} className="inline-flex text-ink/45"><Info className="size-3.5" /></span>;
const Dot = ({ state, title }: { state: 'ok' | 'missing' | 'off'; title: string }) =>
  <span title={title} aria-label={title} className={`inline-block size-1.5 shrink-0 rounded-full ${state === 'ok' ? 'bg-green-500' : state === 'missing' ? 'bg-amber-400' : 'bg-ink/25'}`} />;
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

/** Right panel when nothing is selected (board 1): the film at a glance, its languages, and quick adds. */
export function FilmOverview({ filming, openSettings }: { filming: StudioFilming; openSettings: () => void }) {
  const studio = filming.studio, project = studio.project, off = filming.busy || studio.rendering;
  const settings = filmSettings(project), status = languageStatus(project), gaps = status.filter((s) => s.missing.length);
  const [making, setMaking] = useState(false), [note, setNote] = useState('');
  const stats: Array<[string, string, string]> = [
    [String(project.cast?.length ?? 0), 'cast', 'Characters of the film'],
    [String(project.media.filter((m) => m.kind === 'video').length), 'shots', 'Recorded shots'],
    [String(project.lines?.length ?? 0), 'lines', 'Lines of the script'],
    [clock(studio.length), 'length', 'Length of the film on the timeline'],
  ];
  const makeMissing = async () => {
    setMaking(true); setNote('');
    try {
      const blob = await filming.handleStudio({ kind: 'language', action: 'make_missing', what: 'both' }, new AbortController().signal);
      const reply = JSON.parse(await blob.text()) as { result?: { done: Array<{ lang: string; made: string }>; skipped: Array<{ lang: string; reason: string }> } };
      const done = reply.result?.done ?? [], skipped = reply.result?.skipped ?? [];
      setNote([done.length ? `Made: ${done.map((d) => `${d.lang.toUpperCase()} ${d.made}`).join(', ')}.` : 'Nothing to make.', ...skipped.map((x) => `${x.lang.toUpperCase()}: ${x.reason}`)].join(' '));
    } catch (e) { setNote(e instanceof Error ? e.message : 'Could not make the missing parts.'); }
    finally { setMaking(false); }
  };
  const addCharacter = () => {
    const taken = new Set((project.cast ?? []).map((c) => c.name.toLowerCase()));
    let name = 'New character'; for (let n = 2; taken.has(name.toLowerCase()); n++) name = `New character ${n}`;
    const result = studio.run('cast.add', { name, actor: 'self' });
    if (result.ok && typeof result.result === 'string') castSelection.set(result.result); else if (!result.ok) setNote(result.reason);
  };

  return <section aria-label="Nothing selected" data-film-id="film.overview" className="text-ink">
    <div className="flex items-center gap-2 border-b border-ink/10 px-3 py-2">
      <MousePointer2 className="size-4 text-ink/50" />
      <div className="min-w-0 flex-1"><b className="block text-xs">Nothing selected</b>{settings.name ? <span className="block truncate text-[11px] text-ink/55">{settings.name}</span> : null}</div>
      <Help text="Click a character, shot, line, sound or scene to edit it here. ⇧ click = several · Esc = nothing selected." />
      <button type="button" className={icon} aria-label="Film settings" title="Film settings" onClick={openSettings}><Settings2 className="size-4" /></button>
    </div>

    <div className="space-y-1.5 border-b border-ink/10 px-3 py-2.5">
      <p className={label}>This {settings.kind === 'series' ? 'series' : 'film'}</p>
      <div className="grid grid-cols-4 gap-1">
        {stats.map(([value, name, why]) => <div key={name} title={why} className="rounded-md border border-ink/10 px-1 py-1.5 text-center">
          <b className="block font-mono text-sm tabular-nums">{value}</b><span className="text-[10px] text-ink/55">{name}</span></div>)}
      </div>
    </div>

    <div className="space-y-1 border-b border-ink/10 px-3 py-2.5 text-xs">
      <p className="flex items-center gap-2"><span className={`${label} flex-1`}>Languages</span><Help text="Each language: caption dot and voice dot. Add or remove languages in Film settings." /></p>
      {status.length ? status.map((row) => {
        const info = languageOf(row.lang);
        const missing = row.missing.length ? row.missing.map((m) => m === 'captions' && row.lines ? `${row.lines} captions missing` : m === 'words' ? `${row.lines - row.words} lines to write` : `${MISSING[m]} missing`).join(' · ') : '';
        return <div key={row.lang} className="flex h-7 items-center gap-2">
          <b className="rounded bg-ink/10 px-1.5 py-0.5 text-[10px]">{row.lang.toUpperCase()}</b>
          <span dir={info?.rtl ? 'rtl' : undefined} className="truncate">{info?.native ?? row.lang}</span>
          {row.main ? <span className="text-ink/45">main</span> : row.level === 'text' ? <span className="text-ink/45">text only</span> : null}
          <span className="min-w-0 flex-1 truncate text-right text-[11px] text-amber-500">{missing}</span>
          <span className="flex items-center gap-0.5" title={`${row.captions} captions`}><Captions className="size-3 text-ink/45" /><Dot state={row.captions ? 'ok' : 'missing'} title={row.captions ? `${row.captions} captions` : 'captions missing'} /></span>
          <span className="flex items-center gap-0.5"><Mic className="size-3 text-ink/45" /><Dot state={row.voice ? 'ok' : row.level === 'text_voice' ? 'missing' : 'off'} title={row.voice ? 'voice ready' : row.level === 'text_voice' ? 'voice missing' : 'captions only'} /></span>
        </div>; })
        : <p className="text-ink/60">No languages yet. <button type="button" className="font-semibold underline" onClick={openSettings}>Add them in Film settings</button>; the first one is the language you record in.</p>}
      {gaps.length ? <button type="button" className={`${button} mt-1 w-full`} disabled={off || making} onClick={() => void makeMissing()}>
        <Sparkles className="size-3.5" />{making ? 'Making…' : 'Make the missing parts'}</button> : null}
      {note ? <p role="status" className="text-ink/70">{note}</p> : null}
    </div>

    <div className="space-y-1.5 px-3 py-2.5">
      <p className={label}>Quick add</p>
      <div className="flex gap-1">
        <button type="button" className={`${button} flex-1`} disabled={off} title="Write a line in the Shoot workspace" onClick={() => studio.setWorkspace('shoot')}><Plus className="size-3.5" /><Type className="size-3.5" />Line</button>
        <button type="button" className={`${button} flex-1`} disabled={off} title="Add a character and open it on the right" onClick={addCharacter}><Plus className="size-3.5" /><UserRound className="size-3.5" />Character</button>
      </div>
    </div>
  </section>;
}
