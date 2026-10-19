'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bot, Check, Clapperboard, Info, ListOrdered, Lock, Pause, Play, Plus, Square, Trash2, Users, X } from 'lucide-react';
import { filmSettings, toSeconds } from '@genvr/film';
import type { StudioFilming } from '../../../lib/use-studio-filming';
import { sceneSelection, useChosenEpisode } from '../../../lib/video-studio/scene-selection';
import { DragNumber } from './drag-number';

const button = 'inline-flex items-center justify-center gap-1.5 rounded-md border border-ink/10 bg-paper px-2.5 py-1.5 text-xs font-semibold hover:bg-ink/10 disabled:opacity-35';
const icon = 'inline-flex size-7 items-center justify-center rounded-md hover:bg-ink/10 disabled:opacity-35';
const input = 'mt-1 w-full rounded-md border border-ink/10 bg-paper px-2 py-1.5 text-xs';
const Help = ({ text }: { text: string }) => <span title={text} aria-label={text} className="inline-flex text-ink/45"><Info className="size-3.5" /></span>;
const run = (filming: StudioFilming, id: string, args: unknown) => { const r = filming.studio.run(id, args); if (!r.ok) filming.studio.setMessage(r.reason); return r.ok ? (r.result ?? true) : undefined; };

/** Board 12: the episodes of a series in the Scenes tab; each folds open to its scenes. */
export function EpisodesList({ filming }: { filming: StudioFilming }) {
  const studio = filming.studio, project = studio.project, episodes = project.episodes ?? [], chosen = useChosenEpisode(), off = filming.busy || studio.rendering;
  const scenes = project.scenes ?? [];
  const add = () => { const id = run(filming, 'episode.add', { title: `Episode ${episodes.length + 1}` }); if (typeof id === 'string') { sceneSelection.set(null); sceneSelection.setEpisode(id); } };
  return <section aria-label="Episodes" className="border-b border-ink/10 px-2 pb-2">
    <div className="flex items-center gap-1 px-1 pb-1"><span className="flex-1 text-xs font-bold uppercase tracking-wide text-ink/60">Episodes · {episodes.length}</span>
      <button type="button" className={icon} aria-label="New episode" title="New episode" disabled={off} onClick={add}><Plus className="size-4" /></button>
      <Help text="Every episode shares the cast, voices and agents of the series. Scenes belong to one episode." /></div>
    {episodes.length ? <ol className="space-y-0.5">{episodes.map((ep, i) => { const own = scenes.filter((s) => s.episode === i + 1), seconds = own.reduce((n, s) => n + s.shots.reduce((m, id) => m + toSeconds(project.media.find((x) => x.id === id)?.duration ?? 0), 0), 0);
      return <li key={ep.id}><button type="button" aria-pressed={chosen === ep.id} onClick={() => { sceneSelection.set(null); sceneSelection.setEpisode(chosen === ep.id ? null : ep.id); }}
        className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left text-xs hover:bg-ink/5 aria-pressed:bg-ink/10 aria-pressed:ring-1 aria-pressed:ring-ink/40">
        <b className="flex size-5 items-center justify-center rounded bg-ink/10 text-[10px]">{i + 1}</b><span className="min-w-0 flex-1"><b className="block truncate">{ep.title}</b>
          <span className="text-ink/55">{own.length} scene{own.length === 1 ? '' : 's'}{seconds ? ` · ${Math.floor(seconds / 60)}:${Math.round(seconds % 60).toString().padStart(2, '0')}` : ''}</span></span>
        <span title={own.some((s) => s.shots.length) ? 'filmed' : 'not filmed yet'} className={`size-1.5 rounded-full ${own.some((s) => s.shots.length) ? 'bg-green-500' : 'bg-ink/25'}`} />
      </button></li>; })}</ol>
      : <p className="px-1 pb-1 text-xs text-ink/60">No episodes yet. Add the first one; its scenes are the ones with episode 1.</p>}
    <div className="mt-1 flex items-center gap-1 px-1 text-[10px] text-ink/50"><Users className="size-3" />Same cast in every episode · {(project.cast ?? []).map((c) => c.name).join(', ') || 'no cast yet'}</div>
  </section>;
}

