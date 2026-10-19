'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Clapperboard, Download, Film, Info, Lock, Scissors, Settings2, X } from 'lucide-react';
import { filmSettings, flashWarnings, forExport, languageStatus, subtitleLines, toSeconds, toSrt } from '@genvr/film';
import type { StudioFilming } from '../../../lib/use-studio-filming';
import { render } from '../../../lib/video-studio/render';
import { languageOf } from '../../../lib/video-studio/subtitles';

const button = 'inline-flex items-center justify-center gap-1.5 rounded-md border border-ink/10 bg-paper px-2.5 py-1.5 text-xs font-semibold hover:bg-ink/10 disabled:opacity-35';
const primary = 'inline-flex items-center justify-center gap-1.5 rounded-md bg-ink px-3 py-1.5 text-xs font-semibold text-paper hover:bg-ink/85 disabled:opacity-35';
const icon = 'inline-flex size-7 items-center justify-center rounded-md hover:bg-ink/10 disabled:opacity-35';
const label = 'text-[10px] font-semibold uppercase tracking-wide text-ink/50';
const SIZES: Record<string, string> = { '1920x1080': 'Full HD', '1280x720': 'HD', '3840x2160': '4K', '1080x1920': 'Portrait' };

type Scope = 'film' | 'clip' | 'range';
type Captions = 'picture' | 'srt' | 'none';
interface FileRow { lang: string | null; name: string; state: 'waiting' | 'making' | 'done' | 'error'; pct: number; blob?: Blob; error?: string }

const Help = ({ text }: { text: string }) => <span title={text} aria-label={text} className="inline-flex text-ink/50"><Info className="size-3.5" /></span>;
/** Status dot (design rule 8): green ready, yellow missing / working, red error, grey off. */
const Dot = ({ state, title }: { state: 'ok' | 'missing' | 'error' | 'off'; title: string }) =>
  <span title={title} aria-label={title} className={`inline-block size-1.5 shrink-0 rounded-full ${state === 'ok' ? 'bg-green-500' : state === 'missing' ? 'bg-amber-400' : state === 'error' ? 'bg-red-500' : 'bg-ink/25'}`} />;
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const save = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
};

/**
 * Export window (board 16): what to export (full film, the selected shot, or the marked In / Out), one file per
 * language, captions on the picture / as separate .srt / none. Files are made on this computer with the same
 * renderer as Play film, one language at a time.
 */
