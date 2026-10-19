'use client';

import { Captions, Download, Film, Plus, Sparkles, Type } from 'lucide-react';
import { EFFECTS, EFFECT_IDS, TEMPLATES, filmSettings, subtitleLines, toSrt } from '@genvr/film';
import type { StudioFilming } from '../../../lib/use-studio-filming';
import { useState } from 'react';
import { ToolbarMenu } from '../toolbar-menu';
import { ExportWindow } from './export-window';

const item = 'flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-ink/10 disabled:opacity-35';
const head = 'px-2 pt-1 text-[10px] font-semibold uppercase tracking-wide text-ink/50';

/** One Add ▾ for the timeline bar (design v11 rule 11): caption, titles and effect layers in one menu. */
export function AddMenu({ filming }: { filming: StudioFilming }) {
  const studio = filming.studio, off = studio.rendering || filming.busy;
  const title = (template: keyof typeof TEMPLATES) => studio.run('title.add', { template, text: template === 'strip' ? 'Name' : template === 'credits' ? 'Thanks for watching' : 'Title',
    ...(template === 'strip' ? { subtitle: 'Role' } : template === 'credits' ? { subtitle: 'Director\nCamera\nMusic' } : {}) });
  return <ToolbarMenu label="Add" icon={Plus} closeOnAction up>
    <button type="button" className={item} disabled={off} data-film-id="film.caption.add" title="Caption at the playhead (Ctrl+T)" onClick={() => studio.run('caption.add', { text: 'New caption' })}><Captions className="size-3.5" />Caption at playhead</button>
    <p className={head}>Title</p>
    {(Object.keys(TEMPLATES) as (keyof typeof TEMPLATES)[]).map((id) => <button key={id} type="button" className={item} disabled={off} data-film-id={`film.title.add.${id}`} onClick={() => title(id)}><Type className="size-3.5" />{TEMPLATES[id].label}</button>)}
    <p className={head}>Effect over the film</p>
    <div className="grid grid-cols-2 gap-0.5">{EFFECT_IDS.map((id) => <button key={id} type="button" className={item} disabled={off} data-film-id={`film.adjustment.add.${id}`} onClick={() => studio.run('adjustment.add', { effect: id })}><Sparkles className="size-3.5" />{EFFECTS[id].label}</button>)}</div>
  </ToolbarMenu>;
}

/**
 * Export ▾ (board 16): full film, the selected shot or the marked range, in one language or all, plus the captions
 * of a language as .srt. Captions go on the picture when Film settings › Caption look says so.
 */
export function ExportMenu({ filming }: { filming: StudioFilming; run?: (scope: 'film' | 'clip' | 'range') => void; language?: string; setLanguage?: (lang: string) => void }) {
  // Board 16: the menu opens the Export window (languages one file each, captions, progress).
  const [windowScope, setWindowScope] = useState<'film' | 'clip' | 'range' | null>(null);
  const run = (scope: 'film' | 'clip' | 'range') => setWindowScope(scope);
  const studio = filming.studio, project = studio.project, off = !studio.length || studio.rendering || filming.busy;
  const languages = project.tracks.filter((t) => t.kind === 'caption' && t.lang).map((t) => t.lang!);
  const pictureClip = project.tracks.filter((t) => t.kind === 'picture').flatMap((t) => t.clips).some((c) => c.id === studio.selected);
  const srt = (lang: string) => {
    const lines = subtitleLines(project, lang);
    if (!lines.length) { studio.setMessage(`No captions in ${lang.toUpperCase()} yet.`); return; }
    const url = URL.createObjectURL(new Blob([toSrt(lines)], { type: 'application/x-subrip' })), link = document.createElement('a');
    link.href = url; link.download = `captions-${lang}.srt`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
  return <><ToolbarMenu label="Export" icon={Download} closeOnAction up>
    <p className="px-2 text-[10px] text-ink/50">Captions {filmSettings(project).caption.inExport ? 'on the picture' : 'not on the picture'} · Film settings › Caption look</p>
    <button type="button" className={item} disabled={off} data-film-id="film.export" onClick={() => run('film')}><Film className="size-3.5" />Full film</button>
    <button type="button" className={item} disabled={off || !pictureClip} title={pictureClip ? undefined : 'Select a shot on the timeline first'} onClick={() => run('clip')}><Film className="size-3.5" />Selected shot</button>
    <button type="button" className={item} disabled={off || !project.range} title={project.range ? undefined : 'Mark In and Out first (I / O)'} onClick={() => run('range')}><Film className="size-3.5" />Marked range</button>
    {languages.length ? <><p className={head}>Captions file</p>{languages.map((l) => <button key={l} type="button" className={item} onClick={() => srt(l)}><Captions className="size-3.5" />{l.toUpperCase()} · .srt</button>)}</> : null}
  </ToolbarMenu>
  {windowScope ? <ExportWindow filming={filming} scope={windowScope} close={() => setWindowScope(null)} /> : null}</>;
}