/** Board 12 right panel: the chosen episode — title, outline agents read, who is in it, its scenes. */
export function EpisodePanel({ filming }: { filming: StudioFilming }) {
  const studio = filming.studio, project = studio.project, chosen = useChosenEpisode(), off = filming.busy || studio.rendering;
  const index = (project.episodes ?? []).findIndex((e) => e.id === chosen), ep = project.episodes?.[index];
  if (!ep) return null;
  const cast = project.cast ?? [], inIt = (id: string) => !ep.cast.length || ep.cast.includes(id);
  const scenes = (project.scenes ?? []).filter((s) => s.episode === index + 1);
  const set = (patch: Record<string, unknown>) => run(filming, 'episode.set', { episode: ep.id, ...patch });
  const toggle = (id: string) => { const all = cast.map((c) => c.id), now = ep.cast.length ? ep.cast : all;
    const next = now.includes(id) ? now.filter((x) => x !== id) : [...now, id]; set({ cast: next.length === all.length ? [] : next }); };
  const remove = () => { if (scenes.length && !window.confirm(`Delete “${ep.title}”? Its ${scenes.length} scenes move to episode 1.`)) return;
    if (run(filming, 'episode.remove', { episode: ep.id, confirm: true })) sceneSelection.setEpisode(null); };
  return <div className="text-ink" aria-label={`Episode ${ep.title}`}>
    <div className="flex items-center gap-2 border-b border-ink/10 px-3 py-2">
      <span className="flex size-8 items-center justify-center rounded-lg bg-ink/10"><ListOrdered className="size-4" /></span>
      <div className="min-w-0 flex-1"><div className="text-[10px] font-semibold uppercase tracking-wide text-ink/50">Episode {index + 1}</div>
        <input aria-label="Episode title" className="w-full bg-transparent text-sm font-bold outline-none focus:ring-1 focus:ring-ink/30" maxLength={80} defaultValue={ep.title} key={ep.id + ep.title}
          onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== ep.title) set({ title: v }); }} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} /></div>
      <button type="button" className={icon} aria-label="Delete episode" title="Delete episode" disabled={off} onClick={remove}><Trash2 className="size-4" /></button>
      <button type="button" className={icon} aria-label="Close episode" onClick={() => sceneSelection.setEpisode(null)}><X className="size-4" /></button>
    </div>
    <section className="space-y-1 border-b border-ink/10 px-3 py-3"><label className="block text-xs text-ink/60"><span className="flex items-center gap-1.5">Episode outline<Help text="The cast agents read this outline (and the series story) through MCP before they write this episode's lines." /></span>
      <textarea aria-label="Episode outline" rows={4} maxLength={4000} className={input} defaultValue={ep.outline} key={ep.id + 'o'} onBlur={(e) => { if (e.target.value !== ep.outline) set({ outline: e.target.value }); }} /></label></section>
    <section className="space-y-1.5 border-b border-ink/10 px-3 py-3"><h3 className="text-xs font-bold">Who is in this episode</h3>
      <div className="flex flex-wrap gap-1">{cast.map((c) => <button key={c.id} type="button" aria-pressed={inIt(c.id)} disabled={off} onClick={() => toggle(c.id)}
        className="rounded-full border border-ink/15 px-2.5 py-1 text-xs font-semibold aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-paper">{c.name}</button>)}</div>
      {!cast.length ? <p className="text-xs text-ink/60">Add characters in the Cast tab.</p> : null}</section>
    <section className="space-y-1 px-3 py-3"><h3 className="text-xs font-bold">Scenes · {scenes.length}</h3>
      {scenes.map((s) => <button key={s.id} type="button" className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-xs hover:bg-ink/5" onClick={() => { sceneSelection.setEpisode(null); sceneSelection.set(s.id); }}><Clapperboard className="size-3.5" />{s.name}<span className="ml-auto text-ink/50">{s.shots.length} shots</span></button>)}
      {!scenes.length ? <p className="text-xs text-ink/60">Scenes with episode {index + 1} show here; set it in the scene sheet.</p> : null}</section>
  </div>;
}

/**
 * The AI director (boards 10 and 11c). The owner writes the idea and starts a run; an agent connected through MCP
 * claims it and does every step with the same commands as everyone, reporting each one here. Steps that need the
 * owner wait for Approve. The director never publishes or shares.
 */
export function DirectorWindow({ filming, close }: { filming: StudioFilming; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), studio = filming.studio, project = studio.project, off = filming.busy || studio.rendering;
  const settings = filmSettings(project), current = project.director;
  const [idea, setIdea] = useState(''), [kind, setKind] = useState<'film' | 'series'>(settings.kind), [episodes, setEpisodes] = useState(3), [minutes, setMinutes] = useState(2);
  const [autonomy, setAutonomy] = useState(settings.director.autonomy);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const going = current && ['waiting_for_agent', 'running', 'paused'].includes(current.status);
  const start = () => { if (run(filming, 'director.start', { idea: idea.trim(), kind, episodes: kind === 'film' ? 1 : episodes, minutes, autonomy })) setIdea(''); };
  const seg = <T extends string>(label: string, value: T, options: Array<[T, string, string?]>, change: (v: T) => void) =>
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-ink/10 p-0.5">{options.map(([v, t, tip]) => <button key={v} type="button" role="radio" aria-checked={value === v} title={tip} disabled={off || !!going}
      onClick={() => change(v)} className={`rounded px-2.5 py-1 text-xs font-semibold ${value === v ? 'bg-ink text-paper' : 'hover:bg-ink/10'}`}>{t}</button>)}</div>;
  const STATUS = { waiting_for_agent: 'Waiting for an agent', running: 'Running', paused: 'Paused', stopped: 'Stopped', done: 'Done' } as const;
  return createPortal(<dialog ref={dialog} aria-label="AI director" onClose={close} onCancel={close}
    className="m-auto h-[min(40rem,85vh)] w-[min(60rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-ink/20 bg-paper p-0 text-ink shadow-xl backdrop:bg-black/60">
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-ink/10 px-4 py-3"><Bot className="size-4" /><h2 className="text-sm font-semibold">AI director</h2>
        <span title="Any connected agent can start, pause, stop and read this run through MCP; publishing and sharing always wait for you" className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] font-bold text-cyan-600">MCP</span>
        <Help text="Write the idea; an agent connected through MCP makes the film with the same tools as you, step by step." />
        <span className="flex-1" /><button className={icon} aria-label="Close AI director" onClick={() => dialog.current?.close()}><X className="size-4" /></button></div>
      <div className="grid min-h-0 flex-1 grid-cols-2">
        <section aria-label="Idea" className="space-y-3 overflow-y-auto border-r border-ink/10 p-4 text-xs">
          <label className="block text-ink/60">The idea<textarea aria-label="The idea" dir="auto" rows={5} maxLength={2000} className={input} disabled={off || !!going} placeholder="Three friends arrive on an unknown island…" value={idea} onChange={(e) => setIdea(e.target.value)} /></label>
          <div className="flex flex-wrap items-center gap-2">{seg('Film or series', kind, [['film', 'Film'], ['series', 'Series']], setKind)}
            {kind === 'series' ? <DragNumber label="Episodes" value={episodes} min={1} max={50} step={1} width="w-28" disabled={off || !!going} commit={setEpisodes} /> : null}
            <DragNumber label="Each" value={minutes} min={1} max={60} step={1} unit="min" width="w-28" disabled={off || !!going} commit={setMinutes} /></div>
          <div className="space-y-1"><span className="text-ink/60">Decides alone</span>
            {seg('Decides alone', autonomy, [['auto', 'Fully automatic', 'Makes everything, then tells you'], ['end', 'Check at the end', 'You approve the finished film'], ['each', 'Each step', 'You approve every step']], setAutonomy)}</div>
          <p className="text-ink/55">Languages: {settings.languages.map((l) => `${l.lang.toUpperCase()}${l.level === 'text_voice' ? ' + voice' : ''}`).join(' · ') || 'none set — Film settings › Languages'}</p>
          <p className="flex items-center gap-1.5 text-ink/60"><Lock className="size-3.5" />Never publishes or shares alone · agents keep their own permissions.</p>
          <button type="button" className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-ink px-3 py-2 text-xs font-bold text-paper disabled:opacity-35" disabled={off || !!going || !idea.trim()} onClick={start}><Play className="size-3.5" />Start making</button>
          {going ? <p className="text-ink/55">A run is going; pause or stop it on the right to start another.</p> : null}
        </section>
        <section aria-label="Run" className="space-y-2 overflow-y-auto p-4 text-xs">
          {current ? <>
            <div className="flex items-center gap-2"><b className="flex-1">{current.idea.slice(0, 80)}{current.idea.length > 80 ? '…' : ''}</b>
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${current.status === 'running' ? 'bg-green-500/15 text-green-600' : current.status === 'paused' || current.status === 'waiting_for_agent' ? 'bg-amber-400/20 text-amber-600' : 'bg-ink/10 text-ink/60'}`}>{STATUS[current.status]}</span></div>
            <div className="flex items-center gap-2 rounded-md border border-ink/10 p-2"><Bot className="size-3.5" /><span className="flex-1">Directed by {current.by ? <b>{current.by} · via MCP</b> : <span className="text-ink/55">— waiting for an agent to claim it (director.claim)</span>}</span>
              <span title={current.by ? 'An agent claimed this run' : 'No agent yet'} className={`size-1.5 rounded-full ${current.by ? 'bg-green-500' : 'bg-ink/25'}`} /></div>
            <ol className="space-y-1">{current.steps.map((s, i) => <li key={s.id} className={`flex items-center gap-2 rounded-md border px-2 py-1.5 ${s.state === 'waiting' ? 'border-amber-400/60' : 'border-ink/10'}`}>
              <span className={`size-1.5 rounded-full ${s.state === 'done' ? 'bg-green-500' : s.state === 'running' ? 'bg-sky-400' : s.state === 'waiting' ? 'bg-amber-400' : s.state === 'failed' ? 'bg-red-500' : 'bg-ink/25'}`} />
              <span className="flex-1">{i + 1}. {s.label}{s.note ? <span className="block text-[10px] text-ink/55">{s.note}</span> : null}</span>
              {s.op ? <code className="rounded bg-ink/10 px-1 font-mono text-[10px]">{s.op}</code> : null}
              {s.state === 'waiting' ? <button type="button" className={`${button} !border-green-600/40`} disabled={off} title="Only you can approve" onClick={() => run(filming, 'director.approve', { step: s.id })}><Check className="size-3.5" />Approve</button> : null}
            </li>)}</ol>
            {!current.steps.length ? <p className="text-ink/55">Steps appear here as the agent works: story, cast, scenes, lines, cues, voices, recording, export.</p> : null}
            {going ? <div className="flex gap-1.5">
              {current.status === 'paused' ? <button type="button" className={button} disabled={off} onClick={() => run(filming, 'director.pause', { resume: true })}><Play className="size-3.5" />Resume</button>
                : <button type="button" className={button} disabled={off} title="Pause (an agent can too, through MCP)" onClick={() => run(filming, 'director.pause', {})}><Pause className="size-3.5" />Pause</button>}
              <button type="button" className={`${button} text-red-500`} disabled={off} title="Stop (an agent can too, through MCP)" onClick={() => run(filming, 'director.stop', {})}><Square className="size-3.5 fill-current" />Stop</button>
            </div> : null}
          </> : <p className="text-ink/60">No run yet. Write the idea on the left and start; connect an agent (for example a Dpro agent) through MCP to make it.</p>}
        </section>
      </div>
    </div>
  </dialog>, document.body);
}