export function ExportWindow({ filming, scope: initialScope, close }: { filming: StudioFilming; scope: Scope; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), canvas = useRef<HTMLCanvasElement>(null), cancel = useRef<AbortController | null>(null);
  const studio = filming.studio, project = studio.project, settings = filmSettings(project);
  const [scope, setScope] = useState<Scope>(initialScope);
  const [captions, setCaptions] = useState<Captions>(settings.caption.inExport ? 'picture' : 'none');
  const status = languageStatus(project);
  /** A language can make a file only when the film has captions or a voice in it (forExport needs one). */
  const usable = (lang: string) => project.tracks.some((t) => t.lang === lang && t.clips.length);
  const [chosen, setChosen] = useState<string[]>(() => status.map((s) => s.lang).filter(usable));
  const [files, setFiles] = useState<FileRow[]>([]), [working, setWorking] = useState(false), [error, setError] = useState('');
  useEffect(() => { dialog.current?.showModal(); return () => cancel.current?.abort(); }, []);

  const shot = project.tracks.filter((t) => t.kind === 'picture').flatMap((t) => t.clips).find((c) => c.id === studio.selected && c.type === 'media');
  const shotName = shot && shot.type === 'media' ? shot.name ?? project.media.find((m) => m.id === shot.media)?.name ?? 'Shot' : null;
  const marked = project.range ? { from: toSeconds(project.range.in), to: Math.min(studio.length, toSeconds(project.range.out)) } : null;
  const range = scope === 'clip' && shot ? { from: toSeconds(shot.start), to: toSeconds(shot.start + shot.duration) } : scope === 'range' && marked ? marked : undefined;
  const scopeReady = scope === 'film' ? studio.length > 0 : scope === 'clip' ? !!shot : !!marked;

  const languages = status.length ? chosen.filter((l) => status.some((s) => s.lang === l)) : [];
  const targets: Array<string | null> = status.length ? languages : [null];
  const nameOf = (lang: string | null) => `genvr-episode-${lang ?? 'original'}.webm`;
  const toggle = (lang: string) => setChosen((list) => list.includes(lang) ? list.filter((l) => l !== lang) : [...list, lang]);
  const size = filming.output.size, [width, height] = size.split('x').map(Number) as [number, number];

  const run = async () => {
    if (!canvas.current || studio.isRendering() || filming.isBusy() || !targets.length || !scopeReady) return;
    const flashes = flashWarnings(project);
    if (flashes.length && !window.confirm(`${flashes.join('\n')}\n\nFlashing can hurt people with photosensitive epilepsy. Export anyway?`)) return;
    const controller = new AbortController(); cancel.current = controller;
    const rows: FileRow[] = targets.map((lang) => ({ lang, name: nameOf(lang), state: 'waiting', pct: 0 }));
    const update = (index: number, patch: Partial<FileRow>) => { rows[index] = { ...rows[index]!, ...patch }; setFiles([...rows]); };
    setFiles([...rows]); setWorking(true); setError('');
    canvas.current.width = width; canvas.current.height = height;
    studio.setRendering(true);
    const resume = filming.pauseForPlayback();
    const first = range?.from ?? 0, span = Math.max(0.05, (range?.to ?? studio.length) - first);
    try {
      for (const [index, lang] of targets.entries()) {
        if (controller.signal.aborted) break;
        update(index, { state: 'making' });
        try {
          const now = studio.snapshot();
          const film = forExport(now.project, { language: lang ?? undefined, captions: captions === 'picture' ? 'picture' : 'none' });
          const blob = await render(film, now.assets, canvas.current, controller.signal,
            (seconds) => update(index, { pct: Math.max(0, Math.min(100, Math.round(((seconds - first) / span) * 100))) }), true, first, undefined, range);
          if (!blob) throw new Error('The renderer returned no file.');
          save(blob, rows[index]!.name);
          if (captions === 'srt' && lang) {
            const lines = subtitleLines(now.project, lang).filter((l) => !range || (l.end > range.from && l.start < range.to))
              .map((l) => range ? { ...l, start: Math.max(0, l.start - range.from), end: Math.min(range.to, l.end) - range.from } : l);
            if (lines.length) save(new Blob([toSrt(lines)], { type: 'application/x-subrip' }), `genvr-episode-${lang}.srt`);
          }
          update(index, { state: 'done', pct: 100, blob });
        } catch (e) {
          if (controller.signal.aborted) { update(index, { state: 'error', error: 'Cancelled.' }); break; }
          update(index, { state: 'error', error: e instanceof Error ? e.message : 'Export failed.' });
        }
      }
      const made = rows.filter((r) => r.state === 'done').length;
      studio.setMessage(made ? `Exported ${made} file${made === 1 ? '' : 's'}.` : 'Nothing was exported.');
    } finally {
      resume(); studio.setRendering(false); setWorking(false); cancel.current = null;
    }
  };

  const doneCount = files.filter((f) => f.state === 'done').length;
  const off = working || filming.busy || (studio.rendering && !working);
  const SCOPES: Array<{ id: Scope; text: string; icon: typeof Film; hint: string; why?: string }> = [
    { id: 'film', text: 'Full film', icon: Film, hint: `0:00 → ${clock(studio.length)}` },
    { id: 'clip', text: 'Selected shot', icon: Clapperboard, hint: shot ? `${shotName} · ${Math.round(toSeconds(shot.duration))} s` : 'select a shot', ...(shot ? {} : { why: 'Select a picture clip on the timeline first' }) },
    { id: 'range', text: 'Marked range', icon: Scissors, hint: marked ? `${clock(marked.from)} → ${clock(marked.to)}` : 'set in / out marks', ...(marked ? {} : { why: 'Set In / Out marks on the timeline first (I and O)' }) },
  ];

  return createPortal(<dialog ref={dialog} aria-label="Export" onClose={close} onCancel={(e) => { if (working) { e.preventDefault(); cancel.current?.abort(); } }}
    className="m-auto max-h-[90vh] w-[min(35rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-ink/20 bg-paper p-0 text-ink shadow-xl backdrop:bg-black/60">
    <div className="flex max-h-[90vh] flex-col">
      <header className="flex items-center gap-2 border-b border-ink/10 px-4 py-3"><Download className="size-4" />
        <div className="flex-1"><h2 className="text-sm font-semibold">Export</h2>
          <p className="flex items-center gap-1 text-[11px] text-ink/60"><Lock className="size-3" />Files are made on this computer. Nothing is uploaded.</p></div>
        <button type="button" className={icon} aria-label="Close export" title="Close (Esc)" disabled={working} onClick={() => dialog.current?.close()}><X className="size-4" /></button></header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <section aria-label="What" className="border-b border-ink/10 px-4 py-3">
          <p className={`${label} mb-1.5`}>What</p>
          <div role="radiogroup" aria-label="What to export" className="flex gap-0.5 rounded-md border border-ink/10 bg-paper p-0.5">
            {SCOPES.map(({ id, text, icon: Icon, why }) => <button key={id} type="button" role="radio" aria-checked={scope === id} disabled={off || !!why} title={why}
              onClick={() => setScope(id)} className={`flex h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded text-xs font-semibold disabled:opacity-35 ${scope === id ? 'bg-ink text-paper' : 'hover:bg-ink/10'}`}>
              <Icon className="size-3.5" />{text}</button>)}
          </div>
          <div className="mt-1 flex gap-0.5 font-mono text-[11px] text-ink/55">
            {SCOPES.map(({ id, hint }) => <span key={id} className={`flex-1 truncate text-center ${scope === id ? 'text-ink' : ''}`}>{hint}</span>)}
          </div>
        </section>

        <section aria-label="Languages" className="border-b border-ink/10 px-4 py-3">
          <p className="mb-1.5 flex items-center gap-2"><span className={`${label} flex-1`}>Languages · one file each</span>{status.length ? <span className="text-[11px] text-ink/55">{languages.length} of {status.length}</span> : null}</p>
          {status.length ? status.map((row) => {
            const info = languageOf(row.lang), on = languages.includes(row.lang), can = usable(row.lang);
            const level = row.level === 'text_voice' ? 'text + voice' : 'captions only';
            const ready = !row.missing.length, text = !can ? 'Nothing in this language yet' : ready ? (row.level === 'text_voice' ? 'Text and voice ready' : 'Captions ready')
              : `Missing: ${row.missing.join(', ')}`;
            return <div key={row.lang} className="flex h-9 items-center gap-2 px-1 text-xs">
              <button type="button" aria-pressed={on} disabled={off || !can} aria-label={`${on ? 'Leave out' : 'Include'} ${info?.label ?? row.lang}`}
                title={!can ? 'Nothing in this language yet' : on ? 'Included — click to leave out' : 'Left out — click to include'} onClick={() => toggle(row.lang)}
                className={`inline-flex size-6 items-center justify-center rounded-md disabled:opacity-35 ${on ? 'bg-ink/15 text-ink ring-1 ring-ink/30' : 'border border-ink/10 text-ink/40'}`}><Check className="size-3.5" /></button>
              <b className="rounded bg-ink/10 px-1.5 py-0.5 text-[10px]">{row.lang.toUpperCase()}</b>
              <span dir={info?.rtl ? 'rtl' : undefined} className={`font-semibold ${on ? '' : 'text-ink/50'}`}>{info?.native ?? row.lang}</span>
              {row.main ? <span className="text-ink/45">main</span> : null}
              <span className="flex-1" /><span className="text-[11px] text-ink/55">{level}</span>
              <Dot state={!can ? 'off' : ready ? 'ok' : 'missing'} title={text} />
            </div>; })
            : <p className="text-xs text-ink/60">No languages set in Film settings: one file with the film as it plays now.</p>}
        </section>

        <section aria-label="Captions" className="border-b border-ink/10 px-4 py-3">
          <p className={`${label} mb-1.5`}>Captions</p>
          <div className="flex items-center gap-2">
            <div role="radiogroup" aria-label="Captions" className="inline-flex gap-0.5 rounded-md border border-ink/10 bg-paper p-0.5">
              {([['picture', 'On the picture'], ['srt', 'Separate .srt'], ['none', 'None']] as const).map(([v, text]) => <button key={v} type="button" role="radio" aria-checked={captions === v} disabled={off}
                className={`rounded px-2.5 py-1 text-xs font-semibold disabled:opacity-35 ${captions === v ? 'bg-ink text-paper' : 'hover:bg-ink/10'}`} onClick={() => setCaptions(v)}>{text}</button>)}
            </div>
            <Help text="Caption look comes from Film settings › Caption look. Separate .srt saves a caption file next to each video, without captions on the picture." />
          </div>
        </section>

        <section aria-label="Video" className="flex items-center gap-2 border-b border-ink/10 px-4 py-2.5 text-xs">
          <Film className="size-3.5 text-ink/60" /><b>Video</b><span className="flex-1" />
          <span className="text-ink/60">{SIZES[size] ?? size} {width}×{height} · WebM</span>
          <Help text="Change the video size in Film settings › Video." /><Settings2 className="size-3.5 text-ink/40" aria-hidden />
        </section>

        <section aria-label="Progress" className={`px-4 py-3 ${files.length || working ? '' : 'hidden'}`}>
          <p className="mb-1.5 flex items-center gap-2"><span className={`${label} flex-1`}>Progress</span>
            <span className="flex items-center gap-1.5 text-[11px] text-ink/55"><Dot state={working ? 'missing' : files.some((f) => f.state === 'error') ? 'error' : 'ok'} title={working ? 'Working' : 'Finished'} />{doneCount} of {files.length} done</span></p>
          {files.map((f) => <div key={f.name} className="flex h-8 items-center gap-2 text-xs">
            <Dot state={f.state === 'done' ? 'ok' : f.state === 'error' ? 'error' : f.state === 'making' ? 'missing' : 'off'} title={f.error ?? { waiting: 'Waiting', making: 'Making the file', done: 'Done', error: 'Failed' }[f.state]} />
            <span className="min-w-0 flex-1 truncate font-mono" title={f.error}>{f.name}</span>
            <span className="inline-block h-1.5 w-28 overflow-hidden rounded-full bg-ink/10"><span className={`block h-full ${f.state === 'done' ? 'bg-green-500' : f.state === 'error' ? 'bg-red-500' : 'bg-amber-400'}`} style={{ width: `${f.pct}%` }} /></span>
            <span className="w-10 text-right text-[11px] text-ink/55">{f.state === 'done' ? 'done' : f.state === 'error' ? 'failed' : `${f.pct}%`}</span>
            <button type="button" className={icon} aria-label={`Save ${f.name}`} title={f.blob ? 'Save file' : 'Save file (when done)'} disabled={!f.blob} onClick={() => f.blob && save(f.blob, f.name)}><Download className="size-3.5" /></button>
          </div>)}
          <canvas ref={canvas} aria-label="Export preview" className={`mt-2 w-full rounded-md bg-black ${working ? '' : 'hidden'}`} style={{ aspectRatio: `${width} / ${height}`, maxHeight: '10rem', objectFit: 'contain' }} />
          {working ? <p className="mt-1 text-[11px] text-ink/55">Keep this window open and visible while the files are made.</p> : null}
        </section>
        {error ? <p role="status" className="px-4 pb-2 text-xs text-ink/70">{error}</p> : null}
      </div>

      <footer className="flex items-center gap-2 border-t border-ink/10 px-4 py-3">
        <span className="min-w-0 flex-1 truncate text-[11px] text-ink/60" title={targets.map(nameOf).join(', ')}>{targets.length ? `Files: ${targets.map(nameOf).join(', ')}` : 'Choose at least one language.'}</span>
        {working ? <button type="button" className={button} onClick={() => cancel.current?.abort()}>Cancel</button>
          : <button type="button" className={button} onClick={() => dialog.current?.close()}>{doneCount ? 'Done' : 'Cancel'}</button>}
        <button type="button" className={primary} disabled={off || !targets.length || !scopeReady} onClick={() => void run().catch((e) => setError(e instanceof Error ? e.message : 'Export failed.'))}>
          <Download className="size-3.5" />{working ? 'Exporting…' : `Export ${targets.length} file${targets.length === 1 ? '' : 's'}`}</button>
      </footer>
    </div>
  </dialog>, document.body);
}
